import { buildRequest, parseVerdict } from './protocol.js';
function validateSuiteReceipt(response) {
    const receipt = response.receipt;
    if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) || receipt.schemaVersion !== 'test-suite-receipt.v1' ||
        typeof receipt.provider !== 'string' || !receipt.provider || typeof receipt.jobId !== 'string' || !receipt.jobId ||
        typeof receipt.completedAt !== 'string' || !Number.isFinite(Date.parse(receipt.completedAt)) ||
        typeof receipt.resultDigest !== 'string' || !/^[a-f0-9]{64}$/u.test(receipt.resultDigest))
        throw new Error('TEST_SUITE_RECEIPT_INVALID');
}
async function executeBusterSuites(input, context) {
    const response = await context.invoke('test.suite.execute', {
        operation: 'run', resource: { type: 'test.suite-plan', canonicalId: `${input.runId}:${input.gateId}:${input.attempt}` },
        payload: { repositoryRoot: input.suitePlan.repositoryRoot, suites: input.suitePlan.suites, testConfig: input.suitePlan.testConfig,
            task: input.suitePlan.task, moduleId: input.suitePlan.moduleId, attempt: input.attempt },
    });
    validateSuiteReceipt(response);
    if (!Array.isArray(response.results) || response.results.length === 0)
        throw new Error('BUSTER_SUITE_RESULT_INVALID');
    return { suiteEvidence: [...input.suiteEvidence, ...response.results.map((value) => {
                if (!value || typeof value !== 'object' || Array.isArray(value) || typeof value.suite !== 'string' || typeof value.status !== 'string')
                    throw new Error('BUSTER_SUITE_RESULT_INVALID');
                const findings = Array.isArray(value.findings) ? value.findings.map((finding) => finding && typeof finding === 'object' && !Array.isArray(finding) && typeof finding.message === 'string' ? finding.message : '').filter(Boolean) : [];
                const summary = [`status=${value.status}`, typeof value.reason === 'string' ? value.reason : '', typeof value.error === 'string' ? value.error : '', ...findings].filter(Boolean).join('\n').slice(0, 2048);
                return { suite: value.suite, passed: value.status === 'PASS', summary };
            })], suiteExecution: response };
}
export async function execute(input, context) {
    const agent = context.contract.config.agent;
    if (typeof agent !== 'string' || !agent.trim())
        throw new Error('quality evaluator agent is not configured');
    let verdict;
    let executionEvidence = null;
    let finalSuiteEvidence = input.suiteEvidence;
    try {
        const executed = await executeBusterSuites(input, context);
        finalSuiteEvidence = executed.suiteEvidence;
        executionEvidence = executed.suiteExecution;
        const judgedInput = { ...input, suiteEvidence: finalSuiteEvidence };
        const response = await context.invoke('runtime.dispatch', { operation: 'dispatch', resource: { type: 'runtime.agent', canonicalId: agent }, payload: buildRequest(agent, judgedInput) });
        verdict = parseVerdict(response.result, judgedInput);
    }
    catch (error) {
        return { schemaVersion: 'stage-result.v2', outcome: 'blocked', reason: { code: 'buster_quality.invalid_verdict', message: error instanceof Error ? error.message : String(error) }, artifacts: [] };
    }
    const stored = await context.invoke('artifacts.write', { operation: 'put_json', resource: { type: 'artifact.object', canonicalId: `buster-quality:${input.gateId}:${input.attempt}` }, payload: { namespace: 'kubeclaw.buster-quality-gate', mediaType: 'application/json', value: { verdict, suiteEvidence: finalSuiteEvidence, suiteExecution: executionEvidence } } });
    const artifacts = [stored.artifact];
    if (verdict.outcome === 'passed')
        return { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts };
    return { schemaVersion: 'stage-result.v2', outcome: verdict.outcome, reason: { code: `buster_quality.${verdict.failureClass}`, message: verdict.summary, details: { findings: verdict.findings } }, artifacts };
}
