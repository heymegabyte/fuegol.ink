/**
 * @fuegol/engine — the Cloudflare-native web-data engine. Cheapest-adequate-tier
 * execution planner over a free static-HTTP path (SSRF-guarded fetch → readability
 * extraction → HTML→Markdown) with escalation to the Browser Rendering tier.
 */
export { scrape, type ScrapeResult } from './scrape';
export { mapSite } from './map';
export { planScrape, formatTypes, type ScrapePlan, type Tier } from './planner';
export { discoverSitemapUrls } from './sitemap';
export { fetchRobots, isAllowed } from './robots';
export { safeFetch, tryFetchText, DEFAULT_USER_AGENT, type FetchResult, type FetchOptions } from './fetcher';
export { assertSafeUrl, resolveAndAssertSafe, SsrfError, isPrivateIpv4, isPrivateIpv6, parseIpv4 } from './ssrf';
export { htmlToMarkdown, type MarkdownContext } from './html-to-markdown';
export { parseHtml, selectContent, extractLinks } from './extract-content';
export { extractMetadata } from './metadata';
export { browserAvailable, browserQuickAction } from './browser';
export {
  scrapeWithActions,
  applyActions,
  captureDocument,
  puppeteerAvailable,
  ActionError,
  type ActionsOutput,
  type CaptureOptions,
} from './interact';
export { extractWithAI, extractAvailable, type ExtractOptions } from './extract-ai';
export {
  webSearch,
  searchAvailable,
  searchProviderName,
  type NormalizedResult,
  type ImageResult,
  type SearchSources,
} from './search';
export { parseDocument, type ParseResult } from './parse';
export type { EngineEnv, BrowserQuickAction, WorkersAiBinding } from './types';
