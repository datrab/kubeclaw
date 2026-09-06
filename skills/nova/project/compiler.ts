import path from 'node:path';
import { canonicalJson, sha256Text, type PipelineDefinition, type StageDefinition } from '@kubeclaw/plugin-sdk';
import { validateContractValue } from '@kubeclaw/plugin-foundation/registry/schema';
import { validatePipelineTestGateContract, resolvedTestPlanDigest, type ResolvedTestPlanV1 } from '@kubeclaw/pipeline-test-gate-contract';

type ObjectValue = Record<string, any>;
function object(value: unknown, fields: string[], label: string): ObjectValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).some(key => !fields.includes(key))) throw new Error(`PROJECT_OBJECT_INVALID:${label}`);
  return value as ObjectValue;
}
function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`PROJECT_TEXT_REQUIRED:${label}`);
  return value;
}
function id(value: unknown): string {
  const result = text(value, 'id');
  if (!/^[a-z][a-z0-9-]{0,47}$/u.test(result)) throw new Error(`PROJECT_ID_INVALID:${result}`);
  return result;
}
function absolute(value: unknown, label: string): string {
  const result = text(value, label);
  if (!path.isAbsolute(result) || path.normalize(result) !== result) throw new Error(`PROJECT_ABSOLUTE_PATH_REQUIRED:${label}`);
  return result;
}
function strings(value: unknown, label: string, allowEmpty = false): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)
    || value.some(item => typeof item !== 'string' || !item.trim()) || new Set(value).size !== value.length) throw new Error(`PROJECT_LIST_INVALID:${label}`);
  return [...value];
}
function relative(value: string): string {
  if (path.posix.isAbsolute(value) || value.includes('\\') || value.split('/').some(part => !part || part === '.' || part === '..')) throw new Error(`PROJECT_OWNERSHIP_INVALID:${value}`);
  return value;
}
function agent(value: unknown): ObjectValue {
  const config = object(value, ['agent', 'agentRole'], 'agent');
  text(config.agent, 'agent');
  if (config.agentRole !== undefined) text(config.agentRole, 'agentRole');
  return config;
}

/** Product-owned compiler; the lifecycle core remains independent of stage names.
 * A project is a single repository publication lane. Explicit pipeline graphs
 * retain their existing concurrency semantics.
 */
export function compileProject(value: unknown): { runId: string; definition: PipelineDefinition } {
  const project = object(value, ['schemaVersion', 'id', 'runId', 'repositoryRoot', 'workspaceRoot', 'baseRevision', 'modules'], 'project');
  if (project.schemaVersion !== 'nova-project.v1') throw new Error('PROJECT_SCHEMA_UNSUPPORTED');
  const projectId = id(project.id);
  const runId = text(project.runId, 'runId');
  const repository = absolute(project.repositoryRoot, 'repositoryRoot');
  const workspaces = absolute(project.workspaceRoot, 'workspaceRoot');
  if (workspaces === repository || workspaces.startsWith(`${repository}${path.sep}`)) throw new Error('PROJECT_WORKSPACES_INSIDE_REPOSITORY');
  const baseline = text(project.baseRevision, 'baseRevision');
  if (!/^[a-f0-9]{40}$/u.test(baseline)) throw new Error('PROJECT_BASE_REVISION_INVALID');
  if (!Array.isArray(project.modules) || !project.modules.length || project.modules.length > 128) throw new Error('PROJECT_MODULES_INVALID');
  const modules = new Map<string, ObjectValue>();
  const owned: { module: string; prefix: string }[] = [];
  for (const value of project.modules) {
    const module = object(value, ['id', 'dependsOn', 'task', 'ownedPaths', 'requirements', 'implementation', 'lint', 'review', 'test'], 'module');
    const moduleId = id(module.id);
    if (modules.has(moduleId)) throw new Error(`PROJECT_MODULE_DUPLICATE:${moduleId}`);
    text(module.task, 'task');
    strings(module.dependsOn, 'dependsOn', true).forEach(id);
    for (const prefix of strings(module.ownedPaths, 'ownedPaths').map(relative)) {
      if (owned.some(item => prefix === item.prefix || prefix.startsWith(`${item.prefix}/`) || item.prefix.startsWith(`${prefix}/`))) throw new Error(`PROJECT_OWNERSHIP_OVERLAP:${moduleId}:${prefix}`);
      owned.push({ module: moduleId, prefix });
    }
    if (!Array.isArray(module.requirements) || !module.requirements.length) throw new Error(`PROJECT_REQUIREMENTS_REQUIRED:${moduleId}`);
    const requirementIds = new Set<string>();
    for (const requirement of module.requirements) {
      const r = object(requirement, ['id', 'statement'], 'requirement');
      text(r.id, 'requirement.id'); text(r.statement, 'requirement.statement');
      if (requirementIds.has(r.id)) throw new Error('PROJECT_REQUIREMENT_DUPLICATE');
      requirementIds.add(r.id);
    }
    agent(module.implementation);
    object(module.review, ['agent'], 'review'); text(module.review.agent, 'review.agent');
    const lint = object(module.lint, ['policyPath', 'policyProject'], 'lint');
    absolute(lint.policyPath, 'lint.policyPath'); text(lint.policyProject, 'lint.policyProject');
    const test = object(module.test, ['agent', 'agentRole', 'providerPlan'], 'test');
    agent({ agent: test.agent, ...(test.agentRole === undefined ? {} : { agentRole: test.agentRole }) });
    const provider = object(test.providerPlan, ['repositoryId', 'plan', 'grants', 'maximumConcurrency', 'submittedAt', 'timeoutMs'], 'providerPlan');
    validatePipelineTestGateContract('resolvedTestPlan', provider.plan);
    const plan = provider.plan as ResolvedTestPlanV1;
    const { planDigest, ...unsigned } = plan;
    if (resolvedTestPlanDigest(unsigned) !== planDigest) throw new Error('PROJECT_PLAN_DIGEST_MISMATCH');
    if (plan.runId !== runId || plan.project !== projectId || plan.scope.moduleId !== moduleId || plan.scope.gateId !== null) throw new Error(`PROJECT_PLAN_SCOPE_MISMATCH:${moduleId}`);
    if (!plan.nodes.some(node => node.kind === 'test' && node.mode === 'blocking' && node.skipReason === null)) throw new Error(`PROJECT_BLOCKING_TEST_REQUIRED:${moduleId}`);
    modules.set(moduleId, module);
  }
  // Stable topological order, independent of JSON object/array declaration order.
  const ordered: ObjectValue[] = [];
  const remaining = new Set([...modules.keys()].sort());
  for (const module of modules.values()) for (const dependency of module.dependsOn) {
    if (!modules.has(dependency)) throw new Error(`PROJECT_DEPENDENCY_UNKNOWN:${dependency}`);
  }
  while (remaining.size) {
    const next = [...remaining].find(key => modules.get(key)!.dependsOn.every((dependency: string) => !remaining.has(dependency)));
    if (next === undefined) throw new Error('PROJECT_DEPENDENCY_CYCLE');
    ordered.push(modules.get(next)!); remaining.delete(next);
  }
  const stages: StageDefinition[] = [];
  let previousGate: string | undefined;
  const runNamespace = sha256Text(runId).slice(7, 23);
  for (const module of ordered) {
    const implementationId = `implement-${module.id}`;
    const lintId = `lint-${module.id}`;
    const reviewId = `review-${module.id}`;
    const testId = `test-${module.id}`;
    const evidence = { projectId, moduleId: module.id, baseRevision: baseline, requirements: module.requirements };
    const execution = { maxAttempts: 2, maxRemediationCycles: 2, timeoutMs: 1_800_000 };
    stages.push({ id: implementationId, type: 'kubeclaw.agent.implementation',
      dependsOn: [...new Set([...(previousGate ? [previousGate] : []), ...module.dependsOn.map((dependency: string) => `test-${dependency}`)])].sort(),
      config: module.implementation, input: { runId, moduleId: module.id, attempt: 1, headBefore: baseline,
        task: `${module.task}\n\nOwned paths: ${module.ownedPaths.join(', ')}\nRequirements:\n${canonicalJson(module.requirements)}`,
        workspace: { repositoryRoot: repository, workspacePath: path.join(workspaces, runNamespace, module.id),
          branch: `nova/${projectId}/${runNamespace}/${module.id}`, baseRef: 'HEAD', mergeTarget: repository,
          commitMessage: `[forge:${module.id}] ${projectId}` } }, execution });
    stages.push({ id: lintId, type: 'kubeclaw.lint.full', dependsOn: [implementationId], config: module.lint,
      input: { workingDirectory: repository, project: projectId, sourceStageId: implementationId }, execution, on: { request_fix: implementationId } });
    stages.push({ id: reviewId, type: 'kubeclaw.decision.review', dependsOn: [lintId], config: module.review,
      input: { task: { id: module.id, statement: module.task }, revisions: { sourceStageId: implementationId },
        scope: { allowedPrefixes: module.ownedPaths, ownershipPrefixes: module.ownedPaths }, requirements: module.requirements,
        evidence: [{ kind: 'project-requirements', digest: sha256Text(canonicalJson(evidence)), content: evidence }], contextCandidates: [] },
      execution, on: { request_fix: implementationId } });
    stages.push({ id: testId, type: 'kubeclaw.test.quality-evaluation', dependsOn: [reviewId],
      config: { agent: module.test.agent, ...(module.test.agentRole === undefined ? {} : { agentRole: module.test.agentRole }) },
      input: { gateId: testId, task: module.task,
        providerPlan: { ...module.test.providerPlan, repositoryRoot: repository, sourceStageId: implementationId } },
      execution, on: { request_fix: implementationId } });
    previousGate = testId;
  }
  const definition = { schemaVersion: 'pipeline-definition.v2', id: `project:${projectId}`, maxConcurrency: 1, stages } as PipelineDefinition;
  validateContractValue('pipelineDefinition', definition);
  return { runId, definition: structuredClone(definition) };
}
