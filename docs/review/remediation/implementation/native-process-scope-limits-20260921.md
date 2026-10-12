# Native process to scope limit boundary correction

Pre-edit criteria:

- NP1: project only memoryBytes and tasks at the process-to-owner allocation boundary; retain strict child and persisted decoders.
- NP2: retain all process policy fields for input/output, timeouts and measured resource enforcement. Maintained tests invoke the original process runner with real child processes and explicitly modeled ownership, never claim kernel enforcement from those models.
- NP3: demonstrate the pre-fix allocation failure and fixed success, plus independent budget failures, without changing original native kernel cases or their deadlines.
- NP4: run scoped types/lint and relevant original process tests after the ongoing VM finishes; obtain a fresh non-author review.
- NP-DOC: update operational documentation with the actual regression and proof limits, preserve failed VM evidence and acknowledge that the previous topology review missed this production consumer boundary.

Root identified this production regression from VM run 2: the complete process policy reached the new strict cgroup-limit decoder. This is a product defect, not a VM fixture failure. The one-line boundary projection is implemented; [fresh independent review](independent-native-process-scope-limits-20260921.md) accepted this bounded correction.


## Implementation and evidence

Only the allocation argument changed in production. The local complete policy
snapshot still controls validation, input admission, real stdout/stderr limits,
timeouts, polling and final resource classification. Strict child decoders were
not changed. The new maintained test is included in the node-pools command and
native typecheck project; original live kernel cases and deadlines are unchanged.

Before the fix, the four-case regression produced one pass and three
`WORKER_NATIVE_LIMIT_INVALID` failures. Afterward all four pass: exact scope-only
allocation plus real echo, input rejection before allocation, actual output cap
and deadline, and explicitly modeled measured CPU enforcement. Original launch
and cancellation tests plus these regressions pass **12/12**, zero skipped or
cancelled. Scoped native TypeScript and canonical ESLint both pass. An initial
ESLint invocation without the repository config failed before checking files;
its log is retained alongside the corrected explicit-config run.

Evidence is under `../../evidence/native-process-scope-limits-20260921/` with
before source, before/after tests, original test output, exact commands and final
identities. Run 2 remains failed evidence on the old frozen source: eleven native
cases passed, the real process consumer failed. This local regression is real
process orchestration with modeled ownership, not a replacement for the original kernel consumer. The separate frozen VM run 3
subsequently passed all 12 original native cases, including that unchanged
whole-host/replay consumer. See the [run 3 execution record](isolated-native-vm-run3-proposal-20260921.md)
and the independent correction review. Node-pools remained incomplete: 34 of 39
passed, one missing-parser failure and four timeout cancellations; no skipped cases. The earlier topology review missed this
actual consumer-policy boundary; no full native or Buster acceptance is claimed.
