import type { StageDefinition } from '@kubeclaw/plugin-sdk';
import { validateRepairBudgets } from './graph-repair-budget.ts';

type Edge = Readonly<{ from: string; to: string }>;
export interface BuiltGraph { readonly stages: Map<string, StageDefinition>; readonly dependents: Map<string, string[]>; readonly ordinaryEdges: Edge[]; readonly remediationEdges: Edge[]; readonly remediationOnly: Set<string>; }
function freeze<T>(value: T): T { if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value; for (const nested of Object.values(value as Record<string, unknown>)) freeze(nested); return Object.freeze(value); }

function validateExecution(stage: StageDefinition): void {
  const execution = stage.execution;
  if (!Number.isInteger(execution.maxAttempts) || execution.maxAttempts < 1) throw new Error(`GRAPH_ATTEMPT_BUDGET_INVALID:${stage.id}`);
  if (!Number.isInteger(execution.maxRemediationCycles) || execution.maxRemediationCycles < 0) throw new Error(`GRAPH_REMEDIATION_BUDGET_INVALID:${stage.id}`);
  if (!Number.isInteger(execution.timeoutMs) || execution.timeoutMs < 1) throw new Error(`GRAPH_TIMEOUT_INVALID:${stage.id}`);
  const threshold = execution.orchestratorAfterAttempt;
  if (threshold !== undefined && (!Number.isInteger(threshold) || threshold < 1 || threshold >= execution.maxAttempts)) throw new Error(`GRAPH_ORCHESTRATOR_THRESHOLD_INVALID:${stage.id}`);
}

function stagesById(stages: readonly StageDefinition[]): Map<string, StageDefinition> {
  const result = new Map<string, StageDefinition>();
  for (const candidate of stages) {
    const stage = freeze(structuredClone(candidate));
    if (result.has(stage.id)) throw new Error(`GRAPH_DUPLICATE_STAGE:${stage.id}`);
    validateExecution(stage); result.set(stage.id, stage);
  }
  if (result.size === 0) throw new Error('GRAPH_EMPTY');
  return result;
}

function addDependencies(stage: StageDefinition, stages: ReadonlyMap<string, StageDefinition>, dependents: Map<string, string[]>, edges: Edge[]): void {
  if (new Set(stage.dependsOn).size !== stage.dependsOn.length) throw new Error(`GRAPH_DUPLICATE_DEPENDENCY:${stage.id}`);
  for (const dependency of stage.dependsOn) {
    if (!stages.has(dependency)) throw new Error(`GRAPH_DEPENDENCY_MISSING:${stage.id}:${dependency}`);
    if (dependency === stage.id) throw new Error(`GRAPH_SELF_DEPENDENCY:${stage.id}`);
    dependents.set(dependency, [...(dependents.get(dependency) ?? []), stage.id]); edges.push(Object.freeze({ from: dependency, to: stage.id }));
  }
}

function addRemediation(stage: StageDefinition, stages: ReadonlyMap<string, StageDefinition>, requesters: Map<string, string>, edges: Edge[]): void {
  if (stage.activation && !stages.has(stage.activation.sourceStage)) throw new Error(`GRAPH_ACTIVATION_SOURCE_MISSING:${stage.id}:${stage.activation.sourceStage}`);
  if (stage.activation?.sourceStage === stage.id) throw new Error(`GRAPH_SELF_ACTIVATION:${stage.id}`);
  const target = stage.on?.request_fix;
  if (target !== undefined && !stages.has(target)) throw new Error(`GRAPH_REMEDIATION_MISSING:${stage.id}:${target}`);
  if (target === stage.id) throw new Error(`GRAPH_SELF_REMEDIATION:${stage.id}`);
  if (target === undefined) return;
  requesters.set(target, stage.id); edges.push(Object.freeze({ from: stage.id, to: target }));
}

function assertAcyclic(stages: ReadonlyMap<string, StageDefinition>): void {
  const visiting = new Set<string>(); const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error(`GRAPH_CYCLE:${id}`); if (visited.has(id)) return;
    visiting.add(id); for (const dependency of stages.get(id)?.dependsOn ?? []) visit(dependency);
    visiting.delete(id); visited.add(id);
  };
  for (const id of stages.keys()) visit(id);
}

function ancestry(stages: ReadonlyMap<string, StageDefinition>): (stage: string, ancestor: string, seen?: Set<string>) => boolean {
  const depends = (stage: string, ancestor: string, seen = new Set<string>()): boolean => {
    if (seen.has(stage)) return false; seen.add(stage);
    return (stages.get(stage)?.dependsOn ?? []).some((dependency) => dependency === ancestor || depends(dependency, ancestor, seen));
  };
  return depends;
}

function validateRemediation(stages: ReadonlyMap<string, StageDefinition>, edges: readonly Edge[], depends: ReturnType<typeof ancestry>): void {
  for (const left of edges) for (const right of edges) assertOrderedRequesters(left, right, depends);
  for (const { from, to } of edges) {
    if (from !== to && !stages.get(to)?.dependsOn.includes(from) && !depends(from, to)) throw new Error(`GRAPH_REMEDIATION_TARGET_UNORDERED:${from}:${to}`);
    for (const prerequisite of stages.get(to)?.dependsOn ?? []) {
      if (prerequisite !== from && depends(prerequisite, from)) throw new Error(`GRAPH_REMEDIATION_PREREQUISITE_DEADLOCK:${from}:${to}:${prerequisite}`);
    }
  }
}

function assertOrderedRequesters(left: Edge, right: Edge, depends: ReturnType<typeof ancestry>): void {
  if (left.to === right.to && left.from !== right.from && !depends(left.from, right.from) && !depends(right.from, left.from)) {
    throw new Error(`GRAPH_SHARED_REMEDIATION_TARGET:${left.to}:${left.from}:${right.from}`);
  }
}

function validateActivations(stages: ReadonlyMap<string, StageDefinition>, requesters: ReadonlyMap<string, string>, depends: ReturnType<typeof ancestry>): void {
  for (const stage of stages.values()) {
    if (stage.activation && !depends(stage.id, stage.activation.sourceStage)) throw new Error(`GRAPH_ACTIVATION_SOURCE_NOT_ANCESTOR:${stage.id}:${stage.activation.sourceStage}`);
    if (stage.activation && requesters.has(stage.id)) throw new Error(`GRAPH_ACTIVATION_ON_REMEDIATION_TARGET:${stage.id}`);
  }
}

export function buildGraph(input: readonly StageDefinition[]): BuiltGraph {
  const stages = stagesById(input); const dependents = new Map<string, string[]>(); const requesters = new Map<string, string>();
  validateRepairBudgets(stages);
  const ordinaryEdges: Edge[] = []; const remediationEdges: Edge[] = [];
  for (const stage of stages.values()) { addDependencies(stage, stages, dependents, ordinaryEdges); addRemediation(stage, stages, requesters, remediationEdges); }
  assertAcyclic(stages); const depends = ancestry(stages); validateRemediation(stages, remediationEdges, depends); validateActivations(stages, requesters, depends);
  const remediationOnly = new Set(remediationEdges.filter(({ from, to }) => stages.get(to)?.dependsOn.includes(from)).map(({ to }) => to));
  for (const target of remediationOnly) { const downstream = dependents.get(target) ?? []; if (downstream.length > 0) throw new Error(`GRAPH_REMEDIATION_TARGET_NOT_LEAF:${target}:${[...downstream].sort().join(',')}`); }
  return { stages, dependents, ordinaryEdges, remediationEdges, remediationOnly };
}
