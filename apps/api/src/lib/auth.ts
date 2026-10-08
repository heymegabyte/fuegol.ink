import type { Context, Next } from 'hono';
import type { Env } from '../env';

export interface Principal {
  authed: boolean;
  key?: string;
  mode: 'authenticated' | 'demo';
}

export type Vars = { principal: Principal };

/**
 * Resolve the caller. We NEVER honour a Firecrawl `fc-` key — only fuegol-issued
 * keys listed in the API_KEYS secret. Absent a valid key we fall back to demo mode
 * (rate-limited, read-only scrape/map), per the "public demo without signup" goal.
 */
export async function principal(c: Context<{ Bindings: Env; Variables: Vars }>, next: Next) {
  const header = c.req.header('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  const key = match?.[1]?.trim();
  const accepted = (c.env.API_KEYS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (key && accepted.includes(key)) {
    c.set('principal', { authed: true, key, mode: 'authenticated' });
  } else {
    c.set('principal', { authed: false, mode: 'demo' });
  }
  await next();
}

/** Guard a route that requires an authenticated (paid) principal. */
export function requireAuth(c: Context<{ Bindings: Env; Variables: Vars }>): Response | null {
  const p = c.get('principal');
  if (p.authed) return null;
  return c.json(
    {
      success: false as const,
      error:
        'This endpoint requires a fuegol.ink API key. Issue one in the dashboard, then send it as `Authorization: Bearer fgl_...`. (Firecrawl fc- keys are not accepted.)',
      code: 'BAD_REQUEST' as const,
    },
    401,
  );
}
