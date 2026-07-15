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

// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { createRequire } from 'module';
import {
  createSuiteVerdict,
  createFinding,
  STATUS,
  SEVERITY,
} from '../services/verdict-schema.ts';
import type { Finding, SuiteVerdict } from '../services/verdict-schema.ts';
import { resolveRepoScopedPath } from './repo-paths.ts';

type AnyRecord = Record<string, any>;
type LogSink = (entry: Record<string, unknown>) => void;

interface ManifestContext {
  logSink?: LogSink | null;
  config?: {
    manifest?: AnyRecord;
    serve?: AnyRecord;
  };
}

interface ManifestData {
  kind: string | null;
  workloadCount: number;
  images: string[];
  env: AnyRecord[];
  envFrom: AnyRecord[];
  imagePullSecrets: boolean;
  hasLimits: boolean;
  hasReadinessProbe: boolean;
  hasLivenessProbe: boolean;
}

interface SecretInfo {
  name: string;
  keys: string[];
}

let _logSink: LogSink | null = null;
function log(msg: string): void {
  console.log(`[SUITE] [MANIFEST] ${msg}`);
  if (_logSink) _logSink({ suite: 'manifest', msg });
}

function objectRecord(value: unknown): AnyRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as AnyRecord : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function arrayValue<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return error == null ? 'missing_error_detail' : String(error);
}

const require = createRequire(import.meta.url);
const SUPPORTED_WORKLOAD_KINDS = new Set(['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job', 'CronJob']);

export function loadJsYamlModule(): any {
  try {
    return require('js-yaml');
  } catch (error) {
    const wrapped = new Error('js-yaml is required for structured Kubernetes manifest parsing');
    (wrapped as any).cause = error;
    throw wrapped;
  }
}

export function loadYamlDocuments(content: string): AnyRecord[] {
  return loadJsYamlModule().loadAll(content).filter((doc: unknown) => doc !== null && doc !== undefined) as AnyRecord[];
}

export function dumpYamlDocuments(docs: AnyRecord[]): string {
  return docs
    .filter((doc) => doc !== null && doc !== undefined)
    .map((doc) => loadJsYamlModule().dump(doc, { lineWidth: -1, noRefs: true, sortKeys: false }).trimEnd())
    .join('\n---\n') + '\n';
}

function parseSecretYaml(content: string): SecretInfo {
  const doc = selectDefinedValue(() => (objectRecord(loadYamlDocuments(content).find((item) => item?.kind === 'Secret'))), () => ({}));
  return { name: selectDefinedValue(() => (nonEmptyString(doc?.metadata?.name)), () => ('')), keys: Object.keys(selectDefinedValue(() => (objectRecord(doc?.data)), () => ({}))) };
}

function getPodTemplateSpec(doc: AnyRecord): AnyRecord {
  if (doc?.kind === 'CronJob') return selectDefinedValue(() => (objectRecord(doc?.spec?.jobTemplate?.spec?.template?.spec)), () => ({}));
  return selectDefinedValue(() => (objectRecord(doc?.spec?.template?.spec)), () => ({}));
}

function emptyManifestData(kind: string | null = null): ManifestData {
  return {
    kind,
    workloadCount: 0,
    images: [],
    env: [],
    envFrom: [],
    imagePullSecrets: false,
    hasLimits: false,
    hasReadinessProbe: false,
    hasLivenessProbe: false,
  };
}

function extractFromParsedDoc(doc: AnyRecord): ManifestData {
  const podSpec = getPodTemplateSpec(doc);
  const containers = Array.isArray(podSpec?.containers) ? podSpec.containers : [];
  const env: AnyRecord[] = [];
  const envFrom: AnyRecord[] = [];
  const images: string[] = [];

  for (const container of containers) {
    if (container?.image) images.push(String(container.image));
    if (Array.isArray(container?.env)) env.push(...container.env);
    if (Array.isArray(container?.envFrom)) envFrom.push(...container.envFrom);
  }

  return {
    kind: selectTruthyValue(() => (doc?.kind), () => (null)),
    workloadCount: 1,
    images,
    env,
    envFrom,
    imagePullSecrets: arrayValue(podSpec?.imagePullSecrets).length > 0,
    hasLimits: containers.some((container: AnyRecord) => Boolean(container?.resources?.limits)),
    hasReadinessProbe: containers.some((container: AnyRecord) => Boolean(container?.readinessProbe)),
    hasLivenessProbe: containers.some((container: AnyRecord) => Boolean(container?.livenessProbe)),
  };
}

function extractFromParsedDocs(docs: AnyRecord[]): ManifestData {
  const workloads = docs.filter((doc) => SUPPORTED_WORKLOAD_KINDS.has(selectDefinedValue(() => (nonEmptyString(doc?.kind)), () => (''))));
  if (workloads.length === 0) return emptyManifestData();

  const aggregate = emptyManifestData(workloads.map((doc) => doc.kind).join(', '));
  aggregate.workloadCount = workloads.length;
  for (const workload of workloads) {
    const data = extractFromParsedDoc(workload);
    aggregate.images.push(...data.images);
    aggregate.env.push(...data.env);
    aggregate.envFrom.push(...data.envFrom);
    aggregate.imagePullSecrets = selectTruthyValue(() => (aggregate.imagePullSecrets), () => (data.imagePullSecrets));
    aggregate.hasLimits = selectTruthyValue(() => (aggregate.hasLimits), () => (data.hasLimits));
    aggregate.hasReadinessProbe = selectTruthyValue(() => (aggregate.hasReadinessProbe), () => (data.hasReadinessProbe));
    aggregate.hasLivenessProbe = selectTruthyValue(() => (aggregate.hasLivenessProbe), () => (data.hasLivenessProbe));
  }
  return aggregate;
}

function checkParseable(data: ManifestData, findings: Finding[]): boolean {
  if (selectTruthyValue(() => (!data), () => (data.workloadCount === 0))) {
    findings.push(createFinding(SEVERITY.CRITICAL, `Deployment YAML invalid or missing supported workload document (got: ${selectDefinedValue(() => (data?.kind), () => ('missing_workload_kind'))})`, { rule: 'yaml-parseable' }));
    return false;
  }
  return true;
}

function checkRequiredEnvVars(data: ManifestData, requiredEnv: unknown, findings: Finding[]): void {
  if (selectTruthyValue(() => (!Array.isArray(requiredEnv)), () => (requiredEnv.length === 0))) return;
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
  if (selectTruthyValue(() => (!Array.isArray(privateRegistries)), () => (privateRegistries.length === 0))) return;
  const usesPrivate = data.images.some((image) => privateRegistries.some((registry) => image.startsWith(String(registry))));
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

export default async function manifestSuite(context: ManifestContext): Promise<SuiteVerdict> {
  _logSink = selectTruthyValue(() => (context.logSink), () => (null));
  const startTime = Date.now();
  const manifestCfg = selectDefinedValue(() => (objectRecord(context.config?.manifest)), () => ({}));
  const deploymentYamlRel = manifestCfg.deployment_yaml;

  if (!deploymentYamlRel) return configFailure(startTime, 'manifest.deployment_yaml is required when the manifest suite is requested', 'manifest-deployment-required');

  const deploymentYamlPath = resolveRepoScopedPath(deploymentYamlRel, { field: 'manifest.deployment_yaml' });
  if (selectTruthyValue(() => (!deploymentYamlPath), () => (!fs.existsSync(deploymentYamlPath)))) {
    return configFailure(startTime, `Deployment YAML not found: ${deploymentYamlMissingPath(deploymentYamlPath, deploymentYamlRel)}`, 'manifest-deployment-missing');
  }

  const findings: Finding[] = [];
  let data: ManifestData;
  try {
    data = extractFromParsedDocs(loadYamlDocuments(fs.readFileSync(deploymentYamlPath, 'utf8')));
    log(`Loaded deployment YAML: ${deploymentYamlPath}`);
  } catch (error) {
    return createSuiteVerdict('manifest', STATUS.FAIL, {
      critical: true,
      duration_ms: Date.now() - startTime,
      checks_total: 1,
      checks_passed: 0,
      checks_failed: 1,
      findings: [createFinding(SEVERITY.CRITICAL, `Could not parse deployment YAML: ${errorMessage(error)}`, { rule: 'yaml-parseable' })],
    });
  }

  const secretYamlPath = manifestCfg.secret_yaml ? resolveRepoScopedPath(manifestCfg.secret_yaml, { field: 'manifest.secret_yaml' }) : null;
  let secretInfo: SecretInfo | null = null;
  if (secretYamlPath) {
    if (!fs.existsSync(secretYamlPath)) {
      findings.push(createFinding(SEVERITY.CRITICAL, `Secret YAML not found: ${secretYamlPath}`, { rule: 'secret-yaml' }));
    } else {
      try {
        secretInfo = parseSecretYaml(fs.readFileSync(secretYamlPath, 'utf8'));
        log(`Loaded secret YAML: ${secretYamlPath} (${secretInfo.keys.length} keys)`);
      } catch (error) {
        findings.push(createFinding(SEVERITY.CRITICAL, `Could not parse secret YAML: ${errorMessage(error)}`, { rule: 'secret-yaml' }));
      }
    }
  }

  let checks = 0;
  let failedChecks = 0;
  checks++;
  if (!checkParseable(data, findings)) {
    return createSuiteVerdict('manifest', STATUS.FAIL, {
      critical: true,
      duration_ms: Date.now() - startTime,
      checks_total: checks,
      checks_passed: 0,
      checks_failed: 1,
      findings,
    });
  }
  log(`kind: ${data.kind} ✓`);

  checks++;
  const prevLen = findings.length;
  checkRequiredEnvVars(data, manifestCfg.required_env, findings);
  if (hasBlockingFindingSince(findings, prevLen)) failedChecks++;
  if (findings.length === prevLen) log('Required env vars: all present ✓');

  checks++;
  const prevLen2 = findings.length;
  checkSecretRefs(data, secretInfo, findings);
  if (hasBlockingFindingSince(findings, prevLen2)) failedChecks++;
  if (findings.length === prevLen2) log('Secret refs: all resolvable ✓');

  checks++;
  const prevLen3 = findings.length;
  checkImagePullSecrets(data, manifestCfg.private_registries, findings);
  if (hasBlockingFindingSince(findings, prevLen3)) failedChecks++;
  if (findings.length === prevLen3) log('imagePullSecrets: OK ✓');

  checks++;
  const prevLen4 = findings.length;
  checkProbes(data, context.config?.serve?.health_path, findings);
  if (hasBlockingFindingSince(findings, prevLen4)) failedChecks++;
  if (findings.length === prevLen4) log('Probes: OK ✓');

  checks++;
  const prevLen5 = findings.length;
  checkResourceLimits(data, findings);
  if (hasBlockingFindingSince(findings, prevLen5)) failedChecks++;
  if (findings.length === prevLen5) log('Resource limits: defined ✓');

  const thresholds = selectTruthyValue(() => (manifestCfg.thresholds), () => (null));
  const enforced = manifestCfg.enforced === true || Boolean(thresholds);
  const criticalFinds = findings.filter((finding) => finding.severity === SEVERITY.CRITICAL);
  const seriousFinds = findings.filter((finding) => finding.severity === SEVERITY.SERIOUS);
  const totalIssues = findings.length;
  const hasThresholds = thresholds && typeof thresholds.max_issues === 'number';
  const exceedsThreshold = Boolean(hasThresholds && totalIssues > thresholds.max_issues);
  const hasCritical = criticalFinds.length > 0;
  const shouldFail = manifestShouldFail(hasCritical, exceedsThreshold);
  const duration_ms = Date.now() - startTime;
  const checks_failed = Math.min(checks, Math.max(failedChecks, exceedsThreshold ? 1 : 0));
  const checks_passed = checks - checks_failed;

  if (!shouldFail) {
    log(`✅ Manifest validation passed (${findings.length} informational finding${findings.length !== 1 ? 's' : ''})`);
    return createSuiteVerdict('manifest', STATUS.PASS, {
      critical: false,
      duration_ms,
      checks_total: checks,
      checks_passed: Math.max(0, checks_passed),
      checks_failed: 0,
      findings,
      metadata: {
        deployment_yaml: deploymentYamlRel,
        secret_yaml: selectTruthyValue(() => (manifestCfg.secret_yaml), () => (null)),
        images: data.images,
        env_count: data.env.length,
        workload_count: data.workloadCount,
        enforced,
      },
    });
  }

  log(`❌ Manifest validation FAIL: ${criticalFinds.length} critical, ${seriousFinds.length} serious, ${totalIssues} total`);
  return createSuiteVerdict('manifest', STATUS.FAIL, {
    critical: hasCritical,
    duration_ms,
    checks_total: checks,
    checks_passed: Math.max(0, checks_passed),
    checks_failed: Math.max(1, checks_failed),
    findings,
    metadata: {
      deployment_yaml: deploymentYamlRel,
      secret_yaml: selectTruthyValue(() => (manifestCfg.secret_yaml), () => (null)),
      images: data.images,
      env_count: data.env.length,
      workload_count: data.workloadCount,
      enforced,
    },
  });
}

function deploymentYamlMissingPath(deploymentYamlPath: string | null, deploymentYamlRel: string): string {
  if (deploymentYamlPath) return deploymentYamlPath;
  return deploymentYamlRel;
}

function manifestShouldFail(hasCritical: boolean, exceedsThreshold: boolean): boolean {
  if (hasCritical) return true;
  return exceedsThreshold;
}
