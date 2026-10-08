// Reproducible benchmark: scrape a representative corpus via the live fuegol API,
// measuring end-to-end latency (client → edge → target → markdown), success, and tier.
// Honest: numbers include network RTT from the runner; corpus is public + authorized.
const API = process.env.FUEGOL_API || 'https://fuegol-api.manhattan.workers.dev';
const RUNS = Number(process.env.RUNS || 3);

const corpus = [
  ['static (example.com)', 'https://example.com'],
  ['e-commerce (books.toscrape)', 'https://books.toscrape.com'],
  ['wiki (Cloudflare)', 'https://en.wikipedia.org/wiki/Cloudflare'],
  ['news (Hacker News)', 'https://news.ycombinator.com'],
  ['docs (MDN)', 'https://developer.mozilla.org/en-US/'],
  ['blog (CSS-Tricks)', 'https://css-tricks.com/'],
];

// Warm up the worker so the first measured request isn't a cold start.
try {
  await fetch(`${API}/v2/scrape`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com', formats: ['markdown'] }),
  });
} catch {
  /* ignore warmup errors */
}
await new Promise((r) => setTimeout(r, 500));

const all = [];
const rows = [];
for (const [name, url] of corpus) {
  const lat = [];
  let ok = 0;
  let mdLen = 0;
  let tier = '';
  for (let i = 0; i < RUNS; i += 1) {
    const t0 = performance.now();
    let j = {};
    let res = { headers: new Map() };
    try {
      res = await fetch(`${API}/v2/scrape`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url, formats: ['markdown'] }),
      });
      j = await res.json();
    } catch {
      j = {};
    }
    const ms = performance.now() - t0;
    if (j.success) {
      ok += 1;
      mdLen = (j.data.markdown || '').length;
    }
    tier = (res.headers.get && res.headers.get('x-fuegol-strategy')) || tier;
    lat.push(ms);
    await new Promise((r) => setTimeout(r, 400));
  }
  lat.sort((a, b) => a - b);
  all.push(...lat);
  rows.push({
    name,
    median: Math.round(lat[Math.floor(lat.length / 2)]),
    ok: `${ok}/${RUNS}`,
    mdLen,
    tier,
  });
}

all.sort((a, b) => a - b);
const pct = (q) => Math.round(all[Math.min(all.length - 1, Math.floor(all.length * q))]);

console.log('\n| Corpus item | Median latency | Success | Markdown chars | Tier |');
console.log('|---|---:|---:|---:|---|');
for (const r of rows)
  console.log(`| ${r.name} | ${r.median} ms | ${r.ok} | ${r.mdLen} | ${r.tier} |`);
console.log(
  `\nOVERALL (scrape, static corpus): P50=${pct(0.5)}ms  P95=${pct(0.95)}ms  (n=${all.length} requests, ${RUNS}/url)`,
);

// --- Tier + adjacent-operation latencies (median of RUNS, light retry on transient failure) ---
// bustCache: append a unique query param per run so the planner/browser can't reuse a warm render.
async function timePost(path, body, bustCache = false) {
  const lat = [];
  let last = {};
  let okCount = 0;
  for (let i = 0; i < RUNS; i += 1) {
    const t0 = performance.now();
    let j = {};
    let tier = '';
    const runBody =
      bustCache && body.url
        ? { ...body, url: `${body.url}${body.url.includes('?') ? '&' : '?'}_b=${i}` }
        : body;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await fetch(`${API}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(runBody),
        });
        j = await res.json();
        tier = (res.headers.get && res.headers.get('x-fuegol-strategy')) || tier;
        if (j.success) break; // transient target failure → one retry
      } catch {
        j = {};
      }
      await new Promise((r) => setTimeout(r, 600));
    }
    lat.push(performance.now() - t0);
    last = { j, tier };
    if (j.success) okCount += 1;
    await new Promise((r) => setTimeout(r, 400));
  }
  lat.sort((a, b) => a - b);
  return {
    ms: Math.round(lat[Math.floor(lat.length / 2)]),
    j: last.j,
    tier: last.tier,
    ok: `${okCount}/${RUNS}`,
  };
}

console.log('\n| Operation | Median latency | Success | Result | Tier |');
console.log('|---|---:|---:|---|---|');
// Browser tier, forced (JS-rendered SPA)
const b = await timePost(
  '/v2/scrape',
  { url: 'https://quotes.toscrape.com/js/', formats: ['markdown'], waitFor: 1200 },
  true,
);
console.log(
  `| scrape (browser, quotes.toscrape JS) | ${b.ms} ms | ${b.ok} | ${b.j.success ? `${(b.j.data.markdown || '').length} md chars` : 'n/a'} | ${b.tier} |`,
);
// Map
const m = await timePost('/v2/map', { url: 'https://books.toscrape.com' });
const links = m.j.success ? (m.j.links || m.j.data?.links || []).length : 0;
console.log(
  `| map (books.toscrape) | ${m.ms} ms | ${m.ok} | ${m.j.success ? `${links} URLs` : 'n/a'} | http |`,
);
// Parse (PDF via unpdf)
const p = await timePost('/v2/parse', { url: 'https://pdfobject.com/pdf/sample.pdf' });
console.log(
  `| parse (PDF → markdown, unpdf) | ${p.ms} ms | ${p.ok} | ${p.j.success ? `${(p.j.data?.markdown || p.j.markdown || '').length} md chars` : 'n/a'} | n/a |`,
);
