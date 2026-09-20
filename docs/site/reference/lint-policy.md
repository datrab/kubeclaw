# Lint Policy Reference

Status: implemented
Audience: lint-policy maintainer, operator, Nova maintainer
Owner: lint
Evidence: charts/kubeclaw/files/config/lint-policy.json; charts/kubeclaw/files/config/lint-baseline.json; charts/kubeclaw/files/config/kubernetes-policy-pack-default.json; skills/nova/plugins/lint/src/engine
Evidence revision: `32b02816cc19cc8865a45b221b8b6ca28e99e8fb`
Applies to: `pipeline_lint_policy.v7`, `pipeline_lint_baseline.v2`, `kubernetes_lint_policy_pack.v1`, `pipeline_lint_report.v7`
Last verified: source, configuration, and focused package checks on 2026-09-20; live fixture blocked before lint by BusyBox flock

## Purpose

This page defines the complete shipped lint-policy surface. The policy binds
project discovery, targets, tool settings, governance records, and immutable
Kubernetes rule packs. The engine rejects an invalid policy before it runs a
tool. A partly valid policy cannot produce an authoritative-looking report.

Use the [generated policy facts](lint-policy-generated.md) for every exact
shipped value. Use the [rule and finding reference](lint-rules.md) for triggers,
exceptions, remediation, and error codes. Use [Extend Lint](../extend/lint.md)
for change procedures.

> **Canonical evidence:** [The shipped policy contains the project, 31 tools,
> exclusions, architecture, admission, baseline, and pack selection](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/kubeclaw/files/config/lint-policy.json#L1-L1070).
> [The loader validates all parts and calculates policy, config, and pack digests](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/policy.ts#L234-L273).

## Contracts And Versions

| Document | Required version | Purpose |
| --- | --- | --- |
| Policy | `pipeline_lint_policy.v7` | Select the project, tools, scopes, paths, governance, and packs. |
| Baseline | `pipeline_lint_baseline.v2` | Record approved, time-bounded existing findings. |
| Kubernetes pack | `kubernetes_lint_policy_pack.v1` | Supply declarative rules with immutable identity. |
| Report | `pipeline_lint_report.v7` | Preserve results and the identity of policy inputs. |

The engine accepts only the current policy version. It does not upgrade an old
document. A version can change gate meaning, so an implicit conversion would be
unsafe.

> **Version evidence:** [The policy version is fixed here](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/policy-version.ts#L1),
> and [the report version and vocabularies are fixed here](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/report-contract.ts#L3-L8).

## Loading, Precedence, And Authority

Lint has no policy merge chain. The stage supplies one `policyPath` and one
`policyProject`. The adapter admits the repository and policy through separate
operator-owned root lists. The engine loads exactly that policy and selects the
named project.

The effective order is:

1. Stage configuration supplies the policy path, project ID, and visibility flags.
2. Adapter configuration admits canonical repository and policy roots.
3. The engine loads the policy, referenced baseline, native configs, and packs.
4. Invocation input can replace only Kubernetes raw-manifest and chart lists.
5. `changedFiles` and `modulePath` narrow work according to each tool's scope.

An invocation cannot replace packs, limits, schema location, tools, severity, or
policy. This prevents repository input from granting itself new checks or authority.

> **Flow evidence:** [The stage builds the request](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/stage.ts#L56-L81),
> [the adapter enforces both roots](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/adapter.ts#L10-L50),
> and [the engine applies only the bounded Kubernetes override](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/index.ts#L34-L57).

### Deployment And Persistent-Config Precedence

The runtime has a delivery chain before policy loading. Helm builds a ConfigMap.
An init container copies files through a persistent config volume. The runtime
then reads its copies from the runtime-config directory.

`semgrepConfigYaml` and `eslintConfigMjs` can replace the chart defaults. With
`swarmConfig.overrideOnRestart=false`, an existing persistent Semgrep or ESLint
file wins over a later chart value. This default preserves runtime-owned edits.
It also means that a chart upgrade does not prove those two files changed.

The init container overwrites the other lint configs, baseline, and policy from
the chart source on each restart. `jscpd-tests.json` follows this overwrite path
even though it is an implicit JSCPD companion.

The chart does not currently deliver `kubernetes-policy-pack-default.json` to
the persistent or runtime config directory. The shipped policy references that
relative file. Therefore, the deployed policy loader stops with
`LINT_POLICY_INVALID` before it runs a tool unless an operator supplies the pack
beside `lint-policy.json`. The repository fixture copies the pack explicitly,
but the live-function fixture removes all pack references. Neither test proves
the current chart delivery path.

Treat this as an implementation gap, not an operator workaround. Do not claim a
successful deployed full run until the ConfigMap and both copy stages deliver
the pack and a chart-level test proves the final runtime path.

Use the report's policy and explicit config digests to identify most effective
runtime inputs. Inspect persistent `jscpd-tests.json` and the installed
type-evidence plugin separately. Their digests are not in `config_digests`.

To adopt a new Semgrep or ESLint chart value, set
`swarmConfig.overrideOnRestart=true` for the controlled restart. Verify the
effective digest and findings. Return the value to `false` when later runtime
preservation remains required.

For rollback, restore the earlier reviewed chart value or persistent file. Then
restart with the matching overwrite choice. A previous report identifies the
old digest, but it is not proof that rollback completed.

> **Delivery evidence:** [Helm values define both overrides and restart behavior](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/kubeclaw/values.yaml#L469-L498).
> [The ConfigMap selects override or packaged content](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/kubeclaw/templates/configmap-swarm-config.yaml#L10-L49).
> [The init container preserves only existing Semgrep and ESLint files when overwrite is false](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/kubeclaw/templates/deployment.yaml#L622-L696).
> [The live fixture removes pack references](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/tests/live-function.test.ts#L15-L22),
> while [the manifest fixture copies pack bytes explicitly](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/tests/verification/contracts/support/manifest-lint-parity-fixture.mts#L122-L128).

## Stage And Adapter Configuration

| Field | Required | Exact meaning |
| --- | --- | --- |
| `policyPath` | Yes | Canonical policy path; the adapter must admit it. |
| `policyProject` | Yes | Exact `projects[].id`; an unknown ID fails. |
| `includeDebt` | No; effective default `false` | Disclose baselined finding bodies. Debt counts remain present. |
| `includeExperimental` | No; effective default `false` | Run and disclose experimental tools. They remain nonblocking. |
| `allowedRepositoryRoots` | Adapter: yes, non-empty and unique | Canonical trees that lint may inspect. |
| `allowedPolicyRoots` | Adapter: yes, non-empty and unique | Canonical trees from which lint may load policy. |

Schema defaults are annotations. The stage also uses `=== true`, so absent
visibility flags are false even if the host does not insert defaults.

> **Schema evidence:** [Stage configuration](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/schemas/config.schema.json)
> and [adapter configuration](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/schemas/adapter-config.schema.json) are closed objects.

## Invocation Input

| Field | Rule and effect |
| --- | --- |
| `workingDirectory` | Required non-empty repository path under an admitted root. |
| `project` | Optional report label. It does not select policy. |
| `modulePath` | Optional relative scope. Absolute and escaping paths fail. |
| `changedFiles` | Optional unique relative paths. Valid deleted leaves are ignored during scope resolution. |
| `sourceStageId` | Optional runtime source selector; mutually exclusive with `revision`. |
| `revision` | Optional full lowercase 40-character SHA; runs in a detached temporary checkout. |
| `kubernetes` | Optional override object. When present, it must contain both arrays below. Their combined content must not be empty. |
| `kubernetes.rawManifests` | Required inside `kubernetes`; at most 256 paths; replaces the project list for this call. |
| `kubernetes.helmCharts` | Required inside `kubernetes`; at most 256 paths; replaces the project list for this call. |

The candidate runner disables Git hooks, verifies detached `HEAD`, and removes
the temporary checkout. The stage rejects a response bound to another revision.

> **Input evidence:** [The input schema closes the shape](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/schemas/input.schema.json),
> and [candidate execution verifies source identity](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/candidate.ts#L6-L26).

## Project Fields

The contract currently requires exactly one project. The validator contains no
recorded reason for this limit. Treat the historical reason as unknown, not as
an established architecture decision. The limit gives the current deployment
one unambiguous project inventory, but it also prevents one policy file from
serving multiple repository roots. This benefit-and-cost statement is an
inference from current behavior.

The execution request already selects a project by ID. Therefore, a future
multi-project change must first define why one shared policy is preferable to
separate policy files. It must then change validation, schema and negative tests,
generated facts, deployment configuration, and cross-project scope tests. It
must also define whether baseline, rule admission, architecture layers, and
policy packs remain policy-wide. Until lint maintainers accept that contract and
tests prove it, the runtime rejects additional projects instead of silently
ignoring them.

> **Project-count evidence:** [Policy validation rejects every project count
> other than one](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/policy.ts#L234-L240).
> [Project selection still uses the requested ID](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/policy.ts#L276-L279),
> and [the stage supplies that ID](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/stage.ts#L64-L72).

| Field | Validation and meaning |
| --- | --- |
| `id` | Non-empty selection identity. |
| `root` | Repository-relative project root. |
| `languages` | Values from `javascript`, `typescript`, `python`, `shell`, `docker`, `helm`, `yaml`, `go`, `terraform`. |
| `language_evidence` | Non-empty marker list for each enabled language; no entry for a disabled language. |
| `discovery_max_depth` | Non-negative marker-search depth. |
| `go.modules` | Module file, packages, build tags, and allowed imports; non-empty when Go is enabled. |
| `terraform.roots` | Canonical roots; non-empty when Terraform is enabled. |
| `terraform.provider_mirror` | Absolute local path; required for Terraform. |
| `kubernetes.raw_manifests` | Unique project-relative manifest files. |
| `kubernetes.helm_charts` | Unique project-relative chart directories. |
| `kubernetes.policy_packs` | Unique IDs from loaded operator-approved packs. |
| `kubernetes.kubernetes_version` | Full `major.minor.patch`. |
| `kubernetes.schema_location` | Absolute local schema template; network locations are forbidden. |
| `kubernetes.limits` | Positive bounds for files, file bytes, rendered bytes, and documents. |

When the whole Kubernetes object is absent, defaults are 128 files, 1 MiB per
file, 10 MiB rendered content, and 2,048 documents. Configured hard maxima are
128 files, 16 MiB per file, 64 MiB rendered content, and 100,000 documents.

The shipped workspace project names
`Projects/buster-infra-smoke/src/deployment.yaml`. The deployed workspace creates
that input; a clean source checkout does not contain it. A source-only engine run
must pass an explicit Kubernetes input override, such as the source-owned
`charts/kubeclaw` chart, and must use the Nova image for its pinned schema tree.
That override proves the selected source input only. Deployment acceptance must
run with the generated manifest and the canonical input list.

> **Project evidence:** [Project validation defines vocabulary, defaults,
> authorities, and bounds](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/policy.ts#L29-L123).

## Discovery, Targets, And Scopes

Discovery scans only to `discovery_max_depth`, skips hidden directories and
`node_modules`, applies global exclusions, and matches language evidence. It can
detect several languages. Discovery does not grant filesystem access.

Policy-selected files combine `targets`, `include`, tool `exclude`, and
`global_exclusions`. Type-evidence classification intentionally uses only Git,
Swarm, and dependency-tree exclusions. It must still see generated or untracked
files. Native recursive tools also apply their own configuration exclusions.

Target trees are checked for repository escape and symlinks. `.git` is excluded
from this security walk. This separate check is necessary because a native tool
can traverse files that normal discovery excludes.

| Scope | Effective behavior |
| --- | --- |
| `changed-files` | Use matching requested changes. No match gives `not_applicable`. A changed policy, baseline, or native config expands to project scope. |
| `affected-projects` | Use changes for relevance, then run at project scope. |
| `project` | Ignore the requested file subset and run at the selected project root. |
| `repository` | Ignore module and changed-file narrowing and use repository targets. |

Input priority is changed files, then module, then full repository. Tool scope can
intentionally widen the actual execution.

> **Scope evidence:** [Discovery and input priority](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/discovery.ts#L138-L220),
> [tool-scope application](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/report.ts#L67-L102),
> and [native target validation](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/policy-paths.ts#L43-L74) implement these rules.

## Tool Fields

Every tool has a unique `id`, Boolean `required`, positive `timeout_ms`, and these
closed vocabularies:

- category: `format`, `lint`, `types`, `architecture`, `duplication`, `security`,
  `dependencies`, or `manifests`;
- scope: `changed-files`, `affected-projects`, `project`, or `repository`;
- tier: `pre-check` or `full`;
- blocking severity: `warning` or `error`;
- languages: zero or more supported language IDs.

It can also define `config_path`, `arguments`, `targets`, `include`, and `exclude`.
Config paths resolve relative to the policy directory. A required tool's native
config must exist. Semgrep alone receives target `.` when its list is empty.

The registry is closed in both directions. Each policy ID needs an adapter, and
each installed adapter needs a policy entry.

> **Registry evidence:** [The registry rejects both mismatch directions](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/tool-registry-core.ts#L105-L129).

## Complete Tool Inventory

“Pre” runs in pre-check and full. “Full” runs only in full.

| Tool | Tier | Scope | Responsibility |
| --- | --- | --- | --- |
| `tsc` | Pre | affected projects | TypeScript compiler diagnostics. |
| `gofmt` | Pre | changed files | Go formatting. |
| `go-vet` | Pre | affected projects | Go vet diagnostics. |
| `shellcheck` | Pre | changed files | Shell correctness and safety. |
| `shfmt` | Pre | changed files | Shell formatting. |
| `ruff` | Pre | changed files | Python lint. |
| `terraform-fmt` | Pre | changed files | Terraform formatting. |
| `gocyclo` | Full | affected projects | Go function complexity. |
| `eslint` | Full | changed files | Blocking JavaScript and TypeScript rules. |
| `eslint-type-evidence-production` | Full | repository | Nonblocking production type-evidence audit. |
| `eslint-type-evidence-tests` | Full | repository | Nonblocking test and fixture audit. |
| `eslint-type-evidence-generated` | Full | repository | Nonblocking generated/untracked audit. |
| `knip` | Full | repository | Unused files, dependencies, and exports. |
| `dependency-cruiser` | Full | project | Forbidden and circular dependencies. |
| `jscpd` | Full | repository | Structural duplication. |
| `mypy` | Full | project | Python types. |
| `go-imports` | Full | affected projects | Go import boundaries. |
| `staticcheck` | Full | affected projects | Go static analysis. |
| `govulncheck` | Full | affected projects | Reachable Go vulnerabilities. |
| `terraform-validate` | Full | project | Terraform initialization and validation. |
| `tflint` | Full | project | Terraform lint rules. |
| `trivy-terraform` | Full | project | Terraform security. |
| `semgrep` | Full | changed files | Curated security and correctness patterns. |
| `hadolint` | Full | changed files | Dockerfile checks. |
| `helm-lint` | Full | project | Helm chart lint. |
| `kubeconform` | Full | project | Kubernetes schema validation. |
| `kubernetes-policy` | Full | project | Selected immutable policy-pack rules. |
| `kubernetes-schema` | Full | project | Explicit-input validation against the configured offline Kubernetes schema. |
| `trivy-kubernetes` | Full | project | Rendered Kubernetes security. |
| `yamllint` | Full | changed files | YAML checks outside Helm templates. |
| `openapi-contract` | Full | project | OpenAPI shape and reference checks. |

External tools can produce version-specific codes. The engine preserves them.
The next sections summarize the repository-owned rule groups. The
[rule and finding reference](lint-rules.md) is the canonical detailed catalogue.

The inventory above identifies every tool. It is not the exact configuration
table. The [generated tool settings](lint-policy-generated.md#tool-execution-settings)
record every required flag, timeout, threshold, language, native config,
argument, target, include pattern, and exclusion directly from policy.

> **Inventory evidence:** [The policy holds all 31 exact settings](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/kubeclaw/files/config/lint-policy.json#L131-L1070),
> and [the registry imports all implementation families](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/tool-registry.ts#L1-L18).

### Why The Tool Settings Differ

The repository has no decision record for each tier, scope, timeout, or target.
The explanations below are current inferences from the implementation. They are
not claims about the original design discussion.

| Choice | Current inferred reason | Cost and reconsideration condition |
| --- | --- | --- |
| All shipped tools are required. | A missing analyser removes promised coverage, so absence must not look clean. | One missing binary blocks the stage. Reconsider only when the tool is explicitly optional and the report exposes that reduced assurance. |
| Pre-check contains the faster format, type, and basic lint tools. | Early feedback should reject cheap defects before the larger repository checks run. | A slow pre-check delays every cycle. Move a tool only after measured runtime and coverage analysis. |
| Full includes pre-check and adds expensive checks. | Final acceptance must retain early checks and add repository-wide evidence. | Work repeats across tiers. Reconsider when shared, revision-bound results can be reused without weakening identity. |
| Changed-file scope is used for file analysers. | The tool can produce a trustworthy result from the selected files. | It can miss cross-file effects. Use project or repository scope when analyser meaning depends on other files. |
| Affected-project scope is used for TypeScript and Go. | Their compilers and package tools need a complete owned project or module. | More work runs than a file-only check. Narrow it only when dependency-aware selection remains complete. |
| Project or repository scope is used for graphs, duplication, manifests, and contracts. | These checks compare relationships or discover inputs across a declared boundary. | They cost more and can produce broad findings. Narrow them only with a tested completeness rule. |
| Timeouts are 30, 60, or 120 seconds. | The bands separate file tools, project tools, and repository or security tools. | A fixed timeout can fail on a larger valid project. Change it only with retained duration evidence and cleanup tests. |
| Targets and exclusions are explicit. | Native tools can traverse beyond ordinary discovery, so policy must bound their input independently. | Every exclusion can hide debt. Add one only with a named ownership reason and a negative test. |

These choices should change when measured cost, project size, or analyser
semantics invalidate the current boundary. A settings change must preserve the
failure, report, and authority contracts described on this page.

## Native Configuration Decisions

The policy selects a native configuration path. The native file owns detailed
rules that belong to that analyser. The report records explicit config-path
digests, so a changed explicit config changes report identity.

The repository has no decision record for each native threshold and exclusion.
The rationale below is an inference from current behavior and maintenance cost.
The lint owner must review it when a value changes.

| Configuration | Effective choice | Inferred current rationale and consequence |
| --- | --- | --- |
| `eslint.config.mjs` | Production limits, typed rules, seven local discipline rules, and named boundary exemptions. | One file keeps a rule beside its legitimate boundaries. An exemption is visible and reviewable instead of hidden in source comments. |
| `eslint-type-evidence-config.mjs` | Seven syntax rules cover production TypeScript. One typed rule covers project-owned files and 12 declared default-project files. | Syntax rules retain broad coverage. The expensive typed rule runs only where TypeScript project ownership is known. |
| `eslint-type-evidence-tests-config.mjs` | Seven experimental rules inspect tests and fixtures without the typed assertion rule. | Tests remain visible without pretending that each test file has production project ownership. |
| `eslint-type-evidence-generated-config.mjs` | Seven syntax rules inspect generated or otherwise untracked files. | This partition exposes weak type evidence without loading untrusted project metadata. |
| `type-evidence-eslint-plugin.mjs` | Seven local rule implementations are imported by all three type-evidence configs. | One implementation keeps their meaning consistent across partitions. It is an implicit behavior source, not a policy `config_path`. |
| `.semgrep.yml` | Twenty-five warning rules cover JavaScript, TypeScript, and Python security boundaries. Individual rules own narrow path exclusions. | Curated local patterns make the accepted security boundary reviewable. The blocking threshold makes every emitted warning actionable. |
| `knip.json` | Declared workspaces, entry points, project files, ignored generated paths, tool binaries, and known runtime-only dependencies. | Knip needs real entry points to distinguish dead code from convention-based loading. Every ignore can hide debt, so changes require consumer evidence. |
| `jscpd.json` | Production clones need at least 70 tokens and 10 lines. Generated, dependency, coverage, vendor, and test trees are excluded. | The production threshold finds structural duplication while avoiding generated copies and small incidental phrases. |
| `jscpd-tests.json` | Test clones need at least 100 tokens and 18 lines. Generated, dependency, coverage, and build trees are excluded. | Repeated test setup is often useful. The higher threshold reports only larger copied test structures. |
| `.tflint.hcl` | The Terraform plugin uses its recommended preset. | The project delegates general Terraform rule selection to the pinned analyser instead of maintaining a partial local copy. |
| `.yamllint.yml` | The default profile remains active, but document start, braces, colons, comment indentation, and line length are disabled. Truthy values accept only `true` and `false`. | YAML structure remains checked while Helm-style and compact configuration syntax avoid formatting-only noise. Boolean spelling stays unambiguous. |

JSCPD always runs twice. It applies production calibration to normal configured
targets and test calibration to `tests`. A missing calibration file is an
execution error, not an empty result.

The shipped project has no Terraform roots. Its Terraform tools are therefore
not applicable today. Their configuration remains a supported contract for a
project that declares a root and an offline provider mirror.

> **Native-config evidence:** [JSCPD requires and runs both calibrations](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/architecture-tools.ts#L242-L276).
> [Policy loading digests each explicit `config_path`](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/policy.ts#L234-L273).
> Exact settings remain in [Knip](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/kubeclaw/files/config/knip.json),
> [production JSCPD](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/kubeclaw/files/config/jscpd.json),
> [test JSCPD](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/kubeclaw/files/config/jscpd-tests.json),
> [TFLint](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/kubeclaw/files/config/.tflint.hcl),
> and [yamllint](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/kubeclaw/files/config/.yamllint.yml).

`jscpd-tests.json` and `type-evidence-eslint-plugin.mjs` are implicit behavior
sources. The engine requires or imports them, but the report does not include
their digests in `config_digests`. Treat this as an evidence limit when a
duplication or type-evidence result changes.

### Runtime Binary And Version Authority

Policy selects behavior, but the Nova image supplies the executable versions.
`versions.json` is the reviewed root for pinned build arguments. Python wheel
locks, Go module locks, the Nova npm lock, and checksum-verified downloads bind
the resolved tools. `npm run versions:check` verifies these authorities.

Node-based tools such as ESLint, Knip, JSCPD, TypeScript, and Dependency
Cruiser come from `docker/nova-tools/package-lock.json`. Ruff, Mypy, and Semgrep
come from hashed Python locks. Staticcheck, Govulncheck, and Gocyclo come from
the Go lock. Hadolint, shfmt, Terraform, TFLint, Trivy, Helm, and Kubeconform use
versioned and checksum-verified downloads.

ShellCheck and yamllint come from the dated Debian snapshot. Their package
versions are not separate policy fields. The immutable image digest is the
effective deployed identity for those packages.

> **Version evidence:** [The canonical build arguments name the current tool versions](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/versions.json#L7-L51).
> [The Nova image verifies Python, Go, and downloaded analyser versions](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/docker/Dockerfile.nova#L72-L216).

## Tool Execution Contracts

The [generated applicability table](lint-policy-generated.md#shipped-full-run-applicability)
separates eligible, dormant, opt-in, and replaced paths. The table below explains
what each adapter does after selection.

| Tool | Execution and result contract |
| --- | --- |
| `tsc` | Finds affected TypeScript configurations and runs `tsc --noEmit`. It preserves `TS` diagnostics and rejects an unstructured failing result. |
| `gofmt` | Runs `gofmt -l` on selected Go files. Each returned filename becomes `go-format`. No matching Go file is not applicable. |
| `go-vet` | Runs configured packages in each affected Go module. It normalizes parsed file diagnostics to `go-vet`. |
| `gocyclo` | Checks affected Go modules with maximum complexity 10. It creates a stable seed from package, function, and file identity. |
| `shellcheck` | Runs selected shell files in JSON mode at warning severity. It preserves `SC` codes and rejects an unexplained nonzero exit. |
| `shfmt` | Runs one format diff per selected shell file. Exit one with a diff is a finding; another nonzero exit is a parse failure. |
| `ruff` | Runs JSON lint on changed Python files or selected scope. Fixable findings become warnings; other findings become errors. |
| `eslint` | Runs the blocking flat config on changed matching files or configured targets. It preserves rule IDs and stable occurrence seeds. |
| `eslint-type-evidence-production` | Classifies tracked production files and runs the production audit config. It is experimental and repository-scoped. |
| `eslint-type-evidence-tests` | Classifies tests and fixtures, then runs their syntax-only audit config. It is experimental and repository-scoped. |
| `eslint-type-evidence-generated` | Classifies generated or untracked files, then runs syntax-only audit rules. It is experimental and repository-scoped. |
| `knip` | Runs the declared workspace model and requests six active issue categories. It converts each issue to a `knip:<category>` finding. |
| `dependency-cruiser` | Builds the configured module graph without following dependencies. It reports forbidden layer edges and strongly connected cycles. |
| `jscpd` | Runs production and test calibrations into temporary reports. It joins both duplicate lists and removes the temporary directories. |
| `mypy` | Runs JSON output on the selected Python scope. It preserves the error code and treats output without valid findings as a parse failure. |
| `go-imports` | Uses `go list -json` for each affected module. It rejects external imports outside the module's approved prefixes. |
| `staticcheck` | Reads a JSON stream for configured Go packages. It preserves Staticcheck codes, locations, severity, and messages. |
| `govulncheck` | Reads pinned JSON-stream output and reports reachable OSV findings. Any nonzero exit is operational failure in this mode. |
| `terraform-fmt` | Runs recursive format checks for affected declared roots. It is dormant while the shipped project has no Terraform root. |
| `terraform-validate` | Requires the offline mirror and committed lock file. It initializes without backend or downloads, then validates JSON output. |
| `tflint` | Runs the recommended native config in every declared Terraform root. It preserves rule name and severity. |
| `trivy-terraform` | Requests high and critical Terraform misconfigurations without online updates. It rejects nonzero output without parsed issues. |
| `semgrep` | Runs the curated config without metrics or version checks. Execution errors are not findings and block as tool failure. |
| `hadolint` | Runs JSON output once per selected Dockerfile. It preserves Hadolint codes and source-line identity for stable fingerprints. |
| `helm-lint` | Runs strict Helm lint for every discovered chart. It normalizes only explicit error and warning lines. |
| `kubeconform` | Validates discovered Helm charts only when no explicit Kubernetes input exists. It uses the generic compatible schema path. |
| `kubernetes-policy` | Loads bounded raw and rendered resources. It applies selected immutable packs with namespace and service-account lookup. |
| `kubernetes-schema` | Validates configured raw manifests and charts against the pinned offline Kubernetes version and schema location. |
| `trivy-kubernetes` | Renders configured charts and scans Kubernetes misconfigurations. It preserves Trivy IDs and stable resource identity. |
| `yamllint` | Runs strict parsable output on selected YAML outside Helm templates. It normalizes diagnostics to `yamllint`. |
| `openapi-contract` | Inspects matching OpenAPI filenames internally. It checks syntax, version, paths, local references, operations, IDs, and responses. |

The engine runs selected tools sequentially in registry order. A failed tool
does not masquerade as a clean result. The engine continues to assemble tool
results unless cancellation rejects the invocation.

This sequential order applies inside one report only. The adapter has no mutex
that serializes separate invocations. Concurrent reports in one Nova process
share the module-level discovery-diagnostic queue, and each report drains that
queue. They also share native tool cache directories. As a result, concurrent
runs can attach a discovery diagnostic to the wrong report, and this repository
does not prove that every native cache supports concurrent writers.

Serialize lint stage invocations in one Nova process when report provenance is
acceptance evidence. Start the next run only after the first stage has stored its
artifact or returned its failure and process cleanup has completed. Separate CLI
runner processes do not share the in-memory diagnostic queue, but they can still
share the fixed cache root on one host. The
[roadmap](../status/roadmap.md#lint-concurrency-and-deployed-extension-acceptance)
defines the required isolation and concurrency proof. Until that work exists,
do not describe concurrent lint reports as isolated.

> **Concurrency evidence:** [The adapter tracks active promises without a
> serialization lock](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/adapter.ts#L28-L63).
> [Discovery uses one module-level queue](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/discovery.ts#L8-L40),
> and [native tools use one fixed cache root](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/execution.ts#L45-L71).

> **Execution evidence:** [Language adapters define TypeScript, Python, shell,
> and ESLint behavior](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/tool-registry-language-tools.ts#L20-L263).
> [Architecture adapters define graph, dead-code, and duplication behavior](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/architecture-tools.ts#L96-L284).
> [Go](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/go-tools.ts#L128-L312),
> [Terraform](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/terraform-tools.ts#L64-L187),
> and [container and YAML adapters](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/container-yaml-tools.ts#L22-L177) own their command contracts.

## Blocking ESLint Rules

| Rule | Production behavior | Test behavior |
| --- | --- | --- |
| `complexity` | Maximum 15 | Maximum 70 |
| `max-depth` | Maximum 3 | Maximum 6 |
| `max-lines` | Maximum 300 nonblank/noncomment lines | Maximum 2,000 |
| `max-lines-per-function` | Maximum 60 nonblank/noncomment lines | Maximum 650 |
| `max-params` | Maximum 7 | Maximum 12 |
| `no-async-promise-executor` | Not enabled | Enabled |
| `no-global-assign` | Enabled | Enabled |
| `no-useless-catch` | Enabled | Enabled |
| `no-var` | Enabled | Enabled |
| `no-console` | Require structured boundary | Not enabled |
| `@typescript-eslint/await-thenable` | Typed production sources | Not enabled |
| `@typescript-eslint/consistent-type-imports` | Prefer type imports | Not enabled |
| `@typescript-eslint/no-floating-promises` | Handle every promise | Not enabled |
| `@typescript-eslint/no-misused-promises` | Keep promises out of synchronous positions | Not enabled |
| `@typescript-eslint/switch-exhaustiveness-check` | Handle every union member | Not enabled |
| `discipline/filename-case` | Lowercase kebab-case | Enabled |
| `discipline/no-direct-env-access` | Environment reads only at named boundaries | Not enabled |
| `discipline/no-dynamic-module-loading` | Dynamic loading only at named loader boundaries | Not enabled |
| `discipline/no-env-default` | No hardcoded application fallback for environment values | Not enabled |
| `discipline/no-fallback-chain` | At most one nonboolean fallback | Not enabled |
| `discipline/no-swallowed-error` | Handle, rethrow, or document `INTENTIONAL_NONCRITICAL(...)` | Not enabled |
| `discipline/no-top-level-mutable-state` | Mutable state needs a lifecycle owner | Not enabled |

Named environment, dynamic-loader, and console exemptions are centralized in the
configuration. They identify authority boundaries instead of hiding exceptions
in source comments.

> **ESLint evidence:** [The configuration defines all rules, limits, file groups,
> and exemptions](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/kubeclaw/files/config/eslint.config.mjs#L255-L338),
> and [the seven discipline rules are implemented here](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/kubeclaw/files/config/eslint.config.mjs#L175-L253).

## Experimental Type-Evidence Rules

| Rule | Detects |
| --- | --- |
| `type-evidence/no-chained-type-assertions` | Certainty fabricated through a second assertion. |
| `type-evidence/no-known-value-widening` | Known object keys replaced with a broad dictionary. |
| `type-evidence/no-module-mocking` | Whole-module mocking instead of a dependency seam. |
| `type-evidence/no-object-parameters` | Broad `object` parameters. |
| `type-evidence/no-unknown-returns` | Unparsed `unknown` output contracts. |
| `type-evidence/no-unknown-type-aliases` | `unknown` concealed behind an alias. |
| `type-evidence/no-widen-then-assert` | A value widened and later asserted back. |
| `@typescript-eslint/no-unsafe-type-assertion` | Unsafe narrowing with project type information. |

Production, test/fixture, and generated/untracked tools partition eligible code.
Syntax rules need no TypeScript project. The official assertion rule runs only
where project type information exists. Experimental findings cannot block or
become debt.

> **Type-evidence evidence:** [The production configuration selects all eight
> rules and its typed file set](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/kubeclaw/files/config/eslint-type-evidence-config.mjs#L42-L84),
> and [the local plugin implements seven rules](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/kubeclaw/files/config/type-evidence-eslint-plugin.mjs#L226-L307).

## Curated Semgrep Rules

| IDs | Purpose |
| --- | --- |
| `no-eval`, `no-string-timer-code` | Dynamic code execution. |
| `no-shell-interpolation`, `no-subprocess-shell` | Shell injection surfaces. |
| `no-hardcoded-secrets` | Embedded credentials outside test data. |
| `no-raw-sql-outside-data-layer-js`, `no-raw-sql-outside-data-layer-py`, `no-sql-string-format` | SQL outside controlled data boundaries or built by interpolation. |
| `no-math-random-security`, `use-compare-digest` | Unsafe random values or secret comparisons. |
| `no-prototype-pollution`, `no-open-redirect` | Node object and redirect attacks. |
| `no-bare-except`, `no-swallowed-exception-py` | Hidden Python failures. |
| `requests-no-timeout`, `requests-no-verify` | Unsafe Python HTTP behavior. |
| `no-pickle-load`, `no-unsafe-yaml-load` | Unsafe deserialization. |
| `jinja2-no-autoescape` | Template output without autoescape. |
| `no-dynamic-module-load-py` | Hidden dynamic Python dependencies. |
| `react-no-dangerously-set-html`, `no-innerhtml`, `react-no-unsanitized-href` | Browser injection surfaces. |
| `no-weak-crypto-js`, `no-weak-crypto-py` | MD5 and SHA-1 use. |

These are all 25 shipped IDs. They emit Semgrep `WARNING`, but the tool's policy
blocks warnings. Therefore, they are not advisory.

> **Semgrep evidence:** [The canonical config defines every pattern, language,
> exclusion, message, and severity](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/kubeclaw/files/config/.semgrep.yml#L21-L445).

## Kubernetes Policy Packs

Source code implements pack admission. Current Helm delivery does not. The
chart does not place the referenced default pack beside the runtime policy.
Thus, the shipped deployment cannot complete policy loading without an external
file injection. The deployment section gives the exact boundary and stop
condition.

A reference contains `id`, semantic `version`, relative `path`, and lowercase
SHA-256. Admission keeps the real path inside the policy directory, limits a file
to 1 MiB, verifies the digest before parsing, matches document ID and version,
rejects unknown fields and duplicate IDs, and permits at most 256 packs and 256
rules per pack. Loaded packs and rule lists are frozen.

| Rule type | Parameters | Evaluation |
| --- | --- | --- |
| `required-env` | Unique non-empty `names` | Normal and init containers need each variable, directly or through resolvable `envFrom`. |
| `secret-ref` | None | Non-optional container `env` secret keys and `envFrom` secret sources must resolve in the namespace. It does not inspect volumes or image-pull references. |
| `private-registry-pull-secret` | Unique non-empty `registries` | Matching images need pod or service-account pull secrets. |
| `readiness-probe` | None | Normal containers need readiness probes. |
| `liveness-probe` | None | Normal containers need liveness probes. |
| `resource-limits` | `cpu` and `memory`, default true | Require selected limits; at least one must be true. |

Evaluation supports Pod, Deployment, StatefulSet, DaemonSet, ReplicaSet, Job, and
CronJob. Probe rules exclude init containers. Findings use
`kubernetes-policy/<rule-id>`.

The default pack has these six concrete error-severity rules:

| Rule ID | Type | Exact parameter and effect |
| --- | --- | --- |
| `required-runtime-env` | `required-env` | Requires `REDIS_HOST` in each normal and init container. Resolvable `envFrom` entries count. |
| `valid-secret-refs` | `secret-ref` | Requires each non-optional container `env` secret key and `envFrom` secret source to exist in the workload namespace. |
| `private-registry-auth` | `private-registry-pull-secret` | Requires a pod or service-account pull secret for images under `registry.example.invalid`. |
| `readiness-probe` | `readiness-probe` | Requires a readiness probe on each normal container. |
| `liveness-probe` | `liveness-probe` | Requires a liveness probe on each normal container. |
| `resource-limits` | `resource-limits` | Requires both CPU and memory limits on normal and init containers. |

> **Pack evidence:** [Pack admission defines identity and bounds](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/kubernetes-policy-pack.ts#L7-L118),
> [the evaluator implements all six types](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/kubernetes-policy-tools.ts#L6-L159),
> and [the default pack supplies six instances](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/kubeclaw/files/config/kubernetes-policy-pack-default.json#L1-L50).

## Severity And Stage Outcome

Findings can be `info`, `warning`, or `error`. A tool threshold of `warning`
blocks warnings and errors. A threshold of `error` blocks errors only. All
current blocking tools use `warning`.

Experimental results must have zero error, warning, blocking, and debt counts.
Their disclosed findings count only as `experimental_findings`.

The stage decision order is:

1. Failed tool: `blocked`, reason `lint.tool_execution_failed`.
2. Otherwise, blocking finding: `request_fix`, reason `lint.blocking_findings`.
3. Otherwise: `passed`.

Tool health therefore has priority over severity. Lowering severity cannot hide
a missing binary, timeout, parser failure, or cleanup failure.

> **Outcome evidence:** [The stage uses this exact order](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/stage.ts#L24-L53),
> and [the report validator checks blocking and experimental counts](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/report-contract.ts#L76-L119).

## Baselines, Waivers, And Debt

The baseline is the implemented waiver mechanism. Each group records tool,
owner, reason, creation, later expiry, tracking ID, approver, approval date, and
lowercase SHA-256 fingerprints. Approval cannot precede creation. Expired and
duplicate tool/fingerprint entries are invalid. Only known blocking tools can
own debt.

A fingerprint hashes the tool ID with a tool-supplied stable seed, or with
normalized code, repository-relative file, and message. A match adds baseline
metadata and removes that finding from active blocking counts. `includeDebt`
controls body visibility, not the debt count.

An unscoped full run rejects unmatched baseline entries for tools that completed
successfully. A narrow run cannot prove an entry stale, so it does not perform
this check. Thus, a waiver is visible temporary debt, not rule deletion.

> **Debt evidence:** [Baseline validation](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/lint-governance.ts#L7-L43),
> [fingerprint matching](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/finding-fingerprints.ts#L18-L53),
> and [stale-debt rejection](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/index.ts#L119-L132) implement the lifecycle.

## Rule Admission

Admission records non-empty historical full commit SHAs and a non-empty rule
list. Each rule has a known tool, code, principle, remediation, positive number
of historical changed sets, non-negative false-positive count, approver, and
approval date. Tool/code pairs are unique.

The record is governance evidence. It does not execute a rule, suppress a
finding, or require every external tool code to be listed. Add it when a new
repository-owned blocking rule changes acceptance. Use the baseline for temporary
debt.

> **Admission evidence:** [The validator checks every admission field and
> identity](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/lint-governance.ts#L45-L65).

## Invalid Policy And Runtime Failures

| Condition | Result |
| --- | --- |
| Invalid JSON, version, vocabulary, duplicate ID, path, limit, file, expiry, digest, or pack | `LINT_POLICY_INVALID` before tools run. |
| Policy ID without adapter | `LINT_POLICY_ADAPTER_MISSING`. |
| Adapter without policy ID | `LINT_POLICY_TOOL_MISSING`. |
| Missing required binary | Tool `error`, `lint-tool-binary-missing`; stage blocks. |
| Missing optional binary | `not_applicable`; does not block. |
| Timeout or failed start | Tool-specific `*-timeout` or `*-execution-failed`; stage blocks. |
| Malformed output | Tool-specific `*-parse-failed`; stage blocks. |
| Cancellation | Invocation rejects as `LINT_CANCELLED`; not a normal tool result. |
| Unconfirmed descendant cleanup | `LINT_PROCESS_CLEANUP_FAILED`. |
| Invalid report shape, SHA-256 syntax, target path, evidence, totals, or request-bound project/tier/scope/visibility | `LINT_REPORT_CONTRACT_INVALID`. |

Native commands get an allowlisted environment and private cache directories.
Termination sends TERM to the Linux process group, then KILL after 250 ms, and
requires exit confirmation within 1,500 ms. This is lifecycle control, not a
general sandbox.

> **Failure evidence:** [Tool result classification](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/report.ts#L109-L163),
> [bounded native execution](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/execution.ts#L8-L95),
> and [process cleanup](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/process-termination.ts) preserve the failure boundary.

## Report Evidence

Every accepted report contains policy version and digest, project, explicit
native-config digests, pack digests, effective targets, baseline digest, report scope, tier,
visibility, changed files, detected types, discovery diagnostics, tool results,
and a summary recomputed from those results.

The explicit config digests cover each policy `config_path`. They do not cover
the implicit JSCPD test calibration or local type-evidence plugin implementation.
Reports also omit executable versions, Nova image identity, and the offline
Kubernetes schema-tree bytes and source commit. The generated runtime-authority
table records their build inputs, but only the deployed image identity proves
which inputs a run used. The pinned implementation links and target image remain
necessary evidence for all of these inputs.

The engine creates the policy, baseline, config, pack, and target identity maps
from files that it loaded. The stage binds the report to the configured policy
project and to the request's tier, module scope, optional project name, and
visibility. It does not reload every policy input and compare all identity maps
independently. The validator can compare expected policy, baseline, config, pack,
target, and tool inventories when a caller supplies them. The executor is the
trusted producer for the remaining maps in the current stage path. This boundary
is important when a new adapter or remote producer is considered.

Each successful tool result has at most 256 evidence entries. Each entry has
kind, source, SHA-256, and byte count. The 64 MiB referenced-evidence limit and
the 256 KiB inline-content limit apply to each entry, not to the complete report.
Inline content must match its count and digest. The contract does not define one
aggregate evidence-byte limit across all tools. The stage validates the report,
writes it as an immutable JSON artifact, and only then returns the stage decision.

> **Report evidence:** [The builder records policy and scope identity](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/report.ts#L205-L241),
> [the contract validates evidence and recomputes totals](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/report-contract.ts#L59-L73),
> and [the stage stores the artifact](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/stage.ts#L83-L91).

## Verification Record

This record separates source evidence from checks that ran in the local
verification environment. A passed local check does not replace target-image acceptance.

| Claim | Implementation | Contract or setting | Test evidence and status on 2026-09-20 | Revision | Limit |
| --- | --- | --- | --- | --- | --- |
| Stage, adapter, and engine keep lifecycle, authority, and analysis responsibilities separate. | [Stage request and decision](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/stage.ts#L24-L100) | [Adapter root admission](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/adapter.ts#L28-L63) | Stage, package-boundary, and adapter-boundary suites passed. | `32b02816cc19cc8865a45b221b8b6ca28e99e8fb` | Source and focused tests do not prove deployed capability grants. |
| The policy loader validates the complete policy and binds its direct configuration files. | [Policy loader](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/policy.ts#L234-L273) | [Shipped policy](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/kubeclaw/files/config/lint-policy.json#L1-L1070) | `docs:lint-policy:check` passed. It compared the generated page with policy, baseline, pack, native configuration, and implemented identifiers. | `32b02816cc19cc8865a45b221b8b6ca28e99e8fb` | Report digests do not include the implicit JSCPD test config or the local type-evidence plugin. |
| Project discovery and target validation cannot grant paths outside repository authority. | [Discovery](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/discovery.ts#L138-L220) | [Native target path validation](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/policy-paths.ts#L43-L74) | Discovery and remediation suites passed, including escape and excluded-source cases. | `32b02816cc19cc8865a45b221b8b6ca28e99e8fb` | A newly added native analyser needs its own traversal tests. |
| Policy and registry must contain the same tool IDs. | [Closed registry check](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/tool-registry-core.ts#L105-L129) | [All policy tools](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/kubeclaw/files/config/lint-policy.json#L280-L1070) | Package-boundary and generated-parity checks passed for all 31 tools. | `32b02816cc19cc8865a45b221b8b6ca28e99e8fb` | Matching IDs do not prove that each external binary runs in the deployed image. |
| Pack admission binds path, bytes, digest, ID, version, and closed rule data. | [Pack loader](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/kubernetes-policy-pack.ts#L67-L118) | [Default pack reference](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/kubeclaw/files/config/lint-policy.json#L9-L15) | Source-level pack and generated digest checks passed. | `32b02816cc19cc8865a45b221b8b6ca28e99e8fb` | Helm does not deliver the pack today. Deployed loading remains blocked until chart delivery is fixed and tested. |
| Baselines suppress only approved, unexpired fingerprint debt and expose stale entries in a complete full run. | [Baseline governance](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/lint-governance.ts#L7-L43) | [Stale baseline check](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/index.ts#L119-L132) | Generated baseline parity and remediation checks passed. | `32b02816cc19cc8865a45b221b8b6ca28e99e8fb` | A scoped or failed run cannot prove that every waiver is stale. |
| Tool failures cannot become clean tool results. | [Result normalization](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/report.ts#L104-L163) | [Report contract](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/src/engine/report-contract.ts#L38-L231) | The remediation suite passed all eight tests, including start failure, timeout, output overflow, abort, shutdown, and descendant cleanup. | `32b02816cc19cc8865a45b221b8b6ca28e99e8fb` | The suite uses selected real tools and controlled fixtures. It does not execute every external analyser. |
| Runtime versions come from reviewed locks and image build inputs, not lint policy. | [Nova analyser installation](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/docker/Dockerfile.nova#L72-L216) | [Version authorities](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/versions.json#L7-L51) | `npm run versions:check` passed for 42 inputs and the runtime lock receipt. | `32b02816cc19cc8865a45b221b8b6ca28e99e8fb` | A source lock check does not prove the identity of a running Pod image. |
| The published pages contain the current generated facts and valid pinned links. | [Policy source used by the generated reference](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/charts/kubeclaw/files/config/lint-policy.json#L1-L1070) | [Generated policy facts](lint-policy-generated.md) | Generated-reference, specialist-guide, link, coverage, and publication checks passed. | `32b02816cc19cc8865a45b221b8b6ca28e99e8fb` | These checks prove parity and publication structure. They do not replace a reader exercise. |
| The complete plugin function can run both tiers in the target tool environment. | [Live-function test](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/tests/live-function.test.ts#L13-L230) | [Plugin registrations](https://github.com/datrab/kubeclaw/blob/32b02816cc19cc8865a45b221b8b6ca28e99e8fb/skills/nova/plugins/lint/plugin.json#L1-L48) | Not reached in this environment. The fixture stopped while it acquired its first journal lock because BusyBox `flock` has no timeout option. | `32b02816cc19cc8865a45b221b8b6ca28e99e8fb` | Run this check in the target image with `shellcheck`, `shfmt`, and GNU `flock`. |
