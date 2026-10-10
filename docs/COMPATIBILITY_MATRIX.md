# Firecrawl Compatibility Matrix

> The honest, top-level status of the drop-in-compatibility contract. Statuses are
> **VERIFIED** (tested against a live client/SDK), **PARTIAL** (works, with a documented
> gap), **NOT IMPLEMENTED** (contracted upstream, not served — honest 501), or
> **N/A** (not applicable to this edition). Detailed evidence + the full field-by-field
> enumeration live in [`firecrawl-compatibility.md`](./firecrawl-compatibility.md).

**Pinned upstream** (re-verify on change): REST `firecrawl/firecrawl@f9f2e3d` · MCP
`firecrawl-mcp-server@ec0f9de` (npm `firecrawl-mcp@3.28.2`, 30 registered / 28 listed) ·
pricing `firecrawl.dev/pricing` — all re-verified **2026-10-09**.

## Machine contract tests (pinned OpenAPI)

The official **v2 + v1 OpenAPI** are now pinned byte-exact in `packages/contracts/upstream/`
(sha256 in `MANIFEST.json`, retrieved 2026-10-10): **v2** = 45 paths / **57 operations** / 67
schemas; **v1** = 21 paths / **23 operations**. A dependency-free OpenAPI-3.0 validator
(`e2e/contract/run.mjs`) does two things against the **live** API:

- **Coverage** (routed vs not, method-aware live probe): **v2 28/57** · **v1 2/23** operations SERVED.
  The unserved v2 ops are out-of-scope (`/support/*`, `/team/threat-protection`), Fuego-namespaced
  under different paths (upstream `/interact/*` → Fuego `/v2/browser`; `/search/developer|gov|research`
  → Fuego MCP tools + `/v2/search` categories), or low-priority (`/scrape/{jobId}` async, `/feedback`,
  agent list/trace/snapshots, monitor PATCH). **v1 is intentionally thin** (only `/v1/scrape` +
  `/v1/map` adapters) — tracked as a NEXT item; the official SDKs use v2.
- **Conformance** (live response ⊆ documented 200 schema): **4/4 VERIFIED** — `scrape`, `map`,
  `search`, `team/credit-usage` responses validate against Firecrawl's **own** pinned OpenAPI.

A scheduled CI job (`.github/workflows/contract-drift.yml`) re-fetches upstream weekly and opens a
**reviewable issue** on any sha256 drift — upstream contract changes never silently reach production.

## SDKs (the operational definition of "drop-in")

| Client                               | Version | How                                     | Status                                       |
| ------------------------------------ | ------- | --------------------------------------- | -------------------------------------------- |
| TypeScript `@mendable/firecrawl-js`  | 4.45.0  | `apiUrl` + fuegol key, code unchanged   | **VERIFIED** 8/8 (`e2e/sdk-compat/test.mjs`) |
| Python `firecrawl-py`                | 4.49.3  | `api_url=` + fuegol key, code unchanged | **VERIFIED** 4/4 (`e2e/sdk-compat/test.py`)  |
| Go / Java / Rust / Ruby / PHP / .NET | —       | REST contract is identical; untested    | NOT VERIFIED (no harness yet)                |

## REST endpoints (prefix `/v2`)

| Family                                                                                  | Status          | Notes                                                      |
| --------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------- |
| `scrape` (markdown/html/links/json/screenshot/actions/changeTracking/cache)             | **VERIFIED**    | static + browser tier; `removeBase64Images`, `maxAge` live |
| `map`                                                                                   | **VERIFIED**    | sitemap + link discovery                                   |
| `crawl` (+status/cancel/errors)                                                         | **VERIFIED**    | Durable-Object coordinator, race-safe cancel               |
| `batch/scrape` (+status/cancel/errors)                                                  | **VERIFIED**    | reuses the crawl DO                                        |
| `search` (web/news/images, `tbs`, categories)                                           | **VERIFIED**    | Exa primary / Tavily fallback                              |
| `extract` (+status)                                                                     | **VERIFIED**    | Workers AI, ExtractCoordinator DO                          |
| `parse` (PDF/HTML/text)                                                                 | **VERIFIED**    | unpdf; multipart or `{url}`                                |
| `agent` (+status)                                                                       | **VERIFIED**    | web-search + scrape + AI synthesis                         |
| `monitor` (+run/checks/webhook)                                                         | **VERIFIED**    | cron sweep + change diff + signed alerts                   |
| `browser` + `/:id/act` (interact)                                                       | **VERIFIED**    | persistent Puppeteer session, DO-backed                    |
| `ai-search/index` · `ai-search/query` (RAG)                                             | **VERIFIED**    | Vectorize + Workers AI (Fuego-exclusive, namespaced)       |
| `team/credit-usage` (+historical), `keys`, spend-limit                                  | **VERIFIED**    | real D1 ledger; reserve-before-work → 402                  |
| **`pricing` · `quote`** (price book + preflight)                                        | **VERIFIED**    | NEW — 25/25 prod E2E (`e2e/quote/run.mjs`)                 |
| `crawl/active` · `crawl/ongoing`                                                        | PARTIAL         | returns empty — no cross-DO registry yet                   |
| `crawl/params-preview`, `scrape/:jobId`, token-usage, queue-status, keyless/eligibility | NOT IMPLEMENTED | honest 501/⛔; low-priority                                |
| `/slack`, `/support`, threat-protection, SIEM                                           | N/A             | out-of-scope for this edition                              |

Error envelope `{success:false, error, code?, details?}` with the upstream `ErrorCode` enum verbatim;
status codes 400/401/402/403/404/408/409/429/500/503. Legacy `/v1/*` served by adapters.

## MCP (`fuegol-mcp.manhattan.workers.dev`, stateless Streamable-HTTP)

| Tool group                                                                                | Status                                           |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `firecrawl_scrape` · `map` · `crawl` · `check_crawl_status` · `search`                    | **VERIFIED**                                     |
| `developer_search` · `gov_search` · `research_search_papers` + paper inspect/related/read | **VERIFIED** (Exa categories + Semantic Scholar) |
| `firecrawl_agent` · `monitor_create/list/run/checks` (Bearer-forwarded)                   | **VERIFIED**                                     |
| `firecrawl_find_tools`                                                                    | NOT IMPLEMENTED (proprietary catalog)            |

## Commerce (the product's revenue contract)

| Capability                                       | Status          | Blocker                                                                            |
| ------------------------------------------------ | --------------- | ---------------------------------------------------------------------------------- |
| Preflight quote + price book + margin floor      | **VERIFIED**    | —                                                                                  |
| Real-time credit ledger + reserve/enforce + 402  | **VERIFIED**    | —                                                                                  |
| Stripe subscriptions + one-time packs + webhooks | NOT IMPLEMENTED | needs a Stripe **`sk_test_`** key (only `sk_live_` is available; live-charge risk) |

## Gating rule

The release is **not** labeled "fully Firecrawl compatible" until the pinned v1+v2 OpenAPI/MCP
contracts and the major official-SDK paths pass. Today: core + premium families + TS/Python SDKs +
MCP core tools are VERIFIED; the honest remaining gaps are the low-priority diagnostics endpoints and
the externally-blocked Stripe commerce layer.
