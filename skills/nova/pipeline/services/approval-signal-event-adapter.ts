// services/approval-signal-event-adapter.js — filesystem edge adapter for approval wait signals.
// The runner consumes canonical EventBus events; this adapter owns local FS noise.

import fs from 'fs';
import path from 'path';
import { gateStatusPath } from '../core/paths.ts';
import { assertPipelineEvent, assertPipelineEventBusAdapter } from './pipeline-event-contract.ts';
import {
  APPROVAL_STATUS,
  APPROVAL_TIMEOUT_POLICY,
  buildApprovalIdentity,
  normalizeApprovalGateState,
  normalizeApprovalTimeoutPolicy,
} from '../runners/approval-gate-shared.ts';

function isTerminalStatus(status) {
  return status === APPROVAL_STATUS.APPROVED
    || status === APPROVAL_STATUS.REJECTED
    || status === APPROVAL_STATUS.CANCELLED
    || status === APPROVAL_STATUS.TIMED_OUT;
}

function approvalSignalKind(state = {}) {
  const status = String(state?.status || '').trim().toUpperCase();
  if (status === APPROVAL_STATUS.APPROVED) return 'approve';
  if (status === APPROVAL_STATUS.REJECTED) return 'reject';
  if (status === APPROVAL_STATUS.CANCELLED) return 'cancel';
  if (status === APPROVAL_STATUS.TIMED_OUT) {
    return normalizeApprovalTimeoutPolicy(state?.timeout_policy) === APPROVAL_TIMEOUT_POLICY.CONTINUE
      ? 'timeout_continue'
      : 'timeout_block';
  }
  return 'pending_update';
}

function nullableString(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function nullableNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function buildIdentity(config, gateId, gate, state = {}) {
  return buildApprovalIdentity(config, gateId, gate, state);
}

export function buildApprovalSignalEvent(config, gateId, gate, state = {}, opts = {}) {
  const normalized = normalizeApprovalGateState(state, buildIdentity(config, gateId, gate, state));
  const identity = buildIdentity(config, gateId, gate, normalized);
  const timeoutPolicy = normalizeApprovalTimeoutPolicy(normalized?.timeout_policy);
  const event = {
    type: 'approval.signal',
    source: 'local_fs',
    identity: {
      gate_id: gateId,
      ...(identity.run_id ? { run_id: identity.run_id } : {}),
    },
    payload: {
      gate_id: gateId,
      gate_type: 'approval',
      run_id: nullableString(identity.run_id),
      project: nullableString(identity.project),
      wait_ref: nullableString(opts.waitRef || normalized?.wait_ref),
      status: String(normalized?.status || '').trim().toUpperCase(),
      signal_kind: approvalSignalKind(normalized),
      requested_at: nullableString(normalized?.requested_at),
      deadline: nullableString(normalized?.deadline),
      timeout_minutes: nullableNumber(normalized?.timeout_minutes),
      timeout_policy: timeoutPolicy,
      resolved_at: nullableString(normalized?.resolved_at),
      decision_by: nullableString(normalized?.decision_by),
      decision_via: nullableString(normalized?.decision_via),
      continued: normalized?.continued === undefined ? null : normalized.continued,
      reason: nullableString(normalized?.reason),
      state_path: opts.statePath || gateStatusPath(config, gateId),
      updated_at: nullableString(normalized?.updated_at),
    },
  };
  return assertPipelineEvent(event, { requiredIdentityFields: ['gate_id'] });
}

export function emitApprovalSignalEvent(eventBus, config, gateId, gate, state = {}, opts = {}) {
  const adapter = assertPipelineEventBusAdapter(eventBus, 'ApprovalSignalEventAdapter eventBus');
  const event = buildApprovalSignalEvent(config, gateId, gate, state, opts);
  return adapter.emit(event);
}

function emitFatal(eventBus, identity, payload) {
  eventBus.emit({
    type: 'fatal.error',
    source: 'system',
    identity,
    payload,
  });
}

export function createApprovalSignalEventAdapter(config, opts = {}) {
  const eventBus = assertPipelineEventBusAdapter(opts.eventBus, 'ApprovalSignalEventAdapter eventBus');
  const gateId = opts.gateId;
  const gate = opts.gate || null;
  const statePath = opts.statePath || gateStatusPath(config, gateId);
  const watchPath = path.dirname(statePath);
  const fileName = path.basename(statePath);
  const identity = {
    gate_id: gateId,
    ...(config?._runId || config?.run_id ? { run_id: config._runId || config.run_id } : {}),
  };
  if (opts.debounceMs === undefined || opts.debounceMs === null) {
    throw new TypeError('ApprovalSignalEventAdapter requires debounceMs');
  }
  const debounceMs = Number(opts.debounceMs);
  if (!Number.isFinite(debounceMs) || debounceMs < 0) {
    throw new TypeError('ApprovalSignalEventAdapter debounceMs must be a non-negative number');
  }
  const loadState = typeof opts.loadState === 'function'
    ? opts.loadState
    : () => JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const controller = new AbortController();
  const signal = controller.signal;
  const watchers = [];
  let timer = null;
  let started = false;

  const externalSignal = opts.signal;
  const abortFromExternal = () => stop('external_abort');
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort('external_abort');
    else externalSignal.addEventListener('abort', abortFromExternal, { once: true });
  }

  function clearDebounce() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  function emitCurrentState() {
    timer = null;
    if (signal.aborted) return;
    let state;
    try {
      state = loadState(config, gateId);
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      emitFatal(eventBus, identity, {
        adapter: 'approval_signal',
        reason: 'approval_state_read_failed',
        state_path: statePath,
        error: error?.message || String(error),
      });
      return;
    }

    if (!state) return;
    if (state?._corrupted_gate_state) {
      emitFatal(eventBus, identity, {
        adapter: 'approval_signal',
        reason: 'approval_state_corrupted',
        state_path: statePath,
        error: state.parse_error || 'corrupted approval state',
      });
      return;
    }

    try {
      emitApprovalSignalEvent(eventBus, config, gateId, gate, state, {
        statePath,
        waitRef: opts.waitRef,
      });
    } catch (error) {
      emitFatal(eventBus, identity, {
        adapter: 'approval_signal',
        reason: 'approval_signal_contract_invalid',
        state_path: statePath,
        error: error?.message || String(error),
      });
      return;
    }

    if (isTerminalStatus(String(state?.status || '').trim().toUpperCase()) && opts.stopOnTerminal !== false) {
      stop('terminal_signal_emitted');
    }
  }

  function schedule() {
    if (signal.aborted) return;
    clearDebounce();
    timer = setTimeout(emitCurrentState, debounceMs);
  }

  function stop(reason = 'stopped') {
    if (!signal.aborted) controller.abort(reason);
    clearDebounce();
    while (watchers.length > 0) {
      const watcher = watchers.pop();
      try { watcher.close(); } catch (_error) {}
    }
    if (externalSignal) externalSignal.removeEventListener?.('abort', abortFromExternal);
  }

  function start() {
    if (started) return { watching: watchers.length, path: statePath };
    started = true;
    if (signal.aborted) return { watching: 0, path: statePath };
    if (!gateId) {
      emitFatal(eventBus, identity, {
        adapter: 'approval_signal',
        reason: 'gate_id_missing',
        state_path: statePath,
      });
      return { watching: 0, path: statePath };
    }
    if (!fs.existsSync(watchPath)) {
      emitFatal(eventBus, identity, {
        adapter: 'approval_signal',
        reason: 'watch_path_missing',
        state_path: statePath,
        watch_path: watchPath,
      });
      return { watching: 0, path: statePath };
    }
    try {
      const watcher = fs.watch(watchPath, (_eventType, changedFileName) => {
        const changedName = changedFileName ? String(changedFileName) : null;
        if (changedName && changedName !== fileName && path.resolve(watchPath, changedName) !== path.resolve(statePath)) return;
        schedule();
      });
      watcher.on?.('error', (error) => {
        if (signal.aborted) return;
        emitFatal(eventBus, identity, {
          adapter: 'approval_signal',
          reason: 'watcher_error',
          state_path: statePath,
          error: error?.message || String(error),
        });
      });
      watchers.push(watcher);
      if (opts.emitExisting === true) schedule();
    } catch (error) {
      emitFatal(eventBus, identity, {
        adapter: 'approval_signal',
        reason: error?.code === 'ENOSPC' ? 'watcher_limit_reached' : 'watcher_start_failed',
        state_path: statePath,
        error: error?.message || String(error),
      });
    }
    return { watching: watchers.length, path: statePath };
  }

  return {
    get signal() { return signal; },
    get watcherCount() { return watchers.length; },
    get pendingTimer() { return timer; },
    start,
    stop,
  };
}
