import { createRequire } from 'module';
import { suiteArray as arrayValue, suiteNonEmptyString as nonEmptyString, suiteObjectOrEmpty as objectRecordOrEmpty } from './support.js';
const require = createRequire(import.meta.url);
const SUPPORTED_WORKLOAD_KINDS = new Set(['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job', 'CronJob']);
function loadJsYamlModule() {
    try {
        return require('js-yaml');
    }
    catch (error) {
        const wrapped = new Error('js-yaml is required for structured Kubernetes manifest parsing');
        wrapped.cause = error;
        throw wrapped;
    }
}
export function loadYamlDocuments(content) {
    return loadJsYamlModule().loadAll(content).filter((doc) => doc !== null && doc !== undefined);
}
export function dumpYamlDocuments(docs) {
    return docs.filter((doc) => doc !== null && doc !== undefined)
        .map((doc) => loadJsYamlModule().dump(doc, { lineWidth: -1, noRefs: true, sortKeys: false }).trimEnd())
        .join('\n---\n') + '\n';
}
export function parseSecretYaml(content) {
    const doc = objectRecordOrEmpty(loadYamlDocuments(content).find((item) => item?.kind === 'Secret'));
    return { name: nonEmptyString(doc?.metadata?.name) ?? '', keys: Object.keys(objectRecordOrEmpty(doc?.data)) };
}
function podTemplateSpec(doc) {
    if (doc?.kind === 'CronJob')
        return objectRecordOrEmpty(doc?.spec?.jobTemplate?.spec?.template?.spec);
    return objectRecordOrEmpty(doc?.spec?.template?.spec);
}
function emptyManifestData(kind = null) {
    return {
        kind, workloadCount: 0, images: [], env: [], envFrom: [], imagePullSecrets: false,
        hasLimits: false, hasReadinessProbe: false, hasLivenessProbe: false,
    };
}
function extractDocument(doc) {
    const podSpec = podTemplateSpec(doc);
    const containers = Array.isArray(podSpec?.containers) ? podSpec.containers : [];
    const env = [];
    const envFrom = [];
    const images = [];
    for (const container of containers) {
        if (container?.image)
            images.push(String(container.image));
        if (Array.isArray(container?.env))
            env.push(...container.env);
        if (Array.isArray(container?.envFrom))
            envFrom.push(...container.envFrom);
    }
    return {
        kind: typeof doc?.kind === 'string' ? doc.kind : null,
        workloadCount: 1,
        images, env, envFrom,
        imagePullSecrets: arrayValue(podSpec?.imagePullSecrets).length > 0,
        hasLimits: containers.some((container) => Boolean(container?.resources?.limits)),
        hasReadinessProbe: containers.some((container) => Boolean(container?.readinessProbe)),
        hasLivenessProbe: containers.some((container) => Boolean(container?.livenessProbe)),
    };
}
export function extractFromParsedDocs(docs) {
    const workloads = docs.filter((doc) => SUPPORTED_WORKLOAD_KINDS.has(nonEmptyString(doc?.kind) ?? ''));
    if (workloads.length === 0)
        return emptyManifestData();
    const aggregate = emptyManifestData(workloads.map((doc) => doc.kind).join(', '));
    aggregate.workloadCount = workloads.length;
    for (const workload of workloads) {
        const data = extractDocument(workload);
        aggregate.images.push(...data.images);
        aggregate.env.push(...data.env);
        aggregate.envFrom.push(...data.envFrom);
        aggregate.imagePullSecrets ||= data.imagePullSecrets;
        aggregate.hasLimits ||= data.hasLimits;
        aggregate.hasReadinessProbe ||= data.hasReadinessProbe;
        aggregate.hasLivenessProbe ||= data.hasLivenessProbe;
    }
    return aggregate;
}
