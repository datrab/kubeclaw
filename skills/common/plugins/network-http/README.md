# Network HTTP adapter

Provides bounded HTTP requests to exact allowlisted origins and methods.
Redirects are rejected, caller headers require an explicit allowlist, embedded
URL credentials are denied, request/response sizes and execution time are
bounded, and cancellation is preserved. Successful JSON and text responses
are returned without assuming every endpoint emits JSON.
