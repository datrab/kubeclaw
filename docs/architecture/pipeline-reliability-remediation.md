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

## External effects and derived views

Recovery now checks the durable effect journal before starting adapters. Accepted effects without receipts stop with `RECOVERY_EFFECT_OUTCOME_UNRESOLVED`. Interrupted attempts with completed external invocations stop with `RECOVERY_EXTERNAL_CONTINUATION_REQUIRED`: a new execution attempt must not silently submit the same mutation again. An external adapter invocation failure blocks for reconciliation instead of using the ordinary retry budget. Checkpoint-safe local artifact operations and read-only capabilities retain their existing retry behavior. Real HTTP mutations followed by SIGKILL before and after receipt persistence both remain at exactly one mutation on recovery. A third case drops the response after the service commits; Nova blocks after one invocation despite a three-attempt budget. This is a safety boundary; read-only external receipt reconciliation and automatic logical continuation remain unfinished.

Test execution graphs are now derived on read from complete verified imports. The separate graph writer and its production wiring were deleted. A graph storage failure therefore cannot veto a gate decision, and a new reader can reconstruct the graph from the durable import alone. Import records now use `nova-test-gate-import.v2` and retain the original plan and source identity without copying the source archive. Historical v1 records require the old runtime or explicit migration; no historical job identity is guessed.

Implementation cleanup now runs only after a confirmed merge. Unintegrated or uncertain worktrees remain available, with their location recorded in the durable blocked result or implementation artifact. A real Git worktree regression writes files, loses the dispatch response, and verifies that the files survive, dispatch occurs once, and no removal is requested.

The mandatory isolated-provider check also commits deliberately broken source and runs the same assertion again. It must produce `failed` / `request_fix`, preserve two distinct job/source graph records, and keep source archives out of import metadata. Its execution requires the capable CI runner.

## Remote CI evidence

Draft PR #3 commit `5183d2a07339b3e17593baff78ac355da5bd58bb` passed Pipeline reliability run `34016665755` and Docs Checks run `34016665734`. GitHub's runner successfully executed the mandatory real isolated provider, Helm validation and production role assembly. That evidence applies to that commit, not subsequent changes or deployed acceptance.

## Broader package verification

All 49 plugin packages' declared test commands were executed locally. The first pass had 40 passing packages and nine failures. HTTP and delivery-lint exposed regression gaps: HTTP denial diagnostics now retain method/WebSocket distinctions while rejecting every unauthorized request before contact; checkpoint-safe local artifact failures retain their prior retry behavior. Both package suites passed after the fixes and are now included in mandatory CI.

The operator cancellation test also exposed a CI timing race. It now synchronizes on actual server receipt and response-connection closure, replacing fixed sleeps and the request-body close event. The real transport cancellation assertion remains mandatory.

Remaining local failures include absent Chromium/browser assets (axe, lighthouse, Playwright, visual), absent Trivy database (security providers), absent shellcheck/shfmt (lint), and, initially, the review compiler's million-line performance bound (52.4 seconds against 45 seconds). No missing prerequisite or performance failure was converted to a passing result. A package command stopping early does not prove its later tests.

The compiler performance failure was traced with a CPU profile to tokenization. Both review budgeting and runtime dispatch now use the WASM implementation of the same tokenizer; the obsolete JavaScript implementation and its unused dependency were removed. Exact token IDs matched across 101 real source/text samples under both supported encodings. Golden count checks preserve Unicode and special-token behavior. The million-line compilation passed in 25.9 seconds with the original 45-second bound, and the full review and runtime-dispatch suites passed. An extracted Nova bundle executed both encodings successfully; CI now requires the full review suite and this bundle check. After these fixes, 43 of the 49 package commands have passed locally; the six remaining package failures require missing browser, scanner or shell-lint prerequisites.

Commit `2f243561e629c75913336beb748eaba9026e0726` passed Pipeline reliability run `34018162419` and Docs Checks run `34018162535`, including the real committed-defect negative control. Subsequent tokenizer changes require their own CI evidence.

## Project compilation and quality authority

The Nova bundle now includes a product-owned `nova-project.v1` compiler and launcher. It builds deterministic implementation/lint/review/quality graphs for module dependencies, with nonoverlapping ownership, digest-checked scoped provider plans, repair targets and a single repository publication lane. Compilation validates the installed stage contracts and grants before emitting a graph. Source and extracted-bundle checks cover two dependent modules; they execute zero stages and are not deployed acceptance. See [Nova project runtime](nova-project-runtime.md).

The quality stage no longer accepts caller-owned suite evidence or retired suite-plan input. A provider plan is mandatory; run/attempt identity comes from the core. Every native decision is retained as an artifact, nonpassing decisions cannot dispatch an evaluator, and invocation failures retain core reconciliation semantics. The previous positive test that bypassed providers is replaced with a real-runtime rejection test. The mandatory isolated-provider check additionally exercises the actual quality stage for healthy and deliberately broken source; its evaluator executes a deterministic assertion rather than claiming real agent quality.

Full legacy scaffold/E2E migration and actual two-module agent execution remain open. Existing snapshots require version-pinned draining because their quality-stage input contract differs.

## Remaining closure work

| Workstream / review finding | Required next result |
|---|---|
| W1 / F3 native handoff | Exercise every native disposition through the packaged production route, not only parser/importer/adapter boundaries. Complete evidence review resolution |
| W2 / F4 candidate and repair | Deliver bounded verified artifact contents to Forge; bind baseline, requirement and candidate identities across all gates; handle ambiguous Git/dispatch effects and no-progress repair; prove parallel invalidation/recovery interleavings |
| W3 / F5 recovery | Separate execution-attempt identity from logical effect identity; implement read-only receipt reconciliation for accepted/uncertain effects. Kill after external mutation and before receipt/checkpoint. Do not retry an uncertain mutation as ordinary work |
| W4 / F2 Prism | Complete content-addressed architecture handoff, durable notification/approval race handling, archive verification/import, authenticated continuation and partial-generation recovery |
| W5 / F1 supported route | Verify the new compiler through actual module execution; migrate remaining callers and Nova/Buster stage ownership together; retire command-suite/legacy harness inputs only with a verified replacement |
| W6 / F6 storage | Reserve storage before acceptance, enforce recovery/retention windows, acknowledge verified imports, preserve idempotency tombstones, and prove process/container/Pod replacement plus disk-full behavior |
| W7 / F7 authority and coverage | Validate fixture leases at use time and equivalent browser authority; prove worker/CNI isolation and all 13 required capabilities with meaningful negative controls |
| W8 agent testing/review | Provide bounded verified evidence to agents, complete review-required dispatch/result handling, make optional repository audit explicitly optional, and produce a candidate-bound delivery manifest |
| W9 observers/projections | Make projections rebuildable, remove projection writes from execution authority, bound observer retries/history and prove outage/replay behavior |
| W10 acceptance | Execute approved design through two dependent modules, lint/review/test repair loops, final manifest and all failure cases using production role bundles; then repeat with actual deployed services |
| W11 rollout | Drain/version-pin existing runs, back up/restore before storage migration, canary the runtime, then validate Argo/MCP and separately Cilium without disrupting Paperless |

## Migration boundary

New runs use `run-snapshot.json`. Existing two-file snapshots are not silently upgraded using today's configuration: that would invent historical authority. Keep the old runtime version available for draining/recovering those runs until an explicit migration with verified historical configuration is provided. Do not roll out the snapshot/storage changes without that drain/migration and restore proof.

A green first-milestone suite closes only its stated regression boundaries. The holistic review remains open until the remaining code and live acceptance evidence exist.

## Browser prerequisites and runtime selection

Buster's Lighthouse runtime configuration and browser provider tests contained a pinned Chromium 1228 path while the lockfile selected a later Playwright browser build. The runtime now obtains Chromium's executable from the installed Playwright package; Playwright fixtures use its normal browser selection. The isolated Playwright test takes an explicit browser installation root and the actual checkout path instead of assuming `/app` exists. A separate mandatory CI job installs matching Chromium and executes the four real browser-provider package suites, including their existing negative controls. These changes require that job's evidence; local browser assets remain unavailable.

The browser matrix exposed Ubuntu's AppArmor restriction on unprivileged Chromium namespaces. CI grants user-namespace permission only to the installed Chromium executable, following [Chromium's documented per-binary profile](https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md). Lighthouse keeps its non-root browser sandbox. Chrome startup is now owned from construction through cleanup, including failed launch, and failures retain bounded stderr. A real misconfigured-executable regression verifies both diagnostics and profile cleanup. Actual deployed browser sandbox prerequisites still require cluster validation.

After Chromium could start, the real Lighthouse check exposed another distinction: browser-service requests blocked by the proxy were being classified as audited-page defects. The proxy still denies every other origin. Page acceptance now requires Lighthouse's actual CDP network log, rejects off-origin HTTP(S), WebSocket and WebTransport activity, and fails when network evidence is absent. Bounded blocked-proxy origin diagnostics remain available. The page-egress negative control uses a real second HTTP server and asserts zero contact. This change requires fresh real-browser CI evidence.

At commit `29a3e6b355687654ce24e6507f111be4737b122c`, all four browser jobs in Pipeline reliability run `34020889620` passed: Axe, Lighthouse, visual and isolated Playwright. These are real browser/provider checks with negative controls, including a deliberately impossible performance budget and zero contact to the forbidden page-egress server. This closes the previously missing CI browser prerequisites for those package suites; it does not establish deployed browser/CNI isolation or actual agent acceptance. The project guide is now included in Nova's package, and operator instructions no longer reference retired lint/project-setup paths.


## Module review candidate binding

Project compilation now selects review revisions by implementation stage identity. Review verifies the immutable implementation artifact contents, keeps the first implementation baseline across repairs, and uses the latest implementation candidate. It blocks before dispatch when the repository's frozen HEAD differs from that candidate. Explicit graph reviews with a declared base retain their existing behavior.

The real Git and durable artifact integration regression covers two module revision ranges, a subsequent repair, hydrated source contents, unrelated HEAD changes, missing/ambiguous artifact selection and corrupt reference metadata. It does not fabricate an agent verdict or establish full two-module agent acceptance. The source/extracted compiler checks also assert the generated review binding. Project platforms must grant review reads for both implementation and review artifact namespaces.

This narrows W2 candidate binding; lint candidate binding, complete agent execution, legacy scaffold/E2E migration and the other closure work above remain open.


## Verified repair evidence and fixture authority

Implementation now hydrates the core-issued repair request's actual JSON artifact contents before creating a worktree or dispatching Forge. Producer/run identity, digest and byte counts are verified; 32 artifacts and a 256 KiB complete handoff are hard bounds. Invalid or oversized evidence blocks instead of becoming a partial prompt. The regression uses the durable artifact adapter and real stored findings. Implementation registrations now require artifact read grants for their requesting gates.

The lint stage validates the full report contract and recomputed tool summary before persisting or judging it. Removed partial-summary passing fixtures; real tool execution remains the acceptance test. CI installs shellcheck and shfmt and requires the full lint package.

HTTP and the four browser runtimes now share typed fixture origin and expiry validation. Each invocation rechecks expiry, and its cancellation signal is bounded by the earliest input fixture expiry. Real HTTP regressions prove zero contacts with expired authority and cancellation of an in-flight request. This does not prove controller revocation or deployed CNI enforcement.


## Aggregate blob storage limits

Buster's `maximumResultStoreBytes` now limits total result blob bytes separately from `maximumResultBytes`. Nova's artifact blob store also enforces its configured aggregate byte budget. Admission is serialized by a cross-process store lock and counts existing blob/temp files; duplicate immutable writes need no additional space. A real competing-process regression proves the budget cannot be oversubscribed and that reconstruction preserves it. The artifact-store package regression also passes with aggregate limits enabled.

These limits are not pre-acceptance job reservations or a retention/import-ack protocol. Those storage lifecycle changes remain required before claiming W6 closure. Stores already over budget retain readable existing content and refuse new unique blobs; operators must preserve recovery evidence when reclaiming storage.
