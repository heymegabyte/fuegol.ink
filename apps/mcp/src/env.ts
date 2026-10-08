import type { BrowserQuickAction, WorkersAiBinding, EngineEnv } from '@fuegol/engine';

export interface Env {
  BROWSER?: BrowserQuickAction;
  AI?: WorkersAiBinding;
  CF_ACCOUNT_ID?: string;
  CF_BROWSER_TOKEN?: string;
  USER_AGENT?: string;
  /** Service binding to the fuegol REST API Worker (preferred; avoids worker-to-worker 1042). */
  API?: Fetcher;
  /** Public base URL of the REST API — fallback for self-host when no service binding. */
  API_BASE?: string;
}

export const DEFAULT_API_BASE = 'https://fuegol-api.manhattan.workers.dev';

export function engineEnv(env: Env): EngineEnv {
  return {
    BROWSER: env.BROWSER,
    AI: env.AI,
    CF_ACCOUNT_ID: env.CF_ACCOUNT_ID,
    CF_BROWSER_TOKEN: env.CF_BROWSER_TOKEN,
    USER_AGENT: env.USER_AGENT,
  };
}
