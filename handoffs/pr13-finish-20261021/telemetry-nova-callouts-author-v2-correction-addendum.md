# F1 author correction, separate v2

Read complete independent telemetry-nova-callouts-independent-review.md and exact sole F1/per-box JSON finding. Original candidate, original hashes and independent first-failure report remain unchanged in their original paths. This v2 changes only the durable-effect Claim to: “Durable effects bind stable request identity, resource locking, acceptance, fencing and terminal receipts.”

The new-invocation path acquires the resource lock before requested/accepted records. Prior receipt reuse, recovery and failed receipt paths prevent a universal chronological/fence-before-every-receipt statement. Original surrounding mechanism was already correct; the erroneous author summary is removed, not hidden by a new product assertion.

F1-only.patch and refreshed complete candidate.patch/box mapping/hash manifest identify the exact replacement. Both full-page comparisons prove every other byte unchanged; telemetry exact v1 bytes. No main, pins, other fields, tests, implementation, metadata or generator edits. No owning test or runtime executed. Nonauthor targeted rereview required; no A91205 or broader acceptance from this author correction.
