# Convergence Log

> **Purpose:** the running record of recursive **discover → implement → gap-audit** passes toward
> Firecrawl compatibility. Each pass ships work, then honestly audits what is still missing. We
> keep going until the convergence criteria below are met. **We are NOT converged.** This is Pass 0
> of many.

---

## Pass 0 (foundation) — 2026-10-07

The foundational pass: pinned-source research, the Zod contract SSOT, a Cloudflare-native engine,
and a live Hono API Worker with honest stubs.

### Shipped

- **Pinned-source research** — 4 parallel agents established the frozen upstream references:
  - Firecrawl REST API pinned at `firecrawl/firecrawl@f9f2e3d`.
  - MCP server pinned at `firecrawl-mcp-server@ec0f9de` (npm `firecrawl-mcp@3.28.2`), **30 tools**.
  - Pricing model captured.
  - Cloudflare primitives surveyed.
- **Zod contracts SSOT** — `@fuegol/contracts`: the single source of truth for every request/response
  shape, mirrored from the pinned upstream Zod.
- **Cloudflare-native engine** — `@fuegol/engine`:
  - SSRF guard
  - safe-fetch
  - readability extraction
  - HTML→Markdown conversion
  - sitemap/robots parsing
  - cheapest-tier planner
- **Hono API Worker (live)** — `https://fuegol-api.manhattan.workers.dev`:
  - `scrape` + `map` implemented
  - account endpoints
  - honest `501` stubs for not-yet-built contracted routes
  - legacy `v1` adapters
- **Tests** — 13 engine tests green; **15/15** production E2E assertions green.

### Status snapshot

| Area | State |
|---|---|
| `POST /v2/scrape` | 🟡 static-tier formats live |
| `POST /v2/map` | ✅ live |
| Account endpoints | 🟡 demo balances / concurrency live |
| `v1` adapters | 🟡 `scrape` + `map` live |
| Everything else contracted | ⛔ honest 501 |

---

## Gap audit (open)

The biggest release-blocking gaps after Pass 0. None of these are shipped yet.

| # | Gap | Notes |
|---|---|---|
| 1 | **Async crawl (DO)** | Durable-Object coordinator for `/v2/crawl*`; the next increment |
| 2 | **Search provider** | `/v2/search` needs a pluggable provider key |
| 3 | **Extract (Workers AI)** | `/v2/extract*` async jobs via Workers AI + AI Gateway |
| 4 | **MCP server** | 30-tool surface via Cloudflare `createMcpHandler` |
| 5 | **Dashboard / website** | `app.fuegol.ink` + `fuegol.ink` |
| 6 | **Stripe billing + credit ledger** | real balances replacing demo values |
| 7 | **D1 key store** | real fuegol-key issuance + lookup |
| 8 | **Document parse** | `/v2/parse*` family |
| 9 | **Screenshot → R2** | `screenshot` format persisted to R2 |
| 10 | **Browser-tier verification** | prove the browser tier end-to-end (unblocks `json` + more) |
| 11 | **Deploy-button dependency isolation** | isolate dependencies for the Deploy button flow |

---

## Convergence criteria

We declare convergence only when **both** hold:

1. **Two consecutive passes with no material gaps** discovered in the gap audit, and
2. **All release-blocking tests green.**

Until then, each pass appends a new section above and refreshes the gap audit.
