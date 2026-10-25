#!/usr/bin/env node
// Bounded example-policy semantics, NOT the complete capability-family gate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadPlatformConfig } from '../skills/common/plugin-runtime/foundation/config/platform.ts';
const root = path.resolve(import.meta.dirname, '..');
const authority = 'docs/site/use/workflows/wait-resume/platform.template.json';
const page = 'docs/site/reference/capabilities.md';
if (process.argv.includes('--describe-discovery')) {
  console.log(JSON.stringify({ owner: 'scripts/check-capability-policy-drift.mjs', mode: 'finite-authority-reader-comparison', authority, page, parser: 'schema-validated loadPlatformConfig: providers and grants only', exclusions: ['effective deployment', 'role translation', 'independent acceptance'] }));
  process.exit(0);
}
try {
  // The real loader validates the actual platform schema before a drift claim.
  const { providers, grants } = loadPlatformConfig(path.join(root, authority));
  const markdown = fs.readFileSync(path.join(root, page), 'utf8');
  const start = '<!-- BEGIN WAIT RESUME GRANT POLICY -->\n```json\n';
  const end = '\n```\n<!-- END WAIT RESUME GRANT POLICY -->';
  if (markdown.split(start).length !== 2 || markdown.split(end).length !== 2) throw new Error('missing or duplicate policy reader boundaries');
  const body = markdown.split(start)[1].split(end)[0];
  const documented = JSON.parse(body);
  try { assert.deepEqual(documented, { providers, grants }); }
  catch {
    console.error(`DOC_DRIFT_CAPABILITY: ${page}: wait/resume example registration grants, provider selections or resource scopes differ from ${authority}`);
    process.exitCode = 1;
  }
  if (!process.exitCode) console.log(`Example policy providers/consumer grants/resource scopes match ${page}; NOT effective deployment, role translation or full capability-family acceptance.`);
} catch (error) { console.error(`Capability policy input/tool error: ${error.message}`); process.exitCode = 2; }
