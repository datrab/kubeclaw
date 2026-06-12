# Documentation Coverage Audit - 2026-06-12

> Baseline note: this is the pre-enrichment coverage baseline from the start of the 2026-06-12 documentation work. Preserve the counts and findings below as historical baseline evidence only.
>
> Current/final documentation state is tracked in:
>
> - `docs/archive/audits/2026-06-12-documentation-coverage-matrix.md`
> - `docs/archive/audits/2026-06-12-documentation-topic-map.md`
> - `docs/archive/audits/2026-06-12-documentation-enrichment-changelog.md`
> - `docs/archive/audits/2026-06-12-adequate-depth-review.md`
>
> Later enrichment passes resolved the old `misleading`, `stale`, and `shallow` active-doc findings recorded here. The final matrix is the source of truth for current ratings, accepted `adequate` rationales, remaining limitations, and verification results.

## Scope and method

Scope: active documentation under `git-repo/kubeclaw-main/docs/*`, excluding `git-repo/kubeclaw-main/docs/archive/*`. README files outside `docs/` were inspected as supporting context, but only files under active `docs/` are required in the coverage matrix.

Exact documentation inventory command:

```bash
find git-repo/kubeclaw-main/docs -type f -not -path 'git-repo/kubeclaw-main/docs/archive/*' | sort
```

Exact implementation-area discovery command:

```bash
find git-repo/kubeclaw-main -path 'git-repo/kubeclaw-main/.git' -prune -o -path 'git-repo/kubeclaw-main/docs/archive' -prune -o -type f \( -name '*.py' -o -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' -o -name '*.mjs' -o -name '*.cjs' -o -name '*.sh' -o -name '*.yml' -o -name '*.yaml' -o -name '*.toml' -o -name '*.json' -o -name 'Dockerfile*' -o -name 'Makefile' -o -name 'Chart.yaml' \) -print | sort
```

Exact tests/verification discovery command:

```bash
find git-repo/kubeclaw-main/tests -type f \( -name '*.mjs' -o -name '*.js' -o -name '*.ts' -o -name '*.md' -o -name '*.sh' \) | sort
```

Method: every in-scope documentation file was read or directly processed for title/headings, concrete path/config/env references, command references, risk words, and source-backed depth signals. Representative implementation, config, deployment, and verification files were then opened for each required topic before assigning coverage ratings. Ratings follow the requested rule: high-level but accurate pages are `shallow`, not stale; stale/misleading is reserved for source conflicts or obsolete active-control docs.

## Baseline docs inventory count

- In-scope active docs files: 138
- In-scope active Markdown files: 121
- In-scope active SVG files: 7
- In-scope active JSON files: 10
- Supporting README files inspected outside `docs/archive`: 41
- Depth counts: adequate: 62, misleading: 1, rich: 24, shallow: 48, stale: 3
- Priority counts: P0: 1, P1: 27, P2: 86, P3: 24

These are baseline counts. They intentionally do not reflect the later enriched matrix.

## Exact implementation areas inspected

- Documentation inventory and checks: scripts/docs-check.mjs; scripts/docs-generate.mjs; scripts/docs-inventory.mjs; .github/workflows/docs-checks.yaml; tests/verification/behavior/areas/docs-surface.mjs
- Deployment scripts and Helm/Kubernetes surface: scripts/deploy.sh; my-values/setup-secrets.sh; charts/kubeclaw/values.yaml; charts/kubeclaw/templates/deployment.yaml; charts/kubeclaw/templates/rbac.yaml; charts/kubeclaw/templates/service.yaml; charts/kubeclaw/templates/secret.yaml; my-values/infra/network-policies.yaml; tests/verification/deployment/check-deployment-truth.mjs
- Nova pipeline runtime/config/state/recovery: skills/nova/pipeline/cli.ts; skills/nova/pipeline/core/config.ts; skills/nova/pipeline/runners/pipeline-runner.ts; skills/nova/pipeline/runners/pipeline-runner-loop.ts; skills/nova/pipeline/runners/module-runner.ts; skills/nova/pipeline/runners/module-runner/attempt.ts; skills/nova/pipeline/services/status-store.ts; skills/nova/pipeline/services/status-store-lifecycle.ts; skills/nova/pipeline/services/artifact-bundle.ts; skills/nova/pipeline/services/failures/retry-policy.ts
- Buster worker/task/suite runtime: skills/buster/buster-pipeline.ts; skills/buster/pipeline/services/task-queue.ts; skills/buster/pipeline/services/task-validation.ts; skills/buster/pipeline/services/task-completion.ts; skills/buster/pipeline/runners/suite-runner.ts; skills/buster/pipeline/services/runtime-policy.ts
- Shared runtime, telemetry, Redis, observer plugin: skills/common/pipeline/telemetry.ts; skills/common/pipeline/redis-transport.ts; skills/common/pipeline/services/telemetry/payload-schema.ts; skills/common/pipeline/services/task-transport-contract.ts; plugins/openclaw-agent-observer/src/index.ts; plugins/openclaw-agent-observer/src/agent-observability/mapping.ts
- Tests and verification harness: tests/README.md; tests/verification/README.md; tests/verification/behavior/verify.mjs; tests/verification/contracts/README.md; tests/verification/run-fast-verification.sh; tests/verification/runtime/check-nova-startup-smoke.mjs; tests/verification/runtime/check-buster-startup-smoke.mjs
- README scope outside docs: README.md; docs/README.md; docs/architecture/README.md; docs/concepts/README.md; docs/decisions/README.md; docs/deployment/README.md; docs/developers/README.md; docs/diagrams/README.md; docs/examples/README.md; docs/examples/progress-json/README.md; docs/examples/secrets/README.md; docs/examples/swarm-config/README.md; docs/examples/values/README.md; docs/generated/inventory/README.md; docs/generated/reference/README.md; docs/getting-started/README.md; docs/operators/README.md; docs/pipeline/README.md; docs/reference/README.md; skills/buster/README.md; skills/nova/pipeline/README.md; skills/nova/pipeline/services/contracts/README.md; tests/README.md; tests/verification/README.md; tests/verification/behavior/README.md; tests/verification/behavior/areas/README.md; tests/verification/contracts/README.md; tests/verification/deployment/README.md; tests/verification/lib/README.md; tests/verification/runtime/README.md

## Summary of strongest docs

- `docs/pipeline/end-to-end-flow.md`, `docs/pipeline/progress-json.md`, `docs/pipeline/technical-implementation-map.md`, `docs/pipeline/modules-and-gates.md`, and `docs/pipeline/workers-and-buster.md` are rich: they name concrete runtime files, state values, Redis/task/artifact boundaries, and recovery behavior.
- `docs/deployment/setup-flow.md`, `docs/deployment/secrets.md`, `docs/deployment/infrastructure.md`, and `docs/deployment/agent-deployments.md` are strong operator-facing pages with commands, environment variables, generated inventory links, and common failures.
- Generated references under `docs/reference/` are useful because `scripts/docs-generate.mjs` writes them from `scripts/deploy.sh`, `my-values/setup-secrets.sh`, and Helm/value inventories.
- The docs workflow/conventions pages are explicit about source-backed writing and separation of current behavior from target state.

## Summary of weakest docs

- Several index pages are intentionally shallow: `docs/architecture/README.md`, `docs/concepts/README.md`, `docs/decisions/README.md`, `docs/pipeline/README.md`, and multiple example READMEs mainly route readers elsewhere.
- `docs/deployment/persistent-storage.md` is too thin for an operator topic: it does not enumerate the retained config PVC, workspace PVC, Buster Podman emptyDir, sandbox/results paths, run artifacts, backup/restore implications, or verification commands.
- `docs/operators/security-operations.md` is shallow for a security operations page: it lacks concrete checks for secrets, RBAC, NetworkPolicy, privileged Buster, NodePorts, config PVC placeholder hygiene, and evidence capture.
- `docs/future-implementation-ideas.md` is placeholder-light even though several current docs link to it for Kubernetes-native observability and future hardening ideas.
- `docs/open-issues.md` contains useful active issues but is long and mixes resolved history with current limitations, making it weak as an operator limitations surface.

## Stale or misleading documentation findings

Resolution status: these findings were addressed by later enrichment passes. Keep the bullets below as the historical reason the enrichment work started, not as active defects.

- P0: `docs/architecture/system-overview.md` states that missing NetworkPolicies are tracked in open issues. Current source has `my-values/infra/network-policies.yaml`, `scripts/deploy.sh` applies and deletes that manifest, and `tests/verification/deployment/check-deployment-truth.mjs` asserts exactly 13 NetworkPolicies plus selectors/ports. This is misleading and should be fixed before architecture enrichment.
- Supporting README finding: root `README.md` says the repository does not currently include NetworkPolicy manifests. It is outside the required docs matrix but is a README and conflicts with `my-values/infra/network-policies.yaml` and deployment verification.
- P1: `docs/DOCUMENTATION_AUDIT.md` is now historical/stale as an active audit. It says generated output is excluded from the audit and lists several pages as missing that now exist.
- P1: `docs/DOCUMENTATION_REBUILD_PLAN.md` remains useful background, but it reads like an active rebuild tracker even though much of the target tree is now present. It should be updated as a maintenance plan or archived as historical.
- P2: `docs/DOCUMENTATION_TARGET_PAGE_LIST.md` still says example/generated directories are planned targets; many of those pages and generated references now exist.

## Missing documentation findings

Resolution status: later enrichment passes added or expanded current docs for these gaps where source-backed behavior existed. Remaining source limitations are tracked in the current changelog and topic map.

- No single current limitations page summarizes source-backed limitations after the NetworkPolicy change. Readers must infer from `open-issues.md`, `future-implementation-ideas.md`, architecture pages, and README.
- No compact service/module ownership table maps each major service to source files, config keys, runtime artifacts, and tests.
- No operator storage runbook covers retained config/workspace PVCs, Buster sandbox/Podman storage, artifact locations, backup/restore, and failure/recovery checks.
- No unified config validation table enumerates required `swarm.config.json` objects and the project `progress.json` boundary from `skills/nova/pipeline/core/config.ts`.
- No claim-to-test matrix maps high-value docs claims to exact behavior/contract/deployment verification files.
- Extension docs do not yet give fully executable recipes for plugin hooks, custom modules/gates, observability sinks, and Buster suite additions with exact tests to add.

## High-priority enrichment targets

Resolution status: these targets were consumed by the enrichment matrix/changelog. Use the current matrix and changelog before reopening any item from this baseline list.

- P0: fix NetworkPolicy source conflicts in `docs/architecture/system-overview.md` and root `README.md`.
- P1: expand `docs/deployment/persistent-storage.md` and `docs/operators/security-operations.md` from current chart/scripts/runtime source.
- P1: add a current service/module ownership table to `docs/architecture/component-map.md` or a new architecture reference.
- P1: enrich `docs/pipeline/failure-and-recovery.md`, `docs/operators/recovery-runbook.md`, and `docs/operators/common-failures.md` with session identity recovery, Buster terminal-before-ACK, malformed dead-letter, and weak evidence behavior.
- P1: add config validation details to `docs/pipeline/configuration.md` and `docs/reference/swarm-config.md` from `core/config.ts`.
- P1: create a claim-to-test mapping under developer or reference docs using `tests/verification/**` and `package.json` scripts.

## Risks and open questions

- Root README is outside the docs matrix but within README scope; correcting it should be included in the next pass even though the main docs should not be rewritten by this audit.
- The audit inspected representative implementation files, not every source file in the repository. The enrichment plan names exact files to inspect before editing each package.
- `docs/open-issues.md` is a mixed tracker. A future pass should decide whether resolved history remains active docs or should be archived/split.
- Generated references currently cover deployment/script inventory slices. They do not yet fully generate Nova CLI, Buster CLI, pipeline config validation, or every suite input from source.
- Live cluster behavior remains only partially source-verified; current docs correctly avoid promising a complete five-minute live install.

## Final recommended next-pass order

1. Correct misleading NetworkPolicy claims in active README/architecture surfaces.
2. Enrich storage and security operations docs because they are operator-critical and shallow.
3. Add service/module ownership and config validation tables.
4. Enrich failure/recovery and observability docs with exact authority/evidence behavior.
5. Build claim-to-test mapping and verification reference improvements.
6. Update or archive stale meta-docs so future docs work does not follow old target lists.
7. Expand developer extension workflows with executable examples and required tests.

## Verification status

Verification commands run after artifact creation:

```bash
npm run docs:check
node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"
git diff --check
```

Results:

- `npm run docs:check` passed. Output included `docs inventory is current`, `generated reference docs are current`, and `docs check passed (121 active markdown files)`.
- `node tests/verification/deployment/check-deployment-truth.mjs --source-root "$PWD"` passed. It reported 64 deployment checks, valid kubeconform summaries for Nova, Buster, NetworkPolicy, and local infra manifests, including 13 valid NetworkPolicy resources.
- `git diff --check` passed with no whitespace errors.
