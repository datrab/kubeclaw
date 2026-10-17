# Kubernetes Fixture Parity Final Audit

Status: contained parity complete; production acceptance pending deployment

Audience: maintainers, reviewers, and operators
Purpose: record the Suite 5 parity result

## Result

The ledger records all 48 baseline items.

The ledger contains 15 preserved items, 26 improved items, one removed defect,
and six deferred live confirmations. The six entries use `status: deferred`.
They do not claim proved status. No item is blocked.

The six deferred confirmations use one cause. The deployed namespace
controller has not received the image that removes its obsolete Role rule.
The source, chart, provider, capability boundary, and failure behavior are
proved. The operator must repeat the live verifier after the next rollout.

## Real Proof

The live check creates a real generated workspace. It runs the checked-manifest
node and the fixture node through the real plan runner. It reaches the real
registry, provider process, Kubernetes API, and deployed controller.

Source checks also cover the provider schema, chart, controller, artifact
rules, scaffolding, and capability implementation.

The proof uses no mock, fake service, emulator, or compatibility wrapper.

## Accepted Deferral

The project owner accepted the controller rollout as a deferred deployment action on
2026-08-21. This deferral does not add authority or a fallback path.

Run `./scripts/deploy.sh nova-kubernetes-fixture-preflight IMAGE@sha256:DIGEST` after the controller
rollout. Record the result before the next release deployment.
