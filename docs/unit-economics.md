# Unit Economics

> Goal: price the managed edition at ≈**50% of Firecrawl's annual-billed plans** while holding a
> positive gross margin on routine workloads. Targets are a ceiling, not a mandate to run at a loss.

## Competitor anchor (Firecrawl, retrieved 2026-10-07)

Firecrawl's pricing cards show **annual-billed, monthly-equivalent** prices. That is our anchor.

| Firecrawl plan | Monthly credits | Annual-billed (mo-equiv) | Monthly-billed | **fuegol target (≈50%)** |
|---|---:|---:|---:|---:|
| Free | 1,000 | $0 | $0 | **$0** (≥1,000 credits) |
| Hobby | 5,000 | $16 | $19 | **$8/mo** |
| Standard | 100,000 | $83 | $99 | **$42/mo** |
| Growth | 500,000 | $333 | $399 | **$167/mo** |
| Scale | 1,000,000 | $599 | $749 | **$300/mo** |
| Enterprise | custom | custom | custom | custom |

Credit model (Firecrawl, mirrored for compatibility): scrape **1/page**, crawl **1/page**, map **1/call**,
search **2 / 10 results**, JSON/LLM-extraction **+4/page** (=5), PDF parse **+1/page**, browser interact
**2–7 / browser-minute**. Failed requests that return no document = **0 credits**.

## fuegol cost drivers (Cloudflare)

| Driver | Cost basis | Notes |
|---|---|---|
| Workers requests | $0.30 / million (after 10M free) + $0.02/M CPU-ms | The static scrape/map tier is **almost entirely here** → sub-cent per op. |
| Browser Rendering | billed browser-seconds (Workers Paid) | Only on JS-escalation; the planner avoids it whenever static suffices. |
| `/crawl` `render:false` | **free during beta** → Workers pricing after | Our breadth-crawl path; never assume it stays free. |
| Workers AI | per-neuron / per-token | Only for `{type:"json"}` extraction + summaries; route via AI Gateway for caching. |
| R2 | $0.015/GB-mo, **$0 egress** | Crawl artifacts, screenshots, result bundles. |
| D1 | generous free tier, then per-row | Keys, credit ledger, job metadata. |
| Queues | $0.40 / million operations | Async crawl/batch fan-out. |
| Stripe | 2.9% + $0.30 (card) / 2.6%+30¢ IBP | Modeled into margin; usage-based overages reconciled off the internal ledger. |

## Margin thesis

- **Static tier (the common case): near-zero marginal cost.** A scrape/map served by `fetch` +
  in-Worker extraction is a handful of Workers requests + CPU-ms — fractions of a cent. At the
  $42/mo Standard-equivalent (100k credits), even pricing a credit at Firecrawl parity leaves a
  wide margin because most pages never touch the browser.
- **Browser tier: the cost center.** JS-rendered pages, screenshots, and stealth proxy consume
  browser-seconds. The planner's job is to keep this to the minimum of pages that truly need it,
  and credits for these must cover browser-second cost + headroom.
- **AI extraction: metered pass-through + margin.** `{type:"json"}` uses Workers AI; priced to
  cover neurons/tokens with AI Gateway cache cutting repeat cost.

## Margin-protection rules (enforced by the credit ledger — planned)

1. **Reserve-before-expensive-work:** debit an estimate before a crawl/browser job; reconcile after.
2. **Hard spend ceilings:** user-configurable monthly cap; refuse (402) past it.
3. **Fair billing:** cached hits and no-document failures bill 0; retries are idempotent (no double charge).
4. **Per-job estimate:** return a credit estimate before executing a crawl.
5. **Measure, don't guess:** replayable benchmark jobs (see docs/implementation-roadmap.md §benchmarks)
   produce real P50/P95 cost per operation type; this table is updated from measurements each pass.

## Open economics questions (to resolve before GA pricing)

- Real browser-second cost per JS-heavy page at our proxy mix (needs the benchmark corpus).
- Firecrawl's **stealth** credit cost is unconfirmed on the official billing page (third-party = 5/page) —
  verify against a live dashboard before pricing our stealth tier.
- Whether `/crawl render:false` stays free; model the post-beta Workers-pricing case now.
