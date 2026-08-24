import fs from 'node:fs';
import path from 'node:path';

import type { PipelineLintDeclaration } from '../../../skills/nova/core/test-gates/types.ts';

function readJson(file: string): Record<string, any> {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, any>;
}

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeRunLintPolicy(
  repositoryRoot: string,
  stateRoot: string,
  declaration: PipelineLintDeclaration,
): string {
  const source = path.join(repositoryRoot, 'charts/kubeclaw/files/config');
  const target = path.join(stateRoot, 'lint-config');
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(source, target, { recursive: true });
  const policyPath = path.join(target, 'lint-policy.json');
  const policy = readJson(policyPath);
  const languages = [...(declaration.helmCharts.length > 0 ? ['helm'] : []), 'yaml'];
  policy.baseline_path = 'lint-baseline.json';
  writeJson(path.join(target, 'lint-baseline.json'), {
    schema_version: 'pipeline_lint_baseline.v2', groups: [],
  });
  policy.projects = [{
    id: declaration.policyProject,
    root: '.',
    discovery_max_depth: 20,
    languages,
    language_evidence: Object.fromEntries(languages.map((language) => [language,
      language === 'helm' ? declaration.helmCharts.map((chart) => `${chart}/Chart.yaml`) : declaration.rawManifests])),
    go: { modules: [] },
    terraform: { roots: [] },
    kubernetes: {
      raw_manifests: declaration.rawManifests,
      helm_charts: declaration.helmCharts,
      policy_packs: ['kubeclaw-default'],
      kubernetes_version: '1.35.6',
      schema_location: '/opt/kubeclaw-kubernetes-schemas/v1.35.6-standalone-strict/{{.ResourceKind}}{{.KindSuffix}}.json',
      limits: { max_files: 128, max_file_bytes: 1_048_576, max_rendered_bytes: 10_485_760, max_documents: 2048 },
    },
  }];
  policy.architecture = { layers: [{ id: 'project', roots: ['.'], may_depend_on: ['project'] }] };
  policy.tools = policy.tools.map((tool: Record<string, any>) => {
    if (['kubernetes-schema', 'kubernetes-policy'].includes(tool.id)) {
      return { ...tool, languages: ['helm', 'yaml'], targets: ['.'], config_path: null };
    }
    if (tool.id === 'kubeconform') return { ...tool, languages: ['helm'], targets: ['.'], config_path: null };
    if (tool.id === 'yamllint') return { ...tool, languages: ['yaml'], targets: ['.'], config_path: '.yamllint.yml' };
    if (tool.id === 'dependency-cruiser') return { ...tool, languages: ['javascript'], targets: ['.'], config_path: null };
    return { ...tool, languages: ['javascript'], targets: [], config_path: null,
      ...(['go-vet', 'go-imports', 'staticcheck', 'govulncheck'].includes(tool.id) ? { arguments: [] } : {}) };
  });
  writeJson(policyPath, policy);
  return policyPath;
}
