# Independent Prism schema correction recheck 26

Reviewer: `/root/prism_schema_domain_recheck_26`; fresh independently delegated bounded correction review, no author generator execution or authoring responsibility. Read `docs/review/remediation/GOAL-START.md` and `OPENCLAW-CONFIG-GOAL.md`.

## Reviewed identity and method

HEAD `c2a81d78ed5d1c94b7c1a433259c77961d92c973`, HEAD tree `74a022bc2f86e18a272b8b651a634e9e6b29f85e`, branch `codex/config-c0-semantic-inventory-20261012`. Dirty/untracked workspace status is preserved in `reviewed-status.txt`; exact reviewed input bytes are frozen at their repository-relative paths under `inputs/`, with complete SHA256 identities and individual checks in `checks.json`. Review25's original patch/status and report are preserved in those inputs, not overwritten. This is an exact input-set review, not a clean whole-worktree acceptance.

Independently wrote and ran only this directory's read-only-source comparison `check.py`:

```sh
python3 docs/review/evidence/config-acceptance/c0-completion-20261013/independent-prism-schema-correction-26/check.py
```

Also read actual complete ingestion/jobs templates and the actual image, ingestion, pair and quantity schema objects. No author `define.py`, Helm, network/native/backup/database/app execution or broad tests ran. Writes were restricted to this new review directory.

## Conservation and exact checks

- Batch33 all five package files match review25's frozen package hashes; its four-file manifest pins still match actual inputs. Review25's frozen files, source inputs and original negative verdict remain intact.
- Batch34 manifest pins match actual reviewed bytes; neither manifest grants acceptance.
- 56 unique candidate IDs, every exact originalCandidate body, and the original candidate-dispositions/queue hashes and selected queue IDs are conserved.
- Exactly seven expected rows changed; other49 rows are exact object-equal. Changes within those seven are limited to `currentDomainAndRelations`, added `resolvedCurrentSchemaRefs`, and the four added `enabledConditionalRequiredField` values.
- All740 nonblank source expression pins match exact 1-based source lines and full-file hashes. All63 schema-reference occurrences match actual JSON pointer objects and schema SHA256; 29 are newly added resolved-reference occurrences (not a claim of 29 distinct pointers).
- Superseded batch33 and prior-queue hash refs match; all56 rows remain `definitionAccepted=false`, `runtimeResult=not-run`; globalC0 remains false and no implementation authorization is supplied.

Key input hashes:

| Input | SHA256 |
|---|---|
| Batch33 source-field-definitions.json | `01cee4513e23d72136432ffddf0294e4949e6cf0308a7fd1e023029ef9b8581e` |
| Batch34 source-field-definitions.json | `21dae3b0425a1361801d0af771c646921fcb052ca6fed885d49b15359fb25b26` |
| charts/prism/values.schema.json | `7588db4e045bc4d52c1b46b4bbffeac238f12c9bd074b71aa9592c4ed24589c3` |
| Original candidate-dispositions.json | `2d5267f5a7b0bbc80fd2ba8cf680011e59d7cbdb262e36c7e0031765dc0a2ad6` |
| Batch24 remaining-batches.json | `c0fc9f0996ecdecab945ba7c8b9810d3211e8c418631fddc03ed91a71c4fefad` |

## Material correction findings

**PSSN25-001 corrected at bounded definition scope.** Ingestion line21 candidate `SRC-d0e0f3642fa1eb69`, and Control jobs lines28/46 candidates `SRC-1d99e33649073a2d`/`SRC-9fe4a037d3eec9f2`, each carry the exact images.ingestion/control → shared `$defs/image` → pullPolicy enum chain. Current domain is exactly `IfNotPresent|Never`. No Always admission is inferred from Kubernetes or a separate Envoy schema. Actual templates select those values directly; real pull/cache/registry behavior remains unproved.

**PSSN25-002 corrected at bounded definition scope.** Four resource candidates `SRC-3bb5de68b990eeef`, `SRC-30dce6bcfff73707`, `SRC-4ea73f1582c54391`, `SRC-2fc11d26120ef2b0` retain their exact requests.cpu/requests.memory/limits.cpu/limits.memory field identities. Each pins enabled=true conditional → resources requests/limits pair → required cpu/memory → its unit ref → resourceQuantity. Ingestion's enabled field is independently required boolean; enabled=true requires resources with both requests and limits, each pair requires both cpu and memory. The exact resourceQuantity object carries positive number (`exclusiveMinimum:0`) OR the actual positive-pattern string alternative. Pinned patterns are exact schema bytes, not a replacement or normalization of Kubernetes quantity grammar. Template `required`/`quote` projection remains distinct from native full quantity parsing, request<=limit, scheduler and capacity proof. No blocking material finding remains in these two corrections.

## Bounded verdict

**PASS for the additive batch34 correction of PSSN25-001/002 only.** Independent checks produced zero errors. Review25's historical batch33 NOT ACCEPTED verdict is preserved; this report is the subsequent bounded correction recheck, not retroactive acceptance of its old inputs.

No global C0-A–E acceptance, native/runtime/module/role/profile/security/network/storage/database approval, implementation acceptance, C1–C6 authorization or production change follows. Complete canonical setting/profile/requirement/case joins and real execution gates remain open. All runtime results remain not-run.
