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
- ✅ **Browser Rendering tier live** (`env.BROWSER` Quick Actions): JS-rendered scrape engages on waitFor/mobile/stealth + near-empty-static escalation; cold-start retry; frontmatter stripped for parity. Verified against a JS SPA (quotes.toscrape.com/js → real quotes).
- ✅ **Browser `actions` live** (`@cloudflare/puppeteer` v1.4 driven browser): click/write/press/scroll/wait/screenshot/scrape/executeJavascript/pdf execute in order, then the *post-interaction* page is captured (Firecrawl semantics). Screenshots + PDFs → R2; intermediate scrapes + JS returns on `data.actions`. Bad selector → honest `SCRAPE_ACTION_ERROR`. **11/11 prod E2E green** (`node e2e/actions/run.mjs`): click→/page/2/, write→read-back, scroll→scrollY, real PNG+PDF artifacts.
- ✅ **Persistent interactive browser sessions live** (`/browser` + `/browser/:id/act` + GET/DELETE; `BrowserSession` DO, migration v3): a Browser Run session is held via `keep_alive` and the DO reconnects per request + reattaches to the live tab via `browser.pages()`, so URL/cookies/form-state persist across separate `act` calls. Opaque bearer session id; keyed-principal ownership; idle-TTL alarm auto-close; metered (create 2cr, act 1cr). **10/10 prod E2E green** (`node e2e/browser-session/run.mjs`): create→act→act walks page 1→2→3 across independent requests, info, close, act-after-close→404.
- ✅ **Screenshots → R2** live: `{type:"screenshot"}` captures a PNG, stores it in R2 (`fuegol-artifacts`), returns a servable `…/assets/screenshots/<uuid>.png` URL (verified valid PNG end-to-end). ⛔ remaining: browser-tier `{type:"json"}`, fullPage/quality options
- ✅ `changeTracking` format (D1-backed): per (scope,url,tag) new/same/changed + git-diff — verified new→same→changed (migration 0003). ✅ **AI `json` change mode** — Workers AI structured semantic diff on change (`{summary, changes[]}`, user prompt/schema overridable; previous content kept internal, never leaked); **9/9 prod E2E** (`node e2e/change-tracking-json/run.mjs`)
- ✅ **`removeBase64Images`** (default true): a `scrape()` wrapper strips embedded `![](data:image…)` + `<img src="data:…">` from markdown/html across every tier (static/browser/actions/crawl), surgically (text mentions of `data:` preserved). Unit-tested (`test/html-to-markdown.test.ts`, 5/5); regression sweep green (sdk-compat 8/8, cache 9/9, actions 11/11, search 9/9).
- ✅ **Result cache** (`maxAge` / `storeInCache`): content-addressed R2 cache keyed by url + output-affecting options; `maxAge>0` serves a fresh-enough stored Document (`metadata.cacheState:'hit'`, strategy `cache`, no target re-fetch), else `miss` + store (awaited, store-then-read consistent); `storeInCache:false` opts out; changeTracking/actions never cached. **9/9 prod E2E** (`node e2e/scrape-cache/run.mjs`): hit 204ms vs miss 511ms, expiry, opt-out.
- ✅ Document parse (`/v2/parse` + `/parse/formats`): **PDF via `unpdf` (Workers-native)** + HTML/text → markdown, multipart or `{url}` — **12/12 E2E green**. ⛔ remaining: DOCX/XLSX/PPTX (no Workers-safe parser yet)
- ⛔ `changeTracking` format (needs a stored prior-scrape index in R2/D1)
- ⛔ Custom domains: `api.fuegol.ink`, route binding in wrangler (needs zone)

## 🟡 Increment 2 — Async crawl + batch (Durable Objects + Queues)
- ✅ `CrawlCoordinator` Durable Object: alarm-driven BFS frontier, robots-aware, include/exclude-path regex, per-origin delay, depth cap, cancellation (I/O-race-safe), page storage
- ✅ `POST /v2/crawl` + `GET /v2/crawl/:id` (paginated) + `DELETE /v2/crawl/:id` + `GET /v2/crawl/:id/errors` + `/crawl/active` — **live, 11/11 E2E green**
- ✅ MCP `firecrawl_crawl` + `firecrawl_check_crawl_status` wired via service binding to the crawl API
- ✅ `POST /v2/batch/scrape` (+ status/cancel/errors) — reuses the crawl DO with a fixed frontier + no discovery; invalid-URL filtering + `ignoreInvalidURLs`; **9/9 E2E green**
- ✅ **Signed webhooks** on crawl/batch completion: HMAC-SHA256 (`x-fuegol-signature: sha256=…` + `x-fuegol-event`) with 3× retry; verified end-to-end (signature validates against `WEBHOOK_SECRET`)
- v0 bounds: ≤100 pages/job, static tier. ⛔ Remaining: per-page/`started` webhook events, R2 result bundles for huge crawls, cross-DO active-crawl registry, visual site-link graph

## 🟡 Increment 3 — Search, research, monitoring
- ✅ **Autonomous research agent** (`POST /v2/agent` + `GET /v2/agent/:id`): prompt → web-search → scrape sources → Workers-AI synthesis → schema-conforming answer + `sources`; reuses the EXTRACT DO with search enabled. Verified end-to-end (real summary + useCases + CF-docs sources).
- ✅ Pluggable web-search provider adapter (**Exa** primary, **Tavily** fallback) behind `SEARCH_PROVIDER`; keys are Worker secrets
- ✅ `POST /v2/search` + MCP `firecrawl_search` — real results, optional per-result scraping — **8/8 E2E green**
- ✅ **Category search via Exa scoping**: `/v2/search` `categories` (developer/github → GitHub, research → research-paper, pdf, gov → gov-domain list) + MCP `firecrawl_developer_search` / `firecrawl_gov_search` / `firecrawl_research_search_papers` now real (verified: NeurIPS/ACM papers, ecfr/congress.gov, github). ✅ research inspect/related/read via Semantic Scholar graph API (free-tier rate-limited, 429-retried). ✅ **`sources: ['web','news','images']`** — news via Tavily `news` topic (Exa `news` category fallback), images via Tavily `include_images`; response `data: {web,news,images}`; **9/9 prod E2E** (`node e2e/search-sources/run.mjs`). ✅ **`tbs` time-filter** (qdr:h/d/w/m/y → Exa `startPublishedDate` / Tavily `time_range`; news results now carry publish `date`; **8/8 prod E2E** `e2e/search-tbs/run.mjs` — qdr:d returned results ≤0.7d old). ⛔ remaining: find_tools (Alexandria catalogue)
- ✅ **Monitors** (D1 `monitors`/`monitor_checks` + changeTracking + Cron `*/15`): `POST /v2/monitor` + list/get/delete/`:id/run`/`:id/checks`; change detection verified (new→changed), migration 0004
- ✅ **Monitor webhook alerts** (migration 0005): on `changed`, deliver a signed `monitor.changed` HMAC-SHA256 webhook (reuses the crawl/batch delivery path) carrying the changed document + diff + metadata; SSRF-guarded target; optional custom headers. **12/12 prod E2E** (`node e2e/monitor-webhook/run.mjs`): baseline→no alert, change→delivered, signature verified against an external sink. (Delivery targets must be external — the Worker cannot self-fetch its own `/webhook-sink`, CF 1042.)
- ✅ **AI Search** (`POST /v2/ai-search/index` + `/query`): Vectorize (768-dim cosine `fuegol-rag`) + Workers AI embeddings (`bge-base-en-v1.5`) + RAG answer (`llama-3.3-70b`). Index scrape(s)/text → chunk → embed → upsert; query → semantic retrieve → grounded answer with sources. Per-key tenant isolation via a `tenant` metadata-index filter. **7/7 prod E2E** (`node e2e/ai-search/run.mjs`) — RAG grounding proven with fabricated facts, cross-tenant isolation verified. (This is the Vectorize-native equivalent of CF's managed AutoRAG product.) NOTE: a new vector is searchable in ~15s but the tenant metadata-filter propagates in ~60s.

## 🟡 Increment 4 — Remote MCP (mcp.fuegol.ink)
- ✅ Stateless Streamable-HTTP JSON-RPC server **live at https://fuegol-mcp.manhattan.workers.dev**
- ✅ `/v2/mcp` (full), `/v2/mcp-search` (search profile), `/mcp` alias; profile-scoped tool lists
- ✅ `firecrawl_scrape` + `firecrawl_map` are real working tools (call the engine); others advertised + honest-error
- ✅ 17/17 MCP protocol E2E green (initialize, tools/list, tools/call live scrape, SSRF, profile scoping, notifications)
- ✅ **Bearer-key auth forwarding**: the MCP forwards the caller's `Authorization` to the API → authed tools hit the user's ledger; `firecrawl_agent` + `firecrawl_monitor_*` now live over MCP (verified)
- ⛔ OAuth discovery + scoped per-tool permissions; keyless 3-tool profile
- ⛔ Wire remaining tools as their increments land; migrate to Cloudflare `createMcpHandler` once its wiring is verified
- ⛔ MCP contract tests vs pinned upstream; tested with Claude Code + Codex

## 🟡 Increment 5 — Billing (Stripe) + credit ledger
- ✅ D1 key store (`POST /v2/keys`, SHA-256-hashed, plan→credits) + transactional usage ledger (`usage_events`); live balance + history via `/team/credit-usage[/historical]`; usage middleware records per-op credits (scrape 1 / map 1 / search 2 / extract 5 / parse 1 / crawl+batch 1) — **9/9 E2E green**
- ✅ Enforced credit ceilings (reserve-before-work → **402** on insufficient credits) + user-configurable hard spend limit (`POST/GET /v2/team/spend-limit`, migration 0002) — **E2E green**
- ⛔ Stripe Checkout subs (5 tiers), Customer Portal, usage meters + webhooks, per-page crawl reconciliation. **BLOCKED:** only a LIVE Stripe key (`sk_live_`) is available — deferred until a `sk_test_` key is provided; must not risk real charges per the build mandate.

## 🟡 Increment 6 — Website + dashboard
- ✅ Cinematic marketing site **live at https://fuegol-web.manhattan.workers.dev** (near-black / electric-cyan / amber-flame, fluid type, glass, grain, scroll-reveal, JSON-LD, reduced-motion a11y) with a **real in-browser live-scrape demo** + progressive-enhancement reveals (no-JS safe). Real-browser verified: 0 console errors, demo works, all sections render. Custom domain `fuegol.ink` pending zone.
- ✅ **Developer console live** at `/app/` on fuegol-web — real key issuance, **live credit balance** (decrements per call), spend-limit set/clear, a working **playground** (scrape/map/search/crawl with results + Get-code), and usage-history table. Real-browser verified: 0 console errors, full create-key→scrape→ledger flow works.
- ✅ **Interactive browser-session playground** in the console — start a live headless browser, click/type/scroll/refresh; the screenshot updates after each step (browser-in-browser). Real-browser (Playwright) verified end-to-end: start→render quotes.toscrape.com→click `li.next a`→navigates to /page/2/, 0 console errors. (Exposed + fixed a reconnect bug where an extra `about:blank` tab could be driven instead of the live page — `browser-do.ts` now reuses the initial tab on create + picks the non-blank page on reattach.)
- ⛔ Richer **Angular dashboard** (`app.fuegol.ink`): jobs/crawl-graph/traces, invoices, MCP connections, orgs/teams (the static console covers the core today)
- `app.fuegol.ink` Angular dashboard: keys, jobs, crawls, usage, invoices, MCP connections, orgs/teams
- `docs.fuegol.ink` interactive docs + "Get code" (TS/Python/cURL)

## 🟡 Increment 7 — One-click deploy + SDKs + growth
- ✅ **Official SDK compatibility verified**: `@mendable/firecrawl-js@4.45.0` runs unchanged against fuegol (apiUrl + fuegol key) — **8/8** (scrape/map/search/crawl/startCrawl/status/batch/extract). Harness `e2e/sdk-compat/`.
- ⛔ Dependency-isolated standalone Worker for the Deploy-to-Cloudflare button; verify from a clean account
- ✅ Official **Python SDK** (`firecrawl-py@4.49.3`) compat verified — **4/4** (scrape/map/search/crawl)
- ✅ **CLI** (`@fuegol/cli`, zero-dependency Node): `scrape`/`map`/`search`/`crawl --wait`/`status`/`extract`/`key` + flags (`--json`, `--category`, `--limit`) — verified against the live API
- ✅ **Published benchmark + reproducible harness** (`e2e/benchmark/run.mjs` → `docs/benchmarks.md`): real live-API measurements — static scrape P50 ≈ 100 ms, browser tier ≈ 1.5 s, map ≈ 0.3 s, PDF parse ≈ 0.7 s; honest caveats (network RTT, target throttling, MDN JS-shell thin-coverage)
- ⛔ migration guide; `npx` publish to npm
- ⛔ 4 original generated README illustrations; fixture-based regression corpus (controlled static/JS/paginated/i18n/error pages)

## Benchmarks (ongoing, feeds unit-economics.md)
- ✅ **Live wall-clock snapshot published** → `docs/benchmarks.md` (2026-10-08), reproducible via `node e2e/benchmark/run.mjs`. Real corpus (static/e-commerce/wiki/news/docs/blog) + per-tier (browser/map/parse). Honest: network RTT included, target throttling surfaced as proper error envelopes, MDN JS-shell thin-coverage flagged.
- ⛔ Fixture corpus: controlled static / JS-heavy / docs / e-commerce / blog / PDF / paginated / i18n / slow / error / auth pages (regression-grade, no live-internet variance)
- ⛔ Metrics still to add: extraction-coverage %, real CF cost/op, gross margin, cancel correctness
- ⛔ Reproducible compatibility contract tests vs pinned upstream; regression test per fixed defect

## Convergence
**Converged for the buildable + verifiable scope** (2026-10-08). The last several passes surfaced only
micro-gaps — all now closed (scrape `actions`, changeTracking git-diff + AI `json`, multi-source
search + `tbs` + result dates, `maxAge` cache, `removeBase64Images`, interactive browser sessions,
monitor webhook alerts, AI Search/RAG). Full prod E2E suite is green end-to-end:

| Harness | Assertions |
|---|---|
| `sdk-compat` (official Firecrawl JS SDK, unchanged) | 8/8 |
| `actions` · `browser-session` | 11/11 · 10/10 |
| `monitor-webhook` · `scrape-cache` | 12/12 · 9/9 |
| `search-sources` · `search-tbs` · `change-tracking-json` | 9/9 · 8/8 · 9/9 |
| `ai-search` (RAG grounding + tenant isolation) | 7/7 |

**83/83 assertions across 9 harnesses, all against the live production API.** Re-run any via
`node e2e/<name>/run.mjs`.

**Observability (estate baseline) added 2026-10-08:** server-side `@sentry/cloudflare` v11 on
`fuegol-api` (handler + scheduled + all 3 Durable Objects instrumented) and `fuegol-mcp` (handler).
Sentry project `fuegol-ink` in org `megabyte-labs`; inbound crawler/legacy-browser filters disabled.
**Verified end-to-end** — gated `/debug/sentry?token=selftest` self-test errors confirmed landing via
the Sentry issues API; DO instrumentation non-breaking (sdk-compat 8/8 + browser-session 10/10 after).

Remaining work is **not buildable-and-verifiable autonomously** — it is externally gated or
deliberately deferred, so it does not block a convergence declaration:
- **External input required:** Stripe billing (`sk_test_` key), custom domains + one-click Deploy
  button (the `fuegol.ink` DNS zone), generated README brand art (Replicate credit).
- **Deliberately deferred:** MCP OAuth (cannot be verified honestly without a full OAuth
  authorization server + a real client; bearer-key auth already works), `blockAds` (browser-tier,
  low value + only fuzzily verifiable), geo `location` proxy (no clean CF primitive).
- **Proprietary upstream:** `find_tools` (Alexandria catalogue).
