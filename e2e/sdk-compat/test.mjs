// Drop-in compatibility proof: the OFFICIAL Firecrawl v2 SDK (@mendable/firecrawl-js)
// pointed at the fuegol.ink API with a fuegol key. No business-logic changes.
import { Firecrawl } from '@mendable/firecrawl-js';

const API = process.env.FUEGOL_API || 'https://fuegol-api.manhattan.workers.dev';
let pass = 0,
  fail = 0;
const ok = (n, cond, extra = '') => {
  console.log(cond ? `✅ ${n}` : `❌ ${n}${extra ? ' — ' + extra : ''}`);
  cond ? pass++ : fail++;
};

// Issue a fuegol key (never a Firecrawl fc- key).
const keyRes = await fetch(`${API}/v2/keys`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'sdk-compat' }),
});
const { apiKey } = await keyRes.json();
console.log('issued fuegol key:', (apiKey || '').slice(0, 16) + '…\n');

const app = new Firecrawl({ apiKey, apiUrl: API });

try {
  const d = await app.scrape('https://example.com', { formats: ['markdown'] });
  ok(
    'SDK.scrape → markdown',
    typeof d?.markdown === 'string' && /domain/i.test(d.markdown),
    JSON.stringify(Object.keys(d || {})),
  );
} catch (e) {
  ok('SDK.scrape', false, e.message);
}

try {
  const m = await app.map('https://example.com', { limit: 10 });
  const links = m?.links ?? m;
  ok('SDK.map → links[]', Array.isArray(links), JSON.stringify(Object.keys(m || {})));
} catch (e) {
  ok('SDK.map', false, e.message);
}

try {
  const s = await app.search('cloudflare workers durable objects', { limit: 3 });
  const web = s?.web ?? s?.data?.web ?? (Array.isArray(s) ? s : []);
  ok(
    'SDK.search → web results',
    Array.isArray(web) && web.length > 0,
    JSON.stringify(Object.keys(s || {})),
  );
} catch (e) {
  ok('SDK.search', false, e.message);
}

try {
  const c = await app.crawl('https://books.toscrape.com', { limit: 3 });
  ok(
    'SDK.crawl → completed + data',
    c?.status === 'completed' && Array.isArray(c?.data) && c.data.length > 0,
    `status=${c?.status} pages=${c?.data?.length}`,
  );
} catch (e) {
  ok('SDK.crawl', false, e.message);
}

try {
  const started = await app.startCrawl('https://books.toscrape.com', { limit: 2 });
  const id = started?.id;
  ok('SDK.startCrawl → id', typeof id === 'string', JSON.stringify(Object.keys(started || {})));
  if (id) {
    const st = await app.getCrawlStatus(id);
    ok('SDK.getCrawlStatus → status', typeof st?.status === 'string', `status=${st?.status}`);
  }
} catch (e) {
  ok('SDK.startCrawl/getCrawlStatus', false, e.message);
}

try {
  const b = await app.startBatchScrape(['https://example.com', 'https://www.iana.org'], {
    formats: ['markdown'],
  });
  ok('SDK.startBatchScrape → id', typeof b?.id === 'string', JSON.stringify(Object.keys(b || {})));
} catch (e) {
  ok('SDK.startBatchScrape', false, e.message);
}

try {
  const x = await app.extract({ urls: ['https://example.com'], prompt: 'What is this page for?' });
  ok('SDK.extract → data', x !== undefined && x !== null, JSON.stringify(Object.keys(x || {})));
} catch (e) {
  ok('SDK.extract', false, e.message);
}

console.log(`\nSDK COMPAT: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
