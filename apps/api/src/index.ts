import * as Sentry from '@sentry/cloudflare';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { FIRECRAWL_COMPAT, CORE_CREDIT_COSTS } from '@fuegol/contracts';
import type { Env } from './env';
import { principal, type Vars } from './lib/auth';
import scrapeRoute from './routes/scrape';
import mapRoute from './routes/map';
import crawlRoute from './routes/crawl';
import batchRoute from './routes/batch';
import extractRoute from './routes/extract';
import browserRoute from './routes/browser';
import aiSearchRoute from './routes/ai-search';
import searchRoute from './routes/search';
import parseRoute from './routes/parse';
import keysRoute from './routes/keys';
import monitorRoute from './routes/monitor';
import agentRoute from './routes/agent';
import accountRoute from './routes/account';
import pricingRoute from './routes/pricing';
import stubsRoute from './routes/stubs';
import v1Route from './routes/v1';
import { recordUsage, creditsUsedThisPeriod, effectiveCap } from './lib/ledger';
import { runDueMonitors } from './lib/monitor';

import { CrawlCoordinator as CrawlCoordinatorBase } from './crawl-do';
import { ExtractCoordinator as ExtractCoordinatorBase } from './extract-do';
import { BrowserSession as BrowserSessionBase } from './browser-do';

/** Shared Sentry options (estate baseline — server-side `@sentry/cloudflare`). */
const sentryOptions = (env: Env) => ({
  dsn: env.SENTRY_DSN,
  tracesSampleRate: 1.0,
});

// Durable Objects run in their own isolates — each must be instrumented + re-exported under
// the class_name wrangler expects, else errors inside them never reach Sentry.
export const CrawlCoordinator = Sentry.instrumentDurableObjectWithSentry(
  sentryOptions,
  CrawlCoordinatorBase,
);
export const ExtractCoordinator = Sentry.instrumentDurableObjectWithSentry(
  sentryOptions,
  ExtractCoordinatorBase,
);
export const BrowserSession = Sentry.instrumentDurableObjectWithSentry(
  sentryOptions,
  BrowserSessionBase,
);

/** Map a request to its billable operation + credit cost (null = not billed). */
function usageForRequest(method: string, path: string): { name: string; credits: number } | null {
  if (method !== 'POST') return null;
  // Fuego-exclusive PREMIUM ops. Current billed values are the pre-GA defaults; the
  // margin-floored GA targets (priced against the worst-case lot) live in the pricing
  // SSOT — see premiumCredits() in @fuegol/contracts and docs/RELEASE_CHECKLIST.md.
  if (path === '/v2/browser') return { name: 'browser_session', credits: 2 };
  if (/^\/v2\/browser\/[^/]+\/act$/.test(path)) return { name: 'browser_act', credits: 1 };
  if (path === '/v2/ai-search/index') return { name: 'ai_search_index', credits: 5 };
  if (path === '/v2/ai-search/query') return { name: 'ai_search_query', credits: 2 };
  // CORE ops — Firecrawl-identical credit burn, sourced from the pricing SSOT.
  switch (path) {
    case '/v2/scrape':
      return { name: 'scrape', credits: CORE_CREDIT_COSTS.scrape };
    case '/v2/map':
      return { name: 'map', credits: CORE_CREDIT_COSTS.map };
    case '/v2/search':
      return { name: 'search', credits: CORE_CREDIT_COSTS.search };
    case '/v2/extract':
      return { name: 'extract', credits: CORE_CREDIT_COSTS.extract };
    case '/v2/parse':
      return { name: 'parse', credits: CORE_CREDIT_COSTS.parse };
    case '/v2/crawl':
      return { name: 'crawl', credits: CORE_CREDIT_COSTS.crawl }; // job start; per-page usage tracked in the DO
    case '/v2/batch/scrape':
      return { name: 'batch_scrape', credits: CORE_CREDIT_COSTS.batch_scrape };
    default:
      return null;
  }
}

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

app.use(
  '*',
  cors({
    origin: '*',
    allowHeaders: ['authorization', 'content-type'],
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    exposeHeaders: ['x-fuegol-strategy'],
    maxAge: 86400,
  }),
);
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
    tagline:
      'The web data engine for AI. Firecrawl-compatible. Cloudflare-powered. Half the price.',
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
      search: 'POST /v2/search',
      pricing: 'GET /v2/pricing',
      quote: 'POST /v2/quote',
      creditUsage: 'GET /v2/team/credit-usage',
      health: 'GET /health',
    },
  }),
);

app.get('/health', (c) => c.json({ status: 'ok', service: 'fuegol-api', version: '0.1.0' }));

// Serve R2 artifacts (screenshots, result bundles) — public, cacheable, read-only.
app.get('/assets/*', async (c) => {
  if (!c.env.ARTIFACTS)
    return c.json(
      { success: false, error: 'Artifacts not configured', code: 'UNKNOWN_ERROR' },
      404,
    );
  const key = decodeURIComponent(new URL(c.req.url).pathname.replace(/^\/assets\//, ''));
  if (!key || key.includes('..'))
    return c.json({ success: false, error: 'Bad asset key', code: 'BAD_REQUEST' }, 400);
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
v2.route('/', browserRoute);
v2.route('/', aiSearchRoute);
v2.route('/', searchRoute);
v2.route('/', parseRoute);
v2.route('/', keysRoute);
v2.route('/', monitorRoute);
v2.route('/', agentRoute);
v2.route('/', accountRoute);
v2.route('/', pricingRoute);
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
  Sentry.captureException(err); // Hono catches route throws here, so capture explicitly.
  return c.json(
    {
      success: false,
      error: err instanceof Error ? err.message : 'Internal error',
      code: 'UNKNOWN_ERROR',
    },
    500,
  );
});

// Sentry self-test: throws (→ onError → captured). Gated by a token so it is not abusable.
app.get('/debug/sentry', (c) => {
  if (c.req.query('token') !== 'selftest') return c.json({ ok: false }, 404);
  throw new Error(`sentry-selftest ${c.req.query('nonce') ?? ''}`.trim());
});

// Cron sweep: run due monitors (recurring scrape + change detection).
const scheduled = async (
  _event: ScheduledController,
  env: Env,
  ctx: ExecutionContext,
): Promise<void> => {
  ctx.waitUntil(runDueMonitors(env));
};

export default Sentry.withSentry(sentryOptions, {
  fetch: (req: Request, env: Env, ctx: ExecutionContext) => app.fetch(req, env, ctx),
  scheduled,
} satisfies ExportedHandler<Env>);
