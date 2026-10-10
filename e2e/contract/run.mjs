#!/usr/bin/env node
/**
 * Machine-readable Firecrawl contract tests. Two independent checks against the
 * PINNED upstream OpenAPI (v1 + v2 — `packages/contracts/upstream/`):
 *
 *   1. COVERAGE — live-probe every documented operation (method-aware, with an
 *      intentionally-invalid body so nothing executes or bills) and classify each as
 *      SERVED (the route exists) vs NOT-SERVED (Fuego returns "No such endpoint").
 *   2. CONFORMANCE — call a curated set of live endpoints and validate the response
 *      body against the documented 200 schema with a dependency-free OpenAPI-3.0
 *      validator ($ref / oneOf / anyOf / allOf / nullable / enum / required / types).
 *
 * Honest, no external deps, safe to run against prod. Writes e2e/contract/report.json.
 *
 *   node e2e/contract/run.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const API = process.env.API ?? 'https://fuegol-api.manhattan.workers.dev';
const DIR = path.dirname(new URL(import.meta.url).pathname);
const UP = path.resolve(DIR, '../../packages/contracts/upstream');
const SPECS = {
  v2: JSON.parse(fs.readFileSync(path.join(UP, 'v2-openapi.json'), 'utf8')),
  v1: JSON.parse(fs.readFileSync(path.join(UP, 'v1-openapi.json'), 'utf8')),
};
const UA = { 'user-agent': 'fuegol-contract/1.0' };

// ---------- dependency-free OpenAPI 3.0 conformance validator ----------
function makeValidator(root) {
  const resolve = (s) => {
    let seen = 0;
    while (s && s.$ref && seen < 50) {
      const p = s.$ref.replace(/^#\//, '').split('/');
      let o = root;
      for (const k of p) o = o && o[k];
      s = o;
      seen++;
    }
    return s;
  };
  function validate(val, schema, at = '$', depth = 0, errs = []) {
    if (depth > 60 || errs.length > 40) return errs;
    schema = resolve(schema);
    if (!schema || typeof schema !== 'object') return errs;
    if (Array.isArray(schema.allOf))
      for (const s of schema.allOf) validate(val, s, at, depth + 1, errs);
    for (const key of ['oneOf', 'anyOf']) {
      if (Array.isArray(schema[key])) {
        let best = null;
        for (const s of schema[key]) {
          const e = [];
          validate(val, s, at, depth + 1, e);
          if (e.length === 0) return errs; // matched a branch
          if (best === null || e.length < best.length) best = e;
        }
        if (best && best.length) errs.push(`${at}: no ${key} branch matched (closest: ${best[0]})`);
        return errs;
      }
    }
    if (schema.enum && !schema.enum.some((e) => e === val))
      errs.push(`${at}: ${JSON.stringify(val)} not in enum`);
    const t = schema.type;
    if (t) {
      if (val === null) {
        if (!schema.nullable) errs.push(`${at}: null but not nullable`);
        return errs;
      }
      const ok =
        t === 'object'
          ? typeof val === 'object' && !Array.isArray(val)
          : t === 'array'
            ? Array.isArray(val)
            : t === 'integer'
              ? Number.isInteger(val)
              : t === 'number'
                ? typeof val === 'number'
                : t === 'string'
                  ? typeof val === 'string'
                  : t === 'boolean'
                    ? typeof val === 'boolean'
                    : true;
      if (!ok) {
        errs.push(`${at}: expected ${t}, got ${Array.isArray(val) ? 'array' : typeof val}`);
        return errs;
      }
      if (t === 'object' && val) {
        for (const req of schema.required || [])
          if (!(req in val)) errs.push(`${at}.${req}: required field missing`);
        if (schema.properties)
          for (const [k, ps] of Object.entries(schema.properties))
            if (k in val) validate(val[k], ps, `${at}.${k}`, depth + 1, errs);
      }
      if (t === 'array' && Array.isArray(val) && schema.items)
        for (let i = 0; i < Math.min(val.length, 5); i++)
          validate(val[i], schema.items, `${at}[${i}]`, depth + 1, errs);
    }
    return errs;
  }
  return { validate: (v, s) => validate(v, s, '$', 0, []), resolve };
}

function operations(spec) {
  const out = [];
  for (const [p, item] of Object.entries(spec.paths))
    for (const m of Object.keys(item))
      if (['get', 'post', 'put', 'patch', 'delete'].includes(m))
        out.push({ method: m.toUpperCase(), path: p, op: item[m] });
  return out.sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));
}

async function issueKey() {
  const r = await fetch(`${API}/v2/keys`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...UA },
    body: '{}',
  });
  const j = await r.json();
  return j.apiKey || j.data?.apiKey || null;
}

// Probe one operation: send its real method with an invalid/empty body so served
// routes reject (400/401/402/404-job) without executing, and unknown routes return
// the Hono notFound "No such endpoint" envelope.
async function probe(prefix, method, tmpl, key) {
  const filled = tmpl.replace(/\{[^}]+\}/g, 'x');
  const url = `${API}/${prefix}${filled}`;
  const init = {
    method,
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', ...UA },
  };
  if (['POST', 'PUT', 'PATCH'].includes(method)) init.body = '{}';
  let status = 0,
    body = null;
  try {
    const r = await fetch(url, init);
    status = r.status;
    body = await r.json().catch(() => null);
  } catch (e) {
    return { served: false, status: 0, note: 'fetch failed: ' + e.message };
  }
  const notRouted =
    status === 404 && typeof body?.error === 'string' && /No such endpoint/i.test(body.error);
  return { served: !notRouted, status };
}

const report = {
  api: API,
  generatedFor: 'firecrawl-openapi-pin',
  versions: {},
  coverage: {},
  conformance: [],
};
let pass = 0,
  fail = 0;
const ok = (n, c, x = '') => (
  c ? pass++ : fail++,
  console[c ? 'log' : 'error'](`  ${c ? '✓' : '✗'} ${n}${c ? '' : '  ' + x}`)
);

console.log(`\nfuegol × Firecrawl OpenAPI contract tests → ${API}\n`);
const key = await issueKey();
ok('issued a fuegol key for authed probing', !!key);

for (const v of ['v2', 'v1']) {
  const spec = SPECS[v];
  report.versions[v] = {
    title: spec.info?.title,
    version: spec.info?.version,
    openapi: spec.openapi,
  };
  const ops = operations(spec);
  let served = 0;
  const rows = [];
  for (const o of ops) {
    const r = await probe(v, o.method, o.path, key);
    if (r.served) served++;
    rows.push({ op: `${o.method} ${o.path}`, served: r.served, status: r.status });
  }
  report.coverage[v] = { total: ops.length, served, rows };
  console.log(
    `\n${v.toUpperCase()} coverage: ${served}/${ops.length} documented operations are routed (SERVED).`,
  );
  const missing = rows.filter((r) => !r.served).map((r) => r.op);
  if (missing.length) console.log(`  not served (${missing.length}): ${missing.join(' · ')}`);
}

// ---------- live conformance against documented 200 schemas (v2) ----------
const V = makeValidator(SPECS.v2);
function schema200(pathKey, method) {
  const op = SPECS.v2.paths[pathKey]?.[method];
  return op?.responses?.['200']?.content?.['application/json']?.schema ?? null;
}
async function conform(label, pathKey, method, reqBody) {
  const sch = schema200(pathKey, method);
  if (!sch) return ok(`${label}: documented 200 schema found`, false, 'no 200 schema in spec');
  const init = {
    method,
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', ...UA },
  };
  if (reqBody) init.body = JSON.stringify(reqBody);
  const r = await fetch(`${API}/v2${pathKey.replace(/\{[^}]+\}/g, 'x')}`, init);
  const body = await r.json().catch(() => null);
  const errs = body ? V.validate(body, sch) : ['no JSON body'];
  report.conformance.push({
    label,
    op: `${method.toUpperCase()} ${pathKey}`,
    status: r.status,
    conforms: errs.length === 0,
    diffs: errs.slice(0, 8),
  });
  ok(
    `${label} conforms to documented ${method.toUpperCase()} ${pathKey} 200 schema`,
    errs.length === 0,
    errs.slice(0, 4).join(' | '),
  );
}

console.log('\nCONFORMANCE (live response vs pinned upstream 200 schema):');
await conform('scrape', '/scrape', 'post', { url: 'https://example.com', formats: ['markdown'] });
await conform('map', '/map', 'post', { url: 'https://example.com' });
await conform('search', '/search', 'post', { query: 'cloudflare workers', limit: 3 });
await conform('credit-usage', '/team/credit-usage', 'get', null);

fs.writeFileSync(path.join(DIR, 'report.json'), JSON.stringify(report, null, 2));
console.log(`\n${pass} passed, ${fail} failed · report → e2e/contract/report.json\n`);
// Gate on conformance of the core sync endpoints only; NOT-SERVED is a documented
// coverage fact, not a test failure (the matrix tracks it honestly).
const coreConformFails = report.conformance.filter(
  (c) => ['scrape', 'map'].includes(c.label) && !c.conforms,
).length;
process.exit(coreConformFails === 0 ? 0 : 1);
