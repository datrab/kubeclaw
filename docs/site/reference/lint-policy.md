# Lint Policy Reference

Status: implemented
Audience: lint-policy maintainer, operator, Nova maintainer
Owner: lint
Evidence: charts/kubeclaw/files/config/lint-policy.json; charts/kubeclaw/files/config/lint-baseline.json; charts/kubeclaw/files/config/kubernetes-policy-pack-default.json; skills/nova/plugins/lint/src/engine
Evidence revision: `549dfe003d41fca50b85c3040029a74a817715d6`
Applies to: `pipeline_lint_policy.v7`, `pipeline_lint_baseline.v2`, `kubernetes_lint_policy_pack.v1`, `pipeline_lint_report.v7`
Last verified: source, configuration, and package checks on 2026-09-20

## Purpose

This page defines the complete shipped lint-policy surface. The policy binds
project discovery, targets, tool settings, governance records, and immutable
Kubernetes rule packs. The engine rejects an invalid policy before it runs a
tool. A partly valid policy cannot produce an authoritative-looking report.

Use [Extend Lint](../extend/lint.md) for change procedures.

> **Canonical evidence:** [The shipped policy contains the project, 31 tools,
> exclusions, architecture, admission, baseline, and pack selection](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/charts/kubeclaw/files/config/lint-policy.json#L1-L1070).
> [The loader validates all parts and calculates policy, config, and pack digests](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/nova/plugins/lint/src/engine/policy.ts#L234-L273).

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

> **Version evidence:** [The policy version is fixed here](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/nova/plugins/lint/src/engine/policy-version.ts#L1),
> and [the report version and vocabularies are fixed here](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/nova/plugins/lint/src/engine/report-contract.ts#L3-L8).

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

> **Flow evidence:** [The stage builds the request](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/nova/plugins/lint/src/stage.ts#L56-L81),
> [the adapter enforces both roots](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/nova/plugins/lint/src/adapter.ts#L10-L50),
> and [the engine applies only the bounded Kubernetes override](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/nova/plugins/lint/src/engine/index.ts#L34-L57).

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

> **Schema evidence:** [Stage configuration](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/nova/plugins/lint/schemas/config.schema.json)
> and [adapter configuration](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/nova/plugins/lint/schemas/adapter-config.schema.json) are closed objects.

## Invocation Input

| Field | Rule and effect |
| --- | --- |
| `workingDirectory` | Required non-empty repository path under an admitted root. |
| `project` | Optional report label. It does not select policy. |
| `modulePath` | Optional relative scope. Absolute and escaping paths fail. |
| `changedFiles` | Optional unique relative paths. Valid deleted leaves are ignored during scope resolution. |
| `sourceStageId` | Optional runtime source selector; mutually exclusive with `revision`. |
| `revision` | Optional full lowercase 40-character SHA; runs in a detached temporary checkout. |
| `kubernetes.rawManifests` | Optional list of at most 256 paths; replaces the project list for this call. |
| `kubernetes.helmCharts` | Optional list of at most 256 paths; replaces the project list for this call. |

The candidate runner disables Git hooks, verifies detached `HEAD`, and removes
the temporary checkout. The stage rejects a response bound to another revision.

> **Input evidence:** [The input schema closes the shape](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/nova/plugins/lint/schemas/input.schema.json),
> and [candidate execution verifies source identity](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/nova/plugins/lint/src/candidate.ts#L6-L26).

## Project Fields

The contract currently requires exactly one project.

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

> **Project evidence:** [Project validation defines vocabulary, defaults,
> authorities, and bounds](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/nova/plugins/lint/src/engine/policy.ts#L29-L123).

## Discovery, Targets, And Scopes

Discovery scans only to `discovery_max_depth`, skips hidden directories and
`node_modules`, applies global exclusions, and matches language evidence. It can
detect several languages. Discovery does not grant filesystem access.

Each tool combines `targets`, `include`, its own `exclude`, and
`global_exclusions`. Target trees are checked for repository escape and symlinks;
`.git` is excluded from this security walk. This separate tree check is needed
because native tools can read files that discovery excludes.

| Scope | Effective behavior |
| --- | --- |
| `changed-files` | Use matching requested changes. No match gives `not_applicable`. A changed policy, baseline, or native config expands to project scope. |
| `affected-projects` | Use changes for relevance, then run at project scope. |
| `project` | Ignore the requested file subset and run at the selected project root. |
| `repository` | Ignore module and changed-file narrowing and use repository targets. |

Input priority is changed files, then module, then full repository. Tool scope can
intentionally widen the actual execution.

> **Scope evidence:** [Discovery and input priority](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/nova/plugins/lint/src/engine/discovery.ts#L138-L220),
> [tool-scope application](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/nova/plugins/lint/src/engine/report.ts#L67-L102),
> and [native target validation](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/nova/plugins/lint/src/engine/policy-paths.ts#L43-L74) implement these rules.

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

> **Registry evidence:** [The registry rejects both mismatch directions](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/nova/plugins/lint/src/engine/tool-registry-core.ts#L105-L129).

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
| `kubernetes-schema` | Full | project | Internal Kubernetes shape checks. |
| `trivy-kubernetes` | Full | project | Rendered Kubernetes security. |
| `yamllint` | Full | changed files | YAML checks outside Helm templates. |
| `openapi-contract` | Full | project | OpenAPI shape and reference checks. |

External tools can produce version-specific codes. The engine preserves them.
The next sections list every rule configured or implemented by this repository.

> **Inventory evidence:** [The policy holds all 31 exact settings](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/charts/kubeclaw/files/config/lint-policy.json#L131-L1070),
> and [the registry imports all implementation families](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/nova/plugins/lint/src/engine/tool-registry.ts#L1-L18).

## Blocking ESLint Rules

| Rule | Production behavior | Test behavior |
| --- | --- | --- |
| `complexity` | Maximum 15 | Maximum 70 |
| `max-depth` | Maximum 3 | Maximum 6 |
| `max-lines` | Maximum 300 nonblank/noncomment lines | Maximum 2,000 |
| `max-lines-per-function` | Maximum 60 nonblank/noncomment lines | Maximum 650 |
| `max-params` | Maximum 7 | Maximum 12 |
| `no-async-promise-executor` | Enabled | Enabled |
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
> and exemptions](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/charts/kubeclaw/files/config/eslint.config.mjs#L255-L338),
> and [the seven discipline rules are implemented here](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/charts/kubeclaw/files/config/eslint.config.mjs#L175-L253).

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
> rules and its typed file set](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/charts/kubeclaw/files/config/eslint-type-evidence-config.mjs#L42-L84),
> and [the local plugin implements seven rules](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/charts/kubeclaw/files/config/type-evidence-eslint-plugin.mjs#L226-L307).

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
> exclusion, message, and severity](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/charts/kubeclaw/files/config/.semgrep.yml#L21-L445).

## Kubernetes Policy Packs

A reference contains `id`, semantic `version`, relative `path`, and lowercase
SHA-256. Admission keeps the real path inside the policy directory, limits a file
to 1 MiB, verifies the digest before parsing, matches document ID and version,
rejects unknown fields and duplicate IDs, and permits at most 256 packs and 256
rules per pack. Loaded packs and rule lists are frozen.

| Rule type | Parameters | Evaluation |
| --- | --- | --- |
| `required-env` | Unique non-empty `names` | Normal and init containers need each variable, directly or through resolvable `envFrom`. |
| `secret-ref` | None | Non-optional secret key and source references must resolve in the namespace. |
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
| `valid-secret-refs` | `secret-ref` | Requires each non-optional secret key and secret source to exist in the workload namespace. |
| `private-registry-auth` | `private-registry-pull-secret` | Requires a pod or service-account pull secret for images under `registry.example.invalid`. |
| `readiness-probe` | `readiness-probe` | Requires a readiness probe on each normal container. |
| `liveness-probe` | `liveness-probe` | Requires a liveness probe on each normal container. |
| `resource-limits` | `resource-limits` | Requires both CPU and memory limits on normal and init containers. |

> **Pack evidence:** [Pack admission defines identity and bounds](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/nova/plugins/lint/src/engine/kubernetes-policy-pack.ts#L7-L118),
> [the evaluator implements all six types](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/nova/plugins/lint/src/engine/kubernetes-policy-tools.ts#L6-L159),
> and [the default pack supplies six instances](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/charts/kubeclaw/files/config/kubernetes-policy-pack-default.json#L1-L50).

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

> **Outcome evidence:** [The stage uses this exact order](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/nova/plugins/lint/src/stage.ts#L24-L53),
> and [the report validator checks blocking and experimental counts](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/nova/plugins/lint/src/engine/report-contract.ts#L76-L119).

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

> **Debt evidence:** [Baseline validation](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/nova/plugins/lint/src/engine/lint-governance.ts#L7-L43),
> [fingerprint matching](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/nova/plugins/lint/src/engine/finding-fingerprints.ts#L18-L53),
> and [stale-debt rejection](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/nova/plugins/lint/src/engine/index.ts#L119-L132) implement the lifecycle.

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
> identity](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/nova/plugins/lint/src/engine/lint-governance.ts#L45-L65).

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
| Invalid report identity, evidence, totals, or visibility | `LINT_REPORT_CONTRACT_INVALID`. |

Native commands get an allowlisted environment and private cache directories.
Termination sends TERM to the Linux process group, then KILL after 250 ms, and
requires exit confirmation within 1,500 ms. This is lifecycle control, not a
general sandbox.

> **Failure evidence:** [Tool result classification](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/nova/plugins/lint/src/engine/report.ts#L109-L163),
> [bounded native execution](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/nova/plugins/lint/src/engine/execution.ts#L8-L95),
> and [process cleanup](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/nova/plugins/lint/src/engine/process-termination.ts) preserve the failure boundary.

## Report Evidence

Every accepted report contains policy version and digest, project, native-config
digests, pack digests, effective targets, baseline digest, report scope, tier,
visibility, changed files, detected types, discovery diagnostics, tool results,
and a summary recomputed from those results.

Evidence has at most 256 entries. Each has kind, source, SHA-256, and byte count.
Referenced evidence is limited to 64 MiB. Inline content is limited to 256 KiB
and must match its count and digest. The stage validates the report, writes it as
an immutable JSON artifact, and only then returns the stage decision.

> **Report evidence:** [The builder records policy and scope identity](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/nova/plugins/lint/src/engine/report.ts#L205-L241),
> [the contract validates evidence and recomputes totals](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/nova/plugins/lint/src/engine/report-contract.ts#L59-L73),
> and [the stage stores the artifact](https://github.com/datrab/kubeclaw/blob/549dfe003d41fca50b85c3040029a74a817715d6/skills/nova/plugins/lint/src/stage.ts#L83-L91).
