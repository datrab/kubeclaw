import { FileWorkerOwnershipStore, NativeWorkerOwnership, requireNativeWorkerSupervisorAuthority, requireNativeWorkerLauncher } from '@kubeclaw/worker-core';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { nativePrismSupervisorConfig } from '../config/native-worker.ts';
import { nativePrismExecution } from './native-worker-execution.ts';
import { createNativeWorkerServer } from './worker-service.ts';
import type { ManagedWorkerServer } from './worker-lifecycle.ts';
import { WorkerNonceDatabase } from './worker-readiness.ts';
import { loadWorkerConfig } from './worker-config.ts';

/** Native-only startup: durable ownership and journal recovery precede HTTP admission. */
export async function runNativePrismWorker(): Promise<void> {
  const config = loadWorkerConfig();
  if (config.executionMode !== 'native') throw new Error('PRISM_NATIVE_EXECUTION_MODE_REQUIRED');
  const native = nativePrismSupervisorConfig();
  requireNativeWorkerSupervisorAuthority();
  requireNativeWorkerLauncher(native.launcher);
  const store = new FileWorkerOwnershipStore(native.ownershipRoot, {
    maximumRecords: native.maximumRecords, maximumBytes: native.maximumBytes,
  });
  await NativeWorkerOwnership.supervise({ ...native, store }, async owner => {
    const execution = await nativePrismExecution(owner, native, config);
    const authentication = config.spiffeEnabled
      ? { mode: 'spiffe' as const, trustedControlSpiffeId: config.trustedControlSpiffeId }
      : { mode: 'hmac' as const, secret: config.workerSecret, database: new WorkerNonceDatabase(config.databaseUrl) };
    const server = createNativeWorkerServer(authentication, execution, config.ingress);
    await serve(server, owner, config);
  });
}

async function serve(server: ManagedWorkerServer, owner: NativeWorkerOwnership, config: ReturnType<typeof loadWorkerConfig>): Promise<void> {
  let stop: () => void = () => {};
  try {
    await new Promise<void>((resolve, reject) => {
      let stopping = false;
      stop = () => {
        if (stopping) return;
        stopping = true;
        owner.fenceAdmission();
        void server.shutdown(config.shutdownTimeoutMs).then(resolve, reject);
      };
      process.once('SIGTERM', stop); process.once('SIGINT', stop);
      server.once('error', reject);
      server.listen(config.port, '0.0.0.0');
    });
  } finally {
    owner.fenceAdmission();
    process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop);
    await server.shutdown(config.shutdownTimeoutMs);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runNativePrismWorker().then(() => {
    process.stderr.write('{"event":"prism_native_worker_shutdown","state":"ownership_reconciled"}\n');
  }, (error: unknown) => {
    process.stderr.write(`${JSON.stringify({ event: 'prism_native_worker_failure',
      code: error instanceof Error ? error.message : 'PRISM_NATIVE_UNKNOWN_FAILURE' })}\n`);
    process.exitCode = 1;
  });
}
