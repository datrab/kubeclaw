import { fileURLToPath } from 'node:url';
import { executeNativeWorkerAttempt, type NativeWorkerOwnership } from '@kubeclaw/worker-core';
import { validateWorkerResourceContractV3, type WorkerAttemptEnvelopeV3 } from '@kubeclaw/pipeline-worker-core-contract';
import { prismNativeWorkerProfile } from '../engine/worker-envelope.ts';
import type { nativePrismSupervisorConfig } from '../config/native-worker.ts';
import type { loadWorkerConfig } from './worker-config.ts';

/** Only serializable trusted configuration crosses into the per-attempt host. */
export function nativePrismExecution(owner: NativeWorkerOwnership, native: ReturnType<typeof nativePrismSupervisorConfig>,
  config: ReturnType<typeof loadWorkerConfig>) {
  const command = { launcher: native.launcher, uid: native.uid, gid: native.gid, executable: process.execPath,
    arguments: [fileURLToPath(new URL('./native-worker-host.ts', import.meta.url))], cwd: process.cwd(),
    environment: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/tmp', NODE_ENV: 'production',
      PLAYWRIGHT_BROWSERS_PATH: native.browserPath, PRISM_CONTROL_INTERNAL_URL: config.controlInternalUrl.toString(),
      PRISM_WORKER_SECRET: config.workerSecret, WORKER_TRUST_SPIFFE_ENABLED: String(config.spiffeEnabled),
      PRISM_NATIVE_MAXIMUM_INPUT_BYTES: String(native.maximumInputBytes) },
  };
  return {
    ready: () => owner.isReady(),
    async execute(envelope: WorkerAttemptEnvelopeV3, signal: AbortSignal) {
      validateWorkerResourceContractV3('workerAttemptEnvelope', envelope);
      if (envelope.profile.profileDigest !== prismNativeWorkerProfile.profileDigest) throw new Error('PRISM_NATIVE_PROFILE_NOT_ACCEPTED');
      const maxima = { cpuTimeMs: native.policy.cpuTimeMs, maximumMemoryBytes: native.policy.memoryBytes, maximumTasks: native.policy.tasks };
      for (const [metric, maximum] of Object.entries(maxima)) {
        const budget = envelope.resourceBudgets[metric as keyof typeof maxima];
        if (budget.state !== 'requested' || budget.limit > maximum) throw new Error(`PRISM_NATIVE_BUDGET_NOT_ACCEPTED:${metric}`);
      }
      const requested = (metric: keyof typeof maxima) => {
        const budget = envelope.resourceBudgets[metric];
        if (budget.state !== 'requested') throw new Error('PRISM_NATIVE_BUDGET_REQUIRED');
        return budget.limit;
      };
      return executeNativeWorkerAttempt({ envelope, process: { owner, command, signal,
        limits: { cpuTimeMs: requested('cpuTimeMs'), memoryBytes: requested('maximumMemoryBytes'), tasks: requested('maximumTasks'),
          timeoutMs: envelope.limits.timeoutMs + 8 * envelope.limits.cleanupTimeoutMs,
          maximumInputBytes: native.maximumInputBytes, maximumOutputBytes: native.maximumOutputBytes,
          pollIntervalMs: native.pollIntervalMs, closeTimeoutMs: native.closeTimeoutMs },
      } });
    },
  };
}
