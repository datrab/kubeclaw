import { buildSummary } from './summary.js';
export async function execute(input, context) {
    let summary;
    try {
        summary = buildSummary(input);
    }
    catch (error) {
        return { schemaVersion: 'stage-result.v2', outcome: 'blocked', reason: { code: 'project_summary.invalid_facts', message: error instanceof Error ? error.message : String(error) }, artifacts: [] };
    }
    const stored = await context.invoke('artifacts.write', { operation: 'put_json', resource: { type: 'artifact.object', canonicalId: `project-summary:${input.runId}` },
        payload: { namespace: 'kubeclaw.project-summary', mediaType: 'application/json', value: summary } });
    return { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts: [stored.artifact] };
}
