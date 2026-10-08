import { scrape, mapSite, SsrfError } from '@fuegol/engine';
import { engineEnv, type Env } from './env';

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
    handler: notYet(
      'firecrawl_search needs a pluggable web-search provider key (SEARCH_PROVIDER) — tracked in docs/implementation-roadmap.md Increment 3. Use firecrawl_scrape/firecrawl_map today.',
    ),
  },
  {
    name: 'firecrawl_crawl',
    description: 'Start a multi-page crawl, poll to a terminal state, and return collected pages.',
    profiles: ['full'],
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' }, limit: { type: 'number' }, prompt: { type: 'string' } },
      required: ['url'],
    },
    handler: notYet(
      'firecrawl_crawl (async Durable-Object coordinator) is the next increment — see docs/implementation-roadmap.md Increment 2.',
    ),
  },
  {
    name: 'firecrawl_check_crawl_status',
    description: 'Retrieve the status/results of an existing crawl ID.',
    profiles: ['full'],
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    handler: notYet('Crawl status arrives with firecrawl_crawl (Increment 2).'),
  },
  // --- search-only profile research tools (contract-present, honest stubs) ---
  mkStub('firecrawl_developer_search', 'Search public repos / issues / PRs / code docs.', ['search'], {
    query: { type: 'string' },
    k: { type: 'number' },
  }, ['query'], 'Developer search index — Increment 3.'),
  mkStub('firecrawl_gov_search', 'Search US federal/state/local legal + regulatory sources.', ['search'], {
    query: { type: 'string' },
    k: { type: 'number' },
  }, ['query'], 'Government search index — Increment 3.'),
  mkStub('firecrawl_research_search_papers', 'Search paper abstracts/metadata (PubMed/arXiv/bioRxiv).', ['search'], {
    query: { type: 'string' },
    k: { type: 'number' },
  }, ['query'], 'Scholarly research index — Increment 3.'),
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
