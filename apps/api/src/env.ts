import type { BrowserQuickAction, WorkersAiBinding, EngineEnv } from '@fuegol/engine';
import type { CrawlCoordinator } from './crawl-do';

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
  /** Durable Object namespace backing async crawl jobs. */
  CRAWL?: DurableObjectNamespace<CrawlCoordinator>;
}

/** Project the Worker Env onto the engine's expected binding surface. */
export function engineEnv(env: Env): EngineEnv {
  return {
    BROWSER: env.BROWSER,
    AI: env.AI,
    CF_ACCOUNT_ID: env.CF_ACCOUNT_ID,
    CF_BROWSER_TOKEN: env.CF_BROWSER_TOKEN,
    USER_AGENT: env.USER_AGENT,
  };
}
