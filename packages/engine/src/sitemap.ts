import { tryFetchText } from './fetcher';
import type { EngineEnv } from './types';

function decodeXml(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Discover URLs from a site's sitemaps. Reads robots.txt `Sitemap:` directives plus
 * the conventional /sitemap.xml locations, following sitemap-index nesting (≤3 deep).
 * Pure regex parsing — no XML dependency, Workers-safe.
 */
export async function discoverSitemapUrls(
  base: URL,
  env: EngineEnv,
  limit = 5000,
): Promise<string[]> {
  const out = new Set<string>();
  const seen = new Set<string>();
  const candidates: string[] = [];

  const robots = await tryFetchText(new URL('/robots.txt', base), { userAgent: env.USER_AGENT });
  if (robots) {
    for (const m of robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)) candidates.push(m[1]!);
  }
  for (const path of ['/sitemap.xml', '/sitemap_index.xml', '/sitemap-index.xml']) {
    candidates.push(new URL(path, base).toString());
  }

  for (const sitemap of candidates) {
    if (out.size >= limit) break;
    await crawlSitemap(sitemap, out, seen, env, 0, limit);
  }
  return [...out];
}

async function crawlSitemap(
  url: string,
  out: Set<string>,
  seen: Set<string>,
  env: EngineEnv,
  depth: number,
  limit: number,
): Promise<void> {
  if (depth > 3 || out.size >= limit || seen.has(url)) return;
  seen.add(url);

  const xml = await tryFetchText(url, { userAgent: env.USER_AGENT });
  if (!xml) return;

  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decodeXml(m[1]!));
  const isIndex = /<sitemapindex/i.test(xml);

  if (isIndex) {
    for (const loc of locs) {
      if (out.size >= limit) break;
      await crawlSitemap(loc, out, seen, env, depth + 1, limit);
    }
  } else {
    for (const loc of locs) {
      if (out.size >= limit) break;
      if (/^https?:/i.test(loc)) out.add(loc);
    }
  }
}
