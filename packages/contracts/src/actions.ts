import { z } from 'zod';

/**
 * Browser actions executed in order before extraction (Firecrawl-v2 compatible).
 * Only meaningful when the execution planner escalates to a rendered browser.
 */

export const WaitActionSchema = z.object({
  type: z.literal('wait'),
  milliseconds: z.number().int().positive().optional(),
  selector: z.string().optional(),
});

export const ClickActionSchema = z.object({
  type: z.literal('click'),
  selector: z.string(),
  all: z.boolean().optional(),
});

export const WriteActionSchema = z.object({
  type: z.literal('write'),
  text: z.string(),
  selector: z.string().optional(),
});

export const PressActionSchema = z.object({
  type: z.literal('press'),
  key: z.string(),
});

export const ScrollActionSchema = z.object({
  type: z.literal('scroll'),
  direction: z.enum(['up', 'down']).optional(),
  selector: z.string().optional(),
});

export const ScrapeActionSchema = z.object({ type: z.literal('scrape') });

export const ScreenshotActionSchema = z.object({
  type: z.literal('screenshot'),
  fullPage: z.boolean().optional(),
  quality: z.number().int().min(0).max(100).optional(),
});

export const ExecuteJavascriptActionSchema = z.object({
  type: z.literal('executeJavascript'),
  script: z.string(),
});

export const PdfActionSchema = z.object({
  type: z.literal('pdf'),
  landscape: z.boolean().optional(),
  scale: z.number().positive().optional(),
  format: z.string().optional(),
});

export const ActionSchema = z.discriminatedUnion('type', [
  WaitActionSchema,
  ClickActionSchema,
  WriteActionSchema,
  PressActionSchema,
  ScrollActionSchema,
  ScrapeActionSchema,
  ScreenshotActionSchema,
  ExecuteJavascriptActionSchema,
  PdfActionSchema,
]);
export type Action = z.infer<typeof ActionSchema>;
