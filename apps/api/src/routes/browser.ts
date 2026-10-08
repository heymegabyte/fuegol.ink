import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { ActionSchema } from '@fuegol/contracts';
import { SsrfError } from '@fuegol/engine';
import type { Env } from '../env';
import { fail, parseBody } from '../lib/respond';
import { requireAuth, type Vars } from '../lib/auth';
import { allowDemo } from '../lib/ratelimit';
import type { SessionState } from '../browser-do';

/**
 * Persistent interactive browser sessions (Firecrawl `/browser` + `/interact` family).
 * Each session is a Durable Object holding a Browser Run session; the opaque session id is a
 * bearer capability. Keyed principals own their sessions; demo/anon sessions are token-gated.
 */
const route = new Hono<{ Bindings: Env; Variables: Vars }>();

type Ctx = Context<{ Bindings: Env; Variables: Vars }>;

/** Feature + auth gate shared by all session routes. */
function gate(c: Ctx): Response | null {
  if (!c.env.BROWSER_SESSION || !c.env.BROWSER) {
    return fail(
      c,
      501,
      'Interactive browser sessions require the Browser Rendering binding (not configured on this deployment).',
      'UNKNOWN_ERROR',
    );
  }
  const p = c.get('principal');
  if (!p.authed) {
    if (c.env.DEMO_MODE !== 'true') {
      const denied = requireAuth(c);
      if (denied) return denied;
    } else if (!allowDemo(c.req.header('cf-connecting-ip') ?? 'unknown', Date.now())) {
      return fail(
        c,
        429,
        'Demo rate limit reached (≈20 requests/min). Add a fuegol.ink API key for higher limits.',
        'BAD_REQUEST',
      );
    }
  }
  return null;
}

function stubFor(c: Ctx, id: string) {
  const ns = c.env.BROWSER_SESSION!;
  return ns.get(ns.idFromName(id));
}

function ownerKey(c: Ctx): string | null {
  return c.get('principal').keyId ?? null;
}

/** A plain success body (explicit fields — the RPC return type is not spread-safe). */
function okJson(c: Ctx, id: string, state: SessionState): Response {
  return c.json({
    success: true as const,
    id,
    status: state.status,
    url: state.url,
    title: state.title,
    createdAt: state.createdAt,
    actCount: state.actCount,
    actions: state.actions,
    document: state.document,
  });
}

/** Map a DO SessionState to an HTTP response (honest status codes, never fabricated success). */
function respondState(c: Ctx, id: string, state: SessionState): Response {
  switch (state.status) {
    case 'none':
      return fail(c, 404, state.error ?? 'No such session.', 'BAD_REQUEST');
    case 'forbidden':
      return fail(c, 403, state.error ?? 'This session belongs to another API key.', 'BAD_REQUEST');
    case 'expired':
      return fail(c, 404, state.error ?? 'Session expired.', 'BAD_REQUEST');
    case 'action_error':
      return fail(c, 400, state.error ?? 'Action failed.', 'SCRAPE_ACTION_ERROR');
    case 'error':
      return fail(c, 500, state.error ?? 'Session error.', 'UNKNOWN_ERROR');
    default:
      return okJson(c, id, state);
  }
}

// Create a session: launch a browser + navigate to the initial URL.
route.post('/browser', async (c) => {
  const denied = gate(c);
  if (denied) return denied;
  const parsed = await parseBody(c, z.object({ url: z.string().url() }));
  if (!parsed.ok) return parsed.response;
  const id = crypto.randomUUID();
  try {
    const state = await stubFor(c, id).create({ url: parsed.data.url, ownerKeyId: ownerKey(c) });
    return okJson(c, id, state);
  } catch (e) {
    if (e instanceof SsrfError) return fail(c, 400, e.message, 'unsafe_domain_blocked');
    return fail(
      c,
      500,
      e instanceof Error ? e.message : 'Failed to create session',
      'UNKNOWN_ERROR',
    );
  }
});

// Drive a session: run actions against the live tab (state persists across calls).
route.post('/browser/:id/act', async (c) => {
  const denied = gate(c);
  if (denied) return denied;
  const parsed = await parseBody(
    c,
    z.object({
      actions: z.array(ActionSchema).min(1).max(50),
      formats: z.array(z.string()).optional(),
    }),
  );
  if (!parsed.ok) return parsed.response;
  const id = c.req.param('id');
  const state = await stubFor(c, id).act({
    actions: parsed.data.actions,
    formats: parsed.data.formats,
    ownerKeyId: ownerKey(c),
  });
  return respondState(c, id, state);
});

// Inspect a session's current state.
route.get('/browser/:id', async (c) => {
  const denied = gate(c);
  if (denied) return denied;
  const id = c.req.param('id');
  return respondState(c, id, await stubFor(c, id).info(ownerKey(c)));
});

// Close a session: terminate the browser + free its slot.
route.delete('/browser/:id', async (c) => {
  const denied = gate(c);
  if (denied) return denied;
  const id = c.req.param('id');
  return respondState(c, id, await stubFor(c, id).close(ownerKey(c)));
});

export default route;
