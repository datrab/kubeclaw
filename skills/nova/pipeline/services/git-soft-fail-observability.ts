import { selectDefinedValue, selectTruthyValue } from '../optional-absence.ts';
// services/git-soft-fail-observability.ts — caller-owned Git persistence degradation telemetry

import { emitObservabilityDegraded } from './telemetry.ts';

type SoftFailData = {
  error?: unknown;
  detail?: unknown;
  module_id?: string | null;
  gate_id?: string | null;
  gate_type?: string | null;
  attempt?: number | null;
  dispatch_id?: string | null;
  gateway_label?: string | null;
  session_key?: string | null;
};

function detailFromError(error: unknown): string | null {
  if (error == null) return null;
  return error instanceof Error ? error.message : String(error);
}

export function emitGitCommitPushSoftFailDegraded(ctx: unknown, data: SoftFailData = {}) {
  const detail = detailFromError(gitSoftFailDetailAuthority(data));
  if (!detail) return false;

  emitObservabilityDegraded(ctx as object, {
    component: 'git_worktree',
    surface: 'commit_push',
    reason: 'git_commit_push_soft_failed',
    detail,
    module_id: selectTruthyValue(() => (data.module_id), () => (null)),
    gate_id: selectTruthyValue(() => (data.gate_id), () => (null)),
    gate_type: data.gate_id != null ? (selectDefinedValue(() => (data.gate_type), () => (null))) : undefined,
    attempt: selectDefinedValue(() => (data.attempt), () => (null)),
    dispatch_id: selectTruthyValue(() => (data.dispatch_id), () => (null)),
    gateway_label: selectDefinedValue(() => (data.gateway_label), () => (null)),
    session_key: selectTruthyValue(() => (data.session_key), () => (null)),
  });
  return true;
}

function gitSoftFailDetailAuthority(data: Record<string, any>) {
  if (data.error !== undefined && data.error !== null) return data.error;
  return data.detail;
}
