import assert from 'node:assert/strict';
import { FileWorkerOwnershipStore, NativeWorkerOwnership, requireNativeWorkerLauncher, requireNativeWorkerSupervisorAuthority } from '@kubeclaw/worker-core';
import { nativePrismSupervisorConfig } from '../../config/native-worker.ts';
import { loadWorkerConfig } from '../../server/worker-config.ts';
import { nativePrismExecution } from '../../server/native-worker-execution.ts';
import { createWorkerServer, type WorkerAuthentication } from '../../server/worker-service.ts';
import type { ManagedWorkerServer } from '../../server/worker-lifecycle.ts';

/** Live gate: uses the original owner, real delegated kernel pool and original host.
 * The operator supplies a dedicated test pool; no kernel or execution replacement.
 */
export async function nativeWorkerHarness(t: { after(callback: () => Promise<void>): void },
  auth: WorkerAuthentication, controlInternalUrl = new URL('http://127.0.0.1:1'), secret = 'local') {
  assert.equal(process.env.PRISM_NATIVE_ISOLATED_TEST_POOL, 'true', 'A dedicated native test pool must be explicitly selected');
  const native = nativePrismSupervisorConfig();
  requireNativeWorkerSupervisorAuthority(); requireNativeWorkerLauncher(native.launcher);
  const store = new FileWorkerOwnershipStore(native.ownershipRoot, { maximumRecords: native.maximumRecords, maximumBytes: native.maximumBytes });
  const config = loadWorkerConfig({ ...process.env, WORKER_TRUST_SPIFFE_ENABLED: 'false', PRISM_WORKER_SECRET: secret,
    DATABASE_URL: process.env.PRISM_NATIVE_OPERATION_TEST_DATABASE_URL ?? '', PRISM_CONTROL_INTERNAL_URL: controlInternalUrl.href });
  let release!: () => void;
  const finished = new Promise<void>(resolve => { release = resolve; });
  let admit!: (value: ManagedWorkerServer) => void;
  let reject!: (reason: unknown) => void;
  const admitted = new Promise<ManagedWorkerServer>((resolve, fail) => { admit = resolve; reject = fail; });
  const supervision = NativeWorkerOwnership.supervise({ ...native, store }, async owner => {
    const execution = await nativePrismExecution(owner, native, config);
    const server = createWorkerServer(auth, execution);
    admit(server);
    await finished;
    owner.fenceAdmission();
    await server.shutdown(10000);
  });
  void supervision.catch(reject);
  t.after(async () => { release(); await supervision; });
  return admitted;
}
