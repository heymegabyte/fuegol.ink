/** Cloudflare bindings + config the engine may use. All optional so the engine
 *  degrades gracefully to the free static-HTTP tier when nothing is configured. */
export interface BrowserQuickAction {
  /** env.BROWSER.quickAction("markdown"|"json"|"scrape"|..., body) */
  quickAction(action: string, body: Record<string, unknown>): Promise<Response>;
}

export interface WorkersAiBinding {
  run(
    model: string,
    inputs: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
}

export interface EngineEnv {
  /** Browser Rendering binding (preferred; no token needed). */
  BROWSER?: BrowserQuickAction;
  /** Workers AI binding for AI-assisted extraction/summary. */
  AI?: WorkersAiBinding;
  /** REST fallback for Browser Rendering when no binding is present. */
  CF_ACCOUNT_ID?: string;
  CF_BROWSER_TOKEN?: string;
  /** Override the crawler User-Agent. */
  USER_AGENT?: string;
  /** R2 bucket for screenshots/artifacts + the public base URL that serves them. */
  ARTIFACTS?: R2Bucket;
  ASSET_BASE?: string;
  /** Web-search provider selection + keys (self-host sets its own). */
  SEARCH_PROVIDER?: string;
  EXA_API_KEY?: string;
  TAVILY_API_KEY?: string;
}

export interface ScrapeContext {
  baseUrl: string;
}
