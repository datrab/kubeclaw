import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { ESLint } from 'eslint';

const eslint = new ESLint({ cwd: process.cwd(),
  overrideConfigFile: path.resolve('charts/kubeclaw/files/config/eslint-config.mjs'), ignore: false });
async function messages(file, source) {
  const results = await eslint.lintText(source, { filePath: path.resolve(file) });
  assert.equal(results.length, 1);
  assert.equal(results[0].warningCount, 0, 'an ignored file is not a successful boundary check');
  assert(!results[0].messages.some(message => message.fatal),
    `parser failures cannot substitute for a policy result: ${JSON.stringify(results[0].messages)}`);
  return results[0].messages;
}
for (const name of ['kubernetes-fixture-runtime', 'tailscale-exposure-runtime']) {
  test(`${name} alone is an environment boundary and still rejects defaults`, async () => {
    const file = `skills/buster/engine/test-gates/${name}.ts`;
    const allowed = await messages(file, 'export function environment() { return process.env.KUBECONFIG; }');
    assert.deepEqual(allowed, []);
    const adjacent = await messages('skills/buster/engine/test-gates/process-input.ts',
      'export function environment() { return process.env.KUBECONFIG; }');
    assert(adjacent.some(message => message.ruleId === 'discipline/no-direct-env-access' && message.severity === 2));
    const fallback = await messages(file, 'export function environment() { return process.env.KUBECONFIG ?? "alternate"; }');
    assert(fallback.some(message => message.ruleId === 'discipline/no-env-default' && message.severity === 2));
  });
}
