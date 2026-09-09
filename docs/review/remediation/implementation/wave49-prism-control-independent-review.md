# Independent review: original Prism Control preference recovery

Reviewer: separate `/root/run2_prism_review` agent. Date: 2026-09-09.
Author source frozen at `22b69a5` (implementation `746b3e9` plus accurate public
declarations). Independently cherry-picked into own worktree at
`306fb05c8e9a292f46863154d5d457ec4eb1bd17`; no author checkout was modified.

## Disposition

**PATH-T02-001 runtime evidence meets its original bounded finding requirement.**
**Source integration is on hold:** root requires removing the new outer factory
size/complexity and direct-environment lint regressions without suppression.
This commit preserves a runtime evidence checkpoint, not source acceptance or
register closure. The revised composition must be independently rerun before
root can integrate and close the finding. **PATH-T02-002 remains incomplete.**
No other finding or whole-platform gate is approved by this review.

### Follow-up disposition on `961f606`

The hold above records the earlier checkpoint. **The source hold is now
resolved for this bounded package**, following a fresh independent review and
execution of author `961f606` in the reviewer's own checkout (`a7ad2ac`).
Root may integrate the reviewed package and decide PATH-T02-001 closure;
PATH-T02-002 and all separate native gates remain incomplete.

The oversized outer factory has been replaced with a short composition
function and service constructor. Existing pure helpers remain module-level;
the original handler and worker transaction are explicit instance methods,
with checked `this.authenticated`/`this.runWorker` call sites and retained
request guards. All startup environment resolution lives in the existing
canonical configuration boundary, including the ordinary pg.Pool entrypoint.
There are no threshold, baseline or suppression changes. Config tests exercise
original defaults, each required SPIFFE identity, missing secrets and caller
environment mutation after configuration load.

Independent rerun: **18/18 passed, zero skips**, including the same original
HTTP/SQL preference acceptance, the explicitly incomplete overlap diagnostic
and all three new configuration checks. Raw output:
`docs/review/evidence/wave49-prism-control-http/independent-structured-regressions.txt`.
Prism typecheck, canonical lint on the bounded entrypoint/configuration,
new tests/declarations and `git diff --check` all exit 0.

The full relocated handler still reports **25 existing lint errors**,
independently reproduced in `independent-structured-lint.txt`. Inspection maps
them to the inherited long handler, worker method, deep branches, file size and
console diagnostics; the newly introduced outer-factory and environment-access
violations are removed. This is not a whole-Control lint pass. The separate
pre-existing deployment-contract failure is likewise retained and not waived.

The original PATH-T02-001 requirement asks for original services and real DB,
persisted preference event, captured agent input and exact snapshot use across
a fresh session. It does not demand model design-quality evaluation, native
PostgreSQL connection pooling, browser interaction or native trust issuance.
Those separate gates are not weakened or relabeled here.

## Independent execution and source inspection

- Ran the original Control-generation HTTP, design-round, preference-generation
  and pipeline-subject suites from the frozen independent checkout: **15/15
  passed, zero skipped/cancelled**, process exit 0. Raw complete output is
  `docs/review/evidence/wave49-prism-control-http/independent-regressions.txt`.
- Original Prism SQL migrations execute against disk-backed PGlite with
  pgvector, not a mocked repository or a SQL-to-Pool shim. The service and DB are
  both closed and reopened; a newly issued session retains its authenticated
  subject and has distinct CSRF identity. No ORM is substituted.
- The actual session/event HTTP endpoints persist two subjects' personal
  events. Original history and dispatch/claim paths exclude the other subject;
  the original prompt consumes the exact persisted snapshot for a new project.
  The original registered tool sends real HTTP and commits three independently
  schema/diversity-validated documents with exact generation/snapshot evidence.
  Impersonation is rejected and the actual policy endpoint disables future
  personal-event inclusion.
- The relay only forwards bytes and supplies a proxy-peer header at the
  documented loopback application boundary. It does not implement application
  behavior or return invented results. This is **not** a native Envoy, TLS,
  Tailscale, CNI, certificate or external model execution proof.
- Compared original `control.ts` at `147a9e0` with extracted `control-server.ts`.
  The normal entrypoint still instantiates `pg.Pool`, listens on the same
  interface/port and closes the pool on SIGTERM. Routes and request guards are
  not replaced. Three manual transactions now use existing `inTransaction`;
  SQL order, scope and release are retained. The former worker-path swallowed
  rollback error is now the existing shared-helper behavior: rollback failure
  may replace the initial error. This difference is disclosed, not described
  as byte-for-byte identical behavior.
- Prism `npm run typecheck -w @kubeclaw/prism`, canonical lint on the new HTTP
  test/public declarations and `git diff --check` pass. Existing whole-Control
  lint and deployment-contract failures remain failures in author evidence;
  this review does not claim a full lint/deployment-contract pass.
- Dependency isolation check found 61 resolvable `@kubeclaw` workspace targets,
  all inside this checkout. One copied stale `plugin-test-agent` symlink is
  dangling and unused by these suites. An initial all-links inspection stopped
  on that dangling link; no source fallback to the author's checkout occurred.

## PATH-T02-002: independently confirmed remaining work

The reviewer raised the session-serialization conflict before the author's
test was completed. The real A1 claim followed by A2 dispatch now proves that
the stale original A1 tool callback rejects before any document insertion and
leaves A2's own current round intact. But A1 remains running with no committed
result, so the original same-session admission guard returns no claim for A2.
The passing diagnostic explicitly asserts this blocker; it cannot establish
the required subsequent A2 acceptance. No SQL state edits, invented completion
receipts or new supersession authority were used to make it pass.

Next action is genuine predecessor lifecycle/reconciliation work while keeping
the fail-closed external-action guard. Re-running this unchanged diagnostic is
not progress toward the missing acceptance gate.

The pending Product/Controller/Chart package is not imported or approved here;
future integration must move its wrapper to the actual handler location and
still satisfy its documented native CRD/CEL requirements.
