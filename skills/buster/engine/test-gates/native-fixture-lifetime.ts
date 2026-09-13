import { executeNativeWorkerAttempt, type NativeAttemptJournal, type NativeWorkerProcessOptions,
  type NativeWorkerControlLimits } from '@kubeclaw/worker-core';
import type { WorkerAttemptResultV3 } from '@kubeclaw/pipeline-worker-core-contract';
import type { FileBusterFixtureJournal } from './native-fixture-journal.ts';
import { BusterFixtureControl } from './native-fixture-control.ts';
import { validateFixtureAdmission, type BusterFixtureAdmission, type BusterFixtureReadiness,
  type BusterFixtureState } from './native-fixture-state.ts';

export interface NativeBusterFixtureOptions {
  readonly admission: BusterFixtureAdmission;
  readonly journal: NativeAttemptJournal;
  readonly fixtures: FileBusterFixtureJournal;
  readonly process: Omit<NativeWorkerProcessOptions, 'identity' | 'input' | 'outputCapture' | 'control'>;
  readonly controlLimits: NativeWorkerControlLimits;
}

export interface NativeBusterFixtureLifetime {
  readonly ready: Promise<BusterFixtureReadiness>;
  readonly completion: Promise<WorkerAttemptResultV3>;
  readonly teardown: (reason: NonNullable<BusterFixtureState['teardown']>['reason']) => Promise<void>;
}

/** One native execution stays alive from setup through retained use and cleanup. */
export async function startNativeBusterFixture(options: NativeBusterFixtureOptions): Promise<NativeBusterFixtureLifetime> {
  const admission = structuredClone(options.admission); validateFixtureAdmission(admission);
  const process = { ...options.process, command: structuredClone(options.process.command), limits: { ...options.process.limits } };
  const controlLimits = { ...options.controlLimits };
  const reserved = await options.fixtures.reserve(admission);
  const control = new BusterFixtureControl(admission, options.fixtures);
  const controller = new AbortController();
  let cancellation: Promise<void> | undefined;
  const cancel = () => {
    cancellation ??= control.cancel().catch((error: unknown) => {
      process.owner.fenceAdmission(); throw error;
    }).finally(() => controller.abort(process.signal?.reason));
    void cancellation.catch(() => {});
  };
  process.signal?.addEventListener('abort', cancel, { once: true });
  if (process.signal?.aborted) { cancel(); await cancellation; }
  // A recovered readiness is historical, not authorization to start dependents.
  // Core recovery reconciles the previous scope and returns its terminal receipt.
  if (reserved.teardown && !reserved.terminal) controller.abort(new Error('BUSTER_FIXTURE_RECOVERY_TEARDOWN_PENDING'));
  const envelope = admission.envelope;
  const completion = executeNativeWorkerAttempt({ envelope, journal: options.journal,
    process: { ...process, signal: controller.signal, control: { limits: controlLimits,
      async run(channel, processSignal) {
        const owner = await process.owner.record({ workerId: envelope.claim.workerId,
          attemptId: envelope.attemptId, claimId: envelope.claim.claimId, generation: envelope.claim.generation,
          profileDigest: envelope.profile.profileDigest, attemptSpecDigest: envelope.attemptSpecDigest });
        if (!owner?.binding || owner.phase !== 'running') throw new Error('BUSTER_FIXTURE_RUNNING_OWNER_REQUIRED');
        await control.run(channel, processSignal, owner.binding);
      },
    } },
  }).then(async result => {
    process.signal?.removeEventListener('abort', cancel);
    await cancellation;
    await options.fixtures.seal(admission, options.journal);
    control.failed(new Error('BUSTER_FIXTURE_LIFETIME_ALREADY_TERMINAL'));
    return result;
  }).catch((error: unknown) => {
    process.owner.fenceAdmission(); control.failed(error); throw error;
  }).finally(() => {
    process.signal?.removeEventListener('abort', cancel);
  });
  // The scheduler must await completion; this only prevents an early unhandled
  // rejection while it is still awaiting the independent readiness boundary.
  void completion.catch(() => {});
  return { ready: control.ready, completion, teardown: reason => control.teardown(reason) };
}
