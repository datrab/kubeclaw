# Extend Nova Stages, Adapters, Observers, And Lint

Status: AP08.6 Nova extension guide implemented with stated verification limits
Audience: Nova plugin author, lint-policy maintainer, runtime maintainer
Owner: nova
Evidence: packaging/runtime/roles/nova.json; skills/nova/core/execution/stage-executor.ts; skills/nova/core/execution/adapters.ts; skills/nova/core/telemetry/observers.ts; skills/nova/plugins/lint/plugin.json; skills/nova/plugins/lint/src/stage.ts; skills/nova/plugins/lint/src/adapter.ts; skills/nova/plugins/lint/src/engine/policy-version.ts
Evidence revision: `bcf032f241b432bf920baa9ee5f727947921447d`
Applies to: Nova-owned and shared `pipeline-plugin-v2` registrations
Last verified: source, role, package, runtime, and lint checks on 2026-09-16

## Objective

Extend Nova at a supported boundary without putting orchestration policy, external
authority, or lifecycle state in the wrong component.

Nova currently consumes three Foundation registration types:

- stages perform ordered work and return typed results;
- capability adapters own controlled external operations;
- observers react to committed events.

Nova also owns a substantial lint subsystem. Lint uses two stage registrations and
one adapter registration, but its rule and policy model needs separate authoring
guidance.

This page does not explain Buster providers, report adapters, `.swarm/pipeline.json`
as a whole, or an end-to-end pipeline run.

## Current Nova Surface

The Nova-owned packages currently register 21 stages and six adapters. They cover
architecture, preflight, design, implementation, review, approval, quality, lint,
summaries, demo handoff, repository access, and remote Buster handoff.

No Nova-owned package currently registers an observer. Observer implementations live
in shared packages so more than one runtime role can include them. This is a current
packaging fact, not a contract restriction: Nova's runtime supports activated
observers.

The Nova role selects packages explicitly. A new directory does not enter a bundle
until the role manifest names its package ID and the role-closure check passes.

> **Nova role:** [The role manifest lists the exact plugin package IDs included in the Nova runtime bundle](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/packaging/runtime/roles/nova.json#L1-L62).
>
> **Bundle selection:** [The builder copies only registrations selected by the role manifest](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/scripts/build-runtime-role-bundle.mjs#L169-L187).

## Why Nova Separates Orchestration From Authority

Nova must decide graph order and lifecycle state. It must not also hide every
external protocol inside its stage code.

Nova therefore combines stages with capability adapters. Stages describe intent and
return typed results. Adapters own external authority. Observers react only after
Nova commits events.

**Benefit:** Core keeps one lifecycle history while each external protocol has one
reviewable authority boundary.

**Cost:** One feature can require a stage, an adapter grant, role selection, and
several separate tests.

**Rejected alternative:** Direct filesystem, network, Git, process, or secret access
inside a stage would bypass grants and durable effect records.

**Reconsider when:** A new responsibility has stable lifecycle meaning that no
current stage result, observer delivery, or capability can express.

## Choose A Nova Extension

| Need | Correct boundary | Do not use |
| --- | --- | --- |
| Add ordered work with a typed lifecycle result | Stage | Observer or direct Core mutation |
| Give stages controlled access to an external system | Existing or new capability adapter | Direct library access from a stage |
| React to committed lifecycle or domain events | Observer | Stage added only for telemetry |
| Add or configure a static lint rule | Lint policy or Kubernetes policy pack | New stage |
| Add a new lint execution tool | Lint adapter engine plus policy and tests | Shell call from the lint stage |
| Change retry, remediation, approval, wait, or terminal state semantics | Core change | Private logic inside one plugin |
| Execute a Buster test contract | Test provider | Nova stage pretending to be Buster |

## Author A Nova Stage

Use the [minimal plugin journey](first-plugin.md) for package construction. A
production Nova stage also needs a domain review:

1. Define one stable stage type and local registration ID.
2. Make configuration, input, and result schemas strict.
3. Declare only capabilities that the stage calls.
4. Return one canonical `stage-result.v2` outcome.
5. Store large or durable evidence through `artifacts.write`.
6. Use decision facts only for small values that later graph activation needs.
7. Respect abort and never retain the invocation context after return.
8. Test success, invalid input, every returned failure class, cancellation, and each
   capability denial.

The stage export receives data. It does not receive unrestricted repository,
filesystem, network, secret, database, or process access. Use the public SDK and
`context.invoke()`.

### Result choice

| Outcome | Use it when | Do not use it for |
| --- | --- | --- |
| `passed` | Required work and evidence are complete | Partial success that still needs repair |
| `retry` | A new attempt is safe and a transient condition can clear | Unknown external effect outcome |
| `request_fix` | A defined remediation edge can correct the input or output | Technical transport retry |
| `wait` | Work needs a supported durable signal | Busy polling inside the stage |
| `orchestrator_required` | The bounded local decision cannot continue | Generic unexpected exception |
| `blocked` | A prerequisite or reconciliation decision prevents safe progress | Ordinary failed quality check |
| `failed` | Work completed with a terminal negative result | Exception that Core must classify |
| `timed_out`, `cancelled`, `rate_limited` | The named condition is the actual result | A substitute for missing details |

Core owns attempts and remediation budgets. A stage reports meaning; it does not
increment counters or choose an unbounded loop.

> **Canonical result model:** [The contract enumerates stage outcomes and their required reason, artifacts, facts, wait, or orchestrator data](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L609-L678).
>
> **Lifecycle import:** [The reducer maps results to stage state and bounded retry or remediation actions](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/core/lifecycle/reducer.ts#L55-L101).

### Build a Nova stage end to end

Use Blueprint Sync when you need an effectful reference. Use the
[minimal stage](first-plugin.md) when your stage has no capability calls.

1. Create the package under `skills/nova/plugins`.
2. Define strict configuration, input, and result schemas.
3. Register one stable stage type and executable export.
4. Declare every capability that the export calls.
5. Validate domain rules before the first effect.
6. Return one canonical result with a stable reason code.
7. Test invalid input before execution and every returned outcome.
8. Test grants, activation, effects, evidence, and cancellation.
9. Add the package to the Nova role.
10. Run role closure, bundle assembly, and bundle inspection.

> **Reference package:** [The Blueprint Sync manifest connects one stage type to its export, schemas, and capabilities](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/blueprint-sync/plugin.json#L1-L24).
>
> **Reference integration:** [Its package test resolves real grants, activates registrations, runs Nova, and inspects Git, artifact, and state results](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/blueprint-sync/tests/live-function.test.ts#L25-L94).

## Author Or Select A Capability Adapter

First search the current capability vocabulary and installed shared adapters. A new
Nova stage usually needs a grant to an existing adapter, not a second protocol
implementation.

A new adapter is justified only when one component must own a distinct external
protocol. Its activation configuration belongs to the operator. Caller-specific
constraints belong to grants. Do not put credentials in stage input or return them in
an effect receipt.

Adapter requirements:

- validate activation configuration before readiness;
- check capability, operation, resource type, and payload;
- check the resource fence around ordinary mutations;
- pass the abort signal to owned work;
- implement receipt lookup when an external system supports it;
- make startup and shutdown idempotent;
- bound child processes, output, memory, and time where applicable;
- implement cleanup without acquiring undeclared authority.

The role closure check requires every selected plugin capability to have a selected
adapter provider or an explicit external-capability source. Package presence alone is
not enough.

> **Adapter startup:** [Nova starts selected adapters as one bounded set and tears down partial startup](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/core/execution/adapter-startup.ts#L31-L91).
>
> **Invocation:** [The runtime selects the configured provider and routes ordinary effects through durable coordination](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/core/execution/adapters.ts#L53-L68).

### Build or add an adapter

Use the lint package as a compact reference because one package contains both caller
stages and their adapter.

1. Confirm that the capability ID and resource model already exist.
2. Add an adapter registration with provided and required capabilities.
3. Define a strict operator configuration schema.
4. Validate operation, resource, payload, limits, and paths before mutation.
5. Check the resource fence at the mutation boundary.
6. Pass cancellation to all owned work.
7. Add receipt lookup when the external protocol can reconcile prior requests.
8. Make partial startup and shutdown safe to repeat.
9. Select the adapter in operator configuration and grant callers separately.
10. Test denial, timeout, cancellation, cleanup, and uncertain outcomes.

> **Stage and adapter package:** [The lint manifest declares two caller stages and one provider for `lint.execute`](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/lint/plugin.json#L1-L48).
>
> **Adapter guard:** [The lint adapter validates roots and source identity before it starts the engine](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/lint/src/adapter.ts#L8-L64).

## Author A Nova Observer

Use an observer for a reaction to committed events. Declare exact event
subscriptions and decide whether failure is `required` or `best_effort`.

An observer must be idempotent because delivery is at least once. It receives one
delivery with run and event identity and a normal bounded plugin context. Use the
event identity in external deduplication. Commit no private checkpoint; Nova owns the
checkpoint journal. The package declares the checkpoint schema.

Use `required` only when later event consumption must stop if this
observer cannot process an event. It still does not rewrite the completed pipeline
decision. `best_effort` preserves the failure and permits the runtime to continue its
other duties.

Test duplicate delivery, restart after completed delivery, restart after failed
delivery, retry exhaustion, checkpoint conflict, ordering across one run, and
independence between runs.

> **Delivery invocation:** [Nova constructs observer delivery context and applies the declared timeout](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/core/telemetry/observer-delivery.ts#L12-L44).
>
> **Recovery state:** [Observer recovery rebuilds checkpoints, attempt counts, and completed delivery identities](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/core/telemetry/observer-recovery.ts#L14-L67).

The notification observer is the concrete authoring reference:

1. Declare exact event subscriptions and one delivery policy.
2. Define strict configuration and checkpoint schemas.
3. Declare the capability that carries the external notification.
4. Derive external deduplication from the delivery event identity.
5. Remove or bound sensitive event fields before delivery.
6. Test duplicate delivery, checkpoint recovery, exhaustion, and redaction.
7. Add a shared observer to package ownership and each intended role.

> **Observer registration:** [The notification manifest declares subscriptions, delivery, ordering, retries, capability, and checkpoint schema](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/notification-observer/plugin.json#L1-L64).
>
> **Bounded projection:** [The observer removes sensitive fields and bounds message text](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/notification-observer/src/observer.ts#L35-L61).
>
> **External delivery:** [The observer invokes the declared `operator.request` capability after it creates the bounded notification](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/notification-observer/src/observer.ts#L167-L190).
>
> **Projection test:** [The unit test checks stable fields and prevents a secret from entering preview output](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/common/plugins/notification-observer/tests/observer.unit.test.mjs#L5-L38).

## Understand Nova Lint

Nova lint separates orchestration from execution:

- `kubeclaw.lint.pre-check` and `kubeclaw.lint.full` are stages;
- `kubeclaw.lint:executor` provides `lint.execute`;
- the stage resolves source identity, requests a report, stores it as an artifact,
  and maps report summary to a stage result;
- the adapter validates roots and runs the lint engine against the current workspace
  or an isolated Git candidate.

This split keeps policy results inside the stage contract while process and filesystem
authority stays in the adapter.

> **Stage mapping:** [The lint stage invokes `lint.execute`, stores the report, and maps tool failure or blocking findings to canonical outcomes](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/lint/src/stage.ts#L20-L87).
>
> **Adapter boundary:** [The lint adapter restricts repository and policy roots, validates revision identity, and owns cancellation](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/lint/src/adapter.ts#L8-L64).

## Change Lint Policy Or Rules

The current policy schema version is `pipeline_lint_policy.v7`. Policy selects tools,
paths, severity behavior, debt and experimental handling, Kubernetes inputs, and
governance controls. The exact reference belongs to AP09, but authoring follows these
rules:

1. Change policy when an existing tool or rule already expresses the requirement.
2. Use a Kubernetes policy pack for a supported declarative Kubernetes rule type.
3. Change engine code only when no existing rule type or tool can express the check.
4. Add parsing, normalized finding, fingerprint, severity, evidence, and failure tests
   with an engine change.
5. Preserve pre-check and full-tier meaning.
6. Do not turn tool execution failure into a clean report.

Kubernetes policy packs use an immutable ID, version, digest, and bounded rule list.
The loader rejects unknown rule types, extra fields, duplicate rule IDs, digest
mismatch, and excessive rules. Current supported rule types come from the code
constant, not arbitrary project strings.

> **Policy version:** [The engine names the current policy contract](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/lint/src/engine/policy-version.ts#L1-L1).
>
> **Policy-pack admission:** [The loader verifies identity, version, digest, exact fields, supported types, bounds, and unique rules](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/lint/src/engine/kubernetes-policy-pack.ts#L8-L78).

### Follow the lint change path

Use the smallest path that changes the required behavior:

1. Change `lint-policy.json` for an existing tool, scope, tier, or severity rule.
2. Change the Kubernetes policy pack for a supported declarative cluster rule.
3. Register engine code only for a new execution or parsing behavior.
4. Add rule-admission evidence when a new blocking rule changes acceptance.
5. Test discovery, valid findings, malformed output, missing tools, and cancellation.
6. Test stable fingerprints so debt and repeat findings keep their identity.
7. Run both pre-check and full tiers when shared behavior changes.

The policy is not a loose tool list. Validation limits languages, categories, scopes,
tiers, severity, paths, and execution time. The tool registry then connects approved
tool implementations to execution.

> **Policy vocabulary:** [The policy parser closes the language, category, scope, tier, and severity vocabularies](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/lint/src/engine/policy.ts#L11-L16).
>
> **Tool limits:** [Tool validation checks identity, language, requirement, timeout, category, scope, tier, severity, configuration, and target paths](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/lint/src/engine/policy.ts#L125-L156).
>
> **Tool registration:** [The registry assembles language, dependency, container, Kubernetes, Go, Terraform, and architecture tool families](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/skills/nova/plugins/lint/src/engine/tool-registry.ts#L1-L18).
>
> **Current policy:** [The deployed policy declares its version, projects, language evidence, Kubernetes inputs, and architecture layers](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/charts/kubeclaw/files/config/lint-policy.json#L1-L130).

**Why this order matters:** Policy changes reuse tested execution code. Engine
changes expand trusted behavior and need wider tests. A stage change is necessary
only when lint lifecycle meaning changes.

### Lint result meaning

- A required tool that cannot execute produces `blocked` with
  `lint.tool_execution_failed`.
- A valid report with blocking findings produces `request_fix` with
  `lint.blocking_findings`.
- A valid report with neither condition produces `passed`.
- The report artifact remains evidence in all three cases.

Do not suppress a tool failure by lowering finding severity. Tool health and finding
policy are separate dimensions.

## Package And Role Integration

For a Nova-owned package:

1. place it under `skills/nova/plugins/<package>`;
2. validate every manifest path and schema;
3. add the package ID once to `packaging/runtime/roles/nova.json`;
4. ensure every required capability has a selected provider or declared external
   source;
5. run the package test and package-boundary test;
6. run the role check and bundle-builder check;
7. verify activation with a local runtime harness;
8. rebuild the Nova runtime image or bundle before live acceptance.

Shared observers and adapters belong under `skills/common/plugins` only when more
than one role legitimately owns the same implementation. Shared location is not a
shortcut around role selection. `package-ownership.json` and all applicable role
manifests must agree.

The role check rejects unknown packages, ownership violations, missing dependencies,
missing capability providers, duplicate selection, and omitted Nova-owned plugins.
The bundle builder then copies only selected registrations. These checks prove
different facts and both are necessary.

> **Role closure:** [The checker validates ownership, dependency closure, capability providers, and complete Nova plugin selection](https://github.com/datrab/kubeclaw/blob/bcf032f241b432bf920baa9ee5f727947921447d/scripts/check-runtime-role-manifests.mjs#L77-L145).

## Common Failures

| Symptom | Meaning | Correction |
| --- | --- | --- |
| `nova omits its plugin` | Source package exists but Nova role does not select it | Add the exact package ID and review closure |
| `CAPABILITY_PROVIDER_MISSING` | No selected adapter provides a granted capability | Configure an installed provider |
| `REGISTRY_CAPABILITY_NOT_GRANTED` | Caller requested authority outside its grant | Correct the bounded grant or plugin declaration |
| `PIPELINE_STAGE_NOT_ACTIVATED` | Registry knows the stage but activation did not select it | Inspect graph type and enabled registration |
| `REGISTRY_RESULT_INVALID` | Config, input, result, or checkpoint violates schema | Correct the producer; do not weaken validation |
| `REQUIRED_OBSERVER_DELIVERY_FAILED` | Required observer exhausted attempts | Repair dependency and resume draining from checkpoint |
| `lint.tool_execution_failed` | A required lint tool did not produce a trustworthy result | Repair tool execution or environment |
| `lint.blocking_findings` | Lint ran and found policy-blocking issues | Fix findings or change reviewed policy |
| `LINT_*_DENIED` | Requested workspace or policy path exceeds adapter roots | Correct operator roots or request path |

## Verification

Run focused checks first:

```bash
npm run verify:runtime-packaging:roles
npm run verify:runtime-packaging:builder
npm run verify:plugin-packages
node tests/verification/contracts/plugin-system-v2-observer-expectations.mjs
node tests/verification/reliability/observer-recovery.test.mts
npm test --prefix skills/nova/plugins/lint
```

The complete `verify:plugin-system-v2` suite currently reaches the tracked
`DOC-AP08-BOUNDARY-CHECK-001` failure in the Buster quality-gate stage. Do not report
that full suite as green until the package-root import is corrected.

Package tests and local runtime checks do not prove a rebuilt Nova deployment. Keep
source verification, bundle verification, image verification, and live acceptance as
separate results.

Current local results are:

| Check | Result on 2026-09-16 | Meaning |
| --- | --- | --- |
| Runtime-role manifests | Passed: three roles and 48 plugins | Current role ownership and capability closure agree |
| Runtime bundle builder | Unavailable | This host has no `cc`, so sandbox assembly stops first |
| Observer contract expectations | Passed | Delivery contract behavior agrees |
| Observer recovery | Unavailable | BusyBox `flock` rejects the persistent journal command |
| Lint unit, boundary, discovery, discipline, type-evidence, and remediation checks | Passed | Lint selection, evidence, timeout, cancellation, and process cleanup agree |
| Lint live-function test | Unavailable | BusyBox `flock` stops `FileEffectJournal` before the domain exercise |
| Complete plugin-system v2 check | Existing failure | `DOC-AP08-BOUNDARY-CHECK-001` remains open |

Repeat unavailable checks with GNU `flock` and a C compiler. Do not classify their
current host-prerequisite failures as Nova behavior failures.

## Author Review

Before accepting a Nova extension, verify:

- the host and registration type own the requested decision;
- schemas reject unknown and malformed data;
- all external work uses declared capabilities;
- results use canonical lifecycle meaning and bounded budgets;
- effects have idempotency and reconciliation rules;
- cancellation and shutdown stop owned work;
- artifacts and facts have distinct purposes;
- observers tolerate duplicate delivery and preserve ordering scope;
- lint changes preserve tool-failure evidence and stable finding identity;
- role, package ownership, bundle, and tests all select the same package identity.
