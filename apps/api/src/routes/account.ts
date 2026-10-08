import { Hono } from 'hono';
import { z } from 'zod';
import type { Env } from '../env';
import type { Vars } from '../lib/auth';
import { fail, parseBody } from '../lib/respond';
import { setSpendLimit } from '../lib/keys';
import { creditsUsedThisPeriod, usageHistory, periodStartIso, effectiveCap } from '../lib/ledger';

const route = new Hono<{ Bindings: Env; Variables: Vars }>();

/**
 * Account/team endpoints. For a D1-backed key the balance is computed live from the
 * usage ledger; demo/env keys report a static allocation.
 */

route.get('/team/credit-usage', async (c) => {
  const p = c.get('principal');
  if (p.authed && p.keyId && c.env.DB) {
    const used = await creditsUsedThisPeriod(c.env.DB, p.keyId);
    const plan = p.monthlyCredits ?? 1000;
    const cap = effectiveCap(plan, p.spendLimit);
    return c.json({
      success: true as const,
      data: {
        remainingCredits: Math.max(0, cap - used),
        planCredits: plan,
        spendLimit: p.spendLimit ?? null,
        billingPeriodStart: periodStartIso(),
        billingPeriodEnd: null,
      },
    });
  }
  const authed = p.authed;
  return c.json({
    success: true as const,
    data: {
      remainingCredits: authed ? 100000 : 1000,
      planCredits: authed ? 100000 : 1000,
      billingPeriodStart: null,
      billingPeriodEnd: null,
    },
  });
});

route.get('/team/credit-usage/historical', async (c) => {
  const p = c.get('principal');
  if (p.authed && p.keyId && c.env.DB) {
    const rows = await usageHistory(c.env.DB, p.keyId);
    return c.json({
      success: true as const,
      data: rows.map((r) => ({
        operation: r.operation,
        credits: r.credits,
        url: r.url,
        jobId: r.job_id,
        success: Boolean(r.success),
        createdAt: r.created_at,
      })),
    });
  }
  return c.json({ success: true as const, data: [] });
});

route.get('/team/token-usage', (c) => {
  const authed = c.get('principal').authed;
  return c.json({
    success: true as const,
    data: {
      remainingTokens: authed ? 1500000 : 15000,
      planTokens: authed ? 1500000 : 15000,
      billingPeriodStart: null,
      billingPeriodEnd: null,
    },
  });
});

route.get('/concurrency-check', (c) => {
  const authed = c.get('principal').authed;
  return c.json({ success: true as const, concurrency: 0, maxConcurrency: authed ? 25 : 2 });
});

route.get('/team/spend-limit', (c) => {
  const p = c.get('principal');
  return c.json({
    success: true as const,
    data: { spendLimit: p.spendLimit ?? null, planCredits: p.monthlyCredits ?? null },
  });
});

route.post('/team/spend-limit', async (c) => {
  const p = c.get('principal');
  if (!p.authed || !p.keyId || !c.env.DB) {
    return fail(c, 401, 'Setting a hard spend limit requires a fuegol.ink API key.', 'BAD_REQUEST');
  }
  const parsed = await parseBody(c, z.object({ limit: z.number().int().nonnegative().nullable() }));
  if (!parsed.ok) return parsed.response;
  await setSpendLimit(c.env.DB, p.keyId, parsed.data.limit);
  return c.json({ success: true as const, data: { spendLimit: parsed.data.limit } });
});

route.get('/team/queue-status', (c) => {
  const authed = c.get('principal').authed;
  return c.json({
    success: true as const,
    jobsInQueue: 0,
    activeJobsInQueue: 0,
    waitingJobsInQueue: 0,
    maxConcurrency: authed ? 25 : 2,
    mostRecentSuccess: null,
  });
});

export default route;
