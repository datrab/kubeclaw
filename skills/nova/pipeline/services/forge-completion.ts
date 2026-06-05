import fs from 'fs';
import path from 'path';
import { STATUS } from '../core/constants.ts';
import { modulePath } from '../core/paths.ts';

export const FORGE_COMPLETION_ARTIFACT_TYPE = 'forge_completion';
export const FORGE_COMPLETION_STATUSES = Object.freeze([
  STATUS.READY_FOR_TESTING,
  STATUS.BLOCKED,
]);

export function forgeCompletionArtifactFile(config, moduleDir) {
  return path.join(modulePath(config, moduleDir), 'forge-completion.json');
}

export function validateForgeCompletionArtifact(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return ['completion artifact must be a JSON object'];
  }

  if (value.artifact_type !== FORGE_COMPLETION_ARTIFACT_TYPE) {
    errors.push(`artifact_type must be '${FORGE_COMPLETION_ARTIFACT_TYPE}'`);
  }
  if (!FORGE_COMPLETION_STATUSES.includes(value.status)) {
    errors.push(`status must be one of: ${FORGE_COMPLETION_STATUSES.join(', ')}`);
  }
  if (typeof value.summary !== 'string' || !value.summary.trim()) {
    errors.push('summary must be a non-empty string');
  }
  if (typeof value.completed_at !== 'string' || !value.completed_at.trim()) {
    errors.push('completed_at must be a non-empty string');
  }

  return errors;
}

export function readForgeCompletionArtifact(config, moduleDir) {
  const file = forgeCompletionArtifactFile(config, moduleDir);
  if (!fs.existsSync(file)) return { found: false, file };

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return { found: true, file, valid: false, errors: [`invalid JSON: ${error.message}`] };
  }

  const errors = validateForgeCompletionArtifact(parsed);
  if (errors.length > 0) return { found: true, file, valid: false, errors, artifact: parsed };

  return {
    found: true,
    file,
    valid: true,
    artifact: {
      artifact_type: FORGE_COMPLETION_ARTIFACT_TYPE,
      status: parsed.status,
      summary: parsed.summary.trim(),
      completed_at: parsed.completed_at.trim(),
    },
  };
}
