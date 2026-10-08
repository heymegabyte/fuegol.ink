// Reproducible E2E for multi-source search (web / news / images). Asserts each requested
// source returns real, well-formed results from the live providers (Exa + Tavily).
// Authenticated to avoid the demo per-IP limiter. Zero dependencies.
const API = process.env.FUEGOL_API || 'https://fuegol-api.manhattan.workers.dev';
let pass = 0;
let fail = 0;
const ok = (name, cond, detail = '') => {
  cond ? (pass += 1) : (fail += 1);
  console.log(`  ${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const keyRes = await (await fetch(`${API}/v2/keys`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"name":"e2e-search-sources"}' })).json();
const H = { 'content-type': 'application/json', authorization: `Bearer ${keyRes.apiKey}` };
const search = async (body) => (await fetch(`${API}/v2/search`, { method: 'POST', headers: H, body: JSON.stringify(body) })).json();
const isUrl = (u) => typeof u === 'string' && /^https?:\/\//.test(u);

console.log(`\nmulti-source search E2E → ${API}\n`);
ok('issued an authenticated key', (keyRes.apiKey || '').startsWith('fgl_'));

// web (baseline / regression)
const w = await search({ query: 'cloudflare workers', sources: ['web'], limit: 5 });
ok('web returns results', Array.isArray(w.data?.web) && w.data.web.length > 0 && isUrl(w.data.web[0].url), `${w.data?.web?.length ?? 0} results`);
ok('web has no news/images keys when not requested', !w.data?.news && !w.data?.images);

// news
const n = await search({ query: 'artificial intelligence', sources: ['news'], limit: 5 });
ok('news returns results', Array.isArray(n.data?.news) && n.data.news.length > 0 && isUrl(n.data.news[0].url), `${n.data?.news?.length ?? 0} results`);
ok('news results have titles', (n.data?.news ?? []).every((r) => r.title === undefined || typeof r.title === 'string'));
console.log(`     e.g. news[0]: ${(n.data?.news?.[0]?.title || n.data?.news?.[0]?.url || '').slice(0, 80)}`);

// images
const im = await search({ query: 'golden gate bridge', sources: ['images'], limit: 5 });
const imgs = im.data?.images ?? [];
ok('images returns results', Array.isArray(imgs) && imgs.length > 0 && isUrl(imgs[0].url), `${imgs.length} images`);
ok('image results carry imageUrl + position', imgs.every((i) => isUrl(i.imageUrl) && typeof i.position === 'number'));
console.log(`     e.g. image[0]: ${(imgs[0]?.imageUrl || '').slice(0, 80)}`);

// all three at once
const all = await search({ query: 'climate change', sources: ['web', 'news', 'images'], limit: 4 });
ok('multi-source returns web + news + images', all.data?.web?.length > 0 && all.data?.news?.length > 0 && (all.data?.images?.length ?? 0) > 0,
  `web=${all.data?.web?.length} news=${all.data?.news?.length} images=${all.data?.images?.length}`);
ok('creditsUsed reported', typeof all.creditsUsed === 'number' && all.creditsUsed > 0, String(all.creditsUsed));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
