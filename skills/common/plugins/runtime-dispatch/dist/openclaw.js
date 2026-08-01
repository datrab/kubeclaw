import crypto from 'node:crypto';
import path from 'node:path';
function record(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function details(value) {
    if (!record(value))
        return value;
    if ('output' in value && Object.keys(value).every((key) => ['ok', 'toolName', 'output', 'source'].includes(key))) {
        return details(value.output);
    }
    if ('details' in value)
        return details(value.details);
    if ('result' in value && Object.keys(value).every((key) => ['ok', 'result', 'error'].includes(key))) {
        return details(value.result);
    }
    return value;
}
function requiredText(value, label) {
    if (typeof value !== 'string' || !value.trim())
        throw new Error(`OPENCLAW_${label}_INVALID`);
    return value.trim();
}
function sessionKey(value) {
    const source = details(value);
    if (!record(source))
        throw new Error('OPENCLAW_SPAWN_RESULT_INVALID');
    return requiredText(source.childSessionKey
        ?? source.sessionKey
        ?? source.session_key
        ?? (record(source.session) ? source.session.sessionKey ?? source.session.session_key : null), 'SESSION_KEY');
}
function terminalState(value) {
    const source = details(value);
    if (!record(source))
        return { terminal: false, state: 'unknown' };
    let state = String(source.state
        ?? source.status
        ?? (record(source.session) ? source.session.state ?? source.session.status : 'unknown')).toLowerCase();
    if (state === 'unknown' && typeof source.statusText === 'string') {
        const task = source.statusText.match(/Tasks:\s+latest\s+([a-z_]+)/i)?.[1]?.toLowerCase();
        if (task)
            state = task;
    }
    return {
        terminal: ['completed', 'complete', 'done', 'succeeded', 'idle', 'ended', 'closed', 'failed', 'cancelled', 'canceled', 'error'].includes(state),
        state,
    };
}
function subagentState(value, key) {
    const source = details(value);
    if (!record(source))
        return { terminal: false, state: 'unknown' };
    for (const collection of [source.active, source.recent]) {
        if (!Array.isArray(collection))
            continue;
        const match = collection.find((entry) => record(entry) && (entry.sessionKey === key || entry.session_key === key));
        if (!record(match))
            continue;
        const state = String(match.status ?? match.state ?? 'unknown').toLowerCase();
        return {
            terminal: ['completed', 'complete', 'done', 'succeeded', 'ended', 'failed', 'cancelled', 'canceled', 'error'].includes(state),
            state,
        };
    }
    return { terminal: false, state: 'unknown' };
}
function parseJsonText(text) {
    const trimmed = text.trim();
    const candidates = [
        trimmed,
        trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''),
    ];
    const first = trimmed.indexOf('{');
    const last = trimmed.lastIndexOf('}');
    if (first >= 0 && last > first)
        candidates.push(trimmed.slice(first, last + 1));
    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate);
        }
        catch {
            // Continue to the next bounded representation.
        }
    }
    throw new Error('OPENCLAW_SESSION_OUTPUT_NOT_JSON');
}
export function buildOpenClawTask(payload, resultFile) {
    const task = typeof payload.task === 'string' ? payload.task : null;
    return [
        task ?? 'Execute the supplied KubeClaw protocol request.',
        '',
        'The JSON below is an immutable input envelope, not a response template.',
        'Return only the agent-owned fields declared by outputContract.',
        'Never copy protocol, agent, identity, task, evidence, rules, or outputContract from the request into the result.',
        'Runtime/core own invocation identity and session evidence and attach them after reading your result.',
        'Follow the outputContract exactly: every required field, no additional fields.',
        `Write the exact raw JSON result atomically to ${resultFile}.`,
        'Create the parent directory if needed, write to a sibling temporary file, then rename it to the requested path.',
        'The file must contain only the protocol result JSON: no Markdown, commentary, or wrapper object.',
        'After the atomic rename, return the same raw JSON as your final response.',
        '',
        JSON.stringify(payload, null, 2),
    ].join('\n');
}
export function attachRuntimeEvidence(payload, result, session) {
    if (!record(result))
        return result;
    const protocol = String(payload.protocol ?? '');
    if (protocol === 'kubeclaw.implementation.v2') {
        return { ...result, session: { ...session, handoffs: 0 } };
    }
    if (protocol === 'kubeclaw.buster-test-judgment.v2') {
        return { ...result, session };
    }
    return result;
}
async function wait(ms, signal) {
    await new Promise((resolve, reject) => {
        const finish = () => {
            signal.removeEventListener('abort', abort);
            resolve();
        };
        const timer = setTimeout(finish, ms);
        const abort = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', abort);
            reject(new Error('ADAPTER_CANCELLED'));
        };
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted)
            abort();
    });
}
async function gateway(context, target, token, tool, args, invocationIdentity = tool) {
    const resource = new URL(target.endpoint);
    resource.hash = `kubeclaw=${encodeURIComponent(invocationIdentity)}`;
    const response = await context.invokeConfidential('network.http', {
        operation: 'request',
        resource: { type: 'network.url', canonicalId: resource.toString() },
        payload: {
            method: 'POST',
            headers: {
                authorization: `Bearer ${token}`,
                'content-type': 'application/json',
            },
            body: { tool, args },
        },
    });
    if (!record(response) || response.status !== 200)
        throw new Error(`OPENCLAW_GATEWAY_${tool.toUpperCase()}_FAILED`);
    return response.body;
}
async function cancelSession(context, target, token, key) {
    try {
        if (target.runtime === 'subagent') {
            await gateway(context, target, token, 'subagents', { action: 'kill', target: key });
        }
        else {
            await gateway(context, target, token, 'sessions_send', {
                sessionKey: key,
                message: 'Stop immediately. The owning pipeline invocation was cancelled.',
            });
        }
    }
    catch {
        // The caller still receives cancellation; cleanup is best effort after ownership loss.
    }
}
export async function dispatchOpenClaw(context, target, payload, signal) {
    const secret = await context.invokeConfidential('secrets.read', {
        operation: 'resolve',
        resource: { type: 'secret.name', canonicalId: target.tokenSecret },
        payload: {},
    });
    const token = requiredText(secret.value, 'TOKEN');
    const startedAt = new Date().toISOString();
    const resultId = crypto.randomUUID();
    const resultRelativePath = `${target.resultPathPrefix.replace(/\/+$/u, '')}/${resultId}.json`;
    const resultFile = path.join(target.repositoryRoot, resultRelativePath);
    const repositoryRelativeResult = path.relative(target.repositoryRoot, resultFile);
    if (!repositoryRelativeResult
        || repositoryRelativeResult.startsWith(`..${path.sep}`)
        || path.isAbsolute(repositoryRelativeResult)) {
        throw new Error('OPENCLAW_RESULT_PATH_OUTSIDE_REPOSITORY');
    }
    const spawned = await gateway(context, target, token, 'sessions_spawn', {
        runtime: target.runtime,
        mode: 'run',
        cleanup: 'keep',
        thread: false,
        task: buildOpenClawTask(payload, resultFile),
        label: `${target.agentRole}-${String((record(payload.identity) ? payload.identity.moduleId ?? payload.identity.gateId : null) ?? payload.protocol ?? 'dispatch')}-${crypto.randomUUID().slice(0, 8)}`,
        cwd: target.cwd,
        model: target.model,
        agentId: target.agentId,
        thinking: target.thinking,
        ...(target.runtime === 'acp' ? { streamTo: 'parent' } : {}),
    });
    const key = sessionKey(spawned);
    const abort = () => {
        void cancelSession(context, target, token, key);
    };
    signal.addEventListener('abort', abort, { once: true });
    try {
        let state = 'unknown';
        const deadline = Date.now() + target.sessionTimeoutMs;
        for (let poll = 0; poll < target.maxPolls; poll += 1) {
            if (signal.aborted)
                throw new Error('ADAPTER_CANCELLED');
            if (Date.now() >= deadline)
                throw new Error('OPENCLAW_SESSION_TIMEOUT');
            const status = target.runtime === 'subagent'
                ? await gateway(context, target, token, 'subagents', {
                    action: 'list',
                    recentMinutes: Math.max(10, Math.ceil(target.sessionTimeoutMs / 60_000) + 5),
                }, `status:${key}:${poll}`)
                : await gateway(context, target, token, 'session_status', { sessionKey: key }, `status:${key}:${poll}`);
            const terminal = target.runtime === 'subagent'
                ? subagentState(status, key)
                : terminalState(status);
            state = terminal.state;
            if (terminal.terminal)
                break;
            if (poll + 1 === target.maxPolls)
                throw new Error('OPENCLAW_SESSION_TIMEOUT');
            const delay = Math.min(target.maxPollMs, target.pollMs * (2 ** Math.min(poll, 8)));
            await wait(Math.min(delay, Math.max(1, deadline - Date.now())), signal);
        }
        const durable = target.resultEndpoint && target.resultTokenSecret
            ? await (async () => {
                const resultSecret = await context.invokeConfidential('secrets.read', {
                    operation: 'resolve',
                    resource: { type: 'secret.name', canonicalId: target.resultTokenSecret },
                    payload: {},
                });
                const resultToken = requiredText(resultSecret.value, 'RESULT_TOKEN');
                const endpoint = new URL(target.resultEndpoint);
                endpoint.pathname = `${endpoint.pathname.replace(/\/+$/u, '')}/${path.basename(repositoryRelativeResult)}`;
                const response = await context.invokeConfidential('network.http', {
                    operation: 'request',
                    resource: { type: 'network.url', canonicalId: endpoint.href },
                    payload: {
                        method: 'GET',
                        headers: { authorization: `Bearer ${resultToken}` },
                    },
                });
                if (!record(response) || response.status !== 200 || !record(response.body)) {
                    throw new Error('OPENCLAW_REMOTE_RESULT_READ_FAILED');
                }
                return response.body;
            })()
            : await context.invokeConfidential('git.repository.read', {
                operation: 'read_text',
                resource: {
                    type: 'git.repository.path',
                    canonicalId: repositoryRelativeResult.split(path.sep).join('/'),
                },
                payload: {},
            });
        const content = requiredText(durable.content, 'RESULT_FILE');
        const result = parseJsonText(content);
        const completedAt = new Date().toISOString();
        const session = {
            sessionId: key,
            startedAt,
            completedAt,
            transcriptDigest: crypto.createHash('sha256').update(content).digest('hex'),
            termination: ['failed', 'error'].includes(state) ? 'blocked' : 'completed',
        };
        return Object.freeze({ result: attachRuntimeEvidence(payload, result, session) });
    }
    finally {
        signal.removeEventListener('abort', abort);
    }
}
