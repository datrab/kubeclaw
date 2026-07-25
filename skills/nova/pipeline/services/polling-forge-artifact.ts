import { getTrackedAgent } from "../agents/lifecycle.ts";
import {
  AGENT_OBSERVABILITY_FORGE_COMPLETION_SOURCE,
  AGENT_OBSERVABILITY_FORGE_FALLBACK_NO_WORK_REASON,
  AGENT_OBSERVABILITY_FORGE_FALLBACK_READY_REASON,
  AGENT_OBSERVABILITY_FORGE_NO_WORK_REASON,
  AGENT_OBSERVABILITY_FORGE_READY_REASON,
  buildForgeAgentEndedIdentity,
  buildForgeCompletionStatusFromDiff,
  collectMeaningfulForgeDiffEvidence,
} from "./agent-observability-forge-completion.ts";
import {
  invalidForgeCompletionArtifactStatus,
  readForgeCompletionArtifact,
} from "./forge-completion.ts";
import { resolveStatusPollIdentity } from "./polling-identity.ts";
import { pollResult, requireTextValue, textValue } from "./polling-core.ts";

const DIFF_FAILURE = "Unable to collect meaningful Forge diff evidence";

function gatewayLabel(identity: any, configured: any, sessionLabel: any) {
  if (identity.gateway_label != null) return identity.gateway_label;
  return configured != null ? configured : sessionLabel;
}

function artifactStatus(moduleId: string, sessionLabel: any, opts: any) {
  return {
    module_id: moduleId,
    current_phase: "forge",
    status: "IN_PROGRESS",
    attempt: opts.attempt ?? null,
    dispatch_id: opts.dispatchId ?? null,
    gateway_label: opts.gatewayLabel ?? sessionLabel,
    session_key: opts.sessionKey ?? null,
  };
}

export function buildArtifactIdentity(
  config: any,
  moduleDir: any,
  opts: any,
  sessionLabel: any,
) {
  const tracked = sessionLabel ? getTrackedAgent(sessionLabel) : null;
  const moduleId = requireTextValue(opts.moduleId ?? moduleDir, "module_id");
  const currentStatus = artifactStatus(moduleId, sessionLabel, opts);
  const pollIdentity = resolveStatusPollIdentity(
    moduleDir,
    currentStatus,
    tracked,
    sessionLabel,
  );
  const identityModuleId = requireTextValue(
    pollIdentity.module_id,
    "poll_identity.module_id",
  );
  const identity = buildForgeAgentEndedIdentity(config, moduleDir, {
    ...opts,
    trackedAgent: tracked,
    moduleId: identityModuleId,
    attempt: pollIdentity.attempt ?? opts.attempt,
    dispatchId: pollIdentity.dispatch_id ?? opts.dispatchId,
    sessionKey: pollIdentity.session_key ?? opts.sessionKey,
    gatewayLabel: gatewayLabel(pollIdentity, opts.gatewayLabel, sessionLabel),
  });
  return { currentStatus, pollIdentity, identity };
}

export function completionFromDiff(
  state: any,
  event: any,
  source: any,
  transcript: any = null,
) {
  const evidence = collectMeaningfulForgeDiffEvidence(
    state.config,
    state.moduleDir,
    {
      ...state.opts,
      diffEvidence:
        typeof state.opts.diffEvidence === "function"
          ? state.opts.diffEvidence({ event, source })
          : state.opts.diffEvidence,
    },
  );
  if (!evidence.ok) {
    const failure = (evidence as any).error;
    const details =
      failure?.pollingGit != null
        ? failure.pollingGit
        : (failure?.gitSync ?? null);
    return pollResult(false, "git_error", {
      message: textValue(failure?.message) ?? DIFF_FAILURE,
      details,
    });
  }
  const ready = evidence.hasMeaningfulChanges;
  const canonical = source === AGENT_OBSERVABILITY_FORGE_COMPLETION_SOURCE;
  const reason = canonical
    ? ready
      ? AGENT_OBSERVABILITY_FORGE_READY_REASON
      : AGENT_OBSERVABILITY_FORGE_NO_WORK_REASON
    : ready
      ? AGENT_OBSERVABILITY_FORGE_FALLBACK_READY_REASON
      : AGENT_OBSERVABILITY_FORGE_FALLBACK_NO_WORK_REASON;
  const identity = buildForgeAgentEndedIdentity(
    state.config,
    state.moduleDir,
    state.opts,
  );
  return pollResult(
    ready,
    reason,
    buildForgeCompletionStatusFromDiff(evidence, event, { source, identity }),
    transcript ? { transcript } : {},
  );
}

function invalidArtifactResult(
  state: any,
  identity: any,
  artifact: any,
  transcript: any,
  acceptInvalid: boolean,
) {
  const errors = Array.isArray(artifact.errors) ? artifact.errors : [];
  const semantic = errors.some(
    (entry: any) => !String(entry).startsWith("invalid JSON:"),
  );
  if (acceptInvalid && semantic) {
    const status = invalidForgeCompletionArtifactStatus(
      state.config,
      state.moduleDir,
      identity,
      errors,
    );
    return {
      done: true,
      result: pollResult(
        false,
        "invalid_forge_completion",
        status,
        transcript ? { transcript } : {},
      ),
    };
  }
  if (semantic)
    return {
      done: false,
      logMsg: "forge_completion=invalid waiting_for_agent_terminal_write",
      logKey: "forge_completion=invalid",
    };
  return {
    parse_error: true,
    logMsg: "forge_completion=invalid_json waiting_for_rewrite",
    logKey: "forge_completion=invalid",
  };
}

export function completionFromArtifact(
  state: any,
  identity: any,
  transcript: any = null,
  acceptInvalid = false,
) {
  const artifact = readForgeCompletionArtifact(
    state.config,
    state.moduleDir,
    identity,
  );
  if (!artifact.found) return null;
  if (!artifact.valid)
    return invalidArtifactResult(
      state,
      identity,
      artifact,
      transcript,
      acceptInvalid,
    );
  const status = {
    ...artifact.artifact,
    source: "forge_completion_artifact",
    module_id: identity.module_id,
    dispatch_id: identity.dispatch_id,
    gateway_label: identity.gateway_label,
    session_key: identity.session_key,
  };
  return {
    done: true,
    result: pollResult(
      true,
      "forge_completion",
      status,
      transcript ? { transcript } : {},
    ),
  };
}
