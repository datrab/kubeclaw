import { selectDefinedValue, selectTruthyValue } from '../optional-absence.js';
// pipeline/services/runtime-policy.ts — required Buster runtime policy from swarm.config.json
import fs from 'fs';
import { expandSwarmConfig } from '../platform-config.js';
import { readBusterEnvironment } from '../buster-environment.js';
const DEFAULT_SWARM_CONFIG_PATH = '/home/node/.openclaw/swarm.config.json';
const runtimePolicyCache = { policy: null, platformConfig: null };
function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
function requirePositiveInteger(record, field, label) {
    const value = record[field];
    if (selectTruthyValue(() => (!Number.isInteger(value)), () => (value <= 0))) {
        throw new Error(`${label}: required positive integer in swarm.config.json`);
    }
    return value;
}
function requireNonNegativeNumber(record, field, label) {
    const value = record[field];
    if (selectTruthyValue(() => (selectTruthyValue(() => (typeof value !== 'number'), () => (!Number.isFinite(value)))), () => (value < 0))) {
        throw new Error(`${label}: required non-negative number in swarm.config.json`);
    }
    return value;
}
function requireNonEmptyString(record, field, label) {
    const value = typeof record[field] === 'string' ? record[field].trim() : '';
    if (!value)
        throw new Error(`${label}: required non-empty string in swarm.config.json`);
    return value;
}
export function loadBusterRuntimePolicy() {
    if (runtimePolicyCache.policy)
        return runtimePolicyCache.policy;
    const config = loadBusterPlatformConfig();
    if (!isRecord(config?.buster)) {
        throw new Error('config.buster: required platform config object in swarm.config.json');
    }
    if (!isRecord(config.buster.runtime)) {
        throw new Error('config.buster.runtime: required platform config object in swarm.config.json');
    }
    const runtime = config.buster.runtime;
    runtimePolicyCache.policy = Object.freeze({
        task_stream: requireNonEmptyString(runtime, 'task_stream', 'config.buster.runtime.task_stream'),
        heartbeat_path: requireNonEmptyString(runtime, 'heartbeat_path', 'config.buster.runtime.heartbeat_path'),
        heartbeat_interval_ms: requirePositiveInteger(runtime, 'heartbeat_interval_ms', 'config.buster.runtime.heartbeat_interval_ms'),
        task_poll_interval_ms: requirePositiveInteger(runtime, 'task_poll_interval_ms', 'config.buster.runtime.task_poll_interval_ms'),
        task_pending_reclaim_idle_ms: requirePositiveInteger(runtime, 'task_pending_reclaim_idle_ms', 'config.buster.runtime.task_pending_reclaim_idle_ms'),
        task_stream_max_len: requirePositiveInteger(runtime, 'task_stream_max_len', 'config.buster.runtime.task_stream_max_len'),
    });
    return runtimePolicyCache.policy;
}
export function loadBusterPlatformConfig() {
    if (runtimePolicyCache.platformConfig)
        return runtimePolicyCache.platformConfig;
    const configPath = resolveSwarmConfigPathFromEnv();
    const platformConfig = expandSwarmConfig(JSON.parse(fs.readFileSync(configPath, 'utf8')));
    runtimePolicyCache.platformConfig = platformConfig;
    return platformConfig;
}
export function loadBusterSessionPolicies() {
    const config = loadBusterPlatformConfig();
    const session = config.session;
    const gateway = config.gateway;
    if (!isRecord(session?.spawn))
        throw new Error('config.session.spawn: required platform config object in swarm.config.json');
    if (!isRecord(session?.kill))
        throw new Error('config.session.kill: required platform config object in swarm.config.json');
    if (!isRecord(session?.termination))
        throw new Error('config.session.termination: required platform config object in swarm.config.json');
    if (!isRecord(gateway?.invoke))
        throw new Error('config.gateway.invoke: required platform config object in swarm.config.json');
    if (!isRecord(gateway.invoke.retry))
        throw new Error('config.gateway.invoke.retry: required platform config object in swarm.config.json');
    const spawnPolicy = session.spawn;
    const killPolicy = session.kill;
    const terminationPolicy = session.termination;
    const retryPolicy = gateway.invoke.retry;
    const gatewayPolicy = (field, label) => {
        const invokePolicy = gateway.invoke[field];
        if (!isRecord(invokePolicy))
            throw new Error(`${label}: required platform config object in swarm.config.json`);
        return {
            timeoutMs: requireNonNegativeNumber(invokePolicy, 'timeout_ms', `${label}.timeout_ms`),
            maxRetries: requirePositiveInteger(retryPolicy, 'max_attempts', 'config.gateway.invoke.retry.max_attempts'),
            retryDelayMs: requireNonNegativeNumber(retryPolicy, 'retry_delay_ms', 'config.gateway.invoke.retry.retry_delay_ms'),
        };
    };
    const statusGateway = gatewayPolicy('session_status', 'config.gateway.invoke.session_status');
    const spawnGateway = gatewayPolicy('session_spawn', 'config.gateway.invoke.session_spawn');
    const requestGateway = gatewayPolicy('subagent_kill', 'config.gateway.invoke.subagent_kill');
    const stopGateway = gatewayPolicy('session_send', 'config.gateway.invoke.session_send');
    const listGateway = gatewayPolicy('subagent_list', 'config.gateway.invoke.subagent_list');
    return {
        gatewayStatusPolicy: statusGateway,
        spawnPolicy: buildSpawnPolicy(spawnPolicy, spawnGateway),
        killPolicy: buildKillPolicy(killPolicy, statusGateway, requestGateway, stopGateway, listGateway),
        terminationPolicy: buildTerminationPolicy(terminationPolicy),
    };
}
function buildSpawnPolicy(policy, gateway) {
    return {
        gateway,
        thread: policy.thread === true,
        mode: requireNonEmptyString(policy, 'mode', 'config.session.spawn.mode'),
        cleanup: requireNonEmptyString(policy, 'cleanup', 'config.session.spawn.cleanup'),
        streamTo: requireNonEmptyString(policy, 'stream_to', 'config.session.spawn.stream_to'),
    };
}
function buildKillPolicy(policy, statusGateway, requestGateway, stopGateway, listGateway) {
    return {
        acpConfirmTimeoutMs: requireNonNegativeNumber(policy, 'acp_confirm_timeout_ms', 'config.session.kill.acp_confirm_timeout_ms'),
        subagentConfirmTimeoutMs: requireNonNegativeNumber(policy, 'subagent_confirm_timeout_ms', 'config.session.kill.subagent_confirm_timeout_ms'),
        confirmPollMs: requirePositiveInteger(policy, 'confirm_poll_ms', 'config.session.kill.confirm_poll_ms'),
        cleanupConfirmTimeoutMs: policy.cleanup_confirm_timeout_ms === 'match_confirm_timeout'
            ? 'match_confirm_timeout'
            : requireNonNegativeNumber(policy, 'cleanup_confirm_timeout_ms', 'config.session.kill.cleanup_confirm_timeout_ms'),
        statusTimeoutMs: statusGateway.timeoutMs,
        requestTimeoutMs: requestGateway.timeoutMs,
        stopRequestTimeoutMs: stopGateway.timeoutMs,
        listTimeoutMs: listGateway.timeoutMs,
        statusGateway,
        requestGateway,
        stopGateway,
        listGateway,
        acpxTimeoutMs: requireNonNegativeNumber(policy, 'acpx_timeout_ms', 'config.session.kill.acpx_timeout_ms'),
        stopMessage: requireNonEmptyString(policy, 'stop_message', 'config.session.kill.stop_message'),
    };
}
function buildTerminationPolicy(policy) {
    const operationTimeoutMs = requirePositiveInteger(policy, 'gateway_operation_timeout_ms', 'config.session.termination.gateway_operation_timeout_ms');
    return {
        graceMs: requireNonNegativeNumber(policy, 'grace_ms', 'config.session.termination.grace_ms'),
        maxGraceMs: requireNonNegativeNumber(policy, 'max_grace_ms', 'config.session.termination.max_grace_ms'),
        confirmPollMs: requirePositiveInteger(policy, 'poll_ms', 'config.session.termination.poll_ms'),
        gatewayRequestMaxMs: requirePositiveInteger(policy, 'gateway_request_max_ms', 'config.session.termination.gateway_request_max_ms'),
        cleanupConfirmTimeoutMs: requireNonNegativeNumber(policy, 'cleanup_confirm_timeout_ms', 'config.session.termination.cleanup_confirm_timeout_ms'),
        statusTimeoutMs: operationTimeoutMs,
        requestTimeoutMs: operationTimeoutMs,
        stopRequestTimeoutMs: operationTimeoutMs,
        listTimeoutMs: operationTimeoutMs,
        acpxTimeoutMs: requirePositiveInteger(policy, 'acpx_timeout_ms', 'config.session.termination.acpx_timeout_ms'),
    };
}
export function loadBusterGitPushPolicy() {
    const config = loadBusterPlatformConfig();
    if (!isRecord(config.git?.push)) {
        throw new Error('config.git.push: required platform config object in swarm.config.json');
    }
    const pushPolicy = config.git.push;
    return {
        maxAttempts: requirePositiveInteger(pushPolicy, 'max_attempts', 'config.git.push.max_attempts'),
        retryDelayMs: requireNonNegativeNumber(pushPolicy, 'retry_delay_ms', 'config.git.push.retry_delay_ms'),
    };
}
export function loadBusterGatewayHealthPolicy() {
    const config = loadBusterPlatformConfig();
    if (!isRecord(config?.gateway?.invoke?.health))
        throw new Error('config.gateway.invoke.health: required platform config object in swarm.config.json');
    if (!isRecord(config?.gateway?.health))
        throw new Error('config.gateway.health: required platform config object in swarm.config.json');
    return {
        invokeTimeoutMs: requireNonNegativeNumber(config.gateway.invoke.health, 'timeout_ms', 'config.gateway.invoke.health.timeout_ms'),
        readyTimeoutMs: requirePositiveInteger(config.gateway.health, 'timeout_ms', 'config.gateway.health.timeout_ms'),
        readyIntervalMs: requirePositiveInteger(config.gateway.health, 'interval_ms', 'config.gateway.health.interval_ms'),
        monitorIntervalMs: requirePositiveInteger(config.gateway.health, 'monitor_interval_ms', 'config.gateway.health.monitor_interval_ms'),
        maxFailures: requirePositiveInteger(config.gateway.health, 'max_failures', 'config.gateway.health.max_failures'),
    };
}
export function loadBusterDiscordWebhookTimeoutMs() {
    const config = loadBusterPlatformConfig();
    if (!isRecord(config.discord)) {
        throw new Error('config.discord: required platform config object in swarm.config.json');
    }
    return requirePositiveInteger(config.discord, 'webhook_timeout_ms', 'config.discord.webhook_timeout_ms');
}
export function resetBusterRuntimePolicyForTests() {
    runtimePolicyCache.policy = null;
    runtimePolicyCache.platformConfig = null;
}
function resolveSwarmConfigPathFromEnv() {
    const configured = readBusterEnvironment('SWARM_CONFIG');
    if (configured !== undefined && configured !== null && String(configured).trim()) {
        return String(configured);
    }
    return DEFAULT_SWARM_CONFIG_PATH;
}
