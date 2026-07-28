import fs from 'fs';
import path from 'path';
import { STATUS } from '../core/constants.ts';
import { modulePath } from '../core/paths.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
const FORGE_COMPLETION_ARTIFACT_TYPE = 'forge_completion';
const FORGE_COMPLETION_STATUSES = Object.freeze([
  STATUS.READY_FOR_TESTING,
  STATUS.BLOCKED,
]);

function isAbsent(value: any) {
  return value === undefined || value === null || value === '';
}

function nonEmptyStringArray(value: any) {
  return Array.isArray(value) && value.some((entry: any) => typeof entry === 'string' && entry.trim());
}

function normalizeStringArray(value: any) {
  return Array.isArray(value)
    ? value.map((entry: any) => typeof entry === 'string' ? entry.trim() : '').filter(Boolean)
    : [];
}

export function forgeCompletionArtifactFile(config: any, moduleDir: any) {
  return path.join(modulePath(config, moduleDir), 'forge-completion.json');
}

export function archiveForgeCompletionArtifact(config: any, moduleDir: any, attempt: any) {
  const file = forgeCompletionArtifactFile(config, moduleDir);
  if (!fs.existsSync(file)) return null;
  const archiveFile = path.join(
    path.dirname(file),
    `forge-completion.stale-before-attempt-${Number.isFinite(Number(attempt)) ? Number(attempt) : 'unknown'}.json`,
  );
  fs.renameSync(file, archiveFile);
  return archiveFile;
}

export function invalidForgeCompletionArtifactStatus(config: any, moduleDir: any, identity: any = {}, errors: any = []) {
  return {
    status: STATUS.FAIL,
    source: 'forge_completion_artifact',
    summary: 'Forge completion artifact failed active attempt identity validation',
    completed_at: new Date().toISOString(),
    module_id: identity.module_id,
    attempt: identity.attempt,
    dispatch_id: identity.dispatch_id,
    gateway_label: identity.gateway_label,
    session_key: identity.session_key,
    artifact_path: forgeCompletionArtifactFile(config, moduleDir),
    status_errors: errors,
  };
}

function validateForgeCompletionArtifact(value: any) {
  const errors: any[] = [];
  if (selectTruthyValue(() => (selectTruthyValue(() => (!value), () => (typeof value !== 'object'))), () => (Array.isArray(value)))) {
    return ['completion artifact must be a JSON object'];
  }

  if (value.artifact_type !== FORGE_COMPLETION_ARTIFACT_TYPE) {
    errors.push(`artifact_type must be '${FORGE_COMPLETION_ARTIFACT_TYPE}'`);
  }
  if (!FORGE_COMPLETION_STATUSES.includes(value.status)) {
    errors.push(`status must be one of: ${FORGE_COMPLETION_STATUSES.join(', ')}`);
  }
  if (selectTruthyValue(() => (typeof value.summary !== 'string'), () => (!value.summary.trim()))) {
    errors.push('summary must be a non-empty string');
  }
  if (selectTruthyValue(() => (selectTruthyValue(() => (!value.evidence), () => (typeof value.evidence !== 'object'))), () => (Array.isArray(value.evidence)))) {
    errors.push('evidence must be an object');
  } else {
    if (!nonEmptyStringArray(value.evidence.inspected_files)) {
      errors.push('evidence.inspected_files must contain at least one non-empty string');
    }
    if (!nonEmptyStringArray(value.evidence.consulted_contracts)) {
      errors.push('evidence.consulted_contracts must contain at least one non-empty string');
    }
    if (selectTruthyValue(() => (typeof value.evidence.implementation_notes !== 'string'), () => (!value.evidence.implementation_notes.trim()))) {
      errors.push('evidence.implementation_notes must be a non-empty string');
    }
  }
  if (selectTruthyValue(() => (typeof value.completed_at !== 'string'), () => (!value.completed_at.trim()))) {
    errors.push('completed_at must be a non-empty string');
  }

  return errors;
}

function normalizeIdentityValue(value: any) {
  if (isAbsent(value)) return null;
  return String(value);
}

function normalizeExpectedIdentity(expected: any = {}) {
  return {
    run_id: normalizeIdentityValue(selectDefinedValue(() => (expected.run_id), () => (expected.runId))),
    module_id: normalizeIdentityValue(selectDefinedValue(() => (expected.module_id), () => (expected.moduleId))),
    attempt: normalizeIdentityValue(expected.attempt),
  };
}

function normalizeForgeCompletionEnvelope(value: any, expected: any = {}) {
  if (selectTruthyValue(() => (selectTruthyValue(() => (!value), () => (typeof value !== 'object'))), () => (Array.isArray(value)))) {
    return { value, normalized: false, normalized_fields: [] };
  }
  const expectedIdentity: Record<string, string | null> = normalizeExpectedIdentity(expected);
  const next = { ...value };
  const normalizedFields: any[] = [];

  if (isAbsent(next.artifact_type)) {
    next.artifact_type = FORGE_COMPLETION_ARTIFACT_TYPE;
    normalizedFields.push('artifact_type');
  }
  for (const field of ['run_id', 'module_id', 'attempt']) {
    if (isAbsent(next[field]) && expectedIdentity[field]) {
      next[field] = field === 'attempt' ? Number(expectedIdentity[field]) : expectedIdentity[field];
      normalizedFields.push(field);
    }
  }

  if (normalizedFields.length === 0) return { value, normalized: false, normalized_fields: [] };
  return { value: next, normalized: true, normalized_fields: normalizedFields };
}

function validateForgeCompletionIdentity(value: any, expected: any = {}) {
  const errors: any[] = [];
  const expectedIdentity: Record<string, string | null> = normalizeExpectedIdentity(expected);
  for (const field of ['run_id', 'module_id', 'attempt']) {
    const expectedValue = expectedIdentity[field];
    if (!expectedValue) continue;
    const actualValue = normalizeIdentityValue(value[field]);
    if (!actualValue) {
      errors.push(`${field} must be '${expectedValue}'`);
    } else if (actualValue !== expectedValue) {
      errors.push(`${field} must be '${expectedValue}' (got '${actualValue}')`);
    }
  }
  return errors;
}

export function readForgeCompletionArtifact(config: any, moduleDir: any, expectedIdentity: any = {}) {
  const file = forgeCompletionArtifactFile(config, moduleDir);
  if (!fs.existsSync(file)) return { found: false, file };

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error: any) {
    return { found: true, file, valid: false, errors: [`invalid JSON: ${error.message}`] };
  }

  const normalized = normalizeForgeCompletionEnvelope(parsed, expectedIdentity);
  const artifactValue = normalized.value;
  const errors = validateForgeCompletionArtifact(artifactValue);
  const identityErrors = validateForgeCompletionIdentity(artifactValue, expectedIdentity);
  if (selectTruthyValue(() => (errors.length > 0), () => (identityErrors.length > 0))) {
    return { found: true, file, valid: false, errors: [...errors, ...identityErrors], artifact: parsed };
  }
  const canonicalArtifact = {
    artifact_type: FORGE_COMPLETION_ARTIFACT_TYPE,
    run_id: artifactValue.run_id,
    module_id: artifactValue.module_id,
    attempt: artifactValue.attempt,
    status: artifactValue.status,
    summary: artifactValue.summary.trim(),
    evidence: {
      inspected_files: normalizeStringArray(artifactValue.evidence?.inspected_files),
      consulted_contracts: normalizeStringArray(artifactValue.evidence?.consulted_contracts),
      implementation_notes: artifactValue.evidence.implementation_notes.trim(),
    },
    completed_at: artifactValue.completed_at.trim(),
    ...(normalized.normalized ? { normalized: true, normalized_fields: normalized.normalized_fields } : {}),
  };
  if (normalized.normalized) {
    fs.writeFileSync(file, `${JSON.stringify(canonicalArtifact, null, 2)}\n`);
  }

  return {
    found: true,
    file,
    valid: true,
    normalized: normalized.normalized,
    normalized_fields: normalized.normalized_fields,
    artifact: canonicalArtifact,
  };
}
