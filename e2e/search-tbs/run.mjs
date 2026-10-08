// Reproducible E2E for `tbs` time-based search. Proves the filter actually narrows results
// by publish date (not just that the param is forwarded): news results carry dates, and a
// `qdr:w` / `qdr:d` search returns only results within that window. Authenticated. Zero deps.
const API = process.env.FUEGOL_API || 'https://fuegol-api.manhattan.workers.dev';
let pass = 0;
let fail = 0;
const ok = (name, cond, detail = '') => {
  cond ? (pass += 1) : (fail += 1);
  console.log(`  ${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const keyRes = await (
  await fetch(`${API}/v2/keys`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"name":"e2e-tbs"}',
  })
).json();
const H = { 'content-type': 'application/json', authorization: `Bearer ${keyRes.apiKey}` };
const search = async (body) =>
  (
    await fetch(`${API}/v2/search`, { method: 'POST', headers: H, body: JSON.stringify(body) })
  ).json();
const NOW = Date.now();
const ageDays = (d) => (NOW - Date.parse(d)) / 86_400_000;

console.log(`\ntbs time-filter E2E → ${API}\n`);
ok('issued an authenticated key', (keyRes.apiKey || '').startsWith('fgl_'));

// News carries dates (needed for any time assertion to be meaningful)
const base = await search({ query: 'technology', sources: ['news'], limit: 10 });
const baseNews = base.data?.news ?? [];
const baseDated = baseNews.filter((r) => r.date && !Number.isNaN(Date.parse(r.date)));
ok(
  'news results carry publish dates',
  baseDated.length > 0,
  `${baseDated.length}/${baseNews.length} dated`,
);

// qdr:w → every dated result within the past ~10 days (7-day window + buffer)
const wk = await search({ query: 'technology', sources: ['news'], limit: 10, tbs: 'qdr:w' });
const wkDated = (wk.data?.news ?? []).filter((r) => r.date && !Number.isNaN(Date.parse(r.date)));
const wkMaxAge = wkDated.length ? Math.max(...wkDated.map((r) => ageDays(r.date))) : null;
ok(
  'qdr:w returns results',
  (wk.data?.news ?? []).length > 0,
  `${(wk.data?.news ?? []).length} results`,
);
ok(
  'qdr:w dated results all within ~10 days',
  wkDated.length > 0 && wkDated.every((r) => ageDays(r.date) <= 10),
  `max age ${wkMaxAge?.toFixed(1)}d`,
);

// qdr:d → tighter: every dated result within the past ~3 days
const dy = await search({ query: 'technology', sources: ['news'], limit: 10, tbs: 'qdr:d' });
const dyDated = (dy.data?.news ?? []).filter((r) => r.date && !Number.isNaN(Date.parse(r.date)));
const dyMaxAge = dyDated.length ? Math.max(...dyDated.map((r) => ageDays(r.date))) : null;
ok(
  'qdr:d returns results',
  (dy.data?.news ?? []).length > 0,
  `${(dy.data?.news ?? []).length} results`,
);
ok(
  'qdr:d dated results all within ~3 days',
  dyDated.length > 0 && dyDated.every((r) => ageDays(r.date) <= 3),
  `max age ${dyMaxAge?.toFixed(1)}d`,
);

// The narrower window is no older than the wider one (sanity: the filter tightens recency)
ok(
  'qdr:d window ≤ qdr:w window',
  dyMaxAge === null || wkMaxAge === null || dyMaxAge <= wkMaxAge + 0.5,
  `${dyMaxAge?.toFixed(1)}d ≤ ${wkMaxAge?.toFixed(1)}d`,
);

// An unsupported tbs form must not break the search (graceful ignore, not an error)
const bad = await search({ query: 'technology', sources: ['web'], limit: 3, tbs: 'garbage' });
ok('unsupported tbs ignored gracefully', bad.success === true && (bad.data?.web ?? []).length > 0);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
