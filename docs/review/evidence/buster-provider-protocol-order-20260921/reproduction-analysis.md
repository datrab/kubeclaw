# Provider protocol byte-budget ordering

Status: private correction awaiting independent review and runtime verification.

The genuine maintained execution-config run in `../independent-buster-runner-execution-child-20260921/session37-runtime3/session-runtime-1.txt` failed the 1024-byte profile: the default Runner reported TEST_PROVIDER_PROCESS_CLOSED instead of TEST_PROVIDER_PROTOCOL_LIMIT. The 65536-byte positive profile passed with the same 2048-character provider summary. The assertion is preserved unchanged.

The source registers readline on child stdout before the data listener enforcing the cumulative protocol budget. A complete result line can therefore invoke the result resolver before that same chunk is counted. The later budget failure can arrive between operation callbacks, allowing teardown/cleanup errors to obscure the actual limit violation. This is a source-derived explanation, not a claim of an instrumented event trace.

The private correction moves the existing data listener before readline construction. A line handler additionally returns before parsing, logging, invoking a capability or completing a result when the cumulative limit has been exceeded. Rejection and termination retain the existing error and configured timing. The entire over-budget chunk is rejected; no later line within it can cause side effects. The cumulative budget continues to include initialization, results, logs and RPC messages, including newline bytes.

Required next evidence: independent source review, unchanged low/high real Runner profiles, original provider/Runner/ownership regressions and canonical lint/type checks. Restore the original listener order in an isolated copy as the negative control. The initial failure already demonstrates that the unchanged consumer assertion detects this defect; do not change its expected error to the incidental cleanup error.
