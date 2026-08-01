import { selectDefinedValue } from '../optional-absence.js';
const DEFAULTS = { port: 3000, health_path: '/health', namespace_prefix: 'test', ready_timeout_seconds: 120,
    build_timeout_seconds: 300, push_timeout_seconds: 120, deploy_timeout_seconds: 30, health_retries: 6, health_base_delay_ms: 1000 };
function positiveNumber(value, defaultValue) {
    return Number.isFinite(value) && Number(value) > 0 ? Number(value) : defaultValue;
}
function normalizedPreview(config, purpose) {
    const preview = config.preview && typeof config.preview === 'object' ? config.preview : {};
    return {
        preview,
        preview_provider: purpose === 'final-preview' && typeof preview.provider === 'string' && preview.provider.trim() ? preview.provider : 'tailscale-ingress',
        preview_path: typeof preview.path === 'string' && preview.path.startsWith('/') ? preview.path : '/',
        preview_url_timeout_seconds: positiveNumber(selectDefinedValue(() => config.preview_url_timeout_seconds, () => preview.url_timeout_seconds), 120),
    };
}
export function normalizeK8sConfig(config) {
    const value = config ?? {};
    const purpose = value.purpose === 'final-preview' ? 'final-preview' : 'pretest';
    return {
        ...value,
        port: positiveNumber(value.port, DEFAULTS.port),
        health_path: typeof value.health_path === 'string' && value.health_path.startsWith('/') ? value.health_path : DEFAULTS.health_path,
        ready_timeout_seconds: positiveNumber(value.ready_timeout_seconds, DEFAULTS.ready_timeout_seconds),
        namespace_prefix: typeof value.namespace_prefix === 'string' && value.namespace_prefix.trim() ? value.namespace_prefix : DEFAULTS.namespace_prefix,
        secrets_to_copy: Array.isArray(value.secrets_to_copy) ? value.secrets_to_copy.filter((secret) => typeof secret === 'string') : [],
        namespace_lease_timeout_seconds: positiveNumber(value.namespace_lease_timeout_seconds, 60),
        namespace_ttl_seconds: positiveNumber(value.namespace_ttl_seconds, 7200),
        cleanup_policy: value.cleanup_policy === 'keep' ? 'keep' : 'delete', purpose,
        ...normalizedPreview(value, purpose),
        build_timeout_seconds: positiveNumber(value.build_timeout_seconds, DEFAULTS.build_timeout_seconds),
        push_timeout_seconds: positiveNumber(value.push_timeout_seconds, DEFAULTS.push_timeout_seconds),
        deploy_timeout_seconds: positiveNumber(value.deploy_timeout_seconds, DEFAULTS.deploy_timeout_seconds),
        health_retries: positiveNumber(value.health_retries, DEFAULTS.health_retries),
        health_base_delay_ms: positiveNumber(selectDefinedValue(() => value.health_base_delay_ms, () => value.health_base_delay), DEFAULTS.health_base_delay_ms),
        kubeconfig_path: typeof value.kubeconfig_path === 'string' && value.kubeconfig_path.trim() ? value.kubeconfig_path.trim() : null,
    };
}
