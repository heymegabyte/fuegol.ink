import { z } from 'zod';

/**
 * Pricing single source of truth — shared by the API (metering + preflight quotes),
 * the website (savings calculator + price-before-you-crawl estimator), the SDK, and
 * the docs. There is deliberately ONE place these numbers live.
 *
 * Two independent axes, per the product contract:
 *
 *  1. CORE ops (the Firecrawl-contracted families: scrape / crawl / map / search /
 *     extract / parse / batch) bill at Firecrawl-IDENTICAL credit cost. Compatibility
 *     is an externally testable contract, not a marketing line — so credit burn on the
 *     common operations matches upstream exactly.
 *
 *  2. PREMIUM, Fuego-exclusive ops (interactive browser sessions, AI search / RAG,
 *     the autonomous agent, deep research, OCR, stealth proxy) are priced to clear a
 *     contribution-MARGIN FLOOR even for the deepest-discount credit lot (Scale /
 *     bulk). They are NEVER half-price loss leaders, and never fund themselves off a
 *     50%-off core plan. See `marginSafeCredits()`.
 *
 * Every competitor + provider figure is stamped with the date it was verified so the
 * "50% less" claim is dated and auditable, never a floating assertion.
 */

/** The date the competitor + provider pricing below was last verified against source. */
export const PRICING_VERIFIED_AT = '2026-10-09';

// ---------------------------------------------------------------------------
// Competitor anchor — Firecrawl published pricing (firecrawl.dev/pricing).
// Verified 2026-10-09. `monthly` = month-to-month; `annualMonthly` = the (lower)
// annual-billed monthly-equivalent headline. The "50% less on comparable core API
// plans" claim is measured against `monthly` (month-to-month), and the calculator
// ALSO shows the annual figure so the comparison is never misleading.
// ---------------------------------------------------------------------------
export interface CompetitorPlan {
  label: string;
  monthly: number;
  annualMonthly: number;
  credits: number;
}
export const FIRECRAWL_PLANS: Record<string, CompetitorPlan> = {
  free: { label: 'Free', monthly: 0, annualMonthly: 0, credits: 1_000 },
  hobby: { label: 'Hobby', monthly: 19, annualMonthly: 16, credits: 5_000 },
  standard: { label: 'Standard', monthly: 99, annualMonthly: 83, credits: 100_000 },
  growth: { label: 'Growth', monthly: 399, annualMonthly: 333, credits: 500_000 },
  scale: { label: 'Scale', monthly: 749, annualMonthly: 599, credits: 1_000_000 },
} as const;

/** Firecrawl $5 credit top-ups by plan tier (verified 2026-10-09). */
export const FIRECRAWL_TOPUP_PER_5USD: Record<string, number> = {
  hobby: 1_000,
  standard: 2_000,
  growth: 2_500,
  scale: 5_000,
} as const;

// ---------------------------------------------------------------------------
// Fuego plans — exactly HALF of Firecrawl's month-to-month price, like-for-like
// included credits. The headline "50% less on comparable core API plans".
// ---------------------------------------------------------------------------
export type PlanKey = 'free' | 'hobby' | 'standard' | 'growth' | 'scale' | 'enterprise';

export interface FuegoPlan {
  key: PlanKey;
  label: string;
  /** USD / month, month-to-month. null = custom (Enterprise). */
  priceMonthly: number | null;
  /** Included core credits per billing period. null = custom. */
  credits: number | null;
  /** Requests/min, mirrored from the competitor's published limits for parity. */
  rateLimits: { scrapeMapSearch: number; crawlAgent: number; interact: number };
  highlight?: boolean;
}

export const FUEGO_PLANS: Record<PlanKey, FuegoPlan> = {
  free: {
    key: 'free',
    label: 'Free',
    priceMonthly: 0,
    credits: 1_000,
    rateLimits: { scrapeMapSearch: 10, crawlAgent: 2, interact: 2 },
  },
  hobby: {
    key: 'hobby',
    label: 'Hobby',
    priceMonthly: 9.5,
    credits: 5_000,
    rateLimits: { scrapeMapSearch: 100, crawlAgent: 20, interact: 20 },
  },
  standard: {
    key: 'standard',
    label: 'Standard',
    priceMonthly: 49.5,
    credits: 100_000,
    rateLimits: { scrapeMapSearch: 500, crawlAgent: 100, interact: 100 },
    highlight: true,
  },
  growth: {
    key: 'growth',
    label: 'Growth',
    priceMonthly: 199.5,
    credits: 500_000,
    rateLimits: { scrapeMapSearch: 5_000, crawlAgent: 1_000, interact: 1_000 },
  },
  scale: {
    key: 'scale',
    label: 'Scale',
    priceMonthly: 374.5,
    credits: 1_000_000,
    rateLimits: { scrapeMapSearch: 10_000, crawlAgent: 2_000, interact: 1_500 },
  },
  enterprise: {
    key: 'enterprise',
    label: 'Enterprise',
    priceMonthly: null,
    credits: null,
    rateLimits: { scrapeMapSearch: 10_000, crawlAgent: 2_000, interact: 1_500 },
  },
} as const;

/**
 * One-time credit packs — no subscription required, purchased balances never expire
 * on cancellation (consumed after sooner-expiring subscription credits). Larger packs
 * earn a better $/credit (volume curve) but the best rate still clears the floor by a
 * wide margin — see the margin property test.
 */
export interface CreditPack {
  usd: number;
  credits: number;
}
export const FUEGO_STANDALONE_PACKS: CreditPack[] = [
  { usd: 5, credits: 2_000 },
  { usd: 10, credits: 4_500 },
  { usd: 25, credits: 12_000 },
  { usd: 50, credits: 26_000 },
  { usd: 100, credits: 55_000 },
  { usd: 250, credits: 145_000 },
  { usd: 500, credits: 300_000 },
] as const;

/**
 * Subscriber $5 top-up by entitlement tier — double the competitor's top-up credits
 * at the same price (≥50% cheaper per credit on comparable top-ups).
 */
export const FUEGO_TOPUP_PER_5USD: Record<string, number> = {
  hobby: 2_000,
  standard: 4_000,
  growth: 5_000,
  scale: 10_000,
} as const;

// ---------------------------------------------------------------------------
// CORE credit costs — Firecrawl-IDENTICAL. Changing any of these breaks the
// compatibility contract; the SDK/MCP compat suite pins them.
// ---------------------------------------------------------------------------
export const CORE_CREDIT_COSTS = {
  /** per page */ scrape: 1,
  /** per page */ crawl: 1,
  /** per call */ map: 1,
  /** per 10 results */ search: 2,
  /** per text page */ parse: 1,
  /** per page */ batch_scrape: 1,
  /** per page (1 base + 4 advanced-format = Firecrawl JSON/extract parity) */ extract: 5,
  /** +4/page for json / question / highlight formats (Firecrawl parity) */
  advancedFormatSurcharge: 4,
} as const;

/** Format names that trigger the Firecrawl +4/page advanced-format surcharge. */
export const ADVANCED_FORMATS = new Set([
  'json',
  'extract',
  'question',
  'highlights',
  'changeTracking',
]);

// ---------------------------------------------------------------------------
// PREMIUM unit cost model (Fuego-exclusive). Modeled, conservative, P95. These are
// NOT yet reconciled against live provider invoices — docs/unit-economics.md tracks
// the measured values and this table is updated from measurements each pass.
//
// Grounded in (verified 2026-10-09):
//   • Cloudflare Browser Rendering: $0.09 / browser-hour (REST/Quick Actions,
//     duration only); Sessions add $2 / concurrent browser. 10 free hrs/mo (Paid).
//   • Workers AI: per-neuron / per-token (routed via AI Gateway for cache).
//   • R2: $0.015/GB-mo, $0 egress. D1: generous free tier. Queues: $0.40/M ops.
// ---------------------------------------------------------------------------
export const PREMIUM_UNIT_COST_USD = {
  /** one JS render (~10s @ $0.09/hr + cold-start/retry buffer) */ browser_render_page: 0.001,
  /** interactive session, per wall-clock minute */ browser_minute: 0.003,
  /** Workers AI structured extraction, per page */ ai_extract_page: 0.002,
  /** embed + upsert, per document */ ai_search_index_doc: 0.0015,
  /** embed + grounded LLM answer, per query */ ai_search_query: 0.003,
  /** multi-search + scrape + synthesis (bounded run) */ agent_run: 0.02,
  /** render + R2 store, per screenshot */ screenshot: 0.001,
  /** scanned-document OCR, per page (premium) */ ocr_page: 0.004,
  /** premium / stealth proxy, per page */ stealth_page: 0.005,
} as const;
export type PremiumUnit = keyof typeof PREMIUM_UNIT_COST_USD;

/** Target modeled contribution margin after allocated variable cost + payment fees. */
export const MARGIN_FLOOR = 0.5;
/** Adverse-cost headroom baked into every premium charge (provider spikes, retries). */
export const RISK_MULTIPLIER = 1.5;

// ---------------------------------------------------------------------------
// Margin math — the provable core. Pure, deterministic, unit-tested.
// ---------------------------------------------------------------------------

/** Stripe fee, conservative card rate: 2.9% + $0.30. */
export function stripeFeeUsd(amountUsd: number): number {
  return 0.029 * amountUsd + 0.3;
}

/** Net USD revenue per credit for a paid lot, after one amortized Stripe fee. Free
 *  (price 0) credits fund nothing → Infinity so they can never back premium work. */
export function netRevenuePerCredit(priceUsd: number, credits: number): number {
  if (credits <= 0 || priceUsd <= 0) return Infinity;
  return (priceUsd - stripeFeeUsd(priceUsd)) / credits;
}

/**
 * The LOWEST net revenue per credit across every paid lot (subscriptions + packs).
 * Premium credits must clear the margin floor against THIS worst-case rate — never
 * the Hobby retail rate — else a Scale or bulk-pack buyer arbitrages premium at a
 * loss (the exact failure the product contract forbids).
 */
export function lowestNetRevenuePerCredit(): number {
  const rates: number[] = [];
  for (const p of Object.values(FUEGO_PLANS)) {
    if (p.priceMonthly && p.credits && p.priceMonthly > 0 && p.credits > 0) {
      rates.push(netRevenuePerCredit(p.priceMonthly, p.credits));
    }
  }
  for (const pack of FUEGO_STANDALONE_PACKS) {
    rates.push(netRevenuePerCredit(pack.usd, pack.credits));
  }
  return Math.min(...rates);
}

/**
 * Credits that MUST be charged for a premium unit so that — even at the lowest lot
 * rate and under the adverse-cost multiplier — contribution margin ≥ the floor.
 *
 *   requiredRevenue = (costUsd × risk) / (1 − floor)
 *   credits         = ceil(requiredRevenue / worstNetRevenuePerCredit)
 */
export function marginSafeCredits(
  costUsd: number,
  opts?: { floor?: number; risk?: number; worstRate?: number },
): number {
  const floor = opts?.floor ?? MARGIN_FLOOR;
  const risk = opts?.risk ?? RISK_MULTIPLIER;
  const worst = opts?.worstRate ?? lowestNetRevenuePerCredit();
  if (!(worst > 0) || !isFinite(worst)) return 1;
  const requiredRevenue = (costUsd * risk) / (1 - floor);
  return Math.max(1, Math.ceil(requiredRevenue / worst));
}

/** Margin-safe charge for a named premium unit, at a given quantity. */
export function premiumCredits(unit: PremiumUnit, quantity = 1): number {
  return marginSafeCredits(PREMIUM_UNIT_COST_USD[unit] * Math.max(0, quantity));
}

/**
 * Actual contribution margin realized if `credits` are charged for `costUsd` of work,
 * settled at `rate` net $/credit. Used by the property test to prove no lot goes
 * negative. Margin = (revenue − cost) / revenue.
 */
export function realizedMargin(credits: number, costUsd: number, rate: number): number {
  const revenue = credits * rate;
  if (revenue <= 0) return costUsd > 0 ? -Infinity : 0;
  return (revenue - costUsd) / revenue;
}

// ---------------------------------------------------------------------------
// Preflight QUOTE — "price before you crawl". Deterministic estimate + firm max.
// ---------------------------------------------------------------------------
export const QuoteOperationSchema = z.enum([
  'scrape',
  'crawl',
  'batch_scrape',
  'map',
  'search',
  'extract',
  'agent',
  'browser',
  'ai_search_query',
  'ai_search_index',
]);
export type QuoteOperation = z.infer<typeof QuoteOperationSchema>;

export const QuoteRequestSchema = z.object({
  operation: QuoteOperationSchema,
  /** pages for crawl / batch / parse-like ops (best estimate). */
  pages: z.number().int().positive().max(5_000_000).optional(),
  /** results for search. */
  results: z.number().int().positive().max(1000).optional(),
  /** wall-clock minutes for an interactive browser session. */
  minutes: z.number().positive().max(600).optional(),
  /** requested output formats — advanced ones add the Firecrawl +4/page surcharge. */
  formats: z.array(z.string()).max(32).optional(),
  /** render strategy; `browser` forces the JS tier for every page. */
  render: z.enum(['auto', 'static', 'browser']).optional(),
  premium: z
    .object({
      stealth: z.boolean().optional(),
      screenshot: z.boolean().optional(),
      ocr: z.boolean().optional(),
      aiExtraction: z.boolean().optional(),
    })
    .optional(),
  /** which lot the credits are priced against for the USD readout; omit ⇒ worst-case. */
  lot: z.enum(['hobby', 'standard', 'growth', 'scale', 'bulk']).optional(),
  /** customer-set hard ceiling on credits. The quote fails closed above this. */
  maxCredits: z.number().int().positive().optional(),
});
export type QuoteRequest = z.infer<typeof QuoteRequestSchema>;

export interface QuoteLineItem {
  item: string;
  quantity: number;
  unitCredits: number;
  credits: number;
  basis: string;
}

export const QuoteResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    operation: QuoteOperationSchema,
    credits: z.number(),
    creditsRange: z.object({ min: z.number(), max: z.number() }),
    maxCredits: z.number(),
    boundable: z.boolean(),
    usd: z.object({
      amount: z.number().nullable(),
      perCredit: z.number().nullable(),
      lot: z.string(),
    }),
    breakdown: z.array(
      z.object({
        item: z.string(),
        quantity: z.number(),
        unitCredits: z.number(),
        credits: z.number(),
        basis: z.string(),
      }),
    ),
    marginSafe: z.boolean(),
    comparedToFirecrawl: z.object({ credits: z.number(), note: z.string() }),
    disclaimer: z.string(),
    verifiedAt: z.string(),
  }),
});
export type QuoteResponse = z.infer<typeof QuoteResponseSchema>;

/** Gross $/credit for a plan (display only; see netRevenuePerCredit for margin math). */
export function planPricePerCredit(plan: FuegoPlan): number | null {
  if (!plan.priceMonthly || !plan.credits) return null;
  return plan.priceMonthly / plan.credits;
}

/** Resolve the $/credit used for a quote's USD readout from the chosen lot. */
export function lotPricePerCredit(lot?: QuoteRequest['lot']): {
  perCredit: number | null;
  label: string;
} {
  switch (lot) {
    case 'hobby':
      return { perCredit: planPricePerCredit(FUEGO_PLANS.hobby), label: 'Hobby' };
    case 'standard':
      return { perCredit: planPricePerCredit(FUEGO_PLANS.standard), label: 'Standard' };
    case 'growth':
      return { perCredit: planPricePerCredit(FUEGO_PLANS.growth), label: 'Growth' };
    case 'scale':
      return { perCredit: planPricePerCredit(FUEGO_PLANS.scale), label: 'Scale' };
    case 'bulk': {
      const pack = FUEGO_STANDALONE_PACKS[0]!;
      return { perCredit: pack.usd / pack.credits, label: 'Bulk $5 pack' };
    }
    default:
      return { perCredit: planPricePerCredit(FUEGO_PLANS.standard), label: 'Standard' };
  }
}

/**
 * Compute a deterministic preflight quote. Same input ⇒ same output (no randomness),
 * so a client can show it before running and trust it as a ceiling. Open-ended ops
 * (crawl/agent) without a page/credit bound are reported `boundable:false` and MUST
 * carry a cap before execution — the product never runs an unbounded-cost job.
 */
export function computeQuote(req: QuoteRequest): QuoteResponse['data'] {
  const breakdown: QuoteLineItem[] = [];
  const add = (item: string, quantity: number, unitCredits: number, basis: string) => {
    const credits = Math.ceil(unitCredits * quantity);
    breakdown.push({ item, quantity, unitCredits, credits, basis });
    return credits;
  };

  const formats = new Set(req.formats ?? []);
  const advanced = [...formats].filter((f) => ADVANCED_FORMATS.has(f)).length > 0;
  const forcesBrowser = req.render === 'browser';
  const prem = req.premium ?? {};
  let boundable = true;
  let firecrawlCredits = 0;
  let worstCaseCredits = 0;

  switch (req.operation) {
    case 'scrape':
    case 'batch_scrape': {
      const pages = req.pages ?? 1;
      add(
        'Page fetch + extract',
        pages,
        CORE_CREDIT_COSTS.scrape,
        'core · Firecrawl parity (1/page)',
      );
      firecrawlCredits += pages * CORE_CREDIT_COSTS.scrape;
      if (advanced || prem.aiExtraction) {
        add(
          'Advanced format (JSON/AI)',
          pages,
          CORE_CREDIT_COSTS.advancedFormatSurcharge,
          'core · +4/page (Firecrawl parity)',
        );
        firecrawlCredits += pages * CORE_CREDIT_COSTS.advancedFormatSurcharge;
      }
      if (prem.screenshot || forcesBrowser)
        add(
          'Browser render / screenshot',
          pages,
          premiumCredits('browser_render_page'),
          'premium · margin-floored',
        );
      if (prem.stealth)
        add('Stealth proxy', pages, premiumCredits('stealth_page'), 'premium · margin-floored');
      if (prem.ocr)
        add('OCR (scanned pages)', pages, premiumCredits('ocr_page'), 'premium · margin-floored');
      break;
    }
    case 'crawl': {
      const pages = req.pages;
      if (!pages) {
        boundable = false;
        add(
          'Crawl (per page)',
          0,
          CORE_CREDIT_COSTS.crawl,
          'core · needs a page limit to bound cost',
        );
      } else {
        add('Crawl pages', pages, CORE_CREDIT_COSTS.crawl, 'core · Firecrawl parity (1/page)');
        firecrawlCredits += pages * CORE_CREDIT_COSTS.crawl;
        if (advanced || prem.aiExtraction) {
          add(
            'Advanced format (JSON/AI)',
            pages,
            CORE_CREDIT_COSTS.advancedFormatSurcharge,
            'core · +4/page',
          );
          firecrawlCredits += pages * CORE_CREDIT_COSTS.advancedFormatSurcharge;
        }
        if (forcesBrowser)
          add(
            'Browser render',
            pages,
            premiumCredits('browser_render_page'),
            'premium · margin-floored',
          );
        if (prem.stealth)
          add('Stealth proxy', pages, premiumCredits('stealth_page'), 'premium · margin-floored');
      }
      break;
    }
    case 'map': {
      add('Map (URL discovery)', 1, CORE_CREDIT_COSTS.map, 'core · Firecrawl parity (1/call)');
      firecrawlCredits += CORE_CREDIT_COSTS.map;
      break;
    }
    case 'search': {
      const results = req.results ?? 10;
      const blocks = Math.ceil(results / 10);
      add(
        'Search results',
        blocks,
        CORE_CREDIT_COSTS.search,
        'core · Firecrawl parity (2 / 10 results)',
      );
      firecrawlCredits += blocks * CORE_CREDIT_COSTS.search;
      break;
    }
    case 'extract': {
      const pages = req.pages ?? 1;
      add('AI extraction', pages, CORE_CREDIT_COSTS.extract, 'core · Firecrawl parity (5/page)');
      firecrawlCredits += pages * CORE_CREDIT_COSTS.extract;
      break;
    }
    case 'agent': {
      // Bounded autonomous run. Requires a cap; default worst-case is one modeled run.
      const credits = premiumCredits('agent_run');
      add('Autonomous agent run', 1, credits, 'premium · margin-floored, cap required');
      firecrawlCredits += 0; // no Firecrawl parity SKU
      if (!req.maxCredits) boundable = false;
      break;
    }
    case 'browser': {
      const minutes = req.minutes ?? 1;
      add(
        'Interactive browser session',
        minutes,
        premiumCredits('browser_minute'),
        'premium · per wall-clock minute',
      );
      break;
    }
    case 'ai_search_query': {
      add(
        'AI search (RAG) query',
        1,
        premiumCredits('ai_search_query'),
        'premium · margin-floored',
      );
      break;
    }
    case 'ai_search_index': {
      const pages = req.pages ?? 1;
      add(
        'AI search index (per doc)',
        pages,
        premiumCredits('ai_search_index_doc'),
        'premium · margin-floored',
      );
      break;
    }
  }

  const credits = breakdown.reduce((s, b) => s + b.credits, 0);
  // Deterministic range: crawl/agent discover variable pages → allow +50% ceiling.
  const variable = req.operation === 'crawl' || req.operation === 'agent';
  const min = credits;
  worstCaseCredits = variable ? Math.ceil(credits * 1.5) : credits;
  const max = req.maxCredits
    ? Math.min(worstCaseCredits || req.maxCredits, req.maxCredits)
    : worstCaseCredits;

  const { perCredit, label } = lotPricePerCredit(req.lot);
  const usdAmount = perCredit != null ? Number((credits * perCredit).toFixed(4)) : null;

  // marginSafe: every PREMIUM line already clears the floor by construction; core
  // lines are near-zero cost. The quote is margin-safe unless it is unboundable.
  const marginSafe = boundable;

  return {
    operation: req.operation,
    credits,
    creditsRange: { min, max: Math.max(max, min) },
    maxCredits: req.maxCredits ?? Math.max(worstCaseCredits, credits),
    boundable,
    usd: { amount: usdAmount, perCredit: perCredit ?? null, lot: label },
    breakdown,
    marginSafe,
    comparedToFirecrawl: {
      credits: firecrawlCredits,
      note:
        firecrawlCredits > 0
          ? 'Same credit burn as Firecrawl on core operations; your plan costs half as much per credit.'
          : 'A Fuego-exclusive premium operation — priced to a contribution-margin floor, not a Firecrawl parity SKU.',
    },
    disclaimer: boundable
      ? 'Deterministic estimate. Failed requests that return no document bill 0 credits; cached hits bill 0.'
      : 'Unbounded as specified — set a page limit (crawl) or maxCredits (agent) before running. Fuego never runs an unbounded-cost job.',
    verifiedAt: PRICING_VERIFIED_AT,
  };
}

/** The full public price book — served at GET /v2/pricing, consumed by the website. */
export function pricingBook() {
  return {
    verifiedAt: PRICING_VERIFIED_AT,
    currency: 'usd',
    claim: '50% less than Firecrawl on comparable core API plans (vs. their month-to-month price).',
    plans: Object.values(FUEGO_PLANS).map((p) => {
      const comp = FIRECRAWL_PLANS[p.key];
      return {
        key: p.key,
        label: p.label,
        priceMonthly: p.priceMonthly,
        credits: p.credits,
        rateLimits: p.rateLimits,
        highlight: p.highlight ?? false,
        competitor: comp ? { monthly: comp.monthly, annualMonthly: comp.annualMonthly } : null,
      };
    }),
    packs: FUEGO_STANDALONE_PACKS,
    topupPer5Usd: { fuego: FUEGO_TOPUP_PER_5USD, firecrawl: FIRECRAWL_TOPUP_PER_5USD },
    coreCreditCosts: CORE_CREDIT_COSTS,
    premiumUnitCostUsd: PREMIUM_UNIT_COST_USD,
    premiumMarginFloor: MARGIN_FLOOR,
    worstCaseNetRevenuePerCredit: Number(lowestNetRevenuePerCredit().toFixed(8)),
  };
}
