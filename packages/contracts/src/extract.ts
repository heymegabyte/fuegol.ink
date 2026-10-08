import { z } from 'zod';
import { ScrapeOptionsSchema } from './scrape';

export const ExtractRequestSchema = z
  .object({
    urls: z.array(z.string()).max(10).optional(),
    prompt: z.string().max(10000).optional(),
    schema: z.record(z.string(), z.unknown()).optional(),
    systemPrompt: z.string().max(10000).optional(),
    allowExternalLinks: z.boolean().optional(),
    enableWebSearch: z.boolean().optional(),
    includeSubdomains: z.boolean().default(true),
    showSources: z.boolean().default(false),
    scrapeOptions: ScrapeOptionsSchema.optional(),
    ignoreInvalidURLs: z.boolean().default(true),
  })
  .refine((v) => (v.urls && v.urls.length > 0) || v.prompt, {
    message: 'Either `urls` or `prompt` is required',
  });
export type ExtractRequest = z.input<typeof ExtractRequestSchema>;

export const ExtractJobResponseSchema = z.object({
  success: z.literal(true),
  id: z.string(),
  invalidURLs: z.array(z.string()).nullable().optional(),
});
export type ExtractJobResponse = z.infer<typeof ExtractJobResponseSchema>;

export const ExtractStatusResponseSchema = z.object({
  success: z.boolean(),
  status: z.enum(['processing', 'completed', 'failed']),
  data: z.unknown().optional(),
  sources: z.record(z.string(), z.array(z.string())).optional(),
  error: z.string().nullable().optional(),
  creditsUsed: z.number().optional(),
  tokensUsed: z.number().optional(),
  expiresAt: z.string().optional(),
});
export type ExtractStatusResponse = z.infer<typeof ExtractStatusResponseSchema>;
