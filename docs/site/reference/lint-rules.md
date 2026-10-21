# Lint Rule And Finding Reference

Status: implemented
Audience: developer, lint-policy maintainer, operator
Owner: lint
Evidence: charts/kubeclaw/files/config/eslint.config.mjs; charts/kubeclaw/files/config/type-evidence-eslint-plugin.mjs; charts/kubeclaw/files/config/.semgrep.yml; charts/kubeclaw/files/config/kubernetes-policy-pack-default.json; skills/nova/plugins/lint/src/engine
Evidence revision: `569f7b4933d4859cc67c80ddf40d5154ffd95ce5`
Applies to: the repository-owned rules and normalized findings in `pipeline_lint_policy.v7`
Last verified: source, configuration, and focused lint tests on 2026-09-20; no target-image execution

## Purpose And Reading Order

This page explains each rule that KubeClaw owns. It also explains each stable
finding family that the lint engine creates. Use it when a report contains a
code that is not self-explanatory.

The [policy guide](lint-policy.md) explains selection, severity, debt, and
failure behavior. The [generated facts](lint-policy-generated.md) give the exact
shipped settings. The [extension guide](../extend/lint.md) explains safe changes.

KubeClaw does not copy the complete rule manuals of external analysers. Those
rules can change with the installed analyser version. This page states the
boundary and explains how KubeClaw normalizes their results.

## How To Interpret A Finding

A finding has a tool, code, severity, message, file, optional coordinates, and
fingerprint. The tool identifies the analyser. The code identifies the rule or
normalized condition. The policy threshold decides whether the severity blocks.

First correct the reported condition. Use a waiver only when correction is
unsafe now and an owner accepts expiring debt. Do not change a message only to
change its fingerprint.

> **Finding evidence:** [The engine normalizes and fingerprints findings](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/lint/src/engine/finding-fingerprints.ts#L4-L53).
> [The report contract validates their shape and counts](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/lint/src/engine/report-contract.ts#L76-L119).

## Blocking ESLint Rules

The blocking ESLint configuration has two groups. Standard rules protect common
language behavior. Local `discipline` rules protect KubeClaw boundaries that a
general-purpose rule cannot express accurately.

Rules enabled in production are errors. Test files use larger size limits and
only the rules marked for tests. The configuration owns the exact file groups
and boundary exemptions.

### Standard Rules

| Code | Trigger | Intent and remediation | Test behavior |
| --- | --- | --- | --- |
| `complexity` | A function has more than 15 decision paths. | Keep decisions reviewable. Extract one coherent decision with a clear input and result. | Maximum 70. |
| `max-depth` | Control flow nests beyond three levels. | Keep the main path visible. Use a guard clause or extract one complete operation. | Maximum six. |
| `max-lines` | A source file exceeds 300 nonblank, noncomment lines. | Keep one cohesive concern per file. Move a complete concern behind an explicit interface. | Maximum 2,000. |
| `max-lines-per-function` | A function exceeds 60 nonblank, noncomment lines. | Keep one responsibility per function. Extract complete operations, not arbitrary line ranges. | Maximum 650. |
| `max-params` | A function accepts more than seven parameters. | Keep interfaces cohesive. Use one typed request object when the values belong together. | Maximum 12. |
| `no-async-promise-executor` | A Promise constructor receives an asynchronous executor. | Avoid lost asynchronous errors. Create work before the constructor or use an async function directly. | Enabled only for tests; production does not enable this rule. |
| `no-global-assign` | Code assigns to a read-only global. | Prevent hidden global mutation. Store state in an explicit lifecycle owner. | Enabled. |
| `no-useless-catch` | A catch block only throws the same error. | Remove the block, or add useful context while preserving the cause. | Enabled. |
| `no-var` | Code declares a variable with `var`. | Use block-scoped bindings. Select `const`, or use `let` when reassignment is required. | Enabled. |
| `no-console` | Production code calls `console` outside an approved boundary. | Preserve structured logs. Use the canonical logger with level and context. | Disabled. |
| `@typescript-eslint/await-thenable` | Code awaits a value that is not promise-like. | Expose incorrect asynchronous assumptions. Remove `await` or return a real promise. | Disabled. |
| `@typescript-eslint/consistent-type-imports` | A type-only dependency uses a value import. | Keep runtime dependencies visible. Use `import type` for type-only imports. | Disabled. |
| `@typescript-eslint/no-floating-promises` | Code creates a promise without awaiting, returning, or explicitly discarding it. | Prevent unobserved failure. Await, return, or intentionally mark the promise with `void`. | Disabled. |
| `@typescript-eslint/no-misused-promises` | A promise is used where synchronous behavior is required. | Prevent callbacks from hiding asynchronous failure. Introduce an explicit asynchronous boundary. | Disabled. |
| `@typescript-eslint/switch-exhaustiveness-check` | A switch omits a member of a typed union. | Make new states visible during compilation. Handle every member or use an explicit unreachable assertion. | Disabled. |

The limits are policy choices, not universal measures of quality. The admission
record preserves the approved principle and remediation for each blocking local
choice. The [generated admission table](lint-policy-generated.md#blocking-rule-admission)
keeps those facts synchronized with policy.

### Local Discipline Rules

| Code | Exact trigger | Intentional non-trigger or exemption | Corrective action |
| --- | --- | --- | --- |
| `discipline/filename-case` | A JavaScript or TypeScript source filename is not lowercase kebab-case. | The configured non-source and special filenames remain outside its file group. | Rename the file and update all imports. |
| `discipline/no-direct-env-access` | Production code reads `process.env` outside an approved environment boundary. | Named configuration, adapter, and process-boundary files can read the environment. | Parse and validate the value at an approved boundary. Pass typed configuration inward. |
| `discipline/no-dynamic-module-loading` | Production code uses dynamic `import()`, `require()`, or equivalent loading outside an approved loader. | Named plugin loader, registry, migration, and controlled discovery boundaries are exempt. | Use a static import or register the dependency through the approved loader boundary. |
| `discipline/no-env-default` | An environment read uses a hardcoded application fallback. | Boolean control flow and validation after an environment read are not default values. | Put the default in canonical configuration. Require the validated value in application code. |
| `discipline/no-fallback-chain` | A production expression chains more than one nonboolean fallback. | Boolean expressions and one explicit fallback remain valid. Named compatibility boundaries are exempt. | Select one authority and, at most, one documented fallback. Remove guessed candidates. |
| `discipline/no-swallowed-error` | A catch block hides failure through an empty block, `return`, or no actionable handling. | Rethrow, typed failure, explicit handling, or the reviewed `INTENTIONAL_NONCRITICAL(...)` marker is accepted. | Return a typed failure, rethrow with context, or document the bounded noncritical case. |
| `discipline/no-top-level-mutable-state` | A module owns mutable top-level state without an approved lifecycle boundary. | Immutable bindings and named lifecycle owners are accepted. | Move the state into an object or service with explicit construction and shutdown. |

The exemptions prevent broad rules from rejecting the components that own the
controlled boundary. Add an exemption only when the file owns that boundary.
Do not add an exemption only because a finding is inconvenient.

> **ESLint evidence:** [The local implementations define their exact syntax checks](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/charts/kubeclaw/files/config/eslint.config.mjs#L65-L253).
> [The configuration defines limits, file groups, and exemptions](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/charts/kubeclaw/files/config/eslint.config.mjs#L255-L338).

## Experimental Type-Evidence Rules

These rules find places where source code claims more type certainty than its
evidence supports. They are experimental because repository-wide calibration is
still visible separately from the blocking gate.

Experimental findings never block and cannot enter the baseline. Set
`includeExperimental=true` to disclose them.

| Code | Trigger | Intentional boundary | Corrective action |
| --- | --- | --- | --- |
| `type-evidence/no-chained-type-assertions` | A value passes through a second type assertion. | A single assertion remains outside this rule. | Validate the value once, then keep the validated type. |
| `type-evidence/no-known-value-widening` | A known object is widened to a general string-keyed dictionary. | A value already typed as a dictionary is not widened. | Preserve its known keys or parse external input into a declared shape. |
| `type-evidence/no-module-mocking` | Test code replaces an entire module. | Injected dependencies and narrow test seams remain valid. | Pass the dependency through a constructor, parameter, or registered adapter. |
| `type-evidence/no-object-parameters` | A parameter uses the broad `object` type. | A specific interface, record, or schema-derived type remains valid. | Define the fields that the function requires. |
| `type-evidence/no-unknown-returns` | A function exposes `unknown` as its return contract. | Local `unknown` input before parsing remains valid. | Parse the value at the boundary and return a named result type. |
| `type-evidence/no-unknown-type-aliases` | A type alias conceals `unknown`. | Direct boundary use stays visible and is not concealed by an alias. | Replace the alias with a schema-derived or explicit type. |
| `type-evidence/no-widen-then-assert` | Code widens a known value and later asserts it back. | Validation that produces a new typed value remains valid. | Preserve the original type or validate at the actual trust boundary. |
| `@typescript-eslint/no-unsafe-type-assertion` | A typed assertion narrows without compiler proof. | Safe widening and checked narrowing remain valid. | Use a type guard, schema parser, or a more accurate source type. |

The local rules are intentionally narrow. Known-value widening skips exported
variables and values that later need dynamic keys. Module mocking recognizes
Jest and Vitest namespaces. Widen-then-assert follows one declared variable
through one broad intermediate variable and requires the original type text.
These limits reduce false positives, but they also limit what the audit proves.

Production, tests, and generated or untracked files use separate adapters. This
partition prevents one file from appearing in several experimental result sets.
A Git enumeration failure stops classification instead of silently omitting files.

> **Type-evidence evidence:** [The local plugin implements seven syntax rules](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/charts/kubeclaw/files/config/type-evidence-eslint-plugin.mjs#L226-L307).
> [The production configuration adds the typed assertion rule](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/charts/kubeclaw/files/config/eslint-type-evidence-config.mjs#L42-L84).
> [The engine creates disjoint evidence partitions](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/lint/src/engine/evidence-file-partition.ts#L8-L57).

## Curated Semgrep Rules

All 25 rules emit Semgrep `WARNING`. The shipped tool blocks at `warning`, so
every disclosed Semgrep finding blocks. Patterns inspect changed matching files.

| Code | Languages | Trigger | Exclusion or safe form | Corrective action |
| --- | --- | --- | --- | --- |
| `no-eval` | JavaScript, TypeScript | `eval` or the `Function` constructor executes text. | No configured exclusion. | Replace text execution with a fixed parser or explicit dispatch table. |
| `no-string-timer-code` | JavaScript, TypeScript | A timer receives a string literal. | A function callback is accepted. | Pass a function to the timer. |
| `no-shell-interpolation` | JavaScript, TypeScript | A child-process shell command contains template interpolation. | Argument-array process APIs are accepted. | Use `execFile` or `spawn` with a fixed executable and separate arguments. |
| `no-hardcoded-secrets` | JavaScript, TypeScript, Python | An assignment resembles a token, password, key, bearer value, or known credential prefix. | Tests, specifications, and fixtures are excluded. | Load the secret through the approved secret boundary. Rotate an exposed credential. |
| `no-raw-sql-outside-data-layer-js` | JavaScript, TypeScript | A common database API receives SQL text outside a data layer. | Named database, query, repository, storage, persistence, migration, and test paths are excluded. | Move the query into the controlled data-access layer and parameterize values. |
| `no-raw-sql-outside-data-layer-py` | Python | A common session, engine, or database API receives SQL text outside a data layer. | The same data-layer and test path families are excluded. | Move the query into the controlled data-access layer and parameterize values. |
| `no-sql-string-format` | Python | SQL uses an f-string, percent formatting, or `format()`. | Parameterized driver calls do not match. | Pass the statement and values separately through the driver API. |
| `no-math-random-security` | JavaScript, TypeScript | `Math.random()` initializes a security-named value. | Non-security names do not match this heuristic. | Use `crypto.randomUUID()` or `crypto.randomBytes()`. |
| `use-compare-digest` | Python | A security-named value is compared with `==`. | Constant-time comparison APIs do not match. | Use `hmac.compare_digest()` or `secrets.compare_digest()`. |
| `no-prototype-pollution` | JavaScript, TypeScript | Code accesses `__proto__` or `constructor.prototype`. | No configured exclusion. | Validate keys and use `Map` or a null-prototype object for untrusted keys. |
| `no-open-redirect` | JavaScript, TypeScript | A response redirect receives a variable target. | This pattern does not prove allowlist validation. | Resolve the destination through a strict allowlist before redirecting. |
| `no-bare-except` | Python | An exception handler omits the exception type. | `except Exception` does not match. | Catch the narrow expected exception, or use `Exception` when the boundary requires it. |
| `no-swallowed-exception-py` | Python | A caught exception ends with `pass`, empty `return`, or `return None`. | Tests and specifications are excluded. | Handle the failure or rethrow it with context. |
| `requests-no-timeout` | Python | A common `requests` call omits `timeout`. | A call with an explicit timeout is accepted. | Set a bounded connect and read timeout. |
| `requests-no-verify` | Python | A request sets `verify=False`. | Verified TLS is accepted. | Restore verification and configure the required trust root. |
| `no-pickle-load` | Python | Code loads Python pickle data. | No configured trusted-data exemption exists. | Use JSON or another non-executable format for untrusted data. |
| `no-unsafe-yaml-load` | Python | `yaml.load()` omits a loader. | An explicit loader does not match; prefer `safe_load`. | Use `yaml.safe_load()` or an approved safe loader. |
| `jinja2-no-autoescape` | Python | A Jinja environment omits approved autoescape configuration. | `autoescape=True` and `select_autoescape(...)` are accepted. | Enable contextual autoescaping. |
| `no-dynamic-module-load-py` | Python | Code uses `importlib.import_module` or `__import__`. | Named plugin, registry, loader, migration, and test paths are excluded. | Use a static import or an explicit registered loader boundary. |
| `react-no-dangerously-set-html` | JavaScript, TypeScript | JSX uses `dangerouslySetInnerHTML`. | No configured sanitizer recognition exists. | Prefer normal rendering. Sanitize unavoidable HTML at a reviewed boundary. |
| `no-innerhtml` | JavaScript, TypeScript | Code assigns `innerHTML` or `outerHTML`. | `textContent` does not match. | Use text APIs or a reviewed sanitizer. |
| `react-no-unsanitized-href` | JavaScript, TypeScript | A link or browser location receives a variable URL. | This pattern does not prove protocol validation. | Parse the URL and allow only approved schemes and destinations. |
| `no-weak-crypto-js` | JavaScript, TypeScript | Code selects MD5 or SHA-1. | Stronger algorithms do not match. | Use SHA-256 or stronger; use a password-hashing function for passwords. |
| `no-weak-crypto-py` | Python | Code selects MD5 or SHA-1 through `hashlib`. | Stronger algorithms do not match. | Use SHA-256 or stronger; use a password-hashing function for passwords. |
| `no-subprocess-shell` | Python | A subprocess API sets `shell=True`. | An argument list with `shell=False` does not match. | Pass a fixed executable and a separate argument list. |

Semgrep patterns are intentionally narrow and can be heuristic. A safe use can
still match when the pattern cannot observe validation elsewhere. Prefer a
clear local safe form. Propose an exclusion only for a stable owned boundary.

> **Semgrep evidence:** [The configuration owns all patterns, messages,
> languages, severities, and path exclusions](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/charts/kubeclaw/files/config/.semgrep.yml#L21-L445).

## Engine-Owned Finding Codes

These codes are stable KubeClaw findings. They describe source quality, not an
execution failure.

| Tool | Code or family | Trigger | Corrective action |
| --- | --- | --- | --- |
| `gofmt` | `go-format` | `gofmt -l` reports a Go file. | Run `gofmt -w` on the file and review the change. |
| `gocyclo` | `go-complexity` | A Go function exceeds complexity 10. | Extract a cohesive decision or reduce branching. |
| `go-imports` | `go-import-boundary` | A Go package imports an external prefix not allowed by its module policy. | Use an allowed internal abstraction, or review the module allowlist. |
| `shfmt` | `shell-format` | `shfmt -d` produces a format difference. | Run `shfmt -w -s -i 2 -ci` on the file. |
| `dependency-cruiser` | `architecture:forbidden-dependency` | A source layer depends on a layer absent from `may_depend_on`. | Move the dependency behind an allowed boundary, or review the layer policy. |
| `dependency-cruiser` | `architecture:circular-dependency` | The module graph contains a cycle, including a self-cycle. | Break the cycle by moving shared behavior behind one directed interface. |
| `knip` | `knip:files` | Knip reports a dead file. | Remove it or register its real entry point. |
| `knip` | `knip:exports` | Knip reports an unused export. | Remove the export or connect its supported consumer. |
| `knip` | `knip:types` | Knip reports an unused exported type. | Remove the export or connect its supported consumer. |
| `knip` | `knip:dependencies` | Knip reports an unused dependency. | Remove it from the owning package. |
| `knip` | `knip:unlisted` | Source imports an undeclared dependency. | Declare it in the owning package. |
| `knip` | `knip:unresolved` | Knip cannot resolve an import. | Correct the path, package declaration, or generated-source boundary. |
| `jscpd` | `duplication:structural-clone` | Production or calibrated test content crosses the active token and line limits. | Extract the shared behavior when it represents one concept. Keep intentional independent cases separate. |
| `terraform-fmt` | `terraform-format` | `terraform fmt -check` reports a file. | Run `terraform fmt` in the affected root. |
| `terraform-validate` | `terraform-validate` | Terraform returns a structured validation diagnostic. | Correct the configuration described by the diagnostic. |
| `helm-lint` | `helm-lint` | Strict Helm lint emits an error or warning. | Correct the chart at the reported template or metadata boundary. |
| `yamllint` | `yamllint` | Strict yamllint emits a parsable diagnostic. | Apply the named YAML rule. Helm templates remain excluded. |
| `openapi-contract` | `openapi-syntax` | JSON or YAML parsing fails, including unsupported aliases. | Correct the document syntax and remove unsupported aliases. |
| `openapi-contract` | `openapi-version` | The contract does not declare OpenAPI 3.x. | Set a supported OpenAPI 3 version. |
| `openapi-contract` | `openapi-paths` | The contract lacks an object-valued `paths`. | Add the paths object. |
| `openapi-contract` | `openapi-path-item` | A path item is neither an object nor a resolvable local reference. | Correct the object or its local JSON Pointer. |
| `openapi-contract` | `openapi-operation` | An HTTP operation is not an object. | Replace it with a valid operation object. |
| `openapi-contract` | `openapi-operation-id` | An operation ID is absent, invalid, or duplicated. | Give every operation one unique string ID. |
| `openapi-contract` | `openapi-responses` | An operation has no response object. | Declare its response contract. |
| `kubernetes-policy` | `kubernetes-policy/<rule-id>` | One admitted pack rule rejects a manifest object. | Use the reported rule ID and the Kubernetes section below. |

> **Internal finding evidence:** [Architecture, Knip, and duplication normalization](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/lint/src/engine/architecture-tools.ts#L96-L189),
> [Go normalization](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/lint/src/engine/go-tools.ts#L128-L216),
> and [OpenAPI checks](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/lint/src/engine/openapi-tool.ts#L6-L76) define these codes.

## Kubernetes Policy Rules

The default pack has six rules. Pack admission binds their bytes, version, ID,
and digest before evaluation. Rules apply to Pod, Deployment, StatefulSet,
DaemonSet, ReplicaSet, Job, and CronJob workload shapes.

| Rule ID | Trigger | Important boundary | Corrective action |
| --- | --- | --- | --- |
| `required-runtime-env` | A normal or init container lacks `REDIS_HOST`. | A resolvable `envFrom` ConfigMap or Secret key counts. An optional or missing source does not prove the value. | Add the variable directly or through a resolvable nonoptional source. |
| `valid-secret-refs` | A nonoptional container `env` secret key or `envFrom` secret source cannot resolve in the namespace. | Optional references are allowed. Volumes, projected volumes, and image-pull references are outside this rule. | Create the named Secret and key, or correct the reference. |
| `private-registry-auth` | An image below `registry.example.invalid` lacks a pod or service-account pull secret. | Public images do not need this rule's credential. | Add an image pull secret to the pod or selected service account. |
| `readiness-probe` | A normal container lacks a readiness probe. | Init containers do not receive this check. | Add a probe that proves the container can receive traffic. |
| `liveness-probe` | A normal container lacks a liveness probe. | Init containers do not receive this check. | Add a probe that detects a process which cannot recover by itself. |
| `resource-limits` | A normal or init container lacks CPU or memory limits. | The shipped rule requires both resources. | Set explicit CPU and memory limits for every applicable container. |

The pack describes values. Engine code owns rule meaning. This separation lets
an operator select approved values without allowing a policy file to execute code.

> **Kubernetes evidence:** [Pack admission verifies immutable identity](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/lint/src/engine/kubernetes-policy-pack.ts#L67-L115).
> [The evaluator implements workload and lookup behavior](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/lint/src/engine/kubernetes-policy-tools.ts#L45-L159).

## External Rule Families

The following tools preserve analyser-owned codes. Their installed version and
native configuration determine the complete external vocabulary.

| Tool | Preserved code | KubeClaw normalization | Where to correct the issue |
| --- | --- | --- | --- |
| `tsc` | `TS<number>` | Preserves file, line, column, severity, and message. | Correct the TypeScript diagnostic in the affected project. |
| `ruff` | Ruff rule code | A finding with an automatic fix becomes a warning; another finding becomes an error. | Apply the Ruff fix or correct the named Python rule. |
| `shellcheck` | `SC<number>` | ShellCheck errors stay errors; other levels become warnings. | Correct the named ShellCheck condition. |
| `eslint` and type evidence | ESLint rule ID | Preserves ESLint severity and creates a stable occurrence seed. | Use the matching rule section on this page or the linked upstream rule manual. |
| `mypy` | Mypy error code, or `mypy` | Preserves JSON severity, location, and message. | Correct the typed Python contract. |
| `go-vet` | `go-vet` | Normalizes text diagnostics to one KubeClaw code. | Correct the reported Go misuse. |
| `staticcheck` | Staticcheck code | Preserves the analyser code and message. | Correct the named Staticcheck rule. |
| `govulncheck` | OSV identifier | Reports only reachable vulnerability findings. | Upgrade or replace the dependency and verify the reachable call path. |
| `tflint` | TFLint rule name | Preserves warning or error severity. | Correct the named Terraform rule. |
| `trivy-terraform` | Trivy issue ID | Only high and critical Terraform misconfigurations are requested. | Correct the resource configuration described by Trivy. |
| `hadolint` | Hadolint code | Preserves error; other levels become warnings. | Correct the named Dockerfile rule. |
| `kubeconform` and `kubernetes-schema` | Adapter ID: `kubeconform` or `kubernetes-schema` | Normalizes schema status and message for raw and rendered resources. | Correct the resource against the configured offline Kubernetes schema. |
| `trivy-kubernetes` | Trivy issue ID | Reports rendered-chart misconfigurations. | Correct the rendered Kubernetes resource. |

Do not copy every upstream rule into KubeClaw documentation. Pin the runtime
tool version, preserve its code, and link its versioned manual when investigating
a finding. Repository-owned selections and exceptions remain documented here.

## Operational Error Codes

An operational error means that lint could not prove a trustworthy result. It
is not source debt and cannot be waived through the baseline.

| Code or family | Meaning | Recovery |
| --- | --- | --- |
| `LINT_REPORT_RUN_FAILED` | The maintained report runner failed outside a more specific engine error, including report-output directory creation or atomic write failure. | Read the emitted error, correct output-path access or the reported runtime fault, and rerun. Absence of the output file does not prove that engine validation failed. |
| `LINT_TIER_INVALID` | The adapter request selects neither `pre-check` nor `full`. | Correct the stage or caller. These are the only accepted tiers. |
| `LINT_CHANGED_FILES_INVALID` | The adapter payload does not contain an array of strings. | Send a string array or omit the field. |
| `LINT_WORKING_DIRECTORY_INVALID` | The payload lacks a string working directory. | Supply a canonical repository path. |
| `LINT_POLICY_PATH_INVALID` | The payload lacks a string policy path. | Supply the operator-selected policy file. |
| `LINT_POLICY_PROJECT_INVALID` | The payload lacks a string policy-project ID. | Supply an ID declared in the selected policy. |
| `LINT_KUBERNETES_INPUT_INVALID` | The Kubernetes override has the wrong shape, empty path, or nonstring item. | Supply both string arrays and valid nonempty relative paths. |
| `LINT_KUBERNETES_INPUT_LIMIT` | One Kubernetes override array has more than 256 entries. | Split the request or select bounded project configuration. |
| `LINT_KUBERNETES_INPUT_ESCAPE` | A Kubernetes override is absolute or escapes the project. | Use a project-relative path without parent traversal. |
| `LINT_KUBERNETES_INPUT_DUPLICATE` | A normalized Kubernetes override contains a duplicate. | Send each manifest or chart once. |
| `LINT_KUBERNETES_INPUT_EMPTY` | Both bounded Kubernetes override arrays are empty. | Omit the override or supply at least one manifest or chart. |
| `LINT_MODULE_PATH_ABSOLUTE` | Module scope uses an absolute path. | Use a repository-relative module path. |
| `LINT_MODULE_PATH_ESCAPE` | Module scope resolves outside the repository. | Remove parent traversal and select an in-repository module. |
| `LINT_CHANGED_FILE_INVALID` | One changed-file entry is empty or not a string. | Send nonempty repository-relative strings. |
| `LINT_CHANGED_FILE_ABSOLUTE` | One changed-file entry is absolute. | Convert it to a repository-relative path. |
| `LINT_CHANGED_FILE_ESCAPE` | One changed-file entry traverses above the repository. | Remove parent traversal. |
| `LINT_WORKING_DIRECTORY_DENIED` | The canonical repository is outside adapter-owned roots. | Correct the invocation or obtain a reviewed adapter-root change. |
| `LINT_POLICY_PATH_DENIED` | The canonical policy is outside adapter-owned policy roots. | Select an admitted operator policy. Do not use repository input to grant policy authority. |
| `LINT_OPERATION_UNSUPPORTED` | The request does not use capability `lint.execute` with operation `run_report`. | Correct the caller registration and operation. |
| `ADAPTER_CANCELLED` | The caller or adapter shutdown aborted work before execution. | Confirm cleanup. Start a new request only when the result is still required. |
| `LINT_ADAPTER_SHUTDOWN` | Adapter shutdown cancelled active invocations. | Wait for a new adapter instance before retrying. |
| `LINT_SOURCE_REVISION_INVALID` | Candidate execution received a revision that is not a full lowercase SHA. | Resolve and send one full commit ID. |
| `LINT_CANDIDATE_TIMEOUT` | Candidate Git preparation exceeded 60 seconds. | Inspect repository size, storage, and Git health before retrying. |
| `LINT_CANDIDATE_GIT_FAILED` | Clone, detached checkout, or revision inspection failed. | Correct repository or revision access. Retain the Git failure text. |
| `LINT_SOURCE_REVISION_MISMATCH` | Detached candidate `HEAD` differs from the requested revision. | Stop. Investigate Git storage and candidate preparation before reuse. |
| `LINT_POLICY_INVALID` | Policy, baseline, native config, pack, path, digest, vocabulary, or limit validation failed. | Correct the first validation message. Do not run tools with a partly accepted policy. |
| `LINT_POLICY_ADAPTER_MISSING` | Policy names a tool without a registered adapter. | Add and test the adapter, or remove the unimplemented policy entry. |
| `LINT_POLICY_TOOL_MISSING` | The registry contains an adapter absent from policy. | Add its complete policy entry, or remove the dormant adapter. |
| `lint-tool-binary-missing` | A required executable is absent from `PATH`. | Install the pinned runtime image or restore its tool installation. |
| `<tool>-timeout` | A tool exceeded its configured timeout. | Inspect workload size and process evidence. Increase the timeout only with measured evidence. |
| `<tool>-execution-failed` | A process did not start or failed outside its documented finding exit. | Inspect the retained error and runtime installation. Correct the process failure before retrying. |
| `<tool>-parse-failed` | Output could not prove a complete result. | Check tool version and output format. Do not treat malformed output as clean. |
| `tsc-output-invalid` | TypeScript failed without a file-scoped diagnostic. | Inspect the preview and project configuration. Restore structured compiler output. |
| `semgrep-execution-failed` | Semgrep returned an execution failure rather than findings. | Inspect its fatal output, binary, and configuration. |
| `go-imports-execution-failed` | `go list` failed before import evaluation. | Correct module loading or package arguments. |
| `govulncheck-execution-failed` | Govulncheck returned a nonzero operational result. | Correct module or analyser execution. Findings alone use exit zero in the pinned mode. |
| `eslint-type-evidence-source-classification-failed` | Git could not classify tracked and untracked evidence files. | Restore repository access and a valid Git worktree. |
| `eslint-config-missing` | The selected ESLint config path is absent. | Restore the exact configured file and verify its digest. |
| `semgrep-config-missing` | The selected Semgrep config path is absent. | Restore the exact configured file and verify its digest. |
| `knip-config-missing` | The selected Knip config path is absent. | Restore `knip.json` at the policy-owned path. |
| `jscpd-config-missing` | The selected production JSCPD config is absent. | Restore `jscpd.json` at the policy-owned path. |
| `jscpd-test-config-missing` | The implicit test calibration beside the production config is absent. | Restore `jscpd-tests.json`; policy validation cannot detect this companion early. |
| `LINT_BASELINE_STALE` | An unscoped full run found an unmatched waiver for a successful tool. | Remove the resolved baseline entry through the prune workflow. |
| `LINT_REPOSITORY_PATH_DENIED` | A requested path is outside an admitted repository root. | Correct the invocation or adapter root. Do not broaden authority without review. |
| `kubernetes-manifest-path-invalid` | A Kubernetes input escapes its project or has the wrong path type. | Use an admitted regular file or directory inside the project. |
| `kubernetes-manifest-symlink-invalid` | A Kubernetes input is a symbolic link. | Use the canonical in-project file or directory. |
| `kubernetes-manifest-file-limit` | The combined input exceeds the file-count limit. | Narrow the input or review the project limit with measured evidence. |
| `kubernetes-manifest-size-limit` | A file or rendered result exceeds its byte limit. | Split or reduce the input. Change the bound only after resource review. |
| `kubernetes-manifest-document-limit` | Parsed or rendered input exceeds the document limit. | Narrow the input or split the chart. |
| `kubernetes-manifest-yaml-invalid` | YAML parsing failed. | Correct the source or rendered YAML. |
| `kubernetes-manifest-object-invalid` | A YAML document is not a Kubernetes object. | Remove the document or add the required object fields. |
| `kubeconform-render-size-limit` | Rendered Helm content exceeds the schema-check limit. | Reduce the rendered set or review the bound with evidence. |
| `terraform-provider-mirror-invalid` | The provider mirror path is not absolute. | Configure one absolute offline mirror path. |
| `terraform-provider-mirror-missing` | The configured provider mirror directory is absent. | Restore the offline mirror before validation. |
| `terraform-lockfile-missing` | A Terraform root lacks its committed provider lock file. | Initialize with the approved mirror and commit the reviewed lock file. |
| `terraform-init-failed` | Offline, backend-disabled Terraform initialization failed. | Correct the mirror, lock file, or module inputs. |
| `LINT_CANCELLED` | The caller aborted the invocation. | Confirm cleanup, then start a new invocation when the caller still needs the result. |
| `LINT_PROCESS_CLEANUP_FAILED` | Descendant termination could not be confirmed. | Treat the worker as uncertain. Inspect and isolate remaining processes before reuse. |
| `LINT_PROCESS_GROUP_STATUS_INVALID` | Linux process status lacks a required namespace process-group field. | Treat cleanup state as uncertain. Verify the proc mount and runtime kernel interface. |
| `LINT_PROCESS_GROUP_UNVERIFIABLE` | The runner cannot prove the spawned process group identity. | Stop worker reuse. Inspect PID namespaces and process ownership. |
| `LINT_PROCESS_GROUP_STATE_INVALID` | A process status lacks a usable state. | Treat group liveness as unknown and isolate the worker. |
| `LINT_PROCESS_GROUP_EXIT_TIMEOUT` | A process group remains live past its cleanup deadline. | Isolate the worker and terminate remaining descendants through the runtime owner. |
| `LINT_REPORT_CONTRACT_INVALID` | The completed report conflicts with its contract or evidence. | Correct the producer or policy identity. Do not interpret the rejected report. |
| `lint.tool_execution_failed` | The stage maps any tool error to `blocked`. | Resolve the underlying operational code. |
| `lint.blocking_findings` | The stage maps active blocking findings to `request_fix`. | Correct the findings or use an approved expiring waiver. |

Configuration-specific errors such as `eslint-config-missing`,
`knip-config-missing`, `jscpd-config-missing`, and
`jscpd-test-config-missing` identify the missing native file directly.

The four `LINT_PROCESS_GROUP_*` strings originate in process inspection. They
do not always survive as the final tool-result code. The normalizer can expose
`lint-tool-execution-failed` while retaining the process message as error text.

> **Failure evidence:** [Tool errors are normalized without turning failure into success](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/lint/src/engine/report.ts#L104-L163).
> [Process execution distinguishes timeout, start failure, and cleanup failure](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/lint/src/engine/execution.ts#L8-L95).

## Verification Boundary

Focused tests cover local ESLint rules, type-evidence rules, discovery, adapter
authority, remediation behavior, cancellation, cleanup, and the live plugin
function. The live function also requires `shellcheck`, `shfmt`, and GNU
`flock` in its execution environment. BusyBox `flock` lacks the required
timeout behavior.

The tests prove the cases they execute. They do not prove every future finding
from an external analyser. Preserve external codes and investigate them against
the installed version.

> **Test evidence:** [The package test script lists the focused suites](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/lint/package.json).
> [The remediation suite covers process and policy boundaries](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/lint/tests/remediation.test.mjs).

## Rule Verification Record

| Claim | Implementation | Contract or setting | Test evidence and status on 2026-09-20 | Revision | Limit |
| --- | --- | --- | --- | --- | --- |
| The blocking ESLint groups and local discipline rules use the documented thresholds and exceptions. | [ESLint configuration](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/charts/kubeclaw/files/config/eslint.config.mjs#L65-L337) | [ESLint policy entry](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/charts/kubeclaw/files/config/lint-policy.json#L457-L484) | The discipline-rule suite passed. The generated-reference check also matched every configured rule ID. | `569f7b4933d4859cc67c80ddf40d5154ffd95ce5` | The focused suite tests repository-owned rules. It does not exhaust every upstream ESLint rule case. |
| The three type-evidence partitions use the documented local rules and production-only typed assertion rule. | [Local type-evidence plugin](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/charts/kubeclaw/files/config/type-evidence-eslint-plugin.mjs#L1-L307) | [Production configuration](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/charts/kubeclaw/files/config/eslint-type-evidence-config.mjs#L18-L84) | The type-evidence suite passed for production, test, and generated partitions. | `569f7b4933d4859cc67c80ddf40d5154ffd95ce5` | These tools remain experimental and do not block the shipped run. |
| The Semgrep inventory contains all 25 shipped repository rules. | [Semgrep configuration](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/charts/kubeclaw/files/config/.semgrep.yml#L1-L445) | [Semgrep policy entry](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/charts/kubeclaw/files/config/lint-policy.json#L878-L901) | The generated-reference and specialist-guide checks matched all 25 IDs. | `569f7b4933d4859cc67c80ddf40d5154ffd95ce5` | The recorded local checks did not execute Semgrep. |
| Engine-owned finding and operational code inventories match the scanned implementation families. | [Request errors](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/lint/src/request.ts#L1-L28), [candidate errors](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/lint/src/candidate.ts#L1-L27), and [tool normalization](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/lint/src/engine/report.ts#L104-L163) | [Generated code inventory](lint-policy-generated.md#generated-rule-and-code-inventory) | The generator and specialist-guide checks passed. The remediation suite passed all eight selected failure tests. | `569f7b4933d4859cc67c80ddf40d5154ffd95ce5` | External analyser codes are open sets. Some process errors become normalized tool errors while the original text remains evidence. |
