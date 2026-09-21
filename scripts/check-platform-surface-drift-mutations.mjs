#!/usr/bin/env node

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const kinds = ['endpoint', 'event', 'store', 'secret', 'runtime-service', 'ops-tool'];
const operations = ['add', 'change', 'remove'];
let count = 0;

for (const kind of kinds) {
  for (const operation of operations) {
    const result = JSON.parse(execFileSync(process.execPath, [
      path.join(root, 'scripts/docs-platform-surface-inventory.mjs'),
      '--probe-mutation', `${kind}:${operation}`,
    ], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }));
    assert.equal(result.ok, true);
    assert.equal(result.kind, kind);
    assert.equal(result.operation, operation);
    count += 1;
  }
}

process.stdout.write(`${JSON.stringify({ ok: true, mutations: count })}\n`);
