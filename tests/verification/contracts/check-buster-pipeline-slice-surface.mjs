import { installQuietRuntimeConsole } from '../lib/verification-console.mjs';
const quietConsole = installQuietRuntimeConsole({ label: 'contracts/check-buster-pipeline-slice-surface' });
import fs from 'fs';
import path from 'path';
import assert from 'assert';
import { pathToFileURL } from 'url';
import { execFileSync } from 'child_process';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { sourceRoot: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--source-root') args.sourceRoot = path.resolve(argv[i + 1]);
  }
  return args;
}

const { sourceRoot } = parseArgs();
process.env.REPO_ROOT = sourceRoot;
const shimPath = path.join(sourceRoot, 'skills/buster/buster-pipeline.ts');
const mainPath = path.join(sourceRoot, 'skills/buster/buster-pipeline.ts');
const helpersPath = path.join(sourceRoot, 'skills/buster/pipeline/services/pipeline-helpers.ts');
const monitorPath = path.join(sourceRoot, 'skills/buster/pipeline/services/session-monitor.ts');
const taskLifecyclePath = path.join(sourceRoot, 'skills/buster/pipeline/services/task-lifecycle.ts');
const telemetryPath = path.join(sourceRoot, 'skills/buster/pipeline/services/telemetry.ts');
const taskQueuePath = path.join(sourceRoot, 'skills/buster/pipeline/services/task-queue.ts');
const taskCompletionPath = path.join(sourceRoot, 'skills/buster/pipeline/services/task-completion.ts');
const taskLifecycleSessionPath = path.join(sourceRoot, 'skills/buster/pipeline/services/task-lifecycle/session.ts');
const taskLifecycleCompletionPath = path.join(sourceRoot, 'skills/buster/pipeline/services/task-lifecycle/completion-signal.ts');
const taskValidationPath = path.join(sourceRoot, 'skills/buster/pipeline/services/task-validation.ts');
const capabilitiesPath = path.join(sourceRoot, 'skills/buster/pipeline/services/capabilities.ts');
const sandboxCleanupPath = path.join(sourceRoot, 'skills/buster/pipeline/services/sandbox-cleanup.ts');
const rateLimitPath = path.join(sourceRoot, 'skills/buster/pipeline/services/rate-limit.ts');
const discordPath = path.join(sourceRoot, 'skills/buster/pipeline/services/discord.ts');
const baseImagesPath = path.join(sourceRoot, 'skills/buster/pipeline/services/base-images.ts');
const gatewayHealthPath = path.join(sourceRoot, 'skills/buster/pipeline/services/gateway-health.ts');
const suiteRunnerPath = path.join(sourceRoot, 'skills/buster/pipeline/runners/suite-runner.ts');
const a11ySuitePath = path.join(sourceRoot, 'skills/buster/pipeline/suites/a11y.ts');
const apiSuitePath = path.join(sourceRoot, 'skills/buster/pipeline/suites/api.ts');
const buildSuitePath = path.join(sourceRoot, 'skills/buster/pipeline/suites/build.ts');
const bundleSuitePath = path.join(sourceRoot, 'skills/buster/pipeline/suites/bundle.ts');
const e2eSuitePath = path.join(sourceRoot, 'skills/buster/pipeline/suites/e2e.ts');
const healthSuitePath = path.join(sourceRoot, 'skills/buster/pipeline/suites/health.ts');
const k8sSuitePath = path.join(sourceRoot, 'skills/buster/pipeline/suites/k8s.ts');
const manifestSuitePath = path.join(sourceRoot, 'skills/buster/pipeline/suites/manifest.ts');
const perfSuitePath = path.join(sourceRoot, 'skills/buster/pipeline/suites/perf.ts');
const securitySuitePath = path.join(sourceRoot, 'skills/buster/pipeline/suites/security.ts');
const unitSuitePath = path.join(sourceRoot, 'skills/buster/pipeline/suites/unit.ts');
const busterConventionsPath = path.join(sourceRoot, 'skills/buster/CONVENTIONS.md');
const busterReadmePath = path.join(sourceRoot, 'skills/buster/README.md');
const novaPromptSharedPath = path.join(sourceRoot, 'skills/nova/pipeline/prompts/shared.ts');
const novaBusterModulePromptPath = path.join(sourceRoot, 'skills/nova/pipeline/prompts/buster-module.ts');
const novaOrchestrationPath = path.join(sourceRoot, 'skills/nova/pipeline/agents/orchestration.ts');

const shimSource = fs.readFileSync(shimPath, 'utf8');
const mainSource = fs.readFileSync(mainPath, 'utf8');
const helpersSource = fs.readFileSync(helpersPath, 'utf8');
const monitorSource = fs.readFileSync(monitorPath, 'utf8');
const taskLifecycleSource = fs.readFileSync(taskLifecyclePath, 'utf8');
const telemetrySource = fs.readFileSync(telemetryPath, 'utf8');
const taskQueueSource = fs.readFileSync(taskQueuePath, 'utf8');
const taskCompletionSource = fs.readFileSync(taskCompletionPath, 'utf8');
const taskLifecycleSessionSource = fs.readFileSync(taskLifecycleSessionPath, 'utf8');
const taskLifecycleCompletionSource = fs.readFileSync(taskLifecycleCompletionPath, 'utf8');
const taskLifecycleCombinedSource = `${taskLifecycleSource}\n${taskLifecycleSessionSource}\n${taskLifecycleCompletionSource}`;
const taskValidationSource = fs.readFileSync(taskValidationPath, 'utf8');
const capabilitiesSource = fs.readFileSync(capabilitiesPath, 'utf8');
const sandboxCleanupSource = fs.readFileSync(sandboxCleanupPath, 'utf8');
const rateLimitSource = fs.readFileSync(rateLimitPath, 'utf8');
const discordSource = fs.readFileSync(discordPath, 'utf8');
const baseImagesSource = fs.readFileSync(baseImagesPath, 'utf8');
const gatewayHealthSource = fs.readFileSync(gatewayHealthPath, 'utf8');
const suiteRunnerSource = fs.readFileSync(suiteRunnerPath, 'utf8');
const a11ySuiteSource = fs.readFileSync(a11ySuitePath, 'utf8');
const apiSuiteSource = fs.readFileSync(apiSuitePath, 'utf8');
const buildSuiteSource = fs.readFileSync(buildSuitePath, 'utf8');
const bundleSuiteSource = fs.readFileSync(bundleSuitePath, 'utf8');
const e2eSuiteSource = fs.readFileSync(e2eSuitePath, 'utf8');
const healthSuiteSource = fs.readFileSync(healthSuitePath, 'utf8');
const k8sSuiteSource = fs.readFileSync(k8sSuitePath, 'utf8');
const manifestSuiteSource = fs.readFileSync(manifestSuitePath, 'utf8');
const perfSuiteSource = fs.readFileSync(perfSuitePath, 'utf8');
const securitySuiteSource = fs.readFileSync(securitySuitePath, 'utf8');
const unitSuiteSource = fs.readFileSync(unitSuitePath, 'utf8');
const busterConventionsSource = fs.readFileSync(busterConventionsPath, 'utf8');
const busterReadmeSource = fs.readFileSync(busterReadmePath, 'utf8');
const novaPromptSharedSource = fs.readFileSync(novaPromptSharedPath, 'utf8');
const novaBusterModulePromptSource = fs.readFileSync(novaBusterModulePromptPath, 'utf8');
const orchestrationSource = fs.readFileSync(novaOrchestrationPath, 'utf8');

assert.equal(shimSource.includes('await handleBusterEntrypoint();'), true, 'buster-pipeline.ts should execute the typed entrypoint directly');
assert.equal(shimSource.includes('export * from'), false, 'buster-pipeline.ts must not preserve public helper re-exports');
assert.equal(busterReadmeSource.includes('manifest → build → health → k8s → a11y → perf → bundle → security → visual-reg → api → e2e → unit'), true, 'Buster README suite order must include k8s in runtime order');
assert.equal(busterReadmeSource.includes('| k8s | — |'), true, 'Buster README dependency table must document k8s as independent');
assert.equal(busterReadmeSource.includes('Capability-denied verdicts are critical'), true, 'Buster README criticality text must mention capability-denied verdicts');
assert.equal(busterReadmeSource.includes('spawned sessions use required `session.agentId` / `session.agent_id`'), true, 'Buster README AGENT_NAME text must distinguish consumer identity from spawned session agent identity');
assert.equal(mainSource.includes("from './pipeline/services/pipeline-helpers.ts'"), true, 'typed buster entrypoint should import extracted task/status helpers for runtime startup/shutdown');
assert.equal(mainSource.includes("from './pipeline/services/session-monitor.ts'"), false, 'typed buster entrypoint should not re-export or import the session monitor helper barrel');
assert.equal(mainSource.includes('ensureTaskConsumerGroup'), true, 'buster-pipeline should initialize the task queue through the TaskQueue boundary');
assert.equal(mainSource.includes("redisClient.xgroup('CREATE'"), false, 'buster-pipeline should not create Redis groups directly');
assert.equal(mainSource.includes("from './pipeline/services/capabilities.ts'"), true, 'typed buster entrypoint should use the Buster capability contract at startup');
assert.equal(capabilitiesSource.includes('BUSTER_CAPABILITIES'), true, 'Buster capability contract should define canonical capabilities');
assert.equal(capabilitiesSource.includes('appendDurableOperatorAlert'), true, 'Buster capability denials must write durable operator alerts');
assert.equal(capabilitiesSource.includes('explicitCandidates.length > 0'), true, 'Buster capability alerts should not write repo-root .swarm fallback when explicit log targets exist');
assert.equal(/const SUITE_REGISTRY(?::[^=]+)?= Object\.freeze/.test(suiteRunnerSource), true, 'suite runner should use a static suite registry');
assert.equal(suiteRunnerSource.includes('Suite file not found'), false, 'suite runner must not preserve unknown-suite SKIP fallback');
assert.equal(suiteRunnerSource.includes("default: return '❓'"), false, 'suite runner must not render unreachable unknown status icon fallback');
assert.equal(suiteRunnerSource.includes('Unsupported suite status'), true, 'suite runner should fail closed if an unsupported suite status reaches icon rendering');
assert.equal(suiteRunnerSource.includes('export function validateSuiteNames('), true, 'suite runner should validate requested suite names before execution');
assert.equal(suiteRunnerSource.includes("DEPENDENCIES[suiteName] || ['build', 'health']"), false, 'suite runner must not default unknown suite dependencies to build/health');
assert.equal(suiteRunnerSource.includes('missing_suite_dependencies'), true, 'suite runner should fail loudly when a registered suite lacks dependency policy');
assert.equal(suiteRunnerSource.includes('invalid_suite_timeout_ms'), true, 'suite runner should reject invalid provided suite timeouts');
assert.equal(suiteRunnerSource.includes('config.suite_timeout_ms || SUITE_TIMEOUT_MS'), false, 'suite runner must not use loose OR fallback for suite timeouts');
assert.equal(suiteRunnerSource.includes('missing_suite_timeout_ms'), true, 'suite runner must require explicit suite timeout policy');
assert.equal(suiteRunnerSource.includes("moduleId || 'unknown'"), false, 'suite runner must not default missing module identity to unknown');
assert.equal(suiteRunnerSource.includes("project : 'unknown'"), false, 'suite runner must not default missing project identity to unknown');
assert.equal(orchestrationSource.includes('BUSTER_SUITE_RUNNER_DEFAULT_POLICY'), false, 'Nova Buster payload producer must not preserve local suite timeout code defaults');
assert.equal(orchestrationSource.includes('config.buster.suite_timeout_ms'), true, 'Nova Buster payload producer should read suite timeout from canonical platform config');
assert.equal(orchestrationSource.includes('config.buster_suite_timeout_ms'), false, 'Nova Buster payload producer must not preserve legacy top-level suite timeout alias');
assert.equal(suiteRunnerSource.includes('payload?.config'), false, 'suite runner must not preserve payload.config fallback beside typed test_config');
assert.equal(capabilitiesSource.includes('payload?.config'), false, 'Buster capability policy must not preserve payload.config fallback beside typed test_config');
assert.equal(suiteRunnerSource.includes('buster_capabilities'), false, 'suite runner must not preserve buster_capabilities capability fallback');
assert.equal(taskValidationSource.includes('status_json_path'), false, 'Buster task validation should not keep obsolete status_json_path-specific handling');
assert.equal(`${taskValidationSource}\n${capabilitiesSource}\n${orchestrationSource}`.includes('buster_capabilities'), false, 'Buster task capability handling should not keep legacy buster_capabilities alias');
assert.equal(suiteRunnerSource.includes("import buildSuite from '../suites/build.ts'"), true, 'suite runner should statically register suite implementations');
assert.equal(suiteRunnerSource.includes("import bundleSuite from '../suites/bundle.ts'"), true, 'suite runner should statically register migrated quality suite implementations');
assert.equal(suiteRunnerSource.includes('import('), false, 'suite runner must not dynamically import suite implementations');
assert.equal(suiteRunnerSource.indexOf('enforceSuiteCapabilities(suiteName, context)') < suiteRunnerSource.indexOf('const suiteFn = loadSuite(suiteName)'), true, 'suite runner must enforce capabilities before selecting a suite implementation');
assert.equal(a11ySuiteSource.includes('evidence-only'), true, 'a11y informational mode should be named as evidence-only policy');
assert.equal(bundleSuiteSource.includes('STATUS.SKIP'), false, 'requested bundle suite must not SKIP missing build output');
assert.equal(bundleSuiteSource.includes('Build output directory not found'), true, 'bundle suite should fail typed validation when build output is missing');
assert.equal(bundleSuiteSource.includes('total_size_kb: totalSizeKb'), true, 'bundle suite should expose unknown size as nullable metadata rather than zero fallback');
assert.equal(bundleSuiteSource.includes('max-size-unknown'), true, 'bundle suite should fail enforced max-size checks when size is unknown');
assert.equal(e2eSuiteSource.includes('STATUS.SKIP'), false, 'requested E2E suite must not SKIP missing tests');
assert.equal(e2eSuiteSource.includes('e2e.tests_dir is required'), true, 'E2E suite should fail typed validation when tests_dir is missing');
assert.equal(e2eSuiteSource.includes('No test files found'), true, 'E2E suite should fail typed validation when no tests are discovered');
assert.equal(e2eSuiteSource.includes('evidence-only'), true, 'E2E informational mode should be named as evidence-only policy');
assert.equal(perfSuiteSource.includes('perf.output_path is no longer supported'), true, 'perf suite should reject removed output_path authority');
assert.equal(perfSuiteSource.includes('Lighthouse category missing from report'), true, 'perf suite should fail enforced missing Lighthouse categories');
assert.equal(perfSuiteSource.includes('evidence-only'), true, 'perf no-threshold PASS should be named as evidence-only policy');
assert.equal(securitySuiteSource.includes('evidence-only'), true, 'security informational mode should be named as evidence-only policy');
assert.equal(unitSuiteSource.includes('STATUS.SKIP'), false, 'requested unit suite must not SKIP missing/no-op tests');
assert.equal(unitSuiteSource.includes('unit-tests-required'), true, 'unit suite should fail typed validation when tests are missing/no-op');
assert.equal(unitSuiteSource.includes('explicit runner policy'), true, 'unit custom command bypass should be named as intentional typed policy');
assert.equal(unitSuiteSource.includes('evidence-only'), true, 'unit informational mode should be named as evidence-only policy');
assert.equal(apiSuiteSource.includes('STATUS.SKIP'), false, 'requested API suite must not SKIP missing spec or empty tests');
assert.equal(apiSuiteSource.includes('api.spec_file is required'), true, 'API suite should fail typed validation when spec_file is missing');
assert.equal(apiSuiteSource.includes('Missing API template variable'), true, 'API suite should fail tests with missing template variables instead of silently preserving placeholders');
assert.equal(buildSuiteSource.includes('UNRESOLVED_SECRET_'), false, 'build suite must not inject unresolved secret placeholders');
assert.equal(buildSuiteSource.includes('serve.secret_yaml is required when deployment env uses secretKeyRef'), true, 'build suite should fail when manifest env secret refs lack secret YAML');
assert.equal(healthSuiteSource.includes('autoDetectSmokePaths'), false, 'health suite must not infer smoke paths from visual-reg baselines');
assert.equal(healthSuiteSource.includes('Playwright is required for configured health smoke navigation'), true, 'requested smoke navigation should fail typed setup when Playwright is unavailable');
assert.equal(k8sSuiteSource.includes('STATUS.SKIP'), false, 'requested k8s suite must not SKIP missing deployment config');
assert.equal(k8sSuiteSource.includes('Required secret copy failed'), true, 'k8s secret propagation failures should fail the requested suite');
assert.equal(k8sSuiteSource.includes('Requested manifest not found'), true, 'k8s manifest apply should fail when any requested manifest path is missing');
assert.equal(manifestSuiteSource.includes('STATUS.SKIP'), false, 'requested manifest suite must not SKIP missing deployment YAML');
assert.equal(manifestSuiteSource.includes('manifest.deployment_yaml is required'), true, 'manifest suite should fail typed validation when deployment YAML is missing');
assert.equal(manifestSuiteSource.includes('Deployment uses secretKeyRef but manifest.secret_yaml is missing or invalid'), true, 'manifest suite should fail when secret refs lack valid secret YAML evidence');
assert.equal(baseImagesSource.includes('loadBaseImagesFromProgress'), false, 'base images must not mine .swarm/progress.json for legacy image inputs');
assert.equal(baseImagesSource.includes('docker.io/library/${value}'), false, 'base images must not normalize bare image names to docker.io/library');
assert.equal(baseImagesSource.includes("reason: 'not_fully_qualified'"), true, 'base images should require fully qualified typed image refs');
assert.equal(baseImagesSource.includes("'podman_inspect_failed'"), true, 'base image inspect failures should surface typed degraded image result metadata');
assert.equal(baseImagesSource.includes("'podman_pull_failed'"), true, 'base image pull failures should surface typed degraded image result metadata');
assert.equal(rateLimitSource.includes("liveness_state"), true, 'buster rate-limit recovery should return typed liveness state evidence');
assert.equal(rateLimitSource.includes("if (liveness.state === 'closed')"), true, 'buster rate-limit recovery should only kill after confirmed closed liveness');
assert.equal(rateLimitSource.includes("state: 'probe_error'"), true, 'buster rate-limit probe errors should be represented as typed liveness states');
assert.equal(sandboxCleanupSource.includes("'corrupt'"), true, 'sandbox cleanup should distinguish corrupt cleanup state files');
assert.equal(sandboxCleanupSource.includes("'missing'"), true, 'sandbox cleanup should distinguish missing cleanup state files');
assert.equal(sandboxCleanupSource.includes('cleanup_policy ||'), false, 'sandbox cleanup owner should not retain snake_case cleanup policy alias fallback');
assert.equal(sandboxCleanupSource.includes('tracked_resources'), true, 'sandbox cleanup may still expose public snake_case result fields');
assert.equal(sandboxCleanupSource.includes("from './capabilities.ts'"), false, 'sandbox cleanup must not be gated by task capability limits');
assert.equal(sandboxCleanupSource.includes('discoverLabeledResources'), true, 'sandbox cleanup should discover run-labeled rogue resources with maximum platform authority');
assert.equal(taskQueueSource.includes("from './task-transport-contract.ts'"), true, 'Buster task queue should depend on the TaskQueue transport boundary');
assert.equal(taskQueueSource.includes('createRedisTaskQueue('), true, 'Buster task queue should construct a TaskQueue adapter around the Redis client');
assert.equal(taskCompletionSource.includes("from './task-transport-contract.ts'"), true, 'Buster completion should depend on the EventBus transport boundary');
assert.equal(taskCompletionSource.includes('createRedisEventBus('), true, 'Buster completion/dead-letter emission should publish through EventBus');
assert.equal(mainSource.includes("export { monitorSession } from './pipeline/services/session-monitor.ts';"), false, 'typed buster entrypoint must not preserve monitorSession on the root surface');
assert.equal(mainSource.includes("export {\n  buildSuiteResultsEmbed,"), false, 'typed buster entrypoint must not preserve the operator embed builders on the root surface');
assert.equal(helpersSource.includes("from '../lifecycle-state.ts'"), false, 'Buster must not import lifecycle-state to mutate orchestrator status files');
assert.equal(helpersSource.includes('status_json_path'), false, 'Buster helpers must not retain the legacy status_json_path side channel');
assert.equal(taskLifecycleCombinedSource.includes('statusJsonPath'), false, 'Buster task lifecycle must not carry orchestrator status file paths');
assert.equal(/status\.active_agent\s*=/.test(mainSource), false, 'buster-pipeline main module must not directly assign status.active_agent');
assert.equal(/status\.active_agent\s*=/.test(helpersSource), false, 'buster helper module must not directly assign status.active_agent');

for (const marker of [
  'export function resolveBusterActiveSessionPath(',
  'export function buildCompletionIdentityFields(',
  'export function resolveBusterOutputFilePath(',
  'export function resolveBusterAgentResult(',
  'export function buildPreTestVerdict(',
  'export function buildSuiteResultsEmbed(',
  'export function buildSessionSpawnEmbed(',
  'export function buildSessionCompleteEmbed(',
  'export function buildTimeoutEmbed(',
  'export function buildTaskFailureEmbed(',
  'export async function doSandboxCleanup(',
]) {
  assert.equal(helpersSource.includes(marker), true, `buster task helper module must export ${marker}`);
}

assert.equal(monitorSource.includes('export async function monitorSession('), true, 'buster session monitor module must export monitorSession');
assert.equal(monitorSource.includes('`buster-${moduleId}`,\n        moduleId,'), false, 'buster transcript publishing must not use the obsolete positional identity signature');
assert.equal(monitorSource.includes('publishTranscriptDelta'), false, 'Buster ACP monitor must not publish agent transcript telemetry outside the observer plugin');
assert.equal(monitorSource.includes('Transcript delta observed through diagnostic ACP monitor'), true, 'Buster ACP monitor transcript deltas should remain diagnostic only');
assert.equal(monitorSource.includes('session_key: childSessionKey'), true, 'Buster monitor diagnostics should preserve session identity');
assert.equal(/catch \(monitorError(?:: unknown)?\)/.test(taskLifecycleSessionSource), true, 'buster task lifecycle should handle monitor exceptions before finalization');
assert.equal(taskLifecycleSessionSource.includes("reason: `monitor_error: ${monitorReason}`"), true, 'monitor failures should return explicit monitor_error reason without emitting agent.killed outside the observer plugin');
assert.equal(taskLifecycleSessionSource.includes('clearActiveChildSession({ preserveFile: termination?.unconfirmed === true })'), true, 'monitor failures should clear in-memory active session while preserving unconfirmed recovery state');
assert.equal(monitorSource.includes('terminateSession'), true, 'Buster monitor should route hard-timeout teardown through the shared termination controller');
assert.equal(monitorSource.includes('killIssued'), false, 'Buster monitor must not synthesize local killIssued state');
assert.equal(monitorSource.includes('killConfirmed'), false, 'Buster monitor must not synthesize local killConfirmed state');
assert.equal(helpersSource.includes('export function resolveBusterRateLimitMaxPauses('), true, 'buster helpers should resolve the terminal rate-limit pause budget');
assert.equal(mainSource.includes('rlState.maxPauses'), false, 'buster-pipeline main module must not reference monitor-local rlState');
assert.equal(taskLifecycleCompletionSource.includes('resolveBusterRateLimitMaxPauses(payload, sessionResultForCompletion || {})'), true, 'RATE_LIMITED completion should use the monitor/payload pause budget resolver');
for (const deleted of ['sessionResult?.max_rate_limit_pauses', 'rate_limit_status?.max_pauses', 'rateLimitStatus?.maxRateLimitPauses', 'rateLimit?.maxPauses', 'acp_monitor?.max_rate_limit_pauses']) {
  assert.equal(helpersSource.includes(deleted), false, `Buster rate-limit max pause resolver must not accept legacy alias ${deleted}`);
}
assert.equal(monitorSource.includes('rate_limit_status: buildRateLimitStatus(rlState)'), true, 'monitor should return rate-limit status to completion emission');
assert.equal(monitorSource.includes('ownsCanonicalSignal: true'), true, 'buster child-session monitor should own canonical pause telemetry while it sleeps');
assert.equal(rateLimitSource.includes('ownsCanonicalSignal = true'), true, 'buster rate-limit service should default to emitting canonical pause telemetry for local sleeps');
assert.equal(rateLimitSource.includes("taskType !== 'gate_test'"), false, 'gate_test must not suppress Buster-owned canonical pause telemetry');
assert.equal(rateLimitSource.includes('Rate-limit Discord notice failed'), true, 'Buster rate-limit Discord fire-and-forget path must report delivery failures explicitly');
assert.equal(telemetrySource.includes('artifact_fallback: true'), true, 'Buster telemetry must keep explicit artifact fallback evidence for degraded diagnostic events');
assert.equal(discordSource.includes('createObservabilityHealthState'), true, 'Buster Discord health should use the shared observability health state machine');
assert.equal(discordSource.includes('new Map<string, HealthState>()'), false, 'Buster Discord must not own a local health-state map');
assert.equal(/(?:runId|module|moduleId|logDir|pipelineLogPath|pipelineRunLogPath|dispatchId|sessionKey|gateId|gateType)\?:|opts\.(?:runId|module(?!_)|moduleId|logDir|pipelineLogPath|pipelineRunLogPath|dispatchId|sessionKey|gateId|gateType)/.test(telemetrySource), false, 'Buster telemetry options must not preserve camelCase or module aliases');
assert.equal(mainSource.includes('process.exit(1)'), false, 'buster-pipeline must not hard-exit on gateway failures without structured cleanup');
assert.equal(mainSource.includes('emitGatewayHealthDegraded('), true, 'buster-pipeline should emit structured gateway degradation before gateway-triggered shutdown');
assert.equal(mainSource.includes("import { sleep } from './pipeline/timing.ts';"), true, 'buster runtime loop should use shared abortable sleep');
assert.equal(mainSource.includes('BUSTER_RUNTIME_LOOP_POLICY'), true, 'buster runtime loop backoff should be named policy');
assert.equal(mainSource.includes("reason: 'task_poll_loop_failed'"), true, 'buster runtime loop failures should emit structured diagnostics');
assert.equal(mainSource.includes('new Promise(resolve => setTimeout(resolve, 3000))'), false, 'buster runtime loop must not keep raw sleep');
assert.equal(gatewayHealthSource.includes("shutdownGateway('GATEWAY_HEALTH_FAILED'"), true, 'buster gateway health monitor should route failures through structured shutdown');
assert.equal(mainSource.includes('doSandboxCleanup(cleanupStage'), true, 'structured shutdown should run sandbox cleanup for the triggering stage');
assert.equal(suiteRunnerSource.includes('export async function runSuiteWithTimeout('), true, 'suite runner should expose timeout wrapper for direct cleanup regression coverage');
assert.equal(suiteRunnerSource.includes('clearTimeout(timeoutId)'), true, 'suite runner must clear suite timeout handles after suite completion');
assert.equal(suiteRunnerSource.includes("emitEvent(tctx, 'observability.degraded'"), true, 'suite result write failures should emit structured degraded diagnostics');
assert.equal(suiteRunnerSource.includes("reason: classification"), true, 'suite result write diagnostics should preserve failure classification');
assert.equal(taskLifecycleSessionSource.includes('resolveBusterAgentResult(payload, sessionResult)'), true, 'buster task lifecycle should derive spawned child outcomes from canonical result artifacts');
assert.equal(taskCompletionSource.includes("opts.outcome || 'FAIL'"), false, 'buster completion records must not default missing outcome to FAIL');
assert.equal(taskCompletionSource.includes("opts.reason || 'unknown'"), false, 'buster completion records must not default missing reason to unknown');
assert.equal(taskCompletionSource.includes('Buster completion requires explicit outcome and reason'), true, 'buster completion records should require explicit outcome and reason');
assert.equal(taskLifecycleSessionSource.includes("agentResult.outcome || 'FAIL'"), false, 'buster task lifecycle must not default missing child outcome to FAIL');
assert.equal(taskLifecycleSessionSource.includes("agentResult.reason || 'unknown'"), false, 'buster task lifecycle must not default missing child reason to unknown');
assert.equal(taskLifecycleSessionSource.includes('Buster agent result requires explicit outcome and reason'), true, 'buster task lifecycle should require explicit child outcome and reason');
assert.equal(taskLifecycleCompletionSource.includes("reason: reason || ''"), false, 'buster completion signals must not default missing reason to empty string');
assert.equal(taskLifecycleCompletionSource.includes('Buster completion signal requires explicit outcome and reason'), true, 'buster completion signals should require explicit outcome and reason');
assert.equal(`${mainSource}\n${taskLifecycleCombinedSource}`.includes("source: 'agent'"), false, 'buster-pipeline should not label its canonical completion path as legacy source=agent');
assert.equal(helpersSource.includes('result_status'), false, 'buster artifact reader must not accept status.json result_status fallback');
assert.equal(helpersSource.includes('result_artifact_path'), false, 'buster artifact reader must not accept legacy result_artifact_path fallback');
assert.equal(helpersSource.includes('output_file_invalid_status'), true, 'buster artifact reader should fail closed on invalid output_file status');
assert.equal(taskLifecycleCompletionSource.includes("import verifyAndPush from '../../tools/verify-task.ts'"), true, 'buster completion emission must use verify-task.ts before Redis completion');
assert.equal(taskLifecycleCompletionSource.indexOf('await verifyAndPush(') < taskLifecycleCompletionSource.indexOf('await emitTaskCompletion('), true, 'buster must push output_file before emitting Redis completion');
assert.equal(busterConventionsSource.includes('Update `status.json`'), false, 'buster conventions must not instruct child agents to update status.json directly');
assert.equal(busterConventionsSource.includes('lifecycle update command'), false, 'buster conventions must not refer to stale prompt-provided lifecycle update commands');
assert.equal(busterConventionsSource.includes('for `module_test` and `gate_test`, write raw, directly parseable JSON to `output_file`'), true, 'buster conventions should require every task to write raw JSON to the prompt-provided output_file');
assert.equal(busterConventionsSource.includes('do NOT run verify-task.ts yourself; Buster Pipeline runs it before Redis completion emission'), true, 'buster conventions should reserve verify/push for Buster Pipeline');
assert.equal(busterConventionsSource.includes('do NOT edit `status_json_path`'), false, 'buster conventions must not document legacy status_json_path');
assert.equal(busterConventionsSource.includes('do NOT edit `status.json` or any orchestrator state file'), true, 'buster conventions should explicitly forbid direct child-agent status edits');
assert.equal(busterConventionsSource.includes('`buster-pipeline.ts` owns verify/push and completion emission'), true, 'buster conventions should preserve artifact-to-pipeline completion authority');
const novaPathsSource = fs.readFileSync(path.join(sourceRoot, 'skills/nova/pipeline/core/paths.ts'), 'utf8');
assert.equal(novaPathsSource.includes("export function moduleBusterOutputPath("), true, 'module Buster output_file path authority must live in core/paths.ts');
assert.equal(novaPathsSource.includes("'buster-output.json'"), true, 'module Buster output_file must live inside .swarm so verify-task can push it');
assert.equal(novaPromptSharedSource.includes("path.join(modulePath(config, dir), 'buster-result.json')"), false, 'module Buster output_file must not use the old module-local buster-result path');
assert.equal(novaPromptSharedSource.includes('OUTPUT_FILE='), false, 'module Buster completion contract must not embed shell env artifact writers');
assert.equal(novaPromptSharedSource.includes('node - <<'), false, 'module Buster completion contract must not embed Node heredoc writers');
assert.equal(novaPromptSharedSource.includes('buildBusterResultArtifactCommand'), false, 'legacy Buster shell writer helper must be deleted');
assert.equal(novaPromptSharedSource.includes('buildForgeCompletionArtifactCommand'), false, 'legacy Forge shell writer helper must be deleted');
assert.equal(novaPromptSharedSource.includes('shellQuote'), false, 'legacy shell quoting helper must be deleted with shell writer snippets');
assert.equal(novaPromptSharedSource.includes('"artifact_type": "buster_output"'), true, 'module Buster output artifact should use the current buster_output type');
assert.equal(novaPromptSharedSource.includes('raw, directly parseable JSON'), true, 'module Buster output contract should demand raw JSON without Markdown');
assert.equal(novaBusterModulePromptSource.includes('moduleBusterTestWorkspacePathRef(config, dir, attempt)'), true, 'module Buster test workspace must use core path authority');

for (const disallowed of [
  'function resolveBusterActiveSessionPath(',
  'function buildCompletionIdentityFields(',
  'function resolveBusterAgentResult(',
  'function buildPreTestVerdict(',
  'export function buildSuiteResultsEmbed(',
  'export function buildSessionSpawnEmbed(',
  'export function buildSessionCompleteEmbed(',
  'export function buildTimeoutEmbed(',
  'async function doSandboxCleanup(',
  'export async function monitorSession(',
]) {
  assert.equal(mainSource.includes(disallowed), false, `buster-pipeline main surface must not keep extracted helper ${disallowed}`);
}

const mainMod = await import(pathToFileURL(mainPath).href);
const baseImagesMod = await import(pathToFileURL(baseImagesPath).href);
const helpersMod = await import(pathToFileURL(helpersPath).href);
const monitorMod = await import(pathToFileURL(monitorPath).href);
const suiteRunnerMod = await import(pathToFileURL(suiteRunnerPath).href);
const capabilitiesMod = await import(pathToFileURL(capabilitiesPath).href);
const validationMod = await import(pathToFileURL(path.join(sourceRoot, 'skills/buster/pipeline/services/task-validation.ts')).href);

assert.equal(baseImagesMod.validateBaseImageRef('node:20-slim').ok, false, 'bare base image refs must not be normalized or accepted');
assert.equal(baseImagesMod.validateBaseImageRef('docker.io/library/node:20-slim').ok, true, 'fully qualified base image refs should validate');

assert.throws(() => suiteRunnerMod.validateSuiteNames(['build', 'missing-suite']), (error) => {
  assert.equal(error.code, 'BUSTER_SUITE_REQUEST_INVALID');
  assert.equal(error.details.reason, 'unknown_suite');
  assert.deepEqual(error.details.unknown_suites, ['missing-suite']);
  return true;
}, 'unknown requested Buster suites must fail typed validation instead of producing SKIP verdicts');
assert.throws(() => suiteRunnerMod.validateSuiteNames([]), (error) => {
  assert.equal(error.code, 'BUSTER_SUITE_REQUEST_INVALID');
  assert.equal(error.details.reason, 'empty_suite_list');
  return true;
}, 'empty requested Buster suite lists must fail typed validation before execution');

assert.throws(() => suiteRunnerMod.resolveSuiteTimeoutMs({}), (error) => {
  assert.equal(error.code, 'BUSTER_SUITE_REQUEST_INVALID');
  assert.equal(error.details.reason, 'missing_suite_timeout_ms');
  assert.deepEqual(error.details.missing_fields, ['test_config.suite_timeout_ms']);
  return true;
}, 'omitted suite timeout must fail instead of using a hidden runner default');
for (const invalidTimeout of [0, -1, false, null, '', '3000', 1.5, Number.NaN]) {
  assert.throws(() => suiteRunnerMod.resolveSuiteTimeoutMs({ suite_timeout_ms: invalidTimeout }), (error) => {
    assert.equal(error.code, 'BUSTER_SUITE_REQUEST_INVALID');
    assert.equal(error.details.reason, 'invalid_suite_timeout_ms');
    return true;
  }, `invalid suite_timeout_ms ${String(invalidTimeout)} must be rejected`);
}

for (const [mod, name] of [
  [mainMod, 'main'],
  [mainMod, 'shutdown'],
  [mainMod, 'getBusterStatus'],
  [mainMod, 'handleBusterEntrypoint'],
  [helpersMod, 'resolveBusterOutputFilePath'],
  [helpersMod, 'resolveBusterAgentResult'],
  [helpersMod, 'ensureBusterOutputFile'],
  [helpersMod, 'resolveBusterRateLimitMaxPauses'],
  [helpersMod, 'buildPreTestVerdict'],
  [helpersMod, 'doSandboxCleanup'],
  [monitorMod, 'monitorSession'],
]) {
  assert.equal(typeof mod[name], 'function', `${name} should be exported from its owning module`);
}

for (const removedRootExport of [
  'processTask',
  'monitorSession',
  'ensureTaskConsumerGroup',
  'buildSuiteResultsEmbed',
  'buildSessionSpawnEmbed',
  'buildSessionCompleteEmbed',
  'buildTaskFailureEmbed',
  'buildTimeoutEmbed',
  'assertBusterCapabilities',
  'normalizeBusterCapabilities',
  'validateBusterTaskPayload',
]) {
  assert.equal(Object.prototype.hasOwnProperty.call(mainMod, removedRootExport), false, `buster root API must not export ${removedRootExport}`);
}

assert.deepEqual(capabilitiesMod.KNOWN_BUSTER_CAPABILITIES, [
  'static_web_server',
  'container_runtime',
  'kubernetes_api',
  'browser_automation',
  'lighthouse',
  'discord_media',
  'image_prepull',
]);

const validBusterTaskPayload = {
  task_type: 'module_test',
  module_id: '07',
  project: 'demo-project',
  run_id: 'run-1',
  attempt: 2,
  dispatch_id: 'dispatch-2',
  completion_stream: 'pipeline:demo-project:completions',
  commit_hash: 'abc123',
  stage_id: 'worker:module_buster',
  worker_type: 'module_buster',
  timeout_seconds: 1800,
  session: { runtime: 'acp', model: 'gpt-test', agentId: 'buster', cwd: sourceRoot, label: 'buster-dispatch-2' },
  suites: ['build'],
  test_config: { suite_timeout_ms: 300000 },
  output_file: '.swarm/modules/07/buster-output.json',
};

for (const [field, value] of [
  ['output_file', '../outside.json'],
  ['output_file', '/tmp/outside.json'],
  ['module_path', 'Projects/demo/../demolition'],
]) {
  assert.throws(() => validationMod.validateBusterTaskPayload({
    ...validBusterTaskPayload,
    [field]: value,
  }), (error) => {
    assert.equal(error.code, 'BUSTER_TASK_MALFORMED');
    assert.equal(error.details.reason, 'unsafe_path_field');
    assert.equal(error.unsafe_fields.some(entry => entry.field === field), true);
    return true;
  }, `Buster task validation must reject unsafe ${field}`);
}

assert.throws(() => validationMod.validateBusterTaskPayload({
  ...validBusterTaskPayload,
  task_type: 'gate_test',
  module_id: 'quality-gate',
  gate_id: 'quality-gate',
  dispatch_id: 'dispatch-gate',
  stage_id: 'gate:buster',
  worker_type: undefined,
  suites: ['build'],
  output_file: '.swarm/gates/quality/output.json',
  work_dir: '/tmp',
}), (error) => {
  assert.equal(error.code, 'BUSTER_TASK_MALFORMED');
  assert.equal(error.details.reason, 'unsafe_path_field');
  assert.equal(error.unsafe_fields.some(entry => entry.field === 'work_dir'), true);
  return true;
}, 'Buster gate task validation must reject absolute work_dir');

assert.throws(() => validationMod.validateBusterTaskPayload({
  ...validBusterTaskPayload,
  completion_stream: undefined,
}), (error) => {
  assert.equal(error.code, 'BUSTER_TASK_MALFORMED');
  assert.equal(error.details.reason, 'missing_required_identity');
  assert.equal(error.missing_fields.includes('completion_stream'), true);
  return true;
}, 'Buster task validation must require completion_stream identity before ACK');

assert.throws(() => validationMod.validateBusterTaskPayload({
  ...validBusterTaskPayload,
  commit_hash: undefined,
}), (error) => {
  assert.equal(error.code, 'BUSTER_TASK_MALFORMED');
  assert.equal(error.details.reason, 'missing_required_identity');
  assert.equal(error.missing_fields.includes('commit_hash'), true);
  return true;
}, 'Buster task validation must require deterministic commit_hash identity');

assert.throws(() => validationMod.validateBusterTaskPayload({
  ...validBusterTaskPayload,
  suites: [],
}), (error) => {
  assert.equal(error.code, 'BUSTER_TASK_MALFORMED');
  assert.equal(error.details.reason, 'missing_required_identity');
  assert.equal(error.missing_fields.includes('suites'), true);
  return true;
}, 'Buster task validation must reject empty suite lists before agent work');

assert.throws(() => validationMod.validateBusterTaskPayload({
  ...validBusterTaskPayload,
  test_config: undefined,
}), (error) => {
  assert.equal(error.code, 'BUSTER_TASK_MALFORMED');
  assert.equal(error.details.reason, 'missing_required_identity');
  assert.equal(error.missing_fields.includes('test_config'), true);
  return true;
}, 'Buster task validation must require typed test_config before suite execution');

for (const invalidTestConfig of [null, [], 'suite_timeout_ms=300000']) {
  assert.throws(() => validationMod.validateBusterTaskPayload({
    ...validBusterTaskPayload,
    test_config: invalidTestConfig,
  }), (error) => {
    assert.equal(error.code, 'BUSTER_TASK_MALFORMED');
    assert.equal(error.details.reason, 'invalid_test_config_shape');
    assert.deepEqual(error.details.invalid_fields, [{
      field: 'test_config',
      expected: 'object',
      actual: Array.isArray(invalidTestConfig) ? 'array' : invalidTestConfig === null ? 'null' : typeof invalidTestConfig,
    }]);
    return true;
  }, `Buster task validation must diagnose invalid test_config shape ${String(invalidTestConfig)}`);
}

assert.throws(() => validationMod.validateBusterTaskPayload({
  ...validBusterTaskPayload,
  test_config: { suite_timeout_ms: 0 },
}), (error) => {
  assert.equal(error.code, 'BUSTER_TASK_MALFORMED');
  assert.equal(error.details.reason, 'missing_required_identity');
  assert.equal(error.missing_fields.includes('test_config.suite_timeout_ms'), true);
  return true;
}, 'Buster task validation must require explicit positive test_config.suite_timeout_ms');

assert.throws(() => validationMod.validateBusterTaskPayload({
  ...validBusterTaskPayload,
  stage_id: undefined,
  worker_type: undefined,
  timeout_seconds: undefined,
  session: {},
}), (error) => {
  assert.equal(error.code, 'BUSTER_TASK_MALFORMED');
  assert.equal(error.details.reason, 'missing_required_identity');
  for (const field of ['stage_id', 'worker_type', 'timeout_seconds', 'session.runtime', 'session.model', 'session.agentId', 'session.cwd', 'session.label']) {
    assert.equal(error.missing_fields.includes(field), true);
  }
  return true;
}, 'Buster task validation must require explicit timeout/session/stage launch policy');

assert.equal(helpersMod.resolveBusterRateLimitMaxPauses({}, { rate_limit_status: { max_rate_limit_pauses: 0 } }), 0);
assert.equal(helpersMod.resolveBusterRateLimitMaxPauses({ rate_limit: { max_pauses: 5 } }, {}), 5);
assert.throws(() => helpersMod.resolveBusterRateLimitMaxPauses({}, {}), /requires explicit rate_limit\.max_pauses policy/);

const repoRootForArtifact = sourceRoot;
const artifactTempDir = fs.mkdtempSync(path.join(repoRootForArtifact, '.tmp-buster-agent-result-contract-'));
const outputPath = path.join(artifactTempDir, 'buster-output.json');
const outputRel = path.relative(repoRootForArtifact, outputPath);
fs.writeFileSync(outputPath, JSON.stringify({ status: 'FAIL', summary: '2 tests failed' }, null, 2) + '\n');
assert.deepEqual(helpersMod.resolveBusterAgentResult({ task_type: 'module_test', output_file: outputRel }, { terminal: true }), {
  outcome: 'FAIL',
  reason: 'output_file_fail',
  summary: '2 tests failed',
  source: 'output_file',
});
assert.deepEqual(helpersMod.resolveBusterAgentResult({ task_type: 'gate_test', output_file: outputRel }, { terminal: true }), {
  outcome: 'FAIL',
  reason: 'output_file_fail',
  summary: '2 tests failed',
  source: 'output_file',
});
assert.deepEqual(helpersMod.resolveBusterAgentResult({ task_type: 'module_test' }, { terminal: true }), {
  outcome: 'FAIL',
  reason: 'output_file_missing',
  summary: 'Buster output_file is required and was not provided',
  source: 'output_file',
});
const invalidOutputPath = path.join(artifactTempDir, 'invalid-output.json');
const invalidOutputRel = path.relative(repoRootForArtifact, invalidOutputPath);
fs.writeFileSync(invalidOutputPath, JSON.stringify({ status: 'MAYBE', summary: 'bad status' }, null, 2) + '\n');
assert.deepEqual(helpersMod.resolveBusterAgentResult({ task_type: 'module_test', output_file: invalidOutputRel }, { terminal: true }), {
  outcome: 'FAIL',
  reason: 'output_file_invalid_status',
  summary: 'Buster output_file must contain status PASS or FAIL',
  source: 'output_file',
});
const suiteFailedOutputPath = path.join(artifactTempDir, 'suite-failed-output.json');
const suiteFailedOutputRel = path.relative(repoRootForArtifact, suiteFailedOutputPath);
assert.equal(fs.existsSync(suiteFailedOutputPath), false, 'pre-suite failure output_file should start absent');
assert.equal(helpersMod.ensureBusterOutputFile({ task_type: 'module_test', output_file: suiteFailedOutputRel }, {
  outcome: 'FAIL',
  summary: 'critical suite failed',
}).source, 'written', 'Buster should write output_file itself for no-spawn suite failures');
assert.deepEqual(JSON.parse(fs.readFileSync(suiteFailedOutputPath, 'utf8')).status, 'FAIL');
fs.rmSync(artifactTempDir, { recursive: true, force: true });

const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
const fakeTimeoutId = { suiteTimeout: true };
let scheduledTimeoutMs = null;
let clearedTimeoutId = null;
try {
  globalThis.setTimeout = (_callback, timeoutMs) => {
    scheduledTimeoutMs = timeoutMs;
    return fakeTimeoutId;
  };
  globalThis.clearTimeout = (timeoutId) => {
    clearedTimeoutId = timeoutId;
  };
  const timeoutWrappedResult = await suiteRunnerMod.runSuiteWithTimeout('unit', async () => ({ status: 'PASS' }), {}, 1234);
  assert.deepEqual(timeoutWrappedResult, { status: 'PASS' });
  assert.equal(scheduledTimeoutMs, 1234, 'suite timeout wrapper should schedule the configured timeout');
  assert.equal(clearedTimeoutId, fakeTimeoutId, 'suite timeout wrapper should clear timeout handles after fast suite completion');
} finally {
  globalThis.setTimeout = originalSetTimeout;
  globalThis.clearTimeout = originalClearTimeout;
}

const suiteTelemetryEvents = [];
const fakeSuiteTelemetryRedis = {
  async incr() { return suiteTelemetryEvents.length + 1; },
  multi() {
    return {
      xadd(_stream, _maxLen, _approx, _max, _id, _field, data) {
        suiteTelemetryEvents.push(JSON.parse(data));
        return this;
      },
      expire() { return this; },
      async exec() { return []; },
    };
  },
  async quit() {},
  on() {},
};
const blockedLogDir = path.join(repoRootForArtifact, '.tmp-buster-suite-blocked-log');
fs.writeFileSync(blockedLogDir, 'not-a-directory\n');
const suiteResultWithBlockedWrite = await suiteRunnerMod.runSuites(['build'], {
  payload: {
    project: 'demo-project',
    test_config: { suite_timeout_ms: 300000, serve: { type: 'static' } },
  },
  moduleId: '01',
  attempt: 1,
  logDir: blockedLogDir,
  capabilities: [],
  telemetryContext: {
    redis: fakeSuiteTelemetryRedis,
    streamKey: 'pipeline:telemetry:demo-project:run-suite-write-diagnostic-1',
    seqKey: 'pipeline:telemetry:demo-project:run-suite-write-diagnostic-1:seq',
    project: 'demo-project',
    runId: 'run-suite-write-diagnostic-1',
    moduleId: '01',
    emitter: 'contract-suite-runner',
    logDir: null,
    pipelineLogPath: null,
    pipelineRunLogPath: null,
    attempt: 1,
    dispatchId: 'dispatch-suite-write-diagnostic-1',
    sessionKey: null,
    gateId: null,
    gateType: null,
    _health: {},
  },
});
assert.equal(suiteResultWithBlockedWrite.criticalFailed, true, 'suite result write diagnostics must not mask suite verdicts');
const suiteWriteDiagnostic = suiteTelemetryEvents.find((event) => event.type === 'observability.degraded' && event.reason === 'swarm_results_write_failed');
assert(suiteWriteDiagnostic, 'blocked suite result writes should emit structured degraded diagnostics');
assert.equal(suiteWriteDiagnostic.component, 'buster_suite_runner');
assert.equal(suiteWriteDiagnostic.surface, 'suite_results');
assert.equal(suiteWriteDiagnostic.module_id, '01');
assert.equal(suiteWriteDiagnostic.dispatch_id, 'dispatch-suite-write-diagnostic-1');
fs.rmSync(blockedLogDir, { force: true });

quietConsole.restore();
console.log(JSON.stringify({ ok: true, checked: 144 }));
