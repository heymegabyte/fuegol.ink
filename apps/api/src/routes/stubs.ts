import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Env } from '../env';
import type { Vars } from '../lib/auth';

const route = new Hono<{ Bindings: Env; Variables: Vars }>();

/**
 * Honest 501 scaffold for any upstream Firecrawl family that is contracted but not
 * yet served (never 404, never a fake success). The entire core data API plus the
 * interactive/autonomous families (scrape/map/crawl/batch/extract/search/parse +
 * interactive browser sessions, monitors, agent, AI search) are LIVE, so this route
 * currently registers nothing — it stays as the pattern for future increments.
 */
export function notYet(feature: string, hint: string) {
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

export default route;
