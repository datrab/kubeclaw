# Buster test judgment protocol

Owns the deterministic post-suite evidence envelope, task/attempt correlation,
strict PASS/FAIL verdict parser, contradiction checks, result reduction, and
immutable verdict evidence. It never accepts an agent-provided stage result.

This is deliberately narrower than the retained Buster runtime. Deterministic
suite execution, task queues, Git synchronization, BuildKit/Kubernetes/browser
tools, leases, cleanup, completion signaling, session lifecycle, transcripts,
rate limits, and recovery remain explicit blockers.
