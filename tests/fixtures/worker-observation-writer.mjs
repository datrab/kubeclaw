import fs from 'node:fs/promises';
import { FileWorkerOwnershipStore } from '../../skills/worker/core/worker/ownership-store.ts';

// Storage/crash fixture only. This does not pretend an ordinary directory is a cgroup.
const root = process.argv[2];
const store = new FileWorkerOwnershipStore(root, { maximumRecords: 32, maximumBytes: 65536 });
await store.withSupervisor(async () => {
  let record = await store.reserve({ workerId: 'worker:observation', attemptId: 'attempt:observation', claimId: 'claim:observation', generation: 1,
    profileDigest: `sha256:${'1'.repeat(64)}`, attemptSpecDigest: `sha256:${'2'.repeat(64)}` });
  const stat = await fs.stat(root);
  const bootId = (await fs.readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim();
  record = await store.transition(record, 'allocated', { binding: { scopeName: record.scopeName, bootId, device: stat.dev, inode: stat.ino } });
  record = await store.transition(record, 'running');
  record = await store.transition(record, 'quiescing');
  record = await store.transition(record, 'empty', { finalObservation: { unit: 'linux-tasks', cpuTimeMicroseconds: 123456,
    maximumMemoryBytes: 134217728, maximumTasks: 17, populated: false, oomKills: 0, taskLimitHits: 2 } });
  process.stdout.write(JSON.stringify(record) + '\n');
  await new Promise(resolve => process.stdin.once('end', resolve).resume());
});
