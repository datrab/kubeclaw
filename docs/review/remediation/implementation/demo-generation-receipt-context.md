# Observed generation and receipt-context prerequisites

The controller requires the exposure generation authenticated by the successful test. The previous public-endpoint output and authentication evidence omitted it. The typed exposure now includes exposureGeneration from the final controller-observed Ready lease after ownership transfer. The new observedExposureHandoff helper requires a positive safe generation, matching status.exposureGeneration, Ready phase and the transferred owner. The persisted ownership annotation remains unchanged: stamping its pre-transfer generation would incorrectly bind a potentially different observation.

The original session authentication provider requires that typed field and emits it in demo-auth-evidence.v1. Nova's original verified-import projection compares it exactly against the exposure output. No current-generation read can replace the originally tested value. Missing generation rejects authentication before any HTTP request; altered imported authentication generation rejects projection. This extends existing open value objects; it introduces no invented schema registry or version waiver.

The neutral adapter starter now executes receipt(request) under the actual request's execution key and attempt, with a lifecycle-bound phase. This mirrors invoke ownership without inventing a resource fence. It prevents original recovery reads from falling back to adapter-activation identity. A final phase check rejects lifecycle-revoked completion. Receipt callbacks remain readonly reconciliation operations.

## Frozen scope

- skills/nova/core/execution/adapter-startup.ts: only original receipt callback owner context.
- tests/verification/reliability/adapter-dependency-identity.test.mts: actual subprocess death/recovery, foreign-run and lifecycle-abort receipt tests.
- skills/buster/engine/test-gates/exposure-handoff.ts and tailscale-exposure-runtime.ts: observed post-transfer output binding, no annotation rewrite or retention change.
- skills/buster/plugins/tailscale-exposure/src/provider.js: require typed observed generation for readiness handoff.
- skills/buster/plugins/demo-auth-smoke/src/protocol.js and provider.js: required input and output generation.
- skills/nova/plugins/remote-test-gate/src/demo-evidence.ts: exact original import binding.
- skills/buster/plugins/demo-auth-smoke/tests/live-function.test.ts, skills/nova/plugins/remote-test-gate/tests/evidence-projection.test.ts, tests/verification/reliability/demo-exposure-handoff.test.mjs.
- This note and five demo-generation* evidence logs.

Unfinished demo-handoff package, new operator receipt capability/helpers, vocabulary/authorization and compiler work are excluded.

## Evidence and limits

`docs/review/evidence/demo-generation-receipt-tests.txt`: 7/7 PASS. Original kubectl/provider runs against the existing local Kubernetes API contract server; transfer/replay binds final observed generation and rejects stale status. Original Go controller creates generated credentials, original network runtime authenticates to the real local session application, and original HTTP importer/artifact store projects verified evidence. Deployment/remote worker envelopes remain explicitly labelled contract vectors, not live cluster/Tailscale proof.

The dependency test launches a real separate runtime and SIGKILLs it after its nested HTTP completion but before the outer receipt. Reconstructing the original runtime calls receipt with the same parent ownership and performs no duplicate HTTP. A distinct foreign run retains its actual run identity. A pending receipt HTTP read aborts on real runtime shutdown. Original accepted-prefix operator ownership/transport/large-payload tests still pass.

`demo-generation-receipt-nova-tsc.txt` and `demo-generation-buster-tsc.txt`: owning typechecks PASS.

`demo-generation-receipt-lint.txt`: canonical lint has six pre-existing diagnostics: four direct environment reads in tailscale-exposure-runtime.ts and configuration/deploymentInput complexity 17/32 in the existing provider. `demo-generation-lint-baseline.txt` checks those exact files from HEAD through canonical ESLint and reproduces the same six diagnostics. No introduced lint diagnostic or suppression.

No deployed TokenReview/Discord/Tailscale readiness is inferred, and no deployment, external delivery or commit was performed.

Root independently inspected both sender/receiver generation binding and the original receipt owner/lifecycle wrapper. The seven focused tests passed again; raw output: docs/review/evidence/demo-generation-receipt-root.txt. The test run used the shared worktree including the separately reviewed audit-mode producer; isolated committed integration remains a separate gate.
