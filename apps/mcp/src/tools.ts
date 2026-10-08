import { scrape, mapSite, SsrfError } from '@fuegol/engine';
import { engineEnv, DEFAULT_API_BASE, type Env } from './env';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const CRAWL_TEXT_CAP = 12_000;

/** Call the REST API via the service binding (preferred) or public fetch (self-host fallback). */
async function apiFetch(env: Env, path: string, init?: RequestInit): Promise<Response> {
  if (env.API) return env.API.fetch(new Request(`https://fuegol-api.internal${path}`, init));
  return fetch(`${env.API_BASE || DEFAULT_API_BASE}${path}`, init);
}

/** Category-scoped search via /v2/search (Exa category/domain scoping under the hood). */
async function proxySearch(env: Env, query: string, categories: string[], k: number): Promise<McpContent> {
  const res = await apiFetch(env, '/v2/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, limit: k, categories }),
  });
  const body = (await res.json()) as { success?: boolean; error?: string; data?: { web?: Array<Record<string, unknown>> } };
  if (!res.ok || body.success === false) return [{ type: 'text', text: `Search failed: ${body.error ?? res.status}` }];
  const web = body.data?.web ?? [];
  const text = web
    .map((r, i) => `${i + 1}. ${(r.title as string) ?? ''}\n${(r.url as string) ?? ''}\n${(r.description as string) ?? ''}`)
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
  handler: (args: Record<string, unknown>, env: Env) => Promise<McpContent>;
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
    onlyMainContent: { type: 'boolean', description: 'Strip nav/footer/boilerplate (default true).' },
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
        data?: { web?: Array<Record<string, unknown>> };
      };
      if (!res.ok || body.success === false) {
        return [{ type: 'text', text: `Search failed: ${body.error ?? res.status}` }];
      }
      const web = body.data?.web ?? [];
      const text = web
        .map((r, i) => `${i + 1}. ${(r.title as string) ?? ''}\n${(r.url as string) ?? ''}\n${(r.description as string) ?? ''}`)
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
        return [{ type: 'text', text: `Crawl failed to start: ${start.error ?? JSON.stringify(start)}` }];
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
      if (body.length > CRAWL_TEXT_CAP) body = `${body.slice(0, CRAWL_TEXT_CAP)}\n\n…[truncated — fetch more via firecrawl_check_crawl_status]`;
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
      const res = await apiFetch(env, `/v2/crawl/${encodeURIComponent(id)}${skip ? `?skip=${skip}` : ''}`);
      if (res.status === 404) return [{ type: 'text', text: `Crawl job not found: ${id}` }];
      const s = (await res.json()) as Record<string, unknown>;
      const data = (s.data as unknown[]) ?? [];
      return [
        {
          type: 'text',
          text: JSON.stringify(
            { status: s.status, completed: s.completed, total: s.total, creditsUsed: s.creditsUsed, next: s.next, pagesInThisPage: data.length },
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
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, k: { type: 'number' } }, required: ['query'] },
    handler: (a, e) => proxySearch(e, String(a.query ?? ''), ['developer'], Number(a.k) || 10),
  },
  {
    name: 'firecrawl_gov_search',
    description: 'Search US federal legal + regulatory primary sources (gov domains).',
    profiles: ['search'],
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, k: { type: 'number' } }, required: ['query'] },
    handler: (a, e) => proxySearch(e, String(a.query ?? ''), ['gov'], Number(a.k) || 10),
  },
  {
    name: 'firecrawl_research_search_papers',
    description: 'Search scholarly papers (research-paper category; arXiv/PubMed/journals).',
    profiles: ['search'],
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, k: { type: 'number' } }, required: ['query'] },
    handler: (a, e) => proxySearch(e, String(a.query ?? ''), ['research'], Number(a.k) || 40),
  },
  mkStub('firecrawl_research_inspect_paper', 'Canonical metadata for one paper ID.', ['search'], {
    paperId: { type: 'string' },
  }, ['paperId'], 'Scholarly research index — Increment 3.'),
  mkStub('firecrawl_research_related_papers', 'Citation-graph expansion from seed paper IDs.', ['search'], {
    seed_ids: { type: 'array', items: { type: 'string' } },
    intent: { type: 'string' },
  }, ['seed_ids', 'intent'], 'Scholarly research index — Increment 3.'),
  mkStub('firecrawl_research_read_paper', 'Retrieve relevant passages from one paper.', ['search'], {
    paperId: { type: 'string' },
    question: { type: 'string' },
  }, ['paperId', 'question'], 'Scholarly research index — Increment 3.'),
  mkStub('firecrawl_find_tools', 'Browse the data-provider catalogue (Alexandria-style).', ['search'], {
    query: { type: 'string' },
  }, [], 'Provider discovery — Increment 3.'),
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
