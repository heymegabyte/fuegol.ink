import { z } from 'zod';
import { DocumentSchema, LocationSchema, ProxyModeSchema } from './common';
import { ActionSchema } from './actions';

/**
 * Format shorthands (string form) — complete set from the pinned upstream Zod source.
 */
export const FormatStringSchema = z.enum([
  'markdown',
  'summary',
  'html',
  'rawHtml',
  'rawBase64',
  'links',
  'images',
  'screenshot',
  'audio',
  'video',
  'product',
  'menu',
  'json',
  'changeTracking',
]);

/** Structured (object) format descriptors. */
export const JsonFormatSchema = z.object({
  type: z.literal('json'),
  prompt: z.string().max(10000).optional(),
  schema: z.record(z.string(), z.unknown()).optional(),
  checkPromptInjection: z.boolean().optional(),
});

export const DeterministicJsonFormatSchema = z.object({
  type: z.literal('deterministicJson'),
  prompt: z.string().max(10000).optional(),
  schema: z.record(z.string(), z.unknown()).optional(),
});

export const ScreenshotFormatSchema = z.object({
  type: z.literal('screenshot'),
  fullPage: z.boolean().optional(),
  quality: z.number().int().min(1).max(100).optional(),
  viewport: z
    .object({ width: z.number().int().positive(), height: z.number().int().positive() })
    .optional(),
});

export const ChangeTrackingFormatSchema = z.object({
  type: z.literal('changeTracking'),
  modes: z.array(z.enum(['git-diff', 'json'])).optional(),
  prompt: z.string().optional(),
  schema: z.record(z.string(), z.unknown()).optional(),
  tag: z.string().nullable().optional(),
});

export const AttributesFormatSchema = z.object({
  type: z.literal('attributes'),
  selectors: z.array(z.object({ selector: z.string(), attribute: z.string() })),
});

export const QuestionFormatSchema = z.object({
  type: z.literal('question'),
  question: z.string().min(1).max(10000),
});

export const HighlightsFormatSchema = z.object({
  type: z.literal('highlights'),
  query: z.string().min(1).max(10000),
});

export const QueryFormatSchema = z.object({
  type: z.literal('query'),
  prompt: z.string().max(10000).optional(),
  mode: z.enum(['freeform', 'directQuote']).optional(),
});

export const BrandingFormatSchema = z.object({
  type: z.literal('branding'),
  mode: z.enum(['auto', 'fast', 'standard']).optional(),
});

/** A single requested output format — string shorthand or object descriptor. */
export const FormatSchema = z.union([
  FormatStringSchema,
  JsonFormatSchema,
  DeterministicJsonFormatSchema,
  ScreenshotFormatSchema,
  ChangeTrackingFormatSchema,
  AttributesFormatSchema,
  QuestionFormatSchema,
  HighlightsFormatSchema,
  QueryFormatSchema,
  BrandingFormatSchema,
]);
export type Format = z.infer<typeof FormatSchema>;

const PdfParserSchema = z.object({
  type: z.literal('pdf'),
  mode: z.enum(['fast', 'auto', 'ocr']).optional(),
  maxPages: z.number().int().positive().max(10000).optional(),
});
const ParserSchema = z.union([
  z.literal('pdf'),
  z.literal('image'),
  PdfParserSchema,
  z.object({ type: z.literal('image') }),
]);

const RedactPiiSchema = z.union([
  z.boolean(),
  z.object({
    mode: z.enum(['accurate', 'aggressive', 'fast']).optional(),
    entities: z
      .array(z.enum(['PERSON', 'EMAIL', 'PHONE', 'LOCATION', 'FINANCIAL', 'SECRET']))
      .optional(),
    replaceStyle: z.enum(['tag', 'mask', 'remove']).optional(),
  }),
]);

/**
 * Options shared by scrape, crawl.scrapeOptions, batch-scrape, and search.scrapeOptions.
 * Defaults mirror the pinned upstream Zod (`.prefault`) behaviour.
 */
export const ScrapeOptionsSchema = z.object({
  formats: z.array(FormatSchema).optional(),
  headers: z.record(z.string(), z.string()).optional(),
  includeTags: z.array(z.string()).optional(),
  excludeTags: z.array(z.string()).optional(),
  onlyMainContent: z.boolean().default(true),
  onlyCleanContent: z.boolean().default(false),
  timeout: z.number().int().min(1000).max(300000).optional(),
  waitFor: z.number().int().nonnegative().max(60000).default(0),
  mobile: z.boolean().default(false),
  parsers: z.array(ParserSchema).optional(),
  actions: z.array(ActionSchema).max(50).optional(),
  location: LocationSchema.optional(),
  skipTlsVerification: z.boolean().optional(),
  removeBase64Images: z.boolean().default(true),
  blockAds: z.boolean().default(true),
  proxy: ProxyModeSchema.optional(),
  /** Serve a cached result if younger than this many milliseconds. */
  maxAge: z.number().int().nonnegative().optional(),
  minAge: z.number().int().nonnegative().optional(),
  storeInCache: z.boolean().default(true),
  lockdown: z.boolean().default(false),
  fastMode: z.boolean().default(false),
  safeMode: z.boolean().optional(),
  redactPII: RedactPiiSchema.optional(),
  zeroDataRetention: z.boolean().optional(),
});
export type ScrapeOptions = z.infer<typeof ScrapeOptionsSchema>;

export const ScrapeRequestSchema = ScrapeOptionsSchema.extend({
  url: z.string().url(),
});
export type ScrapeRequest = z.input<typeof ScrapeRequestSchema>;

export const ScrapeResponseSchema = z.object({
  success: z.literal(true),
  data: DocumentSchema,
  warning: z.string().optional(),
  scrape_id: z.string().optional(),
});
export type ScrapeResponse = z.infer<typeof ScrapeResponseSchema>;
