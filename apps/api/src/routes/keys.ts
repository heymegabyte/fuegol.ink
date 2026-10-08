import { Hono } from 'hono';
import { z } from 'zod';
import { type Env } from '../env';
import { createKey } from '../lib/keys';
import { fail, parseBody } from '../lib/respond';
import { requireAuth, type Vars } from '../lib/auth';
import { allowDemo } from '../lib/ratelimit';

const route = new Hono<{ Bindings: Env; Variables: Vars }>();

/** Self-serve API-key issuance (free tier). Paid plans are provisioned via Stripe
 *  (a later increment); self-serve only mints `free`. The key is returned once. */
route.post('/keys', async (c) => {
  if (!c.env.DB) {
    return fail(
      c,
      501,
      'Key management requires the D1 (DB) binding on this deployment.',
      'UNKNOWN_ERROR',
    );
  }
  const p = c.get('principal');
  if (!p.authed) {
    if (c.env.DEMO_MODE !== 'true') {
      const denied = requireAuth(c);
      if (denied) return denied;
    } else if (!allowDemo(c.req.header('cf-connecting-ip') ?? 'unknown', Date.now())) {
      return fail(c, 429, 'Demo rate limit reached (≈20 requests/min).', 'BAD_REQUEST');
    }
  }
  const parsed = await parseBody(
    c,
    z.object({ name: z.string().max(100).optional(), plan: z.enum(['free']).default('free') }),
  );
  if (!parsed.ok) return parsed.response;

  const created = await createKey(c.env.DB, { name: parsed.data.name, plan: parsed.data.plan });
  return c.json({
    success: true as const,
    apiKey: created.key,
    keyId: created.id,
    plan: created.plan,
    monthlyCredits: created.monthlyCredits,
    note: 'Store this key now — it is shown only once. Send it as: Authorization: Bearer <key>',
  });
});

export default route;
