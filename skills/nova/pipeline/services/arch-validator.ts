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
//   severity='blocking' → pipeline must halt before module 01
//   severity='error'|'warn'|'info' → proceed, log findings clearly
//
// Model resolution: progress.arch_validation.model → progress.defaults.models.arch_validator → config.fallback_model.
// Thinking resolution: progress.arch_validation.thinking_level → progress.defaults.thinking.arch_validator.
//
// Artifact output under the canonical architecture-validator log directory:
//   results.json        — machine-readable findings
//   summary.md          — human-readable report
//   validator-prompt.md — redacted prompt metadata for agent judgment run

import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.ts';
import { getRunId } from '../core/runtime.ts';
import { archValidatorLogDir } from '../core/paths.ts';
import { resolvePolicy, logEffectivePolicy } from '../core/config.ts';
import { writeRedactedPromptArtifact } from '../redaction.ts';
import { spawnSession } from '../agents/lifecycle.ts';
import { terminateSession } from '../agents/session-termination.ts';
import { pollForFile } from './polling.ts';
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
  if (!rawFinding || typeof rawFinding !== 'object' || Array.isArray(rawFinding)) {
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
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label}: required positive number`);
  }
  return value;
}

// ── Agent-based judgment ──────────────────────────────────────────────────────

export function buildValidatorPrompt(progress, config, deterministicFindings, outputFilePath) {
  const modules = Object.entries(progress.modules || {}).map(([id, m]) => ({
    id,
    dir: m.dir,
    title: m.title,
    stages: m.stages,
    depends_on: m.depends_on,
  }));

  const gates = Object.entries(progress.gates || {}).map(([id, g]) => ({
    id,
    type: g.type,
    title: g.title,
    model: g.model,
  }));

  const existingBlock = deterministicFindings.length === 0
    ? 'None.'
    : deterministicFindings.map(f => `- [${f.id}] (${f.severity}) ${f.explanation}`).join('\n');

  return `# Architecture Validation — Project: ${progress.project || config.project}

You are performing an architecture validation pass over a software pipeline project definition.
Your role is to identify structural coherence issues, gaps, and misalignments that would prevent successful execution.
You are NOT reviewing code quality or runtime correctness — focus on project definition coherence only.

## Project Definition

Execution order:
${JSON.stringify(progress.execution_order, null, 2)}

Modules:
${JSON.stringify(modules, null, 2)}

Gates:
${JSON.stringify(gates, null, 2)}

## Deterministic Findings Already Raised
${existingBlock}

## Your Task
Review the project definition above for:
1. Module overlap — do any modules have suspiciously similar or redundant scope?
2. Coverage gaps — are there obvious missing steps in the execution order?
3. Dependency ordering — does the execution_order respect declared depends_on relationships?
4. Structural coherence — does the overall project definition make sense as a pipeline?

## Response Format
Write a JSON array of findings to this exact file path:
\`${outputFilePath}\`

Each finding must have:
- id: string (stable code like OVERLAP_DETECTED, COVERAGE_GAP, DEPENDENCY_ORDER_VIOLATION, etc.)
- severity: "info" | "warn" | "error" | "blocking"
- scope: "project" | "module" | "gate" | "dependency_graph" | "test_spec" | "config"
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
  const agentEnabled = progress?.arch_validation?.agent_enabled ?? archConfig.agent_enabled;
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
  const agentId = modelToHarnessFn(model) || config?.agents?.echo?.acp_agent_id;
  if (!agentId) throw new Error('config.agents.echo.acp_agent_id: required for architecture validator spawned session');
  const cwd = config.repo_root;
  const label = `arch-validator-${Date.now()}`;
  const timeoutMinutes = progress?.arch_validation?.timeout_minutes !== undefined
    ? requirePositiveTimeoutMinutes(progress.arch_validation.timeout_minutes, 'progress.arch_validation.timeout_minutes')
    : requirePositiveTimeoutMinutes(archConfig.timeout_minutes, 'config.arch_validation.timeout_minutes');
  let sessionData = null;

  try {
    sessionData = await spawnSessionFn({
      session: { model, runtime, agentId, cwd, label },
    }, prompt, timeoutMinutes * 60, {
      runtime,
      model,
      agentId,
      cwd,
      label,
      thinking: policy.thinking || null,
      trackActive: false,
      observabilityIdentity: {
        run_id: resolveArchValidatorRunId(config),
        project: config?.project || progress?.project || null,
        agent_type: 'arch_validator',
        dispatch_id: label,
        gateway_label: label,
      },
    });

    const pollResult = await pollForFileFn(config, outputFilePath, timeoutMinutes, 'Architecture Validator', sessionData.childSessionKey || label);
    if (!pollResult?.ok) {
      return [makeFinding(
        FINDING_CODES.AGENT_JUDGMENT_EXECUTION_ERROR, SEVERITY.ERROR, SCOPE.PROJECT,
        ['progress.json'],
        `Architecture validator agent did not produce findings output: ${pollResult?.reason || 'unknown failure'}`,
        'Check validator agent session logs and prompt artifacts, then rerun the pipeline.',
      )];
    }
    return parseAgentFindingsFile(outputFilePath);
  } catch (error) {
    return [makeFinding(
      FINDING_CODES.AGENT_JUDGMENT_EXECUTION_ERROR, SEVERITY.ERROR, SCOPE.PROJECT,
      ['progress.json'],
      `Architecture validator agent execution failed: ${error?.message || error}`,
      'Check validator agent session logs and prompt artifacts, then rerun the pipeline.',
    )];
  } finally {
    if (sessionData?.childSessionKey) {
      try {
        await terminateSessionFn(sessionData.childSessionKey, {
          runtime,
          model,
          agentId,
          label,
        });
      } catch (error) {
        log('DEBUG', `[arch-validator] Session cleanup failed (non-critical): ${error?.message || error}`);
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
      writeRedactedPromptArtifact(path.join(logDir, 'validator-prompt.md'), prompt, { agent_type: 'arch_validator', project: result?.project || config?.project || 'unknown' });
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
  if (executionFailed || contractInvalid) {
    return error
      ? `Architecture validator execution failed: ${error}`
      : 'Architecture validator execution failed';
  }
  if (blocked) {
    const blockingCount = findings.filter((finding) => finding?.severity === SEVERITY.BLOCKING).length;
    return `Architecture validation BLOCKED with ${blockingCount} blocking finding(s)`;
  }
  if (findings.length > 0) {
    return `Architecture validation passed with ${findings.length} non-blocking finding(s)`;
  }
  return 'Architecture validation passed';
}

export function buildArchitectureValidatorControlResult(config, result = {}, opts = {}) {
  const findings = Array.isArray(result?.findings) ? result.findings : [];
  const runId = resolveArchValidatorRunId(config, result?.run_id);
  const project = result?.project || config?.project || 'unknown';
  const timestamp = result?.timestamp || new Date().toISOString();
  const executionFailed = opts.executionFailed === true;
  const contractInvalid = opts.contractInvalid === true;
  const blocked = executionFailed || contractInvalid || result?.blocked === true;
  const counts = countFindings(findings);
  const stageId = opts?.input?.ids?.stageId || opts?.stageId || 'validator:architecture';
  const validatorName = opts?.input?.ids?.validatorName || opts?.validatorName || 'architecture';
  const error = opts?.error || null;
  const contractDiagnostic = opts?.contractDiagnostic || null;
  const artifactPaths = buildArtifactPaths(config);
  const summary = buildControlSummary({ blocked, findings, executionFailed, contractInvalid, error });
  const outcomeClass = blocked ? 'blocked' : 'passed';

  return {
    schemaVersion: 'v1',
    producerKind: 'validator',
    producerType: validatorName,
    nextAction: blocked ? 'block' : 'pass',
    ...(blocked ? { issueType: executionFailed || contractInvalid ? 'unknown' : 'code' } : {}),
    diagnostics: {
      summary,
      findings: findings.map((finding = {}) => ({
        code: finding.id || FINDING_CODES.VALIDATOR_INTERNAL_ERROR,
        severity: mapFindingSeverityToDiagnosticSeverity(finding.severity),
        message: finding.explanation || 'Architecture validation finding',
        category: finding.scope || null,
        target: Array.isArray(finding.paths) && finding.paths.length > 0 ? finding.paths[0] : null,
        retryable: false,
        environmentIssue: false,
        metadata: {
          remediation: finding.remediation || null,
          paths: Array.isArray(finding.paths) ? [...finding.paths] : [],
          original_severity: finding.severity || null,
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
    const metadata = result?.diagnostics?.metadata || result?.diagnostics?.typed?.validator?.metadata || {};
    return {
      blocked: result?.nextAction === 'block' || metadata.blocked === true,
      findings: Array.isArray(metadata.raw_findings) ? metadata.raw_findings : [],
      timestamp: metadata.timestamp || new Date().toISOString(),
      project: metadata.project || config?.project || 'unknown',
      run_id: resolveArchValidatorRunId(config, metadata.run_id),
      execution_failed: metadata.execution_failed === true || metadata.contract_invalid === true,
      error: metadata.error || null,
      artifact_paths: metadata.artifact_paths || buildArtifactPaths(config),
    };
  }

  return {
    blocked: result?.blocked === true,
    findings: Array.isArray(result?.findings) ? result.findings : [],
    timestamp: result?.timestamp || new Date().toISOString(),
    project: result?.project || config?.project || 'unknown',
    run_id: resolveArchValidatorRunId(config, result?.run_id),
    execution_failed: false,
    error: null,
    artifact_paths: buildArtifactPaths(config),
  };
}

// ── Blocking policy ───────────────────────────────────────────────────────────

export function isBlocking(findings) {
  return Array.isArray(findings) && findings.some(f => f.severity === SEVERITY.BLOCKING);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Run the pre-pipeline architecture validator.
 *
 * Returns: { blocked: boolean, findings: Finding[], timestamp: string, project: string }
 *
 *   blocked=true  → at least one finding has severity 'blocking'; caller must halt
 *   blocked=false → all findings are non-blocking; pipeline may continue
 *
 * Never throws. Internal errors are captured as BLOCKING findings so the pipeline fails closed.
 *
 * @param {object} config   - Pipeline config with paths and models
 * @param {object} progress - Loaded progress.json object
 * @returns {Promise<{blocked: boolean, findings: object[], timestamp: string, project: string}>}
 */
export async function runArchValidator(config, progress, opts = {}) {
  const timestamp = new Date().toISOString();
  const project = progress?.project || config?.project || 'unknown';

  log('STEP', '[arch-validator] Running pre-pipeline architecture validation...');

  let allFindings = [];
  let agentPrompt = null;

  try {
    // Phase 1: Deterministic structural checks
    const deterministicFindings = runDeterministicArchitectureChecks(progress, config);

    // Phase 2: Agent judgment (opt-in, canonical spawned-session execution)
    agentPrompt = buildValidatorPrompt(progress, config, deterministicFindings, validatorAgentOutputPath(config));
    const agentFindings = await runAgentJudgment(progress, config, deterministicFindings, opts);

    allFindings = [...deterministicFindings, ...agentFindings];
  } catch (e) {
    log('ERROR', `[arch-validator] Unexpected error during validation: ${e.message}`);
    allFindings = [makeFinding(
      FINDING_CODES.VALIDATOR_INTERNAL_ERROR, SEVERITY.BLOCKING, SCOPE.PROJECT,
      [],
      `Architecture validator encountered an internal error: ${e.message}`,
      'Review validator logs and fix the validator/runtime error before starting pipeline work.',
    )];
  }

  const blocked = isBlocking(allFindings);
  const result = { blocked, project, timestamp, findings: allFindings };

  // Write artifacts (non-critical — failure to write never blocks the pipeline)
  writeArtifacts(config, result, agentPrompt);

  if (blocked) {
    log('ERROR', `[arch-validator] Architecture validation BLOCKED — ${allFindings.filter(f => f.severity === SEVERITY.BLOCKING).length} blocking finding(s)`);
    for (const f of allFindings.filter(f => f.severity === SEVERITY.BLOCKING)) {
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
  return buildArchitectureValidatorControlResult(config, result, opts);
}
