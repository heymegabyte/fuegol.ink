// Reproducible E2E for scrape caching (Firecrawl `maxAge` / `storeInCache`). Proves:
//   • second scrape within maxAge → cacheState 'hit' + strategy 'cache' (no re-fetch)
//   • maxAge expiry → stale entry is a miss, while a longer maxAge hits the same entry
//   • storeInCache:false → nothing is cached
// Unique URLs per run (query param) so prior runs don't interfere. Authenticated. Zero deps.
const API = process.env.FUEGOL_API || 'https://fuegol-api.manhattan.workers.dev';
let pass = 0;
let fail = 0;
const ok = (name, cond, detail = '') => {
  cond ? (pass += 1) : (fail += 1);
  console.log(`  ${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const keyRes = await (await fetch(`${API}/v2/keys`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"name":"e2e-cache"}' })).json();
const H = { 'content-type': 'application/json', authorization: `Bearer ${keyRes.apiKey}` };
const scrape = async (body) => {
  const t0 = performance.now();
  const res = await fetch(`${API}/v2/scrape`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const json = await res.json();
  return { ms: Math.round(performance.now() - t0), strategy: res.headers.get('x-fuegol-strategy'), state: json.data?.metadata?.cacheState, json };
};
const uniq = (n) => `https://example.com/?cb=${Date.now()}-${n}`;

console.log(`\nscrape cache E2E → ${API}\n`);
ok('issued an authenticated key', (keyRes.apiKey || '').startsWith('fgl_'));

// 1. hit within maxAge
const u1 = uniq('hit');
const a = await scrape({ url: u1, formats: ['markdown'], maxAge: 120000 });
ok('first scrape is a miss', a.state === 'miss', `state=${a.state} ${a.ms}ms`);
const b = await scrape({ url: u1, formats: ['markdown'], maxAge: 120000 });
ok('second scrape within maxAge is a HIT', b.state === 'hit', `state=${b.state} ${b.ms}ms`);
ok('hit is served from cache tier', b.strategy === 'cache', b.strategy || '');
ok('cached markdown matches', b.json.data?.markdown === a.json.data?.markdown);

// 2. expiry: maxAge:1 misses the just-stored entry; maxAge:120000 hits it
const u2 = uniq('exp');
await scrape({ url: u2, formats: ['markdown'], maxAge: 1 }); // stores
const e2 = await scrape({ url: u2, formats: ['markdown'], maxAge: 1 });
ok('tiny maxAge (1ms) expires → miss', e2.state === 'miss', `state=${e2.state}`);
const e3 = await scrape({ url: u2, formats: ['markdown'], maxAge: 120000 });
ok('same entry hits under a longer maxAge', e3.state === 'hit', `state=${e3.state}`);

// 3. storeInCache:false → not cached
const u3 = uniq('nostore');
await scrape({ url: u3, formats: ['markdown'], maxAge: 120000, storeInCache: false });
const d2 = await scrape({ url: u3, formats: ['markdown'], maxAge: 120000 });
ok('storeInCache:false prevented caching (still miss)', d2.state === 'miss', `state=${d2.state}`);
const d3 = await scrape({ url: u3, formats: ['markdown'], maxAge: 120000 });
ok('normal store works afterwards (hit)', d3.state === 'hit', `state=${d3.state}`);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
