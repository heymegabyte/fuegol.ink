# Implementation Roadmap

Status key: ✅ done · 🟡 partial · ⛔ not started. "Pass 0" = the foundation shipped 2026-10-07.

## ✅ Pass 0 — Foundation (shipped + prod-verified)

- ✅ Pinned-source research (Firecrawl API @f9f2e3d, MCP @ec0f9de / v3.28.2 = 30 tools/28 listed, pricing, CF primitives)
- ✅ `@fuegol/contracts` — Zod SSOT for scrape/map/crawl/batch/search/extract/account/webhook + full `formats` + `ErrorCode` enum
- ✅ `@fuegol/engine` — SSRF guard (v4/v6/metadata/redirect + optional DoH), safe-fetch, readability extraction, HTML→Markdown, sitemap + robots discovery, cheapest-tier planner, Browser-Rendering client (dormant until bound)
- ✅ `@fuegol/api` — Hono Worker: `POST /v2/scrape`, `POST /v2/map`, account/concurrency, `/v1` adapters, honest 501 stubs, Firecrawl error envelopes. **Live: https://fuegol-api.manhattan.workers.dev**
- ✅ 13 engine tests green (SSRF, HTML→MD, live scrape + map); 15/15 prod E2E assertions green
- ✅ Docs: idea-ledger (360 ideas/108 selected), firecrawl-compatibility, product-surface-inventory, unit-economics, architecture-decisions, convergence-log, this roadmap

## 🟡 Increment 1 — Scrape completeness + custom domains
- ✅ **AI structured extraction (Workers AI)**: `scrape {type:"json"}` + async `POST /v2/extract` (ExtractCoordinator DO, schema/prompt-guided) — **10/10 E2E green**
- ✅ **Browser Rendering tier live** (`env.BROWSER` Quick Actions): JS-rendered scrape engages on waitFor/actions/mobile/stealth + near-empty-static escalation; cold-start retry; frontmatter stripped for parity. Verified against a JS SPA (quotes.toscrape.com/js → real quotes).
- ✅ **Screenshots → R2** live: `{type:"screenshot"}` captures a PNG, stores it in R2 (`fuegol-artifacts`), returns a servable `…/assets/screenshots/<uuid>.png` URL (verified valid PNG end-to-end). ⛔ remaining: browser-tier `{type:"json"}`, fullPage/quality options
- 🟡 `changeTracking` format (needs a stored prior-scrape index in R2/D1)
- ✅ Document parse (`/v2/parse` + `/parse/formats`): **PDF via `unpdf` (Workers-native)** + HTML/text → markdown, multipart or `{url}` — **12/12 E2E green**. ⛔ remaining: DOCX/XLSX/PPTX (no Workers-safe parser yet)
- ⛔ `changeTracking` format (needs a stored prior-scrape index in R2/D1)
- ⛔ Custom domains: `api.fuegol.ink`, route binding in wrangler (needs zone)

## 🟡 Increment 2 — Async crawl + batch (Durable Objects + Queues)
- ✅ `CrawlCoordinator` Durable Object: alarm-driven BFS frontier, robots-aware, include/exclude-path regex, per-origin delay, depth cap, cancellation (I/O-race-safe), page storage
- ✅ `POST /v2/crawl` + `GET /v2/crawl/:id` (paginated) + `DELETE /v2/crawl/:id` + `GET /v2/crawl/:id/errors` + `/crawl/active` — **live, 11/11 E2E green**
- ✅ MCP `firecrawl_crawl` + `firecrawl_check_crawl_status` wired via service binding to the crawl API
- ✅ `POST /v2/batch/scrape` (+ status/cancel/errors) — reuses the crawl DO with a fixed frontier + no discovery; invalid-URL filtering + `ignoreInvalidURLs`; **9/9 E2E green**
- v0 bounds: ≤100 pages/job, static tier. ⛔ Remaining: signed webhooks + retries, R2 result bundles for huge crawls, cross-DO active-crawl registry, visual site-link graph

## 🟡 Increment 3 — Search, research, monitoring
- ✅ Pluggable web-search provider adapter (**Exa** primary, **Tavily** fallback) behind `SEARCH_PROVIDER`; keys are Worker secrets
- ✅ `POST /v2/search` + MCP `firecrawl_search` — real results, optional per-result scraping — **8/8 E2E green**
- ⛔ sources (news/images) + categories (github/research/pdf/developer/gov); developer + gov + scholarly research adapters (authorized indexes only)
- Tenant Cloudflare AI Search indexing; semantic change monitors on Cron

## 🟡 Increment 4 — Remote MCP (mcp.fuegol.ink)
- ✅ Stateless Streamable-HTTP JSON-RPC server **live at https://fuegol-mcp.manhattan.workers.dev**
- ✅ `/v2/mcp` (full), `/v2/mcp-search` (search profile), `/mcp` alias; profile-scoped tool lists
- ✅ `firecrawl_scrape` + `firecrawl_map` are real working tools (call the engine); others advertised + honest-error
- ✅ 17/17 MCP protocol E2E green (initialize, tools/list, tools/call live scrape, SSRF, profile scoping, notifications)
- ⛔ OAuth discovery + bearer keys + scoped per-tool permissions; keyless 3-tool profile
- ⛔ Wire remaining tools as their increments land; migrate to Cloudflare `createMcpHandler` once its wiring is verified
- ⛔ MCP contract tests vs pinned upstream; tested with Claude Code + Codex

## 🟡 Increment 5 — Billing (Stripe) + credit ledger
- ✅ D1 key store (`POST /v2/keys`, SHA-256-hashed, plan→credits) + transactional usage ledger (`usage_events`); live balance + history via `/team/credit-usage[/historical]`; usage middleware records per-op credits (scrape 1 / map 1 / search 2 / extract 5 / parse 1 / crawl+batch 1) — **9/9 E2E green**
- ✅ Enforced credit ceilings (reserve-before-work → **402** on insufficient credits) + user-configurable hard spend limit (`POST/GET /v2/team/spend-limit`, migration 0002) — **E2E green**
- ⛔ Stripe Checkout subs (5 tiers), Customer Portal, usage meters + webhooks, per-page crawl reconciliation. **BLOCKED:** only a LIVE Stripe key (`sk_live_`) is available — deferred until a `sk_test_` key is provided; must not risk real charges per the build mandate.

## 🟡 Increment 6 — Website + dashboard
- ✅ Cinematic marketing site **live at https://fuegol-web.manhattan.workers.dev** (near-black / electric-cyan / amber-flame, fluid type, glass, grain, scroll-reveal, JSON-LD, reduced-motion a11y) with a **real in-browser live-scrape demo** + progressive-enhancement reveals (no-JS safe). Real-browser verified: 0 console errors, demo works, all sections render. Custom domain `fuegol.ink` pending zone.
- ✅ **Developer console live** at `/app/` on fuegol-web — real key issuance, **live credit balance** (decrements per call), spend-limit set/clear, a working **playground** (scrape/map/search/crawl with results + Get-code), and usage-history table. Real-browser verified: 0 console errors, full create-key→scrape→ledger flow works.
- ⛔ Richer **Angular dashboard** (`app.fuegol.ink`): jobs/crawl-graph/traces, invoices, MCP connections, orgs/teams (the static console covers the core today)
- `app.fuegol.ink` Angular dashboard: keys, jobs, crawls, usage, invoices, MCP connections, orgs/teams
- `docs.fuegol.ink` interactive docs + "Get code" (TS/Python/cURL)

## 🟡 Increment 7 — One-click deploy + SDKs + growth
- ✅ **Official SDK compatibility verified**: `@mendable/firecrawl-js@4.45.0` runs unchanged against fuegol (apiUrl + fuegol key) — **8/8** (scrape/map/search/crawl/startCrawl/status/batch/extract). Harness `e2e/sdk-compat/`.
- ⛔ Dependency-isolated standalone Worker for the Deploy-to-Cloudflare button; verify from a clean account
- ✅ Official **Python SDK** (`firecrawl-py@4.49.3`) compat verified — **4/4** (scrape/map/search/crawl)
- ⛔ CLI; migration guide; benchmark corpus
- 4 original generated README illustrations; benchmark corpus + published methodology

## Benchmarks (ongoing, feeds unit-economics.md)
- Corpus: static / JS-heavy / docs / e-commerce / blog / PDF / paginated / i18n / slow / error / auth fixtures
- Metrics: extraction coverage, markdown quality, P50/P95 latency, real CF cost/op, gross margin, cancel correctness
- Reproducible compatibility contract tests vs pinned upstream; regression test per fixed defect

## Convergence
Not converged — this is Pass 0. Declare convergence only when two consecutive full passes surface no
material gaps and all release-blocking tests pass (see convergence-log.md).
