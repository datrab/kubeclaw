# PCR-SDK-001: run-frozen runtime transport profile (incomplete)

Own branch `fix/resume-47-run6-sdk-transport`, initial local
`ca00dc72893deaae21d66f1b302962f97638f7ae`, exact fresh remote
`b06c06dce3364c482a1da5637c36bc2b14ba8c72`; full tree
`78f4ce6ebccc20f5dd00817d7349d68bb64ece60` verified. Fresh mandatory resume
files/register and baseline commit were read; the exact 47 baseline IDs match
partial-47-scope.json. No Product/Controller/Chart package was imported.

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
historical context returns the original payload unchanged.

OpenClaw selects explicit session-v1:json-utf16-v1 or collector-v5:json-utf16-v1
identity only for a declared current request. Untagged transport bytes remain
legacy; no locale guessing or old-session adoption fallback. Both model task
construction and generic HTTP body/HMAC exclude only the new owned profile
control. Parent request/conflict validation still contains it. Confidential
callers can explicitly select the current profile; their API, redaction and
absence of a durable journal are not changed. No confidential exactly-once or
native Gateway acceptance claim is added.

Initial checks: six finite-profile, canonical parity, model budget/task and
original source-snapshot tests passed with zero skips; generator check and full
Nova typecheck passed. Raw: `docs/review/evidence/run6-sdk-transport-initial.txt`.
The existing current-snapshot test now asserts v3 AND its required profile;
historical fixture assertions are unchanged.

**Still incomplete; do not integrate or close the finding.** Next action:
actual archived v1/v2 producers with completed/requested/accepted original Core
restart prefixes, genuine new-run/context/transport en/sv creation and reopen,
actual generic HTTP/HMAC/confidential regression, all original affected plugin
suites, retirement/readRunEvidence v3, historical current-checkout CLI probe,
full types/generator/lint, then independent review. Partial tests, static paths
or a controlled 503 receiver are not native Gateway/model/termination evidence.

Dependency setup uses immutable third-party cache hardlinks only, no install or
modification of linked package files; all 62 lock-backed @kubeclaw symlinks were
rebuilt locally and resolve inside this checkout. Stale unrelated cache links
are not proof of a current workspace package. No copied 418MB dependency tree.
