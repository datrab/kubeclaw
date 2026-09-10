import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseRuntimeDispatchProfile, type RuntimeDispatchProfile, type LifecycleEvent, type PipelineDefinition, type PluginDomainEvent } from '@kubeclaw/plugin-sdk';
import type { ActivatedRegistry } from '@kubeclaw/plugin-foundation/registry/activation';
import type { GrantedRegistry } from '@kubeclaw/plugin-foundation/registry/capabilities';
import { validateReferencedValue } from '@kubeclaw/plugin-foundation/registry/schema';
import type { StageRuntimeState } from '../lifecycle/reducer.ts';
import type { FileJournal } from '../state/journal.ts';
import { FrozenMap } from '@kubeclaw/plugin-foundation/registry/frozen-map';
import type { AdapterRuntime } from './adapters.ts';
import { ExecutionGraph, type ExecutionGraphSnapshot } from './graph.ts';
import { PipelineLoop } from './pipeline-loop.ts';
import { StageExecutor } from './stage-executor.ts';
import { ArtifactCheckpointRecorder } from './artifact-checkpoints.ts';

export interface PipelineRunIdentity { readonly runId: string; readonly pipelineId: string; readonly graphDigest: string }
export interface PipelineRunResult {
  readonly runId: string; readonly identity: PipelineRunIdentity;
  readonly status: 'succeeded' | 'failed' | 'blocked' | 'waiting' | 'cancelled'; readonly stages: ReadonlyMap<string, StageRuntimeState>;
}
export interface PipelineRunnerOptions {
  readonly runtimeDispatchProfile?: RuntimeDispatchProfile | undefined;
  readonly graphSnapshotVersion?: ExecutionGraphSnapshot['schemaVersion'];
  readonly definition: PipelineDefinition; readonly registry: GrantedRegistry; readonly activated: ActivatedRegistry; readonly adapters: AdapterRuntime;
  readonly journal: FileJournal<LifecycleEvent | PluginDomainEvent>; readonly initialStates?: ReadonlyMap<string, StageRuntimeState>;
  readonly resumeGuidance?: ReadonlyMap<string, Readonly<Record<string, unknown>>>; readonly orchestratorIssuerId: string;
  readonly resume?: boolean; readonly resumePayload?: Readonly<Record<string, unknown>>; readonly resumeCausationId?: string;
  readonly resumeEventAlreadyRecorded?: boolean; readonly administrativeAttemptOverrides?: ReadonlySet<string>; readonly signal?: AbortSignal;
  readonly now?: () => Date; readonly onEventsCommitted?: () => Promise<void>;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}

export function validatePipelineDefinitionAgainstRegistry(definition: PipelineDefinition, registry: GrantedRegistry): void {
  ExecutionGraph.fromDefinition(definition);
  for (const stage of definition.stages) {
    const owner = registry.snapshot.stages.get(stage.type); if (!owner) throw new Error(`PIPELINE_STAGE_OWNER_MISSING:${stage.type}`);
    validateReferencedValue(fs.realpathSync(path.join(owner.package.root, owner.registration.configSchema)), stage.config, registry.snapshot.schemas);
    validateReferencedValue(fs.realpathSync(path.join(owner.package.root, owner.registration.inputSchema)), stage.input, registry.snapshot.schemas);
  }
}

export class PipelineRunner {
  readonly #options: PipelineRunnerOptions; readonly #graph: ExecutionGraph; readonly #snapshot: ExecutionGraphSnapshot; readonly #now: () => Date;
  constructor(options: PipelineRunnerOptions) {
    this.#options = options.runtimeDispatchProfile === undefined ? options : {
      ...options, runtimeDispatchProfile: parseRuntimeDispatchProfile(options.runtimeDispatchProfile),
    }; validatePipelineDefinitionAgainstRegistry(options.definition, options.registry);
    this.#graph = ExecutionGraph.fromDefinition(options.definition); this.#snapshot = this.#graph.snapshot(options.definition.id, options.definition.maxConcurrency, options.graphSnapshotVersion);
    this.#now = options.now ?? (() => new Date());
  }
  graphSnapshot(): ExecutionGraphSnapshot { return this.#snapshot; }
  async run(runId = `run:${crypto.randomUUID()}`): Promise<PipelineRunResult> {
    const identity = Object.freeze({ runId, pipelineId: this.#snapshot.pipelineId, graphDigest: this.#snapshot.digest });
    const append = (type: LifecycleEvent['type'], eventIdentity: LifecycleEvent['identity'], payload: Readonly<Record<string, unknown>> = {}, causationId: string | null = this.#options.resumeCausationId ?? null): LifecycleEvent => {
      return this.#options.journal.appendSequenced((sequence): LifecycleEvent => ({ schemaVersion: 'lifecycle-event.v2', eventId: `event:${crypto.randomUUID()}`, sequence,
        type, identity: eventIdentity, occurredAt: this.#now().toISOString(), causationId, payload })).entry;
    };
    const checkpoints = new ArtifactCheckpointRecorder(this.#options.journal, append);
    const executor = new StageExecutor({ graph: this.#graph, registry: this.#options.registry, activated: this.#options.activated,
      adapters: this.#options.adapters, journal: this.#options.journal, checkpoints,
      ...(this.#options.runtimeDispatchProfile ? { runtimeDispatchProfile: this.#options.runtimeDispatchProfile } : {}),
      ...(this.#options.signal ? { signal: this.#options.signal } : {}), now: this.#now, append });
    const loop = new PipelineLoop({ options: this.#options, graph: this.#graph, maxConcurrency: this.#options.definition.maxConcurrency,
      overrides: new Set(this.#options.administrativeAttemptOverrides), append, checkpoints,
      flush: async () => this.#options.onEventsCommitted?.(), executor,
      result: (runIdentity, status, states) => Object.freeze({ runId: runIdentity.runId, identity: runIdentity, status,
        stages: new FrozenMap([...states].map(([stageId, state]) => [stageId, deepFreeze(structuredClone(state))])) }),
    });
    return loop.run(identity);
  }
}
