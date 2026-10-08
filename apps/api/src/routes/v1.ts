import { Hono } from 'hono';
import type { Context } from 'hono';
import { ScrapeRequestSchema, MapRequestSchema } from '@fuegol/contracts';
import { scrape, mapSite, SsrfError } from '@fuegol/engine';
import { engineEnv, type Env } from '../env';
import { fail, parseBody } from '../lib/respond';
import { requireAuth, type Vars } from '../lib/auth';
import { allowDemo } from '../lib/ratelimit';

/**
 * Legacy v1 compatibility adapters. Same engine; v1-shaped responses:
 * v1 `/map` returns `links: string[]` (v2 returns objects). v1 `/scrape` is identical
 * enough that the v2 Document shape is a superset — v1 clients read the fields they know.
 */
const route = new Hono<{ Bindings: Env; Variables: Vars }>();

function demoAllowed(c: Context<{ Bindings: Env; Variables: Vars }>): Response | null {
  const p = c.get('principal');
  if (p.authed) return null;
  if (c.env.DEMO_MODE !== 'true') return requireAuth(c);
  if (!allowDemo(c.req.header('cf-connecting-ip') ?? 'unknown', Date.now())) {
    return fail(c, 429, 'Demo rate limit reached (≈20 requests/min).', 'BAD_REQUEST');
  }
  return null;
}

route.post('/scrape', async (c) => {
  const denied = demoAllowed(c);
  if (denied) return denied;
  const parsed = await parseBody(c, ScrapeRequestSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const { document } = await scrape(parsed.data, engineEnv(c.env));
    return c.json({ success: true as const, data: document });
  } catch (err) {
    if (err instanceof SsrfError) return fail(c, 400, err.message, 'unsafe_domain_blocked');
    return fail(
      c,
      500,
      err instanceof Error ? err.message : 'scrape failed',
      'SCRAPE_ALL_ENGINES_FAILED',
    );
  }
});

route.post('/map', async (c) => {
  const denied = demoAllowed(c);
  if (denied) return denied;
  const parsed = await parseBody(c, MapRequestSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const links = await mapSite(parsed.data, engineEnv(c.env));
    return c.json({ success: true as const, links: links.map((l) => l.url) });
  } catch (err) {
    if (err instanceof SsrfError) return fail(c, 400, err.message, 'unsafe_domain_blocked');
    return fail(c, 500, err instanceof Error ? err.message : 'map failed', 'MAP_FAILED');
  }
});

export default route;
