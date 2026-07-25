import { selectTruthyValue } from '../optional-absence.ts';
// KEEP_TYPED_POLICY: Kubernetes defaults define bounded ephemeral deployment;
// safe namespace prefixes prevent broad targeting; production manifests are
// adapted to the ephemeral namespace/image; temp cleanup and readiness
// diagnostics are nonblocking after the primary deploy result is captured.
// DELETE_LEGACY: requested k8s config, requested manifests, and requested
// secret propagation must fail loudly when missing or broken.

import { execFile } from 'child_process';
import { promisify } from 'util';
import { getRepoRoot } from '../services/git-workflows.ts';
import { buildCleanupKubernetesLabels } from '../services/resource-cleanup.ts';
import { dumpYamlDocuments, loadYamlDocuments } from './manifest.ts';
import { parseSecretNameFromRef } from './k8s-credentials.ts';
import { busterEnvironmentSnapshot, readBusterEnvironment } from '../runtime-environment.ts';
import type { BusterEnvironmentKey } from '../runtime-environment.ts';

export type AnyRecord = Record<string, any>;
export type SuiteLog = (msg: string) => void;
export type Check = { name: string; passed: boolean; detail: string };
export type NamespaceLeaseStatus = { namespaceName: string; previewUrl: string | null; exposurePhase: string | null; exposureHostname: string | null; credentialsRef: string | null; credentialsAvailable: boolean; message: string | null };

export interface K8sContext {
  payload?: AnyRecord;
  moduleId?: string;
  logSink?: any;
  telemetryContext?: unknown;
  repoRoot?: string;
  config?: { k8s?: AnyRecord };
}

export const execFileAsync = promisify(execFile) as any;
function envStringOrDefault(name: BusterEnvironmentKey, defaultValue: string): string {
  const value = readBusterEnvironment(name);
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
export function resolveK8sLocalRegistry(env: Record<string, string | undefined> = busterEnvironmentSnapshot()): string {
  return registryHost(requiredEnvString(env, 'KUBECLAW_LOCAL_REGISTRY'));
}
export const KUBECLAW_NS = envStringOrDefault('KUBECLAW_NAMESPACE', 'kubeclaw');
export const BUSTER_LEASE_API_GROUP = envStringOrDefault('BUSTER_LEASE_API_GROUP', 'kubeclaw.forgestack.ai');
const BUSTER_LEASE_API_VERSION = envStringOrDefault('BUSTER_LEASE_API_VERSION', 'v1alpha1');
const K8S_DNS_LABEL_MAX_LENGTH = 63;
export const SAFE_NAMESPACE_PREFIXES = Object.freeze(['test']);
const CLUSTER_SCOPED_KINDS = new Set(['APIService', 'CertificateSigningRequest', 'ClusterRole', 'ClusterRoleBinding', 'CSIDriver', 'CSINode', 'CustomResourceDefinition', 'FlowSchema', 'IngressClass', 'MutatingWebhookConfiguration', 'Namespace', 'Node', 'PersistentVolume', 'PodSecurityPolicy', 'PriorityClass', 'PriorityLevelConfiguration', 'RuntimeClass', 'StorageClass', 'ValidatingAdmissionPolicy', 'ValidatingAdmissionPolicyBinding', 'ValidatingWebhookConfiguration', 'VolumeSnapshotClass']);

export function shortId(): string { return Math.random().toString(36).slice(2, 8); }

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error === undefined) return 'error_detail_missing';
  if (error === null) return 'error_detail_null';
  return String(error);
}

export function errorOutput(error: any): string {
  const output = `${typeof error?.stderr === 'string' ? error.stderr : ''}${typeof error?.stdout === 'string' ? error.stdout : ''}`;
  return output || errorMessage(error);
}

export function trimOut(value: unknown, max = 800): string {
  const text = value == null ? '' : String(value).trim();
  return text.length <= max ? text : `${text.slice(0, max)}…[${text.length - max} chars]`;
}

export function validateK8sServicePort(port: unknown): boolean { return Number.isInteger(port) && Number(port) >= 1 && Number(port) <= 65535; }

export function makeCheck(name: string, passed: boolean, detail = ''): Check {
  return { name, passed, detail };
}

export function sanitizeDnsLabel(value: unknown, fallback = 'preview'): string {
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

export function k8sRepoRoot(context: K8sContext): string {
  return typeof context.repoRoot === 'string' && context.repoRoot.trim() ? context.repoRoot : getRepoRoot();
}

export function previewCredentialSecretAuthority(secretName: string | null, credentialsRef: string | null): string | null {
  return typeof secretName === 'string' && secretName.trim() ? secretName : parseSecretNameFromRef(credentialsRef);
}

export function finalPreviewLeaseStatus(previewLeaseStatus: NamespaceLeaseStatus | null, leaseStatus: NamespaceLeaseStatus | null): NamespaceLeaseStatus | null {
  return previewLeaseStatus !== undefined && previewLeaseStatus !== null ? previewLeaseStatus : leaseStatus;
}

export function previewExposureHostname(status: NamespaceLeaseStatus | null, requestedHostname: string): string | null {
  return typeof status?.exposureHostname === 'string' && status.exposureHostname.trim() ? status.exposureHostname : requestedHostname;
}

export function previewCredentialsRefAuthority(status: NamespaceLeaseStatus | null, requestedRef: string | null): string | null {
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

export function assertKubectlOutputNotHtml(value: unknown, label: string): void {
  if (kubectlOutputLooksLikeHtml(value)) {
    throw new Error(`${label} returned HTML instead of Kubernetes API data`);
  }
}

export function parseKubectlJson(stdout: unknown, label: string): AnyRecord {
  assertKubectlOutputNotHtml(stdout, label);
  if (typeof stdout !== 'string' || !stdout.trim()) {
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

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim());
}

export function isSuccessfulHttpStatus(statusCode: number): boolean {
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
