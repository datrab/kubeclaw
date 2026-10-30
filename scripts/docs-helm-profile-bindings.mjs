// Explicit current values-file routes. These are Source declarations, not proof
// that materialization, Helm, Argo reconciliation or a rollout was executed.
const release = (role, chartRoot, overlayEnvironment) => Object.freeze({
  chartRoot, role, kind: 'generated-release-base',
  semanticSource: `my-values/${role}-values.yaml`,
  producer: {path: 'scripts/updates/materialize-release.mjs', line: 32, endLine: 51,
    authority: 'The selected release materializer reads the corresponding my-values profile, replaces selected image/code-bundle authorities, and writes this generated values base; operators do not edit it.'},
  selector: {path: 'scripts/deploy.sh', line: role === 'prism' ? 101 : role === 'prism-agent' ? 103 : 1290,
    authority: `The ${role} deploy/export path selects this release base before the optional ${overlayEnvironment} values file and later generated overrides.`},
  precedence: `Chart defaults → selected releases/values/${role}.yaml → optional ${overlayEnvironment} values → later generated --values/--set overrides; only supplied paths participate.`,
});
const production = (role, chartRoot, overlayEnvironment) => Object.freeze({
  chartRoot, role, kind: 'production-values-overlay',
  semanticSource: `my-values/${role}-values.yaml`,
  producer: {path: 'gitops/production/config.json', line: {buster: 7, nova: 8, prism: 9}[role],
    authority: 'The checked-in production config selects this overlay; it is authored values, not a generated release base.'},
  selector: {path: 'scripts/gitops-continuous.mjs', line: 78,
    authority: `exportContinuousBundle resolves this configured overlay into ${overlayEnvironment} for bundle export; scripts/deploy.sh applies it after the selected ${role} release base, before generated overrides.`},
  precedence: `Chart defaults → selected releases/values/${role}.yaml → this configured ${overlayEnvironment} overlay → later generated overrides. This declaration does not prove a bundle export or live deployment.`,
});
export const helmProfileBindings = Object.freeze({
  'releases/values/nova.yaml': release('nova', 'charts/kubeclaw', 'NOVA_VALUES_FILE'),
  'releases/values/buster.yaml': release('buster', 'charts/kubeclaw', 'BUSTER_VALUES_FILE'),
  'releases/values/prism-agent.yaml': release('prism-agent', 'charts/kubeclaw', 'PRISM_AGENT_VALUES_FILE'),
  'releases/values/prism.yaml': release('prism', 'charts/prism', 'PRISM_VALUES_FILE'),
  'gitops/production/overlays/nova-ax41.yaml': production('nova', 'charts/kubeclaw', 'NOVA_VALUES_FILE'),
  'gitops/production/overlays/buster-ax41.yaml': production('buster', 'charts/kubeclaw', 'BUSTER_VALUES_FILE'),
  'gitops/production/overlays/prism-ax41.yaml': production('prism', 'charts/prism', 'PRISM_VALUES_FILE'),
});
export const helmProfileBinding = sourcePath => helmProfileBindings[sourcePath] ?? null;
