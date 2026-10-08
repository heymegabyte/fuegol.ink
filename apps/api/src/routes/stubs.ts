import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Env } from '../env';
import type { Vars } from '../lib/auth';

const route = new Hono<{ Bindings: Env; Variables: Vars }>();

/**
 * Upstream Firecrawl families present in the compatibility inventory but not yet
 * served. Honest 501 with the Firecrawl error envelope (never 404, never a fake
 * success). The core data API (scrape/map/crawl/batch/extract/search/parse) is live;
 * these are the interactive/autonomous families tracked for later increments.
 */
function notYet(feature: string, hint: string) {
  return (c: Context<{ Bindings: Env; Variables: Vars }>) =>
    c.json(
      {
        success: false as const,
        error: `${feature} is not yet served on this deployment. ${hint}`,
        code: 'UNKNOWN_ERROR' as const,
      },
      501 as ContentfulStatusCode,
    );
}

const ROADMAP = 'See docs/implementation-roadmap.md.';

// Autonomous research agents (FIRE-1 equivalent)
route.post('/agent', notYet('Autonomous research agent', ROADMAP));
route.get('/agent/:id', notYet('Agent status', ROADMAP));
// Change tracking + monitors
route.post('/monitor', notYet('Change monitor', ROADMAP));
route.get('/monitor', notYet('Monitor list', ROADMAP));
// Interactive browser sessions (interact)
route.post('/browser', notYet('Interactive browser session', ROADMAP));

export default route;
