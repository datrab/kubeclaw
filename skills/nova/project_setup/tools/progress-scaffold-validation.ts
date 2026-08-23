import fs from 'node:fs';
import path from 'node:path';
import { requireExistingSwarmFile, validateTestConfig } from './progress-scaffold-test-config.ts';
import {
  DEFAULTS,
  diagnostic,
  entriesOf,
  errorMessage,
  isPlainObject,
  objectKeys,
  objectOrEmpty,
  omitEmpty,
  relFromRepo,
  SCHEMA,
  TODO_PREFIX,
  VALID_SUITES,
  valueOrDefault,
} from './progress-scaffold-values.ts';
import type { AnyRecord, Context, Diagnostic } from './progress-scaffold-values.ts';

const VALID_STAGES = new Set(['forge', 'buster']);
const VALID_GATE_TYPES = new Set(['review', 'buster', 'approval']);

function safeSegment(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string.`);
  if (!/^[A-Za-z0-9._-]+$/.test(value) || value.includes('..')) throw new Error(`${label} must be a safe path segment: ${value}`);
}

function collectTodos(value: unknown, diagnostics: Diagnostic[], field = '$') {
  if (typeof value === 'string') {
    if (value.startsWith(TODO_PREFIX)) diagnostics.push(diagnostic('form_check', `unresolved TODO at ${field}`, field));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectTodos(entry, diagnostics, `${field}.${index}`));
    return;
  }
  if (isPlainObject(value)) {
    Object.entries(value).forEach(([key, entry]) => collectTodos(entry, diagnostics, `${field}.${key}`));
  }
}

function validateStringArray(value: unknown, allowed: Set<string>, diagnostics: Diagnostic[], field: string) {
  if (!Array.isArray(value)) {
    diagnostics.push(diagnostic('form_check', `${field} must be an array`, field));
    return;
  }
  for (const entry of value) {
    if (typeof entry !== 'string') diagnostics.push(diagnostic('form_check', `${field} entries must be strings`, field));
    else if (!allowed.has(entry)) diagnostics.push(diagnostic('form_check', `${field} contains invalid value '${entry}'`, field));
  }
}

function validateForgeFiles(id: string, module: AnyRecord, moduleDir: string, diagnostics: Diagnostic[]) {
  if (Array.isArray(module.substeps) && module.substeps.length > 0) {
    for (const substep of module.substeps) {
      if (typeof substep !== 'string') {
        diagnostics.push(diagnostic('form_check', `module '${id}' substep must be a string`, `modules.${id}.substeps`));
      } else if (!fs.existsSync(path.join(moduleDir, substep, 'FORGE.md'))) {
        diagnostics.push(diagnostic('strict_content_check', `module '${id}' substep FORGE.md missing: ${substep}/FORGE.md`, `modules.${id}.substeps`));
      }
    }
    return;
  }
  if (!fs.existsSync(path.join(moduleDir, 'FORGE.md'))) {
    diagnostics.push(diagnostic('strict_content_check', `module '${id}' FORGE.md missing`, `modules.${id}.dir`));
  }
}

function validateDependencies(id: string, module: AnyRecord, moduleIds: Set<string>, gateIds: Set<string>, diagnostics: Diagnostic[]) {
  if (!Array.isArray(module.depends_on)) {
    diagnostics.push(diagnostic('form_check', `module '${id}' depends_on must be an array`, `modules.${id}.depends_on`));
    return;
  }
  for (const dependency of module.depends_on) {
    if (typeof dependency !== 'string') {
      diagnostics.push(diagnostic('form_check', `module '${id}' dependency must be a string`, `modules.${id}.depends_on`));
    } else if (dependency.startsWith('gate:') && !gateIds.has(dependency.slice('gate:'.length))) {
      diagnostics.push(diagnostic('strict_content_check', `module '${id}' dependency references unrecognized gate '${dependency}'`, `modules.${id}.depends_on`));
    } else if (!dependency.startsWith('gate:') && !moduleIds.has(dependency)) {
      diagnostics.push(diagnostic('strict_content_check', `module '${id}' dependency references unrecognized module '${dependency}'`, `modules.${id}.depends_on`));
    }
  }
}

function validateModule(id: string, module: AnyRecord, scaffold: AnyRecord, context: Context, diagnostics: Diagnostic[]) {
  try {
    safeSegment(id, `module id '${id}'`);
  } catch (error) {
    diagnostics.push(diagnostic('form_check', errorMessage(error), `modules.${id}`));
  }
  if (!isPlainObject(module)) {
    diagnostics.push(diagnostic('form_check', `module '${id}' must be an object`, `modules.${id}`));
    return;
  }
  if (!module.title) diagnostics.push(diagnostic('form_check', `module '${id}' needs title`, `modules.${id}.title`));
  if (!module.dir) {
    diagnostics.push(diagnostic('form_check', `module '${id}' needs dir`, `modules.${id}.dir`));
  } else {
    const moduleDir = path.join(context.swarmDir, 'modules', module.dir);
    try {
      safeSegment(module.dir, `module '${id}' dir`);
    } catch (error) {
      diagnostics.push(diagnostic('form_check', errorMessage(error), `modules.${id}.dir`));
    }
    if (!fs.existsSync(moduleDir)) {
      diagnostics.push(diagnostic('strict_content_check', `module '${id}' dir does not exist: ${relFromRepo(context.repoRoot, moduleDir)}`, `modules.${id}.dir`));
    }
    validateForgeFiles(id, module, moduleDir, diagnostics);
  }
  validateDependencies(id, module, new Set(objectKeys(scaffold.modules)), new Set(objectKeys(scaffold.gates)), diagnostics);
  if (module.stages !== undefined) validateStringArray(module.stages, VALID_STAGES, diagnostics, `modules.${id}.stages`);
  if (module.test_suites !== undefined) validateStringArray(module.test_suites, VALID_SUITES, diagnostics, `modules.${id}.test_suites`);
  validateTestConfig(module.test_config, module.test_suites || [], context, diagnostics, `modules.${id}.test_config`);
}

function validateModules(scaffold: AnyRecord, context: Context, diagnostics: Diagnostic[]) {
  entriesOf(scaffold.modules).forEach(([id, module]) => validateModule(id, module, scaffold, context, diagnostics));
}

function validateReviewOrBusterGate(id: string, gate: AnyRecord, context: Context, diagnostics: Diagnostic[]) {
  if (gate.type === 'review') {
    if (!gate.review_name) diagnostics.push(diagnostic('form_check', `review gate '${id}' needs review_name`, `gates.${id}.review_name`));
    if (gate.on_fail !== undefined && gate.on_fail !== 'stop') diagnostics.push(diagnostic('form_check', `review gate '${id}' on_fail must be stop`, `gates.${id}.on_fail`));
  }
  if (gate.type === 'buster' && gate.on_fail !== undefined && gate.on_fail !== 'fix_and_retest') {
    diagnostics.push(diagnostic('form_check', `buster gate '${id}' on_fail must be fix_and_retest`, `gates.${id}.on_fail`));
  }
  requireExistingSwarmFile(context, gate.instructions_file, diagnostics, `gates.${id}.instructions_file`);
  if (!gate.output_file) diagnostics.push(diagnostic('form_check', `gate '${id}' needs output_file`, `gates.${id}.output_file`));
  if (gate.type !== 'buster') return;
  validateStringArray(gate.test_suites, VALID_SUITES, diagnostics, `gates.${id}.test_suites`);
  validateTestConfig(gate.test_config, gate.test_suites || [], context, diagnostics, `gates.${id}.test_config`);
}

function validateGate(id: string, gate: AnyRecord, context: Context, diagnostics: Diagnostic[]) {
  try {
    safeSegment(id, `gate id '${id}'`);
  } catch (error) {
    diagnostics.push(diagnostic('form_check', errorMessage(error), `gates.${id}`));
  }
  if (!isPlainObject(gate)) {
    diagnostics.push(diagnostic('form_check', `gate '${id}' must be an object`, `gates.${id}`));
    return;
  }
  if (!VALID_GATE_TYPES.has(gate.type)) diagnostics.push(diagnostic('form_check', `gate '${id}' type is invalid`, `gates.${id}.type`));
  if (!gate.title) diagnostics.push(diagnostic('form_check', `gate '${id}' needs title`, `gates.${id}.title`));
  if (['review', 'buster'].includes(gate.type)) validateReviewOrBusterGate(id, gate, context, diagnostics);
  if (gate.type === 'approval' && !['block', 'continue'].includes(gate.on_timeout)) {
    diagnostics.push(diagnostic('form_check', `approval gate '${id}' on_timeout must be block or continue`, `gates.${id}.on_timeout`));
  }
}

function validateExecutionOrder(scaffold: AnyRecord, diagnostics: Diagnostic[]) {
  if (!Array.isArray(scaffold.execution_order)) {
    diagnostics.push(diagnostic('form_check', 'execution_order must be an array', 'execution_order'));
    return [];
  }
  const modules = new Set(objectKeys(scaffold.modules));
  const gates = new Set(objectKeys(scaffold.gates));
  const seen = new Set();
  scaffold.execution_order.forEach((entry: any, index: number) => {
    const field = `execution_order.${index}`;
    if (typeof entry !== 'string' || !entry.trim() || entry.startsWith(TODO_PREFIX)) {
      diagnostics.push(diagnostic('form_check', `execution_order[${index}] needs a concrete module id or gate:<id>`, field));
      return;
    }
    const gateEntry = entry.startsWith('gate:');
    const key = gateEntry ? entry.slice('gate:'.length) : entry;
    if (!(gateEntry ? gates : modules).has(key)) diagnostics.push(diagnostic('strict_content_check', `execution_order references unrecognized '${key}'`, field));
    if (seen.has(entry)) diagnostics.push(diagnostic('form_check', `execution_order repeats '${entry}'`, field));
    seen.add(entry);
  });
  return [...scaffold.execution_order];
}

function validatePipelineScope(scope: unknown, diagnostics: Diagnostic[], field: string) {
  if (!isPlainObject(scope)) {
    diagnostics.push(diagnostic('form_check', `${field} must be an object`, field));
    return;
  }
  const tests = objectOrEmpty(scope.tests);
  const http = Object.entries(tests).filter(([, test]) => isPlainObject(test) && test.uses === 'kubeclaw.http@1');
  if (http.length === 0) return;
  for (const [id, test] of http) {
    const config = objectOrEmpty(test.config);
    const inputs = objectOrEmpty(test.inputs);
    if (typeof config.url !== 'string' && !isPlainObject(inputs.deployment)) {
      diagnostics.push(diagnostic('form_check', `${field}.tests.${id} needs config.url or a deployment input`, `${field}.tests.${id}`));
    }
  }
}

function validatePipeline(scaffold: AnyRecord, diagnostics: Diagnostic[]) {
  if (!isPlainObject(scaffold.pipeline) || scaffold.pipeline.project !== scaffold.project) {
    diagnostics.push(diagnostic('form_check', 'pipeline must contain the project test plan', 'pipeline'));
    return;
  }
  const pipelineModules = objectOrEmpty(scaffold.pipeline.modules);
  const pipelineGates = objectOrEmpty(scaffold.pipeline.gates);
  for (const [id, module] of entriesOf(scaffold.modules)) {
    if (Array.isArray(module.stages) && module.stages.includes('buster')) {
      validatePipelineScope(pipelineModules[id], diagnostics, `pipeline.modules.${id}`);
    }
  }
  for (const [id, gate] of entriesOf(scaffold.gates)) {
    if (gate.type === 'buster') validatePipelineScope(pipelineGates[id], diagnostics, `pipeline.gates.${id}`);
  }
}

export function validateScaffold(scaffold: unknown, context: Context): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  if (!isPlainObject(scaffold)) return [diagnostic('form_check', 'scaffold must be a JSON object', '$')];
  if (scaffold._schema && scaffold._schema !== SCHEMA) diagnostics.push(diagnostic('form_check', `unsupported scaffold schema '${scaffold._schema}'`, '_schema'));
  collectTodos(scaffold, diagnostics);
  if (scaffold.project !== context.project) diagnostics.push(diagnostic('strict_content_check', `project must be '${context.project}'`, 'project'));
  if (!isPlainObject(scaffold.modules) || Object.keys(scaffold.modules).length === 0) {
    diagnostics.push(diagnostic('strict_content_check', 'modules must contain at least one module', 'modules'));
  }
  validateModules(scaffold, context, diagnostics);
  entriesOf(scaffold.gates).forEach(([id, gate]) => validateGate(id, gate, context, diagnostics));
  validatePipeline(scaffold, diagnostics);
  return diagnostics;
}

export function scaffoldToProgress(scaffold: AnyRecord, context: Context) {
  const diagnostics = validateScaffold(scaffold, context);
  const executionOrder = validateExecutionOrder(scaffold, diagnostics);
  if (diagnostics.length > 0) {
    const error: Error & { diagnostics?: Diagnostic[] } = new Error('progress scaffold validation failed');
    error.diagnostics = diagnostics;
    throw error;
  }
  return {
    diagnostics,
    pipeline: scaffold.pipeline,
    progress: omitEmpty({
      project: scaffold.project,
      version: valueOrDefault(scaffold.version, DEFAULTS.version),
      description: scaffold.description,
      notes: scaffold.notes,
      defaults: scaffold.defaults,
      arch_validation: scaffold.policy?.arch_validation,
      pipeline_review: scaffold.policy?.pipeline_review,
      case_study: scaffold.policy?.case_study,
      telemetry: scaffold.policy?.telemetry,
      payload: scaffold.policy?.payload,
      execution_order: executionOrder,
      modules: scaffold.modules,
      gates: Object.fromEntries(entriesOf(scaffold.gates).map(([id, gate]) => [id, objectOrEmpty(gate)])),
    }),
  };
}
