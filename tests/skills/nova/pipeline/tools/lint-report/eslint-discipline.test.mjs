import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const CONFIG = path.resolve('charts/kubeclaw/files/config/eslint.config.mjs');

function lintFixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eslint-discipline-'));
  for (const [name, source] of Object.entries(files)) fs.writeFileSync(path.join(root, name), source);
  const result = spawnSync('eslint', ['--format', 'json', '--config', CONFIG, ...Object.keys(files)], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.notEqual(result.error?.code, 'ENOENT', 'eslint must be installed in PATH');
  assert.ok([0, 1].includes(result.status), result.stderr || result.stdout);
  return JSON.parse(result.stdout).flatMap(file => file.messages);
}

test('discipline rules accept one explicit path and intentional error handling', () => {
  const messages = lintFixture({
    'clear-path.ts': `
export function selectValue(primary: string | null, fallback: string): string {
  return primary ?? fallback;
}

export function parseJson(source: string): unknown {
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error('Invalid JSON input', { cause: error });
  }
}

export function featureEnabled(source: string): boolean {
  try {
    return JSON.parse(source).enabled === true;
  } catch {
    return false;
  }
}
`,
  });
  assert.deepEqual(messages, []);
});

test('discipline rules reject hidden authority and mutable module state', () => {
  const messages = lintFixture({
    'Bad_Name.ts': `
let shared = 0;
export async function load(primary, secondary, tertiary) {
  const endpoint = process.env.API_URL || 'http://localhost';
  const selected = primary || secondary || tertiary;
  const mixed = (primary ?? secondary) || tertiary;
  try {
    shared += 1;
    return await import(mixed || selected || endpoint);
  } catch (_error) {
    return null;
  }
}
`,
  });
  const codes = new Set(messages.map(message => message.ruleId));
  assert.deepEqual(codes, new Set([
    'discipline/filename-case',
    'discipline/no-direct-env-access',
    'discipline/no-dynamic-module-loading',
    'discipline/no-env-default',
    'discipline/no-fallback-chain',
    'discipline/no-swallowed-error',
    'discipline/no-top-level-mutable-state',
  ]));
  assert.equal(messages.filter(message => message.ruleId === 'discipline/no-fallback-chain').length, 3);
});

test('native complexity budgets report stable rule codes', () => {
  const longBody = Array.from({ length: 42 }, (_, index) => `  const value${index} = ${index};`).join('\n');
  const padding = Array.from({ length: 305 }, (_, index) => `export const item${index} = ${index};`).join('\n');
  const messages = lintFixture({
    'complex-handler.ts': `
export function complexHandler(a, b, c, d, e, f) {
  if (a) { if (b) { if (c) { if (d) return 1; } } }
  if (e) return 2;
  if (f) return 3;
  if (a && b) return 4;
  if (a && c) return 5;
  if (a && d) return 6;
  if (b && c) return 7;
  return 0;
}

export function longHandler() {
${longBody}
  return value41;
}
`,
    'large-file.ts': `${padding}\n`,
  });
  const codes = new Set(messages.map(message => message.ruleId));
  assert.ok(codes.has('complexity'));
  assert.ok(codes.has('max-depth'));
  assert.ok(codes.has('max-lines'));
  assert.ok(codes.has('max-lines-per-function'));
  assert.ok(codes.has('max-params'));
});
