import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
import {
  buildPipelineStepResult,
  PIPELINE_STEP_ACTIONS,
  PIPELINE_STEP_OUTCOMES,
  PIPELINE_STEP_TYPES,
} from '../services/contracts/pipeline-step-result.ts';
import { PIPELINE_TERMINAL_ACTIONS, PIPELINE_TERMINAL_SCOPES } from '../services/contracts/terminal-decision.ts';
import { normalizeStepResultForPipeline } from './pipeline-runner-terminal.ts';

type AnyRecord = Record<string, any>;

function firstPresent(...values: any[]) {
  for (const value of values) if (value !== undefined && value !== null) return value;
  return null;
}

function stepFailureReason(result: AnyRecord) {
  return firstPresent(result?.terminal?.decision?.reasonCode, result?.diagnostics?.summary, result?.reason);
}

export function passedModuleStepResult(moduleId: string): AnyRecord {
  return buildPipelineStepResult({
    stepType: PIPELINE_STEP_TYPES.MODULE, stepId: moduleId, nextAction: PIPELINE_STEP_ACTIONS.CONTINUE,
    outcome: PIPELINE_STEP_OUTCOMES.PASSED, reason: 'module completed',
    correlation: { step_type: PIPELINE_STEP_TYPES.MODULE, step_id: moduleId, module_id: moduleId },
    terminalAction: PIPELINE_TERMINAL_ACTIONS.NONE, terminalScope: PIPELINE_TERMINAL_SCOPES.MODULE,
  });
}

export function moduleBatchRejectionStepResult(moduleId: string, reasonValue: unknown): AnyRecord {
  const reason = reasonValue instanceof Error ? reasonValue.message : String(reasonValue ?? 'missing_module_batch_failure_detail');
  const errorName = reasonValue instanceof Error && reasonValue.name ? reasonValue.name : null;
  return buildPipelineStepResult({
    stepType: PIPELINE_STEP_TYPES.MODULE, stepId: moduleId, nextAction: PIPELINE_STEP_ACTIONS.HALT,
    outcome: PIPELINE_STEP_OUTCOMES.ERROR, issueType: 'environment', reason,
    diagnostics: { summary: reason, metadata: { module_batch_rejection: true, failure_class: 'module_batch_rejection', error_name: errorName } },
    correlation: { step_type: PIPELINE_STEP_TYPES.MODULE, step_id: moduleId, module_id: moduleId },
    terminalAction: PIPELINE_TERMINAL_ACTIONS.STOP, terminalScope: PIPELINE_TERMINAL_SCOPES.MODULE,
    terminalReasonCode: 'module_batch_rejection', terminalHumanReason: reason,
  });
}

export function normalizeBatchResults(batchResult: AnyRecord = {}) {
  if (batchResult?.kind !== 'module_batch_result' || !Array.isArray(batchResult.results)) return null;
  return batchResult.results.map((entry: AnyRecord = {}) => ({
    moduleId: entry.moduleId,
    normalized: normalizeStepResultForPipeline(entry.result ?? passedModuleStepResult(entry.moduleId), { stepType: 'module', stepId: entry.moduleId }),
  }));
}

function moduleResult(entry: AnyRecord) {
  const result = entry?.normalized?.stepResult ?? {};
  const outcome = result.outcome || 'error';
  const reason = firstPresent(stepFailureReason(result), outcome);
  return { module_id: entry.moduleId, outcome, status: outcome === PIPELINE_STEP_OUTCOMES.PASSED ? 'PASS' : 'FAIL', reason };
}

function batchModuleResults(results: AnyRecord[] = []) {
  return results.map(moduleResult);
}

function batchFailureReason(results: AnyRecord[]) {
  return `Module batch failed: ${results.map((entry) => {
    const detail = entry.reason && entry.reason !== entry.status ? ` (${entry.reason})` : '';
    return `${entry.module_id}: ${entry.status}${detail}`;
  }).join('; ')}`;
}

function primaryFailureProjection(primary: AnyRecord, moduleResults: AnyRecord[], failedModules: AnyRecord[]) {
  const result = primary.normalized.stepResult as AnyRecord;
  return {
    outcome: firstPresent(result.outcome, PIPELINE_STEP_OUTCOMES.ERROR),
    issueType: firstPresent(result.issueType, 'environment'),
    findings: Array.isArray(result.diagnostics?.findings) ? result.diagnostics.findings : [],
    metadata: { ...firstPresent(result.diagnostics?.metadata, {}), module_batch_failed: true, module_results: moduleResults, failed_modules: failedModules },
    correlation: { ...firstPresent(result.correlation, {}), step_type: PIPELINE_STEP_TYPES.MODULE, step_id: primary.moduleId, module_id: primary.moduleId },
    reasonCode: firstPresent(result.terminal?.decision?.reasonCode),
    source: firstPresent(result.terminal?.source),
    terminalMetadata: { ...firstPresent(result.terminal?.metadata, {}), module_results: moduleResults, failed_modules: failedModules },
  };
}

export function batchFailureResult(failed: AnyRecord[] = [], batchResults: AnyRecord[] = []) {
  const primary = failed[0];
  if (!primary) throw new Error('Module batch failure requires at least one failed module');
  const moduleResults = batchModuleResults(batchResults);
  const failedModules = failed.map((entry) => ({ module_id: entry.moduleId, reason: stepFailureReason(entry?.normalized?.stepResult ?? {}) }));
  const reason = batchFailureReason(moduleResults);
  const projection = primaryFailureProjection(primary, moduleResults, failedModules);
  return buildPipelineStepResult({
    stepType: PIPELINE_STEP_TYPES.MODULE, stepId: primary.moduleId, nextAction: PIPELINE_STEP_ACTIONS.HALT,
    outcome: projection.outcome, issueType: projection.issueType, reason,
    diagnostics: { findings: projection.findings, metadata: projection.metadata },
    correlation: projection.correlation,
    terminalAction: PIPELINE_TERMINAL_ACTIONS.STOP, terminalScope: PIPELINE_TERMINAL_SCOPES.MODULE,
    terminalReasonCode: projection.reasonCode, terminalHumanReason: reason,
    terminalSource: projection.source,
    terminalMetadata: projection.terminalMetadata,
  });
}

export function batchJoinFailureResult(joinFailure: AnyRecord = {}, batchResults: AnyRecord[] = []) {
  const moduleResults = batchModuleResults(batchResults);
  const failedModules = moduleResults.filter((entry) => entry.status !== 'PASS').map((entry) => ({ module_id: entry.module_id, reason: entry.reason }));
  const git = joinFailure.git ?? null;
  const code = git?.code ?? 'module_join_failed';
  const cause = git?.cause ?? joinFailure.reason;
  const reason = `Module batch join failed: ${code}${cause ? ` (${cause})` : ''}`;
  const moduleId = firstPresent(joinFailure.module_id, moduleResults[0]?.module_id, 'module_batch');
  return buildPipelineStepResult({
    stepType: PIPELINE_STEP_TYPES.MODULE, stepId: moduleId, nextAction: PIPELINE_STEP_ACTIONS.HALT,
    outcome: PIPELINE_STEP_OUTCOMES.ERROR, issueType: 'environment', reason,
    diagnostics: { metadata: { module_join_failed: true, git, module_results: moduleResults, failed_modules: failedModules } },
    correlation: { step_type: PIPELINE_STEP_TYPES.MODULE, step_id: moduleId, module_id: moduleId },
    terminalAction: PIPELINE_TERMINAL_ACTIONS.STOP, terminalScope: PIPELINE_TERMINAL_SCOPES.PIPELINE,
    terminalReasonCode: code, terminalHumanReason: reason,
    terminalMetadata: { git, module_results: moduleResults, failed_modules: failedModules },
  });
}
