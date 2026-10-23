# Bounded independent Prism handoff recheck

**Verdict: material corrections verified at proposed-definition scope; two native sequencing gaps remain. Target-definition completeness is not accepted.** No global C0, implementation, installed-image or runtime acceptance follows.

Reviewer `/root/core_schema_closure` did not author these two parent targets. Core artifacts/question batch were excluded and unchanged. The original [review](independent-config-c0-prism-handoff-bce3f075-20261013.md) and parent's pre-correction snapshots remain historical.

## Frozen inputs and reproduction

Stand `bce3f075156a86be345821499c04628cb35c2762`, tree `a8b0adf641de573565360b0c4eb577d6bc7545c3`. Exact32 input snapshots/hashes are in [input-freeze.json](../evidence/config-acceptance/independent-prism-handoff-recheck-20261013/input-freeze.json). Parent inputs were frozen; Runtime/Delivery remain mutable and are not newly accepted here.

Reviewed parent inputs: `PRISM-HANDOFF-TARGET-20261013.md`, strict proposed schemas/specimens in `prism-handoff-target-contracts-20261013.json`, updated primary rows/cases/cardinality proposal and historical preservation, plus productive admission/result/host/storage sources.

Independent reproduction:

```
node docs/review/evidence/config-acceptance/independent-prism-handoff-recheck-20261013/check-prism-handoff-definitions-independent-output.mjs
```

All13 documentation schema/hash controls passed; all26 newly specified cases remain `not-run`. The parent checker writes its receipt into the author directory, so the reviewer copied it and changed **only the output receipt destination**. [Adaptation identity](../evidence/config-acceptance/independent-prism-handoff-recheck-20261013/runner-output-only-adaptation.json) records both hashes; no assertion/input/validator behavior was altered. [Raw output](../evidence/config-acceptance/independent-prism-handoff-recheck-20261013/reproduced-definition-controls.log) and [independent receipt](../evidence/config-acceptance/independent-prism-handoff-recheck-20261013/independently-reproduced-definition-receipt.json) are preserved.

These controls prove strict specimen structure and declared digest/reference concordance, **not** actual task intent, OCI, installed files, grants, F-MUT or future productive verifier behavior. Previously reproduced current5 design/current4 image controls remain source-valid; no relevant productive source changed and needless repetition was avoided.

## Original findings: material correction assessment

| Finding | Bounded recheck |
|---|---|
| PPRISM001 first durable count binding | Corrected in proposed definition |
| PPRISM002 overbroad current host/profile equality | Corrected in current source description |
| PPRISM003 unspecified provenance tuple/future cases | Typed identities and case coverage materially corrected; temporal effect guards still incomplete below |

### PPRISM001

The correction now captures a strict `prism-design-binding.v1` at the first `startDesignRound` transaction, includes it in the new canonical start input/digest, and retains historical encodings. It distinguishes unchanged-key original lookup from an explicitly changed binding conflict. Later job hashing/admission derives from the committed round, not latest selection.

Separate cases cover both routes, crash between round/job transactions, pre-ledger completed/no-new-effect behavior, missing historical binding, original-request/digest compatibility, tool R compatibility, every client completion/removal path, mixed generation and fixed Eval. A3 partial1/2 results remain pending.

B2 eligibility is now deliberately restrictive: a new structured exact2 task with matching original authorized architecture/project constraint snapshots and generated cardinality instructions. Legacy/free-form/exact3 tasks cannot be shortened into B2; arbitrary narrative cardinality inference is not claimed. Enum2/3 and the new task form remain **proposed/unapproved**. No current two-design API support or A6 business/runtime acceptance is inferred.

This meets the original finding's **definition** request. Its actual input/verifier/schema/business integration remains future approved work, not evidence supplied by the13 controls.

### PPRISM002

The row now explicitly identifies current equality as fresh supervisor `!recovered` only; recovered paths use original journal/history, while the dedicated host validates a declared envelope and imports no installed profile identity guard. `nativePrismHostConfig` does not read engine digest. No installed-image authentication is claimed from the existing hash/import controls. This matches productive source.

### PPRISM003

The generated provenance record now separates role, OCI manifest/index/platform, source/package/tree/lockfile, retained installation manifest, selected worker config, accepted profile, capability contract and original grant set. Proposed schemas reject unknown fields; specimens carry explicit synthetic/not-observed qualifications. Original `engine_operation` reservation, same-key/replay/legacy uncertainty and fresh/recovered/fixed-Eval compatibility have concrete planned cases.

Current OCI meaning of `engine.contentDigest` is preserved; historical OCI is not relabelled code content and development synthesis cannot substitute for missing production provenance. This is a substantive correction rather than accepting opaque SHA strings as physical observations. However the proposed guards must resolve the two source-based sequencing gaps below.

## Remaining findings

### PPRISM004 — verification must gate unverified imports, not only engine prepare (blocking definition)

[Native host](../../../skills/prism/server/native-worker-host.ts:3) statically imports `PrismEngine`; its worker-operation import also resolves engine binding dependencies before `main` or `prepare`. [Engine index](../../../skills/prism/engine/index.ts:4) has additional static dependencies. Node evaluates these modules before the proposed host verifier positioned “before `nativeOperationFor`/prepare.”

The contract and `AUTH-PRISM-NATIVE-PROVENANCE-CODE-MISMATCH` promise rejection before engine/artifact effects for mismatched installed bytes. A guard only before prepare cannot justify that promise for unverified module initializers or already cached code. The trusted OCI check is not a substitute for the separately required code/package match, which the correction itself distinguishes.

Define the **trusted prelaunch/bootstrap gate** before any unverified entry/engine/dependency module import or initializer. Its own trust identity must already be established. Verify the selected immutable code closure and pin the verified runtime/code identities through loading/execution; post-import rehash cannot retroactively authenticate cached code. The dedicated-host pre-prepare check may be an additional check, not the first authority boundary.

Add/clarify the exact mismatch oracle using a genuine disposable module fixture whose initializer would attempt an owned marker/artifact effect if loaded: rejection occurs **before loading it**, with zero such effect and a restored compatible positive. No new C1 implementation or execution is requested during C0; the missing item is sequencing/guard definition.

### PPRISM005 — admitted input spooling is a real pre-reservation effect (blocking definition)

[runNativePrismOperation](../../../skills/prism/control/native-operation.ts:14) calls `artifacts.put` **before** `reserveNativePrismOperation` at line18. This is not pure reference calculation. [ContentAddressedArtifactStore.put](../../../skills/prism/storage/artifacts.ts:43) ensures directories, opens/writes/syncs a pending file, links/verifies it and syncs/removes pending state. It writes pending bytes even when the final content already exists.

The correction attaches provenance at original `engine_operation` reservation and says missing verification rejects before “any engine/artifact effect”; result replay is described as hydration-only. The current caller has an earlier input-spool effect, including before its cached-result lookup. This must not be silently omitted from effects or accounting.

Define the proposed first admitted input-spool boundary: capture/verifiably retain its original module/policy/provenance and input/storage accounting **before that write**, or compute exact content/reference identity without IO and perform original-key/reservation/replay checks before storing. Distinguish accepted bounded input preparation from native engine/output effects; no zero-write oracle may ignore pending/directory writes. A later native-code rejection may legitimately leave an originally admitted input artifact only if its binding/accounting/disposition is explicit, not a waiver.

Specify same-key conflict, crash after input admission/spool, pending verification failure, original cached-result replay and original-budget recovery cases with exact writer/retention/cleanup oracles. No new claim/deadline/grant/latest policy or invented storage cap may fill the gap. The parent independently acknowledged both sequencing questions before modifying inputs; this report remains a frozen independent finding record.

## Gate boundary

Strict proposed records, first-round capture/recovery rules, original-intent protection, corrected current identity description and26 new case specifications are **verified material definition corrections**. PPRISM004/005 prevent accepting the remaining native effect-boundary definition. All future integration/verifier/image/DB/model cases remain not-run and do not block this review merely because C1 implementation has not happened.

No Core self-review, global C0 verdict, production/test edit, live API/host/image action, commit or permission promotion occurred. Fresh bounded recheck is required after these material sequencing corrections; the still-required independent whole-C0 review remains separate.
