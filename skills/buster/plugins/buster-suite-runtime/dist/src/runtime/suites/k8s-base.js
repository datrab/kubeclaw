import { selectTruthyValue } from '../optional-absence.js';
// KEEP_TYPED_POLICY: Kubernetes defaults define bounded ephemeral deployment;
// safe namespace prefixes prevent broad targeting; production manifests are
// adapted to the ephemeral namespace/image; temp cleanup and readiness
// diagnostics are nonblocking after the primary deploy result is captured.
// DELETE_LEGACY: requested k8s config, requested manifests, and requested
// secret propagation must fail loudly when missing or broken.
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getRepoRoot } from '../services/git-workflows.js';
import { buildCleanupKubernetesLabels } from '../services/resource-cleanup.js';
import { dumpYamlDocuments, loadYamlDocuments } from './manifest.js';
import { parseSecretNameFromRef } from './k8s-credentials.js';
import { busterEnvironmentSnapshot, readBusterEnvironment } from '../buster-environment.js';
export const execFileAsync = promisify(execFile);
function envStringOrDefault(name, defaultValue) {
    const value = readBusterEnvironment(name);
    return typeof value === 'string' && value.trim() ? value.trim() : defaultValue;
}
function requiredEnvString(env, name) {
    const value = env[name];
    if (typeof value === 'string' && value.trim())
        return value.trim();
    throw new Error(`${name} is required deployment infrastructure env`);
}
function registryHost(value) {
    return value.replace(/^https?:\/\//, '').replace(/\/+$/, '');
}
export function resolveK8sLocalRegistry(env = busterEnvironmentSnapshot()) {
    return registryHost(requiredEnvString(env, 'KUBECLAW_LOCAL_REGISTRY'));
}
export const KUBECLAW_NS = envStringOrDefault('KUBECLAW_NAMESPACE', 'kubeclaw');
export const BUSTER_LEASE_API_GROUP = envStringOrDefault('BUSTER_LEASE_API_GROUP', 'kubeclaw.forgestack.ai');
const BUSTER_LEASE_API_VERSION = envStringOrDefault('BUSTER_LEASE_API_VERSION', 'v1alpha1');
const K8S_DNS_LABEL_MAX_LENGTH = 63;
export const SAFE_NAMESPACE_PREFIXES = Object.freeze(['test']);
const CLUSTER_SCOPED_KINDS = new Set(['APIService', 'CertificateSigningRequest', 'ClusterRole', 'ClusterRoleBinding', 'CSIDriver', 'CSINode', 'CustomResourceDefinition', 'FlowSchema', 'IngressClass', 'MutatingWebhookConfiguration', 'Namespace', 'Node', 'PersistentVolume', 'PodSecurityPolicy', 'PriorityClass', 'PriorityLevelConfiguration', 'RuntimeClass', 'StorageClass', 'ValidatingAdmissionPolicy', 'ValidatingAdmissionPolicyBinding', 'ValidatingWebhookConfiguration', 'VolumeSnapshotClass']);
export function shortId() { return Math.random().toString(36).slice(2, 8); }
export function errorMessage(error) {
    if (error instanceof Error)
        return error.message;
    if (error === undefined)
        return 'error_detail_missing';
    if (error === null)
        return 'error_detail_null';
    return String(error);
}
export function errorOutput(error) {
    const output = `${typeof error?.stderr === 'string' ? error.stderr : ''}${typeof error?.stdout === 'string' ? error.stdout : ''}`;
    return output || errorMessage(error);
}
export function trimOut(value, max = 800) {
    const text = value == null ? '' : String(value).trim();
    return text.length <= max ? text : `${text.slice(0, max)}…[${text.length - max} chars]`;
}
export function validateK8sServicePort(port) { return Number.isInteger(port) && Number(port) >= 1 && Number(port) <= 65535; }
export function makeCheck(name, passed, detail = '') {
    return { name, passed, detail };
}
export function sanitizeDnsLabel(value, fallback = 'preview') {
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
export function k8sRepoRoot(context) {
    return typeof context.repoRoot === 'string' && context.repoRoot.trim() ? context.repoRoot : getRepoRoot();
}
export function previewCredentialSecretAuthority(secretName, credentialsRef) {
    return typeof secretName === 'string' && secretName.trim() ? secretName : parseSecretNameFromRef(credentialsRef);
}
export function finalPreviewLeaseStatus(previewLeaseStatus, leaseStatus) {
    return previewLeaseStatus !== undefined && previewLeaseStatus !== null ? previewLeaseStatus : leaseStatus;
}
export function previewExposureHostname(status, requestedHostname) {
    return typeof status?.exposureHostname === 'string' && status.exposureHostname.trim() ? status.exposureHostname : requestedHostname;
}
export function previewCredentialsRefAuthority(status, requestedRef) {
    return typeof status?.credentialsRef === 'string' && status.credentialsRef.trim() ? status.credentialsRef : requestedRef;
}
export function validateK8sNamespacePrefix(prefix) {
    return SAFE_NAMESPACE_PREFIXES.includes(prefix);
}
function normalizeK8sNamespaceProjectSegment(project, maxLength) {
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
export function buildK8sSuiteNamespace(prefix, project, runId) {
    const maxProjectLength = Math.max(1, K8S_DNS_LABEL_MAX_LENGTH - prefix.length - runId.length - 2);
    const projectSegment = normalizeK8sNamespaceProjectSegment(project, maxProjectLength);
    return `${prefix}-${projectSegment}-${runId}`;
}
function isObjectDoc(doc) {
    return Boolean(doc) && typeof doc === 'object' && !Array.isArray(doc);
}
function normalizeManifestNamespace(doc, targetNs, log) {
    if (!isObjectDoc(doc))
        return;
    if (doc.kind === 'List' && Array.isArray(doc.items)) {
        for (const item of doc.items)
            normalizeManifestNamespace(item, targetNs, log);
        return;
    }
    if (!isObjectDoc(doc.metadata))
        doc.metadata = {};
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
function collectPodSpecs(doc, specs = []) {
    if (!isObjectDoc(doc))
        return specs;
    if (doc.kind === 'List' && Array.isArray(doc.items)) {
        for (const item of doc.items)
            collectPodSpecs(item, specs);
        return specs;
    }
    if (isObjectDoc(doc.spec)) {
        if (doc.kind === 'Pod')
            specs.push(doc.spec);
        if (isObjectDoc(doc.spec.template?.spec))
            specs.push(doc.spec.template.spec);
        if (isObjectDoc(doc.spec.jobTemplate?.spec?.template?.spec))
            specs.push(doc.spec.jobTemplate.spec.template.spec);
    }
    return specs;
}
function normalizeImageRepository(image) {
    const withoutDigest = image.split('@')[0];
    if (withoutDigest === undefined)
        return '';
    const lastSlash = withoutDigest.lastIndexOf('/');
    const lastColon = withoutDigest.lastIndexOf(':');
    if (lastColon > lastSlash)
        return withoutDigest.slice(0, lastColon);
    return withoutDigest;
}
function imageMatchesBuiltImageName(containerImage, imageName) {
    const containerRepo = normalizeImageRepository(containerImage);
    const expectedRepo = normalizeImageRepository(imageName);
    if (selectTruthyValue(() => (!containerRepo), () => (!expectedRepo)))
        return false;
    if (containerRepo === expectedRepo)
        return true;
    if (expectedRepo.includes('/'))
        return false;
    const containerName = containerRepo.split('/').pop();
    return selectTruthyValue(() => (containerName === expectedRepo), () => (containerName?.startsWith(`${expectedRepo}-`) === true));
}
function rewritePodSpecImages(podSpec, imageName, registryTag, log) {
    let rewrites = 0;
    for (const field of ['initContainers', 'containers']) {
        const containers = podSpec?.[field];
        if (!Array.isArray(containers))
            continue;
        for (const container of containers) {
            if (selectTruthyValue(() => (!isObjectDoc(container)), () => (typeof container.image !== 'string')))
                continue;
            if (!imageMatchesBuiltImageName(container.image, imageName))
                continue;
            const containerName = typeof container.name === 'string' && container.name.trim() ? container.name : 'container_name_missing';
            log(`  Override ${field}: ${containerName} "${container.image}" → "${registryTag}"`);
            container.image = registryTag;
            rewrites++;
        }
    }
    return rewrites;
}
export function renderManifestForK8sSuiteWithStats(content, imageName, registryTag, targetNs, log = () => { }) {
    const docs = loadYamlDocuments(content);
    let imageRewrites = 0;
    for (const doc of docs) {
        normalizeManifestNamespace(doc, targetNs, log);
        for (const podSpec of collectPodSpecs(doc))
            imageRewrites += rewritePodSpecImages(podSpec, imageName, registryTag, log);
    }
    return { content: dumpYamlDocuments(docs), imageRewrites };
}
export function renderManifestForK8sSuite(content, imageName, registryTag, targetNs, log = () => { }) {
    return renderManifestForK8sSuiteWithStats(content, imageName, registryTag, targetNs, log).content;
}
export function kubectlOutputLooksLikeHtml(value) {
    return /^\s*</.test(value == null ? '' : String(value));
}
export function assertKubectlOutputNotHtml(value, label) {
    if (kubectlOutputLooksLikeHtml(value)) {
        throw new Error(`${label} returned HTML instead of Kubernetes API data`);
    }
}
export function parseKubectlJson(stdout, label) {
    assertKubectlOutputNotHtml(stdout, label);
    if (typeof stdout !== 'string' || !stdout.trim()) {
        throw new Error(`${label} returned empty JSON output`);
    }
    try {
        const parsed = JSON.parse(stdout);
        if (selectTruthyValue(() => (selectTruthyValue(() => (!parsed), () => (typeof parsed !== 'object'))), () => (Array.isArray(parsed)))) {
            throw new Error('JSON root is not an object');
        }
        return parsed;
    }
    catch (error) {
        throw new Error(`${label} returned invalid JSON: ${errorMessage(error)}`);
    }
}
export function isNonEmptyString(value) {
    return typeof value === 'string' && Boolean(value.trim());
}
export function isSuccessfulHttpStatus(statusCode) {
    return Number.isInteger(statusCode) && statusCode >= 200 && statusCode < 400;
}
export function buildBusterNamespaceLease({ leaseName, namespaceName, namespacePrefix, serviceName, secretsToCopy, payload, ttlSeconds, cleanupPolicy, purpose, exposure }) {
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
