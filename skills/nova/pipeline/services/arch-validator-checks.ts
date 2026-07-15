import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// services/arch-validator-checks.ts — deterministic architecture validation checks

import fs from 'fs';
import path from 'path';
import { gateInstructionsPath, moduleBusterMdPath, modulePath } from '../core/paths.ts';
const PROGRESS_FILE_LABEL = 'progress.json';
const MODULE_DEFAULT_STAGES = Object.freeze(['forge', 'buster']);

function objectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function arrayValue(value) {
  return Array.isArray(value) ? value : [];
}

function progressFilePath(config) {
  return selectDefinedValue(() => (config.paths?.progress_file), () => (PROGRESS_FILE_LABEL));
}

function progressModules(progress) {
  return objectRecord(progress?.modules);
}

function progressGates(progress) {
  return objectRecord(progress?.gates);
}

function moduleDependsOn(mod) {
  return arrayValue(mod?.depends_on);
}

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
  DOMAIN_MODEL:     'domain_model',
  INTEGRATION_BOUNDARY: 'integration_boundary',
  TEST_SPEC:        'test_spec',
  CONFIG:           'config',
};

// ── Stable finding codes ──────────────────────────────────────────────────────

export const FINDING_CODES = {
  // progress.json structure
  PROGRESS_MISSING_FIELD:        'PROGRESS_MISSING_FIELD',
  PROGRESS_EMPTY_EXEC_ORDER:     'PROGRESS_EMPTY_EXEC_ORDER',
  EXEC_ORDER_ENTRY_INVALID:      'EXEC_ORDER_ENTRY_INVALID',
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
  AGENT_JUDGMENT_EXECUTION_ERROR:'AGENT_JUDGMENT_EXECUTION_ERROR',
  AGENT_JUDGMENT_PARSE_ERROR:    'AGENT_JUDGMENT_PARSE_ERROR',
  // internal
  VALIDATOR_INTERNAL_ERROR:      'VALIDATOR_INTERNAL_ERROR',
};

// ── Finding factory ───────────────────────────────────────────────────────────

export function makeFinding(id, severity, scope, filePaths, explanation, remediation) {
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

function summarizeProgressValue(value) {
  if (value === null) return 'null';
  const type = Array.isArray(value) ? 'array' : typeof value;
  let preview;
  try {
    preview = JSON.stringify(value);
  } catch (_error) {
    preview = String(value);
  }
  if (preview === undefined) preview = String(value);
  if (preview.length > 80) preview = `${preview.slice(0, 77)}...`;
  return `${type} ${preview}`;
}

export function checkProgress(progress, config) {
  const findings = [];
  const progressFile = progressFilePath(config);

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

  if (selectTruthyValue(() => (!progress.modules), () => (typeof progress.modules !== 'object'))) {
    findings.push(makeFinding(
      FINDING_CODES.PROGRESS_MISSING_FIELD, SEVERITY.BLOCKING, SCOPE.PROJECT,
      [progressFile],
      'progress.json is missing required field: modules',
      'Add "modules" object to progress.json.',
    ));
    return findings;
  }

  const gates = progressGates(progress);

  for (const [index, stepId] of progress.execution_order.entries()) {
    if (selectTruthyValue(() => (typeof stepId !== 'string'), () => (stepId.trim() === ''))) {
      findings.push(makeFinding(
        FINDING_CODES.EXEC_ORDER_ENTRY_INVALID, SEVERITY.BLOCKING, SCOPE.PROJECT,
        [progressFile],
        `progress.json execution_order[${index}] must be a non-empty string; received ${summarizeProgressValue(stepId)}`,
        `Set execution_order[${index}] to a module id, gate:<id>, or validator:<id> string.`,
      ));
      continue;
    }

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
    } else if (stepId.startsWith('validator:')) {
      continue;
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

  if (progress.validators !== undefined) {
    if (selectTruthyValue(() => (selectTruthyValue(() => (!progress.validators), () => (typeof progress.validators !== 'object'))), () => (Array.isArray(progress.validators)))) {
      findings.push(makeFinding(
        FINDING_CODES.PROGRESS_MISSING_FIELD, SEVERITY.BLOCKING, SCOPE.PROJECT,
        [progressFile],
        'progress.json validators must be an object when provided',
        'Use validators.schedule for on-demand validator stages.',
      ));
    } else if (progress.validators.schedule !== undefined && !Array.isArray(progress.validators.schedule)) {
      findings.push(makeFinding(
        FINDING_CODES.PROGRESS_MISSING_FIELD, SEVERITY.BLOCKING, SCOPE.PROJECT,
        [progressFile],
        'progress.json validators.schedule must be an array when provided',
        'Set validators.schedule to an array of validator schedule entries.',
      ));
    } else if (Array.isArray(progress.validators.schedule)) {
      for (const [index, entry] of progress.validators.schedule.entries()) {
        const stage = selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (selectTruthyValue(() => (entry?.stage), () => (entry?.validator))), () => (entry?.validator_stage))), () => (entry?.id))), () => (null));
        const after = selectTruthyValue(() => (selectTruthyValue(() => (entry?.after), () => (entry?.after_step))), () => (null));
        const before = selectTruthyValue(() => (selectTruthyValue(() => (entry?.before), () => (entry?.before_step))), () => (null));
        if (selectTruthyValue(() => (selectTruthyValue(() => (!stage), () => (typeof stage !== 'string'))), () => (!stage.startsWith('validator:')))) {
          findings.push(makeFinding(
            FINDING_CODES.PROGRESS_MISSING_FIELD, SEVERITY.BLOCKING, SCOPE.PROJECT,
            [progressFile],
            `validators.schedule[${index}] is missing a validator stage id`,
            `Set validators.schedule[${index}].stage to a value such as "validator:full_lint".`,
          ));
        }
        if (after && typeof after === 'string') {
          const ref = after.startsWith('module:') ? after.slice('module:'.length) : after;
          if (!after.startsWith('gate:') && !progress.modules?.[ref]) {
            findings.push(makeFinding(
              FINDING_CODES.EXEC_ORDER_MODULE_UNDEFINED, SEVERITY.BLOCKING, SCOPE.MODULE,
              [progressFile],
              `validators.schedule[${index}] references unknown after module '${after}'`,
              `Reference an existing module id or use gate:<id> for gate-scoped schedules.`,
            ));
          }
          if (after.startsWith('gate:') && !gates[after.slice('gate:'.length)]) {
            findings.push(makeFinding(
              FINDING_CODES.EXEC_ORDER_GATE_UNDEFINED, SEVERITY.BLOCKING, SCOPE.GATE,
              [progressFile],
              `validators.schedule[${index}] references unknown after gate '${after}'`,
              `Reference an existing gate id such as gate:review.`,
            ));
          }
        }
        if (before && typeof before === 'string' && before.startsWith('gate:') && !gates[before.slice('gate:'.length)]) {
          findings.push(makeFinding(
            FINDING_CODES.EXEC_ORDER_GATE_UNDEFINED, SEVERITY.BLOCKING, SCOPE.GATE,
            [progressFile],
            `validators.schedule[${index}] references unknown before gate '${before}'`,
            `Reference an existing gate id such as gate:review.`,
          ));
        }
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

export function checkModuleFiles(progress, config) {
  const findings = [];
  const modulesDir = config.paths?.modules_dir;
  if (!modulesDir) return findings;

  for (const [modId, mod] of Object.entries(progressModules(progress))) {
    if (!mod.dir) continue; // already flagged by checkProgress

    let modDir;
    try {
      modDir = modulePath(config, mod.dir);
    } catch (error) {
      findings.push(makeFinding(
        FINDING_CODES.MODULE_MISSING_DIR, SEVERITY.BLOCKING, SCOPE.MODULE,
        [progressFilePath(config)],
        `Module '${modId}' has unsafe dir '${mod.dir}': ${error.message}`,
        `Set modules.${modId}.dir to a relative path inside the modules root.`,
      ));
      continue;
    }
    const stages = Array.isArray(mod.stages) ? mod.stages : [...MODULE_DEFAULT_STAGES];

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
      const busterPath = moduleBusterMdPath(config, mod.dir);
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
      } catch (_error) {
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

export function checkTestSpec(modId, testSpec, relTestSpecPath) {
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

export function checkGateFiles(progress, config) {
  const findings = [];

  for (const [gateId, gate] of Object.entries(progressGates(progress))) {
    if (gate.instructions_file) {
      let instrPath;
      try {
        instrPath = gateInstructionsPath(config, gate);
      } catch (error) {
        findings.push(makeFinding(
          FINDING_CODES.GATE_INSTRUCTIONS_MISSING, SEVERITY.BLOCKING, SCOPE.GATE,
          [progressFilePath(config)],
          `Gate '${gateId}' has unsafe instructions_file '${gate.instructions_file}': ${error.message}`,
          `Set gate '${gateId}' instructions_file to a relative path inside .swarm with no parent traversal.`,
        ));
        continue;
      }
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

export function checkDependencyGraph(progress, config) {
  const findings = [];
  const progressFile = progressFilePath(config);
  const knownModules = new Set(Object.keys(progressModules(progress)));
  const knownGates = progressGates(progress);

  for (const [modId, mod] of Object.entries(progressModules(progress))) {
    for (const dep of moduleDependsOn(mod)) {
      if (typeof dep === 'string' && dep.startsWith('gate:')) {
        const gateId = dep.slice('gate:'.length);
        if (!knownGates[gateId]) {
          findings.push(makeFinding(
            FINDING_CODES.DEP_UNDEFINED_REF, SEVERITY.BLOCKING, SCOPE.GATE,
            [progressFile],
            `Module '${modId}' depends on gate '${gateId}' which is not defined in gates`,
            `Add gate '${gateId}' to progress.json gates, or remove '${dep}' from '${modId}'.depends_on.`,
          ));
        }
      } else if (dep === modId) {
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

export function checkModelConfig(config, progress = null) {
  const findings = [];
  const archModel = progress?.arch_validation?.model;

  if (archModel !== undefined && archModel !== null) {
    const modelStr = typeof archModel === 'string' ? archModel
      : (typeof archModel === 'object' ? archModel?.model : null);
    if (!modelStr) {
      findings.push(makeFinding(
        FINDING_CODES.ARCH_VALIDATOR_MODEL_MALFORMED, SEVERITY.WARN, SCOPE.CONFIG,
        [],
        'progress.arch_validation.model is configured but missing a model string',
        'Set progress.arch_validation.model to a model string (e.g. "openai/gpt-5.4") or rely on progress.defaults.models.arch_validator / swarm.config.json fallback_model.',
      ));
    }
  }

  if (config.models !== undefined) {
    findings.push(makeFinding(
      FINDING_CODES.ARCH_VALIDATOR_MODEL_MALFORMED, SEVERITY.WARN, SCOPE.CONFIG,
      [],
      'swarm.config.json contains deprecated role-specific models',
      'Move role-specific model defaults to progress.defaults.models and keep only fallback_model in swarm.config.json.',
    ));
  }

  if (progress) {
    for (const [modId, mod] of Object.entries(progressModules(progress))) {
      if (mod.forge_model !== undefined && mod.forge_model !== null) {
        if (selectTruthyValue(() => (typeof mod.forge_model !== 'string'), () => (!mod.forge_model.trim()))) {
          findings.push(makeFinding(
            FINDING_CODES.MODULE_FORGE_MODEL_MALFORMED, SEVERITY.WARN, SCOPE.CONFIG,
            [],
            `Module '${modId}' has forge_model set but it is not a non-empty string`,
            `Set modules.${modId}.forge_model to a valid model string (e.g. "anthropic/claude-sonnet-4-6") or remove it.`,
          ));
        }
      }
    }

    for (const [gateId, gate] of Object.entries(progressGates(progress))) {
      if (gate.model !== undefined && gate.model !== null) {
        if (selectTruthyValue(() => (typeof gate.model !== 'string'), () => (!gate.model.trim()))) {
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


export function runDeterministicArchitectureChecks(progress, config) {
  return [
    ...checkProgress(progress, config),
    ...checkModuleFiles(progress, config),
    ...checkGateFiles(progress, config),
    ...checkDependencyGraph(progress, config),
    ...checkModelConfig(config, progress),
  ];
}
