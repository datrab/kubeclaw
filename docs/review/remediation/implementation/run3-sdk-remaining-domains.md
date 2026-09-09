# PCR-SDK-001: current consumer classification after repair-identity work

Read-only audit. Fresh remote `3790b19a7f26e3dd9adef4eed2dfb26b0808263b`
and all 3,322 local cached blobs/modes matched exactly; isolated audit base
`eb211c0da9428f009447dcbbf51f680194f20d92`. Original finding and the remote
80-file historical inventory were reread. That inventory is navigation, not
proof that every legacy `canonicalJson` call needs migration. Repair-author
checkpoint `3b7f609` leaves the review input/cache source blobs below unchanged.

## Domain matrix

| Domain / source | Current classification | Evidence or remaining boundary |
| --- | --- | --- |
| [SDK values](../../../../skills/common/plugin-runtime/sdk/src/values.ts) | Strict JSON validation plus explicitly named portable codec implemented; legacy canonical bytes intentionally retained. | Sparse arrays, exotic values, cycles/getters/nonfinite values are rejected by the common serializer. Keeping the old function is required for declared legacy readers; its existence alone is not a new finding. Existing compatibility/cutover reports carry the actual tests. |
| Artifact adapter + [Core checkpoints](../../../../skills/nova/core/execution/artifact-checkpoints.ts) | Already versioned/independently checked. | Artifact encoding and authenticated original-byte readers are coupled; core checkpoint writes now honor the declared encoding and exact reference. Do not reopen the same fixed checkpoint defect from the historical table. |
| [Effect identity](../../../../skills/nova/core/effects/identity.ts) | Already versioned/independently checked for original effect subjects and payload comparison. | New `effect:json-utf16-v1:` identity; old identity readers select the original algorithm. This does not automatically version upstream strings supplied as idempotency keys (see dependency row). |
| Source/Subject/compiler + [graph/run snapshot](../../../../skills/nova/core/execution/engine-snapshots.ts) | Already versioned with actual legacy/current restart evidence. | Source identity tag, graph v3 and run v2 select portable bytes; old versions remain explicit. Actual CLI recovery recompiles using the stored source profile. |
| Repair authorization/projections | New coupled source at author `3b7f609`, separate independent review applies. | Stage-completion encoding selects pending/order digest; historical causal projections are validated rather than inferred from run-snapshot version. This audit does not duplicate its approval. |
| [Runtime workspace](../../../../skills/common/plugin-runtime/sdk/src/runtime-workspace.ts), [runtime attestation](../../../../skills/nova/plugins/review/src/review-runtime-attestation.ts), Delivery manifest v2 | Closed fixed field shape; no demonstrated open-key ordering defect. | Owners, attestation fields, coverage and manifest records use fixed ASCII field names. Unicode path/model/module **values** do not change key ordering. No preventive version bump justified solely by the old table. |
| Review graphs/maps/policy/profile, repository proof arrays, typed report/source bundle | Predominantly closed shape or constrained ASCII digest-key maps. | E.g. graph IDs/path strings are values; current review ordering uses code-unit comparisons; map rows and fixed `streams` keys are not arbitrary user property names. Policy weights have enumerated keys; report items use hex digest keys. No blanket migration claim. Arbitrary future additional fields would need separate admission analysis. |
| State/plugin/wait and same-process comparisons | Not automatically a persisted digest cutover. | Comparing both operands under one serializer is distinct from validating a stored hash from another locale. Wait IDs hash arrays; raw journal hashes retain `JSON.stringify` wire bytes. Some identity callers need their own audit, not all comparisons. |
| [Review input evidence](../../../../skills/nova/plugins/review/src/review-stage-input.ts) | **Genuine unversioned open-JSON consumer; actual original parser repro.** | Public input schema admits `evidence[].content: {}`. Original SDK digest of `{ä:1,z:2}` accepted by original parser in en-US is rejected for the same unchanged input in sv-SE. No per-evidence codec is recorded. `stage.ts:execute` invokes this parser before review work. |
| [Review content cache](../../../../skills/nova/plugins/review/src/review-content-cache.ts) | Generic public producer/parser API has an actual open-value repro; production reachability of that value is not established. | `buildReviewCacheRecord` accepts `unknown`; original en-US record with that object fails original sv-SE parser. However production `runWithReviewCache<ScalableReviewJobResult/ScalableVerificationJobResult>` stores mostly closed parsed result shapes. Do **not** claim a demonstrated Unicode-key production cache failure from the generic API alone. |
| [Adapter dependency request digest](../../../../skills/nova/core/execution/adapter-support.ts), [caller](../../../../skills/nova/core/execution/adapter-startup.ts) | **Genuine upstream persisted identity defect; actual registered-adapter SIGKILL/restart causes duplicate HTTP action.** | `requestDigest(request)` differs en/sv; `dependencyInvocation` embeds it into durable `adapter:...` idempotencyKey. After the original nested HTTP effect completed and the parent was SIGKILLed, en→en recovery makes no second call, but en→sv original receipt recovery sends the identical request again under a new child key. Schema-valid JSON body `{ä:1,z:2}`, not Unicode HTTP headers. The new portable Effect codec does not stabilize a changed upstream key. |
| [OpenClaw transport](../../../../skills/common/plugins/runtime-dispatch/src/openclaw.ts) | Unversioned open-payload identity still present; actual gateway/restart consequence not established by this audit. | `collector-v5/session-v1` identity hashes `{dispatchId,payload:modelPayload}` with legacy SDK codec; it controls result location/session label. Versioning must bind old-session lookup/ownership, not silently respawn. A class name does not itself impose a new native gate on the original SDK finding. |
| [Audit export](../../../../skills/nova/core/telemetry/audit.ts), Project CLI printed definitionDigest | Locale-sensitive open-data derived digest, but no downstream persistent authority verifier located. | The audit is rebuilt from the verified raw journal; CLI prints a digest. This observation alone is not proof of a broken recovery authority, nor a reason to require a native gateway. |
| Observability, Worker trust, Test-gate signatures, raw artifact/blob/Git hashes | Independent formats, not SDK legacy consumers. | Their ordinal codecs/raw bytes and explicit signing domains must not be migrated just because the old inventory lists their names. |

## Exact executable counterexamples

```sh
node docs/review/evidence/run3-sdk-remaining-consumer-probe.mjs
```

Raw output: `docs/review/evidence/run3-sdk-remaining-consumer-probe.txt`.
Native en-US and sv-SE Node subprocesses use original current producer/parser
functions; no mocked success, gateway, external action or operational store.
These are narrow producer/validator probes, not a whole ArtifactStore/review E2E.
The frozen en evidence digest is
`sha256:597a8244534226f771781ce0ca794742e42396ae5a6761e182ae8c16ba485e0f`.
The sv parser returns `evidence[0].digest does not match canonical content`.
Both accept the input on the producer locale. Adapter request digests differ too;
the first pure helper probe alone was not presented as a completed restart test.

### Subsequent actual adapter dependency restart counterprobe

```sh
node docs/review/evidence/run3-adapter-dependency-locale.mjs
```

Raw output: `docs/review/evidence/run3-adapter-dependency-locale.txt`. A freshly
registered test consumer uses the public adapter dependency API, original
`prepareRuntime`, `AdapterRuntime`, EffectCoordinator, FileEffectJournal,
FileResourceLockManager and original `kubeclaw.network-http` adapter. An actual
loopback HTTP receiver records each request and returns its real response; it
does not fabricate an effect receipt. The test consumer deliberately SIGKILLs
its producer process after its child's HTTP call returns but before its parent
effect can complete. Original receipt recovery in a new process invokes the
same child. No journal entries or dependency identities are manually supplied.

Two independent disposable cases demonstrate the exact boundary:

- en-US producer → en-US recovery: **one** HTTP POST, **one** child key.
- en-US producer → sv-SE recovery: **two identical** HTTP POST bodies, **two**
  different child keys under the same unchanged parent identity.

The accepted body is `{ä:1,z:2}`. No invalid Unicode header, mocked network
adapter, gateway/model, production receiver or whole Pipeline-run claim is used.
This confirms actual repeated local external action through the original durable
dependency machinery, not just a hash discrepancy.

## Next bounded actions, not a blanket rewrite

1. Couple the actual review-evidence input format with its content serializer and
   downstream [bundle content validator](../../../../skills/nova/plugins/review/src/review-bundle-bounds.ts),
   bundle snapshot/parser and report readers. `assertReviewEvidenceContent`
   currently also reserializes parsed content under the current locale. The
   public schema allows arbitrary JSON, whereas Project compiler/coverage
   producers currently supply closed requirement/coverage objects. Add explicit
   format selection and preserve legacy semantics; do not simply flip the
   parser or invent a producer field unsupported by its owning schema.
2. The adapter dependency boundary is now reproduced through original
   adapters/Core and a real HTTP side effect. Version producer/lookup together.
   Arbitrary Unicode HTTP header names or a hand-built accepted receipt are not
   valid substitutes. Also test old unresolved dependency identities; no new ID
   may authorize a repeated old action.
3. Revisit OpenClaw transport only with its real session/ownership boundary in
   scope. Do not count every closed review digest or generic cache API as another
   confirmed production bug. Domains marked unestablished need targeted proof,
   not a manufactured native-environment blocker.

Conclusion: the repair package is meaningful but does not establish complete
portable behavior for the original accepted open-JSON domain. The concrete
review input rejection and upstream adapter identity path provide precise
remaining work; the stale broad canonical-call table is not the justification.
