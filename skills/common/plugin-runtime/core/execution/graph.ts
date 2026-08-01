import crypto from 'node:crypto';
import type { PipelineDefinition, StageDefinition } from '../../sdk/src/index.ts';
import { FrozenMap } from '../registry/frozen-map.ts';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}

function frozenStage(stage: StageDefinition): StageDefinition {
  return deepFreeze(structuredClone(stage));
}

export interface ExecutionGraphSnapshot {
  readonly schemaVersion: 'execution-graph-snapshot.v2';
  readonly pipelineId: string;
  readonly maxConcurrency: number;
  readonly nodes: readonly StageDefinition[];
  readonly ordinaryEdges: readonly Readonly<{
    readonly from: string;
    readonly to: string;
  }>[];
  readonly remediationEdges: readonly Readonly<{
    readonly from: string;
    readonly to: string;
  }>[];
  readonly digest: string;
}

export class ExecutionGraph {
  readonly #stages: ReadonlyMap<string, StageDefinition>;
  readonly #dependents: ReadonlyMap<string, readonly string[]>;
  readonly #ordinaryEdges: readonly Readonly<{ readonly from: string; readonly to: string }>[];
  readonly #remediationEdges: readonly Readonly<{ readonly from: string; readonly to: string }>[];
  readonly #remediationOnlyTargets: ReadonlySet<string>;

  constructor(stages: readonly StageDefinition[]) {
    const byId = new Map<string, StageDefinition>();
    for (const candidate of stages) {
      const stage = frozenStage(candidate);
      if (byId.has(stage.id)) throw new Error(`GRAPH_DUPLICATE_STAGE:${stage.id}`);
      if (!Number.isInteger(stage.execution.maxAttempts) || stage.execution.maxAttempts < 1) {
        throw new Error(`GRAPH_ATTEMPT_BUDGET_INVALID:${stage.id}`);
      }
      if (
        !Number.isInteger(stage.execution.maxRemediationCycles)
        || stage.execution.maxRemediationCycles < 0
      ) {
        throw new Error(`GRAPH_REMEDIATION_BUDGET_INVALID:${stage.id}`);
      }
      if (!Number.isInteger(stage.execution.timeoutMs) || stage.execution.timeoutMs < 1) {
        throw new Error(`GRAPH_TIMEOUT_INVALID:${stage.id}`);
      }
      if (
        stage.execution.orchestratorAfterAttempt !== undefined
        && (
          !Number.isInteger(stage.execution.orchestratorAfterAttempt)
          || stage.execution.orchestratorAfterAttempt < 1
          || stage.execution.orchestratorAfterAttempt >= stage.execution.maxAttempts
        )
      ) {
        throw new Error(`GRAPH_ORCHESTRATOR_THRESHOLD_INVALID:${stage.id}`);
      }
      byId.set(stage.id, stage);
    }
    if (byId.size === 0) throw new Error('GRAPH_EMPTY');
    const dependents = new Map<string, string[]>();
    const remediationRequesterByTarget = new Map<string, string>();
    const ordinaryEdges: Array<Readonly<{ from: string; to: string }>> = [];
    const remediationEdges: Array<Readonly<{ from: string; to: string }>> = [];
    for (const stage of byId.values()) {
      if (new Set(stage.dependsOn).size !== stage.dependsOn.length) {
        throw new Error(`GRAPH_DUPLICATE_DEPENDENCY:${stage.id}`);
      }
      for (const dependency of stage.dependsOn) {
        if (!byId.has(dependency)) throw new Error(`GRAPH_DEPENDENCY_MISSING:${stage.id}:${dependency}`);
        if (dependency === stage.id) throw new Error(`GRAPH_SELF_DEPENDENCY:${stage.id}`);
        dependents.set(dependency, [...(dependents.get(dependency) ?? []), stage.id]);
        ordinaryEdges.push(Object.freeze({ from: dependency, to: stage.id }));
      }
      if (stage.activation) {
        if (!byId.has(stage.activation.sourceStage)) {
          throw new Error(
            `GRAPH_ACTIVATION_SOURCE_MISSING:${stage.id}:${stage.activation.sourceStage}`,
          );
        }
        if (stage.activation.sourceStage === stage.id) {
          throw new Error(`GRAPH_SELF_ACTIVATION:${stage.id}`);
        }
      }
      const remediation = stage.on?.request_fix;
      if (remediation !== undefined && !byId.has(remediation)) {
        throw new Error(`GRAPH_REMEDIATION_MISSING:${stage.id}:${remediation}`);
      }
      if (remediation === stage.id) {
        throw new Error(`GRAPH_SELF_REMEDIATION:${stage.id}`);
      }
      if (remediation !== undefined) {
        const existingRequester = remediationRequesterByTarget.get(remediation);
        if (existingRequester) {
          throw new Error(
            `GRAPH_SHARED_REMEDIATION_TARGET:${remediation}:${existingRequester}:${stage.id}`,
          );
        }
        remediationRequesterByTarget.set(remediation, stage.id);
        remediationEdges.push(Object.freeze({ from: stage.id, to: remediation }));
      }
    }
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string): void => {
      if (visiting.has(id)) throw new Error(`GRAPH_CYCLE:${id}`);
      if (visited.has(id)) return;
      visiting.add(id);
      for (const dependency of byId.get(id)?.dependsOn ?? []) visit(dependency);
      visiting.delete(id);
      visited.add(id);
    };
    for (const id of byId.keys()) visit(id);
    const transitivelyDependsOn = (
      stageId: string,
      possibleAncestor: string,
      seen = new Set<string>(),
    ): boolean => {
      if (seen.has(stageId)) return false;
      seen.add(stageId);
      return (byId.get(stageId)?.dependsOn ?? []).some((dependency) =>
        dependency === possibleAncestor
        || transitivelyDependsOn(dependency, possibleAncestor, seen));
    };
    for (const { from: requester, to: target } of remediationEdges) {
      if (
        requester !== target
        && !byId.get(target)?.dependsOn.includes(requester)
        && !transitivelyDependsOn(requester, target)
      ) {
        throw new Error(`GRAPH_REMEDIATION_TARGET_UNORDERED:${requester}:${target}`);
      }
      for (const prerequisite of byId.get(target)?.dependsOn ?? []) {
        if (
          prerequisite !== requester
          && transitivelyDependsOn(prerequisite, requester)
        ) {
          throw new Error(
            `GRAPH_REMEDIATION_PREREQUISITE_DEADLOCK:${requester}:${target}:${prerequisite}`,
          );
        }
      }
    }
    for (const stage of byId.values()) {
      if (
        stage.activation
        && !transitivelyDependsOn(stage.id, stage.activation.sourceStage)
      ) {
        throw new Error(
          `GRAPH_ACTIVATION_SOURCE_NOT_ANCESTOR:${stage.id}:${stage.activation.sourceStage}`,
        );
      }
      if (stage.activation && remediationRequesterByTarget.has(stage.id)) {
        throw new Error(`GRAPH_ACTIVATION_ON_REMEDIATION_TARGET:${stage.id}`);
      }
    }
    this.#remediationOnlyTargets = new Set(
      remediationEdges
        .filter(({ from, to }) => byId.get(to)?.dependsOn.includes(from))
        .map(({ to }) => to),
    );
    for (const target of this.#remediationOnlyTargets) {
      const downstream = dependents.get(target) ?? [];
      if (downstream.length > 0) {
        throw new Error(
          `GRAPH_REMEDIATION_TARGET_NOT_LEAF:${target}:${[...downstream].sort().join(',')}`,
        );
      }
    }
    this.#stages = new FrozenMap([...byId].sort(([left], [right]) => left.localeCompare(right)));
    this.#dependents = new FrozenMap(
      [...dependents]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([id, values]) => [id, Object.freeze([...values].sort())]),
    );
    this.#ordinaryEdges = Object.freeze(
      ordinaryEdges.sort((left, right) =>
        left.from.localeCompare(right.from) || left.to.localeCompare(right.to)),
    );
    this.#remediationEdges = Object.freeze(
      remediationEdges.sort((left, right) =>
        left.from.localeCompare(right.from) || left.to.localeCompare(right.to)),
    );
    Object.freeze(this);
  }

  static fromDefinition(definition: PipelineDefinition): ExecutionGraph {
    if (!Number.isInteger(definition.maxConcurrency) || definition.maxConcurrency < 1) {
      throw new Error('GRAPH_CONCURRENCY_INVALID');
    }
    return new ExecutionGraph(definition.stages);
  }

  stage(id: string): StageDefinition {
    const stage = this.#stages.get(id);
    if (!stage) throw new Error(`GRAPH_STAGE_MISSING:${id}`);
    return stage;
  }

  stages(): readonly StageDefinition[] {
    return Object.freeze([...this.#stages.values()]);
  }

  dependents(id: string): readonly string[] {
    return this.#dependents.get(id) ?? Object.freeze([]);
  }

  ordinaryEdges(): ExecutionGraphSnapshot['ordinaryEdges'] {
    return this.#ordinaryEdges;
  }

  remediationEdges(): ExecutionGraphSnapshot['remediationEdges'] {
    return this.#remediationEdges;
  }

  isRemediationOnlyTarget(id: string): boolean {
    return this.#remediationOnlyTargets.has(id);
  }

  activation(id: string): StageDefinition['activation'] {
    return this.stage(id).activation;
  }

  snapshot(pipelineId: string, maxConcurrency: number): ExecutionGraphSnapshot {
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) {
      throw new Error('GRAPH_CONCURRENCY_INVALID');
    }
    const content = {
      schemaVersion: 'execution-graph-snapshot.v2' as const,
      pipelineId,
      maxConcurrency,
      nodes: this.stages(),
      ordinaryEdges: this.#ordinaryEdges,
      remediationEdges: this.#remediationEdges,
    };
    const digest = `sha256:${crypto.createHash('sha256').update(canonical(content)).digest('hex')}`;
    return deepFreeze({ ...content, digest });
  }

  ready(completed: ReadonlySet<string>, active: ReadonlySet<string>): readonly StageDefinition[] {
    return Object.freeze(
      [...this.#stages.values()]
        .filter((stage) => !completed.has(stage.id) && !active.has(stage.id))
        .filter((stage) => !this.#remediationOnlyTargets.has(stage.id))
        .filter((stage) => stage.dependsOn.every((dependency) => completed.has(dependency)))
        .sort((left, right) => left.id.localeCompare(right.id)),
    );
  }
}
