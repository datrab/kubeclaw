export type AnyRecord = Record<string, any>;
export interface NormalizedK8sSuiteConfig extends AnyRecord {
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
export declare function normalizeK8sConfig(config: AnyRecord | undefined): NormalizedK8sSuiteConfig;
