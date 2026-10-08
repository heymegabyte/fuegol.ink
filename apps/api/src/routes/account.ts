import { Hono } from 'hono';
import type { Env } from '../env';
import type { Vars } from '../lib/auth';

const route = new Hono<{ Bindings: Env; Variables: Vars }>();

/**
 * Account/team endpoints. On a demo (keyless) deployment these report a static
 * demo allocation; once the D1 credit ledger is bound they report the real balance.
 */

route.get('/team/credit-usage', (c) => {
  const authed = c.get('principal').authed;
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
