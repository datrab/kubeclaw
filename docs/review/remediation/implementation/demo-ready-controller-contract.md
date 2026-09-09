# Demo Ready controller protocol (implementation contract)

Status: bounded controller/API implementation independently counterreviewed; native integration remains open.
This is product readiness, distinct from existing infrastructure `status.phase` and
from operator acceptance. No deployed endpoint or native cluster proof is claimed.

## Version 1 wire contract

New internal TLS-only API: `POST /v1/demo-ready` and `POST /v1/demo-ready/status`.
Both require Bearer authentication, validated by Kubernetes TokenReview using the
configured audience and exact configured Nova producer ServiceAccount username.
The token client mount is disabled by default and may be projected into the
configured trusted runtime container. Authentication identifies that runtime/SA,
not a particular plugin. Code sharing the container may access its files; this
mount does not establish agent filesystem isolation. Native enablement requires
verification of the host/agent filesystem capability boundary. Annotation writers
alone acquire no Ready authority; ordinary kubectl permissions are insufficient.
Deployment is opt-in and requires an actual server certificate Secret and actual
producer identity; there is no public ingress, default identity or default grant.

`POST /v1/demo-ready` accepts a strict JSON object, at most 16 KiB:

```json
{
  "schemaVersion": "demo-ready-request.v1",
  "requestId": "stable-candidate-delivery-identity",
  "runId": "actual-core-run",
  "sourceRevision": "git:FULL_COMMIT",
  "candidateDigest": "sha256:HEX64",
  "decisionDigest": "sha256:HEX64",
  "resultDigest": "sha256:HEX64",
  "leaseName": "actual-lease",
  "leaseUID": "actual-uid",
  "namespace": "actual-owned-namespace",
  "immutableImage": "registry/repository@sha256:HEX64",
  "manifestDigest": "sha256:HEX64",
  "credentialDigest": "sha256:HEX64",
  "secretUID": "actual-secret-uid",
  "exposureOwner": "actual-pending-owner",
  "exposureGeneration": 1,
  "url": "https://actual-demo.example/",
  "observedAt": "2026-09-09T12:00:00Z",
  "retentionSeconds": 604800,
  "receipt": {
    "schemaVersion": "discord-delivery-receipt.v1",
    "accepted": true,
    "target": "configured-operator-target",
    "status": 200,
    "messageId": "actual-discord-message-id",
    "deliveryId": "stable-delivery-id",
    "payloadDigest": "sha256:HEX64"
  }
}
```

All identities are bounded nonempty strings. Digests use exact lowercase SHA-256
syntax. A request cannot specify Ready time or credential values. Optional
`retentionSeconds` selects the source/candidate-bound initial duration, default
604800. It must be a positive JSON integer no greater than 9223372036 (the Go
duration arithmetic bound); null, fractions and overflow reject. Unknown fields, trailing data and noncanonical/non-HTTPS URLs reject.
Observation must not be in the future and must be within the bounded
five-minute freshness window at first commit.

The trusted Nova adapter must re-read original verified import, qualified current
run manifest/decision/candidate artifacts and the existing durable Discord receipt.
It must verify the receipt's exact transmitted payload includes the complete URL
and generated credentials. Controller authentication delegates these store checks
to that exact trusted producer; digest-shaped strings alone are not evidence.
The controller independently rechecks live Kubernetes source/Secret provenance,
namespace ownership, pending exposure owner/generation/URL and expiry.

Response: `demo-ready-response.v1` with `leaseName`, `leaseUID`, `requestId`,
`state: "ready-for-acceptance"`, `readyAt`, `expiresAt` and the immutable request
binding digest. The controller persists these facts under `status.demoReadiness`;
`expiresAt` is exactly `readyAt + retentionSeconds`. The response also includes
the selected `retentionSeconds`; only historical `demo-readiness.v1` records without that field retain
their original seven-day interpretation. New records use `demo-readiness.v2`
and require an explicit stored duration even when the request omitted it. No credential values, token,
request dump or response bodies enter controller logs/status.

Status request is strict `{schemaVersion:"demo-ready-status-request.v1",
leaseName,leaseUID,requestId}`. It returns the committed matching response or a
non-success response for missing, changed, deleted or expired state. It cannot
create or renew anything. Same request replay returns the original timestamps;
changed request bytes/identity reject. `requestDigest` is SHA-256 of the exact
received JSON UTF-8 bytes, including whitespace and key order; the producer must
persist and replay its exact serialized body. There is no implicit extension protocol.

## Concurrency and lifecycle

First commit re-reads authoritative lease state and uses resource-version CAS.
Deleting, expired, rejected, superseded or changed source leases cannot commit.
All Ready-conflicting expiry/cleanup/status transitions must obey the same fence;
on conflict re-read instead of overwriting. Manual lease deletion has precedence
and deletes the owned namespace even when cleanupPolicy is retain.

Until commit, the ordinary immutable creation-time TTL and 24-hour cap apply.
After commit, controller status governs namespace and exposure retention through
one common deadline; agent annotations cannot extend or replace that authority.
Old attempt cleanup must not revoke the committed owner. Lost response recovery
uses authenticated status lookup; a previously delivered message is not resent.
No acceptance, logging-retention change or external deployment is included.

## Implemented bounded paths

Controller new `demo-readiness.go` and native HTTP/CAS tests; narrow main.go and
exposure-generation.go lifecycle integration. Chart CRD/status schema and existing
controller template gain opt-in TLS internal Service, exact identity/audience and
TokenReview permission. Separate helper handles projected runtime-only token
mounts, coordinated with the active deployment author. No Nova/Core/compiler
implementation is included in this controller slice.

## Remaining D06 policy

Configured initial retention is implemented in the follow-up below and must be
supplied by the source-bound project candidate. Explicit authorized extension
still requires a genuine operator ingress and a separately bound CAS decision,
not automatic retry or delivery replay. That remains open; this slice does not
claim complete D06 implementation.

## Implemented authority and recovery details

- Actual lease/status writes always re-read UID, generation, readiness state and
  resourceVersion. There are no production compatibility bypasses for old test
  fixtures. Original HTTP tests now model API UID/version and merge-patch CAS.
- An exclusive random `status.exposureMutation` claim precedes an ingress change.
  Only its in-process owner can publish completion. A second reconciler or a
  restarted process cannot adopt an unknown external action; Ready stays blocked.
  Claim readback detects server pruning before the external mutation. Explicit
  manual deletion and TTL cleanup remain available and fence the terminal state.
- Ready status readback detects a missing/pruned committed record before any
  successful response. Lost POST responses recover through the authenticated
  status endpoint without renewing the deadline or sending credentials again.
- Committed retention owns a new exposure owner and stores the exact exposure
  configuration. Later mutable `purpose=gate` or `exposure=off` cleanup intent
  cannot disable it. The previous owner is accepted only for transfer of the
  existing ingress. Namespace deletion uses UID/resourceVersion preconditions.
- Admission and successful status/replay inspect the live owned namespace,
  generated Secret and ingress route/hostname. Terminating/missing/replaced
  resources and changed source reject. Final lease re-read fences status reads and rechecks the actual wall-clock
  expiry, infrastructure phase and absence of an unresolved exposure operation
  after all live GETs. Delayed HTTP reads crossing the deadline reject replay
  and status without renewing or changing state.
  This is not an atomic snapshot across Kubernetes objects or a continuous app
  availability guarantee; the trusted producer's real recent auth test remains
  required. Source/receipt store verification remains the producer's obligation.
- Lease `spec.runId` currently equals the native fixture leaseName, not Core
  runId (kubernetes-fixture-runtime.ts). The producer must verify the original
  imported mapping; the controller does not invent equality between these IDs.
- API errors expose only fixed codes, including VERSION_CONFLICT,
  COMMIT_UNCERTAIN, RECEIPT_CONFLICT, EXPIRED, SOURCE_CHANGED,
  EXPOSURE_OWNER_CHANGED, and resource-specific unavailable/terminating codes,
  all prefixed `DEMO_READY_`. Authentication remains generic UNAUTHORIZED.
  Upstream Kubernetes response bodies and tokens are never echoed.

Controller environment: BUSTER_READY_LISTEN, BUSTER_READY_AUDIENCE,
BUSTER_READY_PRODUCER, BUSTER_READY_TLS_CERT, BUSTER_READY_TLS_KEY.
Client configuration is opt-in `busterNamespaceBroker.readyClient` with endpoint,
audience and caSecretName. It renders KUBECLAW_DEMO_READY_ENDPOINT,
KUBECLAW_DEMO_READY_AUDIENCE, KUBECLAW_DEMO_READY_TOKEN_PATH and
KUBECLAW_DEMO_READY_CA_PATH only into the actual Nova `kubeclaw` runtime container.
The projected token has the selected audience and a 600-second lifetime.
No init/extra container receives this mount. This is not same-container isolation.

## Verification and remaining gates

Original Go controller suite including the race detector passes. New actual TLS
HTTP tests call the original controller handler and Kubernetes HTTP client. They
cover exact TokenReview subject/audience, durable replay, dropped status-write
response, CAS rejection, stale expiry, original exposure reconciliation after
late purpose cleanup, manual namespace deletion, live-resource loss, competing
reconciler/restart claims, server pruning, fixed private-safe error codes, actual delayed HTTP reads across
expiry, and replay/status with an unresolved exposure claim.
The credential input is generated through the unchanged original controller test
in a native subprocess. Kubernetes, TokenReview, source/receipt facts are explicit
HTTP contract vectors; no real cluster or external Discord delivery is claimed.

Original Helm renders pass two semantic tests: TLS ClusterIP Service, bounded
TokenReview RBAC and CRD status schema; default-off client and exact runtime-only
audience-token mount. Missing producer identity is a deliberate failing render.
The new test passes canonical ESLint and scoped whitespace checks.

Native cluster authentication/admission/CRD pruning and scheduling, trusted-runtime
filesystem boundary, actual Nova handoff producer/compiler graph, native full app
execution, real recipient delivery, configurable retention and explicit operator
extension remain open. No deployment or external request was performed. The
separate auth firstslice's phase10 EPIPE output was not saved as a raw file; it
must not be represented as a passing native gate or reconstructed evidence.

Commands:

```sh
go test -race -count=1 ./cmd/buster-namespace-controller
KUBECLAW_TEST_HELM=/actual/helm node --test tests/verification/contracts/check-demo-ready-controller.mts
```

Raw outputs: docs/review/evidence/demo-ready-controller-tests.txt and
 docs/review/evidence/demo-ready-chart-tests.txt.

Exact scope (20 files including raw evidence):

- New controller demo-readiness.go, demo-readiness-lifecycle.go,
  demo-readiness-sources.go, demo-readiness_test.go.
- Controller main.go, exposure-generation.go; original main_test.go,
  exposure-generation_test.go, exposure-handoff_test.go, remediation_test.go.
- Chart buster-namespace-controller.yaml, buster-namespace-lease-crd.yaml;
  new demo-ready-service.yaml and _demo-ready-client.tpl.
- values.yaml only readyClient/controller.readiness defaults; deployment.yaml
  only three demoReadyClient helper includes (registry hunks belong elsewhere).
- New tests/verification/contracts/check-demo-ready-controller.mts, this note,
  and the two raw outputs listed above.

No Nova plugin/compiler, Core, production credential helper, logging policy,
existing operator messaging, deployment or commit is included.

Independent final counterreview: original Go 1.24.13 race suite passed (4.258 seconds); both actual Helm semantic checks passed. Delayed live-read deadline crossing and active-claim replay/status rejection were included. No remaining demonstrated blocker within the frozen controller scope.

## Configured initial duration follow-up

The controller accepts optional positive whole retentionSeconds, default 604800,
without reusing the pre-Ready 24-hour cap or inventing an operating maximum.
Go duration multiplication and RFC3339 timestamp representability are checked.
A changed duration changes the exact request binding and is rejected on replay.
The committed selected duration controls both namespace and exposure expiry;
manual deletion still wins. Invalid/pruned stored duration cannot acknowledge
Ready. No extension endpoint, extra operator identity or logging change was added.

Original Go race tests cover omitted default, prior committed default records,
custom 60 seconds/14 days, the technical maximum, null/fraction/negative/overflow,
unchanged replay and changed-duration rejection, custom expiry cleanup, immediate
manual deletion and a pruned selected duration. Actual Helm checks the CRD bounds.
No real Kubernetes/operator/source compiler proof is claimed by these HTTP tests.

Follow-up exact 14 paths: new controller demo-retention.go/demo-retention_test.go;
modified demo-readiness.go, demo-readiness-lifecycle.go,
demo-readiness-sources.go, demo-readiness_test.go;
charts/kubeclaw/templates/buster-namespace-lease-crd.yaml;
tests/verification/contracts/check-demo-ready-controller.mts;
this note and demo-retention-policy-design.md;
docs/review/evidence/demo-initial-retention-tests.txt and
 demo-initial-retention-chart-tests.txt;
 demo-initial-retention-default-pruning-before.txt and
 demo-initial-retention-default-pruning-after.txt.

### Independent default-pruning counterexample and correction

Reviewer `resume_budget` reproduced a real flaw through the original controller
HTTP fixture: a pruned new default duration returned COMMIT_UNCERTAIN first, then
incorrectly returned Ready on replay by treating the missing field as legacy.
Its original failed output is preserved byte-for-byte in
`docs/review/evidence/demo-initial-retention-default-pruning-before.txt`.
The reviewer used an overlay adding TestReviewPrunedDefaultReplayCannotAcknowledge
and ran the original Go package; the substantive regression is now in
`demo-retention_test.go`, covering omitted default, explicit default and custom
requests, then both replay and status after pruning.

Correction: only historical demo-readiness.v1 without retentionSeconds means
seven days. New writes are demo-readiness.v2 and missing/null/invalid duration
never becomes a legacy record. The CRD permits both explicit versions, requires
v2's duration via CEL, forbids a duration on v1, and prevents version changes.
Go independently enforces the same version distinction. Request and response
wire schemas remain v1; this is a persisted-record discriminator, not a caller
identity convention. Native API-server CEL enforcement is still an open gate.

After-fix output for the reviewer's unchanged original counterprobe is preserved
separately in demo-initial-retention-default-pruning-after.txt. Exact rerun:

```sh
go test -overlay /tmp/review-retention-overlay.json -count=1 ./cmd/buster-namespace-controller -run '^TestReviewPrunedDefaultReplayCannotAcknowledge$'
```

The temporary overlay is not shipped. The committed HTTP regression covers its
case and additional status/custom-duration failures; no passing output replaces
the original failure evidence.

Independent final retention counterreview passed the unchanged original pruning counterexample, a malformed/version matrix rejecting both replay and status without writes, full original Go race suite (6.752 seconds) and both Helm checks. Raw reviewer outputs are preserved as demo-retention-independent-{default-pruning-final,malformed-final,final-go,final-helm}.txt under docs/review/evidence. The first two are original-handler overlay counterprobes, not modifications to production source; the committed tests cover default/custom pruning. Live CRD CEL enforcement remains an explicit native gate.
