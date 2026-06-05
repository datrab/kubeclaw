# OI-43 non-critical observability plan

Status: phase 3 implemented
Owner surface: Buster Discord transport, Nova git soft-fail callers, Nova model-policy audit warning

## Contract seams

### Discord transport

`skills/buster/pipeline/services/discord.ts` owns webhook delivery health telemetry through:

```js
export async function deliverDiscordWebhookRequest(request = {}, context = {})
```

`request` is protocol-agnostic:

```js
{
  webhookUrl?: string,
  payload?: object,
  body?: Buffer|string,
  headers?: object,
  timeoutMs?: number,
  signal?: AbortSignal,
  fetchImpl?: Function
}
```

The helper forwards JSON or multipart/raw requests to the shared `postDiscordWebhook()` transport. It emits `observability.degraded` / `observability.restored` through the existing Buster Discord health machinery and does not add visual-reg-specific logic.

### Git soft-fail callers

Low-level git helpers keep retry behavior local and do not emit degraded telemetry for transient retries. Soft-fail persistence loss is emitted by orchestration callers that have module/gate context:

- `skills/nova/pipeline/runners/module-runner-forge.ts` — forge-only module persistence.
- `skills/nova/pipeline/runners/review-gate-task.ts` — review output persistence.
- `skills/nova/pipeline/runners/gate-forge-fix-cycle.ts` — gate fix output persistence.
- `skills/nova/pipeline/runners/buster-gate-terminal.ts` — persisted Buster gate PASS status.

These callers emit one-shot `observability.degraded` events through `skills/nova/pipeline/services/git-soft-fail-observability.ts` with `component: 'git_worktree'`, `surface: 'commit_push'`, and `reason: 'git_commit_push_soft_failed'` when the soft-fail result contains an error. No restored event is emitted for a skipped commit.

Phase 2 centralized the stable payload builder in that helper while preserving caller-owned context and keeping `git-worktree.ts` telemetry-free for transient retry behavior. Focused verification is `tests/verification/contracts/check-git-soft-fail-observability-surface.mjs` plus the existing operator-surface behavior regression.

### IO warning schema

Model-policy audit append failures emit a point-in-time Redis-oriented warning event instead of a degraded/restored state machine:

```js
{
  component: 'model_policy',
  surface: 'audit_log',
  reason: 'policy_audit_append_failed',
  operation: 'append',
  path: '<absolute path to model-policy.jsonl>',
  path_role: 'model_policy_jsonl',
  detail: '<error message>',
  code: '<fs error code or null>',
  errno: <fs errno or null>,
  syscall: '<fs syscall or null>',
  module_id: '<optional module id or null>',
  gate_id: '<optional gate id or null>',
  gate_type: '<optional gate type or null>',
  attempt: <optional attempt or null>,
  dispatch_id: '<optional dispatch id or null>',
  session_key: '<optional session key or null>',
  warning_at: '<ISO timestamp>'
}
```

The event type is `system.io_warning`. Emission uses `skills/nova/pipeline/services/system-io-warning.ts`, which calls `emitTelemetryStreamEvent()` directly so policy audit, structural logger, and prompt artifact file failures do not depend on the file-backed telemetry append path.

Phase 3 centralized point-in-time I/O warning emission in that helper. `emitSystemIoWarning()` owns generic validation/emission and `emitPolicyAuditAppendWarning()` owns the model-policy audit append specialization (`component: 'model_policy'`, `surface: 'audit_log'`, `reason: 'policy_audit_append_failed'`, `path_role: 'model_policy_jsonl'`). Focused verification is `tests/verification/contracts/check-system-io-warning-surface.mjs` plus the existing operator-surface behavior regression.
