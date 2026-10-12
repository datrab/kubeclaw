# Private cleanup-disposition implementation — V1

Source-only author draft for independent review. No live production/test files changed and no runtime, typecheck or lint command executed for this draft. Existing runtime freeze is respected. Twenty proposed files comprise ten production/SDK files, four original caller/command migrations, five new fixture/test files, and one architecture document. The package command is additive.

## Contract and scope

Required host authority `incomplete | completed-fixture` is checked before a replacement process is created and forwarded through explicitly versioned cleanup IPC. Ordinary/faulted-attempt cleanup is incomplete; final retained cleanup checks completed/passed fixture identity and absence of cleanup failure. No provider-local success flag, default-completed value, policy knob, old snapshot rewrite, new grant or durable cleanup retry authority is introduced. Successful retain semantics remain. Failed preparation preserves both local causes through AggregateError; only the existing top-level marker crosses capability IPC.

The pinned-old-plugin compatibility problem remains OPEN: passing an extra argument cannot change old provider source. The existing loader snapshot removal in finally also remains; replacement-session cleanup is not durable historical recovery.

## Prepared tests and boundaries

- Two public invoker cases: original failure preserved after successful rollback; both wrapped cause identities preserved after rollback failure, using an independent rollback AbortSignal.
- Four actual TestPlanRunner/registered-current-Kubernetes-provider cases: retain/delete crossed with failed/successful preparation. Real registry digest, provider children, capability IPC and replacement cleanup child are used. External kubectl API execution is injected; no cluster/native acceptance is claimed. Failed cleanup must block the explicitly permitted unsafe retry; successful retain must not delete.
- One Runner fault case injects EPERM only at the first actual owned deploy process-group SIGTERM, forwarding all other signals. It requires actual close and incomplete authority for that attempt despite earlier provider success. Its outcome is unexecuted and must be established by the real run, not assumed.
- Three appended original child-session tests reject missing/invalid/version-mismatched authority before plugin cleanup. Original child-session and ownership cases only gain explicit valid cleanup arguments/messages; original assertions and deadlines are retained.
- Invalid LoadedProvider authority values must reject before creating another child. The safe new ownership helper tracks actual provider/report entrypoints, forwards genuine store/tool children, bounds real group cleanup and actual close, and retains roots on unresolved ownership/close errors.

## Planned verification after coordinated integration

Run `npm run verify:buster:kubernetes-cleanup` under the existing genuine tool mapping, then affected original Runner/recovery/plugin suites, scoped type coverage and canonical lint. No timeout changes or replacement of actual provider runtime are authorized by this document. Confirm all required SDK callers and final retained identity fields under TypeScript; private source reading is not a typecheck.

Semantic negative controls (each requires a passing control run and actual assertion failure):

1. `BUSTER_CLEANUP_MUTATION=rollback-suppressed node --import ./docs/review/evidence/kubernetes-cleanup-disposition-20260921/mutate.mjs --test tests/verification/contracts/kubernetes-cleanup-errors.test.mjs`
2. `BUSTER_CLEANUP_MUTATION=recovery-completed node --import ./docs/review/evidence/kubernetes-cleanup-disposition-20260921/mutate.mjs --test tests/verification/contracts/kubernetes-cleanup-runner.test.mjs`
3. `BUSTER_CLEANUP_MUTATION=faulted-completed node --import ./docs/review/evidence/kubernetes-cleanup-disposition-20260921/mutate.mjs --test tests/verification/contracts/kubernetes-cleanup-runner.test.mjs`
4. `BUSTER_CLEANUP_PROVIDER_MUTATION=retain-unconditional node --test tests/verification/contracts/kubernetes-cleanup-runner.test.mjs`

The fourth control mutates only a verified nonaliased private plugin copy BEFORE discovery/digesting. Host loader hooks cannot stand in for a mutation inside a pinned real provider child. Existing command/tool mappings must be retained for all controls.

## Binding

`manifest-v1.json` binds exact proposed files, before snapshots, additional unchanged source context and review helpers. `change.patch` is reviewable only: do not blindly apply while runtime freeze is active or across baseline drift. `prepare-private.py` records construction history, not a final regeneration recipe; manifest-bound files are authoritative for this review. Historical proposal and before-identities remain intact.
