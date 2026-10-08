import { Hono } from 'hono';
import { ScrapeRequestSchema } from '@fuegol/contracts';
import { scrape, SsrfError } from '@fuegol/engine';
import { engineEnv, type Env } from '../env';
import { trackChange } from '../lib/change';
import { fail, parseBody } from '../lib/respond';
import { requireAuth, type Vars } from '../lib/auth';
import { allowDemo } from '../lib/ratelimit';

const route = new Hono<{ Bindings: Env; Variables: Vars }>();

route.post('/scrape', async (c) => {
  const p = c.get('principal');
  if (!p.authed) {
    if (c.env.DEMO_MODE !== 'true') {
      const denied = requireAuth(c);
      if (denied) return denied;
    } else if (!allowDemo(c.req.header('cf-connecting-ip') ?? 'unknown', Date.now())) {
      return fail(c, 429, 'Demo rate limit reached (≈20 requests/min). Add a fuegol.ink API key for higher limits.', 'BAD_REQUEST');
    }
  }

  const parsed = await parseBody(c, ScrapeRequestSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const { document, strategy } = await scrape(parsed.data, engineEnv(c.env));
    c.header('x-fuegol-strategy', strategy);

    // changeTracking format: compare against last-seen content for this (scope, url, tag).
    const fmts = parsed.data.formats ?? [];
    const ct = fmts.find(
      (f) => f === 'changeTracking' || (typeof f === 'object' && f.type === 'changeTracking'),
    );
    if (ct && c.env.DB && typeof document.markdown === 'string') {
      const cfg = (typeof ct === 'object' ? ct : {}) as { tag?: string | null; modes?: string[] };
      const scope = c.get('principal').keyId ?? 'anon';
      document.changeTracking = await trackChange(
        c.env.DB,
        scope,
        document.url ?? parsed.data.url,
        cfg.tag || 'default',
        document.markdown,
        Array.isArray(cfg.modes) && cfg.modes.includes('git-diff'),
      );
    }

    return c.json({ success: true as const, data: document });
  } catch (err) {
    if (err instanceof SsrfError) return fail(c, 400, err.message, 'unsafe_domain_blocked');
    const msg = err instanceof Error ? err.message : 'Unknown scrape error';
    if (/timeout|timed out|aborted|signal/i.test(msg)) {
      return fail(c, 408, 'Scrape timed out', 'SCRAPE_TIMEOUT');
    }
    return fail(c, 500, msg, 'SCRAPE_ALL_ENGINES_FAILED');
  }
});

export default route;
