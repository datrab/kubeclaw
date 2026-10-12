import { validatePipelineTestGateContract, type RemotePlanJobV1, type RemotePlanStatusV1 } from '@kubeclaw/pipeline-test-gate-contract';
import type { FileNovaRemotePlanStore, RemotePlanTransport } from './remote-dispatch.ts';
import { GateDeadline, gateDelay } from './deadline.ts';
import { RemotePlanTransportError } from './transport-error.ts';

export interface RemoteInterruption {
  readonly jobId: string; readonly requestDigest: string; readonly reason: string;
  readonly remoteState: string; readonly observedAt: string; readonly lastError: string | null;
}
function absent(error: unknown): boolean { return error instanceof RemotePlanTransportError && error.message.startsWith('NOVA_REMOTE_PLAN_HTTP_404:'); }
function identity(job: RemotePlanJobV1, status: RemotePlanStatusV1): void {
  validatePipelineTestGateContract('remotePlanStatus', status);
  if (status.jobId !== job.jobId || status.requestDigest !== job.requestDigest) throw new Error('NOVA_REMOTE_PLAN_STATUS_IDENTITY_MISMATCH');
}
function terminal(status: RemotePlanStatusV1): boolean { return ['completed', 'failed', 'cancelled'].includes(status.state); }
interface DispatchDependencies { store: FileNovaRemotePlanStore; transport: RemotePlanTransport; pollMilliseconds: number; cleanupMilliseconds: number }

export async function dispatchOperation(dependencies: DispatchDependencies, job: RemotePlanJobV1, options: { timeoutMs: number; signal?: AbortSignal }): Promise<RemotePlanStatusV1> {
  const deadline = new GateDeadline(options.timeoutMs, options.signal);
  let prepared = false;
  try {
    deadline.check();
    // Durable operations are awaited to completion; never race and abandon an atomic write.
    validatePipelineTestGateContract('remotePlanJob', job); prepared = true;
    const stored = await dependencies.store.persistBeforeDispatch(job, deadline.signal);
    deadline.check();
    return await pollRemote(dependencies, stored, deadline);
  } catch (error) {
    try { deadline.check(); }
    catch (interruption) {
      if (prepared) throw await reconcileInterruption(dependencies, job, interruption as Error);
      throw interruption;
    }
    throw error;
  } finally { deadline.dispose(); }
}
async function pollRemote(dependencies: DispatchDependencies, job: RemotePlanJobV1, deadline: GateDeadline): Promise<RemotePlanStatusV1> {
  // Durable jobs may already have been submitted by an earlier process. Establish absence before POST.
  let submit = false;
  for (;;) {
    deadline.check();
    try {
      const status = submit ? await dependencies.transport.submit(job, deadline.signal) : await dependencies.transport.status(job.jobId, deadline.signal);
      deadline.check(); identity(job, status);
      if (terminal(status)) return status;
      submit = false;
    } catch (error) {
      deadline.check();
      if (absent(error)) submit = true;
      else if (error instanceof RemotePlanTransportError && error.retryable) submit = false;
      else throw error;
    }
    await gateDelay(Math.min(dependencies.pollMilliseconds, deadline.remaining()), deadline.signal);
  }
}
async function reconcileInterruption(dependencies: DispatchDependencies, job: RemotePlanJobV1, reason: Error): Promise<Error> {
  const cleanup = new GateDeadline(dependencies.cleanupMilliseconds);
  let remoteState = 'unknown'; let lastError: string | null = null;
  try {
    const observed = await observeInterruption(dependencies, job, cleanup);
    remoteState = observed.remoteState; lastError = observed.lastError;
  } catch (error) { lastError = error instanceof Error ? error.message : String(error); }
  finally { cleanup.dispose(); }
  const outcome: RemoteInterruption = { jobId: job.jobId, requestDigest: job.requestDigest, reason: reason.message, remoteState, observedAt: new Date().toISOString(), lastError };
  try { await dependencies.store.recordInterruption(outcome); }
  catch (error) { return new Error(`${reason.message}:REMOTE_STATE_${remoteState.toUpperCase()}:RECONCILIATION_PERSIST_FAILED`, { cause: new AggregateError([reason, error]) }); }
  return Object.assign(new Error(`${reason.message}:REMOTE_STATE_${remoteState.toUpperCase()}`, { cause: reason }), { reconciliation: outcome });
}

async function observeInterruption(dependencies: DispatchDependencies, job: RemotePlanJobV1, cleanup: GateDeadline): Promise<{ remoteState: string; lastError: string | null }> {
  let cancel = true; let lastError: string | null = null;
  for (;;) {
    cleanup.check();
    try {
      const status = cancel ? await dependencies.transport.cancel(job.jobId, cleanup.signal) : await dependencies.transport.status(job.jobId, cleanup.signal);
      identity(job, status);
      if (terminal(status)) return { remoteState: status.state, lastError };
    } catch (error) {
      // A lost in-flight POST can be accepted after a 404; absence is not cancellation proof.
      lastError = error instanceof Error ? error.message : String(error);
    }
    cancel = false;
    try { await gateDelay(Math.min(dependencies.pollMilliseconds, cleanup.remaining()), cleanup.signal); }
    catch (error) { return { remoteState: 'unknown', lastError: lastError ?? (error instanceof Error ? error.message : String(error)) }; }
  }
}
