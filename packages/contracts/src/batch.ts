import { z } from 'zod';
import { ScrapeOptionsSchema } from './scrape';
import { WebhookConfigSchema } from './webhook';

export const BatchScrapeRequestSchema = ScrapeOptionsSchema.extend({
  // Lenient: invalid entries are filtered + reported as `invalidURLs` (honours ignoreInvalidURLs),
  // matching Firecrawl. URL validity is enforced per-item in the batch handler + SSRF guard.
  urls: z.array(z.string()).min(1),
  webhook: WebhookConfigSchema.optional(),
  appendToId: z.string().optional(),
  ignoreInvalidURLs: z.boolean().default(true),
  maxConcurrency: z.number().int().positive().optional(),
  zeroDataRetention: z.boolean().optional(),
});
export type BatchScrapeRequest = z.input<typeof BatchScrapeRequestSchema>;

export const BatchScrapeJobResponseSchema = z.object({
  success: z.literal(true),
  id: z.string(),
  url: z.string(),
  invalidURLs: z.array(z.string()).optional(),
});
export type BatchScrapeJobResponse = z.infer<typeof BatchScrapeJobResponseSchema>;
