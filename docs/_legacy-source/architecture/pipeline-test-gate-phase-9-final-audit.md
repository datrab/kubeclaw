# Pipeline Test Gate Phase 9 Final Audit

Status: complete; Phase 10 cutover and legacy deletion remain

## Result

The provider-based unit path is equal to or better than the legacy unit suite.
All 93 baseline IDs are proved:

- 23 valid behaviors are preserved;
- 56 behaviors are improved through explicit configuration, structured
  reports, stronger isolation, clearer states, or richer evidence; and
- 14 accepted legacy defects are prevented.

The legacy unit path remains authoritative. The replacement is shadow-only.
No Phase 9 code switches production authority or deletes the old path.

## Subphase result

### 9-A

Corrected traceability to include `UNIT-EXEC-003A`, established the exact
93-item JSON parity ledger, added strict validation, and generated the readable
parity report from the same source.

### 9-B

Proved explicit selection, operator denial, committed input, stable identity,
contained paths, protected environment denial, literal commands, required
reports, multiple instances, blocking/advisory mode, and dual-authority
rejection.

### 9-C

Combined focused Phase 9 proof with retained Phase 8, Phase 7, provider,
runner, restart, duplicate, retry, concurrency, cancellation, timeout, output,
evidence, receipt, and graph tests. Results and attempts remain durable and
Nova remains the only gate authority.

### 9-D

Ran Node's real built-in test runner. The legacy path consumed real TAP output;
the replacement consumed real built-in JUnit output. Equivalent Jest, Vitest,
Mocha, and pytest facts were checked against JUnit normalization without
restoring console-regex authority. All 14 known defects have negative or
equal-or-better proof. All 15 required new behaviors have real proof.

### 9-E

Added a frozen legacy-authoritative comparison result. The returned gate result
is the legacy object by construction and returns before shadow work starts.
Shadow collection is a separate lazy, idempotent, cancellable, time-bounded
step. A failed or timed-out shadow is evidence only. The comparison document
explains every intentional difference.

### 9-F

Ran a real committed Node test through Nova planning and graph storage, signed
source dispatch, authenticated HTTP, Buster storage and recovery boundary, the
default runner, isolated provider and command processes, Node's JUnit reporter,
adapter normalization, evidence import, and a shadow Nova decision. Counts were
one pass, one skip, zero failures, and zero errors.

## Defects found and fixed

### Missing parity item

The traceability expression accepted only three numeric digits and silently
excluded `UNIT-EXEC-003A`. It now supports the documented suffix and fixes the
expected count at 93.

### Stale unit successor identity

The legacy bridge still named `kubeclaw.command-test@1`. Phase 8 implemented
`kubeclaw.direct-command@1`. The stale name disabled the unit dual-authority
guard. The bridge now names the real provider, and an executable regression
test proves that selecting both paths fails before execution.

### Node JUnit dialect gap

Node 24 emits direct `<testcase>` children under `<testsuites>`. The adapter
previously required an intermediate `<testsuite>`, so a real built-in report
failed. The adapter now accepts both common nesting forms while retaining XML,
depth, size, entity, finding, case, path, and duration limits.

### Shadow work on the authority path

The first comparison helper waited for shadow work. A crash, synchronous throw,
or hung shadow could therefore reject or delay a valid legacy result. The final
helper completes the legacy gate first. Shadow work starts only through an
explicit `collectShadow()` call. The call is idempotent, has its own timeout and
abort signal, and returns failure or timeout as comparison evidence.

## Comparison result

The old and new paths agree on pass and fail meaning. The replacement is more
accurate for skipped tests: the old TAP parser reported total 2, passed 1,
skipped 0, while the structured JUnit result reported total 2, passed 1,
skipped 1. This is an accepted improvement, not a parity failure.

Other differences are intentional: no npm discovery, no shell strings, no
console parsing, separate timeout and cancellation, full retained evidence,
multiple independent instances, stable identities, explicit advisory policy,
and independent coverage.

## Contained test boundary

All Phase 9 acceptance work runs inside the Nova pod with real source,
processes, HTTP, providers, reports, evidence, and policy. The pod has a
read-only cgroup mount, so the tracked test harness uses sampled accounting for
that unavailable host facility. The deployed Kubernetes runtime now uses the
same explicit fallback instead of requesting host cgroup administration.
External production-platform proof remains deferred until all suites have
migrated and only one authority path remains.

## Verification

The following checks passed:

- focused Phase 9 verification and all 93 parity-ledger entries;
- the real legacy-versus-replacement comparison;
- the real Nova-to-Buster Node/JUnit vertical proof;
- the complete Phase 8 and Phase 7 regressions;
- the full repository contract suite;
- all 35 plugin package tests;
- all 40 executable-registration crash-containment tests;
- Nova and shared-runtime TypeScript checks;
- generated-document, inventory, and documentation-coverage checks;
- Git whitespace checks; and
- the production dependency audit with zero vulnerabilities.

The complete documentation command reports only the known missing Prism draft
linked from the architecture index. Prism is outside this migration session.

## Final Terra review

The closeout review used `gpt-5.6-terra` with high reasoning. Five findings
were accepted and fixed. They covered asynchronous shadow failure, synchronous
shadow failure, a hung shadow on the authoritative path, and timeout values
that exceed Node's timer range. The last finding fixed a race between recording
the timeout and aborting the shadow. No finding was rejected. The final review
was clean and classified the patch as correct.

## Phase boundary

Phase 10 must refuse cutover unless the 93-item ledger remains fully proved. It
then switches unit authority once, rejects ambiguity, updates real fixtures,
deletes every old unit surface, and negatively proves that the legacy unit path
cannot return.
