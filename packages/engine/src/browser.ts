import type { EngineEnv } from './types';

/** True when a browser-rendering path is configured (binding preferred, REST fallback). */
export function browserAvailable(env: EngineEnv): boolean {
  return Boolean(env.BROWSER?.quickAction || (env.CF_ACCOUNT_ID && env.CF_BROWSER_TOKEN));
}

/**
 * Invoke a Cloudflare Browser Rendering Quick Action. Prefers the `BROWSER` binding;
 * falls back to the REST API (`/accounts/{id}/browser-rendering/{action}`) when only a
 * token is configured. Response shape is `{ success, result }`.
 */
export async function browserQuickAction<T = unknown>(
  env: EngineEnv,
  action: string,
  body: Record<string, unknown>,
): Promise<{ success?: boolean; result?: T; error?: string }> {
  if (env.BROWSER?.quickAction) {
    const res = await env.BROWSER.quickAction(action, body);
    return (await res.json()) as { success?: boolean; result?: T };
  }
  if (env.CF_ACCOUNT_ID && env.CF_BROWSER_TOKEN) {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/browser-rendering/${action}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.CF_BROWSER_TOKEN}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      },
    );
    return (await res.json()) as { success?: boolean; result?: T; error?: string };
  }
  throw new Error('Browser Rendering is not configured on this deployment');
}

/** Capture a screenshot of a URL as raw image bytes (PNG), or null on failure. */
export async function browserScreenshot(
  env: EngineEnv,
  url: string,
  opts: Record<string, unknown> = {},
): Promise<ArrayBuffer | null> {
  try {
    if (env.BROWSER?.quickAction) {
      const res = await env.BROWSER.quickAction('screenshot', { url, ...opts });
      if (!res.ok) return null;
      return await res.arrayBuffer();
    }
    if (env.CF_ACCOUNT_ID && env.CF_BROWSER_TOKEN) {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/browser-rendering/screenshot`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${env.CF_BROWSER_TOKEN}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ url, ...opts }),
          signal: AbortSignal.timeout(60000),
        },
      );
      if (!res.ok) return null;
      return await res.arrayBuffer();
    }
  } catch {
    return null;
  }
  return null;
}
