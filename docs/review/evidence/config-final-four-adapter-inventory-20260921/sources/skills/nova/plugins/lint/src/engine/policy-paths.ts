import fs from 'node:fs';
import path from 'node:path';
import { requireRepositoryPath, requireRepositoryTree } from './paths.ts';
import { fail } from './policy-validation.ts';

function validateKubernetesPaths(projectRoot: string, project: Record<string, any>): void {
  if (project.kubernetes.raw_manifests.length + project.kubernetes.helm_charts.length > project.kubernetes.limits.max_files) fail('policy project kubernetes', 'declared inputs exceed max_files');
  validateRawManifests(projectRoot, project);
  validateHelmCharts(projectRoot, project);
  if (project.kubernetes.schema_location !== null) {
    const schemaRoot = project.kubernetes.schema_location.split('{{', 1)[0].replace(/[\\/]$/u, '');
    if (!schemaRoot || !fs.existsSync(schemaRoot) || !fs.statSync(schemaRoot).isDirectory()) fail('policy project kubernetes schema_location', `local schema directory does not exist: ${schemaRoot}`);
  }
}

function validateRawManifests(projectRoot: string, project: Record<string, any>): void {
  const realProjectRoot = fs.realpathSync(projectRoot);
  for (const manifest of project.kubernetes.raw_manifests) {
    const absolute = path.resolve(projectRoot, manifest);
    const relative = path.relative(projectRoot, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) fail('policy project kubernetes raw manifest', `escapes project root: ${manifest}`);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) fail('policy project kubernetes raw manifest', `does not exist: ${manifest}`);
    const real = fs.realpathSync(absolute);
    const realRelative = path.relative(realProjectRoot, real);
    if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) fail('policy project kubernetes raw manifest', `symlink escapes project root: ${manifest}`);
    if (fs.statSync(absolute).size > project.kubernetes.limits.max_file_bytes) fail('policy project kubernetes raw manifest', `exceeds max_file_bytes: ${manifest}`);
  }
}

function validateHelmCharts(projectRoot: string, project: Record<string, any>): void {
  const realProjectRoot = fs.realpathSync(projectRoot);
  for (const chart of project.kubernetes.helm_charts) {
    const absolute = path.resolve(projectRoot, chart);
    const relative = path.relative(projectRoot, absolute);
    if (relative.startsWith('..') || path.isAbsolute(relative)) fail('policy project kubernetes Helm chart', `escapes project root: ${chart}`);
    if (!fs.existsSync(path.join(absolute, 'Chart.yaml'))) fail('policy project kubernetes Helm chart', `Chart.yaml does not exist: ${chart}`);
    const real = fs.realpathSync(absolute);
    const realRelative = path.relative(realProjectRoot, real);
    if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) fail('policy project kubernetes Helm chart', `symlink escapes project root: ${chart}`);
  }
}

function validateToolTargets(repoRoot: string, projectRoot: string, policy: Record<string, any>): void {
  const visited = new Set<string>();
  for (const tool of policy.tools) {
    for (const target of tool.targets) {
      const absolute = requireRepositoryPath(projectRoot, path.resolve(projectRoot, target));
      // Discovery exclusions are not a security boundary: native tsconfig,
      // Terraform and Helm traversals can still include excluded source paths.
      requireRepositoryTree(repoRoot, absolute, (file) => path.basename(file) === '.git', visited);
      const relative = path.relative(projectRoot, absolute);
      if (relative.startsWith('..') || path.isAbsolute(relative)) fail(`policy.tools.${tool.id}.targets`, `escapes project root: ${target}`);
      if (!fs.existsSync(absolute)) fail(`policy.tools.${tool.id}.targets`, `does not exist: ${target}`);
    }
  }
}

export function validatePolicyTargetPaths(repoRoot: string, policy: Record<string, any>, project: Record<string, any>): void {
  const projectRoot = requireRepositoryPath(repoRoot, path.resolve(repoRoot, project.root));
  for (const module of project.go.modules) {
    const absolute = requireRepositoryPath(repoRoot, path.resolve(projectRoot, module.mod_file));
    if (!fs.existsSync(absolute)) fail('policy project go module', `does not exist: ${module.mod_file}`);
  }
  for (const root of project.terraform.roots) {
    const absolute = requireRepositoryPath(repoRoot, path.resolve(projectRoot, root));
    if (!fs.existsSync(absolute)) fail('policy project terraform root', `does not exist: ${root}`);
  }
  validateKubernetesPaths(projectRoot, project);
  validateToolTargets(repoRoot, projectRoot, policy);
  for (const layer of policy.architecture.layers) {
    for (const root of layer.roots) {
      if (!fs.existsSync(requireRepositoryPath(repoRoot, path.resolve(projectRoot, root)))) fail(`policy.architecture.layers.${layer.id}.roots`, `does not exist: ${root}`);
    }
  }
}
