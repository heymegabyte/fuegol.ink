import { scrape } from '@fuegol/engine';
import { engineEnv, type Env } from '../env';
import { trackChange } from './change';

export interface Monitor {
  id: string;
  scope: string;
  url: string;
  name: string | null;
  tag: string;
  status: string;
  created_at: string;
  last_check_at: string | null;
}

export async function createMonitor(
  db: D1Database,
  m: { scope: string; url: string; name?: string; tag?: string },
): Promise<Monitor> {
  const row: Monitor = {
    id: crypto.randomUUID(),
    scope: m.scope,
    url: m.url,
    name: m.name ?? null,
    tag: m.tag ?? 'default',
    status: 'active',
    created_at: new Date().toISOString(),
    last_check_at: null,
  };
  await db
    .prepare('INSERT INTO monitors (id, scope, url, name, tag, status, created_at, last_check_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(row.id, row.scope, row.url, row.name, row.tag, row.status, row.created_at, row.last_check_at)
    .run();
  return row;
}

export async function listMonitors(db: D1Database, scope: string): Promise<Monitor[]> {
  const { results } = await db
    .prepare('SELECT * FROM monitors WHERE scope = ? ORDER BY created_at DESC LIMIT 200')
    .bind(scope)
    .all<Monitor>();
  return results ?? [];
}

export async function getMonitor(db: D1Database, id: string, scope: string): Promise<Monitor | null> {
  return (await db.prepare('SELECT * FROM monitors WHERE id = ? AND scope = ?').bind(id, scope).first<Monitor>()) ?? null;
}

export async function deleteMonitor(db: D1Database, id: string, scope: string): Promise<boolean> {
  const res = await db.prepare('DELETE FROM monitors WHERE id = ? AND scope = ?').bind(id, scope).run();
  return (res.meta.changes ?? 0) > 0;
}

export async function listChecks(db: D1Database, monitorId: string, limit = 50): Promise<unknown[]> {
  const { results } = await db
    .prepare('SELECT change_status, created_at FROM monitor_checks WHERE monitor_id = ? ORDER BY created_at DESC LIMIT ?')
    .bind(monitorId, Math.min(Math.max(limit, 1), 500))
    .all();
  return results ?? [];
}

/** Scrape the monitored URL, diff against its last check, record the result. */
export async function runMonitor(env: Env, monitor: Monitor): Promise<{ changeStatus: string; checkId: string }> {
  const { document } = await scrape({ url: monitor.url, formats: ['markdown'] } as never, engineEnv(env));
  const markdown = document.markdown ?? '';
  const ct = await trackChange(env.DB!, `monitor:${monitor.id}`, monitor.url, monitor.tag, markdown, true);
  const checkId = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB!.prepare('INSERT INTO monitor_checks (id, monitor_id, change_status, created_at) VALUES (?, ?, ?, ?)')
    .bind(checkId, monitor.id, ct.changeStatus, now)
    .run();
  await env.DB!.prepare('UPDATE monitors SET last_check_at = ? WHERE id = ?').bind(now, monitor.id).run();
  return { changeStatus: ct.changeStatus, checkId };
}

/** Cron sweep: run every active monitor not checked in the last ~14 minutes. */
export async function runDueMonitors(env: Env, limit = 50): Promise<number> {
  if (!env.DB) return 0;
  const cutoff = new Date(Date.now() - 14 * 60 * 1000).toISOString();
  const { results } = await env.DB
    .prepare("SELECT * FROM monitors WHERE status = 'active' AND (last_check_at IS NULL OR last_check_at < ?) LIMIT ?")
    .bind(cutoff, limit)
    .all<Monitor>();
  for (const m of results ?? []) {
    try {
      await runMonitor(env, m);
    } catch {
      /* one bad monitor must not stop the sweep */
    }
  }
  return (results ?? []).length;
}
