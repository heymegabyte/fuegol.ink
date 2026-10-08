import { Hono } from 'hono';
import type { Context } from 'hono';
import { BatchScrapeRequestSchema } from '@fuegol/contracts';
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
    return fail(
      c,
      429,
      'Demo rate limit reached (≈20 requests/min). Add a fuegol.ink API key for higher limits.',
      'BAD_REQUEST',
    );
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

route.post('/batch/scrape', async (c) => {
  const denied = gate(c);
  if (denied) return denied;
  if (!c.env.CRAWL)
    return fail(c, 501, 'Batch scrape requires the CRAWL Durable Object binding.', 'UNKNOWN_ERROR');
  const parsed = await parseBody(c, BatchScrapeRequestSchema);
  if (!parsed.ok) return parsed.response;

  const malformed = parsed.data.urls.filter((u) => {
    try {
      const x = new URL(u);
      return x.protocol !== 'http:' && x.protocol !== 'https:';
    } catch {
      return true;
    }
  });
  if (parsed.data.ignoreInvalidURLs === false && malformed.length > 0) {
    return fail(c, 400, `Invalid URLs: ${malformed.join(', ')}`, 'BAD_REQUEST');
  }

  const id = crypto.randomUUID();
  const stub = c.env.CRAWL.get(c.env.CRAWL.idFromName(id));
  const { invalidURLs } = await stub.startBatch(parsed.data, id);
  return c.json({
    success: true as const,
    id,
    url: `${origin(c)}/v2/batch/scrape/${id}`,
    ...(invalidURLs.length > 0 ? { invalidURLs } : {}),
  });
});

route.get('/batch/scrape/:id', async (c) => {
  if (!c.env.CRAWL) return fail(c, 501, 'Batch scrape not configured.', 'UNKNOWN_ERROR');
  const id = c.req.param('id');
  const skip = Math.max(0, Number(c.req.query('skip') ?? 0) || 0);
  const stub = c.env.CRAWL.get(c.env.CRAWL.idFromName(id));
  const s = (await stub.status(skip, 10)) as CrawlStatusResult | null;
  if (!s) return fail(c, 404, 'Batch scrape job not found.');
  return c.json({
    success: true as const,
    status: s.status,
    total: s.total,
    completed: s.completed,
    creditsUsed: s.creditsUsed,
    createdAt: s.createdAt,
    ...(s.completedAt ? { completedAt: s.completedAt } : {}),
    next: s.nextOffset != null ? `${origin(c)}/v2/batch/scrape/${id}?skip=${s.nextOffset}` : null,
    data: s.data,
  });
});

route.delete('/batch/scrape/:id', async (c) => {
  if (!c.env.CRAWL) return fail(c, 501, 'Batch scrape not configured.', 'UNKNOWN_ERROR');
  const stub = c.env.CRAWL.get(c.env.CRAWL.idFromName(c.req.param('id')));
  const ok = await stub.cancel();
  if (!ok) return fail(c, 404, 'Batch scrape job not found.');
  return c.json({ status: 'cancelled' as const });
});

route.get('/batch/scrape/:id/errors', async (c) => {
  if (!c.env.CRAWL) return fail(c, 501, 'Batch scrape not configured.', 'UNKNOWN_ERROR');
  const stub = c.env.CRAWL.get(c.env.CRAWL.idFromName(c.req.param('id')));
  return c.json(await stub.getErrors());
});

export default route;
