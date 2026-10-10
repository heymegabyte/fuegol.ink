import { describe, it, expect } from 'vitest';
import {
  FUEGO_PLANS,
  FIRECRAWL_PLANS,
  FUEGO_STANDALONE_PACKS,
  PREMIUM_UNIT_COST_USD,
  MARGIN_FLOOR,
  RISK_MULTIPLIER,
  stripeFeeUsd,
  netRevenuePerCredit,
  lowestNetRevenuePerCredit,
  marginSafeCredits,
  premiumCredits,
  realizedMargin,
  computeQuote,
  pricingBook,
  type PremiumUnit,
} from '../src/pricing';

const EPS = 1e-9;

/** Every paid lot's net $/credit — the full set premium pricing must survive. */
function allLotRates(): { label: string; rate: number }[] {
  const out: { label: string; rate: number }[] = [];
  for (const p of Object.values(FUEGO_PLANS)) {
    if (p.priceMonthly && p.credits)
      out.push({ label: p.label, rate: netRevenuePerCredit(p.priceMonthly, p.credits) });
  }
  for (const pack of FUEGO_STANDALONE_PACKS) {
    out.push({ label: `$${pack.usd} pack`, rate: netRevenuePerCredit(pack.usd, pack.credits) });
  }
  return out;
}

describe('core pricing is exactly half of Firecrawl month-to-month', () => {
  for (const key of ['hobby', 'standard', 'growth', 'scale'] as const) {
    it(`${key}: price is 50% of Firecrawl, credits identical`, () => {
      const f = FIRECRAWL_PLANS[key];
      const u = FUEGO_PLANS[key];
      expect(u.priceMonthly).toBeCloseTo(f.monthly / 2, 6);
      expect(u.credits).toBe(f.credits);
    });
  }

  it('subscriber $5 top-ups give at least double the competitor credits', () => {
    const book = pricingBook();
    for (const tier of ['hobby', 'standard', 'growth', 'scale'] as const) {
      expect(book.topupPer5Usd.fuego[tier]).toBeGreaterThanOrEqual(
        book.topupPer5Usd.firecrawl[tier] * 2,
      );
    }
  });
});

describe('worst-case lot basis', () => {
  it('lowest net revenue per credit is the Scale subscription (deepest discount)', () => {
    const scale = netRevenuePerCredit(FUEGO_PLANS.scale.priceMonthly!, FUEGO_PLANS.scale.credits!);
    expect(lowestNetRevenuePerCredit()).toBeCloseTo(scale, 10);
    // and it is genuinely the minimum across every other paid lot
    for (const { rate } of allLotRates()) expect(rate).toBeGreaterThanOrEqual(scale - EPS);
  });

  it('free / promotional credits never lower the worst case (they fund nothing)', () => {
    expect(netRevenuePerCredit(0, 1_000)).toBe(Infinity);
    expect(FUEGO_PLANS.free.priceMonthly).toBe(0);
  });

  it('stripe fee is the conservative 2.9% + $0.30', () => {
    expect(stripeFeeUsd(100)).toBeCloseTo(3.2, 6);
  });
});

describe('MARGIN INVARIANT — premium pricing never loses money at any lot', () => {
  // The central §5 property: charging marginSafeCredits for a unit yields margin ≥ the
  // floor even (a) at the deepest-discount lot and (b) under the full adverse-cost spike.
  const synthetic = Array.from({ length: 200 }, (_, i) => 0.0001 + i * 0.0005); // $0.0001 … ~$0.10
  const realUnits = Object.values(PREMIUM_UNIT_COST_USD);
  const costs = [...synthetic, ...realUnits];

  it('≥ floor margin under adverse cost at the WORST lot, for every cost', () => {
    const worst = lowestNetRevenuePerCredit();
    for (const nominal of costs) {
      const credits = marginSafeCredits(nominal);
      const adverse = nominal * RISK_MULTIPLIER; // provider cost spikes to the modeled ceiling
      expect(realizedMargin(credits, adverse, worst)).toBeGreaterThanOrEqual(MARGIN_FLOOR - EPS);
    }
  });

  it('≥ floor margin at EVERY lot (not just the worst)', () => {
    for (const nominal of realUnits) {
      const credits = marginSafeCredits(nominal);
      const adverse = nominal * RISK_MULTIPLIER;
      for (const { label, rate } of allLotRates()) {
        const m = realizedMargin(credits, adverse, rate);
        expect(m, `${label} @ cost ${nominal}`).toBeGreaterThanOrEqual(MARGIN_FLOOR - EPS);
      }
    }
  });

  it('at nominal (non-adverse) cost, margin clears the floor with headroom', () => {
    const worst = lowestNetRevenuePerCredit();
    for (const nominal of realUnits) {
      const credits = marginSafeCredits(nominal);
      expect(realizedMargin(credits, nominal, worst)).toBeGreaterThanOrEqual(MARGIN_FLOOR);
    }
  });

  it('every premium unit charges at least 1 credit', () => {
    for (const unit of Object.keys(PREMIUM_UNIT_COST_USD) as PremiumUnit[]) {
      expect(premiumCredits(unit)).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('preflight quote', () => {
  it('is deterministic — same input, same output', () => {
    const req = { operation: 'crawl' as const, pages: 250, formats: ['markdown', 'json'] };
    expect(JSON.stringify(computeQuote(req))).toBe(JSON.stringify(computeQuote(req)));
  });

  it('plain scrape bills Firecrawl-identical core credits', () => {
    const q = computeQuote({ operation: 'scrape', pages: 100 });
    expect(q.credits).toBe(100);
    expect(q.comparedToFirecrawl.credits).toBe(100); // same burn as Firecrawl
    expect(q.boundable).toBe(true);
  });

  it('advanced JSON format adds the +4/page surcharge, still at Firecrawl parity', () => {
    const q = computeQuote({ operation: 'scrape', pages: 100, formats: ['json'] });
    expect(q.credits).toBe(500); // 100 base + 400 advanced
    expect(q.comparedToFirecrawl.credits).toBe(500);
  });

  it('fails closed on an unbounded crawl (no page limit)', () => {
    const q = computeQuote({ operation: 'crawl' });
    expect(q.boundable).toBe(false);
    expect(q.disclaimer).toMatch(/page limit/i);
  });

  it('fails closed on an agent run without a maxCredits cap', () => {
    const q = computeQuote({ operation: 'agent' });
    expect(q.boundable).toBe(false);
    const ok = computeQuote({ operation: 'agent', maxCredits: 500 });
    expect(ok.boundable).toBe(true);
  });

  it('crawl range admits up to +50% for page discovery but never exceeds maxCredits', () => {
    const q = computeQuote({ operation: 'crawl', pages: 100, maxCredits: 120 });
    expect(q.creditsRange.min).toBe(100);
    expect(q.creditsRange.max).toBeLessThanOrEqual(120);
  });

  it('prices the USD readout against the selected lot', () => {
    const q = computeQuote({ operation: 'scrape', pages: 1000, lot: 'standard' });
    expect(q.usd.lot).toBe('Standard');
    expect(q.usd.perCredit).toBeCloseTo(49.5 / 100_000, 10);
  });

  it('a Fuego-exclusive premium op is not a Firecrawl parity SKU', () => {
    const q = computeQuote({ operation: 'ai_search_query' });
    expect(q.comparedToFirecrawl.credits).toBe(0);
    expect(q.credits).toBeGreaterThan(0);
  });
});
