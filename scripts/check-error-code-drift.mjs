#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

// The owning generator parses production Buster syntax and finite dynamic
// families. Never replace its semantic extraction with a count or file hash.
const root = path.resolve(import.meta.dirname, '..');
if (!fs.existsSync(path.join(root, 'docs/site/reference/buster-error-codes.md'))) {
  console.error('DOC_DRIFT_ERROR_CODE: docs/site/reference/buster-error-codes.md is missing.');
  process.exit(1);
}
const result = spawnSync(process.execPath, ['scripts/generate-buster-error-reference.mjs'], {
  cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.error) console.error(result.error);
if (result.status !== 0) {
  // Admission/parser/semantic-audit errors remain their real errors, not a
  // passing mutation. Only the owner's explicit output mismatch is drift.
  if (!result.error && !result.signal && /generated Buster error reference is (?:stale|missing)/u.test(result.stderr ?? '')) {
    console.error('DOC_DRIFT_ERROR_CODE: docs/site/reference/buster-error-codes.md differs from its production Buster error inventory.');
  }
  process.exitCode = result.status || 1;
}
