import fs from 'fs';
import path from 'path';
import { selectTruthyValue } from '../optional-absence.js';
import { emitEvent } from '../services/telemetry.js';
import { createRunnerVerdict } from '../services/verdict-schema.js';
import { writeBusterRuntimeLog } from '../services/logger.js';
import { readBusterEnvironment } from '../buster-environment.js';
export const RESULTS_DIR = readBusterEnvironment('BUSTER_RESULTS_DIR') ?? '/home/builder/.openclaw/results';
function warnNonBlocking(classification, error, context) {
    const detail = error instanceof Error ? error.message : String(error);
    writeBusterRuntimeLog('warn', 'suite-runner', `Non-blocking ${classification}`, { detail, context });
}
function safeArtifactSegment(value) {
    const segment = value.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^\.+/, '');
    if (!segment)
        throw new Error('Buster suite artifact segment must be non-empty after sanitization');
    return segment;
}
export function resolveSuiteResultsDir(moduleId, attempt) {
    return path.join(RESULTS_DIR, `${safeArtifactSegment(moduleId)}${attempt ? `-attempt-${attempt}` : ''}`);
}
async function emitWriteDiagnostic(tctx, classification, error, context) {
    await emitEvent(tctx, 'observability.degraded', { component: 'buster_suite_runner', surface: 'suite_results', reason: classification,
        detail: error instanceof Error ? error.message : String(error), module_id: context.module ?? null,
        gate_id: context.gate_id ?? null, gate_type: context.gate_type ?? null, attempt: context.attempt ?? null,
        dispatch_id: context.dispatch_id ?? null, session_key: context.session_key ?? null, degraded_at: new Date().toISOString() });
}
function writeVerdicts(dir, suiteMap, runner, suffix = '') {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `runner-verdict${suffix}.json`), JSON.stringify(runner, null, 2));
    for (const [name, suite] of Object.entries(suiteMap))
        fs.writeFileSync(path.join(dir, `${name}-verdict${suffix}.json`), JSON.stringify(suite, null, 2));
}
export async function writeSuiteResults(input) {
    const runner = createRunnerVerdict(input.moduleId, input.project, input.suiteMap);
    const telemetry = input.telemetryContext && typeof input.telemetryContext === 'object' ? input.telemetryContext : {};
    const context = { module: telemetry.gateId ? null : input.moduleId, gate_id: telemetry.gateId ?? null,
        gate_type: telemetry.gateType ?? null, attempt: input.attempt, dispatch_id: telemetry.dispatchId ?? null, session_key: telemetry.sessionKey ?? null };
    try {
        writeVerdicts(resolveSuiteResultsDir(input.moduleId, input.attempt), input.suiteMap, runner);
    }
    catch (error) {
        warnNonBlocking('buster_results_write_failed', error, context);
        await emitWriteDiagnostic(input.telemetryContext, 'buster_results_write_failed', error, context);
    }
    if (!input.swarmResultsDir)
        return;
    try {
        writeVerdicts(input.swarmResultsDir, input.suiteMap, runner, input.attempt ? `-attempt-${input.attempt}` : '');
    }
    catch (error) {
        warnNonBlocking('swarm_results_write_failed', error, context);
        await emitWriteDiagnostic(input.telemetryContext, 'swarm_results_write_failed', error, context);
    }
}
export function createSuiteLogSink(logPath, moduleId) {
    if (!logPath)
        return null;
    return (entry) => {
        try {
            fs.appendFileSync(logPath, `${JSON.stringify({ ts: new Date().toISOString(), ...entry })}\n`);
        }
        catch (error) {
            warnNonBlocking('suite_jsonl_append_failed', error, { module: moduleId, logPath });
        }
    };
}
export function initializeSuiteResultsDir(resultsDir, moduleId) {
    if (!resultsDir)
        return;
    try {
        fs.mkdirSync(resultsDir, { recursive: true });
    }
    catch (error) {
        warnNonBlocking('swarm_results_dir_init_failed', error, { module: moduleId, resultsDir });
    }
}
export async function cleanupSuiteResources(cleanups, context) {
    for (const cleanup of cleanups.reverse())
        try {
            await cleanup();
        }
        catch (error) {
            warnNonBlocking('suite_runtime_cleanup_failed', error, context);
        }
}
