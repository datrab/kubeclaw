# Echo review Phase 4 implementation plan

Status: approved plan
Owner: `skills/nova/plugins/review`
Phase: independent semantic verification

## Objective

Confirm or reject Echo's proposed blocking findings before the review plugin may
send a repair request to Nova. The verifier is a narrow confirmation step. It is
not a second full reviewer, it cannot create new findings, and it cannot return a
pipeline verdict.

The final authority chain remains:

```text
frozen review-bundle.v1
        |
        v
Echo proposes findings
        |
        v
review plugin performs deterministic checks
        |
        v
fresh semantic verifier confirms or rejects eligible findings
        |
        v
review plugin reduces certified state to StageResult
        |
        v
core owns lifecycle, retries, remediation, and orchestration
```

## Fixed decisions

1. Echo remains the primary reviewer.
2. The verifier checks only findings Echo proposed. It does not search for new
   problems or judge whether Echo missed a problem.
3. The verifier runs in a fresh session with a dedicated verifier role and prompt,
   using the existing runtime-dispatch capability.
4. The verifier receives the same immutable final bundle used by Echo. It cannot
   browse the repository or request another context expansion.
5. The verifier returns only `confirmed`, `rejected`, or
   `insufficient_evidence` for each eligible proposal.
6. The verifier cannot reclassify, rewrite, merge, or add findings. A proposal is
   confirmed as submitted or it is not confirmed.
7. The plugin, not either agent, computes trusted scope, change relation,
   fingerprints, eligibility, and the final `StageResult`.
8. Only confirmed, introduced, in-scope, repairable blockers may produce
   `request_fix`.
9. Core remains the only lifecycle authority.
10. Whole-project audit and missed-defect detection remain separate future
    capabilities.

## Verdict behavior

The initial profiles use these rules:

- `confirmed`: certify the finding and pass it to the existing reducer.
- `rejected`: record the rejection and do not block or repair.
- `insufficient_evidence` in `gate`: require review orchestration.
- `insufficient_evidence` in `lean`: retain the proposal as a follow-up.
- `insufficient_evidence` in `audit`: retain the proposal as a follow-up.
- malformed output, missing result, duplicate result, or bundle mismatch: block
  as a verification integrity failure.
- verifier timeout, provider failure, or transport failure: propagate to core so
  the frozen attempt and retry budget remains authoritative.

An uncertain finding never starts a Nova repair loop. An explicit rejection is
different from a failed verification process.

## Sequential implementation

### Point 1 — audit the existing boundary

Inventory the current placeholder verifier, Echo proposal contract, frozen bundle,
policy modes, reducer certification boundary, runtime dispatch, waits, evaluation
metadata, and tests.

Record which values are:

- supplied by Echo;
- established deterministically by the plugin;
- established by the semantic verifier; and
- consumed by the reducer or core.

Exit: no field reaches `VerifiedReviewFinding` without a named authority and proof.

### Point 2 — define the internal verifier contract

Add one strict internal contract, `echo-review-verification.v1`. It is not a new
public lifecycle result contract.

The request contains:

- frozen bundle and policy digests;
- eligible proposal IDs;
- the exact proposal claims and cited immutable evidence;
- relevant frozen source context; and
- a verifier protocol version.

The response contains one closed result per requested proposal:

```text
proposalId
verdict: confirmed | rejected | insufficient_evidence
reason
evidence references
```

Unknown fields, unknown proposal IDs, missing results, duplicates, invalid evidence
references, padding, oversized text, and excessive arrays fail closed.

Exit: JSON Schema, TypeScript, semantic parser, prompt contract, and parity tests
represent the same closed shape.

### Point 3 — add deterministic proposal preflight

Before dispatch, the plugin verifies:

- every cited item belongs to the frozen bundle;
- every path is repository-relative and present in reviewed context;
- every location belongs to an allowed scope;
- the frozen base and head prove the change relation;
- the proposal is eligible under the resolved policy mode;
- required blocking categories and priorities are respected; and
- exact duplicate proposals are collapsed deterministically.

Agent claims never override deterministic Git, bundle, evidence, or scope facts.
Invalid proposals become integrity failures. Non-eligible valid proposals follow
policy without consuming verifier capacity.

Exit: only bounded, deterministic, policy-eligible proposals can reach the model.

### Point 4 — implement bounded fresh verification

Dispatch one bounded structured verification call per review attempt. The call
uses a fresh session and dedicated verifier instructions. It may inspect only the
provided frozen material.

The dispatch must bind:

- run, stage, and attempt identity;
- bundle and policy digests;
- exact eligible proposal IDs;
- verifier role and protocol version; and
- configured model execution metadata supplied by the runtime boundary.

The verifier does not receive repository tools, mutation tools, lifecycle control,
or a second context-expansion opportunity.

Exit: repeated input produces the same bounded request and independently parsed
response shape; runtime failure cannot be mistaken for rejection and remains
owned by core retry policy.

### Point 5 — reconcile verifier results

Match every response to the exact request and apply the verdict rules above.

- Confirmed proposals keep their submitted semantic classification.
- Rejected proposals are retained in evaluation records with the verifier reason.
- Insufficient proposals follow the resolved profile policy.
- Missing or malformed verification state blocks.

The plugin recomputes trusted change relation and scope relation. It certifies
`repairable` only when the proposed smallest fix stays within the frozen task and
ownership boundary. Otherwise the reducer receives an unrepairable or
outside-scope blocker and may require orchestration.

Exit: raw agent output can no longer reach the reducer, and verifier uncertainty
cannot become `request_fix`.

### Point 6 — create exact finding identity

Create a stable SHA-256 fingerprint from canonical verified finding content and
stable repository identity. Line numbers are hints and do not define identity.

Phase 4 may collapse only exact duplicates. Semantic deduplication, root-cause
clustering, representative selection, and ranking remain Phase 6 work.

Exit: every certified finding has a reproducible exact fingerprint with no claim
that semantic clustering already exists.

### Point 7 — activate verifier policy modes

Implement the declared modes through one code path:

- `disabled`: no proposal is semantically confirmed and no proposal may request
  repair;
- `p0-only`: verify proposed P0 findings that could block under policy;
- `all-blockers`: verify every proposal that could block under the resolved
  policy.

Profiles change declarative values, not implementations. Evaluation metadata
records the selected mode, protocol version, verifier execution identity, counts,
and outcome classes.

Exit: each declared verifier setting has a tested runtime consumer.

### Point 8 — integrate with the existing reducer

Replace the Phase 2 placeholder that turns every proposal into an integrity issue.
Build certified reduction input from deterministic facts and confirmed findings,
then call the existing pure reducer.

Required outcomes include:

- confirmed introduced, in-scope, repairable P0 blocker -> `request_fix`;
- confirmed outside-scope or unrepairable blocker -> orchestration;
- rejected proposal -> no blocking effect;
- gate uncertainty -> orchestration;
- verifier integrity failure -> `blocked`;
- no eligible findings and all requirements satisfied -> `passed`.

Exit: the review plugin returns only canonical `stage-result.v2`; core remains
responsible for every transition and retry.

### Point 9 — harden, document, audit, and commit

Add deterministic, adversarial, contract, and live-capability tests for:

- every verdict and policy mode;
- missing, duplicate, reordered, and unknown proposal IDs;
- forged evidence, paths, scope, base/head, policy digest, and bundle digest;
- malformed, oversized, sparse, deep, and padded values;
- timeout, runtime failure, invalid JSON, and partial verifier output, including
  proof that transport failures remain core retry authority;
- exact deduplication and stable fingerprints;
- recovery and retry isolation; and
- every reducer outcome and precedence edge.

Run focused package tests, TypeScript, contracts, schema/parser parity, generated
inventory checks, Knip, focused ESLint, documentation checks, and
`git diff --check`.

After every applicable point, run Independent review with:

```text
model: gpt-5.6-terra
reasoning: high
binary: /app/node_modules/@openai/codex/bin/codex.js
```

Audit each accepted finding against the fixed authority boundaries, fix it, rerun
the checks, document the decision, and commit the completed point before moving
on. End with a full Phase 4 branch review and a simple closeout report.

## Simplicity and scaling rules

- Do not add another plugin, service, database, queue, or lifecycle result type.
- Use the existing runtime-dispatch, bundle, policy, reducer, and core lifecycle.
- Use one bounded verifier call per review attempt, not one call per finding.
- Perform deterministic rejection and exact deduplication before model work.
- Do not implement semantic clustering early; that remains Phase 6.
- Do not run a second full review or whole-repository scan.
- Preserve complete machine-readable evaluation records while keeping repair
  output bounded.

## Deferred work

Phase 4 does not include:

- Simplification candidate mining;
- semantic root-cause clustering or ranking;
- a full second reviewer;
- missed-defect detection;
- whole-project audit;
- repository-graph construction;
- ClawDeck UI or model-cost evaluation; or
- changes to core lifecycle authority.

## Completion criteria

Phase 4 is complete only when:

1. no unverified Echo proposal can produce `request_fix`;
2. every eligible blocker receives one independently parsed verifier verdict;
3. verifier failure is distinguishable from explicit rejection;
4. uncertainty follows the selected policy without silently starting repair;
5. certified findings have reproducible exact identities;
6. every semantic-verifier mode has a real runtime consumer;
7. the plugin returns only the existing canonical `StageResult`;
8. all focused verification and Terra/high audits pass; and
9. the work is documented and committed with a clean worktree.
