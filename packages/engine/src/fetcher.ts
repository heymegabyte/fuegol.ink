import { assertSafeUrl, SsrfError } from './ssrf';

export interface FetchOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRedirects?: number;
  userAgent?: string;
  method?: string;
}

export interface FetchResult {
  response: Response;
  finalUrl: string;
  redirects: number;
}

export const DEFAULT_USER_AGENT = 'fuegolbot/0.1 (+https://fuegol.ink/bot)';

/**
 * Fetch with SSRF protection on every hop. Redirects are followed manually so the
 * target of each `Location` is re-validated against the private-range blocklist —
 * closing the "redirect to 169.254.169.254" and open-redirect SSRF vectors.
 */
export async function safeFetch(
  input: string | URL,
  opts: FetchOptions = {},
): Promise<FetchResult> {
  let url = assertSafeUrl(input);
  const maxRedirects = opts.maxRedirects ?? 5;
  const timeoutMs = opts.timeoutMs ?? 30000;
  const headers: Record<string, string> = {
    'user-agent': opts.userAgent ?? DEFAULT_USER_AGENT,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf;q=0.8,*/*;q=0.7',
    'accept-language': 'en-US,en;q=0.9',
    ...(opts.headers ?? {}),
  };

  let redirects = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const response = await fetch(url.toString(), {
      method: opts.method ?? 'GET',
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });

    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      if (redirects >= maxRedirects) {
        throw new SsrfError(`Too many redirects (> ${maxRedirects})`);
      }
      redirects += 1;
      url = assertSafeUrl(new URL(location, url));
      continue;
    }

    return { response, finalUrl: url.toString(), redirects };
  }
}

/** Convenience: fetch text, swallowing errors + non-2xx into `null`. */
export async function tryFetchText(
  input: string | URL,
  opts?: FetchOptions,
): Promise<string | null> {
  try {
    const { response } = await safeFetch(input, opts);
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}
