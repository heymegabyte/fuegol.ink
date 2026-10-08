/** API-key issuance + resolution backed by D1. Keys are shown once; only their
 *  SHA-256 hash is stored. Plans map to a monthly credit allocation. */

export const PLAN_CREDITS: Record<string, number> = {
  free: 1000,
  hobby: 5000,
  standard: 100000,
  growth: 500000,
  scale: 1000000,
};

export interface ResolvedKey {
  id: string;
  plan: string;
  monthlyCredits: number;
  spendLimit: number | null;
}

async function sha256hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** fuegol keys look like `fgl_live_<48 hex>`. Never a Firecrawl `fc-` key. */
export function generateKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return `fgl_live_${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export async function createKey(
  db: D1Database,
  opts: { name?: string; plan?: string },
): Promise<{ key: string; id: string; plan: string; monthlyCredits: number; prefix: string }> {
  const key = generateKey();
  const id = crypto.randomUUID();
  const plan = opts.plan && PLAN_CREDITS[opts.plan] ? opts.plan : 'free';
  const monthlyCredits = PLAN_CREDITS[plan]!;
  const prefix = key.slice(0, 16);
  await db
    .prepare(
      'INSERT INTO api_keys (id, key_hash, key_prefix, name, plan, monthly_credits, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(
      id,
      await sha256hex(key),
      prefix,
      opts.name ?? null,
      plan,
      monthlyCredits,
      new Date().toISOString(),
    )
    .run();
  return { key, id, plan, monthlyCredits, prefix };
}

export async function resolveKey(db: D1Database, key: string): Promise<ResolvedKey | null> {
  const row = await db
    .prepare(
      'SELECT id, plan, monthly_credits AS monthlyCredits, spend_limit AS spendLimit FROM api_keys WHERE key_hash = ? AND revoked = 0',
    )
    .bind(await sha256hex(key))
    .first<{ id: string; plan: string; monthlyCredits: number; spendLimit: number | null }>();
  return row
    ? {
        id: row.id,
        plan: row.plan,
        monthlyCredits: row.monthlyCredits,
        spendLimit: row.spendLimit ?? null,
      }
    : null;
}

/** Set (or clear with null) the user-configurable hard spend ceiling for a key. */
export async function setSpendLimit(
  db: D1Database,
  keyId: string,
  limit: number | null,
): Promise<void> {
  await db.prepare('UPDATE api_keys SET spend_limit = ? WHERE id = ?').bind(limit, keyId).run();
}
