import { gateCoverageResultErrors, type GateCoverageResultV1 } from './coverage-result.ts';
import { gateCoverageErrors, resolvedCoverageErrors, type GateCoverageV1 } from './coverage.ts';
import crypto from 'node:crypto';
import fs from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type {
  ContractValidationResult,
  PipelineTestGateDefinition,
  ReportAdapterResultV1,
  ReportCaseOutcome,
  RemotePlanJobV1,
  RemotePlanResultV1,
  RemotePlanStatusV1,
  AttemptResultV1,
  NodeResultV1,
  ResolvedTestPlanV1,
} from './types.ts';
import {
  attemptResultDigest,
  nodeResultDigest,
  remotePlanJobDigest,
  remotePlanJobId,
  remotePlanResultDigest,
  repositoryArchiveBytes,
  resolvedTestPlanDigest,
  stableTestIdentity,
} from './remote.ts';

type Validator = ((value: unknown) => boolean) & { errors?: unknown[] | null };
interface AjvInstance {
  addSchema(schema: object): void;
  compile(schema: object): Validator;
}

const schemaUrl = new URL('../schemas/pipeline-test-gate.v1.schema.json', import.meta.url);
const schema = JSON.parse(fs.readFileSync(schemaUrl, 'utf8')) as { $id: string };
const e2eResultSchemaUrl = new URL('../schemas/e2e-result.v1.schema.json', import.meta.url);
const e2eResultSchemaText = fs.readFileSync(e2eResultSchemaUrl, 'utf8');
const e2eResultSchema = JSON.parse(e2eResultSchemaText) as { $id: string };
const AjvConstructor = Ajv2020 as unknown as new (options: { allErrors: boolean; strict: boolean }) => AjvInstance;
const installFormats = addFormats as unknown as (instance: AjvInstance) => AjvInstance;
const ajv = new AjvConstructor({ allErrors: true, strict: true });
installFormats(ajv);
ajv.addSchema(schema);
ajv.addSchema(e2eResultSchema);
const validators = new Map<string, Validator>();
const validateE2eResultSchema = ajv.compile({ $ref: e2eResultSchema.$id });

export const E2E_RESULT_SCHEMA_ID = 'kubeclaw.e2e-result.v1';

export function e2eResultSchemaDigest(): string {
  return `sha256:${crypto.createHash('sha256').update(e2eResultSchemaText).digest('hex')}`;
}

export function validateE2eProviderDetails(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('TEST_PROVIDER_E2E_DETAILS_INVALID');
  const details = value as { schemaId?: unknown; schemaDigest?: unknown; values?: unknown };
  if (details.schemaId !== E2E_RESULT_SCHEMA_ID || details.schemaDigest !== e2eResultSchemaDigest()
    || !validateE2eResultSchema(details.values)) throw new Error('TEST_PROVIDER_E2E_DETAILS_INVALID');
  const result = details.values as { counts: { total: number; passed: number; failed: number; skipped: number; unexecuted: number }; testCases: Array<{ id: string; status: string }> };
  const counts = result.counts;
  if (counts.total !== counts.passed + counts.failed + counts.skipped + counts.unexecuted
    || counts.total !== result.testCases.length
    || new Set(result.testCases.map((item) => item.id)).size !== result.testCases.length
    || ['passed', 'failed', 'skipped', 'unexecuted'].some((status) => result.testCases.filter((item) => item.status === status).length !== counts[status as keyof typeof counts])) {
    throw new Error('TEST_PROVIDER_E2E_DETAILS_INVALID');
  }
}

export class PipelineTestGateContractError extends Error {
  definition: string;
  errors: string[];

  constructor(definition: string, errors: string[]) {
    super(`Invalid pipeline test-gate ${definition}: ${errors.join('; ')}`);
    this.name = 'PipelineTestGateContractError';
    this.definition = definition;
    this.errors = [...errors];
  }
}

function validator(definition: PipelineTestGateDefinition): Validator {
  const existing = validators.get(definition);
  if (existing) return existing;
  const compiled = ajv.compile({ $ref: `${schema.$id}#/$defs/${definition}` }) as Validator;
  validators.set(definition, compiled);
  return compiled;
}

function errorText(errors: unknown[] | null | undefined): string[] {
  if (!errors?.length) return ['contract validation failed without details'];
  return errors.map((error) => {
    if (!error || typeof error !== 'object') return String(error);
    const item = error as { instancePath?: string; message?: string };
    return `${item.instancePath || '/'} ${item.message || 'is invalid'}`;
  });
}

function reportAdapterResultErrors(value: ReportAdapterResultV1): string[] {
  const errors: string[] = [];
  const { counts } = value;
  if (counts.passed + counts.failed + counts.errored + counts.skipped !== counts.total) {
    errors.push('/counts outcome counts must sum to total');
  }

  const seenCaseIds = new Set<string>();
  const listedCounts: Record<ReportCaseOutcome, number> = {
    passed: 0,
    failed: 0,
    errored: 0,
    skipped: 0,
  };
  for (const reportCase of value.cases) {
    if (seenCaseIds.has(reportCase.id)) errors.push(`/cases duplicate case id: ${reportCase.id}`);
    seenCaseIds.add(reportCase.id);
    listedCounts[reportCase.outcome] += 1;
    if (reportCase.findingsTruncated !== (reportCase.omittedFindingCount > 0)) {
      errors.push(`/cases/${reportCase.id} findingsTruncated must be true exactly when findings were omitted`);
    }
  }

  if (value.casesTruncated) {
    if (value.omittedCaseCount < 1) errors.push('/omittedCaseCount must be positive when cases are truncated');
    if (value.cases.length + value.omittedCaseCount !== counts.total) {
      errors.push('/cases listed and omitted case counts must equal total');
    }
    for (const outcome of ['passed', 'failed', 'errored', 'skipped'] as const) {
      if (listedCounts[outcome] > counts[outcome]) {
        errors.push(`/cases listed ${outcome} count cannot exceed the exact report count`);
      }
    }
  } else {
    if (value.omittedCaseCount !== 0) errors.push('/omittedCaseCount must be zero when cases are complete');
    if (value.cases.length !== counts.total) errors.push('/cases must contain every case when not truncated');
    for (const outcome of ['passed', 'failed', 'errored', 'skipped'] as const) {
      if (listedCounts[outcome] !== counts[outcome]) {
        errors.push(`/cases ${outcome} count must match report counts when not truncated`);
      }
    }
  }

  if (value.findingsTruncated !== (value.omittedFindingCount > 0)) {
    errors.push('/findingsTruncated must be true exactly when findings were omitted');
  }
  return errors;
}

function resolvedTestPlanErrors(value: ResolvedTestPlanV1): string[] {
  const errors: string[] = resolvedCoverageErrors(value);
  for (const node of value.nodes) {
    const expected = stableTestIdentity({ project: value.project, moduleId: value.scope.moduleId,
      gateId: value.scope.gateId, suiteInstanceId: node.suiteInstanceId, nodeId: node.id, variation: node.variation });
    if (node.testIdentity !== expected) errors.push(`/nodes/${node.id}/testIdentity must match the stable declared identity`);
  }
  return errors;
}

function remotePlanJobErrors(value: RemotePlanJobV1): string[] {
  const errors: string[] = resolvedTestPlanErrors(value.plan);
  try { repositoryArchiveBytes(value.repositoryArchive); }
  catch { errors.push('/repositoryArchive bytes, size, and digest must match'); }
  if (value.sourceSnapshot.archiveContentDigest !== value.repositoryArchive.contentDigest
    || value.sourceSnapshot.archiveSizeBytes !== value.repositoryArchive.sizeBytes) {
    errors.push('/sourceSnapshot must bind the exact repository archive');
  }
  if (value.sourceSnapshot.pipelineStageId !== value.pipelineStageId) {
    errors.push('/sourceSnapshot/pipelineStageId must match the owning pipeline stage');
  }
  if (value.sourceSnapshot.attestation.authority !== value.sourceSnapshot.creatorAuthority) {
    errors.push('/sourceSnapshot/attestation/authority must match creatorAuthority');
  }
  if (remotePlanJobDigest(value) !== value.requestDigest) {
    errors.push('/requestDigest must match the canonical job content');
  }
  if (remotePlanJobId(value.idempotencyKey) !== value.jobId) {
    errors.push('/jobId must be derived from the idempotency key');
  }
  if (resolvedTestPlanDigest(value.plan) !== value.plan.planDigest) {
    errors.push('/plan/planDigest must match the canonical resolved plan content');
  }
  errors.push(...resolvedTestPlanErrors(value.plan).map((error) => `/plan${error}`));
  const nodeIds = [...value.plan.nodes.map((node) => node.id)].sort();
  const grantIds = Object.keys(value.grants).sort();
  if (JSON.stringify(nodeIds) !== JSON.stringify(grantIds)) {
    errors.push('/grants must contain exactly one entry for each plan node');
  }
  for (const [nodeId, grants] of Object.entries(value.grants)) {
    if (JSON.stringify(grants) !== JSON.stringify([...grants].sort())) {
      errors.push(`/grants/${nodeId} must use canonical sorted order`);
    }
  }
  return errors;
}

function remotePlanResultErrors(value: RemotePlanResultV1): string[] {
  const errors: string[] = [];
  if (remotePlanResultDigest(value) !== value.resultDigest) {
    errors.push('/resultDigest must match the canonical result content');
  }
  const attemptIds = new Set<string>();
  for (const attempt of value.attempts) {
    if (attemptIds.has(attempt.attemptId)) errors.push(`/attempts duplicate attempt: ${attempt.attemptId}`);
    attemptIds.add(attempt.attemptId);
    if (attempt.planId !== value.planId || attempt.runId !== value.runId) {
      errors.push(`/attempts/${attempt.attemptId} result ownership does not match the remote result`);
    }
    errors.push(...attemptResultErrors(attempt).map((error) => `/attempts/${attempt.attemptId}${error}`));
  }
  const nodeIds = new Set<string>();
  for (const node of value.nodes) {
    if (nodeIds.has(node.nodeId)) errors.push(`/nodes duplicate node: ${node.nodeId}`);
    nodeIds.add(node.nodeId);
    if (node.planId !== value.planId || node.runId !== value.runId) {
      errors.push(`/nodes/${node.nodeId} result ownership does not match the remote result`);
    }
    errors.push(...nodeResultErrors(node).map((error) => `/nodes/${node.nodeId}${error}`));
    if (node.attemptIds.some((attemptId) => !attemptIds.has(attemptId))) {
      errors.push(`/nodes/${node.nodeId} references an unknown attempt`);
    }
  }
  return errors;
}

function attemptResultErrors(value: AttemptResultV1): string[] {
  return attemptResultDigest(value) === value.resultDigest
    ? [] : ['/resultDigest must match the canonical attempt result content'];
}

function nodeResultErrors(value: NodeResultV1): string[] {
  return nodeResultDigest(value) === value.resultDigest
    ? [] : ['/resultDigest must match the canonical node result content'];
}

function remotePlanStatusErrors(value: RemotePlanStatusV1): string[] {
  const errors: string[] = [];
  if (value.state === 'completed') {
    if (!value.result || value.error !== null) errors.push('/completed status requires only a result');
  } else if (value.state === 'failed' || value.state === 'cancelled') {
    if (value.result !== null || value.error === null) errors.push('/ terminal failure status requires only an error');
  } else if (value.result !== null || value.error !== null) {
    errors.push('/ non-terminal status cannot contain a result or error');
  }
  if (Date.parse(value.updatedAt) < Date.parse(value.submittedAt)) {
    errors.push('/updatedAt cannot be before submittedAt');
  }
  return errors;
}

export function checkPipelineTestGateContract(definition: PipelineTestGateDefinition, value: unknown): ContractValidationResult {
  const validate = validator(definition);
  const ok = validate(value);
  if (!ok) return { ok: false, errors: errorText(validate.errors) };
  const semanticErrors = definition === 'gateCoverageResult' ? gateCoverageResultErrors(value as GateCoverageResultV1)
    : definition === 'gateCoverage' ? gateCoverageErrors(value as GateCoverageV1)
    : definition === 'reportAdapterResult'
    ? reportAdapterResultErrors(value as ReportAdapterResultV1)
    : definition === 'resolvedTestPlan'
      ? resolvedTestPlanErrors(value as ResolvedTestPlanV1)
      : definition === 'attemptResult'
      ? attemptResultErrors(value as AttemptResultV1)
      : definition === 'nodeResult'
        ? nodeResultErrors(value as NodeResultV1)
        : definition === 'remotePlanJob'
      ? remotePlanJobErrors(value as RemotePlanJobV1)
      : definition === 'remotePlanResult'
        ? remotePlanResultErrors(value as RemotePlanResultV1)
        : definition === 'remotePlanStatus'
          ? remotePlanStatusErrors(value as RemotePlanStatusV1)
          : [];
  return { ok: semanticErrors.length === 0, errors: semanticErrors };
}

export function validatePipelineTestGateContract(definition: PipelineTestGateDefinition, value: unknown): void {
  const result = checkPipelineTestGateContract(definition, value);
  if (!result.ok) throw new PipelineTestGateContractError(definition, result.errors);
}
