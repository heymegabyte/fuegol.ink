/**
 * SSRF defense. The web-data engine fetches arbitrary user-supplied URLs, so this
 * is the single most security-critical module. We block non-http(s) schemes, private
 * and reserved IP ranges (v4 + v6, including v4-mapped v6), link-local metadata
 * endpoints, and re-validate every redirect hop (see fetcher.ts).
 *
 * Defense-in-depth note: Cloudflare Workers' edge `fetch` has no route to RFC-1918
 * networks, so internal-network SSRF is already largely mitigated by the platform.
 * This guard adds explicit, testable blocking and catches cloud metadata endpoints
 * and DNS-rebinding (optional DoH pre-resolution via `resolveAndAssertSafe`).
 */

export class SsrfError extends Error {
  readonly code = 'SSRF_BLOCKED';
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal', 'metadata.goog']);

const BLOCKED_HOST_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa'];

/** Parse a dotted-quad IPv4 string to its 32-bit integer, or null if not IPv4. */
export function parseIpv4(host: string): number | null {
  const parts = host.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = value * 256 + octet;
  }
  return value >>> 0;
}

/** True for private, loopback, link-local, CGNAT, multicast, and reserved IPv4. */
export function isPrivateIpv4(ip: number): boolean {
  const inRange = (base: string, maskBits: number): boolean => {
    const baseInt = parseIpv4(base)!;
    const mask = maskBits === 0 ? 0 : (0xffffffff << (32 - maskBits)) >>> 0;
    return (ip & mask) === (baseInt & mask);
  };
  return (
    inRange('0.0.0.0', 8) ||
    inRange('10.0.0.0', 8) ||
    inRange('100.64.0.0', 10) ||
    inRange('127.0.0.0', 8) ||
    inRange('169.254.0.0', 16) ||
    inRange('172.16.0.0', 12) ||
    inRange('192.0.0.0', 24) ||
    inRange('192.0.2.0', 24) ||
    inRange('192.168.0.0', 16) ||
    inRange('198.18.0.0', 15) ||
    inRange('198.51.100.0', 24) ||
    inRange('203.0.113.0', 24) ||
    inRange('224.0.0.0', 4) ||
    inRange('240.0.0.0', 4)
  );
}

/** True for loopback, ULA, link-local, and other non-routable IPv6 (prefix check). */
export function isPrivateIpv6(host: string): boolean {
  let h = host.toLowerCase();
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  const mapped = h.match(/^(?:::ffff:|::)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) {
    const v4 = parseIpv4(mapped[1]!);
    return v4 === null ? true : isPrivateIpv4(v4);
  }
  if (h === '::1' || h === '::') return true;
  if (h.startsWith('fe80') || h.startsWith('fe9') || h.startsWith('fea') || h.startsWith('feb')) {
    return true;
  }
  if (h.startsWith('fc') || h.startsWith('fd')) return true;
  if (h.startsWith('ff')) return true;
  if (h.startsWith('2001:db8')) return true;
  if (h.startsWith('::ffff:')) return true;
  return false;
}

function looksLikeIpv6(host: string): boolean {
  return host.includes(':');
}

/**
 * Validate a single URL (one hop). Throws SsrfError if it must not be fetched.
 * Does NOT resolve DNS — see resolveAndAssertSafe for rebinding protection.
 */
export function assertSafeUrl(input: string | URL): URL {
  let url: URL;
  try {
    url = typeof input === 'string' ? new URL(input) : input;
  } catch {
    throw new SsrfError(`Invalid URL: ${String(input)}`);
  }

  const scheme = url.protocol.toLowerCase();
  if (scheme !== 'http:' && scheme !== 'https:') {
    throw new SsrfError(`Blocked URL scheme "${url.protocol}" (only http/https allowed)`);
  }

  const host = url.hostname.toLowerCase();
  if (!host) throw new SsrfError('URL has no host');

  if (BLOCKED_HOSTNAMES.has(host)) throw new SsrfError(`Blocked hostname: ${host}`);
  for (const suffix of BLOCKED_HOST_SUFFIXES) {
    if (host.endsWith(suffix)) throw new SsrfError(`Blocked hostname suffix: ${host}`);
  }

  if (looksLikeIpv6(host)) {
    if (isPrivateIpv6(host)) throw new SsrfError(`Blocked private IPv6: ${host}`);
    return url;
  }

  const v4 = parseIpv4(host);
  if (v4 !== null && isPrivateIpv4(v4)) {
    throw new SsrfError(`Blocked private IPv4: ${host}`);
  }

  return url;
}

/**
 * DNS-rebinding protection: resolve the hostname via DNS-over-HTTPS (Cloudflare
 * 1.1.1.1) and assert none of the resolved A/AAAA records are private. Opt-in
 * because it adds a round-trip; call before `safeFetch` for untrusted inputs.
 */
export async function resolveAndAssertSafe(url: URL): Promise<void> {
  const host = url.hostname.toLowerCase();
  if (looksLikeIpv6(host) || parseIpv4(host) !== null) return;

  const query = async (type: 'A' | 'AAAA'): Promise<string[]> => {
    const res = await fetch(
      `https://1.1.1.1/dns-query?name=${encodeURIComponent(host)}&type=${type}`,
      { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(3000) },
    );
    if (!res.ok) return [];
    const body = (await res.json()) as { Answer?: Array<{ type: number; data: string }> };
    return (body.Answer ?? [])
      .filter((a) => a.type === (type === 'A' ? 1 : 28))
      .map((a) => a.data);
  };

  const [a, aaaa] = await Promise.all([query('A'), query('AAAA')]);
  for (const ip of a) {
    const v4 = parseIpv4(ip);
    if (v4 !== null && isPrivateIpv4(v4)) {
      throw new SsrfError(`Hostname ${host} resolves to private ${ip}`);
    }
  }
  for (const ip of aaaa) {
    if (isPrivateIpv6(ip)) throw new SsrfError(`Hostname ${host} resolves to private ${ip}`);
  }
}
