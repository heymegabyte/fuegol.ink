# Research & Decisions

> The convergence decision log + the ranked idea ledger. Each decision states the call,
> the reasoning, and the strongest counter-argument considered. Dates are absolute.
> Detailed pass-by-pass history: [`convergence-log.md`](./convergence-log.md).

## Decisions — pricing & margin pass (2026-10-09)

1. **Pricing basis = half of Firecrawl's _month-to-month_, not annual.**
   The repo previously advertised $8/$42/$167/$300 (half of Firecrawl's _annual_ headline) and even
   labeled the comparison "billed annually vs Firecrawl's annual-billed" — the exact mis-comparison to
   avoid. Corrected to **$9.50/$49.50/$199.50/$374.50** (half of $19/$99/$399/$749). The calculator
   shows both bases so "50% less" is always qualified.
   _Counter:_ half-of-annual gives lower sticker prices (better optics). _Rejected:_ it's a false
   like-for-like (monthly plan vs annual commitment) and it leaves margin on the table; the brief is
   explicit. Higher prices also widen the premium margin.

2. **Core ops bill at Firecrawl parity; only Fuego-exclusive premium ops are margin-floored.**
   Compatibility is a hard contract, so scrape/crawl/map/search/extract/parse/batch keep identical
   credit burn. Browser sessions, AI search, agent, OCR, stealth are Fuego-exclusive and priced to a
   margin floor. This is the clean principled line that satisfies both compatibility and sustainability.
   _Counter:_ margin-floor everything for max safety. _Rejected:_ it would break Firecrawl credit-burn
   expectations on core ops — a compatibility violation.

3. **Premium credits are computed against the worst-case (deepest-discount) lot.**
   `lowestNetRevenuePerCredit()` = the Scale subscription (~$0.000363 net/credit after Stripe fee). A
   premium charge that clears the floor here clears it for every lot. Proven by 20 property tests under
   a 1.5× adverse-cost spike.
   _Counter:_ price against the Hobby retail rate (simpler, higher headline margin). _Rejected:_ it lets
   Scale/bulk buyers arbitrage premium at a loss — the precise failure the brief forbids.

4. **The quote fails closed on unbounded jobs.**
   An unbounded crawl (no page limit) or agent (no `maxCredits`) returns `boundable:false` → HTTP 400
   with an actionable message. Fuego never quotes — or runs — an unbounded-cost job.

5. **Live metering keeps pre-GA flat premium defaults for now (quote is already margin-safe).**
   Changing billed credits on the Fuego-exclusive ops is a _prospective_ pricing change; it's deferred
   to GA with notice, even though there are no live customers, to keep the discipline. The quote surfaces
   the margin-safe numbers today so the website + clients see honest pricing.

6. **Stripe stays gated — no live-account mutation.**
   The Stripe MCP is bound to the real "Megabyte Labs" account and only `sk_live_` is in the vault.
   Building billing against it (or creating catalog objects in the live account) risks real charges /
   catalog pollution. The billing _design_ is documented; implementation resumes the instant an
   `sk_test_` key exists. _Counter:_ build it behind a flag anyway. _Partially accepted:_ design + ledger
   lots are specced, but no inert "fake" Stripe UI ships (the brief forbids fake feature cards).

## Idea ledger — 30 researched ideas, ranked, with honest status

Status: **SHIPPED** (this pass) · **NEXT** (buildable, no external blocker) · **GATED** (needs an
external input). The "top ~30%" that were highest impact × feasible × compatible shipped this pass.

### Pricing / conversion / economics

1. Preflight `/v2/quote` with firm max + fail-closed — **SHIPPED**
2. Public `/v2/pricing` price book as the website SSOT — **SHIPPED**
3. Savings calculator (month-to-month vs annual toggle, dated) — **SHIPPED**
4. Price-before-you-crawl estimator wired to the live quote — **SHIPPED**
5. Margin-floor model + 20 property tests, gated in CI — **SHIPPED**
6. One-time credit-pack catalog (no subscription) in the SSOT — **SHIPPED** (data; checkout is GATED)
7. Move live premium metering to margin-safe credits (prospective) — **NEXT**
8. Admin price-book UI + provider kill-switch + margin alerts — **NEXT**
9. Per-feature cost reconciliation vs real provider invoices — **NEXT** (needs measurement corpus)
10. Top-up-on-low-balance with opt-in + 50/80/100% notifications — **GATED** (Stripe)

### Compatibility / SDK / MCP

11. Fix stale site compat claims (agent/monitor/interact were "planned") — **SHIPPED**
12. Remove dead shadowed `/browser` 501 stub — **SHIPPED**
13. Migration assistant: TS/Python/cURL before-after tabs — **SHIPPED**
14. v1 **and** v2 OpenAPI pinned + machine contract tests in CI — **NEXT**
15. Go/Ruby/PHP/.NET/Java SDK smoke harnesses — **NEXT**
16. `crawl/active` cross-DO registry (currently empty) — **NEXT**
17. MCP OAuth + resource metadata for the hosted server — **NEXT**
18. Guided migration checker that replays a customer's own calls — **NEXT**

### Engine / product surface

19. `crawl/params-preview` (prompt→params via Workers AI) — **NEXT**
20. Screenshot diff + narrated change explainer (premium) — **NEXT**
21. Recorded browser-session replay (premium video) — **NEXT**
22. Scheduled dataset exports + webhooks (enterprise) — **NEXT**
23. `blockAds` / geo-`location` scrape options — **NEXT** (low value / no clean CF primitive)
24. Zero-retention private sessions (verified) — **NEXT**

### Growth / web / trust

25. Hero rewrite to "Your Firecrawl code. Half the core API cost." + honest CTAs — **SHIPPED**
26. Per-SDK quickstart + `llms.txt` + agent `SKILL.md` — **NEXT** (llms.txt exists; expand)
27. Use-case SEO pages (Firecrawl alternative, RAG, price-monitoring) — **NEXT**
28. PostHog funnel + A/B on the calculator/estimator CTAs — **NEXT**
29. Status page + public uptime — **NEXT**
30. Custom domains (api/app/mcp/docs.fuegol.ink) + Deploy-to-CF button — **GATED** (DNS zone)

## Convergence state

The buildable-without-external-input scope is converged for this pass: the two highest-leverage
unblocked clusters (preflight pricing/quote + conversion surfaces + honesty fixes) shipped and are
prod-verified. The remaining high-value work is concentrated behind two external inputs — a Stripe
`sk_test_` key and the `fuegol.ink` DNS zone — plus a measurement corpus for invoice-grade margins.
