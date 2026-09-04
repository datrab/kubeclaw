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

See `docs/architecture/pipeline-test-gate-phase-2-audit.md` for the complete
handoff list.

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
