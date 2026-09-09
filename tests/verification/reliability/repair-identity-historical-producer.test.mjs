import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { materializeLegacyCore, legacyOperation } from './repair-identity-historical.mjs';

test('archived original producer reproduces locale defect without historical Git objects', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-original-'));
  try {
    const legacy = materializeLegacyCore(path.join(temporary, 'producer'));
    const root = path.join(temporary, 'case'); fs.mkdirSync(root);
    const producer = legacyOperation(legacy, '--produce', root);
    const english = legacyOperation(legacy, '--read', root);
    const swedish = legacyOperation(legacy, '--read', root, 'sv_SE.UTF-8');
    const stored = JSON.parse(fs.readFileSync(path.join(root, 'case.json'), 'utf8'));
    const records = fs.readFileSync(stored.journal, 'utf8').trim().split('\n').map(line => JSON.parse(line));
    const completions = records.filter(record => record.entry.type === 'attempt.completed');
    assert(completions.length > 0);
    assert(completions.every(record => !Object.hasOwn(record.entry.payload, 'repairIdentityEncoding')));
    assert.equal(producer.locale, 'en-US'); assert.equal(swedish.locale, 'sv-SE');
    assert.equal(english.authorized, true); assert.equal(swedish.authorized, false);
    assert.equal(swedish.error, 'REPAIR_AUTHORIZATION_INVALID');
    assert.notEqual(swedish.originalDigest, swedish.recoveredDigest);
    console.log(JSON.stringify({ originalProducer: legacy.archive.remoteCommit, producer, english, swedish }));
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});
