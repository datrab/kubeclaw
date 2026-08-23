# Manifest-to-Lint Cutover Final Audit

Status: complete

## Result

Nova lint is the only static Kubernetes validation authority. The old Buster
`manifest` runner and parser are deleted. The legacy bridge and protocol reject
manifest work. All 28 parity items remain proved.

## Sole path

```text
declared raw YAML and Helm charts
→ Nova lint
→ bounded YAML parsing and Helm rendering
→ pinned local Kubernetes schema validation
→ digest-verified declarative policy packs
→ structured findings and bounded evidence
→ Nova lint gate result
```

## Deleted surfaces

- Legacy manifest runner and parser.
- Legacy suite protocol, registry, execution-order, and dependency entries.
- Old `test_config.manifest` project setup and documentation.
- Real-pipeline manifest suite declarations and manifest-based failure fixtures.

## Preserved boundaries

- Static lint does not contact or modify a Kubernetes cluster.
- Live deployment, readiness, health, and preview checks remain separate.
- Old comparison outcomes are immutable test evidence, not executable code.
- The generic Helm adapter is suppressed when explicit Kubernetes inputs use
  the authoritative schema tool, preventing duplicate schema authority.

## Proof

- Machine cutover inventory and executable absence checks.
- All 28 parity items.
- Real raw YAML, Helm, kubeconform, policy-pack, artifact-store, and Nova
  PipelineRunner execution.
- Passing input succeeds; policy and YAML failures block.
- Legacy protocol and bridge selection fail closed.

## Defects found during cutover

- The remaining Kubernetes runtime suite imported YAML helpers from the deleted
  manifest runner. The shared parser now has a neutral runtime location.
- Adapter-specific detection was overwritten by generic language detection.
  The registry now preserves both detection rules.
- Explicit Kubernetes inputs could select both schema adapters. The generic
  Helm adapter now runs only when no explicit Kubernetes input exists.
- Generic Helm projects without a Kubernetes declaration could crash during
  detection. Optional settings and a direct regression test preserve the old
  generic Helm path.
- Test-agent and quality-gate fixtures still requested the deleted suite. They
  now exercise the remaining `bundle` suite.
- A Git cleanup test coupled its Git assertion to an unavailable Kubernetes
  cleanup service. It now requires every relevant Git and artifact cleanup
  step without hiding Kubernetes cleanup failures in their own proof.

## Verification

The focused cutover gate passed. It includes the 28-item parity ledger, sole
Nova PipelineRunner path, real YAML, Helm, kubeconform, local schemas,
digest-verified policy packs, bounded evidence, the complete unit migration
regression, legacy bridge checks, and remaining Buster suite tests.

The complete repository contract gate passed after the pod restored locked
development packages from `package-lock.json`. It includes all 119 architecture
decisions, 93 unit parity items, 35 live plugin packages, 40 executable-plugin
crash-containment registrations, remote test-gate, worker, observability, and
plugin-system proofs. Documentation generation, links, coverage, project setup
type checks, Git whitespace checks, and the production dependency audit passed.
The production dependency audit reported zero vulnerabilities.

## Terra review

The first `gpt-5.6-terra` high-reasoning review found one valid P1 regression:
generic Helm projects without a Kubernetes configuration could fail during
tool detection. The finding was accepted and fixed with regression proof. No
finding was rejected. The second review was clean and classified the patch as
correct.

## Closeout

D-008 is implemented and proved. Nova lint is the only static Kubernetes
validation authority. The old manifest suite cannot be selected or restored
without failing machine absence checks. The manifest migration is complete.
