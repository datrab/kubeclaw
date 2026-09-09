# Independent readiness review — 2026-09-09

Reviewer: offline-gates agent, independently of the readiness implementer. Reviewed the shared worktree over HEAD `65369fafc2fd28055e8dcbfa3ff1848ddfc922ae`; uncommitted content is identified below. Read-only source review and existing raw evidence inspection; no functional edits, deployments, CI, or repeated broad tests.

## Conclusion

No additional blocking defect identified in the reviewed changes. The original independent review found that service shutdown ignored its in-flight BuildKit dependency probe. The implementer's subsequent cancellation fix addresses that cause rather than just changing the readiness response.

- `runDependencyProcess` rejects an already-aborted signal before spawn. After spawn it registers cancellation and rechecks the signal, so the registration window does not lose cancellation. Cancellation kills the isolated native process group and records a fixed cancelled result. Completion occurs only in the actual child `close` handler, which removes the signal listener and clears its deadline; cancellation does not resolve through a detached timeout result.
- `BuildkitReadiness.shutdown()` synchronously aborts its shared controller and awaits the current shared probe promise. Later checks see the permanently aborted signal and cannot spawn another process. Concurrent checks retain their original one-in-flight semantics; completed success is not cached.
- `BusterRemotePlanService.shutdown()` first prevents new work, cancels active execution, and now includes dependency shutdown in the existing deadline wait even when there are no jobs. A normal successful return therefore waits for probe settlement. If its existing shutdown deadline expires, it rejects explicitly; that rejection is not quiescence evidence.
- The earlier readiness response fix rereads bootstrap/stopping state after the awaited probe. Shutdown cannot produce `ready:true` from an earlier lifecycle snapshot. New admission checks the same configured dependency and rechecks stopping before durable acceptance.
- Prism worker `/bootstrap` deliberately proves local initialization for the existing post-install migration hook. Using the nonce-table `/ready` probe as that initial Helm readiness prerequisite would introduce a migration dependency cycle. `/bootstrap` does not prove operational database availability; the documentation states this limit.
- Prism's actual `/ready` and HMAC POST both use `WorkerNonceDatabase.run`, including the same nonce-table SQL and bounded original pg client. SPIFFE mode does not construct this unrelated HMAC database dependency. Buster E2E consumers use the shared `/readyz` reader rather than liveness.

## Evidence inspected, not rerun by this reviewer

`/tmp/kubeclaw-resume-readiness/cancellation-tests-final.txt` records five passed tests, zero skipped/failed. Its new cancellation case starts native Node plus a descendant, waits for actual PID evidence, aborts the production generic helper, checks child closure/nonrunning PIDs before return, and proves an already-aborted invocation never creates its marker. This tests real process cancellation, not a replacement BuildKit daemon. The same file records actual Helm rendering and the missing-native-BuildKit fail-closed test.

`/tmp/kubeclaw-resume-readiness/cancellation-runtime-final.txt` records the original authenticated HTTP runtime contract success and original Nova deadline/reconnection cases. Original-service coverage plus static wiring establishes the shutdown integration; no successful live BuildKit shutdown is inferred from a missing executable.

## Remaining limits

IFR-25-001 remains open for native operational proofs: successful BuildKit daemon RPC and loss/recovery, a real build/push, native PostgreSQL query cancellation/recovery, actual Kubernetes installation, and proxy SVID/SDS lifecycle. A bootstrap endpoint is not full operational readiness. `remote-plan-runtime.stop()` retains its existing HTTP-drain-before-service-shutdown ordering; this review does not claim immediate process cancellation at initial SIGTERM before that drain finishes. The helper awaits its direct child close and kills its ordinary process group; it is not a sandbox for adversarial descendants that deliberately create new sessions.

## Reviewed content hashes (SHA-256)

| File | SHA-256 |
| --- | --- |
| `skills/buster/engine/test-gates/dependency-process.ts` | `c1f305fd3281328e1cd5714b1366cb946907e2a96af2bf6c3f629c2ab4ed354b` |
| `skills/buster/engine/test-gates/buildkit-readiness.ts` | `7f50b4c1c6c1e661319dd2f9ba1afecf27dd19a26c06ac51ef52abc0d97703f3` |
| `skills/buster/engine/test-gates/remote-plan-service.ts` | `84a148bdcfc002536733f813ea6255138fd121ffe79e1f1e208b53c20209e0db` |
| `skills/prism/server/worker-readiness.ts` | `b760fe315ee28b214d1309cb6ac85e16256581168d1bb27070de29ac956d233e` |
| `skills/prism/server/worker-service.ts` | `a5f39cf1205a57bbee2fb4544f8166d475ce872851827ca797b9256e8e1a189b` |
