# Independent bounded review: two parent Prism handoffs

**Verdict: current source classifications and narrow controls verified; target-definition completeness NOT ACCEPTED.** This is not global C0 acceptance or the required fresh whole-C0 review.

Reviewer: `/root/core_schema_closure`, independent of the two parent-authored targets below. The reviewer authored Core artifacts elsewhere; **those artifacts and the Core question batch were excluded**, not self-reviewed. No production/test changes, commit, live API, database, image or host action occurred.

## Frozen scope and stand

- `AUTH-PRISM-DESIGN-CARDINALITY`
- `AUTH-PRISM-ENGINE-DEVELOPMENT-IDENTITY`
- Their parent proposal, cases, current trust/role/source evidence and exact productive callers; the linked DLV OCI producer is a source handoff, not an independently accepted delivery package.

Stand: `bce3f075156a86be345821499c04628cb35c2762`, tree `a8b0adf641de573565360b0c4eb577d6bc7545c3`. Exact bytes/hashes and copied inputs are in [input-freeze.json](../evidence/config-acceptance/independent-prism-handoff-20261013/input-freeze.json); relevant complete numbered reads in [numbered-source-read.log](../evidence/config-acceptance/independent-prism-handoff-20261013/numbered-source-read.log). Other authors' directories remained mutable. Verdict applies the frozen rows/cases, not later changes; [end-input-drift.json](../evidence/config-acceptance/independent-prism-handoff-20261013/end-input-drift.json) records the final comparison.

## Independently reproduced controls

```
env -u NODE_ENV -u SWARM_CONFIG node --test skills/prism/tests/directions.test.mts skills/prism/openclaw-plugin/index.test.mjs
node docs/review/evidence/config-acceptance/author/check-prism-image-binding.mjs
node docs/review/evidence/config-acceptance/independent-prism-handoff-20261013/check-local-domain-definitions.mjs
```

Results: original five design definition tests passed, no skips; four real production/dev module-import controls passed; four additional narrow document/diversity/current-companion controls passed. Raw evidence:

- [current design controls](../evidence/config-acceptance/independent-prism-handoff-20261013/reproduced-current-design-controls.log)
- [current image controls](../evidence/config-acceptance/independent-prism-handoff-20261013/reproduced-current-image-controls.log)
- [independent local domain controls](../evidence/config-acceptance/independent-prism-handoff-20261013/independent-local-domain-controls.log)

The reviewer produced three **real schema-valid** fixture documents with pair distances3/3/3 and a two-document pair with distance3, using unchanged contract/diversity functions. This supports2 as a source-compatible **candidate** for the comparison algorithm; it does not prove the HTTP/repository/agent/UI workflow accepts2. All six existing companion documents validate after removing the explicitly unsupported new `designPolicy` field; current rejection of that new field is verified and expected. This is not target-schema or deployment proof.

Image inputs A/B are opaque synthetic format-valid SHA strings. Their distinct derived profile hashes prove hashing/projection, not installed OCI/package provenance. Test-mode missing input produces the actual synthetic development hash. Production absent/malformed input rejects. No genuine image identity or native process effect was observed.

## What is verified at this bounded scope

1. The actual route is `POST /v1/agent/design-sets`. The source-question's older `/v1/design-rounds` label is corrected.
2. Current count3 copies are real: route length/key guards, agent instructions, declared tool parameters/description, repository guard, Studio wait/reject-all gates. Material diversity's score3 and feature weights3/2/1 are separate policies, not cardinality aliases.
3. Count is plausibly an operator-owned business workflow choice, not made immutable by repeated literals. Proposed enum2/3 is conservative in work count, uses the minimum nonempty pairwise comparison, and preserves current upper3. Parent accurately marks it proposed/unapproved/currently unsupported. Original A3 work must still require three complete documents; B2 is a distinct bound task, not a partial completion of A3. This does not grant A6 business or implementation acceptance.
4. Chart `images.worker.digest` feeds `PRISM_ENGINE_CONTENT_DIGEST` for Control and Worker. That is OCI image identity, **not** a recomputed engine code-tree digest. The DLV exact-source alias is appropriate; creating another editable engine digest author would not be.
5. The module profile is materialized at import. Production syntax checks and the development fallback are correctly distinguished; syntax/profile hashes do not authenticate installed bytes. Parent trust/principal/secret/role evidence remains explicitly source/current-composition evidence with target gates open. Its74 current composition controls and structural role checks are not substitutes for these two future business/provenance contracts.

## Findings

### PPRISM001 — first durable round/count binding is not concretely defined (blocking C0 definition)

The proposal captures one count in `agent_job.request/config` before dispatch, but the **first durable admission is earlier**. Both [dispatch-route.ts](../../../skills/prism/server/dispatch-route.ts:52) and [direction-routes.ts](../../../skills/prism/server/direction-routes.ts:111) call `startDesignRound`, then call `admitDesignAgent`. [design-generations.ts](../../../skills/prism/control/design-generations.ts:22) commits its own transaction and hashes `DesignRoundStart` before [agent-admission.ts](../../../skills/prism/control/agent-admission.ts:12) / [agent-jobs.ts](../../../skills/prism/control/agent-jobs.ts:20) opens the job transaction. Existing start input/round request has no selected count/config closure.

Therefore “persist job count before dispatch” does not define which generation owns a round if publication/crash occurs after round acceptance but before job creation. Nor does it define the typed immutable count/reference joining round/start digest, agent request digest, result guard and client `expectedCount`.

Required **definition**, not implementation now: specify the first round capture point and exact typed/reference/hash shape; derive subsequent job/prompt/tool/result/client count only from that retained closure. Add explicit same-start-key A→B, crash-between-transactions, pre-ledger-completed/no-new-effect, missing original closure and incompatible request cases. Define eligibility when architecture/project instructions require three versus proposed B2; “eligible B” alone is not a rejecting predicate. Original three-design intent cannot be shortened by profile selection.

The client also has a direct `completeRound` path called by initial document loading, not only the count3 `waitForRound` gate. The target's expected-count rule must cover **all** completion/removal paths and the generated UI text/tool description, with original A3 partial1/2 responses remaining pending and new B2 completing only its own bound round. No current partial database result was claimed to have been observed.

### PPRISM002 — current profile equality description is too broad (source correction)

The engine row's reader describes accepted-envelope/host profile equality. Actual [native-worker-execution.ts](../../../skills/prism/server/native-worker-execution.ts:25) compares the current imported `prismNativeWorkerProfile` **only when `!recovered`**. [native-worker-host.ts](../../../skills/prism/server/native-worker-host.ts:13) calls `nativePrismHostConfig`, validates the declared envelope and constructs the engine/executor; it imports no installed-profile equality check. `nativePrismHostConfig` does not read engine digest. [worker-operation.ts](../../../skills/prism/server/worker-operation.ts:38) prepare changes state, not installed identity.

Correct the current trace to distinguish fresh supervisor comparison, recovered journal/history validation and the **absent dedicated-host installed image/code check**. A schema-valid declared profile/self-reported receipt is not installed byte authentication. The reviewer did not launch a recovered business attempt and does not assert that an unsafe replay occurred. The source description and future guard/case boundary nevertheless must be exact.

### PPRISM003 — target provenance tuple and future cases remain unspecified (blocking C0 definition)

The current OCI/dev classification is sound, but the target says only “explicit selected delivered role/image/code/config identity tuple, grants/compatibility beforedispatch.” It does not yet define its typed fields, distinct OCI versus packaged engine content/source producers, immutable reference/verifier semantics or complete target A/B bindings.

The sole linked image case is `AUTH-PRISM-C0-IMAGE-BINDING-SYNTAX`: four **current** import/hash checks. No active proposed case specifications cover F-BIND/F-DELIVERY tuple compatibility, code/OCI/config/role/grant mismatch, original-generation recovery, missing historical provenance, retry or fixed Eval. Current row `c0Closed:false` correctly leaves this open; that flag does not supply the missing definition.

Required **definition**: enumerate exact tuple fields/producers/owner aliases and capture/hash/compatibility rules; preserve OCI and code content as separate identities; forbid development synthesis for missing original production provenance. Supply concrete future case IDs, complete inputs/prior states, real verifier boundaries and rejection/recovery/Eval oracles. Actual image/host/C1 execution is **not required now** and must remain not-run until authorized prerequisites exist.

## Requirement/case assessment

| Bounded obligation | Verdict |
|---|---|
| Exact current count readers/route/source distinction | Verified |
| Enum2/3 as conservative algorithm-compatible **proposal**, original A3 preserved | Defensible candidate; not approved business/runtime domain |
| Exact first M/J round/job closure and all client/tool R projections | Definition incomplete: PPRISM001 |
| Current production/dev digest syntax and profile hashing | Verified at narrow C0 scope |
| Unconditional/dedicated-host installed identity description | Correction required: PPRISM002 |
| Explicit target image/code/config provenance and F-BIND/F-DELIVERY recovery/Eval cases | Definition incomplete: PPRISM003 |
| Complete target/control/DB/gateway/model/image/native implementation | Not run; not required for this C0 review |
| Global C0 / Core / delivery / full trust or role acceptance | Excluded/open |

[Machine-readable findings](../evidence/config-acceptance/independent-prism-handoff-20261013/findings.json) preserve exact target/source/correction requests. Fresh scoped recheck must use materially corrected frozen inputs; this bounded review cannot replace the still-required independent whole-C0 review.
