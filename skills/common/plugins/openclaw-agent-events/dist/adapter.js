import { createRequire } from 'node:module';
export const SUPPORTED_HOOKS = Object.freeze([
    'agent_end', 'llm_input', 'llm_output', 'subagent_spawned', 'subagent_ended',
    'before_tool_call', 'after_tool_call', 'model_call_started',
    'model_call_ended', 'session_start', 'session_end',
]);
const SUPPORTED = new Set(SUPPORTED_HOOKS);
const SENSITIVE_FIELD = /(?:authorization|cookie|password|secret|token|api[_-]?key|credential)/i;
const IDENTITY_FIELD = /^(?:identity|run_?id|stage_?id|attempt_?id)$/i;
const SAFE_METRIC_FIELD = /^(?:duration|duration_?ms|latency|latency_?ms|count|input_?tokens|output_?tokens|success|cached|status_?code)$/i;
function record(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
function release(subscription) {
    if (typeof subscription === 'function')
        subscription();
    else if (typeof subscription.unsubscribe === 'function')
        subscription.unsubscribe();
    else if (typeof subscription.dispose === 'function')
        subscription.dispose();
    else
        subscription.off?.();
}
function optionalIdentity(value, field) {
    return typeof value === 'string' && value.length > 0 && value.length <= 512 ? { [field]: value } : {};
}
function projectEvent(event) {
    const entries = Object.entries(event)
        .filter(([key]) => !IDENTITY_FIELD.test(key) && !SENSITIVE_FIELD.test(key))
        .slice(0, 128);
    const metrics = Object.fromEntries(entries.filter(([key, value]) => SAFE_METRIC_FIELD.test(key)
        && (typeof value === 'number' && Number.isFinite(value) || typeof value === 'boolean')));
    return Object.freeze({
        schemaVersion: 'openclaw-agent-event.v2',
        observedFields: Object.freeze(entries.map(([key]) => key.slice(0, 128)).sort()),
        metrics: Object.freeze(metrics),
    });
}
export function normalizeAgentEvent(raw) {
    const event = record(raw);
    const identity = record(event.identity);
    const runId = identity.runId ?? identity.run_id ?? event.runId ?? event.run_id;
    if (typeof runId !== 'string' || runId.length === 0 || runId.length > 512)
        return undefined;
    return {
        identity: Object.freeze({
            runId,
            ...optionalIdentity(identity.stageId ?? identity.stage_id ?? event.stageId ?? event.stage_id, 'stageId'),
            ...optionalIdentity(identity.attemptId ?? identity.attempt_id ?? event.attemptId ?? event.attempt_id, 'attemptId'),
        }),
        payload: projectEvent(event),
    };
}
export function activateWithSdk(context, sdk) {
    const configured = context.config.hooks;
    if (!Array.isArray(configured) || configured.length === 0)
        throw new Error('AGENT_EVENT_HOOKS_INVALID');
    const hooks = configured.map((hook) => {
        if (typeof hook !== 'string' || !SUPPORTED.has(hook))
            throw new Error(`AGENT_EVENT_HOOK_UNSUPPORTED:${String(hook)}`);
        return hook;
    });
    if (new Set(hooks).size !== hooks.length)
        throw new Error('AGENT_EVENT_HOOK_DUPLICATE');
    const subscriptions = [];
    let pending = Promise.resolve();
    let failures = 0;
    let emitted = 0;
    let shuttingDown = false;
    return {
        async ready() {
            if (typeof sdk.on !== 'function')
                throw new Error('OPENCLAW_HOOK_API_UNAVAILABLE');
            try {
                for (const hook of hooks) {
                    subscriptions.push(sdk.on(hook, (raw) => {
                        if (shuttingDown)
                            return;
                        const normalized = normalizeAgentEvent(raw);
                        if (!normalized)
                            return;
                        pending = pending.then(async () => {
                            try {
                                await context.emit(`plugin.kubeclaw.openclaw-agent-events.${hook.replaceAll('_', '-')}`, normalized.identity, normalized.payload);
                                emitted += 1;
                            }
                            catch {
                                failures += 1;
                            }
                        });
                    }));
                }
            }
            catch (error) {
                shuttingDown = true;
                while (subscriptions.length > 0)
                    release(subscriptions.pop());
                await pending;
                throw error;
            }
        },
        async invoke({ request, signal }) {
            if (signal.aborted)
                throw new Error('ADAPTER_CANCELLED');
            if (request.capability !== 'agent.events.subscribe' || request.operation !== 'status') {
                throw new Error('AGENT_EVENT_SOURCE_OPERATION_UNSUPPORTED');
            }
            await pending;
            return { activeSubscriptions: subscriptions.length, emitted, failures, shuttingDown };
        },
        async shutdown() {
            shuttingDown = true;
            while (subscriptions.length > 0)
                release(subscriptions.pop());
            await pending;
        },
    };
}
export function activate(context) {
    const require = createRequire(import.meta.url);
    return activateWithSdk(context, require('openclaw/plugin-sdk'));
}
