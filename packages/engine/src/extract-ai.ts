import type { EngineEnv } from './types';

/**
 * AI-assisted structured extraction via Workers AI. Deterministic methods run first
 * (the caller passes already-extracted markdown); this turns that content into JSON
 * matching a prompt and/or JSON Schema. The `ai` binding is available account-wide,
 * so this is the broadly-available extraction path (Browser Rendering /json is the
 * alternative when JS rendering is also required).
 */

export interface ExtractOptions {
  prompt?: string;
  schema?: Record<string, unknown>;
  systemPrompt?: string;
}

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const MAX_CONTENT_CHARS = 24_000;

export function extractAvailable(env: EngineEnv): boolean {
  return Boolean(env.AI);
}

export async function extractWithAI(
  content: string,
  opts: ExtractOptions,
  env: EngineEnv,
): Promise<unknown> {
  if (!env.AI) throw new Error('Workers AI binding (AI) not configured');

  const system =
    opts.systemPrompt ??
    'You extract structured data from web page content. Respond with a single valid JSON value only — no markdown, no prose, no code fences.';
  const schemaHint = opts.schema
    ? `\n\nReturn JSON that conforms to this JSON Schema:\n${JSON.stringify(opts.schema)}`
    : '';
  const user = `${opts.prompt ?? 'Extract the key structured information from the content.'}${schemaHint}\n\n--- PAGE CONTENT ---\n${content.slice(0, MAX_CONTENT_CHARS)}`;

  const inputs: Record<string, unknown> = {
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    max_tokens: 2048,
  };
  if (opts.schema) {
    inputs.response_format = { type: 'json_schema', json_schema: opts.schema };
  }

  const out = (await env.AI.run(MODEL, inputs)) as { response?: unknown };
  const raw = out?.response;
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw === 'string') return parseJsonLoose(raw);
  return { _raw: String(raw ?? '') };
}

function parseJsonLoose(s: string): unknown {
  const trimmed = s
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through to bracket extraction */
  }
  const match = trimmed.match(/[{[][\s\S]*[}\]]/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      /* ignore */
    }
  }
  return { _raw: s };
}
