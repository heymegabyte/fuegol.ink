# Unit Economics

> Goal: price the managed edition at ≈**50% of Firecrawl's annual-billed plans** while holding a
> positive gross margin on routine workloads. Targets are a ceiling, not a mandate to run at a loss.

## Competitor anchor (Firecrawl, re-verified 2026-10-09)

Firecrawl's pricing cards default to **annual-billed** monthly-equivalent prices, but they also sell
**month-to-month**. The headline **"50% less on comparable core API plans"** is measured against the
**month-to-month** price — the apples-to-apples basis for a monthly fuego plan. The annual figures are
shown alongside so the comparison is never misleading. fuego seeds each monthly plan at **exactly half
of Firecrawl's month-to-month price**, like-for-like credits (SSOT: `packages/contracts/src/pricing.ts`).

| Firecrawl plan | Monthly credits | Month-to-month | Annual (mo-equiv) | **fuego (½ of m2m)** |
| -------------- | --------------: | -------------: | ----------------: | -------------------: |
| Free           |           1,000 |             $0 |                $0 |    **$0** (1,000 cr) |
| Hobby          |           5,000 |            $19 |               $16 |            **$9.50** |
| Standard       |         100,000 |            $99 |               $83 |           **$49.50** |
| Growth         |         500,000 |           $399 |              $333 |          **$199.50** |
| Scale          |       1,000,000 |           $749 |              $599 |          **$374.50** |
| Enterprise     |          custom |         custom |            custom |               custom |

Even against Firecrawl's **annual** headline, fuego is cheaper (e.g. $9.50 vs $16 = 41% less).
**One-time credit packs** (no subscription): $5→2,000 · $10→4,500 · $25→12,000 · $50→26,000 ·
$100→55,000 · $250→145,000 · $500→300,000. Subscriber $5 top-ups give 2× the competitor's credits.

Credit model (Firecrawl, mirrored for compatibility): scrape **1/page**, crawl **1/page**, map **1/call**,
search **2 / 10 results**, JSON/LLM-extraction **+4/page** (=5), PDF parse **+1/page**, browser interact
**2–7 / browser-minute**. Failed requests that return no document = **0 credits**.

## fuegol cost drivers (Cloudflare)

| Driver                  | Cost basis                                        | Notes                                                                              |
| ----------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Workers requests        | $0.30 / million (after 10M free) + $0.02/M CPU-ms | The static scrape/map tier is **almost entirely here** → sub-cent per op.          |
| Browser Rendering       | billed browser-seconds (Workers Paid)             | Only on JS-escalation; the planner avoids it whenever static suffices.             |
| `/crawl` `render:false` | **free during beta** → Workers pricing after      | Our breadth-crawl path; never assume it stays free.                                |
| Workers AI              | per-neuron / per-token                            | Only for `{type:"json"}` extraction + summaries; route via AI Gateway for caching. |
| R2                      | $0.015/GB-mo, **$0 egress**                       | Crawl artifacts, screenshots, result bundles.                                      |
| D1                      | generous free tier, then per-row                  | Keys, credit ledger, job metadata.                                                 |
| Queues                  | $0.40 / million operations                        | Async crawl/batch fan-out.                                                         |
| Stripe                  | 2.9% + $0.30 (card) / 2.6%+30¢ IBP                | Modeled into margin; usage-based overages reconciled off the internal ledger.      |

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

## Margin-protection rules (enforced by the credit ledger)

1. **Reserve-before-expensive-work — LIVE:** the `/v2/*` middleware checks `effectiveCap − used ≥ cost`
   before the work and returns **402** on insufficient credits; usage is recorded after success only.
2. **Hard spend ceilings — LIVE:** user-configurable cap via `POST /v2/team/spend-limit`; effective
   cap = `min(plan, spendLimit)`; refuse (402) past it.
3. **Fair billing — LIVE:** cached hits and no-document failures bill 0; a request records usage only
   on a 2xx/3xx response.
4. **Per-job estimate — LIVE:** `POST /v2/quote` returns a deterministic credit + USD estimate, a firm
   max, and **fails closed** (`boundable:false`) on an unbounded crawl/agent. See the premium model below.
5. **Measure, don't guess:** replayable benchmark jobs (see docs/implementation-roadmap.md §benchmarks)
   produce real P50/P95 cost per operation type; the premium table below is updated from measurements each pass.

## Premium margin model (verified 2026-10-09)

Fuego-exclusive premium ops (interactive browser, AI search/RAG, agent, OCR, stealth) are **not**
half-price loss leaders. They are priced to clear a **≥50% contribution-margin floor** against the
**worst-case (deepest-discount) credit lot** — never the Hobby retail rate — so a Scale or bulk-pack
buyer cannot arbitrage premium work at a loss.

- **Provider cost anchor:** Cloudflare Browser Rendering = **$0.09 / browser-hour** (REST/Quick
  Actions, duration only; 10 free hrs/mo on Workers Paid). Sessions add $2 / concurrent browser.
  Workers AI per-neuron/token (via AI Gateway cache). R2 $0.015/GB-mo, $0 egress.
- **Worst-case lot:** the Scale subscription — $374.50 / 1,000,000 credits, **net ≈ $0.000363/credit**
  after an amortized Stripe fee (2.9% + $0.30). This is `lowestNetRevenuePerCredit()`.
- **Formula:** `credits = ceil( costUsd × risk / (1 − floor) / worstRate )` with `floor = 0.5`,
  `risk = 1.5` (adverse-cost headroom). Proven by 20 property tests in `packages/contracts/test/pricing.test.ts`:
  margin ≥ floor at **every** lot even under the full adverse-cost spike.

| Premium unit             | Modeled cost (P95) | Margin-safe credits | Notes                         |
| ------------------------ | -----------------: | ------------------: | ----------------------------- |
| Browser render / page    |             $0.001 |                  ~9 | JS render + cold-start buffer |
| Interactive browser /min |             $0.003 |                 ~25 | per wall-clock minute         |
| AI extraction / page     |             $0.002 |                 ~17 | Workers AI structured JSON    |
| AI search index / doc    |            $0.0015 |                 ~13 | embed + upsert                |
| AI search query          |             $0.003 |                 ~25 | embed + grounded answer       |
| Agent run (bounded)      |              $0.02 |                ~166 | cap required                  |
| OCR / page               |             $0.004 |                 ~33 | scanned-doc layout            |
| Stealth proxy / page     |             $0.005 |                 ~42 | premium/stealth egress        |

> Pre-GA, live metering of the Fuego-exclusive ops still bills the earlier flat defaults (browser
> act 1, ai-search query 2, etc.); these are **below** the margin-safe floor for deep-discount lots.
> `/v2/quote` already returns the margin-safe numbers, and moving live metering to them is a tracked,
> prospective change (see `docs/RELEASE_CHECKLIST.md`) — never a silent rate hike on a live customer.

## Open economics questions (to resolve before GA pricing)

- Real browser-second cost per JS-heavy page at our proxy mix (needs the benchmark corpus).
- Firecrawl's **stealth** credit cost is unconfirmed on the official billing page (third-party = 5/page) —
  verify against a live dashboard before pricing our stealth tier.
- Whether `/crawl render:false` stays free; model the post-beta Workers-pricing case now.
