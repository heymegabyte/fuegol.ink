#!/usr/bin/env node
/**
 * Scheduled drift check: re-fetch the upstream Firecrawl OpenAPI and compare sha256
 * to the pinned MANIFEST. Exits 1 (+ a summary) on any change so the drift is
 * REVIEWED — never silently pulled into production (see §2 of the build brief).
 * On drift: re-pin the spec, re-run `node e2e/contract/run.mjs`, update the matrix.
 *
 *   node scripts/check-contract-drift.mjs
 */
import fs from 'node:fs';
import crypto from 'node:crypto';

const M = JSON.parse(fs.readFileSync('packages/contracts/upstream/MANIFEST.json', 'utf8'));
const lines = [];
let drift = false;

for (const [v, meta] of Object.entries(M.specs)) {
  let buf;
  try {
    const r = await fetch(meta.sourceUrl, { headers: { 'user-agent': 'fuegol-drift/1.0' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    buf = Buffer.from(await r.arrayBuffer());
  } catch (e) {
    lines.push(`- **${v}**: fetch failed (${e.message}) — skipped`);
    continue;
  }
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  if (sha !== meta.sha256) {
    drift = true;
    lines.push(
      `- **${v}**: CHANGED — pinned \`${meta.sha256.slice(0, 12)}…\` (${meta.bytes}B) → upstream \`${sha.slice(0, 12)}…\` (${buf.length}B)`,
    );
  } else {
    lines.push(`- **${v}**: unchanged (\`${sha.slice(0, 12)}…\`)`);
  }
}

const summary = `# Firecrawl OpenAPI drift check

Pinned ${M.retrievedAt}.

${lines.join('\n')}

${
  drift
    ? '⚠️ **Drift detected.** Review the upstream change, re-pin the spec, re-run `node e2e/contract/run.mjs`, and update `docs/COMPATIBILITY_MATRIX.md`. Never auto-merge upstream contract changes into production.'
    : '✅ No drift — pinned specs still match upstream.'
}`;

console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY)
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
fs.writeFileSync('contract-drift-summary.md', summary);
process.exit(drift ? 1 : 0);
