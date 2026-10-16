# Original planrunner timeout diagnosis and complete verification — 2026-10-16

The previous 50-second wrapper deadline could not cover this unchanged whole
oracle. A progress-only temporary sibling located the first 30-second wait at
`unresolvedTimeout` (original line515); the next `unresolvedLog` wait starts at
line687. These intentionally nonsettling providers must remain quarantined;
logging termination is not proof of completion. Worker execution settlement uses
the existing cleanup timeout, and WorkerPhaseDeadline drains unresolved work.
No production deadline, negative assertion, oracle input or source was shortened.
The temporary probe was removed after its bounded40-second diagnostic run.

The **unmodified complete original command** then returned **exit0 in98.99s**:
`node tests/verification/contracts/check-pipeline-test-plan-runner.mts`.
`verified-original-result.json` binds its source commit and unchanged oracle hash.
`verified-original-runner.txt` contains the final `ok:true` output (15 main-plan
nodes,15 attempts and retry unstable). These15 counts describe the main scenario,
NOT a count of all assertions, native cases or original CONFIG obligations.

The first whole run reached the same final success output, but the execution
transport stopped collecting after90s and lost the exitcode. It was not counted
as verified. The bounded receipt collector ran the whole command once more under
the SAME nonblocking lock, preserving its real exitcode beyond that transport
lifetime. `verify-original-runner.py` is reproducible, with210-second process
budget and atomic result collection; it changes no original test. Transport and
probe attempts are retained separately, not rewritten as green tests.

## Exact remaining original input/source seam

- `runner-types.ts::TestPlanRunnerOptions` has an output EvidenceStore and durable
  attempt/admission stores, but no authenticated sealed inputStore receiver.
- `artifacts.ts::FileEvidenceStore.store` persists output bytes and returns an
  ArtifactRef (ID/type/media/digest/size/storageUrl); it does not supply authentic
  producerRunId/moduleId/attemptId/sourceRevision/buildDigest/storeVersion or an
  original input receipt. Its write receipt cannot be relabeled a QB-R02 seal.
- `provider-result-validation.ts::validateAndMapOutputs` maps artifact metadata;
  `runner-scheduler.ts` transports that output map. `invocationInputs` in
  `runner-attempt-preparation.ts` passes the original ArtifactRef without the
  original producer/result/source/store association required by QB-R02.
- `ProviderProcessSession` resolves and permits original artifact storageUrl
  paths. This is not sealed byte/handle transport or a publication validity fence.
- `budget-source-admission.ts` therefore MUST continue denying selected Quality-v2
  before attempt directories, input pathname lookup or provider child effects.

The finite next implementation is the coordinated ORIGINAL producer/result/source
association plus existing store reservation/accounting and sealed snapshot receiver,
provider child transport and publication fence. Do not accept task-supplied receipt
shapes, derive provenance from strings, create a parallel ledger or lift the fence
just because the unchanged legacy oracle passes. Productive sole-root boot/Nova
selection remains another local source integration obligation; denied-v10 is not
promoted. No missing author-design approval is asserted here.

Independent complete-source review remains OPEN (native spawn unavailable; retained
same-surface EROFS not retried unchanged). No native/archive acceptance follows from
this local legacy runner command. External owner Raven and the existing resume
condition (isolated Linux Docker/UID1000/delegated writable cgroup and sufficiently
large genuinely root-trusted archive storage) remain unchanged. Full2409 fields,
6845 original cases,50 requirements and C0–C6 semantic/native/independent gates stay
OPEN. No field/case identity or historical failure was dropped or promoted.
