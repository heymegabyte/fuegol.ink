# Self-hosting fuegol.ink

Two supported paths. The **manual path is verified working today**; the one-click button is a
tracked increment (see the honesty note at the bottom).

## Manual (verified)

```sh
git clone https://github.com/heymegabyte/fuegol.ink.git
cd fuegol.ink
pnpm install
cd apps/api
# authenticate wrangler (wrangler login, or CLOUDFLARE_API_TOKEN / global key env)
pnpm exec wrangler deploy
```

That deploys the Firecrawl-compatible API Worker to your own Cloudflare account. The free static
tier (scrape + map) works with **zero extra provisioning**. To unlock higher tiers, uncomment the
bindings in `apps/api/wrangler.jsonc` and provision them:

| Binding | Enables | Provision |
|---|---|---|
| `browser` (Browser Rendering) | JS-rendered scrape, screenshots, `{type:"json"}` extraction | Enable Browser Rendering on your account |
| `ai` (Workers AI) | AI extraction + summaries | none (just bind) |
| `DB` (D1) | API keys, credit ledger, job metadata | `wrangler d1 create fuegol` |
| `ARTIFACTS` (R2) | crawl artifacts, screenshots, result bundles | `wrangler r2 bucket create fuegol-artifacts` |
| `CRAWL_QUEUE` (Queues) | async crawl / batch | `wrangler queues create fuegol-crawl` |

Self-hosted deployments need **no Stripe credentials** and never route through fuegol.ink's
hosted infrastructure. Your Cloudflare account, your data, your cost.

## One-click Deploy to Cloudflare — tracked increment

```md
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/heymegabyte/fuegol.ink)
```

**Honesty note:** Cloudflare's Deploy button requires the target to be a *dependency-isolated* Worker;
it does not resolve a pnpm monorepo's `workspace:*` packages at build time (documented limitation).
A self-contained standalone Worker (with `@fuegol/contracts` + `@fuegol/engine` inlined/vendored) is
**Increment 7** on the roadmap and will be published here once tested from a clean Cloudflare account.
Until then, use the verified manual path above. We will not display a "working" badge we haven't tested.
