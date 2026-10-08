import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Env } from '../env';
import type { Vars } from '../lib/auth';

const route = new Hono<{ Bindings: Env; Variables: Vars }>();

/**
 * Endpoints whose contract is defined (packages/contracts) but whose execution is a
 * later increment. We return an honest 501 with the Firecrawl error envelope and a
 * pointer — never a fake success object. Status in docs/firecrawl-compatibility.md.
 * (Crawl is now real — see routes/crawl.ts.)
 */
function notYet(feature: string, hint: string) {
  return (c: Context<{ Bindings: Env; Variables: Vars }>) =>
    c.json(
      {
        success: false as const,
        error: `${feature} is contract-complete but not yet served on this deployment. ${hint}`,
        code: 'UNKNOWN_ERROR' as const,
      },
      501 as ContentfulStatusCode,
    );
}

const ROADMAP = 'See docs/implementation-roadmap.md.';

// Batch scrape (Queues fan-out — reuses the crawl DO pattern)
route.post('/batch/scrape', notYet('Batch scrape', `Queues fan-out increment. ${ROADMAP}`));
route.get('/batch/scrape/:id', notYet('Batch scrape status', ROADMAP));

// Search (needs a pluggable web-search provider key)
route.post('/search', notYet('Web search', 'Configure a search provider (SEARCH_PROVIDER + API key) to enable. ' + ROADMAP));

// Extract (async AI extraction — Workers AI + AI Gateway + job store)
route.post('/extract', notYet('Structured extract', `Use POST /v2/scrape with a {type:"json"} format for single-URL extraction today. ${ROADMAP}`));
route.get('/extract/:id', notYet('Extract status', ROADMAP));

// Document parse (PDF/DOCX → markdown)
route.post('/parse', notYet('Document parse', ROADMAP));

export default route;
