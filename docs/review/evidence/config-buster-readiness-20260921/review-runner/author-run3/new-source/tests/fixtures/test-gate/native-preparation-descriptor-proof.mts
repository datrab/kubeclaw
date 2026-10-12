import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { stageNativeWire, withNativePreparation } from './native-preparation.mts';
import { extractBusterPreparation } from '../../../skills/buster/engine/test-gates/preparation-extraction.ts';

const root = process.argv[2];
assert.ok(root && path.isAbsolute(root));
await withNativePreparation(root, async (execution, store) => {
  const staged = await stageNativeWire(execution, path.join(root, 'producer-wire.json'), new AbortController().signal);
  assert.ok(staged);
  await store.accept(staged, new Date().toISOString());
  const chmod = fs.chmod.bind(fs);
  let observed = false;
  fs.chmod = async (file, mode) => {
    if (typeof file === 'string' && path.dirname(file) === execution.command.sourceRoot && mode === 0o750) {
      const row = (await execution.ledger.reservations()).find(item => item.admissionId === path.basename(file));
      assert.ok(row && row.phase === 'published');
      const archived = await execution.journal.readProcess(row.envelope);
      assert.ok(archived);
      const marker = Buffer.from(archived.process.stderr).toString('utf8')
        .match(/BUSTER_NATIVE_TEST_RETAINED_FD:([^\n]+)\n/u)?.[1];
      assert.ok(marker, 'an actual writable inherited descriptor must have existed');
      const child = JSON.parse(marker) as { pid: number; uid: number; gid: number; startTime: string };
      assert.equal(child.uid, row.slot);
      assert.equal(child.gid, row.slot);
      let current: string | null = null;
      try { current = await fs.readFile(`/proc/${child.pid}/stat`, 'utf8'); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      if (current) {
        const fields = current.slice(current.lastIndexOf(')') + 2).split(' ');
        assert.ok(fields[19] !== child.startTime || fields[0] === 'Z', 'the exact descriptor holder must be dead before publication');
      }
      const envelope = row.envelope;
      const owner = await execution.owner.record({ workerId: envelope.claim.workerId, attemptId: envelope.attemptId,
        claimId: envelope.claim.claimId, generation: envelope.claim.generation,
        profileDigest: envelope.profile.profileDigest, attemptSpecDigest: envelope.attemptSpecDigest });
      assert.equal(owner?.phase, 'disposed');
      assert.equal(owner.finalObservation?.populated, false);
      observed = true;
    }
    await chmod(file, mode);
  };
  try {
    const prepared = await extractBusterPreparation(execution, staged, new AbortController().signal);
    await store.attachSource(prepared);
    assert.equal(observed, true, 'the actual publication call must execute the observation');
  } finally { fs.chmod = chmod; }
});
