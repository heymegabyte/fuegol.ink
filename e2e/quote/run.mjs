#!/usr/bin/env node
/**
 * Prod E2E — pricing book + preflight quote (`GET /v2/pricing`, `POST /v2/quote`).
 * Verifies the §4/§5/§8 surface against the LIVE Worker: 50%-of-Firecrawl core
 * pricing, margin-safe premium, Firecrawl credit parity, and fail-closed on
 * unbounded jobs. Public endpoints (no key needed), but we keep requests modest.
 *
 *   node e2e/quote/run.mjs            # against prod
 *   API=https://… node e2e/quote/run.mjs
 */
const API = process.env.API ?? 'https://fuegol-api.manhattan.workers.dev';

let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name} ${extra}`);
  }
};

async function get(path) {
  const r = await fetch(API + path, { headers: { 'user-agent': 'fuegol-e2e/1.0' } });
  return { status: r.status, body: await r.json() };
}
async function quote(payload) {
  const r = await fetch(API + '/v2/quote', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'fuegol-e2e/1.0' },
    body: JSON.stringify(payload),
  });
  return { status: r.status, body: await r.json() };
}

console.log(`\nfuegol quote/pricing E2E → ${API}\n`);

// 1. Price book
{
  const { status, body } = await get('/v2/pricing');
  ok('GET /v2/pricing → 200', status === 200, `got ${status}`);
  const plans = body?.data?.plans ?? [];
  const hobby = plans.find((p) => p.key === 'hobby');
  const scale = plans.find((p) => p.key === 'scale');
  ok(
    'Hobby is $9.50 / 5,000 credits',
    hobby?.priceMonthly === 9.5 && hobby?.credits === 5000,
    JSON.stringify(hobby),
  );
  ok('Hobby is exactly half of Firecrawl month-to-month', hobby?.competitor?.monthly === 19);
  ok(
    'Scale is $374.50 / 1,000,000 credits',
    scale?.priceMonthly === 374.5 && scale?.credits === 1_000_000,
  );
  ok('price book stamps a verified date', typeof body?.data?.verifiedAt === 'string');
  ok(
    'subscriber $5 top-ups ≥ 2× Firecrawl',
    body?.data?.topupPer5Usd?.fuego?.scale >= body?.data?.topupPer5Usd?.firecrawl?.scale * 2,
  );
  ok(
    'worst-case net $/credit is published + tiny',
    body?.data?.worstCaseNetRevenuePerCredit > 0 &&
      body?.data?.worstCaseNetRevenuePerCredit < 0.001,
  );
}

// 2. Core scrape quote — Firecrawl parity
{
  const { status, body } = await quote({ operation: 'scrape', pages: 1000, lot: 'standard' });
  ok('POST /v2/quote scrape → 200', status === 200);
  ok('1000-page scrape = 1000 credits', body?.data?.credits === 1000, String(body?.data?.credits));
  ok('same credit burn as Firecrawl', body?.data?.comparedToFirecrawl?.credits === 1000);
  ok(
    'USD priced at Standard lot',
    body?.data?.usd?.lot === 'Standard' && body?.data?.usd?.amount > 0,
  );
  ok('boundable', body?.data?.boundable === true);
}

// 3. Advanced JSON format surcharge (still Firecrawl parity)
{
  const { body } = await quote({ operation: 'scrape', pages: 100, formats: ['json'] });
  ok(
    '100pg + JSON = 500 credits (100 + 400)',
    body?.data?.credits === 500,
    String(body?.data?.credits),
  );
  ok('Firecrawl parity on advanced format', body?.data?.comparedToFirecrawl?.credits === 500);
}

// 4. Fail-closed: unbounded crawl
{
  const { status, body } = await quote({ operation: 'crawl' });
  ok('unbounded crawl → 400', status === 400, `got ${status}`);
  ok('crawl flagged not boundable', body?.data?.boundable === false);
  ok('crawl disclaimer asks for a page limit', /page limit/i.test(body?.data?.disclaimer ?? ''));
}

// 5. Fail-closed: agent needs a cap
{
  const unbounded = await quote({ operation: 'agent' });
  ok('agent without cap → 400', unbounded.status === 400);
  const capped = await quote({ operation: 'agent', maxCredits: 500 });
  ok('agent with maxCredits → 200', capped.status === 200 && capped.body?.data?.boundable === true);
  ok('agent respects the cap', capped.body?.data?.maxCredits <= 500);
}

// 6. Premium op is not a Firecrawl parity SKU
{
  const { body } = await quote({ operation: 'ai_search_query' });
  ok('premium ai_search_query > 0 credits', body?.data?.credits > 0);
  ok('premium op has no Firecrawl parity SKU', body?.data?.comparedToFirecrawl?.credits === 0);
  ok('premium op flagged margin-safe', body?.data?.marginSafe === true);
}

// 7. Root listing advertises the new endpoints
{
  const { body } = await get('/');
  ok('root lists quote endpoint', body?.endpoints?.quote === 'POST /v2/quote');
  ok('root lists pricing endpoint', body?.endpoints?.pricing === 'GET /v2/pricing');
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
