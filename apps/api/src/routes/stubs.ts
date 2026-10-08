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

// Search (needs a pluggable web-search provider key)
route.post('/search', notYet('Web search', 'Configure a search provider (SEARCH_PROVIDER + API key) to enable. ' + ROADMAP));

// Document parse (PDF/DOCX → markdown)
route.post('/parse', notYet('Document parse', ROADMAP));

export default route;
