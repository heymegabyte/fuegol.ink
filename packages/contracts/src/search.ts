import { z } from 'zod';
import { DocumentSchema } from './common';
import { ScrapeOptionsSchema } from './scrape';

export const SearchRequestSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().positive().max(100).default(10),
  sources: z.array(z.enum(['web', 'news', 'images', 'alexandria'])).default(['web']),
  categories: z.array(z.enum(['github', 'research', 'pdf', 'developer', 'gov'])).optional(),
  tbs: z.string().optional(),
  country: z.string().optional(),
  location: z.string().optional(),
  ignoreInvalidURLs: z.boolean().optional(),
  timeout: z.number().int().positive().default(60000),
  scrapeOptions: ScrapeOptionsSchema.optional(),
});
export type SearchRequest = z.input<typeof SearchRequestSchema>;

/** A web/news result, optionally enriched with scraped Document fields. */
export const SearchResultSchema = DocumentSchema.partial().extend({
  url: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  category: z.string().optional(),
});
export type SearchResult = z.infer<typeof SearchResultSchema>;

export const ImageResultSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  imageUrl: z.string().optional(),
  imageWidth: z.number().optional(),
  imageHeight: z.number().optional(),
  position: z.number().optional(),
});

export const SearchResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    web: z.array(SearchResultSchema).optional(),
    news: z.array(SearchResultSchema).optional(),
    images: z.array(ImageResultSchema).optional(),
  }),
  creditsUsed: z.number().optional(),
  id: z.string().optional(),
});
export type SearchResponse = z.infer<typeof SearchResponseSchema>;
