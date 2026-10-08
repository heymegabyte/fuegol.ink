import { Hono } from 'hono';
import { MapRequestSchema } from '@fuegol/contracts';
import { mapSite, SsrfError } from '@fuegol/engine';
import { engineEnv, type Env } from '../env';
import { fail, parseBody } from '../lib/respond';
import { requireAuth, type Vars } from '../lib/auth';
import { allowDemo } from '../lib/ratelimit';

const route = new Hono<{ Bindings: Env; Variables: Vars }>();

route.post('/map', async (c) => {
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

  const parsed = await parseBody(c, MapRequestSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const links = await mapSite(parsed.data, engineEnv(c.env));
    return c.json({ success: true as const, links, id: crypto.randomUUID() });
  } catch (err) {
    if (err instanceof SsrfError) return fail(c, 400, err.message, 'unsafe_domain_blocked');
    const msg = err instanceof Error ? err.message : 'Unknown map error';
    if (/timeout|timed out|aborted|signal/i.test(msg))
      return fail(c, 408, 'Map timed out', 'MAP_TIMEOUT');
    return fail(c, 500, msg, 'MAP_FAILED');
  }
});

export default route;
