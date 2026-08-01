import { buildRequest, parseVerdict } from './protocol.js';
function validateSuiteReceipt(result) {
    const receipt = result.receipt;
    if (!receipt
        || typeof receipt !== 'object'
        || Array.isArray(receipt)
        || receipt.schemaVersion !== 'test-suite-receipt.v1'
        || typeof receipt.provider !== 'string'
        || receipt.provider.length === 0
        || typeof receipt.jobId !== 'string'
        || receipt.jobId.length === 0
        || typeof receipt.completedAt !== 'string'
        || !Number.isFinite(Date.parse(receipt.completedAt))
        || typeof receipt.resultDigest !== 'string'
        || !/^[a-f0-9]{64}$/u.test(receipt.resultDigest)) {
        throw new Error('TEST_SUITE_RECEIPT_INVALID');
    }
}
function busterSummary(result) {
    const findings = Array.isArray(result.findings)
        ? result.findings
            .map((finding) => finding?.message)
            .filter((message) => typeof message === 'string' && message.length > 0)
        : [];
    return [
        `status=${result.status}`,
        result.reason,
        result.error,
        ...findings,
    ].filter((entry) => typeof entry === 'string' && entry.length > 0)
        .join('\n')
        .slice(0, 2_048);
}
async function executeTestSuitePlan(input, context) {
    const result = await context.invoke('test.suite.execute', {
        operation: 'run',
        resource: {
            type: 'test.suite-plan',
            canonicalId: `${input.runId}:${input.taskId}:${input.attempt}`,
        },
        payload: {
            repositoryRoot: input.suitePlan.repositoryRoot,
            suites: input.suitePlan.suites,
            testConfig: input.suitePlan.testConfig,
            task: input.suitePlan.task,
            moduleId: input.suitePlan.moduleId,
            attempt: input.attempt,
        },
    });
    validateSuiteReceipt(result);
    if (!Array.isArray(result.results) || result.results.length === 0) {
        throw new Error('BUSTER_SUITE_RESULT_INVALID');
    }
    const evidence = result.results.map((value) => {
        if (!value
            || typeof value !== 'object'
            || Array.isArray(value)
            || typeof value.suite !== 'string'
            || typeof value.status !== 'string') {
            throw new Error('BUSTER_SUITE_RESULT_INVALID');
        }
        const suiteResult = value;
        return Object.freeze({
            suite: suiteResult.suite,
            passed: suiteResult.status === 'PASS',
            summary: busterSummary(suiteResult),
        });
    });
    return { evidence, execution: result };
}
async function executeCommandSuites(input, context) {
    const buster = await executeTestSuitePlan(input, context);
    const evidence = [
        ...input.suiteEvidence,
        ...buster.evidence,
    ];
    for (const suite of input.commandSuites ?? []) {
        const result = await context.invoke('command.execute', {
            operation: 'run',
            resource: { type: 'command.executable', canonicalId: suite.executable },
            payload: { args: suite.args, workingDirectory: suite.workingDirectory },
        });
        const exitCode = result.exitCode;
        const signal = result.signal;
        if (!(exitCode === null || Number.isSafeInteger(exitCode)))
            throw new Error(`TEST_SUITE_RESULT_INVALID:${suite.suite}`);
        if (!(signal === null || typeof signal === 'string'))
            throw new Error(`TEST_SUITE_RESULT_INVALID:${suite.suite}`);
        const stdout = typeof result.stdout === 'string' ? result.stdout.trim() : '';
        const stderr = typeof result.stderr === 'string' ? result.stderr.trim() : '';
        evidence.push({
            suite: suite.suite,
            passed: exitCode === 0 && signal === null,
            summary: [stdout, stderr, signal ? `signal=${signal}` : `exit=${String(exitCode)}`].filter(Boolean).join('\n').slice(0, 2_048),
        });
    }
    if (evidence.length === 0)
        throw new Error('TEST_SUITES_REQUIRED');
    return { evidence, suiteExecution: buster.execution };
}
export async function execute(input, context) {
    const agent = context.contract.config.agent;
    if (typeof agent !== 'string' || !agent.trim())
        throw new Error('test agent is not configured');
    let verdict;
    let executionEvidence = null;
    let finalSuiteEvidence = input.suiteEvidence;
    try {
        const executed = await executeCommandSuites(input, context);
        const suiteEvidence = executed.evidence;
        finalSuiteEvidence = suiteEvidence;
        executionEvidence = executed.suiteExecution;
        const judgedInput = { ...input, suiteEvidence };
        const response = await context.invoke('runtime.dispatch', {
            operation: 'dispatch',
            resource: { type: 'runtime.agent', canonicalId: agent },
            payload: buildRequest(agent, judgedInput),
        });
        verdict = parseVerdict(response.result, judgedInput);
    }
    catch (error) {
        return {
            schemaVersion: 'stage-result.v2',
            outcome: 'blocked',
            reason: { code: 'test_agent.invalid_verdict', message: error instanceof Error ? error.message : String(error) },
            artifacts: [],
        };
    }
    const stored = await context.invoke('artifacts.write', {
        operation: 'put_json',
        resource: { type: 'artifact.object', canonicalId: `test-verdict:${input.taskId}:${input.attempt}` },
        payload: { namespace: 'kubeclaw.test-agent', mediaType: 'application/json', value: {
                verdict,
                suiteEvidence: finalSuiteEvidence,
                suiteExecution: executionEvidence,
            } },
    });
    const artifacts = [stored.artifact];
    return verdict.verdict === 'PASS'
        ? { schemaVersion: 'stage-result.v2', outcome: 'passed', artifacts }
        : { schemaVersion: 'stage-result.v2', outcome: 'request_fix', reason: { code: 'test_agent.findings', message: verdict.summary, details: { findings: verdict.findings } }, artifacts };
}
