# PCR-PRISM-AGENT-BRIDGE-001 / 002 — durable external actions

Frozen implementation for independent review, based on the original bridge
findings and D01–D11. No commit, deployment, external agent call or release was
performed by this author.

Control now persists each agent action before returning an accepted response.
Migration 014 stores the preference-generation UUID, project, operation, exact
request and canonical digest, session namespace/key, owner/fence, deadline,
external-action state, the trusted accepted V2 attempt envelope, result digest/receipt
and original terminal diagnostics.
Studio revision starts also persist actor-scoped request keys and their exact
source/instruction digest. A dropped HTTP response or a reload preserves the
same start key and request; it cannot silently manufacture a fresh generation.

The bridge polls Control through its existing SPIFFE proxy boundary. A database
claim serializes admission and reserves a complete project session. Only
`accepted` jobs can start. Jobs whose source is already superseded are retired
without a fence, before external execution. Persisted accepted jobs survive a
bridge or database reopen. `running` jobs are never requeued: a lost launch
response, interrupted local process, missing result callback, or expired claim
becomes `needs_nova`. These jobs also block subsequent actions in their session.
There is deliberately no automatic expiry-based restart of an unknown gateway
action, and no automatic force-clear endpoint. Operator reconciliation needs
actual gateway/session evidence; the ledger retains its original identity and
outcome for that work. Known result receipts are retained even when final gateway
completion is uncertain. A bound V2 Core completion receipt for the exact persisted claim, plus a fenced
committed tool receipt, is required for `completed`. Bare success objects and
changed policy, worker or evidence-accounting values are rejected at Control.

The fence is passed in the actual OpenClaw prompt and required by both original
Prism tools. Design-set and revision repositories lock the job row inside the
same transaction as their existing document changes and round/revision guards.
An expired or foreign fence cannot write; an exact committed callback replay
returns the recorded result without another mutation. A changed callback payload
under the same identity fails. Callback receipt and document result commit or
roll back together. No deterministic Prism engine is used as a substitute agent.

Session names are `prism-v2-` followed by SHA-256 over the exact pair of trusted
Control SPIFFE namespace (`<Control SPIFFE ID>/prism/main/v2`) and complete
external project ID. Punctuation, long common prefixes and distinct Unicode
sequences remain distinct. The persisted mapping is authoritative. There is no
lookup, normalization-based adoption or migration of pre-v2 sessions. Revision
prompts supply the complete current document when beginning the new namespace.

The bridge uses the real shared WorkerAttemptExecutor, with a profile identifying
the local OpenClaw launcher. Core bounds local execution, cleanup, output and
result handling; the original stdout/stderr log is uploaded to the existing
content-addressed Control artifact store. The agent SPIFFE principal is allowed
at that artifact route, alongside the existing worker and Control principals.
Local process termination drains `close` and terminates its process group. A
local timeout cannot prove cancellation of the separately running gateway/model,
and is therefore NeedsNova. The launcher explicitly opts into resource-aware envelope/profile/result V2 on
that same executor. Its local CLI process-tree CPU, memory and process-count
budgets are explicitly unrequested, with measurements unavailable and reasons in
the profile and terminal receipt. It never reports bridge-parent counters as
child measurements. The V1 bounded profiles remain unchanged. No per-action
child resource quota, remote resource quota or guaranteed gateway cancellation
is claimed; existing pod/container ceilings are separate infrastructure limits.
See `prism-agent-resource-v2.md` for the contract correction and regression
against the independent real-child CPU counterexample.

The agent image packages the actual WorkerCore/contract and production modules
from the existing repository lock. The COPY context now includes all bridge
companions, including preference-prompt.mjs, which the prior image omitted even
though the entry point imported it. A relocation/import regression uses those
actual COPY source paths, original Core sources and installed locked dependency
modules. It is an import/build-context check, not a Docker build or running image.

Studio preserves the revision payload/key/job across uncertain requests and
reloads. Its existing action becomes “Reconcile existing change” while a request
is retained; edited textbox contents cannot alter that retained action. The real
job status is polled, and completion consumes its recorded document rather than
accepting any unrelated increment of document revision. NeedsNova and blocked
sessions retain operation context, HTTP status and original Control diagnostics
in the existing escaped private error display. New-round polling also observes
its job's unresolved status. The existing shared D01 response helper is used.

## Owned paths

- `skills/prism/storage/migrations/014_agent_jobs.sql`
- `skills/prism/control/agent-jobs.ts`, `agent-admission.ts`
- `skills/prism/server/agent-session.ts`, `agent-attempt.ts`, `agent-process.ts`,
  `agent-job-routes.ts`, `agent-job-runner.mjs`, `agent-prompt.mjs`
- Existing `server/agent-bridge.mjs`, narrow `server/control.ts`,
  `server/internal-artifacts.ts`, `storage/index.ts`, `openclaw-plugin/index.mjs`
- `studio/agent-revision-client.ts` and narrow `studio/app.tsx`
- `docker/Dockerfile.prism-agent` dependency build/COPY only
- `tests/agent-{jobs,process,job-http,revision-client}.test.mts`,
  `tests/agent-{package,bridge-admission}.test.mjs`, existing
  `tests/preference-bridge.test.mjs`
- Existing `tests/verification/contracts/check-prism-postgres-transactions.mts`
  adds the real pooled claim/fenced-result race gate.

## Executed evidence and limits

`docs/review/evidence/prism-agent-jobs-tests.txt`: 25/25 passing tests. These
include actual production migrations and PGlite SQL, database close/reopen,
original repository writes, fence expiry/conflict/replay, pre-start source
retirement, actual HTTP job routes/auth parsing, a genuinely dropped revision
admission response backed by the real ledger, original WorkerCore with real Node
child processes, real artifact HTTP writes/readback, timeout/output failure,
actual bridge rejection without persistence, prompt identity and relocated
package imports. Prior T02 round/client regressions are included.

The previous executable named openclaw used only as an argument recorder is no
longer needed by the preference test; that test now exercises the production
prompt directly. Real process tests run Node through the same production process
operation. No provider/model or OpenClaw executable is impersonated.

Prism and actual Studio TSX typechecks pass; new modules/tests pass canonical
ESLint. The recorded comparison preserves existing monolith lint debt: Control
55→53, bridge 12→6, storage 4→4, plugin 3→3, Studio 5→5, internal-artifacts 0→0.
React production build passes (existing chunk-size advisory remains).

Native PostgreSQL pool execution is still blocked by
`REAL_POSTGRES_DATABASE_REQUIRED`, recorded in
`prism-agent-jobs-native-postgres.txt`. PGlite's real SQL is not evidence of native
Pool locking/concurrent transactions. The real pooled gate now exercises the
actual migration014, competing claims and duplicate fenced result transaction.
No Docker executable, OpenClaw executable or browser runtime is available here.
Full image build/start, real SPIFFE mTLS transport, OpenClaw accepted/running/
callback/crash lifecycle, durable gateway session continuity, and browser Studio
end-to-end remain open original-runtime gates. Local Node/HTTP/import checks do
not close them, and no successful model run or final D06 handoff is claimed.
