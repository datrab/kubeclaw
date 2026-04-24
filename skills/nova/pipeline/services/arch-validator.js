// services/arch-validator.js — Pre-pipeline architecture validation
//
// Runs before the first module executes. Combines deterministic structural
// checks with optional agent-level judgment to identify project definition
// defects that would cause wasted execution time or silent failures.
//
// Two-phase execution:
//   Phase 1 — Deterministic checks: file presence, progress.json coherence,
//              dependency graph, gate references, test-spec validity, model config.
//   Phase 2 — Agent judgment:      architecture coherence, gap/overlap detection,
//              dependency ordering analysis (skipped when gateway unavailable).
//
// Blocking policy:
//   severity='blocking' → pipeline must halt before module 01
//   severity='error'|'warn'|'info' → proceed, log findings clearly
//
// Default model: openai/gpt-5.4 (thinking: xhigh)
// Configurable via: config.models.arch_validator or progress.defaults.models.arch_validator
//
// Artifact output under: config._logDir/architecture-validator/
//   results.json        — machine-readable findings
//   summary.md          — human-readable report
//   validator-prompt.md — redacted prompt metadata for agent judgment run

import fs from 'fs';
import path from 'path';
import { log } from '../core/logger.js';
import { swarmRoot } from '../core/paths.js';
import { getRunId } from '../core/runtime.js';
import { gatewayInvoke } from '../../../common/pipeline/integrations/gateway.js';
import { resolvePolicy, logEffectivePolicy } from '../core/config.js';
import { writeRedactedPromptArtifact } from '../../../common/pipeline/redaction.js';

// ── Severity levels ───────────────────────────────────────────────────────────

export const SEVERITY = {
  INFO:     'info',
  WARN:     'warn',
  ERROR:    'error',
  BLOCKING: 'blocking',
};

// ── Scope labels ──────────────────────────────────────────────────────────────

export const SCOPE = {
  PROJECT:          'project',
  MODULE:           'module',
  GATE:             'gate',
  DEPENDENCY_GRAPH: 'dependency_graph',
  TEST_SPEC:        'test_spec',
  CONFIG:           'config',
};

// ── Stable finding codes ──────────────────────────────────────────────────────

export const FINDING_CODES = {
  // progress.json structure
  PROGRESS_MISSING_FIELD:        'PROGRESS_MISSING_FIELD',
  PROGRESS_EMPTY_EXEC_ORDER:     'PROGRESS_EMPTY_EXEC_ORDER',
  EXEC_ORDER_MODULE_UNDEFINED:   'EXEC_ORDER_MODULE_UNDEFINED',
  EXEC_ORDER_GATE_UNDEFINED:     'EXEC_ORDER_GATE_UNDEFINED',
  MODULE_MISSING_DIR:            'MODULE_MISSING_DIR',
  GATE_MISSING_TYPE:             'GATE_MISSING_TYPE',
  // module files
  MODULE_FORGE_MISSING:          'MODULE_FORGE_MISSING',
  MODULE_BUSTER_MISSING:         'MODULE_BUSTER_MISSING',
  MODULE_TEST_SPEC_INVALID_JSON: 'MODULE_TEST_SPEC_INVALID_JSON',
  // test-spec
  TEST_SPEC_MISSING_FIELD:       'TEST_SPEC_MISSING_FIELD',
  TEST_SPEC_MODULE_ID_MISMATCH:  'TEST_SPEC_MODULE_ID_MISMATCH',
  // gate references
  GATE_INSTRUCTIONS_MISSING:     'GATE_INSTRUCTIONS_MISSING',
  GATE_MISSING_REVIEW_NAME:      'GATE_MISSING_REVIEW_NAME',
  // dependency graph
  DEP_UNDEFINED_REF:             'DEP_UNDEFINED_REF',
  DEP_SELF_REFERENCE:            'DEP_SELF_REFERENCE',
  // config
  ARCH_VALIDATOR_MODEL_MALFORMED: 'ARCH_VALIDATOR_MODEL_MALFORMED',
  MODULE_FORGE_MODEL_MALFORMED:   'MODULE_FORGE_MODEL_MALFORMED',
  GATE_MODEL_MALFORMED:           'GATE_MODEL_MALFORMED',
  // agent judgment
  AGENT_JUDGMENT_SKIPPED:        'AGENT_JUDGMENT_SKIPPED',
  AGENT_JUDGMENT_PARSE_ERROR:    'AGENT_JUDGMENT_PARSE_ERROR',
  // internal
  VALIDATOR_INTERNAL_ERROR:      'VALIDATOR_INTERNAL_ERROR',
};

// ── Finding factory ───────────────────────────────────────────────────────────

function makeFinding(id, severity, scope, filePaths, explanation, remediation) {
  return {
    id,
    severity,
    scope,
    paths: Array.isArray(filePaths) ? filePaths : (filePaths ? [filePaths] : []),
    explanation,
    remediation,
  };
}

// ── Deterministic check: progress.json structure ──────────────────────────────

function checkProgress(progress, config) {
  const findings = [];
  const progressFile = config.paths?.progress_file || 'progress.json';

  if (!progress.project) {
    findings.push(makeFinding(
      FINDING_CODES.PROGRESS_MISSING_FIELD, SEVERITY.BLOCKING, SCOPE.PROJECT,
      [progressFile],
      'progress.json is missing required field: project',
      'Add "project" field to progress.json matching the project name.',
    ));
  }

  if (!Array.isArray(progress.execution_order)) {
    findings.push(makeFinding(
      FINDING_CODES.PROGRESS_MISSING_FIELD, SEVERITY.BLOCKING, SCOPE.PROJECT,
      [progressFile],
      'progress.json is missing required field: execution_order (must be an array)',
      'Add "execution_order" array to progress.json listing module IDs and gate references.',
    ));
    return findings;
  }

  if (progress.execution_order.length === 0) {
    findings.push(makeFinding(
      FINDING_CODES.PROGRESS_EMPTY_EXEC_ORDER, SEVERITY.BLOCKING, SCOPE.PROJECT,
      [progressFile],
      'progress.json execution_order is empty — nothing to execute',
      'Add at least one module ID to execution_order.',
    ));
  }

  if (!progress.modules || typeof progress.modules !== 'object') {
    findings.push(makeFinding(
      FINDING_CODES.PROGRESS_MISSING_FIELD, SEVERITY.BLOCKING, SCOPE.PROJECT,
      [progressFile],
      'progress.json is missing required field: modules',
      'Add "modules" object to progress.json.',
    ));
    return findings;
  }

  const gates = progress.gates || {};

  for (const stepId of progress.execution_order) {
    if (stepId.startsWith('gate:')) {
      const gateId = stepId.replace('gate:', '');
      if (!gates[gateId]) {
        findings.push(makeFinding(
          FINDING_CODES.EXEC_ORDER_GATE_UNDEFINED, SEVERITY.BLOCKING, SCOPE.GATE,
          [progressFile],
          `execution_order references gate '${gateId}' but it is not defined in progress.json gates`,
          `Add gate definition for '${gateId}' to progress.json, or remove it from execution_order.`,
        ));
      }
    } else {
      if (!progress.modules[stepId]) {
        findings.push(makeFinding(
          FINDING_CODES.EXEC_ORDER_MODULE_UNDEFINED, SEVERITY.BLOCKING, SCOPE.MODULE,
          [progressFile],
          `execution_order references module '${stepId}' but it is not defined in progress.json modules`,
          `Add module definition for '${stepId}' to progress.json, or remove it from execution_order.`,
        ));
      }
    }
  }

  for (const [modId, mod] of Object.entries(progress.modules)) {
    if (!mod.dir) {
      findings.push(makeFinding(
        FINDING_CODES.MODULE_MISSING_DIR, SEVERITY.BLOCKING, SCOPE.MODULE,
        [progressFile],
        `Module '${modId}' is missing required field: dir`,
        `Add "dir" field to module '${modId}' in progress.json.`,
      ));
    }
  }

  for (const [gateId, gate] of Object.entries(gates)) {
    if (!gate.type) {
      findings.push(makeFinding(
        FINDING_CODES.GATE_MISSING_TYPE, SEVERITY.BLOCKING, SCOPE.GATE,
        [progressFile],
        `Gate '${gateId}' is missing required field: type`,
        `Add "type" field ('buster' or 'review') to gate '${gateId}' in progress.json.`,
      ));
    }
    if (gate.type === 'review' && !gate.review_name) {
      findings.push(makeFinding(
        FINDING_CODES.GATE_MISSING_REVIEW_NAME, SEVERITY.BLOCKING, SCOPE.GATE,
        [progressFile],
        `Review gate '${gateId}' is missing required field: review_name`,
        `Add "review_name" to gate '${gateId}' in progress.json.`,
      ));
    }
  }

  return findings;
}

// ── Deterministic check: module file presence ─────────────────────────────────

function checkModuleFiles(progress, config) {
  const findings = [];
  const modulesDir = config.paths?.modules_dir;
  if (!modulesDir) return findings;

  for (const [modId, mod] of Object.entries(progress.modules || {})) {
    if (!mod.dir) continue; // already flagged by checkProgress

    const modDir = path.join(modulesDir, mod.dir);
    const stages = Array.isArray(mod.stages) ? mod.stages : ['forge', 'buster'];

    // FORGE.md — blocking: without it Forge cannot be instructed
    const forgePath = path.join(modDir, 'FORGE.md');
    if (!fs.existsSync(forgePath)) {
      findings.push(makeFinding(
        FINDING_CODES.MODULE_FORGE_MISSING, SEVERITY.BLOCKING, SCOPE.MODULE,
        [path.join('modules', mod.dir, 'FORGE.md')],
        `Module '${modId}' is missing FORGE.md`,
        `Create FORGE.md in modules/${mod.dir}/ with Forge implementation instructions.`,
      ));
    }

    // BUSTER.md — warn: missing means Buster has no test instructions
    if (stages.includes('buster')) {
      const busterPath = path.join(modDir, 'BUSTER.md');
      if (!fs.existsSync(busterPath)) {
        findings.push(makeFinding(
          FINDING_CODES.MODULE_BUSTER_MISSING, SEVERITY.WARN, SCOPE.MODULE,
          [path.join('modules', mod.dir, 'BUSTER.md')],
          `Module '${modId}' has buster stage but is missing BUSTER.md`,
          `Create BUSTER.md in modules/${mod.dir}/ with Buster test instructions.`,
        ));
      }
    }

    // test-spec.json — if present, validate structure
    const testSpecPath = path.join(modDir, 'test-spec.json');
    if (fs.existsSync(testSpecPath)) {
      let ts;
      try {
        ts = JSON.parse(fs.readFileSync(testSpecPath, 'utf8'));
      } catch {
        findings.push(makeFinding(
          FINDING_CODES.MODULE_TEST_SPEC_INVALID_JSON, SEVERITY.BLOCKING, SCOPE.TEST_SPEC,
          [path.join('modules', mod.dir, 'test-spec.json')],
          `Module '${modId}' has invalid JSON in test-spec.json`,
          `Fix the JSON syntax in modules/${mod.dir}/test-spec.json.`,
        ));
        continue;
      }

      findings.push(...checkTestSpec(modId, ts, path.join('modules', mod.dir, 'test-spec.json')));
    }
  }

  return findings;
}

// ── Deterministic check: test-spec structure ──────────────────────────────────

function checkTestSpec(modId, testSpec, relTestSpecPath) {
  const findings = [];

  if (!testSpec.module_id) {
    findings.push(makeFinding(
      FINDING_CODES.TEST_SPEC_MISSING_FIELD, SEVERITY.WARN, SCOPE.TEST_SPEC,
      [relTestSpecPath],
      `test-spec.json for module '${modId}' is missing module_id field`,
      `Add "module_id": "${modId}" to test-spec.json.`,
    ));
  } else if (testSpec.module_id !== modId) {
    findings.push(makeFinding(
      FINDING_CODES.TEST_SPEC_MODULE_ID_MISMATCH, SEVERITY.WARN, SCOPE.TEST_SPEC,
      [relTestSpecPath],
      `test-spec.json module_id '${testSpec.module_id}' does not match module ID '${modId}'`,
      `Update module_id in test-spec.json to "${modId}".`,
    ));
  }

  if (!testSpec.focus && !testSpec.required_checks) {
    findings.push(makeFinding(
      FINDING_CODES.TEST_SPEC_MISSING_FIELD, SEVERITY.WARN, SCOPE.TEST_SPEC,
      [relTestSpecPath],
      `test-spec.json for module '${modId}' has neither 'focus' nor 'required_checks'`,
      `Add at least one of 'focus' (array) or 'required_checks' (array) to test-spec.json.`,
    ));
  }

  return findings;
}

// ── Deterministic check: gate reference alignment ─────────────────────────────

function checkGateFiles(progress, config) {
  const findings = [];
  const swarmDir = swarmRoot(config);

  for (const [gateId, gate] of Object.entries(progress.gates || {})) {
    if (gate.instructions_file) {
      const instrPath = path.isAbsolute(gate.instructions_file)
        ? gate.instructions_file
        : path.join(swarmDir, gate.instructions_file);
      if (!fs.existsSync(instrPath)) {
        findings.push(makeFinding(
          FINDING_CODES.GATE_INSTRUCTIONS_MISSING, SEVERITY.BLOCKING, SCOPE.GATE,
          [gate.instructions_file],
          `Gate '${gateId}' references instructions_file '${gate.instructions_file}' but the file does not exist`,
          `Create the instructions file at '${gate.instructions_file}', or correct the path in progress.json.`,
        ));
      }
    }
  }

  return findings;
}

// ── Deterministic check: dependency graph consistency ─────────────────────────

function checkDependencyGraph(progress, config) {
  const findings = [];
  const progressFile = config.paths?.progress_file || 'progress.json';
  const knownModules = new Set(Object.keys(progress.modules || {}));

  for (const [modId, mod] of Object.entries(progress.modules || {})) {
    for (const dep of (mod.depends_on || [])) {
      if (dep === modId) {
        findings.push(makeFinding(
          FINDING_CODES.DEP_SELF_REFERENCE, SEVERITY.BLOCKING, SCOPE.DEPENDENCY_GRAPH,
          [progressFile],
          `Module '${modId}' depends on itself`,
          `Remove '${modId}' from its own depends_on list.`,
        ));
      } else if (!knownModules.has(dep)) {
        findings.push(makeFinding(
          FINDING_CODES.DEP_UNDEFINED_REF, SEVERITY.BLOCKING, SCOPE.DEPENDENCY_GRAPH,
          [progressFile],
          `Module '${modId}' depends on '${dep}' which is not defined in modules`,
          `Add module '${dep}' to progress.json modules, or remove it from '${modId}'.depends_on.`,
        ));
      }
    }
  }

  return findings;
}

// ── Deterministic check: model config coherence ───────────────────────────────

function checkModelConfig(config, progress = null) {
  const findings = [];
  const archModel = config.models?.arch_validator;

  if (archModel !== undefined && archModel !== null) {
    const modelStr = typeof archModel === 'string' ? archModel
      : (typeof archModel === 'object' ? archModel?.model : null);
    if (!modelStr) {
      findings.push(makeFinding(
        FINDING_CODES.ARCH_VALIDATOR_MODEL_MALFORMED, SEVERITY.WARN, SCOPE.CONFIG,
        [],
        'models.arch_validator is configured but missing a model string',
        'Set models.arch_validator to a model string (e.g. "openai/gpt-5.4") or an object with a "model" field.',
      ));
    }
  }

  if (progress) {
    for (const [modId, mod] of Object.entries(progress.modules || {})) {
      if (mod.forge_model !== undefined && mod.forge_model !== null) {
        if (typeof mod.forge_model !== 'string' || !mod.forge_model.trim()) {
          findings.push(makeFinding(
            FINDING_CODES.MODULE_FORGE_MODEL_MALFORMED, SEVERITY.WARN, SCOPE.CONFIG,
            [],
            `Module '${modId}' has forge_model set but it is not a non-empty string`,
            `Set modules.${modId}.forge_model to a valid model string (e.g. "anthropic/claude-sonnet-4-6") or remove it.`,
          ));
        }
      }
    }

    for (const [gateId, gate] of Object.entries(progress.gates || {})) {
      if (gate.model !== undefined && gate.model !== null) {
        if (typeof gate.model !== 'string' || !gate.model.trim()) {
          findings.push(makeFinding(
            FINDING_CODES.GATE_MODEL_MALFORMED, SEVERITY.WARN, SCOPE.CONFIG,
            [],
            `Gate '${gateId}' has model set but it is not a non-empty string`,
            `Set gates.${gateId}.model to a valid model string (e.g. "anthropic/claude-sonnet-4-6") or remove it.`,
          ));
        }
      }
    }
  }

  return findings;
}

// ── Agent-based judgment ──────────────────────────────────────────────────────

export function buildValidatorPrompt(progress, config, deterministicFindings) {
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
Respond with a JSON array of findings. Each finding must have:
- id: string (stable code like OVERLAP_DETECTED, COVERAGE_GAP, DEPENDENCY_ORDER_VIOLATION, etc.)
- severity: "info" | "warn" | "error" | "blocking"
- scope: "project" | "module" | "gate" | "dependency_graph" | "test_spec" | "config"
- paths: [] (empty array if not file-specific)
- explanation: string (one to two sentences)
- remediation: string (one actionable fix)

If you find no issues, respond with an empty array: []

Respond ONLY with the JSON array, no other text.`;
}

async function runAgentJudgment(progress, config, deterministicFindings) {
  // Skip if disabled via test override
  if (config._testOverrides?.archValidator?.agentEnabled === false) {
    log('INFO', '[arch-validator] Agent judgment skipped (test override)');
    return [];
  }

  // Skip if disabled via project config
  if (config.arch_validation?.agent_enabled === false) {
    log('INFO', '[arch-validator] Agent judgment disabled by config');
    return [];
  }

  const prompt = buildValidatorPrompt(progress, config, deterministicFindings);
  const policy = resolvePolicy(config, progress, 'arch_validator', { dispatchPath: 'subagent' });
  logEffectivePolicy(config, { scope: 'arch_validator', agent: 'arch_validator', ...policy });
  const { model, thinking } = policy;

  log('INFO', `[arch-validator] Running agent judgment — model: ${model}`);
  try {
    const result = await gatewayInvoke('complete', {
      model,
      thinking,
      prompt,
      system: 'You are an architecture validation agent. Respond only with a valid JSON array of findings.',
    }, 120000);

    const text = result?.content || result?.text || result?.choices?.[0]?.message?.content || result?.raw || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      log('WARN', '[arch-validator] Agent response did not contain a JSON array');
      return [makeFinding(
        FINDING_CODES.AGENT_JUDGMENT_PARSE_ERROR, SEVERITY.WARN, SCOPE.PROJECT,
        [],
        'Architecture validator agent response could not be parsed as a JSON findings array',
        'Review agent judgment output manually in the validator artifacts.',
      )];
    }

    let agentFindings;
    try {
      agentFindings = JSON.parse(jsonMatch[0]);
    } catch {
      return [makeFinding(
        FINDING_CODES.AGENT_JUDGMENT_PARSE_ERROR, SEVERITY.WARN, SCOPE.PROJECT,
        [],
        'Architecture validator agent returned malformed JSON',
        'Review validator-prompt.md and agent response in architecture-validator/ artifacts.',
      )];
    }

    if (!Array.isArray(agentFindings)) return [];
    return agentFindings.filter(f => f && typeof f.id === 'string');
  } catch (e) {
    log('WARN', `[arch-validator] Agent judgment failed: ${e.message} — skipping`);
    return [makeFinding(
      FINDING_CODES.AGENT_JUDGMENT_SKIPPED, SEVERITY.WARN, SCOPE.PROJECT,
      [],
      `Architecture validator agent call failed: ${e.message}`,
      'Verify gateway is reachable and arch_validator model is configured. Proceed manually if blocked.',
    )];
  }
}

// ── Artifact output ───────────────────────────────────────────────────────────

export function archValidatorLogDir(config) {
  if (!config._logDir) return null;
  return path.join(config._logDir, 'architecture-validator');
}

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
  const runId = result?.run_id || getRunId(config) || config?._runId || config?.run_id || null;
  const project = result?.project || config?.project || 'unknown';
  const timestamp = result?.timestamp || new Date().toISOString();
  const executionFailed = opts.executionFailed === true;
  const contractInvalid = opts.contractInvalid === true;
  const blocked = executionFailed || contractInvalid || result?.blocked === true;
  const counts = countFindings(findings);
  const stageId = opts?.input?.ids?.stageId || opts?.stageId || 'validator:architecture';
  const validatorName = opts?.input?.ids?.validatorName || opts?.validatorName || 'architecture';
  const error = opts?.error || null;
  const artifactPaths = buildArtifactPaths(config);
  const summary = buildControlSummary({ blocked, findings, executionFailed, contractInvalid, error });

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
          summary,
          metadata: {
            blocked,
            execution_failed: executionFailed,
            contract_invalid: contractInvalid,
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
  return buildArchitectureValidatorControlResult(config, result, opts);
}

export function extractArchValidatorReport(result, config) {
  if (isArchitectureValidatorControlResult(result)) {
    const metadata = result?.diagnostics?.metadata || result?.diagnostics?.typed?.validator?.metadata || {};
    return {
      blocked: result?.nextAction === 'block' || metadata.blocked === true,
      findings: Array.isArray(metadata.raw_findings) ? metadata.raw_findings : [],
      timestamp: metadata.timestamp || new Date().toISOString(),
      project: metadata.project || config?.project || 'unknown',
      run_id: metadata.run_id || getRunId(config) || config?._runId || config?.run_id || null,
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
    run_id: result?.run_id || getRunId(config) || config?._runId || config?.run_id || null,
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
 * Never throws. Internal errors are captured as WARN-severity findings.
 *
 * @param {object} config   - Pipeline config (with paths, models, _logDir, _testOverrides)
 * @param {object} progress - Loaded progress.json object
 * @returns {Promise<{blocked: boolean, findings: object[], timestamp: string, project: string}>}
 */
export async function runArchValidator(config, progress) {
  const timestamp = new Date().toISOString();
  const project = progress?.project || config?.project || 'unknown';

  log('STEP', '[arch-validator] Running pre-pipeline architecture validation...');

  let allFindings = [];
  let agentPrompt = null;

  try {
    // Phase 1: Deterministic structural checks
    const deterministicFindings = [
      ...checkProgress(progress, config),
      ...checkModuleFiles(progress, config),
      ...checkGateFiles(progress, config),
      ...checkDependencyGraph(progress, config),
      ...checkModelConfig(config, progress),
    ];

    // Phase 2: Agent judgment (skipped gracefully when unavailable or disabled)
    agentPrompt = buildValidatorPrompt(progress, config, deterministicFindings);
    const agentFindings = await runAgentJudgment(progress, config, deterministicFindings);

    allFindings = [...deterministicFindings, ...agentFindings];
  } catch (e) {
    log('WARN', `[arch-validator] Unexpected error during validation: ${e.message}`);
    allFindings = [makeFinding(
      FINDING_CODES.VALIDATOR_INTERNAL_ERROR, SEVERITY.WARN, SCOPE.PROJECT,
      [],
      `Architecture validator encountered an internal error: ${e.message}`,
      'Review validator logs. This is a non-blocking internal error in the validator itself.',
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
  const result = await runArchValidator(config, progress);
  return buildArchitectureValidatorControlResult(config, result, opts);
}
