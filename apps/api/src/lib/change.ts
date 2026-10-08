/** changeTracking: compare a fresh scrape against the last-seen content for a
 *  (scope, url, tag) and report new / same / changed (+ an optional line diff). */

const CONTENT_CAP = 100_000;

async function sha256hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface ChangeResult {
  previousScrapeAt: string | null;
  changeStatus: 'new' | 'same' | 'changed';
  visibility: 'visible';
  diff?: { text: string };
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

  if (!prev) {
    changeStatus = 'new';
  } else if (prev.content_hash === hash) {
    changeStatus = 'same';
  } else {
    changeStatus = 'changed';
    if (wantDiff) diff = { text: lineDiff(prev.content ?? '', capped) };
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
  };
}
