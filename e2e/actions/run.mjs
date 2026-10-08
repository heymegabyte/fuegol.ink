// Reproducible regression for Firecrawl-compatible browser `actions` on /v2/scrape.
// Drives real interactions against the live API + public fixture sites and asserts
// state changes (navigation, typed input, JS returns, artifacts). Zero dependencies.
//   node e2e/actions/run.mjs   (FUEGOL_API overrides the base URL)
const API = process.env.FUEGOL_API || 'https://fuegol-api.manhattan.workers.dev';
let pass = 0;
let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) {
    pass += 1;
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail += 1;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

async function scrape(body) {
  const res = await fetch(`${API}/v2/scrape`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return {
    status: res.status,
    strategy: res.headers.get('x-fuegol-strategy'),
    json: await res.json(),
  };
}

async function headOk(url, wantType) {
  const res = await fetch(url);
  const buf = new Uint8Array(await res.arrayBuffer());
  const type = res.headers.get('content-type') || '';
  const magic =
    wantType === 'png'
      ? buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
      : String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) === '%PDF';
  return { status: res.status, type, magic, size: buf.length };
}

console.log(`\nbrowser actions E2E → ${API}\n`);

// 1. click → navigation
{
  const r = await scrape({
    url: 'https://quotes.toscrape.com/',
    formats: ['markdown'],
    actions: [
      { type: 'wait', selector: 'li.next a' },
      { type: 'click', selector: 'li.next a' },
      { type: 'wait', milliseconds: 1200 },
    ],
  });
  ok('tier is browser-actions', r.strategy === 'browser-actions', r.strategy || '');
  ok(
    'click navigated to /page/2/',
    (r.json?.data?.url || '').includes('/page/2'),
    r.json?.data?.url,
  );
}

// 2. write → read back via JS
{
  const r = await scrape({
    url: 'https://quotes.toscrape.com/login',
    formats: ['markdown'],
    actions: [
      { type: 'write', selector: '#username', text: 'fuegoltest' },
      { type: 'write', selector: '#password', text: 'secret123' },
      {
        type: 'executeJavascript',
        script:
          "document.querySelector('#username').value + ':' + document.querySelector('#password').value",
      },
    ],
  });
  const v = r.json?.data?.actions?.javascriptReturns?.[0]?.value;
  ok('write typed into both fields', v === 'fuegoltest:secret123', String(v));
}

// 3. screenshot + scrape actions → artifacts
{
  const r = await scrape({
    url: 'https://quotes.toscrape.com/',
    formats: ['markdown'],
    actions: [
      { type: 'executeJavascript', script: 'document.title' },
      { type: 'screenshot' },
      { type: 'scrape' },
    ],
  });
  const a = r.json?.data?.actions || {};
  ok('executeJavascript returned title', a.javascriptReturns?.[0]?.value === 'Quotes to Scrape');
  ok('scrape action captured a page', (a.scrapes?.length || 0) >= 1);
  const shot = a.screenshots?.[0];
  ok('screenshot artifact url present', Boolean(shot), shot || '');
  if (shot) {
    const s = await headOk(shot, 'png');
    ok(
      'screenshot serves a real PNG',
      s.status === 200 && s.magic,
      `HTTP ${s.status} ${s.type} ${s.size}B`,
    );
  }
}

// 4. scroll + press
{
  const r = await scrape({
    url: 'https://quotes.toscrape.com/',
    formats: ['markdown'],
    actions: [
      { type: 'scroll', direction: 'down' },
      { type: 'scroll', direction: 'down' },
      { type: 'press', key: 'Escape' },
      { type: 'executeJavascript', script: 'window.scrollY' },
    ],
  });
  const y = r.json?.data?.actions?.javascriptReturns?.[0]?.value;
  ok('scroll moved the viewport', typeof y === 'number' && y > 0, `scrollY=${y}`);
}

// 5. pdf action → real PDF artifact
{
  const r = await scrape({
    url: 'https://example.com/',
    formats: ['markdown'],
    actions: [{ type: 'pdf' }],
  });
  const pdf = r.json?.data?.actions?.pdfs?.[0];
  ok('pdf artifact url present', Boolean(pdf), pdf || '');
  if (pdf) {
    const s = await headOk(pdf, 'pdf');
    ok(
      'pdf serves a real document',
      s.status === 200 && s.magic,
      `HTTP ${s.status} ${s.type} ${s.size}B`,
    );
  }
}

// 6. bad selector → honest SCRAPE_ACTION_ERROR (never a fabricated success)
{
  const r = await scrape({
    url: 'https://quotes.toscrape.com/',
    formats: ['markdown'],
    actions: [{ type: 'click', selector: '#does-not-exist-xyz' }],
  });
  ok(
    'bad selector fails honestly',
    r.json?.success === false && r.json?.code === 'SCRAPE_ACTION_ERROR',
    r.json?.code || '',
  );
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
