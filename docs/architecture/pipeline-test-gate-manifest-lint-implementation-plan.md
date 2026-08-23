# Manifest-to-Lint Replacement Implementation Plan

Status: historical implementation plan; parity and cutover are complete

This document records the non-authoritative implementation phase. The
authoritative current state is recorded in the cutover final audit.

This is the implementation phase of the reusable suite migration workflow. It
builds the replacement for the old Buster `manifest` suite. It does not give
the replacement gate authority and it does not delete the old suite.

## Fixed architecture

Static manifest checks belong to Nova's existing lint stage. The replacement
does not create a Buster provider, another scheduler, or another gate. Live
cluster apply and runtime checks remain separate.

```text
committed project snapshot
  → explicit raw YAML and Helm chart inputs
  → YAML parser
  → local Kubernetes schemas
  → selected declarative policy packs
  → lint findings and evidence
  → experimental report during this phase
```

## 8-A — Audit and lock scope

Audit D-008, the old manifest runner and parser, the existing lint system, old
configuration, tests, documents, registry entries, and deletion targets.
Create stable baseline identifiers. Stop when every useful behavior, accepted
improvement, and known defect has an entry.

## 8-B — Lock contracts

Add explicit project fields for raw manifests, Helm charts, Kubernetes
version, local schema location, selected packs, and bounded limits. Add
operator pack references with identifier, version, path, and SHA-256. Reject
unknown packs, changed packs, path escape, duplicate values, invalid limits,
and network schema locations.

## 8-C — Implement schema checks

Validate explicit raw files and rendered Helm output with real `kubeconform`.
Package one pinned strict schema tree in the Nova image. Retain bounded command
output and source digests as evidence. Do not fetch schemas during a run.

## 8-D — Implement policy checks

Use declarative operator-installed packs. Version 1 supports required
environment variables, Secret references, private registry credentials,
readiness probes, liveness probes, and CPU and memory limits. Evaluate each
container separately and include file and line data.

## 8-E — Integrate lint reports

Add policy-pack digests and bounded evidence to lint report version 7. Keep the
new complete schema and policy tools experimental. Preserve the existing
blocking Helm schema check.

## 8-F — Prove and close implementation

Use a real temporary committed-style repository, real YAML, a real Helm chart,
real Helm rendering, real `kubeconform`, real pack digest checks, and the real
lint engine. Prove valid input, invalid raw schema, invalid rendered schema,
policy findings, exact lines, evidence, and forged pack rejection. Run full
regression checks and Terra review.

## Next phases

The parity phase must close all 28 baseline items and compare old and new facts
while the old suite remains authoritative. The cutover phase then activates
the lint replacement, marks `manifest` migrated, deletes the old runner and
parser, and proves that only one authority remains.
