# PCR-SDK-001: run-frozen runtime transport profile (incomplete)

Own branch `fix/resume-47-run6-sdk-transport`, initial local
`ca00dc72893deaae21d66f1b302962f97638f7ae`, exact fresh remote
`b06c06dce3364c482a1da5637c36bc2b14ba8c72`; full tree
`78f4ce6ebccc20f5dd00817d7349d68bb64ece60` verified. Fresh mandatory resume
files/register and baseline commit were read; the exact 47 baseline IDs match
partial-47-scope.json. No Product/Controller/Chart changes were introduced in
this package delta; later fresh-main reconciliation retains their integration.

Root approved a required explicit transport profile at genuine run creation,
not retagging existing runs. Canonical schema owns its finite const; the normal
generator emits its SDK type/value. Strict SDK portable JSON equality validates
that generated const, and Foundation adds the same non-JSON precondition before
its canonical Ajv validation. No SDK-to-Foundation dependency or second schema.

Original run creation now writes run-snapshot.v3 with required profile under the
existing no-replace snapshot publication. Original v1/v2 readers remain exact
legacy and reject an injected profile. Snapshot v3 validates its profile and
portable digest. executePrepared reads the persisted selection on new/recover/
resume/admin paths and threads it through Runner, StageExecutor and the closed
PluginContext. Pipeline/graph/configuration digests and parent-invocation.v1 are
unchanged. The eleven actual stage runtime.dispatch producer sites attach the
profile after model/budget/retry preparation and before effect admission; absent
historical context returns the original invocation unchanged.

OpenClaw selects explicit session-v1:json-utf16-v1 or collector-v5:json-utf16-v1
identity only for a declared current request. Untagged transport bytes remain
legacy; no locale guessing or old-session adoption fallback. The profile is
closed CapabilityInvocation/EffectRequest metadata, never a reserved model
payload key. Model task construction and generic HTTP body/HMAC receive the
original payload byte-for-byte, including any historical model property named
runtimeDispatchProfile. Parent effect identity, matching and dependency subject
bind the optional envelope field; absent metadata preserves legacy bytes. Confidential
callers can explicitly select the current profile; their API, redaction and
absence of a durable journal are not changed. No confidential exactly-once or
native Gateway acceptance claim is added.

Initial checks: six finite-profile, canonical parity, model budget/task and
original source-snapshot tests passed with zero skips; generator check and full
Nova typecheck passed. Raw: `docs/review/evidence/run6-sdk-transport-initial.txt`.
The existing current-snapshot test now asserts v3 AND its required profile;
historical fixture assertions are unchanged.

Independent review rejected initial d545d30 because its payload marker collided
with legal historical open model data (actual HTTP reproduction preserved on
review branch fix/resume-47-run6-sdk-review-dda0c19). The corrected closed
envelope relocates this control through normal/confidential Core and dependency
invocations. New v3 snapshot readers validate closed outer/graph shapes while
normal pipeline entry and verifyPinnedGraph retain graph semantic ownership.
Reusing pipeline stage ID restrictions in the generic graph snapshot shape
initially rejected the original Unicode graph vector; that genuine failure and
the unchanged test's successful rerun are retained. Original retirement suite
passed 15/15 after updating only the genuine new writer expectation to v3.

**Still incomplete; do not integrate or close the finding.** Next action:
fresh-main reconciliation, all original affected plugin suites, projection and
retirement regression against that exact head, full types/generator/lint and
final independent review. Partial tests, static paths
or a controlled 503 receiver are not native Gateway/model/termination evidence.

Native author matrix now passes 14/14, zero skips (run7-sdk-native-profile.txt):
actual original runPipelineV2 and architecture stage produce v1/v2/v3 snapshots
using byte-verified archived v1 writer/graph or freshly archived b06 v2 writer.
Current terminal recovery preserves each real effects prefix with no HTTP.
All nine original snapshot-profile x requested/accepted/completed audit-callback
SIGKILL cases use registered generic adapter, actual HTTP and verified HMAC.
Requested resumes once, accepted remains uncertain without receipt/repetition,
completed replays without repetition. These use original native Core APIs;
no journal is fabricated. Two original registered ACP locale cases preserve
explicit legacy v2 differences and prove declared v3 identical en/sv transport
key/label/model task; failed replay preserves the journal and sends no HTTP.
The HTTP 503 endpoint is NOT a Gateway and proves no accepted Gateway session.

Independent reviewer has passed unchanged actual HTTP/HMAC model-field collision
and confidential/admission/replay negatives, 41 original regressions and eight
source/historical CLI cases on bc015b1. Final review on reconciled source is
pending. Runner now retains the canonical frozen profile reference instead of
the caller's mutable parse object. Full Nova/Foundation typechecks and generator
passed after this change. Focused lint reports a pre-existing Prism execute
complexity 16 (limit15), reproduced identically from exact ca00dc7 source, plus
four pre-existing unused-directive warnings; no lint setting was weakened.

Dependency setup uses immutable third-party cache hardlinks only, no install or
modification of linked package files; all 62 lock-backed @kubeclaw symlinks were
rebuilt locally and resolve inside this checkout. Stale unrelated cache links
are not proof of a current workspace package. No copied 418MB dependency tree.

Fresh reconciliation: main1d7e6f8834b6e3f3f477a5af48832f74f5321757, exact
local6c567898 and tree d02787ad9732aa20139cf575dafd6fdf7bd65252. Mandatory
checkpoint/register requirements reread. No conflicts; other packages retained.
Native/profile/retirement32/32 and original dispatch projection10/10 pass on
reconciled b76cf2e, both full typechecks and generator pass. The native crash
matrix verifies exact requested/accepted/completed record phases and original
prefix bytes; watchdog deaths are explicitly not successful crash boundaries.

All eight original affected package scripts were executed. Seven passed; review
initially failed because its two public scalable helper APIs historically accept
an invoke-only context, but the new metadata lookup assumed a complete contract.
Raw failure: run7-sdk-plugin-before.txt. Root approved preserving only those two
minimal helper interfaces with optional original contract selection; no Core/v3
requirement weakened. Present malformed/undefined profile still rejects through
the shared SDK validator. Two additive native tests use actual job builders and
registered HTTP/HMAC: invoke-only and valid-profile contexts both reach HTTP with
identical model bodies, while four invalid present profiles are not admitted.
Real ACK is not model success; both helpers correctly reject missing runtime
attestation afterwards. Original unit assertions are unchanged. Full original
review package rerun now exits0 including its cluster/schema, million-line job
compiler, native locale/evidence, actual Core/Git/Artifact IO and coverage tests.
All eight original affected package scripts passed. SDK negative-domain tests,
real ArtifactStore put/get and FileEffectJournal replay pass with six targeted
tests and zero skips. Independent final transport approval is still pending.

PCR-SDK-001 remains open independently of this transport package: reviewer found
a separate genuine Review cache en-US/tr-TR counterexample from an admitted
contextRequest result containing I/i assessment keys, accepted for cache reuse
and persisted through the original Core/ArtifactStore. That separate cache
producer/reader versioning must not be mixed into this bounded transport repair.

Final author candidate1d987c3 reconciles remotea43aa256/localb3d2f7 and preserves
the independently integrated Envoy base with no overlapping SDK delta. On that
exact source the combined original native/profile/retirement/projection suite
passes44/44, zero skips; full Nova/Foundation typechecks and generator pass.
Raw: run7-sdk-a43-final.txt. Lint baseline and focused results are preserved in
run7-sdk-lint-baseline.txt; the existing Prism complexity error was not hidden.
Author implementation is complete for the bounded transport package. Next action
is independent final review and root integration against a freshly read head;
this author report does not grant integration approval or close PCR-SDK-001.
