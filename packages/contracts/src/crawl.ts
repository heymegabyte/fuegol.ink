import { z } from 'zod';
import { DocumentSchema } from './common';
import { ScrapeOptionsSchema } from './scrape';
import { WebhookConfigSchema } from './webhook';

export const CrawlRequestSchema = z.object({
  url: z.string().url(),
  /** Natural-language crawl intent; the planner derives include/exclude paths. */
  prompt: z.string().max(10000).optional(),
  limit: z.number().int().positive().default(10000),
  maxDiscoveryDepth: z.number().int().nonnegative().optional(),
  sitemap: z.enum(['include', 'only', 'skip']).default('include'),
  includePaths: z.array(z.string()).optional(),
  excludePaths: z.array(z.string()).optional(),
  allowExternalLinks: z.boolean().default(false),
  allowSubdomains: z.boolean().default(false),
  crawlEntireDomain: z.boolean().optional(),
  ignoreQueryParameters: z.boolean().default(false),
  regexOnFullURL: z.boolean().default(false),
  delay: z.number().nonnegative().max(60).optional(),
  maxConcurrency: z.number().int().positive().optional(),
  webhook: WebhookConfigSchema.optional(),
  scrapeOptions: ScrapeOptionsSchema.optional(),
  zeroDataRetention: z.boolean().optional(),
});
export type CrawlRequest = z.input<typeof CrawlRequestSchema>;

export const CrawlStatusSchema = z.enum(['scraping', 'completed', 'failed', 'cancelled']);
export type CrawlStatus = z.infer<typeof CrawlStatusSchema>;

/** Response to POST /v2/crawl — the async job handle. */
export const CrawlJobResponseSchema = z.object({
  success: z.literal(true),
  id: z.string(),
  url: z.string(),
});
export type CrawlJobResponse = z.infer<typeof CrawlJobResponseSchema>;

/** Response to GET /v2/crawl/:id — status + a page of results. */
export const CrawlStatusResponseSchema = z.object({
  success: z.boolean().optional(),
  status: CrawlStatusSchema,
  total: z.number().int(),
  completed: z.number().int(),
  creditsUsed: z.number().optional(),
  expiresAt: z.string().optional(),
  createdAt: z.string().optional(),
  completedAt: z.string().optional(),
  duration: z.number().optional(),
  next: z.string().nullable().optional(),
  data: z.array(DocumentSchema),
});
export type CrawlStatusResponse = z.infer<typeof CrawlStatusResponseSchema>;

/** Response to GET /v2/crawl/:id/errors. */
export const CrawlErrorsResponseSchema = z.object({
  errors: z.array(
    z.object({
      id: z.string(),
      timestamp: z.string().nullable().optional(),
      url: z.string(),
      error: z.string(),
    }),
  ),
  robotsBlocked: z.array(z.string()),
});
export type CrawlErrorsResponse = z.infer<typeof CrawlErrorsResponseSchema>;
