import type { Context, Next } from 'hono';
import type { Env } from '../env';
import { resolveKey } from './keys';

export interface Principal {
  authed: boolean;
  key?: string;
  keyId?: string;
  plan?: string;
  monthlyCredits?: number;
  spendLimit?: number | null;
  mode: 'authenticated' | 'demo';
}

export type Vars = { principal: Principal };

/**
 * Resolve the caller. We NEVER honour a Firecrawl `fc-` key — only fuegol-issued keys:
 * static admin keys in the API_KEYS secret, or D1-backed keys (with plan + ledger). Absent
 * a valid key we fall back to demo mode (rate-limited), per the public-demo goal.
 */
export async function principal(c: Context<{ Bindings: Env; Variables: Vars }>, next: Next) {
  const header = c.req.header('authorization') ?? '';
  const key = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const accepted = (c.env.API_KEYS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (key && accepted.includes(key)) {
    c.set('principal', { authed: true, key, mode: 'authenticated', plan: 'scale', monthlyCredits: 1_000_000 });
  } else if (key && c.env.DB) {
    const resolved = await resolveKey(c.env.DB, key);
    if (resolved) {
      c.set('principal', {
        authed: true,
        key,
        keyId: resolved.id,
        plan: resolved.plan,
        monthlyCredits: resolved.monthlyCredits,
        spendLimit: resolved.spendLimit,
        mode: 'authenticated',
      });
    } else {
      c.set('principal', { authed: false, mode: 'demo' });
    }
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
        'This endpoint requires a fuegol.ink API key. Create one at POST /v2/keys, then send it as `Authorization: Bearer fgl_...`. (Firecrawl fc- keys are not accepted.)',
      code: 'BAD_REQUEST' as const,
    },
    401,
  );
}
