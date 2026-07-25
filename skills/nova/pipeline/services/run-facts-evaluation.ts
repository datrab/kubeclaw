import { canonicalFingerprint } from "../portable-artifacts.ts";
import { selectDefinedValue } from "../optional-absence.ts";
function recordOrEmpty(value: any) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}
function textOrNull(value: any) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}
function nonSecret(value: any): any {
  if (Array.isArray(value)) return value.map(nonSecret);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(
        ([key]) => !/secret|token|password|credential|api.?key/i.test(key),
      )
      .map(([key, item]) => [key, nonSecret(item)]),
  );
}
export function buildFactSources(modules: any, gates: any, stats: any) {
  return {
    modules: modules.entries.some(
      (entry: any) => entry.source === "lifecycle_read_model",
    )
      ? "lifecycle_read_model"
      : "progress_config",
    gates: gates.entries.some(
      (entry: any) => entry.source === "lifecycle_read_model",
    )
      ? "lifecycle_read_model"
      : "progress_config",
    agents: stats ? "run_stats" : "summary_artifact",
  };
}
function environmentDimensions(settings: any, defaults: any) {
  return {
    pipeline_runtime_version: selectDefinedValue(
      () => settings.runtime_version,
      () => process.version,
    ),
    configuration_fingerprint: canonicalFingerprint(
      nonSecret({
        profile: settings.profile,
        telemetry: settings.telemetry,
        governance: settings.governance,
        agents: settings.agents,
        review_defaults: settings.review_defaults,
        pipeline_defaults: settings.pipeline_defaults,
      }),
    ),
    prompt_fingerprint: settings.nova_prompt
      ? canonicalFingerprint(settings.nova_prompt)
      : null,
    models: selectDefinedValue(
      () => defaults.models,
      () => null,
    ),
    providers: selectDefinedValue(
      () => settings.providers,
      () => null,
    ),
    thinking: selectDefinedValue(
      () => defaults.thinking,
      () => null,
    ),
  };
}
function extensionDimensions(settings: any) {
  return {
    tools: selectDefinedValue(
      () => settings.tools,
      () => null,
    ),
    plugins: selectDefinedValue(
      () => settings.plugins,
      () => null,
    ),
    skills: selectDefinedValue(
      () => settings.skills,
      () => null,
    ),
  };
}
export function buildEvaluationDimensions(
  config: any,
  progress: any,
  stats: any,
  summary: any,
  agents: any,
) {
  const settings = recordOrEmpty(config);
  const defaults = recordOrEmpty(recordOrEmpty(progress).defaults);
  const runStats = recordOrEmpty(stats);
  const runSummary = recordOrEmpty(summary);
  return {
    ...environmentDimensions(settings, defaults),
    ...extensionDimensions(settings),
    attempts: { forge: agents.forge, buster: agents.buster, echo: agents.echo },
    loops: Number(
      selectDefinedValue(
        () => runStats.loop_count,
        () => 0,
      ),
    ),
    operator_interventions: Number(
      selectDefinedValue(
        () => runStats.operator_interventions,
        () => 0,
      ),
    ),
    observability_completeness: selectDefinedValue(
      () => runSummary.observability_completeness,
      () => "unknown",
    ),
  };
}
function authority(...values: any[]): any {
  for (const value of values)
    if (value !== undefined && value !== null) return value;
  return null;
}
function terminalDuration(terminal: any, latest: any): number | null {
  if (Number.isFinite(Number(terminal.duration_seconds)))
    return Number(terminal.duration_seconds);
  return Number.isFinite(Number(latest.duration_seconds))
    ? Number(latest.duration_seconds)
    : null;
}
export function buildTerminalFacts(
  readModels: any,
  stats: any,
  summary: any,
  terminalOverride: any,
) {
  const terminal = recordOrEmpty(terminalOverride),
    latest = recordOrEmpty(summary);
  const runStats = recordOrEmpty(stats),
    pipeline = recordOrEmpty(recordOrEmpty(readModels).pipeline);
  return {
    status: textOrNull(
      authority(
        terminal.terminal_status,
        latest.terminal_status,
        pipeline.status,
      ),
    ),
    reason_code: textOrNull(
      authority(terminal.reason_code, latest.reason_code, pipeline.reason_code),
    ),
    started_at: textOrNull(
      authority(terminal.started_at, latest.started_at, runStats.started_at),
    ),
    completed_at: textOrNull(
      authority(terminal.completed_at, latest.completed_at),
    ),
    duration_seconds: terminalDuration(terminal, latest),
  };
}
