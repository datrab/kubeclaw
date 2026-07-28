import type { StageDefinition } from '../../sdk/src/index.ts';

export class ExecutionGraph {
  readonly #stages: ReadonlyMap<string, StageDefinition>;
  readonly #dependents: ReadonlyMap<string, readonly string[]>;

  constructor(stages: readonly StageDefinition[]) {
    const byId = new Map<string, StageDefinition>();
    for (const stage of stages) {
      if (byId.has(stage.id)) throw new Error(`GRAPH_DUPLICATE_STAGE:${stage.id}`);
      byId.set(stage.id, Object.freeze(stage));
    }
    const dependents = new Map<string, string[]>();
    for (const stage of stages) {
      for (const dependency of stage.dependsOn) {
        if (!byId.has(dependency)) throw new Error(`GRAPH_DEPENDENCY_MISSING:${stage.id}:${dependency}`);
        if (dependency === stage.id) throw new Error(`GRAPH_SELF_DEPENDENCY:${stage.id}`);
        dependents.set(dependency, [...(dependents.get(dependency) ?? []), stage.id]);
      }
      const remediation = stage.on?.request_fix;
      if (remediation !== undefined && !byId.has(remediation)) {
        throw new Error(`GRAPH_REMEDIATION_MISSING:${stage.id}:${remediation}`);
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
    this.#stages = new Map(byId);
    this.#dependents = new Map(
      [...dependents].map(([id, values]) => [id, Object.freeze([...values].sort())]),
    );
    Object.freeze(this);
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

  ready(completed: ReadonlySet<string>, active: ReadonlySet<string>): readonly StageDefinition[] {
    return Object.freeze(
      [...this.#stages.values()]
        .filter((stage) => !completed.has(stage.id) && !active.has(stage.id))
        .filter((stage) => stage.dependsOn.every((dependency) => completed.has(dependency)))
        .sort((left, right) => left.id.localeCompare(right.id)),
    );
  }
}
