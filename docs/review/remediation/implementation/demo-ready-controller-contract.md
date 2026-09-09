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
syntax. A request cannot specify Ready time, retention duration or credential
values. Unknown fields, trailing data and noncanonical/non-HTTPS URLs reject.
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
`expiresAt` is exactly `readyAt + 604800 seconds`. No credential values, token,
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

This first bounded operation implements the default seven days only. D06 also
requires project-configurable retention and explicit authorized extension. Those
need separate policy-bound fields and an operator-authorized CAS extension
operation, not automatic retry or delivery replay. They remain open; this slice
does not claim complete D06 implementation.

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
