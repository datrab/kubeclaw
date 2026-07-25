import {
  agentEndedSettleMs,
  createAgentEndedTelemetryReader,
} from "./agent-observability-forge-completion.ts";
import { createAcpPollObservabilityState } from "./polling-acp-signals.ts";
import {
  buildArtifactIdentity,
  completionFromArtifact,
} from "./polling-forge-artifact.ts";
import { checkForgePollCycle } from "./polling-forge-cycle.ts";
import { pollGeneric } from "./polling-core.ts";
import { pollingPolicyNumber } from "./polling-policy.ts";

function forgePollState(config: any, moduleDir: any, opts: any) {
  const startTime = Date.now();
  const hookReader = createAgentEndedTelemetryReader(config, opts);
  return {
    config,
    moduleDir,
    opts,
    sessionLabel: opts.sessionLabel,
    startTime,
    acpState: {},
    observabilityState: createAcpPollObservabilityState(),
    lastProgressEmit: startTime,
    progressIntervalMs: pollingPolicyNumber(config, "progress_interval_ms"),
    settleMs: agentEndedSettleMs(config, opts),
    hookReader,
    hookReaderDegraded: !hookReader,
    hookReaderError: null,
    observedAgentEnded: null,
    observedAgentEndedAt: 0,
  };
}

function finalArtifactResult(state: any) {
  const identity = buildArtifactIdentity(
    state.config,
    state.moduleDir,
    state.opts,
    state.sessionLabel,
  ).identity;
  const completion = completionFromArtifact(state, identity, null, true);
  return completion?.done ? completion.result : null;
}

export async function pollForgeCompletion(
  config: any,
  moduleDir: any,
  timeoutMinutes: any,
  opts: any = {},
) {
  const state = forgePollState(config, moduleDir, opts);
  try {
    return await pollGeneric(
      config,
      () => checkForgePollCycle(state),
      timeoutMinutes,
      moduleDir,
      { ...opts, onTimeoutBeforeResult: () => finalArtifactResult(state) },
    );
  } finally {
    state.hookReader?.close?.();
  }
}
