// KEEP_TYPED_POLICY: Kubernetes defaults define bounded ephemeral deployment;
// safe namespace prefixes prevent broad targeting; production manifests are
// adapted to the ephemeral namespace/image; temp cleanup and readiness
// diagnostics are nonblocking after the primary deploy result is captured.
// DELETE_LEGACY: requested k8s config, requested manifests, and requested
// secret propagation must fail loudly when missing or broken.

// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { execFile } from 'child_process';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import { promisify } from 'util';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import fs from 'fs';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import os from 'os';
// @ts-expect-error Node built-in ambient types are not installed for this migration island.
import path from 'path';
import { createSuiteVerdict, createFinding, STATUS, SEVERITY } from '../services/verdict-schema.ts';
import type { Finding, SuiteStatus, SuiteVerdict } from '../services/verdict-schema.ts';
import { getRepoRoot } from '../services/git-workflows.ts';
import { buildCleanupKubernetesLabels, buildCleanupPodmanLabelArgs, trackSandboxResources } from '../services/sandbox-cleanup.ts';
import { dumpYamlDocuments, loadYamlDocuments } from './manifest.ts';
import { resolveRepoScopedPath } from './repo-paths.ts';
import { buildSubprocessEnv } from '../security.ts';

type AnyRecord = Record<string, any>;
type SuiteLog = (msg: string) => void;
type Check = { name: string; passed: boolean; detail: string };
type NamespaceLeaseStatus = { namespaceName: string; previewUrl: string | null; exposurePhase: string | null; exposureHostname: string | null; credentialsRef: string | null; credentialsAvailable: boolean; message: string | null };
type TestCredentialSpec = { secretName: string; keys: string[]; purpose: string | null };

interface K8sContext {
  payload?: AnyRecord;
  moduleId?: string;
  logSink?: any;
  telemetryContext?: unknown;
  repoRoot?: string;
  config?: { k8s?: AnyRecord };
}

const execFileAsync = promisify(execFile) as any;
const REGISTRY_LOCAL = 'registry-local.kubeclaw.svc.cluster.local:5001';
const KUBECLAW_NS = process.env.KUBECLAW_NAMESPACE || 'kubeclaw';
const BUSTER_LEASE_API_GROUP = process.env.BUSTER_LEASE_API_GROUP || 'kubeclaw.forgestack.ai';
const BUSTER_LEASE_API_VERSION = process.env.BUSTER_LEASE_API_VERSION || 'v1alpha1';
const K8S_DNS_LABEL_MAX_LENGTH = 63;

const DEFAULTS = { port: 3000, health_path: '/health', namespace_prefix: 'test', ready_timeout_seconds: 120, build_timeout_seconds: 300, push_timeout_seconds: 120, deploy_timeout_seconds: 30 };

const SAFE_NAMESPACE_PREFIXES = Object.freeze(['test']);
const CLUSTER_SCOPED_KINDS = new Set(['APIService', 'CertificateSigningRequest', 'ClusterRole', 'ClusterRoleBinding', 'CSIDriver', 'CSINode', 'CustomResourceDefinition', 'FlowSchema', 'IngressClass', 'MutatingWebhookConfiguration', 'Namespace', 'Node', 'PersistentVolume', 'PodSecurityPolicy', 'PriorityClass', 'PriorityLevelConfiguration', 'RuntimeClass', 'StorageClass', 'ValidatingAdmissionPolicy', 'ValidatingAdmissionPolicyBinding', 'ValidatingWebhookConfiguration', 'VolumeSnapshotClass']);

function shortId(): string {
  return Math.random().toString(36).slice(2, 8);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'unknown error');
}

function errorOutput(error: any): string {
  return String(`${error?.stderr || ''}${error?.stdout || ''}` || errorMessage(error));
}

function trimOut(value: unknown, max = 800): string {
  const str = String(value || '').trim();
  return str.length <= max ? str : `${str.slice(0, max)}…[${str.length - max} chars]`;
}

function makeCheck(name: string, passed: boolean, detail = ''): Check {
  return { name, passed, detail };
}

function sanitizeDnsLabel(value: unknown, fallback = 'preview'): string {
  const normalized = String(value ?? fallback)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, K8S_DNS_LABEL_MAX_LENGTH)
    .replace(/-+$/g, '');
  return normalized.length > 0 ? normalized : fallback;
}

export function validateK8sNamespacePrefix(prefix: string): boolean {
  return SAFE_NAMESPACE_PREFIXES.includes(prefix);
}

function normalizeK8sNamespaceProjectSegment(project: unknown, maxLength: number): string {
  const normalized = String(project || 'project')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
  const segment = normalized || 'project';
  const truncated = segment.slice(0, maxLength).replace(/-+$/g, '');
  return truncated || 'project'.slice(0, maxLength);
}

export function buildK8sSuiteNamespace(prefix: string, project: unknown, runId: string): string {
  const maxProjectLength = Math.max(1, K8S_DNS_LABEL_MAX_LENGTH - prefix.length - runId.length - 2);
  const projectSegment = normalizeK8sNamespaceProjectSegment(project, maxProjectLength);
  return `${prefix}-${projectSegment}-${runId}`;
}

function isObjectDoc(doc: unknown): doc is AnyRecord {
  return Boolean(doc) && typeof doc === 'object' && !Array.isArray(doc);
}

function execFileWithInput(command: string, args: string[], input: string, options: AnyRecord = {}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(command, args, {
      encoding: 'utf8',
      timeout: options.timeout,
      maxBuffer: options.maxBuffer || 5 * 1024 * 1024,
      env: buildSubprocessEnv(),
    }, (error: any, stdout: string, stderr: string) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
    child.stdin.end(input);
  });
}

function normalizeManifestNamespace(doc: AnyRecord, targetNs: string, log: SuiteLog): void {
  if (!isObjectDoc(doc)) return;
  if (doc.kind === 'List' && Array.isArray(doc.items)) {
    for (const item of doc.items) normalizeManifestNamespace(item, targetNs, log);
    return;
  }

  doc.metadata ||= {};
  if (CLUSTER_SCOPED_KINDS.has(doc.kind)) {
    const name = doc.metadata.name || '(unnamed)';
    log(`  Rejected cluster-scoped manifest: ${doc.kind}/${name}`);
    throw new Error(`k8s manifests may not include cluster-scoped resources: ${doc.kind}/${name}`);
  }

  const previous = doc.metadata.namespace;
  doc.metadata.namespace = targetNs;
  if (previous && previous !== targetNs) log(`  Namespace: ${doc.kind || 'object'}/${doc.metadata.name || '(unnamed)'} "${previous}" → "${targetNs}"`);
}

function collectPodSpecs(doc: AnyRecord, specs: AnyRecord[] = []): AnyRecord[] {
  if (!isObjectDoc(doc)) return specs;
  if (doc.kind === 'List' && Array.isArray(doc.items)) {
    for (const item of doc.items) collectPodSpecs(item, specs);
    return specs;
  }
  if (isObjectDoc(doc.spec)) {
    if (doc.kind === 'Pod') specs.push(doc.spec);
    if (isObjectDoc(doc.spec.template?.spec)) specs.push(doc.spec.template.spec);
    if (isObjectDoc(doc.spec.jobTemplate?.spec?.template?.spec)) specs.push(doc.spec.jobTemplate.spec.template.spec);
  }
  return specs;
}

function normalizeImageRepository(image: string): string {
  const withoutDigest = image.split('@')[0] || '';
  const lastSlash = withoutDigest.lastIndexOf('/');
  const lastColon = withoutDigest.lastIndexOf(':');
  if (lastColon > lastSlash) return withoutDigest.slice(0, lastColon);
  return withoutDigest;
}

function imageMatchesBuiltImageName(containerImage: string, imageName: string): boolean {
  const containerRepo = normalizeImageRepository(containerImage);
  const expectedRepo = normalizeImageRepository(imageName);
  if (!containerRepo || !expectedRepo) return false;
  if (containerRepo === expectedRepo) return true;
  if (expectedRepo.includes('/')) return false;
  const containerName = containerRepo.split('/').pop();
  return containerName === expectedRepo || containerName?.startsWith(`${expectedRepo}-`) === true;
}

function rewritePodSpecImages(podSpec: AnyRecord, imageName: string, registryTag: string, log: SuiteLog): number {
  let rewrites = 0;
  for (const field of ['initContainers', 'containers']) {
    const containers = podSpec?.[field];
    if (!Array.isArray(containers)) continue;
    for (const container of containers) {
      if (!isObjectDoc(container) || typeof container.image !== 'string') continue;
      if (!imageMatchesBuiltImageName(container.image, imageName)) continue;
      log(`  Override ${field}: ${container.name || '(unnamed)'} "${container.image}" → "${registryTag}"`);
      container.image = registryTag;
      rewrites++;
    }
  }
  return rewrites;
}

export function renderManifestForK8sSuiteWithStats(content: string, imageName: string, registryTag: string, targetNs: string, log: SuiteLog = () => {}): { content: string; imageRewrites: number } {
  const docs = loadYamlDocuments(content) as AnyRecord[];
  let imageRewrites = 0;
  for (const doc of docs) {
    normalizeManifestNamespace(doc, targetNs, log);
    for (const podSpec of collectPodSpecs(doc)) imageRewrites += rewritePodSpecImages(podSpec, imageName, registryTag, log);
  }
  return { content: dumpYamlDocuments(docs), imageRewrites };
}

export function renderManifestForK8sSuite(content: string, imageName: string, registryTag: string, targetNs: string, log: SuiteLog = () => {}): string {
  return renderManifestForK8sSuiteWithStats(content, imageName, registryTag, targetNs, log).content;
}

async function buildImage(dockerfile: string, buildContext: string, tag: string, timeoutMs: number, log: SuiteLog, payload: AnyRecord = {}): Promise<void> {
  log(`Building: ${tag}`);
  log(`  Dockerfile: ${dockerfile}`);
  log(`  Context:    ${buildContext}`);
  const { stdout, stderr } = await execFileAsync('podman', [
    'build',
    ...buildCleanupPodmanLabelArgs(payload),
    '--pull=never',
    '-t', tag,
    '-f', dockerfile,
    buildContext,
  ], { timeout: timeoutMs, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, env: buildSubprocessEnv() });
  const lines = `${stdout}\n${stderr}`.trim().split('\n');
  log(`Build output (last 10):\n${lines.slice(-10).join('\n')}`);
}

async function pushImage(localTag: string, registryTag: string, timeoutMs: number, log: SuiteLog): Promise<void> {
  log(`Tagging: ${localTag} → ${registryTag}`);
  await execFileAsync('podman', ['tag', localTag, registryTag], { timeout: 10000, encoding: 'utf8', env: buildSubprocessEnv() });
  log(`Pushing to ${REGISTRY_LOCAL}`);
  const { stdout, stderr } = await execFileAsync('podman', ['push', '--tls-verify=false', registryTag], { timeout: timeoutMs, encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, env: buildSubprocessEnv() });
  log(`Push: ${`${stdout}${stderr}`.trim().split('\n').slice(-3).join(' | ')}`);
}

async function requestNamespaceLease({ leaseName, namespaceName, namespacePrefix, serviceName, secretsToCopy, payload, ttlSeconds, cleanupPolicy, purpose, exposure, log }: {
  leaseName: string;
  namespaceName: string;
  namespacePrefix: string;
  serviceName: string;
  secretsToCopy: string[];
  payload: AnyRecord;
  ttlSeconds: number;
  cleanupPolicy: string;
  purpose: string;
  exposure: AnyRecord;
  log: SuiteLog;
}): Promise<void> {
  const lease = {
    apiVersion: `${BUSTER_LEASE_API_GROUP}/${BUSTER_LEASE_API_VERSION}`,
    kind: 'BusterNamespaceLease',
    metadata: {
      name: leaseName,
      namespace: KUBECLAW_NS,
      labels: buildCleanupKubernetesLabels(payload || {}),
    },
    spec: {
      namespaceName,
      namespacePrefix,
      runId: payload?.run_id || leaseName,
      project: payload?.project || 'project',
      purpose,
      capabilityProfile: 'default',
      cleanupPolicy,
      ttlSeconds,
      secretsToCopy,
      serviceName,
      exposure,
    },
  };

  log(`Requesting namespace lease ${KUBECLAW_NS}/${leaseName} → ${namespaceName}`);
  await execFileWithInput('kubectl', ['apply', '-f', '-'], `${JSON.stringify(lease)}\n`, { timeout: 15000, maxBuffer: 5 * 1024 * 1024 });
}

function normalizeLeaseStatus(lease: AnyRecord = {}): NamespaceLeaseStatus {
  return {
    namespaceName: lease.status?.namespaceName || '',
    previewUrl: lease.status?.previewUrl || null,
    exposurePhase: lease.status?.exposurePhase || null,
    exposureHostname: lease.status?.exposureHostname || null,
    credentialsRef: lease.status?.credentialsRef || null,
    credentialsAvailable: lease.status?.credentialsAvailable === true,
    message: lease.status?.message || null,
  };
}

function parseSecretNameFromRef(ref: string | null): string | null {
  if (typeof ref !== 'string' || !ref.trim()) return null;
  const trimmed = ref.trim();
  const prefixed = trimmed.match(/^secret\/([A-Za-z0-9._-]+)$/);
  if (prefixed) return prefixed[1];
  if (/^[A-Za-z0-9._-]+$/.test(trimmed)) return trimmed;
  return null;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function normalizeSecretName(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = parseSecretNameFromRef(value);
  return parsed && /^[A-Za-z0-9._-]+$/.test(parsed) ? parsed : null;
}

function normalizeCredentialKeys(value: unknown): string[] {
  return Array.isArray(value)
    ? uniqueStrings(value.filter((key): key is string => typeof key === 'string' && Boolean(key.trim())))
    : [];
}

export function normalizeTestCredentialSpecs(k8sCfg: AnyRecord = {}, previewCfg: AnyRecord = {}): TestCredentialSpec[] {
  const specs: TestCredentialSpec[] = [];
  const configured = Array.isArray(k8sCfg.test_credentials) ? k8sCfg.test_credentials : [];

  for (const entry of configured) {
    if (!isObjectDoc(entry)) continue;
    const secretName = normalizeSecretName(entry.secret ?? entry.secret_name ?? entry.credentials_ref);
    const keys = normalizeCredentialKeys(entry.keys ?? entry.credentials_keys);
    if (!secretName || keys.length === 0) continue;
    specs.push({
      secretName,
      keys,
      purpose: typeof entry.purpose === 'string' && entry.purpose.trim() ? entry.purpose.trim() : null,
    });
  }

  const previewReveal = previewCfg.reveal_credentials === true || previewCfg.credentials_delivery === 'discord';
  const previewSecret = normalizeSecretName(previewCfg.credentials_secret_name ?? previewCfg.credentials_ref);
  const previewKeys = normalizeCredentialKeys(previewCfg.credentials_keys);
  if (previewReveal && previewSecret && previewKeys.length > 0) {
    specs.push({
      secretName: previewSecret,
      keys: previewKeys,
      purpose: 'final-preview login',
    });
  }

  const seen = new Set<string>();
  return specs.filter((spec) => {
    const key = `${spec.secretName}:${spec.keys.join(',')}:${spec.purpose || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function shellSingleQuote(value: string): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function buildPreviewCredentialCommand(secretName: string | null, keys: string[]): string | null {
  if (!secretName) return null;
  const namespaceArg = shellSingleQuote(KUBECLAW_NS);
  const secretArg = shellSingleQuote(secretName);
  if (keys.length > 0) {
    const keyList = keys.map(shellSingleQuote).join(' ');
    return `for k in ${keyList}; do printf '%s: ' "$k"; kubectl -n ${namespaceArg} get secret ${secretArg} -o "go-template={{ index .data \\"$k\\" | base64decode }}"; printf '\\n'; done`;
  }
  return `kubectl -n ${namespaceArg} get secret ${secretArg} -o 'go-template={{range $k,$v := .data}}{{printf "%s: " $k}}{{base64decode $v}}{{"\\n"}}{{end}}'`;
}

function decodeSecretDataValue(value: unknown): string {
  return Buffer.from(String(value || ''), 'base64').toString('utf8');
}

async function readTestCredentials(specs: TestCredentialSpec[], namespace: string): Promise<AnyRecord[]> {
  const credentials: AnyRecord[] = [];
  for (const spec of specs) {
    const { stdout } = await execFileAsync('kubectl', ['get', 'secret', spec.secretName, '-n', namespace, '-o', 'json'], {
      timeout: 10000,
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
      env: buildSubprocessEnv(),
    });
    const secret = JSON.parse(stdout);
    const values: AnyRecord = {};
    const missing: string[] = [];
    for (const key of spec.keys) {
      if (secret?.data?.[key] == null) {
        missing.push(key);
        continue;
      }
      values[key] = decodeSecretDataValue(secret.data[key]);
    }
    if (missing.length > 0) {
      throw new Error(`Test credential Secret/${spec.secretName} in ${namespace} is missing key(s): ${missing.join(', ')}`);
    }
    credentials.push({
      secret: spec.secretName,
      purpose: spec.purpose,
      values,
    });
  }
  return credentials;
}

async function readNamespaceLeaseStatus(leaseName: string): Promise<NamespaceLeaseStatus> {
  const { stdout } = await execFileAsync('kubectl', ['get', 'busternamespacelease', leaseName, '-n', KUBECLAW_NS, '-o', 'json'], {
    timeout: 10000,
    encoding: 'utf8',
    maxBuffer: 5 * 1024 * 1024,
    env: buildSubprocessEnv(),
  });
  return normalizeLeaseStatus(JSON.parse(stdout));
}

async function waitForNamespaceLeaseReady(leaseName: string, timeoutSeconds: number, log: SuiteLog): Promise<NamespaceLeaseStatus> {
  const deadline = Date.now() + timeoutSeconds * 1000;
  let lastMessage = '';
  while (Date.now() < deadline) {
    try {
      const { stdout } = await execFileAsync('kubectl', ['get', 'busternamespacelease', leaseName, '-n', KUBECLAW_NS, '-o', 'json'], {
        timeout: 10000,
        encoding: 'utf8',
        maxBuffer: 5 * 1024 * 1024,
        env: buildSubprocessEnv(),
      });
      const lease = JSON.parse(stdout);
      const phase = lease.status?.phase || 'Pending';
      lastMessage = lease.status?.message || phase;
      if (phase === 'Ready' && lease.status?.namespaceName) {
        log(`Namespace lease ready: ${lease.status.namespaceName}`);
        return normalizeLeaseStatus(lease);
      }
      if (phase === 'Rejected' || phase === 'Failed') {
        throw new Error(`namespace lease ${phase}: ${lastMessage}`);
      }
    } catch (error) {
      if (!String(errorMessage(error)).includes('NotFound')) throw error;
      lastMessage = trimOut(errorMessage(error), 200);
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(`namespace lease ${leaseName} was not ready within ${timeoutSeconds}s: ${lastMessage}`);
}

async function verifyCopiedSecrets(names: string[], targetNamespace: string): Promise<void> {
  for (const name of names) {
    try {
      await execFileAsync('kubectl', ['get', 'secret', name, '-n', targetNamespace], {
        timeout: 10000,
        encoding: 'utf8',
        env: buildSubprocessEnv(),
      });
    } catch (error) {
      throw new Error(`Required secret copy failed: ${name}: ${trimOut(errorOutput(error))}`);
    }
  }
}

async function waitForPreviewUrl(leaseName: string, timeoutSeconds: number, log: SuiteLog): Promise<NamespaceLeaseStatus> {
  const deadline = Date.now() + timeoutSeconds * 1000;
  let latest: NamespaceLeaseStatus | null = null;
  while (Date.now() < deadline) {
    latest = await readNamespaceLeaseStatus(leaseName);
    if (latest.previewUrl) {
      log(`Preview URL ready: ${latest.previewUrl}`);
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  latest ??= await readNamespaceLeaseStatus(leaseName);
  log(`Preview URL not ready after ${timeoutSeconds}s: ${latest.message || latest.exposurePhase || 'pending'}`);
  return latest;
}

async function applyManifests(manifestPaths: string[], imageName: string, registryTag: string, targetNs: string, timeoutMs: number, log: SuiteLog): Promise<void> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'k8s-suite-'));
  log(`Applying ${manifestPaths.length} manifest(s) to ${targetNs}`);
  log(`Overriding image "${imageName}" → "${registryTag}"`);
  try {
    let rendered = 0;
    let imageRewrites = 0;
    for (const manifestPath of manifestPaths) {
      if (!fs.existsSync(manifestPath)) throw new Error(`Requested manifest not found: ${manifestPath}`);
      const overridden = renderManifestForK8sSuiteWithStats(fs.readFileSync(manifestPath, 'utf8'), imageName, registryTag, targetNs, log);
      imageRewrites += overridden.imageRewrites;
      fs.writeFileSync(path.join(tmpDir, `${rendered}-${path.basename(manifestPath)}`), overridden.content);
      rendered++;
    }
    if (imageRewrites === 0) {
      throw new Error(`No Kubernetes workload image matched k8s.image_name "${imageName}"; refusing to apply manifests without using ${registryTag}`);
    }
    log(`Image overrides applied: ${imageRewrites}`);
    const { stdout } = await execFileAsync('kubectl', ['apply', '-n', targetNs, '-f', tmpDir], { timeout: timeoutMs, encoding: 'utf8', env: buildSubprocessEnv() });
    log(`Applied:\n${stdout.trim()}`);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); }
    catch (error) { log(`non-blocking manifest temp cleanup failed: ${errorMessage(error)}`); }
  }
}

async function waitForPods(ns: string, timeoutSeconds: number, log: SuiteLog): Promise<void> {
  log(`Waiting for pods in ${ns} (max ${timeoutSeconds}s)…`);
  await execFileAsync('kubectl', ['wait', '--for=condition=Ready', 'pod', '--all', '-n', ns, `--timeout=${timeoutSeconds}s`], { timeout: (timeoutSeconds + 10) * 1000, encoding: 'utf8', env: buildSubprocessEnv() });
}

async function getPodStatus(ns: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('kubectl', ['get', 'pods', '-n', ns, '-o', 'wide'], { timeout: 10000, encoding: 'utf8', env: buildSubprocessEnv() });
    return stdout.trim().split('\n').slice(0, 10).join('\n');
  } catch (_error) {
    return '(could not retrieve pod status)';
  }
}

async function httpHealthCheck(url: string, log: SuiteLog): Promise<number> {
  log(`Health check: ${url}`);
  const { stdout } = await execFileAsync('curl', ['-sf', '--connect-timeout', '10', '--max-time', '30', '-o', '/dev/null', '-w', '%{http_code}', url], { timeout: 45000, encoding: 'utf8', env: buildSubprocessEnv() });
  const code = parseInt(stdout.trim(), 10);
  log(`Health check: HTTP ${code}`);
  return code;
}

function configFailure(startTime: number, message: string, rule: string): SuiteVerdict {
  return createSuiteVerdict('k8s', STATUS.FAIL, {
    critical: true,
    duration_ms: Date.now() - startTime,
    checks_total: 1,
    checks_passed: 0,
    checks_failed: 1,
    findings: [createFinding(SEVERITY.CRITICAL, message, { rule })],
    reason: message,
  });
}

export default async function k8sSuite(context: K8sContext): Promise<SuiteVerdict> {
  const { payload = {}, moduleId, logSink } = context;
  const startTime = Date.now();
  const log = (msg: string): void => {
    console.log(`[SUITE] [K8S] ${msg}`);
    if (logSink) logSink('K8S', msg);
  };
  const stepTel = (check: string, status: string, detail: string): void => {
    if (logSink) logSink({ suite: 'k8s', check, status, detail: detail || null, elapsed_seconds: Math.ceil((Date.now() - startTime) / 1000) });
  };

  const k8sCfg = context.config?.k8s ?? payload?.test_config?.k8s ?? {};
  const repoRoot = context.repoRoot || getRepoRoot();
  const dockerfile = k8sCfg.dockerfile ? resolveRepoScopedPath(k8sCfg.dockerfile, { repoDir: repoRoot, field: 'k8s.dockerfile' }) : null;
  const imageName = k8sCfg.image_name;
  const serviceName = k8sCfg.service_name;
  const manifestInputs = Array.isArray(k8sCfg.manifests) ? k8sCfg.manifests : [];
  const manifestPaths = manifestInputs.map((manifest: unknown) => resolveRepoScopedPath(manifest, { repoDir: repoRoot, field: 'k8s.manifests[]' })).filter((manifest: string | null): manifest is string => Boolean(manifest));

  if (!dockerfile || !imageName || !serviceName || manifestInputs.length === 0 || manifestPaths.length !== manifestInputs.length) {
    return configFailure(startTime, 'k8s suite requires dockerfile, image_name, service_name, and valid manifests[]', 'k8s-config-required');
  }

  const buildContext = k8sCfg.build_context ? resolveRepoScopedPath(k8sCfg.build_context, { repoDir: repoRoot, field: 'k8s.build_context' }) : path.dirname(dockerfile);
  if (!buildContext) return configFailure(startTime, 'k8s.build_context is invalid', 'k8s-build-context');
  const port = k8sCfg.port || DEFAULTS.port;
  const healthPath = k8sCfg.health_path || DEFAULTS.health_path;
  const readyTimeout = k8sCfg.ready_timeout_seconds || DEFAULTS.ready_timeout_seconds;
  const nsPrefix = k8sCfg.namespace_prefix || DEFAULTS.namespace_prefix;
  const configuredSecretsToCopy = Array.isArray(k8sCfg.secrets_to_copy) ? k8sCfg.secrets_to_copy : [];
  const namespaceLeaseTimeout = k8sCfg.namespace_lease_timeout_seconds || 60;
  const namespaceTtlSeconds = k8sCfg.namespace_ttl_seconds || 7200;
  const cleanupPolicy = k8sCfg.cleanup_policy === 'keep' ? 'keep' : 'delete';
  const purpose = k8sCfg.purpose === 'final-preview' ? 'final-preview' : 'pretest';
  const previewCfg = k8sCfg.preview && typeof k8sCfg.preview === 'object' ? k8sCfg.preview : {};
  const previewExposureProvider = purpose === 'final-preview'
    ? (previewCfg.exposure_provider || previewCfg.provider || k8sCfg.preview_exposure_provider || 'tailscale-ingress')
    : 'off';
  const previewPath = typeof previewCfg.path === 'string' && previewCfg.path.startsWith('/') ? previewCfg.path : '/';
  const previewCredentialsRef = typeof previewCfg.credentials_ref === 'string'
    ? previewCfg.credentials_ref
    : (typeof k8sCfg.preview_credentials_ref === 'string' ? k8sCfg.preview_credentials_ref : null);
  const previewCredentialsSecretName = typeof previewCfg.credentials_secret_name === 'string'
    ? previewCfg.credentials_secret_name
    : (typeof k8sCfg.preview_credentials_secret_name === 'string' ? k8sCfg.preview_credentials_secret_name : null);
  const previewRevealCredentials = purpose === 'final-preview'
    && (previewCfg.reveal_credentials === true
      || previewCfg.credentials_delivery === 'discord'
      || k8sCfg.preview_reveal_credentials === true
      || k8sCfg.preview_credentials_delivery === 'discord');
  const previewCredentialsKeys = Array.isArray(previewCfg.credentials_keys)
    ? previewCfg.credentials_keys.filter((key: unknown): key is string => typeof key === 'string' && Boolean(key.trim()))
    : (Array.isArray(k8sCfg.preview_credentials_keys)
        ? k8sCfg.preview_credentials_keys.filter((key: unknown): key is string => typeof key === 'string' && Boolean(key.trim()))
        : []);
  const previewCredentialSecretName = previewCredentialsSecretName || parseSecretNameFromRef(previewCredentialsRef);
  const previewCredentialCommand = previewRevealCredentials
    ? buildPreviewCredentialCommand(previewCredentialSecretName, previewCredentialsKeys)
    : null;
  const testCredentialSpecs = normalizeTestCredentialSpecs(k8sCfg, {
    ...previewCfg,
    credentials_ref: previewCredentialsRef,
    credentials_secret_name: previewCredentialsSecretName,
    credentials_keys: previewCredentialsKeys,
    reveal_credentials: previewRevealCredentials,
  });
  const secretsToCopy = uniqueStrings([
    ...configuredSecretsToCopy.filter((secret): secret is string => typeof secret === 'string'),
    ...testCredentialSpecs.map((spec) => spec.secretName),
  ]);
  const previewUrlTimeoutSeconds = k8sCfg.preview_url_timeout_seconds || previewCfg.url_timeout_seconds || 120;
  const buildTimeoutMs = (k8sCfg.build_timeout_seconds || DEFAULTS.build_timeout_seconds) * 1000;
  const pushTimeoutMs = (k8sCfg.push_timeout_seconds || DEFAULTS.push_timeout_seconds) * 1000;
  const deployTimeoutMs = (k8sCfg.deploy_timeout_seconds || DEFAULTS.deploy_timeout_seconds) * 1000;

  if (!validateK8sNamespacePrefix(nsPrefix)) {
    const detail = `Invalid k8s namespace_prefix "${nsPrefix}"; expected one of: ${SAFE_NAMESPACE_PREFIXES.join(', ')}`;
    const check = makeCheck('namespace-prefix', false, detail);
    return createSuiteVerdict('k8s', STATUS.FAIL, {
      critical: true,
      duration_ms: Date.now() - startTime,
      checks_total: 1,
      checks_passed: 0,
      checks_failed: 1,
      findings: [createFinding(SEVERITY.CRITICAL, detail, { rule: 'namespace-prefix' })],
      metadata: { checks: [check] },
    });
  }

  const runId = shortId();
  const testNs = buildK8sSuiteNamespace(nsPrefix, payload?.project, runId);
  const leaseName = testNs;
  const previewHostname = sanitizeDnsLabel(previewCfg.hostname ?? `${payload?.project ?? 'project'}-${runId}-${serviceName}`, `${testNs}-${serviceName}`);
  const previewExposure = {
    provider: previewExposureProvider,
    hostname: previewHostname,
    serviceName,
    servicePort: port,
    path: previewPath,
    credentialsRef: previewCredentialsRef,
    credentialsSecretName: previewCredentialsSecretName,
    credentialsKeys: previewCredentialsKeys,
    revealCredentials: previewRevealCredentials,
  };
  const localTag = `localhost/k8s-suite-${imageName}:${runId}`;
  const registryTag = `${REGISTRY_LOCAL}/${imageName}:${runId}`;
  trackSandboxResources(payload || {}, { images: [localTag, registryTag], namespaces: [testNs] });
  log(`Starting: module=${moduleId} project=${payload?.project} ns=${testNs}`);

  const checks: Check[] = [];
  let criticalFailed = false;
  let leaseStatus: NamespaceLeaseStatus | null = null;
  let previewLeaseStatus: NamespaceLeaseStatus | null = null;
  let testCredentials: AnyRecord[] = [];

  const runStep = async (name: string, started: string, action: () => Promise<string>): Promise<void> => {
    if (criticalFailed) return;
    log(`--- ${name} ---`);
    stepTel(name, 'started', started);
    try {
      const detail = await action();
      checks.push(makeCheck(name, true, detail));
      stepTel(name, 'passed', detail);
      log(`✓ ${name}`);
    } catch (error) {
      const detail = trimOut(errorOutput(error));
      checks.push(makeCheck(name, false, `${name} failed: ${detail}`));
      stepTel(name, 'failed', detail.slice(0, 300));
      criticalFailed = true;
      log(`✗ ${name}`);
    }
  };

  await runStep('dockerfile-build', `Building ${imageName} from ${k8sCfg.dockerfile}`, async () => {
    await buildImage(dockerfile, buildContext, localTag, buildTimeoutMs, log, payload);
    return `Built: ${localTag}`;
  });
  await runStep('registry-push', `Pushing to ${REGISTRY_LOCAL}`, async () => {
    await pushImage(localTag, registryTag, pushTimeoutMs, log);
    return `Pushed: ${registryTag}`;
  });
  await runStep('namespace-lease', testNs, async () => {
    await requestNamespaceLease({
      leaseName,
      namespaceName: testNs,
      namespacePrefix: nsPrefix,
      serviceName,
      secretsToCopy,
      payload,
      ttlSeconds: namespaceTtlSeconds,
      cleanupPolicy,
      purpose,
      exposure: previewExposure,
      log,
    });
    leaseStatus = await waitForNamespaceLeaseReady(leaseName, namespaceLeaseTimeout, log);
    const readyNamespace = leaseStatus.namespaceName;
    if (readyNamespace !== testNs) throw new Error(`Lease returned unexpected namespace ${readyNamespace}`);
    return `Ready: ${testNs}`;
  });
  await runStep('secret-copy', `${secretsToCopy.length} required secret(s) → ${testNs}`, async () => {
    await verifyCopiedSecrets(secretsToCopy, testNs);
    return secretsToCopy.length > 0
      ? `Required secrets copied: ${secretsToCopy.join(', ')}`
      : 'No required secrets requested';
  });
  await runStep('test-credentials', `${testCredentialSpecs.length} app test credential secret(s)`, async () => {
    testCredentials = await readTestCredentials(testCredentialSpecs, testNs);
    return testCredentials.length > 0
      ? `Decoded app test credentials: ${testCredentials.map((entry) => entry.secret).join(', ')}`
      : 'No app test credentials requested';
  });
  await runStep('manifest-apply', `${manifestPaths.length} manifest(s) → ${testNs}`, async () => {
    await applyManifests(manifestPaths, imageName, registryTag, testNs, deployTimeoutMs, log);
    return `${manifestPaths.length} manifest(s) applied`;
  });
  await runStep('pods-ready', `Waiting up to ${readyTimeout}s in ${testNs}`, async () => {
    try {
      await waitForPods(testNs, readyTimeout, log);
      return `All pods ready in ${testNs}`;
    } catch (error) {
      const podStatus = await getPodStatus(testNs);
      throw new Error(`Pods not ready within ${readyTimeout}s. Pod status:\n${podStatus}`);
    }
  });

  const serviceUrl = `http://${serviceName}.${testNs}.svc.cluster.local:${port}${healthPath}`;
  let httpCode: number | null = null;
  await runStep('health-check', serviceUrl, async () => {
    httpCode = await httpHealthCheck(serviceUrl, log);
    if (httpCode < 200 || httpCode >= 400) throw new Error(`HTTP ${httpCode} (expected 2xx/3xx)`);
    return `HTTP ${httpCode} OK`;
  });
  if (!criticalFailed && purpose === 'final-preview' && previewExposureProvider === 'tailscale-ingress') {
    await runStep('preview-url', `Waiting up to ${previewUrlTimeoutSeconds}s for Tailscale URL`, async () => {
      previewLeaseStatus = await waitForPreviewUrl(leaseName, previewUrlTimeoutSeconds, log);
      return previewLeaseStatus.previewUrl
        ? `Preview: ${previewLeaseStatus.previewUrl}`
        : `Preview pending: ${previewLeaseStatus.message ?? previewLeaseStatus.exposurePhase ?? 'pending'}`;
    });
  }

  const duration_ms = Date.now() - startTime;
  const checks_passed = checks.filter((check) => check.passed).length;
  const checks_failed = checks.filter((check) => !check.passed).length;
  const status: SuiteStatus = checks_failed === 0 ? STATUS.PASS : STATUS.FAIL;
  const findings: Finding[] = checks.filter((check) => !check.passed).map((check) => createFinding(SEVERITY.CRITICAL, check.detail, { rule: check.name }));
  const topFinding = checks.find((check) => !check.passed)?.detail || null;

  log(`Result: ${status} — ${checks_passed}/${checks.length} checks (${duration_ms}ms)`);
  if (status === STATUS.PASS) log(`Service URL for buster: ${serviceUrl}`);
  const finalLeaseStatus = previewLeaseStatus ?? leaseStatus;

  return createSuiteVerdict('k8s', status, {
    critical: true,
    duration_ms,
    checks_total: checks.length,
    checks_passed,
    checks_failed,
    findings,
    metadata: {
      test_namespace: testNs,
      registry_image: registryTag,
      service_url: serviceUrl,
      preview_url: finalLeaseStatus?.previewUrl || null,
      preview_exposure_provider: previewExposureProvider,
      preview_exposure_phase: finalLeaseStatus?.exposurePhase || null,
      preview_exposure_hostname: finalLeaseStatus?.exposureHostname || previewHostname,
      preview_credentials_ref: finalLeaseStatus?.credentialsRef || previewCredentialsRef,
      preview_credentials_available: finalLeaseStatus?.credentialsAvailable === true,
      preview_credentials_command: previewCredentialCommand,
      test_credentials: testCredentials,
      cleanup_policy: cleanupPolicy,
      purpose,
      health_http_code: httpCode,
      top_finding: topFinding,
      checks: checks.map((check) => ({ name: check.name, passed: check.passed, detail: check.detail.slice(0, 300) })),
    },
  });
}
