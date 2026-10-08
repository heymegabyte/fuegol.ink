// Reproducible E2E for monitor change-alert webhooks. Creates a monitor on a URL that
// genuinely changes each request (quotes.toscrape.com/random), runs it until a change is
// detected, and verifies a signed `monitor.changed` webhook was delivered — including a
// valid HMAC-SHA256 signature and correct payload — by inspecting an external sink
// (webhook.site). Authenticated (monitors require a key; also dodges the demo limiter).
//
// Note: delivery targets must be EXTERNAL. The Worker cannot fetch its own public hostname
// (`/webhook-sink`) from the request/cron context (CF error 1042), so real customer webhooks
// work but the built-in self-sink does not for monitor alerts — hence webhook.site here.
import { createHmac } from 'node:crypto';

const API = process.env.FUEGOL_API || 'https://fuegol-api.manhattan.workers.dev';
const SECRET = process.env.WEBHOOK_SECRET || 'whsec_fuegol_demo_override_in_prod';
let pass = 0;
let fail = 0;
const ok = (name, cond, detail = '') => {
  cond ? (pass += 1) : (fail += 1);
  console.log(`  ${cond ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log(`\nmonitor webhook E2E → ${API}\n`);

// Provision an external, inspectable sink.
let sinkUuid = '';
try {
  const t = await (await fetch('https://webhook.site/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json();
  sinkUuid = t.uuid || '';
} catch {
  /* handled below */
}
const sinkUrl = sinkUuid ? `https://webhook.site/${sinkUuid}` : 'https://httpbin.org/status/200';
ok('provisioned a webhook sink', Boolean(sinkUrl), sinkUuid ? 'webhook.site' : 'httpbin fallback (no payload inspection)');

// Key + monitor
const keyRes = await (await fetch(`${API}/v2/keys`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"name":"e2e-monitor-webhook"}' })).json();
const AUTH = keyRes.apiKey || '';
ok('issued an authenticated key', AUTH.startsWith('fgl_'));
const H = { 'content-type': 'application/json', authorization: `Bearer ${AUTH}` };

const created = await (
  await fetch(`${API}/v2/monitor`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ url: 'https://quotes.toscrape.com/random', name: 'random-quote', webhook: sinkUrl }),
  })
).json();
const monId = created.monitor?.id;
ok('created monitor with webhook', Boolean(monId) && created.monitor?.webhook_url === sinkUrl, monId || JSON.stringify(created));

const run = async () => (await fetch(`${API}/v2/monitor/${monId}/run`, { method: 'POST', headers: H })).json();

// Baseline → 'new', no webhook
const first = await run();
ok('first run is baseline (new)', first.changeStatus === 'new', first.changeStatus);
ok('no webhook on baseline', !first.webhookDelivered, String(first.webhookDelivered));

// Run until the random quote changes → webhook fires
let changed = null;
for (let i = 0; i < 10 && !changed; i += 1) {
  const r = await run();
  if (r.changeStatus === 'changed') changed = r;
}
ok('detected a change within 10 runs', Boolean(changed), changed ? `delivered=${changed.webhookDelivered}` : 'no change seen');
ok('webhook delivered on change', changed?.webhookDelivered === true, String(changed?.webhookDelivered));

// Inspect the delivered payload + verify the signature (webhook.site only)
if (sinkUuid && changed) {
  let req = null;
  for (let i = 0; i < 5 && !req; i += 1) {
    await new Promise((r) => setTimeout(r, 1500));
    const list = await (await fetch(`https://webhook.site/token/${sinkUuid}/requests?sorting=newest`)).json();
    req = (list.data || []).find((r) => (r.headers?.['x-fuegol-event'] || [])[0] === 'monitor.changed') || null;
  }
  ok('external sink received monitor.changed', Boolean(req), req ? 'yes' : 'not seen');
  if (req) {
    const sig = (req.headers['x-fuegol-signature'] || [])[0] || '';
    const expected = `sha256=${createHmac('sha256', SECRET).update(req.content).digest('hex')}`;
    ok('HMAC-SHA256 signature valid', sig === expected, sig.slice(0, 22) + '…');
    const payload = JSON.parse(req.content);
    ok('payload.type is monitor.changed', payload.type === 'monitor.changed', payload.type);
    ok('payload carries changed document', Array.isArray(payload.data) && payload.data[0]?.changeTracking?.changeStatus === 'changed');
    ok('payload metadata has monitorId + url', payload.metadata?.monitorId === monId && payload.metadata?.url === 'https://quotes.toscrape.com/random');
  }
} else if (!sinkUuid) {
  console.log('  ⚠ webhook.site unavailable — verified delivery flag only (no payload/signature inspection)');
}

await fetch(`${API}/v2/monitor/${monId}`, { method: 'DELETE', headers: H });
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
