import fs from 'fs';

import { getOptionalRunStats } from '../core/runtime.ts';
import { getPipelineArtifactBundle } from './artifact-bundle.ts';
import { loadLifecycleReadModels } from './status-store-lifecycle.ts';
import { canonicalFingerprint } from '../portable-artifacts.ts';

import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';

function recordOrEmpty(value: any) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function textOrNull(value: any) {
  if (selectTruthyValue(() => (value === undefined), () => (value === null))) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function readJsonIfPresent(filePath: string | null) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return null;
  }
}

function sortedUnique(values: any[]) {
  return [...new Set(values.map(textOrNull).filter(Boolean))].sort();
}
function nonSecret(value:any):any { if(Array.isArray(value))return value.map(nonSecret);if(!value||typeof value!=='object')return value;return Object.fromEntries(Object.entries(value).filter(([key])=>!/secret|token|password|credential|api.?key/i.test(key)).map(([key,item])=>[key,nonSecret(item)])); }

function lifecycleReadModels(config: any) {
  try {
    return loadLifecycleReadModels({ ...config, _lifecycleReadOnly: true });
  } catch (_error) {
    return null;
  }
}

function latestSummary(config: any) {
  try {
    const artifacts = getPipelineArtifactBundle(config);
    return readJsonIfPresent(artifacts.pipeline_summary_path)
      || readJsonIfPresent(artifacts.run_summary_path);
  } catch (_error) {
    return null;
  }
}

function statusCounts(entries: any[]) {
  const counts: Record<string, number> = {};
  for (const entry of entries) {
    const status = textOrNull(entry?.status) || 'UNKNOWN';
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

function moduleFacts(progress: any, readModels: any) {
  const progressModules = recordOrEmpty(progress?.modules);
  const lifecycleModules = recordOrEmpty(readModels?.modules);
  const ids = sortedUnique([...Object.keys(progressModules), ...Object.keys(lifecycleModules)]);
  const entries = ids.map((id) => {
    const configured = recordOrEmpty(progressModules[id]);
    const lifecycle = recordOrEmpty(lifecycleModules[id]);
    return {
      id,
      title: textOrNull(configured.title),
      dir: textOrNull(configured.dir),
      status: textOrNull(lifecycle.status) || 'PENDING',
      completed: lifecycle.status === 'PASS',
      fail_count: Number.isFinite(Number(lifecycle.fail_count)) ? Number(lifecycle.fail_count) : 0,
      current_attempt: Number.isFinite(Number(lifecycle.current_attempt)) ? Number(lifecycle.current_attempt) : null,
      started_at: textOrNull(selectDefinedValue(() => (lifecycle.started_at), () => (lifecycle.attempt_started_at))),
      completed_at: textOrNull(lifecycle.completed_at),
      source: lifecycle.status ? 'lifecycle_read_model' : 'progress_config',
    };
  });
  return {
    total: entries.length,
    completed: entries.filter((entry) => entry.completed).length,
    failed_or_blocked: entries.filter((entry) => ['FAIL', 'BLOCKED', 'FAILED'].includes(entry.status)).length,
    pending: entries.filter((entry) => !entry.completed && !['FAIL', 'BLOCKED', 'FAILED'].includes(entry.status)).length,
    status_counts: statusCounts(entries),
    entries,
  };
}

function gateFacts(progress: any, readModels: any) {
  const progressGates = recordOrEmpty(progress?.gates);
  const lifecycleGates = recordOrEmpty(readModels?.gates);
  const ids = sortedUnique([...Object.keys(progressGates), ...Object.keys(lifecycleGates)]);
  const entries = ids.map((id) => {
    const configured = recordOrEmpty(progressGates[id]);
    const lifecycle = recordOrEmpty(lifecycleGates[id]);
    return {
      id,
      type: textOrNull(selectDefinedValue(() => (configured.type), () => (lifecycle.gate_type))),
      title: textOrNull(configured.title),
      status: textOrNull(lifecycle.status) || 'PENDING',
      completed: lifecycle.completed === true || lifecycle.scheduler_consumed === true,
      scheduler_consumed: lifecycle.scheduler_consumed === true,
      started_at: textOrNull(selectDefinedValue(() => (lifecycle.started_at), () => (lifecycle.requested_at))),
      completed_at: textOrNull(selectDefinedValue(() => (lifecycle.completed_at), () => (lifecycle.resolved_at))),
      source: lifecycle.status ? 'lifecycle_read_model' : 'progress_config',
    };
  });
  return {
    total: entries.length,
    completed: entries.filter((entry) => entry.completed).length,
    failed_or_blocked: entries.filter((entry) => ['FAIL', 'BLOCKED', 'REJECTED', 'INVALID_OUTPUT'].includes(entry.status)).length,
    pending: entries.filter((entry) => !entry.completed && !['FAIL', 'BLOCKED', 'REJECTED', 'INVALID_OUTPUT'].includes(entry.status)).length,
    status_counts: statusCounts(entries),
    entries,
  };
}

function agentFacts(stats: any = null, summary: any = null) {
  const summaryAgents = recordOrEmpty(summary?.agents);
  const agents = {
    forge: Number.isFinite(Number(stats?.total_forge_attempts)) ? Number(stats.total_forge_attempts) : Number(summaryAgents.forge || 0),
    buster: Number.isFinite(Number(stats?.total_buster_attempts)) ? Number(stats.total_buster_attempts) : Number(summaryAgents.buster || 0),
    echo: Number.isFinite(Number(stats?.total_echo_reviews)) ? Number(stats.total_echo_reviews) : Number(summaryAgents.echo || 0),
    gate_fix: Number(summaryAgents.gateFix || 0),
    review_fix: Number(summaryAgents.reviewFix || 0),
  };
  return {
    ...agents,
    total: agents.forge + agents.buster + agents.echo + agents.gate_fix + agents.review_fix,
  };
}

export function buildRunFacts(config: any, progress: any = null, terminalOverride: any = null) {
  const readModels = lifecycleReadModels(config);
  const stats = getOptionalRunStats(config);
  const summary = latestSummary(config);
  const modules = moduleFacts(progress, readModels);
  const gates = gateFacts(progress, readModels);
  const agents = agentFacts(stats, summary);
  const evaluationDimensions = {
    pipeline_runtime_version: config?.runtime_version ?? process.version,
    configuration_fingerprint: canonicalFingerprint(nonSecret({ profile:config?.profile, telemetry:config?.telemetry, governance:config?.governance, agents:config?.agents, review_defaults:config?.review_defaults, pipeline_defaults:config?.pipeline_defaults })),
    prompt_fingerprint: config?.nova_prompt ? canonicalFingerprint(config.nova_prompt) : null,
    models: progress?.defaults?.models ?? config?.models ?? null,
    providers: config?.providers ?? null,
    thinking: config?.thinking ?? progress?.defaults?.thinking ?? null,
    tools: config?.tools ?? null,
    plugins: config?.plugins ?? null,
    skills: config?.skills ?? null,
    attempts: { forge: agents.forge, buster: agents.buster, echo: agents.echo },
    loops: Number(stats?.loop_count ?? 0),
    operator_interventions: Number(stats?.operator_interventions ?? 0),
    observability_completeness: summary?.observability_completeness ?? 'unknown',
  };

  return {
    schema_version: 'pipeline_run_facts.v1',
    run_id: textOrNull(selectDefinedValue(() => (config?._runId), () => (config?.run_id))),
    project: textOrNull(config?.project),
    generated_at: new Date().toISOString(),
    source: {
      modules: modules.entries.some((entry) => entry.source === 'lifecycle_read_model') ? 'lifecycle_read_model' : 'progress_config',
      gates: gates.entries.some((entry) => entry.source === 'lifecycle_read_model') ? 'lifecycle_read_model' : 'progress_config',
      agents: stats ? 'run_stats' : 'summary_artifact',
    },
    terminal: {
      status: textOrNull(selectDefinedValue(() => (terminalOverride?.terminal_status), () => (selectDefinedValue(() => (summary?.terminal_status), () => (readModels?.pipeline?.status))))),
      reason_code: textOrNull(selectDefinedValue(() => (terminalOverride?.reason_code), () => (selectDefinedValue(() => (summary?.reason_code), () => (readModels?.pipeline?.reason_code))))),
      started_at: textOrNull(selectDefinedValue(() => (terminalOverride?.started_at), () => (selectDefinedValue(() => (summary?.started_at), () => (stats?.started_at))))),
      completed_at: textOrNull(selectDefinedValue(() => (terminalOverride?.completed_at), () => (summary?.completed_at))),
      duration_seconds: Number.isFinite(Number(terminalOverride?.duration_seconds))
        ? Number(terminalOverride.duration_seconds)
        : Number.isFinite(Number(summary?.duration_seconds)) ? Number(summary.duration_seconds) : null,
    },
    modules,
    gates,
    agents,
    evaluation_dimensions: evaluationDimensions,
    diagnostics: {
      lifecycle_read_model_available: Boolean(readModels),
      run_stats_available: Boolean(stats),
      summary_available: Boolean(summary),
    },
  };
}
