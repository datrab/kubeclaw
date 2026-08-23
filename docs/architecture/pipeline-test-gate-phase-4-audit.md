# Pipeline Test-Gate Phase 4 Audit

Status: complete
Audit date: 2026-08-05

## Purpose

Phase 4 creates the suite resolver. The resolver turns declared tests,
fixtures, and fixed suite templates into one checked and immutable test plan.
It does not run provider code.

## Implemented Behavior

### Pipeline Input

The loader accepts `.swarm/pipeline.json` only. It selects one module or one
gate. It reads only these fields from that scope:

- `suites`
- `tests`
- `fixtures`
- `concurrencyLimits`

Other pipeline fields remain under the main pipeline validator.

The legacy runtime still reads `progress.json`. The new loader does not accept
that name. The repository-wide rename remains an atomic cutover under D-005.

### Closed Allowlist

Only declared direct nodes and nodes from selected suite instances enter the
plan. An installed provider or an available suite does not start work.

### Fixed Suites

Each suite selection uses an exact contract version. The plan records:

- Suite instance ID.
- Suite contract ID and version.
- Exact template digest.
- Fully expanded nodes.

Suite selections support explicit exclusions, overrides, and added tests.
Unknown exclusions and overrides fail resolution.

### Provider Settings

The effective setting precedence is:

1. Provider JSON Schema defaults.
2. Suite-template values.
3. Project overrides.
4. Matrix variation values.

The resolver first merges explicit suite, project, and matrix values. The
provider schema then fills only missing defaults. The final values are checked
by the selected provider schema. The plan stores the resolved values and schema
digest.

### Conditions

The resolver supports optional conditions for:

- Changed paths.
- Module type.
- Pipeline stage.

A false condition does not remove the declared node. The plan contains the
node and a clear pre-run skip reason. Buster does not evaluate project
conditions.

### Dependencies and Links

The resolver checks:

- Named dependencies.
- Result filters.
- Missing and self dependencies.
- Dependency cycles.
- Required provider inputs.
- Value and artifact port kinds.
- Value schema identities.
- Artifact media types.
- Artifact schema identities when declared.

A typed link creates a success dependency. The resolver does not infer links
from test names.

Matrix producers cannot feed one unqualified output into another node. Such a
link is ambiguous and fails. A later contract can add an explicit variation
mapping if a migrated provider needs it.

### Limits, Retries, and Evidence

The resolver:

- Applies operator time and resource ceilings.
- Applies project concurrency values only when they lower suite and operator
  limits.
- Uses one retry by default for retry-safe providers.
- Uses zero retries by default for unsafe providers.
- Requires explicit risk acceptance for an unsafe retry.
- Checks requested evidence against provider support.

The runner enforces these resolved values in Phase 5.

### Matrices

The resolver checks matrix fields against provider support. It expands the
full matrix within the operator size limit. Each variation receives its own
node and execution identity. The base test ID remains as the parent identity.

### Immutable Plan

The final plan includes:

- Exact registry snapshot digest.
- Fixed suite references and template digests.
- Locked provider package identities.
- Resolved provider settings.
- Nodes, links, limits, retries, conditions, and evidence rules.
- A deterministic plan digest.

The complete plan is deeply frozen.

## Additional Fix

Provider configuration schemas now apply declared JSON Schema defaults during
resolution. Normal registry validation still checks values without changing
the caller input.

## Proof

The suite-resolver check proves:

- `.swarm/pipeline.json` loading.
- Closed test activation.
- Fixed suite versions and template digests.
- Exclusion, override, and addition behavior.
- Deep configuration merge and provider defaults.
- Blocking and advisory modes.
- Conditions and skip reasons.
- Value and artifact links.
- Result-based dependencies.
- Matrix expansion.
- Concurrency lowering.
- Safe and unsafe retry defaults.
- Deterministic and frozen plan output.
- Missing providers, inputs, links, and suites.
- Invalid provider settings and evidence.
- Unsafe retry rejection.
- Unsupported matrix rejection.
- Dependency-cycle rejection.
- Duplicate suite rejection.
- Rejection of the old pipeline filename.

## Proof Command

```text
npm run verify:test-gate:suite-resolver
```

## Structured Review

The `independent review` closeout found 17 resolver defects across its review cycles.
All 17 were fixed:

- Suite instance IDs and suite-local node IDs cannot contain `/`. This keeps
  local and fully qualified references unambiguous.
- Digest ordering uses a fixed code-unit comparison. It does not depend on the
  host locale.
- A changed-path pattern such as `**/*.ts` matches files at the repository root
  and in subdirectories.
- Suite digests identify the exact validated template source. They do not use
  the normalized resolver copy.
- Concurrency declarations must contain numbers. Numeric strings are rejected.
- Matrix-generated node IDs cannot collide with declared node IDs.
- Generated matrix node IDs and execution IDs must remain inside the contract
  length limit.
- Provider configuration values are deeply frozen, including when their outer
  wrapper was already frozen.
- Every changed-path pattern is validated before any pattern matching starts.
- Suite-local IDs are validated for every catalog template, including unused
  templates.
- Plan freezing does not freeze caller-owned resolver input.
- Artifact-only `mediaType` settings are rejected on value links.
- All resolver policy limits and defaults are validated before node
  resolution.
- Concurrency limits are validated for every catalog suite, including unused
  suites.
- Changed files, module type, and pipeline stage facts are validated before
  condition resolution.
- A typed input link requires an exact success-only dependency on its producer.
- Configuration merging preserves all valid JSON keys, including `__proto__`,
  as own data properties.

The resolver proof includes regression checks for all 17 findings.

## Decision Conformance Audit

The Phase 4 resolver directly proves these accepted rules:

- D-003: only declared direct nodes and selected suite nodes enter the plan.
- D-006: tests are blocking by default; advisory mode is explicit.
- D-014: tests and fixtures are separate node kinds with the same provider
  boundary.
- D-069: each resolved node records the stable tool contract and exact locked
  provider package identity.
- D-070: suite selection uses a fixed contract version and records the exact
  template digest and expanded nodes.
- D-071: exclusions, overrides, and added tests are explicit and validated.
- D-073: only standard conditions are accepted, and a skip reason is recorded.
- D-085: provider defaults, suite values, project overrides, and matrix values
  resolve into one validated configuration.

The resolver implements the planning part of these decisions. Phase 5 must
still prove their runtime behavior:

- D-072 and D-086: the graph and typed links are fully validated. Phase 5 must
  transfer only the declared values and artifacts.
- D-074: concurrency groups and operator ceilings are resolved. Phase 5 must
  schedule ready nodes within those limits.
- D-075: retry-safe tests receive exactly one retry by default. Unsafe tests
  receive zero unless risk is explicitly accepted. Phase 5 must preserve every
  attempt and mark retry-pass results as unstable.
- D-076: matrices are validated and expanded with unique identities. Phase 5
  must run and report each variation.
- D-088: result filters use the one dependency model. Phase 5 must skip a
  consumer when the producer result is not accepted.

D-005 is not complete. The new resolver accepts only `.swarm/pipeline.json`,
but the repository-wide atomic rename remains a later cutover. The legacy
runtime still uses `progress.json` until that cutover.

One decision mismatch was found during this audit. The initial resolver policy
could change the default retry count. D-075 requires exactly one retry by
default. The configurable default was removed. Only the operator maximum remains
configurable.

## Intentionally Not Implemented

Phase 4 does not:

- Execute providers.
- Schedule ready nodes.
- Transfer linked values or artifacts.
- Enforce runtime limits.
- Create results, receipts, or evidence.
- Make Nova's gate decision.
- Remove the legacy suite runner.

These functions belong to later phases and suite migrations.
