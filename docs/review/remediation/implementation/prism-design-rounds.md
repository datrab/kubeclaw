# Architecture-bound Prism design rounds

PATH-T02-002 and PATH-T02-003; source implementation for independent review.
No source commits or register updates by the author.

Migration 013 adds durable design-round provenance tied to the existing immutable
preference-generation UUID. Each round records exact design_request_id,
architecture digest/revision, optional parent round, source document/revision,
start key/digest, original feedback and committed result digest/receipt. The
active request points to its current round; documents retain a round FK and use
round-qualified keys. Historical documents, directions, decisions and snapshots
are retained. Pre-migration unbound documents remain legacy rows, visible while
their request has no current round; no fabricated generation provenance is added.

`startDesignRound` locks the project before resolving/checking active architecture,
parent and source revision, reading feedback, persisting its preference snapshot
and advancing the current round. It uses a source-document SHARE lock to prevent
concurrent current-revision updates before commit. Repeating the identical start
key returns the persisted generation; changed input conflicts. A new key needs
the current parent and cannot act as an accidental delivery retry. Initial Nova
dispatch uses its existing authenticated idempotency key; authenticated Studio
new-round requests provide document, expected revision, parent round and key.

The original bridge and agent tool already carry generationId. The repository
now requires that identity, locks the project, resolves the bound round and checks
active architecture/current round before any document mutation. Source revision
is rechecked/locked at result acceptance. It stores all three documents and the
result receipt in one transaction. Exact committed delivery retries return the
same receipt, including historical rounds, without changing the current round.
Conflicting result content is rejected. Current direction lists, selection and
baseline publication filter the current round; predecessor feedback is preserved.

Evidence: `prism-design-rounds-tests.txt` exercises original PGlite migrations,
repositories, preference snapshots and decision transactions: A1/A2 reversed
results, unchanged exact retry versus altered result, three rejected directions
feeding a distinct successful round, stale parent/revision failures, and an
actual SQL trigger failure rolling back all documents and leaving retry usable.
`prism-design-rounds-lint.txt` checks the new module/tests;
`prism-design-rounds-typecheck.txt` checks Prism TypeScript.

The existing native PostgreSQL gate was adapted to the new production schema
and signature and adds pooled competing-round starts and duplicate deliveries.
It remains blocked with REAL_POSTGRES_DATABASE_REQUIRED in this environment,
recorded in `prism-design-rounds-native-postgres.txt`. PGlite is real SQL but is
not claimed as native PostgreSQL pool/concurrent scheduling proof. No deployed
Control/SPIFFE-to-agent end-to-end test, live agent/model, CI or deployment ran.
Existing broad Control/storage lint debt remains a failed gate, not a passing
result. This change does not alter the generic worker operation/attempt core.

Final bounded run: 22/22 tests passed, new module/test canonical lint and Prism
typecheck passed. The round stores an immutable request JSON copy, so an exact
start retry does not reread later-mutated request content. Parent feedback is
restricted to project-consent events; another user's personal event targeting a
parent direction is excluded (regression included). Broad changed-source lint
reports 62 existing Control/storage findings; raw evidence remains available.


Consumer review corrections: bridge prompts use the round's persisted request,
not mutable dispatch payload. Same-architecture dispatch content changes are
rejected (the explicit approvalId transition remains allowed). A committed start
retry carries the stored result receipt and does not invoke OpenClaw again;
pending duplicate deliveries coalesce inside the live bridge process. Pending
round retry after a bridge restart may rerun generation under the same durable
identity; result storage still accepts only one exact result. This is not a
claim of durable agent-process recovery or model determinism. The original
bridge HTTP/process-recorder regression verifies immutable prompt input and no
second process for committed replay.

The final Nova baseline consumer now uses `approvedRoundBaseline` and binds the
approval revision's document to the current round. Genuine SQL regression
proves a previously approved round1 baseline stops being consumable after round2
starts. Legacy unbound source documents can start their first bound successor
with null parent identity, covered by original SQL regression.

Studio exposes a new-round action after all three rejections and an always
available same-round retry while a pending request exists, including when no new
directions exist yet. `design-round-client.ts` retains complete parent/revision,
request key and acknowledged generation in per-user/project sessionStorage.
Reload resubmits the same stored request; a failed response never generates a
replacement key. Pending/conflicted states are explicit. A completed round loads
its actual document and clears the stored request. The original client HTTP test
uses a real local server with a dropped first response and a disk-backed session
fixture; it is not browser Storage or UI E2E evidence.

React production build passed. A real Studio tsconfig was added because the
existing Prism config excluded TSX entirely. Studio-specific typecheck reveals
six existing errors; compiler-host comparison against original HEAD app source
shows the same six diagnostics before and after. Canonical Studio lint decreases
from six to five existing findings; new client/helper/tests lint passes. Evidence
is in `prism-design-rounds-studio-{build,typecheck,lint}.txt` and comparison JSONs.
No installed browser runtime is available for the Studio E2E gate; build and HTTP
checks are not substituted for browser execution. No claim of passing those
existing lint/typecheck or browser gates is made.


Native pg int8 boundary correction: Control delegates the complete active
architecture transition guard to `assertArchitectureTransition`, which normalizes
and validates PostgreSQL bigint revisions before equality checks. The SQL row
contract honestly permits string or number. A regression reads an original
PGlite design_request row, applies the actual installed pg OID-20 text parser,
and proves content/digest substitution still fails with its string result.
This checks the actual driver parser, not a native PostgreSQL connection; the
native database prerequisite remains blocked. New-round UI document swaps also
clear prior quality results and accepted-warning state.

D01 HTTP diagnostics follow-up: shared `studio/round-response.ts` is used by the
actual new round submit/directions/document fetches. It retains operation and
project/document context, HTTP status/status text and the original Control
response body. Success responses distinguish malformed JSON from an invalid
expected contract. Diagnostics stay in the existing escaped private Studio error
rendering; no external logging or messaging is introduced. Actual local HTTP
regressions cover 400 JSON cause, 500 JSON cause, 502 text body, invalid JSON and
valid JSON with invalid contract. Targeted client tests 2/2, new helper/client
canonical lint and Prism typecheck pass; evidence is
`prism-design-rounds-http-diagnostics.txt` and `prism-design-rounds-http-lint.txt`.
