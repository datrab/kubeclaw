# Audit/Delete-If-Obsolete Changelog

Date: 2026-05-30

Source checklist: `docs/reviews/2026-05-29-pipeline-simplification-execution-checklist.md`

## Item 38 - Lifecycle Read Model Active-Session Weak-Evidence Guards

- Audited module lifecycle active-session producers before deleting recovery guard code.
- Found the remaining live weak producer in `skills/nova/pipeline/services/status-store.ts`: `saveStatus()` projected `status.active_agent` and status-level session correlation into `readModels.active_sessions.modules[moduleId]` even when run/attempt/dispatch/session identity was incomplete.
- Removed that weak emission path. `syncRuntimeSnapshotToReadModels()` now builds module active-session authority through `buildStrongModuleActiveSessionProjection()` and only writes `active_sessions.modules[moduleId]` when `status.active_agent` has complete strong identity.
- Removed the status-level `status.session_key` fallback from lifecycle active-session authority projection. Status-level correlation can still update the module status read model, but it no longer creates active-session authority evidence.
- Normalized numeric attempts before active-session authority checks so current runtime producers that pass numeric attempts do not create type-only weak records.
- Deleted the obsolete `lifecycle_active_session_identity_incomplete` module authority branch from `buildActiveSessionAuthorityPolicy()`; incomplete lifecycle input is now treated as no lifecycle authority.
- Updated contract and recovery behavior coverage so weak module fixtures block as `no_lifecycle_active_session` instead of relying on a weak-evidence policy code.
- Updated the execution checklist item from `keep` to `done` with the cleanup decision.
- Verification:
  - `node tests/verification/contracts/check-session-authority-slice-surface.mjs --source-root .`
  - `node tests/verification/contracts/check-status-store-slice-surface.mjs --source-root .`
  - `node tests/verification/behavior/verify.mjs --source-root . --areas restart-recovery`

## Item 39 - Gate Active-Session Weak-Evidence Guards

- Audited gate active-session producers before deleting any recovery guard code.
- Found live file-evidence producers in review gates, Buster gates, and gate fix cycles:
  - `skills/nova/pipeline/runners/review-gate-task.ts`
  - `skills/nova/pipeline/runners/buster-gate-runner.ts`
  - `skills/nova/pipeline/services/gate-fix-scaffold.ts`
- Confirmed the shared writer `persistGateActiveSession()` was the remaining weak gate active-session producer because it only required `entry.sessionKey` and allowed nullable `attempt` / `dispatch_id` fields.
- Removed that weak emission path. `persistGateActiveSession()` now normalizes run/attempt/dispatch/session identity, rejects incomplete identities before writing, and returns `false` when a weak record would have been emitted.
- Hardened gate recovery policy so incomplete lifecycle, file, or tracked-agent identities are ignored instead of surfaced through a weak-evidence policy branch.
- Deleted the obsolete gate `lifecycle_active_session_identity_incomplete` policy branch.
- Confirmed production code has no current writer for `readModels.active_sessions.gates`, so the deleted weak lifecycle branch had no current emitter.
- Updated contract coverage so a session-only gate record is not persisted and does not remain inspectable as recovery evidence.
- Updated the execution checklist item from `keep` to `done` with the cleanup decision.
- Verification:
  - `node tests/verification/contracts/check-gate-active-session-surface.mjs --source-root .`
  - `node tests/verification/behavior/verify.mjs --source-root . --areas gate-session-persistence`
  - `node tests/verification/behavior/verify.mjs --source-root . --areas restart-recovery`
