# Echo review Phase 7 design and audit record

## Point 1 — output-path and authority audit

The Phase 6 boundary already provides frozen review bundles, certified proposal
preflight, independent verifier verdicts, certified findings, deterministic
root-cause governance, bounded repair batches, and canonical `StageResult` output.

The remaining Phase 7 gaps are:

- `maxAdvisories` and `maxRecommendations` have no publication consumer;
- Simplification simplification proposals are validated but not retained as advisories;
- follow-ups are represented only by counts and proposal IDs;
- rejected and ignored proposals are not retained in a stable report;
- no immutable per-attempt review report is written;
- the review stage has no `artifacts.write` capability;
- profile behavior is therefore declared but not fully observable.

The ownership decision remains unchanged. Echo proposes. The semantic verifier
confirms eligible blockers. The review plugin classifies, bounds, persists, and
returns a canonical stage result. Core controls the lifecycle. The artifact store
stores an immutable report but does not decide review behavior.

The smallest implementation is one closed `review-report.v1` contract, one pure
report builder, one artifact write, and one result attachment step. No service,
queue, mutable ledger, database, or new lifecycle contract is required.

## Point 2 — immutable report contract

`review-report.v1` is a closed JSON contract. It binds the report to the task,
attempt, policy digest, bundle digest, base revision, head revision, and changed
file manifest. Each item has one disposition and one source identity. Verified
findings use their stable finding fingerprint. Echo proposals use their stable
proposal ID. The report stores omitted counts for every disposition.

The item map is keyed by stable SHA-256 IDs. This makes duplicate IDs impossible
by construction and avoids redundant item IDs inside each value. Runtime parsing
and JSON Schema tests share the same boundaries.

## Point 3 — deterministic classification

The report builder reuses the verified-finding classifier used by the decision
reducer. A confirmed blocking finding becomes a blocker. Other confirmed
findings become follow-ups or ignored items according to the frozen policy.

Rejected proposals become ignored items. Insufficient proposals follow the
frozen uncertainty policy. A valid Simplification proposal can become an advisory.
Every other retained proposal becomes a follow-up. Confirmed proposals are not
duplicated because their independently verified finding is the report item.

## Point 4 — bounded advisory output

Advisories are ordered by estimated net code reduction, then stable item ID.
Their effective limit is the lower of `maxAdvisories` and
`maxRecommendations`. Follow-ups use `followUp.maxItems`. Omitted counts retain
the full total. Blockers are classified before output limits and remain in the
decision reducer's complete finding set.

The report builder produces identical output when verified findings arrive in a
different order.

## Point 5 — immutable persistence

Each bundle-established terminal attempt writes one canonical JSON report through
the existing `artifacts.write` adapter. The returned reference must match:

- the expected report artifact ID;
- the `kubeclaw.review` namespace;
- the canonical report digest and byte count; and
- the current run, stage, attempt, and attempt number.

A missing identity, failed write, malformed reference, unrelated reference, or
digest mismatch produces a blocked result. Invalid input or policy that fails
before a frozen bundle exists cannot produce a bundle-bound report.

## Point 6 — operational profiles

- `gate` keeps confirmed P0 blocker authority and publishes no advisories.
- `lean` keeps the same P0 gate and publishes at most three high-confidence
  Simplification simplifications.
- `audit` remains diff-focused, retains the P0 gate, accepts wider follow-up
  coverage, and publishes up to ten configured Simplification recommendations.

Whole-project audit remains a separate future capability.

## Point 7 — canonical result integration

The report is attached to the existing `stage-result.v2`. Passing results expose
bounded report metrics as decision facts. Non-passing results expose them in the
existing reason evaluation object because the canonical result contract does not
permit top-level facts on those outcomes. No new outcome or lifecycle authority
was added. Advisories never enter the repair batch.

## Point 8 — integration and adversarial proof

The live test uses real Git commits, plugin discovery, capability grants,
repository reads, runtime dispatch, artifact storage, pipeline core, and journal.
Only the external Echo service is replaced by a local deterministic HTTP server.
It proves all three profiles, advisory limits, omitted counts, immutable artifact
storage, and unchanged P0 repair authority.

Focused adversarial tests prove:

- report output is independent of finding order;
- artifact-write failure blocks;
- a valid but unrelated artifact reference is rejected; and
- a semantic failure after bundle creation still stores its terminal report.

## Point 9 — audit record

Terra/high reviewed each material boundary with model `gpt-5.6-terra`, high
reasoning, and `/app/node_modules/@openai/codex/bin/codex.js`.

The reviews found nine valid edge cases. Semantic terminal failures could skip
report persistence. A stored artifact response was not bound strongly enough to
the requested report. A later semantic error could lose certified proposal or
finding state. The published JSON Schema did not enforce the runtime
outcome/blocker rule. A verifier-request limit needed to retain preflight state
without changing its orchestration result. All nine issues were fixed and have
direct tests. Runtime transport failures still propagate to core unchanged.

The final closeout review also asked whether attempt number zero could fail an
artifact match. That finding was rejected. The comparison list contains boolean
equality results; `0 === 0` is `true`, so `.every(Boolean)` does not coerce the
attempt number itself. The same review correctly found that finding construction
could lose an already certified verdict mapping. Verdict mapping now occurs
before finding construction and is retained in terminal reports.
The last valid finding covered a context-expansion failure after the initial
bundle was frozen. Known dispatch and expansion failures now persist a terminal
report against that frozen bundle. Provider and transport failures still
propagate to core.
The final issue covered a confirmed proposal when verified-finding normalization
failed. The terminal report now retains that certified proposal as a follow-up
instead of dropping it or treating it as a repairable blocker.
The last issue covered failure after an expanded bundle was already sent. The
integrity error now carries that latest frozen snapshot, so its report does not
fall back to the initial bundle.

One final review claim about the live advisory server was rejected. Simplification
proposals are explicitly ineligible for semantic blocker verification, so the
advisory scenario has one Echo dispatch and no verifier dispatch. The live test
now counts verifier requests and asserts this boundary directly.

The complete review-package suite, 40 source configurations, 416 source files,
Knip, full review-package ESLint, SDK checks, plugin builds, sandbox build,
contract checks, generated inventory, documentation checks, and diff checks pass.
The canonical product verifier passes through Buster and all preceding live
plugins. It then reaches the known unrelated `runtime-dispatch` fixture, which
does not select a provider for its required `git.repository.read` capability.
Phase 7 does not change that fixture. The full E2E matrix remains deferred.
