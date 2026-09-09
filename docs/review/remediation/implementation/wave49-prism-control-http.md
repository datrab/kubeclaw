# Original Prism Control generation HTTP proof

Date: 2026-09-09. Base: `147a9e0` (source-equivalent to the remote recovery
checkpoint `cbd014b19f6f3498ff709df2e4557357d4f3aac5`). This is a bounded
implementation/evidence package for independent review, not a whole-platform
acceptance or a self-authorized register closure.

## Production composition

The previous `server/control.ts` hardcoded `pg.Pool` and immediately listened,
preventing direct composition of the actual service with an owned database.
The exact routes now live in `server/control-server.ts`, exported as
`createControlServer(Database, environment)`. The original entrypoint remains
`server/control.ts`; it still creates the real `pg.Pool` from `DATABASE_URL`,
listens on the same port/interface and closes pool after server on SIGTERM.
There is no alternate test handler, mock database, SQL-to-Pool adapter or
new production database mode. Three existing reserved transactions now use
the repository's existing `inTransaction` abstraction; query order, locks,
commit scope and release behavior are retained. This also standardizes the
worker-path rollback-error behavior on the existing abstraction (a rollback
failure can replace the original error), rather than retaining its previous
local swallowed rollback error. No success is inferred after rollback failure.

Root review rejected the initial whole-file factory wrapper as new structural
lint debt. The final composition uses a bounded `ControlService` constructor
and bounded `createControlServer` function; request-body/response/cookie and
hash helpers stay pure module functions. The pre-existing monolithic routing
callback is retained as `ControlService.handle` rather than redesigned, and
`runWorker` remains a method with the same worker flow. Runtime configuration
and listener defaults are now resolved only in the existing `control-config`
adapter; the server does not read process environment. All instance-owned
resources are explicit and `handle` calls retain their instance receiver.

The saved, unintegrated Product branch `2eebb88` was inspected: it has no
composition factory, only a handler wrapper. No Product code was imported.
Later paired Product integration must apply its authority wrapper to the new
handler location and still meet the separately documented native CRD/CEL gate.

## PATH-T02-001 — original bounded gate covered

The retained original finding requires original services plus real DB, a stored
event and capture of the persisted preference input in a new session. It does
not require model-quality evaluation, a browser, native pooled SQL or an
external model generation.

`skills/prism/tests/control-generation-http.test.mts` runs the original Control
service over real loopback HTTP and the original migrations on disk-backed
PGlite PostgreSQL/WASM with pgvector. It:

1. Creates a real session via the original ingress-secret/Tailscale-identity
   exchange, creates the origin project, posts a personal-consent preference
   event through the original authenticated HTTP endpoint, and posts a distinct
   event for a second authenticated subject.
2. Closes the service **and database**, reopens the same disk database and starts
   a fresh original service. A new session has a new CSRF token and the same
   resolved subject; original HTTP history returns only that subject's event.
3. Dispatches a new project, captures the real claimed original agent job from
   HTTP, and checks its project, subject, consent, policy version, complete event
   and exact persisted snapshot. The original `agentPrompt` consumes that
   captured job, including the generation/snapshot identity and without the
   foreign user's event.
4. Calls the **original registered `prism_create_design_set` tool**. It sends
   genuine HTTP to the original handler with the original claim/fence; three
   complete materially distinct documents are validated and committed. Every
   persisted direction references the exact generation and snapshot digest.
5. Rejects an impersonated event and exercises the original policy endpoint:
   disabling personal preference use removes personal events from the next
   original dispatch snapshot.

The HTTP relay forwards unchanged request bytes and supplies a loopback
forwarded-peer header at the service's documented proxy boundary. It neither
implements application endpoints nor substitutes returned application results.
It is **not proof of native Envoy/mTLS, Tailscale, CNI or certificate issuance**.
No OpenClaw executable, model output, native pg.Pool concurrency or browser was
fabricated. Existing native gates remain unchanged and unclaimed.

## PATH-T02-002 — still incomplete

The second test is explicitly a **diagnostic, not an acceptance test**. Original
A1 dispatch/claim is followed by A2 dispatch before A1's result. Original A1 tool
delivery is rejected as stale before any document is inserted, and A2 retains
its own current round. However, the original same-session claim serialization
keeps A2 unclaimable while A1's external action remains running/unresolved.
Therefore this test cannot prove that A2 is subsequently accepted. No direct SQL
state rewrite, invented completion receipt or new supersession authority is used.
This is a reconciliation boundary to examine, not permission to weaken the
fail-closed external-action guard. PATH-T02-002 remains open.

Next action: review the actual completed/superseded agent lifecycle contract and
provide an authorized, genuine reconciliation path before attempting the full
reversed-delivery acceptance. Do not repeatedly rerun this same unchanged
diagnostic as if it will supply that missing path.

## Raw evidence

Under `docs/review/evidence/wave49-prism-control-http/`:

- `regressions.txt`: 24/24 original/new tests passed, zero skips. One of the 24
  is the explicitly incomplete PATH-T02-002 diagnostic; green does not close it.
- `typecheck.txt`: initial new-test typecheck failure for two previously untyped
  original JavaScript imports; retained, not erased. Accurate `.d.mts` public
  declarations were added for the unchanged prompt and plugin.
- `typecheck-final.txt`: original Prism typecheck after adding declarations.
- `deploy-contract.txt`: existing deployment contract assertions, updated only
  to inspect the actual relocated handler rather than the now-thin entrypoint.
  This broader static contract does **not** pass: its earlier line-45 assertion
  still searches the old bridge file for schema-reading prompt text now owned
  by `agent-prompt.mjs`. `deploy-contract-before.txt` reproduces the same failure
  in a separate unchanged `147a9e0` worktree. No assertion was relaxed or omitted;
  this is pre-existing static-contract maintenance, not claimed deployment proof.
- `lint-before.txt` and `lint.txt`: canonical source lint before/after; existing
  Control monolith lint debt is not hidden or called a pass. The extracted
  initial factory added outer function size/complexity diagnostics and was
  rejected by root review. No threshold,
  suppression or baseline was altered. New HTTP test has no lint diagnostics.
- `new-modules-lint.txt`: focused canonical lint of the new HTTP test and both
  public declarations.
- `regressions-structured.txt`: the same 24/24 regressions after the bounded
  service composition change, including the explicitly incomplete overlap test.
- `config-structured.txt`: 3/3 original default, trust rejection and immutable
  configuration snapshot regressions.
- `typecheck-structured.txt`: final complete Prism typecheck.
- `bounded-modules-lint.txt`: canonical lint passes entrypoint, configuration
  adapter, both new tests and declarations.
- `lint-structured.txt`: remaining 25 diagnostics are confined to the inherited
  routing/worker monolith (file/function length, routing complexity/depth and
  console logging). The newly introduced outer factory length/complexity and
  direct-environment diagnostics have been removed structurally, without any
  lint configuration change. This still is not a whole-Control lint pass.

Exact commands are recorded in the adjacent `commands.md`. Independent review
owns disposition; register and frozen-47 counts are deliberately unchanged here.
