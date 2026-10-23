# C1 concrete migration draft — not yet approval-ready

This narrows the first implementation delta; it does not authorize it or assert C0 completion. Original requirements and case bodies remain unchanged. Exact current author hashes, selected canonical field IDs and linked original case IDs are in [scope.json](../evidence/config-acceptance/c0-completion-20261013/c1-package-draft/scope.json). Lifecycle is preserved:28 linked IDs are passed bounded C0 observations,201 are not-run future cases;148 of the latter already contain refined specifications requiring source-specific review. Missing/incorrect oracles and cross-slice allocation remain explicit, not229 blank new tests. Case membership is not acceptance.

## Author movement proposed for C1

| Current editable author | Proposed sole editable author |
|---|---|
| `charts/kubeclaw/files/config/swarm.config.json` | `config/pipeline.config.json` |
| Six sibling `{owner}.config.json` files | `config/components/{owner}.config.json`, preserving owner names |
| `profiles/buster-engine.runtime.config.json` | `config/components/buster-engine.config.json#/profiles/runtime` |

Six owners: prism-control, prism-studio, prism-worker, prism-execution, buster-engine, worker-core. Current complete base and runtime-profile values must survive byte/semantic comparison. The Buster runtime variant is a whole selected owner document, not a patch merged with base. `pipeline.json` remains workflow input. Schemas remain authored in the existing foundation config module; Chart copies are generated delivery artifacts, never independently editable schema authorities.

The current strict entry fixes sibling filenames and its schemaVersion is `swarm-entry.v2`. Moving/renaming a file does not by itself implement complete profile selection. The evolved entry/profile contract is now specified in [entry/profile contract](config-entry-profile-contract-current.md), using pipeline-entry.v3 and explicit complete profile binding; its independent review is still required before approval; do not add an unrelated second system index or silently keep an old-file fallback. Internal Swarm loader names need not be cosmetically renamed to establish one physical author.

## Inseparable productive delta

| Boundary | Current files/callers that must participate | Required result |
|---|---|---|
| Loader/schema | `skills/common/plugin-runtime/foundation/config/swarm-bundle.ts`, `swarm.ts`, `swarm.schema.json`, `swarm-components.schema.json` | Validate complete selected generation and owner identity before publication; preserve no-follow/read-drift/freeze and relations; reject competing old authors, missing values and unsafe refs |
| Helm bundle | `charts/kubeclaw/templates/_swarm-config.tpl`, `configmap-swarm-config.yaml`, `deployment.yaml`; Prism `_swarm-config.tpl`, `_swarm-bundle.tpl`, `configmap-swarm-config.yaml`, workloads | Consume a single generated immutable bundle reachable inside each packaged Chart; no external `.Files.Get`, no independent overlay defaults |
| Images/context | `.dockerignore`, `docker/Dockerfile.buster-runtime`, other actual config-consuming runtime Dockerfiles | Include selected root generation and required schemas; retain source/config/image receipt identity and installed loader behavior |
| Build/release discovery | `scripts/updates/runtime-inputs.mjs`, `release-configuration.mjs`, `deployment-release.mjs`, `.github/workflows/build-images.yaml`, `auto-promote-runtime.yaml` | A config-only change reaches the correct build/deployment input digest and release guard; exact selected generation cannot drift from image receipt |
| Role/package consumers | `scripts/build-runtime-role-bundle.mjs`, `scripts/check-runtime-role-manifests.mjs`, `scripts/package-agent-skill-bundle.sh` | Delivered owner/schema/plugin closure matches actual mandatory and installed optional package semantics; no divergent source-generated copies |
| Native/container locator | `scripts/check-built-runtime-image.sh`, Buster native preparation startup, selected Chart ENV/mounts and Docker ENV | One explicit absolute generation locator, not a settings override; every caller must agree on the new file and schema; old filename must not be auto-selected |
| Fixtures/docs | `tests/fixtures/config/swarm-bundle.mjs`, actual config/Chart/release/image tests, current user docs | Real consumers and negative oracles match new authority; retain existing failure provenance and obligations |

C1 does not implement module-generation persistence, new worker execution topology or live credential/storage/provider operations. It must not be shipped as a file move that leaves CI, release aliases, runtime profiles or the installed loader on the old author.

## Acceptance contracts to complete before approval

- Preserve the original component settings and complete runtime-profile values and relations; reject duplicate authors even when equal.
- For each distinct consumer, identify two valid complete materially different profiles and the observed changed behavior. Reuse exact existing case IDs; do not replace bodies with this list.
- Same real loader positive/negative pairs for missing/type/unit/unknown/relation/profile/reference drift; actual render/package/load rejection, not an isolated substitute checker.
- Verify config-only change detection and selected immutable Chart/image/release generation, then atomic generation publication and startup freeze.
- Exact existing source/test/tool/profile/input identities and concrete command/oracle/prior-state specification for every linked case; implementation remains not-run until approval.
- Fresh complete C0 review and bounded C1 package review; separate local effect from externally unavailable live facts.

## Subsequent slice boundaries (not authorized)

C2 owns Nova/Core orchestration/compiler/runtime policy; C3 owns remaining Engine/Service/Operator/host/deployment settings; C4 owns complete plugin/agent/model/prompt/tool profiles; C5 owns durable module/run/standalone binding and fixed-generation Eval; C6 consolidates real effect/rejection/mutation/recovery/code/document proof. Their exact fields and cases must be included in the eventual reviewable package, not inferred from approving this C1 draft.

## Explicit author-layout correction (G2)

The current proposed component authority is **`config/components/{owner}.config.json`**, matching original component targetAuthorRef contracts. This supersedes the checkpoint16 draft's `config/{owner}.config.json` targets; prior draft bytes are preserved under [history](../evidence/config-acceptance/c0-completion-20261013/c1-package-draft/history-before-author-layout-correction/). The root is `config/pipeline.config.json`; the complete Buster runtime profile is `config/components/buster-engine.config.json#/profiles/runtime`. No second editable Chart copy or implicit fallback is introduced. This is a proposal correction, not an executed source migration.

## Case lifecycle clarification

The earlier phrase “all229 case specifications incomplete” flattened distinct lifecycles. The corrected scope retains28 passed historical C0 observations and201 future not-run cases, including148 existing refined specs awaiting genuine consumer-specific review,40 explicitly incomplete and13 without a specificationStatus. Original case bodies/results/requirements are unchanged. No C0 observation is relabeled not-run or counted as implementation effect. Linked C5 and later proposal cases remain separate from the bounded C1 approval boundary. Prior reviewed draft bytes are preserved under history-before-case-lifecycle-clarification.


## Checkpoint17 consolidated source and complete-pair update

The [latest additive integration](../evidence/config-acceptance/c0-completion-20261013/integrated-source-concordance-02/README.md) now includes586 exact current-source associations to308 original settings:306 of358 candidates associated,52 explicit boundary classifications without guessed links. All96 prior boundaries have [independently verified dispositions](../evidence/config-acceptance/c0-completion-20261013/independent-source-concordance-layout-recheck/boundary-addendum-02/README.md). Four genuinely adjustable policy families remain under their existing deployment/Ops owners and are not silently reclassified constants. Original2,409 fields,6,845 cases,50 requirements and lifecycle results remain unchanged.

The [current whole-component pairs](../evidence/config-acceptance/c0-completion-20261013/c1-complete-profile-pairs-02/README.md) preserve148 original refined effect IDs with154 complete profiles and296 complete proposed entry selections. Strict staged schemas accepted154 profiles; the real current loader accepted296 temporary current-wire views. Two actual caller-masked report B profiles are additively corrected and independently rechecked; the corrected CPU request is not claimed to extend the wall timeout. Two guard-only report-field native-effect classification obligations remain open, alongside exact family fixture contracts. These are bounded C0 observations, not v3 implementation, native effects or future-case passes.

Proposed tuple selection, supported profile-name domain and case lifecycle partition are independently checked. Concrete policy-family, caller/delivery and module/recovery/Eval contracts are the remaining substantive work; whole C0 and C1-C6 implementation authorization remain open.


## Checkpoint18 draft contracts and instantiated source fixtures

[Delivery01/02 reviews](../evidence/config-acceptance/c0-completion-20261013/independent-delivery-module-contract-review-02/README.md) preserve the original rejection and six material corrections. Three residual seams remain: active caller tuple translation, actual fd9 lifetime/quiescence and run-epoch handoff to durable/confidential effect entry. [Local tuple translation03](../evidence/config-acceptance/c0-completion-20261013/pair-entry-selection-translation-03/README.md) preserves all296 selected whole-setting hashes with explicit consumed-owner fixture tuples; authentic boot receipts are not fabricated. Further correction/review is running.

[Four same-owner C3 policy proposals](../evidence/config-acceptance/c0-completion-20261013/policy-family-contracts-01/README.md) now include ten full Chart fixtures and26 finite controls. They are authored proposals under fresh review, not accepted settings or execution. [Additive guard-only case correction04](../evidence/config-acceptance/c0-completion-20261013/independent-c1-case-oracles/family-contracts-04/README.md) removes misleading direct-adapter descriptors. [Actual local fixture definitions](../evidence/config-acceptance/c0-completion-20261013/independent-c1-case-oracles/fixture-definition-01/README.md) instantiate real parser/flatten, safe tar-listing phase, strict provider result/schema and complete guard/group inputs; source slices and independent source predicates are explicitly qualified. No extraction, signed/provider/browser/native operation, API or credential proof is claimed. Fresh independent fixture review is running.

All28 historical C0 passes and201 future not-run cases retain their lifecycle. Guard-specific independent native effects remain open pending independently justified behavior-level grouping/classification; no requirement is waived. Large deterministic raw fixtures remain local and are listed with hashes and regeneration contracts in checkpoint18-fixture-storage.json; no giant archive is added. Original source/schema/test/canonical bodies remain unchanged; globalC0 and implementation authorization remain open.


## Checkpoint19 current contract integration and remaining whole-C0 work

[Current normative proposed contract references](../evidence/config-acceptance/c0-completion-20261013/current-contract-integration-01/README.md) compose preserved baseline with reviewed consumed-owner/lifetime03 and singlefinalreceiver04 corrections. The [final guard recheck](../evidence/config-acceptance/c0-completion-20261013/independent-delivery-module-contract-review-04/README.md) closes R03-01 at bounded static scope. The supported reportbehavior mapping keeps original four scalar IDs/requirements/not-run results with native differences attributed only to effective maxima/memory; exact future observers are FD64→48, address-space4→3GiB and V8heap358→268MiB, not RSS ceilings. Parent currentref conservation is distinct from prior frozen-scope review.

[Fresh whole-C0 readiness review](../evidence/config-acceptance/c0-completion-20261013/independent-whole-c0-readiness-review-01/README.md) is **NOT ACCEPTED**: eight finite substantive tasks WCR01–08 cover remaining provider/task/domain/full-profile, Buster C3, operator/agent/source/fieldpartition/case/package joins. Only WORK-STATE changed during its capture; other144 consulted inputs stable. Structural traversal is not exhaustive semantic acceptance. Current author work targets one complete same-owner Buster C3 profile plus real API-flow/HTTP/OpenAPI provider contracts; no new generic validation infrastructure.

New [recovery source contracts](../evidence/config-acceptance/c0-completion-20261013/recovery-source-contracts-01/README.md) and [secret-provisioning contracts](../evidence/config-acceptance/c0-completion-20261013/secret-provisioning-source-contracts-01/README.md) expose actual productive callers and all81/237 original source candidates, without inventing canonical links or claiming target/full/native acceptance. Source declarations/defaults/provisioning are separate from genuine credential/recovery availability. Independent source recheck and complete corresponding policy/profile definitions remain open.

No original canonical body/result/requirement change, production/schema/existingtest edit, native/API/credential operation, C1–C6 approval, deployment or merge. Original field/case counts and28historical/201future C1 lifecycle remain unchanged.
