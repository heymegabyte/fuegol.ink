import { scrape, mapSite, SsrfError } from '@fuegol/engine';
import { engineEnv, DEFAULT_API_BASE, type Env } from './env';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const CRAWL_TEXT_CAP = 12_000;

/** Call the REST API via the service binding (preferred) or public fetch (self-host
 *  fallback). Forwards the caller's Authorization header so authed tools hit the
 *  user's key + credit ledger. */
async function apiFetch(
  env: Env,
  path: string,
  init: RequestInit = {},
  auth?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  if (auth) headers.authorization = auth;
  const url = env.API
    ? `https://fuegol-api.internal${path}`
    : `${env.API_BASE || DEFAULT_API_BASE}${path}`;
  const req = new Request(url, { ...init, headers });
  return env.API ? env.API.fetch(req) : fetch(req);
}

const sleepMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Fetch from the Semantic Scholar graph API (free, no key — authorized research index).
 *  Retries on 429 (S2 rate-limits unauthenticated traffic to ~1 req/s). */
async function s2Fetch(url: string): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'fuegolbot/0.1 (+https://fuegol.ink/bot)',
      },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 429) {
      await sleepMs(1200 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw new Error(`Semantic Scholar ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  }
  throw new Error('Semantic Scholar rate limit (429) after retries');
}
const S2 = 'https://api.semanticscholar.org/graph/v1';

/** Start an agent job, poll to a terminal state, return the synthesized result. */
async function proxyAgent(
  env: Env,
  args: Record<string, unknown>,
  auth?: string,
): Promise<McpContent> {
  const res = await apiFetch(
    env,
    '/v2/agent',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(args) },
    auth,
  );
  const start = (await res.json()) as { id?: string; error?: string };
  if (!res.ok || !start.id)
    return [{ type: 'text', text: `Agent failed: ${start.error ?? res.status}` }];
  let last: Record<string, unknown> = {};
  for (let i = 0; i < 20; i += 1) {
    await sleepMs(1500);
    const s = await apiFetch(env, `/v2/agent/${start.id}`, {}, auth);
    last = (await s.json()) as Record<string, unknown>;
    if (typeof last.status === 'string' && last.status !== 'processing') break;
  }
  return [
    {
      type: 'text',
      text: JSON.stringify(
        { status: last.status, data: last.data, sources: last.sources },
        null,
        2,
      ),
    },
  ];
}

/** Proxy a monitor action to the authed REST API. */
async function proxyMonitor(
  env: Env,
  method: string,
  path: string,
  body: unknown,
  auth?: string,
): Promise<McpContent> {
  const res = await apiFetch(
    env,
    path,
    body
      ? { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
      : { method },
    auth,
  );
  const json = await res.json();
  if (res.status === 401)
    return [
      {
        type: 'text',
        text: 'Monitors require a fuegol.ink API key. Send it as Authorization: Bearer fgl_live_… to this MCP server.',
      },
    ];
  return [{ type: 'text', text: JSON.stringify(json, null, 2) }];
}

/** Category-scoped search via /v2/search (Exa category/domain scoping under the hood). */
async function proxySearch(
  env: Env,
  query: string,
  categories: string[],
  k: number,
): Promise<McpContent> {
  const res = await apiFetch(env, '/v2/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, limit: k, categories }),
  });
  const body = (await res.json()) as {
    success?: boolean;
    error?: string;
    data?: { web?: Array<Record<string, unknown>> };
  };
  if (!res.ok || body.success === false)
    return [{ type: 'text', text: `Search failed: ${body.error ?? res.status}` }];
  const web = body.data?.web ?? [];
  const text = web
    .map(
      (r, i) =>
        `${i + 1}. ${(r.title as string) ?? ''}\n${(r.url as string) ?? ''}\n${(r.description as string) ?? ''}`,
    )
    .join('\n\n');
  return [{ type: 'text', text: text || 'No results.' }];
}

/** Thrown by tools whose execution is a later increment — surfaced as an MCP tool
 *  error (isError:true), never a fabricated success. */
export class NotImplemented extends Error {}

export type McpContent = Array<{ type: 'text'; text: string }>;
export type ToolProfile = 'full' | 'search';

export interface McpTool {
  name: string;
  description: string;
  profiles: ToolProfile[];
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>, env: Env, auth?: string) => Promise<McpContent>;
}

const notYet = (hint: string) => async (): Promise<McpContent> => {
  throw new NotImplemented(hint);
};

const scrapeSchema = {
  type: 'object',
  properties: {
    url: { type: 'string', description: 'The URL to scrape.' },
    formats: {
      type: 'array',
      items: { type: 'string', enum: ['markdown', 'html', 'rawHtml', 'links', 'summary'] },
      description: 'Output formats (default ["markdown"]).',
    },
    onlyMainContent: {
      type: 'boolean',
      description: 'Strip nav/footer/boilerplate (default true).',
    },
    includeTags: { type: 'array', items: { type: 'string' } },
    excludeTags: { type: 'array', items: { type: 'string' } },
    waitFor: { type: 'number' },
    maxAge: { type: 'number' },
  },
  required: ['url'],
};

export const TOOLS: McpTool[] = [
  {
    name: 'firecrawl_scrape',
    description:
      'Scrape one URL and return its content as markdown (default), HTML, rawHtml, links, or a summary. Cloudflare-native static extraction; escalates to a browser only when needed.',
    profiles: ['full', 'search'],
    inputSchema: scrapeSchema,
    handler: async (args, env) => {
      const { document, strategy } = await scrape(args as never, engineEnv(env));
      const text =
        document.markdown ??
        (document.json !== undefined ? JSON.stringify(document.json, null, 2) : '') ??
        '';
      const header = `[fuegol scrape · ${strategy} · ${document.metadata.statusCode}] ${document.url ?? ''}`;
      return [{ type: 'text', text: `${header}\n\n${text || JSON.stringify(document, null, 2)}` }];
    },
  },
  {
    name: 'firecrawl_map',
    description:
      "Enumerate the URLs under a website via sitemaps + homepage link discovery, without fetching each page's content. Optional `search` ranks the results.",
    profiles: ['full'],
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        search: { type: 'string' },
        sitemap: { type: 'string', enum: ['include', 'only', 'skip'] },
        includeSubdomains: { type: 'boolean' },
        ignoreQueryParameters: { type: 'boolean' },
        limit: { type: 'number' },
      },
      required: ['url'],
    },
    handler: async (args, env) => {
      const links = await mapSite(args as never, engineEnv(env));
      return [
        {
          type: 'text',
          text: `Found ${links.length} URLs:\n${links.map((l) => l.url).join('\n')}`,
        },
      ];
    },
  },
  {
    name: 'firecrawl_search',
    description: 'Search the web and optionally scrape results. Returns ranked results.',
    profiles: ['full', 'search'],
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' },
        sources: { type: 'array', items: { type: 'string' } },
      },
      required: ['query'],
    },
    handler: async (args, env) => {
      const res = await apiFetch(env, '/v2/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(args),
      });
      const body = (await res.json()) as {
        success?: boolean;
        error?: string;
        data?: {
          web?: Array<Record<string, unknown>>;
          news?: Array<Record<string, unknown>>;
          images?: Array<Record<string, unknown>>;
        };
      };
      if (!res.ok || body.success === false) {
        return [{ type: 'text', text: `Search failed: ${body.error ?? res.status}` }];
      }
      const section = (label: string, rows?: Array<Record<string, unknown>>) =>
        rows && rows.length
          ? `## ${label}\n` +
            rows
              .map((r, i) =>
                `${i + 1}. ${(r.title as string) ?? ''}\n${(r.url as string) ?? ''}\n${(r.description as string) ?? ''}`.trim(),
              )
              .join('\n\n')
          : '';
      const text = [
        section('Web', body.data?.web),
        section('News', body.data?.news),
        section('Images', body.data?.images),
      ]
        .filter(Boolean)
        .join('\n\n');
      return [{ type: 'text', text: text || 'No results.' }];
    },
  },
  {
    name: 'firecrawl_crawl',
    description:
      'Start a multi-page crawl of a website, poll it to a terminal state, and return the collected pages as markdown. Backed by the fuegol crawl Durable Object.',
    profiles: ['full'],
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
        limit: { type: 'number', description: 'Max pages (v0 cap 100).' },
        includePaths: { type: 'array', items: { type: 'string' } },
        excludePaths: { type: 'array', items: { type: 'string' } },
        maxDiscoveryDepth: { type: 'number' },
        allowSubdomains: { type: 'boolean' },
        sitemap: { type: 'string', enum: ['include', 'only', 'skip'] },
      },
      required: ['url'],
    },
    handler: async (args, env) => {
      const base = env.API_BASE || DEFAULT_API_BASE;
      const res = await apiFetch(env, '/v2/crawl', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(args),
      });
      const start = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !start.id) {
        return [
          { type: 'text', text: `Crawl failed to start: ${start.error ?? JSON.stringify(start)}` },
        ];
      }
      const id = start.id;
      let last: Record<string, unknown> = {};
      for (let i = 0; i < 20; i += 1) {
        await sleep(1000);
        const sres = await apiFetch(env, `/v2/crawl/${id}`);
        last = (await sres.json()) as Record<string, unknown>;
        if (typeof last.status === 'string' && last.status !== 'scraping') break;
      }
      const data = (last.data as Array<Record<string, unknown>>) ?? [];
      let body = data
        .map((d, i) => {
          const meta = (d.metadata as Record<string, unknown>) ?? {};
          return `### ${i + 1}. ${(meta.sourceURL as string) ?? (d.url as string) ?? ''}\n${(d.markdown as string) ?? ''}`;
        })
        .join('\n\n---\n\n');
      if (body.length > CRAWL_TEXT_CAP)
        body = `${body.slice(0, CRAWL_TEXT_CAP)}\n\n…[truncated — fetch more via firecrawl_check_crawl_status]`;
      const summary = `Crawl ${id} · status=${last.status} · completed=${last.completed}/${last.total} · credits=${last.creditsUsed}\nStatus URL: ${base}/v2/crawl/${id}`;
      return [{ type: 'text', text: `${summary}\n\n${body}` }];
    },
  },
  {
    name: 'firecrawl_check_crawl_status',
    description: 'Retrieve the status + collected pages of an existing crawl ID.',
    profiles: ['full'],
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, skip: { type: 'number' } },
      required: ['id'],
    },
    handler: async (args, env) => {
      const id = String(args.id ?? '');
      const skip = Number(args.skip ?? 0) || 0;
      const res = await apiFetch(
        env,
        `/v2/crawl/${encodeURIComponent(id)}${skip ? `?skip=${skip}` : ''}`,
      );
      if (res.status === 404) return [{ type: 'text', text: `Crawl job not found: ${id}` }];
      const s = (await res.json()) as Record<string, unknown>;
      const data = (s.data as unknown[]) ?? [];
      return [
        {
          type: 'text',
          text: JSON.stringify(
            {
              status: s.status,
              completed: s.completed,
              total: s.total,
              creditsUsed: s.creditsUsed,
              next: s.next,
              pagesInThisPage: data.length,
            },
            null,
            2,
          ),
        },
      ];
    },
  },
  // --- search-only profile research tools (contract-present, honest stubs) ---
  {
    name: 'firecrawl_developer_search',
    description: 'Search public repositories, code, issues, PRs and dev docs (GitHub-scoped).',
    profiles: ['search'],
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, k: { type: 'number' } },
      required: ['query'],
    },
    handler: (a, e) => proxySearch(e, String(a.query ?? ''), ['developer'], Number(a.k) || 10),
  },
  {
    name: 'firecrawl_gov_search',
    description: 'Search US federal legal + regulatory primary sources (gov domains).',
    profiles: ['search'],
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, k: { type: 'number' } },
      required: ['query'],
    },
    handler: (a, e) => proxySearch(e, String(a.query ?? ''), ['gov'], Number(a.k) || 10),
  },
  {
    name: 'firecrawl_research_search_papers',
    description: 'Search scholarly papers (research-paper category; arXiv/PubMed/journals).',
    profiles: ['search'],
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, k: { type: 'number' } },
      required: ['query'],
    },
    handler: (a, e) => proxySearch(e, String(a.query ?? ''), ['research'], Number(a.k) || 40),
  },
  {
    name: 'firecrawl_research_inspect_paper',
    description:
      'Canonical metadata for one paper ID (arXiv:…, DOI:…, CorpusId:…) via Semantic Scholar.',
    profiles: ['search'],
    inputSchema: {
      type: 'object',
      properties: { paperId: { type: 'string' } },
      required: ['paperId'],
    },
    handler: async (a) => {
      try {
        const p = await s2Fetch(
          `${S2}/paper/${encodeURIComponent(String(a.paperId ?? ''))}?fields=title,abstract,year,venue,citationCount,authors.name,url,tldr`,
        );
        const authors = ((p.authors as Array<{ name?: string }>) ?? [])
          .map((x) => x.name)
          .join(', ');
        const tldr = (p.tldr as { text?: string } | null)?.text;
        return [
          {
            type: 'text',
            text: `${p.title ?? '(untitled)'} (${p.year ?? '?'})\nAuthors: ${authors || '—'}\nVenue: ${p.venue || '—'} · Citations: ${p.citationCount ?? '—'}\n${p.url || ''}${tldr ? `\nTL;DR: ${tldr}` : ''}\n\nAbstract:\n${p.abstract || '(no abstract)'}`,
          },
        ];
      } catch (e) {
        return [{ type: 'text', text: `Paper lookup failed: ${(e as Error).message}` }];
      }
    },
  },
  {
    name: 'firecrawl_research_related_papers',
    description: 'Find papers related to a seed paper ID (Semantic Scholar recommendations).',
    profiles: ['search'],
    inputSchema: {
      type: 'object',
      properties: {
        seed_ids: { type: 'array', items: { type: 'string' } },
        paperId: { type: 'string' },
        k: { type: 'number' },
      },
      required: [],
    },
    handler: async (a) => {
      const seed =
        Array.isArray(a.seed_ids) && a.seed_ids.length
          ? String(a.seed_ids[0])
          : String(a.paperId ?? '');
      if (!seed) return [{ type: 'text', text: 'Provide a seed paperId or seed_ids.' }];
      const k = Number(a.k) || 10;
      try {
        const body = await s2Fetch(
          `https://api.semanticscholar.org/recommendations/v1/papers/forpaper/${encodeURIComponent(seed)}?fields=title,year,authors.name&limit=${k}`,
        );
        const papers = (body.recommendedPapers as Array<Record<string, unknown>>) ?? [];
        const text = papers.map((p, i) => `${i + 1}. ${p.title} (${p.year ?? '?'})`).join('\n');
        return [{ type: 'text', text: text || 'No related papers found.' }];
      } catch (e) {
        return [{ type: 'text', text: `Related-papers lookup failed: ${(e as Error).message}` }];
      }
    },
  },
  {
    name: 'firecrawl_research_read_paper',
    description:
      'Read a paper relevant to a question — returns its TL;DR + abstract (full-text passages unavailable via this index).',
    profiles: ['search'],
    inputSchema: {
      type: 'object',
      properties: { paperId: { type: 'string' }, question: { type: 'string' } },
      required: ['paperId'],
    },
    handler: async (a) => {
      try {
        const p = await s2Fetch(
          `${S2}/paper/${encodeURIComponent(String(a.paperId ?? ''))}?fields=title,abstract,tldr`,
        );
        const tldr = (p.tldr as { text?: string } | null)?.text;
        return [
          {
            type: 'text',
            text: `Re: "${a.question ?? ''}"\n\n${p.title ?? ''}\nTL;DR: ${tldr || '—'}\n\nAbstract:\n${p.abstract || '(no abstract; full-text passage retrieval is not available via this index)'}`,
          },
        ];
      } catch (e) {
        return [{ type: 'text', text: `Paper read failed: ${(e as Error).message}` }];
      }
    },
  },
  mkStub(
    'firecrawl_find_tools',
    'Browse the data-provider catalogue (Alexandria-style).',
    ['search'],
    {
      query: { type: 'string' },
    },
    [],
    'Provider discovery — Increment 3.',
  ),
  {
    name: 'firecrawl_agent',
    description:
      'Autonomous web research. Given a prompt (and optional JSON schema), discover sources via search, scrape them, and return a synthesized structured answer with its sources.',
    profiles: ['full'],
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        urls: { type: 'array', items: { type: 'string' } },
        schema: { type: 'object' },
      },
      required: ['prompt'],
    },
    handler: (a, e, auth) => proxyAgent(e, a, auth),
  },
  {
    name: 'firecrawl_monitor_create',
    description:
      'Create a recurring change-detection monitor for a URL (checked on a schedule). Requires an API key.',
    profiles: ['full'],
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' }, name: { type: 'string' }, tag: { type: 'string' } },
      required: ['url'],
    },
    handler: (a, e, auth) => proxyMonitor(e, 'POST', '/v2/monitor', a, auth),
  },
  {
    name: 'firecrawl_monitor_list',
    description: 'List your change-detection monitors. Requires an API key.',
    profiles: ['full'],
    inputSchema: { type: 'object', properties: {} },
    handler: (_a, e, auth) => proxyMonitor(e, 'GET', '/v2/monitor', null, auth),
  },
  {
    name: 'firecrawl_monitor_run',
    description: 'Run a monitor check now and return its change status. Requires an API key.',
    profiles: ['full'],
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: (a, e, auth) =>
      proxyMonitor(
        e,
        'POST',
        `/v2/monitor/${encodeURIComponent(String(a.id ?? ''))}/run`,
        {},
        auth,
      ),
  },
  {
    name: 'firecrawl_monitor_checks',
    description: 'List historical checks for a monitor. Requires an API key.',
    profiles: ['full'],
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: (a, e, auth) =>
      proxyMonitor(
        e,
        'GET',
        `/v2/monitor/${encodeURIComponent(String(a.id ?? ''))}/checks`,
        null,
        auth,
      ),
  },
];

function mkStub(
  name: string,
  description: string,
  profiles: ToolProfile[],
  props: Record<string, unknown>,
  required: string[],
  hint: string,
): McpTool {
  return {
    name,
    description,
    profiles,
    inputSchema: { type: 'object', properties: props, required },
    handler: notYet(`${name}: ${hint}`),
  };
}

export function listTools(profile: ToolProfile): McpTool[] {
  return TOOLS.filter((t) => t.profiles.includes(profile));
}

export function toolError(err: unknown): { text: string; isError: true } {
  if (err instanceof NotImplemented) return { text: err.message, isError: true };
  if (err instanceof SsrfError) return { text: `Blocked: ${err.message}`, isError: true };
  return { text: `Error: ${err instanceof Error ? err.message : String(err)}`, isError: true };
}
