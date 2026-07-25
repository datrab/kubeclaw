import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getRunId } from "../core/runtime.ts";
import { gitExec } from "../integrations/git-worktree.ts";
import { createBudgetFromMinutes } from "../timing.ts";
import { appendDurableOperatorAlert } from "./telemetry.ts";
import { STATUS } from "./rate-limit.ts";

function nullable(value: any) {
  return value ?? null;
}

export function errorMessage(error: any) {
  if (typeof error?.message === "string" && error.message.trim())
    return error.message;
  return String(error);
}

export function sessionPollBudget(opts: any, timeoutMinutes: any, label: any) {
  return opts.budget != null
    ? opts.budget
    : createBudgetFromMinutes(timeoutMinutes, { label });
}

export function telemetryLabel(identity: any, sessionLabel: any) {
  return identity.label != null ? identity.label : sessionLabel;
}

export function rateLimitTranscript(status: any, transcript: any) {
  return status?.transcript != null ? status.transcript : transcript;
}

export function rateLimitModuleId(identity: any, fallback: any) {
  return identity.module_id != null ? identity.module_id : fallback;
}

export function trackedRateLimitIdentity(identity: any) {
  return {
    agent_type: identity.phase,
    run_id: identity.run_id ?? null,
    attempt: identity.attempt ?? null,
    dispatch_id: identity.dispatch_id ?? null,
    gateway_label: identity.gateway_label ?? null,
    session_key: identity.session_key ?? null,
  };
}

export function pollingPolicyNumber(
  config: any,
  field: any,
  options: any = {},
) {
  const value = Number(config?.polling?.[field]);
  if (!Number.isFinite(value) || (options.positive && value <= 0)) {
    throw new Error(
      `config.polling.${field}: required ${options.positive ? "positive " : ""}number in swarm.config.json`,
    );
  }
  return value;
}

export function appendDurableSessionEndAlert(
  config: any,
  identity: any,
  reason: any,
  extra: any = {},
) {
  appendDurableOperatorAlert(
    config,
    identity.gate_id ? "gate.operator_alert" : "module.operator_alert",
    {
      module_id: identity.module_id ?? null,
      gate_id: identity.gate_id ?? null,
      gate_type: identity.gate_type ?? null,
      attempt: identity.attempt ?? null,
      dispatch_id: identity.dispatch_id ?? null,
      gateway_label: identity.gateway_label ?? null,
      session_key: identity.session_key ?? null,
      reason,
      ...extra,
    },
    {
      severity: "CRITICAL",
      source: "poll_for_session_end",
      emitter: "nova/pipeline/services/polling-session-end",
    },
  );
}

function normalizedSessionState(state: any) {
  return typeof state === "string" ? state.trim().toLowerCase() : "";
}

function sessionStateHasRateLimitEvidence(state: any = {}) {
  return [state.rateLimited, state.transcript?.rateLimited].includes(true);
}

export function isTerminalSessionFailure(state: any = {}) {
  if (!state.terminal) return false;
  if (sessionStateHasRateLimitEvidence(state)) return false;
  const failures = [
    "error",
    "errored",
    "failed",
    "failure",
    "aborted",
    "cancelled",
    "canceled",
  ];
  return [
    state.failed === true,
    failures.includes(normalizedSessionState(state.sessionState)),
    state.reason === "transcript_error",
    state.transcript?.hardError === true,
  ].includes(true);
}

export function buildSessionLifecycleFailureResult(request: any = {}) {
  const {
    acpState = {},
    identity = {},
    hasChanges = false,
    transcript = null,
  } = request;
  const detail =
    acpState.detail ?? "ACP session entered a terminal failure state";
  const status = sessionLifecycleFailureStatus(acpState, identity, detail);
  return {
    completed: false,
    hasChanges,
    reason: "agent_session_lifecycle_unstable",
    failure_class: "agent_session_lifecycle_unstable",
    detail,
    status,
    transcript,
  };
}

function sessionLifecycleFailureStatus(
  acpState: any,
  identity: any,
  detail: any,
) {
  return {
    status: STATUS.FAIL,
    source: "acp_session_monitor",
    failure_class: "agent_session_lifecycle_unstable",
    error_code: "agent_session_lifecycle_unstable",
    reason: "agent_session_lifecycle_unstable",
    detail,
    module_id: nullable(identity.module_id),
    gate_id: nullable(identity.gate_id),
    gate_type: nullable(identity.gate_type),
    attempt: nullable(identity.attempt),
    dispatch_id: nullable(identity.dispatch_id),
    gateway_label: nullable(identity.gateway_label),
    session_key: nullable(identity.session_key),
    session_state: nullable(acpState.sessionState),
    monitor_reason: nullable(acpState.reason),
  };
}

function porcelainPath(line: any = "") {
  const text = String(line).trimEnd();
  const raw =
    text.length > 2 && text[2] === " "
      ? text.slice(3).trim()
      : text.replace(/^\S+\s+/, "").trim();
  const renamed = raw.includes(" -> ") ? raw.split(" -> ").pop() : raw;
  return (renamed ?? raw).replace(/^"|"$/g, "");
}

function isInsidePath(child: any, parent: any) {
  if (!child || !parent) return false;
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return (
    relative === "" ||
    (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function changeDetail(config: any, line: any) {
  const relPath = porcelainPath(line);
  if (String(line).startsWith("?? ")) {
    const absolute = path.resolve(config.repo_root, relPath);
    if (!fs.existsSync(absolute)) return `${line}\0missing`;
    const stat = fs.statSync(absolute);
    if (stat.isDirectory()) return `${line}\0dir`;
    const digest = crypto
      .createHash("sha256")
      .update(fs.readFileSync(absolute))
      .digest("hex");
    return `${line}\0untracked:${stat.mode}:${stat.size}:${digest}`;
  }
  const worktree = gitExec(config, ["diff", "--binary", "--", relPath]);
  const staged = gitExec(config, [
    "diff",
    "--cached",
    "--binary",
    "--",
    relPath,
  ]);
  const digest = crypto
    .createHash("sha256")
    .update(worktree)
    .update("\0")
    .update(staged)
    .digest("hex");
  return `${line}\0tracked:${digest}`;
}

export function worktreeChangeSignature(
  config: any,
  ignoredPaths: any[] = [],
): any {
  if (!config?.repo_root) {
    return {
      ok: false,
      signature: null,
      error: {
        code: "POLLING_REPO_ROOT_REQUIRED",
        message:
          "Session-end worktree signature requires typed repo_root context",
        details: { reason: "no_repo_root" },
      },
    };
  }
  try {
    const porcelain = gitExec(config, [
      "status",
      "--porcelain",
      "--untracked-files=all",
    ]);
    if (!porcelain) return { ok: true, signature: "" };
    const ignored = ignoredPaths
      .filter(Boolean)
      .map((entry) => path.resolve(entry));
    const entries = porcelain
      .split("\n")
      .filter((line: string) => {
        if (!line.trim()) return false;
        const absolute = path.resolve(config.repo_root, porcelainPath(line));
        return !ignored.some((entry) => isInsidePath(absolute, entry));
      })
      .sort();
    const details = entries.map((line: string) => changeDetail(config, line));
    const signature = crypto
      .createHash("sha256")
      .update(entries.join("\n"))
      .update("\0")
      .update(details.join("\n"))
      .digest("hex");
    return { ok: true, signature };
  } catch (error: any) {
    return {
      ok: false,
      signature: null,
      error: {
        code: "POLLING_WORKTREE_SIGNATURE_FAILED",
        message:
          error?.message?.split("\n")[0] ??
          "worktree signature failed during session-end polling",
        details: error?.pollingGit ?? null,
      },
    };
  }
}

export function buildSessionPollRateLimitIdentity(request: any = {}) {
  const {
    config = null,
    telemetryIdentity = {},
    agentType = null,
    attempt = null,
  } = request;
  const gateId = telemetryIdentity.gate_id ?? null;
  const resolvedAttempt =
    telemetryIdentity.attempt != null
      ? telemetryIdentity.attempt
      : nullable(attempt);
  return {
    run_id: getRunId(config),
    module_id: gateId ? null : nullable(telemetryIdentity.module_id),
    gate_id: gateId,
    gate_type: gateId ? nullable(telemetryIdentity.gate_type) : undefined,
    phase: nullable(agentType),
    attempt: resolvedAttempt,
    dispatch_id: nullable(telemetryIdentity.dispatch_id),
    gateway_label: nullable(telemetryIdentity.gateway_label),
    session_key: nullable(telemetryIdentity.session_key),
  };
}
