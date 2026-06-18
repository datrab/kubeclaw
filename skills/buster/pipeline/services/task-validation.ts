// pipeline/services/task-validation.ts — Buster task identity validation helpers
// Keeps untrusted Redis payload normalization outside the task orchestrator.

import path from 'path';
import { normalizeBusterCapabilities, unknownBusterCapabilities } from './capabilities.ts';
import { getRepoRoot } from './git-workflows.ts';
import { resolveScopedPath } from '../security.ts';
import { validateBaseImageRef } from './base-images.ts';

export const PIPELINE_TASK_TYPES = ['module_test', 'gate_test'];

export class MalformedBusterTaskError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'MalformedBusterTaskError';
    this.code = 'BUSTER_TASK_MALFORMED';
    this.details = details;
    this.missing_fields = details.missing_fields || [];
    this.forbidden_fields = details.forbidden_fields || [];
    this.unsafe_fields = details.unsafe_fields || [];
  }
}

export function normalizeRequiredIdentity(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function normalizeAttempt(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  if (!Number.isInteger(numeric) || numeric < 1) return null;
  return numeric;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function payloadValueType(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function normalizeRequiredSuites(value) {
  if (!Array.isArray(value)) return null;
  const suiteNames = [];
  for (const suite of value) {
    if (typeof suite !== 'string' || suite.trim() === '') return null;
    suiteNames.push(suite.trim());
  }
  return suiteNames.length > 0 ? suiteNames : null;
}

function containsParentTraversal(value) {
  return String(value || '').split(/[\\/]+/).filter(Boolean).includes('..');
}

function validateRepoRelativePayloadPath(payload, field, { required = false, repoRoot = getRepoRoot() } = {}) {
  const value = normalizeRequiredIdentity(payload?.[field]);
  if (!value) {
    if (required) throw new Error(`${field}: required`);
    return null;
  }
  if (path.isAbsolute(value)) throw new Error(`${field}: must be repository-relative`);
  if (containsParentTraversal(value)) throw new Error(`${field}: must not contain parent traversal`);
  resolveScopedPath(value, {
    baseDir: repoRoot,
    scopeDir: repoRoot,
    field,
    scopeDescription: 'repository root',
  });
  return value;
}

function validateSessionCwdPath(payload, { repoRoot = getRepoRoot() } = {}) {
  const value = normalizeRequiredIdentity(payload?.session?.cwd);
  if (!value) throw new Error('session.cwd: required');
  if (containsParentTraversal(value)) throw new Error('session.cwd: must not contain parent traversal');

  const cwd = resolveScopedPath(value, {
    baseDir: repoRoot,
    scopeDir: repoRoot,
    field: 'session.cwd',
    scopeDescription: 'repository root',
  });
  const cwdRepoRoot = getRepoRoot(cwd);
  if (path.resolve(cwdRepoRoot) !== path.resolve(repoRoot)) {
    throw new Error('session.cwd: must resolve within the current repository root');
  }
  return value;
}

function validatePayloadPathBoundaries(payload, taskType) {
  const repoRoot = getRepoRoot();
  const unsafe = [];
  const fields = ['output_file'];
  if (taskType === 'module_test') fields.push('module_path', 'buster_md_path');
  if (taskType === 'gate_test') fields.push('work_dir', 'instructions_file');

  for (const field of fields) {
    try {
      validateRepoRelativePayloadPath(payload, field, { required: field === 'output_file', repoRoot });
    } catch (error) {
      unsafe.push({ field, reason: error.message });
    }
  }
  try {
    validateSessionCwdPath(payload, { repoRoot });
  } catch (error) {
    unsafe.push({ field: 'session.cwd', reason: error.message });
  }

  if (unsafe.length > 0) {
    throw new MalformedBusterTaskError(`Buster task payload contains unsafe path field(s): ${unsafe.map(entry => entry.field).join(', ')}`, {
      reason: 'unsafe_path_field',
      unsafe_fields: unsafe,
      task_type: taskType || null,
      payload_keys: Object.keys(payload || {}),
    });
  }
}

function validateServeImagePolicy(testConfig) {
  const image = testConfig?.serve?.image;
  if (image === undefined || image === null || image === '') return;
  const validation = validateBaseImageRef(image);
  if (validation.ok) return;
  throw new MalformedBusterTaskError(`Buster task test_config.serve.image must be fully qualified: ${validation.reason}`, {
    reason: 'invalid_serve_image_reference',
    invalid_fields: [{ field: 'test_config.serve.image', expected: 'fully-qualified image reference', actual: payloadValueType(image), reason: validation.reason }],
  });
}

export function validateBusterTaskPayload(payload = {}) {
  const missing = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new MalformedBusterTaskError('Buster task payload must be an object', {
      reason: 'payload_not_object',
      missing_fields: ['payload'],
    });
  }

  const taskType = normalizeRequiredIdentity(payload.task_type);
  if (!PIPELINE_TASK_TYPES.includes(taskType)) missing.push('task_type');

  const moduleId = normalizeRequiredIdentity(payload.module_id);
  const project = normalizeRequiredIdentity(payload.project);
  const runId = normalizeRequiredIdentity(payload.run_id);
  const attempt = normalizeAttempt(payload.attempt);
  const dispatchId = normalizeRequiredIdentity(payload.dispatch_id);
  const completionStream = normalizeRequiredIdentity(payload.completion_stream);
  const gateId = normalizeRequiredIdentity(payload.gate_id);
  const commitHash = normalizeRequiredIdentity(payload.commit_hash);
  const outputFile = normalizeRequiredIdentity(payload.output_file);
  const stageId = normalizeRequiredIdentity(payload.stage_id);
  const workerType = normalizeRequiredIdentity(payload.worker_type);
  const timeoutSeconds = normalizeAttempt(payload.timeout_seconds);
  const sessionRuntime = normalizeRequiredIdentity(payload.session?.runtime)?.toLowerCase();
  const sessionModel = normalizeRequiredIdentity(payload.session?.model);
  const sessionAgentId = normalizeRequiredIdentity(payload.session?.agentId) || normalizeRequiredIdentity(payload.session?.agent_id);
  const sessionCwd = normalizeRequiredIdentity(payload.session?.cwd);
  const sessionLabel = normalizeRequiredIdentity(payload.session?.label);
  const suites = normalizeRequiredSuites(payload.suites);
  const capabilities = normalizeBusterCapabilities(payload.capabilities || []);
  const unknownCapabilities = unknownBusterCapabilities(capabilities);
  const testConfigProvided = payload.test_config !== undefined;
  const testConfig = isPlainObject(payload.test_config) ? payload.test_config : null;
  const suiteTimeoutMs = testConfig ? normalizeAttempt(testConfig.suite_timeout_ms) : null;

  if (!moduleId) missing.push('module_id');
  if (!project) missing.push('project');
  if (!runId) missing.push('run_id');
  if (attempt === null) missing.push('attempt');
  if (!dispatchId) missing.push('dispatch_id');
  if (!completionStream) missing.push('completion_stream');
  if (!commitHash) missing.push('commit_hash');
  if (!outputFile) missing.push('output_file');
  if (!stageId) missing.push('stage_id');
  if (taskType === 'module_test' && workerType !== 'module_buster') missing.push('worker_type');
  if (timeoutSeconds === null) missing.push('timeout_seconds');
  if (sessionRuntime !== 'acp' && sessionRuntime !== 'subagent') missing.push('session.runtime');
  if (!sessionModel) missing.push('session.model');
  if (!sessionAgentId) missing.push('session.agentId');
  if (!sessionCwd) missing.push('session.cwd');
  if (!sessionLabel) missing.push('session.label');
  if (!suites) missing.push('suites');
  if (testConfigProvided && !testConfig) {
    throw new MalformedBusterTaskError('Buster task payload test_config must be an object', {
      reason: 'invalid_test_config_shape',
      invalid_fields: [{ field: 'test_config', expected: 'object', actual: payloadValueType(payload.test_config) }],
      payload_keys: Object.keys(payload),
    });
  }
  if (!testConfigProvided) missing.push('test_config');
  if (testConfig && suiteTimeoutMs === null) missing.push('test_config.suite_timeout_ms');
  if (taskType === 'gate_test' && !gateId) missing.push('gate_id');

  if (missing.length > 0) {
    throw new MalformedBusterTaskError(`Buster task payload missing required identity: ${missing.join(', ')}`, {
      reason: 'missing_required_identity',
      missing_fields: missing,
      task_type: taskType || null,
      payload_keys: Object.keys(payload),
    });
  }

  if (unknownCapabilities.length > 0) {
    throw new MalformedBusterTaskError(`Buster task payload contains unknown capabilities: ${unknownCapabilities.join(', ')}`, {
      reason: 'unknown_capabilities',
      unknown_capabilities: unknownCapabilities,
      payload_keys: Object.keys(payload),
    });
  }

  validatePayloadPathBoundaries(payload, taskType);
  validateServeImagePolicy(testConfig);

  return {
    taskType,
    moduleId,
    gateId: taskType === 'gate_test' ? gateId : null,
    project,
    runId,
    attempt,
    dispatchId,
    completionStream,
    commitHash,
    stageId,
    workerType: taskType === 'module_test' ? workerType : null,
    timeoutSeconds,
    suites,
    capabilities,
    suiteTimeoutMs,
  };
}
