import { z } from 'zod';

/**
 * Shared primitives for the fuegol.ink / Firecrawl-v2-compatible contract.
 * Pinned to firecrawl/firecrawl@f9f2e3d (2026-10-08); the authoritative upstream
 * source is the Zod in apps/api/src/controllers/v2/types.ts (no v2 OpenAPI exists
 * in-repo). This file has no internal imports — it is the base of the dep graph.
 */

/** ISO-3166 alpha-2 country (lowercased upstream; also "us-generic"/"us-whitelist") + languages. */
export const LocationSchema = z.object({
  country: z.string().optional(),
  languages: z.array(z.string()).optional(),
});
export type Location = z.infer<typeof LocationSchema>;

/** Proxy strategy. `auto` escalates on block detection. Upstream enum incl. `enhanced`. */
export const ProxyModeSchema = z.enum(['basic', 'stealth', 'enhanced', 'auto']);
export type ProxyMode = z.infer<typeof ProxyModeSchema>;

/**
 * Page metadata from <head> + the HTTP response. `statusCode` is always known for
 * our HTTP-fetch engine. Open-ended catchall preserves unknown OpenGraph / Twitter /
 * Dublin-core keys so we never silently drop upstream-compatible data.
 */
export const DocumentMetadataSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    language: z.string().optional(),
    keywords: z.string().optional(),
    robots: z.string().optional(),
    ogTitle: z.string().optional(),
    ogDescription: z.string().optional(),
    ogUrl: z.string().optional(),
    ogImage: z.string().optional(),
    ogSiteName: z.string().optional(),
    ogLocale: z.string().optional(),
    favicon: z.string().optional(),
    publishedTime: z.string().optional(),
    modifiedTime: z.string().optional(),
    articleTag: z.string().optional(),
    articleSection: z.string().optional(),
    sourceURL: z.string().optional(),
    url: z.string().optional(),
    statusCode: z.number().int(),
    contentType: z.string().optional(),
    proxyUsed: z.string().optional(),
    cacheState: z.enum(['hit', 'miss']).optional(),
    cachedAt: z.string().optional(),
    numPages: z.number().int().optional(),
    creditsUsed: z.number().optional(),
    error: z.string().optional(),
  })
  .catchall(z.union([z.string(), z.array(z.string()), z.number(), z.null()]));
export type DocumentMetadata = z.infer<typeof DocumentMetadataSchema>;

/** Result of a change-tracking comparison between the current + previous scrape. */
export const ChangeTrackingSchema = z.object({
  previousScrapeAt: z.string().nullable().optional(),
  changeStatus: z.enum(['new', 'same', 'changed', 'removed']).optional(),
  visibility: z.enum(['visible', 'hidden']).optional(),
  diff: z.unknown().optional(),
  json: z.unknown().optional(),
});
export type ChangeTracking = z.infer<typeof ChangeTrackingSchema>;

/** Output of browser `actions` (screenshots, intermediate scrapes, JS returns, PDFs). */
export const ActionsResultSchema = z.object({
  screenshots: z.array(z.string()).optional(),
  scrapes: z.array(z.object({ url: z.string(), html: z.string() })).optional(),
  javascriptReturns: z.array(z.object({ type: z.string(), value: z.unknown() })).optional(),
  pdfs: z.array(z.string()).optional(),
});

/**
 * A scraped document — the union of every requested format plus metadata. Mirrors
 * upstream's rich shape (title/description/url are top-level, not only in metadata).
 * Reused by scrape, crawl results, batch-scrape results, and search-with-scrape.
 */
export const DocumentSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  url: z.string().optional(),
  markdown: z.string().optional(),
  summary: z.string().optional(),
  html: z.string().optional(),
  rawHtml: z.string().optional(),
  rawBase64: z.string().optional(),
  links: z.array(z.string()).optional(),
  images: z.array(z.string()).optional(),
  screenshot: z.string().optional(),
  json: z.unknown().optional(),
  /** Legacy alias of `json` for v1 `extract` clients. */
  extract: z.unknown().optional(),
  answer: z.string().optional(),
  highlights: z.array(z.string()).optional(),
  branding: z.unknown().optional(),
  product: z.unknown().optional(),
  menu: z.unknown().optional(),
  pages: z.array(z.object({ pageNumber: z.number().int(), markdown: z.string() })).optional(),
  attributes: z
    .array(z.object({ selector: z.string(), attribute: z.string(), values: z.array(z.string()) }))
    .optional(),
  actions: ActionsResultSchema.optional(),
  changeTracking: ChangeTrackingSchema.optional(),
  metadata: DocumentMetadataSchema,
  warning: z.string().optional(),
});
export type Document = z.infer<typeof DocumentSchema>;

/**
 * Upstream v2 error-code enum (verbatim from firecrawl lib/error.ts @ pinned SHA).
 * We emit compatible codes so existing clients' error handling keeps working.
 */
export const ErrorCodeSchema = z.enum([
  'THIRD_PARTY_DATA_TERMS_REQUIRED',
  'THIRD_PARTY_DATA_NOT_FOUND',
  'THIRD_PARTY_DATA_UNSUPPORTED_URL',
  'THIRD_PARTY_DATA_UNSUPPORTED_OPTION',
  'THIRD_PARTY_DATA_NOT_ENABLED',
  'THIRD_PARTY_DATA_ENRICHMENT_NOT_ENABLED',
  'SCRAPE_TIMEOUT',
  'MAP_TIMEOUT',
  'UNKNOWN_ERROR',
  'SCRAPE_ALL_ENGINES_FAILED',
  'SCRAPE_SSL_ERROR',
  'SCRAPE_SITE_ERROR',
  'SCRAPE_PROXY_SELECTION_ERROR',
  'SCRAPE_JOB_CANCELLED',
  'SCRAPE_RETRY_LIMIT',
  'SCRAPE_DNS_RESOLUTION_ERROR',
  'SCRAPE_UNSUPPORTED_FILE_ERROR',
  'SCRAPE_ACTION_ERROR',
  'SCRAPE_NO_CACHED_DATA',
  'SCRAPE_SITEMAP_ERROR',
  'SCRAPE_ACTIONS_NOT_SUPPORTED',
  'SCRAPE_PROMPT_INJECTION_DETECTED',
  'SCRAPE_JSON_CONTENT_TOO_LARGE',
  'CRAWL_DENIAL',
  'UNSUPPORTED_SITE',
  'MAP_FAILED',
  'CONCURRENCY_QUEUE_TIMEOUT',
  'SAFE_MODE_BLOCKED',
  'SCRAPE_SITE_RESTRICTION_BLOCKED',
  'unsafe_domain_blocked',
  'BAD_REQUEST',
  'BAD_REQUEST_INVALID_JSON',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** Firecrawl-compatible error envelope (shared by every endpoint). */
export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  code: ErrorCodeSchema.optional(),
  details: z.unknown().optional(),
});
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
