import fs from 'fs';
import path from 'path';
import { sanitizeJsonEgress } from '../egress.ts';
import { buildGovernanceSummary } from './governance-context.ts';
import {
  buildLatestPointer,
  buildRunCostSummary,
  buildRunTestSummary,
  buildSummaryArtifactBundle,
} from './artifact-bundle.ts';
import {
  finalizeSummaryEvidence,
  summaryEvidenceFields,
} from './evidence-plane.ts';

const COMPLETED_TERMINAL_STATUSES = new Set([0, 'succeeded', 'completed']);

function requirePath(bundle: any, key: string) {
  const value = bundle?.[key];
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new Error(`pipeline artifact bundle.${key}: required non-empty string`);
}

function buildUsageSummary(usageAggregate: any) {
  const run = usageAggregate?.run;
  return {
    total_input_tokens: run?.input_tokens ?? null,
    total_output_tokens: run?.output_tokens ?? null,
    total_tokens: run ? run.input_tokens + run.output_tokens : null,
    cost_usd: run?.estimated_cost_usd ?? null,
    cost_availability: run?.estimated_cost_usd != null
      ? 'available from OpenClaw model.usage diagnostics'
      : 'unavailable — no OpenClaw model.usage USD aggregate yet',
  };
}

export function buildSummaryPayload(input: any) {
  const relativeCostPath = input.budget.costReportPath
    ? path.relative(input.config.repo_root, input.budget.costReportPath)
    : null;
  return {
    run_id: input.artifactBundle.run_id,
    pipeline_run_id: input.artifactBundle.run_id,
    started_at: input.startedAt,
    completed_at: input.completedAt,
    ended_at: input.completedAt,
    terminal_status: input.terminalStatus ?? null,
    terminal_decision: input.terminalDecision ?? null,
    reason_code: input.reasonCode,
    project: input.config.project,
    telemetry_stream_key: input.artifactBundle.telemetry_stream_key,
    duration_seconds: input.durationSeconds,
    run_stats: input.runStats,
    run_facts: input.runFacts,
    modules: input.runFacts.modules,
    gates: input.runFacts.gates,
    tests: buildRunTestSummary(input.runFacts),
    ...(input.cumulative ? { cumulative: input.cumulative } : {}),
    governance: buildGovernanceSummary(input.config),
    usage: buildUsageSummary(input.budget.usageAggregate),
    budget_threshold_status: input.budget.budgetStatus,
    cost_report_path: relativeCostPath,
    cost: buildRunCostSummary({
      usageAggregate: input.budget.usageAggregate,
      budgetStatus: input.budget.budgetStatus,
      costReportPath: relativeCostPath,
    }),
    artifacts: buildSummaryArtifactBundle(input.config),
  };
}

function normalizeLatestSummaryStatus(terminalStatus: any) {
  if (terminalStatus == null) return 'running';
  return COMPLETED_TERMINAL_STATUSES.has(terminalStatus)
    ? 'completed'
    : 'failed';
}

function persistLatestPointer(input: any) {
  const latestPath = requirePath(input.artifactBundle, 'latest_json_path');
  const pointer = buildLatestPointer(input.config, {
    status: normalizeLatestSummaryStatus(input.terminalStatus),
    startedAt: input.summary.started_at ?? null,
    completedAt: input.summary.completed_at ?? null,
    terminalStatus: input.terminalStatus,
    terminalDecision: input.terminalDecision ?? null,
    runFacts: input.runFacts,
    usageAggregate: input.budget.usageAggregate,
    budgetStatus: input.budget.budgetStatus,
    costReportPath: input.summary.cost_report_path,
  });
  const temporaryPath = `${latestPath}.tmp`;
  fs.writeFileSync(
    temporaryPath,
    JSON.stringify(sanitizeJsonEgress(pointer, 'latest_pointer'), null, 2)
  );
  fs.renameSync(temporaryPath, latestPath);
}

export function persistSummary(input: any) {
  const evidence = finalizeSummaryEvidence(input.config, {
    progress: input.progress,
    terminalStatus: input.terminalStatus,
    reasonCode: input.reasonCode,
    durationSeconds: input.durationSeconds,
    runStats: input.runStats,
    cost: input.summary.cost,
    summaryReference: input.artifactBundle.relative.summary_json,
  });
  Object.assign(input.summary, summaryEvidenceFields(evidence));
  const enriched = sanitizeJsonEgress(input.summary, 'pipeline_summary');
  fs.mkdirSync(
    requirePath(input.artifactBundle, 'run_log_dir'),
    { recursive: true }
  );
  fs.writeFileSync(
    requirePath(input.artifactBundle, 'run_summary_path'),
    JSON.stringify(enriched, null, 2)
  );
  fs.writeFileSync(
    requirePath(input.artifactBundle, 'pipeline_summary_path'),
    JSON.stringify(enriched, null, 2)
  );
  persistLatestPointer(input);
}
