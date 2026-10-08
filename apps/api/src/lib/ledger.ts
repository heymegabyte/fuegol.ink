/** Transactional credit ledger in D1 — the real-time authority for balance + usage
 *  (never Stripe's eventually-consistent meters). Append-only usage_events. */

export interface UsageRow {
  operation: string;
  credits: number;
  url: string | null;
  job_id: string | null;
  success: number;
  created_at: string;
}

function periodStartIso(): string {
  // Calendar-month billing period (UTC) — simple + deterministic for v0.
  const now = new Date().toISOString();
  return `${now.slice(0, 7)}-01T00:00:00.000Z`;
}

export async function recordUsage(
  db: D1Database,
  event: { keyId: string; operation: string; credits: number; url?: string; jobId?: string; success?: boolean },
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO usage_events (id, key_id, operation, credits, url, job_id, success, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(
      crypto.randomUUID(),
      event.keyId,
      event.operation,
      event.credits,
      event.url ?? null,
      event.jobId ?? null,
      event.success === false ? 0 : 1,
      new Date().toISOString(),
    )
    .run();
}

export async function creditsUsedThisPeriod(db: D1Database, keyId: string): Promise<number> {
  const row = await db
    .prepare(
      'SELECT COALESCE(SUM(credits), 0) AS used FROM usage_events WHERE key_id = ? AND success = 1 AND created_at >= ?',
    )
    .bind(keyId, periodStartIso())
    .first<{ used: number }>();
  return Number(row?.used ?? 0);
}

export async function usageHistory(db: D1Database, keyId: string, limit = 100): Promise<UsageRow[]> {
  const { results } = await db
    .prepare(
      'SELECT operation, credits, url, job_id, success, created_at FROM usage_events WHERE key_id = ? ORDER BY created_at DESC LIMIT ?',
    )
    .bind(keyId, Math.min(Math.max(limit, 1), 1000))
    .all<UsageRow>();
  return results ?? [];
}

export { periodStartIso };
