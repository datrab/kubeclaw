# Manifest-to-Lint Parity Plan

Status: historical parity plan; cutover is complete

This plan records the shadow comparison phase. The cutover final audit records
the authoritative current state.

## Objective

Prove that Nova lint preserves every useful behavior of the old Buster
`manifest` suite, provides the accepted improvements, and removes the six known
defects. The old suite remains authoritative. The replacement remains
shadow-only and cannot change the gate, remediation, or pipeline state.

## Sequential work

### 9-A — Parity authority

Maintain one machine-checked ledger for all 28 baseline items. Each item has a
disposition, rationale, proof, and evidence. Missing, duplicate, blocked, or
unproved items prevent closeout.

### 9-B — Shared fixtures

Use committed-style fixtures that both implementations read: raw YAML, Helm,
all supported workload kinds, multiple resources and containers, Secrets,
ConfigMaps, ServiceAccounts, invalid schemas, missing policy requirements,
and bounded malicious inputs.

### 9-C — Input, YAML, schema, security, and scope parity

Compare requested inputs, repository containment, parsing, raw and rendered
schema checks, local schema provenance, limits, denied network locations, and
the boundary between static lint and live Kubernetes tests.

### 9-D — Policy, defect, location, and evidence parity

Compare required environment variables, Secret references, private registry
credentials, probes, and limits. Prove that every container and workload is
checked, several Secret sources work, `envFrom` is resolved, ServiceAccount
pull secrets count, resources retain separate identities, and structured
evidence replaces console summaries.

### 9-E — Controlled comparison

Run both paths against the same fixture. Record meaning-level differences. The
legacy result is authoritative. Replacement errors and findings are evidence
only.

### 9-F — Contained vertical proof

Run the real Nova lint plugin, adapter, tools, artifact store, report contract,
and pipeline runner inside the Nova pod. Use real Helm and kubeconform. Prove
success, shadow findings, evidence storage, and authority isolation.

## Closeout gate

All 28 items must be proved. No difference may be unexplained. The replacement
must pass the contained vertical proof while remaining non-authoritative. Full
regression checks and Terra review must be clean. Cutover and legacy deletion
remain a separate phase.
