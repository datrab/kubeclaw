import { canonicalJson, PORTABLE_JSON_ENCODING, sha256Text, type StageDefinition } from '@kubeclaw/plugin-sdk';
import { assertProjectReviewModes, projectReviewConfig, type ProjectReviewSemanticMode } from './review-semantics.ts';
import { assertCoveragePlan, coverageReviewPrefixes, coverageReviewRequirements, gateCoverageDigest,
  validatePipelineTestGateContract, type GateCoverageV1, type ResolvedTestPlanV1 } from '@kubeclaw/pipeline-test-gate-contract';
import { assertProjectDeliveryManifestMode, DELIVERY_MANIFEST_ENCODING,
  type ProjectDeliveryManifestMode } from './delivery-manifest.ts';

type ObjectValue = Record<string, any>;
const compare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

export function projectCoverage(projectId: string, baseRevision: string, modules: readonly ObjectValue[],
  test: ObjectValue, integrationRequirements: unknown[] = [], kind: 'module' | 'cumulative' = 'module'): GateCoverageV1 {
  const unsigned = { schemaVersion: 'gate-coverage.v1' as const, projectId, kind, baseRevision,
    modules: modules.map(module => ({ moduleId: module.id, ownedPaths: [...module.ownedPaths].sort(),
      requirements: [...module.requirements].sort((a, b) => compare(String(a.id), String(b.id))) }))
      .sort((a, b) => compare(a.moduleId, b.moduleId)),
    integrationRequirements, requiredChecks: test.requiredChecks,
  };
  const coverage = { ...unsigned, policyDigest: gateCoverageDigest(unsigned as Omit<GateCoverageV1, 'policyDigest'>) };
  validatePipelineTestGateContract('gateCoverage', coverage);
  assertCoveragePlan(test.providerPlan.plan as ResolvedTestPlanV1, coverage as GateCoverageV1);
  return coverage as GateCoverageV1;
}

export function testConfiguration(test: ObjectValue) {
  if (test.testAgentEnabled !== undefined && typeof test.testAgentEnabled !== 'boolean') throw new Error('PROJECT_TEST_AGENT_INVALID');
  const agent = test.agent ?? 'buster';
  if (typeof agent !== 'string' || !agent.trim()) throw new Error('PROJECT_TEST_AGENT_INVALID');
  return { agent, testAgentEnabled: test.testAgentEnabled !== false,
    ...(test.agentRole === undefined ? {} : { agentRole: test.agentRole }) };
}

export function cumulativeStages(project: ObjectValue, modules: readonly ObjectValue[], sourceStageId: string,
  reportArtifactEncoding: 'legacy' | typeof PORTABLE_JSON_ENCODING = 'legacy',
  reviewSemanticMode: ProjectReviewSemanticMode = 'legacy',
  deliveryManifestEncoding: ProjectDeliveryManifestMode = 'legacy'): StageDefinition[] {
  // Historical archived compilers call this current helper without a fourth arg.
  assertProjectReviewModes(reportArtifactEncoding, reviewSemanticMode);
  assertProjectDeliveryManifestMode(deliveryManifestEncoding);
  const final = project.final;
  const coverage = projectCoverage(project.id, project.baseRevision, modules, final.test, final.integrationRequirements, 'cumulative');
  const plan = final.test.providerPlan.plan as ResolvedTestPlanV1;
  if (plan.scope.gateId !== 'final-test' || plan.scope.moduleId !== null || plan.runId !== project.runId) throw new Error('PROJECT_FINAL_PLAN_SCOPE_MISMATCH');
  const execution = { maxAttempts: 2, maxRemediationCycles: 0, maxTechnicalRetries: 1, timeoutMs: 1_800_000 };
  const stages: StageDefinition[] = [{ id: 'final-lint', type: 'kubeclaw.lint.full',
    dependsOn: modules.map(module => `test-${module.id}`), config: final.lint,
    input: { workingDirectory: project.repositoryRoot, project: project.id, sourceStageId }, execution }];
  if (final.review) stages.push({ id: 'final-review', type: 'kubeclaw.decision.review', dependsOn: ['final-lint'],
    config: projectReviewConfig(final.review, reportArtifactEncoding, reviewSemanticMode),
    input: { task: { id: 'final', statement: 'Review the integrated project against every declared requirement.' },
      revisions: { sourceStageId, base: project.baseRevision },
      scope: { allowedPrefixes: coverageReviewPrefixes(coverage), ownershipPrefixes: coverageReviewPrefixes(coverage) },
      requirements: coverageReviewRequirements(coverage), evidence: [{ kind: 'gate-coverage', digest: sha256Text(canonicalJson(coverage)), content: coverage }], contextCandidates: [] }, execution });
  stages.push({ id: 'final-test', type: 'kubeclaw.test.quality-evaluation', dependsOn: [final.review ? 'final-review' : 'final-lint'],
    config: testConfiguration(final.test), input: { gateId: 'final-test', task: 'Test the complete integrated project, including declared interactions.',
      expectedCoverage: coverage, providerPlan: { ...final.test.providerPlan, repositoryRoot: project.repositoryRoot, sourceStageId } }, execution });
  stages.push({ id: 'project-summary', type: 'kubeclaw.report.project-summary', dependsOn: ['final-test'],
    config: deliveryManifestEncoding === 'legacy' ? {} : { deliveryManifestEncoding: DELIVERY_MANIFEST_ENCODING }, input: {
    projectId: project.id, modules: modules.map(module => ({ moduleId: module.id, sourceStageId: `implement-${module.id}`,
      testStageId: `test-${module.id}`, expectedCoverage: projectCoverage(project.id, project.baseRevision, [module], module.test) })),
    final: { sourceStageId, lintStageId: 'final-lint', ...(final.review ? { reviewStageId: 'final-review' } : {}),
      ...(deliveryManifestEncoding !== 'legacy' && final.review && reportArtifactEncoding !== 'legacy'
        ? { reviewArtifactEncoding: reportArtifactEncoding } : {}),
      ...(final.review && reviewSemanticMode !== 'legacy' ? { reviewSemanticEncoding: reviewSemanticMode } : {}),
      testStageId: 'final-test', expectedCoverage: coverage },
  }, execution });
  return stages;
}
