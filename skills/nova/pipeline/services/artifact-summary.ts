import path from 'path';
import { getRunId } from '../core/runtime.ts';
import {
  pipelineLogDir,
  resolvePipelineRunLogDir,
} from '../core/paths.ts';
import { getTelemetryStreamKey } from '../telemetry.ts';
import { isPlainObject } from './validation.ts';
import {
  PIPELINE_ARTIFACT_SURFACES,
  buildPipelineArtifactAuthorityPolicy,
  projectPipelineArtifactEvidence,
} from './artifact-authority.ts';

function numberOrNull(value: any) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
}

function countFacts(value: any) {
  if (!isPlainObject(value)) {
    return {
      total: null,
      completed: null,
      failed_or_blocked: null,
      pending: null,
      status_counts: {},
    };
  }
  return {
    total: numberOrNull(value.total),
    completed: numberOrNull(value.completed),
    failed_or_blocked: numberOrNull(value.failed_or_blocked),
    pending: numberOrNull(value.pending),
    status_counts: isPlainObject(value.status_counts)
      ? { ...value.status_counts }
      : {},
  };
}

export function buildRunTestSummary(runFacts: any = null) {
  const agents = isPlainObject(runFacts?.agents) ? runFacts.agents : {};
  return {
    source: runFacts ? 'run_facts' : 'not_available',
    modules: countFacts(runFacts?.modules),
    gates: countFacts(runFacts?.gates),
    attempts: {
      forge: numberOrNull(agents.forge),
      buster: numberOrNull(agents.buster),
      echo: numberOrNull(agents.echo),
      total_agents: numberOrNull(agents.total),
    },
  };
}

export function buildRunCostSummary(input: any = {}) {
  const {
    usageAggregate = null,
    budgetStatus = null,
    costReportPath = null,
  } = input;
  const usage = isPlainObject(usageAggregate?.run)
    ? usageAggregate.run
    : {};
  const inputTokens = numberOrNull(usage.input_tokens);
  const outputTokens = numberOrNull(usage.output_tokens);
  return {
    source: usageAggregate ? 'model_usage' : 'not_available',
    total_input_tokens: inputTokens,
    total_output_tokens: outputTokens,
    total_tokens: inputTokens != null && outputTokens != null
      ? inputTokens + outputTokens
      : null,
    estimated_cost_usd: numberOrNull(usage.estimated_cost_usd),
    budget_threshold_status: budgetStatus ?? null,
    cost_report_path: costReportPath ?? null,
  };
}

function resolveRunId(config: any) {
  for (const value of [config?._runId, config?.run_id, getRunId(config)]) {
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function relativeArtifactPaths(runId: any) {
  const runDir = runId ? `runs/${runId}` : null;
  const runPath = (name: string) => runDir ? `${runDir}/${name}` : null;
  return {
    run_dir: runDir,
    path: runDir,
    pipeline_jsonl: runPath('pipeline.jsonl'),
    discord_jsonl: runPath('discord.jsonl'),
    summary_json: runPath('summary.json'),
    nova_injections_jsonl: runPath('nova-injections.jsonl'),
    quarantine_jsonl: runPath('quarantine.jsonl'),
    redis_exchanges_jsonl: runPath('redis/redis-exchanges.jsonl'),
    redis_ops_jsonl: runPath('redis/redis-ops.jsonl'),
    pipeline_summary_json: 'summary.json',
    latest_json: 'latest.json',
  };
}

function artifactAuthority(relative: any, runId: any) {
  const evidence = (
    surface: string,
    artifactPath: any,
    artifact: any = { run_id: runId }
  ) => projectPipelineArtifactEvidence({
    surface,
    path: artifactPath,
    artifact,
    expectedRunId: runId,
  });
  return {
    pipeline_jsonl: evidence(
      PIPELINE_ARTIFACT_SURFACES.RUN_PIPELINE_JSONL,
      relative.pipeline_jsonl
    ),
    discord_jsonl: evidence(
      PIPELINE_ARTIFACT_SURFACES.RUN_DISCORD_JSONL,
      relative.discord_jsonl
    ),
    summary_json: evidence(
      PIPELINE_ARTIFACT_SURFACES.RUN_SUMMARY_JSON,
      relative.summary_json
    ),
    latest_json: evidence(
      PIPELINE_ARTIFACT_SURFACES.LATEST_JSON,
      relative.latest_json
    ),
    pipeline_summary_json: evidence(
      PIPELINE_ARTIFACT_SURFACES.PIPELINE_SUMMARY_JSON,
      relative.pipeline_summary_json
    ),
    quarantine_jsonl: evidence(
      PIPELINE_ARTIFACT_SURFACES.QUARANTINE,
      relative.quarantine_jsonl,
      { run_id: runId, schema_version: 'quarantined_payload.v1' }
    ),
  };
}

function absoluteArtifactPaths(pipelineDir: any, runLogDir: any) {
  const pipelinePath = (name: string) =>
    pipelineDir ? path.join(pipelineDir, name) : null;
  const runPath = (...segments: string[]) =>
    runLogDir ? path.join(runLogDir, ...segments) : null;
  return {
    latest_json_path: pipelinePath('latest.json'),
    global_pipeline_jsonl_path: pipelinePath('pipeline.jsonl'),
    global_discord_jsonl_path: pipelinePath('discord.jsonl'),
    pipeline_summary_path: pipelinePath('summary.json'),
    global_nova_injections_jsonl_path: pipelinePath('nova-injections.jsonl'),
    global_quarantine_jsonl_path: pipelinePath('quarantine.jsonl'),
    run_pipeline_jsonl_path: runPath('pipeline.jsonl'),
    run_discord_jsonl_path: runPath('discord.jsonl'),
    run_summary_path: runPath('summary.json'),
    run_nova_injections_jsonl_path: runPath('nova-injections.jsonl'),
    run_quarantine_jsonl_path: runPath('quarantine.jsonl'),
    run_redis_exchanges_jsonl_path: runPath('redis', 'redis-exchanges.jsonl'),
    run_redis_ops_jsonl_path: runPath('redis', 'redis-ops.jsonl'),
  };
}

export function getPipelineArtifactBundle(config: any = {}) {
  const runId = resolveRunId(config);
  const pipelineDir = pipelineLogDir(config);
  const runLogDir = resolvePipelineRunLogDir(config, runId);
  const relative = relativeArtifactPaths(runId);
  return {
    run_id: runId,
    telemetry_stream_key: config?.project && runId
      ? getTelemetryStreamKey(config.project, runId)
      : null,
    pipeline_dir: pipelineDir,
    run_log_dir: runLogDir,
    ...absoluteArtifactPaths(pipelineDir, runLogDir),
    relative,
    authority: artifactAuthority(relative, runId),
  };
}

function latestRelativeArtifacts(relative: any) {
  return {
    run_dir: relative.run_dir,
    path: relative.path,
    pipeline_jsonl: relative.pipeline_jsonl,
    discord_jsonl: relative.discord_jsonl,
    summary_json: relative.summary_json,
    nova_injections_jsonl: relative.nova_injections_jsonl,
    quarantine_jsonl: relative.quarantine_jsonl,
    redis_exchanges_jsonl: relative.redis_exchanges_jsonl,
    redis_ops_jsonl: relative.redis_ops_jsonl,
  };
}

export function buildLatestPointer(config: any = {}, input: any = {}) {
  const options = {
    status: 'running',
    startedAt: null,
    completedAt: null,
    terminalStatus: null,
    terminalDecision: null,
    runFacts: null,
    usageAggregate: null,
    budgetStatus: null,
    costReportPath: null,
    ...input,
  };
  const {
    status,
    startedAt,
    completedAt,
    terminalStatus,
    terminalDecision,
    runFacts,
    usageAggregate,
    budgetStatus,
    costReportPath,
  } = options;
  const artifacts = getPipelineArtifactBundle(config);
  return {
    run_id: artifacts.run_id,
    pipeline_run_id: artifacts.run_id,
    status,
    telemetry_stream_key: artifacts.telemetry_stream_key,
    authority: buildPipelineArtifactAuthorityPolicy({
      surface: PIPELINE_ARTIFACT_SURFACES.LATEST_JSON,
      artifact: {
        run_id: artifacts.run_id,
        status,
        terminal_status: terminalStatus,
      },
      expectedRunId: artifacts.run_id,
    }),
    ...latestRelativeArtifacts(artifacts.relative),
    started_at: startedAt,
    completed_at: completedAt,
    terminal_status: terminalStatus,
    terminal_decision: terminalDecision,
    run_facts: runFacts,
    module_statuses: runFacts?.modules ?? null,
    modules: runFacts?.modules ?? null,
    gates: runFacts?.gates ?? null,
    tests: buildRunTestSummary(runFacts),
    cost: buildRunCostSummary({
      usageAggregate,
      budgetStatus,
      costReportPath,
    }),
  };
}

export function buildSummaryArtifactBundle(config: any = {}) {
  const artifacts = getPipelineArtifactBundle(config);
  return {
    ...artifacts.relative,
    authority: artifacts.authority,
  };
}
