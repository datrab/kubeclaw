# Prism completion CPU accounting — verified partial correction

PCR-PRISM-WORKER-002 remains incomplete. This change fixes the frozen execution
counter, not the missing exclusive attempt process owner. No other finding is
closed and no native containment or browser execution is claimed.

`PrismWorkerOperation.execute()` previously froze CPU at execution settlement.
The original Core already measures again after completion hooks, but received
that frozen value after full-log upload. The operation now returns the cumulative
user-plus-system CPU delta at each observation, including the final observation.
It still uses the shared service process; concurrent attribution, browser-tree
accounting and exclusive scope quiescence remain unresolved.

## Regression and local checks

The new case in `skills/prism/tests/worker-service.test.mts` executes the original
Prism render, Worker Core, artifact HTTP handler and content-addressed store. A
specialized artifact client performs real CPU work in its full-log upload method
and then calls the original upload implementation. It consumes over 1,100 ms of
measured CPU with a 1,000 ms attempt limit. This is a completion-accounting
regression, not a native isolation test or a production workload benchmark.

Before the product change, the single new test failed: the result was `completed`
instead of `errored`. After the change it returns `WORKER_CPU_LIMIT`, validates
against the original result contract and retains the byte-exact uploaded log.
The older test requiring CPU to remain frozen after execution was corrected to
require cumulative completion observations; its prior-lifetime exclusion remains.

Executed commands:

- Before: `node --test --test-name-pattern='CPU consumed by' skills/prism/tests/worker-service.test.mts`: 0 passed, 1 failed (incorrect `completed`).
- After: `node --test --test-concurrency=1 skills/prism/tests/worker-service.test.mts skills/prism/tests/worker-cancellation.test.mts`: 11 passed, 0 failed, 0 skipped.
- `npm run typecheck --prefix skills/prism`: exit 0.
- `./node_modules/.bin/eslint --config charts/kubeclaw/files/config/eslint.config.mjs skills/prism/server/worker-operation.ts skills/prism/tests/worker-service.test.mts skills/prism/tests/worker-cancellation.test.mts`: exit 0.
- `git diff --check`: exit 0 after restoring missing base objects.

An initial ESLint invocation omitted the repository's explicit config and failed
to locate one; only the explicit canonical-config invocation above passed.
The transient checkout had lost its alternate object directories. All 4,862
unchanged indexed files and the three exact original changed-file blobs were
restored only after matching their existing Git hashes. Reconstructed base tree
`f98abe7412afc3c03f7b0b33d8b70f6f6bd6e380` matches the published PR base exactly.

D12 continues to defer live acceptance to the user. The four outstanding findings
still contain implementation work; this checkpoint does not claim their completion
or five active hours.
