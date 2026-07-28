# Pipeline review protocol

Owns a deterministic, evidence-pinned review request and a strict authoritative
JSON report. Reports must match the active run and attempt, contain all five
review dimensions, and reject unknown fields before they are stored.

The local live test exercises authenticated v2 dispatch and immutable artifact
storage without spawning an agent. Actual reviewer judgment, transcript
archival, retry and rate-limit policy, presentation, and no-output recovery
remain final parity blockers.
