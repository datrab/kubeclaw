# Phase H Final Sweep Changelog

Date: 2026-05-30

This changelog records the sequential Phase H final-sweep work from `2026-05-29-pipeline-simplification-execution-checklist.md`.

## Point 1 - Run Full Verification Harness

Status: done

Verification command:

```bash
OPENCLAW_GATEWAY_URL=http://127.0.0.1:${OPENCLAW_GATEWAY_PORT:-18789} ./tests/verification/run-full-verification.sh
```

Final result:

- Full verification wrapper passed.
- Deterministic contract suite passed.
- Runtime collision checks passed with zero collisions and zero owner drift.
- Startup smokes passed for Nova and Buster.
- Live subagent launch verification passed against the explicit local gateway URL.
- Behavior harness passed with `416` passed and `0` failed.

Changes made while bringing the full harness green:

- Moved launch-verifier numeric CLI validation ahead of gateway URL/token resolution so malformed numeric inputs fail with the intended validation error even when gateway configuration is absent.
- Kept production gateway behavior explicit, and ran live launch verification with `OPENCLAW_GATEWAY_URL` supplied by the harness invocation instead of adding a hidden localhost fallback.
- Aligned the gateway retry contract with the time-budget surface by passing `retryDelayMs` directly into the budget-aware sleep path.
- Made the time-budget contract fixture pass an explicit invalid gateway URL and token for retry-abort coverage, avoiding ambient gateway assumptions.
- Updated governance behavior fixtures to supply the now-required explicit plugin config surface.
- Updated gate behavior fixtures to provide complete tracked-agent identity where current strong active-session rules require run/attempt/dispatch/session evidence.
- Tightened gate transcript-state assertions so active and stale transcript states are checked directly instead of through redacted-transcript text.
- Updated summary and case-study rate-limit fixtures to preserve strong dispatch/session identity through rate-limit pause, resume, and exhaustion paths.
- Added Discord audit correlation metadata for summary and case-study operator fields.
- Fixed Buster gate timeout typed-control mapping so `failure_class: timeout` projects to canonical `timeout` and preserves `EXIT_TIMEOUT` instead of collapsing to generic `error`.
- Passed structured event identity into the telemetry Discord sink as explicit audit correlation so serialized presentation fields no longer have to carry non-rendered correlation metadata.
- Updated many-module and migrated-seam behavior fixtures to emit typed worker diagnostics expected by the strict worker boundary.
- Updated repo-doc behavior assertions to match dynamic `getRepoRoot()` suite-root authority instead of the removed hard-coded host path.

Targeted checks run while resolving full-harness failures:

- `node tests/verification/runtime/check-final-gate-hardening.mjs --source-root .`
- `node tests/verification/contracts/check-time-budget-surface.mjs --source-root .`
- `node tests/verification/behavior/verify.mjs --source-root . --areas governance`
- `node tests/verification/behavior/verify.mjs --source-root . --areas gates`
- `node tests/verification/behavior/verify.mjs --source-root . --areas summaries`
- `node tests/verification/behavior/verify.mjs --source-root . --areas stops`
- `node tests/verification/behavior/verify.mjs --source-root . --areas module-failures`
- `node tests/verification/behavior/verify.mjs --source-root . --areas many-module-soak`
- `node tests/verification/behavior/verify.mjs --source-root . --areas migrated-seams`
- `node tests/verification/behavior/verify.mjs --source-root . --areas repo-docs`

Notes:

- The live subagent launch check is local-environment dependent and requires an explicit gateway URL. The final passing run used the existing `OPENCLAW_GATEWAY_PORT` and supplied `OPENCLAW_GATEWAY_URL` explicitly.
- Untracked OpenClaw workspace bootstrap files under `kubeclaw-main/` were not part of this point and were left untouched.

## Point 2 - Deleted Compatibility Names and Stale Suite Paths

Status: done

Audit commands:

```bash
find kubeclaw-main/skills/buster/pipeline kubeclaw-main/skills/nova/pipeline kubeclaw-main/skills/common/pipeline -name '*.js' -print
rg -n "\b(module-runner-buster\.js|module-runner-forge\.js|module-runner-prebuster\.js|module-runner\.js|pipeline-runner\.js|buster-pipeline\.js|pipeline\.js|project-summary\.js|redis\.js|status-store\.js|suite-runner\.js|repo-paths\.js|buster-gate-runner\.js|review-gate-runner\.js)\b" kubeclaw-main --glob '!node_modules/**'
rg -n "\b(status_json_path|buster_capabilities|compatibility_result|compatibility_exit|compatibility_status|activeStatusSessionKey|recoverActiveSession|lifecycle_active_session_identity_incomplete|buildModuleStepResult|buildGateStepResult|result_status|status_json_legacy)\b" kubeclaw-main --glob '!node_modules/**'
```

Findings:

- No live `.js` files remain under the Nova, Buster, or common pipeline source directories.
- No runtime source under `skills/buster`, `skills/nova`, or `skills/common` emits `status_json_path` or `buster_capabilities`.
- Remaining compatibility-name references in active verification files are negative guards or forbidden-key assertions, not producers.
- Historical review, archive, implementation-map, and migration documents still mention old names where they describe prior states. Those were kept as audit history.

Changes:

- Updated current Nova pipeline README paths from obsolete `.js` names to `.ts` names.
- Updated governance-context comments from stale runner `.js` names to current `.ts` owners.
- Updated Buster deployment/config references so canonical `capabilities` is the only documented project capability field.
- Removed `status_json_path` from the active configuration reference and documented canonical `output_file` for module and gate Buster result artifacts.
- Updated the Buster platform reference suite contract from `pipeline/suites/<name>.js` / `module.exports` to `pipeline/suites/<name>.ts` / `export default`.
- Updated the Buster platform reference payload example to use canonical `output_file`.
- Updated the fallback ledger rows for removed `buster_capabilities` aliases and removed `status_json_path` handling so the ledger no longer describes them as live compatibility paths.

Verification:

- `node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root .` passed with `144` checks.
- `node tests/verification/contracts/check-session-authority-slice-surface.mjs --source-root .` passed with `53` checks.
- `node tests/verification/contracts/check-gate-active-session-surface.mjs --source-root .` passed with `47` checks.
- `node tests/verification/behavior/verify.mjs --source-root . --areas repo-docs` passed with `9` passed / `0` failed.

## Point 3 - Hidden Fallback Literal Sweep

Status: done

Audit commands:

```bash
git diff --name-only --diff-filter=AM 30d3f04a8..HEAD -- kubeclaw-main/skills kubeclaw-main/tests | xargs rg -n "\b(fallback|legacy|compat|obsolete|unknown|weak[_-]?evidence|status_json_path|buster_capabilities|localhost|127\.0\.0\.1)\b|\?\?|\|\|"
rg -n "status_json_path|buster_capabilities|weak[_-]?evidence|lifecycle_active_session_identity_incomplete|gate_active_session_identity_incomplete|recoverActiveSession|activeStatusSessionKey|compatibility_result|compatibility_status|status_json_legacy|result_status|result_artifact_path|payload\.config|payload\.buster_capabilities|context\.buster_capabilities|config\.suite_timeout_ms \|\||Suite file not found" kubeclaw-main/skills/nova/pipeline kubeclaw-main/skills/buster/pipeline kubeclaw-main/skills/common/pipeline --glob '!node_modules/**'
rg -n "localhost|127\.0\.0\.1|OPENCLAW_GATEWAY_URL|GATEWAY_URL|LOCAL_DEVELOPMENT_GATEWAY_BASE_URL" kubeclaw-main/skills/common/pipeline/integrations/gateway.ts kubeclaw-main/tests/verification/runtime/session-launch-lib.mjs kubeclaw-main/tests/verification/contracts/check-time-budget-surface.mjs kubeclaw-main/tests/verification/behavior/areas/runtime-surface.mjs
```

Findings:

- No new hidden producer was found for removed weak-evidence, Buster capability-alias, Buster status-file, stale suite-path, or compatibility-result surfaces.
- Runtime `compatibility_result` / `compatibility_status` literals remain only in typed forbidden-key lists for worker and gate result contracts.
- Gateway localhost literals are limited to the explicit `LOCAL_DEVELOPMENT_GATEWAY_BASE_URL` helper and test-only invalid endpoint fixtures; production gateway URL resolution still requires explicit `gatewayUrl`, `OPENCLAW_GATEWAY_URL`, or `GATEWAY_URL`.
- `poll_result_status` is a current poll-result source label, not the removed Buster `result_status` payload fallback.

Verification:

- `node tests/verification/contracts/check-pipeline-simplification-migration-surface.mjs --source-root .` passed with `7` checks.
- `node tests/verification/contracts/check-buster-pipeline-slice-surface.mjs --source-root .` passed with `144` checks.
- `node tests/verification/contracts/check-time-budget-surface.mjs --source-root .` passed with `35` checks.
- `node tests/verification/contracts/check-session-authority-slice-surface.mjs --source-root .` passed with `53` checks.
- `node tests/verification/contracts/check-gate-active-session-surface.mjs --source-root .` passed with `47` checks.
- `node tests/verification/contracts/check-worker-control-result-surface.mjs --source-root .` passed with `typed-worker-controls-only`.

## Point 4 - Total LOC Delta

Status: done

Primary baseline:

- `30d3f04a8 Document pipeline simplification execution plan`
- This is the execution-plan commit immediately before Phase A implementation commits began.

Commands and results:

```bash
git diff --shortstat 30d3f04a8..HEAD -- kubeclaw-main
# 125 files changed, 2908 insertions(+), 1063 deletions(-)

git diff --numstat 30d3f04a8..HEAD -- kubeclaw-main | awk '{add+=$1; del+=$2} END {printf "insertions=%d deletions=%d net=%+d\n", add, del, add-del}'
# insertions=2908 deletions=1063 net=+1845
```

Recorded execution delta:

- Files changed: `125`
- Insertions: `2908`
- Deletions: `1063`
- Net LOC: `+1845`

Contextual review-doc baseline:

```bash
git diff --shortstat a9c28cb1a..HEAD -- kubeclaw-main
# 125 files changed, 3184 insertions(+), 1023 deletions(-)
```

The contextual number includes the execution-plan document itself. The primary execution delta excludes that planning commit and covers the Phase A-H implementation/review sequence through the final summary commit.

## Point 5 - Checklist Status Update

Status: done

Changes:

- Updated `2026-05-29-pipeline-simplification-execution-checklist.md` so the then-completed Phase H points were marked done before the final summary pass.
- Left the final summary item to be closed by point 6, where the summary document was added.
- Preserved per-point command, verification, and changelog pointers in the checklist instead of collapsing Phase H into a single status line.

## Point 6 - Final Summary

Status: done

Changes:

- Added `2026-05-30-pipeline-simplification-final-summary.md`.
- Summarized the Phase A-H refactor by phase, including deleted surfaces, intentionally retained surfaces, verification, and final state.
- Marked the final Phase H checklist item done.
