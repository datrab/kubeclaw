Runtime and packaging structure verifiers live here.

Canonical entrypoint:
- `tests/verification/runtime/check-runtime-collisions.mjs`

Live launch-smoke entrypoints:
- `tests/verification/runtime/check-subagent-launch.mjs`
- `tests/verification/runtime/check-acp-launch.mjs`

Notes:
- `check-subagent-launch.mjs` verifies that a real subagent session can be accepted, become visible via session status, and then be cleaned up.
- `check-acp-launch.mjs` verifies ACP launch reachability only. In environments where ACP crashes shortly after launch because of auth issues, the verifier still passes as long as the session is accepted and becomes visible at least once before terminating.
