# Echo review Phase 6 implementation plan

Status: complete
Owner: `skills/nova/plugins/review`
Phase: verified root-cause clustering and ranking

## Objective

Reduce repeated confirmed findings into bounded, ordered repair batches. Grouping
must not weaken blocker authority. A clustering failure creates singleton
clusters. It never changes a verifier verdict or turns a blocker into a pass.

## Smallest safe design

Use the existing `rootCauseHint` on an Echo proposal. The existing independent
verifier must confirm the full proposal, including that hint. The plugin accepts
only normalized stable hints for shared clusters. Missing or unsuitable hints use
the finding fingerprint as a singleton key.

This avoids a verifier protocol migration, a second agent call, fuzzy matching,
embeddings, storage, and a new service. The plugin owns exact grouping, stable
SHA-256 identities, integer ranking, limits, and canonical `StageResult` output.

Cluster identity uses only stable certified fields:

- schema version;
- repository base;
- review category;
- normalized root-cause hint;
- primary path and optional symbol; and
- repair class derived from the normalized recommendation shape.

Free-text explanations and line hints never enter cluster identity.

## Authority rules

1. Only independently confirmed findings can enter a cluster.
2. Rejected, insufficient, unverified, and Simplification proposals are excluded.
3. Ranking controls order only. It cannot change disposition.
4. Every confirmed blocker participates in the decision.
5. Presentation limits create a repair batch. They do not erase truth.
6. Missing cluster metadata creates a singleton cluster.
7. Core remains lifecycle and retry authority.

## Sequential implementation

1. Audit verified-finding, verifier, reducer, and policy boundaries.
2. Define root-cause and cluster contracts.
3. Confirm root-cause hints through the existing verifier flow.
4. Certify stable root-cause and cluster identities.
5. Implement deterministic grouping and representative selection.
6. Implement pure policy-driven ranking.
7. Apply bounded repair-batch and instance presentation limits.
8. Integrate canonical results and evaluation facts.
9. Harden, audit, document, run final Terra/high review, and commit.

## Completion criteria

Phase 6 is complete when:

1. Only certified confirmed findings are clustered.
2. Missing or invalid metadata creates a singleton cluster.
3. Cluster identities are stable and exclude unstable text and line hints.
4. Grouping and ranking are deterministic and input-order independent.
5. Ranking and limits cannot weaken blocker authority.
6. Root-cause and instance limits have live runtime consumers.
7. Canonical results report bounded repair batches and total counts.
8. Focused checks and Terra/high reviews pass.
9. Documentation is complete, all work is committed, and the worktree is clean.
