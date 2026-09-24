# Echo review Phase 6 design and audit record

Status: complete
Owner: `skills/nova/plugins/review`

## Point 1 — boundary audit

Phase 4 already gives every confirmed finding a stable fingerprint and private
proof bound to the bundle, proposal preflight, verifier reconciliation, and
resolved policy. Exact duplicate findings collapse before reduction. The reducer
is the only plugin component that creates pipeline disposition.

The existing Echo proposal contract already includes an optional
`rootCauseHint`. The verifier receives the complete proposal. Phase 6 therefore
does not need another verifier response version or another dispatch. Verifier
guidance will state that a confirmed verdict also confirms a supplied root-cause
hint.

The plugin uses a hint for shared clustering only when it is a normalized stable
slug. Other hints remain review text and create singleton clusters. This is
backward compatible and fails conservatively.

Only confirmed findings enter Phase 6. Rejected and insufficient proposals,
unverified Echo output, and Simplification candidates remain outside this boundary.
Ranking and presentation limits cannot affect blocking authority.

This is smaller than the initial Phase 6 proposal and preserves every approved
safety decision.

## Point 2 — root-cause contract

The contract defines a fixed schema version, closed repair classes, normalized
shared-hint admission, and deterministic repair classification. Non-normalized
hints do not fail review. They use singleton fallback.

The first Terra/high review found that the new contract test was not part of the
default package test command. The finding was accepted. The default suite now
runs it.

## Point 3 — verifier confirmation

The existing verifier request now states that `confirmed` applies to the complete
proposal, including a supplied `rootCauseHint`. A verifier must reject a proposal
when the hint states a different cause than the frozen evidence supports. No new
verdict, output field, protocol version, or dispatch was added.

## Point 4 — certified root-cause identity

Confirmed findings now carry a certified root-cause record. The record contains
the review category, stable shared hint when eligible, primary path and symbol,
and a closed repair class. It is created only while building the privately
certified verified-finding set.

Shared cluster IDs hash the repository base and stable root-cause fields.
Free-text messages and line hints are excluded. A missing stable hint hashes the
finding fingerprint and therefore creates a singleton cluster.

The first Terra/high review found that the root-cause certification factory was
exported. The finding was accepted. Minting now exists only inside the verified-
finding builder; other modules can only check its private proof. The review also
claimed that line hints affected primary-location selection. That finding was
rejected after checking `locationIdentity`, which contains only path and symbol.
The rerun found that a proven root cause could be transplanted to another finding
of the same category. The finding was accepted. Private provenance now binds the
root cause to the exact verified-finding fingerprint. A separate note that IDs
were not yet in output was deferred to point 5, which owns that integration.
The final review found that the direct identity test exercised only singleton
fallback. The finding was accepted. The verified-finding suite now proves stable
shared IDs and transplanted-proof fallback through the real certification path.
The next review found that the transplant assertion also changed repository base,
which made it ineffective. The accepted fix now changes only the finding
fingerprint while keeping the same base.

## Point 5 — deterministic grouping

The cluster builder accepts only the privately certified verified-finding set.
It hashes each finding through the stable identity contract, groups exact IDs,
sorts members by fingerprint, and sorts clusters by cluster ID. Input order cannot
change the result. The initial representative is the lowest fingerprint. Point 6
replaces that selection with ranked representative choice.

## Point 6 — pure ranking

Ranking uses only frozen policy integers: priority weight, category weight,
introduced-by-diff bonus, and direct-evidence bonus. A cluster score is its
highest member score. That member becomes the representative. Equal scores use
finding fingerprint; equal cluster scores use cluster ID. Ranking is privately
bound to the certified cluster set and resolved policy. It has no disposition
input or output.

## Point 7 — bounded repair batches

The repair-batch builder accepts only a certified ranking and an explicit set of
finding fingerprints selected by the reducer. It applies `maxRootCauses` and
`maxInstancesPerCluster` to displayed repair details. It records total and
omitted root causes, total findings, and omitted instances. It does not modify
the verified-finding set or disposition input.

The first Terra/high review found that the batch proof did not bind the selected
finding array and that root-cause truncation was missing from instance omission
accounting. Both findings were accepted. The proof now binds the exact reducer
selection, and `omittedFindingCount` covers both forms of truncation.
The rerun found that reference identity alone did not detect later array
mutation. The accepted fix also stores and recomputes a canonical fingerprint-set
digest.

## Point 8 — canonical integration and evaluation facts

The verification boundary now builds one privately certified governance value
from the exact certified finding array and frozen policy. Reduction validates
that proof before use. Certification preserves the already-frozen finding-array
reference when governance is present, because copying it would sever the proof.

The reducer still classifies every verified finding before it creates a repair
batch. The complete blocker set therefore determines `request_fix`. Ranking and
limits only select the bounded details shown to the repair worker. Canonical
`stage-result.v2` output records total and omitted root causes and findings.
Evaluation facts record total root causes, shared root causes, and ranked
findings without adding a new lifecycle result.

The implementation audit found that the reduction validator had accidentally
made `rootCause` mandatory on manually certified legacy findings. The accepted
fix keeps the field optional while rejecting unknown fields. The complete review
plugin suite then passed. The Terra/high review returned no actionable findings.

## Point 9 — hardening and closeout

The closeout updates the package overview, roadmap, and generated plugin
inventory. The complete review package suite, schema checks, TypeScript, the
40-config skill typecheck, Knip, SDK generation and build, plugin and sandbox
builds, focused contracts, documentation checks, focused ESLint, and diff checks
pass.

The broader plugin-system verifier passes every check through provider catalog
and then stops at the pre-existing Buster live-runtime fixture, which returns
`ERROR` where the fixture expects `PASS`. Phase 6 does not change that package.
The E2E matrix remains operator-deferred and was not run.

The final full-branch Terra/high review used the Phase 6 starting commit as its
base and reported no accepted or actionable findings. It confirmed that the
complete verified-finding set controls disposition before clustering, ranking,
and presentation limits.

## Independent completion re-audit

The completion re-audit checked Phase 6 again against the approved architecture
and acceptance criteria. It found no trust-boundary or lifecycle defect, but it
found two proof gaps. Input-order independence was implied by sorted output but
was not tested directly. The live package test also proved only a clean review,
not a confirmed blocker flowing through governance into canonical
`request_fix` output.

Both gaps are closed. The verified-finding suite now repeats independent
preflight, verifier reconciliation, finding certification, clustering, and
ranking with reversed proposal input. It proves identical cluster identities,
members, representatives, and scores. The live function suite now uses a real
temporary Git repository, plugin registry discovery and activation, repository
adapter, runtime dispatch, network and secret-resolver adapters, pipeline core,
and journal. A local HTTP service replaces only the external Echo and semantic-
verifier service. Three confirmed P0 findings prove shared and singleton root
causes, bounded presentation, complete totals, and canonical `request_fix`
authority through the real plugin boundary.

The re-audit also ran ESLint over the complete review package rather than only
the previously focused file set. Four existing Phase 3 and Phase 6 modules
exceeded structural lint limits. Their parsing and reduction steps were split
into smaller pure helpers without changing contracts or authority. Full package
ESLint now passes.

The review package tests and build, full skill typecheck, plugin and sandbox
builds, Knip, SDK checks, focused contracts, generated inventory, documentation,
ESLint, and diff checks pass. Production dependency audit still reports the
known `ajv`/`fast-uri` development-tool chain, for which npm reports no fix.
That advisory is repository-wide and was not introduced by Phase 6.

The Buster verifier stop was diagnosed separately. Its live worker extracts a
job repository below the feature worktree, but legacy path authority still uses
the ambient default `REPO_DIR`. Buster therefore rejects its own extracted
`project_dir` as outside the allowed repository scope before it runs the test
command. Phase 6 does not touch Buster. The correct separate repair is to bind
path authority to the worker's explicitly certified extracted repository root
and prove that behavior in Buster's live package test.

The final re-audit used `gpt-5.6-terra` with high reasoning and the repository's
required Codex binary. It reviewed the complete Phase 6 range from `89f017ea5`
and returned no actionable findings. Phase 6 is complete; no Phase 6
implementation work remains.
