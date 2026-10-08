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
import accountRoute from './routes/account';
import stubsRoute from './routes/stubs';
import v1Route from './routes/v1';
import { recordUsage } from './lib/ledger';

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

// Record usage to the credit ledger for authenticated (D1-key) principals, after the
// handler runs, without blocking the response. Never throws into the request path.
app.use('/v2/*', async (c, next) => {
  await next();
  try {
    const p = c.get('principal');
    if (p.authed && p.keyId && c.env.DB && c.res.status >= 200 && c.res.status < 400) {
      const op = usageForRequest(c.req.method, new URL(c.req.url).pathname);
      if (op) {
        c.executionCtx.waitUntil(
          recordUsage(c.env.DB, { keyId: p.keyId, operation: op.name, credits: op.credits }),
        );
      }
    }
  } catch {
    /* ledger errors must never affect the response */
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

const v2 = new Hono<{ Bindings: Env; Variables: Vars }>();
v2.route('/', scrapeRoute);
v2.route('/', mapRoute);
v2.route('/', crawlRoute);
v2.route('/', batchRoute);
v2.route('/', extractRoute);
v2.route('/', searchRoute);
v2.route('/', parseRoute);
v2.route('/', keysRoute);
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

export default app;
