# Independent Prism worker HTTP cancellation review

Reviewed local commit `7d172b6cee37d2f9e38165f81d06413b4a7cb935`, exact tree
`54e71a20e2ee75289159f8533b62030a629967fb`, against parent
`6f300ece9b9e71daa485100d06f7ce666baaae12`. Separate detached worktrees were
used for original and corrected source. This reviewer did not author the fix.

No blocking issue found in this bounded change.

At `skills/prism/server/worker-service.ts:25-28`, disconnect cancellation is
bound to the request-owned invocation, excluding normal completed responses
using `response.writableEnded`. At line 67 the existing controller's signal is
passed to `executeWorkerAttempt`; `worker-attempt.ts:8-11` forwards it to the
unchanged shared WorkerAttemptExecutor. The optional argument preserves existing
non-HTTP callers. No role-specific copy of cancellation/cleanup logic is added.

The synchronous request owns this attempt; the service does not accept detached
jobs into a worker-side durable result queue. The original core already handles
abort-before-start, in-operation cancellation, bounded draining, terminal phases,
and cancellation during log persistence. This change supplies the missing
request lifetime rather than inventing a separate cancellation authority.
Normal response completion does not abort already completed work. Persisted
receiver bytes remain persisted when an upload acknowledgement is interrupted.

## Reproduction and regression evidence

Copied the exact new `worker-http-cancellation.test.mts` into the otherwise
unchanged parent worktree, ran it, then removed it. Both original disconnect
cases failed with `artifact I/O remained active after caller disconnect`; the
normal response control passed. The parent worktree was clean after removal.

Ran on the corrected worktree:

```sh
node --test skills/prism/tests/worker-http-cancellation.test.mts skills/prism/tests/worker-cancellation.test.mts skills/prism/tests/worker-service.test.mts skills/prism/tests/worker-readiness.test.mts skills/prism/tests/provider-cancellation.test.mts
npm run typecheck --prefix skills/prism
node node_modules/eslint/bin/eslint.js --config charts/kubeclaw/files/config/eslint.config.mjs skills/prism/server/worker-attempt.ts skills/prism/server/worker-service.ts skills/prism/tests/worker-http-cancellation.test.mts
node scripts/check-runtime-package-ownership.mjs
```

All commands exited 0. Regression: **19 passed, 0 failed, 1 skipped**. The skipped
case explicitly requires `KUBECLAW_PRISM_READINESS_TEST_DATABASE` and is the
native PostgreSQL query-cancellation/pool-release test; it is not passed native
PostgreSQL evidence. The three new HTTP cases all passed. Final corrected source
worktree was clean.

The new tests use real caller sockets, original worker HTTP admission, shared
core, artifact client and content-addressed file storage. The deliberately
stalling local receiver is a fault-injection HTTP endpoint: it sends incomplete
response bodies, and for upload records actual received bytes before withholding
its acknowledgement. That stalled branch is not the complete production Control
handler. The normal response case does use the original internal-artifact
handler and proves the bound completed result plus persisted full log. The
engine uses its explicit deterministic test provider; this is not real model,
Chromium or production SPIFFE/Envoy execution. These boundaries are appropriate
for reproducing the missing cancellation-signal propagation.

Exact argv, source roots, exit codes, original failure logs, corrected output,
static checks, clean-source checks and reproduction script are retained under
`docs/review/evidence/resume-84-worker-http-independent/`. No test assertion,
production dependency or security boundary was weakened. No native prerequisite
was replaced to manufacture a passing result.

This review does not cover subsequent SIGTERM lifecycle work, actual browser
process drainage, cross-attempt resource accounting, PostgreSQL restart, or full
semantic/provider acceptance. No broader finding is closed by this bounded fix.
