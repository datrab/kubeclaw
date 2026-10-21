# Pipeline test-gate contract v1

This package defines the shared wire contracts for Nova, Buster, test
providers, report adapters, and ClawDeck.

The contracts do not execute tests. They define the data that later phases
will load, resolve, execute, store, and display.

## Contract definitions

- `providerRegistration`: One independently selectable provider function.
- `providerConfiguration`: Provider settings after defaults and overrides are
  resolved.
- `resolvedTestPlan`: The immutable work plan for one gate run.
- `providerInvocation`: One provider attempt.
- `providerResult`: The facts and file list returned by the provider.
- `attemptResult`: The stored common result for one provider attempt.
- `remotePlanJob`: The immutable Nova-to-Buster plan submission.
- `remotePlanStatus`: The durable remote job state.
- `remotePlanResult`: The typed terminal Buster plan result.
- `nodeResult`: The final result after retries or a scheduler skip.
- `evidenceManifest`: The files that a provider declares as evidence.
- `typedLink`: An explicit value or artifact link between two plan nodes.
- `reportAdapterRegistration`: One installed report-format adapter.
- `reportAdapterResult`: The normalized output from one report adapter.

Report cases preserve `passed`, `failed`, `errored`, and `skipped` as separate
facts. A report error is not a new pipeline outcome. The provider and gate
layers use the normalized facts to make their own declared decisions.

Normalized case and finding lists are bounded. Exact totals remain in the
result, and the original report remains a durable artifact when detail lists
are truncated.

All shared objects reject unknown fields. Two fields intentionally contain
provider-owned data:

- `providerConfiguration.values`
- `attemptResult.providerDetails.values`

Remote plan jobs contain the exact resolved plan and a bounded repository
archive. The archive, request, and terminal result are digest-bound. Nova must
persist the job before dispatch. Buster must persist it before execution.

The selected provider schema validates `values`. The provider contract owns
`providerDetails`. The shared contract does not guess their fields.

Breaking changes require a new versioned contract directory.

## Result levels

An attempt result records work that a provider performed. It can contain typed
fixture outputs and test evidence. It cannot represent a test that never ran.

A provider result contains only provider facts. It cannot contain a receipt.
Buster measures the attempt, stores the declared evidence, adds the execution
identities, resolves artifact outputs from evidence IDs, calculates the digest,
and creates the immutable receipt.

A node result records the final scheduler result. It lists all attempt IDs. It
also records an unstable pass after a retry. A skipped node has no attempt ID
and gives the reason for the skip.

A resolved node can also contain a pre-run skip reason. The suite resolver sets
this field when a declared standard condition is false. Buster does not
evaluate project conditions.

The plan records each selected suite instance, its fixed contract version, and
the digest of the exact suite template. It also stores the fully expanded node
list.

Both result levels contain the run, module, gate, suite, node, and execution
identities. They also contain an immutable result digest and receipt identity.

## Validation boundary

The JSON schema checks the shape and local rules of one object. Later runtime
phases must also check relations between objects. Examples include unique node
IDs, valid graph links, matching provider contracts, capability limits, digest
verification, and receipt creation.

See `docs/site/understand/request-to-result.md` for the current request,
execution, result, evidence, and authority handoff.

## Decision coverage

These contracts represent the data parts of the following accepted decisions:

- D-006 and D-014: test modes and fixture nodes.
- D-054, D-068, and D-069: independent registrations, reusable packages, and
  locked package identities.
- D-072, D-086, and D-088: named dependencies, typed links, and result filters.
- D-070 and D-073: fixed suite identities and pre-run condition results.
- D-074 and D-075: concurrency limits and explicit retry counts.
- D-077: the common test result.
- D-078 and D-079: explicit evidence and evidence policies.
- D-082: declared provider capabilities.
- D-085: resolved provider configuration.
- D-089: no gate-level expected-failure field.
- D-090: report-adapter registration and result data.
- D-108: separate report errors, bounded detail, and stable case identity.
- D-092: basic resource measurements.

Later phases must still implement the behavior behind these fields. A schema
does not prove execution behavior.

## Common E2E provider result

`schemas/e2e-result.v1.schema.json` defines the portable E2E result used by
Playwright and future Cypress, Selenium, Appium, or custom providers. It keeps
case identities, projects, browser identities, attempts, errors, exact counts,
and the native report format independent from one tool. Buster validates the
schema digest and count relations before it accepts a provider result.

`examples/e2e-result-cypress.json` is a second-provider conformance record. It
proves contract portability only. Real acceptance for a Cypress provider would
still require a real Cypress execution proof.

Provider `DeclaredEvidenceV1` entries contain only evidenceId/type/file/mediaType.
The runner assigns stored artifact identity (`EvidenceRefV1`); declaration
objects carrying `artifact` are rejected both by the TypeScript literal contract
and by the closed wire schema.

Example input declarations use `from`, `output`, and optional `mediaType`.
Schema identity is supplied by the registered input/output ports, never by an
input override. The API-suite example's `deployment` reference is suite-local:
when embedding it in a project, supply `api/deployment`. The deployment fixture
also needs the checked-manifest producer shown by `kubernetes-fixture.json`'s
`checkedYaml` reference. These examples are configuration fragments and do not
execute or create those external resources by themselves. The real registry/
resolver embedding in `tests/remediation.test.mts` checks all ten plan-declaration
examples, including those dependencies and suite-local size-budget links.
`npm test --prefix contracts/pipeline-test-gate/v1` also runs actual TypeScript
negative/positive evidence fixtures and the unchanged wire rejection.

## Mandatory project coverage

`gate-coverage.v1` declares product-required modules, full requirement statements, owned paths and integration requirements independently from suite/provider availability. Each required check references those requirements and pre-expansion node declaration IDs. Optional resolved-plan `coverage` retains this policy and explicit suite exclusions inside the normal planDigest. Every actual matrix variation is evaluated; empty templates, missing declarations, exclusions, advisory modes and skips remain visible unsatisfied states.

Standalone plans without coverage retain v1 decision semantics. Coverage-bound jobs produce `test-gate-decision.v2` with a `gate-coverage-result.v1` ledger derived from the actual verified remote job, its sourceSnapshot revision/tree/archive digest, and imported native node outcomes. This reuses the existing source authority and planDigest; it creates no second archive authority. A passed coverage result requires every declared mandatory check to have actually passed. Consumer `assertCoverageExecution` compares the result to an independently expected policy and exact resolved plan; a self-declared digest alone is not project-completeness authority.
