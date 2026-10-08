import { describe, it, expect } from 'vitest';
import { scrape } from '../src/scrape';
import { mapSite } from '../src/map';

/** Live integration tests against stable public endpoints. */
describe('scrape (live)', () => {
  it('scrapes example.com to clean markdown', async () => {
    const { document, strategy } = await scrape({ url: 'https://example.com' }, {});
    expect(document.metadata.statusCode).toBe(200);
    expect(document.url).toContain('example.com');
    expect((document.markdown ?? '').length).toBeGreaterThan(20);
    expect(document.markdown ?? '').toMatch(/domain/i);
    expect(document.title ?? '').toMatch(/example/i);
    expect(strategy).toBe('http');
  }, 30000);

  it('honours requested formats (html + rawHtml + links)', async () => {
    const { document } = await scrape(
      { url: 'https://example.com', formats: ['markdown', 'html', 'rawHtml', 'links'] },
      {},
    );
    expect(typeof document.html).toBe('string');
    expect(document.rawHtml ?? '').toContain('<');
    expect(Array.isArray(document.links)).toBe(true);
  }, 30000);

  it('extracts richer markdown from a content page (MDN)', async () => {
    const { document } = await scrape({ url: 'https://developer.mozilla.org/en-US/' }, {});
    expect(document.metadata.statusCode).toBeLessThan(400);
    expect((document.markdown ?? '').length).toBeGreaterThan(200);
  }, 30000);
});

describe('map (live)', () => {
  it('discovers URLs for a site and returns link objects', async () => {
    const links = await mapSite({ url: 'https://example.com', limit: 50 }, {});
    expect(Array.isArray(links)).toBe(true);
    for (const l of links) expect(typeof l.url).toBe('string');
  }, 30000);
});
