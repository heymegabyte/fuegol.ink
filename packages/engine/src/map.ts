import type { MapLink, MapRequest } from '@fuegol/contracts';
import { MapRequestSchema } from '@fuegol/contracts';
import { assertSafeUrl } from './ssrf';
import { safeFetch } from './fetcher';
import { parseHtml } from './extract-content';
import { discoverSitemapUrls } from './sitemap';
import type { EngineEnv } from './types';

/** Enumerate URLs for a site via sitemaps + homepage link discovery. */
export async function mapSite(request: MapRequest, env: EngineEnv): Promise<MapLink[]> {
  const req = MapRequestSchema.parse(request);
  const base = assertSafeUrl(req.url);
  const found = new Map<string, MapLink>();

  const add = (raw: string, title?: string): void => {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
    if (!inScope(url, base, req.includeSubdomains)) return;
    const key = req.ignoreQueryParameters ? `${url.origin}${url.pathname}` : url.toString();
    if (!found.has(key)) {
      found.set(key, title ? { url: url.toString(), title } : { url: url.toString() });
    }
  };

  if (req.sitemap !== 'skip') {
    const urls = await discoverSitemapUrls(base, env, req.limit);
    for (const u of urls) add(u);
  }

  if (req.sitemap !== 'only') {
    try {
      const { response, finalUrl } = await safeFetch(base, {
        userAgent: env.USER_AGENT,
        timeoutMs: req.timeout ?? 15000,
      });
      if (response.ok) {
        const root = parseHtml(await response.text());
        for (const a of root.querySelectorAll('a')) {
          const href = a.getAttribute('href');
          if (!href) continue;
          try {
            add(new URL(href, finalUrl).toString(), a.text.trim() || undefined);
          } catch {
            /* skip unparseable href */
          }
        }
      }
    } catch {
      /* homepage unreachable — sitemap results still returned */
    }
  }

  let out = [...found.values()];
  if (req.search) {
    const terms = req.search.toLowerCase().split(/\s+/).filter(Boolean);
    out = out
      .map((link) => ({ link, score: relevance(link, terms) }))
      .sort((a, b) => b.score - a.score)
      .map((x) => x.link);
  }
  return out.slice(0, req.limit);
}

function inScope(url: URL, base: URL, includeSubdomains: boolean): boolean {
  if (url.hostname === base.hostname) return true;
  if (includeSubdomains) {
    const apex = base.hostname.replace(/^www\./, '');
    return url.hostname === apex || url.hostname.endsWith(`.${apex}`);
  }
  return false;
}

function relevance(link: MapLink, terms: string[]): number {
  const hay = `${link.url} ${link.title ?? ''}`.toLowerCase();
  return terms.reduce((n, t) => (hay.includes(t) ? n + 1 : n), 0);
}
