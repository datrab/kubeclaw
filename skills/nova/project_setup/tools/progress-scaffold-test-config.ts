import fs from 'node:fs';
import path from 'node:path';
import { diagnostic, isPlainObject, objectOrEmpty } from './progress-scaffold-values.ts';
import type { Context, Diagnostic } from './progress-scaffold-values.ts';

const VALID_PREVIEW = new Set(['off', 'tailscale-ingress']);
const VALID_CLEANUP = new Set(['delete', 'keep']);

function safeRelativePath(relativePath: string) {
  return !relativePath.includes('\0')
    && !/[\r\n]/.test(relativePath)
    && !path.isAbsolute(relativePath)
    && !relativePath.split(/[\\/]+/).includes('..');
}

function validateRepoPath(context: Context, value: unknown, diagnostics: Diagnostic[], field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    diagnostics.push(diagnostic('form_check', `${field} must be a non-empty string`, field));
    return false;
  }
  if (!safeRelativePath(value)) {
    diagnostics.push(diagnostic('form_check', `${field} must be a safe relative path`, field));
    return false;
  }
  const resolved = path.resolve(context.repoRoot, value);
  if (!resolved.startsWith(`${context.repoRoot}${path.sep}`) && resolved !== context.repoRoot) {
    diagnostics.push(diagnostic('form_check', `${field} must stay inside repository root`, field));
    return false;
  }
  return true;
}

export function requireExistingSwarmFile(context: Context, value: unknown, diagnostics: Diagnostic[], field: string) {
  if (typeof value !== 'string' || !value.trim()) {
    diagnostics.push(diagnostic('form_check', `${field} must be a non-empty string`, field));
    return;
  }
  if (!safeRelativePath(value)) {
    diagnostics.push(diagnostic('form_check', `${field} must be a safe relative path`, field));
    return;
  }
  const resolved = path.resolve(context.swarmDir, value);
  if (!resolved.startsWith(`${context.swarmDir}${path.sep}`) && resolved !== context.swarmDir) {
    diagnostics.push(diagnostic('form_check', `${field} must stay inside .swarm`, field));
  } else if (!fs.existsSync(resolved)) {
    diagnostics.push(diagnostic('strict_content_check', `${field} does not exist: ${value}`, field));
  }
}

function validateServe(config: any, context: Context, diagnostics: Diagnostic[], field: string) {
  if (!config.serve) return;
  if (typeof config.serve.project_dir !== 'string') diagnostics.push(diagnostic('form_check', `${field}.serve.project_dir must be a string`, `${field}.serve.project_dir`));
  if (typeof config.serve.start_cmd !== 'string' && typeof config.serve.build_cmd !== 'string') {
    diagnostics.push(diagnostic('form_check', `${field}.serve needs start_cmd or build_cmd`, `${field}.serve`));
  }
  if (config.serve.port !== undefined && (!Number.isInteger(config.serve.port) || config.serve.port <= 0)) {
    diagnostics.push(diagnostic('form_check', `${field}.serve.port must be a positive integer`, `${field}.serve.port`));
  }
  if (config.serve.dockerfile) validateRepoPath(context, config.serve.dockerfile, diagnostics, `${field}.serve.dockerfile`);
}

function validateK8s(config: any, context: Context, diagnostics: Diagnostic[], field: string) {
  const k8s = objectOrEmpty(config.k8s);
  validateRepoPath(context, k8s.dockerfile, diagnostics, `${field}.k8s.dockerfile`);
  if (!Array.isArray(k8s.manifests) || k8s.manifests.length === 0) {
    diagnostics.push(diagnostic('form_check', `${field}.k8s.manifests must be a non-empty array`, `${field}.k8s.manifests`));
  } else {
    k8s.manifests.forEach((manifest: any) => validateRepoPath(context, manifest, diagnostics, `${field}.k8s.manifests`));
  }
  if (!k8s.image_name) diagnostics.push(diagnostic('form_check', `${field}.k8s.image_name is required`, `${field}.k8s.image_name`));
  if (!k8s.service_name) diagnostics.push(diagnostic('form_check', `${field}.k8s.service_name is required`, `${field}.k8s.service_name`));
  if (k8s.cleanup_policy && !VALID_CLEANUP.has(k8s.cleanup_policy)) {
    diagnostics.push(diagnostic('form_check', `${field}.k8s.cleanup_policy must be delete or keep`, `${field}.k8s.cleanup_policy`));
  }
  if (k8s.preview?.provider && !VALID_PREVIEW.has(k8s.preview.provider)) {
    diagnostics.push(diagnostic('form_check', `${field}.k8s.preview.provider must be off or tailscale-ingress`, `${field}.k8s.preview.provider`));
  }
}

function validateApiAndVisual(config: any, suites: string[], context: Context, diagnostics: Diagnostic[], field: string) {
  if (suites.includes('api')) requireExistingSwarmFile(context, config.api?.spec_file, diagnostics, `${field}.api.spec_file`);
  if (!suites.includes('visual-reg')) return;
  const visual = config['visual-reg'];
  if (isPlainObject(visual) && visual.path !== undefined) {
    diagnostics.push(diagnostic('form_check', `${field}.visual-reg.path is removed; use paths_file`, `${field}.visual-reg.path`));
  }
  requireExistingSwarmFile(context, visual?.paths_file, diagnostics, `${field}.visual-reg.paths_file`);
}

function validateLocalSuites(config: any, suites: string[], context: Context, diagnostics: Diagnostic[], field: string) {
  if (suites.includes('unit') && typeof config.unit?.test_cmd !== 'string') {
    diagnostics.push(diagnostic('form_check', `${field}.unit.test_cmd must be a string`, `${field}.unit.test_cmd`));
  }
  validateServe(config, context, diagnostics, field);
  if (suites.includes('manifest')) validateRepoPath(context, config.manifest?.deployment_yaml, diagnostics, `${field}.manifest.deployment_yaml`);
  if (suites.includes('k8s')) validateK8s(config, context, diagnostics, field);
}

export function validateTestConfig(
  testConfig: unknown,
  suites: unknown,
  context: Context,
  diagnostics: Diagnostic[],
  field: string,
) {
  if (!Array.isArray(suites) || suites.length === 0) return;
  if (!isPlainObject(testConfig)) {
    diagnostics.push(diagnostic('form_check', `${field} must be an object when test_suites are configured`, field));
    return;
  }
  validateApiAndVisual(testConfig, suites, context, diagnostics, field);
  validateLocalSuites(testConfig, suites, context, diagnostics, field);
}
