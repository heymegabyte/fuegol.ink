// Reproducible E2E for changeTracking `json` mode (AI-structured semantic diff).
// Scrapes a URL that changes each request (quotes.toscrape.com/random) with
// changeTracking modes [git-diff, json]; asserts baseline 'new', then on a real change
// that an AI-structured `json` diff (summary + changes) is produced alongside git-diff.
// Authenticated (avoids demo limiter). Zero dependencies.
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
    body: '{"name":"e2e-change-json"}',
  })
).json();
const H = { 'content-type': 'application/json', authorization: `Bearer ${keyRes.apiKey}` };
const tag = `e2e-json-${crypto.randomUUID().slice(0, 8)}`;
const url = 'https://quotes.toscrape.com/random';
const scrape = async () =>
  (
    await fetch(`${API}/v2/scrape`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({
        url,
        formats: ['markdown', { type: 'changeTracking', modes: ['git-diff', 'json'], tag }],
      }),
    })
  ).json();

console.log(`\nchangeTracking json mode E2E → ${API}\n`);
ok('issued an authenticated key', (keyRes.apiKey || '').startsWith('fgl_'));

// Baseline
const first = await scrape();
const ct0 = first.data?.changeTracking;
ok('first scrape is new', ct0?.changeStatus === 'new', ct0?.changeStatus);
ok('no json diff on baseline', ct0?.json === undefined);

// Run until the random quote changes
let changed = null;
for (let i = 0; i < 8 && !changed; i += 1) {
  const r = await scrape();
  if (r.data?.changeTracking?.changeStatus === 'changed') changed = r.data.changeTracking;
}
ok('detected a change within 8 scrapes', Boolean(changed), changed?.changeStatus);
if (changed) {
  ok(
    'git-diff present on change',
    typeof changed.diff?.text === 'string' && changed.diff.text.length > 0,
  );
  const j = changed.json;
  ok('AI json diff is a structured object', j && typeof j === 'object' && !Array.isArray(j));
  ok(
    'json diff has a summary string',
    typeof j?.summary === 'string' && j.summary.length > 0,
    (j?.summary || '').slice(0, 80),
  );
  ok('json diff has a changes array', Array.isArray(j?.changes));
  // Honesty: the structured diff must not dump the full previous page content.
  ok(
    'json diff does not leak raw page content',
    JSON.stringify(j).length < 4000,
    `${JSON.stringify(j).length} bytes`,
  );
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
