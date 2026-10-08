import { Hono } from 'hono';
import type { Context } from 'hono';
import { ExtractRequestSchema } from '@fuegol/contracts';
import type { Env } from '../env';
import type { ExtractStatusResult } from '../extract-do';
import { fail, parseBody } from '../lib/respond';
import { requireAuth, type Vars } from '../lib/auth';
import { allowDemo } from '../lib/ratelimit';

const route = new Hono<{ Bindings: Env; Variables: Vars }>();

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

route.post('/extract', async (c) => {
  const denied = gate(c);
  if (denied) return denied;
  if (!c.env.EXTRACT)
    return fail(c, 501, 'Extract requires the EXTRACT Durable Object binding.', 'UNKNOWN_ERROR');
  const parsed = await parseBody(c, ExtractRequestSchema);
  if (!parsed.ok) return parsed.response;

  const id = crypto.randomUUID();
  const stub = c.env.EXTRACT.get(c.env.EXTRACT.idFromName(id));
  const { invalidURLs } = await stub.start(parsed.data);
  return c.json({
    success: true as const,
    id,
    ...(invalidURLs.length > 0 ? { invalidURLs } : {}),
  });
});

route.get('/extract/:id', async (c) => {
  if (!c.env.EXTRACT) return fail(c, 501, 'Extract not configured.', 'UNKNOWN_ERROR');
  const stub = c.env.EXTRACT.get(c.env.EXTRACT.idFromName(c.req.param('id')));
  const s = (await stub.status()) as ExtractStatusResult | null;
  if (!s) return fail(c, 404, 'Extract job not found.');
  return c.json({
    success: s.status !== 'failed',
    status: s.status,
    ...(s.data !== undefined ? { data: s.data } : {}),
    ...(s.sources ? { sources: s.sources } : {}),
    ...(s.error ? { error: s.error } : {}),
  });
});

export default route;
