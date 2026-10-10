import { Hono } from 'hono';
import { computeQuote, pricingBook, QuoteRequestSchema } from '@fuegol/contracts';
import type { Env } from '../env';
import type { Vars } from '../lib/auth';
import { parseBody } from '../lib/respond';

const route = new Hono<{ Bindings: Env; Variables: Vars }>();

/**
 * Pricing + preflight quote. Both are public (no auth / no credit burn) — they are
 * the "savings calculator" and "price before you crawl" surfaces the website needs,
 * and a client can call the quote before every expensive job to see a firm ceiling.
 */

// GET /v2/pricing — the full public price book (plans, packs, credit costs, margin).
route.get('/pricing', (c) => {
  return c.json({ success: true as const, data: pricingBook() });
});

// POST /v2/quote — deterministic preflight estimate + hard max for a planned job.
route.post('/quote', async (c) => {
  const parsed = await parseBody(c, QuoteRequestSchema);
  if (!parsed.ok) return parsed.response;
  const data = computeQuote(parsed.data);
  // Fail closed on unbounded premium work: honest 400 with an actionable hint rather
  // than a quote that implies a bounded cost we cannot guarantee.
  const status = data.boundable ? 200 : 400;
  return c.json({ success: data.boundable, data }, status);
});

export default route;
