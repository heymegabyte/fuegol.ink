import { z } from 'zod';
import { DocumentSchema } from './common';

/** Per-job webhook configuration attached to crawl / batch-scrape requests. */
export const WebhookConfigSchema = z.object({
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  events: z.array(z.enum(['completed', 'page', 'failed', 'started'])).optional(),
});
export type WebhookConfig = z.infer<typeof WebhookConfigSchema>;

/** Signed webhook event body delivered to the customer's endpoint. */
export const WebhookEventSchema = z.object({
  success: z.boolean(),
  type: z.enum([
    'crawl.started',
    'crawl.page',
    'crawl.completed',
    'crawl.failed',
    'batch_scrape.started',
    'batch_scrape.page',
    'batch_scrape.completed',
    'batch_scrape.failed',
    'monitor.changed',
  ]),
  id: z.string(),
  data: z.array(DocumentSchema).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  error: z.string().nullable().optional(),
});
export type WebhookEvent = z.infer<typeof WebhookEventSchema>;
