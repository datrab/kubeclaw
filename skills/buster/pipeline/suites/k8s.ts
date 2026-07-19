import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
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
import { buildCleanupKubernetesLabels, trackRuntimeResources } from '../services/resource-cleanup.ts';
import { dumpYamlDocuments, loadYamlDocuments } from './manifest.ts';
import { resolveRepoScopedPath } from './repo-paths.ts';
import { buildSubprocessEnv } from '../security.ts';
import { buildPreviewCredentialCommand, normalizeTestCredentialSpecs, parseSecretNameFromRef } from './k8s-credentials.ts';
import type { TestCredentialSpec } from './k8s-credentials.ts';
import { buildAndPushImage, copyAndPushImage } from '../services/buildkit.ts';
import { buildK8sCommandEnv, execFileWithInput } from './k8s-command-env.ts';
import type { K8sCommandEnv } from './k8s-command-env.ts';
import { withServicePortForward } from './k8s-port-forward.ts';

export { buildLocalServiceHealthUrl } from './k8s-port-forward.ts';

export { normalizeTestCredentialSpecs };

type AnyRecord = Record<string, any>;
type SuiteLog = (msg: string) => void;
type Check = { name: string; passed: boolean; detail: string };
type NamespaceLeaseStatus = { namespaceName: string; previewUrl: string | null; exposurePhase: string | null; exposureHostname: string | null; credentialsRef: string | null; credentialsAvailable: boolean; message: string | null };

interface K8sContext {
  payload?: AnyRecord;
  moduleId?: string;
  logSink?: any;
  telemetryContext?: unknown;
  repoRoot?: string;
  config?: { k8s?: AnyRecord };
}

interface NormalizedK8sSuiteConfig extends AnyRecord {
  port: number;
  health_path: string;
  ready_timeout_seconds: number;
  namespace_prefix: string;
  secrets_to_copy: string[];
  namespace_lease_timeout_seconds: number;
  namespace_ttl_seconds: number;
  cleanup_policy: 'keep' | 'delete';
  purpose: 'final-preview' | 'pretest';
  preview: AnyRecord;
  preview_provider: string;
  preview_path: string;
  preview_url_timeout_seconds: number;
  build_timeout_seconds: number;
  push_timeout_seconds: number;
  deploy_timeout_seconds: number;
  health_retries: number;
  health_base_delay_ms: number;
  kubeconfig_path: string | null;
}

const execFileAsync = promisify(execFile) as any;
function envStringOrDefault(name: string, defaultValue: string): string {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : defaultValue;
}
function requiredEnvString(env: Record<string, string | undefined>, name: string): string {
  const value = env[name];
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new Error(`${name} is required deployment infrastructure env`);
}
function registryHost(value: string): string {
  return value.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}
export function resolveK8sLocalRegistry(env: Record<string, string | undefined> = process.env): string {
  return registryHost(requiredEnvString(env, 'KUBECLAW_LOCAL_REGISTRY'));
}
const KUBECLAW_NS = envStringOrDefault('KUBECLAW_NAMESPACE', 'kubeclaw');
const BUSTER_LEASE_API_GROUP = envStringOrDefault('BUSTER_LEASE_API_GROUP', 'kubeclaw.forgestack.ai');
const BUSTER_LEASE_API_VERSION = envStringOrDefault('BUSTER_LEASE_API_VERSION', 'v1alpha1');
const K8S_DNS_LABEL_MAX_LENGTH = 63;

const DEFAULTS = { port: 3000, health_path: '/health', namespace_prefix: 'test', ready_timeout_seconds: 120, build_timeout_seconds: 300, push_timeout_seconds: 120, deploy_timeout_seconds: 30, health_retries: 6, health_base_delay_ms: 1000 };
const SAFE_NAMESPACE_PREFIXES = Object.freeze(['test']);
const CLUSTER_SCOPED_KINDS = new Set(['APIService', 'CertificateSigningRequest', 'ClusterRole', 'ClusterRoleBinding', 'CSIDriver', 'CSINode', 'CustomResourceDefinition', 'FlowSchema', 'IngressClass', 'MutatingWebhookConfiguration', 'Namespace', 'Node', 'PersistentVolume', 'PodSecurityPolicy', 'PriorityClass', 'PriorityLevelConfiguration', 'RuntimeClass', 'StorageClass', 'ValidatingAdmissionPolicy', 'ValidatingAdmissionPolicyBinding', 'ValidatingWebhookConfiguration', 'VolumeSnapshotClass']);
function shortId(): string {
  return Math.random().toString(36).slice(2, 8);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error === undefined) return 'error_detail_missing';
  if (error === null) return 'error_detail_null';
  return String(error);
}

function errorOutput(error: any): string {
  const stderr = typeof error?.stderr === 'string' ? error.stderr : '';
  const stdout = typeof error?.stdout === 'string' ? error.stdout : '';
  const output = `${stderr}${stdout}`;
  return output ? output : errorMessage(error);
}

function trimOut(value: unknown, max = 800): string {
  const str = value == null ? '' : String(value).trim();
  return str.length <= max ? str : `${str.slice(0, max)}…[${str.length - max} chars]`;
}

function positiveNumber(value: unknown, defaultValue: number): number {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : defaultValue;
}

export function validateK8sServicePort(port: unknown): boolean { return Number.isInteger(port) && Number(port) >= 1 && Number(port) <= 65535; }

function normalizeK8sConfig(config: AnyRecord | undefined): NormalizedK8sSuiteConfig {
  const k8sCfg = selectDefinedValue(() => (config), () => ({}));
  const preview = k8sCfg.preview && typeof k8sCfg.preview === 'object' ? k8sCfg.preview : {};
  const purpose = k8sCfg.purpose === 'final-preview' ? 'final-preview' : 'pretest';
  return {
    ...k8sCfg,
    port: positiveNumber(k8sCfg.port, DEFAULTS.port),
    health_path: typeof k8sCfg.health_path === 'string' && k8sCfg.health_path.startsWith('/') ? k8sCfg.health_path : DEFAULTS.health_path,
    ready_timeout_seconds: positiveNumber(k8sCfg.ready_timeout_seconds, DEFAULTS.ready_timeout_seconds),
    namespace_prefix: typeof k8sCfg.namespace_prefix === 'string' && k8sCfg.namespace_prefix.trim() ? k8sCfg.namespace_prefix : DEFAULTS.namespace_prefix,
    secrets_to_copy: Array.isArray(k8sCfg.secrets_to_copy) ? k8sCfg.secrets_to_copy.filter((secret: unknown): secret is string => typeof secret === 'string') : [],
    namespace_lease_timeout_seconds: positiveNumber(k8sCfg.namespace_lease_timeout_seconds, 60),
    namespace_ttl_seconds: positiveNumber(k8sCfg.namespace_ttl_seconds, 7200),
    cleanup_policy: k8sCfg.cleanup_policy === 'keep' ? 'keep' : 'delete',
    purpose,
    preview,
    preview_provider: purpose === 'final-preview' && typeof preview.provider === 'string' && preview.provider.trim()
      ? preview.provider
      : 'tailscale-ingress',
    preview_path: typeof preview.path === 'string' && preview.path.startsWith('/') ? preview.path : '/',
    preview_url_timeout_seconds: positiveNumber(selectDefinedValue(() => (k8sCfg.preview_url_timeout_seconds), () => (preview.url_timeout_seconds)), 120),
    build_timeout_seconds: positiveNumber(k8sCfg.build_timeout_seconds, DEFAULTS.build_timeout_seconds),
    push_timeout_seconds: positiveNumber(k8sCfg.push_timeout_seconds, DEFAULTS.push_timeout_seconds),
    deploy_timeout_seconds: positiveNumber(k8sCfg.deploy_timeout_seconds, DEFAULTS.deploy_timeout_seconds),
    health_retries: positiveNumber(k8sCfg.health_retries, DEFAULTS.health_retries),
    health_base_delay_ms: positiveNumber(selectDefinedValue(() => (k8sCfg.health_base_delay_ms), () => (k8sCfg.health_base_delay)), DEFAULTS.health_base_delay_ms),
    kubeconfig_path: typeof k8sCfg.kubeconfig_path === 'string' && k8sCfg.kubeconfig_path.trim()
      ? k8sCfg.kubeconfig_path.trim()
      : null,
  };
}

function makeCheck(name: string, passed: boolean, detail = ''): Check {
  return { name, passed, detail };
}

function sanitizeDnsLabel(value: unknown, fallback = 'preview'): string {
  const rawValue = selectTruthyValue(() => (value === undefined), () => (value === null)) ? fallback : value;
  const normalized = String(rawValue)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-')
    .slice(0, K8S_DNS_LABEL_MAX_LENGTH)
    .replace(/-+$/g, '');
  return normalized.length > 0 ? normalized : fallback;
}

function k8sRepoRoot(context: K8sContext): string {
  return typeof context.repoRoot === 'string' && context.repoRoot.trim() ? context.repoRoot : getRepoRoot();
}

function previewCredentialSecretAuthority(secretName: string | null, credentialsRef: string | null): string | null {
  return typeof secretName === 'string' && secretName.trim() ? secretName : parseSecretNameFromRef(credentialsRef);
}

function finalPreviewLeaseStatus(previewLeaseStatus: NamespaceLeaseStatus | null, leaseStatus: NamespaceLeaseStatus | null): NamespaceLeaseStatus | null {
  return previewLeaseStatus !== undefined && previewLeaseStatus !== null ? previewLeaseStatus : leaseStatus;
}

function previewExposureHostname(status: NamespaceLeaseStatus | null, requestedHostname: string): string | null {
  return typeof status?.exposureHostname === 'string' && status.exposureHostname.trim() ? status.exposureHostname : requestedHostname;
}

function previewCredentialsRefAuthority(status: NamespaceLeaseStatus | null, requestedRef: string | null): string | null {
  return typeof status?.credentialsRef === 'string' && status.credentialsRef.trim() ? status.credentialsRef : requestedRef;
}

export function validateK8sNamespacePrefix(prefix: string): boolean {
  return SAFE_NAMESPACE_PREFIXES.includes(prefix);
}

function normalizeK8sNamespaceProjectSegment(project: unknown, maxLength: number): string {
  const projectValue = typeof project === 'string' && project.trim() ? project : 'project';
  const normalized = projectValue
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
  const segment = normalized ? normalized : 'project';
  const truncated = segment.slice(0, maxLength).replace(/-+$/g, '');
  return truncated ? truncated : 'project'.slice(0, maxLength);
}

export function buildK8sSuiteNamespace(prefix: string, project: unknown, runId: string): string {
  const maxProjectLength = Math.max(1, K8S_DNS_LABEL_MAX_LENGTH - prefix.length - runId.length - 2);
  const projectSegment = normalizeK8sNamespaceProjectSegment(project, maxProjectLength);
  return `${prefix}-${projectSegment}-${runId}`;
}

function isObjectDoc(doc: unknown): doc is AnyRecord {
  return Boolean(doc) && typeof doc === 'object' && !Array.isArray(doc);
}

function normalizeManifestNamespace(doc: AnyRecord, targetNs: string, log: SuiteLog): void {
  if (!isObjectDoc(doc)) return;
  if (doc.kind === 'List' && Array.isArray(doc.items)) {
    for (const item of doc.items) normalizeManifestNamespace(item, targetNs, log);
    return;
  }

  if (!isObjectDoc(doc.metadata)) doc.metadata = {};
  if (CLUSTER_SCOPED_KINDS.has(doc.kind)) {
    const name = typeof doc.metadata.name === 'string' && doc.metadata.name.trim() ? doc.metadata.name : 'name_missing';
    log(`  Rejected cluster-scoped manifest: ${doc.kind}/${name}`);
    throw new Error(`k8s manifests may not include cluster-scoped resources: ${doc.kind}/${name}`);
  }

  const previous = doc.metadata.namespace;
  doc.metadata.namespace = targetNs;
  if (previous && previous !== targetNs) {
    const kind = typeof doc.kind === 'string' && doc.kind.trim() ? doc.kind : 'object_kind_missing';
    const name = typeof doc.metadata.name === 'string' && doc.metadata.name.trim() ? doc.metadata.name : 'name_missing';
    log(`  Namespace: ${kind}/${name} "${previous}" → "${targetNs}"`);
  }
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
  const withoutDigest = image.split('@')[0];
  if (withoutDigest === undefined) return '';
  const lastSlash = withoutDigest.lastIndexOf('/');
  const lastColon = withoutDigest.lastIndexOf(':');
  if (lastColon > lastSlash) return withoutDigest.slice(0, lastColon);
  return withoutDigest;
}

function imageMatchesBuiltImageName(containerImage: string, imageName: string): boolean {
  const containerRepo = normalizeImageRepository(containerImage);
  const expectedRepo = normalizeImageRepository(imageName);
  if (selectTruthyValue(() => (!containerRepo), () => (!expectedRepo))) return false;
  if (containerRepo === expectedRepo) return true;
  if (expectedRepo.includes('/')) return false;
  const containerName = containerRepo.split('/').pop();
  return selectTruthyValue(() => (containerName === expectedRepo), () => (containerName?.startsWith(`${expectedRepo}-`) === true));
}

function rewritePodSpecImages(podSpec: AnyRecord, imageName: string, registryTag: string, log: SuiteLog): number {
  let rewrites = 0;
  for (const field of ['initContainers', 'containers']) {
    const containers = podSpec?.[field];
    if (!Array.isArray(containers)) continue;
    for (const container of containers) {
      if (selectTruthyValue(() => (!isObjectDoc(container)), () => (typeof container.image !== 'string'))) continue;
      if (!imageMatchesBuiltImageName(container.image, imageName)) continue;
      const containerName = typeof container.name === 'string' && container.name.trim() ? container.name : 'container_name_missing';
      log(`  Override ${field}: ${containerName} "${container.image}" → "${registryTag}"`);
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

export function kubectlOutputLooksLikeHtml(value: unknown): boolean {
  return /^\s*</.test(value == null ? '' : String(value));
}

function assertKubectlOutputNotHtml(value: unknown, label: string): void {
  if (kubectlOutputLooksLikeHtml(value)) {
    throw new Error(`${label} returned HTML instead of Kubernetes API data`);
  }
}

function parseKubectlJson(stdout: unknown, label: string): AnyRecord {
  assertKubectlOutputNotHtml(stdout, label);
  if (selectTruthyValue(() => (typeof stdout !== 'string'), () => (!stdout.trim()))) {
    throw new Error(`${label} returned empty JSON output`);
  }
  try {
    const parsed = JSON.parse(stdout);
    if (selectTruthyValue(() => (selectTruthyValue(() => (!parsed), () => (typeof parsed !== 'object'))), () => (Array.isArray(parsed)))) {
      throw new Error('JSON root is not an object');
    }
    return parsed as AnyRecord;
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${errorMessage(error)}`);
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim());
}

function isSuccessfulHttpStatus(statusCode: number): boolean {
  return Number.isInteger(statusCode) && statusCode >= 200 && statusCode < 400;
}

export function buildBusterNamespaceLease({ leaseName, namespaceName, namespacePrefix, serviceName, secretsToCopy, payload, ttlSeconds, cleanupPolicy, purpose, exposure }: {
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
}): AnyRecord {
  return {
    apiVersion: `${BUSTER_LEASE_API_GROUP}/${BUSTER_LEASE_API_VERSION}`,
    kind: 'BusterNamespaceLease',
    metadata: {
      name: leaseName,
      namespace: KUBECLAW_NS,
      labels: buildCleanupKubernetesLabels(payload),
    },
    spec: {
      namespaceName,
      namespacePrefix,
      runId: typeof payload.run_id === 'string' && payload.run_id.trim() ? payload.run_id : leaseName,
      project: typeof payload.project === 'string' && payload.project.trim() ? payload.project : 'project',
      purpose,
      capabilityProfile: 'default',
      cleanupPolicy,
      ttlSeconds,
      secretsToCopy,
      serviceName,
      exposure,
    },
  };
}

async function assertCanUseBusterNamespaceLease(verb: string, env: K8sCommandEnv): Promise<void> {
  const resource = `busternamespaceleases.${BUSTER_LEASE_API_GROUP}`;
  const { stdout } = await execFileAsync('kubectl', ['auth', 'can-i', verb, resource, '-n', KUBECLAW_NS], {
    timeout: 10000,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    env,
  });
  assertKubectlOutputNotHtml(stdout, `kubectl auth can-i ${verb} ${resource}`);
  if (String(stdout).trim() !== 'yes') {
    throw new Error(`current Kubernetes identity cannot ${verb} ${resource} in namespace ${KUBECLAW_NS}`);
  }
}

async function runNamespaceControllerPreflight(lease: AnyRecord, env: K8sCommandEnv): Promise<string> {
  const version = await execFileAsync('kubectl', ['get', '--raw=/version'], {
    timeout: 10000,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    env,
  });
  parseKubectlJson(version.stdout, 'kubectl get --raw=/version');

  const resources = await execFileAsync('kubectl', ['api-resources', `--api-group=${BUSTER_LEASE_API_GROUP}`, '-o', 'name'], {
    timeout: 10000,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
    env,
  });
  assertKubectlOutputNotHtml(resources.stdout, `kubectl api-resources --api-group=${BUSTER_LEASE_API_GROUP}`);
  if (!isNonEmptyString(resources.stdout)) {
    throw new Error(`kubectl api-resources --api-group=${BUSTER_LEASE_API_GROUP} returned empty output`);
  }
  const resourceNames = resources.stdout.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!resourceNames.some((name) => selectTruthyValue(() => (name === 'busternamespaceleases'), () => (name === `busternamespaceleases.${BUSTER_LEASE_API_GROUP}`)))) {
    throw new Error(`BusterNamespaceLease resource is not discoverable in API group ${BUSTER_LEASE_API_GROUP}`);
  }

  await assertCanUseBusterNamespaceLease('create', env);
  await assertCanUseBusterNamespaceLease('get', env);
  await assertCanUseBusterNamespaceLease('delete', env);

  try {
    await execFileWithInput('kubectl', ['apply', '--dry-run=server', '-f', '-'], `${JSON.stringify(lease)}\n`, { timeout: 15000, maxBuffer: 5 * 1024 * 1024, env });
  } catch (error) {
    const detail = errorOutput(error);
    assertKubectlOutputNotHtml(detail, 'kubectl apply --dry-run=server');
    throw new Error(`BusterNamespaceLease server-side dry-run failed: ${trimOut(detail)}`);
  }

  return 'Kubernetes API, BusterNamespaceLease discovery, RBAC, and server-side dry-run passed';
}

async function requestNamespaceLease({ leaseName, namespaceName, namespacePrefix, serviceName, secretsToCopy, payload, ttlSeconds, cleanupPolicy, purpose, exposure, log, env }: {
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
  env: K8sCommandEnv;
}): Promise<void> {
  const lease = buildBusterNamespaceLease({
    leaseName,
    namespaceName,
    namespacePrefix,
    serviceName,
    secretsToCopy,
    payload,
    ttlSeconds,
    cleanupPolicy,
    purpose,
    exposure,
  });

  log(`Requesting namespace lease ${KUBECLAW_NS}/${leaseName} → ${namespaceName}`);
  await execFileWithInput('kubectl', ['apply', '-f', '-'], `${JSON.stringify(lease)}\n`, { timeout: 15000, maxBuffer: 5 * 1024 * 1024, env });
}

function normalizeLeaseStatus(lease: AnyRecord): NamespaceLeaseStatus {
  return {
    namespaceName: typeof lease.status?.namespaceName === 'string' ? lease.status.namespaceName : '',
    previewUrl: typeof lease.status?.previewUrl === 'string' ? lease.status.previewUrl : null,
    exposurePhase: typeof lease.status?.exposurePhase === 'string' ? lease.status.exposurePhase : null,
    exposureHostname: typeof lease.status?.exposureHostname === 'string' ? lease.status.exposureHostname : null,
    credentialsRef: typeof lease.status?.credentialsRef === 'string' ? lease.status.credentialsRef : null,
    credentialsAvailable: lease.status?.credentialsAvailable === true,
    message: typeof lease.status?.message === 'string' ? lease.status.message : null,
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

function decodeSecretDataValue(value: unknown): string {
  if (selectTruthyValue(() => (typeof value !== 'string'), () => (!value.trim()))) throw new Error('secret data value is missing');
  return Buffer.from(value, 'base64').toString('utf8');
}

async function readTestCredentials(specs: TestCredentialSpec[], namespace: string, env: K8sCommandEnv): Promise<AnyRecord[]> {
  const credentials: AnyRecord[] = [];
  for (const spec of specs) {
    const { stdout } = await execFileAsync('kubectl', ['get', 'secret', spec.secretName, '-n', namespace, '-o', 'json'], {
      timeout: 10000,
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
      env,
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

async function readNamespaceLeaseStatus(leaseName: string, env: K8sCommandEnv): Promise<NamespaceLeaseStatus> {
  const { stdout } = await execFileAsync('kubectl', ['get', 'busternamespacelease', leaseName, '-n', KUBECLAW_NS, '-o', 'json'], {
    timeout: 10000,
    encoding: 'utf8',
    maxBuffer: 5 * 1024 * 1024,
    env,
  });
  return normalizeLeaseStatus(JSON.parse(stdout));
}

async function waitForNamespaceLeaseReady(leaseName: string, timeoutSeconds: number, log: SuiteLog, env: K8sCommandEnv): Promise<NamespaceLeaseStatus> {
  const deadline = Date.now() + timeoutSeconds * 1000;
  let lastMessage = '';
  while (Date.now() < deadline) {
    try {
      const { stdout } = await execFileAsync('kubectl', ['get', 'busternamespacelease', leaseName, '-n', KUBECLAW_NS, '-o', 'json'], {
        timeout: 10000,
        encoding: 'utf8',
        maxBuffer: 5 * 1024 * 1024,
        env,
      });
      const lease = JSON.parse(stdout);
      const phase = typeof lease.status?.phase === 'string' && lease.status.phase.trim() ? lease.status.phase : 'Pending';
      lastMessage = typeof lease.status?.message === 'string' && lease.status.message.trim() ? lease.status.message : phase;
      if (phase === 'Ready' && lease.status?.namespaceName) {
        log(`Namespace lease ready: ${lease.status.namespaceName}`);
        return normalizeLeaseStatus(lease);
      }
      if (selectTruthyValue(() => (phase === 'Rejected'), () => (phase === 'Failed'))) {
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

async function verifyCopiedSecrets(names: string[], targetNamespace: string, env: K8sCommandEnv): Promise<void> {
  for (const name of names) {
    try {
      await execFileAsync('kubectl', ['get', 'secret', name, '-n', targetNamespace], {
        timeout: 10000,
        encoding: 'utf8',
        env,
      });
    } catch (error) {
      throw new Error(`Required secret copy failed: ${name}: ${trimOut(errorOutput(error))}`);
    }
  }
}

async function waitForPreviewUrl(leaseName: string, timeoutSeconds: number, log: SuiteLog, env: K8sCommandEnv): Promise<NamespaceLeaseStatus> {
  const deadline = Date.now() + timeoutSeconds * 1000;
  let latest: NamespaceLeaseStatus | null = null;
  while (Date.now() < deadline) {
    latest = await readNamespaceLeaseStatus(leaseName, env);
    if (latest.previewUrl) {
      log(`Preview URL ready: ${latest.previewUrl}`);
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (latest == null) latest = await readNamespaceLeaseStatus(leaseName, env);
  const previewWaitReason = selectDefinedValue(() => (selectDefinedValue(() => (latest.message), () => (latest.exposurePhase))), () => ('preview_pending'));
  log(`Preview URL not ready after ${timeoutSeconds}s: ${previewWaitReason}`);
  return latest;
}

async function applyManifests(manifestPaths: string[], imageName: string, registryTag: string, targetNs: string, timeoutMs: number, log: SuiteLog, env: K8sCommandEnv): Promise<void> {
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
    const { stdout } = await execFileAsync('kubectl', ['apply', '-n', targetNs, '-f', tmpDir], { timeout: timeoutMs, encoding: 'utf8', env });
    log(`Applied:\n${stdout.trim()}`);
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); }
    catch (error) { log(`non-blocking manifest temp cleanup failed: ${errorMessage(error)}`); }
  }
}

async function listPodNames(ns: string, env: K8sCommandEnv): Promise<string[]> {
  const { stdout } = await execFileAsync('kubectl', ['get', 'pods', '-n', ns, '-o', 'json'], { timeout: 10000, encoding: 'utf8', env });
  const parsed = parseKubectlJson(stdout, 'kubectl get pods');
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  return items
    .map((item: AnyRecord) => item?.metadata?.name)
    .filter((name: unknown): name is string => typeof name === 'string' && name.length > 0);
}

async function waitForPods(ns: string, timeoutSeconds: number, log: SuiteLog, env: K8sCommandEnv): Promise<void> {
  log(`Waiting for pods in ${ns} (max ${timeoutSeconds}s)…`);
  const deadline = Date.now() + Math.max(1, timeoutSeconds) * 1000;
  let lastError: unknown = null;
  let observedPods = false;
  let readinessAttempt = 0;

  while (Date.now() < deadline) {
    const remainingSeconds = Math.max(1, Math.ceil((deadline - Date.now()) / 1000));
    let podNames: string[] = [];
    try {
      podNames = await listPodNames(ns, env);
    } catch (error) {
      lastError = error;
      log(`Pod discovery failed: ${trimOut(errorOutput(error), 300)}`);
    }

    if (podNames.length === 0) {
      log(`No pods visible in ${ns} yet; retrying`);
      await sleepMs(Math.min(2000, Math.max(250, deadline - Date.now())));
      continue;
    }

    observedPods = true;
    const waitSeconds = Math.max(1, Math.min(remainingSeconds, 30));
    readinessAttempt += 1;
    log(`Pod readiness attempt ${readinessAttempt}: waiting for ${podNames.length} pod(s): ${podNames.join(', ')}`);
    try {
      await execFileAsync('kubectl', ['wait', '--for=condition=Ready', 'pod', '--all', '-n', ns, `--timeout=${waitSeconds}s`], { timeout: (waitSeconds + 10) * 1000, encoding: 'utf8', env });
      if (readinessAttempt > 1) log(`Pod readiness settled after ${readinessAttempt} attempt(s)`);
      return;
    } catch (error) {
      lastError = error;
      log(`Pod readiness pending after attempt ${readinessAttempt}; retrying until timeout: ${trimOut(errorOutput(error), 300)}`);
      if (Date.now() < deadline) await sleepMs(Math.min(2000, Math.max(250, deadline - Date.now())));
    }
  }

  const reason = observedPods
    ? `pod readiness did not settle before timeout: ${trimOut(errorOutput(lastError), 500)}`
    : `no pods became visible before timeout: ${trimOut(errorOutput(lastError), 500)}`;
  throw new Error(reason);
}

async function getPodStatus(ns: string, env: K8sCommandEnv): Promise<string> {
  try {
    const { stdout } = await execFileAsync('kubectl', ['get', 'pods', '-n', ns, '-o', 'wide'], { timeout: 10000, encoding: 'utf8', env });
    return stdout.trim().split('\n').slice(0, 10).join('\n');
  } catch (_error) {
    return '(could not retrieve pod status)';
  }
}

async function httpHealthCheck(url: string, log: SuiteLog): Promise<number> {
  log(`Health check: ${url}`);
  const { stdout } = await execFileAsync('curl', ['-sS', '--connect-timeout', '10', '--max-time', '30', '-o', '/dev/null', '-w', '%{http_code}', url], { timeout: 45000, encoding: 'utf8', env: buildSubprocessEnv() });
  const code = parseInt(stdout.trim(), 10);
  log(`Health check: HTTP ${code}`);
  return code;
}

export function shouldUsePortForwardHealthCheck({ purpose, previewExposureProvider }: { purpose: string; previewExposureProvider: string }): boolean {
  return !(purpose === 'final-preview' && previewExposureProvider === 'tailscale-ingress');
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryHttpHealthCheck(url: string, log: SuiteLog, retries: number, baseDelayMs: number): Promise<number> {
  let lastError: unknown = null;
  const attempts = Math.max(1, Math.floor(retries));
  const delayMs = Math.max(0, Math.floor(baseDelayMs));

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const code = await httpHealthCheck(url, log);
      if (code >= 200 && code < 400) return code;
      lastError = new Error(`HTTP ${code} (expected 2xx/3xx)`);
    } catch (error) {
      lastError = error;
    }

    if (attempt < attempts) {
      log(`Health check attempt ${attempt}/${attempts} not ready: ${trimOut(errorOutput(lastError), 300)}; retrying in ${delayMs}ms`);
      if (delayMs > 0) await sleepMs(delayMs);
    }
  }

  const failureDetail = trimOut(errorOutput(lastError), 300);
  throw new Error(failureDetail ? failureDetail : 'health_check_failed_without_detail');
}

async function httpTextCheck(url: string, expectedText: string | null, log: SuiteLog): Promise<{ body: string; statusCode: number }> {
  log(`Internal service check: ${url}`);
  const { stdout } = await execFileAsync('curl', ['-sS', '-L', '--connect-timeout', '10', '--max-time', '30', '-w', '\n%{http_code}', url], {
    timeout: 45000,
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
    env: buildSubprocessEnv(),
  });
  const newline = stdout.lastIndexOf('\n');
  const body = newline >= 0 ? stdout.slice(0, newline) : stdout;
  const statusCode = parseInt((newline >= 0 ? stdout.slice(newline + 1) : '').trim(), 10);
  if (!isSuccessfulHttpStatus(statusCode)) {
    throw new Error(`HTTP ${Number.isInteger(statusCode) ? statusCode : 'missing_http_status'} (expected 2xx/3xx)`);
  }
  if (expectedText && !body.includes(expectedText)) {
    throw new Error(`Internal service did not serve expected text "${expectedText}"`);
  }
  log(`Internal service check: HTTP ${statusCode}, ${body.length} byte(s)${expectedText ? ` containing "${expectedText}"` : ''}`);
  return { body, statusCode };
}

async function retryHttpTextCheck(url: string, expectedText: string | null, log: SuiteLog, retries: number, baseDelayMs: number): Promise<{ body: string; statusCode: number }> {
  let lastError: unknown = null;
  const attempts = Math.max(1, Math.floor(retries));
  const delayMs = Math.max(0, Math.floor(baseDelayMs));

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await httpTextCheck(url, expectedText, log);
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts) {
      log(`Internal service check attempt ${attempt}/${attempts} not ready: ${trimOut(errorOutput(lastError), 300)}; retrying in ${delayMs}ms`);
      if (delayMs > 0) await sleepMs(delayMs);
    }
  }

  const failureDetail = trimOut(errorOutput(lastError), 300);
  throw new Error(failureDetail ? failureDetail : 'internal_service_check_failed_without_detail');
}

function configFailure(startTime: number, message: string, rule: string): SuiteVerdict {
  const check = makeCheck(rule, false, message);
  return createSuiteVerdict('k8s', STATUS.FAIL, {
    critical: true,
    duration_ms: Date.now() - startTime,
    checks_total: 1,
    checks_passed: 0,
    checks_failed: 1,
    findings: [createFinding(SEVERITY.CRITICAL, message, { rule })],
    reason: message,
    metadata: { checks: [check] },
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
    if (logSink) logSink({ suite: 'k8s', check, status, detail: selectTruthyValue(() => (detail), () => (null)), elapsed_seconds: Math.ceil((Date.now() - startTime) / 1000) });
  };

  const k8sCfg = normalizeK8sConfig(context.config?.k8s);
  const k8sCommandEnv = buildK8sCommandEnv(k8sCfg.kubeconfig_path);
  const registryLocal = resolveK8sLocalRegistry();
  const repoRoot = k8sRepoRoot(context);
  const sourceImage = typeof k8sCfg.source_image === 'string' && k8sCfg.source_image.trim()
    ? k8sCfg.source_image.trim()
    : null;
  const dockerfile = sourceImage
    ? null
    : (k8sCfg.dockerfile ? resolveRepoScopedPath(k8sCfg.dockerfile, { repoDir: repoRoot, field: 'k8s.dockerfile' }) : null);
  const imageName = k8sCfg.image_name;
  const serviceName = k8sCfg.service_name;
  const manifestInputs = Array.isArray(k8sCfg.manifests) ? k8sCfg.manifests : [];
  const manifestPaths = manifestInputs.map((manifest: unknown) => resolveRepoScopedPath(manifest, { repoDir: repoRoot, field: 'k8s.manifests[]' })).filter((manifest: string | null): manifest is string => Boolean(manifest));

  if (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (!imageName), () => (!serviceName))), () => (manifestInputs.length === 0))), () => (manifestPaths.length !== manifestInputs.length))) {
    return configFailure(startTime, 'k8s suite requires image_name, service_name, and valid manifests[]', 'k8s-config-required');
  }
  if (!sourceImage && !dockerfile) return configFailure(startTime, 'k8s suite requires either source_image or dockerfile', 'k8s-image-source-required');

  const buildContext = sourceImage
    ? null
    : (k8sCfg.build_context ? resolveRepoScopedPath(k8sCfg.build_context, { repoDir: repoRoot, field: 'k8s.build_context' }) : path.dirname(dockerfile as string));
  if (!sourceImage && !buildContext) return configFailure(startTime, 'k8s.build_context is invalid', 'k8s-build-context');
  const port = k8sCfg.port;
  const healthPath = k8sCfg.health_path;
  const readyTimeout = k8sCfg.ready_timeout_seconds;
  const nsPrefix = k8sCfg.namespace_prefix;
  const configuredSecretsToCopy = k8sCfg.secrets_to_copy;
  const namespaceLeaseTimeout = k8sCfg.namespace_lease_timeout_seconds;
  const namespaceTtlSeconds = k8sCfg.namespace_ttl_seconds;
  const cleanupPolicy = k8sCfg.cleanup_policy;
  const purpose = k8sCfg.purpose;
  const previewCfg = k8sCfg.preview;
  const previewExposureProvider = purpose === 'final-preview'
    ? k8sCfg.preview_provider
    : 'off';
  const previewPath = k8sCfg.preview_path;
  const previewCredentialsRef = typeof previewCfg.credentials_ref === 'string' ? previewCfg.credentials_ref : null;
  const previewCredentialsSecretName = typeof previewCfg.credentials_secret_name === 'string'
    ? previewCfg.credentials_secret_name
    : null;
  const previewRevealCredentials = purpose === 'final-preview'
    && (selectTruthyValue(() => (previewCfg.reveal_credentials === true), () => (previewCfg.credentials_delivery === 'discord')));
  const previewCredentialsKeys = Array.isArray(previewCfg.credentials_keys)
    ? previewCfg.credentials_keys.filter((key: unknown): key is string => typeof key === 'string' && Boolean(key.trim()))
    : [];
  const previewCredentialSecretName = previewCredentialSecretAuthority(previewCredentialsSecretName, previewCredentialsRef);
  const previewExpectedText = typeof previewCfg.expected_text === 'string' && previewCfg.expected_text
    ? previewCfg.expected_text
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
  ]);
  const previewUrlTimeoutSeconds = k8sCfg.preview_url_timeout_seconds;
  const buildTimeoutMs = k8sCfg.build_timeout_seconds * 1000;
  const pushTimeoutMs = k8sCfg.push_timeout_seconds * 1000;
  const deployTimeoutMs = k8sCfg.deploy_timeout_seconds * 1000;
  const healthRetries = k8sCfg.health_retries;
  const healthBaseDelayMs = k8sCfg.health_base_delay_ms;

  if (!validateK8sNamespacePrefix(nsPrefix)) {
    const detail = `Invalid k8s namespace_prefix "${nsPrefix}"; expected one of: ${SAFE_NAMESPACE_PREFIXES.join(', ')}`;
    return configFailure(startTime, detail, 'namespace-prefix');
  }

  if (!validateK8sServicePort(port)) {
    const detail = `Invalid k8s service port ${port}; expected integer 1-65535`;
    return configFailure(startTime, detail, 'service-port');
  }

  const runId = shortId();
  const testNs = buildK8sSuiteNamespace(nsPrefix, payload?.project, runId);
  const leaseName = testNs;
  const previewCredentialCommand = previewRevealCredentials
    ? buildPreviewCredentialCommand(previewCredentialSecretName, previewCredentialsKeys, testNs)
    : null;
  const payloadProject = typeof payload.project === 'string' && payload.project.trim() ? payload.project : 'project';
  const requestedPreviewHostname = selectDefinedValue(() => (previewCfg.hostname), () => (`${payloadProject}-${runId}-${serviceName}`));
  const previewHostname = sanitizeDnsLabel(requestedPreviewHostname, `${testNs}-${serviceName}`);
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
  const registryTag = `${registryLocal}/${imageName}:${runId}`;
  trackRuntimeResources(payload, { leases: [leaseName] });
  log(`Starting: module=${moduleId} project=${payload?.project} ns=${testNs}`);
  const namespaceLease = buildBusterNamespaceLease({
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
  });

  const checks: Check[] = [];
  let criticalFailed = false;
  let leaseStatus: NamespaceLeaseStatus | null = null;
  let previewLeaseStatus: NamespaceLeaseStatus | null = null;
  let testCredentials: AnyRecord[] = [];
  let internalBodyBytes: number | null = null;
  let sourceImageId: string | null = null;
  let registryImageDigest: string | null = null;
  let deploymentImage: string | null = null;

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

  await runStep('k8s-capability-preflight', `Validating namespace controller access for ${testNs}`, async () => {
    return await runNamespaceControllerPreflight(namespaceLease, k8sCommandEnv);
  });
  if (sourceImage) {
    await runStep('source-image-promote', `Promoting ${sourceImage} to ${registryLocal}`, async () => {
      const result = await copyAndPushImage({ sourceImage, image: registryTag, timeoutMs: pushTimeoutMs, log });
      sourceImageId = result.digest;
      registryImageDigest = result.digest;
      deploymentImage = result.immutableImage;
      return `Promoted: ${sourceImage} -> ${result.immutableImage}`;
    });
  } else {
    await runStep('buildkit-build-push', `Building and publishing ${imageName} from ${k8sCfg.dockerfile}`, async () => {
      const result = await buildAndPushImage({
        dockerfile: dockerfile as string,
        contextDir: buildContext as string,
        image: registryTag,
        timeoutMs: buildTimeoutMs + pushTimeoutMs,
        log,
      });
      registryImageDigest = result.digest;
      deploymentImage = result.immutableImage;
      return `Published: ${result.immutableImage}`;
    });
  }
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
      env: k8sCommandEnv,
    });
    leaseStatus = await waitForNamespaceLeaseReady(leaseName, namespaceLeaseTimeout, log, k8sCommandEnv);
    const readyNamespace = leaseStatus.namespaceName;
    if (readyNamespace !== testNs) throw new Error(`Lease returned unexpected namespace ${readyNamespace}`);
    return `Ready: ${testNs}`;
  });
  await runStep('secret-copy', `${secretsToCopy.length} required secret(s) → ${testNs}`, async () => {
    await verifyCopiedSecrets(secretsToCopy, testNs, k8sCommandEnv);
    return secretsToCopy.length > 0
      ? `Required secrets copied: ${secretsToCopy.join(', ')}`
      : 'No required secrets requested';
  });
  await runStep('manifest-apply', `${manifestPaths.length} manifest(s) → ${testNs}`, async () => {
    if (!deploymentImage) throw new Error('BuildKit image digest missing before manifest apply');
    await applyManifests(manifestPaths, imageName, deploymentImage, testNs, deployTimeoutMs, log, k8sCommandEnv);
    return `${manifestPaths.length} manifest(s) applied`;
  });
  await runStep('test-credentials', `${testCredentialSpecs.length} app test credential secret(s)`, async () => {
    testCredentials = await readTestCredentials(testCredentialSpecs, testNs, k8sCommandEnv);
    return testCredentials.length > 0
      ? `Decoded app test credentials: ${testCredentials.map((entry) => entry.secret).join(', ')}`
      : 'No app test credentials requested';
  });
  await runStep('pods-ready', `Waiting up to ${readyTimeout}s in ${testNs}`, async () => {
    try {
      await waitForPods(testNs, readyTimeout, log, k8sCommandEnv);
      return `All pods ready in ${testNs}`;
    } catch (error) {
      const podStatus = await getPodStatus(testNs, k8sCommandEnv);
      throw new Error(`Pods not ready within ${readyTimeout}s. Pod status:\n${podStatus}`);
    }
  });

  const serviceHealthPath = purpose === 'final-preview' ? previewPath : healthPath;
  const serviceUrl = `http://${serviceName}.${testNs}.svc.cluster.local:${port}${serviceHealthPath}`;
  let httpCode: number | null = null;
  if (shouldUsePortForwardHealthCheck({ purpose, previewExposureProvider })) {
    await runStep('health-check', serviceUrl, async () => {
      httpCode = await withServicePortForward(testNs, serviceName, port, healthPath, log, k8sCommandEnv, async (localUrl) => {
        return await retryHttpHealthCheck(localUrl, log, healthRetries, healthBaseDelayMs);
      });
      return `HTTP ${httpCode} OK`;
    });
  } else {
    await runStep('health-check', serviceUrl, async () => {
      const result = await retryHttpTextCheck(serviceUrl, previewExpectedText, log, healthRetries, healthBaseDelayMs);
      httpCode = result.statusCode;
      internalBodyBytes = result.body.length;
      return previewExpectedText
        ? `Internal service served expected text "${previewExpectedText}"`
        : `Internal service returned HTTP ${httpCode}`;
    });
  }
  if (!criticalFailed && purpose === 'final-preview' && previewExposureProvider === 'tailscale-ingress') {
    await runStep('preview-url', `Waiting up to ${previewUrlTimeoutSeconds}s for Tailscale URL`, async () => {
      previewLeaseStatus = await waitForPreviewUrl(leaseName, previewUrlTimeoutSeconds, log, k8sCommandEnv);
      if (!previewLeaseStatus.previewUrl) {
        const previewMissingReason = selectDefinedValue(() => (selectDefinedValue(() => (previewLeaseStatus.message), () => (previewLeaseStatus.exposurePhase))), () => ('preview_pending'));
        throw new Error(`Preview URL missing: ${previewMissingReason}`);
      }
      return `Preview: ${previewLeaseStatus.previewUrl}`;
    });
  }

  const duration_ms = Date.now() - startTime;
  const checks_passed = checks.filter((check) => check.passed).length;
  const checks_failed = checks.filter((check) => !check.passed).length;
  const status: SuiteStatus = checks_failed === 0 ? STATUS.PASS : STATUS.FAIL;
  const findings: Finding[] = checks.filter((check) => !check.passed).map((check) => createFinding(SEVERITY.CRITICAL, check.detail, { rule: check.name }));
  const topFinding = selectTruthyValue(() => (checks.find((check) => !check.passed)?.detail), () => (null));
  const previewCredentials = selectTruthyValue(() => (testCredentials.find((entry) => entry?.purpose === 'final-preview login')?.values), () => (null));

  log(`Result: ${status} — ${checks_passed}/${checks.length} checks (${duration_ms}ms)`);
  if (status === STATUS.PASS) log(`Service URL for buster: ${serviceUrl}`);
  const finalLeaseStatus = finalPreviewLeaseStatus(previewLeaseStatus, leaseStatus);

  return createSuiteVerdict('k8s', status, {
    critical: true,
    duration_ms,
    checks_total: checks.length,
    checks_passed,
    checks_failed,
    findings,
    metadata: {
      test_namespace: testNs,
      source_image: sourceImage,
      source_image_id: sourceImageId,
      registry_image: registryTag,
      deployed_image: deploymentImage,
      registry_image_digest: registryImageDigest,
      image_promotion: sourceImage
        ? {
          source_image: sourceImage,
          source_image_id: sourceImageId,
          registry_image: registryTag,
          registry_image_digest: registryImageDigest,
        }
        : null,
      service_url: serviceUrl,
      preview_url: selectTruthyValue(() => (finalLeaseStatus?.previewUrl), () => (null)),
      preview_exposure_provider: previewExposureProvider,
      preview_exposure_phase: selectTruthyValue(() => (finalLeaseStatus?.exposurePhase), () => (null)),
      preview_exposure_hostname: previewExposureHostname(finalLeaseStatus, previewHostname),
      preview_credentials_ref: previewCredentialsRefAuthority(finalLeaseStatus, previewCredentialsRef),
      preview_credentials_available: finalLeaseStatus?.credentialsAvailable === true,
      preview_credentials_command: previewCredentialCommand,
      preview_credentials: previewCredentials,
      preview_expected_text: previewExpectedText,
      internal_body_bytes: internalBodyBytes,
      test_credentials: testCredentials,
      cleanup_policy: cleanupPolicy,
      purpose,
      health_http_code: httpCode,
      top_finding: topFinding,
      checks: checks.map((check) => ({ name: check.name, passed: check.passed, detail: check.detail.slice(0, 300) })),
    },
  });
}
