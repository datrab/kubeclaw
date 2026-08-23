# Manifest-to-Lint Controlled Comparison

Status: historical parity comparison; superseded by the completed cutover

This document preserves the comparison made before authority changed. Current
authority is recorded in the cutover final audit.

## Authority

The old Buster `manifest` suite is authoritative. Nova's Kubernetes lint tools
are shadow-only. A shadow result cannot alter the gate, pipeline state,
remediation, or legacy execution.

## Compared meaning

The two paths do not have identical output formats. The comparison checks the
meaning of each result: whether invalid input is detected, which resource and
container failed, whether source evidence exists, and whether the difference
is an accepted improvement.

## Cases

### Valid input

Both paths accept a supported valid workload. The replacement additionally
validates raw and rendered schemas and retains structured source evidence.

### Invalid YAML

Both paths reject invalid YAML. The replacement records a typed tool error and
source path. Its shadow failure cannot replace the legacy gate result.

### Several containers

The old path aggregates container facts. One valid container can hide missing
probes or limits on another. The replacement emits separate findings for the
incomplete container. This is an accepted defect removal.

### Several Secret sources

The old path accepts only one configured Secret YAML as its authority. The
replacement indexes all declared Secrets by namespace and name. A reference to
a second valid Secret therefore fails the old path and passes the replacement.
The old failure remains authoritative in this phase.

### `envFrom` and ServiceAccount credentials

The replacement resolves available Secret and ConfigMap keys and accepts
ServiceAccount `imagePullSecrets`. The old path cannot prove those facts and
produces uncertain or incorrect findings. These are accepted improvements.

### Shadow crash and timeout

A replacement exception is stored as a shadow failure. A shadow timeout aborts
the shadow signal and is stored as timed out. Neither case changes a passing
legacy result.

## Proof

`tests/verification/contracts/check-pipeline-manifest-lint-comparison.mts`
runs real old and new code against the same committed-style fixtures. The
comparison helper returns the legacy value as `gateResult` before shadow
collection and makes shadow collection idempotent.
