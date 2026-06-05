// runners/module-runner/terminal-results.ts — terminal/retry result builders for module runner

import { EXIT_BLOCKED } from '../../core/constants.ts';
import { getRunId } from '../../core/runtime.ts';
import {
  resolveStatusSessionKey,
  resolveStatusGatewayLabel,
  resolveResultSessionKey,
  resolveResultDispatchId,
  resolveResultGatewayLabel,
} from '../../services/correlation.ts';
import {
  PIPELINE_STEP_TYPES,
  PIPELINE_STEP_ACTIONS,
  PIPELINE_STEP_OUTCOMES,
  buildPipelineStepResult,
} from '../../services/contracts/pipeline-step-result.ts';

type AnyRecord = Record<string, any>;

export function buildRetryResult(failResult: AnyRecord, statusValue: AnyRecord) {
  return {
    retry: true,
    fail_count: failResult?.fail_count ?? statusValue?.fail_count ?? 0,
    dispatch_id: resolveResultDispatchId(failResult),
    gateway_label: resolveResultGatewayLabel(failResult),
    session_key: resolveResultSessionKey(failResult),
    last_fail: failResult?.last_fail ?? null,
  };
}

export function buildModulePassTerminalResult(config: AnyRecord, moduleId: string, {
  moduleDir = null,
  attempt = null,
  phase = null,
}: AnyRecord = {}) {
  return {
    retry: false,
    result: buildPipelineStepResult({
      stepType: PIPELINE_STEP_TYPES.MODULE,
      stepId: moduleId,
      nextAction: PIPELINE_STEP_ACTIONS.CONTINUE,
      outcome: PIPELINE_STEP_OUTCOMES.PASSED,
      correlation: {
        run_id: getRunId(config),
        module_id: moduleId,
        module_dir: moduleDir,
        attempt,
        phase,
      },
    }),
  };
}

export function buildBlockedTerminalResult(status: AnyRecord, moduleId: string) {
  return {
    retry: false,
    result: {
      exit: EXIT_BLOCKED,
      reason: status?.blockedReason
        || status?.fail_summaries?.[status.fail_summaries.length - 1]?.summary
        || `Module ${moduleId} is BLOCKED`,
      module: moduleId,
      fail_count: status?.blockedFailCount ?? status?.fail_count ?? null,
      phase: status?.blockedPhase || status?.current_phase || null,
      gateway_label: resolveStatusGatewayLabel(status),
      session_key: resolveStatusSessionKey(status),
    },
  };
}
