import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { portableJson, sha256Text, PORTABLE_JSON_ENCODING } from '@kubeclaw/plugin-sdk';
import { FileJournal } from '../../../skills/nova/core/state/journal.ts';
import { recoverStageStates, recoverWaitCreation } from '../../../skills/nova/core/lifecycle/recovery.ts';
import { authorizedRepair } from '../../../skills/nova/core/lifecycle/repair-authorization.ts';
import { materializeLegacyCore, materializeCurrentCore, legacyOperation } from './repair-identity-historical.mjs';

const file = fileURLToPath(import.meta.url);
if (process.argv[2] === '--fold') {
  const [root, journalFile] = process.argv.slice(3);
  const stored = JSON.parse(fs.readFileSync(path.join(root, 'case.json'), 'utf8'));
  try {
    const records = new FileJournal(journalFile).records();
    const states = recoverStageStates(stored.definition, records, stored.runId, 'nova');
    const pending = states.get('lint').pendingRepair;
    const order = pending ? authorizedRepair(stored.definition.stages, states, states.get('lint'), stored.signal)?.budgetOrder : undefined;
    const creation = pending ? recoverWaitCreation(stored.definition, records, stored.runId, 'nova', stored.signal.waitId) : undefined;
    process.stdout.write(JSON.stringify({ states: [...states], authorized: Boolean(order), order,
      ...(creation ? { waitCreation: { sequence: creation.sequence, type: creation.entry.type } } : {}) }));
  } catch (error) { process.stdout.write(JSON.stringify({ error: error.message })); }
} else {
  const fold = (script, root, journal, locale) => {
    const env = { ...process.env, LANG: locale, LC_ALL: locale }; delete env.NODE_TEST_CONTEXT;
    return JSON.parse(execFileSync(process.execPath, [script, '--fold', root, journal], { env, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 }));
  };
  test('independent original-producer recovery and semantically invalid repair projection matrix', async context => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-independent-'));
    try {
      const legacy = materializeLegacyCore(path.join(temporary, 'producer'));
      const root = path.join(temporary, 'case'); fs.mkdirSync(root);
      legacyOperation(legacy, '--produce', root);
      const stored = JSON.parse(fs.readFileSync(path.join(root, 'case.json'), 'utf8'));
      const original = new FileJournal(stored.journal).records().map(record => record.entry);
      const pendingIndex = original.findIndex(event => event.type === 'orchestrator.required' && event.payload.wait?.request?.repairAuthorization);
      const orderIndex = original.findIndex(event => event.type === 'stage.waiting' && event.payload.repairRequest?.budgetOrder);
      assert(pendingIndex > 0); assert(orderIndex > 0);
      let serial = 0;
      const write = events => {
        const target = path.join(temporary, `probe-${serial++}.jsonl`); const journal = new FileJournal(target);
        for (const event of events) journal.append(event);
        return target;
      };
      const pending = events => events[pendingIndex].payload.wait.request.repairAuthorization;
      const order = events => events[orderIndex].payload.repairRequest.budgetOrder;
      await context.test('old en-US producer is authorized unchanged by current sv-SE recovery', () => {
        const actual = fold(file, root, stored.journal, 'sv_SE.UTF-8');
        assert.equal(actual.error, undefined); assert.equal(actual.authorized, true);
        assert.equal(actual.order.id, stored.digest);
        assert.equal(actual.waitCreation.type, 'attempt.completed');
      });
      const negatives = [
        ['pending category', events => { pending(events).category = 'review'; }],
        ['pending source facts', events => { pending(events).sourceFacts['test.source_revision'] = 'foreign'; }],
        ['pending history removal', events => { pending(events).history.pop(); }],
        ['pending history order', events => { pending(events).history.reverse(); }],
        ['pending history attempt', events => { pending(events).history[0].requesterAttempt += 1; }],
        ['pending finding details', events => { pending(events).request.requesterResult.reason.details.z += 1; }],
        ['pending requester identity', events => { pending(events).request.requesterStageId = 'review'; }],
        ['pending extra field', events => { pending(events).untrusted = true; }],
        ['order source facts', events => { order(events).sourceFacts['test.source_revision'] = 'foreign'; }],
        ['order requester attempt', events => { order(events).requesterAttempt += 1; }],
        ['order digest mismatch', events => { order(events).requestDigest = `sha256:${'0'.repeat(64)}`; }],
        ['order nested finding details', events => { order(events).request.requesterResult.reason.details.z += 1; }],
        ['projection wrong stage', events => { events[pendingIndex].identity.stageId = 'test'; }],
        ['projection wrong causation', events => { events[pendingIndex].causationId = 'foreign-cause'; }],
        ['duplicate pending projection', events => { events.splice(pendingIndex + 1, 0, structuredClone(events[pendingIndex])); }],
        ['duplicate order projection', events => { events.splice(orderIndex + 1, 0, structuredClone(events[orderIndex])); }],
        ['unknown original completion encoding', events => {
          events.find(event => event.type === 'attempt.completed').payload.repairIdentityEncoding = 'unrecognized.v99';
        }],
      ];
      for (const [name, mutate] of negatives) await context.test(name, () => {
        const events = structuredClone(original); mutate(events);
        const result = fold(file, root, write(events), 'sv_SE.UTF-8');
        assert.match(result.error ?? '', /^REPAIR_(PROJECTION|IDENTITY_ENCODING)/u, JSON.stringify(result));
      });
      await context.test('order projection cannot attach to a successful non-requester completion', () => {
        const events = structuredClone(original.slice(0, orderIndex + 1));
        events[orderIndex].identity.stageId = 'source';
        const result = fold(file, root, write(events), 'en_US.UTF-8');
        assert.match(result.error ?? '', /^REPAIR_PROJECTION/u, JSON.stringify(result));
      });
      const oldReader = path.join(legacy.destination, 'tests/verification/reliability/repair-identity-independent.test.mjs');
      for (const [index, event] of original.entries()) {
        if (event.type !== 'attempt.completed' || event.payload.result.outcome !== 'request_fix') continue;
        await context.test(`legacy same-locale completion-only prefix ${index} preserves existing decision`, () => {
          const journal = write(original.slice(0, index + 1));
          const expected = fold(oldReader, root, journal, 'en_US.UTF-8');
          const actual = fold(file, root, journal, 'en_US.UTF-8');
          assert.equal(expected.error, undefined); assert.deepEqual(actual, expected);
        });
      }
    } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  });
  test('independent new producer binds explicit encoding into exact repair digests', async context => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'repair-tagged-review-'));
    try {
      const producer = materializeCurrentCore(path.join(root, 'producer'));
      legacyOperation(producer, '--produce', root);
      const stored = JSON.parse(fs.readFileSync(path.join(root, 'case.json'), 'utf8'));
      const events = new FileJournal(stored.journal).records().map(record => record.entry);
      const pendingIndex = events.findIndex(event => event.type === 'orchestrator.required' && event.payload.wait?.request?.repairAuthorization);
      const orderIndex = events.findIndex(event => event.type === 'stage.waiting' && event.payload.repairRequest?.budgetOrder);
      const pending = events[pendingIndex].payload.wait.request.repairAuthorization;
      await context.test('producer tag is inside exact portable digest subject', () => {
        const { digest, ...body } = pending;
        assert.equal(body.repairIdentityEncoding, PORTABLE_JSON_ENCODING);
        assert.equal(digest, sha256Text(portableJson({ runId: stored.runId, ...body })));
        const { repairIdentityEncoding: _tag, ...untagged } = body;
        assert.notEqual(digest, sha256Text(portableJson({ runId: stored.runId, ...untagged })));
        assert.equal(fold(file, root, stored.journal, 'sv_SE.UTF-8').authorized, true);
      });
      const mutations = [
        ['forged tagged pending digest', copy => { copy[pendingIndex].payload.wait.request.repairAuthorization.digest = `sha256:${'0'.repeat(64)}`; }],
        ['forged tagged order digest pair', copy => {
          const order = copy[orderIndex].payload.repairRequest.budgetOrder;
          order.id = `sha256:${'0'.repeat(64)}`; order.requestDigest = order.id;
        }],
        ['unknown original producer encoding', copy => { copy.find(event => event.type === 'attempt.completed').payload.repairIdentityEncoding = 'unknown.v99'; }],
        ['unknown pending encoding', copy => { copy[pendingIndex].payload.wait.request.repairAuthorization.repairIdentityEncoding = 'unknown.v99'; }],
      ];
      let serial = 0;
      for (const [name, mutate] of mutations) await context.test(name, () => {
        const copy = structuredClone(events); mutate(copy);
        const target = path.join(root, `tagged-${serial++}.jsonl`); const journal = new FileJournal(target);
        for (const event of copy) journal.append(event);
        const result = fold(file, root, target, 'sv_SE.UTF-8');
        assert.match(result.error ?? '', /^REPAIR_(PROJECTION|IDENTITY_ENCODING)/u, JSON.stringify(result));
      });
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
}
