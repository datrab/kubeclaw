# Echo review Phase 5 implementation plan

Status: complete
Owner: `skills/nova/plugins/review`
Phase: deterministic Simplification candidate mining

## Objective

Produce bounded simplification candidates from deterministic facts. A candidate
is a review hint. It is not a defect, a verified finding, or a pipeline result.

The authority chain is:

```text
frozen facts and focused context
        |
        v
review plugin builds candidate manifest
        |
        v
Echo may assess supplied candidates
        |
        v
review plugin validates candidate references
        |
        v
later governance may publish bounded advisories
```

Candidates cannot block a stage or cause `request_fix`. Whole-project mining,
semantic clustering, ranking, advisory publication, and automatic cleanup remain
outside Phase 5.

## Fixed decisions

1. Candidate mining stays in the existing review plugin.
2. Miners consume only immutable focused context and canonical structured facts.
3. The candidate manifest is canonical evidence inside `review-bundle.v1`.
4. No bundle-version migration, service, queue, store, or new lifecycle result is added.
5. Rules emit nothing when their required deterministic facts are unavailable.
6. External facts identify their repository base, head, and changed-manifest digest.
7. Facts that do not match the frozen revision are rejected as a source and recorded.
8. Missing optional facts and unsupported inputs produce diagnostics, not blockers.
9. Malformed optional fact evidence is rejected as a source and recorded.
10. Internal certification failures propagate to core as implementation failures.
11. Echo cannot invent candidate IDs. The plugin validates every reference.
12. Normal review remains diff-focused. Whole-project audit remains deferred.

## Rule registry

- `SIM001`: unused or removable code (`delete`)
- `SIM002`: forwarding-only wrapper (`shrink`)
- `SIM003`: single-use or single-implementation abstraction (`yagni`)
- `SIM004`: unused configuration variation (`delete`)
- `SIM005`: duplicate existing helper (`shrink`)
- `SIM006`: trivial external dependency (`shrink`)
- `SIM007`: standard-library replacement (`stdlib`)
- `SIM008`: native platform replacement (`native`)

Each rule has one fixed category and consumes only matching structured facts.
Rule activation is evidence-gated. No weak source-text guess is added to make a
rule appear active.

## Sequential implementation

1. Audit deterministic fact sources and the current Simplification boundary.
2. Define the candidate manifest and rule registry contracts.
3. Implement evidence-gated deterministic rule miners.
4. Build and certify the immutable candidate manifest.
5. Add the manifest to the frozen review bundle.
6. Bind and validate Echo Simplification candidate references.
7. Enforce advisory-only pipeline behavior and failure rules.
8. Activate Phase 5 policy controls and evaluation facts.
9. Harden, audit, document, run final Terra/high review, and commit.

## Completion criteria

Phase 5 is complete when:

1. Candidate generation is deterministic and bounded.
2. Every candidate has a stable identity and an enabled registry rule.
3. Missing or malformed optional facts cannot block correctness review.
4. Echo cannot cite an unknown, disabled, or mismatched candidate.
5. No candidate or Simplification proposal can produce `request_fix`.
6. Enabled, registry, rule, and minimum-confidence controls have runtime consumers.
7. Candidate facts are part of the immutable bundle digest.
8. Focused checks and Terra/high reviews pass.
9. Documentation is complete, all work is committed, and the worktree is clean.
