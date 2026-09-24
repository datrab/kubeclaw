# Echo review Phase 5 design and audit record

Status: complete
Owner: `skills/nova/plugins/review`

## Point 1 — deterministic fact-source audit

The current plugin already has these trusted facts:

- a frozen Git base and head;
- the normalized changed-path manifest;
- bounded focused source context read from the frozen head;
- canonical caller evidence with verified SHA-256 digests;
- a resolver-owned immutable review policy; and
- exact Echo proposal, verifier, and reducer trust boundaries.

It does not have a complete repository graph or a general structured output
contract for Knip, JSCPD, dependency-cruiser, or language AST tools. Absence from
focused context cannot prove global non-use. Phase 5 therefore must not infer
global facts from a partial file set.

The safe input is a reserved canonical `simplification-facts.v1` evidence artifact.
External deterministic analyzers may supply it. The plugin validates and maps
facts to rules. Missing artifacts produce no candidates. Malformed artifacts
produce source diagnostics. They do not affect correctness review.

Each fact artifact must identify the repository base, frozen head, and normalized
changed-manifest digest that its analyzer used. The plugin compares all three
values with the stage-time frozen revision before it accepts any fact. A stale,
cross-repository-lineage, or cross-snapshot artifact produces a source diagnostic
and no candidate. A well-formed schema alone is not proof of revision identity.

The existing Echo contract already declares Simplification categories and candidate
IDs, but candidate IDs are not yet supplied or validated. The policy already
declares registry version, enabled rules, minimum confidence, and recommendation
limits. Phase 5 activates candidate generation controls. Recommendation output
limits remain Phase 7 work.

This audit confirms that a canonical evidence manifest is the smallest safe
integration. It preserves `review-bundle.v1`, uses the current snapshot digest,
and does not add repository access or lifecycle authority.

The Point 1 Terra/high review found that the initial audit did not bind external
facts to the frozen revision. The finding was accepted. The plan now requires
base, head, and changed-manifest identity in every fact artifact.

## Point 2 — candidate contracts and rule registry

Phase 5 defines closed `simplification-facts.v1` and
`simplification-candidate-manifest.v1` contracts. Both carry the exact base, head, and
changed-manifest identity. Facts and candidates are bounded, normalized, sorted,
deep-frozen, and parsed without accepting unknown fields.

The `simplification-rules.v1` registry gives SIM001 through SIM008 one fixed category and
name. Candidate parsing enforces the rule/category relationship.

The first Terra/high review found three contract gaps: the candidate manifest
did not carry revision identity, candidate categories were not checked against
their rules, and duplicate diagnostic identities could preserve input order.
All findings were accepted and fixed. The rerun reported no actionable findings.

## Point 3 — evidence-gated deterministic miners

The miner consumes only canonical `simplification-facts` evidence, the frozen revision,
reviewed context paths, and a resolver-owned policy. It rejects stale facts,
filters unreviewed paths, disabled rules, and confidence below policy, and maps
each accepted fact through the fixed rule registry. Missing facts produce an
empty result. Malformed or stale optional sources produce diagnostics.

Candidate identity excludes source ordering and uses canonical semantic content.
Exact semantic duplicates collapse. When duplicate facts come from different
artifacts, the smallest `(source digest, fact ID)` pair wins deterministically.

The first Terra/high review found that duplicate source selection depended on
input evidence order. The finding was accepted and fixed. The rerun reported no
actionable findings.

## Point 4 — immutable candidate manifest certification

The builder converts mined results into one canonical manifest evidence item.
It validates the plugin-authored shape, deep-freezes it, computes its SHA-256
digest, and records private provenance bound to the exact revision object and
resolver-owned policy. Disabled policy returns no manifest.

The first Terra/high review asked for explicit protection against mutation after
certification. The parser already deep-froze the value, but the finding exposed
an implicit dependency. Certification now also checks the outer freeze and
recomputes the canonical digest. Tests prove nested immutability. The rerun
reported no actionable findings.

## Point 5 — frozen bundle integration

When Simplification is enabled, bundle construction builds the manifest after focused
context selection and before snapshot creation. The manifest evidence is covered
by the existing bundle digest. A context expansion rebuilds the manifest from the
expanded reviewed path set. Disabled policy adds no manifest.

The caller cannot submit the reserved `simplification-candidates` evidence kind.
Appending internal evidence still obeys the existing evidence and bundle limits.
The live stage and input-boundary tests pass. Terra/high reported no actionable
findings.

## Point 6 — Echo candidate-reference binding

Echo candidate IDs are now strict SHA-256 values. Preflight accepts them only
from one valid candidate manifest bound to the review revision. It checks enabled
rules, candidate category, reviewed locations, and citation of the manifest as
evidence. Unknown or mismatched references become integrity issues.

Simplification metadata is valid only on simplification findings. Preflight excludes
every Simplification-backed proposal from blocker eligibility, even if a caller bypasses
the Echo parser. The first Terra/high review found that this defense was not
explicit at preflight. The finding was accepted and fixed. The rerun reported no
actionable findings.

## Point 7 — advisory isolation and optional-source failure

Live-stage tests now prove that a valid Simplification simplification remains advisory.
It does not enter blocker verification, cannot dispatch the semantic verifier,
and cannot produce `request_fix`. Correctness review continues independently.

Malformed optional `simplification-facts` evidence produces no candidate and does not
block a clean review. This rule applies only to optional external analyzer input.
Plugin-owned manifest or bundle integrity failures still fail closed.

The Terra/high review reported no actionable findings.

## Point 8 — policy consumers and evaluation facts

Phase 5 now has live consumers for `enabled`, `registryVersion`, `enabledRules`,
and `minimumConfidence`. The miner applies rule and confidence filters. Manifest
and reduction certification bind the registry and policy values.

Canonical stage results report whether Simplification is enabled, the active registry,
enabled-rule count, minimum confidence, candidate count, and source-diagnostic
count. Candidate and diagnostic counts come from the manifest that is bound to
the frozen review revision. Reduction certification rejects evaluation values
that disagree with the resolved policy.

`maxRecommendations` and the general advisory budget are not Phase 5 controls.
They remain declared for Phase 7, where advisory selection and output governance
will use them. Phase 5 does not silently truncate the candidate evidence set.

The Terra/high review reported no actionable findings.

## Point 9 — hardening and closeout

Closeout connected both Simplification JSON Schemas to the schema/parser parity suite.
This exposed two missing schema constraints: repository paths and fixed
rule-to-category mappings. Both constraints now match the semantic parsers. Knip
then confirmed that the schema exports have real consumers.

The review package tests, TypeScript, Phase 5 focused ESLint, skill TypeScript,
Knip, SDK checks, plugin and sandbox builds, documentation checks, inventory
checks, and diff checks pass. The full plugin-system verifier passed all contract
checks before the known unrelated Buster live fixture returned `ERROR` where its
test expects `PASS`. The E2E matrix was not run.

The Point 9 Terra/high review reported no actionable findings. The final
full-branch Terra/high review also reported no actionable findings.

## Completion audit

Phase 5 meets all nine acceptance criteria:

1. Mining is deterministic and bounded.
2. Candidate identities and registry rules are stable.
3. Missing or malformed optional facts do not block correctness review.
4. Echo cannot cite an unknown, disabled, or mismatched candidate.
5. Simplification candidates and proposals cannot produce `request_fix`.
6. Enabled, registry, rule, and confidence controls have runtime consumers.
7. Candidate evidence is covered by the immutable review-bundle digest.
8. Focused checks and all point reviews pass.
9. Plan, design, runtime behavior, and future limits are documented.
