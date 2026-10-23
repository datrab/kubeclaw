import { readWorkerCorePolicyCapture, type WorkerCorePolicyCapture } from '@kubeclaw/plugin-foundation/config/worker-core-policy';
import fs from 'node:fs';
import path from 'node:path';

/** Root-managed host identity, mounted read-only by trusted deployment setup. */
export function readNativeWorkerNodeIdentity(file: string, workerCore?: WorkerCorePolicyCapture): string {
  const maximumBytes = workerCore === undefined ? 128 : readWorkerCorePolicyCapture(workerCore).settings.runtime.node_identity_file_bytes;
  if (!path.isAbsolute(file)) throw new Error('WORKER_NATIVE_NODE_IDENTITY_PATH_REQUIRED');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.uid !== 0 || (stat.mode & 0o022) !== 0 || stat.size < 1 || stat.size > maximumBytes) {
      throw new Error('WORKER_NATIVE_NODE_IDENTITY_NOT_TRUSTED');
    }
    const identity = fs.readFileSync(fd, 'utf8').trim();
    if (!/^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/u.test(identity)) {
      throw new Error('WORKER_NATIVE_NODE_IDENTITY_INVALID');
    }
    return `native-node:${identity}`;
  } finally { fs.closeSync(fd); }
}
