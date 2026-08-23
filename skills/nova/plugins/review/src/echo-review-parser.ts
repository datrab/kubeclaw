import {
  CHANGE_RELATIONS,
  ECHO_REVIEW_OUTPUT_FIELDS,
  ECHO_REVIEW_SCHEMA_VERSION,
  EVIDENCE_REF_FIELDS,
  EVIDENCE_STRENGTHS,
  LOCATION_FIELDS,
  SIMPLIFICATION_CATEGORIES,
  SIMPLIFICATION_FIELDS,
  PROPOSED_FINDING_FIELDS,
  REQUIREMENT_ASSESSMENTS,
  REQUIREMENT_FIELDS,
  REVIEW_CATEGORIES,
  REVIEW_PRIORITIES,
  SCOPE_RELATIONS,
  type EchoReviewOutput,
  type EvidenceRef,
  type SimplificationProposal,
  type ProposedFinding,
  type RequirementResult,
  type SourceLocation,
} from './echo-review-contract.ts';
import { parseEchoContextRequest } from './echo-context-request-parser.ts';
import { verifyInspectedEvidence } from './echo-evidence-verification.ts';
import { REVIEW_HARD_LIMITS } from './review-hard-limits.ts';
export type ParsedEchoReviewOutput =
  | { readonly ok: true; readonly value: EchoReviewOutput }
  | { readonly ok: false; readonly error: string };

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Readonly<Record<string, unknown>>)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function closed(
  value: Readonly<Record<string, unknown>>,
  fields: readonly string[],
  label: string,
): void {
  const unknown = Object.keys(value).filter((key) => !fields.includes(key));
  if (unknown.length > 0) throw new Error(`${label} has unknown field(s): ${unknown.sort().join(', ')}`);
}

function text(value: unknown, label: string, maxLength: number): string {
  const characterLength = typeof value === 'string' ? Array.from(value).length : 0;
  if (
    typeof value !== 'string'
    || !value.trim()
    || value !== value.trim()
    || characterLength > maxLength
  ) {
    throw new Error(`${label} must be non-empty, unpadded text of at most ${maxLength} characters`);
  }
  return value;
}

function identifier(value: unknown, label: string): string {
  const parsed = text(value, label, REVIEW_HARD_LIMITS.identifierCharacters);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*(?![\s\S])/.test(parsed)) {
    throw new Error(`${label} must be a stable identifier`);
  }
  return parsed;
}

function digest(value: unknown, label: string): `sha256:${string}` {
  const parsed = text(value, label, REVIEW_HARD_LIMITS.digestCharacters);
  if (!/^sha256:[0-9a-f]{64}(?![\s\S])/.test(parsed)) throw new Error(`${label} is invalid`);
  return parsed as `sha256:${string}`;
}

function selection<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(`${label} must be one of ${allowed.join(', ')}`);
  }
  return value as T;
}

function array(value: unknown, label: string, min: number, max: number): readonly unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new Error(`${label} must contain ${min}-${max} items`);
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      throw new Error(`${label} must not contain sparse entries`);
    }
  }
  return value;
}

function parseEvidence(value: unknown, label: string): EvidenceRef {
  const item = record(value, label);
  closed(item, EVIDENCE_REF_FIELDS, label);
  const digestValue = digest(item.digest, `${label}.digest`);
  return {
    kind: identifier(item.kind, `${label}.kind`),
    digest: digestValue,
  };
}

function evidenceKey(value: EvidenceRef): string {
  return `${value.kind}\0${value.digest}`;
}

function parseEvidenceList(
  value: unknown,
  label: string,
  min: number,
  max: number,
): readonly EvidenceRef[] {
  const parsed = array(value, label, min, max).map((entry, index) => (
    parseEvidence(entry, `${label}[${index}]`)
  ));
  const keys = parsed.map(evidenceKey);
  if (new Set(keys).size !== keys.length) throw new Error(`${label} contains duplicate evidence`);
  return parsed;
}

function parseRequirement(value: unknown, label: string): RequirementResult {
  const item = record(value, label);
  closed(item, REQUIREMENT_FIELDS, label);
  const assessment = selection(item.assessment, REQUIREMENT_ASSESSMENTS, `${label}.assessment`);
  const evidence = parseEvidenceList(
    item.evidence, `${label}.evidence`, 0, REVIEW_HARD_LIMITS.evidencePerRecord,
  );
  if (assessment !== 'unverified' && evidence.length === 0) {
    throw new Error(`${label}.evidence is required for ${assessment}`);
  }
  return {
    assessment,
    explanation: text(
      item.explanation, `${label}.explanation`, REVIEW_HARD_LIMITS.explanationCharacters,
    ),
    evidence,
  };
}

function parsePath(value: unknown, label: string): string {
  const parsed = text(value, label, REVIEW_HARD_LIMITS.pathCharacters);
  const segments = parsed.split('/');
  if (
    parsed.startsWith('/')
    || parsed.includes(':')
    || parsed.includes('\\')
    || /[\u0000-\u001F\u007F]/.test(parsed)
    || segments.some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error(`${label} must be a normalized repository-relative path`);
  }
  return parsed;
}

function parseLocation(value: unknown, label: string): SourceLocation {
  const item = record(value, label);
  closed(item, LOCATION_FIELDS, label);
  let lineHint: number | undefined;
  if (item.lineHint !== undefined) {
    if (!Number.isInteger(item.lineHint) || Number(item.lineHint) < 1) {
      throw new Error(`${label}.lineHint must be a positive integer`);
    }
    lineHint = Number(item.lineHint);
  }
  return {
    path: parsePath(item.path, `${label}.path`),
    ...(item.symbol === undefined ? {} : {
      symbol: text(item.symbol, `${label}.symbol`, REVIEW_HARD_LIMITS.symbolCharacters),
    }),
    ...(lineHint === undefined ? {} : { lineHint }),
  };
}

function parseSimplification(value: unknown, label: string): SimplificationProposal {
  const item = record(value, label);
  closed(item, SIMPLIFICATION_FIELDS, label);
  const candidateIds = array(
    item.candidateIds, `${label}.candidateIds`, 1, REVIEW_HARD_LIMITS.simplificationCandidateIds,
  )
    .map((entry, index) => digest(entry, `${label}.candidateIds[${index}]`));
  if (new Set(candidateIds).size !== candidateIds.length) throw new Error(`${label}.candidateIds contains duplicates`);
  let estimatedNetLocReduction: number | undefined;
  if (item.estimatedNetLocReduction !== undefined) {
    if (!Number.isInteger(item.estimatedNetLocReduction) || Number(item.estimatedNetLocReduction) < 0
      || Number(item.estimatedNetLocReduction) > REVIEW_HARD_LIMITS.estimatedNetLocReduction) {
      throw new Error(`${label}.estimatedNetLocReduction must be a non-negative integer`);
    }
    estimatedNetLocReduction = Number(item.estimatedNetLocReduction);
  }
  return {
    category: selection(item.category, SIMPLIFICATION_CATEGORIES, `${label}.category`),
    candidateIds,
    smallestReplacement: text(
      item.smallestReplacement,
      `${label}.smallestReplacement`,
      REVIEW_HARD_LIMITS.explanationCharacters,
    ),
    ...(estimatedNetLocReduction === undefined ? {} : { estimatedNetLocReduction }),
  };
}

function parseFinding(value: unknown, label: string): ProposedFinding {
  const item = record(value, label);
  closed(item, PROPOSED_FINDING_FIELDS, label);
  const category = selection(item.category, REVIEW_CATEGORIES, `${label}.category`);
  if (item.simplification !== undefined && category !== 'simplification') {
    throw new Error(`${label}.simplification is allowed only for simplification findings`);
  }
  return {
    category,
    priority: selection(item.priority, REVIEW_PRIORITIES, `${label}.priority`),
    claim: text(item.claim, `${label}.claim`, REVIEW_HARD_LIMITS.explanationCharacters),
    impact: text(item.impact, `${label}.impact`, REVIEW_HARD_LIMITS.explanationCharacters),
    locations: array(
      item.locations, `${label}.locations`, 1, REVIEW_HARD_LIMITS.findingLocations,
    )
      .map((entry, index) => parseLocation(entry, `${label}.locations[${index}]`)),
    evidence: parseEvidenceList(
      item.evidence, `${label}.evidence`, 1, REVIEW_HARD_LIMITS.evidencePerRecord,
    ),
    recommendedFix: text(
      item.recommendedFix, `${label}.recommendedFix`, REVIEW_HARD_LIMITS.explanationCharacters,
    ),
    changeRelation: selection(item.changeRelation, CHANGE_RELATIONS, `${label}.changeRelation`),
    scopeRelation: selection(item.scopeRelation, SCOPE_RELATIONS, `${label}.scopeRelation`),
    evidenceStrength: selection(item.evidenceStrength, EVIDENCE_STRENGTHS, `${label}.evidenceStrength`),
    ...(item.rootCauseHint === undefined ? {} : {
      rootCauseHint: text(
        item.rootCauseHint,
        `${label}.rootCauseHint`,
        REVIEW_HARD_LIMITS.rootCauseHintCharacters,
      ),
    }),
    ...(item.simplification === undefined ? {} : { simplification: parseSimplification(item.simplification, `${label}.simplification`) }),
  };
}

function parseRequirementAssessments(value: unknown): Readonly<Record<string, RequirementResult>> {
  const entries = Object.entries(record(value, 'requirementAssessments'));
  if (entries.length < 1 || entries.length > REVIEW_HARD_LIMITS.requirementAssessments) {
    throw new Error(
      `requirementAssessments must contain 1-${REVIEW_HARD_LIMITS.requirementAssessments} properties`,
    );
  }
  return Object.fromEntries(entries
    .map(([key, entry]) => [
      identifier(key, `requirementAssessments key ${JSON.stringify(key)}`),
      parseRequirement(entry, `requirementAssessments.${key}`),
    ] as const)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
}

function parse(value: unknown): EchoReviewOutput {
  const output = record(value, 'Echo review output');
  closed(output, ECHO_REVIEW_OUTPUT_FIELDS, 'Echo review output');
  if (output.schemaVersion !== ECHO_REVIEW_SCHEMA_VERSION) throw new Error('Echo review schemaVersion is invalid');
  const inspectedEvidence = parseEvidenceList(
    output.inspectedEvidence, 'inspectedEvidence', 1, REVIEW_HARD_LIMITS.inspectedEvidence,
  );
  const requirementAssessments = parseRequirementAssessments(output.requirementAssessments);
  const proposedFindings = array(
    output.proposedFindings, 'proposedFindings', 0, REVIEW_HARD_LIMITS.proposedFindings,
  )
    .map((entry, index) => parseFinding(entry, `proposedFindings[${index}]`));
  const contextRequest = output.contextRequest === undefined
    ? undefined : parseEchoContextRequest(output.contextRequest, requirementAssessments);
  if (contextRequest && proposedFindings.length > 0) {
    throw new Error('contextRequest cannot accompany proposedFindings');
  }
  verifyInspectedEvidence(inspectedEvidence, requirementAssessments, proposedFindings);
  return deepFreeze({
    schemaVersion: ECHO_REVIEW_SCHEMA_VERSION,
    summary: text(output.summary, 'summary', REVIEW_HARD_LIMITS.summaryCharacters),
    inspectedEvidence,
    requirementAssessments,
    proposedFindings,
    ...(contextRequest === undefined ? {} : { contextRequest }),
  });
}

export function parseEchoReviewOutput(value: unknown): ParsedEchoReviewOutput {
  try { return { ok: true, value: parse(value) }; } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function parseEchoReviewDispatchResponse(
  response: Readonly<Record<string, unknown>>,
): ParsedEchoReviewOutput {
  if (!Object.hasOwn(response, 'result')) {
    return { ok: false, error: 'runtime dispatch response is missing result' };
  }
  return parseEchoReviewOutput(response.result);
}
