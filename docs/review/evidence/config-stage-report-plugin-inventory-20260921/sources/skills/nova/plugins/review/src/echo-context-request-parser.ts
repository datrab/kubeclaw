import {
  CONTEXT_REQUEST_FIELDS,
  type EchoContextRequest,
  type RequirementResult,
} from './echo-review-contract.ts';
import { REVIEW_HARD_LIMITS } from './review-hard-limits.ts';

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('contextRequest must be an object');
  }
  return value as Readonly<Record<string, unknown>>;
}

function boundedText(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string' || value !== value.trim() || !value
    || Array.from(value).length > maximum) {
    throw new Error(`${label} must be non-empty bounded text`);
  }
  return value;
}

function identifier(value: unknown, label: string): string {
  const parsed = boundedText(value, label, REVIEW_HARD_LIMITS.identifierCharacters);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(parsed)) throw new Error(`${label} is invalid`);
  return parsed;
}

function path(value: unknown, label: string): string {
  const parsed = boundedText(value, label, REVIEW_HARD_LIMITS.pathCharacters);
  const parts = parsed.split('/');
  if (parsed.startsWith('/') || parsed.includes(':') || parsed.includes('\\')
    || /[\u0000-\u001F\u007F]/u.test(parsed)
    || parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`${label} must be a normalized repository-relative path`);
  }
  return parsed;
}

function list(
  value: unknown, label: string, maximum: number, parse: (entry: unknown, label: string) => string,
): readonly string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximum) {
    throw new Error(`${label} must contain 1-${maximum} items`);
  }
  const parsed = value.map((entry, index) => parse(entry, `${label}[${index}]`));
  if (new Set(parsed).size !== parsed.length) throw new Error(`${label} contains duplicates`);
  return parsed.sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

export function parseEchoContextRequest(
  value: unknown,
  assessments: Readonly<Record<string, RequirementResult>>,
): EchoContextRequest {
  const item = record(value);
  const unknown = Object.keys(item).filter((field) => !CONTEXT_REQUEST_FIELDS.includes(
    field as typeof CONTEXT_REQUEST_FIELDS[number],
  ));
  if (unknown.length > 0) throw new Error(`contextRequest has unknown field(s): ${unknown.join(', ')}`);
  const paths = list(item.paths, 'contextRequest.paths', REVIEW_HARD_LIMITS.contextExpansionPaths, path);
  const requirementIds = list(
    item.requirementIds, 'contextRequest.requirementIds',
    REVIEW_HARD_LIMITS.requirementAssessments, identifier,
  );
  if (requirementIds.some((id) => assessments[id]?.assessment !== 'unverified')) {
    throw new Error('contextRequest may reference only declared unverified requirements');
  }
  return {
    paths,
    requirementIds,
    reason: boundedText(
      item.reason, 'contextRequest.reason', REVIEW_HARD_LIMITS.explanationCharacters,
    ),
  };
}

export function assertEchoContextRequestRequirements(
  request: EchoContextRequest,
  declaredRequirementIds: readonly string[],
): void {
  const declared = new Set(declaredRequirementIds);
  if (request.requirementIds.some((id) => !declared.has(id))) {
    throw new Error('contextRequest references a requirement that was not declared');
  }
}
