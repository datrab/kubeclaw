# Root review of private execution-policy draft

Source review only; no integration, typecheck or runtime acceptance. The author is still preparing this draft.

The proposed owner has 27 explicit required execution leaves across provider, reports, observation and two stores. The typed validator freezes each nested section and checks the provider-plus-report result sum before returning it. The child sampling transport is coordinated separately and must carry only its required `resourceSampleIntervalMs` value; parent process sampling has its own explicit field in the same owner.

## Finding returned to author

The report memory schema currently accepts `memoryBytes: 1`, and `validateBusterExecutionSettings` does not reject it. The real report adapter requires at least 64 MiB plus three times selected source bytes and twice the allowed result bytes. Thus this accepted startup profile can never run a report. Add an explicit configuration-coherence contract before side effects, consistent across loader and Helm. Decide and document whether every allowed source/result combination must fit or whether some combinations intentionally fail at invocation; do not describe a field-only validation as proving executable policy. Preserve the runtime's existing security ceilings.

The same review should check meaningful store/result quota relationships without imposing invented constraints: a total quota smaller than an individual maximum may be an intentional aggregate cap, whereas an arithmetic overflow is not. Each rejection must follow the actual consumer contract and have a concrete test.

The 4096-byte result-wrapper reservation remains a literal in the envelope and the validator's sum check. It needs explicit classification as a serialization-bound invariant or a configurable capacity author; extraction into another file alone does not settle D17.

All findings were sent to the author while the patch remains private. Final source hashes and behavior evidence must be bound after correction; this evolving review does not approve the full Runner decomposition.

## Follow-up source inspection

The private loader now rejects insufficient memory for the maximum selected report source/result profile; the canonical shared Helm helper includes the same arithmetic check. `workerResultWrapperBytes` is now a required provider setting instead of an implicit 4096-byte author, bringing the proposed execution policy to 28 leaves. Runtime/schema/Helm parity execution remains pending; source consistency is not a test result.

The draft tests use actual default providers, registered report adapters and durable stores for selected result/report/store budgets. Their admission-quota case currently verifies durable results, completion intents and closure/admission counts, but does not itself reopen/resume the runner or count provider restarts. The author was asked to narrow its “without replay” title or supply a real recovery/replay proof. An assertion against stored counts alone cannot establish no re-execution after restart.

The final acceptance matrix must map all migrated policy consumers to explicit profile variation, negative controls and preserved original behavior tests. Schema omission checks for every leaf plus four representative consumer budgets do not automatically prove all 28 settings are propagated and enforced.
