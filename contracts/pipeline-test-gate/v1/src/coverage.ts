import { remotePlanDigest } from './digest.ts';
import type { ResolvedTestPlanV1 } from './types.ts';

export interface CoverageRequirementV1 { readonly id: string; readonly statement: string }
export interface CoverageRequirementRefV1 { readonly moduleId: string | null; readonly requirementId: string }
/** Product policy, declared independently of selected suites and available providers. */
export interface GateCoverageV1 {
  readonly schemaVersion: 'gate-coverage.v1';
  readonly projectId: string;
  readonly kind: 'module' | 'cumulative';
  readonly baseRevision: string;
  readonly modules: readonly { readonly moduleId: string; readonly ownedPaths: readonly string[]; readonly requirements: readonly CoverageRequirementV1[] }[];
  readonly integrationRequirements: readonly CoverageRequirementV1[];
  readonly requiredChecks: readonly {
    readonly checkId: string;
    readonly requirementRefs: readonly CoverageRequirementRefV1[];
    /** Pre-expansion declaration IDs. Every resolved matrix variation is required. */
    readonly nodeIds: readonly string[];
  }[];
  readonly policyDigest: string;
}

export interface ResolvedGateCoverageV1 {
  readonly policy: GateCoverageV1;
  /** Original declarations removed by explicit suite selection exclusions. */
  readonly excludedNodeIds: readonly string[];
}

export function gateCoverageDigest(value: Omit<GateCoverageV1, 'policyDigest'>): string {
  return remotePlanDigest(value);
}

function unique(values: readonly string[], label: string, errors: string[]): void {
  if (new Set(values).size !== values.length) errors.push(`COVERAGE_DUPLICATE:${label}`);
}

function referenceKey(value: CoverageRequirementRefV1): string {
  return JSON.stringify([value.moduleId, value.requirementId]);
}

export function gateCoverageErrors(policy: GateCoverageV1): string[] {
  const errors: string[] = [];
  const { policyDigest, ...unsigned } = policy;
  if (gateCoverageDigest(unsigned) !== policyDigest) errors.push('COVERAGE_POLICY_DIGEST_MISMATCH');
  unique(policy.modules.map(item => item.moduleId), 'modules', errors);
  unique(policy.requiredChecks.map(item => item.checkId), 'checks', errors);
  if (policy.kind === 'module' && (policy.modules.length !== 1 || policy.integrationRequirements.length)) {
    errors.push('COVERAGE_MODULE_SCOPE_INVALID');
  }
  const requirements = policy.modules.flatMap(module => module.requirements.map(requirement =>
    referenceKey({ moduleId: module.moduleId, requirementId: requirement.id })));
  requirements.push(...policy.integrationRequirements.map(requirement => referenceKey({ moduleId: null, requirementId: requirement.id })));
  unique(requirements, 'requirements', errors);
  const expected = new Set(requirements);
  const covered = new Set<string>();
  for (const check of policy.requiredChecks) {
    unique(check.nodeIds, `nodes:${check.checkId}`, errors);
    unique(check.requirementRefs.map(referenceKey), `references:${check.checkId}`, errors);
    for (const reference of check.requirementRefs) {
      const key = referenceKey(reference);
      if (!expected.has(key)) errors.push(`COVERAGE_REQUIREMENT_UNKNOWN:${key}`);
      covered.add(key);
    }
  }
  for (const key of expected) if (!covered.has(key)) errors.push(`COVERAGE_REQUIREMENT_UNMAPPED:${key}`);
  return errors;
}

export function coverageNodeMatches(declarationId: string, nodeId: string, matrixVariation = true): boolean {
  return nodeId === declarationId || (matrixVariation && nodeId.startsWith(`${declarationId}/matrix-`)
    && /^\d{3,}$/u.test(nodeId.slice(`${declarationId}/matrix-`.length)));
}

export function resolvedCoverageErrors(plan: ResolvedTestPlanV1): string[] {
  if (!plan.coverage) return [];
  const { policy, excludedNodeIds } = plan.coverage;
  const errors = gateCoverageErrors(policy);
  if (policy.projectId !== plan.project) errors.push('COVERAGE_PROJECT_MISMATCH');
  if (policy.kind === 'module' ? policy.modules[0]?.moduleId !== plan.scope.moduleId || plan.scope.gateId !== null
    : plan.scope.moduleId !== null || plan.scope.gateId === null) errors.push('COVERAGE_SCOPE_MISMATCH');
  unique(excludedNodeIds, 'excluded', errors);
  for (const excluded of excludedNodeIds) {
    if (plan.nodes.some(node => coverageNodeMatches(excluded, node.id, Object.keys(node.variation).length > 0))) errors.push(`COVERAGE_EXCLUDED_NODE_PRESENT:${excluded}`);
  }
  return errors;
}

export type CoverageCheckState = 'ready' | 'passed' | 'failed' | 'missing' | 'excluded' | 'skipped' | 'advisory';
export interface CoverageCheckStatusV1 {
  readonly checkId: string;
  readonly declarationId: string;
  readonly nodeId: string | null;
  readonly state: CoverageCheckState;
}

/** No state is inferred from a suite count. A required declaration expands to every actual node. */
export function coverageCheckStatuses(plan: ResolvedTestPlanV1,
  outcomes?: ReadonlyMap<string, { readonly effect: string }>): CoverageCheckStatusV1[] {
  if (!plan.coverage) return [];
  return plan.coverage.policy.requiredChecks.flatMap(check => check.nodeIds.flatMap<CoverageCheckStatusV1>(declarationId => {
    const nodes = plan.nodes.filter(node => coverageNodeMatches(declarationId, node.id, Object.keys(node.variation).length > 0));
    if (!nodes.length) return [{ checkId: check.checkId, declarationId, nodeId: null,
      state: plan.coverage!.excludedNodeIds.includes(declarationId) ? 'excluded' as const : 'missing' as const }];
    return nodes.map(node => {
      const effect = outcomes?.get(node.id)?.effect;
      const state: CoverageCheckState = node.kind !== 'test' ? 'missing' : node.mode !== 'blocking' ? 'advisory'
        : node.skipReason !== null || effect === 'skipped' ? 'skipped'
          : outcomes === undefined ? 'ready' : effect === 'passed' ? 'passed' : 'failed';
      return { checkId: check.checkId, declarationId, nodeId: node.id, state };
    });
  }));
}
