# Adapter dependency identity: canonical continuation, pending independent approval

Fresh remote repair head `4627f01fe532d3dd890b7c8f93df40ae59547071` was read
with all mandatory resume documents, register and original PCR-SDK-001 text.
All 47 original `implementiert` IDs at `c38779c71bb92bc15c3fcb89930348e5417aa475`
exactly match the immutable scope. Local base `143b0cf` matches every fresh remote
blob/mode and tree `25551ffc06065978010469bf4c8b7fa151012153`.
This is a new isolated checkout; prior frozen package commits were imported,
not uncommitted work or another run's checkout.

Source checkpoint: `53640e08b6214909aa495fec48036048a4bd4c2c`.
No finding is closed and this report is not independent approval.

Final production follow-up: `fca25ae66dc360560b44f40f2f4444e259a4d301`.
Owning canonical receipt validation now occurs before first persistence and
acknowledgement, not merely on replay. It rejects invalid JSON-domain values
without executing getters, and rejects arrays/null as result records. Genuine
registered adapters perform real HTTP and return five invalid result forms;
the original coordinator records canonical failure, never malformed success,
and does not repeat the effect on cross-locale restart.

Receipt construction/validation is synchronous, while original journal/audit
persistence remains asynchronous. This preserves original uncertainty on an
I/O or audit rejection; it does not catch that rejection and invent terminal
failure. An initial test exposed the async-validation catch boundary; the raw
failure is preserved in run5-adapter-result-initial.txt. The final 15-case
write/locale/uncertainty/lock suite and all types/generation/lint checks pass.
The complete final production matrix passes 28/28, zero skips, including the
original effect identity/journal/dependency and both boundary suites; raw output
is run5-adapter-final-28.txt. This remains author verification pending independent
approval and root integration.
Boundary restart tests are included in the existing verify:reliability glob as
adapter-dependency-boundary.test.mjs (2/2 zero skips).

Durable unapproved checkpoint: branch fix/resume-47-run5-adapter-fca25ae at
`9bdc73c19a5518f1292ac126581c9cb941572bb2`, parent freshly read
`5a437c726646d75d5500c23504ee3a3540547c3f`. All 32 affected blobs and modes
were read back exactly. All 10 workflows were inspected; this branch push has
no CI/deployment trigger. No integration branch update was performed.

## Owning contracts, not a shadow validator

The private dependency-request-validation module has been removed. Both original
EffectRequest and EffectReceipt canonical schemas validate persisted lookup
authority. The original schema rejected actual producer URLs, long dependency
keys, valid public delivery tokens and maximum-length activation owners.
Corrections are confined to their owning definitions:

- Global opaqueId, generic attemptIdentity and observerDelivery are unchanged.
- Effect keys accept original opaque keys plus exactly the original
  `adapter:<package>:<registration>:<capability>:<64hex>[:parent:<64hex>]`
  grammar, preserving package/capability 160 and registration 96 bounds.
- New keys are `adapter-dep:utf16-v1:<64hex scope>:<64hex fullsubject>` (147
  characters). Scope includes the full consumer/capability/original parent owner;
  subject binds the complete original request and optional delivery identity.
- Shared resourceIdentity permits actual capability-owned nonempty resource
  names: URL, absolute path, dot, catalog key. Original capability URL/origin,
  filesystem and authorization enforcement remains unchanged.
- EffectRequest delivery IDs reflect the original public nonblank/512 limit;
  original API enforcement remains, including its JS string-length bound.
- Only EffectRequest permits the exact original closed adapter activation
  identity alternative. ResourceLock ownerLeaseId reuses that bounded ID
  definition. Generic attempt contracts remain unchanged. JSON Schema does not
  claim cross-field equality: Core checks equal activation run/attempt and one
  attempt, and the indexed original owner must match the actual invocation.

Generated SDK contracts are regenerated from the canonical source. Original
registry dependencyIdentityVersion remains parent-invocation.v1. The new child
codec is explicit; old parent effect or snapshot markers cannot imply it.

## Original authority and causal ordering

Lookup retains full original requests, accepted/terminal facts and ordered
positions. A reviewer exposed an actual rehashed journal prefix where parent
acceptance occurred only after its child's completion. The index now requires
parent acceptance, not just its request, strictly before child request.
Conflicting/orphan facts, unknown versions, ambiguous matching children,
scope-owner attempt changes and invalid canonical receipts deny reuse. Existing
receipts additionally bind the exact selected adapter PackageResolution.
Lookup is repeated under the original resource lock. Accepted/uncertain effects
cannot acquire a fresh key. Input cloning preserves wire insertion order.

Actual archived/current producer probes exercise valid 440-character delivery
tokens and 265-character activation IDs through original registry/runtime/HTTP
and real SIGKILL. Cross-locale reconstruction retains one POST and the exact
journal prefix. Activation intentionally kills after ready on both executions;
the evidence proves original HTTP receipt reuse, not successful pipeline finish.
Both archived original producer blobs were freshly matched to remote9628872.

The original parent-attempt ID is persisted by this flow in the EffectRequest
and ResourceLock owner. Receipt identity derives from the request; parent-level
registry/snapshot identity domains are not modified. Other generic attempt
producers receive no broader acceptance from these owning alternatives.

## Verification and remaining action

Author's frozen source suite: 21/21 original tests passed, zero skips. Includes
actual native locale processes, SIGKILL/HTTP, real FileEffectJournal/ArtifactStore,
lock release, uncertain external outcomes and exact canonical boundary vectors.
Focused canonical lint passes. See run5-adapter-author-regressions.txt,
run5-adapter-lint.txt and run5-adapter-archive.json under docs/review/evidence.
Independent causal/receipt/activation negatives and original CLI recovery are
being checked separately. These passes are a bounded SDK identity package, not
native gateway/worker acceptance or completion of all PCR-SDK-001 consumers.

Next action: preserve independent before failure, finish independent review and
original snapshot/CLI parity, root rerun against freshly read integration head,
then ff-only reviewed integration. Do not integrate an unreviewed checkpoint.
No deployment, CI, production change, paid resource or third-party message.
