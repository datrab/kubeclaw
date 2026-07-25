import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// ═══════════════════════════════════════════════════════════════
// Suite: manifest — Kubernetes Manifest Validation
// ═══════════════════════════════════════════════════════════════
//
// KEEP_TYPED_POLICY: envFrom coverage uncertainty avoids false critical
// failures while surfacing findings; evidence-only manifest findings stay PASS
// when manifest.enforced is not set and no blocking threshold is configured.
// DELETE_LEGACY: requested manifest validation requires an existing parseable
// deployment YAML, and secret refs require a present parseable secret YAML.

import fs from 'fs';
import {
  createSuiteVerdict,
  createFinding,
  STATUS,
  SEVERITY,
} from '../services/verdict-schema.ts';
import type { Finding, SuiteVerdict } from '../services/verdict-schema.ts';
import { resolveRepoScopedPath } from './repo-paths.ts';
import {
  createSuiteLog,
  suiteErrorMessage as errorMessage,
  suiteObject as objectRecord,
  suiteObjectOrEmpty as objectRecordOrEmpty,
} from './support.ts';
import { dumpYamlDocuments, extractFromParsedDocs, loadYamlDocuments, parseSecretYaml } from './manifest-parser.ts';
import type { ManifestData, SecretInfo } from './manifest-parser.ts';

export { dumpYamlDocuments, loadYamlDocuments } from './manifest-parser.ts';

type AnyRecord = Record<string, any>;
type LogSink = (entry: Record<string, unknown>) => void;

interface ManifestContext {
  logSink?: LogSink | null;
  config?: {
    manifest?: AnyRecord;
    serve?: AnyRecord;
  };
}

const manifestSuiteState: { logSink: LogSink | null } = { logSink: null };
const log = createSuiteLog('manifest', 'MANIFEST', (entry) => manifestSuiteState.logSink?.(entry));

function checkParseable(data: ManifestData, findings: Finding[]): boolean {
  if (selectTruthyValue(() => (!data), () => (data.workloadCount === 0))) {
    findings.push(createFinding(SEVERITY.CRITICAL, `Deployment YAML invalid or missing supported workload document (got: ${selectDefinedValue(() => (data?.kind), () => ('missing_workload_kind'))})`, { rule: 'yaml-parseable' }));
    return false;
  }
  return true;
}

function checkRequiredEnvVars(data: ManifestData, requiredEnv: unknown, findings: Finding[]): void {
  if (!Array.isArray(requiredEnv) || requiredEnv.length === 0) return;
  const presentNames = new Set(data.env.map((entry) => entry.name));
  const hasEnvFrom = data.envFrom.length > 0;

  for (const required of requiredEnv) {
    if (!presentNames.has(required) && !hasEnvFrom) {
      findings.push(createFinding(SEVERITY.CRITICAL, `Required env var "${required}" not found in container spec (env or envFrom)`, { rule: 'required-env' }));
    } else if (!presentNames.has(required) && hasEnvFrom) {
      findings.push(createFinding(SEVERITY.MODERATE, `Required env var "${required}" not explicitly listed; may be provided via envFrom`, { rule: 'required-env-envfrom' }));
    }
  }
}

function collectSecretRefs(data: ManifestData): Array<{ name: string; key: string }> {
  return data.env
    .map((entry) => entry.valueFrom?.secretKeyRef)
    .filter((ref) => ref?.name && ref?.key)
    .map((ref) => ({ name: String(ref.name), key: String(ref.key) }));
}

function checkSecretRefs(data: ManifestData, secretInfo: SecretInfo | null, findings: Finding[]): void {
  const refs = collectSecretRefs(data);
  if (refs.length === 0) return;

  if (!secretInfo) {
    findings.push(createFinding(SEVERITY.CRITICAL, 'Deployment uses secretKeyRef but manifest.secret_yaml is missing or invalid', { rule: 'secret-yaml-required' }));
    return;
  }

  const secretKeySet = new Set(secretInfo.keys);
  for (const ref of refs) {
    if (ref.name !== secretInfo.name) {
      const secretName = secretInfo.name ? secretInfo.name : '(unnamed)';
      findings.push(createFinding(SEVERITY.CRITICAL, `Secret ref "${ref.name}.${ref.key}" is not covered by manifest.secret_yaml "${secretName}"`, { rule: 'secret-ref' }));
      continue;
    }
    if (!secretKeySet.has(ref.key)) {
      const availableKeys = selectTruthyValue(() => ([...secretKeySet].join(', ')), () => ('none'));
      findings.push(createFinding(SEVERITY.CRITICAL, `Secret ref "${ref.name}.${ref.key}" not found in secret YAML (available: ${availableKeys})`, { rule: 'secret-ref' }));
    }
  }
}

function checkImagePullSecrets(data: ManifestData, privateRegistries: unknown, findings: Finding[]): void {
  if (!Array.isArray(privateRegistries) || privateRegistries.length === 0) return;
  const usesPrivate = data.images.some((image) => privateRegistries.some((registry: unknown) => image.startsWith(String(registry))));
  if (usesPrivate && !data.imagePullSecrets) {
    findings.push(createFinding(SEVERITY.SERIOUS, `Container uses private registry (${privateRegistries.join(', ')}) but imagePullSecrets is not defined`, { rule: 'image-pull-secrets' }));
  }
}

function checkProbes(data: ManifestData, healthPath: unknown, findings: Finding[]): void {
  if (!healthPath) return;
  if (!data.hasReadinessProbe) findings.push(createFinding(SEVERITY.MODERATE, 'App has health_path configured but deployment lacks readinessProbe', { rule: 'readiness-probe' }));
  if (!data.hasLivenessProbe) findings.push(createFinding(SEVERITY.MODERATE, 'App has health_path configured but deployment lacks livenessProbe', { rule: 'liveness-probe' }));
}

function checkResourceLimits(data: ManifestData, findings: Finding[]): void {
  if (!data.hasLimits) findings.push(createFinding(SEVERITY.MINOR, 'No resource limits defined on containers (resources.limits)', { rule: 'resource-limits' }));
}

function hasBlockingFindingSince(findings: Finding[], startIndex: number): boolean {
  return findings.slice(startIndex).some((finding) => selectTruthyValue(() => (finding.severity === SEVERITY.CRITICAL), () => (finding.severity === SEVERITY.SERIOUS)));
}

function configFailure(startTime: number, message: string, rule: string): SuiteVerdict {
  return createSuiteVerdict('manifest', STATUS.FAIL, {
    critical: true,
    duration_ms: Date.now() - startTime,
    checks_total: 1,
    checks_passed: 0,
    checks_failed: 1,
    findings: [createFinding(SEVERITY.CRITICAL, message, { rule })],
    reason: message,
  });
}

function loadDeployment(pathValue: string, startTime: number): ManifestData | SuiteVerdict {
  try {
    const data = extractFromParsedDocs(loadYamlDocuments(fs.readFileSync(pathValue, 'utf8')));
    log(`Loaded deployment YAML: ${pathValue}`);
    return data;
  } catch (error) {
    return createSuiteVerdict('manifest', STATUS.FAIL, {
      critical: true, duration_ms: Date.now() - startTime,
      checks_total: 1, checks_passed: 0, checks_failed: 1,
      findings: [createFinding(SEVERITY.CRITICAL, `Could not parse deployment YAML: ${errorMessage(error)}`, { rule: 'yaml-parseable' })],
    });
  }
}

function loadSecret(pathValue: string | null, findings: Finding[]): SecretInfo | null {
  if (!pathValue) return null;
  if (!fs.existsSync(pathValue)) {
    findings.push(createFinding(SEVERITY.CRITICAL, `Secret YAML not found: ${pathValue}`, { rule: 'secret-yaml' }));
    return null;
  }
  try {
    const secret = parseSecretYaml(fs.readFileSync(pathValue, 'utf8'));
    log(`Loaded secret YAML: ${pathValue} (${secret.keys.length} keys)`);
    return secret;
  } catch (error) {
    findings.push(createFinding(SEVERITY.CRITICAL, `Could not parse secret YAML: ${errorMessage(error)}`, { rule: 'secret-yaml' }));
    return null;
  }
}

function runManifestCheck(findings: Finding[], label: string, check: () => void): number {
  const start = findings.length;
  check();
  if (findings.length === start) log(`${label}: OK ✓`);
  return hasBlockingFindingSince(findings, start) ? 1 : 0;
}

function evaluateManifest(data: ManifestData, secret: SecretInfo | null, config: AnyRecord, healthPath: unknown, findings: Finding[]): { checks: number; failed: number } {
  if (!checkParseable(data, findings)) return { checks: 1, failed: 1 };
  log(`kind: ${data.kind} ✓`);
  let failed = 0;
  failed += runManifestCheck(findings, 'Required env vars', () => checkRequiredEnvVars(data, config.required_env, findings));
  failed += runManifestCheck(findings, 'Secret refs', () => checkSecretRefs(data, secret, findings));
  failed += runManifestCheck(findings, 'imagePullSecrets', () => checkImagePullSecrets(data, config.private_registries, findings));
  failed += runManifestCheck(findings, 'Probes', () => checkProbes(data, healthPath, findings));
  failed += runManifestCheck(findings, 'Resource limits', () => checkResourceLimits(data, findings));
  return { checks: 6, failed };
}

function completedManifestVerdict(startTime: number, config: AnyRecord, deployment: string, data: ManifestData, findings: Finding[], evaluation: { checks: number; failed: number }): SuiteVerdict {
  const thresholds = objectRecord(config.thresholds);
  const enforced = config.enforced === true || thresholds !== null;
  const critical = findings.filter((finding) => finding.severity === SEVERITY.CRITICAL).length;
  const serious = findings.filter((finding) => finding.severity === SEVERITY.SERIOUS).length;
  const exceeds = thresholds !== null && typeof thresholds.max_issues === 'number' && findings.length > thresholds.max_issues;
  const shouldFail = manifestShouldFail(critical > 0, exceeds);
  const failed = Math.min(evaluation.checks, Math.max(evaluation.failed, exceeds ? 1 : 0));
  const metadata = {
    deployment_yaml: deployment, secret_yaml: config.secret_yaml ?? null, images: data.images,
    env_count: data.env.length, workload_count: data.workloadCount, enforced,
  };
  if (!shouldFail) {
    log(`✅ Manifest validation passed (${findings.length} informational finding${findings.length !== 1 ? 's' : ''})`);
    return createSuiteVerdict('manifest', STATUS.PASS, {
      critical: false, duration_ms: Date.now() - startTime, checks_total: evaluation.checks,
      checks_passed: Math.max(0, evaluation.checks - failed), checks_failed: 0, findings, metadata,
    });
  }
  log(`❌ Manifest validation FAIL: ${critical} critical, ${serious} serious, ${findings.length} total`);
  return createSuiteVerdict('manifest', STATUS.FAIL, {
    critical: critical > 0, duration_ms: Date.now() - startTime, checks_total: evaluation.checks,
    checks_passed: Math.max(0, evaluation.checks - failed), checks_failed: Math.max(1, failed), findings, metadata,
  });
}

export default async function manifestSuite(context: ManifestContext): Promise<SuiteVerdict> {
  manifestSuiteState.logSink = typeof context.logSink === 'function' ? context.logSink : null;
  const startTime = Date.now();
  const manifestCfg = objectRecordOrEmpty(context.config?.manifest);
  const deploymentYamlRel = manifestCfg.deployment_yaml;

  if (!deploymentYamlRel) return configFailure(startTime, 'manifest.deployment_yaml is required when the manifest suite is requested', 'manifest-deployment-required');

  const deploymentYamlPath = resolveRepoScopedPath(deploymentYamlRel, { field: 'manifest.deployment_yaml' });
  if (deploymentYamlPath === null || !fs.existsSync(deploymentYamlPath)) {
    return configFailure(startTime, `Deployment YAML not found: ${deploymentYamlMissingPath(deploymentYamlPath, deploymentYamlRel)}`, 'manifest-deployment-missing');
  }

  const findings: Finding[] = [];
  const loaded = loadDeployment(deploymentYamlPath, startTime);
  if (!('workloadCount' in loaded)) return loaded;
  const data = loaded;
  const secretYamlPath = manifestCfg.secret_yaml ? resolveRepoScopedPath(manifestCfg.secret_yaml, { field: 'manifest.secret_yaml' }) : null;
  const secretInfo = loadSecret(secretYamlPath, findings);
  const evaluation = evaluateManifest(data, secretInfo, manifestCfg, context.config?.serve?.health_path, findings);
  return completedManifestVerdict(startTime, manifestCfg, deploymentYamlRel, data, findings, evaluation);
}

function deploymentYamlMissingPath(deploymentYamlPath: string | null, deploymentYamlRel: string): string {
  if (deploymentYamlPath) return deploymentYamlPath;
  return deploymentYamlRel;
}

function manifestShouldFail(hasCritical: boolean, exceedsThreshold: boolean): boolean {
  if (hasCritical) return true;
  return exceedsThreshold;
}
