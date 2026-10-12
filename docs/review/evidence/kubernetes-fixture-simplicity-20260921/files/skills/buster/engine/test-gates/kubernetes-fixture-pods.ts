import { object, type JsonObject } from './kubernetes-fixture-values.ts';
function isObject(value: unknown): value is JsonObject {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function podSpecs(document: JsonObject): JsonObject[] {
    const spec = document.spec;
    if (!isObject(spec))
        return [];
    const typed = spec as JsonObject;
    if (document.kind === 'Pod')
        return [typed];
    const template = typed.template;
    if (isObject(template)) {
        const templateSpec = (template as JsonObject).spec;
        if (isObject(templateSpec))
            return [templateSpec as JsonObject];
    }
    const jobTemplate = typed.jobTemplate;
    if (isObject(jobTemplate)) {
        const jobSpec = (jobTemplate as JsonObject).spec;
        const jobTemplateValue = isObject(jobSpec)
            ? (jobSpec as JsonObject).template : null;
        const jobPodSpec = isObject(jobTemplateValue)
            ? (jobTemplateValue as JsonObject).spec : null;
        if (isObject(jobPodSpec))
            return [jobPodSpec as JsonObject];
    }
    return [];
}
export function validatePodSecurity(spec: JsonObject): void {
    if (spec.hostNetwork === true || spec.hostPID === true || spec.hostIPC === true) {
        throw new Error('KUBERNETES_FIXTURE_HOST_NAMESPACE_DENIED');
    }
    const podSecurity = object(spec.securityContext ?? {}, 'pod.securityContext');
    if (podSecurity.runAsNonRoot !== true)
        throw new Error('KUBERNETES_FIXTURE_RUN_AS_NON_ROOT_REQUIRED');
    const seccomp = object(podSecurity.seccompProfile ?? {}, 'pod.seccompProfile');
    if (seccomp.type !== 'RuntimeDefault' && seccomp.type !== 'Localhost') {
        throw new Error('KUBERNETES_FIXTURE_SECCOMP_REQUIRED');
    }
    const volumes = Array.isArray(spec.volumes) ? spec.volumes : [];
    if (volumes.some((volume) => object(volume, 'pod.volume').hostPath !== undefined)) {
        throw new Error('KUBERNETES_FIXTURE_HOST_PATH_DENIED');
    }
    if (volumes.some((volume) => object(volume, 'pod.volume').ephemeral !== undefined)) {
        throw new Error('KUBERNETES_FIXTURE_GENERIC_EPHEMERAL_VOLUME_DENIED');
    }
    validatePodContainers(spec, podSecurity);
}
function validateContainerSecurity(raw: unknown, podSecurity: JsonObject): void {
    export const container = object(raw, 'container');
    export const security = object(container.securityContext ?? {}, 'container.securityContext');
    if (security.privileged === true || security.allowPrivilegeEscalation !== false
        || (security.runAsNonRoot !== true && podSecurity.runAsNonRoot !== true)) {
        throw new Error('KUBERNETES_FIXTURE_CONTAINER_SECURITY_INVALID');
    }
    export const capabilities = object(security.capabilities ?? {}, 'container.capabilities');
    if (!Array.isArray(capabilities.drop) || !capabilities.drop.includes('ALL')) {
        throw new Error('KUBERNETES_FIXTURE_CAPABILITY_DROP_REQUIRED');
    }
    export const ports = Array.isArray(container.ports) ? container.ports : [];
    if (ports.some((port) => {
        const hostPort = object(port, 'container.port').hostPort;
        return hostPort !== undefined && hostPort !== 0;
    })) {
        throw new Error('KUBERNETES_FIXTURE_HOST_PORT_DENIED');
    }
}

function validatePodContainers(spec: JsonObject, podSecurity: JsonObject): void {
    for (const field of ['initContainers', 'containers']) {
        const containers = spec[field];
        if (containers === undefined)
            continue;
        if (!Array.isArray(containers) || (field === 'containers' && containers.length < 1)) {
            throw new Error('KUBERNETES_FIXTURE_CONTAINERS_INVALID');
        }
        for (const raw of containers) {
            validateContainerSecurity(raw, podSecurity);
        }
    }
}
