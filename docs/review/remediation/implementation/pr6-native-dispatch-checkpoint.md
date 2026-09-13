# PR6 durable Prism dispatch checkpoint

137/154 remain locally verified and 17 incomplete. This checkpoint does not close
the original four findings. Work continues in PR6; no deployment or live run.

## Implementation

Native Control commits the complete V3 envelope before HTTP dispatch. A short
PostgreSQL transaction serializes idempotency-key admission; HTTP and artifact
hydration run outside that transaction. Every retry uses the original envelope.
Migration 017 freezes native identity and an already stored result. A legacy
upsert cannot replace a pending native identity. Pre-existing pending legacy
operations require explicit reconciliation instead of a new native execution.

A bound terminal receipt is committed before evidence hydration. Hydration failure
therefore cannot cause re-execution; failed receipts are also retained. Completion
is only marked after successful hydration. Legacy receipt reading remains intact.

The shared HTTP transport has a configurable 64 MiB response bound and a generous
15-minute dispatch deadline, using PRISM_NATIVE_MAXIMUM_RESULT_BYTES and
PRISM_NATIVE_DISPATCH_TIMEOUT_MS. Timeout retains the pending original identity;
it does not claim remote cancellation or authorize another identity.

PostgreSQL jsonb changes object-key order. The real database test exposed an
order-dependent request digest. The corrected digest reconstructs the original
Prism producer order, preserving its historical digest after SQL round trips.

## Genuine local evidence

`docs/review/evidence/pr6-native-dispatch/` retains raw results, including the
initial jsonb-order failure. The current PostgreSQL gates pass with original
PostgreSQL 17.11 / pgvector 0.8.6, actual migration/roles, separate SQL connections,
real writer SIGKILL, original filesystem journal and original HMAC HTTP server.
The server runs as its ordinary database UID in an isolated test VM; its binary
and authentication rules are not patched. No query recorder, fake HTTP server,
mock cgroup or fabricated kernel measurement is used.

- One SQL integration case covers concurrent reservation, committed identity
  across SIGKILL, immutable original receipt replay and legacy-pending rejection.
- One actual HMAC/SQL/HTTP integration case proves V3 rejection by the original
  legacy worker retains the original identity and prevents legacy fallback before
  another authenticated request. This is deliberately a negative protocol test,
  not positive native cgroup execution.
- Fourteen original service/engine regression cases pass, including real artifact
  I/O and historical receipt binding. Prism typecheck and changed extracted
  production modules pass canonical lint. The existing Control monolith still
  has lint debt; its separate raw lint output is not described as a clean gate.

Reproduce against a dedicated empty loopback PostgreSQL server with pgvector:

```sh
export PRISM_NATIVE_OPERATION_TEST_ADMIN_URL=postgresql://postgres@127.0.0.1:25432/postgres
export PRISM_NATIVE_OPERATION_TEST_DATABASE_URL=postgresql://prism_runtime:native-operation-runtime@127.0.0.1:25432/prism
npm run verify:prism:native-dispatch
node --test skills/prism/tests/worker-service.test.mts skills/prism/tests/engine.test.mts
npm run typecheck --prefix skills/prism
```

The first gate refuses existing user databases/roles and creates only its test
Prism database. It leaves that database for inspection; the second gate uses it.
Use a new isolated server for another full run. These disposable test credentials
are not deployment values. Positive image/NRI/cgroup execution and Pod replacement
remain final live acceptance; Buster lifecycle and cross-store retirement still
require implementation.
