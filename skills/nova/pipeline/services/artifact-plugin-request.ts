import fs from 'fs';
import path from 'path';
import { validateSafePath } from '../core/paths.ts';
import { isPlainObject } from './validation.ts';

const INLINE_FORMATS = new Set(['json', 'text', 'markdown']);
const PERSIST_FORMATS = new Set([...INLINE_FORMATS, 'file_copy']);

function assertNonEmptyString(value: any, label: string) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new Error(`${label} must be a non-empty string`);
}

export function validateArtifactQuery(query: any = {}) {
  if (!isPlainObject(query)) {
    throw new Error('Artifact query must be a plain object');
  }
  const limit = query.limit == null ? null : Number(query.limit);
  if (limit != null && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error(
      'Artifact query limit must be a positive integer when provided'
    );
  }
  return {
    ...(query.type
      ? { type: assertNonEmptyString(query.type, 'Artifact query type') }
      : {}),
    ...(query.role
      ? { role: assertNonEmptyString(query.role, 'Artifact query role') }
      : {}),
    ...(query.label
      ? { label: assertNonEmptyString(query.label, 'Artifact query label') }
      : {}),
    ...(limit != null ? { limit } : {}),
  };
}

function validateContent(request: any, format: string) {
  if (!INLINE_FORMATS.has(format)) return;
  if (request.content === undefined) {
    throw new Error(`Artifact content is required when format='${format}'`);
  }
  const jsonContent = typeof request.content === 'string'
    || isPlainObject(request.content)
    || Array.isArray(request.content);
  if (format === 'json' && !jsonContent) {
    throw new Error(
      'Artifact json content must be a string, object, or array'
    );
  }
  if (format !== 'json' && typeof request.content !== 'string') {
    throw new Error(
      `Artifact content for format='${format}' must be a string`
    );
  }
}

function optionalString(request: any, key: string, label: string) {
  return request[key] === undefined
    ? undefined
    : assertNonEmptyString(request[key], label);
}

function validateMetadata(metadata: any) {
  if (metadata !== undefined && !isPlainObject(metadata)) {
    throw new Error(
      'Artifact metadata must be a plain object when provided'
    );
  }
  return metadata;
}

export function validatePersistArtifactRequest(request: any = {}) {
  if (!isPlainObject(request)) {
    throw new Error('Artifact persist request must be a plain object');
  }
  const format = assertNonEmptyString(request.format, 'Artifact format');
  if (!PERSIST_FORMATS.has(format)) {
    throw new Error(`Artifact format '${format}' is not supported`);
  }
  validateContent(request, format);
  if (format === 'file_copy') {
    validateSafePath(
      assertNonEmptyString(request.sourcePath, 'Artifact sourcePath'),
      'artifact.sourcePath'
    );
  }
  const metadata = validateMetadata(request.metadata);
  const role = optionalString(request, 'role', 'Artifact role');
  const label = optionalString(request, 'label', 'Artifact label');
  const suggestedPath = optionalString(
    request,
    'suggestedPath',
    'Artifact suggestedPath'
  );
  return {
    type: assertNonEmptyString(request.type, 'Artifact type'),
    ...(role ? { role } : {}),
    ...(label ? { label } : {}),
    format,
    ...(request.content !== undefined ? { content: request.content } : {}),
    ...(request.sourcePath ? { sourcePath: request.sourcePath } : {}),
    ...(suggestedPath ? { suggestedPath } : {}),
    ...(metadata ? { metadata: { ...metadata } } : {}),
  };
}

export function artifactExtension(request: any) {
  if (request.format === 'json') return '.json';
  if (request.format === 'markdown') return '.md';
  if (request.format === 'text') return '.txt';
  if (request.format === 'file_copy') {
    return path.extname(request.sourcePath).trim() || '.bin';
  }
  return '.dat';
}

export function writeArtifactPayload(targetPath: string, request: any) {
  if (request.format === 'json') {
    fs.writeFileSync(
      targetPath,
      typeof request.content === 'string'
        ? request.content
        : JSON.stringify(request.content, null, 2)
    );
    return;
  }
  if (request.format === 'text' || request.format === 'markdown') {
    fs.writeFileSync(targetPath, request.content);
    return;
  }
  if (request.format === 'file_copy') {
    fs.copyFileSync(request.sourcePath, targetPath);
    return;
  }
  throw new Error(`Unsupported artifact format '${request.format}'`);
}
