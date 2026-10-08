import type { WebhookConfig, WebhookEvent } from '@fuegol/contracts';

/** HMAC-SHA256 hex of a body under a secret (for webhook signatures). */
export async function hmacHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Deliver a signed webhook with retries. Signature in `x-fuegol-signature:
 * sha256=<hmac>`; event type in `x-fuegol-event`. Returns true on a 2xx.
 */
export async function deliverWebhook(
  cfg: WebhookConfig,
  event: WebhookEvent,
  secret: string,
): Promise<boolean> {
  const body = JSON.stringify(event);
  const signature = `sha256=${await hmacHex(secret, body)}`;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-fuegol-signature': signature,
    'x-fuegol-event': event.type,
    ...(cfg.headers ?? {}),
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(cfg.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
  }
  return false;
}
