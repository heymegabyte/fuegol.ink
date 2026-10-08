#!/usr/bin/env node
// fuegol — CLI for the fuegol.ink web-data API (Firecrawl-compatible). Zero dependencies.
import { parseArgs } from 'node:util';

const API = process.env.FUEGOL_API_URL || 'https://fuegol-api.manhattan.workers.dev';
const KEY = process.env.FUEGOL_API_KEY || '';
const VERSION = '0.1.0';

const HELP = `fuegol ${VERSION} — the web data engine for AI (CLI)

Usage:
  fuegol scrape <url> [--format markdown|html|links] [--json]
  fuegol map <url> [--limit N] [--json]
  fuegol search <query...> [--limit N] [--category developer|research|gov] [--json]
  fuegol crawl <url> [--limit N] [--wait] [--json]
  fuegol status <crawlId> [--json]
  fuegol extract <url> --prompt "<what to extract>" [--json]
  fuegol key [--name <name>]
  fuegol help

Environment:
  FUEGOL_API_URL   API base (default ${API})
  FUEGOL_API_KEY   your fgl_live_… key (optional; keyless demo is rate-limited)

Examples:
  fuegol scrape https://example.com
  FUEGOL_API_KEY=fgl_live_… fuegol crawl https://docs.site --limit 20 --wait
  fuegol search "durable objects" --category developer`;

const { values: flags, positionals } = parseArgs({
  args: process.argv.slice(2),
  allowPositionals: true,
  options: {
    json: { type: 'boolean', default: false },
    wait: { type: 'boolean', default: false },
    format: { type: 'string' },
    category: { type: 'string' },
    prompt: { type: 'string' },
    name: { type: 'string' },
    limit: { type: 'string' },
  },
});

const cmd = positionals[0];
const arg = positionals.slice(1);
const limit = flags.limit ? Number(flags.limit) : undefined;

async function api(path, body, method = body ? 'POST' : 'GET') {
  const headers = { 'content-type': 'application/json' };
  if (KEY) headers.authorization = `Bearer ${KEY}`;
  const res = await fetch(API + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, json };
}

const print = (x) => console.log(typeof x === 'string' ? x : JSON.stringify(x, null, 2));
const fail = (m) => {
  console.error('✗ ' + m);
  process.exit(1);
};
const need = (v, m) => {
  if (!v) fail(m);
  return v;
};

async function main() {
  switch (cmd) {
    case 'scrape': {
      const url = need(arg[0], 'scrape needs a <url>');
      const formats = flags.format ? flags.format.split(',') : ['markdown'];
      const { status, json } = await api('/v2/scrape', { url, formats });
      if (status >= 400 || !json?.success) return fail(json?.error || `HTTP ${status}`);
      return print(flags.json ? json : (json.data.markdown ?? json.data));
    }
    case 'map': {
      const url = need(arg[0], 'map needs a <url>');
      const { json, status } = await api('/v2/map', { url, limit: limit ?? 100 });
      if (status >= 400 || !json?.success) return fail(json?.error || `HTTP ${status}`);
      return print(flags.json ? json : (json.links || []).map((l) => l.url).join('\n'));
    }
    case 'search': {
      const query = need(arg.join(' '), 'search needs a <query>');
      const body = { query, limit: limit ?? 5 };
      if (flags.category) body.categories = [flags.category];
      const { json, status } = await api('/v2/search', body);
      if (status >= 400 || !json?.success) return fail(json?.error || `HTTP ${status}`);
      if (flags.json) return print(json);
      return print(
        (json.data?.web || [])
          .map((r) => `${r.title || ''}\n${r.url}\n${r.description || ''}`)
          .join('\n\n'),
      );
    }
    case 'crawl': {
      const url = need(arg[0], 'crawl needs a <url>');
      const { json, status } = await api('/v2/crawl', { url, limit: limit ?? 10 });
      if (status >= 400 || !json?.id) return fail(json?.error || `HTTP ${status}`);
      if (!flags.wait)
        return print(
          flags.json ? json : `Crawl started: ${json.id}\nStatus: fuegol status ${json.id}`,
        );
      process.stderr.write('crawling');
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const s = await api(`/v2/crawl/${json.id}`);
        if (s.json?.status && s.json.status !== 'scraping') {
          process.stderr.write('\n');
          return print(
            flags.json
              ? s.json
              : `${s.json.status} · ${s.json.completed}/${s.json.total} pages · ${s.json.creditsUsed} credits`,
          );
        }
        process.stderr.write('.');
      }
      process.stderr.write('\n');
      return fail('crawl did not finish in time; check: fuegol status ' + json.id);
    }
    case 'status': {
      const id = need(arg[0], 'status needs a <crawlId>');
      const { json } = await api(`/v2/crawl/${id}`);
      return print(
        flags.json
          ? json
          : `${json?.status} · ${json?.completed}/${json?.total} pages · ${json?.creditsUsed} credits`,
      );
    }
    case 'extract': {
      const url = need(arg[0], 'extract needs a <url>');
      const { json, status } = await api('/v2/extract', {
        urls: [url],
        prompt: flags.prompt || 'Extract the key information.',
      });
      if (status >= 400 || !json?.id) return fail(json?.error || `HTTP ${status}`);
      for (let i = 0; i < 25; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const s = await api(`/v2/extract/${json.id}`);
        if (s.json?.status && s.json.status !== 'processing')
          return print(flags.json ? s.json : (s.json.data ?? s.json));
      }
      return fail('extract timed out');
    }
    case 'key': {
      const { json, status } = await api('/v2/keys', { name: flags.name || 'cli' });
      if (status >= 400 || !json?.apiKey) return fail(json?.error || `HTTP ${status}`);
      return print(
        flags.json
          ? json
          : `API key (save it — shown once):\n${json.apiKey}\n\nUse it:  export FUEGOL_API_KEY=${json.apiKey}`,
      );
    }
    case 'help':
    case undefined:
      return print(HELP);
    default:
      return fail(`unknown command "${cmd}". Try: fuegol help`);
  }
}

main().catch((e) => fail(e.message));
