# HTTP Provider Cutover Final Audit

Status: source cutover complete; production acceptance pending deployment

Audience: maintainers and reviewers

Purpose: record the Suite 6 sole-authority cutover and deletion proof

## Outcome

The `kubeclaw.http@1` provider is the only HTTP test authority.

The legacy health implementation is deleted.

The legacy protocol, registry, project scaffold, workspace fixture, capability map, and telemetry no longer select health.

The project scaffold writes `kubeclaw.http@1` nodes to `.swarm/pipeline.json`.

It removes retired health fields from `progress.json`.

## Dependency Ownership

The resolved test plan now owns HTTP dependencies and execution order.

Nova completes the provider plan before it starts remaining legacy consumer suites.

Nova does not start those suites when the provider plan fails.

Remaining legacy suites do not depend on a deleted suite name.

## Proof

The cutover gate checks sole authority, project scaffolding, real workspace data, decision D-013, and the complete 50-item parity ledger.

The capability diagnostic runs the isolated provider against a real Kubernetes Service through cluster DNS.

The production preflight runs signed source through Nova, the authenticated
Buster plan service, the Kubernetes fixture, and the isolated HTTP provider.
It imports evidence and the final decision into Nova. The control node waits
for resource deletion and signs the final receipt with an operator key that is
outside the repository.

Production acceptance remains pending until that signed receipt exists.

The proof uses no mocks, fake services, emulators, or compatibility wrappers.
