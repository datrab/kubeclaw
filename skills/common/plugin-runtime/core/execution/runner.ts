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
  StageResult,
} from '../../sdk/src/index.ts';
import type { ActivatedRegistry } from '../registry/activation.ts';
import type { GrantedRegistry } from '../registry/capabilities.ts';
import { validateReferencedValue } from '../registry/schema.ts';
import type { AdapterRuntime } from './adapters.ts';
import { createPluginInvocationContext } from './context.ts';
import { ExecutionGraph } from './graph.ts';
import { RevocableLease } from './lease.ts';
import { applyStageResult, type StageRuntimeState } from '../lifecycle/reducer.ts';
import { FileJournal } from '../state/journal.ts';

export interface PipelineRunResult {
  readonly runId: string;
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
  readonly signal?: AbortSignal;
  readonly now?: () => Date;
}

export class PipelineRunner {
  readonly #options: PipelineRunnerOptions;
  readonly #graph: ExecutionGraph;
  readonly #now: () => Date;

  constructor(options: PipelineRunnerOptions) {
    this.#options = options;
    this.#graph = new ExecutionGraph(options.definition.stages);
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

  #append(
    type: LifecycleEvent['type'],
    identity: LifecycleEvent['identity'],
    payload: Readonly<Record<string, unknown>> = {},
    causationId: string | null = null,
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
    const attempt: AttemptIdentity = {
      runId,
      stageId: definition.id,
      attemptId: `attempt:${crypto.randomUUID()}`,
      attemptNumber,
    };
    const registrationId = `${owner.package.manifest.id}:${owner.registration.id}`;
    const leaseContract: InvocationLease = {
      schemaVersion: 'invocation-lease.v2',
      leaseId: `lease:${crypto.randomUUID()}`,
      attempt,
      registration: owner.provenance,
      status: 'active',
      grants: [...(this.#options.registry.grants.get(registrationId) ?? [])],
      limits: {
        wallTimeMs: definition.execution.timeoutMs,
        memoryBytes: 512 * 1024 * 1024,
        cpuMillis: definition.execution.timeoutMs,
      },
      issuedAt: this.#now().toISOString(),
      expiresAt: new Date(this.#now().getTime() + definition.execution.timeoutMs).toISOString(),
    };
    const lease = new RevocableLease(leaseContract, this.#now);
    const controller = new AbortController();
    const cancel = () => controller.abort(this.#options.signal?.reason);
    this.#options.signal?.addEventListener('abort', cancel, { once: true });
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
      { attemptNumber },
    );
    this.#append('attempt.dispatched', { runId, stageId: definition.id, attemptId: attempt.attemptId });
    let result: StageResult;
    let timeoutHandle: NodeJS.Timeout | undefined;
    try {
      result = await Promise.race([
        activated.execute(definition.input, context) as Promise<StageResult>,
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
      this.#append('attempt.completed', { runId, stageId: definition.id, attemptId: attempt.attemptId }, { outcome: result.outcome });
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
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
      this.#options.signal?.removeEventListener('abort', cancel);
      controller.abort(new Error('PLUGIN_ATTEMPT_COMPLETED'));
      lease.revoke({ code: 'core.attempt_completed' }, this.#now());
    }
    return {
      ...applyStageResult(definition, { ...state, status: 'running', attemptNumber }, result),
      result,
    };
  }

  async run(runId = `run:${crypto.randomUUID()}`): Promise<PipelineRunResult> {
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
      this.#append('run.resumed', { runId });
    } else {
      this.#append('run.created', { runId });
      this.#append('run.started', { runId });
    }
    const forced: string[] = [];
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
        return { runId, status: 'cancelled', stages: new Map(states) };
      }
      const completed = new Set([...states].filter(([, state]) => state.status === 'succeeded').map(([id]) => id));
      const active = new Set([...states].filter(([, state]) => !['pending', 'succeeded'].includes(state.status)).map(([id]) => id));
      const ready = forced.length > 0
        ? [this.#graph.stage(forced.shift()!)]
        : this.#graph.ready(completed, active);
      if (ready.length === 0) break;
      const batch = ready.slice(0, this.#options.definition.maxConcurrency);
      const decisions = await Promise.all(batch.map(async (definition) => {
        const current = states.get(definition.id)!;
        states.set(definition.id, { ...current, status: 'running' });
        this.#append('stage.started', { runId, stageId: definition.id });
        const decision = await this.#executeStage(
          runId,
          current,
          this.#options.resumeGuidance?.get(definition.id),
        );
        return { definition, decision };
      }));
      for (const { definition, decision } of decisions) {
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
        if (decision.action.type === 'schedule_attempt') {
          states.set(definition.id, { ...decision.state, status: 'pending' });
          this.#append('stage.retrying', { runId, stageId: definition.id }, {
            attemptsUsed: decision.state.attemptsUsed,
            remediationCyclesUsed: decision.state.remediationCyclesUsed,
          });
          forced.push(definition.id);
        } else if (decision.action.type === 'schedule_remediation') {
          this.#append('stage.waiting', { runId, stageId: definition.id }, {
            attemptsUsed: decision.state.attemptsUsed,
            remediationCyclesUsed: decision.state.remediationCyclesUsed,
            remediationStageId: decision.action.stageId,
          });
          states.set(decision.action.stageId, {
            ...states.get(decision.action.stageId)!,
            status: 'pending',
          });
          forced.push(decision.action.stageId, definition.id);
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
          return { runId, status: 'waiting', stages: new Map(states) };
        } else if (
          decision.action.type === 'persist_wait'
          || decision.action.type === 'pause_for_orchestrator'
          || decision.action.type === 'cooldown'
        ) {
          this.#append('stage.waiting', { runId, stageId: definition.id }, {
            attemptsUsed: decision.state.attemptsUsed,
            remediationCyclesUsed: decision.state.remediationCyclesUsed,
            ...('wait' in decision.action ? { wait: decision.action.wait } : {}),
            ...(decision.action.type === 'cooldown' ? { retryAt: decision.action.retryAt } : {}),
          });
          return { runId, status: 'waiting', stages: new Map(states) };
        } else if (decision.action.type === 'stop') {
          const status = decision.state.status === 'blocked' ? 'blocked'
            : decision.state.status === 'cancelled' ? 'cancelled'
              : 'failed';
          this.#append(`stage.${status}` as LifecycleEvent['type'], { runId, stageId: definition.id }, {
            attemptsUsed: decision.state.attemptsUsed,
            remediationCyclesUsed: decision.state.remediationCyclesUsed,
          });
          this.#append(`run.${status}` as LifecycleEvent['type'], { runId });
          return { runId, status, stages: new Map(states) };
        } else {
          this.#append('stage.succeeded', { runId, stageId: definition.id }, {
            attemptsUsed: decision.state.attemptsUsed,
            remediationCyclesUsed: decision.state.remediationCyclesUsed,
          });
        }
      }
    }
    const succeeded = [...states.values()].every((state) => state.status === 'succeeded');
    this.#append(succeeded ? 'run.succeeded' : 'run.failed', { runId });
    return { runId, status: succeeded ? 'succeeded' : 'failed', stages: new Map(states) };
  }
}
