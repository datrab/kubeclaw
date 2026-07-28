Runtime and packaging structure verifiers live here.

Canonical entrypoints:
- `tests/verification/runtime/check-runtime-collisions.mjs`
- `tests/verification/runtime/check-agent-skill-bundles.mjs`
- `tests/verification/runtime/check-nova-startup-smoke.mjs`
- `tests/verification/runtime/check-buster-startup-smoke.mjs`

Live launch-smoke entrypoints:
- `tests/verification/runtime/check-subagent-launch.mjs`
- `tests/verification/runtime/check-acp-launch.mjs`
- `tests/verification/run-local-acp-verification.sh`

Notes:
- `check-nova-startup-smoke.mjs` verifies that the Nova pipeline entrypoint parses, imports, exposes the public API, and that `node skills/nova/pipeline.ts --help` exits cleanly.
- `check-buster-startup-smoke.mjs` verifies that the Buster entrypoint parses, imports, exposes required startup helpers, uses defined shutdown bindings, and that `node skills/buster/buster-pipeline.ts --status` exits cleanly.
- `check-subagent-launch.mjs` verifies that a real subagent session can be accepted, become visible via session status, and then be cleaned up.
- `check-subagent-launch.mjs` stays in the full `tests/verification/run-full-verification.sh` gate.
- `check-acp-launch.mjs` verifies ACP launch reachability only. In environments where ACP crashes shortly after launch because of auth issues, the verifier still passes as long as the session is accepted and becomes visible at least once before terminating.
- ACP launch is local/provider-specific and is run by both `tests/verification/run-full-verification.sh` and `tests/verification/run-local-acp-verification.sh`; ACP failure makes the full wrapper red.
