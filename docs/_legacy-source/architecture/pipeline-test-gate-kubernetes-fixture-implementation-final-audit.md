# Kubernetes Fixture Implementation Audit

Status: complete; superseded by parity and cutover

Audience: maintainers, reviewers, and operators
Purpose: record the Suite 5 implementation result and proof boundary

## Result

The source implements `kubeclaw.kubernetes-fixture@1` as a fixture provider.
The provider remained non-authoritative during implementation.

The implementation uses one narrow capability. It applies checked YAML to a
broker-owned namespace. It returns typed internal endpoints and references.

Project scaffolding preserves canonical fixture nodes from `.swarm/pipeline.json`.
It rejects the retired `k8s` selector and configuration. It does not translate
the old object through a compatibility path.

Production workspace generation creates the complete fixture chain directly.
The chain checks the manifest, uses one immutable image, deploys the fixture,
and runs HTTP checks.

The controller enforces the approved Secret list. Retained fixtures expire
without recreation. The result uses the lease creation time.

The provider does not infer the creation time. It fails when an old controller
omits this field. This rule prevents false lifecycle evidence.

## No-Mock Record

No mock, capability emulator, or fake Kubernetes API was added. The live check
reached the real Kubernetes API and the deployed namespace controller.

The controller failed because its deployed Role template is obsolete. This is
a real deployment finding. The source and chart remove that rule. No expanded
controller permission is required.

## Proof Limit

The current Nova service account cannot update the controller Deployment.
The project owner accepted the image rollout as a deferred deployment action. The
operator must run the live verifier after that rollout.
