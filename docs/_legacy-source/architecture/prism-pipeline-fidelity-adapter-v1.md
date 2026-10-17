# Prism Pipeline Fidelity Adapter v1

Status: accepted architecture contract

## Decision

Prism does not create a second visual-fidelity system. It uses the existing Buster
test suites, pipeline test-gate contracts, evidence storage, approval waits, and
telemetry.

Point 11 adds one small adapter:

```text
approved Prism Baseline Bundle
  -> validate bundle
  -> create existing Buster test plan
  -> run existing visual, E2E, and accessibility suites
  -> evaluate with existing pipeline gates
  -> record the Baseline Bundle digest with the verdict
```

## Existing system ownership

Buster and the generic pipeline continue to own:

- Playwright capture;
- pinned browser profiles;
- visual comparison;
- E2E and accessibility execution;
- masks and comparison limits;
- retries and cancellation;
- evidence and artifact storage;
- gate verdicts;
- operator approval waits;
- telemetry and receipts.

Prism does not copy or replace these functions.

## Adapter input

The adapter consumes one immutable Baseline Bundle and verifies:

- bundle schema and digest;
- Design Document schema and revision;
- preview index;
- acceptance criteria;
- asset and preview digests;
- required runtime profile information;
- required view, state, flow, and viewport targets.

An invalid or incomplete bundle is a contract error. It does not produce a passing
test plan.

## Target mapping

Each approved Prism target maps to existing Buster test configuration.

```text
Prism view/state/viewport
  -> visual-reg target and browser profile

Prism flow and interaction criteria
  -> Playwright E2E target

Prism accessibility criteria
  -> accessibility target
```

The generated plan keeps the stable Prism IDs and the Baseline Bundle digest. Buster
results can therefore identify the exact design target that passed or failed.

## Fidelity policy

Prism previews declare one of two policies:

- `exact`: meaningful visual drift can block the pipeline;
- `intent`: production differences require review when they change the approved
  experience, but pixel equality is not required.

The adapter maps these values to versioned existing gate configuration. It does not
add a new comparison engine.

The generated configuration can include approved masks and limits. Every resolved
mask and limit remains visible in evidence. A project cannot use a mask to hide an
undeclared large region or bypass required experience checks.

## Result and evidence

The adapter does not define a second fidelity report. Existing Buster suite results
and the existing pipeline gate decision remain canonical.

The result must include or reference:

- Baseline Bundle digest;
- implementation identity or commit digest;
- Prism target IDs;
- resolved Buster plan digest;
- baseline, current, and difference artifacts when applicable;
- E2E and accessibility evidence;
- applied masks, limits, browser profiles, and provider versions;
- existing gate verdict and any approval record.

## Differences and baseline changes

The existing approval flow handles intentional differences.

The user can:

- fix the implementation;
- accept an authorized implementation deviation;
- request and approve a new Prism baseline;
- rerun an invalid comparison.

The pipeline cannot silently change a Prism Baseline Bundle. Prism cannot silently
change production implementation. An approved new design produces a new immutable
bundle revision and a new test plan.

## Compatibility path

The existing `preview.html`, `paths.json`, and baseline-image process remains a
compatibility path for old projects.

New Prism projects use the Baseline Bundle. The adapter generates the existing
Buster inputs. Projects do not need to maintain both formats manually.

Compatibility support can be removed later through an explicit migration. It must
not shape the canonical Prism contracts.

## Scaling and reliability

The adapter creates normal provider-aware Buster test plans. Existing suite sharding
and worker scaling apply without Prism-specific workers.

Results are reusable only when these immutable inputs match:

```text
Baseline Bundle digest
+ implementation digest
+ generated Buster plan digest
+ provider and browser versions
```

Infrastructure failures remain execution failures. They do not become design or
fidelity failures.

## Required additions

Point 11 requires only:

1. a versioned `Prism Baseline Bundle -> Buster plan` adapter;
2. stable Prism target identity in generated test configuration and results;
3. mapping for `exact` and `intent` policy;
4. Baseline Bundle digest binding in the existing verdict evidence.

If an existing contract already supports one of these fields, the adapter reuses it.
It must not create a duplicate field.

## Acceptance checks

Point 11 is implemented only when tests prove that:

1. the adapter rejects an invalid bundle or digest;
2. every required Prism target maps to an existing Buster suite target;
3. exact and intent policies map deterministically;
4. Buster runs without importing Prism domain types into worker-core;
5. results identify the exact Baseline Bundle and Prism target;
6. existing evidence, retry, telemetry, and approval systems remain canonical;
7. infrastructure failures cannot become passing fidelity results;
8. the pipeline cannot update the Prism baseline without explicit approval;
9. old preview baselines remain usable through the compatibility path;
10. no second comparison engine, fidelity report, or approval mechanism exists.
