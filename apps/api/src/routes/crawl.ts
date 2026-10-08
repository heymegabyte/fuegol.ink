import { Hono } from 'hono';
import type { Context } from 'hono';
import { CrawlRequestSchema } from '@fuegol/contracts';
import { SsrfError } from '@fuegol/engine';
import type { Env } from '../env';
import type { CrawlStatusResult } from '../crawl-do';
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
    return fail(c, 429, 'Demo rate limit reached (≈20 requests/min). Add a fuegol.ink API key for higher limits.', 'BAD_REQUEST');
  }
  return null;
}

function origin(c: Context<{ Bindings: Env; Variables: Vars }>): string {
  try {
    return c.env.SERVICE_ORIGIN || new URL(c.req.url).origin;
  } catch {
    return 'https://api.fuegol.ink';
  }
}

route.post('/crawl', async (c) => {
  const denied = gate(c);
  if (denied) return denied;
  if (!c.env.CRAWL) return fail(c, 501, 'Crawl requires the CRAWL Durable Object binding (not provisioned on this deployment).', 'UNKNOWN_ERROR');
  const parsed = await parseBody(c, CrawlRequestSchema);
  if (!parsed.ok) return parsed.response;

  const id = crypto.randomUUID();
  const stub = c.env.CRAWL.get(c.env.CRAWL.idFromName(id));
  try {
    await stub.start(parsed.data);
  } catch (err) {
    if (err instanceof SsrfError) return fail(c, 400, err.message, 'unsafe_domain_blocked');
    return fail(c, 500, err instanceof Error ? err.message : 'Failed to start crawl', 'CRAWL_DENIAL');
  }
  return c.json({ success: true as const, id, url: `${origin(c)}/v2/crawl/${id}` });
});

// Registered before /crawl/:id so "active" is not captured as an :id.
route.get('/crawl/active', (c) =>
  c.json({
    success: true as const,
    crawls: [],
    note: 'Active-crawl enumeration requires a cross-DO registry (planned). Poll a specific crawl id instead.',
  }),
);

route.get('/crawl/:id', async (c) => {
  if (!c.env.CRAWL) return fail(c, 501, 'Crawl not configured.', 'UNKNOWN_ERROR');
  const id = c.req.param('id');
  const skip = Math.max(0, Number(c.req.query('skip') ?? 0) || 0);
  const stub = c.env.CRAWL.get(c.env.CRAWL.idFromName(id));
  // DurableObjectStub's RPC serializability constraint narrows Document (unknown fields)
  // to `never` at the type level; the runtime value is a plain cloneable object.
  const s = (await stub.status(skip, 10)) as CrawlStatusResult | null;
  if (!s) return fail(c, 404, 'Crawl job not found.');
  return c.json({
    success: true as const,
    status: s.status,
    total: s.total,
    completed: s.completed,
    creditsUsed: s.creditsUsed,
    createdAt: s.createdAt,
    ...(s.completedAt ? { completedAt: s.completedAt } : {}),
    next: s.nextOffset != null ? `${origin(c)}/v2/crawl/${id}?skip=${s.nextOffset}` : null,
    data: s.data,
  });
});

route.delete('/crawl/:id', async (c) => {
  if (!c.env.CRAWL) return fail(c, 501, 'Crawl not configured.', 'UNKNOWN_ERROR');
  const stub = c.env.CRAWL.get(c.env.CRAWL.idFromName(c.req.param('id')));
  const ok = await stub.cancel();
  if (!ok) return fail(c, 404, 'Crawl job not found.');
  return c.json({ status: 'cancelled' as const });
});

route.get('/crawl/:id/errors', async (c) => {
  if (!c.env.CRAWL) return fail(c, 501, 'Crawl not configured.', 'UNKNOWN_ERROR');
  const stub = c.env.CRAWL.get(c.env.CRAWL.idFromName(c.req.param('id')));
  return c.json(await stub.getErrors());
});

export default route;
