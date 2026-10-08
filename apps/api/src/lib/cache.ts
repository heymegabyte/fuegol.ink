/** Scrape result cache (Firecrawl `maxAge` / `storeInCache`). Content-addressed in R2:
 *  key = sha256(url + output-affecting options). Global (content is the same per URL+opts,
 *  so a hit is shareable + honest). changeTracking/actions requests are never cached. */
import type { Document } from '@fuegol/contracts';
import type { Env } from '../env';

async function sha256hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Canonical JSON of the options that change scrape OUTPUT (so the key is stable + correct). */
function canonicalOpts(o: Record<string, unknown>): string {
  const formats = ((o.formats as Array<unknown>) ?? ['markdown']).map((f) =>
    typeof f === 'string' ? f : (f as { type?: string })?.type,
  );
  formats.sort();
  return JSON.stringify({
    f: formats,
    omc: o.onlyMainContent ?? true,
    it: o.includeTags ?? null,
    et: o.excludeTags ?? null,
    mob: o.mobile ?? false,
    px: o.proxy ?? null,
    loc: o.location ?? null,
    hdr: o.headers ?? null,
  });
}

export async function cacheKey(url: string, options: Record<string, unknown>): Promise<string> {
  return `cache/${await sha256hex(`${url}|${canonicalOpts(options)}`)}.json`;
}

/** Return a cached Document if present and younger than maxAge (ms); else null. */
export async function readCache(env: Env, key: string, maxAgeMs: number): Promise<Document | null> {
  if (!env.ARTIFACTS) return null;
  const obj = await env.ARTIFACTS.get(key);
  if (!obj) return null;
  try {
    const stored = JSON.parse(await obj.text()) as { document: Document; cachedAt: number };
    const age = Date.now() - stored.cachedAt;
    if (age < 0 || age > maxAgeMs) return null;
    const doc = stored.document;
    doc.metadata = { ...doc.metadata, cacheState: 'hit', cachedAt: new Date(stored.cachedAt).toISOString() };
    return doc;
  } catch {
    return null;
  }
}

/** Persist a fresh Document for future maxAge reads. */
export async function writeCache(env: Env, key: string, document: Document): Promise<void> {
  if (!env.ARTIFACTS) return;
  await env.ARTIFACTS.put(key, JSON.stringify({ document, cachedAt: Date.now() }), {
    httpMetadata: { contentType: 'application/json' },
  });
}
