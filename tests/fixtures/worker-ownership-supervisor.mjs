import { FileWorkerOwnershipStore } from '../../skills/worker/core/worker/ownership-store.ts';
const store = new FileWorkerOwnershipStore(process.argv[2], { maximumRecords: 32, maximumBytes: 65536 });
await store.withSupervisor(async () => {
  await store.reserve({ workerId: 'worker:test', attemptId: 'attempt:test', claimId: 'claim:test', generation: 1,
    profileDigest: `sha256:${'1'.repeat(64)}`, attemptSpecDigest: `sha256:${'2'.repeat(64)}` });
  process.stdout.write('locked\n');
  await new Promise(resolve => process.stdin.once('end', resolve).resume());
});
