import fs from 'node:fs';
import path from 'node:path';
import { FileMutex } from '../../../../skills/nova/core/state/file-mutex.ts';
import { FileJournal } from '../../../../skills/nova/core/state/journal.ts';
const [mode, root] = process.argv.slice(2);
const mutex = new FileMutex(path.join(root, 'mutex'), 10000, 'WORKER_TIMEOUT');
const pause = new Int32Array(new SharedArrayBuffer(4));
if (mode === 'hold') {
  mutex.withLock(() => {
    fs.writeFileSync(path.join(root, 'held'), String(process.pid));
    Atomics.wait(pause, 0, 0, 30000);
  });
} else {
  process.send('ready');
  process.once('message', () => {
    const journal = new FileJournal(path.join(root, 'events.jsonl'), 10000);
    for (let index = 0; index < 50; index++) mutex.withLock(() => {
      const marker = path.join(root, 'critical');
      const fd = fs.openSync(marker, 'wx');
      try {
        Atomics.wait(pause, 0, 0, 1);
        journal.append({ pid: process.pid, index });
      } finally { fs.closeSync(fd); fs.unlinkSync(marker); }
    });
    process.disconnect();
  });
}
