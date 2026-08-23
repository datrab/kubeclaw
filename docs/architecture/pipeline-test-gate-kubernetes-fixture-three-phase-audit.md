# Kubernetes Fixture Three-Phase Audit

Status: complete with one accepted deployment deferral

Audience: maintainers, reviewers, and operators
Purpose: record the attempted implementation, parity, and cutover workflow

## Scope

This audit covers suite 5. It replaces the legacy `k8s` suite with
`kubeclaw.kubernetes-fixture@1`.

## Phase A: Implement

The source implementation is complete. The provider consumes one checked YAML
artifact and one immutable local-registry image. It requests a brokered
namespace. It applies the checked bytes. It waits for real pod readiness. It
returns a typed deployment value. It owns lease cleanup.

The implementation uses the shared graph, provider runner, command sandbox,
artifact store, capability broker, namespace lease controller, and Kubernetes
API. It adds no mock, fake API, emulator, or compatibility wrapper.

The focused source checks pass. The first live run reached the real Kubernetes
API and found an obsolete Role rule in the deployed controller. The source,
chart, and legacy runtime now remove that rule.

The project owner accepted the controller rollout as a deferred deployment action. The
provider fails closed until the running controller receives the corrected
image. This deferral adds no fallback authority.

## Phase B: Prove Parity

Phase B records all 48 baseline items. The ledger records 15 preserved items,
26 improved items, one removed defect, and six accepted live deferrals. The
six entries use deferred status. No item is blocked.

The legacy `k8s` suite remained authoritative throughout parity. The
replacement remained shadow-only until the cutover.

## Phase C: Cut Over and Delete

Phase C is complete. The legacy bridge records `migrated`. The old Kubernetes
runtime, protocol entry, registry entry, dependency node, capability mapping,
and metadata coupling are absent.

`kubeclaw.kubernetes-fixture@1` is the sole source authority. No dual authority
exists. No compatibility wrapper was added.

Project scaffolding and production workspace generation use the replacement
plan. They do not select the deleted `k8s` suite.

## Deferred Operator Action

1. Deploy the updated Buster controller image.

2. Wait for the namespace-controller Deployment rollout.

3. Run `npm run verify:test-gate:kubernetes-fixture-live`.

4. Attach the successful result to the next release evidence.

## Proof Boundary

The first real run proves provider isolation, typed artifact transfer, narrow
capability use, Kubernetes authentication, lease submission, and fail-closed
error import. Source and contract checks prove the remaining boundaries.

The accepted deferral covers final live confirmation of namespace readiness,
manifest application, pod readiness, secret copying, and lease cleanup. The
controller rollout is the only required external action.
