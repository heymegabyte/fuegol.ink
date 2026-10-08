# Architecture Decisions

Lightweight ADRs. Each: decision · why · status · trade-off.

## ADR-001 — Cloudflare-native, no portability layer

**Decision:** Build directly on Workers + Hono, Browser Rendering, Queues, Workflows, Durable Objects,
D1, R2, Workers AI, AI Gateway, AI Search. No cloud-abstraction layer.
**Why:** Deep CF integration is the product's cost + latency advantage (global edge, scale-to-zero,
free R2 egress, free-while-beta `/crawl`). A portability layer would forfeit exactly that.
**Status:** Adopted. **Trade-off:** vendor lock-in — accepted deliberately.

## ADR-002 — Zod contracts as the single source of truth

**Decision:** `@fuegol/contracts` holds Firecrawl-v2-compatible Zod schemas; every surface (API, MCP,
SDK, dashboard) imports them; TS types are `z.infer`, never hand-duplicated.
**Why:** One boundary definition → no drift between API, MCP, and clients. Runtime validation + static
types from the same artifact. Upstream has no committed v2 OpenAPI, so our Zod _is_ the spec mirror.
**Status:** Adopted. **Trade-off:** schemas must be re-pinned on upstream change (drift detector, ADR-010).

## ADR-003 — Clean-room reimplementation, pinned to upstream SHAs

**Decision:** Derive contracts from reading pinned upstream source (firecrawl@f9f2e3d, mcp@ec0f9de),
not by copying AGPL server code. Record SHAs in `FIRECRAWL_COMPAT`.
**Why:** Legal cleanliness + an auditable compatibility claim. The prompt's warning held: the real MCP
tool count is **30 registered / 28 listed**, not the README's stale "27".
**Status:** Adopted.

## ADR-004 — Cheapest-adequate-tier execution planner, static-first

**Decision:** `planScrape()` picks the cheapest tier that satisfies the request: free static HTTP
(`fetch` → readability → HTML→Markdown) by default, escalating to Browser Rendering only for JS/
actions/screenshot/stealth, and AI only when deterministic extraction is insufficient.
**Why:** Margin. Most pages never need a browser; the static path is sub-cent (see unit-economics.md).
**Status:** Adopted (static tier live + prod-verified; browser/AI escalation wired, dormant until bound).

## ADR-005 — MIT license

**Decision:** MIT for all original fuegol code.
**Why:** Maximize self-host adoption; matches the house convention. **Trade-off considered:** Firecrawl
uses AGPL to protect its hosted edition. We accept permissive licensing and compete on hosted
convenience + price, not license restriction. Revisit if a competitor rehosts the managed edition.
**Status:** Adopted — revisitable.

## ADR-006 — Stateless MCP via `createMcpHandler`, not `McpAgent`

**Decision:** Build `mcp.fuegol.ink` on Cloudflare's stateless `createMcpHandler` (Streamable HTTP).
**Why:** CF docs mark `McpAgent` (Durable-Object-based) legacy and recommend the stateless handler;
it is cheaper (no DO per session) and matches the modern MCP transport. **Status:** Planned (ADR records direction).

## ADR-007 — Async crawl via a Durable Object coordinator

**Decision:** Each crawl job = one SQLite-backed Durable Object that owns its frontier, per-origin
politeness, progress, and result storage (R2 for page bundles); the Worker is stateless.
**Why:** Crawls outlive a request; DOs give durable coordination + per-origin concurrency without a
central DB hot path. **Status:** Planned (currently honest 501). Alternative considered: Queues-only —
rejected for lacking per-job coordination/cancel.

## ADR-008 — Demo-mode auth now, D1-backed keys + ledger next

**Decision:** Keyless rate-limited demo for scrape/map today; issue `fgl_` keys backed by D1 with a
transactional credit ledger next. **Never** accept a Firecrawl `fc-` key.
**Why:** Ship a usable public demo immediately (prompt G.2) without blocking on billing infra.
**Status:** Demo live. **Trade-off:** in-memory per-isolate rate limit is best-effort until the DO/KV limiter lands.

## ADR-009 — Monorepo for dev, dependency-isolated template for the Deploy button

**Decision:** pnpm workspace for development; a separate self-contained Worker for one-click Deploy.
**Why:** CF's Deploy button fails on monorepos with hoisted workspace deps (verified in research). The
button target must be dependency-isolated. **Status:** Monorepo live; isolated template = next increment
(`deploy/`). We will not claim the one-click button works until tested from a clean account.

## ADR-010 — Schema-drift detection on a Cron

**Decision:** A scheduled job re-reads upstream `types.ts` + MCP tool registrations and diffs against
our Zod mirror, flagging drift. **Why:** Compatibility is a moving target; detect regressions early.
**Status:** Planned; until then `docs/firecrawl-compatibility.md` is hand-updated each pass.
