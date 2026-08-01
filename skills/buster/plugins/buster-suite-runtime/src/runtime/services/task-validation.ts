import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// pipeline/services/task-validation.ts — Buster task identity validation helpers
// Keeps untrusted Redis payload normalization outside the task orchestrator.

import path from 'path';
import { normalizeBusterCapabilities, unsupportedBusterCapabilities } from './capabilities.ts';
import { getRepoRoot, gitExec } from './git-workflows.ts';
import { resolveScopedPath } from '../security.ts';
import { validateImageReference } from './image-reference.ts';
import type { AnyTaskRecord, BusterTaskIdentity, TaskIdentityCandidate } from './task-contracts.ts';

export const PIPELINE_TASK_TYPES = ['module_test', 'gate_test'] as const;

type AnyRecord = AnyTaskRecord;
type UnsafeField = { field: string; reason: string };

export class MalformedBusterTaskError extends Error {
  readonly code = 'BUSTER_TASK_MALFORMED';
  readonly details: AnyRecord;
  readonly missing_fields: unknown[];
  readonly forbidden_fields: unknown[];
  readonly unsafe_fields: unknown[];

  constructor(message: string, details: AnyRecord = {}) {
    super(message);
    this.name = 'MalformedBusterTaskError';
    this.details = details;
    this.missing_fields = arrayValue(details.missing_fields);
    this.forbidden_fields = arrayValue(details.forbidden_fields);
    this.unsafe_fields = arrayValue(details.unsafe_fields);
  }
}

export function normalizeRequiredIdentity(value: unknown): string | null {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function normalizeAttempt(value: unknown): number | null {
  if (selectTruthyValue(() => (selectTruthyValue(() => (value === undefined), () => (value === null))), () => (value === ''))) return null;
  const numeric = Number(value);
  if (selectTruthyValue(() => (!Number.isInteger(numeric)), () => (numeric < 1))) return null;
  return numeric;
}

function isPlainObject(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function objectRecord(value: unknown): AnyRecord {
  return isPlainObject(value) ? value : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string {
  return selectTruthyValue(() => (value === undefined), () => (value === null)) ? '' : String(value);
}

function payloadValueType(value: unknown): string {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function normalizeRequiredSuites(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const suiteNames = [];
  for (const suite of value) {
    if (selectTruthyValue(() => (typeof suite !== 'string'), () => (suite.trim() === ''))) return null;
    suiteNames.push(suite.trim());
  }
  return suiteNames.length > 0 ? suiteNames : null;
}

function containsParentTraversal(value: unknown): boolean {
  return stringValue(value).split(/[\\/]+/).filter(Boolean).includes('..');
}

function validateRepoRelativePayloadPath(
  payload: AnyRecord,
  field: string,
  { required = false, repoRoot = getRepoRoot() }: { required?: boolean; repoRoot?: string } = {},
): string | null {
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

function gitCommonDir(repoRoot: string): string {
  const commonDir = gitExec(repoRoot, ['rev-parse', '--git-common-dir']);
  return path.resolve(repoRoot, commonDir);
}

function validateSessionCwdPath(payload: AnyRecord, { repoRoot = getRepoRoot() }: { repoRoot?: string } = {}): string {
  const value = normalizeRequiredIdentity(payload?.session?.cwd);
  if (!value) throw new Error('session.cwd: required');
  if (containsParentTraversal(value)) throw new Error('session.cwd: must not contain parent traversal');

  const cwd = path.isAbsolute(value)
    ? path.resolve(value)
    : resolveScopedPath(value, {
        baseDir: repoRoot,
        scopeDir: repoRoot,
        field: 'session.cwd',
        scopeDescription: 'repository root',
      });
  const cwdRepoRoot = getRepoRoot(cwd);
  const sameWorktree = path.resolve(cwdRepoRoot) === path.resolve(repoRoot);
  const sameGitRepository = !sameWorktree && gitCommonDir(cwdRepoRoot) === gitCommonDir(repoRoot);
  if (!sameWorktree && !sameGitRepository) {
    throw new Error('session.cwd: must resolve to the current repository or a linked worktree');
  }
  return value;
}

function validatePayloadPathBoundaries(payload: AnyRecord, taskType: string): void {
  const repoRoot = getRepoRoot();
  const unsafe: UnsafeField[] = [];
  const fields = ['output_file'];
  if (taskType === 'module_test') fields.push('module_path', 'buster_md_path');
  if (taskType === 'gate_test') fields.push('work_dir', 'instructions_file');

  for (const field of fields) {
    try {
      validateRepoRelativePayloadPath(payload, field, { required: field === 'output_file', repoRoot });
    } catch (error) {
      unsafe.push({ field, reason: error instanceof Error ? error.message : String(error) });
    }
  }
  try {
    validateSessionCwdPath(payload, { repoRoot });
  } catch (error) {
    unsafe.push({ field: 'session.cwd', reason: error instanceof Error ? error.message : String(error) });
  }

  if (unsafe.length > 0) {
    throw new MalformedBusterTaskError(`Buster task payload contains unsafe path field(s): ${unsafe.map(entry => entry.field).join(', ')}`, {
      reason: 'unsafe_path_field',
      unsafe_fields: unsafe,
      task_type: selectTruthyValue(() => (taskType), () => (null)),
      payload_keys: Object.keys(objectRecord(payload)),
    });
  }
}

function validateServeImagePolicy(testConfig: AnyRecord | null): void {
  const image = testConfig?.serve?.image;
  if (selectTruthyValue(() => (selectTruthyValue(() => (image === undefined), () => (image === null))), () => (image === ''))) return;
  const validation = validateImageReference(image);
  if (validation.ok) return;
  throw new MalformedBusterTaskError(`Buster task test_config.serve.image must be fully qualified: ${validation.reason}`, {
    reason: 'invalid_serve_image_reference',
    invalid_fields: [{ field: 'test_config.serve.image', expected: 'fully-qualified image reference', actual: payloadValueType(image), reason: validation.reason }],
  });
}

function validateAgentJudgmentPolicy(payload: AnyRecord): void {
  const policy = payload?.agent_judgment;
  if (selectTruthyValue(() => (policy === undefined), () => (policy === null))) return;
  if (!isPlainObject(policy)) {
    throw new MalformedBusterTaskError('Buster task payload agent_judgment must be an object', {
      reason: 'invalid_agent_judgment_shape',
      invalid_fields: [{ field: 'agent_judgment', expected: 'object', actual: payloadValueType(policy) }],
      payload_keys: Object.keys(payload),
    });
  }
  if (typeof policy.required !== 'boolean') {
    throw new MalformedBusterTaskError('Buster task payload agent_judgment.required must be a boolean', {
      reason: 'invalid_agent_judgment_required',
      invalid_fields: [{ field: 'agent_judgment.required', expected: 'boolean', actual: payloadValueType(policy.required) }],
      payload_keys: Object.keys(payload),
    });
  }
}

function taskIdentityCandidate(task: AnyRecord): TaskIdentityCandidate {
  const testConfigProvided = task.test_config !== undefined;
  const testConfig = isPlainObject(task.test_config) ? task.test_config : null;
  return {
    taskType: normalizeRequiredIdentity(task.task_type),
    moduleId: normalizeRequiredIdentity(task.module_id),
    project: normalizeRequiredIdentity(task.project),
    runId: normalizeRequiredIdentity(task.run_id),
    attempt: normalizeAttempt(task.attempt),
    dispatchId: normalizeRequiredIdentity(task.dispatch_id),
    completionStream: normalizeRequiredIdentity(task.completion_stream),
    gateId: normalizeRequiredIdentity(task.gate_id),
    commitHash: normalizeRequiredIdentity(task.commit_hash),
    outputFile: normalizeRequiredIdentity(task.output_file),
    stageId: normalizeRequiredIdentity(task.stage_id),
    workerType: normalizeRequiredIdentity(task.worker_type),
    timeoutSeconds: normalizeAttempt(task.timeout_seconds),
    sessionRuntime: normalizeRequiredIdentity(task.session?.runtime)?.toLowerCase(),
    sessionModel: normalizeRequiredIdentity(task.session?.model),
    sessionAgentId: sessionAgentIdAuthority(task.session),
    sessionCwd: normalizeRequiredIdentity(task.session?.cwd),
    sessionLabel: normalizeRequiredIdentity(task.session?.label),
    suites: normalizeRequiredSuites(task.suites),
    capabilities: normalizeBusterCapabilities(task.capabilities) as string[],
    testConfigProvided,
    testConfig,
    suiteTimeoutMs: testConfig ? normalizeAttempt(testConfig.suite_timeout_ms) : null,
  };
}

function missingIdentityFields(candidate: TaskIdentityCandidate): string[] {
  const missing: string[] = [];
  if (!candidate.taskType || !(PIPELINE_TASK_TYPES as readonly string[]).includes(candidate.taskType)) missing.push('task_type');
  const required: Array<[unknown, string]> = [
    [candidate.moduleId, 'module_id'], [candidate.project, 'project'], [candidate.runId, 'run_id'],
    [candidate.attempt, 'attempt'], [candidate.dispatchId, 'dispatch_id'],
    [candidate.completionStream, 'completion_stream'], [candidate.commitHash, 'commit_hash'],
    [candidate.outputFile, 'output_file'], [candidate.stageId, 'stage_id'],
    [candidate.timeoutSeconds, 'timeout_seconds'], [candidate.sessionModel, 'session.model'],
    [candidate.sessionAgentId, 'session.agentId'], [candidate.sessionCwd, 'session.cwd'],
    [candidate.sessionLabel, 'session.label'], [candidate.suites, 'suites'],
  ];
  for (const [value, field] of required) if (value === null) missing.push(field);
  if (candidate.taskType === 'module_test' && candidate.workerType !== 'module_buster') missing.push('worker_type');
  if (candidate.sessionRuntime !== 'acp' && candidate.sessionRuntime !== 'subagent') missing.push('session.runtime');
  if (!candidate.testConfigProvided) missing.push('test_config');
  if (candidate.testConfig && candidate.suiteTimeoutMs === null) missing.push('test_config.suite_timeout_ms');
  if (candidate.taskType === 'gate_test' && !candidate.gateId) missing.push('gate_id');
  return missing;
}

function validatedIdentity(candidate: TaskIdentityCandidate): BusterTaskIdentity {
  return {
    taskType: candidate.taskType as 'module_test' | 'gate_test',
    moduleId: candidate.moduleId!, gateId: candidate.taskType === 'gate_test' ? candidate.gateId : null,
    project: candidate.project!, runId: candidate.runId!, attempt: candidate.attempt!,
    dispatchId: candidate.dispatchId!, completionStream: candidate.completionStream!,
    commitHash: candidate.commitHash!, stageId: candidate.stageId!,
    workerType: candidate.taskType === 'module_test' ? candidate.workerType : null,
    timeoutSeconds: candidate.timeoutSeconds!, suites: candidate.suites!,
    capabilities: candidate.capabilities, suiteTimeoutMs: candidate.suiteTimeoutMs!,
  };
}

export function validateBusterTaskPayload(payload: unknown = {}): BusterTaskIdentity {
  if (selectTruthyValue(() => (selectTruthyValue(() => (!payload), () => (typeof payload !== 'object'))), () => (Array.isArray(payload)))) {
    throw new MalformedBusterTaskError('Buster task payload must be an object', {
      reason: 'payload_not_object',
      missing_fields: ['payload'],
    });
  }

  const task = payload as AnyRecord;
  const candidate = taskIdentityCandidate(task);
  if (candidate.testConfigProvided && !candidate.testConfig) {
    throw new MalformedBusterTaskError('Buster task payload test_config must be an object', {
      reason: 'invalid_test_config_shape',
      invalid_fields: [{ field: 'test_config', expected: 'object', actual: payloadValueType(task.test_config) }],
      payload_keys: Object.keys(task),
    });
  }
  const missing = missingIdentityFields(candidate);
  if (missing.length > 0) {
    throw new MalformedBusterTaskError(`Buster task payload missing required identity: ${missing.join(', ')}`, {
      reason: 'missing_required_identity',
      missing_fields: missing,
      task_type: candidate.taskType,
      payload_keys: Object.keys(task),
    });
  }

  const unsupportedCapabilities = unsupportedBusterCapabilities(candidate.capabilities);
  if (unsupportedCapabilities.length > 0) {
    throw new MalformedBusterTaskError(`Buster task payload contains unsupported capabilities: ${unsupportedCapabilities.join(', ')}`, {
      reason: 'unsupported_capabilities',
      unsupported_capabilities: unsupportedCapabilities,
      payload_keys: Object.keys(task),
    });
  }

  validatePayloadPathBoundaries(task, candidate.taskType!);
  validateServeImagePolicy(candidate.testConfig);
  validateAgentJudgmentPolicy(task);
  return validatedIdentity(candidate);
}

function sessionAgentIdAuthority(session: AnyRecord | null | undefined): string | null {
  const canonical = normalizeRequiredIdentity(session?.agentId);
  if (canonical) return canonical;
  return normalizeRequiredIdentity(session?.agent_id);
}
