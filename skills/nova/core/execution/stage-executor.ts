import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { ArtifactRef, AttemptIdentity, InvocationLease, LifecycleEvent, PluginContext, PluginDomainEvent, StageResult } from '@kubeclaw/plugin-sdk';
import type { ActivatedRegistry } from '@kubeclaw/plugin-foundation/registry/activation';
import type { GrantedRegistry } from '@kubeclaw/plugin-foundation/registry/capabilities';
import { validateReferencedValue } from '@kubeclaw/plugin-foundation/registry/schema';
import { applyStageResult, type StageRuntimeState } from '../lifecycle/reducer.ts';
import type { FileJournal } from '../state/journal.ts';
import { artifactFromWrite, type ArtifactCheckpointRecorder } from './artifact-checkpoints.ts';
import { createPluginInvocationContext } from './context.ts';
import type { AdapterRuntime } from './adapters.ts';
import type { ExecutionGraph } from './graph.ts';
import { RevocableLease } from './lease.ts';

export type AppendLifecycleEvent = (type: LifecycleEvent['type'], identity: LifecycleEvent['identity'], payload?: Readonly<Record<string, unknown>>, causationId?: string | null) => LifecycleEvent;

interface ExecutorOptions {
  readonly graph: ExecutionGraph; readonly registry: GrantedRegistry; readonly activated: ActivatedRegistry; readonly adapters: AdapterRuntime;
  readonly journal: FileJournal<LifecycleEvent | PluginDomainEvent>; readonly signal?: AbortSignal; readonly now: () => Date; readonly append: AppendLifecycleEvent;
  readonly checkpoints: ArtifactCheckpointRecorder;
}

interface AttemptRuntime {
  readonly attempt: AttemptIdentity; readonly leaseContract: InvocationLease; readonly lease: RevocableLease;
  readonly controller: AbortController; readonly cancellation: Promise<never>; readonly cancel: () => void; readonly context: ReturnType<typeof createPluginInvocationContext>;
}

export class StageExecutor {
  readonly #options: ExecutorOptions;
  constructor(options: ExecutorOptions) { this.#options = options; }

  async execute(runId: string, state: StageRuntimeState, guidance?: Readonly<Record<string, unknown>>): Promise<{ state: StageRuntimeState; action: ReturnType<typeof applyStageResult>['action']; result: StageResult }> {
    const definition = this.#options.graph.stage(state.stageId);
    const owner = this.#options.registry.snapshot.stages.get(definition.type);
    const activated = this.#options.activated.stages.get(definition.type);
    if (!owner || !activated) throw new Error(`PIPELINE_STAGE_NOT_ACTIVATED:${definition.type}`);
    const runtime = this.#runtime(runId, state, guidance, owner);
    this.#recordAttempt(runId, state, definition.type, owner, runtime);
    let result: StageResult;
    try {
      result = await this.#invoke(activated.execute(definition.input, runtime.context, runtime.controller.signal) as Promise<StageResult>, definition.execution.timeoutMs, runtime);
      validateReferencedValue(fs.realpathSync(path.join(owner.package.root, owner.registration.resultSchema)), result);
      this.#recordResult(runId, state.stageId, runtime.attempt.attemptId, result);
    } catch (error) {
      result = this.#failure(error);
      this.#recordResult(runId, state.stageId, runtime.attempt.attemptId, result);
    }
    finally { this.#cleanup(runtime); }
    return { ...applyStageResult(definition, { ...state, status: 'running' }, result), result };
  }

  #runtime(runId: string, state: StageRuntimeState, guidance: Readonly<Record<string, unknown>> | undefined, owner: NonNullable<ReturnType<GrantedRegistry['snapshot']['stages']['get']>>): AttemptRuntime {
    const attempt: AttemptIdentity = Object.freeze({ runId, stageId: state.stageId, attemptId: `attempt:${crypto.randomUUID()}`, attemptNumber: state.attemptNumber + 1 });
    const registrationId = `${owner.package.manifest.id}:${owner.registration.id}`;
    const definition = this.#options.graph.stage(state.stageId); const now = this.#options.now();
    const leaseContract: InvocationLease = Object.freeze({
      schemaVersion: 'invocation-lease.v2', leaseId: `lease:${crypto.randomUUID()}`, attempt, registration: owner.provenance, status: 'active',
      grants: [...(this.#options.registry.grants.get(registrationId) ?? [])],
      limits: Object.freeze({ wallTimeMs: definition.execution.timeoutMs, memoryBytes: 512 * 1024 * 1024, cpuMillis: definition.execution.timeoutMs }),
      issuedAt: now.toISOString(), expiresAt: new Date(now.getTime() + definition.execution.timeoutMs).toISOString(),
    });
    const lease = new RevocableLease(leaseContract, this.#options.now); const controller = new AbortController();
    let rejectCancellation: ((error: Error) => void) | undefined;
    const cancellation = new Promise<never>((_resolve, reject) => { rejectCancellation = reject; });
    const cancel = (): void => { controller.abort(this.#options.signal?.reason); rejectCancellation?.(new Error('PLUGIN_ATTEMPT_CANCELLED')); };
    this.#options.signal?.addEventListener('abort', cancel, { once: true }); if (this.#options.signal?.aborted) cancel();
    const context = this.#context({
      schemaVersion: 'plugin-context.v2', lease: leaseContract, config: definition.config, input: definition.input,
      ...(guidance === undefined ? {} : { guidance }),
      stageLifecycle: Object.freeze({ attemptsUsed: state.attemptsUsed, remediationCyclesUsed: state.remediationCyclesUsed,
        maxAttempts: definition.execution.maxAttempts, maxRemediationCycles: definition.execution.maxRemediationCycles }),
      artifacts: this.#priorArtifacts(runId, state.stageId),
    }, lease, owner, attempt, controller);
    return { attempt, leaseContract, lease, controller, cancellation, cancel, context };
  }

  #context(contract: PluginContext, lease: RevocableLease, owner: NonNullable<ReturnType<GrantedRegistry['snapshot']['stages']['get']>>, attempt: AttemptIdentity, controller: AbortController): ReturnType<typeof createPluginInvocationContext> {
    let sequence = 0;
    return createPluginInvocationContext(contract, lease, { invoke: async (_leaseId, capability, operation, resource, payload) => {
      sequence += 1;
      const request = { operation, resource, payload };
      const response = await this.#options.adapters.invoke(capability, attempt,
        `${attempt.runId}:${attempt.stageId}:${attempt.attemptNumber}:${sequence}`, request, controller.signal);
      if (capability === 'artifacts.write') {
        const artifact = artifactFromWrite(attempt, request, response);
        if (artifact) this.#options.checkpoints.checkpoint(artifact);
      }
      return response;
    } }, { append: async (_leaseId, type, identity, payload) => { this.#options.journal.append({
      schemaVersion: 'plugin-domain-event.v2', eventId: `event:${crypto.randomUUID()}`, sequence: this.#options.journal.records().length + 1,
      type, producer: owner.provenance, identity, occurredAt: this.#options.now().toISOString(), causationId: attempt.attemptId, payload,
    }); } });
  }

  #priorArtifacts(runId: string, stageId: string): ArtifactRef[] {
    const visible = new Set<string>([stageId]), pending = [...this.#options.graph.stage(stageId).dependsOn];
    while (pending.length > 0) {
      const dependency = pending.pop() as string;
      if (visible.has(dependency)) continue;
      visible.add(dependency);
      pending.push(...this.#options.graph.stage(dependency).dependsOn);
    }
    return this.#options.checkpoints.artifacts(runId)
      .filter((artifact) => visible.has(artifact.producer.stageId));
  }

  #recordAttempt(runId: string, state: StageRuntimeState, stageType: string, owner: NonNullable<ReturnType<GrantedRegistry['snapshot']['stages']['get']>>, runtime: AttemptRuntime): void {
    this.#options.append('attempt.created', { runId, stageId: state.stageId, attemptId: runtime.attempt.attemptId }, { attempt: Object.freeze({
      schemaVersion: 'stage-attempt.v2', identity: runtime.attempt, owner: { ...owner.provenance.package.package, registrationId: owner.registration.id },
      stageType, leaseId: runtime.leaseContract.leaseId, status: 'created', retryBudgetUsed: state.attemptsUsed,
      remediationBudgetUsed: state.remediationCyclesUsed, createdAt: runtime.leaseContract.issuedAt,
    }), attemptNumber: runtime.attempt.attemptNumber });
    this.#options.append('attempt.dispatched', { runId, stageId: state.stageId, attemptId: runtime.attempt.attemptId });
  }

  async #invoke(operation: Promise<StageResult>, timeoutMs: number, runtime: AttemptRuntime): Promise<StageResult> {
    let timeout!: NodeJS.Timeout;
    const deadline = new Promise<never>((_, reject) => { timeout = setTimeout(() => { runtime.controller.abort(new Error('PLUGIN_ATTEMPT_TIMEOUT')); reject(new Error('PLUGIN_ATTEMPT_TIMEOUT')); }, timeoutMs); timeout.unref(); });
    try { return await Promise.race([operation, runtime.cancellation, deadline]); }
    finally { clearTimeout(timeout); }
  }

  #failure(error: unknown): StageResult {
    const cancelled = this.#options.signal?.aborted === true; const timedOut = error instanceof Error && error.message === 'PLUGIN_ATTEMPT_TIMEOUT';
    return { schemaVersion: 'stage-result.v2', outcome: cancelled ? 'cancelled' : timedOut ? 'timed_out' : 'retry', reason: {
      code: cancelled ? 'core.attempt_cancelled' : timedOut ? 'core.attempt_timed_out' : 'core.plugin_runtime_failed',
      message: error instanceof Error ? error.message : String(error),
    }, artifacts: [] };
  }

  #recordResult(runId: string, stageId: string, attemptId: string, result: StageResult): void {
    const type = result.outcome === 'timed_out' ? 'attempt.timed_out' : result.outcome === 'cancelled' ? 'attempt.cancelled' : 'attempt.completed';
    this.#options.append(type, { runId, stageId, attemptId }, { outcome: result.outcome, ...(result.reason ? { reason: result.reason } : {}), result: structuredClone(result) });
  }

  #cleanup(runtime: AttemptRuntime): void {
    this.#options.signal?.removeEventListener('abort', runtime.cancel); runtime.controller.abort(new Error('PLUGIN_ATTEMPT_COMPLETED'));
    runtime.lease.revoke({ code: 'core.attempt_completed' }, this.#options.now());
  }
}
