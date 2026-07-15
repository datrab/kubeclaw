import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// services/arch-validator.ts — Pre-pipeline architecture validation
//
// Runs before the first module executes. Combines deterministic structural
// checks with optional agent-level judgment to identify project definition
// defects that would cause wasted execution time or silent failures.
//
// Default execution:
//   Phase 1 — Deterministic checks: file presence, progress.json coherence,
//              dependency graph, gate references, test-spec validity, model config.
//
// Optional execution:
//   Phase 2 — Agent judgment:      architecture coherence, gap/overlap detection,
//              dependency ordering analysis. This must use the canonical spawned
//              agent/session flow, not a separate direct completion path.
//
// Blocking policy:
//   severity='blocking'|'error' → pipeline must halt before module 01
//   severity='warn'|'info' → require approval before module 01
//
// Model resolution: progress.arch_validation.model → progress.defaults.models.arch_validator → config.fallback_model.
// Thinking resolution: progress.arch_validation.thinking_level → progress.defaults.thinking.arch_validator.
//
// Artifact output under the canonical architecture-validator log directory:
//   results.json        — machine-readable findings
//   summary.md          — human-readable report
//   validator-prompt.md — bounded prompt artifact for agent judgment run

import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.ts';
import { getRunId } from '../core/runtime.ts';
import { archValidatorLogDir } from '../core/paths.ts';
import { resolvePolicy, logEffectivePolicy } from '../core/config.ts';
import { writePromptArtifact } from '../egress.ts';
import { spawnSession } from '../agents/lifecycle.ts';
import { terminateSession } from '../agents/session-termination.ts';
import { sessionLifecyclePolicies } from '../core/session-policy.ts';
import { pollForFile } from './polling.ts';
import { getRateLimitConfig, processSessionRateLimit } from './rate-limit.ts';
import { modelToHarness, resolveRuntime } from '../agents/runtime.ts';
import { getArchValidationConfig } from './runtime-defaults.ts';

import {
  FINDING_CODES,
  SCOPE,
  SEVERITY,
  makeFinding,
  runDeterministicArchitectureChecks,
} from './arch-validator-checks.ts';

export { FINDING_CODES, SCOPE, SEVERITY };

function validatorAgentOutputPath(config) {
  const logDir = archValidatorLogDir(config);
  return logDir ? path.join(logDir, 'agent-findings.json') : null;
}

function resolveArchValidatorRunId(config, preferred = null) {
  if (preferred) return preferred;
  const runtimeRunId = getRunId(config);
  if (runtimeRunId) return runtimeRunId;
  if (config?._runId) return config._runId;
  if (config?.run_id) return config.run_id;
  return null;
}

function normalizeAgentFinding(rawFinding) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (!rawFinding), () => (typeof rawFinding !== 'object'))), () => (Array.isArray(rawFinding)))) {
    throw new Error('each agent finding must be an object');
  }

  const finding = rawFinding;
  const id = typeof finding.id === 'string' && finding.id.trim() ? finding.id.trim() : null;
  const severity = typeof finding.severity === 'string' ? finding.severity.trim() : null;
  const scope = typeof finding.scope === 'string' ? finding.scope.trim() : null;
  const explanation = typeof finding.explanation === 'string' && finding.explanation.trim()
    ? finding.explanation.trim()
    : null;
  const remediation = typeof finding.remediation === 'string' && finding.remediation.trim()
    ? finding.remediation.trim()
    : null;
  const paths = Array.isArray(finding.paths)
    ? finding.paths.filter((entry) => typeof entry === 'string' && entry.trim()).map((entry) => entry.trim())
    : [];

  if (!id) throw new Error('each agent finding requires non-empty string id');
  if (!Object.values(SEVERITY).includes(severity)) throw new Error(`agent finding '${id}' has invalid severity '${severity}'`);
  if (!Object.values(SCOPE).includes(scope)) throw new Error(`agent finding '${id}' has invalid scope '${scope}'`);
  if (!explanation) throw new Error(`agent finding '${id}' requires non-empty explanation`);
  if (!remediation) throw new Error(`agent finding '${id}' requires non-empty remediation`);

  return { id, severity, scope, paths, explanation, remediation };
}

function parseAgentFindingsFile(outputFilePath) {
  const raw = fs.readFileSync(outputFilePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('agent output must be a JSON array');
  }
  return parsed.map(normalizeAgentFinding);
}

function requirePositiveTimeoutMinutes(value, label) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (typeof value !== 'number'), () => (!Number.isFinite(value)))), () => (value <= 0))) {
    throw new Error(`${label}: required positive number`);
  }
  return value;
}

function requirePositiveInteger(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${label}: required positive integer`);
  }
  return value;
}

function resolveAgentMaxAttempts(progress, archConfig) {
  const value = progress?.arch_validation?.agent_max_attempts ?? archConfig.agent_max_attempts ?? 1;
  return requirePositiveInteger(Number(value), 'arch_validation.agent_max_attempts');
}

function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function requireNonEmptyString(value, label) {
  if (selectTruthyValue(() => (typeof value !== 'string'), () => (!value.trim()))) {
    throw new Error(`${label}: required non-empty string`);
  }
  return value.trim();
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

// ── Agent-based judgment ──────────────────────────────────────────────────────

export function buildValidatorPrompt(progress, config, deterministicFindings, outputFilePath) {
  const project = requireNonEmptyString(progress?.project, 'progress.project');
  const modules = Object.entries(objectRecord(progress.modules)).map(([id, m]) => ({
    id,
    dir: m.dir,
    title: m.title,
    role: m.role,
    owned_paths: Array.isArray(m.owned_paths) ? m.owned_paths : [],
    module_output_contract: m.module_output_contract,
    consumes_module_outputs: Array.isArray(m.consumes_module_outputs) ? m.consumes_module_outputs : [],
    stages: m.stages,
    depends_on: m.depends_on,
  }));

  const gates = Object.entries(objectRecord(progress.gates)).map(([id, g]) => ({
    id,
    type: g.type,
    title: g.title,
    model: g.model,
  }));

  const existingBlock = deterministicFindings.length === 0
    ? 'None.'
    : deterministicFindings.map(f => `- [${f.id}] (${f.severity}) ${f.explanation}`).join('\n');
  const architectureIntent = objectRecord(progress.architecture_intent);
  const architectureIntentBlock = Object.keys(architectureIntent).length === 0
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
${architectureIntentBlock}

## Deterministic Findings Already Raised
${existingBlock}

## Your Task
Review the proposed software/module architecture above for:
1. Module boundaries — are responsibilities split in a coherent way?
2. Product/refactor shape — does the architecture fit the stated software idea?
3. Architectural risks — are there obvious coupling, sequencing, or ownership concerns in the design?
4. Missing architectural concepts — are important domain or integration components absent from the design?

Do not report findings about progress.json correctness, tracing, execution-order bookkeeping, control files, generated artifact paths, or test harness state. Those are deterministic validation concerns and are already handled outside this agent judgment.
If the declared architecture intent says a small fixture is intentionally split to exercise pipeline orchestration surfaces, judge whether that declared intent is explicit and internally coherent instead of treating the split itself as a product-architecture defect.

## Response Format
Write a JSON array of findings to this exact file path:
\`${outputFilePath}\`

Each finding must have:
- id: string (stable code like OVERLAP_DETECTED, COVERAGE_GAP, DEPENDENCY_ORDER_VIOLATION, etc.)
- severity: "info" | "warn" | "error" | "blocking"
- scope: "project" | "module" | "gate" | "dependency_graph" | "domain_model" | "integration_boundary"
- paths: [] (empty array if not file-specific)
- explanation: string (one to two sentences)
- remediation: string (one actionable fix)

If you find no issues, write an empty array: []

Do not write markdown. Do not print the findings in chat. Your job is complete only after the JSON file exists at the path above.`;
}

async function runAgentJudgment(progress, config, deterministicFindings, opts = {}) {
  if (opts.skipAgent === true) {
    log('INFO', '[arch-validator] Agent judgment skipped by explicit invocation option');
    return [];
  }

  // Agent judgment is opt-in. Deterministic validation remains the reliable default path.
  const archConfig = getArchValidationConfig(config);
  const agentEnabled = progress?.arch_validation?.agent_enabled
  if (agentEnabled !== true) {
    log('INFO', '[arch-validator] Agent judgment disabled (explicit opt-in required)');
    return [];
  }

  const deps = opts.deps ? opts.deps : {};
  const spawnSessionFn = deps.spawnSession ? deps.spawnSession : spawnSession;
  const pollForFileFn = deps.pollForFile ? deps.pollForFile : pollForFile;
  const terminateSessionFn = deps.terminateSession ? deps.terminateSession : terminateSession;
  const modelToHarnessFn = deps.modelToHarness ? deps.modelToHarness : modelToHarness;
  const resolveRuntimeFn = deps.resolveRuntime ? deps.resolveRuntime : resolveRuntime;
  const outputFilePath = validatorAgentOutputPath(config);
  if (!outputFilePath) {
    throw new Error('architecture validator agent output path is unavailable');
  }

  fs.mkdirSync(path.dirname(outputFilePath), { recursive: true });
  try {
    if (fs.existsSync(outputFilePath)) fs.unlinkSync(outputFilePath);
  } catch (_error) {
    // best-effort cleanup only
  }

  const prompt = buildValidatorPrompt(progress, config, deterministicFindings, outputFilePath);
  const echoDispatch = config?.agents?.echo?.dispatch;
  if (echoDispatch !== 'acp' && echoDispatch !== 'subagent') {
    throw new Error('config.agents.echo.dispatch: required canonical spawned-session dispatch in swarm.config.json');
  }
  const policy = resolvePolicy(config, progress, 'arch_validator', {
    scopeModel: progress?.arch_validation?.model,
    scopeThinking: progress?.arch_validation?.thinking_level,
    dispatchPath: echoDispatch,
  });
  logEffectivePolicy(config, { scope: 'arch_validator', agent: 'arch_validator', ...policy });
  const model = policy.model;
  const runtime = resolveRuntimeFn({ runtime: echoDispatch, model });
  const agentId = requireNonEmptyString(modelToHarnessFn(model), 'architecture validator model harness');
  const cwd = config.repo_root;
  const label = `arch-validator-${Date.now()}`;
  const timeoutMinutes = progress?.arch_validation?.timeout_minutes !== undefined
    ? requirePositiveTimeoutMinutes(progress.arch_validation.timeout_minutes, 'progress.arch_validation.timeout_minutes')
    : requirePositiveTimeoutMinutes(archConfig.timeout_minutes, 'config.arch_validation.timeout_minutes');
  const maxAttempts = resolveAgentMaxAttempts(progress, archConfig);
  const maxPauses = getRateLimitConfig(config).max_pauses_per_module;
  let pauseCount = 0;
  let sessionAttempt = 0;
  let executionFailures = 0;

  for (;;) {
    sessionAttempt += 1;
    let sessionData = null;
    const attemptLabel = [
      label,
      sessionAttempt > 1 ? `attempt-${sessionAttempt}` : null,
      pauseCount > 0 ? `resume-${pauseCount}` : null,
    ].filter(Boolean).join('-');
    try {
      sessionData = await spawnSessionFn({
        session: { model, runtime, agentId, cwd, label: attemptLabel },
      }, prompt, timeoutMinutes * 60, {
        runtime,
        model,
        agentId,
        cwd,
        label: attemptLabel,
        thinking: selectTruthyValue(() => (policy.thinking), () => (null)),
        ...sessionLifecyclePolicies(config),
        trackActive: false,
        observabilityIdentity: {
          run_id: resolveArchValidatorRunId(config),
          project: requireNonEmptyString(progress?.project, 'progress.project'),
          agent_type: 'arch_validator',
          dispatch_id: attemptLabel,
          gateway_label: attemptLabel,
        },
      });

      const childSessionKey = requireNonEmptyString(sessionData?.childSessionKey, 'architecture validator session key');
      const pollResult = await pollForFileFn(config, outputFilePath, timeoutMinutes, 'Architecture Validator', childSessionKey);
      if (pollResult?.ok) return parseAgentFindingsFile(outputFilePath);

      if (pollResult?.reason === 'rate_limited') {
        pauseCount += 1;
        const rateLimitStep = await processSessionRateLimit(config, {
          ...objectRecord(pollResult.status),
          reason: 'rate_limited',
          detail: selectTruthyValue(() => (
            selectTruthyValue(
              () => (selectTruthyValue(() => (pollResult.status?.detail), () => (pollResult.status?.rate_limit_reason))),
              () => (pollResult.status?.transcript?.lastDetail),
            )
          ), () => (null)),
          transcript: selectDefinedValue(() => (pollResult.status?.transcript), () => (null)),
          transcript_detail: selectTruthyValue(() => (pollResult.status?.transcript?.lastDetail), () => (null)),
          agent_type: 'arch_validator',
          run_id: resolveArchValidatorRunId(config),
          dispatch_id: attemptLabel,
          gateway_label: attemptLabel,
          session_key: childSessionKey,
        }, {
          pauseCount,
          maxPauses,
          pauseLogMessage: ({ pauseCount: count, maxPauses: max, cooldownHours, resumeAt }) =>
            `[arch-validator] ACP session rate limited (pause ${count}/${max}) — sleeping ${cooldownHours}h (resume at ${resumeAt.toISOString()})`,
          resumeLogMessage: () => '[arch-validator] ACP session rate limit cooldown complete — retrying validation agent',
        });
        if (rateLimitStep.exhausted) {
          return [makeFinding(
            FINDING_CODES.AGENT_JUDGMENT_EXECUTION_ERROR, SEVERITY.BLOCKING, SCOPE.PROJECT,
            ['progress.json'],
            'Architecture validator agent exhausted configured rate-limit pauses.',
            'Wait for the provider quota reset or switch to an available configured model/provider, then rerun the pipeline.',
          )];
        }
        continue;
      }

      executionFailures += 1;
      const failureReason = selectTruthyValue(() => (pollResult?.reason), () => ('missing_failure_detail'));
      if (executionFailures < maxAttempts) {
        log('WARN', `[arch-validator] Agent judgment produced no findings output (${failureReason}); retrying attempt ${executionFailures + 1}/${maxAttempts}`);
        continue;
      }

      return [makeFinding(
        FINDING_CODES.AGENT_JUDGMENT_EXECUTION_ERROR, SEVERITY.ERROR, SCOPE.PROJECT,
        ['progress.json'],
        `Architecture validator agent did not produce findings output after ${maxAttempts} attempt(s): ${failureReason}`,
        'Check validator agent session logs and prompt artifacts, then rerun the pipeline.',
      )];
    } catch (error) {
      throw new Error(`Architecture validator agent execution failed: ${errorMessage(error)}`);
    } finally {
      if (sessionData?.childSessionKey) {
        try {
          await terminateSessionFn(sessionData.childSessionKey, {
            ...sessionLifecyclePolicies(config),
            runtime,
            model,
            agentId,
            label: attemptLabel,
          });
        } catch (error) {
          log('DEBUG', `[arch-validator] Session cleanup failed (non-critical): ${errorMessage(error)}`);
        }
      }
    }
  }
}

// ── Artifact output ───────────────────────────────────────────────────────────

export function buildMarkdownSummary(result) {
  const { blocked, findings = [], timestamp, project } = result;
  const blockingCount = findings.filter(f => f.severity === 'blocking').length;
  const errorCount    = findings.filter(f => f.severity === 'error').length;
  const warnCount     = findings.filter(f => f.severity === 'warn').length;
  const infoCount     = findings.filter(f => f.severity === 'info').length;

  const lines = [
    `# Architecture Validation Report`,
    ``,
    `**Project:** ${project}`,
    `**Timestamp:** ${timestamp}`,
    `**Result:** ${blocked ? 'BLOCKED' : 'PASS'}`,
    ``,
    `## Summary`,
    ``,
    `| Severity | Count |`,
    `|----------|-------|`,
    `| blocking | ${blockingCount} |`,
    `| error    | ${errorCount} |`,
    `| warn     | ${warnCount} |`,
    `| info     | ${infoCount} |`,
    `| **total**| **${findings.length}** |`,
    ``,
  ];

  if (findings.length === 0) {
    lines.push('_No issues found. Architecture is valid._');
  } else {
    lines.push('## Findings');
    lines.push('');
    for (const f of findings) {
      lines.push(`### [${f.severity.toUpperCase()}] \`${f.id}\``);
      lines.push(`**Scope:** ${f.scope}`);
      if (f.paths && f.paths.length > 0) lines.push(`**Paths:** ${f.paths.join(', ')}`);
      lines.push(`**Issue:** ${f.explanation}`);
      lines.push(`**Fix:** ${f.remediation}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

function writeArtifacts(config, result, prompt) {
  const logDir = archValidatorLogDir(config);
  if (!logDir) return;
  try {
    fs.mkdirSync(logDir, { recursive: true });
    fs.writeFileSync(path.join(logDir, 'results.json'), JSON.stringify(result, null, 2) + '\n');
    fs.writeFileSync(path.join(logDir, 'summary.md'), buildMarkdownSummary(result));
    if (prompt) {
      writePromptArtifact(path.join(logDir, 'validator-prompt.md'), prompt, { agent_type: 'arch_validator', project: selectTruthyValue(() => (selectTruthyValue(() => (result?.project), () => (config?.project))), () => ('missing_project')) });
    }
  } catch (e) {
    log('WARN', `[arch-validator] Failed to write artifacts: ${e.message}`);
  }
}

function countFindings(findings = []) {
  return {
    blocking: findings.filter((finding) => finding?.severity === SEVERITY.BLOCKING).length,
    error: findings.filter((finding) => finding?.severity === SEVERITY.ERROR).length,
    warn: findings.filter((finding) => finding?.severity === SEVERITY.WARN).length,
    info: findings.filter((finding) => finding?.severity === SEVERITY.INFO).length,
  };
}

function mapFindingSeverityToDiagnosticSeverity(severity) {
  switch (severity) {
    case SEVERITY.BLOCKING:
      return 'critical';
    case SEVERITY.ERROR:
      return 'error';
    case SEVERITY.WARN:
      return 'warn';
    case SEVERITY.INFO:
    default:
      return 'info';
  }
}

function buildArtifactPaths(config) {
  const logDir = archValidatorLogDir(config);
  if (!logDir) {
    return {
      results: null,
      summary: null,
      prompt: null,
    };
  }
  return {
    results: path.join(logDir, 'results.json'),
    summary: path.join(logDir, 'summary.md'),
    prompt: path.join(logDir, 'validator-prompt.md'),
  };
}

function buildArtifactRefs(config) {
  const artifactPaths = buildArtifactPaths(config);
  const refs = [];
  const pushIfPresent = (artifact) => {
    if (!artifact?.path) return;
    refs.push(artifact);
  };

  pushIfPresent({
    type: 'validator_report',
    role: 'output',
    label: 'architecture-results',
    format: 'json',
    path: artifactPaths.results,
  });
  pushIfPresent({
    type: 'validator_report',
    role: 'output',
    label: 'architecture-summary',
    format: 'md',
    path: artifactPaths.summary,
  });
  pushIfPresent({
    type: 'validator_report',
    role: 'output',
    label: 'architecture-prompt',
    format: 'md',
    path: artifactPaths.prompt,
  });

  return refs;
}

function buildControlSummary({ blocked = false, findings = [], executionFailed = false, contractInvalid = false, error = null } = {}) {
  if (selectTruthyValue(() => (executionFailed), () => (contractInvalid))) {
    return error
      ? `Architecture validator execution failed: ${error}`
      : 'Architecture validator execution failed';
  }
  if (blocked) {
    const blockingCount = findings.filter((finding) => finding?.severity === SEVERITY.BLOCKING).length;
    const errorCount = findings.filter((finding) => finding?.severity === SEVERITY.ERROR).length;
    return `Architecture validation BLOCKED with ${blockingCount} blocking and ${errorCount} error finding(s)`;
  }
  if (findings.length > 0) {
    return `Architecture validation passed with ${findings.length} non-blocking finding(s)`;
  }
  return 'Architecture validation passed';
}

function controlResultBlocked(result, { executionFailed = false, contractInvalid = false } = {}) {
  if (executionFailed === true) return true;
  if (contractInvalid === true) return true;
  return result?.blocked === true;
}

function reportBlockedFromControlResult(result, metadata) {
  if (result?.nextAction === 'block') return true;
  return metadata.blocked === true;
}

function reportExecutionFailedFromMetadata(metadata) {
  if (metadata.execution_failed === true) return true;
  return metadata.contract_invalid === true;
}

export function buildArchitectureValidatorControlResult(config, result = {}, opts = {}) {
  const findings = Array.isArray(result?.findings) ? result.findings : [];
  const runId = resolveArchValidatorRunId(config, result?.run_id);
  const project = requireNonEmptyString(result?.project, 'architecture validator result project');
  const timestamp = requireNonEmptyString(result?.timestamp, 'architecture validator result timestamp');
  const executionFailed = opts.executionFailed === true;
  const contractInvalid = opts.contractInvalid === true;
  const blocked = controlResultBlocked(result, { executionFailed, contractInvalid });
  const counts = countFindings(findings);
  const stageId = requireNonEmptyString(selectDefinedValue(() => (opts?.input?.ids?.stageId), () => (opts?.stageId)), 'architecture validator stageId');
  const validatorName = requireNonEmptyString(selectDefinedValue(() => (opts?.input?.ids?.validatorName), () => (opts?.validatorName)), 'architecture validator name');
  const error = selectTruthyValue(() => (opts?.error), () => (null));
  const contractDiagnostic = selectTruthyValue(() => (opts?.contractDiagnostic), () => (null));
  const artifactPaths = buildArtifactPaths(config);
  const summary = buildControlSummary({ blocked, findings, executionFailed, contractInvalid, error });
  const outcomeClass = blocked ? 'blocked' : 'passed';

  return {
    schemaVersion: 'v1',
    producerKind: 'validator',
    producerType: validatorName,
    nextAction: blocked ? 'block' : 'pass',
    ...(blocked ? { issueType: selectTruthyValue(() => (executionFailed), () => (contractInvalid)) ? 'contract' : 'code' } : {}),
    diagnostics: {
      summary,
      findings: findings.map((finding = {}) => ({
        code: requireNonEmptyString(finding.id, 'architecture validator finding id'),
        severity: mapFindingSeverityToDiagnosticSeverity(finding.severity),
        message: selectDefinedValue(() => (finding.explanation), () => ('Architecture validation finding')),
        category: selectTruthyValue(() => (finding.scope), () => (null)),
        target: Array.isArray(finding.paths) && finding.paths.length > 0 ? finding.paths[0] : null,
        retryable: false,
        environmentIssue: false,
        metadata: {
          remediation: selectTruthyValue(() => (finding.remediation), () => (null)),
          paths: Array.isArray(finding.paths) ? [...finding.paths] : [],
          original_severity: selectTruthyValue(() => (finding.severity), () => (null)),
        },
      })),
      artifacts: buildArtifactRefs(config),
      metadata: {
        blocked,
        execution_failed: executionFailed,
        contract_invalid: contractInvalid,
        contract_diagnostic: contractDiagnostic,
        error,
        project,
        run_id: runId,
        timestamp,
        stage_id: stageId,
        findings_total: findings.length,
        blocking_count: counts.blocking,
        error_count: counts.error,
        warn_count: counts.warn,
        info_count: counts.info,
        artifact_paths: artifactPaths,
        raw_findings: findings,
      },
      typed: {
        validator: {
          schemaVersion: 'v1',
          validatorType: validatorName,
          outcomeClass,
          summary,
          metadata: {
            blocked,
            execution_failed: executionFailed,
            contract_invalid: contractInvalid,
            contract_diagnostic: contractDiagnostic,
            error,
            project,
            run_id: runId,
            timestamp,
            stage_id: stageId,
            findings_total: findings.length,
            blocking_count: counts.blocking,
            error_count: counts.error,
            warn_count: counts.warn,
            info_count: counts.info,
          },
        },
      },
    },
  };
}

export function isArchitectureValidatorControlResult(result) {
  return result?.schemaVersion === 'v1'
    && result?.producerKind === 'validator'
    && typeof result?.producerType === 'string'
    && typeof result?.nextAction === 'string';
}

export function coerceArchitectureValidatorControlResult(config, result, opts = {}) {
  if (isArchitectureValidatorControlResult(result)) return result;
  throw new Error('validator:architecture plugin output must be a typed validator control result; compatibility-shaped validation results are not accepted at the validator boundary');
}

export function extractArchValidatorReport(result, config) {
  if (isArchitectureValidatorControlResult(result)) {
    const metadata = objectRecord(selectDefinedValue(() => (result?.diagnostics?.metadata), () => (result?.diagnostics?.typed?.validator?.metadata)));
    return {
      blocked: reportBlockedFromControlResult(result, metadata),
      findings: Array.isArray(metadata.raw_findings) ? metadata.raw_findings : [],
      timestamp: requireNonEmptyString(metadata.timestamp, 'architecture validator metadata timestamp'),
      project: requireNonEmptyString(metadata.project, 'architecture validator metadata project'),
      run_id: requireNonEmptyString(metadata.run_id, 'architecture validator metadata run_id'),
      execution_failed: reportExecutionFailedFromMetadata(metadata),
      error: selectTruthyValue(() => (metadata.error), () => (null)),
      artifact_paths: objectRecord(metadata.artifact_paths),
    };
  }

  return {
    blocked: result?.blocked === true,
    findings: Array.isArray(result?.findings) ? result.findings : [],
    timestamp: requireNonEmptyString(result?.timestamp, 'architecture validator result timestamp'),
    project: requireNonEmptyString(result?.project, 'architecture validator result project'),
    run_id: requireNonEmptyString(result?.run_id, 'architecture validator result run_id'),
    execution_failed: false,
    error: null,
    artifact_paths: buildArtifactPaths(config),
  };
}

// ── Blocking policy ───────────────────────────────────────────────────────────

export function isBlocking(findings) {
  return Array.isArray(findings) && findings.some(f => f.severity === SEVERITY.BLOCKING || f.severity === SEVERITY.ERROR);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run the pre-pipeline architecture validator.
 *
 * Returns: { blocked: boolean, findings: Finding[], timestamp: string, project: string }
 *
 *   blocked=true  → at least one finding has severity 'blocking' or 'error'; caller must halt
 *   blocked=false → warn/info findings require approval; no findings may continue
 *
 * Never throws. Internal errors are captured as BLOCKING findings so the pipeline fails closed.
 *
 * @param {object} config   - Pipeline config with paths and models
 * @param {object} progress - Loaded progress.json object
 * @returns {Promise<{blocked: boolean, findings: object[], timestamp: string, project: string}>}
 */
export async function runArchValidator(config, progress, opts = {}) {
  const timestamp = new Date().toISOString();
  const project = requireNonEmptyString(progress?.project, 'progress.project');

  log('STEP', '[arch-validator] Running pre-pipeline architecture validation...');

  let allFindings = [];
  let agentPrompt = null;
  let executionFailed = false;
  let executionError = null;

  try {
    // Phase 1: Deterministic structural checks
    const deterministicFindings = runDeterministicArchitectureChecks(progress, config);

    // Phase 2: Agent judgment (opt-in, canonical spawned-session execution)
    agentPrompt = buildValidatorPrompt(progress, config, deterministicFindings, validatorAgentOutputPath(config));
    const agentFindings = await runAgentJudgment(progress, config, deterministicFindings, opts);

    allFindings = [...deterministicFindings, ...agentFindings];
  } catch (e) {
    executionFailed = true;
    executionError = errorMessage(e);
    log('ERROR', `[arch-validator] Unexpected error during validation: ${executionError}`);
    allFindings = [makeFinding(
      FINDING_CODES.VALIDATOR_INTERNAL_ERROR, SEVERITY.BLOCKING, SCOPE.PROJECT,
      [],
      `Architecture validator encountered an internal error: ${executionError}`,
      'Review validator logs and fix the validator/runtime error before starting pipeline work.',
    )];
  }

  const blocked = isBlocking(allFindings);
  const result = { blocked, project, timestamp, findings: allFindings, execution_failed: executionFailed, error: executionError };

  // Write artifacts (non-critical — failure to write never blocks the pipeline)
  writeArtifacts(config, result, agentPrompt);

  if (blocked) {
    const blockingFindings = allFindings.filter(f => f.severity === SEVERITY.BLOCKING || f.severity === SEVERITY.ERROR);
    log('ERROR', `[arch-validator] Architecture validation BLOCKED — ${blockingFindings.length} blocking/error finding(s)`);
    for (const f of blockingFindings) {
      log('ERROR', `  [${f.id}] ${f.explanation}`);
      log('ERROR', `  Fix: ${f.remediation}`);
    }
  } else if (allFindings.length > 0) {
    log('WARN', `[arch-validator] Architecture validation passed with ${allFindings.length} non-blocking finding(s)`);
  } else {
    log('OK', '[arch-validator] Architecture validation passed — no issues found');
  }

  return result;
}

export async function runArchitectureValidatorStage(config, progress, opts = {}) {
  const result = await runArchValidator(config, progress, opts);
  return buildArchitectureValidatorControlResult(config, result, {
    ...opts,
    executionFailed: result.execution_failed === true,
    error: selectTruthyValue(() => (result.error), () => (null)),
  });
}
