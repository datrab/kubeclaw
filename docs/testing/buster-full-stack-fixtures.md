# Buster full-stack fixture extension

Status: implementation under verification, not deployed or target-cluster certified.
Baseline: PR13 documentation revision `6ee7de7fba381fe4850e5ecdf67ec6013018cc2c`.
Operator: Raven authorized the bounded extension on 2026-10-23 09:37 UTC.

## Existing route and explicit opt-in

Keep the documented resolved Buster fixture node, checked-manifest artifact,
registry/storage/Secret limits, namespace lease, expiry and release. No standalone
shell or cluster-admin route is added. The legacy single-image mode is unchanged.
Add to `kubeclaw.kubernetes-fixture@1` fixture configuration:

```json
{
  "fullStack": true,
  "verifiedImages": ["registry.local/core@sha256:<64-lowercase-hex>", "registry.local/database@sha256:<64-lowercase-hex>"],
  "podReplacementSelectors": [{"app": "household-database"}]
}
```

These are placeholders, not a runnable image inventory. Retain the primary
`image` input/config, service name/port, checked-manifest and existing settings.
Inventory: 1–32 distinct immutable references, including the primary image;
every workload and init-container image must be listed and registry-approved.
The CRD makes mode, inventory, endpoint selector and product policies immutable;
the controller validates and observes the same inventory. Existing pod security
and capability restrictions remain in force. Use only unexposed `gate` leases.

## Network policy ownership

The runtime extracts validated NetworkPolicies from the checked manifest and
puts their names/specifications into the immutable lease. It applies only the
remaining workload resources. The controller alone installs the policies, with
controller-owned hash names; the fixture deployer receives no NetworkPolicy verbs.
The original checked-manifest digest remains the input identity.

For full-stack leases the broker's default policy no longer permits all traffic
inside the namespace. It supplies default-deny, cluster DNS, and Buster ingress
only to the selected endpoint pods and target TCP port. Product policies may
allow label-selected same-namespace peers and numeric TCP/UDP ports; the only
cross-namespace product exception is exactly kube-system/kube-dns on port 53.
No ipBlocks, arbitrary namespace selectors, unbounded peers/ports or selector
expressions are supported by this bounded first extension. Such requirements
fail explicitly, rather than broadening the envelope. External service/provider
connectivity requires a separately designed fixture path; it is not claimed here.

## Controlled replacement and evidence

Optional `podReplacementSelectors` selects exactly one pod per label map (at
most eight sequential replacements). After initial readiness the runtime binds
its operation to the live lease UID, namespace and concrete pod UID. It submits
a CAS annotation request to the controller. The controller verifies the owned
namespace and unexpired gate lease, accepts only controlled Deployment/StatefulSet
pods, and sends a Kubernetes DeleteOptions UID precondition. No PVC deletion or
arbitrary command is part of the operation. Duplicate request receipts do not
repeat a deletion. Runtime evidence requires the old UID to disappear, the same
controller's pod count to recover, pod readiness and endpoint readiness. Completed
successful Job pods count as completed work, failed Jobs never as ready services.
Replacement observations are retained in providerDetails. This proves restart
readiness, **not data persistence**: the product test must still write/read data
across replacement and retain those observations.

The bounded capability operation `replace-pod` accepts leaseName, leaseUID,
namespace, podName, podUID and timeoutMs. No automatic retry is promised. A failed
or cancelled attempt remains failed and uses existing fixture cleanup behavior.

## Rollout and rollback

1. Run focused provider/runtime/controller, security-negative and Helm checks;
   complete structured review before publication.
2. Publish a digest-pinned controller build from
   `docker/Dockerfile.namespace-controller` and a matching Buster runtime/plugin
   build through the existing build/release pipeline. Retain previous digests.
3. Render the existing Buster release with the extended chart: CRD, controller
   pod-delete permission and new controller digest via
   `busterNamespaceBroker.controller.image`. Apply via the existing infrastructure
   GitOps path; never sync a production Familyclaw release for this test.
4. Confirm server schema preserves the new fields and the controller is healthy;
   update the installed Buster runtime/plugin build. Check lease `patch` permission
   as well as existing create/get/delete. Do not request full-stack mode against
   an old CRD/controller. Registry/storage policies must cover the real inventory.
5. Run a disposable real fixture: all listed images, rejected unlisted image,
   allowed application paths, denied direct agent→database and foreign namespace,
   successful migration, UID-bound replacement, persistence write/read and lease
   cleanup. Preserve actual run IDs, UIDs, network and storage observations.
6. Rollback: stop submitting full-stack fixtures, release active full-stack leases
   and verify namespace/storage cleanup; restore previous runtime and controller
   digests/RBAC via GitOps. Leave additive CRD fields until no full-stack lease
   remains; do not prune live lease fields as a rollback mechanism.

No live success is established by local HTTP executor fixtures or unit tests.

## PR13 documentation findings

PR13 correctly describes a single primary image, prepare/release and separate
client/controller authority. It explicitly does not claim target-cluster proof.
It lacks a supported multi-image inventory, controller-owned product-policy
composition, UID-bound replacement and completed-Job readiness semantics. Those
are extension gaps, not evidence that the documented single-image flow failed.
This document records the extension; target-cluster behavior remains unverified.

## 2026-10-23 readiness diagnostics: first implementation checkpoint

Readiness and service-readiness timeouts now collect an allowlisted snapshot of
Pod identity/UID, phase, scheduling/readiness conditions, init/regular container
current and previous state, exit codes and restarts, plus event reasons/counts,
**before** lease cleanup. Pod/event/namespace reads have one-second per-read and five-second
overall diagnostic deadlines and share caller cancellation. Diagnostic read
failures and cleanup failure are recorded independently. Namespace identity now
includes its UID when readable; an RBAC denial remains separate from pod evidence.
Diagnostic read errors distinguish forbidden, unauthorized, not-found, timeout,
output-limit and invalid JSON (including malformed list shape), inspecting wrapped
causes without exposing arbitrary stderr. Unknown failures remain unavailable. Ordinary fixture provider
results carry the snapshot in `providerDetails.values.failureEvidence` and declare
`kubernetes-fixture-failure.json` as JSON log evidence for the existing default
failed-node artifact collector. The provider writes exclusively with mode 0600,
checks the real evidence directory stays inside the workspace, and enforces a
128 KiB ceiling plus invocation artifact budgets. Publication failures are separate
`failureArtifactError` values; they never replace the readiness failure or inline
snapshot. Durable staging/store round-trip is regression-tested locally, not yet
verified in a live remote pipeline. Results retain a
failed outcome and no deployment outputs. Cancellation still propagates as an
error and cleanup retains its independent deadline.

This is intentionally **not yet the complete diagnostic gap fix**. Arbitrary API
messages and container logs remain omitted rather than leaking probe commands,
credentials or application output. Next: establish the safe bounded log/message
redaction path (including previous logs), verify live artifact publication, and cover actual crash/probe cases and cancellation/cleanup through
the runtime. Then run platform review/build/rollout via the established workflow
and repeat the disposable HTTP canary. No rollout or live acceptance was performed
at this checkpoint; the historical startup cause is still unknown.
