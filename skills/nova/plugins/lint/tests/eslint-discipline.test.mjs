import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(packageRoot, '../../../..');
const config = path.join(repoRoot, 'charts/kubeclaw/files/config/eslint.config.mjs');

function lint(filename, source) {
  const directory = fs.mkdtempSync(path.join(packageRoot, 'src/eslint-rule-fixture-'));
  const file = path.join(directory, filename);
  fs.writeFileSync(file, source);
  try {
    const result = childProcess.spawnSync('eslint', ['--format', 'json', '--config', config, file], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: process.env,
    });
    assert.notEqual(result.error?.code, 'ENOENT', 'eslint must be installed for discipline-rule verification');
    assert.ok([0, 1].includes(result.status), result.stderr || `unexpected eslint status ${result.status}`);
    return JSON.parse(result.stdout)[0].messages
      .map((message) => message.ruleId)
      .filter((ruleId) => ruleId?.startsWith('discipline/'));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

assert.deepEqual(lint('fallback.mjs', 'const value = first ?? second ?? third;\n'), ['discipline/no-fallback-chain']);
assert.deepEqual(lint('boolean.mjs', 'if (first || second || third) consume();\n'), []);
assert.ok(lint('environment.mjs', 'const value = process.env.VALUE ?? "default";\n').includes('discipline/no-direct-env-access'));
assert.ok(lint('environment.mjs', 'const value = process.env.VALUE ?? "default";\n').includes('discipline/no-env-default'));
assert.deepEqual(lint('dynamic.mjs', 'export async function load(name) { return import(name); }\n'), ['discipline/no-dynamic-module-loading']);
assert.deepEqual(lint('swallowed.mjs', 'export function read() { try { return parse(); } catch { return null; } }\n'), ['discipline/no-swallowed-error']);
assert.deepEqual(lint('handled.mjs', 'export function read() { try { return parse(); } catch (error) { throw new Error("parse failed", { cause: error }); } }\n'), []);
assert.deepEqual(lint('intentional.mjs', 'export function read() { try { return parse(); } catch { /* INTENTIONAL_NONCRITICAL(cache_miss): absence starts a refresh */ return null; } }\n'), []);
assert.ok(lint('NotKebab.mjs', 'export const value = 1;\n').includes('discipline/filename-case'));

console.log(JSON.stringify({ ok: true, suite: 'eslint-discipline-rules' }));
