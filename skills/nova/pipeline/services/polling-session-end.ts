import { log } from "../core/logger.ts";
import { isBudgetExhaustedError } from "../timing.ts";
import {
  runSessionEndCycle,
  timeoutResult,
} from "./polling-session-end-cycle.ts";
import {
  createSessionEndState,
  startAcpAdapter,
  stopAcpAdapter,
} from "./polling-session-end-runtime.ts";

export {
  buildSessionPollRateLimitIdentity,
  worktreeChangeSignature,
} from "./polling-session-end-support.ts";

async function runUntilTimeout(state: any) {
  try {
    while (true) {
      const result = await runSessionEndCycle(state);
      if (result) return result;
    }
  } catch (error: any) {
    if (!isBudgetExhaustedError(error)) throw error;
    state.budgetError = error;
    return timeoutResult(state);
  }
}

export async function pollForSessionEnd(
  config: any,
  sessionLabel: any,
  timeoutMinutes: any,
  logLabel: any = "session-poll",
  opts: any = {},
) {
  // ACP terminal state is the only session completion signal. Local worktree
  // changes classify the terminal result but never infer completion.
  const state: any = createSessionEndState(
    config,
    sessionLabel,
    timeoutMinutes,
    logLabel,
    opts,
  );
  if (state.errorResult) return state.errorResult;
  log(
    "INFO",
    `[${logLabel}] Waiting for session '${sessionLabel}' (${state.sessionKey}) to complete | timeout: ${timeoutMinutes}min`,
  );
  startAcpAdapter(state);
  try {
    return await runUntilTimeout(state);
  } finally {
    await stopAcpAdapter(state, "poll_for_session_end_done");
  }
}
