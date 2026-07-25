import fs from 'fs';
import path from 'path';
import { getPipelineArtifactBundle } from '../services/artifact-bundle.ts';
import { buildPipelineStepResult, PIPELINE_STEP_ACTIONS, PIPELINE_STEP_OUTCOMES, PIPELINE_STEP_TYPES } from '../services/contracts/pipeline-step-result.ts';
import { PIPELINE_TERMINAL_ACTIONS, PIPELINE_TERMINAL_SCOPES } from '../services/contracts/terminal-decision.ts';
import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';

type AnyRecord = Record<string, any>;
const NOVA_HANDOFF_UNACKNOWLEDGED_CODE = 'nova_handoff_delivery_unacknowledged';
const OBSERVABILITY_DEGRADED_CODE = 'observability_degraded';
const OBSERVABILITY_HEALTH_SCOPE_DEFAULT = 'default';
const DEGRADED_EVIDENCE_ACTION_REQUIRED = 'Resolve the degraded evidence at its source, then emit/record canonical restored or acknowledged evidence before claiming clean autonomous success.';
function keySegment(value: unknown): string { return selectTruthyValue(() => value === undefined, () => value === null) ? '' : String(value); }

function normalizeDegradedEvidenceEntries(value: unknown): AnyRecord[] {
  const entries = Array.isArray(value) ? value : value ? [value] : [];
  return entries
    .filter((entry: any): entry is AnyRecord => Boolean(entry) && typeof entry === 'object' && !Array.isArray(entry))
    .filter((entry: any) => entry.resolved !== true && entry.resolved_at == null && entry.allow_clean_success !== true);
}

function readJsonlObjects(filePath: string | null | undefined): AnyRecord[] {
  if (!filePath) return [];
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line: any) => line.trim())
    .map((line: any, index: any) => {
      try {
        const parsed = JSON.parse(line);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
      } catch (error: unknown) {
        return {
          code: 'nova_handoff_delivery_log_invalid',
          surface: 'gateway_sessions_send',
          message: error instanceof Error ? error.message : String(error),
          path: filePath,
          line: index + 1,
        };
      }
    })
    .filter((entry: any): entry is AnyRecord => Boolean(entry));
}

function discordReceiptPaths(config: AnyRecord): string[] {
  const artifacts = getPipelineArtifactBundle(config);
  return [
    artifacts.pipeline_dir ? path.join(artifacts.pipeline_dir, 'discord-deliveries.jsonl') : null,
    artifacts.run_log_dir ? path.join(artifacts.run_log_dir, 'discord-deliveries.jsonl') : null,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);
}

function requireDiscordReceiptForCleanSuccess(config: AnyRecord, progress: AnyRecord): boolean {
  return selectTruthyValue(() => (config?.evidence?.require_discord_delivery_receipt === true), () => (progress?.evidence?.require_discord_delivery_receipt === true));
}

function requiresFinalPreviewReceipt(progress: AnyRecord): boolean {
  if (!executionOrderIncludes(progress, 'gate:final-buster')) return false;
  const k8s = progress?.gates?.['final-buster']?.test_config?.k8s;
  const preview = k8s?.preview;
  return Boolean(selectTruthyValue(
    () => k8s?.purpose === 'final-preview',
    () => preview?.provider === 'tailscale-ingress',
    () => k8s?.preview_exposure_provider === 'tailscale-ingress',
  ));
}

function executionOrderIncludes(progress: AnyRecord, step: string): boolean {
  const order = Array.isArray(progress?.execution_order) ? progress.execution_order : [];
  return order.includes(step);
}

function collectMissingRequiredDiscordReceipt(config: AnyRecord, progress: AnyRecord): AnyRecord[] {
  if (!requireDiscordReceiptForCleanSuccess(config, progress)) return [];
  const runId = selectDefinedValue(() => (config?._runId), () => (null));
  const project = selectDefinedValue(() => (config?.project), () => (null));
  const finalPreviewReceiptRequired = requiresFinalPreviewReceipt(progress);
  const receipts = discordReceiptPaths(config).flatMap((filePath: any) => readJsonlObjects(filePath));
  const delivered = receipts.some((entry: any) => entry.run_id === runId
    && entry.project === project
    && entry.ok === true
    && entry.message_id
    && entry.channel_id
    && entry.webhook_message_returned === true
    && (finalPreviewReceiptRequired ? entry.correlation?.gate_id === 'final-buster' : true));
  if (delivered) return [];
  return [{
    code: finalPreviewReceiptRequired ? 'final_preview_discord_delivery_receipt_missing' : 'discord_delivery_receipt_missing',
    surface: 'discord_webhook_receipt',
    message: finalPreviewReceiptRequired
      ? 'Required final-preview Discord delivery receipt is missing for clean pipeline success'
      : 'Required Discord delivery receipt is missing for clean pipeline success',
    run_id: runId,
    project,
    ...(finalPreviewReceiptRequired ? { gate_id: 'final-buster' } : {}),
  }];
}

function collectUnacknowledgedNovaHandoffs(config: AnyRecord): AnyRecord[] {
  const artifacts = getPipelineArtifactBundle(config);
  const runId = selectDefinedValue(() => (config?._runId), () => (null));
  const paths = [
    artifacts.global_nova_injections_jsonl_path,
    artifacts.run_nova_injections_jsonl_path,
  ].filter(Boolean);
  const entries = paths.flatMap((filePath: any) => readJsonlObjects(filePath));
  return entries
    .filter((entry: any) => selectTruthyValue(() => (selectTruthyValue(() => (['nova_handoff_delivery_log_invalid'].includes(entry.code)), () => (!runId))), () => (entry.run_id === runId)))
    .filter((entry: any) => selectTruthyValue(() => (['nova_handoff_delivery_log_invalid'].includes(entry.code)), () => ((entry.delivery_content_known === true && entry.delivery_acknowledged !== true))))
    .map((entry: any) => ({
      code: selectDefinedValue(() => (entry.code), () => (NOVA_HANDOFF_UNACKNOWLEDGED_CODE)),
      surface: 'gateway_sessions_send',
      message: (selectDefinedValue(() => (entry.error), () => (`Nova session handoff was not acknowledged for ${(selectDefinedValue(() => (entry.step_type), () => ('step_type_not_emitted')))}:${(selectDefinedValue(() => (entry.step_id), () => ('step_id_not_emitted')))}`))),
      run_id: selectDefinedValue(() => (entry.run_id), () => (null)),
      step_type: selectDefinedValue(() => (entry.step_type), () => (null)),
      step_id: selectDefinedValue(() => (entry.step_id), () => (null)),
      delivery_status: (selectDefinedValue(() => (entry.delivery_status), () => (null))),
    }));
}

function observabilityEventKey(entry: AnyRecord, runId: string | null): string {
  return [
    keySegment(entry.project),
    keySegment(selectDefinedValue(() => (entry.run_id), () => (runId))),
    keySegment(entry.component),
    keySegment(entry.surface),
    keySegment(entry.reason),
    keySegment(selectDefinedValue(() => (entry.scope), () => (OBSERVABILITY_HEALTH_SCOPE_DEFAULT))),
  ].join('\x1f');
}

function collectUnresolvedObservabilityDegraded(config: AnyRecord): AnyRecord[] {
  const artifacts = getPipelineArtifactBundle(config);
  const runId = selectDefinedValue(() => (config?._runId), () => (null));
  const paths = [
    artifacts.global_pipeline_jsonl_path,
    artifacts.run_pipeline_jsonl_path,
  ].filter(Boolean);
  const entries = paths.flatMap((filePath: any) => readJsonlObjects(filePath));
  const unresolved = new Map<string, AnyRecord>();

  for (const entry of entries) {
    if (runId && entry.run_id && entry.run_id !== runId) continue;
    if (entry.type !== 'observability.degraded' && entry.type !== 'observability.restored') continue;
    const key = observabilityEventKey(entry, runId);
    if (entry.type === 'observability.restored') {
      unresolved.delete(key);
      continue;
    }
    unresolved.set(key, entry);
  }

  return [...unresolved.values()].map((entry: any) => ({
    code: selectDefinedValue(() => (entry.reason), () => (OBSERVABILITY_DEGRADED_CODE)),
    surface: (selectDefinedValue(() => ([entry.component, entry.surface].filter(Boolean).join(':')), () => ('observability'))),
    source: (selectDefinedValue(() => (entry.emitter), () => ('observability'))),
    message: (selectDefinedValue(() => (entry.detail), () => (`Observability degraded: ${(selectDefinedValue(() => (entry.component), () => ('component_not_emitted')))} ${(selectDefinedValue(() => (entry.surface), () => ('surface_not_emitted')))} ${(selectDefinedValue(() => (entry.reason), () => ('reason_not_emitted')))}`))),
    run_id: degradedEvidenceRunId(entry, runId),
    project: (selectDefinedValue(() => (entry.project), () => (null))),
    step_type: selectDefinedValue(() => (entry.step_type), () => (null)),
    step_id: selectDefinedValue(() => (entry.step_id), () => (null)),
    action_required: 'Resolve or restore this observability degradation before claiming clean autonomous pipeline success.',
  }));
}

function degradedEvidenceRunId(entry: AnyRecord, runId: string | null): string | null {
  if (typeof entry?.run_id === 'string' && entry.run_id.trim()) return entry.run_id.trim();
  return runId;
}

function collectUnresolvedDegradedEvidence(config: AnyRecord, progress: AnyRecord): AnyRecord[] {
  return [
    ...normalizeDegradedEvidenceEntries(config?._startupDegradedEvidence),
    ...normalizeDegradedEvidenceEntries(config?._degradedEvidence),
    ...normalizeDegradedEvidenceEntries(progress?._degradedEvidence),
    ...normalizeDegradedEvidenceEntries(progress?.degraded_evidence),
    ...collectUnresolvedObservabilityDegraded(config),
    ...collectMissingRequiredDiscordReceipt(config, progress),
    ...collectUnacknowledgedNovaHandoffs(config),
  ];
}

export function buildDegradedEvidenceBlockedResult(config: AnyRecord, progress: AnyRecord): AnyRecord | null {
  const evidence = collectUnresolvedDegradedEvidence(config, progress);
  if (evidence.length === 0) return null;
  const reason = `Pipeline has unresolved degraded/manual fallback evidence (${evidence.length}); clean autonomous success is not allowed`;
  const degradedEvidence = evidence.map((entry: any) => ({
    code: selectDefinedValue(() => (selectDefinedValue(() => (entry.code), () => (entry.reason))), () => (null)),
    surface: selectDefinedValue(() => (selectDefinedValue(() => (entry.surface), () => (entry.component))), () => (null)),
    source: selectDefinedValue(() => (selectDefinedValue(() => (entry.source), () => (entry.emitter))), () => (null)),
    message: selectDefinedValue(() => (selectDefinedValue(() => (selectDefinedValue(() => (entry.message), () => (entry.detail))), () => (entry.summary))), () => (null)),
    step_type: selectDefinedValue(() => (entry.step_type), () => (null)),
    step_id: selectDefinedValue(() => (entry.step_id), () => (null)),
    run_id: selectDefinedValue(() => (entry.run_id), () => (null)),
    action_required: selectDefinedValue(() => (entry.action_required), () => (DEGRADED_EVIDENCE_ACTION_REQUIRED)),
  }));
  return buildPipelineStepResult({
    stepType: PIPELINE_STEP_TYPES.PIPELINE,
    stepId: 'degraded_evidence',
    nextAction: PIPELINE_STEP_ACTIONS.HALT,
    outcome: PIPELINE_STEP_OUTCOMES.BLOCKED,
    issueType: 'environment',
    reason,
    diagnostics: {
      summary: reason,
      metadata: {
        degraded_evidence_count: evidence.length,
        degraded_evidence: degradedEvidence,
        action_required: 'Resolve every degraded evidence item through its owning canonical evidence path; do not mark the run clean while any entry remains unresolved.',
      },
    },
    correlation: {
      run_id: selectDefinedValue(() => (selectDefinedValue(() => (config?._runId), () => (config?.run_id))), () => (null)),
    },
    terminalAction: PIPELINE_TERMINAL_ACTIONS.REQUEST_HANDOFF,
    terminalScope: PIPELINE_TERMINAL_SCOPES.PIPELINE,
    terminalReasonCode: 'degraded_evidence_requires_handoff',
    terminalHumanReason: reason,
    terminalSource: 'pipeline:degraded_evidence',
  });
}
