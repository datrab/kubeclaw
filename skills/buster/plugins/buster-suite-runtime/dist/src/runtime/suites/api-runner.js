import { selectDefinedValue } from '../optional-absence.js';
import { createFinding, createSuiteVerdict, SEVERITY, STATUS } from '../services/verdict-schema.js';
import { suiteNonEmptyString as nonEmptyString } from './support.js';
import { missingTemplateVarsForTest } from './api-values.js';
import { runHttpTest } from './api-http.js';
import { runWsTest } from './api-websocket.js';
async function executeTest(test, context) {
    const method = nonEmptyString(test.method) ?? 'GET';
    const name = nonEmptyString(test.name) ?? `${method} ${String(test.path)}`;
    const isWs = test.protocol === 'ws';
    const missing = missingTemplateVarsForTest(test, context.vars, context.defaults);
    if (missing.length > 0)
        return { name, isWs, missing, result: { passed: false, failures: [`Missing API template variable(s): ${missing.join(', ')}`], status: null, elapsed: 0 } };
    const result = isWs
        ? await runWsTest(test, context.baseUrl, context.vars, context.wsTimeout, context.log)
        : await runHttpTest(test, context.baseUrl, context.defaults, context.vars, context.timeoutMs);
    return { name, isWs, missing, result };
}
export async function executeApiTests(context) {
    const summary = { passed: 0, failed: 0, findings: [] };
    for (const test of context.tests) {
        const outcome = await executeTest(test, context);
        context.log(`  ${outcome.result.passed ? '✅' : '❌'} ${outcome.name} (${outcome.result.elapsed}ms)`);
        if (outcome.result.passed) {
            summary.passed += 1;
            continue;
        }
        summary.failed += 1;
        if (summary.findings.length >= context.maxFindings)
            continue;
        for (const failure of outcome.result.failures)
            summary.findings.push(createFinding(SEVERITY.SERIOUS, `${outcome.name}: ${failure}`, {
                rule: outcome.missing.length > 0 ? 'api-template-variable' : outcome.isWs ? 'ws-test' : 'http-test', element: test.path,
            }));
    }
    return summary;
}
export function buildApiVerdict(input) {
    const enforced = input.thresholds !== null;
    const maxFailures = selectDefinedValue(() => input.thresholds?.max_failures, () => 0);
    const status = enforced && input.summary.failed > maxFailures ? STATUS.FAIL : STATUS.PASS;
    const duration_ms = Date.now() - input.startTime;
    input.log(`${status === STATUS.PASS ? '✅' : '⚠️'} ${enforced ? 'enforced' : 'informational'}: ${input.summary.passed}/${input.tests.length} passed, ${input.summary.failed} failed (${duration_ms}ms)`);
    return createSuiteVerdict('api', status, {
        critical: false, duration_ms, checks_total: input.tests.length, checks_passed: input.summary.passed,
        checks_failed: input.summary.failed, findings: input.summary.findings,
        metadata: { spec_file: input.specPath, base_url: input.baseUrl, mode: enforced ? 'enforced' : 'informational', has_auth: input.hasAuth,
            ws_tests: input.tests.filter((test) => test.protocol === 'ws').length, http_tests: input.tests.filter((test) => test.protocol !== 'ws').length,
            ...(enforced ? { thresholds: input.thresholds } : {}) },
    });
}
