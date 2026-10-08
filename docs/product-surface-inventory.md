# Product Surface Inventory

> **Purpose:** enumerate every Firecrawl surface `fuegol.ink` must reach compatibility with, each
> with an explicit status. This is the master checklist; the deeper rationale lives in
> `docs/firecrawl-compatibility.md`, and the pass-by-pass record lives in `docs/convergence-log.md`.

Legend: ✅ live · 🟡 partial · ⛔ planned.

## Pinned upstream sources

| Surface     | Source                           | Revision                               |
| ----------- | -------------------------------- | -------------------------------------- |
| REST API v2 | `firecrawl/firecrawl`            | `f9f2e3d`                              |
| MCP server  | `firecrawl/firecrawl-mcp-server` | `ec0f9de` (npm `firecrawl-mcp@3.28.2`) |

## REST API v2 — routes

| Method | Path                               | Purpose                          | Status                                                                                                                                                                                                |
| ------ | ---------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/v2/scrape`                       | Scrape one URL                   | 🟡 `markdown`/`html`/`rawHtml`/`links`/`summary`/`metadata` via free static tier; `json` via browser tier when configured; `screenshot`/`changeTracking`/`images`/`audio`/`video`/`product`/`menu` ⛔ |
| GET    | `/v2/scrape/:jobId`                | Async scrape fetch               | ⛔                                                                                                                                                                                                    |
| POST   | `/v2/map`                          | Enumerate site URLs              | ✅ sitemap + homepage link discovery, live                                                                                                                                                            |
| POST   | `/v2/crawl`                        | Start multi-page crawl           | ⛔                                                                                                                                                                                                    |
| GET    | `/v2/crawl/:id`                    | Crawl status + page              | ⛔                                                                                                                                                                                                    |
| DELETE | `/v2/crawl/:id`                    | Cancel crawl                     | ⛔                                                                                                                                                                                                    |
| GET    | `/v2/crawl/:id/errors`             | Crawl errors                     | ⛔                                                                                                                                                                                                    |
| GET    | `/v2/crawl/active`                 | Active crawls                    | ⛔                                                                                                                                                                                                    |
| GET    | `/v2/crawl/ongoing`                | Ongoing crawls                   | ⛔                                                                                                                                                                                                    |
| POST   | `/v2/crawl/params-preview`         | Prompt→params preview            | ⛔                                                                                                                                                                                                    |
| POST   | `/v2/batch/scrape`                 | Batch scrape (start)             | ⛔ honest 501                                                                                                                                                                                         |
| GET    | `/v2/batch/scrape/:id`             | Batch scrape status              | ⛔ honest 501                                                                                                                                                                                         |
| DELETE | `/v2/batch/scrape/:id`             | Cancel batch scrape              | ⛔ honest 501                                                                                                                                                                                         |
| GET    | `/v2/batch/scrape/:id/errors`      | Batch scrape errors              | ⛔ honest 501                                                                                                                                                                                         |
| POST   | `/v2/search`                       | Web/news/image + category search | ⛔ honest 501                                                                                                                                                                                         |
| POST   | `/v2/extract`                      | Async structured extraction      | ⛔ honest 501                                                                                                                                                                                         |
| GET    | `/v2/extract/:id`                  | Extract status + result          | ⛔ honest 501                                                                                                                                                                                         |
| POST   | `/v2/parse`                        | Document parse                   | ⛔                                                                                                                                                                                                    |
| GET    | `/v2/parse/formats`                | Supported parse formats          | ⛔                                                                                                                                                                                                    |
| POST   | `/v2/parse/upload-url`             | Signed upload URL for parse      | ⛔                                                                                                                                                                                                    |
| PUT    | `/v2/parse/upload/:id`             | Upload document for parse        | ⛔                                                                                                                                                                                                    |
| GET    | `/v2/team/credit-usage`            | Credit balance                   | 🟡 demo balance live                                                                                                                                                                                  |
| GET    | `/v2/team/credit-usage/historical` | Credit history                   | ⛔                                                                                                                                                                                                    |
| GET    | `/v2/team/token-usage`             | Token balance                    | 🟡                                                                                                                                                                                                    |
| GET    | `/v2/team/token-usage/historical`  | Token history                    | ⛔                                                                                                                                                                                                    |
| GET    | `/v2/team/queue-status`            | Queue status                     | 🟡                                                                                                                                                                                                    |
| GET    | `/v2/team/activity`                | Team activity                    | ⛔                                                                                                                                                                                                    |
| GET    | `/v2/concurrency-check`            | Concurrency                      | 🟡 live                                                                                                                                                                                               |
| GET    | `/v2/keyless/eligibility`          | Keyless gate                     | ⛔                                                                                                                                                                                                    |

**Notes on the 501s.** Every ⛔-but-contracted route returns an _honest_ `501 Not Implemented`
against the defined contract rather than a fake 200. Specifically:

- **Crawl** (`/v2/crawl*`) — contract defined; the Durable-Object coordinator is the next
  increment. Currently honest 501.
- **Search** (`/v2/search`) — needs a pluggable provider key before it can be enabled.
- **Extract** (`/v2/extract*`) — Workers AI + AI Gateway. Single-URL extraction is **already
  available today** via `POST /v2/scrape` with `{type:"json"}`; the async batch-extract jobs are
  what remain planned.

## Legacy v1 adapters

| Method | Path          | Purpose                             | Status  |
| ------ | ------------- | ----------------------------------- | ------- |
| POST   | `/v1/scrape`  | v1 scrape adapter                   | 🟡 live |
| POST   | `/v1/map`     | v1 map adapter (returns `string[]`) | 🟡 live |
| —      | other `/v1/*` | remaining v1 surface                | ⛔      |

## Out-of-scope-for-now upstream families

Tracked, not started:

| Family                    | Routes | Status               |
| ------------------------- | ------ | -------------------- |
| `/agent*`                 | 9      | tracked, not started |
| `/monitor*`               | 10     | tracked, not started |
| `/browser` + `/interact*` | 8      | tracked, not started |
| `/slack`                  | —      | tracked, not started |
| `/support`                | —      | tracked, not started |
| `/feedback`               | —      | tracked, not started |
| threat-protection         | —      | tracked, not started |
| SIEM                      | —      | tracked, not started |

## MCP surface

Pinned to `firecrawl-mcp-server@ec0f9de` (npm `firecrawl-mcp@3.28.2`): **30 tools registered / 28
listable** — 2 hidden deprecated shims (`firecrawl_extract`, `firecrawl_research_search_github`).
Upstream is built on **FastMCP** + `@modelcontextprotocol/sdk@^1.29`; we will use Cloudflare's
stateless **`createMcpHandler`** (`McpAgent` is legacy).

**Status: all ⛔** (next increment). Planned endpoints:

- `mcp.fuegol.ink/v2/mcp` — full profile
- `mcp.fuegol.ink/v2/mcp-search` — the frozen 9-tool search profile
- `mcp.fuegol.ink/mcp` — documented alias

### Profiles

| Profile     | Size                        | Members                                                                                                                                                                                                                                                            |
| ----------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Full        | 30 registered / 28 listable | all tools below                                                                                                                                                                                                                                                    |
| Search-only | 9                           | `firecrawl_search`, `firecrawl_developer_search`, `firecrawl_gov_search`, `firecrawl_research_search_papers`, `firecrawl_research_inspect_paper`, `firecrawl_research_related_papers`, `firecrawl_research_read_paper`, `firecrawl_find_tools`, `firecrawl_scrape` |
| Keyless     | 3                           | `firecrawl_scrape`, `firecrawl_search`, `firecrawl_parse`                                                                                                                                                                                                          |

### All 30 tools

Profile membership columns: **Full** (every tool), **Search** (search-only-9), **Keyless** (keyless-3).

| #   | Tool                                                           | Purpose                                        | Full | Search | Keyless |
| --- | -------------------------------------------------------------- | ---------------------------------------------- | :--: | :----: | :-----: |
| 1   | `firecrawl_scrape`                                             | Scrape a single URL into the requested formats |  ✅  |   ✅   |   ✅    |
| 2   | `firecrawl_map`                                                | Enumerate the URLs of a site                   |  ✅  |        |         |
| 3   | `firecrawl_search`                                             | Web/news/image + category search               |  ✅  |   ✅   |   ✅    |
| 4   | `firecrawl_find_tools`                                         | Discover which Firecrawl tools fit a task      |  ✅  |   ✅   |         |
| 5   | `firecrawl_crawl`                                              | Start a multi-page crawl                       |  ✅  |        |         |
| 6   | `firecrawl_check_crawl_status`                                 | Poll a crawl job's status                      |  ✅  |        |         |
| 7   | `firecrawl_extract` _(deprecated shim, hidden)_                | Structured extraction (legacy)                 |  ✅  |        |         |
| 8   | `firecrawl_agent`                                              | Start an autonomous web agent run              |  ✅  |        |         |
| 9   | `firecrawl_agent_status`                                       | Poll an agent run's status                     |  ✅  |        |         |
| 10  | `firecrawl_interact`                                           | Start an interactive browser session           |  ✅  |        |         |
| 11  | `firecrawl_interact_stop`                                      | Stop an interactive browser session            |  ✅  |        |         |
| 12  | `firecrawl_parse`                                              | Parse a document (PDF/DOCX/…)                  |  ✅  |        |   ✅    |
| 13  | `firecrawl_search_feedback`                                    | Search prior feedback entries                  |  ✅  |        |         |
| 14  | `firecrawl_feedback`                                           | Submit feedback                                |  ✅  |        |         |
| 15  | `firecrawl_credit_usage`                                       | Read credit balance/usage                      |  ✅  |        |         |
| 16  | `firecrawl_developer_search`                                   | Developer-focused search                       |  ✅  |   ✅   |         |
| 17  | `firecrawl_gov_search`                                         | Government-source search                       |  ✅  |   ✅   |         |
| 18  | `firecrawl_research_search_papers`                             | Search academic papers                         |  ✅  |   ✅   |         |
| 19  | `firecrawl_research_inspect_paper`                             | Inspect a specific paper                       |  ✅  |   ✅   |         |
| 20  | `firecrawl_research_related_papers`                            | Find papers related to one                     |  ✅  |   ✅   |         |
| 21  | `firecrawl_research_read_paper`                                | Read a paper's full content                    |  ✅  |   ✅   |         |
| 22  | `firecrawl_research_search_github` _(deprecated shim, hidden)_ | Search GitHub (legacy)                         |  ✅  |        |         |
| 23  | `firecrawl_monitor_create`                                     | Create a monitor                               |  ✅  |        |         |
| 24  | `firecrawl_monitor_list`                                       | List monitors                                  |  ✅  |        |         |
| 25  | `firecrawl_monitor_get`                                        | Get one monitor                                |  ✅  |        |         |
| 26  | `firecrawl_monitor_update`                                     | Update a monitor                               |  ✅  |        |         |
| 27  | `firecrawl_monitor_delete`                                     | Delete a monitor                               |  ✅  |        |         |
| 28  | `firecrawl_monitor_run`                                        | Trigger a monitor run                          |  ✅  |        |         |
| 29  | `firecrawl_monitor_checks`                                     | List a monitor's checks                        |  ✅  |        |         |
| 30  | `firecrawl_monitor_check`                                      | Get one monitor check                          |  ✅  |        |         |

## Other surfaces

| Surface        | Host              | Status     |
| -------------- | ----------------- | ---------- |
| Website        | `fuegol.ink`      | ⛔ planned |
| Dashboard      | `app.fuegol.ink`  | ⛔ planned |
| Docs           | `docs.fuegol.ink` | ⛔ planned |
| TypeScript SDK | —                 | ⛔ planned |
| Python SDK     | —                 | ⛔ planned |
| CLI            | —                 | ⛔ planned |

## Compatibility definition

An existing Firecrawl client should only need to:

1. **Change the base URL** to `api.fuegol.ink`, and
2. **Use a NEW fuegol key** — never its existing `fc-` key.

No other code changes. That is the compatibility bar every surface above is measured against.
