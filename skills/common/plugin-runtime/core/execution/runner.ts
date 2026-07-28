import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  AttemptIdentity,
  InvocationLease,
  LifecycleEvent,
  PipelineDefinition,
  PluginContext,
  PluginDomainEvent,
  StageDefinition,
  StageResult,
} from '../../sdk/src/index.ts';
import type { ActivatedRegistry } from '../registry/activation.ts';
import type { GrantedRegistry } from '../registry/capabilities.ts';
import { validateReferencedValue } from '../registry/schema.ts';
import type { AdapterRuntime } from './adapters.ts';
import { createPluginInvocationContext } from './context.ts';
import { ExecutionGraph, type ExecutionGraphSnapshot } from './graph.ts';
import { RevocableLease } from './lease.ts';
import { applyStageResult, type StageRuntimeState } from '../lifecycle/reducer.ts';
import { FileJournal } from '../state/journal.ts';
import { FrozenMap } from '../registry/frozen-map.ts';

export interface PipelineRunIdentity {
  readonly runId: string;
  readonly pipelineId: string;
  readonly graphDigest: string;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}

export interface PipelineRunResult {
  readonly runId: string;
  readonly identity: PipelineRunIdentity;
  readonly status: 'succeeded' | 'failed' | 'blocked' | 'waiting' | 'cancelled';
  readonly stages: ReadonlyMap<string, StageRuntimeState>;
}

export interface PipelineRunnerOptions {
  readonly definition: PipelineDefinition;
  readonly registry: GrantedRegistry;
  readonly activated: ActivatedRegistry;
  readonly adapters: AdapterRuntime;
  readonly journal: FileJournal<LifecycleEvent | PluginDomainEvent>;
  readonly initialStates?: ReadonlyMap<string, StageRuntimeState>;
  readonly resumeGuidance?: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  readonly orchestratorIssuerId: string;
  readonly resume?: boolean;
  readonly resumePayload?: Readonly<Record<string, unknown>>;
  readonly resumeCausationId?: string;
  readonly resumeEventAlreadyRecorded?: boolean;
  readonly administrativeAttemptOverrides?: ReadonlySet<string>;
  readonly signal?: AbortSignal;
  readonly now?: () => Date;
}

export class PipelineRunner {
  readonly #options: PipelineRunnerOptions;
  readonly #graph: ExecutionGraph;
  readonly #graphSnapshot: ExecutionGraphSnapshot;
  readonly #maxConcurrency: number;
  readonly #administrativeAttemptOverrides: Set<string>;
  readonly #now: () => Date;

  constructor(options: PipelineRunnerOptions) {
    this.#options = options;
    this.#graph = ExecutionGraph.fromDefinition(options.definition);
    this.#graphSnapshot = this.#graph.snapshot(
      options.definition.id,
      options.definition.maxConcurrency,
    );
    this.#maxConcurrency = options.definition.maxConcurrency;
    this.#administrativeAttemptOverrides = new Set(options.administrativeAttemptOverrides);
    this.#now = options.now ?? (() => new Date());
    for (const stage of options.definition.stages) {
      const owner = options.registry.snapshot.stages.get(stage.type);
      if (!owner) {
        throw new Error(`PIPELINE_STAGE_OWNER_MISSING:${stage.type}`);
      }
      validateReferencedValue(
        fs.realpathSync(path.join(owner.package.root, owner.registration.configSchema)),
        stage.config,
      );
      validateReferencedValue(
        fs.realpathSync(path.join(owner.package.root, owner.registration.inputSchema)),
        stage.input,
      );
    }
  }

  graphSnapshot(): ExecutionGraphSnapshot {
    return this.#graphSnapshot;
  }

  #result(
    identity: PipelineRunIdentity,
    status: PipelineRunResult['status'],
    states: ReadonlyMap<string, StageRuntimeState>,
  ): PipelineRunResult {
    return Object.freeze({
      runId: identity.runId,
      identity,
      status,
      stages: new FrozenMap(
        [...states].map(([stageId, state]) => [stageId, deepFreeze(structuredClone(state))]),
      ),
    });
  }

  #append(
    type: LifecycleEvent['type'],
    identity: LifecycleEvent['identity'],
    payload: Readonly<Record<string, unknown>> = {},
    causationId: string | null = this.#options.resumeCausationId ?? null,
  ): LifecycleEvent {
    const event: LifecycleEvent = {
      schemaVersion: 'lifecycle-event.v2',
      eventId: `event:${crypto.randomUUID()}`,
      sequence: this.#options.journal.records().length + 1,
      type,
      identity,
      occurredAt: this.#now().toISOString(),
      causationId,
      payload,
    };
    this.#options.journal.append(event);
    return event;
  }

  async #executeStage(
    runId: string,
    state: StageRuntimeState,
    guidance?: Readonly<Record<string, unknown>>,
  ): Promise<{
    state: StageRuntimeState;
    action: ReturnType<typeof applyStageResult>['action'];
    result: StageResult;
  }> {
    const definition = this.#graph.stage(state.stageId);
    const owner = this.#options.registry.snapshot.stages.get(definition.type);
    const activated = this.#options.activated.stages.get(definition.type);
    if (!owner || !activated) throw new Error(`PIPELINE_STAGE_NOT_ACTIVATED:${definition.type}`);
    const attemptNumber = state.attemptNumber + 1;
    const attempt: AttemptIdentity = Object.freeze({
      runId,
      stageId: definition.id,
      attemptId: `attempt:${crypto.randomUUID()}`,
      attemptNumber,
    });
    const registrationId = `${owner.package.manifest.id}:${owner.registration.id}`;
    const leaseContract: InvocationLease = Object.freeze({
      schemaVersion: 'invocation-lease.v2',
      leaseId: `lease:${crypto.randomUUID()}`,
      attempt,
      registration: owner.provenance,
      status: 'active',
      grants: [...(this.#options.registry.grants.get(registrationId) ?? [])],
      limits: Object.freeze({
        wallTimeMs: definition.execution.timeoutMs,
        memoryBytes: 512 * 1024 * 1024,
        cpuMillis: definition.execution.timeoutMs,
      }),
      issuedAt: this.#now().toISOString(),
      expiresAt: new Date(this.#now().getTime() + definition.execution.timeoutMs).toISOString(),
    });
    const lease = new RevocableLease(leaseContract, this.#now);
    const controller = new AbortController();
    let rejectCancellation: ((error: Error) => void) | undefined;
    const cancellation = new Promise<never>((_resolve, reject) => {
      rejectCancellation = reject;
    });
    const cancel = () => {
      controller.abort(this.#options.signal?.reason);
      rejectCancellation?.(new Error('PLUGIN_ATTEMPT_CANCELLED'));
    };
    this.#options.signal?.addEventListener('abort', cancel, { once: true });
    if (this.#options.signal?.aborted) cancel();
    const contract: PluginContext = {
      schemaVersion: 'plugin-context.v2',
      lease: leaseContract,
      config: definition.config,
      input: definition.input,
      ...(guidance === undefined ? {} : { guidance }),
      artifacts: [],
    };
    let capabilitySequence = 0;
    const context = createPluginInvocationContext(contract, lease, {
      invoke: async (_leaseId, capability, operation, resource, payload) => {
        capabilitySequence += 1;
        return this.#options.adapters.invoke(
          capability,
          attempt,
          `${attempt.runId}:${attempt.stageId}:${attempt.attemptNumber}:${capabilitySequence}`,
          { operation, resource, payload },
          controller.signal,
        );
      },
    }, {
      append: async (_leaseId, type, identity, payload) => {
        this.#options.journal.append({
          schemaVersion: 'plugin-domain-event.v2',
          eventId: `event:${crypto.randomUUID()}`,
          sequence: this.#options.journal.records().length + 1,
          type,
          producer: owner.provenance,
          identity,
          occurredAt: this.#now().toISOString(),
          causationId: attempt.attemptId,
          payload,
        });
      },
    });
    this.#append(
      'attempt.created',
      { runId, stageId: definition.id, attemptId: attempt.attemptId },
      {
        attempt: Object.freeze({
          schemaVersion: 'stage-attempt.v2',
          identity: attempt,
          owner: {
            ...owner.provenance.package.package,
            registrationId: owner.registration.id,
          },
          stageType: definition.type,
          leaseId: leaseContract.leaseId,
          status: 'created',
          retryBudgetUsed: state.attemptsUsed,
          remediationBudgetUsed: state.remediationCyclesUsed,
          createdAt: leaseContract.issuedAt,
        }),
        attemptNumber,
      },
    );
    this.#append('attempt.dispatched', { runId, stageId: definition.id, attemptId: attempt.attemptId });
    let result: StageResult;
    let timeoutHandle: NodeJS.Timeout | undefined;
    try {
      result = await Promise.race([
        activated.execute(definition.input, context) as Promise<StageResult>,
        cancellation,
        new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(
            () => {
              controller.abort(new Error('PLUGIN_ATTEMPT_TIMEOUT'));
              reject(new Error('PLUGIN_ATTEMPT_TIMEOUT'));
            },
            definition.execution.timeoutMs,
          );
          timeoutHandle.unref();
        }),
      ]);
      const resultSchema = fs.realpathSync(path.join(owner.package.root, owner.registration.resultSchema));
      validateReferencedValue(resultSchema, result);
      this.#append(
        result.outcome === 'timed_out'
          ? 'attempt.timed_out'
          : result.outcome === 'cancelled'
            ? 'attempt.cancelled'
            : 'attempt.completed',
        { runId, stageId: definition.id, attemptId: attempt.attemptId },
        { outcome: result.outcome, result: deepFreeze(structuredClone(result)) },
      );
    } catch (error) {
      const externallyCancelled = this.#options.signal?.aborted === true;
      const timedOut = error instanceof Error && error.message === 'PLUGIN_ATTEMPT_TIMEOUT';
      result = {
        schemaVersion: 'stage-result.v2',
        outcome: externallyCancelled ? 'cancelled' : timedOut ? 'timed_out' : 'retry',
        reason: {
          code: externallyCancelled
            ? 'core.attempt_cancelled'
            : timedOut
              ? 'core.attempt_timed_out'
              : 'core.plugin_runtime_failed',
          message: error instanceof Error ? error.message : String(error),
        },
        artifacts: [],
      };
      this.#append(
        externallyCancelled ? 'attempt.cancelled' : timedOut ? 'attempt.timed_out' : 'attempt.completed',
        { runId, stageId: definition.id, attemptId: attempt.attemptId },
        {
          outcome: result.outcome,
          reason: result.reason,
          result: deepFreeze(structuredClone(result)),
        },
      );
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      this.#options.signal?.removeEventListener('abort', cancel);
      controller.abort(new Error('PLUGIN_ATTEMPT_COMPLETED'));
      lease.revoke({ code: 'core.attempt_completed' }, this.#now());
    }
    return {
      ...applyStageResult(definition, { ...state, status: 'running' }, result),
      result,
    };
  }

  async run(runId = `run:${crypto.randomUUID()}`): Promise<PipelineRunResult> {
    const runIdentity: PipelineRunIdentity = Object.freeze({
      runId,
      pipelineId: this.#graphSnapshot.pipelineId,
      graphDigest: this.#graphSnapshot.digest,
    });
    const states = new Map<string, StageRuntimeState>(
      this.#options.initialStates
        ?? this.#graph.stages().map((stage) => [stage.id, {
          stageId: stage.id,
          status: 'pending' as const,
          attemptNumber: 0,
          attemptsUsed: 0,
          remediationCyclesUsed: 0,
        }] as const),
    );
    if (this.#options.resume) {
      if (!this.#options.resumeEventAlreadyRecorded) {
        this.#append('run.resumed', { runId }, {
          runIdentity,
          ...(this.#options.resumePayload ?? {}),
        });
      }
    } else {
      this.#append('run.created', { runId }, { runIdentity });
      this.#append('run.started', { runId });
    }
    const forced: string[] = [];
    const forcedStageIds = new Set<string>();
    const force = (stageId: string): void => {
      if (forcedStageIds.has(stageId)) return;
      forcedStageIds.add(stageId);
      forced.push(stageId);
    };
    const nextForced = (): string | undefined => {
      const stageId = forced.shift();
      if (stageId) forcedStageIds.delete(stageId);
      return stageId;
    };
    for (const [stageId, state] of states) {
      if (state.status !== 'waiting' || !state.remediationTarget) continue;
      const target = states.get(state.remediationTarget);
      if (!target) throw new Error(`GRAPH_REMEDIATION_MISSING:${stageId}:${state.remediationTarget}`);
      if (!target.remediationReturnTo) {
        states.set(state.remediationTarget, {
          ...target,
          status: 'pending',
          remediationReturnTo: stageId,
        });
      }
    }
    for (const [stageId, state] of states) {
      if (!state.remediationReturnTo) continue;
      if (state.status === 'succeeded') {
        const requester = states.get(state.remediationReturnTo);
        if (requester) {
          const { remediationTarget: _target, ...requesterWithoutTarget } = requester;
          const { remediationReturnTo, ...stageWithoutReturn } = state;
          states.set(state.remediationReturnTo, {
            ...requesterWithoutTarget,
            status: 'pending',
          });
          states.set(stageId, stageWithoutReturn);
          force(remediationReturnTo);
        }
      } else if (state.status === 'pending') {
        force(stageId);
      }
    }
    for (;;) {
      if (this.#options.signal?.aborted) {
        for (const [stageId, state] of states) {
          if (['succeeded', 'failed', 'blocked', 'cancelled'].includes(state.status)) continue;
          states.set(stageId, { ...state, status: 'cancelled' });
          this.#append('stage.cancelled', { runId, stageId }, {
            attemptsUsed: state.attemptsUsed,
            remediationCyclesUsed: state.remediationCyclesUsed,
          });
        }
        this.#append('run.cancelled', { runId });
        return this.#result(runIdentity, 'cancelled', states);
      }
      const completed = new Set([...states].filter(([, state]) => state.status === 'succeeded').map(([id]) => id));
      const active = new Set([...states].filter(([, state]) => !['pending', 'succeeded'].includes(state.status)).map(([id]) => id));
      const forcedStageId = nextForced();
      let ready: readonly StageDefinition[];
      if (forcedStageId) {
        const forcedDefinition = this.#graph.stage(forcedStageId);
        const returnTo = states.get(forcedStageId)?.remediationReturnTo;
        const remediationDependenciesReady = forcedDefinition.dependsOn.every((dependency) =>
          dependency === returnTo || completed.has(dependency));
        if (returnTo && !remediationDependenciesReady) {
          force(forcedStageId);
          ready = this.#graph.ready(completed, active);
        } else {
          ready = [forcedDefinition];
        }
      } else {
        ready = this.#graph.ready(completed, active);
      }
      if (ready.length === 0) break;
      const batch = ready.slice(0, this.#maxConcurrency);
      const decisions = await Promise.all(batch.map(async (definition) => {
        const current = states.get(definition.id)!;
        const administrativeOverride = this.#administrativeAttemptOverrides.delete(definition.id);
        if (current.attemptsUsed >= definition.execution.maxAttempts && !administrativeOverride) {
          const result: StageResult = {
            schemaVersion: 'stage-result.v2',
            outcome: 'blocked',
            reason: {
              code: 'core.attempt_budget_exhausted',
              message: `Attempt budget exhausted for ${definition.id}`,
            },
            artifacts: [],
          };
          return {
            definition,
            administrativeOverride: false,
            decision: {
              state: { ...current, status: 'blocked' as const },
              action: { type: 'stop' as const },
              result,
            },
          };
        }
        states.set(definition.id, { ...current, status: 'running' });
        this.#append('stage.started', { runId, stageId: definition.id }, {
          ...(administrativeOverride ? { administrativeOverride: true } : {}),
        });
        const decision = await this.#executeStage(
          runId,
          current,
          this.#options.resumeGuidance?.get(definition.id),
        );
        return { definition, decision, administrativeOverride };
      }));
      let batchTerminalStatus: 'failed' | 'blocked' | 'cancelled' | undefined;
      let batchPaused = false;
      const recordTerminalStatus = (status: 'failed' | 'blocked' | 'cancelled'): void => {
        const priority = { cancelled: 1, blocked: 2, failed: 3 } as const;
        if (!batchTerminalStatus || priority[status] > priority[batchTerminalStatus]) {
          batchTerminalStatus = status;
        }
      };
      for (const { definition, decision, administrativeOverride } of decisions) {
        states.set(definition.id, decision.state);
        for (const artifact of decision.result.artifacts) {
          this.#append(
            'artifact.created',
            { runId, stageId: definition.id, artifactId: artifact.artifactId },
            {
              namespace: artifact.namespace,
              mediaType: artifact.mediaType,
              digest: artifact.digest,
              sizeBytes: artifact.sizeBytes,
            },
          );
        }
        if (
          administrativeOverride
          && decision.action.type !== 'complete'
          && decision.action.type !== 'stop'
        ) {
          const blockedState = { ...decision.state, status: 'blocked' as const };
          states.set(definition.id, blockedState);
          this.#append('stage.blocked', { runId, stageId: definition.id }, {
            attemptsUsed: blockedState.attemptsUsed,
            remediationCyclesUsed: blockedState.remediationCyclesUsed,
            reason: 'administrative_attempt_consumed',
          });
          recordTerminalStatus('blocked');
          continue;
        }
        if (decision.action.type === 'schedule_attempt') {
          states.set(definition.id, { ...decision.state, status: 'pending' });
          this.#append('stage.retrying', { runId, stageId: definition.id }, {
            attemptsUsed: decision.state.attemptsUsed,
            remediationCyclesUsed: decision.state.remediationCyclesUsed,
          });
          force(definition.id);
        } else if (decision.action.type === 'schedule_remediation') {
          const remediationState = states.get(decision.action.stageId)!;
          if (['blocked', 'failed', 'cancelled'].includes(remediationState.status)) {
            const blockedState = { ...decision.state, status: 'blocked' as const };
            states.set(definition.id, blockedState);
            this.#append('stage.blocked', { runId, stageId: definition.id }, {
              attemptsUsed: blockedState.attemptsUsed,
              remediationCyclesUsed: blockedState.remediationCyclesUsed,
              remediationStageId: decision.action.stageId,
              reason: 'remediation_target_terminal',
            });
            recordTerminalStatus(
              remediationState.status === 'failed'
                ? 'failed'
                : remediationState.status === 'cancelled'
                  ? 'cancelled'
                  : 'blocked',
            );
            continue;
          }
          this.#append('stage.waiting', { runId, stageId: definition.id }, {
            attemptsUsed: decision.state.attemptsUsed,
            remediationCyclesUsed: decision.state.remediationCyclesUsed,
            remediationStageId: decision.action.stageId,
          });
          states.set(decision.action.stageId, {
            ...remediationState,
            status: 'pending',
            remediationReturnTo: definition.id,
          });
          this.#append('stage.scheduled', {
            runId,
            stageId: decision.action.stageId,
          }, {
            reason: 'remediation',
            remediationReturnTo: definition.id,
          });
          force(decision.action.stageId);
        } else if (decision.action.type === 'request_orchestrator') {
          const wait = {
            schemaVersion: 'wait-request.v2' as const,
            waitId: `wait:${crypto.randomUUID()}`,
            kind: 'orchestrator' as const,
            signalType: 'core.orchestrator.resume',
            authorizedIssuer: {
              type: 'orchestrator' as const,
              id: this.#options.orchestratorIssuerId,
            },
            expiresAt: null,
            request: { afterAttempt: decision.action.afterAttempt },
          };
          states.set(definition.id, { ...decision.state, wait });
          this.#append('orchestrator.required', { runId, stageId: definition.id }, {
            afterAttempt: decision.action.afterAttempt,
            attemptsUsed: decision.state.attemptsUsed,
            remediationCyclesUsed: decision.state.remediationCyclesUsed,
            wait,
          });
          batchPaused = true;
        } else if (decision.action.type === 'pause_for_orchestrator') {
          const wait = {
            schemaVersion: 'wait-request.v2' as const,
            waitId: `wait:${crypto.randomUUID()}`,
            kind: 'orchestrator' as const,
            signalType: 'core.orchestrator.resume',
            authorizedIssuer: {
              type: 'orchestrator' as const,
              id: this.#options.orchestratorIssuerId,
            },
            expiresAt: null,
            ...(decision.action.wait.request
              ? { request: decision.action.wait.request }
              : {}),
          };
          states.set(definition.id, { ...decision.state, wait });
          this.#append('orchestrator.required', { runId, stageId: definition.id }, {
            attemptsUsed: decision.state.attemptsUsed,
            remediationCyclesUsed: decision.state.remediationCyclesUsed,
            wait,
          });
          batchPaused = true;
        } else if (
          decision.action.type === 'persist_wait'
          || decision.action.type === 'cooldown'
        ) {
          this.#append('stage.waiting', { runId, stageId: definition.id }, {
            attemptsUsed: decision.state.attemptsUsed,
            remediationCyclesUsed: decision.state.remediationCyclesUsed,
            ...('wait' in decision.action ? { wait: decision.action.wait } : {}),
            ...(decision.action.type === 'cooldown' ? { retryAt: decision.action.retryAt } : {}),
          });
          batchPaused = true;
        } else if (decision.action.type === 'stop') {
          const status = decision.state.status === 'blocked' ? 'blocked'
            : decision.state.status === 'cancelled' ? 'cancelled'
              : 'failed';
          this.#append(`stage.${status}` as LifecycleEvent['type'], { runId, stageId: definition.id }, {
            attemptsUsed: decision.state.attemptsUsed,
            remediationCyclesUsed: decision.state.remediationCyclesUsed,
          });
          recordTerminalStatus(status);
        } else {
          this.#append('stage.succeeded', { runId, stageId: definition.id }, {
            attemptsUsed: decision.state.attemptsUsed,
            remediationCyclesUsed: decision.state.remediationCyclesUsed,
            ...(decision.state.remediationReturnTo
              ? { remediationReturnTo: decision.state.remediationReturnTo }
              : {}),
          });
          if (decision.state.remediationReturnTo) {
            const returnTo = decision.state.remediationReturnTo;
            const requester = states.get(returnTo);
            if (!requester) throw new Error(`GRAPH_REMEDIATION_RETURN_MISSING:${returnTo}`);
            const { remediationReturnTo: _returnTo, ...stateWithoutReturn } = decision.state;
            const { remediationTarget: _target, ...requesterWithoutTarget } = requester;
            states.set(definition.id, stateWithoutReturn);
            states.set(returnTo, {
              ...requesterWithoutTarget,
              status: 'pending',
            });
            this.#append('stage.scheduled', { runId, stageId: returnTo }, {
              reason: 'remediation_completed',
              remediationStageId: definition.id,
            });
            force(returnTo);
          }
        }
      }
      if (batchTerminalStatus) {
        this.#append(`run.${batchTerminalStatus}` as LifecycleEvent['type'], { runId });
        return this.#result(runIdentity, batchTerminalStatus, states);
      }
      if (batchPaused) return this.#result(runIdentity, 'waiting', states);
    }
    const statuses = [...states.values()].map(({ status }) => status);
    const ordinaryExecutionComplete = [...states].every(([stageId, state]) =>
      state.status === 'succeeded'
      || (
        state.status === 'pending'
        && this.#graph.isRemediationOnlyTarget(stageId)
        && !state.remediationReturnTo
      ));
    const finalStatus = ordinaryExecutionComplete
      ? 'succeeded'
      : statuses.includes('failed')
        ? 'failed'
        : statuses.includes('blocked')
          ? 'blocked'
          : statuses.includes('cancelled')
            ? 'cancelled'
            : statuses.includes('waiting')
              ? 'waiting'
            : 'failed';
    if (finalStatus === 'waiting') return this.#result(runIdentity, 'waiting', states);
    this.#append(`run.${finalStatus}` as LifecycleEvent['type'], { runId });
    return this.#result(runIdentity, finalStatus, states);
  }
}
