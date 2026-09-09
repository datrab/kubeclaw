import crypto from 'node:crypto';
import { portableJson, type PipelineDefinition, type StageDefinition } from '@kubeclaw/plugin-sdk';
import { FrozenMap } from '@kubeclaw/plugin-foundation/registry/frozen-map';
import { buildGraph } from './graph-build.ts';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
function deepFreeze<T>(value: T): T { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested); return Object.freeze(value); }

export interface ExecutionGraphSnapshot {
  readonly schemaVersion: 'execution-graph-snapshot.v2' | 'execution-graph-snapshot.v3'; readonly pipelineId: string; readonly maxConcurrency: number;
  readonly nodes: readonly StageDefinition[]; readonly ordinaryEdges: readonly Readonly<{ readonly from: string; readonly to: string }>[];
  readonly remediationEdges: readonly Readonly<{ readonly from: string; readonly to: string }>[]; readonly digest: string;
}

export class ExecutionGraph {
  readonly #stages: ReadonlyMap<string, StageDefinition>; readonly #dependents: ReadonlyMap<string, readonly string[]>;
  readonly #ordinaryEdges: ExecutionGraphSnapshot['ordinaryEdges']; readonly #remediationEdges: ExecutionGraphSnapshot['remediationEdges'];
  readonly #remediationOnlyTargets: ReadonlySet<string>;
  constructor(stages: readonly StageDefinition[]) {
    const built = buildGraph(stages);
    this.#remediationOnlyTargets = built.remediationOnly;
    this.#stages = new FrozenMap([...built.stages].sort(([left], [right]) => left.localeCompare(right)));
    this.#dependents = new FrozenMap([...built.dependents].sort(([left], [right]) => left.localeCompare(right)).map(([id, values]) => [id, Object.freeze([...values].sort())]));
    this.#ordinaryEdges = Object.freeze(built.ordinaryEdges.sort((left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to)));
    this.#remediationEdges = Object.freeze(built.remediationEdges.sort((left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to)));
    Object.freeze(this);
  }
  static fromDefinition(definition: PipelineDefinition): ExecutionGraph { if (!Number.isInteger(definition.maxConcurrency) || definition.maxConcurrency < 1) throw new Error('GRAPH_CONCURRENCY_INVALID'); return new ExecutionGraph(definition.stages); }
  stage(id: string): StageDefinition { const stage = this.#stages.get(id); if (!stage) throw new Error(`GRAPH_STAGE_MISSING:${id}`); return stage; }
  stages(): readonly StageDefinition[] { return Object.freeze([...this.#stages.values()]); }
  dependents(id: string): readonly string[] { return this.#dependents.get(id) ?? Object.freeze([]); }
  ordinaryEdges(): ExecutionGraphSnapshot['ordinaryEdges'] { return this.#ordinaryEdges; }
  remediationEdges(): ExecutionGraphSnapshot['remediationEdges'] { return this.#remediationEdges; }
  isRemediationOnlyTarget(id: string): boolean { return this.#remediationOnlyTargets.has(id); }
  activation(id: string): StageDefinition['activation'] { return this.stage(id).activation; }
  snapshot(pipelineId: string, maxConcurrency: number, version: ExecutionGraphSnapshot['schemaVersion'] = 'execution-graph-snapshot.v3'): ExecutionGraphSnapshot {
    if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1) throw new Error('GRAPH_CONCURRENCY_INVALID');
    if (!['execution-graph-snapshot.v2', 'execution-graph-snapshot.v3'].includes(version)) throw new Error('GRAPH_SNAPSHOT_VERSION_INVALID');
    const portable = version === 'execution-graph-snapshot.v3';
    const compare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
    const edges = (entries: ExecutionGraphSnapshot['ordinaryEdges']) => portable
      ? [...entries].sort((left, right) => compare(left.from, right.from) || compare(left.to, right.to)) : entries;
    const content = { schemaVersion: version, pipelineId, maxConcurrency,
      nodes: portable ? [...this.stages()].sort((left, right) => compare(left.id, right.id)) : this.stages(),
      ordinaryEdges: edges(this.#ordinaryEdges), remediationEdges: edges(this.#remediationEdges) };
    return deepFreeze({ ...content, digest: `sha256:${crypto.createHash('sha256').update(portable ? portableJson(content) : canonical(content)).digest('hex')}` });
  }
  ready(completed: ReadonlySet<string>, active: ReadonlySet<string>): readonly StageDefinition[] {
    return Object.freeze([...this.#stages.values()].filter((stage) => !completed.has(stage.id) && !active.has(stage.id)).filter((stage) => !this.#remediationOnlyTargets.has(stage.id)).filter((stage) => stage.dependsOn.every((dependency) => completed.has(dependency))).sort((left, right) => left.id.localeCompare(right.id)));
  }
}
