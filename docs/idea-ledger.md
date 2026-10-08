# fuegol.ink — Recursive Invention Ledger (Pass 1)

> **fuegol.ink** is a Cloudflare-native, Firecrawl-compatible web-data platform: open-source core + managed SaaS priced at ~50% of Firecrawl. It speaks the Firecrawl v2 API/MCP contract so existing SDKs, agents, and `firecrawl_*` MCP tools drop in unchanged, while running entirely on Workers, Browser Rendering, Queues, Workflows, Durable Objects, R2, D1, and Workers AI.

## Methodology — recursive 30 → top-9 (30%)

For each of the 12 dimensions below we generate **exactly 30 distinct, actionable ideas** — concrete mechanisms, not themes. Each idea carries a compact score line across four axes:

- **value** — impact on users / revenue / compat fidelity
- **feasibility** — how buildable on our Cloudflare stack, now
- **cost** — build + run cost (H = expensive; prefer L/M for the first wave)
- **differentiation** — how much it separates us from Firecrawl and clones

We then mark the **top ~9 (30%)** per dimension as **[SELECTED]** using the heuristic *maximize value × differentiation, gated by feasibility, penalized by cost*. The resulting **108 selected ideas (9 × 12)** are the **mandatory first implementation wave** — the Pass-1 backlog. Non-selected ideas are the pre-vetted Pass-2+ reservoir (not discarded; deferred with rationale baked into their scores).

Scoring axes are declared explicitly so a later pass can re-rank deterministically rather than re-deciding from scratch.

---

## A. API contracts & backward compatibility

Selected baseline already includes: exact Firecrawl v2 route/schema contracts; legacy v1 adapters; generated OpenAPI + runtime validation; accurate HTTP/provider error codes; full async job states + cancellation; batch/pagination/error endpoints; signed webhooks w/ retries; SDK compat tests (official TS + Python); automated upstream schema-drift detection.

1. **Zod SSOT mirror of every v2 body** — one `packages/contracts` Zod schema per `/v2/*` request+response, inferred into TS types, validated at the Worker edge before dispatch. — value:H · feasibility:H · cost:L · differentiation:M **[SELECTED]**
2. **Spec-conformance snapshot harness** — capture real Firecrawl v2 responses into golden fixtures; assert our shapes are byte-superset (extra fields only additive). — value:H · feasibility:H · cost:M · differentiation:H **[SELECTED]**
3. **v1→v2 translation shim** — `/v1/scrape|crawl|search` adapters that rewrite legacy params (`pageOptions`, `extractorOptions`) to v2 and back-map responses. — value:H · feasibility:M · cost:M · differentiation:M **[SELECTED]**
4. **OpenAPI 3.1 generated from Zod** — `@asteasolutions/zod-to-openapi` emits the spec at build; served at `/openapi.json` + rendered docs. — value:H · feasibility:H · cost:L · differentiation:M **[SELECTED]**
5. **Provider-accurate error envelope** — reproduce Firecrawl's `{ success:false, error, code }` plus HTTP status map (402 insufficient credits, 429 rate limit, 408 scrape timeout). — value:H · feasibility:H · cost:L · differentiation:H **[SELECTED]**
6. **Async job state machine** — `scraping|completed|failed|cancelled|scraping` lifecycle in a Durable Object with `GET /v2/crawl/:id` + `DELETE /v2/crawl/:id` cancel. — value:H · feasibility:H · cost:M · differentiation:M **[SELECTED]**
7. **Cursor pagination parity** — `next` URL + `limit`/`skip` semantics identical to Firecrawl crawl-result pagination, R2-backed result pages. — value:H · feasibility:H · cost:L · differentiation:M **[SELECTED]**
8. **HMAC-signed webhooks + replay** — `x-firecrawl-signature` compatible header, per-event delivery with exponential retry + a DLQ, replay endpoint. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
9. **SDK contract CI matrix** — run the official `@mendable/firecrawl-js` + `firecrawl-py` test suites against our prod URL in CI; fail the build on any divergence. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
10. **Upstream schema-drift watcher** — nightly fetch of Firecrawl's OpenAPI + SDK types; diff against ours; open a GitHub issue on drift. — value:M · feasibility:M · cost:L · differentiation:H
11. **Idempotency-Key support** — honor `Idempotency-Key` on POST jobs, dedupe via D1 unique index, return the original job. — value:M · feasibility:H · cost:L · differentiation:M
12. **`formats` array parity** — accept the full v2 `formats` union (`markdown`, `html`, `rawHtml`, `links`, `screenshot`, `screenshot@fullPage`, `json`, `changeTracking`). — value:H · feasibility:H · cost:M · differentiation:M
13. **Versioned API surface** — `/v2` canonical, `/v1` deprecated-but-live, `Sunset` + `Deprecation` headers on v1. — value:M · feasibility:H · cost:L · differentiation:L
14. **Request-id + trace propagation** — echo `x-request-id`, propagate into Sentry/OTel spans for every job. — value:M · feasibility:H · cost:L · differentiation:M
15. **Field-level deprecation warnings** — surface `warning` strings in responses when a deprecated param is used (mirrors Firecrawl's own warnings). — value:M · feasibility:H · cost:L · differentiation:M
16. **Strict vs lenient parse mode** — reject unknown params in strict mode, coerce in lenient (default) for maximal SDK tolerance. — value:M · feasibility:H · cost:L · differentiation:M
17. **Response content-hash + ETag** — stable `scrape` content hash enabling client-side caching + conditional re-fetch. — value:M · feasibility:H · cost:L · differentiation:M
18. **Credit-usage echo in responses** — include `creditsUsed` per job like Firecrawl, computed from our cost model. — value:M · feasibility:H · cost:L · differentiation:M
19. **Batch-scrape endpoint** — `/v2/batch/scrape` fan-out over Queues with a single job id + aggregated results. — value:H · feasibility:M · cost:M · differentiation:M
20. **Compatibility version header** — `x-fuegol-compat: firecrawl-v2.x` so clients can assert the contract generation they get. — value:M · feasibility:H · cost:L · differentiation:M
21. **Deterministic field ordering** — stable JSON key order to keep snapshot diffs + client caches clean. — value:L · feasibility:H · cost:L · differentiation:L
22. **Partial-result streaming** — SSE on long crawls emitting pages as discovered (superset of Firecrawl polling). — value:M · feasibility:M · cost:M · differentiation:H
23. **Typed error taxonomy** — enumerated `code` values (`SSRF_BLOCKED`, `ROBOTS_DISALLOWED`, `JS_TIMEOUT`) documented in OpenAPI. — value:M · feasibility:H · cost:L · differentiation:M
24. **Backward-compat golden corpus** — a frozen set of 50 real sites whose v1+v2 outputs must stay stable across releases. — value:M · feasibility:M · cost:M · differentiation:M
25. **GraphQL mirror (optional)** — thin GraphQL facade over the same contracts for teams that prefer it. — value:L · feasibility:M · cost:M · differentiation:L
26. **Response size guardrails** — `maxBytes` param + truncation metadata to keep parity with Firecrawl limits. — value:M · feasibility:H · cost:L · differentiation:L
27. **Locale/format negotiation** — `Accept-Language` + `Accept` passthrough to the fetch layer where meaningful. — value:L · feasibility:H · cost:L · differentiation:L
28. **Contract changelog generator** — auto-diff OpenAPI between releases → human-readable CHANGELOG section. — value:M · feasibility:H · cost:L · differentiation:M
29. **Dry-run / validate-only mode** — `?validate=true` returns the parsed+normalized request without executing, for SDK debugging. — value:M · feasibility:H · cost:L · differentiation:M
30. **Legacy `/scrape` root alias** — unversioned root routes 301/alias to `/v2` for the oldest integrations. — value:L · feasibility:H · cost:L · differentiation:L

---

## B. Crawling & discovery

Selected baseline: sitemap-index + link discovery; fast HTML crawl w/ selective JS escalation; Queues-backed async crawl; per-origin politeness/crawl-delay; incremental crawl w/ conditional requests + cache reuse; canonical URL normalization + dedupe; live page-level progress; visual site-link graph; hard page/duration/cost budgets + cancel.

1. **Sitemap-index recursive expansion** — parse `sitemap_index.xml` → child sitemaps → URLs, honoring `<lastmod>` for incremental selection. — value:H · feasibility:H · cost:L · differentiation:M **[SELECTED]**
2. **HTML-first, JS-escalation heuristic** — fetch with plain `fetch()`; escalate to Browser Rendering only when content density/`<noscript>`/hydration markers indicate SPA. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
3. **Queues-backed frontier** — crawl frontier as Cloudflare Queue messages; consumer Worker pulls, discovers, re-enqueues with depth/budget metadata. — value:H · feasibility:H · cost:M · differentiation:M **[SELECTED]**
4. **Per-origin politeness governor** — Durable Object per host enforces `Crawl-delay` + concurrency cap + token-bucket pacing. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
5. **Incremental crawl via conditional GET** — store `ETag`/`Last-Modified` in D1; send `If-None-Match`/`If-Modified-Since`; skip 304s, reuse cached body from R2. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
6. **Canonical URL normalization + dedupe** — strip tracking params, resolve `rel=canonical`, lowercase host, fragment drop; Bloom-filter seen-set in the DO. — value:H · feasibility:H · cost:L · differentiation:M **[SELECTED]**
7. **Live page-level progress** — DO broadcasts `discovered/fetched/failed` counters over a hibernatable WebSocket to the dashboard. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
8. **Hard budget + cancel enforcement** — `maxPages`, `maxDuration`, `maxCredits` checked per message; `DELETE` flips a DO flag consumers honor immediately. — value:H · feasibility:H · cost:L · differentiation:M **[SELECTED]**
9. **Visual site-link graph** — emit nodes/edges as the crawl runs; dashboard renders a force-directed map (superset vs Firecrawl's flat list). — value:M · feasibility:M · cost:M · differentiation:H **[SELECTED]**
10. **`includePaths`/`excludePaths` globbing** — path allow/deny with glob + regex, matching Firecrawl crawl options exactly. — value:H · feasibility:H · cost:L · differentiation:M
11. **Depth + external-link policy** — `maxDepth`, `allowExternalLinks`, `allowBackwardLinks` honored per-frontier-message. — value:M · feasibility:H · cost:L · differentiation:M
12. **`/v2/map` fast URL discovery** — sitemap + anchor harvest returning a URL list without full scrape (Firecrawl `map` parity). — value:H · feasibility:H · cost:L · differentiation:M
13. **robots.txt-aware frontier** — fetch+cache robots per host, honor `Disallow`/`Allow`/`Sitemap` directives before enqueue. — value:H · feasibility:H · cost:L · differentiation:M
14. **Adaptive concurrency** — raise/lower per-origin parallelism on observed latency + 429/503 signals. — value:M · feasibility:M · cost:M · differentiation:H
15. **URL-pattern sampling mode** — crawl a representative N per detected template (product/, blog/) instead of exhaustive. — value:M · feasibility:M · cost:M · differentiation:H
16. **Pagination following** — detect `rel=next`/infinite-scroll markers and follow list pagination. — value:M · feasibility:M · cost:M · differentiation:M
17. **Workflows-orchestrated long crawls** — model multi-hour crawls as a Cloudflare Workflow with durable steps + automatic resume. — value:H · feasibility:M · cost:M · differentiation:H
18. **Crawl resumability checkpoints** — persist frontier+seen-set snapshots to R2 so a crashed crawl resumes mid-flight. — value:M · feasibility:M · cost:M · differentiation:H
19. **Content-type gating** — skip binaries unless requested; route PDFs/DOCX to the parse pipeline, not the HTML path. — value:M · feasibility:H · cost:L · differentiation:L
20. **Duplicate-content clustering** — shingle/MinHash near-dup detection to collapse boilerplate-identical pages. — value:M · feasibility:M · cost:M · differentiation:H
21. **Freshness scoring** — rank re-crawl priority by observed change frequency per URL. — value:M · feasibility:M · cost:M · differentiation:H
22. **Geo-aware fetch origin** — pin fetches to a Cloudflare region when a site serves region-locked content. — value:M · feasibility:M · cost:M · differentiation:H
23. **Soft-404 detection** — flag 200-status "not found" pages via title/body heuristics. — value:M · feasibility:M · cost:L · differentiation:M
24. **Link graph export** — downloadable GraphML/JSON of the discovered topology. — value:L · feasibility:H · cost:L · differentiation:M
25. **Crawl diff reports** — between two crawls of the same site, list added/removed/changed URLs. — value:M · feasibility:M · cost:M · differentiation:H
26. **Per-crawl cache namespace** — reuse scrape results within a crawl via KV/R2 keyed by canonical URL. — value:M · feasibility:H · cost:L · differentiation:M
27. **Honeypot/trap avoidance** — detect calendar/infinite-param loops and prune. — value:M · feasibility:M · cost:L · differentiation:M
28. **Priority seeds** — let callers mark high-value URLs crawled first within budget. — value:L · feasibility:H · cost:L · differentiation:L
29. **Crawl ETA estimation** — project completion time from discovery rate + budget. — value:M · feasibility:M · cost:L · differentiation:M
30. **Headless-vs-light A/B telemetry** — record which fetch path each URL used to tune the escalation heuristic. — value:M · feasibility:M · cost:L · differentiation:H

---

## C. Scraping & extraction

Selected baseline: multi-format single fetch; high-quality main-content Markdown; JSON-Schema-guided AI extraction; PDF/DOCX/HTML parsing; screenshots + temp asset URLs; page actions before extraction; branding/product/metadata extraction; provenance + extraction confidence; selective PII redaction + retention.

1. **Multi-format single fetch** — one scrape returns any subset of `markdown|html|rawHtml|links|screenshot|json` from a single render, no re-fetch. — value:H · feasibility:H · cost:M · differentiation:M **[SELECTED]**
2. **Readability-grade main-content Markdown** — DOM cleaning (Readability-style) + Turndown with tuned rules, boilerplate/nav/ad stripping. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
3. **JSON-Schema-guided AI extraction** — `formats:["json"]` with a user JSON Schema → Workers AI / AI Gateway structured output validated against the schema. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
4. **PDF + DOCX parsing** — route documents through a WASM/`unpdf`+`mammoth` pipeline to Markdown, same output envelope as HTML. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
5. **Screenshots → R2 temp URLs** — `screenshot` / `screenshot@fullPage` captured via Browser Rendering, stored in R2, returned as signed, TTL-expiring URLs. — value:H · feasibility:H · cost:M · differentiation:M **[SELECTED]**
6. **Pre-extraction page actions** — `actions:[click,write,wait,scroll,press,screenshot]` executed before capture (Firecrawl `actions` parity). — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
7. **Provenance + confidence metadata** — every extracted field annotated with source selector/offset + a model confidence score. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
8. **Structured metadata extraction** — OpenGraph, Twitter cards, JSON-LD, meta tags, favicon, canonical, language auto-parsed into `metadata`. — value:H · feasibility:H · cost:L · differentiation:M **[SELECTED]**
9. **Selective PII redaction** — optional detector masks emails/phones/SSNs pre-storage with a retention policy flag. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
10. **`onlyMainContent` toggle** — Firecrawl-parity flag to include/exclude chrome. — value:M · feasibility:H · cost:L · differentiation:L
11. **Tag include/exclude** — `includeTags`/`excludeTags` CSS selectors to scope extraction. — value:M · feasibility:H · cost:L · differentiation:M
12. **Branding/product extractor** — specialized schema for logo, palette, product name, pricing from marketing pages. — value:M · feasibility:M · cost:M · differentiation:H
13. **Link classification** — split `links` into internal/external/nav/content/asset. — value:M · feasibility:H · cost:L · differentiation:M
14. **Table-to-JSON** — detect HTML tables and emit structured rows alongside Markdown. — value:M · feasibility:M · cost:M · differentiation:H
15. **Markdown with stable heading anchors** — slugged anchors for deep-linking into scraped docs. — value:L · feasibility:H · cost:L · differentiation:L
16. **Image alt + caption harvest** — pull `alt`, `figcaption`, surrounding text for each image. — value:M · feasibility:H · cost:L · differentiation:M
17. **Language detection + translation hook** — detect page language; optional translate-to-target via Workers AI. — value:M · feasibility:M · cost:M · differentiation:H
18. **`waitFor` + network-idle** — wait on selector/timeout/network-idle before capture. — value:M · feasibility:H · cost:L · differentiation:M
19. **Mobile/desktop viewport presets** — capture under chosen device emulation. — value:M · feasibility:H · cost:L · differentiation:M
20. **PDF-of-page format** — render the page to PDF into R2 as an output format. — value:M · feasibility:M · cost:M · differentiation:H
21. **Extraction schema library** — prebuilt schemas (article, product, job post, event, recipe). — value:M · feasibility:H · cost:L · differentiation:H
22. **Multi-page JSON merge** — extract one schema across a crawl and dedupe/merge into a single dataset. — value:M · feasibility:M · cost:M · differentiation:H
23. **Prompt + schema hybrid** — free-text prompt plus JSON Schema for guided-but-flexible extraction. — value:M · feasibility:M · cost:M · differentiation:M
24. **Confidence-gated re-extract** — auto-retry extraction with a stronger model when confidence < threshold. — value:M · feasibility:M · cost:M · differentiation:H
25. **Content fingerprint for change tracking** — per-scrape hash feeding the `changeTracking` format. — value:M · feasibility:H · cost:L · differentiation:M
26. **Email/phone/address entity tags** — structured contact extraction as an opt-in format. — value:M · feasibility:M · cost:L · differentiation:M
27. **Code-block preservation** — keep fenced code + language hints intact in Markdown. — value:L · feasibility:H · cost:L · differentiation:L
28. **Screenshot annotation** — optional bounding boxes over extracted elements for QA. — value:L · feasibility:M · cost:M · differentiation:H
29. **RawHTML sanitization levels** — none/safe/minified variants of `rawHtml`. — value:L · feasibility:H · cost:L · differentiation:L
30. **Retention TTL per scrape** — caller sets how long results persist in R2 before auto-delete. — value:M · feasibility:H · cost:L · differentiation:H

---

## D. Search, research & monitoring

Selected baseline: pluggable web-search providers; citations/provenance; developer + public-GitHub research; scholarly research (authorized indexes); gov/regulatory primary-source discovery; budgeted multi-source research agents; tenant Cloudflare AI Search indexing; semantic change detection; Alexandria-like provider discovery/execution abstraction.

1. **Pluggable search-provider interface** — `/v2/search` backed by a provider registry (Brave, Serper, Tavily, Bing) selectable per request/tenant. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
2. **Citations + provenance on every result** — each search/research answer carries source URLs, fetch timestamps, and scrape hashes. — value:H · feasibility:H · cost:L · differentiation:H **[SELECTED]**
3. **Search → scrape fusion** — `/v2/search` optionally scrapes top-N results inline and returns Markdown (Firecrawl `search` with `scrapeOptions` parity). — value:H · feasibility:M · cost:M · differentiation:M **[SELECTED]**
4. **Budgeted multi-source research agent** — a research job with a hard credit/time budget that fans out, scrapes, and synthesizes a cited brief. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
5. **Tenant Cloudflare AI Search index** — push scraped corpora into per-tenant AI Search (AutoRAG) for semantic retrieval over their own crawl. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
6. **Semantic change detection** — embed page versions in Vectorize; alert when meaning (not just bytes) shifts beyond a cosine threshold. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
7. **Scheduled monitors** — Cron-triggered re-scrape/re-search with webhook/email on change, backed by Workflows. — value:H · feasibility:H · cost:M · differentiation:H **[SELECTED]**
8. **Public-GitHub code research** — search + fetch repo files/READMEs/releases via the GitHub API as a first-class research source. — value:M · feasibility:H · cost:L · differentiation:H **[SELECTED]**
9. **Provider-abstraction ("Alexandria-like") layer** — uniform discover→rank→execute interface so new sources plug in without API changes. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
10. **Scholarly index connectors** — OpenAlex/Crossref/arXiv connectors for authorized academic research. — value:M · feasibility:M · cost:M · differentiation:H
11. **Gov/regulatory primary-source discovery** — Federal Register, SEC EDGAR, regulations.gov connectors. — value:M · feasibility:M · cost:M · differentiation:H
12. **Search result dedupe + clustering** — collapse near-duplicate results across providers. — value:M · feasibility:M · cost:L · differentiation:M
13. **Freshness filter** — `tbs`-style time-window filtering on search. — value:M · feasibility:H · cost:L · differentiation:L
14. **Query expansion via LLM** — auto-generate sub-queries to broaden recall under budget. — value:M · feasibility:M · cost:M · differentiation:H
15. **Answer-with-citations synthesis** — LLM answer that inline-cites scraped snippets, refusing uncited claims. — value:H · feasibility:M · cost:M · differentiation:H
16. **Monitor diff digest** — daily email summarizing what changed across monitored URLs. — value:M · feasibility:M · cost:L · differentiation:H
17. **Entity-watch monitors** — track a named entity (company/person) across sources, not a single URL. — value:M · feasibility:M · cost:M · differentiation:H
18. **News/RSS discovery** — detect feeds and poll them for new items. — value:M · feasibility:H · cost:L · differentiation:M
19. **Research run replay** — persist each research job's full trace (queries, sources, scores) for audit. — value:M · feasibility:M · cost:M · differentiation:H
20. **Country/locale-scoped search** — `location`/`gl`/`hl` params threaded to providers. — value:M · feasibility:H · cost:L · differentiation:M
21. **Adversarial fact-check pass** — second LLM verifies each claim against its cited source. — value:M · feasibility:M · cost:M · differentiation:H
22. **Vector dedupe of corpus** — avoid re-indexing semantically identical pages in AI Search. — value:M · feasibility:M · cost:M · differentiation:M
23. **Search cost estimator** — per-query credit preview before execution. — value:M · feasibility:H · cost:L · differentiation:M
24. **Multi-provider consensus ranking** — merge+rerank across providers with reciprocal-rank fusion. — value:M · feasibility:M · cost:M · differentiation:H
25. **Monitor threshold tuning UI** — per-monitor sensitivity slider mapped to cosine distance. — value:M · feasibility:M · cost:L · differentiation:M
26. **PDF/doc search** — include parsed documents in the searchable corpus. — value:M · feasibility:M · cost:M · differentiation:M
27. **Saved research templates** — reusable research recipes (e.g., "competitor pricing sweep"). — value:M · feasibility:H · cost:L · differentiation:H
28. **Webhook on monitor trigger** — signed webhook payload with before/after diff. — value:M · feasibility:H · cost:L · differentiation:M
29. **Research export formats** — brief as Markdown/PDF/JSON with a sources appendix. — value:M · feasibility:H · cost:L · differentiation:M
30. **Provider health + fallback** — auto-failover to a secondary provider on error/quota. — value:M · feasibility:M · cost:L · differentiation:H

---

## E. Browser automation & locality

Selected baseline: persistent browser sessions; firecrawl_interact semantics; explicit session stop/cleanup; tenant-isolated encrypted profiles; action traces + screenshot timelines; locale/timezone/geolocation prefs; browser-minute/session cost ceilings; ephemeral credential handling; human-assisted auth/consent.

1. **Persistent browser sessions** — a Durable Object fronts a Browser Rendering session kept warm across calls, addressed by a `sessionId`. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
2. **`firecrawl_interact` action semantics** — click/type/scroll/select/wait/press replayed via Puppeteer over Browser Rendering, Firecrawl-compatible. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
3. **Explicit session stop/cleanup** — `DELETE /v2/sessions/:id` tears down the browser + the DO + any profile cache deterministically. — value:H · feasibility:H · cost:L · differentiation:M **[SELECTED]**
4. **Tenant-isolated encrypted profiles** — cookies/localStorage persisted per-tenant in R2, encrypted with a per-tenant key, loaded on session resume. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
5. **Action traces + screenshot timeline** — each action records a step with a screenshot; dashboard renders a scrubbable timeline. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
6. **Locale/timezone/geolocation prefs** — per-session emulation of `Accept-Language`, timezone, and geolocation (no false claims — see §J). — value:M · feasibility:H · cost:L · differentiation:H **[SELECTED]**
7. **Browser-minute + session cost ceilings** — a hard wall-clock + minute budget per session enforced by the DO; auto-stop on breach. — value:H · feasibility:H · cost:L · differentiation:H **[SELECTED]**
8. **Ephemeral credential handling** — accept login creds for a single session, never persist plaintext, scrub on teardown. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
9. **Human-assisted auth/consent handoff** — pause a session at a login/CAPTCHA wall and surface a one-time interactive URL for a human to complete. — value:M · feasibility:M · cost:M · differentiation:H **[SELECTED]**
10. **Session pooling + reuse** — warm-pool idle sessions to cut cold-start latency. — value:M · feasibility:M · cost:M · differentiation:H
11. **Network interception** — block/allow resource types (images/fonts) per session to cut cost. — value:M · feasibility:M · cost:L · differentiation:M
12. **Cookie import/export** — load caller-supplied cookies; export session cookies on demand. — value:M · feasibility:H · cost:L · differentiation:M
13. **Multi-step flow recorder** — record a human flow once, replay as an automation. — value:M · feasibility:M · cost:M · differentiation:H
14. **Viewport/device matrix** — run the same flow across device presets. — value:M · feasibility:H · cost:L · differentiation:M
15. **Session event stream** — live WebSocket of navigation/console/network events. — value:M · feasibility:M · cost:M · differentiation:H
16. **File upload/download in-session** — handle `<input type=file>` and captured downloads to R2. — value:M · feasibility:M · cost:M · differentiation:M
17. **Proxy per session** — route a session through a specific egress/proxy where authorized. — value:M · feasibility:M · cost:M · differentiation:H
18. **Console + error capture** — attach page console/JS errors to the trace. — value:M · feasibility:H · cost:L · differentiation:M
19. **Session snapshot/restore** — checkpoint full session state and restore later. — value:M · feasibility:M · cost:M · differentiation:H
20. **Screenshot on every action (opt-in)** — toggle fine-grained vs. terminal-only capture to manage cost. — value:M · feasibility:H · cost:L · differentiation:M
21. **Dialog/alert auto-handling** — accept/dismiss native dialogs by policy. — value:L · feasibility:H · cost:L · differentiation:L
22. **Geofence verification** — surface the actual egress region so callers don't assume locality. — value:M · feasibility:M · cost:L · differentiation:H
23. **Idle-timeout auto-stop** — kill sessions after N idle seconds. — value:M · feasibility:H · cost:L · differentiation:M
24. **Concurrent-session quota per tenant** — cap parallel sessions by plan. — value:M · feasibility:H · cost:L · differentiation:M
25. **PDF/print emulation** — `emulateMedia('print')` captures. — value:L · feasibility:H · cost:L · differentiation:L
26. **Action macro library** — reusable named action sequences (login, accept-cookies). — value:M · feasibility:H · cost:L · differentiation:H
27. **Stealth/evasion toggles** — within policy, reduce automation fingerprints. — value:M · feasibility:M · cost:M · differentiation:M
28. **Session cost ledger** — per-session browser-minute accounting surfaced in the dashboard. — value:M · feasibility:H · cost:L · differentiation:M
29. **Trace export (HAR)** — downloadable HAR + screenshots per session. — value:L · feasibility:M · cost:L · differentiation:M
30. **Multi-tab support** — manage multiple pages within one session. — value:L · feasibility:M · cost:M · differentiation:M

---

## F. MCP, SDK, CLI & developer integration

Selected baseline: version-pinned firecrawl_* MCP compat (30 tools / 28 listed @ firecrawl-mcp-server v3.28.2); search-only MCP profile (9 tools); stateless Streamable-HTTP MCP via createMcpHandler; OAuth + bearer API-key; scoped keys w/ tool-level perms; local stdio bridge; tested w/ Claude Code/Codex; optional Code Mode; MCP contract tests.

1. **Version-pinned `firecrawl_*` MCP server** — implement the exact tool set of firecrawl-mcp-server v3.28.2 (`firecrawl_scrape`, `_crawl`, `_map`, `_search`, `_extract`, `_check_crawl_status`, interact, etc.). — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
2. **Stateless Streamable-HTTP MCP** — serve MCP over HTTP via `createMcpHandler` on a Worker (no long-lived socket), so it runs scale-to-zero. — value:H · feasibility:H · cost:L · differentiation:H **[SELECTED]**
3. **Search-only MCP profile** — a reduced 9-tool surface for search-centric agents, selectable by endpoint path. — value:M · feasibility:H · cost:L · differentiation:H **[SELECTED]**
4. **OAuth + bearer API-key auth** — MCP accepts both an OAuth 2.1 bearer (reusing the projectsites.dev issuer) and a scoped API key. — value:H · feasibility:M · cost:M · differentiation:M **[SELECTED]**
5. **Scoped keys with tool-level perms** — API keys carry an allow-list of tools/routes + rate + spend scope. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
6. **Local stdio bridge** — a tiny npx bridge exposing the hosted MCP over stdio for Claude Code/Codex local config. — value:H · feasibility:H · cost:L · differentiation:H **[SELECTED]**
7. **MCP contract tests** — assert tool names/schemas/results match the pinned Firecrawl MCP version in CI. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
8. **Tested-with-Claude-Code/Codex matrix** — automated smoke that both clients can list + call every tool against prod. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
9. **Drop-in SDK compatibility** — publish nothing new: document that `@mendable/firecrawl-js`/`firecrawl-py` work by pointing `apiUrl` at fuegol.ink. — value:H · feasibility:H · cost:L · differentiation:H **[SELECTED]**
10. **Native `@fuegol/sdk` (thin)** — optional typed client generated from our OpenAPI for teams wanting first-party types. — value:M · feasibility:H · cost:L · differentiation:M
11. **CLI (`fuegol`)** — scrape/crawl/search/monitor from the terminal with streaming output. — value:M · feasibility:H · cost:L · differentiation:H
12. **Code Mode (optional)** — expose tools as a typed JS API the model writes code against, per CF's Code Mode pattern. — value:M · feasibility:M · cost:M · differentiation:H
13. **MCP resource endpoints** — expose crawl results/datasets as MCP resources, not just tools. — value:M · feasibility:M · cost:M · differentiation:H
14. **Per-tool rate limiting** — independent limits per MCP tool to protect expensive ops. — value:M · feasibility:H · cost:L · differentiation:M
15. **MCP prompts** — ship prebuilt MCP prompt templates (research, migrate-from-firecrawl). — value:M · feasibility:H · cost:L · differentiation:H
16. **OpenAPI → Postman/Insomnia collections** — generated collections for manual exploration. — value:L · feasibility:H · cost:L · differentiation:L
17. **Language SDK examples generator** — auto-emit TS/Python/cURL snippets per endpoint from OpenAPI. — value:M · feasibility:H · cost:L · differentiation:M
18. **MCP auth via dynamic client registration** — support MCP's OAuth DCR flow for zero-config clients. — value:M · feasibility:M · cost:M · differentiation:H
19. **Key usage analytics** — per-key call counts, spend, error rates in the dashboard. — value:M · feasibility:H · cost:L · differentiation:M
20. **Tool result caching** — cache idempotent MCP tool results briefly to cut cost. — value:M · feasibility:H · cost:L · differentiation:M
21. **MCP server discovery card** — publish a `.well-known`/registry card for CF + ProjectSites MCP catalogs. — value:M · feasibility:H · cost:L · differentiation:H
22. **Streaming tool results** — stream long scrape/crawl output over Streamable-HTTP. — value:M · feasibility:M · cost:M · differentiation:H
23. **Playground "copy as MCP call"** — dashboard button turns a UI action into an MCP tool invocation. — value:M · feasibility:M · cost:L · differentiation:H
24. **SDK compat shim notes** — document any param our v2 adds so SDK users opt in safely. — value:L · feasibility:H · cost:L · differentiation:L
25. **GitHub Action** — `fuegol-scrape` reusable Action for CI data pulls. — value:M · feasibility:H · cost:L · differentiation:H
26. **MCP server versioning header** — advertise the Firecrawl MCP version we track. — value:M · feasibility:H · cost:L · differentiation:M
27. **Zod-validated tool I/O** — every MCP tool validates input+output against shared contracts. — value:M · feasibility:H · cost:L · differentiation:M
28. **Interactive MCP debugger** — a web console to call tools + inspect raw JSON-RPC. — value:M · feasibility:M · cost:M · differentiation:H
29. **Config snippet generator** — one-click `claude mcp add` + `.mcp.json` blocks with the user's key. — value:M · feasibility:H · cost:L · differentiation:H
30. **Backward-compat MCP alias** — accept the literal `firecrawl-mcp` server name for zero-edit migration. — value:M · feasibility:H · cost:L · differentiation:H

---

## G. Website & dashboard

Selected baseline: cinematic homepage; rate-limited public demo (no signup); visual API playground; key create/rotate/perms; crawl status/graph/traces; searchable job history; orgs/workspaces/teams; real-time credit balances; interactive docs/onboarding.

1. **Cinematic homepage** — black + cyan, animated hero demonstrating a live scrape→Markdown transformation above the fold. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
2. **No-signup rate-limited demo** — paste a URL on the homepage, get real Markdown back (Turnstile-gated, IP-rate-limited). — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
3. **Visual API playground** — build a request via form, see live cURL/TS/Python + the real response, "run" against your key. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
4. **Key create/rotate/scope UI** — issue keys, set tool/route scopes + spend caps, rotate with grace window. — value:H · feasibility:H · cost:L · differentiation:M **[SELECTED]**
5. **Crawl status + live graph + traces** — per-job dashboard: progress counters, link graph, action/screenshot timeline. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
6. **Searchable job history** — filter/sort past scrapes/crawls/searches by URL, status, cost, date. — value:H · feasibility:H · cost:L · differentiation:M **[SELECTED]**
7. **Real-time credit balance** — live-updating credit/spend meter in the header via WebSocket. — value:H · feasibility:M · cost:L · differentiation:H **[SELECTED]**
8. **Interactive onboarding** — guided first-scrape + first-key + copy-your-MCP-config walkthrough. — value:H · feasibility:M · cost:L · differentiation:H **[SELECTED]**
9. **Firecrawl migration wizard** — paste your Firecrawl key/config, get a ready-to-run fuegol config + a cost comparison. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
10. **Orgs/workspaces/teams** — multi-member orgs with role-based access to keys + jobs. — value:M · feasibility:M · cost:M · differentiation:M
11. **Result viewer** — rendered Markdown/HTML/JSON tabs + screenshot preview per job. — value:M · feasibility:H · cost:L · differentiation:M
12. **Usage analytics dashboard** — calls, credits, latency, error-rate charts over time. — value:M · feasibility:H · cost:L · differentiation:M
13. **Webhook manager** — register/test/replay webhooks with signature inspection. — value:M · feasibility:M · cost:L · differentiation:H
14. **Monitor manager** — CRUD scheduled monitors + diff history. — value:M · feasibility:M · cost:M · differentiation:H
15. **Saved requests / collections** — persist + share parameterized requests. — value:M · feasibility:H · cost:L · differentiation:M
16. **Dataset export center** — download crawl outputs as JSON/CSV/NDJSON/Parquet. — value:M · feasibility:M · cost:L · differentiation:H
17. **Live status page** — public uptime + provider health, served from Workers. — value:M · feasibility:H · cost:L · differentiation:M
18. **Dark/light + motion-reduce** — WCAG 2.2 AA themes with `prefers-reduced-motion`. — value:M · feasibility:H · cost:L · differentiation:M
19. **In-app cost estimator** — live credit preview as you edit a request. — value:M · feasibility:H · cost:L · differentiation:H
20. **Team activity feed** — audit log of key/job/billing events. — value:M · feasibility:H · cost:L · differentiation:M
21. **Embeddable playground widget** — a shareable iframe of the demo for blog posts. — value:L · feasibility:M · cost:L · differentiation:H
22. **Keyboard-first command palette** — ⌘K to run any action. — value:M · feasibility:M · cost:L · differentiation:H
23. **Result diff viewer** — side-by-side of two crawls/scrapes. — value:M · feasibility:M · cost:L · differentiation:H
24. **Onboarding checklist + progress** — gamified setup completion. — value:L · feasibility:H · cost:L · differentiation:M
25. **Shareable read-only job links** — signed links to a single job's results. — value:M · feasibility:H · cost:L · differentiation:M
26. **In-dashboard docs search** — embedded search over docs + OpenAPI. — value:M · feasibility:H · cost:L · differentiation:M
27. **Account-level spend alerts UI** — set thresholds + notification channels. — value:M · feasibility:H · cost:L · differentiation:M
28. **Live log stream per job** — tail structured logs in the UI. — value:M · feasibility:M · cost:L · differentiation:H
29. **Mobile-responsive dashboard** — full job + key management on phones. — value:M · feasibility:H · cost:L · differentiation:L
30. **AI assistant in dashboard** — "explain this error", "build this request" chat grounded in docs. — value:M · feasibility:M · cost:M · differentiation:H

---

## H. Pricing, Stripe & economics

Selected baseline: ~half-price tiers ($0/$8/$42/$167/$300); cost modeling + margin floors; Stripe Checkout subs; Customer Portal; idempotent internal credit ledger; usage-meter reconciliation + webhooks; spend ceilings; per-job price estimates; user-controlled overages/recharge.

1. **~Half-price public tiers** — $0 / $8 / $42 / $167 / $300 published tiers mapped to credit allotments vs Firecrawl's ladder. — value:H · feasibility:H · cost:L · differentiation:H **[SELECTED]**
2. **Per-operation cost model + margin floor** — a spreadsheet-backed model (Workers + Browser-minutes + AI tokens + R2) enforcing a minimum margin per op. — value:H · feasibility:M · cost:L · differentiation:H **[SELECTED]**
3. **Stripe Checkout subscriptions** — plan purchase/upgrade via Stripe Checkout with Link enabled on all money flows. — value:H · feasibility:H · cost:L · differentiation:M **[SELECTED]**
4. **Stripe Customer Portal** — self-serve plan change/cancel/payment-method/invoices. — value:H · feasibility:H · cost:L · differentiation:L **[SELECTED]**
5. **Idempotent internal credit ledger** — D1 double-entry ledger, every job debits atomically; idempotency keys prevent double-charge. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
6. **Usage-meter reconciliation** — Stripe usage events reconciled against the internal ledger nightly; drift alerts. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
7. **Per-job price estimate** — return an estimated credit cost before running (and in the dashboard preview). — value:H · feasibility:H · cost:L · differentiation:H **[SELECTED]**
8. **Spend ceilings + hard stop** — per-key + per-org hard caps that reject new jobs at 402 when exceeded. — value:H · feasibility:H · cost:L · differentiation:H **[SELECTED]**
9. **User-controlled overages / auto-recharge** — opt-in to buy more credits automatically at a threshold, with a cap. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
10. **Transparent pricing page with comparison** — side-by-side fuegol vs Firecrawl cost per 1k scrapes. — value:M · feasibility:H · cost:L · differentiation:H
11. **Annual billing discount** — ~2 months free on annual plans. — value:M · feasibility:H · cost:L · differentiation:L
12. **Metered pay-as-you-go** — no plan, pure per-credit billing via Stripe metered price. — value:M · feasibility:M · cost:M · differentiation:M
13. **Free-tier anti-abuse** — Turnstile + per-IP + per-account free limits to protect margin. — value:M · feasibility:H · cost:L · differentiation:M
14. **Credit expiry policy** — monthly credits reset; purchased credits roll with TTL. — value:M · feasibility:H · cost:L · differentiation:L
15. **Invoice line-item detail** — itemize by operation type for enterprise accounting. — value:M · feasibility:H · cost:L · differentiation:M
16. **Cost anomaly alerts** — detect spend spikes per account and notify. — value:M · feasibility:M · cost:L · differentiation:H
17. **Team/seat pricing** — optional per-seat add-on for orgs. — value:M · feasibility:H · cost:L · differentiation:L
18. **Self-host $0 forever** — OSS self-host has no license fee; only CF usage costs (growth lever). — value:H · feasibility:H · cost:L · differentiation:H
19. **Volume discount tiers** — automatic per-credit price breaks at high volume. — value:M · feasibility:H · cost:L · differentiation:M
20. **Promo/coupon support** — Stripe coupons for launch + migration incentives. — value:M · feasibility:H · cost:L · differentiation:M
21. **Dunning + grace handling** — retry failed payments, grace period before suspend. — value:M · feasibility:H · cost:L · differentiation:L
22. **Per-feature metering** — separate meters for scrape vs browser-session vs AI-extract. — value:M · feasibility:M · cost:M · differentiation:H
23. **Real-time margin dashboard (internal)** — live blended margin per op class. — value:M · feasibility:M · cost:L · differentiation:H
24. **Credit gifting / grants** — admin can grant credits (OSS contributors, design partners). — value:L · feasibility:H · cost:L · differentiation:M
25. **Webhook on low balance** — notify before hard stop. — value:M · feasibility:H · cost:L · differentiation:M
26. **Price experimentation flags** — feature-flagged pricing variants for A/B (not for taste — for willingness-to-pay). — value:M · feasibility:M · cost:L · differentiation:M
27. **Tax handling via Stripe Tax** — automatic tax calculation + collection. — value:M · feasibility:H · cost:L · differentiation:L
28. **Refund + credit-adjustment flow** — admin-initiated refunds reflected in the ledger. — value:L · feasibility:H · cost:L · differentiation:L
29. **Enterprise custom quotes** — contact-sales path with manual plan provisioning. — value:L · feasibility:H · cost:L · differentiation:L
30. **Migration credit match** — match a new user's remaining Firecrawl credits as launch promo. — value:M · feasibility:M · cost:L · differentiation:H

---

## I. Cloudflare architecture

Selected baseline: Workers+Hono; native browser-rendering /crawl; Browser Run Quick Actions + sessions; Queues + Workflows; R2 + D1; Durable Objects where justified; prod domain routing; genuine Deploy-to-Cloudflare template (dependency-isolated subdir — monorepo button limitation); secure bindings + reproducible provisioning.

1. **Workers + Hono API core** — Hono router on Workers as the single entrypoint for all `/v2/*` routes. — value:H · feasibility:H · cost:L · differentiation:M **[SELECTED]**
2. **Browser Rendering for /scrape + /crawl** — use the native Browser Rendering binding (`env.BROWSER`) + Puppeteer for JS pages, sessions, screenshots. — value:H · feasibility:H · cost:M · differentiation:H **[SELECTED]**
3. **Queues-backed async pipeline** — producer Worker enqueues jobs; consumer Worker processes with retries + DLQ. — value:H · feasibility:H · cost:M · differentiation:M **[SELECTED]**
4. **Workflows for durable long jobs** — model multi-step crawls/research as Cloudflare Workflows with checkpointed steps + auto-resume. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
5. **R2 for results + assets** — store Markdown/HTML/screenshots/datasets in R2 with signed temporary URLs. — value:H · feasibility:H · cost:L · differentiation:M **[SELECTED]**
6. **D1 for registry + ledger** — jobs, keys, orgs, credit ledger, URL-state (ETags) in D1 with read replicas. — value:H · feasibility:H · cost:L · differentiation:M **[SELECTED]**
7. **Durable Objects only where justified** — one DO per crawl (frontier/progress) + per browser session + per origin (politeness); nothing else. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
8. **Genuine Deploy-to-Cloudflare template** — a dependency-isolated subdir repo (not the monorepo, which the button can't handle) wired for one-click deploy. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
9. **Reproducible provisioning** — `wrangler.jsonc` + a `provision` script that creates D1/R2/Queues/KV bindings idempotently from config. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
10. **KV for hot config + robots cache** — feature flags, provider config, robots.txt cached in Workers KV. — value:M · feasibility:H · cost:L · differentiation:M
11. **Vectorize for semantic features** — embeddings for change detection + corpus search. — value:M · feasibility:M · cost:M · differentiation:H
12. **AI Gateway in front of models** — route Workers AI + external LLMs through AI Gateway for caching, rate limits, cost logging. — value:M · feasibility:H · cost:L · differentiation:H
13. **Workers AI for extraction/synthesis** — Llama/other models on Workers AI for first-pass extraction + research. — value:M · feasibility:H · cost:L · differentiation:H
14. **Cron Triggers for monitors** — scheduled monitors + reconciliation jobs via Cron Triggers. — value:M · feasibility:H · cost:L · differentiation:M
15. **Smart Placement** — enable Smart Placement so the API Worker runs near its bindings. — value:M · feasibility:H · cost:L · differentiation:M
16. **Prod domain routing** — `fuegol.ink` apex + `api.fuegol.ink` routes mapped to the Worker. — value:M · feasibility:H · cost:L · differentiation:L
17. **Hyperdrive/Neon fallback (optional)** — only if a relational workload outgrows D1. — value:L · feasibility:M · cost:M · differentiation:L
18. **R2 lifecycle rules** — auto-expire temp assets + enforce retention TTLs. — value:M · feasibility:H · cost:L · differentiation:M
19. **Service bindings between Workers** — split public API / worker-queue-consumer / MCP into bound services. — value:M · feasibility:M · cost:L · differentiation:M
20. **Durable Object alarms** — use DO alarms for crawl timeouts + session idle-stop. — value:M · feasibility:H · cost:L · differentiation:H
21. **Analytics Engine for usage events** — write per-op telemetry to Workers Analytics Engine. — value:M · feasibility:H · cost:L · differentiation:M
22. **Rate Limiting binding** — native Workers rate-limiting binding per key/IP. — value:M · feasibility:H · cost:L · differentiation:M
23. **Secrets Store / env secrets** — provider keys + signing secrets as Worker secrets, never in code. — value:M · feasibility:H · cost:L · differentiation:M
24. **Tail Workers for logging** — ship structured logs via a Tail Worker to the observability sink. — value:M · feasibility:M · cost:L · differentiation:M
25. **Multi-region read replicas (D1 Sessions API)** — low-latency reads for the dashboard globally. — value:M · feasibility:M · cost:L · differentiation:M
26. **Container/sandbox for heavy parse** — Cloudflare Containers for CPU-heavy PDF/OCR where Workers limits bind. — value:M · feasibility:M · cost:M · differentiation:H
27. **Queue batching + max-concurrency tuning** — tune batch size + consumer concurrency for throughput vs cost. — value:M · feasibility:H · cost:L · differentiation:M
28. **Preview/staging via Wrangler envs** — ephemeral preview deploys per PR (solo-builder prod-first, but previews for risky migrations). — value:M · feasibility:H · cost:L · differentiation:L
29. **WASM parsers in-Worker** — run `unpdf`/parsers compiled to WASM inside the Worker to avoid extra hops. — value:M · feasibility:M · cost:M · differentiation:H
30. **Health + readiness endpoints** — `/health` + binding self-checks for deploy verification. — value:M · feasibility:H · cost:L · differentiation:M

---

## J. Security, privacy & locality

Selected baseline: SSRF (IPv6/redirects/DNS-rebind); robots.txt + Content Signals; abuse prevention/quotas; tenant authz boundaries; zero-data-retention mode + deletion; PII minimization; signed webhooks + replay protection; explicit locale (no false geo guarantees); browser profile/cookie/secret isolation.

1. **SSRF defense-in-depth** — block private/link-local/metadata IPs across IPv4+IPv6, re-validate after every redirect, pin DNS to defeat rebind. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
2. **robots.txt + Content Signals honoring** — respect `robots.txt` and the Content Signals policy by default, with per-tenant override gating. — value:H · feasibility:H · cost:L · differentiation:H **[SELECTED]**
3. **Tenant authz boundaries** — every job/result/key/dataset is tenant-scoped; cross-tenant access impossible by construction (row-level + binding isolation). — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
4. **Zero-data-retention mode** — per-request flag: process in memory/ephemeral R2, delete immediately, never index. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
5. **Right-to-delete endpoint** — `DELETE` purges a job + its R2 assets + ledger PII references, auditable. — value:H · feasibility:H · cost:L · differentiation:H **[SELECTED]**
6. **PII minimization** — don't persist request bodies/creds; redact-before-store where PII is detected. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
7. **Signed webhooks + replay protection** — HMAC signature + timestamp + nonce; reject stale/replayed deliveries. — value:H · feasibility:H · cost:L · differentiation:H **[SELECTED]**
8. **Honest locality claims** — surface the actual egress region; never claim geo-fidelity we can't guarantee (anti-dark-pattern). — value:M · feasibility:H · cost:L · differentiation:H **[SELECTED]**
9. **Browser profile/cookie/secret isolation** — per-tenant encrypted profiles, no shared cookie jars, secrets scrubbed on teardown. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
10. **Abuse prevention + quotas** — per-key/IP rate limits + anomaly throttling to stop scraping-as-attack. — value:M · feasibility:H · cost:L · differentiation:M
11. **Allow/deny domain lists** — tenant + global block lists (e.g., known-malicious, opt-out sites). — value:M · feasibility:H · cost:L · differentiation:M
12. **Audit log (immutable)** — append-only security event log per org. — value:M · feasibility:H · cost:L · differentiation:M
13. **Key secret hashing** — store only hashed API keys; show plaintext once at creation. — value:H · feasibility:H · cost:L · differentiation:M
14. **CSP Level 3 + Trusted Types (dashboard)** — strict-dynamic + nonce on the SPA. — value:M · feasibility:M · cost:L · differentiation:M
15. **Encryption at rest for profiles/datasets** — per-tenant keys for sensitive R2 objects. — value:M · feasibility:M · cost:M · differentiation:H
16. **Egress IP transparency** — publish our egress ranges so site owners can identify/allow us. — value:M · feasibility:H · cost:L · differentiation:H
17. **Opt-out registry honoring** — honor a site owner's opt-out request end-to-end. — value:M · feasibility:M · cost:L · differentiation:H
18. **Rate-limit response headers** — standard `RateLimit-*` headers on 429. — value:M · feasibility:H · cost:L · differentiation:M
19. **Secret scanning in extraction output** — warn when scraped content contains apparent secrets/keys. — value:M · feasibility:M · cost:M · differentiation:H
20. **DDoS + WAF via Cloudflare** — lean on zone WAF + managed rules for the API edge. — value:M · feasibility:H · cost:L · differentiation:M
21. **Scoped webhook secrets** — per-endpoint signing secret, rotatable. — value:M · feasibility:H · cost:L · differentiation:M
22. **Data residency options** — pin storage to a jurisdiction where offered (R2 location hints). — value:M · feasibility:M · cost:M · differentiation:H
23. **Consent-aware browser auth** — require explicit per-session consent to use supplied credentials. — value:M · feasibility:H · cost:L · differentiation:H
24. **Request provenance signing** — sign our own outbound requests' UA so sites can verify identity. — value:L · feasibility:M · cost:L · differentiation:H
25. **Privacy policy + DPA templates** — publish a DPA + privacy stance for business buyers. — value:M · feasibility:H · cost:L · differentiation:M
26. **Pen-test + threat model doc** — documented threat model (STRIDE) for SSRF/authz/billing. — value:M · feasibility:M · cost:L · differentiation:M
27. **Key least-privilege defaults** — new keys default to minimal scope. — value:M · feasibility:H · cost:L · differentiation:M
28. **Tamper-evident ledger** — hash-chained credit ledger entries. — value:L · feasibility:M · cost:M · differentiation:H
29. **PII classification tags on datasets** — label datasets that contain detected PII. — value:M · feasibility:M · cost:L · differentiation:H
30. **Security.txt + disclosure policy** — published `security.txt` + coordinated-disclosure process. — value:L · feasibility:H · cost:L · differentiation:L

---

## K. Reliability & testing

Selected baseline: reproducible compat benchmarks; MCP+REST contract-test pipelines; real-browser golden paths; latency/accuracy/coverage metrics; durable retries + DLQ; jittered exponential backoff; provider circuit breakers; Sentry/OTel tracing; cost-anomaly detection.

1. **Reproducible compat benchmark** — a scripted suite scraping a fixed site corpus, comparing our output to recorded Firecrawl output with a scored diff. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
2. **MCP + REST contract-test pipeline** — CI runs both the SDK suites and MCP tool-schema assertions against prod on every deploy. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
3. **Real-browser golden paths** — Playwright specs that drive the dashboard homepage→scrape→result→key flows at 6 breakpoints. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
4. **Durable retries + DLQ** — Queue consumer retries with max-attempts then dead-letters; a DLQ drain + replay tool. — value:H · feasibility:H · cost:L · differentiation:M **[SELECTED]**
5. **Jittered exponential backoff** — all outbound fetch/provider calls use capped exponential backoff with full jitter. — value:H · feasibility:H · cost:L · differentiation:M **[SELECTED]**
6. **Provider circuit breakers** — trip a provider/source off on error-rate/latency breach, auto half-open to recover. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
7. **Sentry + OTel tracing** — `@sentry/cloudflare` on the Worker + Workers Tracing spans across queue/workflow hops with request-id correlation. — value:H · feasibility:H · cost:L · differentiation:M **[SELECTED]**
8. **Cost-anomaly detection** — automated alert when per-op cost or spend deviates from baseline. — value:H · feasibility:M · cost:L · differentiation:H **[SELECTED]**
9. **Latency/accuracy/coverage metrics** — publish p50/p95 latency, extraction-accuracy, and crawl-coverage dashboards. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
10. **Chaos/fault injection** — inject timeouts/5xx into provider calls in staging to prove resilience. — value:M · feasibility:M · cost:M · differentiation:H
11. **Synthetic uptime probes** — scheduled Worker hits every route + records SLO adherence. — value:M · feasibility:H · cost:L · differentiation:M
12. **Golden-output snapshot regression** — freeze expected outputs for a corpus; fail on regression. — value:M · feasibility:M · cost:M · differentiation:H
13. **Load testing harness** — k6/Workers-based load tests for crawl throughput + rate limits. — value:M · feasibility:M · cost:M · differentiation:M
14. **Vitest unit coverage gate** — contracts + core logic unit-tested with a coverage floor. — value:M · feasibility:H · cost:L · differentiation:M
15. **AI vision QA on dashboard** — screenshot every route, score ≥8/10 on a rubric per deploy. — value:M · feasibility:M · cost:M · differentiation:H
16. **Idempotency tests** — prove duplicate job submissions don't double-charge. — value:M · feasibility:H · cost:L · differentiation:M
17. **SSRF regression suite** — automated tests asserting blocked IP ranges + redirect re-validation. — value:H · feasibility:M · cost:L · differentiation:H
18. **Queue backpressure handling** — tests for graceful degradation under flood. — value:M · feasibility:M · cost:M · differentiation:H
19. **Error-budget / SLO policy** — defined SLOs with burn-rate alerts. — value:M · feasibility:M · cost:L · differentiation:M
20. **Extraction eval set + rubric** — labeled pages scored for extraction quality, tracked over time. — value:M · feasibility:M · cost:M · differentiation:H
21. **Canary deploy + auto-rollback** — ship to a canary route, auto `wrangler rollback` on error spike. — value:M · feasibility:M · cost:M · differentiation:H
22. **Dead-letter alerting** — page when the DLQ grows beyond threshold. — value:M · feasibility:H · cost:L · differentiation:M
23. **Prod E2E on every deploy** — Playwright against the live URL gates "done". — value:H · feasibility:H · cost:L · differentiation:M
24. **Browser-session reliability tests** — assert session create/resume/stop under concurrency. — value:M · feasibility:M · cost:M · differentiation:H
25. **Webhook delivery tests** — assert signature, retry, and replay-rejection behavior. — value:M · feasibility:H · cost:L · differentiation:M
26. **D1 migration tests + Time Travel drills** — test migrations + rehearse D1 Time-Travel restore. — value:M · feasibility:M · cost:L · differentiation:H
27. **Timeout budgets per stage** — enforce+test per-stage deadlines across the pipeline. — value:M · feasibility:H · cost:L · differentiation:M
28. **Flaky-test quarantine** — auto-quarantine + report flaky specs. — value:L · feasibility:M · cost:L · differentiation:M
29. **Observability dashboards shipped** — prebuilt Sentry/Analytics dashboards for key SLIs. — value:M · feasibility:H · cost:L · differentiation:M
30. **Compat drift CI gate** — the schema-drift watcher result blocks release if divergence detected. — value:M · feasibility:M · cost:L · differentiation:H

---

## L. README, distribution & growth

Selected baseline: 4 original generated product illustrations; verified Deploy button; architecture diagrams + charts + pricing tables; hosted + self-host quickstarts; evidence-based compat matrices; TS/Python/cURL/CLI/MCP examples; authentic screenshots + terminal demo; Firecrawl migration guide; original branding + licensing + contributor onboarding.

1. **4 original generated product illustrations** — brand-locked (black+cyan) hero/architecture/flow/compat illustrations generated via Workers AI / Replicate, not stock. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
2. **Verified Deploy-to-Cloudflare button** — a button proven to work from the isolated subdir repo, with a post-deploy checklist. — value:H · feasibility:M · cost:M · differentiation:H **[SELECTED]**
3. **Evidence-based compatibility matrix** — a table mapping every Firecrawl endpoint/MCP tool → fuegol status (full/partial/n/a) with links to the passing contract test. — value:H · feasibility:M · cost:L · differentiation:H **[SELECTED]**
4. **Firecrawl migration guide** — step-by-step: swap `apiUrl`, keep SDK/MCP as-is, cost comparison, gotchas. — value:H · feasibility:H · cost:L · differentiation:H **[SELECTED]**
5. **Hosted + self-host quickstarts** — two parallel "60-second start" paths, each copy-pasteable. — value:H · feasibility:H · cost:L · differentiation:M **[SELECTED]**
6. **Architecture diagram + data-flow charts** — Mermaid diagrams of the Workers/Queues/Workflows/DO/R2/D1 topology. — value:H · feasibility:H · cost:L · differentiation:H **[SELECTED]**
7. **TS/Python/cURL/CLI/MCP example gallery** — the same scrape shown five ways, all runnable. — value:H · feasibility:H · cost:L · differentiation:H **[SELECTED]**
8. **Authentic screenshots + terminal demo** — real dashboard screenshots + an asciinema/terminal GIF of a live scrape (no mockups). — value:H · feasibility:M · cost:L · differentiation:H **[SELECTED]**
9. **Original branding + licensing + contributor onboarding** — a distinct logo/name/palette, MIT/Apache license, and a `CONTRIBUTING.md` + good-first-issues. — value:H · feasibility:H · cost:L · differentiation:H **[SELECTED]**
10. **Pricing table in README** — the 5 tiers + a cost-vs-Firecrawl column, kept in sync with the pricing page. — value:M · feasibility:H · cost:L · differentiation:M
11. **"Why Cloudflare-native" section** — scale-to-zero, global edge, one-vendor-simplicity narrative. — value:M · feasibility:H · cost:L · differentiation:H
12. **Benchmark results published** — reproducible latency/accuracy/cost numbers vs Firecrawl with the script linked. — value:M · feasibility:M · cost:M · differentiation:H
13. **Feature comparison chart** — fuegol vs Firecrawl vs alternatives on a feature grid. — value:M · feasibility:H · cost:L · differentiation:H
14. **Interactive README via GitHub** — collapsible sections, badges (CI, coverage, license, deploy). — value:M · feasibility:H · cost:L · differentiation:M
15. **Launch assets (HN/PH/Reddit)** — tailored launch posts + a demo video for distribution channels. — value:M · feasibility:M · cost:L · differentiation:H
16. **llms.txt + llms-full.txt** — machine-readable site/docs manifest for AI crawlers (dogfood). — value:M · feasibility:H · cost:L · differentiation:H
17. **Blog: "Firecrawl-compatible on Cloudflare"** — a deep technical post doubling as SEO + GEO content. — value:M · feasibility:M · cost:L · differentiation:H
18. **Self-host cost calculator** — estimate monthly CF cost for a given volume. — value:M · feasibility:M · cost:L · differentiation:H
19. **Video walkthrough** — a 2-minute narrated demo embedded in the README + homepage. — value:M · feasibility:M · cost:M · differentiation:H
20. **Changelog + release notes** — automated, human-readable, linked from README. — value:M · feasibility:H · cost:L · differentiation:M
21. **Docs site (versioned)** — a proper docs site generated from OpenAPI + MDX guides. — value:M · feasibility:M · cost:M · differentiation:M
22. **"Powered by Cloudflare" credibility strip** — logos of primitives used, linking to CF docs. — value:L · feasibility:H · cost:L · differentiation:M
23. **Community: Discord/Discussions** — a support + feedback channel linked everywhere. — value:M · feasibility:H · cost:L · differentiation:M
24. **Good-first-issue labeling + roadmap** — public roadmap + curated starter issues. — value:M · feasibility:H · cost:L · differentiation:M
25. **Template repo for integrations** — starter repos (Next.js, worker, agent) using fuegol. — value:M · feasibility:M · cost:L · differentiation:H
26. **SEO: per-use-case landing pages** — "scrape for RAG", "crawl for LLM training" targeted pages. — value:M · feasibility:M · cost:L · differentiation:H
27. **Social preview cards** — OG 1200×630 brand images per key page. — value:L · feasibility:H · cost:L · differentiation:M
28. **Star-history + adoption badges** — social proof surfaced in README. — value:L · feasibility:H · cost:L · differentiation:L
29. **Testimonial / case-study slots** — structured spaces for design-partner quotes. — value:L · feasibility:H · cost:L · differentiation:M
30. **Open telemetry of compat status** — a public live page showing current compat test pass-rate. — value:M · feasibility:M · cost:L · differentiation:H

---

## Pass 1 convergence note

Pass 1 produced 360 ideas (30 × 12) and converged on the **108 selected** (9 × 12) that together form the mandatory first implementation wave. The selection was driven by *value × differentiation, gated by feasibility, penalized by cost* — which pulled the wave decisively toward **contract fidelity and migration frictionlessness** (exact v2 schemas, SDK/MCP drop-in, migration wizard, evidence-based compat matrix) as the acquisition engine, and toward **Cloudflare-native correctness** (Workers+Hono, Browser Rendering, Queues, Workflows, DOs only where justified, R2/D1, reproducible provisioning, a genuinely-working Deploy button) as the moat Firecrawl clones can't cheaply copy. Economics selections lock a defensible ~half-price position behind a real cost model, an idempotent credit ledger, per-job estimates, and hard spend ceilings so the price cut never eats margin; security selections (SSRF depth, zero-retention, tenant isolation, signed webhooks, honest locality) make the platform safe to adopt for business data. The deferred 252 ideas are not rejected — they are the pre-scored Pass-2+ reservoir (deeper research connectors, session pooling, GraphQL/Code-Mode surfaces, advanced evals, growth content) to be re-ranked deterministically from these same axes once the first wave ships and real usage data sharpens the value estimates. First wave done-definition: every selected item ships behind a feature flag, with a failing-test-first E2E against the live `fuegol.ink` deploy, before it counts as complete.
