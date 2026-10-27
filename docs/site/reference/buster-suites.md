# Buster Suite and Provider Reference

Status: implemented with stated external prerequisites
Audience: pipeline author, operator, test maintainer
Owner: buster
Evidence: contracts/pipeline-test-gate/v1/suites; skills/buster/plugins
Evidence revision: `3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f`
Applies to: pipeline test-gate contract version 1
Last verified: all suite templates, providers, and schemas on 2026-09-19

## How To Read This Reference

KubeClaw ships **12 suite templates**. A template is a named composition of
fixtures and tests. It is not executable code. Each node selects a provider by
versioned contract ID. The provider manifest defines inputs, outputs,
capabilities, evidence, report formats, matrix fields, and retry safety. Its
strict JSON Schema defines configuration.

Several templates are intentionally empty. Selecting one of them does not run a
test. It supplies a stable suite identity and concurrency defaults for
project-defined nodes. This design lets a project choose its command, build
definition, deployment, endpoint, or budget without KubeClaw guessing it.

There is no thirteenth shipped template. The additional supported task is to
[create a project or platform suite](../extend/buster.md#suite-templates). That
path is documented with the same care, but it must not be counted as shipped
behavior.

## Why The Suite Model Uses These Rules

| Decision | Reason | Rejected alternative | Cost and consequence |
| --- | --- | --- | --- |
| Keep project-specific suites empty. | Only the project knows its command, image, endpoint, or budget. | Guess project behavior in a shared template. | A selected empty suite does not run until the project adds a node. |
| Use strict provider schemas. | A misspelled or unknown field must fail before execution. | Ignore unknown configuration and rely on provider defaults. | Schema evolution needs explicit compatibility work. |
| Connect nodes with typed ports. | Dependencies must show which exact value or artifact crosses the boundary. | Share untracked paths or infer data from node order. | Authors must declare both the dependency and the port link. |
| Let the provider own retry safety. | Only the provider contract knows whether repetition can duplicate an external effect. | Let each project mark any node as safe. | Some transient failures cannot use an automatic Buster retry. |
| Expand matrices during resolution. | Every variation needs a stable identity, limits, coverage, and evidence policy before execution. | Let a provider create hidden variations while it runs. | Large products are rejected by the operator matrix limit. |
| Separate fixtures from tests. | Resource lifecycle and quality decisions have different outcomes and cleanup duties. | Treat successful resource creation as a passed quality check. | Plans must retain fixture ownership until all consumers finish. |
| Generate the exact error-code index from source. | Operators need a complete lookup that cannot silently drift from emitted codes. | Maintain selected examples or wildcard families only. | A new emitted code makes the documentation gate fail until the index is reviewed. |

> **Authoritative inventory**
>
> [The suite directory contains the twelve versioned JSON templates](https://github.com/datrab/kubeclaw/tree/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/contracts/pipeline-test-gate/v1/suites).
>
> [Provider manifests bind every executable contract to a schema and declared authority](https://github.com/datrab/kubeclaw/tree/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins).

## Common Node Rules

Each test or fixture name is local to the resolved plan. `uses` selects the
exact provider contract. `config` must satisfy that provider's strict schema;
unknown fields fail. `needs` orders nodes. `inputs` connects a named input
port to one exact upstream output. A dependency alone does not transfer data.

`mode: blocking` contributes failure to the gate. `mode: advisory` records the
result without blocking the gate. A fixture supplies a resource and has no
quality mode. Positive `retries` requires `retrySafe: true` or the explicit
`acceptUnsafeRetry: true` acknowledgment, and must stay within the policy retry
limit. A non-retry-safe provider gets zero retries when `retries` is omitted.
A retry creates a new attempt identity; it does not erase
prior evidence. `concurrencyGroup` uses the resolved group limit.

A condition can produce `skipped`. An unavailable dependency can also skip a
consumer. A skipped node is not a pass. Required coverage still applies after
suite exclusions and condition evaluation. Buster distinguishes:

- `passed`: execution completed and all provider assertions passed;
- `failed`: execution completed and an assertion or budget failed;
- `errored`: execution could not produce a trustworthy assertion result;
- `skipped`: the declared condition or dependency prevented execution;
- `cancelled`: the job or attempt authority requested cancellation.

## Complete Test-Scope Syntax

The selected module or gate can contain only `suites`, `tests`, `fixtures`,
`concurrencyLimits`, and `coverage` as test-plan fields. Nova rejects unknown
fields inside this scope.

### Suite selection

| Field | Required/default | Resolution effect |
| --- | --- | --- |
| `uses` | Required | Select one versioned suite contract. |
| `exclude[]` | Empty | Remove named template nodes. Every name must exist. Coverage records the removal; it does not count it as pass. |
| `overrides.<node>` | Empty | Change any node field except `uses`. Configuration objects merge recursively; arrays and scalar values replace. Evidence outcomes merge independently. |
| `add.<node>` | Empty | Add a project test to this suite instance. It cannot replace a template node or add a fixture. |

Selected template nodes receive IDs `<suite-instance>/<local-node>`. A local
dependency or input reference inside the template or `add` receives the same
prefix automatically. A reference that already contains `/` remains explicit.
Top-level `tests` and `fixtures` keep their declared IDs.

### Test and fixture node

| Field | Required/default | Rule |
| --- | --- | --- |
| `uses` | Required | Versioned provider contract. Its registered kind must match test or fixture. |
| `config` | Empty object before provider defaults | Strict provider values. Matrix values merge last. |
| `mode` | Tests default to `blocking`; forbidden for fixtures | `blocking` or `advisory`. |
| `review.agent` | No review agent | Stable identifier for optional test review. Forbidden for fixtures. |
| `needs[]` | Empty | A node ID, or an object with `nodeId` and non-empty unique `acceptedResults`. A plain ID accepts only `passed`. |
| `inputs.<port>` | Empty | `from`, `output`, and optional `mediaType`. Provider declarations must prove compatible kinds, schemas, and media types. The link also creates dependency order. |
| `when` | Always eligible | One or more of `changedPaths`, `moduleType`, or `pipelineStage`. All declared condition families must match. |
| `timeoutMs` | Resolver-policy default | Positive integer no larger than the policy maximum. |
| `limits` | Each resolver-policy default | Optional `cpuMillis`, `memoryBytes`, `logBytes`, `artifactBytes`, `artifactFiles`, and `processes`. Each value cannot exceed policy. |
| `retries` | 1 for retry-safe providers; 0 for unsafe providers | Integer from zero through the policy maximum. |
| `acceptUnsafeRetry` | `false` | Must be explicitly `true` for a positive retry on an unsafe provider. This acknowledges risk; policy can still reject it. |
| `concurrencyGroup` | None | Stable group ID. Effective limit comes from suite, project, and operator policy. |
| `matrix.<field>[]` | No matrix | Non-empty JSON values. The provider must declare the field. Cartesian expansion must remain within policy. |
| `evidence.onPass[]` | Provider default | Evidence retained after pass. Every type must appear in the provider manifest. |
| `evidence.onFail[]` | Provider default | Evidence retained after assertion failure. |
| `evidence.onError[]` | Provider default | Evidence retained after execution error. |

`acceptedResults` can contain `passed`, `failed`, `skipped`, `errored`,
`cancelled`, and `timed_out`. Use a non-pass value only when the consumer has a
clear reason to inspect that state. It does not change the upstream result.

`changedPaths` uses project-relative glob patterns. Absolute paths and `..` are
invalid. `moduleType` and `pipelineStage` accept one string or a non-empty list.
A false condition gives the resolved node an explicit skip reason. The node
still exists for coverage and audit.

### Concurrency and matrix rules

A suite defines composition defaults. Project `concurrencyLimits` can lower an
existing suite group, but cannot raise it. A project can define a new group
within the operator maximum. When selected suites name the same group, the
resolver takes the lowest requested limit. A node without a group still counts
against the job-wide concurrency limit.

Matrix expansion sorts field names, computes the Cartesian product, and creates
IDs such as `http/matrix-001`. Each variation has a separate execution ID and
stable test identity. Every expanded variation named by a required coverage
check must pass; one passing variation does not cover its siblings.

### Coverage policy

`coverage` is a digest-bound `gate-coverage.v1` object. It contains `projectId`,
`kind` (`module` or `cumulative`), `baseRevision`, `modules[]`,
`integrationRequirements[]`, `requiredChecks[]`, and `policyDigest`. Each module
contains `moduleId`, `ownedPaths[]`, and requirements with `id` and `statement`.
Each required check contains `checkId`, `requirementRefs[]`, and pre-expansion
`nodeIds[]`.

Every requirement must map to a check. IDs and references must be unique. Module
coverage has exactly one module and no integration requirement. Cumulative
coverage applies at a gate. An excluded, missing, skipped, advisory, failed, or
errored required node leaves coverage unsatisfied. Coverage policy is
independent of how many suites were selected.

> [The resolver accepts the complete closed syntax and defines defaults](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/nova/core/test-gates/resolver.ts#L30-L220).
>
> [Suite merge, ID localization, exclusions, additions, and concurrency resolution](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/nova/core/test-gates/resolver.ts#L223-L393).
>
> [Coverage validates requirement mapping and every resolved matrix variation](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/contracts/pipeline-test-gate/v1/src/coverage.ts#L1-L112).

## E2E Fixture Coverage Policy

The E2E harness maintains a separate coverage policy in
[fixture-coverage.mjs](https://github.com/datrab/kubeclaw/blob/fe58209941f6aa597cc3e942959cf86906e451a4/tests/verification/e2e/fixture-coverage.mjs#L1-L60).
This is not the installed fixture-provider registry and does not add a shipped
suite. Its requirement statements describe intended checks, not observed passes.

`fixtureCoverage(projectId, baseRevision, modules, kind)` accepts module records
with `moduleId` and `ownedPaths`. It requires a lowercase hexadecimal base revision
of 40 or 64 characters and rejects unknown module IDs. For each selected module,
`moduleRequirements` supplies the `module-contract` statement. Module coverage
also adds `dependency-policy`, `artifact-budget`, and `registry-health`
requirements. Their checks point to `dependency-security`, `size-budget`, and
`health`; the module-contract check points to `unit/command`.

For cumulative coverage, `finalRequirements` supplies integration requirements.
Each integration check uses its requirement ID as its node ID; module-contract
checks instead use `unit/command-<moduleId>`. Only the exact `module` and
`cumulative` kinds are supported by the downstream contract. The function builds
`gate-coverage.v1`, computes `policyDigest` over the unsigned object, validates
the coverage contract, and returns it. Digest construction and contract
validation may reject the input; constructing a policy never executes its nodes
or proves that a deployment passed. Do not use this policy inventory as a list
of fixture-provider input/output ports.

| Policy map | Requirement ID | Statement |
| --- | --- | --- |
| `moduleRequirements` | `01-nginx` | Nginx listens on 8080 and provides the declared static document root and fallback routes. |
| `moduleRequirements` | `02-nginx` | The content branch contains its declared marker, HTML shape and ownership boundaries. |
| `moduleRequirements` | `03-nginx` | The asset branch contains its declared style, source marker and ownership boundaries. |
| `moduleRequirements` | `04-nginx` | The immutable runtime packages foundation and source files and composes the declared content and asset surfaces. |
| `finalRequirements` | `size-budget` | The assembled project stays within the declared artifact byte budget. |
| `finalRequirements` | `container-build` | The assembled project builds the selected immutable deployment image. |
| `finalRequirements` | `checked-manifest` | The checked deployment manifest is provided to the deployment and policy consumers. |
| `finalRequirements` | `health` | The deployed internal endpoint returns the expected application marker. |
| `finalRequirements` | `api-flow` | The deployed application satisfies the declared API flow. |
| `finalRequirements` | `openapi` | The deployed application satisfies the declared OpenAPI operation. |
| `finalRequirements` | `axe` | The deployed application meets the selected accessibility checks. |
| `finalRequirements` | `performance` | The deployed application meets the declared performance budget. |
| `finalRequirements` | `visual` | The deployed application matches the declared visual baseline. |
| `finalRequirements` | `playwright` | The deployed application passes its original browser interaction checks. |
| `finalRequirements` | `security-headers` | The deployed endpoint meets the configured response-header policy. |
| `finalRequirements` | `dependency-security` | The integrated dependency tree passes the selected vulnerability policy. |
| `finalRequirements` | `image-security` | The exact deployment image passes the selected image vulnerability policy. |
| `finalRequirements` | `kubernetes-policy-security` | The checked manifest passes the selected Kubernetes policy. |
| `finalRequirements` | `kubernetes-runtime-security` | The deployed workload passes the selected runtime policy. |
| `finalRequirements` | `public-http-health` | The transferred public endpoint serves the expected application marker. |

## Suite Inventory

| Suite contract | Shipped nodes | Default concurrency | Main prerequisite |
| --- | --- | --- | --- |
| `kubeclaw.unit-suite@1` | None | `unit: 4` | Project test executable |
| `kubeclaw.container-build-suite@1` | None | `container-build: 1` | BuildKit and local OCI registry |
| `kubeclaw.kubernetes-fixture-suite@1` | None | `kubernetes-fixture: 2` | Namespace broker and checked manifest |
| `kubeclaw.http-suite@1` | None | `http: 8` | Approved origin or endpoint input |
| `kubeclaw.tailscale-exposure-suite@1` | None | `tailscale-exposure: 1`, `http: 2` | Retained deployment and Tailscale operator |
| `kubeclaw.api-suite@1` | HTTP, flow, OpenAPI | `http: 8`, `api-flow: 4` | Service endpoint and project files |
| `kubeclaw.a11y-suite@1` | Axe | `browser-axe: 2` | Browser policy and endpoint |
| `kubeclaw.lighthouse-suite@1` | Performance, SEO, best practices | `lighthouse: 1` | Chrome/Lighthouse profiles and endpoint |
| `kubeclaw.visual-suite@1` | Visual comparison | `browser-visual: 2` | Reviewed baselines and exact browser |
| `kubeclaw.e2e-suite@1` | Playwright | `browser-playwright: 1` | Project Playwright configuration |
| `kubeclaw.security-suite@1` | Five security checks | One per scanner; headers 2 | Trivy, policies, manifest, image, cluster |
| `kubeclaw.size-budget-suite@1` | None | `size-budget: 4` | Upstream build artifact and limits |

## 1. Unit Suite

**Purpose:** Run project-owned unit or component tests through the generic
`kubeclaw.direct-command@1` provider. **Boundary:** It does not discover a test
command and does not grant arbitrary shell access. `executable` is an
operator-catalog name, and arguments are passed without a shell.

The shipped suite has no node. Add a direct-command test with:

| Configuration | Required/default | Meaning |
| --- | --- | --- |
| `executable` | Required | Approved executable name; 1–128 safe name characters. |
| `args[]` | Empty if omitted; max 256 | Literal arguments, each at most 4096 characters. |
| `workingDirectory` | `.` | Project-relative directory. |
| `environment` | Empty if omitted; max 64 | Declared string variables. Worker-owned variables remain protected. |
| `resultMode` | Required | `junit-required` or `exit-code`. |
| `reports[]` | Empty; max 16 | `id`, `format: junit`, relative `path`, and one supported XML media type. |
| `coverage[]` | Empty; max 8 | `id`, `format: lcov`, relative `path`, `mediaType: text/lcov`. |
| `artifacts[]` | Empty; max 8 | `id`, relative `path`, and an allowed artifact media type. |

The provider is retry-safe and requires `command.execute`. JUnit mode errors if
the report is absent, malformed, too large, or has no cases. Exit-code mode
passes only on exit zero. Evidence can include log, test report, coverage, and
declared artifacts. Use `kubeclaw.coverage-budget@1` as a dependent node when
coverage has a threshold; this keeps test correctness separate from coverage.

> [Unit suite template](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/contracts/pipeline-test-gate/v1/suites/unit.v1.json) ·
> [complete direct-command schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/direct-command/schemas/config.schema.json) ·
> [provider contract](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/direct-command/plugin.json)

## 2. Container Build Suite

**Purpose:** Produce one immutable image reference. **Boundary:** It does not
deploy or test the image. The empty template requires a project node using
`kubeclaw.container-build@1`.

`buildContext` and `definition` are required. `definition.type` selects
`dockerfile` or `template`. Dockerfile mode also requires `dockerfile` and
accepts optional `target` plus 32 non-secret `buildArgs`. Template mode requires
`definition.template: node-static@1`. `outputName` defaults to a safe form of
the module or node ID. `platform` defaults to `linux/amd64`. It must be a Linux
platform string and is the only permitted matrix field.

The provider is retry-safe, needs `container.build`, and returns required
`image` data. It passes only after Buster reads the pushed registry manifest
and matches its digest to BuildKit output. Tool absence, denied registry,
digest mismatch or unsafe path is an execution error. A completed build-phase
command with a nonzero integer exit, no kill and no signal returns a failed
provider result with no image output. Launch/resource/deadline/cancellation or
verification failures remain execution errors; a successful process without
digest proof is not a pass. Retain the failed attempt's log separately from
an errored execution. Use the [build-image recovery procedure](../use/workflows/build-image.md#5-bound-failure-and-retry-authority)
for uncertain push effects. Evidence is the bounded log.

> [Container suite](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/contracts/pipeline-test-gate/v1/suites/container-build.v1.json) ·
> [complete build schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/container-build/schemas/config.schema.json) ·
> [manifest and image output](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/container-build/plugin.json)

## 3. Kubernetes Fixture Suite

**Purpose:** Create an isolated deployment lease. **Boundary:** The fixture
does not build, expose, or test the workload. Its empty suite requires a
`kubeclaw.kubernetes-fixture@1` fixture node.

| Configuration | Required/default | Meaning |
| --- | --- | --- |
| `serviceName` | Required | DNS label for the service. |
| `servicePort` | Required, 1–65535 | Service port used in the typed endpoint. |
| `serviceTargetPort` | Optional, 1–65535 | Target port when different. |
| `image.reference`, `image.digest` | Optional direct image pair | Both required together; reference must already contain the same immutable digest. |
| `namespacePrefix` | `test` | Requested allowed prefix, maximum 42 characters. |
| `retention.mode` | `delete` | `delete` or `retain`. |
| `retention.seconds` | 1800; range 60–604800 | Requested bounded lifetime. Broker policy can reject or reduce it. |
| `readinessTimeoutSeconds` | 120; range 1–3600 | Maximum readiness observation time. |
| `secretReferences[]` | Empty; max 32 unique names | Operator-allowlisted source secrets. |
| `testCredentials.mode` | Optional; only `generate` | Ask the controller for lease-bound demo credentials. |
| `testCredentials.secretName` | Required with credentials | DNS label of the generated secret. |

The fixture requires a `checked-manifest` artifact. An upstream `image` value
is optional only because an immutable image can be present in configuration;
normal composition links build output. It needs `kubernetes.fixture`, is not
retry-safe, and returns `deployment`, `image`, and optional `demo-credentials`.
Cleanup releases the lease. An unresolved cleanup remains visible in the
result. See [namespace leases](../understand/buster-namespace-controller.md).

> [Fixture suite](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/contracts/pipeline-test-gate/v1/suites/kubernetes-fixture.v1.json) ·
> [complete fixture schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/kubernetes-fixture/schemas/config.schema.json)

## 4. HTTP Suite

**Purpose:** Make one bounded HTTP request and assert response facts.
**Boundary:** It does not deploy, expose, crawl, or run arbitrary methods. The
empty template expects `kubeclaw.http@1` project nodes.

`url` or `endpointName` selects an operator-approved target, unless a typed
deployment or endpoint input supplies it. `path` is optional: when omitted it
preserves a linked public endpoint path, otherwise a bare origin uses `/`.
`method` defaults to `GET` and also permits `HEAD`. `accept` defaults to `*/*`.
`expectedStatuses` lists accepted codes; `expectedText` and
`expectedContentType` add assertions. `maximumResponseBytes` defaults to
1 MiB and is bounded at 16 MiB. `requestTimeoutMs` defaults to 10 seconds and
is bounded at 300 seconds.

Only `path` can form a matrix. The retry-safe provider needs `network.http` and
emits log evidence. A reachable response that violates an assertion fails.
Exactly `HTTP_REQUEST_FAILED` and `HTTP_REQUEST_TIMEOUT` translate to failed
provider findings, using `http.connection` and `http.timeout` respectively.
Origin denial, size/integrity errors, cancellation and other capability errors
are rethrown as execution errors. A timeout with another error code does not
receive this translation. Diagnose the retained provider outcome and finding,
not a generic assumption that every network failure is an execution error.

> [HTTP suite](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/contracts/pipeline-test-gate/v1/suites/http.v1.json) ·
> [complete HTTP schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/http/schemas/config.schema.json)

> **Source evidence — failed results versus execution errors**
>
> **Claim:** HTTP and build adapters translate only their named failure branches. Other execution errors remain errors.
>
> **Implementation:** [HTTP translation](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/http/src/provider.js#L145-L175); [build result/output](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/container-build/src/provider.js#L116-L145).
>
> **Contract or setting:** [completed-build error split](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/engine/test-gates/container-build-runtime.ts#L260-L275). Image readiness still requires registry digest verification.
>
> **Test evidence:** [registry/launch/deadline assertions](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/container-build/tests/deadline.test.mts#L32-L58) are Source-only here. They were not run and do not prove a successful BuildKit build.
>
> **Revision:** `3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f`; each linked whole file matches current Source.
>
> **Limit:** No live HTTP request, image push, cleanup or retry result is asserted.

## 5. Tailscale Exposure Suite

**Purpose:** Turn a deployment fixture into one typed HTTPS endpoint.
**Boundary:** It does not assert page content and does not receive Kubernetes
credentials. Link its output to HTTP, API, browser, or E2E nodes.

The empty template expects a `kubeclaw.tailscale-exposure@1` fixture.
`retentionMode` is `release` or `await-readiness`; the latter requires a
retained deployment and transfers ownership to the durable readiness handoff.
`endpointName` and `hostname` select the declared endpoint. `path` defaults to
`/`. `readinessTimeoutSeconds` defaults to 120 and ranges from 1–3600.
`retentionMode` defaults to `release`.

The fixture requires the deployment input, needs `kubernetes.exposure`, is not
retry-safe, and returns `exposure`. It uses attempt and target identity plus a
lease generation fence. Cleanup cannot remove a successor's ingress. The
deployment lease retains final expiry authority; exposure does not extend it.

> [Tailscale suite](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/contracts/pipeline-test-gate/v1/suites/tailscale-exposure.v1.json) ·
> [complete exposure schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/tailscale-exposure/schemas/config.schema.json)

## 6. API Suite

**Purpose:** Check simple HTTP health, a stateful API flow, and selected OpenAPI
operations. **Boundary:** The three nodes are independent checks. A green health
request cannot replace contract or flow evidence.

The shipped template contains:

- blocking `http`, with `/health`, one retry, and group `http`;
- blocking `flow`, with `.swarm/api-flow.json`, no retry, and group `api-flow`;
- blocking `openapi`, with `.swarm/openapi.json` and operation `health`, no
  retry, and group `api-flow`.

HTTP fields are in section 4. API flow has these provider fields:

| Field | Required/default | Meaning |
| --- | --- | --- |
| `flowFile` | Required | Project-relative JSON flow file. |
| `url` | No direct URL | Absolute target URL. Do not set it with `endpointName` or a typed endpoint input. |
| `endpointName` | No named endpoint | Operator-approved endpoint name. |
| `requestTimeoutMs` | 10000; range 1–300000 | Default timeout for one request or WebSocket step. |
| `maximumResponseBytes` | 1048576; range 1–16777216 | Maximum accepted response bytes. |
| `maximumSteps` | 64; range 1–256 | Maximum combined setup, main, and cleanup steps. |

The flow document requires `schemaVersion` with value
`kubeclaw.api-flow.v1`. It accepts up to
64 scalar `variables`. `setup`, `steps`, and `cleanup` each contain bounded step
arrays. `steps` is required and must contain at least one executed main step.

Each step requires `id` and `path`. Optional `method` accepts `DELETE`, `GET`,
`HEAD`, `OPTIONS`, `PATCH`, `POST`, or `PUT`. Set `protocol: websocket` for a
WebSocket step. A step can also set `headers`, `body`, `messages`, `timeoutMs`,
`expect`, and `extract`.

`expect.status`, `expect.contentType`, `expect.bodyContains`, and `expect.json`
check HTTP responses. `expect.minimumMessages` and `expect.messageContains`
check WebSocket messages. `extract` maps up to 32 variable names to selectors.
A capability error stops further main requests. If the cancellation signal
has not been aborted, the provider attempts the declared cleanup steps, then rethrows
the original capability error. Cancellation takes precedence: it stops new
cleanup requests as well as new main requests. An already sent mutation may
remain in the target service. Preserve its request/response evidence and ask the
target owner to reconcile that state before another mutation; neither a cleanup
selection nor cancellation proves rollback. The provider is not retry-safe.

For exact nested limits, use the [generated provider configuration
reference](buster-provider-configuration.md#kubeclawapi-flow-document1). It
includes the 32-header limit, the 1–4096 character header values, the 64-message
limit, the 1–300000 millisecond step timeout, the 32-entry JSON expectation and
extraction limits, and the exact extraction-name pattern.

OpenAPI has these provider fields:

| Field | Required/default | Meaning |
| --- | --- | --- |
| `specFile` | Required | Project-relative OpenAPI JSON file. |
| `url` | No direct URL | Absolute target URL. It is exclusive with the other target selectors. |
| `endpointName` | No named endpoint | Operator-approved endpoint name. |
| `operations[]` | Required unless `tags` exists; max 128 | Exact operation selections and request values. |
| `tags[]` | Required unless `operations` exists; max 32 | Select all supported operations with one of these tags. |
| `requestTimeoutMs` | 10000; range 1–300000 | Timeout for one selected operation. |
| `maximumResponseBytes` | 1048576; range 1–16777216 | Maximum accepted response bytes. |

Each `operations[]` item requires `operationId`. Optional `pathParameters`,
`query`, and `headers` accept at most 32 entries. Optional `body` supplies the
request body. `expectedStatuses[]` accepts 1–16 unique HTTP status codes.
`cleanup` defaults to `false`; set it only for an operation that reverses prior
test state.

The provider supports a bounded OpenAPI 3.0/3.1 schema subset, not every JSON
Schema dialect. For each schema reached by runtime validation, it supports:

- Type and nullable checks, constants and enumerations; `allOf`, `anyOf`,
  `oneOf`, and `not` composition.
- String lengths and bounded patterns. `uuid` and `date-time` are the only
  admitted formats; date-time checking uses JavaScript's `Date.parse`, not a
  promise of complete RFC validation.
- Numeric minimum/maximum and exclusive bounds. OpenAPI 3.0 uses Boolean
  exclusive flags with its bounds; 3.1 uses numeric exclusive bounds.
- Array size, uniqueness, and `items`; object size, required properties,
  property schemas, and `additionalProperties`. Boolean child schemas apply:
  `items: false` rejects an actual array element, not an empty array.
- Local `#/...` references with cycle and depth checks. A `$ref` cannot have
  assertion siblings; annotations and `x-` extensions do not add validation.

The support check recursively inspects child schemas, including absent
properties and empty-array items. An unsupported keyword/format or malformed
child cannot disappear because this payload did not visit it. This is not a
preflight of every unselected operation or unused schema in the entire file.
Response-schema rejection can happen after an HTTP request has already reached
the service; it does not undo that request.

As with API flow, an ordinary capability error stops further non-cleanup
operations and attempts selected cleanup operations before rethrowing the
original error. Cancellation prohibits new cleanup requests. Reconcile possible
retained service state with its owner rather than treating either outcome as
successful cleanup or safe automatic retry. Selected operations can mutate
state, so the provider is not retry-safe.

> **Source evidence — API cleanup and runtime schema boundaries**
>
> **Claim:** Cancellation prevents new cleanup requests; OpenAPI checks only its explicit supported runtime schema subset, without rollback authority.
>
> **Implementation:** [API flow execution/cancellation](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/api-flow/src/provider.js#L125-L150), [OpenAPI execution/cancellation](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/openapi/src/provider.js#L200-L262) and [runtime schema validation](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/openapi/src/provider.js#L65-L123).
>
> **Contract or setting:** [Supported schema shapes, children, formats and reference siblings](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/openapi/src/schema-support.js#L1-L73). Cleanup must be explicitly declared; network grants remain separate from these schema rules.
>
> **Test evidence:** [API flow capability-error/cancellation assertions](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/api-flow/tests/remediation.test.ts#L48-L59) and [OpenAPI Boolean-child, unsupported-child and cancellation assertions](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/openapi/tests/remediation.test.ts#L39-L81) were read as Source. These tests were not executed for this documentation correction.
>
> **Revision:** `3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f`; The author compared each linked whole file with current Source before writing this explanation.
>
> **Limit:** No live request, successful cleanup, whole-spec preflight or remote-state reconciliation is asserted by this Source review.

Both complex providers need `network.http` and emit log plus test-report
evidence. Assertion mismatches fail; invalid project documents, unsupported
schema semantics, transport denial, timeout, or malformed response errors.

The [OpenAPI provider configuration
table](buster-provider-configuration.md#kubeclawopenapi1) records every nested
operation field. It also records the allowed string, number, and Boolean path or
query values and the 4096-character header-value limit. Use that table when you author configuration. Use this suite
section to understand why the provider has those boundaries.

> [Exact API suite composition](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/contracts/pipeline-test-gate/v1/suites/api.v1.json) ·
> [flow config](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/api-flow/schemas/config.schema.json) ·
> [flow-file contract](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/api-flow/schemas/flow.schema.json) ·
> [OpenAPI config](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/openapi/schemas/config.schema.json)

## 7. Accessibility Suite

**Purpose:** Find WCAG-related page violations with Axe in a real browser.
**Boundary:** It is not a general functional browser test and does not accept a
numeric violation allowance.

The shipped blocking node checks route `/` with desktop and mobile profiles,
tags `wcag2a` and `wcag2aa`, zero retries, and browser concurrency 2.
`routes` is required. Optional target fields are `url` and `endpointName`.
`profiles` defaults to desktop and mobile; `profileFile` selects project profile
data; `tags` defaults to the two shipped WCAG levels. `exclude[]` identifies
deliberately omitted selectors. `acceptances[]` must bind an exact rule, route,
selector, reason, and expiry. `timeoutMs` defaults to 30000 and ranges from
1000 to 120000.

Each acceptance requires `rule`, `route`, `selector`, `reason`, and `expiresAt`.
The reason has 8–1024 characters. The expiry must identify an exact calendar
date to take effect. An expired or invalid-calendar-date acceptance does not
suppress a matching violation: that violation remains unaccepted and fails the
scan. An acceptance with no matching violation does not by itself fail a scan.

The retry-safe provider needs `browser.axe`. It records logs and test reports,
and adds screenshots on failure. Unaccepted violations fail. Schema-invalid
configuration, unavailable browser, forbidden origin, timeout, or malformed
result errors. Browser availability and all three supported engines need live proof.

> [Accessibility suite](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/contracts/pipeline-test-gate/v1/suites/a11y.v1.json) ·
> [complete Axe schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/axe/schemas/config.schema.json) ·
> [Axe authority and evidence](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/axe/plugin.json)

### Browser-profile companion file

Axe's optional `profileFile` and Visual's required `profileFile` consume the
`kubeclaw.browser-profiles.v1` document, not provider configuration itself.
Start with the [complete profile example](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/contracts/pipeline-test-gate/v1/examples/browser-profiles.json).
Its top-level fields are `schemaVersion` and `profiles`. The contract requires
1–32 named profiles; names match `[A-Za-z0-9][A-Za-z0-9._-]{0,63}`.
Each profile is a complete object, with no other fields:

| Field | Companion-file contract |
| --- | --- |
| `browser` | Required: `chromium`, `firefox` or `webkit`. |
| `viewport` | Required object containing only integer `width` 240–3840 and `height` 240–2160. |
| `colorScheme` | Optional: `light`, `dark` or `no-preference`. |
| `reducedMotion` | Optional: `reduce` or `no-preference`. |
| `locale`, `timezoneId` | Optional nonempty strings, at most 128 characters each. |
| `hasTouch`, `isMobile` | Optional Boolean values. |
| `deviceScaleFactor` | Optional number from 0.5 through 4. |

Axe starts with Chromium `desktop` (1440×900) and `mobile` (390×844), then
replaces matching names with complete custom profiles. Both built-ins select
light/no-preference motion, en-US/UTC and scale 1; mobile enables touch/mobile.
Its default selection remains `desktop` and `mobile`; a custom name needs an
explicit `profiles` selection. Axe limits the JSON file to 262,144 bytes and
checks profile/viewport field names before invocation. The broker validates selected browser and optional context values again. That runtime accepts
positive viewport dimensions up to the same maxima, while the companion
contract requires the 240 minimum. Do not assume this loader runs the whole
companion JSON Schema on every unselected value.

Visual supplies no built-in profiles: every selected manifest profile must be
present in its file. It requires 1–32 entries, validates browser/viewport values,
and passes optional context fields to its broker for validation. Its profile
and baseline JSON files each have a 1-MiB ceiling. File paths must resolve to
regular files inside the selected repository; a schema-valid profile does not
install an engine or grant network access.

## 8. Performance Suite

**Purpose:** Measure performance, SEO, and best-practice facts with Lighthouse.
**Boundary:** Accessibility belongs to the Axe suite. Performance sampling is
not a load test.

The suite has three nodes. `performance` is blocking, uses mobile-standard,
budget `release`, and three runs. `seo` and `best-practices` are advisory, use
desktop-standard, and run once. All use `/`, the project settings file, no
retry, and one-at-a-time Lighthouse concurrency.

The provider requires `purpose`, `routes`, `settingsFile`, and `profile`.
`purpose` is `performance`, `seo`, or `best-practices`. `url` and
`endpointName` are optional target selectors. `budget` names a budget in the
project settings file; Nova requires it when resolving blocking performance
nodes. Performance uses 3 or 5 runs (default 3); SEO and best practices use
exactly 1 run. `acceptances[]` defaults empty. `timeoutMs` defaults to
120000 and ranges from 10000 to 180000.

Each acceptance requires `audit`, `route`, `reason`, and `expiresAt`. The audit
names one Lighthouse finding on one route. The reason has 8–1024 characters,
and the expiry must be a real calendar date that has not passed (valid through
the end of that UTC day). Only matching route/audit acceptances with a valid
expiry suppress SEO or best-practice failures; accepted findings remain
informational. Expired or invalid-calendar acceptances leave matching findings
unsuppressed, rather than causing an execution error on their own. Acceptances
do not suppress performance budget breaches.

The retry-safe provider needs `browser.lighthouse`. It stores every report and,
for performance, marks one complete median-score representative per route.
Budget metrics come from that representative report. A budget breach or
unaccepted finding fails. Missing profile, forbidden origin, unavailable Chrome
or Lighthouse, timeout, or malformed report errors.

> [Performance suite and modes](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/contracts/pipeline-test-gate/v1/suites/perf.v1.json) ·
> [complete Lighthouse schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/lighthouse/schemas/config.schema.json)

### Lighthouse settings companion file

`settingsFile` is a repository-contained JSON file, at most 262,144 bytes,
with exactly `schemaVersion: "kubeclaw.lighthouse-settings.v1"`, `profiles`
and `budgets`. The [complete settings example](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/contracts/pipeline-test-gate/v1/examples/lighthouse-settings.json)
contains both shipped profile names and a release budget. Profile/budget names
use the same 1–64-character name grammar as browser profiles.

`profiles` contains 1–32 complete objects. Each requires `formFactor`
(`mobile` or `desktop`), `screen`, and `throttling`; unknown fields reject.
`screen` requires exactly integer `width` 240–3840, integer `height` 240–2160,
`deviceScaleFactor` 0.5–4, and Boolean `mobile`. `throttling` requires exactly
`rttMs` 0–5000, positive `throughputKbps` at most 1,000,000, and
`cpuSlowdownMultiplier` 1–32. These numeric ranges allow fractions except
for dimensions. The executing broker additionally requires throughput at least
1 Kbit/s; a schema/provider-admitted value between zero and one still fails
there. The broker selects simulated throttling and enables screen emulation.

`budgets` may be empty or contain up to 32 named, nonempty objects. Each accepts
only `minimumScore` 0–100, `maximumLcpMs` 0–120000, `maximumCls` 0–10 and
`maximumTbtMs` 0–120000. Any subset is allowed, but not an empty budget.
Only configured thresholds produce performance checks; absence is not an
implicit zero threshold. The loader validates every profile and budget, then
requires the named `profile` and optional named `budget` to exist. A present
budget does not replace the separately documented representative-run selection
or the requirement to select a useful blocking budget.

## 9. Visual Suite

**Purpose:** Compare current browser images with reviewed Git baselines.
**Boundary:** The provider never creates or updates a baseline. Baseline review
is a separate human change.

The shipped blocking node uses `.swarm/visual/baselines.json`,
`.swarm/browser-profiles.json`, target `home-desktop`, comparison
`strict-v1`, zero retries, and browser concurrency 2.

`manifestFile`, `profileFile`, and non-empty `targets` are required. Optional
`url` or `endpointName` selects the origin. `comparisonProfile` defaults to
`strict-v1` and also permits `balanced-v1`. `overrides` changes declared target
thresholds within policy. `masks[]` handles named dynamic regions. `timeoutMs`
defaults to 30000 and ranges from 1000 to 120000.

`overrides.maximumDifferencePercent` accepts 0–100. It changes the permitted
share of different pixels. `overrides.pixelThreshold` accepts 0–1 and changes
the per-pixel comparison threshold. `overrides.uncertaintyMarginPercent`
accepts 0–100 and reserves a boundary for uncertain comparisons. An override
can make a declared target stricter or looser within operator policy.

Each `masks[]` item requires one `target` and 1–32 unique `selectors`. A mask
applies only to that named target. It does not hide a region in other targets.

The retry-safe provider needs `browser.visual`. Evidence includes log,
baseline, current image, difference image, and test report. A valid comparison
outside its threshold fails. Missing baseline, baseline digest mismatch,
browser family/version mismatch, invalid mask, forbidden origin, or malformed
PNG errors. Exact browser identity is a prerequisite, not incidental metadata.

> [Visual suite](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/contracts/pipeline-test-gate/v1/suites/visual.v1.json) ·
> [complete visual schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/visual/schemas/config.schema.json)

### Visual baseline companion file and identity

`manifestFile` uses `kubeclaw.visual-baselines.v2`, with 1–128 `entries` and
optional `baselineBundleDigest`; other fields reject. Each entry requires:

| Field | Required identity or input |
| --- | --- |
| `id` | Unique 1–128-character `[A-Za-z0-9][A-Za-z0-9._-]{0,127}` name selected by `targets`. |
| `route` | At most 1024 characters, begins `/` but not `//`, without query, fragment, CR or LF. |
| `profile` | Existing named profile in the companion file above. |
| `baselineFile` | Repository-contained PNG path; the schema requires a relative `.png` path without `..` segments. |
| `sha256` | Exact `sha256:` plus 64 lowercase hexadecimal digits for the PNG bytes. |
| `browser`, `viewport` | Exact selected browser family and profile width/height. |
| `browserVersion` | Actual approved capture's exact version string, 1–256 characters, trimmed and without control characters. |
| `pageConditions` | Exact context identity described below, with no other fields. |

`pageConditions` requires `colorScheme`, `reducedMotion`, `locale`, `timezoneId`,
`deviceScaleFactor`, `hasTouch`, `isMobile`, and `fullPage: true`.
The first four equal the selected profile values, or `null` when omitted.
Scale defaults to 1; touch/mobile default to `false`. Non-null colors/motion use
the profile enumerations; non-null locale/timezone are nonempty strings up to
128 characters. Dimensions and scale retain the profile contract's bounds.
Omitted profile settings are identity-null here, not an inferred browser
engine's default. Capture responses must match these conditions, target/route,
profile, masks and browser identity before pixel comparison.

The provider validates all entries, even unselected ones, against their profile
and regular PNG. Each PNG must be nonempty, at most the smaller of 64 MiB and
`invocation.limits.artifactBytes`, with a PNG/IHDR header. Width/height cannot
exceed 16384, and decoded RGBA size cannot exceed the invocation memory limit.
The file digest must match `sha256`; a supplied bundle digest must equal SHA-256
of the sorted entry digest strings joined with newline, without a trailing
newline. Baseline browser version must equal the actual capture version exactly.

The [complete manifest example](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/contracts/pipeline-test-gate/v1/examples/visual-baselines.json)
shows the shape, not verified PNG bytes or an approved capture: replace its
illustrative digests and version from real retained capture evidence. Keep the
[existing v1-to-v2 recapture/approval boundary](contracts.md#select-the-actual-versioned-reader).
Do not relabel old baselines, auto-approve a replacement or infer installed
browser availability from any of these files.

> **Source evidence — browser companion files and observed identity**
>
> **Claim:** Companion files define profile, budget and baseline identity separately from provider configuration.
>
> **Implementation:** [Axe loader](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/axe/src/provider.js#L35-L55); [Lighthouse loader](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/lighthouse/src/provider.js#L29-L69); [Visual manifest identity](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/visual/src/provider.js#L65-L111).
>
> **Contract or setting:** [browser profiles](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/contracts/pipeline-test-gate/v1/schemas/browser-profiles.v1.schema.json#L1-L18), [Lighthouse settings](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/contracts/pipeline-test-gate/v1/schemas/lighthouse-settings.v1.schema.json#L1-L22), [Visual v2 schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/contracts/pipeline-test-gate/v1/schemas/visual-baselines.v2.schema.json#L1-L23). Receiving validators: [Axe context](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/engine/test-gates/browser-axe-runtime.ts#L67-L100), [Visual context](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/engine/test-gates/browser-visual-runtime.ts#L64-L99), [Lighthouse profile](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/engine/test-gates/browser-lighthouse-runtime.ts#L50-L76).
>
> **Test evidence:** [browser-version and legacy-manifest assertions](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/visual/tests/browser-identity.test.mjs#L16-L53) were read, not run. They do not prove engine availability or every companion-field check.
>
> **Revision:** `3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f`; each linked whole file matches current Source.
>
> **Limit:** No live capture, new baseline approval, browser installation or deployed scan is asserted.

## 10. End-to-End Suite

**Purpose:** Run project-owned Playwright tests against a typed or approved
endpoint. **Boundary:** KubeClaw does not rewrite test selection, assertions,
authentication setup, Playwright retries, screenshots, video, or trace policy.

The shipped blocking node uses project directory `.`, config file
`playwright.config.ts`, four workers, a 600000 ms timeout, zero Buster retries,
and browser concurrency 1.

`projectDirectory` and `configFile` are required. `url` and `endpointName` are
optional target selectors. `workers` defaults to 4, ranges from 1 to 64, and is
also capped by the attempt process limit. `timeoutMs` defaults to the attempt
timeout and ranges from 1000 to 3600000. `minimumExecutedTests` defaults to 1
and ranges from 0 to 100000; blocking mode still enforces at least one.
`requiredTests[]` defaults empty and names tests that must appear exactly once
as executed.

The provider is not retry-safe and needs `browser.playwright`. It forces a JSON
reporter, no maximum-failure early exit, and an attempt-owned output directory.
It emits logs, test reports, screenshots, video, traces, and bounded test
artifacts. Unexpected test failures fail. In a usable report, an insufficient
executed-test count, unexecuted tests, or a required title that is missing,
ambiguous, skipped, or unexecuted also produces a failed result. A flaky test
that passes under the project retry policy is not itself a failure. Zero
discovered tests, invalid report, attachment limit, or execution failure without
a reported failed test is an error.

Nova validates imported provider details before it accepts the result. It emits
`TEST_PROVIDER_E2E_DETAILS_INVALID` when the detail object has unknown fields,
does not use `test-provider.e2e.v1`, or fails the closed E2E-result schema. This
is a result-contract failure, not a failed browser assertion. Preserve the raw
result and compare the provider and Nova contract versions before retrying.

> [E2E detail validation](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/contracts/pipeline-test-gate/v1/src/validation.ts#L55-L69)

> [E2E suite](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/contracts/pipeline-test-gate/v1/suites/e2e.v1.json) ·
> [complete Playwright schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/playwright/schemas/config.schema.json)

## 11. Security Suite

**Purpose:** Combine five distinct security decisions. **Boundary:** The suite
does not make one scanner authoritative for every surface. All five shipped
nodes are blocking, retry-safe, use strict-v1 policy, and have zero configured
retries. Headers has concurrency 2; every scanner group has concurrency 1.

| Node and provider | Required input | Configuration | Failure meaning |
| --- | --- | --- | --- |
| `security-headers`, `kubeclaw.security-headers@1` | Deployment value | Required `profile` (`web-https-v1` or `api-http-v1`), non-empty `paths`, and `policy`; optional `requestTimeoutMs` and per-header `rules` | The live response violates required header policy. |
| `dependency-security`, `kubeclaw.dependency-scan-trivy@1` | Repository | Required `projectDirectory` and `policy`; optional `timeoutMs` 1000–900000 | The dependency inventory contains a policy-blocking finding. |
| `image-security`, `kubeclaw.image-scan-trivy@1` | Immutable image value | Required `policy`; optional `timeoutMs` 1000–900000 | The scanned image contains a policy-blocking finding. |
| `kubernetes-policy-security`, `kubeclaw.kubernetes-policy-security@1` | Checked-manifest artifact | Required `policy`; optional `timeoutMs` 1000–300000 | Static Kubernetes content violates policy. |
| `kubernetes-runtime-security`, `kubeclaw.kubernetes-runtime-security@1` | Deployment and checked manifest | Required `policy`; optional `timeoutMs` 1000–300000 | Deployed state differs from the allowed runtime security posture. |

Every `policy` requires `profile: strict-v1`. Optional `acceptances[]` has at
most 128 entries. Each entry requires exact `findingId`, a reason of 8–1024
characters, and an `expiresAt` date-time. The fixed policy blocks critical and
high findings, active threats, and vulnerabilities without fixes. An
acceptance suppresses blocking only while its exact ID and expiry are valid.

The exact acceptance fields are `acceptances[].findingId`,
`acceptances[].reason`, and `acceptances[].expiresAt`.

Header `requestTimeoutMs` defaults to 10000. Header `rules.add[]` and
`rules.replace[]` contain at most 32 entries with `id`, `header`, `severity`,
`kind`, and an optional `value`; `kind` is `present`, `equals`, `contains`, or
`hsts-min-age`. `rules.remove[]` contains at most 32 unique rule IDs.
Dependency and image scan timeouts default to 300000. Kubernetes policy and
runtime scan timeouts default to 120000. Header `rules` can narrow named
requirements; they cannot grant network access. The providers need
`network.http`, `security.scan`, or `kubernetes.runtime-security` according to the provider
and emit logs.

A policy finding fails. Missing Trivy or database, stale or unavailable scan
data, forbidden target, input digest mismatch, timeout, cancellation, malformed
scanner output, or cluster read failure errors. Real provider verification
needs Trivy, a populated advisory database, registry access for image scans,
and a disposable cluster for runtime checks. Unit tests alone do not prove
those dependencies.

> [Exact five-node security suite](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/contracts/pipeline-test-gate/v1/suites/security.v1.json) ·
> [all five provider contracts](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/security-providers/plugin.json) ·
> [strict configuration schemas](https://github.com/datrab/kubeclaw/tree/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/security-providers/schemas)

## 12. Size Budget Suite

**Purpose:** Measure a build artifact and compare it with absolute or growth
limits. **Boundary:** It does not build the artifact and does not decide which
files belong to a release. The empty suite expects a
`kubeclaw.size-budget@1` project node.

`format` defaults to `auto` and can be `file`, `tar`, or `tar-gzip`.
`maximumTotalBytes` and
`maximumFileCount` set limits on the whole measured artifact. Each
`matchingFiles[]` rule separately sums the bytes of paths matching its glob;
it does not filter the overall byte or file totals. Each rule requires `id`,
glob `pattern`, and `maximumBytes`;
`requireMatch` defaults to `true`. `maximumGrowthBytes` and `maximumGrowthPercent` compare with
the optional baseline input. `largestFiles` selects 1–100 retained diagnostic
entries and defaults to 10. `matchingFiles[]` defaults empty. All budget fields
are optional at schema level so an advisory measurement can emit
facts, but a useful blocking node must declare at least one enforced limit.

The retry-safe provider requires a `build-output` artifact and no host
capability. It accepts an optional prior `baseline`, and returns a canonical
new baseline. Evidence includes log and baseline. Exceeded limits fail. Unsafe
archive paths, malformed archive, digest or size mismatch, missing required
baseline for a growth rule, decompression limit, or unsupported format errors.

> [Size suite](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/contracts/pipeline-test-gate/v1/suites/size-budget.v1.json) ·
> [complete size schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/size-budget/schemas/config.schema.json) ·
> [ports and evidence](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/size-budget/plugin.json)

### Baseline artifact, admission and growth

The emitted artifact has media type
`application/vnd.kubeclaw.size-budget-baseline+json`, marker
`schemaVersion: "size-budget-baseline.v1"`, and these fields:

| Field | Measurement retained |
| --- | --- |
| `sourceDigest`, `sourceMediaType` | The measured input artifact's digest and media type. |
| `format` | Resolved `file`, `tar` or `tar-gzip`. |
| `totalBytes` | Sum of measured file payload bytes, without archive padding. |
| `storedBytes` | Original input artifact size. |
| `compressedBytes` | Original size for tar-gzip; otherwise `null`. |
| `fileCount` | Number of measured files, not directory entries. |

A prior baseline must use that media type and pass file/size/digest admission,
including the fixed 1-MiB baseline ceiling. Its JSON must have the exact marker,
a nonnegative safe-integer `totalBytes`, and a string `sourceDigest`.
Those are the baseline-specific semantic checks: the loader does not validate
every emitted field or require the old digest to equal the new input's digest.
Different approved source artifacts are the point of a growth comparison.

Growth bytes are current total minus prior total; percentage uses that delta
divided by the prior total. Zero to zero is 0%; zero to a positive total is
unbounded and fails a configured percentage rule. A missing baseline errors
when configuration selects either growth rule. After valid measurements, even failed
budget checks emit a new baseline artifact. That is measurement evidence, not
permission to select it as the approved baseline or weaken a budget. Retain the
original failed result and let the release owner approve any baseline change.

> **Source evidence — size baseline admission and growth**
>
> **Claim:** A measured baseline remains evidence after budget failure; selecting a new approved baseline is a separate decision.
>
> **Implementation:** [admission/growth/output](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/size-budget/src/provider.js#L247-L294) and [checks and failed-result emission](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/size-budget/src/provider.js#L301-L355).
>
> **Contract or setting:** [baseline artifact port](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/size-budget/plugin.json#L28-L48). Prior digest identity does not require matching the current artifact.
>
> **Test evidence:** [measurement/output and equal-baseline growth assertions](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/size-budget/tests/live-function.test.ts#L49-L78) were read, not run. Zero-baseline behavior here comes from the implementation, not a new test result.
>
> **Revision:** `3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f`; each linked whole file matches current Source.
>
> **Limit:** No artifact release, baseline reapproval, archive execution or retention migration is asserted.

## Source-fixed parser admission ceilings

These bounds are implementation contracts, not provider/operator settings.
They are separate from configured test budgets and invocation resource limits.

| Input | Source-fixed admission boundary | Safe next action |
| --- | --- | --- |
| LCOV | At most 64 MiB and 2,000,000 `DA:` records per input; duplicate records still count toward the record ceiling. | Supply a conforming report; do not raise `minimumLinePercent` or assume combined evaluation removes the per-input ceiling. |
| JUnit | At most 256 XML stack frames and 64 nested suites. Tag-end scanning has a 65,536-UTF-16-unit window, despite the constant name `MAXIMUM_TAG_BYTES`. | Supply shallower XML or shorter tags. Retained case/finding limits do not raise these parser ceilings. |
| OpenAPI | Object-schema support/response validation and local-reference traversal use depth guards at 64. | Simplify schema/reference depth; this is not a configurable JSON-Schema dialect expansion. |
| Size | Build input at most 512 MiB; tar-stream expansion and measured totals at most 2 GiB; at most 100,000 regular archive files. Baseline JSON is at most 1 MiB. | Supply a conforming smaller artifact; neither size budgets nor worker concurrency/capacity raise these ceilings. |

If the supported contract genuinely needs larger bounds, stop for an explicit
implementation/schema/security review and owning checks. Do not retry the same
rejected input by tuning an unrelated runtime budget. Keep the first diagnostic
and distinguish it from genuinely configurable limits such as a request timeout.
The [generated error reference](buster-error-codes.md) remains separately owned;
its regeneration is not a manual edit to this table.

> **Source evidence — fixed parser ceilings versus configured budgets**
>
> **Claim:** Source-fixed admission ceilings require conforming inputs or a reviewed implementation change, not runtime tuning.
>
> **Implementation:** [LCOV constants and record counter](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/coverage-budget/src/provider.js#L5-L38); [JUnit depth/tag constants](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/junit-report-adapter/src/adapter.js#L3-L8) and [tag scan](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/junit-report-adapter/src/adapter.js#L104-L114).
>
> **Contract or setting:** [OpenAPI support guard](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/openapi/src/schema-support.js#L44-L73) and [Size constants](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/size-budget/src/provider.js#L7-L10) define separate parser boundaries.
>
> **Test evidence:** This catalogue has no combined ceiling-test execution receipt. This catalogue reports the linked Source constants and rejection branches, not an observed larger-input run.
>
> **Revision:** `3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f`; each linked whole file matches current Source.
>
> **Limit:** Configured budgets cannot authorize inputs outside these fixed contracts. No new parser or resource exception is introduced.

## Additional Installed Providers

These providers are installed but do not define another shipped suite:

- `kubeclaw.coverage-budget@1` consumes one required and up to seven optional
  LCOV artifacts. `minimumLinePercent` is 0–100; `combine` defaults to `true`
  and controls combined or weakest-input evaluation. Both fields are optional at schema level. A
  blocking use needs a minimum.
- `kubeclaw.demo-auth-smoke@1` consumes deployment, generated credentials, and
  exposure. It verifies unauthenticated denial, JSON login, a protected
  response, exact username, and declared business assertions. It is deliberately
  not retry-safe because a lost response can leave a live session. All fields
  are required: `protocol` must be `json-session.v1`; `loginPath`,
  `usernameKey`, `passwordKey`, `cookieName`, `protectedPath`, and
  `usernamePointer` identify the exact flow; `assertions[]` contains 1–16
  objects with a JSON `pointer` and scalar `equals` value.
- The JUnit report adapter parses bounded XML into common case and finding data.
  It rejects DTD/custom declarations, malformed XML, invalid durations, and
  excessive depth or size. Built-in/numeric references are not categorically
  forbidden; see [JUnit input forms and normalization](#junit-input-forms-and-normalization).
  It never changes the original report or the gate decision.

Their presence explains why the provider count is larger than the suite count.
Provider, suite, and report-adapter identities are different namespaces.

### Demo session protocol and partial-login recovery

`kubeclaw.demo-auth-smoke@1` tests one declared JSON-session flow, not an
arbitrary login form or browser cookie jar. Its [configuration schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/demo-auth-smoke/schemas/config.schema.json)
checks shape; the [protocol validator](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/demo-auth-smoke/src/protocol.js#L10-L43)
applies additional runtime restrictions:

- `usernameKey`, `passwordKey` and `cookieName` must match
  `[A-Za-z][A-Za-z0-9_-]{0,63}`. Username and password keys must differ; the
  schema's 2,048-character string limit alone does not establish admission.
- Login and protected paths must be canonical absolute paths on the exposure
  origin, without a query, fragment, backslash or `//` authority form. Paths,
  keys and pointers passed through `text()` must be nonempty, at most 2,048
  JavaScript UTF-16 code units, and contain no NUL/CR/LF.
- JSON pointers must start with `/`, use only valid `~0`/`~1` escapes and exclude
  the literal segments `__proto__`, `constructor` and `prototype`. Each assertion
  has exactly `pointer` and `equals`; its pointer must differ from
  `usernamePointer`. Equality is strict against a string of at most 2,048
  JavaScript UTF-16 code units, a finite number or a boolean. Unlike `text()`,
  the equality-string check permits empty strings and NUL/CR/LF. A missing own property is an
  assertion error, not an absent-value match.

The [input validator](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/demo-auth-smoke/src/protocol.js#L44-L79)
requires exactly the three manifest-declared native value links, with the
`deployment`, `credentials` and `exposure` schema IDs shown in the
[package catalogue](../extend/plugin-catalogue/kubeclaw.demo-auth-smoke.md).
It checks the declared lease/namespace, immutable image/manifest digest,
credential-source Secret identity and digest, and pending exposure's owner,
lease UID and positive generation. Deployment, exposure and handoff expiry must
agree and be in the future. The exposure URL must be canonical HTTP(S), without
URL credentials, query or fragment. These checks reconcile supplied native
values; this provider does not fetch the cluster or Secret to establish their
provenance. Its authentication output alone does not establish readiness or
replace Nova's final native-link/source checks.

The [provider](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/demo-auth-smoke/src/provider.js#L28-L59)
first requires an unauthenticated protected GET to return 401 or 403. It then
POSTs the generated credentials as JSON, requires login status 200 or 204, and
sends the accepted cookie on a protected GET. That response must be status 200
with the exact content type `application/json`; its JSON must match the generated
username and all independent business assertions. Network policy must grant the
selected origin, POST, and the content-type/cookie headers. Each request has a
65,536-byte response limit and uses the earlier of the invocation deadline and
exposure expiry. Cancellation/deadline checks can reject a response after the
request has already taken effect.

Only the [strict session-cookie subset](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/demo-auth-smoke/src/protocol.js#L81-L107)
is supported. One `set-cookie` string must name exactly `cookieName`, have a
nonempty supported cookie value, contain no comma/CR/LF and be at most 4,096
JavaScript UTF-16 code units. These runtime string limits are distinct from
JSON Schema string-length rules, which count Unicode code points. An explicit absolute `Path` must cover both configured routes at a
path-segment boundary. `HttpOnly` is required; HTTPS requires `Secure`, while
HTTP rejects it. `Secure` and `HttpOnly` cannot carry values. `SameSite`, when
supplied, must be Strict, Lax or None; None additionally requires Secure.
`Max-Age`, when supplied, must be a positive decimal of one to nine digits with
no leading zero. Attribute names are case-insensitive. Duplicate or unsupported
attributes, including Domain and Expires, are rejected rather than interpreted
as a general browser cookie policy. For example, `demo_session=token; Path=/;
HttpOnly; Secure` illustrates the accepted shape for HTTPS when the configured
name is `demo_session`; it is not a credential or an executed login result.

| Result or error | Observed boundary and safe next action |
| --- | --- |
| Passed provider result | All three checks passed. The returned `authentication` value binds native invocation/lease/image/credential/exposure identities, protocol digest, time and three status/body-digest pairs. It emits no cookie or response body. It is not a Ready transition. |
| `DEMO_AUTH_PATH_INVALID`, `DEMO_AUTH_KEY_INVALID`, `DEMO_AUTH_POINTER_INVALID` or `DEMO_AUTH_ASSERTION_INVALID` | Protocol admission failed before requests. Correct the named configuration against the runtime rules; do not substitute a broader schema-only interpretation. |
| `DEMO_AUTH_INPUT_*`, `DEMO_AUTH_SOURCE_MISMATCH`, `DEMO_AUTH_PROVENANCE_REQUIRED`, `DEMO_AUTH_CREDENTIAL_DIGEST_MISMATCH` or `DEMO_AUTH_EXPOSURE_*` | Linked values or their lineage/expiry are unacceptable. Stop and reconcile the original fixture/credential/exposure producers; do not copy identities from another attempt or bypass provenance with an HTTP-200 probe. |
| `DEMO_AUTH_NEGATIVE_CONTROL_FAILED` | The unauthenticated endpoint did not deny access with 401/403. Diagnose the declared protected route/application policy before proceeding; no login has been sent by this flow. |
| `DEMO_AUTH_LOGIN_FAILED` | Login did not return 200/204. Diagnose the application without assuming a failed status proves no remote session or other effect was created. Do not blindly repeat the POST. |
| `DEMO_AUTH_SESSION_COOKIE_INVALID` or `DEMO_AUTH_SESSION_COOKIE_SCOPE_INVALID` | Login has already returned success, but its cookie failed admission. Stop; inspect the application's cookie contract without logging cookie values. A Domain attribute is one concrete rejected case. Fix the application/configuration and resolve the possible existing session before a new attempt. |
| `DEMO_AUTH_PROTECTED_*`, `DEMO_AUTH_IDENTITY_MISMATCH`, `DEMO_AUTH_ASSERTION_MISSING` or `DEMO_AUTH_BUSINESS_ASSERTION_FAILED` | The authenticated request/body/assertion failed after login. Retain the original failure and investigate that application state; successful login is not a passed business test. |
| `DEMO_AUTH_CANCELLED`, `DEMO_AUTH_DEADLINE_EXPIRED`, `DEMO_AUTH_HTTP_EVIDENCE_INVALID` or a failed network invocation | Determine the last attempted request from bounded owning evidence. A missing/late response does not prove the request had no effect. Stop on uncertain login outcome rather than inventing a successful receipt. |

A successful login can leave an application session even when cookie parsing,
authenticated-body checks, cancellation or a later deadline prevents a result.
The provider has no logout or reconciliation operation and is explicitly
[not retry-safe](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/demo-auth-smoke/plugin.json#L44-L47).
The application's owner must invalidate or expire that session through its own
supported mechanism before deciding whether a new attempt is safe. Removing a
plugin registration or cleaning Buster's artifacts is not session deletion.
Do not claim remote cleanup, replay safety, deployed readiness or a successful
live login from this source-backed description. The package's
[README and bounded test claims](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/demo-auth-smoke/README.md)
remain distinct from a compiled native deployment or operator execution.

## Inputs, Outputs, and Composition

| Typed value or artifact | Typical producer | Typical consumer |
| --- | --- | --- |
| `kubeclaw.container-image@1` | Container build | Kubernetes fixture, image scan |
| checked Kubernetes YAML | Direct command or policy preparation | Kubernetes fixture, static and runtime security |
| `kubeclaw.kubernetes-deployment-fixture@1` | Kubernetes fixture | HTTP, API, browsers, headers, runtime security, exposure |
| `kubeclaw.generated-demo-credentials@1` | Kubernetes fixture | Demo authentication smoke |
| `kubeclaw.public-endpoint-fixture@1` | Tailscale exposure | HTTP, API, Axe, Lighthouse, visual, Playwright |
| `text/lcov` | Direct command | Coverage budget |
| build archive | Direct command or build packaging | Size budget |
| size baseline | Size budget | Later size-budget comparison |

A link must name the producer node, output port, consumer node, and input port.
Schema and media types must match. The resolver rejects a link that relies only
on similar names. This makes data movement visible in the plan and prevents a
test from reading an undeclared file or resource.

## Evidence and Reports

Evidence is immutable attempt output. A provider can declare only types in its
manifest. Buster checks relative path safety, file presence, digest, size,
duplicate IDs, and outcome-specific requirements before storage. Logs are
runner-owned evidence. A report is evidence plus a declared format that an
installed adapter can normalize.

The current report adapter supports JUnit XML. Normalization can cap retained
case details, but the original report remains stored and the adapter still
validates the complete document. A provider result with a missing required
report is an error, even when its process returned zero.

### JUnit input forms and normalization

The adapter accepts a `testsuite` root or a `testsuites` container, including
nested suites. Direct `testsuites/testcase` children are supported for Node's
reporter shape. Their stable suite path uses the container's `name`, defaulting
to `testsuites`; nested cases use their enclosing suite names. Missing suite
names receive ordinal fallbacks. Case IDs include suite path, class/name and
case ordinal, so repeated names do not collapse into one result.

Each case begins passed. `failure` records a failed case; `error` takes precedence
over failure; `skipped` applies while the case remains passed. Observed cases,
not declared suite count attributes, determine totals. Durations are finite,
nonnegative decimal seconds, converted to milliseconds, with a 30-day per-case
ceiling. The adapter emits normalized data; it does not reread source files,
change the report artifact or decide the pipeline gate.

During entity decoding, the adapter accepts the named references `amp`, `lt`,
`gt`, `quot`, `apos` and valid decimal/hexadecimal numeric references. Invalid XML
characters and unknown/malformed references reject when decoded. DTD/custom
entity declarations are forbidden; escaped text or CDATA containing declaration
characters is text, not a declaration. XML syntax continues to be parsed after
retained-detail caps. Issue text capture is bounded at 8192 UTF-16 units and
normalized displayed text at 4096 units; omitted text is not evidence of a full
retained diagnostic. Use the [SDK report contract](sdk.md#test-providers-and-report-adapters)
for complete/truncated counts and omitted-detail relationships.

> **Source evidence — JUnit forms, entities and normalized results**
>
> **Claim:** JUnit supports nested suites and direct-container cases; permitted character references are distinct from forbidden declarations.
>
> **Implementation:** [entity decoder](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/junit-report-adapter/src/adapter.js#L28-L63) and [root/suite/case admission](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/junit-report-adapter/src/adapter.js#L214-L257).
>
> **Contract or setting:** [XML completion and retained-result rules](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/junit-report-adapter/src/adapter.js#L316-L365). Buster retains the original report separately from normalized detail caps.
>
> **Test evidence:** [nested/direct-container/entity/truncation assertions](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/junit-report-adapter/tests/adapter.test.mjs#L12-L55) were read, not run. They are not a live adapter-sandbox or full-report acceptance result.
>
> **Revision:** `3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f`; each linked whole file matches current Source.
>
> **Limit:** This path grants no arbitrary file reads, report mutation, new parser dialect or pipeline decision authority.

## Report Adapter Registration

The installed JUnit adapter is declared by package `kubeclaw.junit-report@1.0.0`
using `pipeline-plugin-v2`. Report formats are not declared by the production
runtime configuration loader: that loader assembles the package registry.
The adapter manifest declares the following fields; the format identifies the
report protocol, while the module and export identify its normalization code.

| Adapter ID | Manifest field | Declared value |
| --- | --- | --- |
| `junit` | `id` | `junit` |
| `junit` | `format` | `junit` |
| `junit` | `contractVersion` | `1` |
| `junit` | `module` | `src/adapter.js` |
| `junit` | `export` | `adapt` |
| `junit` | `mediaTypes` | `["application/junit+xml","application/xml","text/xml"]` |

The provider declares its permitted report formats separately. Each returned
report must reference retained `test-report` evidence. The runner selects an
adapter by package, adapter ID, format, and contract version, then supplies the
stored artifact to the adapter runtime. A matching manifest alone does not prove
that a provider emitted a valid artifact or that sandbox execution succeeded.

Sources: [adapter manifest](https://github.com/datrab/kubeclaw/blob/36adbf27e408e8c3f429a09d0dd1c5de94c33694/skills/buster/plugins/junit-report-adapter/plugin.json#L1-L23),
[provider report validation and adapter selection](https://github.com/datrab/kubeclaw/blob/36adbf27e408e8c3f429a09d0dd1c5de94c33694/skills/buster/engine/test-gates/runner.ts#L357-L379),
and [retained artifact consumption](https://github.com/datrab/kubeclaw/blob/36adbf27e408e8c3f429a09d0dd1c5de94c33694/skills/buster/engine/test-gates/runner.ts#L1474-L1497).

## Error Codes and Safe Actions

An error code identifies the boundary that could not produce trustworthy test
facts. A failed assertion is a provider result with findings, not an
exception code. Preserve the complete code suffix because it can contain the
node, field, port, or artifact that failed.

Use the [exact Buster error-code reference](buster-error-codes.md) to find every
code emitted by the shipped suite providers. The table below is the shorter
routing view. It groups codes by the operator action that they require.

| Suite or boundary | Code families and important exact codes | Safe action |
| --- | --- | --- |
| Plan and suite | `TEST_PLAN_SUITE_*`, `TEST_PLAN_NODE_*`, `TEST_PLAN_CONFIGURATION_INVALID`, `TEST_PLAN_MATRIX_*`, `TEST_PLAN_DEPENDENCY_*`, `TEST_PLAN_PORT_*`, `TEST_PLAN_COVERAGE_*` | Correct the declaration or installed registry. Do not send an unresolved plan. |
| Unit and reports | `DIRECT_COMMAND_*`, `TEST_REPORT_*`, `JUNIT_*`, `COVERAGE_*` | Check catalogue executable, paths, exit, report/LCOV bytes, and declared outputs. Keep JUnit required when the tool supports it. |
| Container build | `CONTAINER_BUILD_*` | Check repository paths, definition, BuildKit, registry policy, pushed manifest, and digest equality. |
| Kubernetes fixture | `KUBERNETES_FIXTURE_*` | Check image/manifest inputs, lease status, broker authorization, credentials, readiness, and cleanup. Do not bypass the lease. |
| HTTP | `HTTP_CONFIG_*`, `HTTP_INPUT_*`, `HTTP_TARGET_*`, `HTTP_REQUEST_FAILED`, `HTTP_REQUEST_TIMEOUT`, `HTTP_RESPONSE_INVALID` | Separate invalid declaration, target selection, transport failure, and assertion findings. |
| Tailscale exposure | `TAILSCALE_EXPOSURE_*` | Check deployment lease, selected endpoint, ingress owner/generation, Tailscale readiness, handoff, and release. |
| API flow | `API_FLOW_*` | Validate the flow file, variables, dependencies, bounded steps, origin policy, response limits, and cleanup result. |
| OpenAPI | `OPENAPI_*` | Validate the document and selected operation against the supported subset; then inspect request and response facts. |
| Accessibility | `AXE_*` and `BROWSER_AXE_*` | Check target, profile, route, acceptance expiry, browser policy, and bounded result. |
| Performance | `LIGHTHOUSE_*` and `BROWSER_LIGHTHOUSE_*` | Check target, settings, profile, budget, Chrome launch, network evidence, and representative report. |
| Visual | `VISUAL_*` and `BROWSER_VISUAL_*` | Check baseline contract/digest, browser identity, masks, target selection, PNG limits, and comparison output. |
| End-to-end | `PLAYWRIGHT_*` and `BROWSER_PLAYWRIGHT_*` | Check project/config paths, target, process isolation, JSON report, executed-test minimum, required titles, and attachments. |
| Security | `SECURITY_*`, `DEPENDENCY_SCAN_*`, `IMAGE_SCAN_*`, `KUBERNETES_POLICY_*`, `KUBERNETES_RUNTIME_SECURITY_*` | Check strict policy, acceptance expiry, database evidence, immutable inputs, scanner result, and live cluster proof. |
| Size budget | `SIZE_BUDGET_*` | Check input and baseline digests, archive safety, glob rules, decompression limits, and blocking budget presence. |
| Remote engine | `BUSTER_REMOTE_*`, `BUSTER_SOURCE_*`, `TEST_PROVIDER_*`, `TEST_REPORT_ADAPTER_*` | Diagnose admission, store, package, attempt, evidence, result, and import in that order. Never translate an integrity error into a test failure. |

The code family is stable for operator routing. The generated exact reference
must stay equal to the provider and capability sources. Do not infer retry
safety from `TIMEOUT` or `FAILED`. Use the provider contract and attempt state.

## Configuration Precedence

1. The versioned suite supplies nodes and defaults.
2. A permitted suite override changes the selected node fields.
3. Project-local nodes add explicit work and links.
4. Provider schema validation rejects unknown or invalid configuration.
5. Nova policy caps matrices, retries, and concurrency.
6. Buster operator policy supplies capability endpoints and stricter runtime
   limits; it cannot make an invalid plan valid.

An omitted value is not automatically a provider default. The tables above say
when the schema defines a default. Otherwise the provider or capability must
derive it explicitly, or validation fails. Never infer a default from an
example.

## Verification Matrix

| Change | Minimum checks | Environment claim |
| --- | --- | --- |
| Suite composition | `npm run verify:test-gate:suite-resolver` | Deterministic local contract proof. |
| Provider manifest/schema | `npm run verify:test-gate:provider-registry` and package tests | Discovery, identity, schema, and provider logic. |
| Runner or evidence | `npm run verify:test-gate:plan-runner` | Local execution-contract proof. |
| One concrete provider | Its `verify:test-gate:*implementation` script | Read the script; some checks need real tools or network. |
| Namespace fixture | `go test ./cmd/buster-namespace-controller/...` plus Helm rendering | Controller logic and rendered policy, not live cluster proof. |
| Browser, scanner, BuildKit, registry, Kubernetes, or Tailscale | Provider check in a disposable configured environment | Live integration proof. |

### Exact suite checks

Use the implementation command after a schema, provider, runtime, or report
change. Use the live command only in its configured environment. A preflight
command proves that dependencies and policy are ready; it does not replace the
implementation command.

| Suite | Local implementation check | Live or production check |
| --- | --- | --- |
| Unit | `npm run verify:test-gate:phase8` | `npm run verify:test-gate:unit-live` |
| Container build | `npm run verify:test-gate:container-build-implementation` | `npm run verify:test-gate:container-build-live` |
| Kubernetes fixture | `npm run verify:test-gate:kubernetes-fixture-implementation` | `npm run verify:test-gate:kubernetes-fixture-live` |
| HTTP | `npm run verify:test-gate:http-implementation` | `npm run verify:test-gate:http-live` |
| Tailscale exposure | `npm run verify:test-gate:tailscale-exposure-implementation` | `npm run verify:test-gate:tailscale-exposure-live` |
| API | `npm run verify:test-gate:api-implementation` | `npm run verify:test-gate:api-cutover` |
| Accessibility | `npm run verify:test-gate:a11y-implementation` | `npm run verify:test-gate:a11y-live` |
| Performance | `npm run verify:test-gate:lighthouse-implementation` | `npm run verify:test-gate:lighthouse-live` |
| Visual | `npm run verify:test-gate:visual-implementation` | `npm run verify:test-gate:visual-live` |
| End-to-end | `npm run verify:test-gate:e2e-implementation` | `npm run verify:test-gate:e2e-live` |
| Security | `npm run verify:test-gate:security-implementation` | `npm run verify:test-gate:security-live` |
| Size budget | `npm run verify:test-gate:size-budget-implementation` | `npm run verify:test-gate:size-budget-production` |

API and size budget have no live alias. Their right-hand commands are the
strongest registered production-boundary checks. A successful check does not
claim that an unrelated external target is healthy.

### Configure, execute, and diagnose each suite

The commands above are maintained verification programs. The `implementation`
commands use controlled fixtures and prove provider behavior without claiming
that an external service is ready. A `live` command uses configured external
dependencies or submits a real remote plan. Read its source before use because
the source defines required environment variables and safety checks. Never set
an environment flag only to make a precondition disappear.

For a project run, put the configuration described below in the applicable
test scope, resolve it, and let Nova submit it as described in the
[operator workflow](../use/workflows/buster-suite.md#supported-execution-paths).
The platform operator must first enable the matching capability in the
[Buster runtime configuration](buster-runtime-configuration.md#capability-blocks).
For a repository proof, first complete the canonical
[Locked Dependency Installation](../use/quickstart.md#locked-dependency-installation),
then run the exact command from the repository root. A command must exit zero
and print its final success record. Keep the
command, output, Git revision, and external target identity together.

| Suite | Project configuration that makes work explicit | Executable repository proof | What to inspect first when it fails |
| --- | --- | --- | --- |
| Unit | Select `kubeclaw.unit-suite@1`; add a `direct-command` node with an operator-catalog executable and a declared JUnit path. Start from `unit-suite-blocking.json`. | `npm run verify:test-gate:phase8`; use `npm run verify:test-gate:unit-live` only with the remote token, source key, and configured Buster route required by its source. | Catalogue denial or process start means runtime policy. A zero exit with missing or invalid JUnit means report production, not transport. |
| Container build | Add `kubeclaw.container-build@1` to the empty suite; select exactly one Dockerfile or template definition and an allowed Linux platform. | `npm run verify:test-gate:container-build-implementation`; then `npm run verify:test-gate:container-build-live` where BuildKit and the target registry are configured. | Separate BuildKit execution from registry manifest read-back. A pushed digest that cannot be read and matched is an error. |
| Kubernetes fixture | Add a manifest-producing node and link its checked-manifest output to `kubeclaw.kubernetes-fixture@1`; use an immutable image and bounded retention. | `npm run verify:test-gate:kubernetes-fixture-implementation`; the remote production path is `npm run verify:test-gate:kubernetes-fixture-live`. | Inspect broker authorization, lease phase, manifest/image binding, readiness, and cleanup in that order. Preserve a retained lease expiry. |
| HTTP | Add `kubeclaw.http@1` with an approved direct target or a typed deployment/exposure input, expected statuses, and bounded response size. | `npm run verify:test-gate:http-implementation`; use `npm run verify:test-gate:http-live` for the complete remote fixture path or the explicitly gated `http-capability-live` check for one in-cluster origin. | Distinguish origin-policy denial and transport error from a received response that violates an assertion. |
| Tailscale exposure | Link a retained deployment to `kubeclaw.tailscale-exposure@1`; choose `release` or the durable `await-readiness` handoff and an allowed host suffix. | `npm run verify:test-gate:tailscale-exposure-implementation`; use `npm run verify:test-gate:tailscale-exposure-live` only with the cluster, Tailscale operator, immutable image, and remote credentials required by the script. | Inspect deployment ownership, exposure generation, ingress status, handoff, and release. Never delete an object owned by a newer generation. |
| API | Select `kubeclaw.api-suite@1`; provide `.swarm/api-flow.json` and `.swarm/openapi.json`, then override target selection and operations for the project. | `npm run verify:test-gate:api-implementation`; `npm run verify:test-gate:api-cutover` is the strongest registered boundary check, not a general external API health test. | For flow, inspect the first failed step and cleanup result. For OpenAPI, inspect supported-subset validation and operation selection before network evidence. |
| Accessibility | Select `kubeclaw.a11y-suite@1`; provide the endpoint and optional project profile, and use only exact, reasoned, expiring acceptances. | `npm run verify:test-gate:a11y-implementation`; use `npm run verify:test-gate:a11y-live` with the configured browser and remote endpoint path. | Separate browser launch or origin denial from Axe violations. An expired acceptance cannot suppress a violation; a matching violation remains a failed finding, not an execution error. |
| Performance | Select `kubeclaw.lighthouse-suite@1`; provide the settings file, profile, target, and operator-known budget for blocking performance. | `npm run verify:test-gate:lighthouse-implementation`; use `npm run verify:test-gate:lighthouse-live` with its Chrome, target, and remote-runtime prerequisites. | Inspect Chrome launch and bounded report parsing before score or audit findings. Compare the retained median representative with all run summaries. |
| Visual | Select `kubeclaw.visual-suite@1`; commit a reviewed baseline manifest, images, browser profile, and exact browser identity. | `npm run verify:test-gate:visual-implementation`; use `npm run verify:test-gate:visual-live` only in an environment with the required browser and target. | Check baseline digest and browser family/version before pixel findings. A provider failure must not update the baseline. |
| End-to-end | Select `kubeclaw.e2e-suite@1`; commit the Playwright configuration and tests, set a positive blocking test minimum, and declare required test titles where omission matters. | `npm run verify:test-gate:e2e-implementation`; use `npm run verify:test-gate:e2e-live` with the sandbox, browsers, remote endpoint, and credentials declared by the script. | Inspect sandbox/process admission, Playwright JSON, executed-test count, required titles, and attachment limits before individual assertions. |
| Security | Select `kubeclaw.security-suite@1`; link its deployment, image, and checked manifest; configure strict policies and exact expiring acceptances. | `npm run verify:test-gate:security-implementation`; use `npm run verify:test-gate:security-live` only with Trivy databases, registry access, cluster observation, endpoint, and remote runtime ready. | Route by node. Check database freshness for Trivy, response evidence for headers, immutable input binding for static scans, and observation freshness for runtime security. |
| Size budget | Add `kubeclaw.size-budget@1` to the empty suite, link one build-output artifact, and set at least one blocking absolute or growth limit. | `npm run verify:test-gate:size-budget-implementation`; `npm run verify:test-gate:size-budget-production` proves the production boundary without an external build service. | Check artifact digest and archive safety before budget findings. A growth rule without a valid baseline is an error. |

The empty suites need an added project node. The composed suites still need
their project files, targets, and typed inputs. A resolver success with no node
in an empty suite proves only that the declaration is valid; it does not prove
that a test ran. The final result must name an attempt for every required node,
show a passed gate decision, import all evidence, and prove cleanup or bounded
retention.

For a worked composition and diagnosis path, continue with
[Run and diagnose a Buster suite](../use/workflows/buster-suite.md). For a new
provider or suite contract, continue with [Extend Buster](../extend/buster.md).
