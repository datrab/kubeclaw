# Independent review: bounded original human-approval request projection

## Decision

The source through author `c02566af5106512da6d176fb4849c28802cbba99`, reconciled with remote `a43aa256bdce35d7f9c44d5d661e59c4055e562e`, is approved for the narrow duplicate-metadata slice after the genuine checks below. This is not completion of OBS retention or any native/external authentication finding. Integration still requires root review, current-head reconciliation, and repeat affected tests if dependencies change.

## Original authority and owning consumers

Five affected production files extend the original FileDurableRecordStore transition with a cloned, bounded locked-state view; add a strict original legacy JSON request projection reader; and supply a manual operator with original run → wait-store → delivery-store fences. The original reserve/receipt/complete/fail consumers validate the original payload digest and exact selected accepted receipt. `failDelivery` without a transport argument reconstructs the original JSON candidate from its actual request; it cannot bypass payload binding. Full legacy append-before-return behavior, v2 handoff refusal and retained record count remain intact.

The manual authority starts with original `readRunEvidence` and selected canonical requested/accepted/completed effect records, pinned installed human-approval/operator/wait providers, original effect audit and first attempt, original `recoverWaitCreation` (the committed first `attempt.completed`, not an invented `wait.created`), exact original wait-store value and selected canonical signal, real `wait.resolved`, and the distinct approved attempt before terminal run. Original expiry is bound to configured producer timing; historical approval timing uses recorded resolution, not the current wall clock. Final authorization rechecks bounded original evidence plus the exact accepted receipt in the actual delivery writer fence.

Caller scope/request/intent are cloned before awaits. Byte release accounts for the full original record versus its full replacement, including fixed-width original timestamp, digest and receipt fields. Only duplicated request payload bytes are removed; unique Core/effect/signal/wait history and the exact terminal receipt remain. No record-count release, automatic retention, archive deletion, quota increase, shadow Core/effect validator, alternate provider or external receiver receipt lookup was added.

## Independently discovered defect and correction

The genuine original completed fixture followed by an honestly chained conflicting signal with the same original single-use `idempotencyKey` but another `waitId` was wrongly accepted before correction (actual failing test, not a static hypothesis). Author `dd683268848864c8001028a7b563d9a936144933` adds exact selected-key uniqueness. Independent before and after evidence is preserved; the corrected test passes and delivery metadata remains byte-identical on rejection. Earlier review also required caller cloning and full-record byte accounting; both are present in the frozen source.

## Completed genuine checks

- Expanded operator matrix: 12/12 passed, zero skips, including original Core → signed loopback HTTP POST → original effect/wait journals → issuer-authorized local resume → distinct approved attempt; corrupted request/wait/signal/audit/receipt and unsupported v2/foreign/aliased ownership refuse unchanged.
- Actual 23,000-byte quota: a later original Core notification is initially blocked, exact net 7,358 bytes are released, then the next original Core notification reaches waiting and the second real POST occurs. The unchanged five-record quota still blocks further work. Small requests unable to fund projection metadata refuse atomically.
- Actual separate-process run refusal, delivery/wait writer fencing, wait-owner SIGKILL and concurrent stale original complete/fail producers preserve the same accepted receipt without another POST. Independent state-view mutations cannot alter committed records; asynchronous authorization and stale CAS refuse before writes and release the original fence.
- Additional independent historical-expiry case: 1/1 passed after a real one-minute wait. Original approval completed before its actual timeout; after real wall time crossed that expiry, metadata projection succeeded without editing original events/effects/signals/snapshot/wait bytes. No Date replacement or synthetic journal was used.
- Existing admission/attempt/telemetry/planner/dispatch sibling regression suite: 46/46 passed, zero skips. Its original Buster execution_error was `TEST_PROVIDER_SANDBOX_NOT_BUILT`; it is narrowly original failed-result/import/cancellation/storage replay, never a native provider success claim.
- Original operator plugin tests: five actual deliveries and package boundary passed. Shared/Nova TypeScript and canonical ESLint for all affected files passed with unchanged rules. Independent added expiry test lint and whitespace checks passed.

Raw commands/results: `docs/review/evidence/run8-operator-independent-final.txt`; before/after single-use regression: `run8-operator-independent-signal-before.txt` and `run8-operator-independent-signal-after.txt`; locked-view proof: `run8-operator-independent-state-view.txt`.

## Limits and next action

Eligible only for completed, causally bound original legacy JSON human approvals with exact accepted receipt and positive net savings. Waiting/active/uncertain/unapproved, missing or externalized selected authority, v2/Discord and mismatched histories remain outside this slice and fail closed. The fixture proves trusted local caller issuer authorization and an actual signed HTTP transmission, not external operator authentication or receiver durability. No cryptographic claim against coordinated rewriting of all trusted local stores is made. Broader retention and other findings stay open. Root must integrate only against its freshly read branch head and repeat against any newly integrated SDK snapshot dependency.
