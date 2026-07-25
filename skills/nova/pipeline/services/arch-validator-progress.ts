import { FINDING_CODES, firstTruthy, makeFinding, SCOPE, SEVERITY } from './arch-validator-values.ts';

type AnyRecord = Record<string, any>;
const PROGRESS_FILE_LABEL = 'progress.json';

function progressFilePath(config: any) {
  return config.paths?.progress_file ?? PROGRESS_FILE_LABEL;
}

function summarizeProgressValue(value: any) {
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

function requiredStructureFindings(progress: any, progressFile: string) {
  const findings: any[] = [];
  if (!progress.project) {
    findings.push(makeFinding(
      FINDING_CODES.PROGRESS_MISSING_FIELD,
      SEVERITY.BLOCKING,
      SCOPE.PROJECT,
      [progressFile],
      'progress.json is missing required field: project',
      'Add "project" field to progress.json matching the project name.',
    ));
  }
  if (!Array.isArray(progress.execution_order)) {
    findings.push(makeFinding(
      FINDING_CODES.PROGRESS_MISSING_FIELD,
      SEVERITY.BLOCKING,
      SCOPE.PROJECT,
      [progressFile],
      'progress.json is missing required field: execution_order (must be an array)',
      'Add "execution_order" array to progress.json listing module IDs and gate references.',
    ));
  } else if (progress.execution_order.length === 0) {
    findings.push(makeFinding(
      FINDING_CODES.PROGRESS_EMPTY_EXEC_ORDER,
      SEVERITY.BLOCKING,
      SCOPE.PROJECT,
      [progressFile],
      'progress.json execution_order is empty — nothing to execute',
      'Add at least one module ID to execution_order.',
    ));
  }
  if (!progress.modules || typeof progress.modules !== 'object') {
    findings.push(makeFinding(
      FINDING_CODES.PROGRESS_MISSING_FIELD,
      SEVERITY.BLOCKING,
      SCOPE.PROJECT,
      [progressFile],
      'progress.json is missing required field: modules',
      'Add "modules" object to progress.json.',
    ));
  }
  return findings;
}

function executionEntryFinding(progress: any, gates: AnyRecord, stepId: any, index: number, progressFile: string) {
  if (typeof stepId !== 'string' || stepId.trim() === '') {
    return makeFinding(
      FINDING_CODES.EXEC_ORDER_ENTRY_INVALID,
      SEVERITY.BLOCKING,
      SCOPE.PROJECT,
      [progressFile],
      `progress.json execution_order[${index}] must be a non-empty string; received ${summarizeProgressValue(stepId)}`,
      `Set execution_order[${index}] to a module id, gate:<id>, or validator:<id> string.`,
    );
  }
  if (stepId.startsWith('validator:')) return null;
  if (stepId.startsWith('gate:')) {
    const gateId = stepId.slice('gate:'.length);
    if (gates[gateId]) return null;
    return makeFinding(
      FINDING_CODES.EXEC_ORDER_GATE_UNDEFINED,
      SEVERITY.BLOCKING,
      SCOPE.GATE,
      [progressFile],
      `execution_order references gate '${gateId}' but it is not defined in progress.json gates`,
      `Add gate definition for '${gateId}' to progress.json, or remove it from execution_order.`,
    );
  }
  if (progress.modules[stepId]) return null;
  return makeFinding(
    FINDING_CODES.EXEC_ORDER_MODULE_UNDEFINED,
    SEVERITY.BLOCKING,
    SCOPE.MODULE,
    [progressFile],
    `execution_order references module '${stepId}' but it is not defined in progress.json modules`,
    `Add module definition for '${stepId}' to progress.json, or remove it from execution_order.`,
  );
}

function scheduleStage(entry: AnyRecord) {
  return firstTruthy(entry?.stage, entry?.validator, entry?.validator_stage, entry?.id);
}

function scheduleAfterFindings(progress: any, gates: AnyRecord, after: any, index: number, progressFile: string) {
  const findings: any[] = [];
  if (typeof after === 'string' && after.startsWith('gate:') && !gates[after.slice('gate:'.length)]) {
    findings.push(makeFinding(
      FINDING_CODES.EXEC_ORDER_GATE_UNDEFINED,
      SEVERITY.BLOCKING,
      SCOPE.GATE,
      [progressFile],
      `validators.schedule[${index}] references unknown after gate '${after}'`,
      'Reference an existing gate id such as gate:review.',
    ));
  } else if (typeof after === 'string') {
    const moduleId = after.startsWith('module:') ? after.slice('module:'.length) : after;
    if (!progress.modules?.[moduleId]) {
      findings.push(makeFinding(
        FINDING_CODES.EXEC_ORDER_MODULE_UNDEFINED,
        SEVERITY.BLOCKING,
        SCOPE.MODULE,
        [progressFile],
        `validators.schedule[${index}] references unknown after module '${after}'`,
        'Reference an existing module id or use gate:<id> for gate-scoped schedules.',
      ));
    }
  }
  return findings;
}

function scheduleBeforeFindings(gates: AnyRecord, before: any, index: number, progressFile: string) {
  const findings: any[] = [];
  if (typeof before === 'string' && before.startsWith('gate:') && !gates[before.slice('gate:'.length)]) {
    findings.push(makeFinding(
      FINDING_CODES.EXEC_ORDER_GATE_UNDEFINED,
      SEVERITY.BLOCKING,
      SCOPE.GATE,
      [progressFile],
      `validators.schedule[${index}] references unknown before gate '${before}'`,
      'Reference an existing gate id such as gate:review.',
    ));
  }
  return findings;
}

function scheduleEntryFindings(progress: any, gates: AnyRecord, entry: AnyRecord, index: number, progressFile: string) {
  const findings: any[] = [];
  const stage = scheduleStage(entry);
  if (!stage || typeof stage !== 'string' || !stage.startsWith('validator:')) {
    findings.push(makeFinding(
      FINDING_CODES.PROGRESS_MISSING_FIELD,
      SEVERITY.BLOCKING,
      SCOPE.PROJECT,
      [progressFile],
      `validators.schedule[${index}] is missing a validator stage id`,
      `Set validators.schedule[${index}].stage to a value such as "validator:full_lint".`,
    ));
  }
  const after = firstTruthy(entry?.after, entry?.after_step);
  const before = firstTruthy(entry?.before, entry?.before_step);
  return [
    ...findings,
    ...scheduleAfterFindings(progress, gates, after, index, progressFile),
    ...scheduleBeforeFindings(gates, before, index, progressFile),
  ];
}

function validatorScheduleFindings(progress: any, gates: AnyRecord, progressFile: string) {
  if (progress.validators === undefined) return [];
  if (!progress.validators || typeof progress.validators !== 'object' || Array.isArray(progress.validators)) {
    return [makeFinding(
      FINDING_CODES.PROGRESS_MISSING_FIELD,
      SEVERITY.BLOCKING,
      SCOPE.PROJECT,
      [progressFile],
      'progress.json validators must be an object when provided',
      'Use validators.schedule for on-demand validator stages.',
    )];
  }
  if (progress.validators.schedule === undefined) return [];
  if (!Array.isArray(progress.validators.schedule)) {
    return [makeFinding(
      FINDING_CODES.PROGRESS_MISSING_FIELD,
      SEVERITY.BLOCKING,
      SCOPE.PROJECT,
      [progressFile],
      'progress.json validators.schedule must be an array when provided',
      'Set validators.schedule to an array of validator schedule entries.',
    )];
  }
  return progress.validators.schedule.flatMap((entry: AnyRecord, index: number) =>
    scheduleEntryFindings(progress, gates, entry, index, progressFile));
}

function definitionFindings(progress: any, gates: AnyRecord, progressFile: string) {
  const findings: any[] = [];
  for (const [moduleId, module] of Object.entries(progress.modules || {}) as [string, AnyRecord][]) {
    if (!module.dir) {
      findings.push(makeFinding(
        FINDING_CODES.MODULE_MISSING_DIR,
        SEVERITY.BLOCKING,
        SCOPE.MODULE,
        [progressFile],
        `Module '${moduleId}' is missing required field: dir`,
        `Add "dir" field to module '${moduleId}' in progress.json.`,
      ));
    }
  }
  for (const [gateId, gate] of Object.entries(gates) as [string, AnyRecord][]) {
    if (!gate.type) {
      findings.push(makeFinding(
        FINDING_CODES.GATE_MISSING_TYPE,
        SEVERITY.BLOCKING,
        SCOPE.GATE,
        [progressFile],
        `Gate '${gateId}' is missing required field: type`,
        `Add "type" field ('buster' or 'review') to gate '${gateId}' in progress.json.`,
      ));
    }
    if (gate.type === 'review' && !gate.review_name) {
      findings.push(makeFinding(
        FINDING_CODES.GATE_MISSING_REVIEW_NAME,
        SEVERITY.BLOCKING,
        SCOPE.GATE,
        [progressFile],
        `Review gate '${gateId}' is missing required field: review_name`,
        `Add "review_name" to gate '${gateId}' in progress.json.`,
      ));
    }
  }
  return findings;
}

export function checkProgress(progress: any, config: any) {
  const progressFile = progressFilePath(config);
  const required = requiredStructureFindings(progress, progressFile);
  if (!Array.isArray(progress.execution_order) || !progress.modules || typeof progress.modules !== 'object') return required;
  const gates = progress.gates && typeof progress.gates === 'object' ? progress.gates : {};
  const execution = progress.execution_order
    .map((stepId: any, index: number) => executionEntryFinding(progress, gates, stepId, index, progressFile))
    .filter(Boolean);
  return [
    ...required,
    ...execution,
    ...validatorScheduleFindings(progress, gates, progressFile),
    ...definitionFindings(progress, gates, progressFile),
  ];
}
