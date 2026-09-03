# Runtime dispatch adapter

Provides bounded, target-scoped dispatch to configured runtime endpoints.
Requests and responses are closed to JSON values and bounded by depth, shape,
and bytes. Authentication uses an idempotency-bound HMAC so raw runtime secrets
never enter auditable nested effect requests or journals. Network and secret
access remain independently granted.

OpenClaw targets may provide a dedicated `controllerSessionKey`. The adapter
submits spawn and task-control calls through that session, accepts current spawn
responses where `taskId` is resolved later from `runId`, and preserves typed
admission refusals instead of treating a missing child identity as a malformed
successful spawn. Worker prompts use OpenClaw's `ANNOUNCE_SKIP` completion token;
the durable atomic result file remains the sole result-import boundary.

This package owns the transport protocol only. Legacy spawn, monitoring,
transcript, handoff, cancellation policy, and recovery behavior remain
explicitly blocked until their canonical capabilities are implemented.
