# Bounded original operator request retention

Status: implemented bounded candidate, independent final review and fresh-head
integration pending. PCR-OBS-002 and the broader 47-finding task remain OPEN.
This report supersedes the implementation status of the historical run7 design
and run8 early WIP checkpoint; neither was an acceptance claim.

Production source freeze: c02566a (consumer7810257, original single-use signal
correction dd68326, canonical original wait/expiry linkage c02566a).
Author fixture/matrix freeze: 09b34c0, with unchanged independent additions
from 1c26a39 and af67b78. Base is freshly read a43aa256 / ee96baf1.

## Original owning implementation

Five production files change. Original RecordStore transition now supplies an
owned clone of the actual bounded locked records to its synchronous authorization
callback. Existing zero-argument callbacks remain valid. The callback cannot
mutate committed state through the clone; async callbacks fail before write.

Original operator delivery-records consumers recognize only a new projected
JSON-v1 request record. The original v1 candidate digest uses the owning
RecordStore codec, not a new hash/transport serializer. Exact replay retains
the terminal receipt and does not reinsert the payload or issue another POST.
The no-transport failDelivery fallback reconstructs and parses request.payload;
undefined is not an authorization bypass. Complete/fail stale-CAS fallbacks
return the exact retained accepted receipt, never a replacement. Full legacy
records keep append-before-return semantics, including the race where projection
wins between the initial read and original append. Legacy v1 handoff lookup is
still refused. v2, transformed Discord and unsupported producer histories are
not upgraded or silently accepted.

The explicit local command is `node scripts/retire-operator-request.mjs --apply
/absolute/path/to/scope.json`. It never calls network/receiver lookup or sends
messages. The closed scope schema is `operator-request-retirement-scope.v1`,
action `compact-completed-human-approval-request`, novaStorageRoot,
orchestratorIssuerId, intent and exact inventory limits. The executable scope
construction in operator-request-projection.test.mjs supplies operation/actor,
canonical run and actual delivery/wait roots, original effect key, request and
terminal digests, snapshot digest and exact original run-journal head.

The operator resolves original selected providers, actual configured stores
and unchanged quotas from the persisted Core snapshot. It verifies original
canonical request/accepted/completed identity, pinned human-approval owner,
actual input/config-derived notification and wait, wait-store value, first wait
attempt, original recovered creation, canonical single-use signal, exact resolved
signal and second approved attempt before terminal Core completion. Original
expiry is tied to configured timeout and the real producer's dispatch/request
interval; resolved historical expiry is compared with recorded resolution,
not the current clock. Selected duplicate signal keys are rejected: the initial
independent counterexample and before-failure raw remain preserved.

Lock order is original Core run fence → original wait-store fenced read →
original delivery-store CAS. Final synchronous authorization sees actual locked
receipt/history state and revalidates original run evidence and unchanged
inventoried authority. Same/nested/symlink-alias actual stores are rejected before
store lock acquisition. Original run contention refuses RESOURCE_LOCKED;
store writer fences block. No new lock framework or stale-heartbeat takeover.

## Actual proof and limits

Author combined matrix: 12/12 passed, zero skips. It includes duplicate execution
of the shared prerequisite in two test modules; counts are reported honestly,
not interpreted as twelve different product gates. Actual original installed
human-approval, wait-store, operator-messaging, network-http, secret-resolver and
Core File journals produce the fixture; no fake stages/adapters or journals are
used for positive acceptance. A real loopback receiver handles the signed HTTP
request. A trusted local caller submits the original issuer-authorized resume;
this is not authenticated external operator ingress.

Actual bytes: original two-record store 10137 bytes; projection releases NET
7358 bytes, including replacement receipt/projection and committedAt overhead.
All original delivery receipt, wait-store bytes and Core event/effect/signal/
snapshot files stay unchanged. Record count remains two. A small real request
cannot pay the projection overhead and is refused atomically.

Actual 23000-byte/5-record quota: a later genuine original Core notification
first blocks without a second POST; after projection the next genuine Core
notification reaches waiting and the receiver observes exactly one additional
POST. Its original reservation/request/receipt paths are used unchanged.
The still-unchanged five-record quota then blocks further original work. No
quota bump, tombstone, record-count credit, fake admission or provider substitute.

Real separate processes prove run refusal, wait/delivery fence blocking,
SIGKILL wait-owner release, and stale original completeDelivery/failDelivery
writers returning the unchanged accepted receipt. Independent original primitive
tests prove actual locked clone ownership, async callback atomic refusal, stale
CAS and fence cleanup. Deliberate corruption negatives use honestly rehashed
original journals or changed store records and are explicitly NOT fabricated
positive history: request/date/stage/input, wait, signal issuer/type/inner issuer,
audit order, duplicate signal key, receipt corruption/missing/uncertain/multiple,
unsupported v2, aliases and separate genuine Core ownership all refuse.

Original full operator npm suite passes, including five actual deliveries and
package boundary. One existing fixture stageId was invalid under the unchanged
canonical localId schema. Exact fresh-a43 baseline failure was reproduced first;
root approved ONLY `stage:operator-test` → `operator-test`. Every original
assertion remains. No validator/schema/expected result was weakened.

Canonical focused ESLint, original shared-runtime types and Nova types pass.
Evidence: run8-operator-author-matrix.txt and run8-operator-initial-runtime.txt;
independent original signal before-failure/state-view raw is under docs/review/evidence.
The final independent expired-history positive and fresh-SDK reruns are pending
at this checkpoint. Shared dispatch/telemetry sibling regression passed 23/23,
zero skips (run8-operator-sibling-regression.txt); the once-built original helper
produced actual EPIPE/initialize-exit70 history, NOT a passed native provider gate.

This is bounded trusted-state causal validation, not authentication of a
coordinated rewrite of all trusted stores or a secure external ingress protocol.
Selected externally stored effect results remain unsupported rather than
silently replacing their native digest/reader gate. The broad retention policy,
other producers, v2/Discord and all other open OBS work remain explicit next
scope, not completed by this narrow duplicate-metadata package.

Next action: finish independent final source review and native expired-history
test, reconcile freshly published SDK/head and rerun affected original matrix,
then root-only integration with current exact parent and FF publication. Do not
integrate or mark the finding fixed merely from this author report.
