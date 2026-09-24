# Test-gate decisions

Status: current decision record; implementation and acceptance tracked separately
Audience: maintainers, pipeline authors, provider authors
Owner: KubeClaw maintainers
Evidence: skills/buster/engine/test-gates/remote-plan-runtime.ts; contracts/pipeline-test-gate/v1/src/index.ts
Applies to: pipeline test-gate architecture and provider contracts
Last verified: 2026-09-15; no runtime or live test result is available

These are the existing **D-001–D-119** decisions, not 119 new approvals. They are distinct from the review/remediation IDs D01–D16. This page contains the current rules, their reasons, and their recorded authority. Broader ownership and security reasoning is in [Core and plugin decisions](core-and-plugins.md).

Each record below gives the source's actual approval state/date. No individual approver is named in the original. D-110–D-113 have no explicit acceptance label and remain **unconfirmed**, even though their connected implementation exists. D-109's historical label combines accepted and implemented; acceptance is retained while current implementation proof is assessed separately.

**Implementation and verification for every record.** Complete design implementation is **partial**; no blanket provider or cluster completion is asserted. ADR-001–ADR-014 identify the core, worker, registry, role, dispatch, and policy boundaries. Provider decisions define intended contracts. They do not certify that every provider implements each clause. No current test, browser, native-host, or cluster result is available for these decisions. Current gaps belong in the [issue register](../status/open-issues.md). Environment proof belongs in [acceptance gates](../status/acceptance.md), under the [evidence policy](acceptance.md).

**Alternatives and supersession.** Only alternatives actually described in the source are retained. Where a record states no competing design, none is invented. Later decisions narrow earlier choices. D-110 scopes the first transport without rejecting the D-098 distributed queue target. D-105 replaces the Common overlay. D-108/D-109 refine D-090. D-114–D-118 refine unit, report, and coverage behavior. D-083/D-095/D-112 permit a bounded unmigrated-suite bridge. They never permit dual authority for an already migrated successor. Unselected Testkube ideas are comparison material, not approvals. D-089, D-088, D-087, and D-094 reject or replace them. Future content stores, public catalog/approval platform, external visual baseline storage, stability gates, DeepSec and live attack testing remain deferred where stated.

## D-001: Base System Structure

**Decision.** Providers execute; tests configure one provider use; fixtures prepare resources; suites group tests; gates apply blocking policy; agents reason only when declared. Nova owns lifecycle and Buster executes bounded tests.

**Reason, consequences and actual alternatives.** Clear facts use deterministic rules; uncertain evidence or active QA can use a declared agent. Agent actions need grants and recorded evidence; an agent cannot manufacture its own objective proof. Provided and custom tests share contracts.

**Approval/source.** Accepted, 2026-08-04; original D-001.

## D-002: Testkube Use

**Decision.** Use Testkube as a design source, not a runtime dependency or second general workflow engine.

**Reason, consequences and actual alternatives.** Useful execution ideas do not justify a second lifecycle authority.

**Approval/source.** Accepted direction, 2026-08-04; original D-002.

## D-003: Test Activation Is an Allowlist

**Decision.** The project test list is a closed allowlist: declared tests run, absent tests do not. Installation never activates a test.

**Reason, consequences and actual alternatives.** No enabled:true or disabled placeholders are needed; new packages cannot silently expand work.

**Approval/source.** Accepted, 2026-08-04; original D-003.

## D-004: Provided Test Documentation

**Decision.** Document every provided test's scope/non-scope, provider/version, inputs, capabilities, settings, results, artifacts, verdict, declaration example and common failures.

**Reason, consequences and actual alternatives.** The provider schema remains the machine contract; explanatory documentation cannot grant provided tests a special runtime path.

**Approval/source.** Accepted, 2026-08-04; original D-004.

## D-005: Pipeline File Name

**Decision.** Use .swarm/pipeline.json for desired pipeline configuration. Runtime progress belongs in separate state/events.

**Reason, consequences and actual alternatives.** The older .swarm/progress.json name and all reader/writer aliases must be removed atomically, including tools, tests, diagrams and docs.

**Approval/source.** Accepted, 2026-08-04; original D-005.

## D-006: Blocking and Advisory Tests

**Decision.** Declared tests are blocking by default. mode: advisory explicitly runs and reports a test without blocking progression.

**Reason, consequences and actual alternatives.** The ordinary case stays small and weaker enforcement remains visible.

**Approval/source.** Accepted, 2026-08-04; original D-006.

## D-007: Agent Activation

**Decision.** An agent is active only when pipeline.json declares its use. Clear results do not automatically start an evidence-review agent.

**Reason, consequences and actual alternatives.** Active QA is itself a declared test with agent, instructions and grants; availability alone is not authorization.

**Approval/source.** Accepted, 2026-08-04; original D-007.

## D-008: Retire the Manifest Test

**Decision.** Retire manifest as a provided Buster test; static manifest validation belongs in lint.

**Reason, consequences and actual alternatives.** Preserve YAML and raw/rendered Kubernetes schema checks, custom policy packs and useful environment, Secret-reference, registry, probe and resource checks. Live cluster behavior remains a separate test; avoid duplicate static findings.

**Approval/source.** Accepted, 2026-08-04; original D-008.

## D-009: Separate Container Build From Deployment

**Decision.** Replace build with container-build, which runs BuildKit and returns immutable image identity, digest, duration, logs and metadata.

**Reason, consequences and actual alternatives.** Building does not deploy, lease namespaces, forward ports or assert health. A separate deployment fixture consumes the digest.

**Approval/source.** Accepted, 2026-08-04; original D-009.

## D-010: Container Build Definitions

**Decision.** Container build explicitly selects either a project Dockerfile or a versioned template.

**Reason, consequences and actual alternatives.** No project-type guessing. Templates document commands, images, outputs and defaults; changed language/image defaults require an explicit choice or new immutable template version. Other build methods use provider contracts.

**Approval/source.** Accepted, 2026-08-04; original D-010.

## D-011: Container Build Verdict and Evidence

**Decision.** Container build passes only after BuildKit succeeds, pushes to the operator local registry and returns a verified immutable registry digest.

**Reason, consequences and actual alternatives.** Build, timeout, definition, push, missing-digest or verification errors fail. Preserve full logs, registry reference, duration, platform and definition identity; Dockerfile style stays in lint and no agent is required.

**Approval/source.** Accepted, 2026-08-04; original D-011.

## D-012: Small Container Build Configuration

**Decision.** Normal build declarations contain context plus exactly one Dockerfile/template selection; advanced provider settings are optional.

**Reason, consequences and actual alternatives.** Registry endpoint and credentials belong to platform infrastructure, not each project. Every successful build returns the verified digest from that registry.

**Approval/source.** Accepted, 2026-08-04; original D-012.

## D-013: Retire the Health Test Type

**Decision.** Retire health as a special test type. Deployment readiness belongs to its fixture; HTTP health/smoke assertions use a generic HTTP provider.

**Reason, consequences and actual alternatives.** A project may name a test health without selecting hidden runtime behavior. Failed required readiness prevents dependent tests.

**Approval/source.** Accepted, 2026-08-04; original D-013.

## D-014: Fixture Is a Base System Part

**Decision.** Fixtures own bounded setup, readiness, typed outputs and cleanup, and run only when declared.

**Reason, consequences and actual alternatives.** Preparation is not product quality judgment. A failed required fixture prevents dependent tests and makes the gate report execution failure.

**Approval/source.** Accepted, 2026-08-04; original D-014.

## D-015: Kubernetes Deployment Fixture Scope

**Decision.** The old k8s suite becomes a deployment fixture. It consumes an immutable local image and leases an isolated namespace. It applies declared resources, waits for readiness, and returns internal endpoints.

**Reason, consequences and actual alternatives.** No build, public exposure, application testing, Secret-value disclosure or quality judgment occurs inside the fixture. Cleanup follows the lease.

**Approval/source.** Accepted, 2026-08-04; original D-015.

## D-016: Bounded Deployment Retention

**Decision.** Delete fixture environments at run end by default. Explicit retain keeps a lease only until a bounded operator-approved expiry or earlier human release.

**Reason, consequences and actual alternatives.** The result must expose namespace, creation/expiry, endpoints and release action. This is bounded inspection retention, not indefinite deployment.

**Approval/source.** Accepted, 2026-08-04; original D-016.

## D-017: Deploy the Checked Kubernetes YAML

**Decision.** Prepare final Kubernetes YAML before lint, then deploy precisely that checked YAML with digest evidence.

**Reason, consequences and actual alternatives.** Helm, Kustomize and raw-file preparation are separate providers/actions; the fixture neither renders nor repeats lint.

**Approval/source.** Accepted, 2026-08-04; original D-017.

## D-018: Test Deployment Secret Visibility

**Decision.** Fixture Secrets are test-deployment Secrets. Copy only approved objects and expose references, never decoded values in logs, messages or provider output.

**Reason, consequences and actual alternatives.** Production uses separately configured Secrets; test values are not promoted. This follows the capability/reference boundary.

**Approval/source.** Accepted, 2026-08-04; original D-018.

## D-019: Tailscale Is an Exposure Fixture

**Decision.** Replace tailscale-preview as a test with a Tailscale exposure fixture consuming a deployment endpoint and sharing its expiry/cleanup lifecycle.

**Reason, consequences and actual alternatives.** The fixture waits for and returns the public URL; HTTP tests check content. Other exposure providers can use the same output contract.

**Approval/source.** Accepted, 2026-08-04; original D-019.

## D-020: Accessibility Test Purpose and Browser Execution

**Decision.** Keep axe-core for automated accessibility checks on rendered pages; use one pinned Playwright browser worker with fresh contexts per route/setting and bounded parallelism.

**Reason, consequences and actual alternatives.** Preserve full axe results and optional failed-element screenshots. Automated rules do not establish complete accessibility certification.

**Approval/source.** Accepted, 2026-08-04; original D-020.

## D-021: Accessibility Browser Coverage

**Decision.** Accessibility supports pinned Chromium, Firefox and WebKit builds, with documented Chromium desktop/mobile defaults and explicit optional coverage.

**Reason, consequences and actual alternatives.** Project browser settings hold locale, timezone, motion, color and device conditions. The resolved plan shows combination count and obeys operator expansion limits.

**Approval/source.** Accepted, 2026-08-04; original D-021.

## D-022: Accessibility Verdict Policy

**Decision.** A blocking axe check fails for every violation not individually accepted with rule, route, selector, reason and expiry.

**Reason, consequences and actual alternatives.** Numeric failure allowances could hide new problems and are excluded. Incomplete findings remain visible for declared review; browser/axe errors are execution errors. Truncated summaries never change actual counts.

**Approval/source.** Accepted, 2026-08-04; original D-022.

## D-023: Separate Lighthouse Test Purposes

**Decision.** Use one Lighthouse provider with separate web-performance, SEO and best-practices test definitions.

**Reason, consequences and actual alternatives.** The provided defaults do not duplicate axe accessibility. Each declared purpose has its own routes and policy.

**Approval/source.** Accepted, 2026-08-04; original D-023.

## D-024: Repeat Lighthouse Performance Runs

**Decision.** Run Lighthouse performance three times sequentially by default and evaluate medians; a final gate can explicitly request five.

**Reason, consequences and actual alternatives.** Store every report and mark a representative run. Run SEO and best-practices once by default. Concurrent attempts on one worker would distort measurements.

**Approval/source.** Accepted, 2026-08-04; original D-024.

## D-025: Named Lighthouse Profiles

**Decision.** Select named project Lighthouse profiles fixing device, network, CPU and screen conditions.

**Reason, consequences and actual alternatives.** Freeze the profile per run and record profile/tool/browser identity, worker resources and Lighthouse CPU benchmark for comparable results.

**Approval/source.** Accepted, 2026-08-04; original D-025.

## D-026: Combined Lighthouse Performance Budgets

**Decision.** Blocking Lighthouse performance uses a named budget combining minimum category score with maximum configured LCP, CLS and TBT measurements.

**Reason, consequences and actual alternatives.** Every route must meet every configured limit using medians; score catches wider regressions and measurements identify specifics. Advisory measurement may omit a budget.

**Approval/source.** Accepted, 2026-08-04; original D-026.

## D-027: Lighthouse SEO and Best-Practices Verdicts

**Decision.** Blocking SEO and best-practices checks fail on any unaccepted audit; individual exceptions require audit, route, reason and expiry.

**Reason, consequences and actual alternatives.** Always report category score and failed audits. Advisory mode preserves findings without blocking.

**Approval/source.** Accepted, 2026-08-04; original D-027.

## D-028: Replace Bundle With Size Budget

**Decision.** Replace bundle with an optional size-budget check on an explicitly named build artifact.

**Reason, consequences and actual alternatives.** It supports assets, packages, binaries, or archives. It runs after build and before live tests. It does not guess directories or require a deployment, browser, or agent.

**Approval/source.** Accepted, 2026-08-04; original D-028.

## D-029: Size-Budget Limits

**Decision.** The normal size budget has one total-size maximum; optional limits cover matching files or growth from a stored baseline.

**Reason, consequences and actual alternatives.** Report compressed size where applicable, totals and largest files. Blocking needs a limit; advisory may measure without one.

**Approval/source.** Accepted, 2026-08-04; original D-029.

## D-030: DeepSec Is a Later Isolated Provider

**Decision.** Defer DeepSec to a later low-priority isolated specialist provider; it is outside the first test-gate implementation.

**Reason, consequences and actual alternatives.** Give it read-only source, private workdir, approved model network and bounded resources/time/cost, with no Kubernetes or registry credentials. Changed-file review is normal; full audits are separate declared work. It does not replace deterministic security.

**Approval/source.** Accepted, 2026-08-04; original D-030.

## D-031: Security Suite Is Extensible Composition

**Decision.** Security is editable suite composition of independent HTTP-header, dependency, image, live-attack and Kubernetes checks, not a compiled Buster registry.

**Reason, consequences and actual alternatives.** Projects can add/replace/remove tests with separate authority. The initial delivery scope is narrowed by D-035 to defer live attack testing.

**Approval/source.** Accepted, 2026-08-04; original D-031.

## D-032: Versioned Security-Header Profiles

**Decision.** Security headers use versioned profiles per HTTP/HTTPS target type, with explicit additions, replacements, removals and expiring exceptions.

**Reason, consequences and actual alternatives.** Record exact resolved rules; do not compile the policy list into Buster core.

**Approval/source.** Accepted, 2026-08-04; original D-032.

## D-033: Replaceable Dependency-Scan Providers

**Decision.** Use a common dependency-scan contract with replaceable package-system scanners.

**Reason, consequences and actual alternatives.** Normalize package/version, vulnerability/severity, fix, file and available reachability. Move existing vulnerability checks out of general lint to avoid duplicate execution.

**Approval/source.** Accepted, 2026-08-04; original D-033.

## D-034: Scan the Final Container Image

**Decision.** Use an image-scan contract with Trivy as initial provider; scan the exact verified container-build digest.

**Reason, consequences and actual alternatives.** Do not rebuild or select a mutable tag. Kubernetes deploys the same scanned digest. Image findings and verdict are separate from build success.

**Approval/source.** Accepted, 2026-08-04; original D-034.

## D-035: Defer Live Attack Testing

**Decision.** Defer live attack testing and DeepSec to a future security provider set with separate Pods.

**Reason, consequences and actual alternatives.** The first security scope covers headers, dependencies, final images and Kubernetes security. Repository analysis and attacks on a running deployment have different authority.

**Approval/source.** Accepted, 2026-08-04; original D-035.

## D-036: Static and Live Kubernetes Security Checks

**Decision.** Separate kubernetes-policy on final YAML from kubernetes-runtime-security on actual leased test resources.

**Reason, consequences and actual alternatives.** Avoid duplicate rules: declared configuration versus admission changes, identity/RBAC/exposure/control drift. The namespace controller alone grants read-only lease-scoped access; the checker cannot self-grant cluster access.

**Approval/source.** Accepted, 2026-08-04; original D-036.

## D-037: Versioned Security Policies

**Decision.** Security verdicts use a versioned resolved policy for severity, active threats, missing fixes, headers and scanner errors.

**Reason, consequences and actual alternatives.** Exact expiring exceptions and nonblocking findings stay visible. Scanner failure is an execution error and cannot become pass; advisory only changes blocking effect.

**Approval/source.** Accepted, 2026-08-04; original D-037.

## D-038: Deterministic Visual Comparison With Optional Agent Review

**Decision.** Visual regression uses fixed-condition screenshots and deterministic comparison against reviewed baselines before any optional agent judgment.

**Reason, consequences and actual alternatives.** Keep baseline/current/difference artifacts and separate judgment. Discord consumes saved evidence and cannot change the verdict.

**Approval/source.** Accepted, 2026-08-04; original D-038.

## D-039: Git-Managed Visual Baselines

**Decision.** Initially store baseline images and a digest/route/browser/viewport/settings manifest in Git.

**Reason, consequences and actual alternatives.** Code review binds baseline changes to source. Missing bytes, digest or identity mismatches are contract errors. External stores are deferred, not a second current source.

**Approval/source.** Accepted, 2026-08-04; original D-039.

## D-040: Conditional Approval for Baseline Candidates

**Decision.** Configured candidate generation can publish approval_required; a conditional human approval uses durable request/wait/resume, then a separate apply stage updates baselines and reruns the check.

**Reason, consequences and actual alternatives.** Approval itself cannot edit files. Without the declared flow execution never changes a baseline; an agent cannot provide human authorization.

**Approval/source.** Accepted, 2026-08-04; original D-040.

## D-041: Shared Browser Profiles

**Decision.** Accessibility, visual, E2E and active QA reuse named browser profiles from project settings.

**Reason, consequences and actual alternatives.** Provider versions pin browser builds. Each declared visual route/profile combination has its own baseline identity; no implicit coverage expansion.

**Approval/source.** Accepted, 2026-08-04; original D-041.

## D-042: Stable Visual Defaults and Optional Masks

**Decision.** Visual capture disables animations, uses the selected profile and waits for readiness by default.

**Reason, consequences and actual alternatives.** Optional route masks handle known dynamic elements. The result records applied masks, and maintainers inspect changes. Masks are not mandatory configuration.

**Approval/source.** Accepted, 2026-08-05; original D-042.

## D-043: Versioned Visual Comparison With Explicit Overrides

**Decision.** Visual comparison has a versioned default profile with descriptive, supported explicit overrides.

**Reason, consequences and actual alternatives.** Missing settings cannot turn a blocking difference into pass. Preserve every resolved override; uncertain output fails safely without a declared review agent. Advisory remains explicit.

**Approval/source.** Accepted, 2026-08-05; original D-043.

## D-044: API Suite Uses Separate Test Types

**Decision.** API is editable suite composition beginning with http assertions, api-flow and openapi runtime tests.

**Reason, consequences and actual alternatives.** No monolithic fixed API runtime in Buster. Imported Postman or other tools extend provider contracts without core changes.

**Approval/source.** Accepted, 2026-08-05; original D-044.

## D-045: Versioned API Flow Files

**Decision.** API-flow selects a separate schema-versioned flow file containing bounded setup, auth, ordered requests, variables, assertions, WebSocket work and cleanup.

**Reason, consequences and actual alternatives.** This keeps pipeline.json small. Postman/external formats remain optional integrations rather than requirements of the provided format.

**Approval/source.** Accepted, 2026-08-05; original D-045.

## D-046: Strict API Assertions

**Decision.** Every declared API assertion must pass. Request errors/timeouts fail; invalid configuration is an execution error.

**Reason, consequences and actual alternatives.** Continue independent paths after failure; skip only dependencies missing required output. Setup failure can block dependent main work but cleanup still runs. No numeric failure allowance or routine agent judgment.

**Approval/source.** Accepted, 2026-08-05; original D-046.

## D-047: Explicit OpenAPI Runtime Operations

**Decision.** OpenAPI syntax validation stays in lint; runtime checks call only explicitly selected operation IDs/tags with declared data/auth/cleanup.

**Reason, consequences and actual alternatives.** Never invoke every operation automatically. Validate outgoing requests and returned status, type, schema, headers and undocumented responses to prevent undeclared state changes.

**Approval/source.** Accepted, 2026-08-05; original D-047.

## D-048: Extensible E2E Suite and Common Result Contract

**Decision.** E2E is editable composition using a common result contract with Playwright first; Cypress, Selenium, Appium and custom tools can replace it.

**Reason, consequences and actual alternatives.** Preserve cases/counts/errors, browser identity and all produced screenshots, video, traces, reports and logs; tool replacement needs no Buster core change.

**Approval/source.** Accepted, 2026-08-05; original D-048.

## D-049: Project-Owned Playwright With a KubeClaw Execution Overlay

**Decision.** Project Playwright configuration owns selection, projects, retries, auth setup, captures and test-specific timeouts.

**Reason, consequences and actual alternatives.** KubeClaw overlays endpoint, canonical reporting/artifact paths, cancellation and total/operator resource ceilings only. It cannot change assertions or silently select different tests; operator limits may reduce requests, never expand grants.

**Approval/source.** Accepted, 2026-08-05; original D-049.

## D-050: Strict E2E Verdict With Full Evidence Collection

**Decision.** Any E2E case still failing after declared retries fails the result. Attempt all independent selected tests and preserve passed/failed/skipped/unexecuted counts.

**Reason, consequences and actual alternatives.** Only dependencies, failed required setup, cancellation or total limits justify unexecuted work. Zero executed tests is configuration error; skipped is visible but nonblocking by default. Structured reports replace console parsing.

**Approval/source.** Accepted, 2026-08-05; original D-050.

## D-051: Extensible Unit Suite and Multiple Test Instances

**Decision.** Unit suites are editable, tool-neutral composition with several independent instances per module.

**Reason, consequences and actual alternatives.** Each has its own provider, settings, results/artifacts and mode. Framework providers share a contract; generic command execution uses executable/argument arrays, prefers structured reports and otherwise explicit exit/log evidence. Later D-114/D-115 narrow its exact authority.

**Approval/source.** Accepted, 2026-08-05; original D-051.

## D-052: Run All Independent Unit-Test Instances

**Decision.** Execute all independent unit instances, retaining separate results and bounded optional parallelism.

**Reason, consequences and actual alternatives.** One failure does not stop unrelated tests. Any failed blocking instance fails the suite; advisory remains visible. Summaries account for skipped and unexecuted instances.

**Approval/source.** Accepted, 2026-08-05; original D-052.

## D-053: Optional Coverage-Budget Check

**Decision.** Coverage evaluation is a separately declared coverage-budget check consuming published artifacts.

**Reason, consequences and actual alternatives.** A blocking budget needs a limit; advisory may report without one. Preserve source unit results and combine only compatible formats/measurement models. D-118 narrows the initial format to LCOV lines.

**Approval/source.** Accepted, 2026-08-05; original D-053.

## D-054: Registration Is the Activation Unit

**Decision.** A package can expose several registrations; each has its own schema, input/output, capabilities, version and entrypoint. Registration is the activation/selection unit.

**Reason, consequences and actual alternatives.** Suites may mix packages. Package delivery and registration authority remain different; a future upload/catalog management platform is deferred.

**Approval/source.** Accepted, 2026-08-05; original D-054.

## D-055: Common Load-Test Contract

**Decision.** Load tests share a result contract, with k6 first and replaceable Artillery/other providers.

**Reason, consequences and actual alternatives.** Report requests, errors, throughput, percentiles, virtual users, failed limits, full reports/logs. Optional load registrations can compose with Lighthouse in a performance suite.

**Approval/source.** Accepted, 2026-08-05; original D-055.

## D-056: Composable Application-Observation Checks

**Decision.** Use separate log-check, metric-check, trace-check and event-check registrations with one normalized observation-result contract.

**Reason, consequences and actual alternatives.** They can use different packages/backends; none receives all signal authority. Preserve expectation, evidence, checked interval/correlation, assertions and artifact references.

**Approval/source.** Accepted, 2026-08-05; original D-056.

## D-057: Correlated Action and Observation Execution

**Decision.** Link separate live-action and observation tests through one correlation context; observable actions require a log observer to be ready before action starts.

**Reason, consequences and actual alternatives.** Metrics/traces/events are optional. Preserve separate authority, a bounded arrival window and deployment/time/correlation scope; ordinary tests without declared observable actions are unchanged.

**Approval/source.** Accepted, 2026-08-05; original D-057.

## D-058: Central Test-Deployment Log Collection

**Decision.** One platform collector selects test-deployment logs using namespace/workload pipeline, module, deployment and lease identity.

**Reason, consequences and actual alternatives.** stdout/stderr are defaults, structured JSON preferred. Before an action open a bounded observation session; Buster gets scoped query access, not cluster-wide logs. File/sidecar collection is deferred.

**Approval/source.** Accepted, 2026-08-05; original D-058.

## D-059: OpenTelemetry Is the Common Observation Entry Point

**Decision.** OpenTelemetry Collector is the common collection/routing entry for test logs, metrics and traces; prefer OTLP and retain Prometheus scraping.

**Reason, consequences and actual alternatives.** The collector is neither verdict engine nor long-term query store. Backends are replaceable; application events may initially use logs/trace events. Buster receives scoped queries and is not a telemetry store.

**Approval/source.** Accepted, 2026-08-05; original D-059.

## D-060: Versioned Observability Deployment Profile

**Decision.** A test deployment can select a versioned observability profile providing identities, collector address and required labels/settings before lint.

**Reason, consequences and actual alternatives.** Deploy the same checked YAML. stdout/stderr needs no app library; instrumentation dependencies for metrics/traces must never be silently injected into a custom image.

**Approval/source.** Accepted, 2026-08-05; original D-060.

## D-061: Full ClawDeck Evidence View and Separate Signal Streams

**Decision.** ClawDeck provides correlated action, signal, result and evidence views for test deployments, including bounded live log streams.

**Reason, consequences and actual alternatives.** Raw signals do not become one canonical pipeline event per record. Store references/history once through the observation service; pipeline events describe state changes and Discord receives summaries/links.

**Approval/source.** Accepted, 2026-08-05; original D-061.

## D-062: Simple Log Expectations With Optional Provider Queries

**Decision.** Default log expectations are structured/text matches with exact/minimum/maximum counts in linked deployment/time/correlation scope.

**Reason, consequences and actual alternatives.** Advanced backend queries such as Loki syntax are optional and do not change the normalized result.

**Approval/source.** Accepted, 2026-08-05; original D-062.

## D-063: Metric Value and Change Checks

**Decision.** Metric checks support absolute values and before/after action changes with exact/minimum/maximum/increase/decrease expectations.

**Reason, consequences and actual alternatives.** Preserve before, after, calculated delta, interval and verdict; optional backend-specific queries do not change the common contract.

**Approval/source.** Accepted, 2026-08-05; original D-063.

## D-064: Required Trace Operation Checks

**Decision.** Trace checks can require an operation and child spans, reject error spans and limit duration.

**Reason, consequences and actual alternatives.** Record matched trace, present/missing spans, errors, duration and verdict; optional backend queries remain provider-specific.

**Approval/source.** Accepted, 2026-08-05; original D-064.

## D-065: Non-Destructive Application Event Checks

**Decision.** Event checks observe copies of application events without consuming/changing production-used messages.

**Reason, consequences and actual alternatives.** Match declared action/type/fields/count and retain evidence. Test listeners, separate consumers, audit stores or OTel events can provide a replaceable source.

**Approval/source.** Accepted, 2026-08-05; original D-065.

## D-066: One Event Check With Replaceable Source Adapters

**Decision.** Use one normalized event-check contract and common evidence store with replaceable copying source adapters; Redis and API are initial sources.

**Reason, consequences and actual alternatives.** Bind adapters to stable workload and optional container identity, not transient Pod names. Multiple sources can coexist without changing expectations or result/view schemas.

**Approval/source.** Accepted, 2026-08-05; original D-066.

## D-067: Shared Buster Worker and Separate Specialist Workers

**Decision.** Trusted maintainer and approved third-party providers share a Buster worker by default. Operators can isolate a provider for trust, tools, resources, or authority needs.

**Reason, consequences and actual alternatives.** Nova sends immutable work and owns progress; specialists do not move provider logic into Nova. Freeze provider/suite selection for active runs. Later security rules still require actual containment for restricted packages.

**Approval/source.** Accepted, 2026-08-05; original D-067.

## D-068: Reusable Tool Packages and Declarative Test Definitions

**Decision.** Reusable tool behavior lives in installed provider packages; project tests and suite definitions are data selecting and composing those tools.

**Reason, consequences and actual alternatives.** This confirms existing provider/test/suite separation, not a new runtime component or an immediate upload platform.

**Approval/source.** Accepted, 2026-08-05; original D-068.

## D-069: Stable Tool Contracts and Locked Packages

**Decision.** Tests select stable contract versions while platform locks exact package version and immutable image/content digest.

**Reason, consequences and actual alternatives.** Breaking settings/results require a new contract; updates cannot alter active runs. The resolved plan records both contract and locked implementation identity.

**Approval/source.** Accepted, 2026-08-05; original D-069.

## D-070: Fixed Suite Versions Are Explicit Activation

**Decision.** Selecting a fixed suite version explicitly allowlists exactly the tests in that version.

**Reason, consequences and actual alternatives.** No suite is default; install/update alone runs nothing. Adding a test needs a new suite version and every run stores its full expansion.

**Approval/source.** Accepted, 2026-08-05; original D-070.

## D-071: Explicit Suite Exclusions, Overrides, and Additions

**Decision.** A fixed suite may offer exclude, overrides and add sections keyed by stable test IDs.

**Reason, consequences and actual alternatives.** Validate every reference and retain the complete expansion. Projects need not copy a suite merely for permitted local changes; an absent suite remains disabled.

**Approval/source.** Accepted, 2026-08-05; original D-071.

## D-072: Explicit Test and Fixture Links

**Decision.** Tests/fixtures/suites explicitly link required producers by stable ID; validate the complete graph before Buster execution.

**Reason, consequences and actual alternatives.** Do not infer names or silently add missing work. Missing links, bad outputs or excluded required items are plan errors.

**Approval/source.** Accepted, 2026-08-05; original D-072.

## D-073: Optional Standard Conditions

**Decision.** Optional standard when conditions may skip declared tests using known changed paths, module type or pipeline stage facts.

**Reason, consequences and actual alternatives.** A condition cannot enable undeclared work; no custom condition code is supported. Record why declared work was skipped before execution.

**Approval/source.** Accepted, 2026-08-05; original D-073.

## D-074: Automatic Parallel Work With Optional Group Limits

**Decision.** Ready independent tests run automatically after declared dependencies, within operator concurrency ceilings; optional named group limits constrain shared resources.

**Reason, consequences and actual alternatives.** A group limit of one serializes only that group, avoiding manual execution groups. Projects can lower but never raise operator maxima.

**Approval/source.** Accepted, 2026-08-05; original D-074.

## D-075: One Default Retry and Retry-Safe Tests

**Decision.** Tests have one retry by default, hence at most two attempts, adjustable within operator maxima. Unsafe-to-retry providers default to zero unless risk is explicitly accepted.

**Reason, consequences and actual alternatives.** Use unique data/reset/cleanup where practical. Keep every attempt and mark fail-then-pass unstable. This test retry default is distinct from pipeline repair-cycle budgets.

**Approval/source.** Accepted, 2026-08-05; original D-075.

## D-076: Optional Common Test Variations

**Decision.** Optional matrices expand only provider-supported typed values before execution and within an operator size limit.

**Reason, consequences and actual alternatives.** Every variation has distinct identity/result; provider-aware shards preserve separate outcomes before parent aggregation. No unbounded dynamic expansion.

**Approval/source.** Accepted, 2026-08-05; original D-076.

## D-077: Small Common Test Result With Provider Details

**Decision.** Every provider returns a small common result with identity, outcome/execution state, times/attempt, counts/findings/metrics, evidence and summary.

**Reason, consequences and actual alternatives.** Tool-specific typed detail reports supplement the common shape so general readers need not understand every provider.

**Approval/source.** Accepted, 2026-08-05; original D-077.

## D-078: Providers Return an Explicit Evidence File List

**Decision.** Providers explicitly list evidence files and types; KubeClaw validates, saves and links each to the attempt.

**Reason, consequences and actual alternatives.** Do not search arbitrary directories or guess importance. Unlisted files are not published evidence.

**Approval/source.** Accepted, 2026-08-05; original D-078.

## D-079: Provider Evidence Defaults With Project Settings

**Decision.** Providers declare supported evidence and safe success/failure defaults; projects may request supported variants.

**Reason, consequences and actual alternatives.** Validate request, existence and file limits. Richer failure diagnostics are allowed without inferring importance from contents.

**Approval/source.** Accepted, 2026-08-05; original D-079.

## D-080: Specialist Agent Results and Nova Gate Ownership

**Decision.** Declared specialist agents return typed findings/evidence/reasons; blocking results follow ordinary blocking rules. Nova owns final policy and checks completeness.

**Reason, consequences and actual alternatives.** Nova cannot silently rewrite facts. Keep deterministic evidence and linked agent judgment separate; configured agents may perform bounded active QA or review.

**Approval/source.** Accepted, 2026-08-05; original D-080.

## D-081: Trust Installed Providers in the First Version

**Decision.** Initially operator installation is the provider trust decision, without per-provider approval levels or a request approval workflow.

**Reason, consequences and actual alternatives.** Selection is still explicit and active registries frozen. Review/signature/upload approval policy must precede an open public upload service; this does not relax runtime isolation requirements.

**Approval/source.** Accepted, 2026-08-05; original D-081.

## D-082: Declared Provider Access With Operator Limits

**Decision.** Providers declare needed access and operator policy sets maximum authority; projects cannot grant new access.

**Reason, consequences and actual alternatives.** Shared worker placement does not grant ambient permissions. First version avoids a separate approval ceremony for every request while maintaining declared runtime controls.

**Approval/source.** Accepted, 2026-08-05; original D-082.

## D-083: Migrate and Switch One Old Suite at a Time

**Decision.** Migrate one old suite as a vertical slice: inventory old checks/data/permissions/evidence, preserve required value, prove improved behavior, switch and delete that old authority.

**Reason, consequences and actual alternatives.** Do not preserve defects merely for parity. A temporary bridge is limited to not-yet-migrated suites, with no dual control and removal after the final suite.

**Approval/source.** Accepted, 2026-08-05; original D-083.

## D-084: Build the Minimum Provider System With Unit First

**Decision.** Build the minimum shared provider system through the unit suite first, then add only functions required by later slices.

**Reason, consequences and actual alternatives.** Unit proves registration/config/results/logs/reports/retry/parallelism/policy/replacement without requiring a browser, cluster, BuildKit or public network first.

**Approval/source.** Accepted, 2026-08-05; original D-084.

## D-085: Layer Provider Schema, Suite Template, and Project Override

**Decision.** Resolve provider schema/defaults, suite-template values and permitted project overrides in order, then validate and store the full result.

**Reason, consequences and actual alternatives.** A single versioned schema owns fields/types/requirements/limits and can drive ClawDeck forms; no duplicate settings description is needed.

**Approval/source.** Accepted, 2026-08-05; original D-085.

## D-086: Use Explicit Typed Links Between Tests and Fixtures

**Decision.** Inputs select declared producer outputs through typed value or artifact links; validate and record transfers in the resolved plan.

**Reason, consequences and actual alternatives.** No free-form expressions or implicit shared directories. Links imply dependency order; a transformation needs an explicit provider, not a general expression language.

**Approval/source.** Accepted, 2026-08-05; original D-086.

## D-087: Use Fixtures for Setup and Buster for Cleanup

**Decision.** Each test has one provider execution; reusable setup is a declared fixture and private tool setup remains inside bounded execution.

**Reason, consequences and actual alternatives.** Buster collects evidence and requests cleanup on success/failure/timeout/cancel, subject to explicit retention. Providers cannot invent nested pipeline steps or another workflow owner.

**Approval/source.** Accepted, 2026-08-05; original D-087.

## D-088: Use One Dependency Model With Optional Result Filters

**Decision.** Use one dependency model, with optional terminal-result filters and normal success expectation.

**Reason, consequences and actual alternatives.** Typed links create dependencies; a nonmatching result skips the consumer. Do not add after, whenResult or a general expression system.

**Approval/source.** Accepted, 2026-08-05; original D-088.

## D-089: Do Not Add a Gate-Level Expected-Failure Mode

**Decision.** A test passes when observed behavior meets its expectation, including an expected rejection; do not add gate-level expectedFailure inversion.

**Reason, consequences and actual alternatives.** Preserve framework case details. Advisory is the explicit way for a whole failed test not to block.

**Approval/source.** Accepted, 2026-08-05; original D-089.

## D-090: Normalize Standard Reports Through Replaceable Adapters

**Decision.** Registered report adapters normalize explicitly declared standard formats, with JUnit first, while retaining original artifacts.

**Reason, consequences and actual alternatives.** Adding a format does not change Buster core. The adapter reports facts, not gate policy; D-108/D-109 refine error counts and exact adapter selection.

**Approval/source.** Accepted, 2026-08-05; original D-090.

## D-091: Keep One Nova-Owned Execution Graph

**Decision.** Nova stores one canonical graph with stable pipeline/test/fixture/dependency/attempt/matrix/shard/agent relation identities.

**Reason, consequences and actual alternatives.** Buster returns facts against that graph rather than a second history; ClawDeck links the same nodes to results/evidence.

**Approval/source.** Accepted, 2026-08-05; original D-091.

## D-092: Record Basic Resource Use for Each Test Attempt

**Decision.** Record reliably measured attempt duration, CPU time, maximum memory, log/artifact bytes and exit code/signal.

**Reason, consequences and actual alternatives.** Missing optional values are explicitly absent, never zero. Network/storage can follow when reliable; measurement alone does not block without a declared budget.

**Approval/source.** Accepted, 2026-08-05; original D-092.

## D-093: Calculate Stability History Without Changing Current Results

**Decision.** Preserve stable test IDs and every attempt for historical first/final pass rate, retry-pass count, failures and duration trends.

**Reason, consequences and actual alternatives.** History may label instability but never silently changes current result or blocking mode. A separate future stability gate is deferred; first migration retains needed data, not a complete UI.

**Approval/source.** Accepted, 2026-08-05; original D-093.

## D-094: Limit First-Version Test Content to Snapshots and Packages

**Decision.** Initially execute project test content from committed snapshots and reusable code from installed versioned packages.

**Reason, consequences and actual alternatives.** No runtime fetching of unknown Git/URL/archive code and credentials. Future content/upload services must first turn content into verified packages or immutable artifacts.

**Approval/source.** Accepted, 2026-08-05; original D-094.

## D-095: Decision Traceability and Vertical Suite Migration

**Decision.** Use a machine-readable decision ledger that ties accepted IDs to disposition, code, proof, and completion. A suite resolver produces immutable input for a test-plan runner.

**Reason, consequences and actual alternatives.** Each vertical migration inventories, proves, switches and deletes. The temporary bridge has an exact deletion ledger and only handles unmigrated suites; missing proof or active superseded code prevents completion.

**Approval/source.** Accepted, 2026-08-05; original D-095.

## D-096: Neutral Worker Core With Specialist Engines

**Decision.** Nova owns pipeline graph/policy; all specialists share one neutral Worker Core for immutable-attempt identity, limits, logs, cancel, evidence, cleanup, health/capacity and typed result.

**Reason, consequences and actual alternatives.** Test/design/security/prompt/gate semantics stay in engines above core. Images may differ. Extract this boundary before remote Buster integration so later distribution does not change provider contracts.

**Approval/source.** Accepted, 2026-08-05; original D-096.

## D-097: One Immutable Attempt Is the Worker Unit

**Decision.** One immutable attempt is the Worker Core unit, selecting one specialist operation once with fixed identity, packages, grants, limits, inputs and cancellation identity.

**Reason, consequences and actual alternatives.** Local Buster may coordinate several attempts; a later dispatcher may distribute the same units. Nova gate policy is not an attempt input.

**Approval/source.** Accepted, 2026-08-05; original D-097.

## D-098: Shared Queue With Time-Limited Worker Claims

**Decision.** The accepted distributed target uses a durable shared queue and bounded authenticated worker claims with generation fencing, not fixed Pod addresses.

**Reason, consequences and actual alternatives.** Only the current authenticated owner may report progress/evidence/results; expired claims reject late completion and unmatched capabilities cannot claim. D-110 narrows the first transport to remote plan jobs; queue rollout is not implied by implementation of that first transport.

**Approval/source.** Accepted, 2026-08-05; original D-098.

## D-099: Worker Registration, Health, and Capacity

**Decision.** Authenticated workers register version/type/capabilities, total/available capacity, current work and health; expired health stops assignment.

**Reason, consequences and actual alternatives.** Kubernetes owns Pods; Nova owns assignment and claims. Queue/evidence authority is claim/type scoped; restarts get new identity and cannot reuse expired ownership.

**Approval/source.** Accepted, 2026-08-05; original D-099.

## D-100: Global Work Control With Local Worker Execution

**Decision.** Nova owns global scheduling/concurrency/loss retry/cancel; workers own bounded local execution and renew claims independently of test timeout.

**Reason, consequences and actual alternatives.** A bounded loss grace permits recovery; interrupted attempts remain in history and late results are rejected. Cancellation stops new work, cooperates then forces termination, saves evidence and cleans up.

**Approval/source.** Accepted, 2026-08-05; original D-100.

## D-101: Separate Result, Log, and Evidence Paths

**Decision.** Separate durable duplicate-safe terminal results, ordered replayable live logs and direct upload of large evidence.

**Reason, consequences and actual alternatives.** The terminal result binds attempt, claim, worker, digest, and time. Current ownership can accept it once. Full logs remain durable if streaming fails. Large bytes do not traverse Nova's ordinary result channel.

**Approval/source.** Accepted, 2026-08-05; original D-101.

## D-102: Worker Lifecycle, Fixed Profiles, and Protocol Versions

**Decision.** Workers have starting/ready/draining/stopped/unhealthy states and bounded drain/cleanup. Attempts freeze compatible core/engine/capability profiles and negotiated protocol.

**Reason, consequences and actual alternatives.** Do not route merely to a newer worker. Queue wait is bounded. Distributed draining/rolling update implementation remains deferred in the source even though compatible mixed versions are a design goal.

**Approval/source.** Accepted, 2026-08-05; original D-102.

## D-103: TypeScript First With a Language-Neutral Worker Protocol

**Decision.** Implement Worker Core first in TypeScript/Node but use versioned language-neutral JSON messages, not runtime objects/callbacks.

**Reason, consequences and actual alternatives.** Avoid a second bridge during initial migration. Go is deferred until measurement shows a need; any later host must pass the same contracts/behavior and preserve provider/evidence semantics.

**Approval/source.** Accepted, 2026-08-05; original D-103.

## D-104: Minimum Necessary Worker Contracts

**Decision.** Add Worker Core fields only for an identified execution/recovery/proof consumer and a concrete failure without them.

**Reason, consequences and actual alternatives.** Defer safely addable advanced queue controls, metrics, routing and authentication variants until actual distributed use needs them.

**Approval/source.** Accepted, 2026-08-05; original D-104.

## D-105: Role-Specific Runtime Packages From One Shared Source

**Decision.** Replace the Common-directory overlay with explicitly versioned contracts/SDK, Nova core, Worker Core, specialist engine and selected-plugin packages resolved by role.

**Reason, consequences and actual alternatives.** One source may have immutable installs in several images. Reject missing/undeclared/cross-role packages and preserve version/digest manifests; Nova has no worker/engine authority. This supersedes the older overlay layout in Plugin System Vision.

**Approval/source.** Accepted, 2026-08-09; original D-105.

## D-106: ClawDeck Is the Canonical Observability System

**Decision.** ClawDeck is the logical canonical observability system for durable action/attempt/agent/tool/signal/evidence records and verified content-addressed references; Nova retains scheduling/gate authority.

**Reason, consequences and actual alternatives.** Raw bytes go directly to typed stores, not Nova memory. Stable identities, sequence/causation and canonical admission cursor order evidence. Bounded durable outboxes/acks and restart reconciliation preserve results; gaps are explicit and strict final gates require completeness.

**Approval/source.** Accepted, 2026-08-09; original D-106.

## D-107: Earlier Stages Can Continue with Explicit Observability Degradation

**Decision.** Earlier nonauthoritative stages may continue with explicit partial/degraded/unknown observability only when remaining work is safe and declared policy permits.

**Reason, consequences and actual alternatives.** Never relabel gaps complete. Safety-critical and authoritative final gates stop without required durable evidence, closures, and complete observability. Earlier sequential planning does not create an extra runtime gate.

**Approval/source.** Accepted, 2026-08-09; original D-107.

## D-108: Preserve Report Errors Without Adding a Pipeline Outcome

**Decision.** Report adapters preserve passed, failed, errored and skipped case facts/counts, with suite/class identity and bounded detail lists pointing to the full original report.

**Reason, consequences and actual alternatives.** Errored is a case fact, not a new pipeline outcome. Adapter does not apply policy; truncating detail cannot alter exact counts.

**Approval/source.** Accepted, 2026-08-09; original D-108.

## D-109: Freeze and Run Exact Report Adapters

**Decision.** Providers declare report formats/evidence IDs with test-report type; Nova freezes one exact adapter per format, with explicit operator selection for ambiguity.

**Reason, consequences and actual alternatives.** Buster saves originals and applies the exact pinned adapter, producing one normalization per artifact. Normalization never changes provider outcome; adapter failure is execution error and original evidence remains durable.

**Approval/source.** Accepted, 2026-08-09; original D-109.

## D-110: Remote Nova-to-Buster Plan Job

**Decision.** Nova durably records and submits one immutable resolved plan through an authenticated replaceable submit/status/cancel API. Buster durably retains/verifies its bounded source archive/reference and results/evidence.

**Reason, consequences and actual alternatives.** Buster schedules attempts through Worker Core; Nova imports and owns judgment. A horizontal durable queue remains a later transport option without changing provider/plan/result contracts.

**Approval/source.** Unconfirmed; acceptance date unknown; original D-110.

## D-111: Nova Remote Gate Import

**Decision.** Nova verifies remote job/plan/node/attempt/receipt/result/evidence identities, copies each object with size and SHA-256 verification and accepts authority once.

**Reason, consequences and actual alternatives.** Apply blocking/advisory policy after import. Failed/errored normalized reports are deterministic failures, not agent requests; only frozen-plan review selection can authorize uncertain-evidence review.

**Approval/source.** Unconfirmed; acceptance date unknown; original D-111.

## D-112: Legacy Suite Bridge Containment

**Decision.** The temporary legacy runtime accepts only exact ledger names marked unmigrated through unmigratedSuites configuration; mark migrated before removing the old mapping.

**Reason, consequences and actual alternatives.** Old bridge and resolved provider plan cannot both control one successor. This is migration containment, not permission for a permanent fallback.

**Approval/source.** Unconfirmed; acceptance date unknown; original D-112.

## D-113: Connected Gate Boundary

**Decision.** Production Nova gate entry must connect authority selection, durable dispatch/reconnect, complete verification, bounded transfer, idempotent import and Nova policy in one operation.

**Reason, consequences and actual alternatives.** Reject old/new dual authority before either starts. Isolated helper tests alone do not establish this connected boundary.

**Approval/source.** Unconfirmed; acceptance date unknown; original D-113.

## D-114: Direct Commands Use an Executable and Literal Arguments

**Decision.** Direct-command selects one operator catalog executable and bounded literal argument array, never shell text or a project-selected arbitrary host path.

**Reason, consequences and actual alternatives.** Shared command.execute and isolation enforce process/output/time/files/env/no-network limits. Use a contained private writable repo/workdir, CI=true and bounded env; reject credentials, loader/runtime-control variables. It is ecosystem-neutral.

**Approval/source.** Accepted, 2026-08-12; original D-114.

## D-115: Unit Result Authority Is Explicit and Fail-Closed

**Decision.** Direct-command offers junit-required (provided unit default) and explicit exit-code mode, where one command check is reported without invented framework counts.

**Reason, consequences and actual alternatives.** Missing/invalid/oversize/zero-case required reports or start failure are execution errors. Nonzero exit or failed/errored JUnit fails; neither success overrides the other's failure. Logs never decide; timeout/cancel remain distinct.

**Approval/source.** Accepted, 2026-08-12; original D-115.

## D-116: First-Version Reports Use Exact Declarations

**Decision.** Reports have unique stable IDs and exact contained relative paths, registered formats and allowed media types; save originals before normalization.

**Reason, consequences and actual alternatives.** No first-version wildcards/globs. Several exact JUnit files normalize separately in declaration order; general collection is deferred until its ordering/duplication/path/size complexity is justified.

**Approval/source.** Accepted, 2026-08-12; original D-116.

## D-117: Unit Instances Reuse Normal Test-Plan Nodes

**Decision.** Every unit instance is an ordinary plan node with its own provider, config, mode, retries, attempts/results/evidence; suites stay data.

**Reason, consequences and actual alternatives.** Reuse runner dependencies, parallelism, cancellation, summaries and instability. Independent instances continue after failures; Nova applies verified policy rather than a new unit scheduler/store.

**Approval/source.** Accepted, 2026-08-12; original D-117.

## D-118: Coverage Is a Separate LCOV-First Linked Check

**Decision.** A separately declared coverage-budget provider consumes immutable LCOV artifacts through typed links and evaluates compatible line measurements first.

**Reason, consequences and actual alternatives.** Preserve original unit outcomes and per-input results; combine only compatible data. Blocking needs a minimum; advisory can report without it. Other formats require replaceable future adapters.

**Approval/source.** Accepted, 2026-08-12; original D-118.

## D-119: Every Suite Migration Uses One Documented Workflow

**Decision.** Every suite migration follows baseline, decision mapping, implementation, vertical/parity proof, comparison, cutover, deletion and closeout, with only one real gate authority.

**Reason, consequences and actual alternatives.** Documentation must explain every field/default/limit/result/error/evidence/security/tradeoff/migration/troubleshooting rule with tested examples. A normal user must not need repository access or maintainer help to understand use.

**Approval/source.** Accepted, 2026-08-12; original D-119.
