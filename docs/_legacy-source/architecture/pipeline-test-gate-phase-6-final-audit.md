# Pipeline Test-Gate Phase 6 Final Audit

Status: complete
Date: 2026-08-09

## Outcome

Phase 6 provides a complete pipeline-side report-adapter system. It accepts a
standard report artifact, runs one exact isolated adapter, and adds normalized
facts to the durable attempt result. The original report remains durable.

ClawDeck and its production storage dependencies are not part of this phase.
The pipeline contracts preserve the identities and evidence references that a
later ClawDeck deployment will consume.

## Phase Results

### 6-A: Facts

The common result preserves passed, failed, errored, and skipped cases. Counts
remain exact. Case and finding details are bounded and state what was omitted.

### 6-B: Registration

Report adapters use the normal plugin registry. A format can have more than
one installed adapter. The resolved plan must select one exact registration.

### 6-C: Isolation

Adapters run outside the Buster host process. The runtime verifies package and
artifact digests. It limits time, memory, CPU, open files, source bytes, result
bytes, cases, and findings. It supports cancellation.

### 6-D: JUnit

The provided JUnit adapter supports common JUnit and pytest output. It uses a
bounded XML 1.0 parser. It rejects unsafe declarations, malformed XML, invalid
UTF-8, invalid characters, and unbounded durations.

### 6-E: Pipeline Connection

Providers explicitly name report evidence and format. Nova freezes the exact
adapter in the plan. Buster retains the source, normalizes it, and stores the
facts in the durable worker result and attempt result.

Normalization does not change the provider verdict. A normalization failure
is an execution error. The source report remains available.

### 6-F: Final Proof

The final proof covers all 109 recorded decisions, all plugin registrations,
worker execution, plan resolution, Buster execution, packaging, live plugin
capabilities, and documentation links.

## Simplicity and Scale

The normal path has five steps:

1. A provider writes a report artifact.
2. The provider names its evidence ID and format.
3. Nova stores one exact adapter identity in the plan.
4. Buster stores the source and runs the adapter.
5. The worker stores normalized facts with its durable result.

Adapters run one report at a time. This keeps memory and CPU bounded. Different
worker attempts can run in parallel. Nova does not parse reports and does not
carry report bytes.

## Reliability

- Provider results have an independent byte limit.
- All normalized reports share one separate byte limit.
- Original reports use content digests and durable evidence storage.
- Adapter package identity is digest-bound.
- Plan identity is checked again before execution.
- Worker finalization is bounded and occurs before terminal persistence.
- Failed normalization cannot silently become a pass.
- A provider verdict cannot be replaced by adapter facts.

## Review Findings

Accepted findings across Phase 6 fixed:

- XML parser safety and duration bounds.
- Package and artifact containment.
- Cancellation and whole-operation deadlines.
- Aggregate normalized-result limits.
- Package inventory, dead-code analysis, and live-test discovery.

Rejected findings were recorded in the related phase audits. They concerned an
intentional pre-cutover contract replacement, a proved ESM behavior, the
accepted per-case finding contract, and a raw provider limit that already had
an independent check.

## Decisions

- D-090 is implemented. Providers report facts. Agents and gates make quality
  decisions later.
- D-108 is implemented. Report errors remain separate facts.
- D-109 is implemented. Exact adapter identity and durable normalization are
  required.

No open Phase 6 decision remains.

## Next Phase

Phase 7 connects Nova and Buster through the remote execution boundary. Nova
must store the resolved plan before dispatch. Buster must return the typed
attempt result, evidence, receipt, and identities defined by the completed
pipeline contracts.
