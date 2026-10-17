# Independent bounded case/phase recheck 15

Reviewer: native child `/root/case_phase_independent_15`, 2026-10-13. No author implementation responsibilities; edits confined to this review directory. Requested scope: immutable original case integration, phase/scope/history conservation, discovered-null history, finite JSON, and fail-closed remaining acceptance gates. This is **not whole C0 approval or a receipt**.

## Exact stand and reproduction

Checkout HEAD `0bcaf85d192d031814554c590b1bfca5b3ba81dd`, HEAD tree `a42e57276685d526d8c966e14a57ae85a3e0a1ca`; current reviewed files are dirty/uncommitted and identified individually, not equated with HEAD. Complete reviewed input files, including Python helpers and immutable baseline objects, are copied under `inputs/`. `input-hashes.json` names every input and exact SHA256. `run-manifest.json` records interpreter, commands, exit codes, output digests and before/end identity results; both frozen and live input end hashes remained unchanged on the final run. This is bounded input identity, not a full repository dirty-tree identity or provenance qualification.

Final reviewed library SHA256:

- `author/definition_cases.py`: `3f2ac2d69f95422a1425e7b9e15b003324508f0c3c95016819726a7cbd78514f`
- `author/definition_generation.py`: `26e87eee0f8cbeb07c2cfb802b2aa9b9e88e6eb8a5a0ce18179ba6f22258dadc`
- `author/definition_baseline.py`: `6d33fb02ea0bcf5327d1bb21ab880a701f335e633f9e4a36cf3c4d163d06ebde`

Run from repository root:

```
/tmp/kubeclaw-c0-validator-venv/bin/python docs/review/evidence/config-acceptance/c0-completion-20261013/independent-case-phase-recheck-15/run-focused.py
```

Runner executes the three author scripts and independently authored `recheck.py` in the frozen checkout, with that same interpreter. All four final exit codes are zero and all stderr logs empty. Raw stdout/stderr are retained separately. Author controls: generation 34; case contract 31; registered baseline 11. Independent controls: 41. These counts represent metadata/integrity controls, not productive effects.

## Finding 15-01 — descriptive historical scopes unrepresentable (corrected)

Initial source inspection found that `validate_case` simultaneously required active scope equal to **every** original scope and restricted active scope to `local`/`live`. Actual immutable baseline census: 6,845 cases; 6,399 local, 4 live, **439 descriptive**, 3 absent. Thus 439 descriptive originals could not be finalized without breaking either exact history or scope enum validity. Example actual original: `AUTH-PRISM-ARTIFACT-ACK-BYTES-IMPLEMENTATION`, scope `local definitions plus genuine disposable service/host/API/Secretstore prerequisites for claimed effects`, canonical body SHA256 `b27bd1cf39dea79026b9d5892449a209d05c79a7f9495a50a711d10fb902e44d`.

Author corrected this during the review. Final source preserves the whole immutable original body in `originalCase`, requires `scopeDerivation` with exact historical `originalValue`, nonempty reason and pinned evidence, and conserves typed original local/live values. Descriptive/absent historical scope may now have an explicit finalized local/live discriminator. Independently executed positive for the actual descriptive case passes; wrong originalValue, empty reason, absent evidence, invalid active scope and historical scope rewrite all reject. An actual absent-scope case (`CC-6606-SECRET-CURRENT-RAWCOUNT`) is representable with null historical scope and explicit derivation. **Finding closed at metadata/representability scope only.** The derivation's semantic truth remains a different unimplemented gate; a pinned synthetic file is not proof that a live obligation may be classified local.

The first independently authored attempt (`attempt1.stdout/.stderr`) overlapped the author's schema correction and failed `BODY_INVALID`; it is an interrupted mixed-input attempt, **not a successfully executed pre-correction counterexample**, and has no trustworthy complete pre-correction source hash. No initial hash was reconstructed. `attempt2-*` retains a reviewer-harness StopIteration (the three absent-scope originals were not implementation-proposal cases); this was corrected in review code only. `attempt3-input-hashes.json`, `attempt3-run-manifest.json`, and prior case logs preserve the stand before the author added four more case controls. Final inputs and runs were recaptured and independently repeated after that change.

## Observations and per-boundary verdicts

- **Actual immutable baseline integration — bounded pass.** Registered manifest loader resolves 50,617 typed records and original pointer bodies. Independent `validate_cases` invocation uses the real loaded baseline object and actual original implementation/C0 cases, not an authored copy of original history. Altering original result/phase/scope rejects. The independent invocation constructs only the generation dispatch container; the author generation script independently exercises the complete loader with fully rehashed synthetic catalogs. No actual finalized whole generation was fabricated.
- **Phase conservation — bounded pass.** Real original C0/current-source-definition cases cannot become future implementation; real implementation-proposal cannot become C0. Synthetic controls cover every exact C1–C6 slice and reject slice shifting. Baseline actual phase counts: 96 C0, 2 current-source-definition, 6,722 implementation-proposal, 25 proposed-after-approval. There are no original explicit C1–C6 phase cases, so their tests are explicitly synthetic.
- **History/result/native separation — bounded pass.** Canonical equality covers the entire original case; current implementation result remains not-run, executedEvidence null. Synthetic failed/native-mapping originals are preserved, and deleting native mapping rejects across C1–C6. Actual baseline results are 86 passed/6,759 not-run, with no failed top-level originals; failed controls are not represented as real baseline failures.
- **Discovered history — bounded pass.** Integrated discovered case accepts null original only, rejects fabricated `{}` history and dropped origin requirement links. Origin/source semantics and genuine provenance are not established by this test.
- **JSON numeric boundary — bounded pass.** Both actual registered-baseline script and independent nested JSON controls reject exponent overflow `1e309`/`-1e309`, NaN and infinities, while finite exponents remain supported. Duplicate-key rejection is exercised by the author baseline script.
- **Remaining strict acceptance gates — fail-closed confirmed.** `require_acceptance()` first validates cases, then unconditionally raises `DEFINITION_GENERATION_SEMANTIC_ACCEPTANCE_NOT_IMPLEMENTED`. The independent valid actual-original metadata container and fully loaded synthetic finalized generation both hit that boundary. Legacy case shape hits `DEFINITION_CASE_BODY_INVALID`. `check-matrix.py` invokes this method for a nonstructural active generation and records its exception as rejection. Field/source/gap/native semantics and whole-generation provenance cannot be accepted through valid case metadata; their implementation remains open.

## Limits and remaining work

No unresolved defect found in this narrowly reviewed corrected contract. Full semantic scope derivation, authentic C0 execution/oracles, real consumer chains, setting/source/gap/native closure and genuine whole-generation provenance/review remain unimplemented/unproved. C0 evidence metadata checks only pin identity; they do not parse a stdout oracle or establish that the stated command actually ran. The synthetic C0 evidence in the absent-scope representability control intentionally establishes no real execution. No canonical inventory/matrix, production code or production tests changed by this reviewer. No global C0 acceptance, approval or independent receipt issued.
