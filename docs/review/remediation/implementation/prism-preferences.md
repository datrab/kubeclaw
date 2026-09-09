# Prism preference isolation and generation snapshots

Findings: PCR-PRISM-PREFERENCES-001 and PATH-T02-001. D11 is the governing product decision. Frozen for independent review; root owns staging, commits and register status.

## Implemented

- Projection keys encode user, projection, learning scope, project identity (for project scope), context and trait as a JSON tuple. Output retains user/project identity, trait and every original event origin, including personal events learned in another project. Exact duplicate evidence is counted once; conflicting duplicate identity is rejected. Retractions match user, scope and originating project, preventing unrelated evidence removal.
- The actual SQL lookup used by Control GET and generation includes personal consent events from all projects plus the requested project's scoped evidence, always filtered to the authenticated subject. Project preference traits override personal traits in the same context. PUT `/v1/preferences/policy` persists personal enable/disable per authenticated user and external project ID.
- Migration 012 records each generation's immutable snapshot and digest, subject, external project in snapshot, internal project FK, policy version, reference time, eligible original events, projected/effective evidence and generation target. Hash is deterministic for identical input/time; generation UUID remains distinct. Existing 180-day decay is explicitly versioned, not silently changed despite the historical architecture-policy discrepancy.
- Authenticated Studio create-set and revise requests resolve a fresh persisted snapshot. Authenticated pipeline dispatch resolves its subject from trusted platform configuration; an explicit requested subject must match exactly. An unconfigured platform records an empty null-subject snapshot and rejects explicit subject claims.
- Original bridge passes the exact snapshot to its existing OpenClaw process prompt for dispatch, design-set and revise. It rejects missing snapshots and returns generation/snapshot identity in acceptance receipts. Tool contracts require generationId. Actual callbacks verify project and operation, plus document/revision for revision results; direction evidence and revision action retain generationId/digest.

## Verification and limits

`docs/review/evidence/prism-preferences-tests.txt`: original PGlite migrations/storage/event writes/SQL lookup/projector/snapshot reads and original plugin tests, plus the real bridge process and HTTP route calling an explicitly labeled OpenClaw executable recorder. The recorder proves process-boundary prompt/receipt identity only; it is not a model, agent or live-provider execution. No mock pipeline, live OpenAI, CI or deployment ran.

`prism-preferences-typecheck.txt`: Prism typecheck. `prism-preferences-focused-lint.txt`: preference reducer, snapshot/prompt modules and targeted tests lint. `prism-preferences-lint.txt`: canonical lint across changed server/plugin files remains failing on existing monolithic route/environment/logging debt; this is not reported as a passing full lint gate.

Remaining PATH-T02 closure limitations: actual platform subject configuration is unset by default; no real account is selected by this implementation. No real agent/model design-quality proof and no complete authenticated Control HTTP-to-result test. Generation target checks bind revision document/revision and design-set operation/project, but do not yet reject a stale same-project architecture snapshot on the design-set callback. Initial dispatch records architectureDigest for follow-up binding. Replayed result attachment/idempotency remains governed by the existing repository behavior; snapshot records are immutable append-only history, not a new job runner.

No decay policy decision beyond D11 is inferred. Global personal use follows explicit event learningScope consent; no project-scoped event is promoted into global personal learning.

## Trusted pipeline subject configuration

Root-approved implementation resolves the pipeline subject at
the receiving trusted platform boundary: Control config
`PRISM_PIPELINE_PREFERENCE_SUBJECT` (Helm
`control.pipelinePreferenceSubject`) supplies the subject automatically after
existing dispatch authentication. Explicit request subjects must exactly match;
no configured subject means empty snapshot and rejection of any explicit claim.
Resolution happens before project writes and preference queries. Nova stage
configuration was traced to project pipeline definitions and therefore rejected
as an identity authority. No Nova producer/schema modifications remain.

Actual deployment configuration remains unset by default; no user is invented. Unit evidence covers missing configuration, automatic resolution,
explicit match, other subject, malformed config and nonstring requests. These
checks do not constitute an authenticated deployed Nova/Control test.

Configuration evidence: `prism-preference-producer-tests.txt` exercises actual
PGlite preference history and snapshot creation using automatically resolved
platform identity across projects, excluding a second user's persisted events.
`prism-preference-subject-helm.txt` records real Helm lint and four complete
renders (default/configured crossed with HMAC/SPIFFE), exact Control environment
inspection and invalid-subject schema rejection. Focused lint and Prism
typecheck are in `prism-preference-subject-lint.txt` and
`prism-preference-subject-typecheck.txt`.

Control loads and validates the typed, frozen `ControlConfig` once at startup
through `server/control-config.ts`, registered alongside the existing Studio
configuration module in the canonical lint environment-boundary list. The HTTP
handler receives that configured value rather than reading process environment
per request. Invalid platform identity fails startup. Other existing Control
environment reads are outside this bounded change and remain visible lint debt.

Final config-boundary verification: targeted subject/config tests 3/3 passed,
focused canonical lint and Prism typecheck passed. Full Control canonical lint
still has 58 errors (15 existing direct-environment reads), restored from the
59-error intermediate version identified by independent review. The removed
introduced error was the request-handler environment read. Raw final findings:
`docs/review/evidence/prism-preference-control-lint.json`. Existing failures remain
failed; no gate is relabeled as passing.
