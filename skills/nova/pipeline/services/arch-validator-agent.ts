import fs from 'node:fs';
import path from 'node:path';
import { log } from '../core/logger.ts';
import { resolvePolicy, logEffectivePolicy } from '../core/policy.ts';
import { spawnSession } from '../agents/lifecycle.ts';
import { terminateSession } from '../agents/session-termination.ts';
import { sessionLifecyclePolicies } from '../core/session-policy.ts';
import { pollForFile } from './polling.ts';
import { getRateLimitConfig, processSessionRateLimit } from './rate-limit.ts';
import { modelToHarness, resolveRuntime } from '../agents/runtime.ts';
import { getArchValidationConfig } from './runtime-defaults.ts';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import {
  errorMessage,
  firstTruthy,
  FINDING_CODES,
  makeFinding,
  objectRecord,
  requireNonEmptyString,
  resolveArchValidatorRunId,
  SCOPE,
  SEVERITY,
  validatorAgentOutputPath,
} from './arch-validator-values.ts';

function normalizeAgentFinding(rawFinding: any) {
  if (!rawFinding || typeof rawFinding !== 'object' || Array.isArray(rawFinding)) {
    throw new Error('each agent finding must be an object');
  }
  const id = typeof rawFinding.id === 'string' ? rawFinding.id.trim() : '';
  const severity = typeof rawFinding.severity === 'string' ? rawFinding.severity.trim() : '';
  const scope = typeof rawFinding.scope === 'string' ? rawFinding.scope.trim() : '';
  const explanation = typeof rawFinding.explanation === 'string' ? rawFinding.explanation.trim() : '';
  const remediation = typeof rawFinding.remediation === 'string' ? rawFinding.remediation.trim() : '';
  const paths = Array.isArray(rawFinding.paths)
    ? rawFinding.paths.filter((entry: any) => typeof entry === 'string' && entry.trim()).map((entry: string) => entry.trim())
    : [];
  if (!id) throw new Error('each agent finding requires non-empty string id');
  if (!Object.values(SEVERITY).includes(severity)) throw new Error(`agent finding '${id}' has invalid severity '${severity}'`);
  if (!Object.values(SCOPE).includes(scope)) throw new Error(`agent finding '${id}' has invalid scope '${scope}'`);
  if (!explanation) throw new Error(`agent finding '${id}' requires non-empty explanation`);
  if (!remediation) throw new Error(`agent finding '${id}' requires non-empty remediation`);
  return { id, severity, scope, paths, explanation, remediation };
}

function parseAgentFindingsFile(outputFilePath: string) {
  const parsed = JSON.parse(fs.readFileSync(outputFilePath, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error('agent output must be a JSON array');
  return parsed.map(normalizeAgentFinding);
}

export function buildValidatorPrompt(progress: any, _config: any, deterministicFindings: any[], outputFilePath: any) {
  const project = requireNonEmptyString(progress?.project, 'progress.project');
  const modules = Object.entries(objectRecord(progress.modules)).map(([id, module]: any) => ({
    id,
    dir: module.dir,
    title: module.title,
    role: module.role,
    owned_paths: Array.isArray(module.owned_paths) ? module.owned_paths : [],
    module_output_contract: module.module_output_contract,
    consumes_module_outputs: Array.isArray(module.consumes_module_outputs) ? module.consumes_module_outputs : [],
    stages: module.stages,
    depends_on: module.depends_on,
  }));
  const gates = Object.entries(objectRecord(progress.gates)).map(([id, gate]: any) => ({
    id,
    type: gate.type,
    title: gate.title,
    model: gate.model,
  }));
  const existingBlock = deterministicFindings.length === 0
    ? 'None.'
    : deterministicFindings.map((finding: any) => `- [${finding.id}] (${finding.severity}) ${finding.explanation}`).join('\n');
  const architectureIntent = objectRecord(progress.architecture_intent);
  const intentBlock = Object.keys(architectureIntent).length === 0
    ? 'None declared.'
    : JSON.stringify(architectureIntent, null, 2);
  return `# Architecture Validation — Project: ${project}

You are performing an opinionated architecture review of the software being built or refactored.
Your role is to provide an additional architectural opinion about the module design, boundaries, responsibilities, dependencies, and product/refactor shape.
You are NOT checking progress tracking, tracing, control-flow artifacts, execution metadata, file existence, or runtime readiness. Deterministic validators own those checks.

## Project Definition

Modules:
${JSON.stringify(modules, null, 2)}

Gates:
${JSON.stringify(gates, null, 2)}

Declared architecture intent:
${intentBlock}

## Deterministic Findings Already Raised
${existingBlock}

## Your Task
Review the proposed software/module architecture above for module boundaries, product/refactor shape, architectural risks, and missing architectural concepts.
Do not report findings about progress.json correctness, tracing, execution-order bookkeeping, control files, generated artifact paths, or test harness state.

## Response Format
Write a JSON array of findings to this exact file path:
\`${outputFilePath}\`

Each finding must have:
- id: string
- severity: "info" | "warn" | "error" | "blocking"
- scope: "project" | "module" | "gate" | "dependency_graph" | "domain_model" | "integration_boundary"
- paths: []
- explanation: string
- remediation: string

If you find no issues, write an empty array: []
Do not write markdown. Do not print the findings in chat.`;
}

function positiveNumber(value: any, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new Error(`${label}: required positive number`);
  return value;
}

function dependency(deps: any, name: string, fallback: any) {
  return typeof deps[name] === 'function' ? deps[name] : fallback;
}

function agentPolicy(progress: any, config: any) {
  const echoDispatch = config?.agents?.echo?.dispatch;
  if (!['acp', 'subagent'].includes(echoDispatch)) {
    throw new Error('config.agents.echo.dispatch: required canonical spawned-session dispatch in swarm.config.json');
  }
  const policy = resolvePolicy(config, progress, 'arch_validator', {
    scopeModel: progress?.arch_validation?.model,
    scopeThinking: progress?.arch_validation?.thinking_level,
    dispatchPath: echoDispatch,
  });
  logEffectivePolicy(config, { scope: 'arch_validator', agent: 'arch_validator', ...policy });
  return { echoDispatch, policy };
}

function createAgentRuntime(progress: any, config: any, opts: any) {
  const deps = objectRecord(opts.deps);
  const outputFilePath = validatorAgentOutputPath(config);
  if (!outputFilePath) throw new Error('architecture validator agent output path is unavailable');
  const { echoDispatch, policy } = agentPolicy(progress, config);
  const archConfig = getArchValidationConfig(config);
  const timeoutValue = progress?.arch_validation?.timeout_minutes ?? archConfig.timeout_minutes;
  const resolveRuntimeFn = dependency(deps, 'resolveRuntime', resolveRuntime);
  const modelToHarnessFn = dependency(deps, 'modelToHarness', modelToHarness);
  return {
    progress,
    config,
    outputFilePath,
    policy,
    model: policy.model,
    runtime: resolveRuntimeFn({ runtime: echoDispatch, model: policy.model }),
    agentId: requireNonEmptyString(modelToHarnessFn(policy.model), 'architecture validator model harness'),
    cwd: config.repo_root,
    baseLabel: `arch-validator-${Date.now()}`,
    timeoutMinutes: positiveNumber(timeoutValue, 'arch_validation.timeout_minutes'),
    maxAttempts: Number(progress?.arch_validation?.agent_max_attempts ?? 1),
    maxPauses: getRateLimitConfig(config).max_pauses_per_module,
    spawn: dependency(deps, 'spawnSession', spawnSession),
    poll: dependency(deps, 'pollForFile', pollForFile),
    terminate: dependency(deps, 'terminateSession', terminateSession),
    pauseCount: 0,
    executionFailures: 0,
    sessionAttempt: 0,
  };
}

function attemptLabel(runtime: any) {
  return [
    runtime.baseLabel,
    runtime.sessionAttempt > 1 ? `attempt-${runtime.sessionAttempt}` : null,
    runtime.pauseCount > 0 ? `resume-${runtime.pauseCount}` : null,
  ].filter(Boolean).join('-');
}

async function spawnAttempt(runtime: any, prompt: string, label: string) {
  return runtime.spawn({
    session: { model: runtime.model, runtime: runtime.runtime, agentId: runtime.agentId, cwd: runtime.cwd, label },
  }, prompt, runtime.timeoutMinutes * 60, {
    runtime: runtime.runtime,
    model: runtime.model,
    agentId: runtime.agentId,
    cwd: runtime.cwd,
    label,
    thinking: selectTruthyValue(() => (runtime.policy.thinking), () => (null)),
    ...sessionLifecyclePolicies(runtime.config),
    trackActive: false,
    observabilityIdentity: {
      run_id: resolveArchValidatorRunId(runtime.config),
      project: requireNonEmptyString(runtime.progress?.project, 'progress.project'),
      agent_type: 'arch_validator',
      dispatch_id: label,
      gateway_label: label,
    },
  });
}

async function processRateLimit(runtime: any, pollResult: any, label: string, sessionKey: string) {
  runtime.pauseCount += 1;
  const step = await processSessionRateLimit(runtime.config, {
    ...objectRecord(pollResult.status),
    reason: 'rate_limited',
    detail: firstTruthy(
      pollResult.status?.detail,
      pollResult.status?.rate_limit_reason,
      pollResult.status?.transcript?.lastDetail,
    ),
    transcript: selectDefinedValue(() => (pollResult.status?.transcript), () => (null)),
    agent_type: 'arch_validator',
    run_id: resolveArchValidatorRunId(runtime.config),
    dispatch_id: label,
    gateway_label: label,
    session_key: sessionKey,
  }, {
    pauseCount: runtime.pauseCount,
    maxPauses: runtime.maxPauses,
    pauseLogMessage: ({ pauseCount, maxPauses, cooldownHours, resumeAt }: any) =>
      `[arch-validator] ACP session rate limited (pause ${pauseCount}/${maxPauses}) — sleeping ${cooldownHours}h (resume at ${resumeAt.toISOString()})`,
    resumeLogMessage: () => '[arch-validator] ACP session rate limit cooldown complete — retrying validation agent',
  });
  if (!step.exhausted) return null;
  return [makeFinding(
    FINDING_CODES.AGENT_JUDGMENT_EXECUTION_ERROR,
    SEVERITY.BLOCKING,
    SCOPE.PROJECT,
    ['progress.json'],
    'Architecture validator agent exhausted configured rate-limit pauses.',
    'Wait for the provider quota reset or switch to an available configured model/provider, then rerun the pipeline.',
  )];
}

async function cleanupAttempt(runtime: any, sessionData: any, label: string) {
  if (!sessionData?.childSessionKey) return;
  try {
    await runtime.terminate(sessionData.childSessionKey, {
      ...sessionLifecyclePolicies(runtime.config),
      runtime: runtime.runtime,
      model: runtime.model,
      agentId: runtime.agentId,
      label,
    });
  } catch (error) {
    log('DEBUG', `[arch-validator] Session cleanup failed (non-critical): ${errorMessage(error)}`);
  }
}

async function runAttempt(runtime: any, prompt: string) {
  runtime.sessionAttempt += 1;
  const label = attemptLabel(runtime);
  let sessionData = null;
  try {
    sessionData = await spawnAttempt(runtime, prompt, label);
    const sessionKey = requireNonEmptyString(sessionData?.childSessionKey, 'architecture validator session key');
    const result = await runtime.poll(runtime.config, runtime.outputFilePath, runtime.timeoutMinutes, 'Architecture Validator', sessionKey);
    if (result?.ok) return { done: true, findings: parseAgentFindingsFile(runtime.outputFilePath) };
    if (result?.reason === 'rate_limited') {
      const findings = await processRateLimit(runtime, result, label, sessionKey);
      return findings ? { done: true, findings } : { done: false };
    }
    runtime.executionFailures += 1;
    if (runtime.executionFailures < runtime.maxAttempts) {
      log('WARN', `[arch-validator] Agent judgment produced no findings output (${result?.reason || 'missing_failure_detail'}); retrying`);
      return { done: false };
    }
    return {
      done: true,
      findings: [makeFinding(
        FINDING_CODES.AGENT_JUDGMENT_EXECUTION_ERROR,
        SEVERITY.ERROR,
        SCOPE.PROJECT,
        ['progress.json'],
        `Architecture validator agent did not produce findings output after ${runtime.maxAttempts} attempt(s): ${result?.reason || 'missing_failure_detail'}`,
        'Check validator agent session logs and prompt artifacts, then rerun the pipeline.',
      )],
    };
  } finally {
    await cleanupAttempt(runtime, sessionData, label);
  }
}

export async function runAgentJudgment(progress: any, config: any, deterministicFindings: any[], opts: any = {}) {
  if (opts.skipAgent === true || progress?.arch_validation?.agent_enabled !== true) return [];
  const runtime = createAgentRuntime(progress, config, opts);
  if (!Number.isInteger(runtime.maxAttempts) || runtime.maxAttempts <= 0) {
    throw new Error('arch_validation.agent_max_attempts: required positive integer');
  }
  fs.mkdirSync(path.dirname(runtime.outputFilePath), { recursive: true });
  try {
    if (fs.existsSync(runtime.outputFilePath)) fs.unlinkSync(runtime.outputFilePath);
  } catch (_error) {
    /* INTENTIONAL_NONCRITICAL(best_effort_cleanup_failed): stale output cleanup is best effort. */
  }
  const prompt = buildValidatorPrompt(progress, config, deterministicFindings, runtime.outputFilePath);
  for (;;) {
    try {
      const result = await runAttempt(runtime, prompt);
      if (result.done) return result.findings;
    } catch (error) {
      throw new Error(`Architecture validator agent execution failed: ${errorMessage(error)}`);
    }
  }
}
