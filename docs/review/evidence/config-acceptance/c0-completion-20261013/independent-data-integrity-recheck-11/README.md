# Independent data-integrity recheck 11

Reviewer task: `/root/generation_data_integrity_independent_11`, fresh independent bounded ordinary configuration/evidence validation, no implementation responsibility and no author conversation. Review date: 2026-10-13. Checkout HEAD `0bcaf85d192d031814554c590b1bfca5b3ba81dd`, tree `a42e57276685d526d8c966e14a57ae85a3e0a1ca`; dirty/untracked review inputs are identified by the frozen `active-definition-generation-01/catalog-boundary-04-alias-identity/manifest.json`, SHA-256 `6fbd81bf9edcd02d6d2d17ec73ead1ff7ab81b556ba9ead10fd3fc3d02d2c3e2`. Saved tracked patch: `git-diff.stdout`; status: `git-status.stdout`. The manifest and `identity-before.json`/`identity-after.json` identify exact relevant uncommitted source/test/evidence bytes rather than treating HEAD as their identity.

## Criteria and scope

Read `GOAL-START.md`, `OPENCLAW-CONFIG-GOAL.md`, original acceptance A1–A8, CONFIG F1–F6/F-DOC and D17 component amendments, and decisions D17–D22. Read the preserved independent10 report as findings to challenge, not acceptance authority. Inspected `definition_generation.py`, `definition_cases.py`, `check-matrix.py`, strict parser/baseline loader, logical-path pinning, observation pointer resolution and historical mapping/projection helpers. Exact inspected source text is in `source-inspection.stdout`; command is in `inspection-command.json`.

This review covers only the named parsed-root alias, identity-metadata and invariant-replacement corrections and historical checker final-root file consistency. It is not exhaustive semantic C0 review, runtime acceptance, security assessment, or implementation authorization.

## Completed execution and identity checks

`commands.json` records exact argument vectors, working directory, start/end timestamps and exit codes. `run-review.py` is the retained execution driver; outer invocation was `/tmp/kubeclaw-c0-validator-venv/bin/python docs/review/evidence/config-acceptance/c0-completion-20261013/independent-data-integrity-recheck-11/run-review.py` from this checkout, redirected to `runner-attempt1.stdout` and `runner-attempt1.stderr`. Interpreter environment is preserved in `tool-version.stdout`.

- Existing `check-generation.py`: exit 0, 30 passed, 0 failed; `check-generation-attempt1.stdout/.stderr`.
- Existing `check-case-contract.py`: exit 0, 24 passed, 0 failed; `check-case-contract-attempt1.stdout/.stderr`.
- Existing `check-root-end.py`: exit 0, 10 passed, 0 failed; `check-root-end-attempt1.stdout/.stderr`, with individual actual checker reports in `root-end-controls-04/`.

All expected control IDs were reconciled to actual IDs (not only counts): `control-reconciliation.json`, no missing/unexpected/duplicate IDs. All three stderrs are empty. Each suite ran once to completion; there were no failed or unfinished attempts in this review. Independent10's earlier setup failure and interrupted attempts remain historical and were not overwritten or retroactively passed.

The root-end script normally writes alongside its `__file__`. To avoid rewriting frozen author evidence, an exact byte-for-byte unchanged copy was executed from this review's own evidence directory. Its SHA matches the frozen original; only the output location differs. The harness executes the unchanged actual `check-matrix.py` via runpy in a private hardlinked copied checkout, detaches both canonical writable roots before mutation, and uses ordinary independent copies for explicit roots. Eight faults cover inventory/matrix × canonical/explicit × byte drift/same-byte resolved-target change. Each reached the actual final reread and exited 1 with its exact `REVIEW_INPUT_CHANGED:<selected-path>` error. Two restored positives exited 0 with 2409 settings, 6845 cases and zero errors. Harness reports original roots unchanged; independently captured before/after root hashes agree.

All 70 frozen manifest files matched SHA and byte count before and after. Manifest identity also agrees. Original inventory/matrix bytes, frozen sources, production and tests were not edited. Only this report/evidence directory was authored; no receipt was created.

## Material correction verdicts

### IC10-PARSED-ROOT-ALIAS-001 — verified at bounded loader boundary

`DefinitionRoots.read` records `canonical_sha(document)` into `_parsed_digests` separately from the mutable returned dictionary (`definition_generation.py:24–45`). `matches` compares supplied values to that initially stored digest; `load_paired_generation` checks both inventory and matrix before constructing the generation (`definition_generation.py:196–218`). Digest strings are not aliases to caller dictionaries. Fresh canonical and explicit in-place generation-reference injections absent from the disk roots reject at `DEFINITION_GENERATION_PARSED_ROOT_DRIFT`. Existing parsed/pinned mismatch, history mutation, byte drift, target drift and restored paired positives also pass. The original finding's mutable self-comparison has been corrected.

`check-matrix.py:25–35` reads through the same root verifier and passes it into the paired loader; lines 368–371 perform the final selected-root reread in historical mode as well as active mode. The fresh actual-checker controls above confirm this file-consistency behavior; they do not claim an authentic strict-active acceptance run.

### IC10-CASE-IDENTITY-SHAPE-001 — verified at candidate metadata scope

`definition_cases.py:84–93` requires exactly the five identity categories, nonempty lists, exact `{id, revision}` descriptors, nonempty string identifiers/revisions and distinct IDs within a category. The same loop applies to software, tools, dependencies, images and config. Executed C0 tool identity keys and revisions are separately required to be nonempty strings. Fresh placeholder-software, null-config-revision and null-executed-tool controls reject at intended metadata boundaries; meaningful synthetic metadata positives and existing file-pin observation positive pass.

This makes identities meaningful and closed at the declared metadata level. It does not verify whether an asserted revision names genuine software, whether a profile is complete, or whether an execution has authentic independent origin.

### Invariant replacement obligation — verified as complete candidate validation

`definition_cases.py:62–72` requires replacement catalog presence and requirement coverage, separate original-history context, and `applicability == applicable`, then calls full `validate_case` on the replacement. A requirement-label-only object rejects at `INVARIANT_REPLACEMENT_CONTEXT_MISSING`; a replacement missing planned tests rejects at `PLANNED_TEST_MISSING`; a complete finalized replacement with preserved failed original history passes. Recursive validation therefore includes replacement identity, original body/setting/requirement preservation, specification identities, pinned definition/proposal files, execution-phase constraints and assertion/mutation/restoration obligations. This is full validation under the candidate contract, not proof of executable semantic sufficiency or runtime effect.

## Remaining limits and gate state

No additional material consistency finding was observed within this bounded review. Case validation is still not wired into `check-matrix.py` acceptance; no integration was inferred. `DefinitionGeneration.require_acceptance` still deliberately raises `DEFINITION_GENERATION_SEMANTIC_ACCEPTANCE_NOT_IMPLEMENTED`; the generation suite exercised that fail-closed boundary. Historical strict completion was not separately executed here.

Full per-kind source/domain/profile/consumer/native-case semantics, source/candidate/gap closure, new-discovered-case context, canonical active definitions, authentic independent execution and record/whole-generation receipts remain pending. No broad C0-A–E, F1–F6/F-DOC, C0/001 or ID07-ACTIVE-DEFINITION-TRANSITION-001 acceptance is issued. C0 remains open; C1–C6 approval remains absent. No receipt, deployment, merge, production change or test change occurred.

**Verdict:** the three named material corrections are independently verified at their stated bounded data-integrity/metadata scope; the 30/24/10 controlled-file-validation runs completed. This is not global CONFIG acceptance.
