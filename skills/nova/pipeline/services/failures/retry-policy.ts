import { getPipelineDefaultsConfig } from '../runtime-defaults.ts';
import { buildFullPipelineResumeCommand } from './retry-command.ts';
import { createFailureContext } from './retry-context.ts';
import { handleAutomaticRetry } from './retry-automatic.ts';
import { handleBlockedFailure } from './retry-blocked.ts';
import {
  buildNovaEscalation,
  handleNovaEscalation,
} from './retry-escalation.ts';

function firstDefined(...values: any[]) {
  for (const value of values) {
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function resolveAutoRetryThreshold(config: any, progress: any, moduleIdOrGateId: any) {
  const moduleConf = progress?.modules?.[moduleIdOrGateId];
  const gateConf = progress?.gates?.[moduleIdOrGateId];
  return firstDefined(
    moduleConf?.auto_retry_threshold,
    gateConf?.auto_retry_threshold,
    progress?.auto_retry_threshold,
    getPipelineDefaultsConfig(config).auto_retry_threshold
  );
}

function autoRetryThresholdAuthority(config: any, opts: any, moduleId: any) {
  return firstDefined(
    opts.autoRetryThreshold,
    resolveAutoRetryThreshold(config, opts.progress, moduleId)
  );
}

export async function handleFail(input: any) {
  const context = createFailureContext(input);
  if (context.status.fail_count >= context.maxFails) {
    return handleBlockedFailure(context);
  }

  const autoRetryThreshold = autoRetryThresholdAuthority(
    context.config,
    context.opts,
    context.moduleId
  );
  const canAutoRetry = !context.isTimeout
    && context.status.fail_count <= autoRetryThreshold;
  if (canAutoRetry) {
    return handleAutomaticRetry(context, autoRetryThreshold);
  }
  return handleNovaEscalation(context, autoRetryThreshold);
}

export {
  buildFullPipelineResumeCommand,
  buildNovaEscalation,
};
