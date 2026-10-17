import type { BusterManifestPolicy } from '@kubeclaw/plugin-foundation/config/buster-cluster-invokers';
import { boundedManifestDocuments } from './kubernetes-manifest.ts';
import { flattenDocuments } from './kubernetes-fixture-manifest-files.ts';
import { podSpecs, validatePodSecurity } from './kubernetes-fixture-pods.ts';
import { persistentVolumeClaims, validatePersistentVolumeClaim, type PersistentVolumePolicy } from './kubernetes-fixture-storage.ts';
import { object, text, IMMUTABLE_IMAGE, type JsonObject } from './kubernetes-fixture-values.ts';
const CLUSTER_SCOPED_KINDS = new Set([
    'APIService', 'CertificateSigningRequest', 'ClusterRole', 'ClusterRoleBinding',
    'CSIDriver', 'CSINode', 'CustomResourceDefinition', 'FlowSchema', 'IngressClass',
    'MutatingWebhookConfiguration', 'Namespace', 'Node', 'PersistentVolume',
    'PriorityClass', 'PriorityLevelConfiguration', 'RuntimeClass', 'StorageClass',
    'ValidatingAdmissionPolicy', 'ValidatingAdmissionPolicyBinding',
    'ValidatingWebhookConfiguration', 'VolumeSnapshotClass',
]);
const ALLOWED_NAMESPACED_KINDS = new Set([
    'ConfigMap', 'CronJob', 'Deployment', 'Job', 'PersistentVolumeClaim', 'Pod', 'Service', 'StatefulSet',
]);
interface ManifestPolicy {
    readonly manifest: BusterManifestPolicy;
    readonly immutableImage: string;
    readonly maximumResources: number;
    readonly allowedRegistryPrefixes: readonly string[];
    readonly serviceName: string;
    readonly servicePort: number;
    readonly expectedServiceTargetPort: number | null;
    readonly persistentVolumePolicy: PersistentVolumePolicy;
}
interface InspectionState {
    workloads: number;
    matchedImage: boolean;
    matchedService: boolean;
    serviceTargetPortName: string | null;
    resolvedServiceTargetPort: number | null;
    namedContainerPorts: Map<string, Set<number>>;
    persistentVolumeTotalBytes: bigint;
}
export function inspectManifest(bytes: Buffer, policy: ManifestPolicy): {
    resources: number;
    workloads: number;
    serviceTargetPort: number;
} {
    const loaded = boundedManifestDocuments(bytes, policy.manifest);
    const documents = flattenDocuments(loaded, policy.maximumResources, policy.manifest);
    if (documents.length < 1 || documents.length > policy.maximumResources)
        throw new Error('KUBERNETES_FIXTURE_RESOURCE_COUNT_INVALID');
    const state: InspectionState = { workloads: 0, matchedImage: false, matchedService: false,
        serviceTargetPortName: null, resolvedServiceTargetPort: null,
        namedContainerPorts: new Map(), persistentVolumeTotalBytes: 0n };
    for (const document of documents)
        inspectDocument(document, policy, state);
    return finishInspection(documents.length, policy, state);
}
function inspectDocument(document: JsonObject, policy: ManifestPolicy, state: InspectionState): void {
    const apiVersion = text(document.apiVersion, 'apiVersion', 128);
    const kind = text(document.kind, 'kind', 128);
    const metadata = object(document.metadata, 'metadata');
    text(metadata.name, 'metadata.name', 253);
    if (CLUSTER_SCOPED_KINDS.has(kind))
        throw new Error(`KUBERNETES_FIXTURE_CLUSTER_SCOPE_DENIED:${kind}`);
    if (!ALLOWED_NAMESPACED_KINDS.has(kind))
        throw new Error(`KUBERNETES_FIXTURE_RESOURCE_KIND_DENIED:${kind}`);
    if (metadata.namespace !== undefined)
        throw new Error(`KUBERNETES_FIXTURE_NAMESPACE_FIELD_DENIED:${kind}`);
    if (!apiVersion.includes('/') && apiVersion !== 'v1')
        throw new Error('KUBERNETES_FIXTURE_API_VERSION_INVALID');
    for (const claim of persistentVolumeClaims(document)) {
        state.persistentVolumeTotalBytes += validatePersistentVolumeClaim(claim.name, claim.spec, policy.persistentVolumePolicy)
            * claim.copies;
        if (state.persistentVolumeTotalBytes > policy.persistentVolumePolicy.maximumTotalBytes) {
            throw new Error('KUBERNETES_FIXTURE_PVC_TOTAL_SIZE_DENIED');
        }
    }
    if (kind === 'Service')
        inspectService(document, metadata, policy, state);
    inspectPods(document, policy, state);
}
function inspectService(document: JsonObject, metadata: JsonObject, policy: ManifestPolicy, state: InspectionState): void {
    const spec = object(document.spec, 'service.spec');
    const type = spec.type ?? 'ClusterIP';
    const annotations = object(metadata.annotations ?? {}, 'service.metadata.annotations');
    const externalIPs = spec.externalIPs;
    const hasExternalIPs = externalIPs !== undefined && (!Array.isArray(externalIPs) || externalIPs.length > 0);
    const externalName = spec.externalName;
    const hasExternalName = externalName !== undefined
        && (typeof externalName !== 'string' || externalName.trim().length > 0);
    if (type !== 'ClusterIP' || hasExternalIPs || hasExternalName) {
        throw new Error('KUBERNETES_FIXTURE_EXTERNAL_SERVICE_DENIED');
    }
    if (annotations['tailscale.com/expose'] !== undefined) {
        throw new Error('KUBERNETES_FIXTURE_EXTERNAL_SERVICE_DENIED');
    }
    selectService(spec, metadata, policy, state);
}
function selectService(spec: JsonObject, metadata: JsonObject, policy: ManifestPolicy, state: InspectionState): void {
    if (metadata.name === policy.serviceName) {
        if (state.matchedService)
            throw new Error('KUBERNETES_FIXTURE_SERVICE_DUPLICATE');
        state.matchedService = true;
        const ports = Array.isArray(spec.ports) ? spec.ports.map((entry) => object(entry, 'service.port')) : [];
        const selected = ports.filter((entry) => entry.port === policy.servicePort);
        if (selected.length !== 1)
            throw new Error('KUBERNETES_FIXTURE_SERVICE_PORT_MISMATCH');
        const target = selected[0]!.targetPort ?? policy.servicePort;
        if (typeof target === 'number')
            state.resolvedServiceTargetPort = target;
        if (typeof target === 'string')
            state.serviceTargetPortName = target;
    }
}
function inspectPods(document: JsonObject, policy: ManifestPolicy, state: InspectionState): void {
    for (const spec of podSpecs(document)) {
        state.workloads += 1;
        validatePodSecurity(spec);
        for (const field of ['initContainers', 'containers']) {
            const containers = spec[field];
            if (containers === undefined)
                continue;
            if (!Array.isArray(containers))
                throw new Error('KUBERNETES_FIXTURE_CONTAINERS_INVALID');
            for (const container of containers) {
                inspectContainer(container, policy, state);
            }
        }
    }
}
function inspectContainer(container: unknown, policy: ManifestPolicy, state: InspectionState): void {
    const containerObject = object(container, 'container');
    const image = text(containerObject.image, 'container.image', 2048);
    const parsed = IMMUTABLE_IMAGE.exec(image);
    if (!parsed)
        throw new Error(`KUBERNETES_FIXTURE_MUTABLE_IMAGE_DENIED:${image}`);
    if (!policy.allowedRegistryPrefixes.some((prefix) => parsed[1] === prefix || parsed[1]!.startsWith(`${prefix}/`))) {
        throw new Error(`KUBERNETES_FIXTURE_IMAGE_REGISTRY_DENIED:${image}`);
    }
    if (image === policy.immutableImage)
        state.matchedImage = true;
    recordContainerPorts(containerObject, state);
}
function recordContainerPorts(containerObject: JsonObject, state: InspectionState): void {
    for (const rawPort of Array.isArray(containerObject.ports) ? containerObject.ports : []) {
        const port = object(rawPort, 'container.port');
        if (typeof port.name === 'string' && Number.isSafeInteger(port.containerPort)) {
            const values = state.namedContainerPorts.get(port.name) ?? new Set<number>();
            values.add(Number(port.containerPort));
            state.namedContainerPorts.set(port.name, values);
        }
    }
}
function finishInspection(resources: number, policy: ManifestPolicy, state: InspectionState) {
    if (state.workloads < 1)
        throw new Error('KUBERNETES_FIXTURE_WORKLOAD_REQUIRED');
    if (!state.matchedImage)
        throw new Error('KUBERNETES_FIXTURE_IMAGE_NOT_USED');
    if (!state.matchedService)
        throw new Error('KUBERNETES_FIXTURE_SERVICE_REQUIRED');
    if (state.serviceTargetPortName !== null) {
        const ports = state.namedContainerPorts.get(state.serviceTargetPortName);
        if (ports?.size !== 1)
            throw new Error('KUBERNETES_FIXTURE_SERVICE_TARGET_PORT_MISMATCH');
        state.resolvedServiceTargetPort = [...ports][0]!;
    }
    if (state.resolvedServiceTargetPort === null || state.resolvedServiceTargetPort < 1 || state.resolvedServiceTargetPort > 65_535
        || (policy.expectedServiceTargetPort !== null && state.resolvedServiceTargetPort !== policy.expectedServiceTargetPort)) {
        throw new Error('KUBERNETES_FIXTURE_SERVICE_TARGET_PORT_MISMATCH');
    }
    return { resources, workloads: state.workloads, serviceTargetPort: state.resolvedServiceTargetPort };
}
