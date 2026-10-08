# Firecrawl Compatibility

> **Compatibility thesis:** an existing supported Firecrawl client should be able to change its
> base URL to `https://api.fuegol.ink` and swap in a **newly-issued fuegol.ink key** (never its
> old `fc-` key) without rewriting business logic. This file is the living evidence for that claim.

## Pinned upstream sources

| Surface | Repo / source | Revision | Retrieved |
|---|---|---|---|
| REST API v2 | `firecrawl/firecrawl` | `f9f2e3dd5406da68b8b92667772802a6cd7927d9` | 2026-10-07 |
| MCP server | `firecrawl/firecrawl-mcp-server` | `ec0f9de0a3f2bc9c1359868858cecac98ce39f06` (npm `firecrawl-mcp@3.28.2`) | 2026-10-07 |
| Pricing | `firecrawl.dev/pricing` + `docs.firecrawl.dev/billing` | live | 2026-10-07 |

The v2 REST contract has **no committed OpenAPI** in the repo — it is defined in Zod at
`apps/api/src/controllers/v2/types.ts`. Where published docs and that source conflict, **the Zod
source wins**. Our Zod mirror lives in `packages/contracts` and is the single source of truth here.

## REST API coverage

Legend: ✅ implemented · 🟡 partial/stub · ⛔ planned · `n/a` not applicable to self-host.

| Method | Path (prefix `/v2`) | Purpose | Status |
|---|---|---|---|
| POST | `/scrape` | Scrape one URL (all formats) | 🟡 markdown/html/rawHtml/links/summary/metadata + `{type:"json"}` AI extraction live; screenshot/changeTracking ⛔ |
| GET | `/scrape/:jobId` | Async scrape fetch | ⛔ |
| POST | `/map` | Enumerate site URLs | ✅ sitemap + link discovery |
| POST | `/crawl` | Start multi-page crawl (Durable-Object coordinator) | ✅ live |
| GET | `/crawl/:jobId` | Crawl status + paginated pages | ✅ live |
| DELETE | `/crawl/:jobId` | Cancel crawl (race-safe) | ✅ live |
| GET | `/crawl/:jobId/errors` | Crawl errors + robotsBlocked | ✅ live |
| GET | `/crawl/active` · `/crawl/ongoing` | Active crawls | 🟡 empty (no cross-DO registry yet) |
| POST | `/crawl/params-preview` | Prompt→params preview | ⛔ (Workers AI) |
| POST | `/batch/scrape` (+ status/cancel/errors) | Batch scrape (reuses crawl DO) | ✅ live |
| POST | `/search` | Web search + optional result-scraping (Exa/Tavily adapter) | ✅ live |
| POST | `/extract` · GET `/extract/:jobId` | Async structured extraction (Workers AI, ExtractCoordinator DO) | ✅ live |
| POST | `/parse` (+ formats/upload) | Document parse (PDF/DOCX/…) | ⛔ |
| GET | `/team/credit-usage` (+ historical) | Credit balance | 🟡 ledger-backed |
| GET | `/team/token-usage` (+ historical) | Token balance | ⛔ |
| GET | `/team/queue-status` · `/team/activity` | Queue + activity | ⛔ |
| GET | `/concurrency-check` | Concurrency | 🟡 |
| GET | `/keyless/eligibility` | Keyless gate | ⛔ |

Legacy **`/v1/*`** paths are served by compatibility adapters (`/v1/map` string-array response,
flat `formats`, `v0` unprefixed where trivial). Out-of-scope-for-now upstream families, tracked:
`/agent*` (9), `/monitor*` (10), `/browser`+`/interact*` (8), `/slack`, `/support`, threat-protection, SIEM.

### `formats` (full enumeration, from pinned Zod)

String: `markdown summary html rawHtml rawBase64 links images screenshot audio video product menu json changeTracking`.
Object: `{type:json}` `{type:deterministicJson}` `{type:screenshot}` `{type:changeTracking}` `{type:attributes}`
`{type:question}` `{type:highlights}` `{type:query}` `{type:branding}`. Rules: max one `screenshot`;
`changeTracking` requires `markdown`; `json`⊕`deterministicJson`; `rawBase64` cannot combine.

### Error contract

Envelope `{success:false, error, code?, details?}`. We emit the upstream `ErrorCode` enum verbatim
(see `packages/contracts/src/common.ts`) so client error handling keeps working. Status codes:
400/401/402/403/404/408/409/429/500/503.

## MCP coverage

Upstream registers **30 `firecrawl_*` tools / 28 listable** (2 hidden deprecated shims:
`firecrawl_extract`, `firecrawl_research_search_github`). The repo README's "27" is **stale vs HEAD**.
Built on **FastMCP** + `@modelcontextprotocol/sdk@^1.29`; we use Cloudflare's stateless
`createMcpHandler` (from `agents/mcp/server`) instead — `McpAgent` is legacy.

Endpoints we will expose: `mcp.fuegol.ink/v2/mcp` (full), `/v2/mcp-search` (the frozen 9-tool
search profile), `/mcp` (documented alias). Keyless profile = 3 tools (`scrape`, `search`, `parse`).

**Live: https://fuegol-mcp.manhattan.workers.dev** (stateless Streamable-HTTP JSON-RPC). `firecrawl_scrape`
+ `firecrawl_map` are real working tools; the rest are advertised for compatibility and return an
explicit not-yet error (never fabricated data).

| Profile | Tools | Status |
|---|---|---|
| Full (`/v2/mcp`) | scrape✅ map✅ crawl✅ check_crawl_status✅ search✅; research/gov (honest stub) | 🟡 live |
| Search-only (`/v2/mcp-search`) | `firecrawl_scrape`✅ + `firecrawl_search firecrawl_developer_search firecrawl_gov_search firecrawl_research_search_papers firecrawl_research_inspect_paper firecrawl_research_related_papers firecrawl_research_read_paper firecrawl_find_tools` (stubs) | 🟡 live |
| Keyless | `firecrawl_scrape firecrawl_search firecrawl_parse` | ⛔ (auth layer pending) |

Full 30-tool inventory with input schemas is mirrored in `docs/product-surface-inventory.md`.

## Schema-drift detection

`packages/contracts` records the pinned SHAs. A scheduled job (Cron) will re-read the upstream
`types.ts` + MCP tool registrations and diff against our Zod mirror, opening an issue on drift.
Until that lands, this table is updated by hand each convergence pass.
