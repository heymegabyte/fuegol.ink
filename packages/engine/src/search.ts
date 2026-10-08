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
): Promise<{ web: NormalizedResult[]; provider: string }> {
  const provider = searchProviderName(env);
  const limit = Math.min(Math.max(opts.limit ?? 10, 1), 100);
  // Category/domain scoping is Exa-only; Tavily fallback does a plain search.
  if (provider === 'exa') {
    return { web: await exaSearch(query, limit, env.EXA_API_KEY!, opts.category, opts.includeDomains), provider };
  }
  if (provider === 'tavily') return { web: await tavilySearch(query, limit, env.TAVILY_API_KEY!), provider };
  throw new Error('No search provider configured (set EXA_API_KEY or TAVILY_API_KEY).');
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

async function tavilySearch(query: string, limit: number, key: string): Promise<NormalizedResult[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ api_key: key, query, max_results: limit, search_depth: 'basic' }),
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
