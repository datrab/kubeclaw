# Project delivery manifest

The summary stage produces `delivery-manifest.v1` from immutable artifacts supplied by the core. Input declares module implementation/test stage identities and the final implementation/lint/review/test identities. Run identity comes from the invocation lease.

Every selected artifact must belong to this run and the latest producer attempt. Reads verify digest and byte count within an aggregate 8 MiB bound. Module quality decisions and final lint/review/quality evidence must pass and refer to the corresponding implementation commit. The manifest records source revisions and evidence references and has its own canonical digest. Missing, conflicting, corrupt or stale evidence blocks publication.

Caller-owned status, test counts, delivery percentages and agent-invocation counts were removed: they were not execution evidence. This contract requires version-pinned draining of old graphs. The artifact-contract tests exercise actual durable storage and negative cases; they do not establish provider or agent execution. Deployment acceptance remains a separate check.
