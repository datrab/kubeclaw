# Kubernetes Fixture Cutover Final Audit

Status: complete with one accepted deployment deferral

Audience: maintainers, reviewers, and operators
Purpose: record the Suite 5 authority change and deletion result

## Authority

`kubeclaw.kubernetes-fixture@1` is the sole Kubernetes deployment-fixture
authority. The legacy `k8s` suite cannot enter the old protocol or runner.

## Deleted Surfaces

The cutover deletes the old runtime, YAML rewriting, image building, namespace
logic, readiness polling, credential decoding, and suite registry entry.

Project scaffolding and production workspace generation no longer select the
old `k8s` suite. They create the replacement plan nodes instead.

The old Tailscale preview suite no longer consumes `k8s` metadata. Its retained
legacy path accepts only an explicit preview URL until Suite 7 replaces it.

The canonical successful E2E run does not select preview without a URL
producer. It runs the real security suite instead. Preview fault scenarios
select the legacy preview suite explicitly.

## Deployment Deferral

The running controller still needs the image that removes the obsolete Role
rule. The project owner accepted this rollout as deferred on 2026-08-21.

The deferral does not retain the old suite. It does not add a fallback, mock,
or compatibility wrapper. A fixture request fails closed until the rollout.

## Verification

The cutover gate checks replacement authority and old-file absence. It also
checks protocol rejection, scaffolding, production fixtures, and plan links.

The gate checks dependency removal, capability removal, and the full parity
ledger.

The proof uses no mock, fake service, emulator, or compatibility wrapper.
