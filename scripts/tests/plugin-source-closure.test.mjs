import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pluginSourceClosure } from '../plugin-source-closure.mjs';

test('finds a Redis client behind imports, re-exports and a cycle without executing code', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-source-closure-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'entry.ts'), "import './writer.js'; throw new Error('must not execute');");
  fs.writeFileSync(path.join(root, 'writer.ts'), "export { connect } from './transport'; import type { Missing } from './type-only.ts';");
  fs.writeFileSync(path.join(root, 'transport.ts'), "import './entry.ts'; const Redis = require('ioredis'); export function connect() { return new Redis(); }");
  const result = pluginSourceClosure(path.join(root, 'entry.ts'), root);
  assert.equal(result.sources.size, 3);
  assert.deepEqual(result.externalImports, ['ioredis']);
  assert.deepEqual(result.unresolved, []);
});

test('retains unresolved runtime imports instead of proving absence of dependencies', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-source-closure-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'entry.ts'), "import './missing.ts'; import(runtimeModule); import { type OnlyType } from './types.ts';");
  const result = pluginSourceClosure(path.join(root, 'entry.ts'), root);
  assert.equal(result.unresolved.length, 2);
  assert.ok(result.unresolved.some((item) => item.endsWith('/missing.ts')));
  assert.ok(result.unresolved.some((item) => item.endsWith(': dynamic module')));
});

test('traces the shipped OpenClaw observer to its Redis connection and configuration', () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const result = pluginSourceClosure(path.join(root, 'skills/common/plugins/openclaw-agent-observer/src/index.ts'), root);
  assert.ok(result.externalImports.includes('ioredis'));
  assert.ok([...result.sources.keys()].some((item) => item.endsWith('/src/redis-writer.ts')));
  assert.ok([...result.sources.keys()].some((item) => item.endsWith('/src/config.ts')));
  assert.deepEqual(result.unresolved, []);
});
