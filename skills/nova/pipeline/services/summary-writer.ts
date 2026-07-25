import path from 'path';
import { log } from '../core/logger.ts';
import { costLogDir } from '../core/paths.ts';
import { getRunStats } from '../core/runtime.ts';
import {
  aggregateUsage,
  checkBudgetThresholds,
  emitBudgetWarnings,
  writeCostReport,
} from './observability.ts';
import { buildRunFacts } from './run-facts.ts';
import { onBudgetExceeded, onBudgetWarning } from './telemetry.ts';
import {
  getPipelineArtifactBundle,
} from './artifact-bundle.ts';
import { errorMessage } from './text-values.ts';
import {
  buildSummaryPayload,
  persistSummary,
} from './summary-persistence.ts';

function requireText(value: any, label: string) {
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new Error(`${label}: required non-empty string`);
}

function requireArtifactBundlePath(bundle: any, key: string) {
  return requireText(bundle?.[key], `pipeline artifact bundle.${key}`);
}

function budgetConfig(config: any) {
  const value = config?.observability?.budget;
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function emitBudgetTelemetry(context: any, warnings: any[]) {
  if (!context) return;
  for (const warning of warnings) {
    if (warning.type === 'budget.exceeded') {
      onBudgetExceeded(
        context,
        warning.threshold,
        warning.current,
        warning.limit,
        warning.unit
      );
    } else if (warning.type === 'budget.warning') {
      onBudgetWarning(
        context,
        warning.threshold,
        warning.current,
        warning.limit,
        warning.unit
      );
    }
  }
}

function budgetStatus(warnings: any[]) {
  if (warnings.some((warning) => warning.type === 'budget.exceeded')) {
    return 'exceeded_stop';
  }
  if (warnings.some((warning) => warning.type === 'budget.warning')) {
    return 'warning';
  }
  return 'ok';
}

function collectBudgetSnapshot(config: any, context: any, progress: any) {
  try {
    const usageAggregate = aggregateUsage(config);
    const report = writeCostReport(config, { progress });
    const warnings = Array.isArray(report?.warnings)
      ? report.warnings
      : checkBudgetThresholds(usageAggregate, budgetConfig(config));
    emitBudgetWarnings(config, warnings);
    emitBudgetTelemetry(context, warnings);
    return {
      usageAggregate,
      budgetStatus: budgetStatus(warnings),
      costReportPath: report
        ? path.join(requireText(costLogDir(config), 'cost_log_dir'), 'cost-report.json')
        : null,
    };
  } catch (error: any) {
    log(
      'DEBUG',
      `[summary] Cost report failed (non-critical): ${errorMessage(error)}`
    );
    return {
      usageAggregate: null,
      budgetStatus: null,
      costReportPath: null,
    };
  }
}

function buildCumulativeSummary(progress: any) {
  const cumulative = progress?.run_stats?.cumulative ?? progress?.cumulative;
  if (!cumulative || typeof cumulative !== 'object' || Array.isArray(cumulative)) {
    return null;
  }
  const count = (value: any) => value ?? 0;
  return {
    modules_completed: count(cumulative.modules_completed),
    modules_failed: count(cumulative.modules_failed),
    modules_blocked: count(cumulative.modules_blocked),
    total_forge_attempts: count(cumulative.total_forge_attempts),
    total_buster_attempts: count(cumulative.total_buster_attempts),
  };
}

function buildRunStats(stats: any) {
  return {
    modules_completed: stats.modules_completed,
    modules_failed: stats.modules_failed,
    modules_blocked: stats.modules_blocked,
    gates_completed: stats.gates_completed,
    gates_failed: stats.gates_failed,
    total_forge_attempts: stats.total_forge_attempts,
    total_buster_attempts: stats.total_buster_attempts,
    total_echo_reviews: stats.total_echo_reviews,
    errors: stats.errors,
    discord_notifications_sent: stats.discord_notifications_sent,
    git_pull_failures: stats.git_pull_failures,
    git_push_failures: stats.git_push_failures,
    config_validation_issues: stats.config_validation_issues,
  };
}


function unavailableSummaryResult(artifactBundle: any) {
  return {
    output_dir: artifactBundle.pipeline_dir,
    pipeline_summary_path: null,
    summary_json_path: null,
    latest_json_path: null,
    failed: false,
    reason: null,
  };
}

function failedSummaryResult(artifactBundle: any, error: any) {
  return {
    output_dir: artifactBundle.pipeline_dir,
    pipeline_summary_path: null,
    summary_json_path: null,
    latest_json_path: null,
    failed: true,
    reason: errorMessage(error),
  };
}

function persistTerminalSummary(input: any) {
  const stats = getRunStats(input.config);
  const startedAt = requireText(stats?.started_at, 'run_stats.started_at');
  const completedAt = new Date().toISOString();
  const durationSeconds = Math.round(
    (Date.now() - new Date(startedAt).getTime()) / 1000
  );
  const budget = collectBudgetSnapshot(
    input.config,
    input.context,
    input.progress
  );
  const runStats = buildRunStats(stats);
  const runFacts = buildRunFacts(input.config, input.progress, {
    terminal_status: input.terminalStatus,
    reason_code: input.reasonCode,
    started_at: startedAt,
    completed_at: completedAt,
    duration_seconds: durationSeconds,
  });
  const summary = buildSummaryPayload({
    ...input,
    runFacts,
    runStats,
    cumulative: buildCumulativeSummary(input.progress),
    budget,
    completedAt,
    startedAt,
    durationSeconds,
  });
  persistSummary({
    ...input,
    durationSeconds,
    runStats,
    runFacts,
    budget,
    summary,
  });
}

export function writeSummary(
  config: any,
  terminalStatus: any,
  reasonCode: any,
  context: any = null,
  progress: any = null,
  terminalDecision: any = null
) {
  const artifactBundle = getPipelineArtifactBundle(config);
  if (!artifactBundle.pipeline_dir) {
    return unavailableSummaryResult(artifactBundle);
  }
  try {
    persistTerminalSummary({
      config,
      terminalStatus,
      reasonCode,
      terminalDecision,
      context,
      progress,
      artifactBundle,
    });
    log(
      'OK',
      `Pipeline summary written: terminal_status=${terminalStatus} (${reasonCode})`
    );
    return {
      output_dir: requireArtifactBundlePath(artifactBundle, 'pipeline_dir'),
      pipeline_summary_path: artifactBundle.pipeline_summary_path,
      summary_json_path: artifactBundle.run_summary_path,
      latest_json_path: artifactBundle.latest_json_path,
      failed: false,
      reason: null,
    };
  } catch (error: any) {
    log('WARN', `Failed to write summary.json: ${errorMessage(error)}`);
    return failedSummaryResult(artifactBundle, error);
  }
}
