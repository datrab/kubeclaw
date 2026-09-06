# kubeclaw.review

Review-Status: ungeprüft. Geprüfter Commit: —.
Inventar-Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Dies sind Erfassungsbelege, kein Einzelreview.

## Verantwortung, Grenzen und Einstieg

- `skills/nova/plugins/review`

Entrypoints: `src/repository-audit-stage.ts#executeRepositoryAudit; src/repository-revalidation-stage.ts#executeRepositoryRevalidation; src/stage.ts#execute`.

Nutzung: Ausgeliefert in: nova; Auswahl und Aufruf offen. Verantwortung aus Registrierungen unten; bei Core/Diensten noch konkretisieren.

Registrierungen aus Manifest:

- `stages:review` → `src/stage.ts#execute`; benötigte Capabilities: runtime.dispatch, git.repository.read, artifacts.read, artifacts.write
- `stages:repository-audit` → `src/repository-audit-stage.ts#executeRepositoryAudit`; benötigte Capabilities: runtime.dispatch, git.repository.read, artifacts.read, artifacts.write
- `stages:repository-revalidation` → `src/repository-revalidation-stage.ts#executeRepositoryRevalidation`; benötigte Capabilities: runtime.dispatch, git.repository.read, artifacts.read, artifacts.write

Paketabhängigkeiten: `@kubeclaw/plugin-sdk`, `tiktoken`

Infrastrukturannahmen: offen; konkrete Speicher-, Transport-, Identitäts- und Toolvoraussetzungen im Einzelreview nachweisen.

## Tests und Dokumentation

Tests sind zugeordnet, noch nicht als gelesen oder ausgeführt gewertet:

- `skills/common/plugins/runtime-dispatch/tests/live-function.test.ts`
- `skills/nova/plugins/implementation-agent/tests/live-function.test.ts`
- `skills/nova/plugins/project-summary/tests/live-function.test.ts`
- `skills/nova/plugins/project-summary/tests/summary.test.mjs`
- `skills/nova/plugins/review/tests/echo-review-output.unit.test.mjs`
- `skills/nova/plugins/review/tests/echo-review-verification.unit.test.mjs`
- `skills/nova/plugins/review/tests/fixtures/review-governor.mjs`
- `skills/nova/plugins/review/tests/fixtures/review-policy.mjs`
- `skills/nova/plugins/review/tests/fixtures/scalable-review-quality-baseline.json`
- `skills/nova/plugins/review/tests/fixtures/scalable-review-quality-corpus.json`
- `skills/nova/plugins/review/tests/live-function.test.ts`
- `skills/nova/plugins/review/tests/package-boundary.test.mjs`
- `skills/nova/plugins/review/tests/protocol.unit.test.mjs`
- `skills/nova/plugins/review/tests/repository-audit-stage.unit.test.mjs`
- `skills/nova/plugins/review/tests/repository-revalidation.unit.test.mjs`
- `skills/nova/plugins/review/tests/repository-review-profile.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-bundle-contract.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-bundle-snapshot.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-cluster-contract.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-cluster-identity.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-content-cache.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-context-production.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-context-selection.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-contract-parity.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-decision-matrix.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-evaluation-metadata.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-evidence-authority.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-fact-extractors.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-governor.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-graph.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-invariants.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-map-artifacts.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-policy-contract.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-policy-profiles.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-policy-resolver.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-prompt-budget.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-proposal-preflight.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-quality-corpus.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-reducer.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-report-builder.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-report-contract.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-scale-slicing.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-slicing.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-snapshot-inventory.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-stage-input.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-stage-verification.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-verdict-policy.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-verification-reconciliation.unit.test.mjs`
- `skills/nova/plugins/review/tests/review-verified-findings.unit.test.mjs`
- `skills/nova/plugins/review/tests/scalable-review-compiler.unit.test.mjs`
- `skills/nova/plugins/review/tests/scalable-review-jobs.unit.test.mjs`
- `skills/nova/plugins/review/tests/scalable-review-topology.unit.test.mjs`
- `skills/nova/plugins/review/tests/scalable-review-verification.unit.test.mjs`
- `skills/nova/plugins/review/tests/simplification-contract.unit.test.mjs`
- `skills/nova/plugins/review/tests/simplification-fact-producer.unit.test.mjs`
- `skills/nova/plugins/review/tests/simplification-manifest.unit.test.mjs`
- `skills/nova/plugins/review/tests/simplification-miner.unit.test.mjs`
- `skills/nova/plugins/review/tests/stage.unit.test.mjs`
- `tests/verification/contracts/check-plugin-agent-output-contracts.mts`
- `tests/verification/contracts/check-plugin-system-v2-boundaries.mjs`
- `tests/verification/contracts/check-plugin-system-v2-capability-security.mjs`
- `tests/verification/contracts/check-plugin-system-v2-contracts.mjs`
- `tests/verification/contracts/check-plugin-system-v2-phase6.mjs`
- `tests/verification/contracts/check-project-compiler.mts`
- `tests/verification/e2e/real-run-evidence.mjs`
- `tests/verification/e2e/run-v2-production-pipeline.mts`
- `tests/verification/reliability/review-candidate.test.mts`

Dokumentationsstatus: unvollständig (Abgleich offen).

- `docs/DOCUMENTATION_TOPIC_MAP.md`
- `docs/architecture/echo-review-governance-implementation-plan.md`
- `docs/architecture/echo-review-phase-1-baseline.md`
- `docs/architecture/echo-review-phase-2-design.md`
- `docs/architecture/echo-review-phase-3-design.md`
- `docs/architecture/echo-review-phase-4-design.md`
- `docs/architecture/echo-review-phase-4-plan.md`
- `docs/architecture/echo-review-phase-5-design.md`
- `docs/architecture/echo-review-phase-5-plan.md`
- `docs/architecture/echo-review-phase-6-design.md`
- `docs/architecture/echo-review-phase-6-plan.md`
- `docs/architecture/echo-review-phase-7-design.md`
- `docs/architecture/echo-review-roadmap.md`
- `docs/architecture/plugin-system-current-inventory.md`
- `docs/architecture/plugin-system-implementation-plan.md`
- `docs/architecture/plugin-system-phase9-changelog.md`
- `docs/architecture/plugin-system-phase9-extension-assessment.md`
- `docs/blueprint/01-platform-inventory.md`
- `docs/blueprint/04-evidence-matrix.md`
- `docs/blueprint/05-decision-record-catalogue.md`
- `docs/site/extend/plugin-catalogue/README.md`
- `docs/site/extend/plugin-catalogue/kubeclaw.review.md`
- `docs/site/reference/capabilities.md`
- `skills/nova/plugins/review/README.md`

## Aufrufer- und Abhängigkeitsbelege

Suchtreffer; Auswahl, Import und tatsächlicher Aufruf noch zu unterscheiden. Bis zu 30 Referenzstellen im `../inventory-data.json`; referenceTotal nennt die ursprüngliche Trefferzahl.

- `charts/kubeclaw/files/config/knip.json:679`
- `docs/DOCUMENTATION_TOPIC_MAP.md:7`
- `docs/architecture/echo-review-governance-implementation-plan.md:4`
- `docs/architecture/echo-review-phase-1-baseline.md:11`
- `docs/architecture/echo-review-phase-1-baseline.md:105`
- `docs/architecture/echo-review-phase-2-design.md:4`
- `docs/architecture/echo-review-phase-2-design.md:101`
- `docs/architecture/echo-review-phase-3-design.md:4`
- `docs/architecture/echo-review-phase-4-design.md:4`
- `docs/architecture/echo-review-phase-4-plan.md:4`
- `docs/architecture/echo-review-phase-5-design.md:4`
- `docs/architecture/echo-review-phase-5-plan.md:4`
- `docs/architecture/echo-review-phase-6-design.md:4`
- `docs/architecture/echo-review-phase-6-plan.md:4`
- `docs/architecture/echo-review-phase-7-design.md:68`
- `docs/architecture/echo-review-roadmap.md:4`
- `docs/architecture/plugin-system-current-inventory.md:67`
- `docs/architecture/plugin-system-implementation-plan.md:681`
- `docs/architecture/plugin-system-phase9-changelog.md:72`
- `docs/architecture/plugin-system-phase9-extension-assessment.md:246`
- `docs/blueprint/01-platform-inventory.md:32`
- `docs/blueprint/04-evidence-matrix.md:39`
- `docs/blueprint/05-decision-record-catalogue.md:42`
- `docs/site/extend/plugin-catalogue/README.md:30`
- `docs/site/extend/plugin-catalogue/kubeclaw.review.md:1`
- `docs/site/extend/plugin-catalogue/kubeclaw.review.md:5`
- `docs/site/extend/plugin-catalogue/kubeclaw.review.md:6`
- `docs/site/extend/plugin-catalogue/kubeclaw.review.md:86`
- `docs/site/extend/plugin-catalogue/kubeclaw.review.md:93`
- `docs/site/extend/plugin-catalogue/kubeclaw.review.md:94`

## Offene Prüfpfade

Alle zwölf Kriterien des [Leitfadens](../README.md) sind offen. Implementierungen und Tests vollständig untersuchen, Sender und Empfänger vergleichen, bestehende Befunde neu belegen und Infrastrukturannahmen konkretisieren. Kein Fehlerfreiheits- oder Laufzeitnachweis.
