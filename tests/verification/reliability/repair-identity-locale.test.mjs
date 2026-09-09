import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { materializeLegacyCore, materializeCurrentCore, legacyOperation } from './repair-identity-historical.mjs';

const checkout = fileURLToPath(new URL('../../../', import.meta.url));
function invoke(script, args, locale) {
  const env = { ...process.env, LANG: locale, LC_ALL: locale }; delete env.NODE_TEST_CONTEXT;
  return JSON.parse(execFileSync(process.execPath, [script, ...args], { cwd: checkout, env, encoding: 'utf8', timeout: 120000 }));
}

for (const historical of [false, true]) test(`original ${historical ? 'legacy' : 'tagged'} repair authorizes and resumes across native locales`, () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-cutover-'));
  try {
    const root = path.join(temporary, 'case'); fs.mkdirSync(root);
    const current = materializeCurrentCore(path.join(temporary, 'current'));
    const original = historical
      ? legacyOperation(materializeLegacyCore(path.join(temporary, 'legacy')), '--produce', root)
      : legacyOperation(current, '--produce', root);
    const stored = JSON.parse(fs.readFileSync(path.join(root, 'case.json'), 'utf8'));
    const bytes = fs.readFileSync(stored.journal);
    const completions = bytes.toString().trim().split('\n').map(line => JSON.parse(line).entry).filter(event => event.type === 'attempt.completed');
    assert(completions.length > 0);
    assert(completions.every(event => historical ? !Object.hasOwn(event.payload, 'repairIdentityEncoding')
      : event.payload.repairIdentityEncoding === 'kubeclaw-json.utf16.v1'));
    for (const locale of ['en_US.UTF-8', 'sv_SE.UTF-8', 'tr_TR.UTF-8']) {
      const read = legacyOperation(current, '--read', root, locale);
      assert.equal(read.authorized, true); assert.equal(read.recoveredDigest, original.originalDigest);
      assert.deepEqual(fs.readFileSync(stored.journal), bytes);
    }
    const resumed = invoke(fileURLToPath(new URL('./repair-identity-resume.mjs', import.meta.url)), [root], 'sv_SE.UTF-8');
    assert.equal(resumed.locale, 'sv-SE'); assert.equal(resumed.sourceAttempts, 4);
    console.log(JSON.stringify({ historical, original, resumed }));
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
