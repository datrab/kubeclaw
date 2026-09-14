# Qdrant and API-policy local acceptance

Work resumed on 2026-09-13 at approximately 04:32 UTC in the same PR #6.
Five hours have not elapsed at this checkpoint. No deployment, merge, live test
or operational cleanup has been performed.

## IFR-13-001

The optional Qdrant source now has a chart archive hash, immutable server image,
mandatory independent admin/read keys, TLS/CA validation before deployment, a
read-only agent health client, durable snapshots, verified export and fresh-store
restore commands. Unknown existing collections are retained original data until
their owner supplies reproducible provenance. Prism's application storage stays
PostgreSQL; it has no Qdrant writer introduced by this package.

The actual Qdrant 1.19.1 native binary passes the complete local TLS/auth,
read-versus-write authority, SIGKILL/export/fresh-store restore/search equality,
corruption, existing-target rejection and key rotation sequence. The runtime
agent health function and prepared live read gate execute against that database.
The original upstream release archive SHA-256 was verified as
`eef986e769d4d3e806dd2d546e1b4ecdd416211e54d34b4ed764fac7c58e1085`.

Local acceptance applies to this finding's security, ownership and recovery
contract under D12. Existing StatefulSet/PVC migration remains an explicit
dependency in IFR-24-001/IFR-16-001. The preflight now rejects that incompatible
transition before infrastructure mutations; no safe migration or cluster rollout
is falsely inferred from a Helm render. Cross-store/off-node backup orchestration
remains IFR-26-001. Detailed operations: `../../../operations/qdrant.md`.

## IFR-03-001

The existing Cilium API entity grants already cover both 443 and 6443 for the
three intended application identities. The recovery Ops chart additionally
supports discovered endpoint IPs/ports under portable and Cilium policies.
New local tests inspect the complete shipped grants and execute Helm renders.
The prepared actual-SA API probe and its Job renderer cover Service and endpoint
routes without pretending that a local HTTP emulator is Kubernetes. See
`pr6-api-network-contract.md` for remaining live traffic/drop evidence.

## Shared version work, still partial

Tailscale operator/proxy, Qdrant/server/test images and registry mirror are bound
through `versions.json`. Tailscale and Qdrant chart archives are hash checked;
both install/upgrade renders and all workload/hook images are inspected before
deployment. Qdrant's upstream semver chart constraint is resolved by mandatory
digest binding after render, not a mutable runtime tag. Redis/PostgreSQL image,
chart and storage migration work is still open under IFR-24-001. This is not an
all-infrastructure reproducibility closure.

Raw local evidence and exact invocation notes are in
`../../evidence/pr6-qdrant/`. The four original Core/Buster/Prism/Observability
findings remain uncompleted and work continues on the remaining package.
