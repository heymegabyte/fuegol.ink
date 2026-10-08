import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
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
    return fail(c, 429, 'Demo rate limit reached (≈20 requests/min).', 'BAD_REQUEST');
  }
  return null;
}

/**
 * Autonomous research agent: given a prompt (and optional schema), discover sources
 * via web search, scrape them, and synthesize a structured answer. Async job; reuses
 * the extract Durable Object with web-search enabled.
 */
route.post('/agent', async (c) => {
  const denied = gate(c);
  if (denied) return denied;
  if (!c.env.EXTRACT)
    return fail(c, 501, 'Agent requires the EXTRACT Durable Object binding.', 'UNKNOWN_ERROR');
  const parsed = await parseBody(
    c,
    z.object({
      prompt: z.string().min(1).max(10000),
      urls: z.array(z.string()).max(10).optional(),
      schema: z.record(z.string(), z.unknown()).optional(),
      maxCredits: z.number().int().positive().optional(),
    }),
  );
  if (!parsed.ok) return parsed.response;

  const id = crypto.randomUUID();
  const stub = c.env.EXTRACT.get(c.env.EXTRACT.idFromName(id));
  await stub.start({
    urls: parsed.data.urls ?? [],
    prompt: parsed.data.prompt,
    schema: parsed.data.schema,
    enableWebSearch: true,
    showSources: true,
  } as never);
  return c.json({ success: true as const, id });
});

route.get('/agent/:id', async (c) => {
  if (!c.env.EXTRACT) return fail(c, 501, 'Agent not configured.', 'UNKNOWN_ERROR');
  const stub = c.env.EXTRACT.get(c.env.EXTRACT.idFromName(c.req.param('id')));
  const s = (await stub.status()) as ExtractStatusResult | null;
  if (!s) return fail(c, 404, 'Agent job not found.');
  return c.json({
    success: s.status !== 'failed',
    status: s.status,
    ...(s.data !== undefined ? { data: s.data } : {}),
    ...(s.sources ? { sources: s.sources } : {}),
    ...(s.error ? { error: s.error } : {}),
  });
});

export default route;
