# Architecture validator plugin

Owns the deterministic architecture-review instruction protocol, strict closed
output parser, contradiction checks, canonical result reduction, and immutable
report artifact. Agent judgment remains legitimate and is deferred to final
E2E; package tests exercise the complete v2 dispatch and artifact path locally.

Architecture has only two outcomes: `passed` and `blocked`. Non-blocking
findings are persisted with a `passed` result and evaluated by the separate
architecture instance of `kubeclaw.human-approval`. The passed result publishes
the immutable `architecture.review` fact as `clean` or `approval_required`, so
core skips the approval stage entirely for a clean review. A `blocking` finding
blocks the architecture stage directly. Architecture never emits `request_fix`.
