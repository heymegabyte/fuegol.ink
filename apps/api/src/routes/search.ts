import { Hono } from 'hono';
import type { Context } from 'hono';
import { SearchRequestSchema } from '@fuegol/contracts';
import { webSearch, searchAvailable, scrape, SsrfError } from '@fuegol/engine';
import { engineEnv, type Env } from '../env';
import { fail, parseBody } from '../lib/respond';
import { requireAuth, type Vars } from '../lib/auth';
import { allowDemo } from '../lib/ratelimit';

const route = new Hono<{ Bindings: Env; Variables: Vars }>();
const SCRAPE_RESULT_CAP = 10;
/** Best-effort US gov/regulatory primary-source domains for the `gov` category. */
const GOV_DOMAINS = [
  'congress.gov',
  'govinfo.gov',
  'regulations.gov',
  'federalregister.gov',
  'supremecourt.gov',
  'whitehouse.gov',
  'gao.gov',
  'uscourts.gov',
];

function gate(c: Context<{ Bindings: Env; Variables: Vars }>): Response | null {
  const p = c.get('principal');
  if (p.authed) return null;
  if (c.env.DEMO_MODE !== 'true') {
    const denied = requireAuth(c);
    if (denied) return denied;
  } else if (!allowDemo(c.req.header('cf-connecting-ip') ?? 'unknown', Date.now())) {
    return fail(
      c,
      429,
      'Demo rate limit reached (≈20 requests/min). Add a fuegol.ink API key for higher limits.',
      'BAD_REQUEST',
    );
  }
  return null;
}

route.post('/search', async (c) => {
  const denied = gate(c);
  if (denied) return denied;
  const eng = engineEnv(c.env);
  if (!searchAvailable(eng)) {
    return fail(
      c,
      501,
      'Search provider not configured. Set EXA_API_KEY or TAVILY_API_KEY to enable.',
      'UNKNOWN_ERROR',
    );
  }
  const parsed = await parseBody(c, SearchRequestSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const cats = parsed.data.categories ?? [];
    let category: string | undefined;
    let includeDomains: string[] | undefined;
    if (cats.includes('research')) category = 'research paper';
    else if (cats.includes('developer') || cats.includes('github')) category = 'github';
    else if (cats.includes('pdf')) category = 'pdf';
    if (cats.includes('gov')) includeDomains = GOV_DOMAINS;

    const { web, news, images, provider } = await webSearch(
      parsed.data.query,
      {
        limit: parsed.data.limit,
        sources: parsed.data.sources,
        category,
        includeDomains,
        tbs: parsed.data.tbs,
      },
      eng,
    );

    // Optionally enrich page results (web + news) with a scrape of each, capped per source.
    const enrich = async (
      list: Array<{ url: string; title?: string; description?: string; date?: string }>,
    ) => {
      if (!parsed.data.scrapeOptions) return list;
      const cap = Math.min(list.length, SCRAPE_RESULT_CAP);
      const scraped = await Promise.all(
        list.slice(0, cap).map(async (r) => {
          try {
            const { document } = await scrape(
              { url: r.url, ...parsed.data.scrapeOptions } as never,
              eng,
            );
            return {
              url: r.url,
              title: r.title ?? document.title,
              description: r.description,
              date: r.date,
              markdown: document.markdown,
              links: document.links,
              json: document.json,
              metadata: document.metadata,
            };
          } catch {
            return r;
          }
        }),
      );
      return [...scraped, ...list.slice(cap)];
    };

    const data: { web?: object[]; news?: object[]; images?: object[] } = {};
    if (web) data.web = await enrich(web);
    if (news) data.news = await enrich(news);
    if (images) data.images = images;

    const total = (data.web?.length ?? 0) + (data.news?.length ?? 0) + (data.images?.length ?? 0);
    c.header('x-fuegol-search-provider', provider);
    return c.json({
      success: true as const,
      data,
      creditsUsed: Math.max(1, Math.ceil(total / 10)) * 2,
    });
  } catch (err) {
    if (err instanceof SsrfError) return fail(c, 400, err.message, 'unsafe_domain_blocked');
    const msg = err instanceof Error ? err.message : 'search failed';
    if (/timeout|timed out|aborted|signal/i.test(msg))
      return fail(c, 408, 'Search timed out', 'SCRAPE_TIMEOUT');
    return fail(c, 500, msg, 'UNKNOWN_ERROR');
  }
});

export default route;
