import { Hono } from 'hono';
import { ScrapeRequestSchema } from '@fuegol/contracts';
import { scrape, SsrfError, ActionError } from '@fuegol/engine';
import { engineEnv, type Env } from '../env';
import { trackChange } from '../lib/change';
import { cacheKey, readCache, writeCache } from '../lib/cache';
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
      return fail(
        c,
        429,
        'Demo rate limit reached (≈20 requests/min). Add a fuegol.ink API key for higher limits.',
        'BAD_REQUEST',
      );
    }
  }

  const parsed = await parseBody(c, ScrapeRequestSchema);
  if (!parsed.ok) return parsed.response;

  const fmts = parsed.data.formats ?? [];
  const ct = fmts.find(
    (f) => f === 'changeTracking' || (typeof f === 'object' && f.type === 'changeTracking'),
  );
  const hasActions = Array.isArray(parsed.data.actions) && parsed.data.actions.length > 0;
  // changeTracking must run fresh (it diffs against history); actions have side effects.
  const cacheable = Boolean(c.env.ARTIFACTS) && !ct && !hasActions;
  const maxAge = parsed.data.maxAge ?? 0;
  const key = cacheable
    ? await cacheKey(parsed.data.url, parsed.data as Record<string, unknown>)
    : null;

  try {
    // Cache read: serve a fresh-enough stored result (no re-fetch of the target).
    if (key && maxAge > 0) {
      const cached = await readCache(c.env, key, maxAge);
      if (cached) {
        c.header('x-fuegol-strategy', 'cache');
        return c.json({ success: true as const, data: cached });
      }
    }

    const { document, strategy } = await scrape(parsed.data, engineEnv(c.env));
    c.header('x-fuegol-strategy', strategy);
    if (key && maxAge > 0) document.metadata = { ...document.metadata, cacheState: 'miss' };

    // Populate the cache for future maxAge reads (storeInCache defaults true). Awaited so the
    // cache is immediately consistent (store-then-read hits); best-effort — a write failure
    // must never fail the scrape.
    if (key && parsed.data.storeInCache !== false) {
      try {
        await writeCache(c.env, key, document);
      } catch {
        /* cache write is best-effort */
      }
    }

    if (ct && c.env.DB && typeof document.markdown === 'string') {
      const cfg = (typeof ct === 'object' ? ct : {}) as {
        tag?: string | null;
        modes?: string[];
        prompt?: string;
        schema?: Record<string, unknown>;
      };
      const scope = c.get('principal').keyId ?? 'anon';
      const modes = Array.isArray(cfg.modes) ? cfg.modes : [];
      document.changeTracking = await trackChange(
        c.env.DB,
        scope,
        document.url ?? parsed.data.url,
        cfg.tag || 'default',
        document.markdown,
        modes.includes('git-diff'),
        modes.includes('json')
          ? { env: engineEnv(c.env), prompt: cfg.prompt, schema: cfg.schema }
          : undefined,
      );
    }

    return c.json({ success: true as const, data: document });
  } catch (err) {
    if (err instanceof SsrfError) return fail(c, 400, err.message, 'unsafe_domain_blocked');
    if (err instanceof ActionError) return fail(c, 400, err.message, 'SCRAPE_ACTION_ERROR');
    const msg = err instanceof Error ? err.message : 'Unknown scrape error';
    if (/timeout|timed out|aborted|signal/i.test(msg)) {
      return fail(c, 408, 'Scrape timed out', 'SCRAPE_TIMEOUT');
    }
    return fail(c, 500, msg, 'SCRAPE_ALL_ENGINES_FAILED');
  }
});

export default route;
