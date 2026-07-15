# Real Pipeline E2E Goal Handoff Review

Generated: 2026-06-28 05:33 UTC

## Scope

Reviewed the `/goal` work in `/home/node/.openclaw/workspace/git-repo` across the last 8 hours. The reviewed commit range is `06912fc94^..459e948ee`.

Dirty state at review time:

- No dirty tracked files outside `Projects/**`.
- Only excluded untracked runtime artifacts were present under `Projects/pipeline-smoke-landing/src/.swarm/`.

Recent commits reviewed:

- `459e948ee Probe real Discord delivery in e2e capabilities`
- `d746ced89 Reclassify real e2e config failure scenarios`
- `00386e74b Harden real e2e evidence contracts`
- `f6023a2d3 Add real e2e Git cleanup failure scenario`
- `ab1527086 Verify real e2e Tailscale preview content`
- `efca0d745 Require real e2e failure signals`
- `803503447 Add real e2e retry success scenario`
- `154a9a063 Add real e2e infra failure scenarios`
- `e16743a73 Expand real e2e failure matrix`
- `b239741bc Add real e2e Buster identity failure scenario`
- `6528ab55a Add real e2e echo gate failure scenario`
- `0227bda43 Add real e2e pipeline review failure scenario`
- `a7d0672c5 Add real e2e validator failure scenarios`
- `dda0eba82 Add real e2e Needs Nova scenario`
- `2d3311cc5 Grant Nova real e2e verifier reads`
- `565e8497b Require real e2e stream evidence`
- `5c14482c6 Add real e2e failure scenario matrix`
- `8cb1a000d Make Nova image sandbox-capable for real e2e`
- `a2fe30933 Drive real e2e approval through state signal`
- `6cbef3e03 Require real pipeline e2e evidence`
- `33a2b6080 Accept qualified Buster lease resource discovery`
- `25becf74b Bind Nova into broker test namespaces`
- `56d6fb47e Make real e2e Kubernetes client deployable`
- `794a397b4 Expand compact config for runtime readers`
- `d6430cb44 Add canonical real pipeline e2e runner`

The range changed 36 files with about 3,932 insertions and 24 deletions. Most work landed under `tests/verification/e2e/`, with supporting changes in Helm RBAC/values, Docker image setup, Buster k8s suite, Discord delivery receipts, deployment truth checks, and runtime config readers.

## What Was Built

The work created one canonical E2E path under:

`/home/node/.openclaw/workspace/git-repo/tests/verification/e2e`

Main pieces:

- `run-real-pipeline-e2e.mjs`: canonical runner that probes capabilities, creates a real workspace, starts Buster/approval helpers, runs `skills/nova/pipeline.ts`, verifies evidence, and cleans up.
- `check-real-e2e-capabilities.mjs`: strict preflight for gateway, configured Codex spawn, Redis, Git, Discord, kubectl, Kubernetes API, BusterNamespaceLease CRD/RBAC, namespace controller, local registry, and Tailscale operator assets.
- `real-run-workspace.mjs`: isolated Git worktree/branch, fixture project generation, run config generation, scenario mutation, and cleanup.
- `real-run-evidence.mjs`: success and failure evidence checks across artifacts, lifecycle logs, Redis streams, telemetry, Discord receipts, and Buster outputs.
- `failure-scenarios.mjs`: canonical scenario matrix for success, approval outcomes, Buster failures, Forge failures, validator failures, Echo failures, Redis/Discord/k8s/Tailscale/registry failures, Needs Nova, retry success, and Git cleanup failure.
- `buster-simulator.mjs`: contained Buster runner that uses real Buster task queue/lifecycle code instead of a parallel fake queue.
- `approval-operator.mjs`: state-file based real approval operator for approve/deny/commentary paths.
- `run-real-pipeline-failure-matrix.mjs`: matrix runner for scenario coverage.
- Fixture nginx project and k8s deployment under `tests/verification/e2e/fixtures/nginx-project`.

Fast and full verification now enter the canonical E2E path first:

- `/home/node/.openclaw/workspace/git-repo/tests/verification/run-fast-verification.sh`
- `/home/node/.openclaw/workspace/git-repo/tests/verification/run-full-verification.sh`

The Buster k8s suite now exercises Tailscale preview reachability/content by requiring the deployed nginx pod to be reachable through the lease exposure path using `spec.exposure.provider=tailscale-ingress` and `status.previewUrl`.

## Critical Findings

### 1. Failure signals are computed but not enforced

`run-real-pipeline-e2e.mjs` computes `failureSignal` for nonzero scenarios, but the scenario `ok` calculation ignores it:

- `failureSignal` is computed at `tests/verification/e2e/run-real-pipeline-e2e.mjs:314`.
- Nonzero `ok` is currently `pipelineExpectationMet && failureEvidence?.ok === true` at `tests/verification/e2e/run-real-pipeline-e2e.mjs:321`.

This means commit `efca0d745 Require real e2e failure signals` does not fully do what its title says. A nonzero scenario can still pass if structured failure evidence passes while the explicit failure-signal check fails.

Fix first:

- Change failed-scenario success to require `failureSignal.ok === true`.
- Preserve `failureSignal.reason` in the final output when false.
- Add a focused test/probe proving a missing failure signal causes the scenario to fail.

### 2. Evidence is still too text-based and spoofable

Evidence was strengthened, but many checks still serialize objects and scan strings rather than asserting exact schemas, event names, ordering, ids, and correlations.

Examples:

- Buster output validation checks `status === PASS`, then searches JSON text for `k8s`, `preview_url`, and project marker: `tests/verification/e2e/real-run-evidence.mjs:104`.
- Lifecycle success evidence scans event JSON for module/gate strings: `tests/verification/e2e/real-run-evidence.mjs:200`.
- Failure lifecycle evidence accepts a scenario reference found in serialized events or summary text: `tests/verification/e2e/real-run-evidence.mjs:232`.
- Buster stream evidence scans Redis stream text for module/gate markers: `tests/verification/e2e/real-run-evidence.mjs:379`.
- Telemetry and agent observability stream evidence scan for run/project strings and generic event-ish markers: `tests/verification/e2e/real-run-evidence.mjs:406` and `tests/verification/e2e/real-run-evidence.mjs:439`.

Required improvement:

- Parse each evidence source into typed records.
- Assert exact event type, run id, project, module id, gate id, correlation id, terminal state, and ordering.
- For streams, verify expected entries by decoded fields, not `JSON.stringify(...).includes(...)`.
- For Buster output, assert exact suite results and preview fields, not loose text.

### 3. Failure scenarios still rely on regex/stdout fallback paths

`verifyExpectedFailureEvidence()` starts with lifecycle evidence, which is good, but many per-scenario checks still use `requireTextEvidence()` or `requireTextOrOutputEvidence()`.

The most concerning helper is `requireTextOrOutputEvidence()` at `tests/verification/e2e/real-run-evidence.mjs:325`, because it can pass from pipeline stdout/stderr when artifacts do not match.

This is better than the first pass, but still shortcuty. It should be replaced with exact contract artifacts/events for each scenario.

Required improvement:

- For each failure scenario, define the exact artifact or event contract that proves the failure.
- Remove stdout/stderr fallback except as diagnostic output.
- Use scenario-specific machine-readable error codes produced by the production pipeline.

### 4. The harness starts from generated progress, not full request ingress

The workspace creates a production-shaped `progress.json` directly in `real-run-workspace.mjs` starting at `tests/verification/e2e/real-run-workspace.mjs:56`.

This is valid for a module-pipeline E2E, but it does not verify the full request-to-plan/project setup path. If the intended E2E scope includes incoming request ingestion, prompt planning, or project setup, that is still open.

Recommended framing:

- Keep this as the canonical "real pipeline execution E2E".
- Add a separate upstream ingress test only if needed, but do not duplicate the pipeline runner.

### 5. Cleanup is improved but not complete against orphaned k8s resources

Cleanup now deletes Redis run keys/streams, Buster leases, namespaces, Git worktrees/branches, and artifacts.

Weakness:

- Kubernetes cleanup only finds namespaces through matching `BusterNamespaceLease` objects where `spec.runId` or `spec.project` match the run/project: `tests/verification/e2e/real-run-workspace.mjs:472`.
- If a namespace is created but lease status is missing, the lease is deleted early, or the namespace exists without a matching lease, the namespace can leak.

Required improvement:

- Ensure namespaces carry deterministic run/project labels.
- Cleanup by those labels, with a safe prefix guard.
- Keep the existing `test-` namespace safety guard.

### 6. Nova RBAC is broader than "only lease client"

The broad legacy Buster k8s tester fallback stayed removed, which is good.

However, the new `verificationRead` ClusterRole grants read access to pods, a named Tailscale OAuth secret, and the `tailscale` IngressClass:

- `charts/kubeclaw/templates/rbac.yaml:46`

It is read-only and not the old broad tester role, but it is broader than the stated "Nova only gets narrow BusterNamespaceLease client permissions" intent.

Required decision:

- Keep it only if explicitly accepted as verification-only read access.
- Prefer making it opt-in and clearly disabled outside real E2E verification.
- Consider moving Tailscale/operator readiness checks to an external verifier context instead of Nova service account if the narrow-RBAC rule is strict.

### 7. Discord proof is much better but not independent readback

The capability probe now uses production Nova Discord integration with webhook `wait=true`, and requires a receipt containing `message_id`, `channel_id`, and `webhook_message_returned === true`:

- `tests/verification/e2e/check-real-e2e-capabilities.mjs:268`
- `skills/nova/pipeline/integrations/discord.ts:289`

This proves Discord accepted the webhook and returned a message object. It does not independently read the message back through a bot/API after delivery.

Recommendation:

- If webhook acceptance is enough, document it as "Discord accepted delivery receipt".
- If "real Discord delivery" means channel-visible readback, add an explicit bot/API readback using the returned message id.

### 8. Fast/full wrappers are honest but operationally blocking

`run-fast-verification.sh` and `run-full-verification.sh` enter the canonical E2E harness first. This satisfies the "no fake path" requirement.

Operational cost:

- Until live infra is ready, these wrappers fail before later smoke/regression checks run.

Recommendation:

- Keep this behavior if the suite is intended to be a hard gate.
- If broader regression signal is needed while infra is down, create a separate non-gating developer script rather than weakening these wrappers.

### 9. Failure matrix is fail-fast

`run-real-pipeline-failure-matrix.mjs` stops after the first failed scenario at `tests/verification/e2e/run-real-pipeline-failure-matrix.mjs:95`.

That is useful for CI, but poor for diagnosis when validating the full matrix after infra comes online.

Recommendation:

- Add an opt-in `--continue-on-failure` mode that still exits nonzero at the end.
- Keep fail-fast as default if preferred for CI.

## What Is Still Open

Infrastructure:

- Redeploy Nova/Buster with the latest chart/values/image changes.
- Ensure Nova runs under the intended service account, not the default account.
- Verify BusterNamespaceLease CRD/controller/RBAC.
- Install and configure Tailscale operator.
- Ensure `IngressClass/tailscale` exists.
- Ensure the Tailscale OAuth secret exists and is readable by the intended verifier.
- Ensure local registry service is reachable as expected.

E2E quality:

- Enforce `failureSignal.ok`.
- Replace text matching with exact typed evidence.
- Remove stdout/stderr fallback as a pass condition.
- Tighten Buster output validation to exact suite/preview contracts.
- Tighten lifecycle, telemetry, Buster stream, and observability stream validation to decoded event fields.
- Add label-based namespace cleanup.
- Decide whether Discord webhook receipt is sufficient or whether bot/API readback is required.
- Decide whether request ingress/project setup belongs in this canonical E2E scope.

Verification:

- Run fast and full verification against live infra after redeploy.
- Treat production mismatches as blockers, not test-adaptation opportunities.

Known live blockers from the previous run:

- Nova still lacked BusterNamespaceLease/client RBAC.
- Nova could not read namespace controller/registry services with the current service account.
- Tailscale operator, IngressClass, and OAuth secret were missing or inaccessible.

## Lazy Or Shortcuty Areas

These are the places most likely to produce false confidence:

- `failureSignal` is reported but not required in the final `ok`.
- Many evidence checks use substring/regex matching rather than exact contracts.
- Some failure evidence can pass from stdout/stderr.
- `forge-malformed-output` and `echo-malformed-output` rely on instruction files telling agents to produce malformed JSON. This is better than prewriting artifacts, but still depends on model behavior instead of a deterministic malformed producer.
- The harness writes generated `progress.json` directly, bypassing upstream request ingestion/planning.
- Failure matrix stops at first failure, which hides later scenario health.
- RBAC grew a read-only verification ClusterRole that may be broader than the original narrow-RBAC intent.

## What Was Done Right

- The work stayed on one canonical E2E path under `tests/verification/e2e`.
- Fast and full verification both enter the same canonical harness first.
- Missing infra fails honestly instead of skipping or falling back.
- The broad legacy Buster k8s tester ClusterRole fallback did not come back.
- Buster simulation uses real Buster task queue and lifecycle processing instead of inventing a separate queue.
- Real Git worktrees/branches are used per run.
- Real Redis streams/keys are used and partially cleaned.
- Real OpenClaw gateway/configured Codex spawn checks are part of the capability probe.
- Real Discord webhook acceptance is now proven with `wait=true` receipt data.
- Real k8s lease/controller/registry/Tailscale capability checks are wired.
- Tailscale preview validation checks that the served URL returns expected deployment content.
- Pipeline child timeout was added, preventing indefinite hangs.
- Misnamed config failure scenarios were reclassified more honestly.
- Commits were logical, and the repo was clean except known excluded `.swarm` runtime artifacts.

## Recommended Next Order

1. Fix `failureSignal.ok` enforcement in `run-real-pipeline-e2e.mjs`.
2. Add exact typed assertions for success lifecycle and failure lifecycle events.
3. Replace Buster/telemetry/observability stream substring checks with decoded field assertions.
4. Remove stdout/stderr fallback as pass evidence.
5. Tighten Buster output validation around exact suite results and preview URL/content fields.
6. Improve k8s cleanup using run/project labels in addition to lease lookup.
7. Decide on Discord readback semantics and implement/document accordingly.
8. Review/adjust `verificationRead` RBAC.
9. Redeploy and run full live infra verification.

## Reset Handoff Prompt

```text
Resume in /home/node/.openclaw/workspace/git-repo. Read tests/verification/REAL_PIPELINE_E2E_GOAL_HANDOFF_REVIEW.md first.

Continue the canonical real pipeline E2E work under tests/verification/e2e only. Do not add fallback harnesses, fake green paths, mocked success paths, or duplicate runners. Keep fast/full verification entering the same canonical harness first, and keep missing infra as honest blockers.

Fix the highest-risk issues in order:
1. Enforce failureSignal.ok for every nonzero scenario in run-real-pipeline-e2e.mjs; currently it is computed but not part of ok.
2. Replace text/regex evidence with exact typed assertions for lifecycle, Buster output, Buster task stream, telemetry stream, observability streams, and failure contracts.
3. Remove stdout/stderr as pass evidence; keep it diagnostic only.
4. Improve k8s cleanup so run/project-labeled namespaces are deleted even if lease/status lookup is incomplete.
5. Decide whether Discord webhook wait=true receipt is sufficient; if not, add real message readback.
6. Review verificationRead RBAC and keep Nova permissions narrow/opt-in.

Preserve what is right: one canonical E2E path, broad legacy Buster k8s tester fallback stays removed, Buster simulator uses real queue/lifecycle contracts, Tailscale preview reachability/content validation remains real, and production mismatches are reported as blockers instead of adapting tests to pass.

Commit in logical chunks. Keep repo clean except known Projects/.swarm runtime artifacts.
```
