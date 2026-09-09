import { gateCoverageDigest, validatePipelineTestGateContract } from '@kubeclaw/pipeline-test-gate-contract';

// Policy is authored from the actual nginx verifier and required final checks,
// independently of whichever declarations remain in a generated plan.
const moduleRequirements = Object.freeze({
  '01-nginx': 'Nginx listens on 8080 and provides the declared static document root and fallback routes.',
  '02-nginx': 'The content branch contains its declared marker, HTML shape and ownership boundaries.',
  '03-nginx': 'The asset branch contains its declared style, source marker and ownership boundaries.',
  '04-nginx': 'The immutable runtime packages foundation and source files and composes the declared content and asset surfaces.',
});
const finalRequirements = Object.freeze({
  'size-budget': 'The assembled project stays within the declared artifact byte budget.',
  'container-build': 'The assembled project builds the selected immutable deployment image.',
  'checked-manifest': 'The checked deployment manifest is provided to the deployment and policy consumers.',
  health: 'The deployed internal endpoint returns the expected application marker.',
  'api-flow': 'The deployed application satisfies the declared API flow.',
  openapi: 'The deployed application satisfies the declared OpenAPI operation.',
  axe: 'The deployed application meets the selected accessibility checks.',
  performance: 'The deployed application meets the declared performance budget.',
  visual: 'The deployed application matches the declared visual baseline.',
  playwright: 'The deployed application passes its original browser interaction checks.',
  'security-headers': 'The deployed endpoint meets the configured response-header policy.',
  'dependency-security': 'The integrated dependency tree passes the selected vulnerability policy.',
  'image-security': 'The exact deployment image passes the selected image vulnerability policy.',
  'kubernetes-policy-security': 'The checked manifest passes the selected Kubernetes policy.',
  'kubernetes-runtime-security': 'The deployed workload passes the selected runtime policy.',
  'public-http-health': 'The transferred public endpoint serves the expected application marker.',
});

export function fixtureCoverage(projectId, baseRevision, modules, kind) {
  if (!/^[a-f0-9]{40}([a-f0-9]{24})?$/u.test(baseRevision)) throw new Error('REAL_E2E_COVERAGE_BASE_REQUIRED');
  const selected = modules.map(({ moduleId, ownedPaths }) => {
    if (!moduleRequirements[moduleId]) throw new Error(`REAL_E2E_COVERAGE_MODULE_UNSUPPORTED:${moduleId}`);
    return { moduleId, ownedPaths, requirements: [
      { id: 'module-contract', statement: moduleRequirements[moduleId] },
      ...(kind === 'module' ? [
        { id: 'dependency-policy', statement: 'The project dependency tree passes the declared vulnerability policy.' },
        { id: 'artifact-budget', statement: 'The project stays within the declared artifact byte budget.' },
        { id: 'registry-health', statement: 'The configured registry version endpoint is reachable and authorized.' },
      ] : []),
    ] };
  });
  const requiredChecks = selected.map(module => ({ checkId: `contract-${module.moduleId}`,
    requirementRefs: [{ moduleId: module.moduleId, requirementId: 'module-contract' }],
    nodeIds: [kind === 'module' ? 'unit/command' : `unit/command-${module.moduleId}`] }));
  const integrationRequirements = kind === 'cumulative'
    ? Object.entries(finalRequirements).map(([id, statement]) => ({ id, statement })) : [];
  if (kind === 'module') {
    for (const [requirementId, nodeId] of [['dependency-policy', 'dependency-security'], ['artifact-budget', 'size-budget'], ['registry-health', 'health']]) {
      requiredChecks.push({ checkId: requirementId, requirementRefs: [{ moduleId: selected[0].moduleId, requirementId }], nodeIds: [nodeId] });
    }
  } else {
    for (const { id } of integrationRequirements) requiredChecks.push({ checkId: id,
      requirementRefs: [{ moduleId: null, requirementId: id }], nodeIds: [id] });
  }
  const unsigned = { schemaVersion: 'gate-coverage.v1', projectId, kind, baseRevision,
    modules: selected, integrationRequirements, requiredChecks };
  const coverage = { ...unsigned, policyDigest: gateCoverageDigest(unsigned) };
  validatePipelineTestGateContract('gateCoverage', coverage);
  return coverage;
}
