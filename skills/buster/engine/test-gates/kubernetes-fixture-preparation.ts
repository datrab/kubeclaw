import { object, text, integer, stringArray, DNS_LABEL, IMMUTABLE_IMAGE, DIGEST, SECRET_NAME, MAX_NAMESPACE_PREFIX_LENGTH, type JsonObject } from './kubernetes-fixture-values.ts';
import { contained, manifestBytes } from './kubernetes-fixture-manifest-files.ts';
import { inspectManifest } from './kubernetes-fixture-inspection.ts';
import type { KubernetesFixtureSettings } from './kubernetes-fixture-settings.ts';
import type { KubernetesFixtureReadiness, KubectlRun } from './kubernetes-fixture-readiness.ts';
import type { generatedDemoCredentials } from './generated-demo-credentials.ts';
import type { TestProviderCapabilityRequest } from '@kubeclaw/plugin-sdk';
interface PreparationOperations {
    readonly run: KubectlRun;
    readonly readiness: KubernetesFixtureReadiness;
    readonly generatedCredentials: (expected: Parameters<typeof generatedDemoCredentials>[2], signal: AbortSignal) => Promise<ReturnType<typeof generatedDemoCredentials>>;
    readonly releaseAfterPrepareFailure: (leaseName: string) => Promise<void>;
}
export class KubernetesFixturePreparation {
    readonly #settings: KubernetesFixtureSettings;
    readonly #operations: PreparationOperations;
    constructor(settings: KubernetesFixtureSettings, operations: PreparationOperations) {
        this.#settings = settings;
        this.#operations = operations;
    }
    async #activate(prepared: ReturnType<typeof readRequest>, selected: ReturnType<typeof leaseRequest>, signal: AbortSignal) {
        const { leaseName, namespaceName, immutableImage, manifestDigest, bytes, serviceName, servicePort, secretReferences, facts } = prepared;
        const { retentionSeconds, readinessTimeoutMs, testCredentials } = selected;
        const status = await this.#operations.readiness.waitLease(leaseName, signal, readinessTimeoutMs);
        const actualNamespace = text(status.namespaceName, 'status.namespaceName', 63);
        if (actualNamespace !== namespaceName)
            throw new Error('KUBERNETES_FIXTURE_NAMESPACE_MISMATCH');
        await this.#operations.run(['apply', '--namespace', namespaceName, '-f', '-'], bytes, signal, readinessTimeoutMs);
        const readinessDeadline = Date.now() + readinessTimeoutMs;
        const podCount = await this.#operations.readiness.waitPods(namespaceName, signal, readinessTimeoutMs);
        const serviceReadinessMs = readinessDeadline - Date.now();
        if (serviceReadinessMs <= 0)
            throw new Error('KUBERNETES_FIXTURE_SERVICE_READINESS_TIMEOUT:Readiness deadline expired.');
        await this.#operations.readiness.waitService(namespaceName, serviceName, servicePort, signal, serviceReadinessMs);
        const createdAt = text(status.createdAt, 'status.createdAt', 64);
        if (!Number.isFinite(Date.parse(createdAt)))
            throw new Error('KUBERNETES_FIXTURE_CREATED_AT_INVALID');
        const expiresAt = typeof status.expiresAt === 'string' ? status.expiresAt : new Date(Date.parse(createdAt) + retentionSeconds * 1_000).toISOString();
        const generatedCredentials = testCredentials ? await this.#operations.generatedCredentials({ leaseName, namespace: namespaceName,
            secretName: String(testCredentials.secretName), immutableImage, manifestDigest }, signal) : undefined;
        return Object.freeze({ ok: true, leaseName, namespace: namespaceName, createdAt, expiresAt,
            endpoint: `http://${serviceName}.${namespaceName}.svc.cluster.local:${servicePort}`,
            releaseAction: `kubectl delete busternamespacelease ${leaseName} -n ${this.#settings.controllerNamespace}`,
            manifestDigest, immutableImage, secretReferences,
            ...(testCredentials ? { credentialsRef: testCredentials.secretName } : {}),
            ...(generatedCredentials ? { generatedCredentials } : {}),
            resourceCount: facts.resources, workloadCount: facts.workloads, podCount });
    }
    async prepare(request: TestProviderCapabilityRequest, signal: AbortSignal): Promise<Readonly<Record<string, unknown>>> {
        const prepared = readRequest(this.#settings, request);
        const selected = leaseRequest(this.#settings, request, prepared);
        const { leaseName } = prepared;
        const { lease } = selected;
        const leaseBytes = `${JSON.stringify(lease)}\n`;
        const resource = `busternamespaceleases.${this.#settings.apiGroup}`;
        for (const verb of ['create', 'get', 'delete']) {
            const allowed = (await this.#operations.run(['auth', 'can-i', verb, resource, '-n', this.#settings.controllerNamespace], null, signal, this.#settings.shortCommandTimeoutMs)).trim();
            if (allowed !== 'yes')
                throw new Error(`KUBERNETES_FIXTURE_RBAC_DENIED:${verb}`);
        }
        await this.#operations.run(['apply', '--dry-run=server', '-f', '-'], leaseBytes, signal, this.#settings.shortCommandTimeoutMs);
        await this.#operations.run(['apply', '-f', '-'], leaseBytes, signal, this.#settings.shortCommandTimeoutMs);
        try {
            return await this.#activate(prepared, selected, signal);
        }
        catch (error) {
            try {
                await this.#operations.releaseAfterPrepareFailure(leaseName);
            } catch (cleanupError) {
                throw new AggregateError([error, cleanupError], 'KUBERNETES_FIXTURE_PREPARE_CLEANUP_FAILED', { cause: error });
            }
            throw error;
        }
    }
}

function readRequest(settings: KubernetesFixtureSettings, request: TestProviderCapabilityRequest) {
    const payload = object(request.payload, 'payload');
    const leaseName = text(payload.leaseName, 'leaseName', 63);
    if (!DNS_LABEL.test(leaseName))
        throw new Error('KUBERNETES_FIXTURE_LEASE_NAME_INVALID');
    const namespacePrefix = text(payload.namespacePrefix, 'namespacePrefix', MAX_NAMESPACE_PREFIX_LENGTH);
    if (!settings.namespacePrefixes.has(namespacePrefix))
        throw new Error('KUBERNETES_FIXTURE_NAMESPACE_PREFIX_DENIED');
    const namespaceName = text(payload.namespaceName, 'namespaceName', 63);
    if (!DNS_LABEL.test(namespaceName) || !namespaceName.startsWith(`${namespacePrefix}-`)) {
        throw new Error('KUBERNETES_FIXTURE_NAMESPACE_NAME_INVALID');
    }
    const immutableImage = text(payload.immutableImage, 'immutableImage', 2048);
    const image = IMMUTABLE_IMAGE.exec(immutableImage);
    if (!image || !settings.registryPrefixes.some((prefix) => image[1] === prefix || image[1]!.startsWith(`${prefix}/`))) {
        throw new Error('KUBERNETES_FIXTURE_IMAGE_DENIED');
    }
    if (payload.imageDigest !== image[2] || !DIGEST.test(String(payload.imageDigest))) {
        throw new Error('KUBERNETES_FIXTURE_IMAGE_DIGEST_INVALID');
    }
    const manifestDigest = text(payload.manifestDigest, 'manifestDigest', 71);
    if (!DIGEST.test(manifestDigest))
        throw new Error('KUBERNETES_FIXTURE_MANIFEST_DIGEST_INVALID');
    const manifestPath = contained(settings.root, payload.manifestPath);
    const bytes = manifestBytes(manifestPath, manifestDigest, settings.maximumManifestBytes);
    const serviceName = text(payload.serviceName, 'serviceName', 63);
    if (!DNS_LABEL.test(serviceName))
        throw new Error('KUBERNETES_FIXTURE_SERVICE_NAME_INVALID');
    const servicePort = integer(payload.servicePort, 'servicePort', 1, 65_535);
    const expectedServiceTargetPort = payload.serviceTargetPort === undefined
        ? null : integer(payload.serviceTargetPort, 'serviceTargetPort', 1, 65_535);
    const secretReferences = stringArray(payload.secretReferences ?? [], 'secretReferences', settings.maximumSecretReferenceEntries, SECRET_NAME);
    if (secretReferences.some((name) => !settings.secretReferences.has(name))) {
        throw new Error('KUBERNETES_FIXTURE_SECRET_REFERENCE_DENIED');
    }
    const facts = inspectManifest(bytes, { immutableImage, maximumResources: settings.maximumResources, manifest: settings.manifest,
        allowedRegistryPrefixes: settings.registryPrefixes, serviceName, servicePort, expectedServiceTargetPort,
        persistentVolumePolicy: {
            allowedStorageClasses: settings.allowedStorageClasses,
            allowDefaultStorageClass: settings.allowDefaultStorageClass,
            maximumClaimBytes: settings.maximumPersistentVolumeClaimBytes,
            maximumTotalBytes: settings.maximumPersistentVolumeTotalBytes,
        } });
    return { payload, leaseName, namespaceName, namespacePrefix, immutableImage, manifestDigest, bytes, serviceName, servicePort, secretReferences, facts };
}

function leaseRequest(settings: KubernetesFixtureSettings, request: TestProviderCapabilityRequest, prepared: ReturnType<typeof readRequest>) {
    const { payload, leaseName, namespaceName, namespacePrefix, immutableImage, manifestDigest, serviceName, servicePort, secretReferences, facts } = prepared;
    const retentionSeconds = integer(payload.retentionSeconds, 'retentionSeconds', 60, settings.maximumRetentionSeconds);
    const retentionMode = text(payload.retentionMode, 'retentionMode', 6);
    if (retentionMode !== 'delete' && retentionMode !== 'retain') {
        throw new Error('KUBERNETES_FIXTURE_RETENTION_MODE_INVALID');
    }
    const readinessTimeoutMs = integer(payload.readinessTimeoutMs, 'readinessTimeoutMs', 1_000, settings.maximumExecutionMs);
    const credentialsValue = payload.testCredentials === undefined ? null : object(payload.testCredentials, 'testCredentials');
    let testCredentials: JsonObject | null = null;
    if (credentialsValue) {
        const mode = text(credentialsValue.mode, 'testCredentials.mode', 16);
        const secretName = text(credentialsValue.secretName, 'testCredentials.secretName', 253);
        if (mode !== 'generate' || !SECRET_NAME.test(secretName)) {
            throw new Error('KUBERNETES_FIXTURE_TEST_CREDENTIALS_INVALID');
        }
        testCredentials = { mode, secretName, keys: ['username', 'password'],
            readers: [...new Set([settings.credentialReaderSubject, settings.runnerSubject])] };
    }
    const lease = {
        apiVersion: `${settings.apiGroup}/${settings.apiVersion}`, kind: 'BusterNamespaceLease',
        metadata: { name: leaseName, namespace: settings.controllerNamespace,
            labels: { 'openclaw.io/buster-scope': request.resource.canonicalId.replace(/[^A-Za-z0-9._-]/gu, '-').slice(0, 63) } },
        spec: { namespaceName, namespacePrefix, runId: leaseName, project: text(payload.project, 'project', 253),
            purpose: 'gate', serviceName, servicePort, serviceTargetPort: facts.serviceTargetPort, cleanupPolicy: retentionMode,
            verifiedImage: immutableImage, manifestDigest,
            ttlSeconds: retentionSeconds, access: [{ subject: settings.runnerSubject, mode: 'deployer' }],
            secretsToCopy: secretReferences, ...(testCredentials ? { testCredentials } : {}), exposure: { provider: 'off' } },
    };
    return { lease, retentionSeconds, readinessTimeoutMs, testCredentials };
}
