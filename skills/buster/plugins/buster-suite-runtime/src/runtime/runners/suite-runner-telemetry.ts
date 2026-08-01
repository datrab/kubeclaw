import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import { emitEvent, emitPluginEvent } from '../services/telemetry.ts';
import { publishSuiteArtifacts } from '../services/quality-artifacts.ts';
import { STATUS } from '../services/verdict-schema.ts';
import type { SuiteVerdict } from '../services/verdict-schema.ts';

function optionalNumber(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function optionalBoolean(value: unknown): boolean | null { return typeof value === 'boolean' ? value : null; }

async function publishArtifacts(tctx: unknown, moduleId: string | undefined, gateId: unknown, suiteName: string, result: SuiteVerdict, attempt: number | undefined): Promise<string[]> {
  const artifacts = publishSuiteArtifacts(tctx as Record<string, unknown> | null, { moduleId, gateId, suiteName, result, attempt });
  for (const artifact of artifacts) await emitEvent(tctx, 'artifact.published', { artifact_id: artifact.artifact_id,
    logical_id: artifact.logical_id, kind: artifact.kind, media_type: artifact.media_type, byte_length: artifact.byte_length,
    sha256: artifact.sha256, content_class: artifact.content_class, reference: artifact.reference, completeness: artifact.completeness,
    original_byte_length: artifact.original_byte_length, original_sha256: artifact.original_sha256, transformation: artifact.transformation });
  return artifacts.map((artifact) => artifact.reference).filter((reference): reference is string => typeof reference === 'string');
}

function eventIdentity(telemetry: Record<string, any> | null, moduleId: string | undefined): Record<string, unknown> {
  const gateId = telemetry?.gateId ?? null;
  return gateId ? { module_id: null, gate_id: gateId, gate_type: telemetry?.gateType ?? null } : { module_id: moduleId };
}

function topFinding(result: SuiteVerdict): string | null {
  const finding = result.findings?.[0]?.message;
  if (typeof finding === 'string') return finding;
  if (typeof result.reason === 'string') return result.reason;
  return typeof result.error === 'string' ? result.error : null;
}

function completionPayload(identity: Record<string, unknown>, suiteName: string, result: SuiteVerdict, attempt: number | undefined, startMs: number): Record<string, unknown> {
  return { ...identity, suite: suiteName, attempt, status: result.status, duration_seconds: Math.round((Date.now() - startMs) / 1000),
    checks_passed: optionalNumber(result.checks_passed), checks_failed: optionalNumber(result.checks_failed),
    critical: optionalBoolean(result.critical), reason: result.reason ?? null, error: result.error ?? null, top_finding: topFinding(result) };
}

async function emitInfrastructureEvidence(tctx: unknown, identity: Record<string, unknown>, suiteName: string, result: SuiteVerdict, attempt: number | undefined): Promise<void> {
  if (!['k8s', 'health', 'tailscale-preview'].includes(suiteName)) return;
  await emitEvent(tctx, 'infrastructure.evidence', { ...identity, attempt, evidence_type: `suite.${suiteName}`, status: result.status,
    readiness: suiteName === 'health' ? result.status === STATUS.PASS : null,
    preview_url: typeof result.metadata?.preview_url === 'string' ? result.metadata.preview_url : null, workload: result.metadata ?? null });
}

export async function emitSuiteCompleted(tctx: unknown, moduleId: string | undefined, suiteName: string, result: SuiteVerdict, attempt: number | undefined, startMs: number): Promise<void> {
  const telemetry = tctx && typeof tctx === 'object' ? tctx as Record<string, any> : null;
  const identity = eventIdentity(telemetry, moduleId);
  const references = await publishArtifacts(tctx, moduleId, telemetry?.gateId ?? null, suiteName, result, attempt);
  await emitPluginEvent(tctx, 'suite_completed', completionPayload(identity, suiteName, result, attempt, startMs));
  await emitEvent(tctx, 'quality.evidence', { ...identity, attempt, item_type: 'suite', suite: suiteName, verdict: result.status,
    skipped_reason: result.status === STATUS.SKIP ? result.reason ?? 'dependency' : null, findings: result.findings ?? [],
    dispositions: [], artifact_references: references });
  await emitInfrastructureEvidence(tctx, identity, suiteName, result, attempt);
}
