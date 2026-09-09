# Unreviewed Nova dispatch prototype checkpoint

Source a2bed5bae2107e1e9bc0b7b387ad3110eac56813, own original local base143b0cf; backup parent 0c3ab36434020730b326bb2aa5c84ea0210f9d6d.
The current main bounded BlobStore helper and corrected reader are preserved; source diff on durable-records.ts adds only the incomplete original RecordStore fence and bounded reads. The current main reader report is retained rather than overwritten by older author docs.

BLOCKING independent/root review: the initial three prototype cases use an unrelated terminal Core graph and later externally dispatched job with matching runId. They prove actual Store/HTTP behavior only, NOT causal Core ownership. No operation is approved for integration or use. Operator must require original persisted Core dispatch effect/stage/attempt/source/completed import linkage. A manual actor cannot invent that ownership. Next action: trace original remote-test-gate producer and implement the missing causal gate plus genuine bound fixture and wrong-stage/source/run/attempt controls. Then finish evidence/race/SIGKILL/lint matrix and independent review. PCR-OBS-002 remains open; all 47 are not complete.

No CI or deployment was launched; all ten current workflows were read and their push triggers restrict to main or have no push trigger. [skip ci] applies to this isolated backup only.
