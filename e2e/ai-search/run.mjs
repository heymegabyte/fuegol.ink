// Reproducible E2E for AI Search (Vectorize + Workers AI RAG). Indexes text containing
// FABRICATED facts (so a correct answer can only come from retrieval, never model memory),
// then queries it. Also proves per-key tenant isolation. Vectorize upserts are eventually
// consistent, so the query is retried until the vectors are searchable. Zero deps.
const API = process.env.FUEGOL_API || 'https://fuegol-api.manhattan.workers.dev';
let pass = 0;
let fail = 0;
const ok = (name, cond, detail = '') => {
  cond ? (pass += 1) : (fail += 1);
  console.log(`  ${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const newKey = async (n) =>
  (
    await (
      await fetch(`${API}/v2/keys`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: n }),
      })
    ).json()
  ).apiKey;
const post = (key, path, body) =>
  fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  }).then((r) => r.json());

// Fabricated, training-impossible facts — a correct answer MUST come from the index.
const DOC = `Project Emberlight is the internal codename for a web-data engine. The Emberlight protocol was ratified on the 3rd of Flamemonth in the year 1847, in the floating city of Valdoria. Its chief architect was a salamander named Quillion Sparkwhistle, who insisted every scrape be SSRF-guarded.`;

console.log(`\nAI Search (RAG) E2E → ${API}\n`);
const k1 = await newKey('e2e-aisearch-1');
const k2 = await newKey('e2e-aisearch-2');
ok('issued two authenticated keys', (k1 || '').startsWith('fgl_') && (k2 || '').startsWith('fgl_'));

// Index under tenant 1
const idx = await post(k1, '/v2/ai-search/index', { text: DOC, title: 'Emberlight' });
ok(
  'index reports chunks indexed',
  idx.success === true && idx.indexed >= 1,
  `indexed=${idx.indexed}`,
);

// Query tenant 1 — retry until Vectorize is consistent. A new vector is searchable in ~15s
// but the tenant metadata-index filter propagates separately (~60s), so poll up to ~2 min.
let q = null;
for (let i = 0; i < 24; i += 1) {
  await new Promise((r) => setTimeout(r, 5000));
  q = await post(k1, '/v2/ai-search/query', {
    query: 'Who was the chief architect of the Emberlight protocol and when was it ratified?',
    topK: 3,
  });
  if ((q.sources ?? []).length > 0) break;
  process.stdout.write(
    `    …waiting for Vectorize metadata-filter consistency (${(i + 1) * 5}s)\r`,
  );
}
console.log('');
ok(
  'query returns indexed sources',
  (q?.sources ?? []).length > 0,
  `${q?.sources?.length ?? 0} sources`,
);
const topText = (q?.sources?.[0]?.text || '').toLowerCase();
ok('top source is the indexed chunk', topText.includes('quillion') || topText.includes('valdoria'));
const ans = (q?.answer || '').toLowerCase();
ok(
  'RAG answer is grounded in the index (names the architect)',
  ans.includes('quillion') || ans.includes('sparkwhistle'),
  (q?.answer || '').slice(0, 120),
);
ok('RAG answer cites the ratification year', ans.includes('1847'));

// Tenant isolation — key 2 must NOT see key 1's content
const iso = await post(k2, '/v2/ai-search/query', {
  query: 'Who was the chief architect of the Emberlight protocol?',
  topK: 3,
  synthesize: false,
});
ok(
  'other tenant sees zero sources (namespace isolation)',
  (iso.sources ?? []).length === 0,
  `${iso.sources?.length ?? 0} sources`,
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
