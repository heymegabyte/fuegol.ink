import type { BrowserQuickAction, WorkersAiBinding, EngineEnv } from '@fuegol/engine';

export interface Env {
  BROWSER?: BrowserQuickAction;
  AI?: WorkersAiBinding;
  CF_ACCOUNT_ID?: string;
  CF_BROWSER_TOKEN?: string;
  USER_AGENT?: string;
}

export function engineEnv(env: Env): EngineEnv {
  return {
    BROWSER: env.BROWSER,
    AI: env.AI,
    CF_ACCOUNT_ID: env.CF_ACCOUNT_ID,
    CF_BROWSER_TOKEN: env.CF_BROWSER_TOKEN,
    USER_AGENT: env.USER_AGENT,
  };
}
