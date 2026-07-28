import { buildRequest, parseCompletion } from './protocol.js';
export async function execute(input, context) {
    const agent = context.contract.config.agent;
    if (typeof agent !== 'string' || !agent.trim())
        throw new Error('implementation agent is not configured');
    let completion;
    try {
        const response = await context.invoke('runtime.dispatch', {
            operation: 'dispatch', resource: { type: 'runtime.agent', canonicalId: agent },
            payload: buildRequest(agent, input, context.contract.guidance?.helperPrompt),
        });
        completion = parseCompletion(response.result, input);
    }
    catch (error) {
        return { schemaVersion: 'stage-result.v2', outcome: 'blocked',
            reason: { code: 'implementation.invalid_completion', message: error instanceof Error ? error.message : String(error) }, artifacts: [] };
    }
    const stored = await context.invoke('artifacts.write', {
        operation: 'put_json', resource: { type: 'artifact.object', canonicalId: `implementation:${input.moduleId}:${input.attempt}` },
        payload: { namespace: 'kubeclaw.implementation-agent', mediaType: 'application/json', value: completion },
    });
    const artifacts = [stored.artifact];
    return completion.status === 'ready_for_testing'
        ? { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts }
        : { schemaVersion: 'stage-result.v2', outcome: 'blocked',
            reason: { code: 'implementation.blocked', message: completion.summary }, artifacts };
}
