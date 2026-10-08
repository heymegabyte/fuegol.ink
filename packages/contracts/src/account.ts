import { z } from 'zod';

export const CreditUsageResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    remainingCredits: z.number(),
    planCredits: z.number().optional(),
    billingPeriodStart: z.string().nullable().optional(),
    billingPeriodEnd: z.string().nullable().optional(),
  }),
});
export type CreditUsageResponse = z.infer<typeof CreditUsageResponseSchema>;

export const TokenUsageResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    remainingTokens: z.number(),
    planTokens: z.number().optional(),
    billingPeriodStart: z.string().nullable().optional(),
    billingPeriodEnd: z.string().nullable().optional(),
  }),
});
export type TokenUsageResponse = z.infer<typeof TokenUsageResponseSchema>;

export const ConcurrencyResponseSchema = z.object({
  success: z.literal(true),
  concurrency: z.number().int(),
  maxConcurrency: z.number().int(),
});
export type ConcurrencyResponse = z.infer<typeof ConcurrencyResponseSchema>;

/** A row in the credit ledger (fuegol-native, surfaced via /v2/team/credit-usage/historical). */
export const UsageEventSchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  operation: z.enum(['scrape', 'crawl', 'map', 'search', 'extract', 'batch_scrape', 'agent']),
  credits: z.number(),
  url: z.string().optional(),
  jobId: z.string().optional(),
  success: z.boolean(),
});
export type UsageEvent = z.infer<typeof UsageEventSchema>;
