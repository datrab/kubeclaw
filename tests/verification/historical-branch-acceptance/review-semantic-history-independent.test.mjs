import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const producer = fileURLToPath(new URL('../reliability/review-semantic-summary-child.mjs', import.meta.url));
const reader = fileURLToPath(new URL('./review-semantic-history-child.mjs', import.meta.url));

function run(child, root, phase, locale) {
  const env = { ...process.env, LANG: locale, LC_ALL: locale };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [child, root, phase], {
    env,
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.signal, null);
  const lines = result.stdout.trimEnd().split('\n');
  return { result, value: JSON.parse(lines.at(-1)) };
}

test('new semantic governor history uses portable bytes through actual Core and ArtifactStore across locales', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-semantic-history-'));
  try {
    const produced = run(producer, root, 'produce', 'en_US.UTF-8');
    const english = run(reader, root, 'read-en', 'en_US.UTF-8');
    const czech = run(reader, root, 'read-cs', 'cs_CZ.UTF-8');
    assert.deepEqual(czech.value.baseline, english.value.baseline);
    assert.equal(english.value.operation, 'get_json_bytes');
    assert.equal(czech.value.operation, 'get_json_bytes');
    console.log(JSON.stringify({
      producer: produced.value,
      english: english.value,
      czech: czech.value,
      scope: 'semantic v3 history reader with transformed artifact-contract fixture; no fresh Review lifecycle/provider execution',
    }));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
