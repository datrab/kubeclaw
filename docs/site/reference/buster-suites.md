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
quality mode. `retries` is permitted only when the provider declares
`retrySafe: true`. A retry creates a new attempt identity; it does not erase
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
> [Coverage validates requirement mapping and every resolved matrix variation](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/contracts/pipeline-test-gate/v1/src/coverage.ts#L1-L113).

## Suite Inventory

| Suite contract | Shipped nodes | Default concurrency | Main prerequisite |
| --- | --- | --- | --- |
| `kubeclaw.unit-suite@1` | None | `unit: 4` | Project test executable |
| `kubeclaw.container-build-suite@1` | None | `container-build: 1` | BuildKit and local OCI registry |
| `kubeclaw.kubernetes-fixture-suite@1` | None | `kubernetes-fixture: 2` | Namespace broker and checked manifest |
| `kubeclaw.http-suite@1` | None | `http: 8` | Approved origin or endpoint input |
| `kubeclaw.tailscale-exposure-suite@1` | None | `tailscale: 1`, `http: 2` | Retained deployment and Tailscale operator |
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
digest mismatch, unsafe path, or build failure is an error; a successful
process without digest proof is not a pass. Evidence is the bounded log.

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
Origin denial, timeout, size limit, cancellation, or transport failure errors.

> [HTTP suite](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/contracts/pipeline-test-gate/v1/suites/http.v1.json) ·
> [complete HTTP schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/http/schemas/config.schema.json)

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
A capability error stops more main requests, attempts cleanup, and remains an
error. The provider is not retry-safe.

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

The provider supports a bounded OpenAPI 3.0/3.1 subset and local references.
Unsupported assertions fail closed. The provider is not retry-safe because
selected operations can mutate state.

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
The reason has 8–1024 characters. The expiry uses an exact calendar date. An
expired acceptance is an execution error; it never silently restores a pass.

The retry-safe provider needs `browser.axe`. It records logs and test reports,
and adds screenshots on failure. Unaccepted violations fail. Invalid or expired
acceptance, unavailable browser, forbidden origin, timeout, or malformed result
errors. Browser availability and all three supported engines need live proof.

> [Accessibility suite](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/contracts/pipeline-test-gate/v1/suites/a11y.v1.json) ·
> [complete Axe schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/axe/schemas/config.schema.json) ·
> [Axe authority and evidence](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/axe/plugin.json)

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
`endpointName` are optional target selectors. `budget` names an operator-known
combined budget and is required by runtime policy for blocking performance.
`runs` is 1, 3, or 5. `acceptances[]` defaults empty. `timeoutMs` defaults to
120000 and ranges from 10000 to 180000.

Each acceptance requires `audit`, `route`, `reason`, and `expiresAt`. The audit
names one Lighthouse finding on one route. The reason has 8–1024 characters,
and the expiry uses an exact calendar date.

The retry-safe provider needs `browser.lighthouse`. It stores every performance
report and one complete median-score representative report. A budget breach or
unaccepted finding fails. Missing profile, forbidden origin, unavailable Chrome
or Lighthouse, timeout, or malformed report errors.

> [Performance suite and modes](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/contracts/pipeline-test-gate/v1/suites/perf.v1.json) ·
> [complete Lighthouse schema](https://github.com/datrab/kubeclaw/blob/3cf7dc4f72c2ae1e0ba4c47cceb08c98f4c70b7f/skills/buster/plugins/lighthouse/schemas/config.schema.json)

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
artifacts. A final failed test fails. Zero discovered tests, missing required
tests, invalid report, attachment limit, process failure, or cancellation
errors.

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
`maximumFileCount` set absolute limits. `matchingFiles[]` limits which archive
paths contribute. Each rule requires `id`, glob `pattern`, and `maximumBytes`;
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
  It rejects DTDs, entities, malformed XML, invalid durations, and excessive
  depth or size. It never changes the original report or the gate decision.

Their presence explains why the provider count is larger than the suite count.
Provider, suite, and report-adapter identities are different namespaces.

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

For a worked composition and diagnosis path, continue with
[Run and diagnose a Buster suite](../use/workflows/buster-suite.md). For a new
provider or suite contract, continue with [Extend Buster](../extend/buster.md).
