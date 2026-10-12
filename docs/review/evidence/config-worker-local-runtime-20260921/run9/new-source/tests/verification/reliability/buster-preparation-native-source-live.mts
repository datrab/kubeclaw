import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { createNativeCaseRoot, createNativePreparationJob, stageNativeWire,
  withNativePreparation } from '../../fixtures/test-gate/native-preparation.mts';
import { extractBusterPreparation } from '../../../skills/buster/engine/test-gates/preparation-extraction.ts';

test('actual GNU tar rejects an authenticated truncated archive and recovery retains unrelated source bytes',
  { timeout: 600_000 }, async () => {
    assert.match(execFileSync('/usr/bin/tar', ['--version'], { encoding: 'utf8' }), /GNU tar/u);
    const root = await createNativeCaseRoot('truncated-archive');
    await createNativePreparationJob(root, 'truncated-gzip');
    await withNativePreparation(root, async (execution, store) => {
      await fs.writeFile(path.join(execution.command.sourceRoot, 'unrelated'), 'immutable sentinel');
      const staged = await stageNativeWire(execution, path.join(root, 'producer-wire.json'), new AbortController().signal);
      assert.ok(staged, 'valid attestation and wire identity must pass the staging boundary');
      await store.accept(staged, new Date().toISOString());
      await assert.rejects(extractBusterPreparation(execution, staged, new AbortController().signal));
      const failed = (await execution.ledger.reservations()).find(row => row.parentInputId !== null);
      assert.ok(failed && !failed.slotReleased);
      const result = await execution.journal.readResult(failed.envelope);
      assert.ok(result && result.state !== 'completed');
      assert.equal(result.cleanup.state, 'failed');
      assert.equal(await fs.readFile(path.join(execution.command.sourceRoot, 'unrelated'), 'utf8'), 'immutable sentinel');
    });
    await withNativePreparation(root, async execution => {
      const rows = await execution.ledger.reservations();
      assert.equal(rows.filter(row => row.phase === 'released' && row.slotReleased).length, 1);
      assert.equal(rows.filter(row => row.phase === 'retained-input').length, 1);
      assert.equal(await fs.readFile(path.join(execution.command.sourceRoot, 'unrelated'), 'utf8'), 'immutable sentinel');
    });
  });

test('preexisting same-UID source survives actual exclusive-mkdir failure and remains fenced on restart',
  { timeout: 600_000 }, async () => {
    const root = await createNativeCaseRoot('foreign-preexisting');
    await createNativePreparationJob(root);
    let sentinel = '';
    await withNativePreparation(root, async (execution, store) => {
      await assert.rejects(stageNativeWire(execution, path.join(root, 'producer-wire.json'),
        new AbortController().signal, async () => {
          const [row] = await execution.ledger.reservations();
          assert.ok(row?.gate);
          const directory = path.join(execution.command.sourceRoot, row.admissionId, 'data');
          await fs.mkdir(directory, { mode: 0o755 });
          await fs.chown(directory, row.slot, row.slot);
          sentinel = path.join(directory, 'foreign-sentinel');
          await fs.writeFile(sentinel, 'preexisting same-UID bytes', { mode: 0o644 });
          await fs.chown(sentinel, row.slot, row.slot);
          return true;
        }));
      assert.equal((await store.records()).length, 0);
      assert.equal(await fs.readFile(sentinel, 'utf8'), 'preexisting same-UID bytes');
    });
    await assert.rejects(withNativePreparation(root, async () => {
      assert.fail('foreign source cannot become eligible for serving');
    }));
    assert.equal(await fs.readFile(sentinel, 'utf8'), 'preexisting same-UID bytes');
  });
