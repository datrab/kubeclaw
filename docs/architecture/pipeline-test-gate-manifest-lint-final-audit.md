# Manifest-to-Lint Implementation Final Audit

Status: historical implementation audit; parity and cutover are complete

This document records the implementation-phase boundary. The cutover final
audit records the authoritative current state.

## Decision result

D-008 is implemented at the replacement layer. Static YAML, raw Kubernetes
schema, rendered Helm schema, selected policies, custom packs, locations, and
evidence exist in Nova lint. D-008 is not closed because the old manifest suite
still owns the gate.

## Authority result

The legacy bridge remains `unmigrated`. The complete new schema and policy
tools remain experimental. The implementation cannot affect the gate in this
phase. Existing blocking Helm schema lint remains unchanged.

## Important design decisions

- Reuse Nova lint. Do not add a Buster provider or scheduler.
- Use explicit file and chart arrays. Do not scan for possible deployments.
- Use local versioned schemas for the replacement. Do not change the old
  authoritative adapter before parity and cutover.
- Use declarative installed policy packs. Do not run project policy code.
- Bind packs and evidence with SHA-256 and bounded sizes.
- Check each container and resource separately.
- Keep live Kubernetes apply and health proof separate.

## Scope boundary

This phase does not compare all 28 baseline items against the old suite. It
does not activate the replacement, change the legacy bridge, or delete old
manifest code. Those are the next parity and cutover phases.

## Proof

`tests/verification/contracts/check-pipeline-manifest-lint-implementation.mts`
uses real YAML, Helm, kubeconform, policy packs, lint reports, and negative
cases. It proves raw and rendered schemas, every selected policy type, exact
locations, stable paths, duplicate rejection, digest checks, size, file,
document, rule, and symlink limits, and non-authoritative execution.

The complete contract suite passed. It includes 35 live plugin packages and
40 executable registration containment checks. The Phase 7 through Phase 10
test-gate regressions passed. TypeScript checks covered 468 source files.
Documentation, generated inventory, Git whitespace, and the production
dependency audit passed. The production dependency audit reported zero
vulnerabilities.

Terra accepted nineteen findings during closeout. They covered legacy Helm
discovery, authority isolation, pre-render input limits, document limits,
policy-pack limits, duplicate declarations, stable report paths, legacy
evidence isolation, Helm template locations, source provenance, and evidence
capacity, root containment, source-marker integrity, and optional Secret
semantics, large evidence handling, and evidence path privacy. All nineteen were fixed
and received regression proof. Two findings extended Secret reference and
init-container coverage. A later request to change the old
adapter to the new schema source was rejected because it would violate the
same authority isolation rule before parity.
