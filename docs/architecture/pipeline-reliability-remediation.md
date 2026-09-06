# Pipeline reliability remediation

Status: in progress; not production acceptance. Baseline: `fcd70d9257925836dfd13e75626b38369cb265d1` (main, 2026-09-06). The earlier holistic review used `9797e42de07ce2fa1a32d11adbad3b5285f6c2ff`.

## Implementation rules

Preserve working behavior. Correct the underlying contract and ownership instead of adding compatibility wrappers. Remove obsolete implementation when its replacement is verified. Tests must fail for actual broken behavior. A fixture that supplies an agent response tests transport/protocol handling, not agent quality or production readiness. No mocked worker success can replace the isolated-provider or deployed acceptance gates.

## First milestone

- Consume one native, integrity-checked test-gate decision; retain failure, execution error, review-required and cancellation dispositions. Validate the resulting core StageResult as well as its TypeScript shape.
- Bind remote jobs to the actual core stage and explicit source revision. Resolve an implementation source artifact by producer/run/attempt and verify its bytes/digest before selecting its revision. Index separate remote jobs separately in the test graph.
- Persist repair findings and affected descendants in one repair event. Clear stale facts, rerun dependent evaluations, and schedule lint before later review/testing. Permit ordered reviewers to share their implementation repair target. Record completed siblings before repair invalidation.
- Use core invocation identity for implementation/test stages. Include operation identity in OpenClaw dispatch identity so matching task text cannot reuse an earlier operation's result.
- Recover continuation payloads from durable wait-resolution events. Publish the graph, registry and effective configuration as one immutable, integrity-checked snapshot. Reject configuration drift on recovery.
- Return actual Git revisions from create/commit/merge. Preserve a successful implementation disposition when post-merge cleanup fails, while retaining its cleanup evidence.
- Reject suffix-only HTTP access for GET/HEAD as well as mutation; allow exact configured or input-bound origins. Continue rejecting redirects.
- Require meaningful Playwright execution and optional explicitly named required cases. Reject unknown statuses and missing/unexecuted cases; all-skipped blocking suites fail.
- Bound Buster's active jobs, accepted queue and aggregate per-job concurrency reservations. Preserve queued accepted work on shutdown; expose overload as HTTP 429. Mount both Buster state and run/evidence paths on a persistent claim, with one deployment writer.
- Run source checks and reliability checks in CI before publishing runtime images/bundles. Keep isolated execution mandatory, with no `continue-on-error` or environment-driven skip.

The persistent mount and admission code are implementation changes, not proof of Pod-replacement recovery, disk-pressure safety or retention correctness.

## Evidence recorded locally

| Check | Observation | Scope |
|---|---|---|
| `npm run typecheck:skills` | Pass: 59 source configs; subsequent Nova typecheck also passed | Source/type compatibility; not runtime correctness |
| `npm run verify:reliability` | Pass | Real journals, SIGKILL, actual schema validation, HTTP server, real Playwright reports, recovery and real Git |
| Implementation package tests | Pass | Real core/adapters and Git worktree/commit/merge; locked worktree causes actual cleanup failure; deterministic HTTP worker fixture executes its stated check |
| Quality, test-agent, runtime-dispatch, operator-messaging package tests | Pass | Protocol/adapter integration; existing deterministic agent-response fixtures do not prove real agent execution |
| Remote importer/runtime contract checks | Pass | Native result/evidence validation and transport/store contract tests |
| Workflow YAML and role-manifest checks | Pass | Configuration structure and declared package closure |
| Nova and Buster role bundle assembly | Pass | Assembly from the modified working tree; temporary archives are not release artifacts |
| Real isolated-provider execution | Blocked here, test fails | Supervisor reports `open task children: No such file or directory`; the environment lacks the required process-supervision interface. Isolation was not weakened |
| Helm render, cluster, actual agents/browser/BuildKit, Pod replacement | Not proved locally | Helm/kubectl and an authenticated cluster execution path are unavailable in this session |

The new HTTP regression verifies that forbidden requests never contact its real server. The Playwright regression executes both a working assertion and a deliberately broken assertion, and verifies that Playwright's zero-exit all-skipped report cannot pass the blocking gate. The Git cleanup regression replaced an unconditional mock and caught an invalid StageResult fact name.

## Remaining closure work

| Workstream / review finding | Required next result |
|---|---|
| W1 / F3 native handoff | Exercise every native disposition through the packaged production route, not only parser/importer/adapter boundaries. Complete evidence review resolution |
| W2 / F4 candidate and repair | Deliver bounded verified artifact contents to Forge; bind baseline, requirement and candidate identities across all gates; handle ambiguous Git/dispatch effects and no-progress repair; prove parallel invalidation/recovery interleavings |
| W3 / F5 recovery | Separate execution-attempt identity from logical effect identity; implement read-only receipt reconciliation for accepted/uncertain effects. Kill after external mutation and before receipt/checkpoint. Do not retry an uncertain mutation as ordinary work |
| W4 / F2 Prism | Complete content-addressed architecture handoff, durable notification/approval race handling, archive verification/import, authenticated continuation and partial-generation recovery |
| W5 / F1 supported route | Implement deterministic project/module compiler and packaged launcher; migrate callers and Nova/Buster stage ownership together; retire command-suite/legacy harness inputs only with a verified replacement |
| W6 / F6 storage | Reserve storage before acceptance, enforce recovery/retention windows, acknowledge verified imports, preserve idempotency tombstones, and prove process/container/Pod replacement plus disk-full behavior |
| W7 / F7 authority and coverage | Validate fixture leases at use time and equivalent browser authority; prove worker/CNI isolation and all 13 required capabilities with meaningful negative controls |
| W8 agent testing/review | Provide bounded verified evidence to agents, complete review-required dispatch/result handling, make optional repository audit explicitly optional, and produce a candidate-bound delivery manifest |
| W9 observers/projections | Make projections rebuildable, remove projection writes from execution authority, bound observer retries/history and prove outage/replay behavior |
| W10 acceptance | Execute approved design through two dependent modules, lint/review/test repair loops, final manifest and all failure cases using production role bundles; then repeat with actual deployed services |
| W11 rollout | Drain/version-pin existing runs, back up/restore before storage migration, canary the runtime, then validate Argo/MCP and separately Cilium without disrupting Paperless |

## Migration boundary

New runs use `run-snapshot.json`. Existing two-file snapshots are not silently upgraded using today's configuration: that would invent historical authority. Keep the old runtime version available for draining/recovering those runs until an explicit migration with verified historical configuration is provided. Do not roll out the snapshot/storage changes without that drain/migration and restore proof.

A green first-milestone suite closes only its stated regression boundaries. The holistic review remains open until the remaining code and live acceptance evidence exist.
