# Pipeline Simplification Baseline

Captured: 2026-05-30T11:07:36Z

Baseline commit:
- `2baa5d8e6 docs: record pipeline simplification control plan`

Source review:
- `docs/reviews2/2026-05-30-pipeline-simplification-review.md`

Control plan:
- `docs/reviews2/2026-05-30-pipeline-simplification-implementation-control.md`

## Workspace State

Tracked baseline files are committed through `2baa5d8e6`.

Unrelated untracked bootstrap/runtime files were present and intentionally left out of the baseline commits:
- `kubeclaw-main/.openclaw/`
- `kubeclaw-main/.swarm/`
- `kubeclaw-main/AGENTS.md`
- `kubeclaw-main/HEARTBEAT.md`
- `kubeclaw-main/IDENTITY.md`
- `kubeclaw-main/SOUL.md`
- `kubeclaw-main/TOOLS.md`
- `kubeclaw-main/USER.md`

## LOC Baseline

Runtime/code files counted as `.ts`, `.tsx`, `.mjs`, and `.js` under the scoped review roots.

Code LOC:
- `skills/nova/pipeline`: 43,689
- `skills/buster`: 11,682
- `skills/common/pipeline`: 6,477
- Total: 61,848

All-file LOC under the same roots:
- `skills/nova/pipeline`: 43,970
- `skills/buster`: 12,115
- `skills/common/pipeline`: 6,503
- Total: 62,588

Runtime source file counts:
- `.ts` files: 312
- `.js` files: 0

Largest runtime/code files at baseline:
- `skills/nova/pipeline/tools/project-summary.ts`: 766
- `skills/nova/pipeline/runners/review-gate-runner.ts`: 726
- `skills/nova/pipeline/runners/pipeline-runner-scheduling.ts`: 690
- `skills/nova/pipeline/services/rate-limit-exit.ts`: 684
- `skills/common/pipeline/agents/acp-monitor.ts`: 683
- `skills/nova/pipeline/services/polling.ts`: 680
- `skills/common/pipeline/services/telemetry/payload-schema.ts`: 679
- `skills/nova/pipeline/runners/approval-gate-runner.ts`: 678
- `skills/nova/pipeline/services/telemetry/builders.ts`: 646
- `skills/nova/pipeline/services/summary.ts`: 645
- `skills/nova/pipeline/services/rate-limit-builders.ts`: 639
- `skills/nova/pipeline/runners/module-runner-forge.ts`: 616
- `skills/nova/pipeline/integrations/git-worktree.ts`: 603
- `skills/buster/pipeline/suites/visual-reg.ts`: 602
- `skills/nova/pipeline/tools/lint-report/tool-registry.ts`: 599

## Verification Baseline

Final verification state:
- `tests/verification/lib/run-contract-suite.sh --source-root .`: PASS
- `node tests/verification/runtime/check-nova-startup-smoke.mjs`: PASS
- `node tests/verification/runtime/check-buster-startup-smoke.mjs`: PASS

Note:
- The first contract-suite run failed at `check-time-budget-surface.mjs` with `AssertionError [ERR_ASSERTION]: Missing expected rejection.`
- Direct rerun of `node tests/verification/contracts/check-time-budget-surface.mjs` passed with `{"ok":true,"checked":35}`.
- A full contract-suite rerun then passed. Treat this as a transient/order-sensitive baseline note, not an accepted failure.

## Compatibility Surface Counts

Counts are line counts from targeted `rg` scans. They are not semantic counts; use them as comparison baselines for later PRs.

Gate status and alias surface:
- Command: `rg -n "gateRunStatus|PASS_GATE_STATUSES|FAIL_GATE_STATUSES|WAIT_GATE_STATUSES|GO|NO-GO|APPROVED|PENDING_APPROVAL|REJECTED|CANCELLED" skills/nova/pipeline skills/buster skills/common/pipeline | wc -l`
- Count: 170

Runtime context mirror surface:
- Command: `rg -n "config\\._(runId|runStats|logDir|runLogDir|pluginRegistry|runtimeOverrides)|syncConfigRuntimeFields|bindRunContext" skills/nova/pipeline skills/buster skills/common/pipeline | wc -l`
- Count: 143

Default/fallback/debt policy surface:
- Command: `rg -n "fallback_model|default_timeout_minutes|default_max_fails|fallback_completion|status_json_path|result_status|result_artifact_path" skills/nova/pipeline skills/buster skills/common/pipeline docs tests/verification | wc -l`
- Count: 321

Active docs/source `.js` skill-path references outside archives:
- Command: `rg -n -P 'skills/[^\\s)`'\"']+\\.js(?!on)|/app/skills/[^\\s)`'\"']+\\.js(?!on)' docs skills tests/verification -g '!docs/archive/**' | wc -l`
- Count: 16

Active Nova/Buster/Common or `/app/skills` `.js` path references outside archives:
- Command: `rg -n -P 'skills/(nova|buster|common)[^\\s)`'\"']+\\.js(?!on)|/app/skills/[^\\s)`'\"']+\\.js(?!on)' docs skills tests/verification -g '!docs/archive/**' | wc -l`
- Count: 14

Runtime `.js` files in scoped roots:
- Command: `find skills/nova/pipeline skills/buster skills/common/pipeline -type f -name '*.js' -print | wc -l`
- Count: 0

## Baseline Interpretation

The target runtime is already TypeScript-only in the scoped roots, but the complexity guard currently checks zero files because it still scans `.js`. That makes Step 4 important: the guard must switch to `.ts` before LOC and complexity budgets are meaningful.

The largest immediate shrink opportunities are:
- gate status alias deletion after all producers emit `PASS`, `FAIL`, `WAIT`, or `TIMED_OUT`;
- runtime context mirror migration away from `config._*`;
- Buster task/session strictness, especially empty suite validation and hidden session defaults;
- repeated gate failure construction and duplicated worker input builders;
- stale active docs references to `.js` runtime paths.
