# Manifest-to-Lint Cutover Final Audit

Status: complete

Audience: maintainers and operators

Purpose: Record the final Suite 2 migration result and its proof.

## Result

Nova lint is the only static Kubernetes validation authority. The old Buster
`manifest` runner and parser are deleted. The legacy bridge and protocol reject
manifest work. All 28 parity items remain proved.

Project setup now writes the exact Kubernetes inputs into `.swarm/pipeline.json`.
The production pipeline reads this declaration and runs Nova lint before operator approval.

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
- Project setup migration with exact input preservation and fail-closed errors.
- The real production stage order and its root pipeline declaration.
- The production policy builder with the real nginx deployment fixture.
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
- The canonical policy could call a missing adapter detector. The registry now
  supplies a safe default detector and tests every configured adapter.
- Project setup removed `manifest` without creating a lint replacement. It now
  migrates exact manifest paths or stops when the deployment path is absent.
- The production pipeline had no manifest lint stage. It now runs the Nova lint
  stage after merged review and before operator approval.

## Verification

The focused cutover gate passed. It includes the 28-item parity ledger, sole
Nova PipelineRunner path, real YAML, Helm, kubeconform, local schemas,
digest-verified policy packs, bounded evidence, the complete unit migration
regression, legacy bridge checks, and remaining Buster suite tests.

The vertical proof loads the project lint declaration. It runs the real Nova
plugin, Helm, kubeconform, policy engine, and artifact store. It does not use a
mock tool or a fake success result.

The production proof builds the exact runtime policy. It runs yamllint, the
policy engine, and kubeconform against the real nginx deployment fixture.

The complete repository contract gate passed after the pod restored locked
development packages from `package-lock.json`. It includes all 119 architecture
decisions, 93 unit parity items, 35 live plugin packages, 40 executable-plugin
crash-containment registrations, remote test-gate, worker, observability, and
plugin-system proofs. Documentation generation, links, coverage, project setup
type checks, Git whitespace checks, and the production dependency audit passed.
The production dependency audit reported zero vulnerabilities.

## Terra review

The final review used `/app/node_modules/.bin/codex`, `gpt-5.6-terra`, and high
reasoning. TruffleHog found no credential. The review accepted no finding and
reported no actionable defect. It classified the patch as correct with 0.93
confidence.

## Closeout

D-008 is implemented and proved. Nova lint is the only static Kubernetes
validation authority. The old manifest suite cannot be selected or restored
without failing machine absence checks. The manifest migration is complete.
