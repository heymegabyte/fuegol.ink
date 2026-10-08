import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { assertSafeUrl, SsrfError } from '@fuegol/engine';
import type { Env } from '../env';
import { fail, parseBody } from '../lib/respond';
import { requireAuth, type Vars } from '../lib/auth';
import { createMonitor, listMonitors, getMonitor, deleteMonitor, listChecks, runMonitor } from '../lib/monitor';

const route = new Hono<{ Bindings: Env; Variables: Vars }>();

/** Monitors require an authenticated D1-backed key (they persist + run on cron). */
function authScope(c: Context<{ Bindings: Env; Variables: Vars }>): { denied?: Response; scope?: string } {
  const p = c.get('principal');
  if (!p.authed) return { denied: requireAuth(c)! };
  if (!p.keyId || !c.env.DB) return { denied: fail(c, 501, 'Monitors require a D1-backed fuegol.ink key.', 'UNKNOWN_ERROR') };
  return { scope: p.keyId };
}

route.post('/monitor', async (c) => {
  const { denied, scope } = authScope(c);
  if (denied) return denied;
  const parsed = await parseBody(
    c,
    z.object({
      url: z.string().url(),
      name: z.string().max(120).optional(),
      tag: z.string().max(60).optional(),
      webhook: z.string().url().optional(),
      webhookHeaders: z.record(z.string(), z.string()).optional(),
    }),
  );
  if (!parsed.ok) return parsed.response;
  try {
    assertSafeUrl(parsed.data.url);
    // The webhook target is a URL we will POST to — SSRF-guard it too (no internal endpoints).
    if (parsed.data.webhook) assertSafeUrl(parsed.data.webhook);
  } catch (e) {
    if (e instanceof SsrfError) return fail(c, 400, e.message, 'unsafe_domain_blocked');
  }
  const monitor = await createMonitor(c.env.DB!, {
    scope: scope!,
    url: parsed.data.url,
    name: parsed.data.name,
    tag: parsed.data.tag,
    webhook: parsed.data.webhook,
    webhookHeaders: parsed.data.webhookHeaders,
  });
  return c.json({ success: true as const, monitor });
});

route.get('/monitor', async (c) => {
  const { denied, scope } = authScope(c);
  if (denied) return denied;
  return c.json({ success: true as const, monitors: await listMonitors(c.env.DB!, scope!) });
});

route.get('/monitor/:id', async (c) => {
  const { denied, scope } = authScope(c);
  if (denied) return denied;
  const m = await getMonitor(c.env.DB!, c.req.param('id'), scope!);
  if (!m) return fail(c, 404, 'Monitor not found.');
  return c.json({ success: true as const, monitor: m });
});

route.delete('/monitor/:id', async (c) => {
  const { denied, scope } = authScope(c);
  if (denied) return denied;
  const ok = await deleteMonitor(c.env.DB!, c.req.param('id'), scope!);
  if (!ok) return fail(c, 404, 'Monitor not found.');
  return c.json({ success: true as const, status: 'deleted' });
});

route.get('/monitor/:id/checks', async (c) => {
  const { denied, scope } = authScope(c);
  if (denied) return denied;
  const m = await getMonitor(c.env.DB!, c.req.param('id'), scope!);
  if (!m) return fail(c, 404, 'Monitor not found.');
  return c.json({ success: true as const, checks: await listChecks(c.env.DB!, m.id) });
});

route.post('/monitor/:id/run', async (c) => {
  const { denied, scope } = authScope(c);
  if (denied) return denied;
  const m = await getMonitor(c.env.DB!, c.req.param('id'), scope!);
  if (!m) return fail(c, 404, 'Monitor not found.');
  const result = await runMonitor(c.env, m);
  return c.json({ success: true as const, ...result });
});

export default route;
