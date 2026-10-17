import { text, object, type JsonObject } from './kubernetes-fixture-values.ts';
const STORAGE_QUANTITY = /^(?:\+)?([0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:(Ki|Mi|Gi|Ti|Pi|Ei)|(n|u|m|k|K|M|G|T|P|E)|([eE][+-]?[0-9]+))?$/u;
function storageBytes(value: unknown): bigint {
    const quantity = text(value, 'persistentVolumeClaim.storage', 64);
    const parsed = STORAGE_QUANTITY.exec(quantity);
    if (!parsed)
        throw new Error(`KUBERNETES_FIXTURE_STORAGE_QUANTITY_INVALID:${quantity}`);
    const mantissa = parsed[1]!;
    const decimalPlaces = mantissa.includes('.') ? mantissa.length - mantissa.indexOf('.') - 1 : 0;
    let numerator = BigInt(mantissa.replace('.', ''));
    let denominator = 10n ** BigInt(decimalPlaces);
    const binaryPowers = new Map([['Ki', 10n], ['Mi', 20n], ['Gi', 30n], ['Ti', 40n], ['Pi', 50n], ['Ei', 60n]]);
    const decimalPowers = new Map([['n', -9], ['u', -6], ['m', -3], ['k', 3], ['K', 3],
        ['M', 6], ['G', 9], ['T', 12], ['P', 15], ['E', 18]]);
    if (parsed[2])
        numerator *= 1n << binaryPowers.get(parsed[2])!;
    const exponent = parsed[3] ? decimalPowers.get(parsed[3])!
        : parsed[4] ? Number.parseInt(parsed[4].slice(1), 10) : 0;
    if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 63) {
        throw new Error(`KUBERNETES_FIXTURE_STORAGE_QUANTITY_INVALID:${quantity}`);
    }
    if (exponent >= 0)
        numerator *= 10n ** BigInt(exponent);
    else
        denominator *= 10n ** BigInt(-exponent);
    if (numerator < 1n || numerator % denominator !== 0n) {
        throw new Error(`KUBERNETES_FIXTURE_STORAGE_QUANTITY_INVALID:${quantity}`);
    }
    return numerator / denominator;
}
export function persistentVolumeClaims(document: JsonObject): {
    name: string;
    spec: JsonObject;
    copies: bigint;
}[] {
    if (document.kind === 'PersistentVolumeClaim') {
        const metadata = object(document.metadata, 'persistentVolumeClaim.metadata');
        return [{ name: text(metadata.name, 'persistentVolumeClaim.metadata.name', 253),
                spec: object(document.spec, 'persistentVolumeClaim.spec'), copies: 1n }];
    }
    if (document.kind !== 'StatefulSet')
        return [];
    const spec = object(document.spec, 'statefulSet.spec');
    const replicas = spec.replicas ?? 1;
    if (!Number.isSafeInteger(replicas) || Number(replicas) < 0) {
        throw new Error('KUBERNETES_FIXTURE_STATEFULSET_REPLICAS_INVALID');
    }
    const templates = spec.volumeClaimTemplates ?? [];
    if (!Array.isArray(templates))
        throw new Error('KUBERNETES_FIXTURE_PVC_TEMPLATES_INVALID');
    return templates.map((raw) => {
        const template = object(raw, 'statefulSet.volumeClaimTemplate');
        const metadata = object(template.metadata, 'statefulSet.volumeClaimTemplate.metadata');
        return { name: text(metadata.name, 'statefulSet.volumeClaimTemplate.metadata.name', 253),
            spec: object(template.spec, 'statefulSet.volumeClaimTemplate.spec'), copies: BigInt(Number(replicas)) };
    });
}
export interface PersistentVolumePolicy {
    readonly allowedStorageClasses: ReadonlySet<string>;
    readonly allowDefaultStorageClass: boolean;
    readonly maximumClaimBytes: bigint;
    readonly maximumTotalBytes: bigint;
}
export function validatePersistentVolumeClaim(name: string, spec: JsonObject, policy: PersistentVolumePolicy): bigint {
    if (spec.volumeName !== undefined || spec.selector !== undefined
        || spec.dataSource !== undefined || spec.dataSourceRef !== undefined) {
        throw new Error(`KUBERNETES_FIXTURE_PVC_SOURCE_DENIED:${name}`);
    }
    if (spec.volumeMode !== undefined && spec.volumeMode !== 'Filesystem') {
        throw new Error(`KUBERNETES_FIXTURE_PVC_VOLUME_MODE_DENIED:${name}`);
    }
    const storageClass = spec.storageClassName;
    if (storageClass === undefined) {
        if (!policy.allowDefaultStorageClass)
            throw new Error('KUBERNETES_FIXTURE_DEFAULT_STORAGE_CLASS_DENIED');
    }
    else {
        const selected = text(storageClass, 'persistentVolumeClaim.storageClassName', 253);
        if (!policy.allowedStorageClasses.has(selected)) {
            throw new Error(`KUBERNETES_FIXTURE_STORAGE_CLASS_DENIED:${selected}`);
        }
    }
    const resources = object(spec.resources, 'persistentVolumeClaim.resources');
    const requests = object(resources.requests, 'persistentVolumeClaim.resources.requests');
    const bytes = storageBytes(requests.storage);
    if (bytes > policy.maximumClaimBytes)
        throw new Error(`KUBERNETES_FIXTURE_PVC_SIZE_DENIED:${name}`);
    return bytes;
}
