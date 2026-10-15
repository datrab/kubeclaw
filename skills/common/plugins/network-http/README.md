# Network HTTP adapter

Provides bounded HTTP requests to exact allowlisted origins and methods.
Redirects are rejected, caller headers require an explicit allowlist, embedded
URL credentials are denied, request/response sizes and execution time are
bounded, and cancellation is preserved. Successful JSON and text responses
are returned without assuming every endpoint emits JSON.

The response reader counts decompressed bytes while streaming and rejects a
chunk before retaining bytes beyond `maxResponseBytes`. This limits retained
response data, not every buffer internal to Fetch or the decompressor. Parsing
and final decoding may make bounded copies. Redirects, declared oversize bodies,
streaming overflow, cancellation and HTTP errors all cancel/release the body
reader. Header and body timeouts both report `NETWORK_TIMEOUT`; caller aborts
report `ADAPTER_CANCELLED` and retain the original signal reason as the error
cause. The first signal to abort determines that disposition.

No request is retried here. Timeout or cancellation can happen after the remote
server committed a mutation; senders must use remote idempotency/receipts and
reconcile uncertain outcomes before repeating the action. Native status, JSON/
text decoding, response headers and confidential invocation behavior are unchanged.

HTTP error excerpts use required `errorExcerptCharacters`, projected from the selected central Core `networkHttp` policy and retained with the original run. The central standard profile preserves the former 1000 JavaScript-character limit (not a byte budget). Platform duplicate authors reject even equal values; direct activation requires an explicit value. The same required selected policy supplies `maxRequestBytes`, `maxResponseBytes` and `timeoutMs`; standard preserves 1048576 bytes for each boundary and 30000ms. These are independent of runtime-dispatch target byte profiles. Direct activation must provide all values; no adapter/schema defaults remain for these limits. Nova captures the complete policy for original-first resume/recovery, without reading the current author.
