# Benchmarks

> **Honesty contract.** Every number here comes from a real request to the live production API
> (`https://fuegol-api.manhattan.workers.dev`). Nothing is fabricated, extrapolated, or borrowed from
> marketing. The harness is committed at [`e2e/benchmark/run.mjs`](../e2e/benchmark/run.mjs) — re-run
> it and you will get numbers in the same shape (live-internet variance applies; see Caveats).
>
> **Snapshot date:** 2026-10-08 · **Runner:** a single developer laptop over residential broadband
> (so figures include client→edge network RTT, not isolated server-side timing) · **Target API:** the
> same Worker that serves real traffic.

## How to reproduce

```bash
node e2e/benchmark/run.mjs
# knobs: FUEGOL_API=<base-url>  RUNS=<n per URL, default 3>
```

The harness warms the Worker once, then times each corpus URL `RUNS` times (default 3), reports the
per-URL **median** plus overall **P50/P95** across all requests, and finishes with one measurement per
non-static tier (browser, map, PDF parse). Latency is wall-clock around `fetch()` — DNS + TLS + the
full edge→target→markdown round trip.

## Scrape — static tier (markdown), representative corpus

| Corpus item | Median latency | Success | Markdown chars | Tier engaged |
|---|---:|---:|---:|---|
| static (example.com) | 34 ms | 3/3 | 156 | http |
| e-commerce (books.toscrape.com) | 105 ms | 3/3 | 7,266 | http |
| wiki (en.wikipedia.org/wiki/Cloudflare) | 188 ms | 3/3 | 123,116 | http |
| news (news.ycombinator.com) | 127 ms | 3/3 | 12,542 | browser-escalated¹ |
| docs (developer.mozilla.org/en-US/) | 58 ms | 3/3 | 311 | http² |
| blog (css-tricks.com) | 80 ms | 3/3 | 9,556 | http |

**Overall (n = 18 requests, 3 per URL): P50 ≈ 100 ms · P95 ≈ 1–2.1 s.**

The P95 is dominated by occasional **browser-tier escalation cold starts**, not by the static path —
pure-static pages land in the **30–240 ms** band, scaling with page size (Wikipedia's 123 KB of
markdown is the slow end, example.com the fast end).

¹ Hacker News intermittently serves thin HTML to datacenter egress, which trips fuegol's
automatic escalation (static markdown under the threshold → re-fetch via Browser Rendering). The
result is still correct (12.5 KB of real markdown); the tier header just reflects the escalation.

² **Honest coverage caveat.** MDN's `/en-US/` landing page is a JavaScript app shell — the static
tier extracts ~311 characters of genuinely-present content. For JS-driven SPAs, force the browser
tier (`waitFor` / `actions`) or target a content page rather than the shell. This is a property of
the page, not a scrape failure — fuegol returns what is actually in the static HTML, never invented filler.

## By tier / adjacent operation

| Operation | Median latency | Success | Result | Tier |
|---|---:|---:|---|---|
| scrape — browser, forced (quotes.toscrape.com/js, cache-busted) | ~1.5 s | 3/3 | 1,657 md chars | browser |
| map (books.toscrape.com) | ~0.2–0.5 s | — | 73 URLs | http |
| parse — PDF → markdown via `unpdf` (pdfobject sample) | ~0.7 s | — | 2,848 md chars | n/a |

- **Browser tier ≈ 1.5 s median** with a fresh render each call (the harness cache-busts the URL per
  run so no warm instance is reused). First-call-after-idle cold starts run higher (~2–3 s); when a
  warm Browser Rendering instance *is* reused, repeat renders of the same URL have been observed under
  100 ms — a real perf win, but not the number we quote, because it isn't representative of a fresh job.
- **Map ≈ a few hundred ms** for a sitemap + link-discovery pass returning dozens of URLs.
- **Parse ≈ 0.7 s** for a small PDF (fetch + `unpdf`/PDF.js text extraction, fully inside the Worker).

## Caveats (read these before quoting a number)

1. **Network RTT is included.** These are end-to-end client-perceived latencies from one laptop, not
   server-side spans. Your mileage varies with distance to the nearest Cloudflare PoP and to the target.
2. **Small n, live targets.** 3 samples/URL against the real internet. Run-to-run variance of tens of
   ms (static) to hundreds of ms (browser) is normal and expected.
3. **Targets throttle.** Hammering the same origin repeatedly (the harness hits books.toscrape.com for
   both the corpus row and the map row) draws rate-limiting, so you may see an occasional `2/3`. When a
   target genuinely refuses (e.g. w3.org 403s datacenter egress), the API returns a proper
   `{success:false, code:"SCRAPE_SITE_ERROR"}` envelope — **it never fabricates a document**. Isolated
   single calls to the same endpoints succeed. Correct failure behaviour is a feature, not a defect.
4. **No synthetic fixtures here.** This corpus is public, real-world sites. A fixture-based corpus
   (controlled static/JS/paginated/i18n/error pages) for regression-grade coverage numbers is tracked
   in the roadmap and will live alongside these wall-clock figures.

## What we are *not* claiming

No head-to-head "X× faster than Firecrawl" number. That would require running both products under
identical conditions and is not something we will assert without that apparatus. What these figures
establish is concrete and verifiable: **fuegol's static scrape path is sub-150 ms at the median, the
browser tier is ~1.5 s, and every request either returns real extracted content or an honest error.**
