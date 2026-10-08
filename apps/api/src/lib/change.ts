/** changeTracking: compare a fresh scrape against the last-seen content for a
 *  (scope, url, tag) and report new / same / changed (+ an optional line diff
 *  and/or an AI-structured semantic `json` diff). */
import { extractWithAI, extractAvailable, type EngineEnv } from '@fuegol/engine';

const CONTENT_CAP = 100_000;
/** Per-side cap when feeding both versions to the AI json-diff (keeps within the model budget). */
const AI_SIDE_CAP = 10_000;

/** Default structured-change schema when the caller doesn't supply one. */
const DEFAULT_CHANGE_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'One-sentence summary of what changed.' },
    changes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['added', 'removed', 'modified'] },
          description: { type: 'string' },
        },
        required: ['kind', 'description'],
      },
    },
  },
  required: ['summary', 'changes'],
};

export interface JsonDiffOptions {
  env: EngineEnv;
  prompt?: string;
  schema?: Record<string, unknown>;
}

async function sha256hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface ChangeResult {
  previousScrapeAt: string | null;
  changeStatus: 'new' | 'same' | 'changed';
  visibility: 'visible';
  diff?: { text: string };
  /** AI-structured semantic diff (json mode). Never contains raw previous content. */
  json?: unknown;
}

/** Simple line-set diff (order-insensitive) — indicative, not a full Myers diff. */
function lineDiff(oldContent: string, newContent: string): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);
  const removed = oldLines.filter((l) => l.trim() && !newSet.has(l)).slice(0, 80).map((l) => '- ' + l);
  const added = newLines.filter((l) => l.trim() && !oldSet.has(l)).slice(0, 80).map((l) => '+ ' + l);
  return [...removed, ...added].join('\n').slice(0, 8000);
}

export async function trackChange(
  db: D1Database,
  scope: string,
  url: string,
  tag: string,
  content: string,
  wantDiff: boolean,
  jsonOpts?: JsonDiffOptions,
): Promise<ChangeResult> {
  const capped = content.slice(0, CONTENT_CAP);
  const hash = await sha256hex(content);
  const prev = await db
    .prepare('SELECT content_hash, content, scraped_at FROM change_tracking WHERE scope = ? AND url = ? AND tag = ?')
    .bind(scope, url, tag)
    .first<{ content_hash: string; content: string | null; scraped_at: string }>();

  const now = new Date().toISOString();
  let changeStatus: ChangeResult['changeStatus'];
  let diff: { text: string } | undefined;
  let json: unknown;

  if (!prev) {
    changeStatus = 'new';
  } else if (prev.content_hash === hash) {
    changeStatus = 'same';
  } else {
    changeStatus = 'changed';
    if (wantDiff) diff = { text: lineDiff(prev.content ?? '', capped) };
    // json mode: AI-structured semantic diff of what changed (previous content stays internal).
    if (jsonOpts && extractAvailable(jsonOpts.env)) {
      try {
        const combined =
          `--- PREVIOUS VERSION ---\n${(prev.content ?? '').slice(0, AI_SIDE_CAP)}\n\n` +
          `--- CURRENT VERSION ---\n${capped.slice(0, AI_SIDE_CAP)}`;
        json = await extractWithAI(
          combined,
          {
            prompt:
              jsonOpts.prompt ??
              'Compare the PREVIOUS and CURRENT versions of this page and describe precisely what changed.',
            schema: jsonOpts.schema ?? DEFAULT_CHANGE_SCHEMA,
            systemPrompt:
              'You compare two versions of a web page and report what changed between them. Respond with a single valid JSON value only — no prose, no code fences.',
          },
          jsonOpts.env,
        );
      } catch {
        /* keep status + git-diff; json diff is best-effort */
      }
    }
  }

  await db
    .prepare(
      'INSERT INTO change_tracking (scope, url, tag, content_hash, content, scraped_at) VALUES (?, ?, ?, ?, ?, ?) ' +
        'ON CONFLICT(scope, url, tag) DO UPDATE SET content_hash = excluded.content_hash, content = excluded.content, scraped_at = excluded.scraped_at',
    )
    .bind(scope, url, tag, hash, capped, now)
    .run();

  return {
    previousScrapeAt: prev?.scraped_at ?? null,
    changeStatus,
    visibility: 'visible',
    ...(diff ? { diff } : {}),
    ...(json !== undefined ? { json } : {}),
  };
}
