import type { BrowserQuickAction, WorkersAiBinding, EngineEnv } from '@fuegol/engine';
import type { CrawlCoordinator } from './crawl-do';
import type { ExtractCoordinator } from './extract-do';

/** Worker environment bindings + vars. All data-plane bindings are optional so the
 *  Worker deploys and serves the free static tier on a bare account. */
export interface Env {
  BROWSER?: BrowserQuickAction;
  AI?: WorkersAiBinding;
  CF_ACCOUNT_ID?: string;
  CF_BROWSER_TOKEN?: string;
  /** Comma-separated accepted API keys (secret). Empty ⇒ demo-only. */
  API_KEYS?: string;
  /** "true" allows keyless rate-limited demo access to scrape/map/crawl. */
  DEMO_MODE?: string;
  USER_AGENT?: string;
  SERVICE_ORIGIN?: string;
  /** Web-search provider selection + keys (secrets on hosted; self-host sets its own). */
  SEARCH_PROVIDER?: string;
  EXA_API_KEY?: string;
  TAVILY_API_KEY?: string;
  /** Durable Object namespace backing async crawl + batch jobs. */
  CRAWL?: DurableObjectNamespace<CrawlCoordinator>;
  /** Durable Object namespace backing async extract jobs. */
  EXTRACT?: DurableObjectNamespace<ExtractCoordinator>;
  /** D1 — API keys + usage/credit ledger. */
  DB?: D1Database;
  /** R2 — screenshots + result artifacts; served via /assets/*. */
  ARTIFACTS?: R2Bucket;
  ASSET_BASE?: string;
  /** Secret used to HMAC-sign outbound crawl/batch webhooks. */
  WEBHOOK_SECRET?: string;
}

/** Project the Worker Env onto the engine's expected binding surface. */
export function engineEnv(env: Env): EngineEnv {
  return {
    BROWSER: env.BROWSER,
    AI: env.AI,
    CF_ACCOUNT_ID: env.CF_ACCOUNT_ID,
    CF_BROWSER_TOKEN: env.CF_BROWSER_TOKEN,
    USER_AGENT: env.USER_AGENT,
    SEARCH_PROVIDER: env.SEARCH_PROVIDER,
    EXA_API_KEY: env.EXA_API_KEY,
    TAVILY_API_KEY: env.TAVILY_API_KEY,
    ARTIFACTS: env.ARTIFACTS,
    ASSET_BASE: env.ASSET_BASE ?? env.SERVICE_ORIGIN,
  };
}
