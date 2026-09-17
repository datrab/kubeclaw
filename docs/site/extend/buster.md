# Extend Buster Tests, Fixtures, Suites, And Reports

Status: implemented with stated execution limits
Audience: test provider author, suite maintainer, report adapter author
Owner: buster
Evidence: skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json; contracts/pipeline-test-gate/v1/suites; skills/nova/core/test-gates/resolver.ts; skills/buster/engine/test-gates/provider-loader.ts; skills/buster/engine/test-gates/runner.ts; skills/buster/engine/test-gates/report-adapter-runtime.ts
Evidence revision: `bcf032f241b432bf920baa9ee5f727947921447d`
Applies to: Buster test providers, fixtures, suite templates, and report adapters
Last verified: registry, resolver, runner, provider, and report checks on 2026-09-16

## Objective

Extend Buster without bypassing its plan, isolation, evidence, and decision rules.
This page explains four different extension tasks:

1. select or configure an installed test provider;
2. compose installed providers in a suite template;
3. implement a new test or fixture provider;
4. implement a report adapter for an existing report format.

Do not start by copying a provider. First decide whether an installed contract and a
new suite declaration can meet the need. A suite adds composition. It does not add
executable authority.

## Buster Data Path

The extension path has separate compilation and execution phases:

1. Foundation discovers provider and report registrations.
2. Nova reads the selected test scope from `.swarm/pipeline.json`.
3. Nova combines direct declarations and suite templates.
4. The resolver validates configs and ports, expands matrices, freezes provider
   package identity, and creates a deterministic plan.
5. Buster imports the plan and snapshots each provider package.
6. A sandboxed provider executes with a bounded workspace and capabilities.
7. Buster validates counts, evidence, reports, outputs, and cleanup.
8. Report adapters normalize selected report artifacts.
9. Buster stores attempts and produces a gate decision from actual node results.

The extension contract guide explains the supported contracts in that path. It does not teach the complete
project-file syntax or claim a deployed end-to-end pipeline run.

> **Scope loader:** [Nova reads only tests, fixtures, suites, coverage, and concurrency from the selected module or gate](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/core/test-gates/pipeline.ts#L12-L53).
>
> **Deterministic plan:** [The resolver validates scope, expands nodes, connects ports, binds the registry digest, and calculates the plan digest](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/core/test-gates/resolver.ts#L720-L754).

## Why Buster Separates Plans, Providers, And Reports

A single test script could execute work, parse output, and announce a verdict. That
design would hide which code ran and which evidence supported the verdict.

Buster uses three boundaries instead:

- the plan freezes selection, configuration, dependencies, limits, and identity;
- the provider executes one test or fixture and declares raw evidence;
- the report adapter converts one known report format to bounded common data.

**Benefit:** A reviewer can trace the decision from the plan to exact package bytes
and then to preserved evidence.

**Cost:** Authors must keep provider results, evidence declarations, ports, and
report formats consistent.

**Rejected alternative:** Buster does not accept an arbitrary command result as a
complete test decision. Process exit, structured report, and policy remain separate.

**Reconsider when:** A new evidence type has stable semantics that no current
provider result or report contract can express.

## Choose The Smallest Buster Change

| Need | Correct change | Why |
| --- | --- | --- |
| Change command, URL, threshold, browser, or policy within an installed contract | Provider configuration | Executable meaning already exists |
| Reuse several installed checks with common overrides and dependencies | Suite template | Composition needs a stable reusable name |
| Execute a new kind of test or fixture | Test provider | Buster needs new executable meaning |
| Parse a new report format | Report adapter | Execution already exists; normalization is missing |
| Add network, process, cluster, build, browser, or scan authority | Provider plus existing capability selection | Provider code must not access the host directly |
| Add a new capability name | Core, policy, runtime, and adapter change | Package-only work cannot expand authority vocabulary |

## Current Provider Surface

The current Buster packages register 19 provider contracts: 17 tests and two
fixtures. `retrySafe` is a contract claim, not a request from the project.

| Area | Contract IDs | Retry behavior |
| --- | --- | --- |
| Command and coverage | `kubeclaw.direct-command@1`, `kubeclaw.coverage-budget@1` | Retry-safe |
| HTTP and API | `kubeclaw.http@1`, `kubeclaw.security-headers@1` | Retry-safe |
| Stateful API flows | `kubeclaw.api-flow@1`, `kubeclaw.openapi@1`, `kubeclaw.demo-auth-smoke@1` | Not retry-safe |
| Browser | `kubeclaw.axe@1`, `kubeclaw.lighthouse@1`, `kubeclaw.visual@1` | Retry-safe |
| Browser E2E | `kubeclaw.playwright@1` | Not retry-safe |
| Build and size | `kubeclaw.container-build@1`, `kubeclaw.size-budget@1` | Retry-safe |
| Security scanning | dependency, image, Kubernetes policy, and Kubernetes runtime contracts | Retry-safe |
| Deployment fixture | `kubeclaw.kubernetes-fixture@1` | Not retry-safe fixture |
| Exposure fixture | `kubeclaw.tailscale-exposure@1` | Not retry-safe fixture |

The [package catalogue](plugin-catalogue/README.md) supplies per-package guidance.
This page explains the shared host and contracts.

## Suite Templates

A suite template is immutable composition data. It has a versioned contract ID and
can contain fixtures, tests, dependencies, input links, conditions, matrices,
concurrency groups, and evidence defaults. A project can select the suite, exclude
named nodes, override allowed fields, and add local nodes.

The resolver rejects hidden authority changes. Every node still resolves through an
installed provider contract and its schema. A suite cannot provide an executable,
grant a capability, increase policy maxima, or make a non-retry-safe provider safe.

The repository currently supplies 12 templates:

- accessibility, API, container build, browser E2E, HTTP, Kubernetes fixture;
- Lighthouse performance, security, size budget, Tailscale exposure, unit, visual.

Some templates intentionally contain no concrete test node. They supply a stable
contract and defaults for project-added configuration. An empty template is not proof
that a test ran.

### Suite resolution rules

- Suite contract IDs must be unique in the selected catalogue.
- Exclusion removes declared nodes before coverage evaluation.
- Overrides can narrow or configure an existing node; they do not replace its
  provider contract silently.
- Matrices expand only fields declared by the provider and remain within policy size.
- A project concurrency value can lower a suite value but cannot exceed policy.
- Conditions create explicit skipped nodes or omit excluded nodes as defined by the
  resolver; absence is not a passed result.
- Plan identity binds suite template digest, provider package digest, configuration,
  links, and policy-relevant expansion.

> **Template validation:** [The resolver validates template identity and builds a unique suite catalogue](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/core/test-gates/resolver.ts#L279-L329).
>
> **Executable resolver proof:** [The suite test covers exclusions, overrides, matrices, port links, retry safety, stable identity, and deterministic digest](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/tests/verification/contracts/check-pipeline-test-suite-resolver.mts#L102-L206).

### Change a suite safely

1. Confirm that every required provider contract already exists.
2. Create a new versioned suite ID when consumer meaning changes.
3. Give each node a stable local name and exact provider contract.
4. Add dependencies and port links explicitly.
5. Keep retry counts within provider and policy limits.
6. Give expensive or exclusive work a bounded concurrency group.
7. Run the suite resolver test and compare the plan digest twice.
8. Test exclusions, allowed overrides, skipped conditions, and invalid links.

The accessibility suite is a small reference. It selects one exact provider,
defines two profiles, and limits its browser concurrency. It adds no executable code.

> **Suite reference:** [The accessibility template binds one provider and its bounded configuration to one concurrency group](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/contracts/pipeline-test-gate/v1/suites/a11y.v1.json#L1-L19).

## Implement A Test Provider

Create a package with `testProviders` in `plugin.json`. One package can register
multiple independent contracts. Each registration needs:

- unique local `id` and versioned global `contractId`;
- `kind` set to `test` or `fixture`;
- module and factory export;
- strict configuration schema;
- typed input and output ports;
- required capabilities;
- truthful `retrySafe` value;
- allowed matrix fields and report formats;
- allowed evidence types and outcome-specific defaults.

The factory receives the immutable invocation and returns an instance. The instance
implements `execute` and can implement `cleanup`. Execution receives a bounded
workspace, abort signal, log method, and capability invocation method.

Do not import host process, network, Kubernetes, BuildKit, browser, or scanner access
as an authority shortcut. Use the capability that Buster supplies. The production
runtime maps only operator-enabled capabilities to implementations and validates the
associated configuration.

### Provider package identity

Before Buster imports code, it recalculates the package digest and copies the exact
package to an attempt-owned snapshot. The sandbox imports the snapshot, not mutable
source bytes. A digest mismatch stops execution.

The package must include all runtime dependencies that its bundle needs. A test that
passes only because the repository root supplies an undeclared dependency is not a
valid provider test.

> **Public provider SDK:** [The SDK defines the execution context, instance, cleanup, and factory contracts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugin-runtime/sdk/src/runtime.ts#L92-L125).
>
> **Snapshot and isolation:** [The loader checks digest, copies immutable bytes, and starts the sandbox session](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/engine/test-gates/provider-loader.ts#L37-L86).
>
> **Registry proof:** [The provider registry test verifies stable contract ownership, immutable package identity, schema validation, and conflicts](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/tests/verification/contracts/check-pipeline-test-provider-registry.mts#L90-L157).

## Build A Test Provider End To End

Use `kubeclaw.direct-command` as the structural reference. Do not copy its broad
output list when your provider has a narrower contract.

1. Create a directory under `skills/buster/plugins`.
2. Add `package.json`, `plugin.json`, a strict configuration schema, source, and tests.
3. Give the provider a new versioned `contractId`.
4. Declare exact value and artifact ports before implementation.
5. Declare only the capabilities, reports, matrices, and evidence types you use.
6. Set `retrySafe` from effect behavior, not from expected test stability.
7. Implement the factory and `execute` through the public provider context.
8. Implement `cleanup` when the provider owns temporary resources.
9. Validate counts, findings, reports, evidence, outputs, and limits in package tests.
10. Add the package ID to the Buster role and run the role-closure check.
11. Build the Buster bundle and confirm that the package snapshot contains its dependencies.
12. Resolve a plan and run one success, one failure, one cancellation, and cleanup.

The direct-command reference shows the complete connection. Its manifest declares
the contract and authority. Its provider validates configuration, invokes
`command.execute`, copies bounded evidence, and returns one normalized result. Its
test supplies a controlled capability and verifies both success and rejected input.

> **Reference manifest:** [The direct-command registration declares its contract, ports, capability, retry claim, reports, and evidence](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/direct-command/plugin.json#L1-L47).
>
> **Reference execution:** [The provider invokes bounded command authority and converts its result to evidence and outputs](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/direct-command/src/provider.js#L132-L205).
>
> **Reference test:** [The package test checks capability use, reports, artifacts, limits, and protected environment fields](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/direct-command/tests/live-function.test.ts#L7-L40).
>
> **Role inclusion:** [The Buster role lists the exact providers, adapters, packages, and external capability sources](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/packaging/runtime/roles/buster.json#L1-L60).

Package tests prove provider logic. Registry tests prove discovery and identity.
Role checks prove bundle selection. A runner test proves plan execution. Keep these
claims separate because one green test cannot replace the other three.

## Define Ports And Dependencies

A value port names a schema ID. An artifact port names one or more media types and can
also name a schema ID. The resolver connects an input to a specific upstream output.
It rejects missing ports, kind mismatch, schema mismatch, media-type mismatch, cycles,
and dependencies that cannot satisfy their accepted outcomes.

Use a fixture for a resource lifecycle that other tests consume. A fixture result
does not make a blocking or advisory quality decision. Its readiness and output feed
dependent nodes. Cleanup must run when the plan finishes, fails, or is cancelled to
the limits supported by the runner.

Do not pass an untracked filesystem path between providers. Declare a value or
artifact output so Buster can preserve identity, size, digest, ownership, and input
compatibility.

## Evidence Is A Contract

A provider result contains counts, findings, metrics, evidence files, report
references, produced outputs, process exit information, and provider-specific detail.
Buster validates the result before it becomes gate evidence.

Important rules include:

- total count equals passed plus failed plus skipped;
- a passed provider cannot report failed cases;
- evidence IDs and physical paths are unique;
- `runner-log` is reserved by Buster;
- every evidence type must be declared by the provider;
- every report must reference a declared `test-report` evidence file;
- every report format must be declared by the provider;
- output ports must match the registration;
- selected evidence depends on pass, fail, or error policy.

A provider must not return `passed` merely because its process exited zero if the
contract requires structured evidence that shows a failure.

> **Result checks:** [The runner validates counts, evidence uniqueness, evidence types, and report references before finalization](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/engine/test-gates/runner.ts#L322-L383).

## Retry, Cancellation, And Cleanup

The resolver assigns a retry only when the provider declares `retrySafe` and policy
permits a retry. The runner records each attempt. A later pass after an earlier failed
or incomplete attempt is unstable, not indistinguishable from a first-attempt pass.

Provider cancellation uses the execution context signal. The sandbox must terminate
the provider process and descendants within its limits. The provider must pass the
signal to capability calls and stop creating new work after abort.

Cleanup runs for provider-owned temporary state. Fixture cleanup is especially
important because dependent tests can finish while the fixture remains active. A
cleanup failure is evidence; do not convert it to a successful test result.

Set `retrySafe: false` when a new attempt can duplicate an external mutation or when
the provider cannot reconcile prior work. A suite or project cannot override this
decision to `true`.

## Implement A Report Adapter

Use a report adapter when a provider can produce a stable report artifact but Buster
does not understand its format. The registration names the format, contract version,
accepted media types, module, and export.

The adapter receives bytes and explicit limits. It returns normalized counts, cases,
findings, duration, and truncation facts. It receives no capability context and must
not execute the test, read arbitrary files, contact a service, or decide provider
authority.

Current production support includes one JUnit adapter. It accepts JUnit XML media
types and normalizes them under contract version 1. The registry permits more than
one installed adapter for a format. Plan resolution must select the exact package and
adapter identity so execution does not depend on discovery order.

> **Bounded adapter API:** [The SDK accepts only report bytes and limits and returns normalized evidence fields](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugin-runtime/sdk/src/runtime.ts#L127-L158).
>
> **Artifact admission:** [The report runtime checks artifact type, media type, size, cancellation, and runtime-root integrity](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/engine/test-gates/report-adapter-runtime.ts#L118-L153).

Use this authoring sequence:

1. Choose one stable format name and contract version.
2. List only media types that the parser actually accepts.
3. Parse from supplied bytes. Do not open paths from report content.
4. Bound nesting, text, cases, findings, duration, and captured output.
5. Return explicit truncation data when a limit removes information.
6. Test valid dialects, malformed input, unsafe paths, entity handling, and every limit.
7. Add the package to the Buster role and bind its exact identity during resolution.

The JUnit adapter is the maintained example. Its manifest has no capability request.
Its parser treats report text as untrusted input and creates stable finding IDs.

> **JUnit registration:** [The manifest binds one format and version to three accepted XML media types](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/junit-report-adapter/plugin.json#L1-L23).
>
> **Bounded parser:** [The adapter bounds XML depth, tag bytes, captured text, duration, file paths, and finding identity](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/buster/plugins/junit-report-adapter/src/adapter.js#L3-L143).

## Common Failures

| Error or symptom | Meaning | Correction |
| --- | --- | --- |
| `REGISTRY_TEST_PROVIDER_CONTRACT_CONFLICT` | Two providers own one contract ID | Rename or remove one contract; do not depend on order |
| `TEST_PROVIDER_MISSING` | The resolved plan names an unavailable contract | Install the locked package or resolve a new plan |
| `TEST_PROVIDER_PACKAGE_DIGEST_MISMATCH` | Package bytes changed after resolution | Restore exact bytes; create a new plan for new bytes |
| `TEST_PLAN_*_INVALID` | Suite, node, matrix, port, limit, or graph violates resolver policy | Fix the named declaration; do not bypass resolution |
| `TEST_PROVIDER_COUNTS_INVALID` | Result counts do not reconcile | Correct provider normalization |
| `TEST_PROVIDER_EVIDENCE_TYPE_INVALID` | Provider returned undeclared evidence | Add a truthful manifest declaration and review policy |
| `TEST_REPORT_ADAPTER_MISSING` | No locked adapter matches report reference | Install and select the exact adapter identity |
| `TEST_REPORT_ZERO_CASES` | Required report contained no case | Correct report production or requirement |
| `TEST_REPORT_NO_EXECUTED_CASES` | All cases were skipped where execution was required | Fix prerequisites; do not manufacture a passed case |

## Verification

Use the smallest applicable commands:

```bash
node tests/verification/contracts/check-pipeline-test-provider-registry.mts
node tests/verification/contracts/check-pipeline-test-suite-resolver.mts
npm run plugin-system:sandbox:build
node tests/verification/contracts/check-pipeline-test-plan-runner.mts
node tests/verification/contracts/check-pipeline-report-adapter-registry.mts
node tests/verification/contracts/check-pipeline-report-adapter-runtime.mts
npm test --prefix skills/buster/plugins/junit-report-adapter
```

Provider-specific packages can require browsers, BuildKit, Kubernetes, scanners,
network targets, or delegated cgroups. A skipped prerequisite is not a passed live
test. Each catalogue page records the exact command and known environment limit.

Current local results keep successful checks separate from unavailable ones:

| Check | Result on 2026-09-16 | Meaning |
| --- | --- | --- |
| Provider registry | Passed | Provider identity, schemas, and conflicts agree |
| Suite resolver | Passed | Composition, ports, retries, matrices, and plan identity agree |
| Report-adapter registry | Passed | Format ownership and exact adapter selection agree |
| JUnit package test | Passed | JUnit and Pytest dialects, input bounds, and unsafe XML checks agree |
| Sandbox build | Unavailable | This host has no `cc` executable |
| Test-plan runner | Unavailable | BusyBox `flock` prevents the persistent attempt store |
| Report-adapter runtime | Unavailable | The missing sandbox launcher stops execution first |

Do not replace an unavailable result with a pass from a smaller check. Run the
sandbox-dependent checks again on a host with a C compiler and GNU `flock`.

## Author Review

Before accepting a Buster extension, verify:

- the provider contract is new and cannot be expressed by configuration or a suite;
- every capability and constraint is explicit;
- input and output ports make all dependencies visible;
- retry safety is true only when a new attempt is safe;
- cancellation reaches all owned work;
- fixtures clean up on success, failure, and cancellation;
- evidence names, types, reports, counts, and limits agree;
- package digest and exact adapter identity survive plan transport;
- no test result is inferred from absence, process exit alone, or report count alone.
