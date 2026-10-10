# Release Checklist

> Two labels are gated here and must never be claimed early:
> **"fully Firecrawl compatible"** and **"profitable premium"**. Each gate lists its
> exit criteria and current state. Updated 2026-10-09.

## Gate A — "fully Firecrawl compatible"

| Criterion                                                              | State                                                                |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Pinned v2 contract: every core family callable with correct semantics  | ✅ VERIFIED                                                          |
| Official TS SDK (`@mendable/firecrawl-js`) unchanged                   | ✅ 8/8                                                               |
| Official Python SDK (`firecrawl-py`) unchanged                         | ✅ 4/4                                                               |
| MCP core tools callable (scrape/map/crawl/search + research)           | ✅ VERIFIED                                                          |
| Error envelope + status codes match upstream                           | ✅ VERIFIED                                                          |
| v1 adapters for legacy clients                                         | ✅ VERIFIED                                                          |
| v1 **and** v2 OpenAPI pinned + machine contract tests in CI            | ⛔ pending (Zod SSOT is the contract; no committed upstream OpenAPI) |
| Go/Java/Rust/Ruby/PHP/.NET SDK smoke harnesses                         | ⛔ pending                                                           |
| Diagnostics endpoints (token-usage, queue-status, keyless/eligibility) | ⛔ pending (low priority)                                            |

**Verdict:** "Firecrawl-compatible for the TS/Python SDKs + core REST/MCP" is **true and tested**.
The unqualified "fully compatible" label stays **blocked** until the OpenAPI contract tests + more SDK
harnesses land.

## Gate B — "profitable premium"

| Criterion                                                          | State                                                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| Premium priced against the worst-case lot, not Hobby retail        | ✅ `lowestNetRevenuePerCredit()`                                                      |
| Margin floor (≥50%) proven under adverse cost, every lot           | ✅ 20 property tests                                                                  |
| Deterministic preflight quote + firm max                           | ✅ `POST /v2/quote` (25/25 E2E)                                                       |
| Fail-closed on unbounded crawl/agent                               | ✅ `boundable:false` → 400                                                            |
| Reserve-before-work + hard spend ceiling + 402                     | ✅ LIVE (D1 ledger)                                                                   |
| Live metering of Fuego-exclusive ops uses the margin-safe credits  | ⛔ pre-GA flat defaults still billed (quote already margin-safe) — prospective change |
| Per-feature cost reconciled against **real provider invoices**     | ⛔ modeled P95 only; needs the measurement corpus                                     |
| Admin price-book UI + provider kill-switches + margin-floor alerts | ⛔ pending                                                                            |

**Verdict:** the margin math is **proven safe by construction + tests**; "profitable premium" as a
measured claim stays **blocked** until live-invoice reconciliation + the admin controls land.

## Prospective pricing change (no surprise to any live customer)

Moving live metering of the Fuego-exclusive premium ops to the margin-safe credits (browser-act,
ai-search, agent) is a **prospective** change — applied only with customer notice and preserved prepaid
value, per the product contract. There are no paying customers today (Stripe is test-mode/blocked), so
the change is low-risk, but the discipline is enforced regardless.

## Externally blocked (resume the moment the input arrives)

- **Stripe commerce** (subscriptions + one-time packs + webhook reconciliation): needs an `sk_test_`
  key. Only `sk_live_` is in the vault; wiring billing to it = real-charge risk → **do not**.
- **Custom domains + one-click Deploy button**: needs the `fuegol.ink` DNS zone on the account
  (currently does not resolve).
- **README brand art**: Replicate org is out of credit.

## Deploy discipline (every change)

1. Typecheck + unit/property tests (`@fuegol/contracts` + `@fuegol/engine`) green.
2. `wrangler deploy` via the global-key auth path (unset `CLOUDFLARE_API_TOKEN`; it 10000s for this
   account — use `CLOUDFLARE_API_KEY`+`CLOUDFLARE_EMAIL`+`CLOUDFLARE_ACCOUNT_ID`).
3. Prod E2E against the live Worker; assert the new behavior is live (sleep ~10s for edge propagation).
4. Real-browser check for web changes (`e2e/web/cdp-check.mjs`): render + 0 console/CSP errors.
5. Commit (conventional commits = the PR description, per the solo-builder doctrine).
