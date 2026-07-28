import { buildRequest, parseVerdict } from './protocol.js';
export async function execute(input, context) {
    const agent = context.contract.config.agent;
    if (typeof agent !== 'string' || !agent.trim())
        throw new Error('quality evaluator agent is not configured');
    let verdict;
    try {
        const response = await context.invoke('runtime.dispatch', { operation: 'dispatch', resource: { type: 'runtime.agent', canonicalId: agent }, payload: buildRequest(agent, input) });
        verdict = parseVerdict(response.result, input);
    }
    catch (error) {
        return { schemaVersion: 'stage-result.v2', outcome: 'blocked', reason: { code: 'buster_quality.invalid_verdict', message: error instanceof Error ? error.message : String(error) }, artifacts: [] };
    }
    const stored = await context.invoke('artifacts.write', { operation: 'put_json', resource: { type: 'artifact.object', canonicalId: `buster-quality:${input.gateId}:${input.attempt}` }, payload: { namespace: 'kubeclaw.buster-quality-gate', mediaType: 'application/json', value: verdict } });
    const artifacts = [stored.artifact];
    if (verdict.outcome === 'passed')
        return { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts };
    return { schemaVersion: 'stage-result.v2', outcome: verdict.outcome, reason: { code: `buster_quality.${verdict.failureClass}`, message: verdict.summary, details: { findings: verdict.findings } }, artifacts };
}
