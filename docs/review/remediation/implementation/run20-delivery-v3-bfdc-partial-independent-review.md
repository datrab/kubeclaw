# Delivery-manifest v3 bfdc partial independent review

Status: **REJECTED AS INCOMPLETE; TWO SOURCE/REPOSITORY BLOCKERS AND NATIVE
GAPS REMAIN.** This is a review-only checkpoint. It is not implementation or
native acceptance, not a register update, not PCR-SDK-001 closure, and not
all-47 completion.

I reviewed exact remote candidate
`bfdc9efd2c77211c37650c78ba223798e3607397`, tree
`26e2838d3026eba915b52fed0acdc4d02f3210b1`, whose sole parent is semantic
source `15f6a808ed1666c3b7a2a3909749e3d4ee377904`. It has exactly 39 changed
paths. Tests ran from a separate frozen checkout materialized only after the
author index tree and remote tree matched exactly.

## Confirmed corrections

The former schema/runtime conditional and safe-integer gaps are corrected. The
public final binding is a finite four-arm TypeScript union. The registered
Summary input schema admits the valid v3 final-Review graph. Media type, complete
eight-MiB bound, caller-digest rejection, no-trap behavior, exact legacy graph,
recovery, registered v2 reader corpus, and five-locale registered v3 producer/
reader-to-import-boundary tests pass. Independent contract is 10/10, compiler/
recovery 4/4, type surface 1/1 and v2 corpus 1/1 with zero skips/todos.

## Blocking findings

1. In legacy delivery mode, the newly admitted v3-only
   `final.reviewArtifactEncoding` is ignored for Review selection but is spread
   into a newly widened `delivery-manifest.v2` body. An independent test using
   the real disk ArtifactStore observes acceptance rather than the required
   deterministic pre-read rejection. This violates exact historical v2
   domain/body parity.
2. Invalid v3 Review optional-field combinations are checked only in
   `verifyFinalReview`, after module, final-gate and lint reads. The same actual
   ArtifactStore test records nine evidence reads before rejection. All
   mode-dependent input conditionals must reject before the first evidence
   read.
3. `npm run plugin-system:inventory:check` fails because
   `docs/generated/inventory/plugin-system.json` is stale. The approved design
   explicitly requires inventory/package closure to move atomically.

The author accepted the first two findings and is preparing a corrected freeze.
The stale inventory was also reported. The package lock diff itself is minimal:
one workspace, one link and three direct dependency additions only.

## Native and full-acceptance gaps

The registered five-locale consumer reaches the genuine import store but stops
honestly at `NOVA_VERIFIED_OUTPUT_IMPORT_REQUIRED`; imported-result success is
not proven. Requested/accepted/completed disk histories, actual OS SIGKILL,
cancellation, consumer-negative and replay matrices are still open. The
original remote-test-gate suite is blocked by missing Go; the full package
verification reaches missing Playwright Chromium. No missing prerequisite is
called passed, and no download/provider/CI/deployment was attempted.

Freeze a corrected candidate and rerun all matrices. Full package/discovery/
sandbox/pin/schema/lint and fresh-head bounded regressions remain mandatory
before any integration or register change.
