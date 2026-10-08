import { z } from 'zod';
import { LocationSchema } from './common';

export const MapRequestSchema = z.object({
  url: z.string().url(),
  search: z.string().optional(),
  limit: z.number().int().positive().max(30000).default(5000),
  sitemap: z.enum(['include', 'only', 'skip']).default('include'),
  includeSubdomains: z.boolean().default(true),
  ignoreQueryParameters: z.boolean().default(true),
  timeout: z.number().int().positive().optional(),
  location: LocationSchema.optional(),
});
export type MapRequest = z.input<typeof MapRequestSchema>;

export const MapLinkSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
});
export type MapLink = z.infer<typeof MapLinkSchema>;

export const MapResponseSchema = z.object({
  success: z.literal(true),
  links: z.array(MapLinkSchema),
  id: z.string().optional(),
  warning: z.string().optional(),
});
export type MapResponse = z.infer<typeof MapResponseSchema>;
