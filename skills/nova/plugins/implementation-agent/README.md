# Implementation agent protocol

Owns the deterministic Forge implementation-attempt envelope, strict
completion parser, identity and contradiction checks, canonical result
reduction, and immutable completion evidence.

The package never accepts a returned stage result as authority. A completion
must match the requested run, module, and attempt. `ready_for_testing` requires
changed paths and successful checks; `blocked` requires a non-empty
explanation.

The live test proves the bounded protocol through the real v2 runner,
runtime-dispatch, confidential HTTP authentication, and artifact store without
spawning an agent. Full Forge parity still requires repository-diff
verification, session monitoring, transcript and handoff evidence, rate-limit
recovery, termination, and restart recovery.
