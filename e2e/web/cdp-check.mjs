#!/usr/bin/env node
/**
 * Real-browser E2E for the marketing site, driven over the Chrome DevTools Protocol
 * (no Playwright/Browserbase dependency — uses Node's global WebSocket + a local
 * headless Chromium). Loads the LIVE site, asserts it renders, captures every console
 * error + CSP violation, and exercises the two new dynamic surfaces end-to-end:
 *   • savings calculator  → fetch GET /v2/pricing, render savings
 *   • price estimator      → POST /v2/quote, render a bounded quote
 *   • migration tabs       → switch TS ↔ Python panes
 *
 *   URL=https://fuegol-web.manhattan.workers.dev node e2e/web/cdp-check.mjs
 *
 * Local-only (needs a Chromium binary) — not a CI gate, like the rest of e2e/.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const URL_ = process.env.URL ?? 'https://fuegol-web.manhattan.workers.dev';
const PORT = Number(process.env.CDP_PORT ?? 9333);
const BINS = [
  process.env.CHROME,
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1178/chrome-mac/headless_shell`,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);
const BIN = BINS.find((b) => existsSync(b));
if (!BIN) {
  console.error('No Chromium/Chrome binary found; skipping real-browser check.');
  process.exit(2);
}

let pass = 0,
  fail = 0;
const ok = (name, cond, extra = '') => {
  (cond ? pass++ : fail++,
    console[cond ? 'log' : 'error'](`  ${cond ? '✓' : '✗'} ${name}${cond ? '' : '  ' + extra}`));
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(
  BIN,
  [
    `--remote-debugging-port=${PORT}`,
    '--user-data-dir=/tmp/fuegol-cdp-profile',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--window-size=1280,900',
    'about:blank',
  ],
  { stdio: 'ignore' },
);
const cleanup = () => {
  try {
    child.kill('SIGKILL');
  } catch {}
};
process.on('exit', cleanup);

async function browserWs() {
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return (await r.json()).webSocketDebuggerUrl;
    } catch {}
    await sleep(100);
  }
  throw new Error('Chromium DevTools endpoint never came up');
}

const consoleErrors = [];
let nextId = 1;
const pending = new Map();
const eventWaiters = [];

function send(ws, method, params = {}, sessionId) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
function waitFor(predicate, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('event timeout')), timeout);
    eventWaiters.push((msg) => {
      if (predicate(msg)) {
        clearTimeout(t);
        resolve(msg);
        return true;
      }
      return false;
    });
  });
}

async function main() {
  const wsUrl = await browserWs();
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
      return;
    }
    // Capture console errors + CSP / security log entries + page exceptions.
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error')
      consoleErrors.push(
        'console.error: ' + msg.params.args.map((a) => a.value ?? a.description ?? '').join(' '),
      );
    if (msg.method === 'Runtime.exceptionThrown')
      consoleErrors.push(
        'exception: ' +
          (msg.params.exceptionDetails?.exception?.description ??
            msg.params.exceptionDetails?.text),
      );
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error')
      consoleErrors.push(`log(${msg.params.entry.source}): ` + msg.params.entry.text);
    for (let i = eventWaiters.length - 1; i >= 0; i--)
      if (eventWaiters[i](msg)) eventWaiters.splice(i, 1);
  });

  const { targetId } = await send(ws, 'Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send(ws, 'Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => send(ws, m, p, sessionId);
  await S('Page.enable');
  await S('Runtime.enable');
  await S('Log.enable');
  await S('Network.enable');

  const loaded = waitFor(
    (m) => m.method === 'Page.loadEventFired' && m.sessionId === sessionId,
    20000,
  );
  await S('Page.navigate', { url: URL_ });
  await loaded;
  await sleep(4000); // let the calculator's /v2/pricing fetch resolve

  const ev15 = async (expr) =>
    (await S('Runtime.evaluate', { expression: expr, returnByValue: true })).result.value;

  console.log(`\nreal-browser (CDP) E2E → ${URL_}\n`);

  // Render
  ok(
    'hero H1 renders the new headline',
    /Half the core API cost/.test(await ev15("document.querySelector('h1.hero')?.innerText||''")),
  );
  const rootLen = await ev15('document.body.innerText.length');
  ok('page body is non-empty (not blank/white)', rootLen > 1500, `len=${rootLen}`);

  // Savings calculator (ran its live /v2/pricing fetch)
  const calc = await ev15("document.getElementById('calcOut')?.innerText||''");
  ok(
    'savings calculator rendered a result',
    /\/mo on fuegol/.test(calc) && /% less/.test(calc),
    calc.slice(0, 120),
  );
  ok('calculator shows the Standard default ($49.50)', /\$49\.50/.test(calc), calc.slice(0, 120));

  // Migration tabs
  await ev15(
    "[...document.querySelectorAll('#migTabs button')].find(b=>b.dataset.l==='py').click()",
  );
  await sleep(200);
  ok(
    'migration tab switches to Python',
    (await ev15("document.getElementById('mig-py').hidden")) === false &&
      (await ev15("document.getElementById('mig-ts').hidden")) === true,
  );

  // Price estimator (POST /v2/quote in-browser)
  await ev15("document.getElementById('eBtn').click()");
  let eout = '';
  for (let i = 0; i < 20; i++) {
    await sleep(400);
    eout = await ev15("document.getElementById('eOut')?.innerText||''");
    if (/credits/.test(eout)) break;
  }
  ok(
    'estimator returned a quote via POST /v2/quote',
    /\bcredits\b/.test(eout) && /margin-safe/.test(eout),
    eout.slice(0, 140),
  );
  ok(
    'estimator shows a hard cap + Firecrawl comparison',
    /hard cap/.test(eout) && /Firecrawl/.test(eout),
    eout.slice(0, 160),
  );

  // Console / CSP cleanliness through the happy path (snapshot BEFORE we deliberately trip a 400).
  const happyErrors = [...consoleErrors];
  ok(
    '0 console errors / CSP violations through the happy path',
    happyErrors.length === 0,
    '\n   - ' + happyErrors.join('\n   - '),
  );

  // Fail-closed in-browser: an unbounded crawl must warn. The API returns an expected
  // 400 (boundable:false) — the ONLY network log entry we tolerate, and itself proof
  // that the product refuses to quote an unbounded-cost job.
  await ev15(
    "document.getElementById('eOp').value='crawl';document.getElementById('eOp').dispatchEvent(new Event('change'));document.getElementById('ePages').value='';document.getElementById('eBtn').click()",
  );
  let warn = '';
  for (let i = 0; i < 15; i++) {
    await sleep(400);
    warn = await ev15("document.getElementById('eOut')?.innerText||''");
    if (/⚠|page limit/i.test(warn)) break;
  }
  ok(
    'unbounded crawl warns (fails closed) in-browser',
    /page limit|unbounded/i.test(warn),
    warn.slice(0, 140),
  );
  const extraLogs = consoleErrors.slice(happyErrors.length);
  ok(
    'only extra console entry is the expected fail-closed 400',
    extraLogs.length >= 1 && extraLogs.every((l) => /status of 400/.test(l)),
    '\n   - ' + extraLogs.join('\n   - '),
  );

  // Visual evidence
  try {
    const { data } = await S('Page.captureScreenshot', { format: 'png' });
    const { writeFileSync, mkdirSync } = await import('node:fs');
    mkdirSync('e2e/web/screenshots', { recursive: true });
    writeFileSync('e2e/web/screenshots/home.png', Buffer.from(data, 'base64'));
    console.log('\n  📸 e2e/web/screenshots/home.png');
  } catch {}

  console.log(`\n${pass} passed, ${fail} failed\n`);
  cleanup();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('harness error:', e.message);
  cleanup();
  process.exit(1);
});
