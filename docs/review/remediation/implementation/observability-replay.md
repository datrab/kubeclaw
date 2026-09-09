# WP02 — PCR-OBS-001: validate persisted Admission and Attempt history

Scope: Admission and Attempt stores in foundation/observability. No outbox format,
retention, log deletion, delivery ACK ordering or external provider execution
changes. Historical `foundation.observability.md` and its reproduction remain
unchanged. Their reviewed SHA is `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`;
that tree object is unavailable in this checkout. Before-edit evidence therefore
uses the actual untouched working sources. Additional original-source controls
use the target files from local HEAD `42c4db4e3bf909a1dd1b473b4afacc0322d25119`.
This distinction does not claim an unavailable historical checkout was tested.

## Root cause and implementation

Admission previously cast parsed JSON to AdmissionState and defaulted missing
arrays. Attempt operations also cast JSON and only validated ingress. Fresh
instances could therefore return altered payloads with unchanged digests or
confirm duplicate requests against damaged history.

`replay-validation.ts` supplies a bounded descriptor read and explicit replay
assertions. It stats the opened file, refuses a file beyond the configured byte
limit, reads only that length and checks for growth/truncation before parsing.
Admission now requires its full envelope, including the arrays formerly defaulted.
It validates each producer contract/digest, decodes the retained original wire
bytes, compares their canonical value with the stored record, and verifies the
identity key, unique identities, contiguous cursor order and exact nextCursor.
Quarantine/overflow and unresolved metadata are shape checked, gap contracts are
validated, and restored gaps require the actual admitted sequence range.

`attempt-replay.ts` validates the full attempt envelope and record counts, evidence
identity uniqueness and contract metadata, local digest-addressed storage URLs,
result contracts/digests and wrapper identity/generation equality. It checks unique
result and closure identities, increasing generations per attempt and the result's
references to persisted evidence metadata. Closure contracts/digests and associated
completion-intent closures must agree. Completion-intent validation is extracted
from the existing ingress check and shared with replay, preserving the same
run/attempt/claim/worker/resultdigest/evidence binding. Attempt candidate writes
also use this validator, so writers cannot create snapshots their reader rejects.

Every Admission read, duplicate ACK, issue/tail query, and mutation enters the
validated reader. Every Attempt snapshot, duplicate result, closure, completeness
and resume operation enters its validated reader before state-dependent work.
Corruption propagates a named replay or original contract error; no repaired
snapshot is written, no corrupt history is acknowledged, and no default masks
missing fields. Error messages retain schema/digest or specific invariant detail.
The old generic readDurableState API remains available to unrelated stores; the
optional byte bound is applied to Admission and Attempt only.

## Concrete verification

Commands run locally with Node v24.19.0 from `kubeclaw-fixes`:

- Before edits, `node docs/review/evidence/admission-replay.mjs` reproduced
  the original defect: fresh store returned changed payload with invalid digest
  and unchanged wire bytes.
- Original local HEAD files were extracted with `git show HEAD:skills/common/plugin-runtime/foundation/observability/durable-delivery.ts`
  and the corresponding durable-attempts.ts command into the same relative paths
  under `/tmp/observability-replay-baseline`; its node_modules links to the
  worktree's installed dependencies. No implementation was substituted.
- `OBSERVABILITY_REPLAY_SOURCE_ROOT=/tmp/observability-replay-baseline node --test tests/verification/reliability/observability-replay.test.mjs`:
  **both tests failed**, specifically “Missing expected rejection: payload: read”
  for Admission and “Missing expected rejection: payload: snapshot” for Attempt.
  This independently reproduces the Attempt boundary with the real original store.
- After changes, the historical admission reproduction exits with
  `OBSERVABILITY_CONTRACT_INVALID:producerRecord:/recordDigest does not match the immutable record`.
  Its former success condition asserts the defect, so the explicit rejection is
  expected; the updated passing regression is the next command.
- `node --test tests/verification/reliability/observability-replay.test.mjs`:
  **3 passed**, testing 10 Admission and 17 Attempt corruption variants, plus
  oversized Admission bytes, unchanged restart/duplicate behavior, durable
  completion replay, pending-commit recovery and standalone closure evidence expiry. All mutations use real persisted
  JSON files and fresh production store instances. Reads and duplicate/recovery
  calls must reject with explicit integrity/contract errors; corrupt bytes remain
  unchanged for diagnosis. Payload, digest, wire, identity, cursor, generation,
  evidence/reference, closure, duplicate identity, timestamp and missing fields
  are covered. No filesystem/lock/store mocks are used.
- `node tests/verification/contracts/check-pipeline-observability-durable-delivery.mts`:
  passed (`durableReplay`, `quarantine`, `bounded`).
- `node tests/verification/contracts/check-pipeline-observability-durable-attempts.mts`:
  passed (`durableResults`, `durableEvidence`, `staleClaimsRejected`).
- `node tests/verification/contracts/check-pipeline-observability-clawdeck-view.mts`:
  passed (`rawPreserved`, `normalizedJoined`, `gapsVisible`, `liveTail`).
- `node tests/verification/contracts/check-pipeline-observability-nova-reconciliation.mts`:
  passed (20 workers, idempotent imports, development degraded/final strict).
- `npx --no-install tsc --noEmit -p skills/common/plugin-runtime/tsconfig.json`:
  passed.
- `npx --no-install eslint --config charts/kubeclaw/files/config/eslint.config.mjs skills/common/plugin-runtime/foundation/observability/{replay-validation,attempt-replay}.ts tests/verification/reliability/observability-replay.test.mjs`:
  passed for all new helpers/tests.
- The same raw lint command including durable-delivery.ts and durable-attempts.ts
  reports **14 existing diagnostics**. Baseline sources were fed to the identical
  ESLint configuration through `--stdin --stdin-filename <original path> -f json`:
  baseline has **15** (4 delivery, 11 attempt), current has **14** (4 delivery,
  10 attempt). Extracting completion validation removes one existing complexity
  violation; unrelated large-file/function/depth and existing error-handling debt
  remain. No lint rule or baseline exemption was changed; this is not a claim
  that raw whole-file lint is green.

## Limits and integration

No authenticated signature was added. A full attacker rewrite of records and
all matching digests, or an otherwise unbound outer owner field, cannot be
proven genuine by an unkeyed hash; protected roots remain required. Configured
byte/count limits bound accepted snapshot input, but full replay is still an
O(snapshot-size) operation and configured quotas must fit runtime memory.
Concurrent hostile inode replacement and host power loss are not established by
these tests. No network/CI/deployment notification was performed.

Missing files still mean a new store; this change does not add an external
history anchor to detect whole-file deletion. Existing old/incomplete envelope
variants now fail closed instead of defaulting absent arrays; any operator
recovery must preserve evidence rather than silently manufacture history.

Evidence bytes are not reread on every snapshot. The existing ingress/completeness
paths verify them and retain their established unavailable/corrupt-evidence
semantics. Persisted metadata/result references and content digest bindings are
validated first. Existing pending storedAt=null recovery remains supported.
No log or artifact retention policy is introduced or shortened (D01/D07), and
PCR-OBS-002 remains a separate policy/operations issue.

## Independent-review corrections

Independent review identified two missing invariants in the initial implementation:
malformed falsy completionIntent values bypassed validation, and a changed evidence
producer could still pass its own schema while contradicting a result's completion
producer. `assertCompletionIntent` now bypasses only literal null. false, 0 and the
empty string fail the required nullable-object union. Present evidence metadata
referenced by an intended or stored closure must agree with that closure's producer;
result references additionally bind directly to their completion record producer.
This applies before duplicate result/closure responses and completion recovery.

The expanded real-store regression first failed before the correction with
“Missing expected rejection: evidenceProducer: snapshot”. It now passes producer
boot-ID mutation with both finalized and pending completion, all three malformed
falsy intents, and the existing corrupt-byte-preservation assertions. A separate
real-store case verifies standalone closure producer contradiction and preserves
its existing evidence expiry behavior: expired closure-only staged evidence leaves
readable closure metadata and partial completeness. Missing closure-only evidence
remains a completeness issue; this patch does not silently change retention.
Unbound staged evidence remains valid. Total focused tests: three passed.
