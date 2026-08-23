# Pipeline Test-Gate Design Record

Status: design discussion in progress

This document records accepted decisions, open decisions, and source audits for
the pipeline test-gate extension work.

This work concerns tests that run in pipeline quality gates. It does not concern
the repository verification harness under `tests/`.

## Writing Rules

This document uses an ASD-STE100-inspired style:

- Use short sentences.
- Put one main idea in each sentence.
- Use common words where possible.
- Define each necessary technical term.
- Avoid long groups of technical nouns.

## Discussion Method

Work through one phase at a time.

For each phase:

1. Describe the current state.
2. State the problem.
3. List a small set of choices.
4. Recommend one choice.
5. Record the selected choice.
6. Continue to the next phase.

## Design Phases

1. Define the system structure and terms.
2. Define how tests are enabled and disabled.
3. Review each of the 13 current suites.
4. Define the provider extension model.
5. Define test plans and dependencies.
6. Define results, evidence, and gate decisions.
7. Define security and provider installation.
8. Define migration and proof requirements.
9. Create the implementation plan.

## Decision Log

### D-001: Base System Structure

Status: accepted on 2026-08-04

The system has these parts:

- **Provider**: Knows how to perform one execution type. Playwright, Lighthouse,
  BuildKit, and Kubernetes deployment are examples.
- **Test**: One configured use of a provider. Running Playwright tests from
  `tests/e2e` is an example.
- **Fixture**: Prepares a bounded resource that tests need. It owns setup,
  readiness, typed outputs, and cleanup. A deployed application is an example.
- **Suite**: A named group of tests.
- **Gate**: Selects tests or suites. It applies the pipeline blocking policy.
- **Agent**: A reasoning process. It can review evidence or perform bounded QA
  actions when the gate enables it.

The main responsibilities are:

- KubeClaw controls the pipeline lifecycle.
- Buster runs tests in isolation.
- Providers return test facts and artifacts.
- Fixtures report preparation status and typed outputs.
- A deterministic gate rule handles clear pass or fail results.
- An agent can review results that need judgment.
- An agent can perform human-style QA through granted capabilities.
- A suite groups tests. It does not execute tests.

The system handles results in three ways:

1. **Clear result**: A normal rule decides pass or fail. No agent is needed.
2. **Uncertain result**: An agent reviews the evidence if `pipeline.json`
   configures the agent for that work. A visual difference is an example.
3. **Active QA**: An agent performs bounded actions. It can click a control,
   observe the user interface, call an API, and check expected logs. Providers
   record the actions and results as evidence.

An agent is optional. Active QA can run in a final Buster gate or during module
development.

Agent actions are bounded by explicit capabilities. The runtime records each
action and result as evidence. An agent cannot create its own objective success
evidence.

Built-in tests are provided tests. They are not a special runtime class. A
provided test and an imported custom test use the same contracts.

### D-002: Testkube Use

Status: accepted direction on 2026-08-04

Testkube is a design source. It is not a runtime dependency.

KubeClaw will adopt useful test execution ideas. KubeClaw will not add a second
pipeline lifecycle or a second general workflow authority.

### D-003: Test Activation Is an Allowlist

Status: accepted on 2026-08-04

The project workflow file is a closed allowlist for tests.

- A declared test is enabled.
- An absent test is disabled.
- Buster cannot run an undeclared test.
- A newly installed provided test cannot start by default.
- A newly imported custom test cannot start by default.

A test declaration does not need an `enabled: true` field. Disabled tests do
not need placeholder entries.

Provider activation is separate from test activation. An installed provider
does not run a test until the project workflow declares that test.

### D-004: Provided Test Documentation

Status: accepted on 2026-08-04

Each provided test must have a user document. The document must state:

- What the test checks.
- What the test does not check.
- Which provider and version it uses.
- Which inputs it needs.
- Which capabilities it needs.
- Which configuration fields it accepts.
- Which result states it can return.
- Which artifacts it produces.
- How pass or fail is calculated.
- How to declare the test in the project workflow.
- How to read common failures.

The provider schema remains the machine-readable source. The user document
explains the same contract in clear language.

Provided tests and imported custom tests use the same runtime contract. The
documentation can identify a test as provided, but the runtime cannot give it
a special execution path.

### D-005: Pipeline File Name

Status: accepted on 2026-08-04

The project workflow file is `.swarm/pipeline.json`.

The old name `.swarm/progress.json` is removed. The implementation will not
support a compatibility alias or a transition period.

The change is an atomic cutover. The implementation must rename the file and
update all readers, writers, validators, tools, tests, diagrams, and user
documents in the same change.

The name `pipeline.json` describes the file because it defines the desired
pipeline. Runtime progress and status belong in separate runtime state and
event records.

### D-006: Blocking and Advisory Tests

Status: accepted on 2026-08-04

A declared test is blocking by default.

An advisory test must set `mode` to `advisory`. An advisory test runs and
produces evidence. Its result cannot block the pipeline.

The normal blocking case does not need a `mode` field. This keeps common test
declarations small. It also makes weaker enforcement explicit.

### D-007: Agent Activation

Status: accepted on 2026-08-04

An agent can run only when `.swarm/pipeline.json` explicitly declares its use.
An available agent is never active by default.

A test can request an agent to review evidence that needs judgment. A clear
result does not start the review agent.

Active QA is a declared test. Its declaration names the agent, instructions,
and granted capabilities. The provider records the agent actions and evidence.

The same test activation rules apply to active QA. An absent active-QA test
does not run.

### D-008: Retire the Manifest Test

Status: accepted on 2026-08-04

The current `manifest` suite is retired as a provided Buster test.

Static manifest validation belongs in the lint system. The migration must
preserve and improve the useful checks from the current suite.

The lint system must:

- Run YAML validation.
- Run Kubernetes schema validation for raw YAML and rendered Helm charts.
- Support selected project policy rules.
- Support custom policy packs.
- Report exact files and lines when the tool can supply them.
- Preserve checks for required environment variables, Secret references,
  private registries, health probes, and resource limits.

The live Kubernetes test remains separate. It applies resources and checks
cluster behavior. Static lint findings must not be duplicated in Buster.

### D-009: Separate Container Build From Deployment

Status: accepted on 2026-08-04

The current `build` suite is replaced by a provided `container-build` test.

The test builds a container image with BuildKit. It returns an immutable image
reference, image digest, duration, logs, and build metadata.

The test does not deploy the image. It does not create a Kubernetes namespace,
open a port forward, or check application health.

A separate Kubernetes fixture consumes the image digest. Application tests can
consume the endpoint from that fixture.

### D-010: Container Build Definitions

Status: accepted on 2026-08-04

The `container-build` test supports two build definitions:

1. A project Dockerfile.
2. An explicit versioned build template.

The user must select one definition. KubeClaw does not guess the project type.

A template documents its commands, base images, output rules, and defaults.
The resolved template is immutable for the run. A template version cannot
silently change its language version or base image. Support for a new language
version requires an explicit project choice or a new template version.

Imported providers can supply other build methods through the same test
contract.

### D-011: Container Build Verdict and Evidence

Status: accepted on 2026-08-04

The `container-build` test passes only when BuildKit completes, pushes the
image to the operator-configured local registry, and returns a valid immutable
image digest from that registry.

The test fails when:

- BuildKit reports an error.
- The build exceeds its time limit.
- The selected Dockerfile or template is invalid.
- The image cannot be pushed to the local registry.
- BuildKit does not produce an image digest.
- The runtime cannot verify the registry output digest.

Dockerfile style and policy checks remain in lint. The build test does not
duplicate those findings.

The result stores the full build log, local registry image reference, image
digest, duration, selected platform, and resolved build-definition identity.
The digest reference is authoritative. The result is deterministic and does
not need an agent.

### D-012: Small Container Build Configuration

Status: accepted on 2026-08-04

The normal `container-build` declaration contains only a build context and one
selected build definition. The definition is a Dockerfile or a versioned
template.

Advanced provider settings are optional. A project adds them only when they are
needed.

The local registry is platform infrastructure. The project does not configure
its endpoint or credentials. Every successful build pushes its image to that
registry and returns the verified digest reference.

### D-013: Retire the Health Test Type

Status: accepted on 2026-08-04

The current `health` suite is retired as a special test type.

Deployment readiness belongs to the deployment fixture. A fixture that does
not become ready fails. Tests that need that fixture cannot start.

A generic HTTP provider preserves health and smoke checks. A project can name
an HTTP test `health`, but that name does not select a special runtime path.

The HTTP provider supports bounded requests and explicit response assertions.
Its detailed contract will be reviewed with the current API and HTTP behavior.

### D-014: Fixture Is a Base System Part

Status: accepted on 2026-08-04

A fixture prepares a bounded resource that tests need. It owns setup, a
readiness check, typed outputs, and cleanup.

A fixture reports whether preparation succeeded. It does not make a product
quality judgment. If a required fixture fails, dependent tests do not start and
the gate reports an execution failure.

Fixtures use the same allowlist rule as tests. A fixture can run only when
`.swarm/pipeline.json` declares it.

### D-015: Kubernetes Deployment Fixture Scope

Status: accepted on 2026-08-04

The current `k8s` suite becomes a Kubernetes deployment fixture.

The fixture consumes an immutable image from the local registry. It requests
an isolated namespace lease, applies declared resources with the immutable
image digest, waits for readiness, returns typed internal endpoints, and owns
lease-based cleanup.

The fixture does not build images, create public access, run application tests,
reveal Secret values, or make a product quality decision.

Public access belongs to a separate exposure fixture. Tests receive only the
endpoints and secret references that they need.

### D-016: Bounded Deployment Retention

Status: accepted on 2026-08-04

The Kubernetes fixture deletes its environment at the end of the run by
default.

A fixture can request `retain` so a human can inspect the deployment after the
pipeline ends. A retained deployment keeps its namespace lease and must have
an expiry time. The operator sets the maximum allowed expiry time.

A human can release the deployment before expiry. The lease controller deletes
the deployment at expiry.

The fixture result includes the namespace, creation time, expiry time,
endpoints, and release action.

### D-017: Deploy the Checked Kubernetes YAML

Status: accepted on 2026-08-04

Resource preparation, linting, and deployment are separate actions.

Helm, Kustomize, raw-file handling, or another provider prepares the final
Kubernetes YAML. Lint checks that final YAML. The Kubernetes fixture applies
the same checked YAML.

The fixture does not run Helm, Kustomize, or manifest lint. The runtime stores
a digest so it can prove that the applied YAML is the checked YAML.

### D-018: Test Deployment Secret Visibility

Status: accepted on 2026-08-04

All Secrets supplied to this fixture are test-deployment Secrets. They are not
production Secrets.

The fixture can copy approved Secret objects into the leased namespace. It
returns Secret references. It does not decode or show Secret values in logs,
Discord, provider output, or the operator interface.

A real deployment uses newly configured production Secrets. It does not reuse
the test-deployment Secret values.

This restriction keeps the fixture consistent with the platform rule that
plugins receive authorized Secret references instead of plain credentials.

### D-019: Tailscale Is an Exposure Fixture

Status: accepted on 2026-08-04

The current `tailscale-preview` suite is retired as a test.

A Tailscale exposure fixture consumes the internal service from the Kubernetes
fixture. It creates the Tailscale Ingress, waits for the public URL, returns
that URL, and follows the deployment expiry and cleanup rules.

The exposure fixture does not test page content. A generic HTTP test can check
the public URL.

Other exposure providers can implement the same fixture output contract.

### D-020: Accessibility Test Purpose and Browser Execution

Status: accepted on 2026-08-04

KubeClaw keeps a provided axe-core accessibility test. It checks automated
rules on rendered pages. It does not claim full accessibility certification.

The accessibility run uses one pinned Playwright browser worker. Each route
and browser setting receives a clean browser context. Buster runs the contexts
in bounded parallel work.

The test supports multiple routes. It stores full axe results and can store
screenshots for failed elements.

### D-021: Accessibility Browser Coverage

Status: accepted on 2026-08-04

The accessibility provider supports Chromium, Firefox, and WebKit. The
provider version pins the exact browser builds and records them in the result.

The default coverage uses Chromium with documented desktop and mobile viewport
presets. A project can select other browsers, presets, or custom viewport
dimensions.

Optional page settings belong to project settings. These settings include
color mode, reduced motion, locale, time zone, touch input, and mobile page
behavior. Browser tests use the project settings instead of repeating them in
each test.

The resolved plan shows the total route, browser, and viewport combinations.
The operator sets the maximum allowed combination count.

### D-022: Accessibility Verdict Policy

Status: accepted on 2026-08-04

A blocking accessibility test fails when axe finds any rule violation that is
not explicitly accepted.

An accepted finding identifies the rule, route, selector, reason, and expiry
date. Numeric finding limits are not used because they can hide a new problem.

Advisory mode reports violations without blocking. Browser or axe failure is
an execution error. Axe `incomplete` items remain visible and can receive agent
review when `.swarm/pipeline.json` configures it.

Each finding identifies its route, browser, viewport, rule, and element. Output
limits can shorten a summary, but they cannot change the real violation count.

### D-023: Separate Lighthouse Test Purposes

Status: accepted on 2026-08-04

KubeClaw keeps one provided Lighthouse provider. Separate test definitions use
it for web performance, SEO, and best practices.

The provided Lighthouse tests do not run the Lighthouse accessibility category
by default. The axe-core test owns automated accessibility checks.

Projects declare only the Lighthouse test purposes that they need. Each test
has its own routes and verdict policy.

### D-024: Repeat Lighthouse Performance Runs

Status: accepted on 2026-08-04

A Lighthouse performance test runs three times in sequence by default. It does
not run concurrent attempts on one worker.

The test evaluates the median result. It stores all three reports and marks one
report as the representative run.

An important final gate can request five runs. SEO and best-practices tests run
once by default.

### D-025: Named Lighthouse Profiles

Status: accepted on 2026-08-04

Project settings define named Lighthouse profiles. A profile fixes device,
network, processor, and screen conditions. Tests select a profile instead of
repeating those settings.

The resolved profile is fixed for the run. The result records the profile,
Lighthouse version, browser version, worker resources, and Lighthouse processor
benchmark.

### D-026: Combined Lighthouse Performance Budgets

Status: accepted on 2026-08-04

A blocking Lighthouse performance test selects a named budget from project
settings.

The budget combines a minimum performance category score with maximum limits
for individual measurements. LCP, CLS, and TBT are initial supported
measurements.

Each route must meet every configured limit. The test uses the median result.
The category score detects wider regressions. Individual measurements identify
the specific problem.

An advisory performance test can run without a budget.

### D-027: Lighthouse SEO and Best-Practices Verdicts

Status: accepted on 2026-08-04

SEO and best-practices tests report the category score and every failed
Lighthouse audit.

A blocking test fails when any failed audit is not explicitly accepted. An
accepted audit identifies the audit, route, reason, and expiry date.

Advisory mode reports failed audits without blocking.

### D-028: Replace Bundle With Size Budget

Status: accepted on 2026-08-04

The current `bundle` suite is replaced by an optional `size-budget` build-output
check.

The check consumes an explicit named build artifact. It does not guess an
output directory. It can check web assets, application packages, binaries,
archives, and other build outputs.

The check runs after the build and before live tests. It does not need a
deployment, browser, or agent.

### D-029: Size-Budget Limits

Status: accepted on 2026-08-04

The normal `size-budget` configuration contains one maximum total size.

Optional settings can limit matching files and maximum growth from a stored
baseline. The provider reports compressed sizes when they apply.

A blocking check requires at least one limit. An advisory check can report
sizes without a limit. The result always reports total size and largest files.

### D-030: DeepSec Is a Later Isolated Provider

Status: accepted on 2026-08-04

DeepSec is a low-priority roadmap item. It is not part of the first test-gate
implementation.

A future DeepSec integration runs as an isolated provider pod. It does not run
inside the Buster host process and does not replace deterministic security
tests.

The future provider receives a read-only repository snapshot, a private work
directory, approved model-service network access, and bounded resources, time,
and cost. It receives no Kubernetes authority or registry credentials.

Changed-file analysis is the normal pipeline mode. Full repository analysis is
a separate final, scheduled, or manual gate.

### D-031: Security Suite Is Extensible Composition

Status: accepted on 2026-08-04

The provided security suite starts with separate tests for HTTP headers,
dependencies, container images, live attack testing, and Kubernetes security.

This list is declarative data. It is not a compiled registry or a fixed list in
Buster code.

A project can add, replace, or remove tests. Installed providers can supply new
test types. Each test remains independently selectable and receives only its
required authority.

The suite groups selected tests and their results. It does not execute security
logic itself. Exact suite composition and inheritance rules are decided in
Phase 5.

### D-032: Versioned Security-Header Profiles

Status: accepted on 2026-08-04

The `security-headers` test uses a versioned provided profile for its target
type. Initial target types cover web applications and APIs over HTTP or HTTPS.

A project can add, replace, or remove rules. It can accept one finding with a
reason and expiry date.

The provider records the exact resolved rules in the result. The rule list is
not compiled into Buster core.

### D-033: Replaceable Dependency-Scan Providers

Status: accepted on 2026-08-04

Dependency vulnerability checks use one common `dependency-scan` contract.
The provided test can select suitable scanners for supported package systems.
Projects can replace or extend these scanners with imported providers.

All dependency scanners return the same core finding data: package, installed
version, vulnerability identifier, severity, fixed version, source file, and
reachability when the scanner can determine it.

Existing dependency vulnerability checks move out of general lint. They do not
run again during lint and the security suite.

### D-034: Scan the Final Container Image

Status: accepted on 2026-08-04

Container vulnerability checks use one common `image-scan` contract. Trivy is
the initial provided scanner. Projects can replace or supplement it with other
providers that implement the same contract.

The scanner consumes the verified immutable image digest from
`container-build`. It does not rebuild the image or select an image by a mutable
tag. Kubernetes must deploy the same image digest that the scanner checked.

Image scanning has its own result and gate verdict. It is not part of the build
verdict. Findings cover vulnerable operating-system packages, runtime
libraries, base-image contents, and packages installed during the build.

### D-035: Defer Live Attack Testing

Status: accepted on 2026-08-04

Live attack testing is not part of the first test-gate implementation. It will
be added during the later security phase that also introduces DeepSec.

The live scanner and DeepSec remain separate providers and run in separate
pods. DeepSec reviews repository source. The live scanner tests a running test
deployment. They can be selected together in one security suite, but they do
not share one process or one authority boundary.

The first security implementation therefore starts with security headers,
dependency scanning, final-image scanning, and Kubernetes security.

### D-036: Static and Live Kubernetes Security Checks

Status: accepted on 2026-08-04

Kubernetes security uses two separate checks:

- `kubernetes-policy` checks the exact final YAML before deployment.
- `kubernetes-runtime-security` checks the resources that Kubernetes created in
  the isolated test namespace.

The checks do not repeat the same rules. The static check finds unsafe declared
configuration. The live check finds admission changes, unexpected image or
service-account use, excessive RBAC, unexpected exposure, missing runtime
controls, and differences from the checked YAML.

The namespace controller is the only authority that grants Kubernetes access
to the live checker. It grants read-only, namespace-scoped access for the test
lease. The checker receives no general cluster authority and cannot grant
authority to itself.

Each check remains independently selectable in `pipeline.json`.

### D-037: Versioned Security Policies

Status: accepted on 2026-08-04

Security verdicts use a versioned policy. The policy defines blocking severity,
handling for active threats and missing fixes, blocking header rules, and
scanner-error behavior for each security finding type.

Projects can accept an exact finding with a reason and expiry date. An accepted
finding remains visible. Findings that do not block also remain visible.

A scanner failure is an execution error and cannot become a passing security
result. Advisory tests report findings without blocking. Every result records
the fully resolved security policy.

### D-038: Deterministic Visual Comparison With Optional Agent Review

Status: accepted on 2026-08-04

Visual regression first captures a screenshot under fixed conditions and uses
a deterministic image comparison against a reviewed baseline.

The comparison can pass or fail directly when the result is clear. A reasoning
agent reviews uncertain evidence only when `pipeline.json` explicitly declares
that review. Baseline, current, and difference images remain available as
evidence together with any agent decision.

Discord delivery consumes canonical saved artifacts. It is not part of the
visual provider and cannot change the visual verdict.

### D-039: Git-Managed Visual Baselines

Status: accepted on 2026-08-04

The first version stores visual baseline images and their manifest in the
repository. This keeps each reviewed baseline connected to the code revision
that uses it and makes baseline changes visible during normal code review.

The manifest records a digest for each image and the route, browser, viewport,
and page settings used to create it. A missing image, digest mismatch, or
identity mismatch is a contract error.

External baseline stores are deferred. They can later implement a baseline
provider contract without changing the visual comparison contract.

### D-040: Conditional Approval for Baseline Candidates

Status: accepted on 2026-08-04

Baseline-candidate generation and human review are optional pipeline features.
When they are configured and a candidate exists, the visual result publishes
an immutable `approval_required` fact. A conditional approval gate then uses
the same durable operator request, wait, and resume pattern as architecture
approval.

Approval authorizes a separate apply stage to update the baseline images and
manifest. The approval stage does not edit files itself. After the update, the
visual check runs again against the accepted baseline before the pipeline
continues.

Without this configured approval flow, test execution never changes a baseline.
An agent can explain a difference, but it cannot grant human approval.

### D-041: Shared Browser Profiles

Status: accepted on 2026-08-04

Browser-based tests select named browser profiles from project settings.
Accessibility, visual regression, end-to-end tests, and active QA can reuse the
same profiles.

A profile can define the browser engine, viewport, color mode, locale, time
zone, reduced-motion preference, device scale, and other supported page
conditions. Provider versions pin the exact browser build.

Visual regression runs only the route and profile combinations that the test
declares. Each combination has its own baseline identity and digest. The system
does not add browser or viewport combinations implicitly.

### D-042: Stable Visual Defaults and Optional Masks

Status: accepted on 2026-08-05

The visual provider applies basic stable settings without extra project
configuration. It disables animations, uses the selected browser profile, and
waits for page readiness before capture.

A project can optionally declare route-specific masks for known dynamic
elements. Masks are not required. The provider records every applied mask, and
mask changes remain visible during code review.

### D-043: Versioned Visual Comparison With Explicit Overrides

Status: accepted on 2026-08-05

The visual provider supplies a versioned default comparison profile. A blocking
visual test cannot pass merely because comparison settings are absent.

A project can select another profile and can explicitly override supported
values. The configuration uses descriptive field names, such as
`maximumDifference`, rather than an ambiguous field such as `Pixel`.

The result records the selected profile and every resolved override. An
uncertain result fails safely when agent review is not configured. Advisory mode
can report a difference without blocking.

### D-044: API Suite Uses Separate Test Types

Status: accepted on 2026-08-05

The provided API suite is editable declarative composition. It is not one large
API runtime and its contents are not fixed in Buster code.

Initial provided test types are:

- `http` for independent HTTP assertions.
- `api-flow` for ordered requests, authentication, extracted variables, and
  WebSocket interactions.
- `openapi` for checks against an OpenAPI contract.

Projects can select, remove, replace, or add tests. Imported providers can add
Postman and other API tools without changing the suite or Buster core.

### D-045: Versioned API Flow Files

Status: accepted on 2026-08-05

An `api-flow` test references a separate flow file instead of placing all steps
in `pipeline.json`. This keeps the pipeline declaration small.

Each flow file declares a schema version. The provided format supports setup,
authentication, ordered requests, variables, response assertions, WebSocket
actions, and cleanup.

Postman and other external formats remain optional provider integrations. They
are not required for the provided `api-flow` contract.

### D-046: Strict API Assertions

Status: accepted on 2026-08-05

Every declared API assertion must pass. A request error or timeout fails the
test. Invalid flow configuration is an execution error.

A failed assertion does not stop the run by default. The provider executes all
declared independent API paths and returns one summary of passed, failed, and
skipped checks. A later step is skipped only when it requires output that a
failed step did not produce. A setup failure can stop the main flow when the
remaining steps require that setup. Cleanup still runs after setup or test
failure.

API assertions have no numeric failure allowance. Advisory mode can report a
failure without blocking. Normal API assertions do not require agent judgment.

### D-047: Explicit OpenAPI Runtime Operations

Status: accepted on 2026-08-05

OpenAPI file validation remains a lint function. The Buster OpenAPI provider
checks the running test deployment against explicitly selected operation IDs or
tags.

The provider does not call every operation automatically. This prevents
undeclared create, delete, messaging, or other state-changing actions. Selected
operations can declare test values, authentication, and cleanup.

The runtime check validates requests before sending and checks response status,
content type, schema, required headers, and undocumented responses.

### D-048: Extensible E2E Suite and Common Result Contract

Status: accepted on 2026-08-05

The provided E2E suite is editable declarative composition. It uses a common
E2E result contract and starts with Playwright as the provided provider.

Cypress, Selenium, Appium, and custom providers can implement the same contract
without changes to Buster core. Projects can add, replace, or remove E2E tests.

The common contract reports test cases, passed, failed, and skipped counts,
errors, browser identity, screenshots, video, traces, structured reports, and
full logs when the provider produces them.

### D-049: Project-Owned Playwright With a KubeClaw Execution Overlay

Status: accepted on 2026-08-05

The project Playwright configuration owns test selection, browser projects,
retries, authentication setup, screenshots, video, traces, and test-specific
time limits.

The KubeClaw Playwright provider adds a narrow execution overlay. It supplies
the test deployment endpoint, canonical structured reporting and artifact
paths, pipeline cancellation, total execution limits, and operator worker and
resource ceilings.

The overlay does not change assertions or silently select different tests.
Operator limits can reduce a project request but cannot expand authority beyond
the configured platform grant.

### D-050: Strict E2E Verdict With Full Evidence Collection

Status: accepted on 2026-08-05

Any test that still fails after project-configured retries makes the E2E result
fail. There is no numeric allowance for failed tests.

A failed test does not stop the remaining independent tests. The provider
attempts all selected tests and returns one structured summary of passed,
failed, skipped, and unexecuted tests. A test can remain unexecuted only because
of a declared dependency, failed required setup, cancellation, or the total
execution limit.

Skipped tests remain visible but do not fail by default. Zero executed tests is
a configuration error. Advisory mode can report failures without blocking.
Structured provider output is authoritative; console-text parsing is removed.

### D-051: Extensible Unit Suite and Multiple Test Instances

Status: accepted on 2026-08-05

The provided unit suite is editable declarative composition. It uses a common
unit-test result contract and does not assume Node or npm.

A module can declare several unit-test instances at the same time. For example,
one module can run Vitest, an npm-script command, and Go tests as separate
tests. Each instance has its own provider, configuration, result, artifacts,
and blocking or advisory mode.

Framework-specific providers can implement the common contract. A generic
command provider remains available as a fallback. It receives an executable and
argument array, not a shell command string. Structured reports such as JUnit
are preferred; otherwise the provider uses the exit code and full logs.

### D-052: Run All Independent Unit-Test Instances

Status: accepted on 2026-08-05

The runtime executes all independent unit-test instances and keeps a separate
result for each one. A failure in one instance does not stop the other
independent instances.

The runtime can use bounded parallel execution. The operator sets the maximum
parallel work. The suite summary lists every passed, failed, skipped, and
unexecuted instance.

A blocking suite fails when any blocking unit-test instance fails. Advisory
instances remain visible but do not block.

### D-053: Optional Coverage-Budget Check

Status: accepted on 2026-08-05

Unit-test providers can publish standard coverage artifacts. An independent
`coverage-budget` check can consume and evaluate those artifacts.

Coverage evaluation is optional and runs only when `pipeline.json` declares it.
A blocking coverage check requires at least one limit. An advisory check can
report coverage without a limit.

Coverage failure does not replace or change the source unit-test results. The
coverage result reports each input separately and a combined total only when
the input formats and measurement models can be combined safely.

### D-054: Registration Is the Activation Unit

Status: accepted on 2026-08-05

A provider package can contain several independent execution-type
registrations. Each registration declares its own configuration schema, inputs,
outputs, capabilities, version, and entrypoint.

A suite can compose registrations from several packages. Package boundaries do
not restrict suite composition. The package is the delivery unit. The
registration is the operator activation unit and the test selection unit.

A future platform can publish, upload, discover, and configure provider
packages, test definitions, and suite definitions. This platform is deferred
and is not required for the first provider runtime.

### D-055: Common Load-Test Contract

Status: accepted on 2026-08-05

Load testing uses a common result contract. k6 is the first provided provider.
Projects can register Artillery and other load-test providers without changing
Buster core.

The common result reports request count, error rate, requests per second,
response-time percentiles, virtual-user count, failed limits, full reports, and
logs.

Load tests remain optional registrations. A performance suite can compose
Lighthouse tests, k6 tests, and registrations from other provider packages.

### D-056: Composable Application-Observation Checks

Status: accepted on 2026-08-05

Application observation uses separate `log-check`, `metric-check`,
`trace-check`, and `event-check` registrations. They share one normalized
observation result contract but can come from different provider packages and
use different signal backends.

An editable observability suite can compose these registrations. No single
provider receives access to every signal system, and the four test types are not
compiled into Buster core.

The common result records the expectation, observed evidence, checked time
range, correlation identity when available, passed and failed assertions, and
artifact references.

### D-057: Correlated Action and Observation Execution

Status: accepted on 2026-08-05

Live application actions and observation checks remain separate tests with
separate authority. The test plan links them through one correlation context.

For an observable action, a log observation is required. Metric, trace, and
application-event observations are optional additions. Ordinary checks that do
not declare an observable action are not changed by this rule.

Execution overlaps safely:

1. The log observer starts and reports that it is ready.
2. The action provider performs the action.
3. The observer captures logs during the action.
4. Metric, trace, and event checks can run in parallel during or after the
   action, as their provider contracts permit.
5. All checks use the action correlation identity, deployment identity, and
   bounded time range.

The plan waits for a bounded signal-arrival period and then returns one action
result plus separate observation results. The action provider receives no
signal-backend authority, and observation providers do not perform the action.

### D-058: Central Test-Deployment Log Collection

Status: accepted on 2026-08-05

The platform uses one central collector for logs from test deployments. The
namespace controller marks eligible namespaces and workloads with pipeline,
module, deployment, and lease identities. The collector uses those identities
to select and label log records.

Container standard output and standard error are the default log sources.
Structured JSON logs are preferred when the application provides them. Direct
container-filesystem access is not required.

Before an observable action, KubeClaw opens an observation session with the
namespace, workload, start time, and correlation identity. Log checks query only
that bounded scope. Buster receives scoped query access and no cluster-wide log
authority.

Explicit file-path collection through a shared volume or sidecar can be added
later. It is not required for the first implementation.

### D-059: OpenTelemetry Is the Common Observation Entry Point

Status: accepted on 2026-08-05

The platform uses OpenTelemetry Collector as the common collection and routing
entry point for test-deployment logs, metrics, and traces. OTLP is the preferred
application export protocol, and Prometheus scraping remains supported.

The collector is not the test verdict engine and is not the long-term query
store. It labels and routes signals to replaceable storage backends. Observation
providers query the relevant backend and return normalized results.

Application events can initially use structured logs or trace events. Projects
can add event-store providers when they need direct event-system checks.

Buster does not become a telemetry store and receives only scoped observation
query authority.

### D-060: Versioned Observability Deployment Profile

Status: accepted on 2026-08-05

A test deployment can select a versioned observability profile, such as
`standard@1`. The profile adds the application identity, pipeline run identity,
test deployment identity, collector address, and required collection labels and
settings.

KubeClaw applies the profile before lint. Lint checks the final Kubernetes YAML,
and the deployment fixture applies that same checked YAML.

Standard output and standard error logs need no application OpenTelemetry
library. Application metrics and traces can require an application library,
automatic instrumentation, or a Prometheus endpoint. These dependencies are not
silently added to a custom application image.

### D-061: Full ClawDeck Evidence View and Separate Signal Streams

Status: accepted on 2026-08-05

ClawDeck provides an application E2E observation section for each test
deployment. It can show the action timeline, live and stored logs, metrics,
traces, application events, test and suite results, screenshots, videos,
reports, and other artifacts.

Raw signal data does not become one pipeline event per record. ClawDeck reads
stored evidence through a KubeClaw observation service and receives live logs
through a dedicated bounded stream. This prevents duplicate storage and keeps
pipeline events readable.

Canonical pipeline events report state changes such as collection start,
observer readiness, an expected signal match, check completion, failure, and
evidence readiness. Discord can receive a summary, selected log lines, and a
link to the full evidence view.

### D-062: Simple Log Expectations With Optional Provider Queries

Status: accepted on 2026-08-05

Normal log checks use simple structured-field or text matching with expected,
minimum, or maximum counts. KubeClaw automatically limits each check to the
linked deployment, action time range, and correlation identity when available.

Advanced projects can supply a query that belongs to the selected log provider,
such as a Loki query. Provider-specific query syntax is optional and does not
change the normalized observation result.

### D-063: Metric Value and Change Checks

Status: accepted on 2026-08-05

Metric observation supports both an absolute value check and a change check
across an action. For a change check, KubeClaw records the bounded value before
and after the linked action.

Simple expectations support exact, minimum, maximum, increase, and decrease
rules. Advanced projects can use a selected provider query, such as PromQL.

The normalized result records the before value, after value, calculated change,
expectation, checked time range, and verdict.

### D-064: Required Trace Operation Checks

Status: accepted on 2026-08-05

Trace checks can require a trace operation and named child spans. They can also
reject error spans and enforce a maximum duration.

The normalized result records the matched trace, found and missing required
spans, error spans, total duration, and verdict. A selected trace provider can
offer an optional advanced query without changing the common result.

### D-065: Non-Destructive Application Event Checks

Status: accepted on 2026-08-05

An event-check provider observes a copy of application events without removing
or changing messages used by the application. It matches the linked action,
event type, expected fields, and expected count, then stores matched evidence.

Providers can use a test listener, a separate test consumer, an event audit
store, or structured OpenTelemetry events. The event source is replaceable and
does not change the normalized event-check result.

### D-066: One Event Check With Replaceable Source Adapters

Status: accepted on 2026-08-05

KubeClaw uses one `event-check` provider, one normalized event format, and one
common event evidence store. Replaceable source adapters copy events from an
application event system into that common path.

Redis and API are the first source adapters. Kafka, NATS, RabbitMQ, and other
systems can add adapters later without changing test expectations, result
schemas, or the ClawDeck event view.

One test deployment can use several adapters. An adapter binds to a stable
Kubernetes workload and optional container identity, not an individual Pod
name. Different workloads in the same deployment can therefore use different
event systems. Replacement Pods keep the same source binding.

### D-067: Shared Buster Worker and Separate Specialist Workers

Status: accepted on 2026-08-05

Maintainer providers and approved third-party providers run together in the
normal Buster worker Pod. A provider does not require its own Pod by default.

The operator can require separate execution for an untrusted provider or a
provider that needs special resources, network access, Kubernetes access, or a
different runtime image.

DeepSec will be a separate specialist worker, similar to Buster. A future Prism
design worker can follow the same model. Nova remains the main orchestrator. It
selects workers, sends immutable work plans, and controls pipeline progress.
Nova does not execute specialist provider logic itself.

Each active pipeline run uses a frozen provider and suite registry. Platform
install, remove, or update actions affect a later run and cannot change a run
that is already active.

### D-068: Reusable Tool Packages and Declarative Test Definitions

Status: accepted on 2026-08-05

Reusable tool behavior belongs to installed provider packages. A package can
provide tools such as Playwright, Lighthouse, k6, or an event-source adapter.

Project test definitions are data. They select a tool and provide project
settings and inputs. Suite definitions are also data. They group and connect
tests and can use tools from several packages.

This confirms the earlier provider, test, and suite model. It does not add a new
runtime part. A future platform can manage packages, tests, and suites through
the same separation.

### D-069: Stable Tool Contracts and Locked Packages

Status: accepted on 2026-08-05

A test selects a stable tool contract version, such as
`kubeclaw.playwright@1`. A breaking settings or result change requires a new
contract version.

The platform separately locks the exact provider package version and immutable
image or content digest. Package updates cannot change an active pipeline run.
The resolved run plan records both the stable contract version and exact locked
package identity.

### D-070: Fixed Suite Versions Are Explicit Activation

Status: accepted on 2026-08-05

`pipeline.json` can explicitly select a fixed suite contract version. This
selection activates only the tests stored in that suite version and therefore
counts as an explicit allowlist declaration.

No suite is selected by default. Installing or updating a suite does not run it.
Adding a test requires a new suite version. Each active run stores the fully
expanded test list and exact suite identity.

### D-071: Explicit Suite Exclusions, Overrides, and Additions

Status: accepted on 2026-08-05

A selected fixed suite can define explicit `exclude`, `overrides`, and `add`
sections. A project does not need to copy the complete suite to make a local
change.

`exclude` removes a stable test ID from that suite instance. `overrides`
changes supported settings for an existing test ID. `add` declares a new test
with its own stable ID and tool contract.

KubeClaw validates all referenced IDs and stores the fully expanded suite for
the active run. An absent suite remains disabled.

### D-072: Explicit Test and Fixture Links

Status: accepted on 2026-08-05

Tests, fixtures, and suite definitions declare all required links by stable ID.
KubeClaw validates the complete link graph before execution and sends Buster a
fully checked plan.

KubeClaw does not infer links from names and does not silently add a missing
test or fixture. A missing link, invalid output reference, or excluded required
item is a plan error.

### D-073: Optional Standard Conditions

Status: accepted on 2026-08-05

A declared test can optionally contain a standard `when` condition. Initial
conditions cover changed file paths, module type, and pipeline stage.

A condition can skip a declared test. It cannot add or enable an undeclared
test. A declared test without a condition runs normally when its suite is
selected.

KubeClaw evaluates conditions from known pipeline facts before Buster starts and
records why a test did not run. Custom condition code is not supported.

### D-074: Automatic Parallel Work With Optional Group Limits

Status: accepted on 2026-08-05

The scheduler starts a test when its declared dependencies are complete. Ready
and independent tests can run together within the operator maximum. One failure
does not stop other independent tests.

Tests can optionally join a named concurrency group. A group limit controls how
many tests in that group can run together. A limit of one makes the group run
one test at a time. This supports shared databases, browser workers, load tests,
and other limited resources without manual execution groups.

The operator sets hard maximums. A project can request lower limits but cannot
increase an operator maximum.

### D-075: One Default Retry and Retry-Safe Tests

Status: accepted on 2026-08-05

Each test has one retry by default, for a maximum of two attempts. A project can
set retries to zero or request more retries within the operator maximum.

Provided tests must be retry-safe when practical. A test that changes data must
use unique test data, cleanup, reset, or another declared method that makes a
second attempt safe. A provider that cannot retry safely must declare that fact
and uses zero retries unless the project explicitly accepts the risk.

Every attempt remains available as evidence. A test that fails and then passes
is marked unstable; the first failure is not hidden.

### D-076: Optional Common Test Variations

Status: accepted on 2026-08-05

A test can optionally declare a matrix of supported values, such as browsers,
viewports, or runtime versions. KubeClaw expands the matrix before execution and
shows the total run count.

Each variation has its own identity and result. Independent variations can run
in parallel within normal limits. Each provider declares which matrix fields it
supports, and the operator sets a maximum expansion size.

A provider can also split a large test set into smaller parts when its contract
supports this. Split results remain separate and are combined into one parent
summary.

### D-077: Small Common Test Result With Provider Details

Status: accepted on 2026-08-05

Every provider returns a small common result. It contains test and provider
identity, outcome, execution state, times, attempt, check counts, findings,
metrics, evidence references, and a short summary.

A provider can also publish a typed detailed report for its own tool. General
consumers such as Nova and ClawDeck can always use the common result. A
specialist ClawDeck view can read the provider report when it supports that
report type.

### D-078: Providers Return an Explicit Evidence File List

Status: accepted on 2026-08-05

Each provider returns an explicit list of evidence files that KubeClaw must
save. The list gives each file a clear evidence type, such as test report,
screenshot, video, log, trace, coverage report, or difference image.

KubeClaw does not search provider folders and guess which files matter. Files
that are not listed are not published as test evidence. KubeClaw validates each
listed file, stores it, and links it to the test result and attempt.

### D-079: Provider Evidence Defaults With Project Settings

Status: accepted on 2026-08-05

Each provider defines the evidence types that it can produce and safe default
evidence for passed and failed tests. Failed-test defaults can include more
diagnostic evidence than passed-test defaults.

A project can request supported evidence types for passed and failed tests.
KubeClaw validates the request, file existence, and file limits, then stores and
links the evidence. KubeClaw does not judge file importance from file content.

### D-080: Specialist Agent Results and Nova Gate Ownership

Status: accepted on 2026-08-05

An agent can perform active QA, edge-case tests, live application checks, log and
image inspection, and detailed audits. It returns a normal typed test or review
result with findings, evidence, and a reason. A blocking agent result counts in
the same way as another blocking result.

Nova owns the final pipeline decision process. It checks that required results
exist and applies the declared blocking, advisory, and configured agent-review
rules. Nova does not silently rewrite provider or agent results.

Raw deterministic evidence remains available when an agent reviews an uncertain
result. The agent judgment is stored as a separate linked result.

### D-081: Trust Installed Providers in the First Version

Status: accepted on 2026-08-05

The first version has no provider approval levels or approval workflow. An
operator installation is the trust decision. Every installed provider package
is available for declared tests.

Installation alone does not run a test. `pipeline.json` must still select a test
or fixed suite that uses the provider. Active runs continue to use their frozen
provider list.

Provider review, approval levels, and an upload-platform approval process are
deferred. They must be designed before an open public upload service is enabled.

### D-082: Declared Provider Access With Operator Limits

Status: accepted on 2026-08-05

Each provider package declares the access that it needs. Examples include
repository read access, temporary-file write access, browser use, test
application network access, BuildKit, local registry push, test-namespace read
access, and test credentials.

The operator sets the maximum allowed access. A project can request declared
access but cannot grant new access. The first version does not add a separate
approval workflow for each request.

Installed providers share the Buster worker by default, but each provider still
uses only its declared access through the available runtime controls.

### D-083: Migrate and Switch One Old Suite at a Time

Status: accepted on 2026-08-05

Migration proceeds one old suite at a time. For each suite, the migration first
records every current check, input, output, permission, result, artifact, and
dependency.

The replacement must retain all required functions, add the accepted
improvements, and provide clearer results and evidence. It does not preserve an
old defect merely for output parity. One old suite can become several focused
tests or fixtures when the accepted design requires that split.

After proof, the gate switches that suite to the new implementation and removes
the old suite code. The old and new versions do not both control the gate. The
team then continues with the next suite.

Temporary old and new runtime support is allowed only for the migration period.
It is removed after the last suite moves.

### D-084: Build the Minimum Provider System With Unit First

Status: accepted on 2026-08-05

Implementation does not build the complete provider system before the first
suite. It builds the minimum shared system required by the first migration and
extends that system only when later suites need more functions.

The unit suite is the first migration. It proves provider registration, test
configuration, common results, logs and reports, retry, parallel work, blocking
and advisory modes, and provider replacement without requiring Kubernetes
deployment, a browser, BuildKit, or public network access.

### D-085: Layer Provider Schema, Suite Template, and Project Override

Status: accepted on 2026-08-05

Each provider registration owns a versioned configuration schema. The schema
defines valid fields, value types, required values, allowed values, and limits.

A suite template supplies a working configuration for a test. A project can
override the settings that the template permits. `pipeline.json` contains only
the project values that are needed for that pipeline.

KubeClaw resolves provider defaults, suite-template values, and project
overrides in that order. It validates the final configuration against the
provider schema and stores the complete resolved configuration with the run.

ClawDeck can use the same schema to create configuration forms. It does not
need a second description of the provider settings.

### D-086: Use Explicit Typed Links Between Tests and Fixtures

Status: accepted on 2026-08-05

A provider declares the named values and artifacts that each registration can
produce. Small values use a typed value output. Saved files and reports use a
typed artifact output.

A consumer selects the producer and output with an explicit link. KubeClaw
does not use free-form text expressions or a shared test directory to connect
tests.

KubeClaw validates each link before execution. A valid link creates the required
execution order. The runtime transfers only the declared value or artifact and
records the transfer in the resolved plan.

If a later test needs to transform an output, a declared transform provider can
perform that work. The first version does not add a general expression
language.

### D-087: Use Fixtures for Setup and Buster for Cleanup

Status: accepted on 2026-08-05

A test registration has one provider execution. It does not contain a nested
setup, main, and cleanup workflow.

Reusable preparation uses declared fixtures. A provider can perform private
tool setup inside its bounded execution, but it cannot create new pipeline
steps.

Buster collects declared evidence after success or failure. Buster requests
fixture cleanup after success, failure, timeout, or cancellation. A fixture
that uses the accepted retention policy remains available until its lease
expires or a human releases it.

This rule keeps Nova as the only pipeline workflow owner.

### D-088: Use One Dependency Model With Optional Result Filters

Status: accepted on 2026-08-05

KubeClaw does not add a separate after-result condition system. It uses the
same explicit dependency model for normal and result-based dependencies.

A simple dependency expects the required producer to succeed. A dependency can
optionally select terminal results such as `failed` or `errored`. The consumer
runs only when the producer finishes with a selected result. Otherwise, the
consumer is recorded as skipped.

A typed output link creates its required dependency automatically. KubeClaw
does not add separate `after`, `whenResult`, or general expression fields.

### D-089: Do Not Add a Gate-Level Expected-Failure Mode

Status: accepted on 2026-08-05

A KubeClaw test checks a declared expectation. When the observed error or
rejection matches that expectation, the test passes. When it does not match,
the test fails.

KubeClaw does not convert a failed test into a pass through a general
`expectedFailure` setting. Test frameworks can still report expected outcomes
for individual test cases. KubeClaw preserves those details when it imports the
framework report.

Advisory mode remains the explicit way to run a complete test without letting
it block the pipeline.

### D-090: Normalize Standard Reports Through Replaceable Adapters

Status: accepted on 2026-08-05

This decision extends the common result and explicit evidence decisions. A
provider declares each standard report and its format. A registered report
adapter converts that format into the common KubeClaw result fields. The
original report remains a saved artifact.

Report adapters are replaceable registrations. Adding a report format does not
require a Buster core change. JUnit is the first provided report adapter.

### D-091: Keep One Nova-Owned Execution Graph

Status: accepted on 2026-08-05

Nova stores the canonical execution graph for the complete pipeline. Tests,
fixtures, dependencies, attempts, matrices, shards, and agent follow-up work
use stable identity and relation fields in that graph.

Buster returns execution facts with those identity fields. It does not create a
second workflow history or execution tree. ClawDeck reads the Nova-owned graph
and links each node to its Buster results and evidence.

### D-092: Record Basic Resource Use for Each Test Attempt

Status: accepted on 2026-08-05

Each test attempt records the resource values that its worker can measure
reliably. The first common fields are duration, CPU time, maximum memory, log
bytes, artifact bytes, and exit code or signal.

Network and storage values can be added when a worker can measure them
reliably. Missing optional measurements remain explicit and do not become zero.

Operator limits still stop excessive resource use. Measurements are evidence
and do not block a pipeline unless a declared budget uses them. KubeClaw stores
the measurements with the attempt, and ClawDeck can show them with the test
result and in later cost or resource views.

### D-093: Calculate Stability History Without Changing Current Results

Status: accepted on 2026-08-05

KubeClaw keeps stable test identity and every execution attempt. It can
calculate first-attempt pass rate, final pass rate, retry-pass count, recent
failure count, average duration, and duration change across runs.

ClawDeck can show these values and mark likely unstable tests. Historical
stability does not change the result of the current run and does not
automatically change a blocking test to advisory.

A separate declared stability gate can be designed later. The first unit
migration must preserve the identities and attempt data needed for this later
view, but it does not require the complete history interface.

### D-094: Limit First-Version Test Content to Snapshots and Packages

Status: accepted on 2026-08-05

The first version reads project-specific test content only from the committed
project snapshot. Reusable test code comes from installed, versioned provider
packages.

Buster does not fetch unknown test code from Git repositories, URLs, or archive
services during a run. This keeps a resolved run repeatable and avoids runtime
content credentials.

A general content-source adapter system is deferred. The future upload platform
can turn uploaded or remote test content into a versioned and verified package
or immutable artifact before Buster executes it.

### D-095: Decision Traceability and Vertical Suite Migration

Status: accepted on 2026-08-05

Implementation uses a machine-readable decision ledger. Every accepted
decision has an implementation phase, disposition, code target, proof target,
and completion state. Repository verification rejects a missing decision,
completed work without proof, or active superseded code after cutover.

The new execution component is a test-plan runner. A separate suite resolver
creates its immutable input. Suites remain declarative composition and do not
execute code.

Each migration is a complete vertical slice. It records the old behavior,
builds only the shared runtime functions needed by that slice, implements the
replacement, proves equal or better behavior, switches authority, and removes
the old code. A temporary legacy bridge can execute only suites that have not
migrated. It has a deletion ledger and disappears after the final migration.

### D-096: Neutral Worker Core With Specialist Engines

Status: accepted on 2026-08-05

Nova remains the pipeline orchestrator and the owner of the canonical pipeline
graph and final decisions.

Buster, DeepSec, Prism, and later specialist workers use one neutral worker
core and protocol. The worker core owns the local lifecycle of one immutable
work attempt. It verifies work identity, applies limits, streams logs, handles
cancellation, collects evidence, requests cleanup, reports health and capacity,
and returns a typed result.

The neutral core does not contain test, design, security, suite, prompt, or gate
policy. Each worker adds a specialist engine above the core. Buster adds the
test-plan engine. Prism can add a design engine. DeepSec can add a security
engine.

All worker types use the same core package and protocol. They can use different
container images because their specialist tools and resource needs differ.

Phase 5 remains the local Buster implementation. Before Nova-to-Buster
integration, the implementation must extract a neutral boundary for executing
one immutable attempt. The current local test-plan runner can use that boundary.
A later distributed dispatcher can use the same boundary across many worker
replicas without changing provider or suite contracts.

### D-097: One Immutable Attempt Is the Worker Unit

Status: accepted on 2026-08-05

The neutral worker core receives and executes one immutable work attempt. An
attempt runs one selected specialist operation one time and returns one typed
result.

The local Buster test-plan runner can coordinate many attempts inside one Pod.
A later Nova dispatcher can send the same attempts to different Buster replicas.
The provider, test, and suite contracts do not change when execution moves from
local coordination to distributed coordination.

The attempt input identifies the pipeline run, plan node, attempt number,
specialist engine, frozen package facts, granted capabilities, limits, inputs,
and cancellation identity. It does not contain Nova gate policy.

### D-098: Shared Queue With Time-Limited Worker Claims

Status: accepted on 2026-08-05

Nova sends normal worker attempts through a shared and durable work queue. Nova
does not depend on a fixed Pod name or Pod address.

A worker claims one matching attempt for a limited time. The claim records the
worker identity and claim generation. Only the current claim owner can report
progress or complete the attempt.

Worker identity comes from an authenticated workload identity. A worker cannot
choose or assert another worker identity. Nova and workers authenticate each
other. Nova binds each claim to the authenticated worker and checks that
identity before it accepts progress, evidence references, cancellation
acknowledgements, or results.

Workers advertise their worker type, available capacity, and supported
capabilities. A worker can claim only work that matches these facts.

If a worker stops or does not renew its claim, Nova can make the attempt
available again. A late result from an expired claim is rejected. This rule
prevents two workers from completing the same attempt.

Direct calls to a named worker can exist for diagnosis. They are not the normal
pipeline dispatch path.

### D-099: Worker Registration, Health, and Capacity

Status: accepted on 2026-08-05

Each worker registers with Nova and sends regular health messages. A message
identifies the worker, worker type, worker version, supported capabilities,
total capacity, available capacity, current work count, and health state.

Registration is accepted only from an authenticated and authorized worker
identity. Queue and evidence-store access are limited to the worker type and
current claims assigned to that identity.

Nova stops assigning work when these messages expire. Kubernetes remains
responsible for the Pod lifecycle. Nova remains responsible for work
assignment, claim validity, and pipeline state.

Worker identity changes after a restart. An old worker record and its expired
claims cannot be reused by the replacement process.

### D-100: Global Work Control With Local Worker Execution

Status: accepted on 2026-08-05

Nova controls global scheduling, pipeline and shared-resource concurrency,
retry after worker loss, and pipeline cancellation. Each worker controls local
attempt execution within the capacity that it reports to Nova.

Attempt claims are renewed while work continues. Claim expiry is separate from
the test time limit. The operator sets a generous worker-loss grace period so a
temporary delay does not cause duplicate work. The grace period remains
bounded so Nova can recover from a lost worker.

After claim expiry, Nova records the old attempt as interrupted and can create
a new attempt on another matching worker. The old attempt remains in history.
A late result from the expired claim is rejected.

Nova sends cancellation once. The worker stops related new work, requests
cooperative provider cancellation, forces termination after a bounded period,
collects available evidence, performs required cleanup, and returns a
cancelled result.

### D-101: Separate Result, Log, and Evidence Paths

Status: accepted on 2026-08-05

Worker results use a durable result channel with safe duplicate handling. Each
result identifies the attempt, claim generation, worker, result digest, and
completion time. Nova accepts a terminal result only for the current claim and
stores only one terminal result for an attempt.

Live logs use ordered parts with sequence numbers. Missing parts can be read
again. The worker also stores the complete log as evidence, so a live-stream
failure does not remove the final log.

Large evidence files are uploaded directly to shared evidence storage. Nova
receives typed evidence records with identity, media type, size, content
digest, and storage reference. Large files do not pass through Nova's normal
result channel.

### D-102: Worker Lifecycle, Fixed Profiles, and Protocol Versions

Status: accepted on 2026-08-05

Workers use the lifecycle states `starting`, `ready`, `draining`, `stopped`,
and `unhealthy`. A draining worker stops claiming new work. It receives a
generous but bounded shutdown period for active attempts. When that period
ends, it cancels remaining work, saves available evidence, performs required
cleanup, and reports interruption.

Each attempt selects a fixed worker profile. The profile identifies the worker
type, worker-core contract, specialist engine contract, and required
capabilities. Nova schedules the attempt only to a matching worker. Nova does
not select a worker only because it is newer.

Nova and the worker select one compatible protocol version before execution.
That version and the attempt profile remain fixed for the attempt lifetime.
Old and new worker versions can run together during a rolling update.

An attempt has a bounded queue time. If no compatible worker becomes
available, Nova reports a clear scheduling error and applies the declared
pipeline error rule. Distributed draining and rolling updates remain deferred,
but the local worker boundary and contracts must preserve this design.

### D-103: TypeScript First With a Language-Neutral Worker Protocol

Status: accepted on 2026-08-05

The first neutral worker-core implementation uses TypeScript and the current
Node runtime. This preserves the existing provider package and process model
and avoids a second runtime bridge during the first suite migration.

All worker registration, attempt, claim, progress, log, cancellation, result,
and lifecycle messages use versioned JSON contracts. The contracts do not
depend on TypeScript classes, Node objects, or in-process callbacks.

A later Go worker host can implement the same protocol when measurements show
a clear need. TypeScript and Go implementations must pass the same contract
and behavior tests. A language change must not change provider, suite, result,
or evidence contracts.

### D-104: Minimum Necessary Worker Contracts

Status: accepted on 2026-08-05

Worker-core contracts stay small. A field is added only when the worker needs
it to execute, recover, or prove one attempt.

Each new field must identify its consumer, when it is required, and the failure
that occurs without it. If a field can be added later without breaking the
protocol, it remains deferred until a real use requires it.

The first local worker core does not include advanced queue controls, complex
health metrics, special routing rules, or multiple authentication methods.
These features remain outside the contract until distributed operation proves
that they are necessary.

### D-105: Role-Specific Runtime Packages From One Shared Source

Status: accepted on 2026-08-09

`skills/common` is a source-ownership area. It is not one runtime package and
must not remain an implicit deployment unit.

The runtime is divided into versioned package surfaces:

- Contracts and SDK.
- Nova orchestrator core.
- Neutral worker core.
- One specialist engine for each worker type.
- Explicitly selected shared plugins.

Nova receives the contracts, orchestrator core, and its selected plugins. It
does not receive worker execution authority or a specialist engine.

Buster receives the contracts, neutral worker core, Buster engine, and its
selected providers. Prism and DeepSec receive the same neutral worker core and
their own specialist engines.

Shared code has one source and one version. Each image contains immutable
installed package bytes for its declared dependency set. This is normal
package installation. It is not a second source copy.

The bundle builder must resolve the declared dependency set for each role. It
must fail when a package is missing, undeclared, or owned by another role. The
bundle manifest records every package version and content digest.

Phase 5.6 removed the role-first/Common-second overlay. Explicit Nova, worker,
and Buster packages now form the source boundary. Role manifests and
dependency-set assembly form the deployment boundary.

### D-106: ClawDeck Is the Canonical Observability System

Status: accepted on 2026-08-09

ClawDeck is the canonical observability system for KubeClaw pipelines. Every
supported pipeline action, worker attempt, agent action, tool call, result,
runtime signal, and evidence item must produce a durable record or a durable,
content-addressed reference that ClawDeck can correlate and query.

Nova remains the canonical pipeline-decision owner. It owns scheduling,
retries, gates, and final pipeline state. ClawDeck owns observability history,
source health, completeness, search, replay, and forensic views. ClawDeck does
not become a scheduler or gate authority.

Workers publish attempt-scoped control facts and raw telemetry directly to
durable observability services. Nova consumes only normalized control facts
and durable references. Raw logs, metrics, traces, agent activity, tool calls,
and large evidence do not pass through Nova memory.

ClawDeck is one logical observability system, not one database for every byte.
Metadata and normalized observations can use a durable event and query store.
Large logs, traces, reports, screenshots, videos, and other payloads can remain
in typed storage backends. ClawDeck stores and verifies their identities,
digests, completeness, and locations.

A successful action without an accepted observability record is not fully
proved. Missing records, missing sequence ranges, unavailable payloads,
quarantine, and collector failures create an explicit observability gap. They
must never be presented as complete evidence. Gate policy can require complete
observability and must require it for authoritative final test-gate cutover.

Nova and ClawDeck use stable pipeline, module, gate, plan, test, attempt,
claim, producer, agent, tool-call, trace, and artifact identities. Arrival time
does not determine ownership or order. Per-producer sequence and causation
identity preserve local and causal order. Canonical admission assigns the
portable run cursor.

Producers use bounded durable outboxes, duplicate-safe delivery, and durable
acknowledgements. Nova restart recovery reconciles its pipeline journal with
durable attempt results and ClawDeck observability state. A Nova outage does
not discard worker results or telemetry.

### D-107: Earlier Stages Can Continue with Explicit Observability Degradation

Status: accepted on 2026-08-09

An earlier, non-authoritative pipeline stage can continue when observability is
`partial`, `degraded`, or temporarily `unknown` only when the remaining work is
safe and the configured stage policy permits continuation.

Continuation never changes incomplete observability to `complete`. Nova and
ClawDeck must preserve the gap, its reason, the affected producers and records,
and the later evidence required to close it.

An authoritative final test gate remains strict. It cannot pass until all
required results, evidence, producer closures, and observability records are
durable and the required observability state is `complete`. A safety-critical
earlier stage must also stop when its required evidence is unavailable.

Phase 5.7-A through Phase 5.7-F are authorized as one sequential implementation
program. Each subphase still requires its own proof, decision audit,
documentation update, and independent-review closeout before the next subphase starts.

### D-108: Preserve Report Errors Without Adding a Pipeline Outcome

Status: accepted on 2026-08-09

Standard report adapters preserve `passed`, `failed`, `errored`, and `skipped`
as separate case facts and counts. An errored case means that the test case did
not complete because of an unexpected test-runtime problem. It does not add a
new pipeline outcome.

The normalized result keeps exact counts. Detailed case and finding lists are
bounded and state when details were omitted. The complete original report
remains durable evidence. Case identity includes its suite path and optional
class name so repeated names do not lose their source context.

The adapter reports facts. It does not apply gate policy. A provider or gate
can fail when a report contains failed or errored cases, but that decision is
outside the adapter.

### D-109: Freeze and Run Exact Report Adapters

Status: accepted and implemented on 2026-08-09

A provider registration declares the standard report formats that it can
produce. A provider result identifies each report by its evidence ID and
format. The evidence type must be `test-report`.

Nova resolves one exact adapter registration for each supported format. It
stores these registrations in the immutable test-plan node. Resolution fails
when an adapter is missing or ambiguous. Operator policy can select one exact
registration when more than one adapter supports a format.

Buster retains every declared report as durable evidence. It runs the exact
adapter from the resolved plan. It stores the normalized facts in the durable
worker result and the attempt result. One report artifact produces one
normalized report result.

Normalization does not change the provider outcome. An adapter failure is an
execution error because the declared evidence could not be normalized. The
original report remains durable for diagnosis and replay.

## Deferred Roadmap

These items are useful but are not required for the first provider migration.
They do not expand the first-version implementation scope.

- Add an operator-managed cache contract when a migrated provider proves that
  shared cache reuse is necessary.
- Add general content-source adapters after the snapshot-and-package model is
  stable.
- Build the provider, test, and suite upload and catalog platform.
- Add provider review levels, signatures, and approval policy before enabling
  an open public upload service.
- Add DeepSec and live attack testing through a separate specialist worker.
- Add an external visual-baseline store if Git-managed baselines become
  insufficient.
- Add a declared stability gate if teams later want test history to affect a
  pipeline decision.
- Add a Prism specialist worker if design work later moves out of Nova.
- Add secret redaction if the test-deployment secret policy changes.

## Open Decisions

No design decision currently blocks implementation planning. The implementation
plan must define the proof matrix, exact cutover, and deletion checks for each
suite migration.

## Testkube Audit

### Audit Source

The audit used the Testkube repository at commit
`3abe80753b13977dc82103926b11134572cd3597`.

The audit was checked again on 2026-08-05 against Testkube commit
`4f0e745355181b790994d81d327dbc33e21f4fce` and the current official
Testkube documentation. This second review compares Testkube features with the
accepted KubeClaw decisions. It does not treat every Testkube feature as a
KubeClaw requirement.

The audit covered:

- The TestWorkflow API types.
- The TestWorkflow execution result types.
- The workflow runtime architecture.
- Tool examples for Playwright, k6, Artillery, Selenium, JUnit, xUnit, Gradle,
  and other test tools.
- Templates, parameters, services, artifacts, reports, parallel work, matrix
  work, sharding, conditions, retries, and resource controls.

The items below are audit findings. They are not accepted KubeClaw design
decisions yet.

### A. Ideas to Adopt

#### A-01: Tool-Neutral Container Execution

Testkube can run a test from an image, command, arguments, environment, working
directory, and resource request.

KubeClaw should support the same basic model.

The KubeClaw version must also require:

- An image digest.
- Explicit capabilities.
- Bounded output and artifacts.
- A read-only source snapshot.
- A fixed timeout.

#### A-02: Command and Argument Form

Testkube supports a command and an argument list. It also supports shell text.

KubeClaw should prefer a command and an argument list. This form is easier to
validate. Shell text should require a separate capability and policy.

#### A-03: Reusable Templates

Testkube templates can define a tool image, command, defaults, and parameters.

KubeClaw should support versioned provider templates. A project can then use a
template with typed values.

The resolved template must be frozen and digest-bound for the run.

#### A-04: Typed Parameters

Testkube supports string, integer, number, and boolean parameters. It also
supports defaults, allowed values, limits, examples, and sensitive values.

KubeClaw should adopt typed parameters. Secret values must remain secret
references. They must not become plain plan values.

#### A-05: Content Sources

Testkube supports Git content, files, and tar archives. It also supports sparse
Git paths.

KubeClaw should support explicit content sources. The current committed Git
snapshot remains the default and safest source.

Remote sources require an explicit network capability and provenance record.

#### A-06: Setup, Main Work, and Cleanup

Testkube has setup, step, and after sections.

KubeClaw should support setup, test work, and cleanup. Cleanup must run after a
failure or cancellation when this is safe.

These sections are part of one bounded test plan. They do not create a second
pipeline lifecycle.

#### A-07: Service Dependencies

Testkube can start services next to a test. A readiness probe can confirm that
a service is ready.

KubeClaw should support declared service fixtures. A database, browser service,
or deployed application can be a fixture.

Each fixture needs a timeout, resource limit, health check, and cleanup rule.

#### A-08: Conditions

Testkube steps can have conditions. Artifact steps normally run even after a
failure.

KubeClaw should support a small condition set. Examples are `on_success`,
`on_failure`, and `always`.

KubeClaw should not start with a general expression language.

#### A-09: Optional and Expected-Failure Work

Testkube can mark a step as optional. It can also mark failure as expected.

KubeClaw should support advisory tests and expected-failure tests. These states
must be visible in the result. They must not silently become a normal pass.

#### A-10: Timeouts and Retries

Testkube supports step timeouts and retry rules.

KubeClaw should support bounded retries. The plan must define the maximum retry
count and total time. Each attempt must have a separate identity.

#### A-11: Parallel Work

Testkube supports bounded parallel workers and fail-fast behavior.

KubeClaw should support bounded parallel test execution. The runtime must obey
the gate, provider, namespace, and cluster limits.

#### A-12: Matrix Runs

Testkube can create runs from a matrix of values.

KubeClaw should support matrices for browsers, versions, devices, routes,
regions, and other typed inputs.

The resolved matrix must have a hard size limit.

#### A-13: Sharding

Testkube supports a fixed shard count and value distribution across workers.

KubeClaw should support provider-aware sharding. Playwright test files and load
test users are examples.

Each shard must produce its own result. A later result can also contain the
merged report.

#### A-14: File Transfer Between Workers

Testkube can transfer input files to parallel workers. It can fetch report files
after the workers finish.

KubeClaw should support bounded input and result transfer. Every transferred
file must have a path rule, byte limit, and digest.

#### A-15: Explicit Artifact Collection

Testkube collects artifacts from declared paths. It can collect artifacts after
a failed test.

KubeClaw should adopt explicit artifact declarations. It must not discover
artifacts by searching arbitrary result metadata for file paths.

Artifact patterns, counts, sizes, and compression must be bounded.

#### A-16: Standard Test Reports

Testkube detects and summarizes reports such as JUnit. It records total,
passed, failed, skipped, errored, and duration values.

KubeClaw should normalize JUnit first. It should also support SARIF, coverage,
performance, and visual evidence formats.

The full report remains an artifact. The summary becomes structured evidence.

#### A-17: Structured Execution Tree

Testkube records a tree of steps and their results. Each step has status,
timing, exit code, and error details.

KubeClaw should record a simpler execution tree. It should preserve the test,
fixture, matrix, shard, attempt, and cleanup relations.

#### A-18: Resource Metrics

Testkube records resource totals, minimums, maximums, averages, and standard
deviation values.

KubeClaw should collect CPU, memory, network, and storage metrics when the
runtime can provide them. This data is useful for performance tests and cost
control.

#### A-19: Concurrency Groups

Testkube can limit concurrent runs in a named group. It can also cancel an old
run when a new run replaces it.

KubeClaw should support bounded concurrency groups. This is useful for scarce
browsers, preview namespaces, and shared test environments.

KubeClaw core remains the authority for cancellation.

#### A-20: Resolved Plan Storage

Testkube stores the original workflow and the resolved workflow.

KubeClaw should store the source test plan and the resolved test plan. The
resolved plan must include provider digests, parameter values, conditions,
matrix values, capabilities, and limits.

#### A-21: Result Health History

Testkube calculates pass rate, result changes, and an overall health value.

KubeClaw should keep test history for flaky-test detection and trend review.
History must not change the result of the current run unless an explicit gate
policy uses it.

#### A-22: Tool Examples and a Provider Catalog

Testkube provides examples and templates for many tools.

KubeClaw should provide a catalog of reviewed providers and test templates.
Each catalog entry needs an owner, version, digest, required capabilities, and
supported result formats.

### B. Ideas to Adapt Carefully

#### B-01: Shell Steps

Shell steps are convenient. They are also difficult to validate.

KubeClaw can support shell steps only with an explicit shell capability. The
default form should use a fixed executable and argument list.

#### B-02: Expression Language

Testkube uses expressions for conditions, parameters, and dynamic lists.

KubeClaw should start with typed fields and a small condition set. A general
expression language would increase security and debugging risk.

#### B-03: Nested Workflows

Testkube workflows can run other workflows.

KubeClaw should allow a suite to include test definitions. It should not allow
unbounded workflow recursion. The resolved test plan must be finite and small.

#### B-04: Arbitrary Kubernetes Pod Controls

Testkube exposes many Kubernetes pod fields. These include service accounts,
volumes, node placement, host process access, and security settings.

KubeClaw should expose a safe resource profile. It should not pass arbitrary pod
settings from a project to the cluster.

Privileged settings require an operator policy and a dedicated capability.

#### B-05: Persistent Volumes

Testkube can attach persistent volume claims.

KubeClaw should use temporary storage by default. Persistent storage should be
an operator-approved provider feature. Cache input must be digest-bound.

#### B-06: Pause and Resume

Testkube supports paused work.

KubeClaw should add pause and approval only if a test use case requires it. The
existing KubeClaw wait and approval system must remain the authority.

#### B-07: Remote Git Credentials

Testkube can accept Git usernames, tokens, and SSH keys in workflow content.

KubeClaw should accept secret references only. Plain credentials must be
rejected.

#### B-08: Automatic Container Merging

Testkube can merge work that it treats as pure into one container.

KubeClaw should first use isolated test executions. Safe reuse can be added
later after measurements and proof.

#### B-09: Templates From a Marketplace

A marketplace is useful for discovery.

KubeClaw must treat a marketplace entry as untrusted until installation policy
verifies its source, digest, signature, contract version, and capabilities.

#### B-10: AI Analysis and Remediation

Testkube offers AI support for analysis and remediation.

KubeClaw already has agents. Test evidence should be passed to an optional
agent. The agent must use KubeClaw capabilities and lifecycle rules.

### C. Ideas Not to Adopt as Test-Gate Authority

#### C-01: A Second Pipeline Engine

Testkube workflows can act as full automation workflows.

KubeClaw must not copy this authority. A KubeClaw test plan only controls test
execution inside one pipeline gate.

#### C-02: Independent Trigger Authority

Testkube supports cron, Kubernetes event, API, and other triggers.

KubeClaw pipeline tests must start through the KubeClaw lifecycle. Test
providers must not start pipeline gate runs independently.

#### C-03: Independent Cancellation Authority

Testkube can manage and replace executions.

KubeClaw core owns cancellation. Buster and providers implement the requested
cancellation and report the result.

#### C-04: A Separate Test Result Control Plane

Testkube can own databases, object storage, event delivery, APIs, and a
dashboard for test state.

KubeClaw should use its canonical state, artifact, receipt, and telemetry
systems. ClawDeck should read the same events.

#### C-05: Raw Project Control of Kubernetes

Projects must not select arbitrary service accounts, host namespaces, volumes,
nodes, or other privileged pod settings.

KubeClaw operators define safe profiles. Test plans select only allowed
profiles.

## Testkube Audit Questions for Later Phases

The audit gives us candidate features. Each feature still needs a deliberate
decision.

Phase 2 will decide:

- How a test is enabled or disabled.
- Whether a test is blocking or advisory.
- How conditions select a test.
- Whether an agent is enabled for a gate or test.

Phase 4 and Phase 5 will decide:

- The provider and template contracts.
- The declarative test fields.
- Service fixture rules.
- Setup and cleanup rules.
- Matrix, shard, retry, and parallel limits.

Phase 6 will decide:

- The execution tree.
- Standard report formats.
- Artifact records.
- Agent evidence and decisions.
- Test history and flaky-test data.

Provider trust, signatures, capabilities, and resource profiles are governed
by the provider registry, isolation runtime, and later provider-installation
work. They are not part of the Nova-to-Buster connection in Phase 7.

### D-110: Remote Nova-to-Buster Plan Job

Nova submits one immutable resolved-plan job through the authenticated remote
API. Buster schedules attempt-level work through the existing worker core.
Nova stores its dispatch and recovery record before submission. Buster stores
the bounded repository archive or its durable authenticated reference before
execution. Buster verifies the archive digest. It stores results and evidence
before completion. Nova imports the result and owns the gate decision.

The first transport uses submit, status, and cancel requests behind a
replaceable dispatcher. Horizontal Buster dispatch can add a durable queue
later without changing provider, plan, attempt, or result contracts.

### D-111: Nova Remote Gate Import

Nova verifies the remote job, plan, node, attempt, receipt, result, and evidence
identities before it imports a remote gate result. Nova copies each remote
evidence object into its durable pipeline store and verifies its size and
SHA-256 digest. The same remote job can become authoritative only once.

Nova applies blocking and advisory policy after import. A failed or errored
normalized report is a clear failure fact. It does not start an agent. A
provider failure can request evidence review only when the resolved plan names
the review agent. The review request remains separate from the deterministic
test facts.

### D-112: Legacy Suite Bridge Containment

The old suite runtime accepts only names listed as `unmigrated` in the exact
legacy-suite deletion ledger. Its operator configuration uses the explicit
name `unmigratedSuites`. A resolved plan and the legacy bridge cannot be
authoritative for the same successor test. Each suite migration changes its
ledger state to `migrated` before the old mapping is removed.

### D-113: Phase 7 Connected Gate Boundary

The production Nova test-gate entry point performs authority selection,
durable dispatch, terminal reconnect, complete result verification, bounded
evidence transfer, idempotent import, and Nova gate policy as one connected
operation. The same entry point rejects old-suite and successor-provider dual
authority before either path starts.

### D-114: Direct Commands Use an Executable and Literal Arguments

Status: accepted on 2026-08-12

The generic direct-command provider starts one declared executable with a
bounded array of literal arguments. The project names an operator-approved
executable catalog entry such as `npm`, `pytest`, or `go`; Buster resolves that
stable name to the deployment's canonical executable path. Project
configuration does not contain host-specific absolute paths and cannot select a
program outside the operator catalog.

Execution goes through the shared `command.execute` capability and its isolated
command adapter. The provider never invokes a shell and does not accept a shell
command string. Its optional working directory is relative to and contained
inside a private writable attempt repository. The default working directory is
the repository root. The command adapter enforces process, output, time,
filesystem, environment, and no-network boundaries and returns ordered bounded
stream records for full log evidence.

The provider supplies `CI=true` and accepts only bounded project-declared
environment values. It rejects protected platform, credential, loader, and
runtime-control variables. It does not assume Node, npm, or another ecosystem.

### D-115: Unit Result Authority Is Explicit and Fail-Closed

Status: accepted on 2026-08-12

The direct-command provider supports `junit-required` and explicit `exit-code`
result modes. The provided unit suite uses `junit-required` by default.
Exit-code mode records one command check and does not claim a framework test
count.

A start failure, missing required report, invalid required report, oversized
required report, or zero-case required JUnit report is an execution error. A
nonzero exit or any failed or errored JUnit case fails a completed attempt.
Neither a successful exit nor a successful report can override the other one's
failure. Logs never change the result. Timeout and cancellation remain distinct.

### D-116: First-Version Reports Use Exact Declarations

Status: accepted on 2026-08-12

Each declared report has a stable ID, registered format, contained relative
path, and allowed media type. IDs and paths are unique. Required reports must
exist, and every original report is retained before adapter normalization.

The first version does not accept wildcard or glob report paths. Several exact
JUnit reports are allowed and are normalized separately in declaration order.
Wildcard collection can be added later if real project demand justifies its
ordering, duplication, path, count, and size complexity.

### D-117: Unit Instances Reuse Normal Test-Plan Nodes

Status: accepted on 2026-08-12

Every unit-test instance is an ordinary test-plan node with its own provider,
resolved configuration, mode, retry policy, result, attempts, and evidence. The
provided unit suite is declarative composition and does not add a unit-specific
scheduler or result store.

The existing runner owns dependencies, bounded parallel work, retries,
cancellation, summaries, and unstable marking. Independent instances continue
after another independent instance fails. Nova applies blocking and advisory
policy to their verified results.

### D-118: Coverage Is a Separate LCOV-First Linked Check

Status: accepted on 2026-08-12

A unit provider can publish a declared LCOV artifact. A separate
`coverage-budget` provider consumes immutable coverage artifacts through typed
links. Coverage failure does not replace or modify the source unit-test result.

The coverage provider reports each input separately and combines only compatible
LCOV line measurements. A blocking coverage check requires at least one minimum.
An advisory coverage check can report without a minimum. Other coverage formats
can add replaceable adapters later without changing the unit provider.

### D-119: Every Suite Migration Uses One Documented Workflow

Status: accepted on 2026-08-12

Every old suite is replaced through the same baseline, decision mapping,
implementation, vertical proof, parity proof, comparison, cutover, deletion, and
closeout workflow. Only one path can control a real gate during comparison or
cutover.

Documentation is a completion gate. Before closeout it must explain every
project-facing field, default, limit, result, failure state, evidence rule,
security boundary, trade-off, migration step, and troubleshooting code with
tested examples. A migration cannot close when a capable reader must inspect
source code or ask a maintainer to understand normal use.
