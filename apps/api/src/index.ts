import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { FIRECRAWL_COMPAT } from '@fuegol/contracts';
import type { Env } from './env';
import { principal, type Vars } from './lib/auth';
import scrapeRoute from './routes/scrape';
import mapRoute from './routes/map';
import crawlRoute from './routes/crawl';
import batchRoute from './routes/batch';
import extractRoute from './routes/extract';
import searchRoute from './routes/search';
import parseRoute from './routes/parse';
import keysRoute from './routes/keys';
import monitorRoute from './routes/monitor';
import agentRoute from './routes/agent';
import accountRoute from './routes/account';
import stubsRoute from './routes/stubs';
import v1Route from './routes/v1';
import { recordUsage, creditsUsedThisPeriod, effectiveCap } from './lib/ledger';
import { runDueMonitors } from './lib/monitor';

export { CrawlCoordinator } from './crawl-do';
export { ExtractCoordinator } from './extract-do';

/** Map a request to its billable operation + credit cost (null = not billed). */
function usageForRequest(method: string, path: string): { name: string; credits: number } | null {
  if (method !== 'POST') return null;
  switch (path) {
    case '/v2/scrape':
      return { name: 'scrape', credits: 1 };
    case '/v2/map':
      return { name: 'map', credits: 1 };
    case '/v2/search':
      return { name: 'search', credits: 2 };
    case '/v2/extract':
      return { name: 'extract', credits: 5 };
    case '/v2/parse':
      return { name: 'parse', credits: 1 };
    case '/v2/crawl':
      return { name: 'crawl', credits: 1 }; // job start; per-page usage tracked in the DO
    case '/v2/batch/scrape':
      return { name: 'batch_scrape', credits: 1 };
    default:
      return null;
  }
}

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

app.use('*', cors({
  origin: '*',
  allowHeaders: ['authorization', 'content-type'],
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  exposeHeaders: ['x-fuegol-strategy'],
  maxAge: 86400,
}));
app.use('*', principal);

// Credit enforcement + ledger recording for authenticated (D1-key) principals.
// Reserve/check BEFORE the work (402 on insufficient credits), record AFTER success.
app.use('/v2/*', async (c, next) => {
  const p = c.get('principal');
  const op = usageForRequest(c.req.method, new URL(c.req.url).pathname);

  if (op && p.authed && p.keyId && c.env.DB) {
    try {
      const used = await creditsUsedThisPeriod(c.env.DB, p.keyId);
      const cap = effectiveCap(p.monthlyCredits ?? 0, p.spendLimit);
      if (cap - used < op.credits) {
        return c.json(
          {
            success: false,
            error: `Insufficient credits: ${op.name} needs ${op.credits}, ${Math.max(0, cap - used)} of ${cap} remaining this period. Raise your spend limit (POST /v2/team/spend-limit) or upgrade your plan.`,
            code: 'BAD_REQUEST',
          },
          402,
        );
      }
    } catch {
      /* fail open: never block paid usage on a ledger read hiccup */
    }
  }

  await next();

  if (op && p.authed && p.keyId && c.env.DB && c.res.status >= 200 && c.res.status < 400) {
    c.executionCtx.waitUntil(
      recordUsage(c.env.DB, { keyId: p.keyId, operation: op.name, credits: op.credits }),
    );
  }
});

app.get('/', (c) =>
  c.json({
    service: 'fuegol.ink',
    tagline: 'The web data engine for AI. Firecrawl-compatible. Cloudflare-powered. Half the price.',
    version: '0.1.0',
    documentation: 'https://docs.fuegol.ink',
    dashboard: 'https://app.fuegol.ink',
    source: 'https://github.com/heymegabyte/fuegol.ink',
    compatibility: { firecrawl: FIRECRAWL_COMPAT.apiVersion, pinnedAt: FIRECRAWL_COMPAT.pinnedAt },
    endpoints: {
      scrape: 'POST /v2/scrape',
      map: 'POST /v2/map',
      crawl: 'POST /v2/crawl',
      crawlStatus: 'GET /v2/crawl/:id',
      search: 'POST /v2/search (coming soon)',
      creditUsage: 'GET /v2/team/credit-usage',
      health: 'GET /health',
    },
  }),
);

app.get('/health', (c) => c.json({ status: 'ok', service: 'fuegol-api', version: '0.1.0' }));

// Serve R2 artifacts (screenshots, result bundles) — public, cacheable, read-only.
app.get('/assets/*', async (c) => {
  if (!c.env.ARTIFACTS) return c.json({ success: false, error: 'Artifacts not configured', code: 'UNKNOWN_ERROR' }, 404);
  const key = decodeURIComponent(new URL(c.req.url).pathname.replace(/^\/assets\//, ''));
  if (!key || key.includes('..')) return c.json({ success: false, error: 'Bad asset key', code: 'BAD_REQUEST' }, 400);
  const obj = await c.env.ARTIFACTS.get(key);
  if (!obj) return c.json({ success: false, error: 'Asset not found', code: 'BAD_REQUEST' }, 404);
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  if (!headers.has('content-type')) headers.set('content-type', 'image/png');
  headers.set('cache-control', 'public, max-age=86400');
  return new Response(obj.body, { headers });
});

// Webhook test sink (stores the last received signed webhook per id in R2; for
// verifying delivery + signature). POST from a crawl/batch webhook, GET to inspect.
app.post('/webhook-sink/:id', async (c) => {
  if (!c.env.ARTIFACTS) return c.json({ ok: false }, 503);
  const body = await c.req.text();
  const record = {
    signature: c.req.header('x-fuegol-signature') ?? '',
    event: c.req.header('x-fuegol-event') ?? '',
    body,
    receivedAt: new Date().toISOString(),
  };
  await c.env.ARTIFACTS.put(`webhooks/${c.req.param('id')}.json`, JSON.stringify(record), {
    httpMetadata: { contentType: 'application/json' },
  });
  return c.json({ ok: true });
});
app.get('/webhook-sink/:id', async (c) => {
  if (!c.env.ARTIFACTS) return c.json({ received: false }, 404);
  const obj = await c.env.ARTIFACTS.get(`webhooks/${c.req.param('id')}.json`);
  if (!obj) return c.json({ received: false }, 404);
  return new Response(obj.body, { headers: { 'content-type': 'application/json' } });
});

const v2 = new Hono<{ Bindings: Env; Variables: Vars }>();
v2.route('/', scrapeRoute);
v2.route('/', mapRoute);
v2.route('/', crawlRoute);
v2.route('/', batchRoute);
v2.route('/', extractRoute);
v2.route('/', searchRoute);
v2.route('/', parseRoute);
v2.route('/', keysRoute);
v2.route('/', monitorRoute);
v2.route('/', agentRoute);
v2.route('/', accountRoute);
v2.route('/', stubsRoute);
app.route('/v2', v2);
app.route('/v1', v1Route);

app.notFound((c) =>
  c.json(
    {
      success: false,
      error: `No such endpoint: ${c.req.method} ${new URL(c.req.url).pathname}`,
      code: 'BAD_REQUEST',
    },
    404,
  ),
);

app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json(
    { success: false, error: err instanceof Error ? err.message : 'Internal error', code: 'UNKNOWN_ERROR' },
    500,
  );
});

// Cron sweep: run due monitors (recurring scrape + change detection).
const scheduled = async (_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> => {
  ctx.waitUntil(runDueMonitors(env));
};

export default {
  fetch: (req: Request, env: Env, ctx: ExecutionContext) => app.fetch(req, env, ctx),
  scheduled,
};
