# Control route quality (2026-09-21)

Implementation complete; bounded CQ1–CQ6/DOC accepted after corrected fresh review. Criteria below were recorded before edits. Linked follow-up for [listener CL6](config-control-listener-20260921.md); see final independent acceptance below.

- CQ1: cohesive session/dispatch, agent callbacks, projects/documents/directions, engine execution, approval/publication, corpus/artifact and preferences modules. Explicit dispatcher, no generic routing framework. All files/functions obey unchanged canonical lint limits using conventional formatting.
- CQ2: exact original path/method/route order and authentication boundary. Internal artifacts/session/signeddispatch/agentcallbacks remain before authenticated application routes; unknown application routes still authenticate. Each matched handler explicitly reports handled, independent of response.end/json return values.
- CQ3: original raw signed-dispatch bytes, crypto inputs, CSRF/session/SPIFFE checks, status and central error mapping preserved (SyntaxError 400, other 422). No shared per-request mutable state or second startup resolver.
- CQ4: original SQL statements, transaction boundaries, idempotency/approval/generation checks, native operation budgets, asset limits and corpus cleanup/error precedence remain. Existing-baseline return precedes any new publication work.
- CQ5: original Control suites and listener 334 regression membership retained; tests kept unchanged except explicitly documented listener contract changes. Targeted auth/error/cross-request preservation and meaningful negative controls. Source snapshots and assertion inventory bind evidence.
- CQ6: full canonical lint for all changed/new sources and relevant typechecks pass without suppressions/baseline additions/threshold changes; fresh nonauthor review inspects API/context simplicity and boundaries, not just passing lint.
- DOC: update architecture responsibilities and evidence/results/limitations, link to listener migration, and leave unrelated CONFIG/native/cluster claims open.

Baseline: the captured Control monolith has 24 canonical violations, including 797-line handle/complexity 202 and 932 logical file lines after the listener composition addition. Exact baseline source and lint log are retained in the evidence directories. None are accepted as final quality.

## Implemented responsibilities and evidence

The original monolith is replaced by 17 conventionally formatted modules: the HTTP
composer/dispatcher, frozen context and HTTP helpers; session, dispatch, agent,
project, document/history, direction, engine, approval, baseline, corpus, preference
and artifact routes; baseline validation/specification and archive rendering.
The largest module remains below the unchanged 300-line rule. Request handlers use
narrow typed context properties. Module helpers are concrete functions rather than a route registry or callback
framework; internal exports do not introduce a second composition or policy path.

The final 357 tests in the combined 11-module invocation pass with zero skips,
cancellations or failures. The 75-case intermediate Control subset passed before
final consolidation. These runs include actual Control HTTP behavior and production
listener children. `final-run.json` records exact command, stable before/after hashes
and exit 0. Canonical lint on every changed production/test file passes; Prism and
shared foundation typechecks pass. No lint baseline/rule changed.

`check-preservation.mjs` compares parsed source inventories: all 27 SQL literals,
62 Error expressions, 16 route strings and 12 regular expressions remain identical.
This is a specific preservation oracle, not whole-program equivalence. The original
catch and response headers remain. An explicit Node `Console` with `ignoreErrors: true`
preserves the original request-failure formatting and failed-sink behavior without
a lint suppression. The authenticated application phase is awaited inside the original
catch so asynchronous failures retain the 400/422 response mapping.

Initial extraction failures are retained: TypeScript detected nullable/redeclared
route matches and a captured fallback response; these were corrected before any
positive extraction claim. Regex match values are passed explicitly to matched
handlers. Subsequent cleanup narrowed context and consolidated small baseline
helpers into their actual validation/archive/publication responsibilities.

The original persisted generation/product-authority HTTP tests use PGlite and real
migrations. Local child listeners use the original production entrypoint and health
route without claiming a PostgreSQL readiness connection. Fresh reviewer probes
and mutants are recorded in the independent report; author listener/chart/image
negative controls are in the linked CONFIG evidence. No native kernel, live Envoy,
cluster deployment or full CONFIG closure is claimed.

## Corrected failed-diagnostic-sink regression

A root counterexample after the first independent review found that replacing
`console.error` with `process.stderr.write(format(...))` preserved formatting but
changed error-stream failure semantics. A closed stderr descriptor could terminate
Control with an unhandled stream error instead of preserving its HTTP response.
The initial acceptance was held; earlier 356-case evidence remains archived as
`before-logger-fix-*`, not evidence for the corrected final snapshot.

Control now owns an explicit `Console` with `ignoreErrors: true`, matching the
original diagnostic-sink failure behavior and preserving the exact method/path/error
fields. The new regression starts the real production entrypoint in a child after
initializing stderr and closing its real descriptor. It requires the original 422
application error, a subsequent 200 health response and a live child. The regressed
source fails with ECONNRESET; the corrected source passes. Private source controls
run that same test against the original monolith's console logging (pass) and the
regressed direct-write logger (fail). No fake HTTP handler or logging sink is used.

Final author rerun and fresh reviewer revalidation follow this fix; the prior
acceptance is not sufficient. The test proves diagnostic failure containment, not
log delivery to an unavailable destination.

The corrected final author run passes 357/357 with zero skips/cancellations and
stable before/after source/test hashes in `final-run.json` (61.3seconds). All changed
production/tests, including the closed-stderr child fixture, pass canonical lint;
Prism typecheck passes. The same 27/62/16/12 syntax inventories remain unchanged.
Fresh independent revalidation has restored bounded acceptance; see below.

The fresh reviewer separately probed parent-closed-pipe EPIPE. Both the corrected
logger and the exact original monolith terminate in that scenario. This is a
retained baseline limitation, not an introduced regression or a universal
diagnostic-sink containment claim. The fix restores the tested descriptor-closure
semantics; broader broken-pipe handling remains outside this preservation slice.

After the final author regression, the logger comment was narrowed to the actual
closed-descriptor proof. `comment-precision.json` binds both source hashes and
`check-comment-precision.mjs` proves identical nontrivia TypeScript tokens. The
actual closed-descriptor HTTP case passes again on that final comment-corrected
source. The 357-case run remains bound to its recorded bytes; this explicit
comment-only equivalence is not represented as a new whole-suite execution.

## Final independent acceptance

The [fresh nonauthor review](independent-control-listener-quality-20260921.md)
accepts CQ1–CQ6/DOC after independently rerunning 357/357, typecheck and complete
scoped lint. It repeats actual closed-descriptor HTTP behavior against corrected,
original-monolith and regressed sources and separately documents the retained EPIPE
baseline limitation. It proves the final two-line comment change separately. The
first acceptance is superseded explicitly; the root-discovered regression and all
failing evidence remain visible. This closes this bounded quality follow-up, not
CONFIG or native/cluster findings.
