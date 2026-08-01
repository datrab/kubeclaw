export type AnyRecord = Record<string, any>;
export type SuiteLog = (msg: string) => void;
export type Check = {
    name: string;
    passed: boolean;
    detail: string;
};
export type NamespaceLeaseStatus = {
    namespaceName: string;
    previewUrl: string | null;
    exposurePhase: string | null;
    exposureHostname: string | null;
    credentialsRef: string | null;
    credentialsAvailable: boolean;
    message: string | null;
};
export interface K8sContext {
    payload?: AnyRecord;
    moduleId?: string;
    logSink?: any;
    telemetryContext?: unknown;
    repoRoot?: string;
    config?: {
        k8s?: AnyRecord;
    };
}
export declare const execFileAsync: any;
export declare function resolveK8sLocalRegistry(env?: Record<string, string | undefined>): string;
export declare const KUBECLAW_NS: string;
export declare const BUSTER_LEASE_API_GROUP: string;
export declare const SAFE_NAMESPACE_PREFIXES: readonly string[];
export declare function shortId(): string;
export declare function errorMessage(error: unknown): string;
export declare function errorOutput(error: any): string;
export declare function trimOut(value: unknown, max?: number): string;
export declare function validateK8sServicePort(port: unknown): boolean;
export declare function makeCheck(name: string, passed: boolean, detail?: string): Check;
export declare function sanitizeDnsLabel(value: unknown, fallback?: string): string;
export declare function k8sRepoRoot(context: K8sContext): string;
export declare function previewCredentialSecretAuthority(secretName: string | null, credentialsRef: string | null): string | null;
export declare function finalPreviewLeaseStatus(previewLeaseStatus: NamespaceLeaseStatus | null, leaseStatus: NamespaceLeaseStatus | null): NamespaceLeaseStatus | null;
export declare function previewExposureHostname(status: NamespaceLeaseStatus | null, requestedHostname: string): string | null;
export declare function previewCredentialsRefAuthority(status: NamespaceLeaseStatus | null, requestedRef: string | null): string | null;
export declare function validateK8sNamespacePrefix(prefix: string): boolean;
export declare function buildK8sSuiteNamespace(prefix: string, project: unknown, runId: string): string;
export declare function renderManifestForK8sSuiteWithStats(content: string, imageName: string, registryTag: string, targetNs: string, log?: SuiteLog): {
    content: string;
    imageRewrites: number;
};
export declare function renderManifestForK8sSuite(content: string, imageName: string, registryTag: string, targetNs: string, log?: SuiteLog): string;
export declare function kubectlOutputLooksLikeHtml(value: unknown): boolean;
export declare function assertKubectlOutputNotHtml(value: unknown, label: string): void;
export declare function parseKubectlJson(stdout: unknown, label: string): AnyRecord;
export declare function isNonEmptyString(value: unknown): value is string;
export declare function isSuccessfulHttpStatus(statusCode: number): boolean;
export declare function buildBusterNamespaceLease({ leaseName, namespaceName, namespacePrefix, serviceName, secretsToCopy, payload, ttlSeconds, cleanupPolicy, purpose, exposure }: {
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
}): AnyRecord;
