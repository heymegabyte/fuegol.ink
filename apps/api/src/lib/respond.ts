import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import type { ErrorCode } from '@fuegol/contracts';

/** Emit a Firecrawl-compatible error envelope. */
export function fail(
  c: Context,
  status: number,
  error: string,
  code?: ErrorCode,
  details?: unknown,
) {
  return c.json(
    {
      success: false as const,
      error,
      ...(code ? { code } : {}),
      ...(details !== undefined ? { details } : {}),
    },
    status as ContentfulStatusCode,
  );
}

/** Validate a request body with a Zod schema, returning a typed value or a 400 Response. */
export async function parseBody<T extends z.ZodTypeAny>(
  c: Context,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: Response }> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return {
      ok: false,
      response: fail(c, 400, 'Invalid JSON in request body', 'BAD_REQUEST_INVALID_JSON'),
    };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path.join('.') || '(root)';
    return {
      ok: false,
      response: fail(
        c,
        400,
        `Invalid request: ${path} — ${first?.message ?? 'validation failed'}`,
        'BAD_REQUEST',
        result.error.issues,
      ),
    };
  }
  return { ok: true, data: result.data };
}
