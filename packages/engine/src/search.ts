import type { EngineEnv } from './types';

/**
 * Pluggable web-search provider abstraction. Exa (semantic) is preferred; Tavily is a
 * fallback. Self-host sets its own key(s); the external API/response contract stays
 * Firecrawl-shaped regardless of provider.
 */

export interface WebSearchOptions {
  limit?: number;
  sources?: string[];
  /** Exa content category: 'github' | 'research paper' | 'pdf' | 'news' | … */
  category?: string;
  /** Restrict results to these domains (e.g. gov sources). */
  includeDomains?: string[];
}

export interface NormalizedResult {
  url: string;
  title?: string;
  description?: string;
}

export interface ImageResult {
  url: string;
  title?: string;
  imageUrl?: string;
  position?: number;
}

/** Multi-source search result. Each source is populated only when requested in `sources`. */
export interface SearchSources {
  web?: NormalizedResult[];
  news?: NormalizedResult[];
  images?: ImageResult[];
  provider: string;
}

export function searchAvailable(env: EngineEnv): boolean {
  return Boolean(env.EXA_API_KEY || env.TAVILY_API_KEY);
}

export function searchProviderName(env: EngineEnv): string | null {
  const explicit = (env.SEARCH_PROVIDER ?? '').toLowerCase();
  if (explicit === 'exa' && env.EXA_API_KEY) return 'exa';
  if (explicit === 'tavily' && env.TAVILY_API_KEY) return 'tavily';
  if (env.EXA_API_KEY) return 'exa';
  if (env.TAVILY_API_KEY) return 'tavily';
  return null;
}

export async function webSearch(
  query: string,
  opts: WebSearchOptions,
  env: EngineEnv,
): Promise<SearchSources> {
  const provider = searchProviderName(env);
  if (!provider) throw new Error('No search provider configured (set EXA_API_KEY or TAVILY_API_KEY).');
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 100);
  const sources = opts.sources && opts.sources.length ? opts.sources : ['web'];
  const out: SearchSources = { provider };

  if (sources.includes('web')) {
    // Category/domain scoping is Exa-only; Tavily fallback does a plain search.
    out.web =
      provider === 'exa'
        ? await exaSearch(query, limit, env.EXA_API_KEY!, opts.category, opts.includeDomains)
        : await tavilySearch(query, limit, env.TAVILY_API_KEY!);
  }
  if (sources.includes('news')) {
    // News: prefer Tavily's purpose-built `news` topic (actual articles, recency-ranked);
    // fall back to Exa's `news` category when Tavily isn't configured.
    if (env.TAVILY_API_KEY) out.news = await tavilySearch(query, limit, env.TAVILY_API_KEY, 'news');
    else if (env.EXA_API_KEY) out.news = await exaSearch(query, limit, env.EXA_API_KEY, 'news', opts.includeDomains);
    else out.news = [];
  }
  if (sources.includes('images')) {
    // Image search: Tavily `include_images` (Exa has no image endpoint).
    out.images = env.TAVILY_API_KEY ? await tavilyImages(query, limit, env.TAVILY_API_KEY) : [];
  }
  return out;
}

async function exaSearch(
  query: string,
  limit: number,
  key: string,
  category?: string,
  includeDomains?: string[],
): Promise<NormalizedResult[]> {
  const res = await fetch('https://api.exa.ai/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key },
    body: JSON.stringify({
      query,
      numResults: limit,
      type: 'auto',
      ...(category ? { category } : {}),
      ...(includeDomains && includeDomains.length ? { includeDomains } : {}),
      contents: { text: { maxCharacters: 500 } },
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    throw new Error(`Exa search failed (${res.status}): ${(await res.text().catch(() => '')).slice(0, 160)}`);
  }
  const body = (await res.json()) as {
    results?: Array<{ title?: string; url: string; text?: string }>;
  };
  return (body.results ?? []).map((r) => ({
    url: r.url,
    title: r.title,
    description: r.text ? r.text.replace(/\s+/g, ' ').trim().slice(0, 300) : undefined,
  }));
}

async function tavilySearch(
  query: string,
  limit: number,
  key: string,
  topic?: 'news' | 'general',
): Promise<NormalizedResult[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      query,
      max_results: limit,
      search_depth: 'basic',
      ...(topic ? { topic } : {}),
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Tavily search failed (${res.status})`);
  const body = (await res.json()) as {
    results?: Array<{ title?: string; url: string; content?: string }>;
  };
  return (body.results ?? []).map((r) => ({
    url: r.url,
    title: r.title,
    description: r.content ? r.content.replace(/\s+/g, ' ').trim().slice(0, 300) : undefined,
  }));
}

/** Image search via Tavily `include_images`. Returns image URLs (+ descriptions when available). */
async function tavilyImages(query: string, limit: number, key: string): Promise<ImageResult[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      query,
      max_results: limit,
      include_images: true,
      include_image_descriptions: true,
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Tavily image search failed (${res.status})`);
  const body = (await res.json()) as { images?: Array<{ url: string; description?: string } | string> };
  return (body.images ?? []).map((im, i) =>
    typeof im === 'string'
      ? { url: im, imageUrl: im, position: i + 1 }
      : { url: im.url, imageUrl: im.url, title: im.description, position: i + 1 },
  );
}
