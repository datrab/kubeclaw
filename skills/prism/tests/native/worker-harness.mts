import assert from 'node:assert/strict';
import { verifyPipelineBootReceipt } from '@kubeclaw/plugin-foundation/config/pipeline-boot.mjs';
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
  auth: WorkerAuthentication, controlInternalUrl?: URL, secret = 'local') {
  assert.equal(process.env.PRISM_NATIVE_ISOLATED_TEST_POOL, 'true', 'A dedicated native test pool must be explicitly selected');
  // Use the same authenticated installed generation as the real worker. A test
  // endpoint is an expectation, never a second configuration author.
  const capture = verifyPipelineBootReceipt('/run/pipeline-delivery', 'prism-worker');
  const config = loadWorkerConfig(capture, { ...process.env,
    WORKER_TRUST_SPIFFE_ENABLED: String(auth.mode === 'spiffe'),
    PRISM_TRUSTED_CONTROL_SPIFFE_ID: auth.mode === 'spiffe' ? auth.trustedControlSpiffeId : '',
    PRISM_WORKER_SECRET: auth.mode === 'hmac' ? auth.secret : secret,
    DATABASE_URL: process.env.PRISM_NATIVE_OPERATION_TEST_DATABASE_URL ?? '',
  });
  if (controlInternalUrl) assert.equal(config.controlInternalUrl.href, controlInternalUrl.href,
    'Publish the native test control endpoint in the selected prism-control author before boot');
  const native = nativePrismSupervisorConfig(config);
  requireNativeWorkerSupervisorAuthority(); requireNativeWorkerLauncher(native.launcher);
  const store = new FileWorkerOwnershipStore(native.ownershipRoot, { maximumRecords: native.maximumRecords, maximumBytes: native.maximumBytes },undefined,config.workerCore);
  let release!: () => void;
  const finished = new Promise<void>(resolve => { release = resolve; });
  let admit!: (value: ManagedWorkerServer) => void;
  let reject!: (reason: unknown) => void;
  const admitted = new Promise<ManagedWorkerServer>((resolve, fail) => { admit = resolve; reject = fail; });
  const supervision = NativeWorkerOwnership.supervise({ ...native, store }, async owner => {
    const execution = await nativePrismExecution(owner, native, config, capture.selectionReceipt.generationDigest);
    const server = createWorkerServer(auth, execution, config.ingress);
    admit(server);
    await finished;
    owner.fenceAdmission();
    await server.shutdown(config.shutdownTimeoutMs);
  });
  void supervision.catch(reject);
  t.after(async () => { release(); await supervision; });
  return admitted;
}
