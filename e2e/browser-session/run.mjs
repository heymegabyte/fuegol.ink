// Reproducible E2E for persistent interactive browser sessions (/v2/browser + /act).
// Proves state persists across SEPARATE requests: two independent `act` calls each click
// "next" and must advance page 1 → 2 → 3. Zero dependencies (node fetch sends a real UA).
//   node e2e/browser-session/run.mjs   (FUEGOL_API overrides the base URL)
const API = process.env.FUEGOL_API || 'https://fuegol-api.manhattan.workers.dev';
let pass = 0;
let fail = 0;
const ok = (name, cond, detail = '') => {
  cond ? (pass += 1) : (fail += 1);
  console.log(`  ${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};
// Authenticate with a fresh key so the run isn't subject to the demo per-IP rate limit
// (and so it exercises the authed + credit-metered path). Issued at startup below.
let AUTH = '';
const authHeaders = (extra = {}) => (AUTH ? { authorization: `Bearer ${AUTH}`, ...extra } : extra);
const post = async (path, body) => {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: authHeaders({ 'content-type': 'application/json' }),
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
};
const getJson = (path) => fetch(`${API}${path}`, { headers: authHeaders() }).then((r) => r.json());
const del = (path) => fetch(`${API}${path}`, { method: 'DELETE', headers: authHeaders() });

const clickNext = {
  actions: [
    { type: 'wait', selector: 'li.next a' },
    { type: 'click', selector: 'li.next a' },
    { type: 'wait', milliseconds: 1000 },
  ],
};

console.log(`\ninteractive browser session E2E → ${API}\n`);

// 0. issue a key (authed path avoids the demo per-IP rate limit)
const keyRes = await post('/v2/keys', { name: 'e2e-sessions' });
AUTH = keyRes.json?.apiKey || '';
ok('issued an authenticated key', AUTH.startsWith('fgl_'), AUTH ? `${AUTH.slice(0, 12)}…` : 'none');

// 1. create
const created = await post('/v2/browser', { url: 'https://quotes.toscrape.com/' });
const id = created.json?.id;
ok('create returns a session id', Boolean(id), id || JSON.stringify(created.json));
ok(
  'create landed on page 1',
  (created.json?.url || '').endsWith('quotes.toscrape.com/'),
  created.json?.url,
);
if (!id) {
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(1);
}

// 2. act → page 2
const a1 = await post(`/v2/browser/${id}/act`, clickNext);
ok('act #1 advanced to /page/2/', (a1.json?.url || '').includes('/page/2'), a1.json?.url);
ok('act #1 actCount=1', a1.json?.actCount === 1, String(a1.json?.actCount));

// 3. act again → page 3 (state persisted across a separate request)
const a2 = await post(`/v2/browser/${id}/act`, clickNext);
ok(
  'act #2 advanced to /page/3/ (STATE PERSISTED)',
  (a2.json?.url || '').includes('/page/3'),
  a2.json?.url,
);
ok('act #2 actCount=2', a2.json?.actCount === 2, String(a2.json?.actCount));

// 4. info reflects accumulated state
const info = await getJson(`/v2/browser/${id}`);
ok(
  'info reports /page/3/ + actCount=2',
  (info?.url || '').includes('/page/3') && info?.actCount === 2,
  `${info?.url} / ${info?.actCount}`,
);

// 5. close
const closed = await (await del(`/v2/browser/${id}`)).json();
ok('close returns status=closed', closed?.status === 'closed', closed?.status);

// 6. act after close → honest 404 (never fabricated success)
const after = await post(`/v2/browser/${id}/act`, clickNext);
ok(
  'act after close rejected (404)',
  after.status === 404 && after.json?.success === false,
  `HTTP ${after.status}`,
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
