import { describe, it, expect } from 'vitest';
import { assertSafeUrl, SsrfError, isPrivateIpv4, isPrivateIpv6, parseIpv4 } from '../src/ssrf';

describe('ssrf guard', () => {
  it('blocks localhost + internal suffixes', () => {
    expect(() => assertSafeUrl('http://localhost:8080')).toThrow(SsrfError);
    expect(() => assertSafeUrl('http://foo.internal/x')).toThrow(SsrfError);
    expect(() => assertSafeUrl('http://db.local')).toThrow(SsrfError);
  });

  it('blocks private + metadata IPv4', () => {
    expect(() => assertSafeUrl('http://10.0.0.1')).toThrow();
    expect(() => assertSafeUrl('http://192.168.1.1')).toThrow();
    expect(() => assertSafeUrl('http://127.0.0.1')).toThrow();
    expect(() => assertSafeUrl('http://169.254.169.254/latest/meta-data')).toThrow();
    expect(() => assertSafeUrl('http://100.64.0.1')).toThrow();
  });

  it('blocks loopback + ULA IPv6', () => {
    expect(() => assertSafeUrl('http://[::1]/')).toThrow();
    expect(() => assertSafeUrl('http://[fd00::1]/')).toThrow();
    expect(() => assertSafeUrl('http://[fe80::1]/')).toThrow();
  });

  it('blocks non-http(s) schemes', () => {
    expect(() => assertSafeUrl('file:///etc/passwd')).toThrow();
    expect(() => assertSafeUrl('ftp://example.com')).toThrow();
    expect(() => assertSafeUrl('gopher://x')).toThrow();
  });

  it('allows public URLs', () => {
    expect(assertSafeUrl('https://example.com/a?b=c').hostname).toBe('example.com');
    expect(assertSafeUrl('http://1.1.1.1').hostname).toBe('1.1.1.1');
  });

  it('classifies IPs correctly', () => {
    expect(isPrivateIpv4(parseIpv4('10.1.2.3')!)).toBe(true);
    expect(isPrivateIpv4(parseIpv4('8.8.8.8')!)).toBe(false);
    expect(isPrivateIpv6('::1')).toBe(true);
    expect(isPrivateIpv6('2606:4700::1111')).toBe(false);
  });
});
