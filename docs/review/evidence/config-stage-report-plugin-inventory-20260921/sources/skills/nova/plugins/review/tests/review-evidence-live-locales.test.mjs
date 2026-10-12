import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const script = fileURLToPath(new URL('./live-function.test.ts', import.meta.url));
for (const [nativeLocale, expected] of [['en_US.UTF-8', 'en-US'], ['sv_SE.UTF-8', 'sv-SE']]) {
  test(`original review stage, Git, HTTP and persisted bundle preserve portable evidence under ${expected}`, () => {
    const env = { ...process.env, LANG: nativeLocale, LC_ALL: nativeLocale }; delete env.NODE_TEST_CONTEXT;
    const raw = execFileSync(process.execPath, [script, '--portable-evidence'], {
      cwd: root, env, encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024,
    });
    const result = JSON.parse(raw);
    assert.equal(result.ok, true); assert.equal(result.portableEvidence, true);
    assert.equal(result.locale, expected); assert.equal(result.nativeGatewayOrModelProof, false);
    console.log(raw.trim());
  });
}

test('original review-enabled compiler snapshot recovers without changing graph identity', () => {
  const repository = fileURLToPath(new URL('../../../../../', import.meta.url));
  const recovery = fileURLToPath(new URL('../../../../../tests/verification/reliability/review-evidence-compiler-recovery.test.mjs', import.meta.url));
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  const raw = execFileSync(process.execPath, ['--test', recovery], {
    cwd: repository, env, encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024,
  });
  console.log(raw.trim());
});
