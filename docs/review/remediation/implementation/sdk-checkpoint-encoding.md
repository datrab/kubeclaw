# PCR-SDK-001: original artifact checkpoint consumer codec binding

Base: `147a9e003c8ccdc202953ec122a9112f72d339ca` (the local equivalent of
remote `cbd014b19f6f3498ff709df2e4557357d4f3aac5`). This is a bounded follow-up
to the integrated ArtifactRef encoding change, not closure of PCR-SDK-001.

## Actual defect and correction

The original ArtifactStore accepts arbitrary strict JSON object keys. A genuine
`put_json` with `checkpoint: true`, `encoding: kubeclaw-json.utf16.v1`, and the
accepted payload `{z:1,ä:2,Z:{ö:3,a:4}}` succeeds and persists correct portable
bytes. `stage-executor.ts` passes its response to `artifactFromWrite`. That
consumer still reserialized every request with the legacy locale codec and
rejected the legitimate result with `ARTIFACT_CHECKPOINT_RESPONSE_INVALID`.

The same consumer also ignored the requested/returned codec identity, and the
recorder's exact-reference comparison ignored `encoding`. For `{a:1}`, both
encodings produce identical bytes: relabeling or stripping the reference tag
incorrectly passed validation and was collapsed as a duplicate after reopen.

The fix is confined to `core/execution/artifact-checkpoints.ts`:

- Select the already existing strict portable/legacy serializer from the actual
  write request. Reject unsupported codecs before hashing; never try fallback.
- Require exact request/ref encoding agreement as well as existing namespace,
  media type, digest, size and attempt checks.
- Include encoding in recorder reference identity and conflict detection.
- Reject unknown encodings during new recording and replay of journal artifact
  rows. The journal format, hash chain and original historical bytes are unchanged.

No global serializer, ArtifactStore producer, effect identity, snapshot version,
worker architecture or native test gate was changed.

## Real tests and retained raw outputs

All commands are run from the repository root unless specified. Logs are under
`docs/review/evidence/run2-sdk-checkpoints/`.

| Test | Result | Raw evidence |
| --- | --- | --- |
| New `artifact-checkpoint-encoding.test.mjs` before source correction | 3 fail, 1 pass: original portable rejection, unsupported codec acceptance, duplicate collapse | `before.txt` |
| Same unchanged four tests after correction | 4 pass, 0 skips | `after.txt` |
| New tests plus effect identity, ownership, lock lifetime and real external-effect recovery | 16 pass, 0 skips | `effects.txt` |
| Original `check-plugin-system-v2-checkpoint-recovery.mjs` | pass: actual child SIGKILL, persisted checkpoint, original CLI recovery and dependent-stage handoff | `original-recovery.txt` |
| Original ArtifactStore `tests/live-function.test.ts`, run in its package | pass | `artifact-store.txt` |
| Original SDK `tests/values.test.ts` | pass | `sdk-values.txt` |
| `tsc --noEmit -p skills/nova/tsconfig.json` | pass | `typecheck.txt` |

The new test uses actual disk ArtifactStore responses, the original checkpoint
validator/recorder and FileJournal. Separate English and Swedish Node processes
revalidate the real portable write response, reopen the same journal, and record
the same checkpoint/result without adding or rewriting a byte. The legacy test
preserves the original untagged reference and its exact persisted journal bytes.
Negative cases deliberately tamper genuine responses; they are not substitute
capability implementations. Original assertions and original tests are retained.

The checked boundary is artifact checkpoint validation and replay. No native
provider, Kubernetes, browser, cgroup or complete product run is claimed.

## Inventory outcome: delivery manifests

Before selecting the demonstrated checkpoint defect, the actual delivery
producer (`project-summary/src/summary.ts`) and reader
(`remote-test-gate/src/evidence-adapter.ts`) were inspected. Their manifest,
binding, coverage and artifact-reference keys are closed fixed ASCII fields;
Unicode values do not change key ordering. No accepted dynamic-key producer
input was found to demonstrate the proposed locale regression. No invented
metadata was added to a test. A purely preventive v3 migration was discarded,
and **no delivery-manifest code or test change is included**. Do not repeat this
speculative migration without new accepted-input or actual runtime evidence.

Next action: independently review this narrow correction, rerun affected
original consumers, and integrate only after acceptance. Then investigate
remaining genuinely dynamic persisted SDK digest domains, such as runtime
dispatch model payloads or repair-order sourceFacts. Their compatibility and
original-reader requirements remain open; this checkpoint slice does not mark
the broad finding fully verified.
