import { buildReviewDispatchRequest, } from './protocol.js';
import { parseReviewDispatchResponse, reviewOutputToStageResult, } from './review-output.js';
export async function execute(input, context) {
    const agent = context.contract.config.agent;
    if (typeof agent !== 'string' || !agent.trim()) {
        throw new Error('review agent is not configured');
    }
    const response = await context.invoke('runtime.dispatch', {
        operation: 'dispatch',
        resource: { type: 'runtime.agent', canonicalId: agent },
        payload: buildReviewDispatchRequest(agent, input, context.contract.guidance?.helperPrompt),
    });
    return reviewOutputToStageResult(parseReviewDispatchResponse(response));
}
