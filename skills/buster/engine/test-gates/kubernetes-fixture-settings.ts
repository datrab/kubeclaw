import type { BusterManifestPolicy } from '@kubeclaw/plugin-foundation/config/buster-cluster-invokers';
import fs from 'node:fs';
import { validateBusterProcessInputSettings, type BusterProcessInputSettings } from '@kubeclaw/plugin-foundation/config/buster-execution';
import { runProcessInput } from './process-input.ts';
import { DNS_LABEL, SECRET_NAME, MAX_TIMER_MS, MAX_NAMESPACE_PREFIX_LENGTH, STORAGE_CLASS_NAME } from './kubernetes-fixture-values.ts';
type Execute = (command: string, args: readonly string[], options: Readonly<Record<string, unknown>>) => Promise<{
    stdout?: string;
    stderr?: string;
}>;
async function executeProcess(command: string, args: readonly string[], options: Readonly<Record<string, unknown>>, processInputPolicy: BusterProcessInputSettings): Promise<{
    stdout: string;
    stderr: string;
}> {
    const result = await runProcessInput(command, args, {
        processInputPolicy,
        ...(options.env ? { env: options.env as NodeJS.ProcessEnv } : {}),
        ...(options.signal ? { signal: options.signal as AbortSignal } : {}),
        input: options.input as string | Buffer | null ?? null,
        timeoutMs: options.timeout as number, maximumOutputBytes: options.maxBuffer as number,
        prefix: 'KUBERNETES_FIXTURE_KUBECTL',
    });
    const stdout = result.stdout.toString('utf8');
    const stderr = result.stderr.toString('utf8');
    if (result.code !== 0)
        throw Object.assign(new Error(`Command failed with code ${String(result.code)} and signal ${String(result.signal)}`), { stdout, stderr });
    return { stdout, stderr };
}
export interface KubernetesFixtureCapabilityInvokerOptions {
    readonly processInputPolicy: BusterProcessInputSettings;
    readonly workspaceRoot: string;
    readonly kubectlExecutable: string;
    readonly controllerNamespace: string;
    readonly leaseApiGroup: string;
    readonly leaseApiVersion: string;
    readonly allowedNamespacePrefixes: readonly string[];
    readonly allowedRegistryPrefixes: readonly string[];
    readonly allowedSecretReferences: readonly string[];
    readonly allowedStorageClasses: readonly string[];
    readonly allowDefaultStorageClass: boolean;
    readonly runnerSubject: string;
    readonly credentialReaderSubject: string;
    readonly maximumSecretReferenceEntries: number;
    readonly maximumManifestBytes: number;
    readonly maximumResources: number;
    readonly maximumPersistentVolumeClaimBytes: number;
    readonly maximumPersistentVolumeTotalBytes: number;
    readonly maximumRetentionSeconds: number;
    readonly maximumExecutionMs: number;
    readonly pollIntervalMs: number;
    readonly shortCommandTimeoutMs: number;
    readonly commandOutputManifestMultiplier: number;
    readonly diagnosticCodeUnits: number;
    readonly manifest: BusterManifestPolicy;

    readonly execute?: Execute;
    readonly now?: () => Date;
}
export class KubernetesFixtureSettings {
    readonly root: string;
    readonly kubectl: string;
    readonly controllerNamespace: string;
    readonly apiGroup: string;
    readonly apiVersion: string;
    readonly namespacePrefixes: ReadonlySet<string>;
    readonly registryPrefixes: readonly string[];
    readonly secretReferences: ReadonlySet<string>;
    readonly allowedStorageClasses: ReadonlySet<string>;
    readonly allowDefaultStorageClass: boolean;
    readonly runnerSubject: string;
    readonly credentialReaderSubject: string;
    readonly maximumSecretReferenceEntries: number;
    readonly maximumManifestBytes: number;
    readonly maximumResources: number;
    readonly maximumPersistentVolumeClaimBytes: bigint;
    readonly maximumPersistentVolumeTotalBytes: bigint;
    readonly maximumRetentionSeconds: number;
    readonly maximumExecutionMs: number;
    readonly pollIntervalMs: number;
    readonly shortCommandTimeoutMs: number;
    readonly commandOutputManifestMultiplier: number;
    readonly diagnosticCodeUnits: number;
    readonly manifest: BusterManifestPolicy;

    readonly execute: Execute;
    readonly now: () => Date;
    constructor(options: KubernetesFixtureCapabilityInvokerOptions) {
        const processInputPolicy = validateBusterProcessInputSettings(options.processInputPolicy);
        validateAddresses(options);
        const runnerSubject = options.runnerSubject;
        const credentialReaderSubject = options.credentialReaderSubject;
        if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(runnerSubject)
            || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(credentialReaderSubject)) {
            throw new Error('KUBERNETES_FIXTURE_SUBJECT_INVALID');
        }
        validateLimits(options);
        validateOperationPolicy(options);
        this.root = fs.realpathSync(options.workspaceRoot);
        this.kubectl = fs.realpathSync(options.kubectlExecutable);
        fs.accessSync(this.kubectl, fs.constants.X_OK);
        this.controllerNamespace = options.controllerNamespace;
        this.apiGroup = options.leaseApiGroup;
        this.apiVersion = options.leaseApiVersion;
        this.namespacePrefixes = new Set(options.allowedNamespacePrefixes);
        this.registryPrefixes = [...options.allowedRegistryPrefixes];
        this.secretReferences = new Set(options.allowedSecretReferences);
        this.allowedStorageClasses = new Set(options.allowedStorageClasses);
        this.allowDefaultStorageClass = options.allowDefaultStorageClass;
        this.runnerSubject = runnerSubject;
        this.credentialReaderSubject = credentialReaderSubject;
        this.maximumSecretReferenceEntries = options.maximumSecretReferenceEntries;
        this.maximumManifestBytes = options.maximumManifestBytes;
        this.maximumResources = options.maximumResources;
        this.maximumPersistentVolumeClaimBytes = BigInt(options.maximumPersistentVolumeClaimBytes);
        this.maximumPersistentVolumeTotalBytes = BigInt(options.maximumPersistentVolumeTotalBytes);
        this.maximumRetentionSeconds = options.maximumRetentionSeconds;
        this.maximumExecutionMs = options.maximumExecutionMs;
        this.pollIntervalMs = options.pollIntervalMs;
        this.shortCommandTimeoutMs = options.shortCommandTimeoutMs;
        this.commandOutputManifestMultiplier = options.commandOutputManifestMultiplier;
        this.diagnosticCodeUnits = options.diagnosticCodeUnits;
        this.manifest = Object.freeze({ ...options.manifest });
        this.execute = options.execute ?? ((command, args, operation) => executeProcess(command, args, operation, processInputPolicy));
        this.now = options.now ?? (() => new Date());
    }
}
function validateAddresses(options: KubernetesFixtureCapabilityInvokerOptions): void {
    if (!DNS_LABEL.test(options.controllerNamespace))
        throw new Error('KUBERNETES_FIXTURE_CONTROLLER_NAMESPACE_INVALID');
    if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/u.test(options.leaseApiGroup))
        throw new Error('KUBERNETES_FIXTURE_API_GROUP_INVALID');
    if (!/^v[0-9]+(?:(?:alpha|beta)[0-9]+)?$/u.test(options.leaseApiVersion))
        throw new Error('KUBERNETES_FIXTURE_API_VERSION_INVALID');
    if (options.allowedNamespacePrefixes.length < 1
        || options.allowedNamespacePrefixes.some((item) => item.length > MAX_NAMESPACE_PREFIX_LENGTH || !DNS_LABEL.test(item))) {
        throw new Error('KUBERNETES_FIXTURE_NAMESPACE_PREFIXES_INVALID');
    }
    if (options.allowedRegistryPrefixes.length < 1
        || options.allowedRegistryPrefixes.some((item) => !/^[A-Za-z0-9.-]+(?::[0-9]{1,5})?\/[a-z0-9]+(?:[._/-][a-z0-9]+)*$/u.test(item))) {
        throw new Error('KUBERNETES_FIXTURE_REGISTRY_PREFIXES_INVALID');
    }
    validateStorageOptions(options);
}
function validateStorageOptions(options: KubernetesFixtureCapabilityInvokerOptions): void {
    if (options.allowedSecretReferences.some((item) => !SECRET_NAME.test(item))) {
        throw new Error('KUBERNETES_FIXTURE_SECRET_REFERENCES_INVALID');
    }
    if (options.allowedStorageClasses.some((item) => item.length > 253 || !STORAGE_CLASS_NAME.test(item))) {
        throw new Error('KUBERNETES_FIXTURE_STORAGE_CLASSES_INVALID');
    }
    if (typeof options.allowDefaultStorageClass !== 'boolean') {
        throw new Error('KUBERNETES_FIXTURE_DEFAULT_STORAGE_CLASS_POLICY_INVALID');
    }
}
function validateLimits(options: KubernetesFixtureCapabilityInvokerOptions): void {
    if (!Number.isSafeInteger(options.maximumSecretReferenceEntries)
        || options.maximumSecretReferenceEntries < 0 || options.maximumSecretReferenceEntries > 32)
        throw new Error('KUBERNETES_FIXTURE_SECRET_REFERENCE_LIMIT_INVALID');
    for (const [value, label] of [[options.maximumManifestBytes, 'MANIFEST_SIZE'], [options.maximumResources, 'RESOURCE_COUNT'],
        [options.maximumPersistentVolumeClaimBytes, 'PVC_SIZE'], [options.maximumPersistentVolumeTotalBytes, 'PVC_TOTAL_SIZE'],
        [options.maximumRetentionSeconds, 'RETENTION'], [options.maximumExecutionMs, 'EXECUTION']] as const) {
        if (!Number.isSafeInteger(value) || value < 1)
            throw new Error(`KUBERNETES_FIXTURE_${label}_LIMIT_INVALID`);
    }
}

function validateOperationPolicy(options: KubernetesFixtureCapabilityInvokerOptions): void {
    if (options.maximumPersistentVolumeTotalBytes < options.maximumPersistentVolumeClaimBytes)
        throw new Error('KUBERNETES_FIXTURE_PVC_TOTAL_SIZE_LIMIT_INVALID');
    if (!Number.isSafeInteger(options.pollIntervalMs) || options.pollIntervalMs < 50 || options.pollIntervalMs > 10000)
        throw new Error('KUBERNETES_FIXTURE_POLL_INTERVAL_INVALID');
    const values = [options.shortCommandTimeoutMs, options.commandOutputManifestMultiplier,
        options.diagnosticCodeUnits, options.manifest?.maximumNodes, options.manifest?.maximumDepth,
        options.manifest?.maximumAliases, options.manifest?.maximumFlattenVisits, options.manifest?.maximumFlattenPending];
    if (values.some(value => !Number.isSafeInteger(value) || value < 1)
        || options.shortCommandTimeoutMs > MAX_TIMER_MS || options.maximumExecutionMs > MAX_TIMER_MS
        || !Number.isSafeInteger(options.maximumManifestBytes * options.commandOutputManifestMultiplier)) {
        throw new Error('KUBERNETES_FIXTURE_OPERATION_POLICY_INVALID');
    }
}
