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
