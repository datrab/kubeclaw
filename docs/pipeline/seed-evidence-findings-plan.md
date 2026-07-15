# Seed Evidence Findings Plan

## Goal

Make the real E2E seed an intentional, canonical pipeline exercise. The seed must prove every required pipeline surface without relying on stale aliases, implicit run identity, side-channel notifications, or optional artifacts.

## Root Fixes

1. **Run identity split**
   - Canonical pipeline identity is `pipeline_run_id` and keeps the existing `run-...` value.
   - Seed/workspace identity is `seed_run_id` or `workspace_run_id`.
   - E2E evidence must not compare production `run_id` fields against the seed workspace id.

2. **Mandatory seed artifacts**
   - Seed success requires project summary, run-scoped summary, case-study base data, and publishable `case-study.md`.
   - Missing seed artifacts are product findings, not optional evidence gaps.

3. **Intentional minimal fixture contract**
   - The seed fixture intentionally serves the sentinel `REAL_E2E_NGINX_OK`.
   - Project/run identity is verified through metadata and artifacts, not by expecting the project slug in the HTML body.
   - The static web surface contract is explicit: web root, URL paths, source paths, producers, and consumers are declared.

4. **Buster notification authority**
   - Buster suite result, Buster child spawn, and Buster completion notifications must appear in the same delivery/audit authority used by Nova notifications.
   - Worker-local notification artifacts are diagnostics only.

5. **Buster policy authority**
   - Deterministic Buster mode and judgment Buster mode are explicit.
   - Deterministic modules do not advertise broad judgment tooling.
   - Judgment modules and failed/ambiguous suites use the richer Buster agent path.

6. **Finding severity authority**
   - Buster owns suite findings.
   - Pipeline policy owns whether findings block, warn, or may be deferred.
   - Echo/review may report findings but cannot downgrade Buster severity or deferability.

7. **Module-specific seed checks**
   - Module Buster evidence must prove owned surfaces, not only the integrated fixture.
   - `02-nginx` checks `/content/branch-a.html`.
   - `03-nginx` checks `/assets/branch-b.css`.
   - `04-nginx` checks composition and integration-map wiring before Final Buster.
   - Unit evidence should be parsed enough for review to see what passed.

8. **Observability noise boundary**
   - Non-actionable observer noise is typed as diagnostics.
   - Failed sink sends are sink diagnostics and do not look like pipeline failures.

9. **Redis evidence lifetime**
   - The seed harness captures required pipeline Redis task/telemetry evidence before cleanup.
   - Agent observability success evidence uses promoted `agent.*` events from the canonical pipeline event spine; raw observer Redis streams are ingress diagnostics.
   - Redis unavailability after successful durable evidence capture is cleanup diagnostics, not product failure.

10. **Health smoke authority**
   - `serve.smoke_paths` are deterministic HTTP checks owned by the health suite.
   - Browser automation remains owned by browser suites such as `a11y`, `e2e`, visual regression, and screenshots.
   - Health smoke paths must not require Playwright, browser capabilities, or settle-time browser config.

11. **Terminal Buster worker evidence**
   - Nova worker control results must preserve terminal Redis/output evidence.
   - Stale lifecycle module status such as `TESTING` cannot overwrite a terminal Buster `PASS`, `FAIL`, or `BLOCKED`.
   - Deterministic critical suite failures are pre-test evidence and must not be collapsed into missing terminal completion.

## Findings Covered

- Buster progress notifications missing from canonical delivery receipts.
- Pipeline vs seed run identity mismatches.
- Missing mandatory case study.
- Preview text mismatch.
- Latest pointer status/outcome mismatch.
- Buster task stream and telemetry filters using the wrong run id.
- Discord delivery audit and receipt using the wrong run id.
- Redis evidence and cleanup ordering.
- Architecture advisory `IMPLICIT_STATIC_SURFACE_CONTRACT`.
- Deployment validation concentrated at Final Buster.
- Foundation and branch modules using different validation paths without an explicit policy.
- Inconsistent run summary artifacts.
- Buster stale polling noise.
- `unknown_tool` and failed `sessions_send` observability noise.
- Module Buster prompts claiming Kubernetes validation when Kubernetes is final-gate owned.
- Broad Buster tooling presented to deterministic modules.
- Review prompts missing test-depth and expected-artifact checks.
- Buster resource-limit finding authority ambiguity.
- Broad/shallow module unit tests.
- Missing direct health checks for branch-owned surfaces.
- Repeated shared-image build checks carrying too much signal.
- `04-nginx` shallow composition validation.
- Missing parsed test assertion evidence.
- Health smoke paths accidentally requiring Playwright/browser automation.
- Terminal Buster Redis/output `FAIL` collapsed to `buster_terminal_completion_missing`.

## Validation

- Root verification must stay green.
- Contract tests must enforce identity split, mandatory seed artifacts, Buster policy mode, and severity authority.
- Focused E2E fixture tests must prove the seed writes explicit static surface contracts and module-specific checks.
- Buster suite contracts must enforce HTTP-only health smoke paths.
- Worker control-result tests must prove terminal Redis/output evidence survives stale lifecycle status.
- One seed run is the real-life validation after implementation.

## Result

- `9d77f09e5 Fix seed evidence contracts` implemented root seed evidence fixes for the `bf9e32a35` seed run.
- Follow-up health/Buster worker fixes remove the latest seed regressions:
  - health smoke paths use bounded HTTP checks and no longer require Playwright;
  - Buster worker results compose terminal status from Redis/output evidence before stale lifecycle status.

## 2026-07-11 Follow-Up Findings

Latest seed `seed-20260711T101102Z-753b108b2` proved the product pipeline can complete, but the seed stayed red on post-pipeline evidence and cleanup. These are the remaining canonical fixes:

1. **Case study terminal artifact**
   - Finding: `pipeline_case_study` was missing even though the terminal generator sequence continued.
   - Fix: terminal generators only complete when they return `outputs.status="ok"` and every declared output artifact exists.

2. **Buster progress receipts**
   - Finding: module `01-nginx` queued judgment Buster, but canonical Discord delivery receipts did not include suite results, session spawn, or session completion titles before later modules continued.
   - Fix: Buster task lifecycle notifications must write to the same global and run-scoped Discord audit authority that Nova uses.
   - Follow-up from green seed `seed-20260711T141706Z-f987e44c4`: Buster progress receipts were present but had `status_text="missing_webhook"` and no Discord message id/channel id. Fix: Buster task envelopes carry the pipeline-owned `config.discord_webhook_url`, and Buster lifecycle notifications consume that envelope field instead of relying on worker-local environment.

3. **Buster task stream contract**
   - Finding: Buster tasks executed, but stream evidence could not match canonical `target_kind`, `target_id`, and task identity.
   - Fix: Redis task publication owns the canonical task envelope for module and gate tasks.

4. **Agent observability and Redis cleanup lifetime**
   - Finding: evidence and cleanup tried to read Redis after the supporting Redis path was unavailable.
   - Fix: collect Redis-backed evidence while the Buster simulator/Redis path is still alive, and keep evidence readers from disconnecting the shared client before cleanup.

5. **Latest and summary projections**
   - Finding: stable `pipeline-latest.json` lacked module/gate state even on successful terminal runs.
   - Fix: latest pointer includes run facts, module status projection, and gate projection from the summary read model.

6. **Seed fixture review findings**
   - Finding: pipeline review recommended module-specific verification, body-content health checks, explicit timeouts/retries, manifest enforcement, and tighter deterministic capability declarations.
   - Fix: encode those as generated seed fixture config, not as reviewer-only advice.
   - Follow-up from `seed-20260711T112200Z-46323dd41`: the seed no longer makes `01-nginx` success depend on child-agent judgment. Module Buster completion authority is deterministic suite evidence for all fixture modules; checkpoint scenarios own child-agent instability and retry coverage.
   - Follow-up from `seed-20260713T035917Z-ac0d4276d`: parallel Forge sessions can still terminate before writing the typed completion artifact. The generated fixture now gives every module two retryable attempt budgets (`max_fails=3`, `auto_retry_threshold=2`) and tells Forge agents to write completion without editing when owned files already satisfy the contract.
   - Follow-up from `seed-20260713T041949Z-d74fd3446`: the architecture judgment agent can also end before writing its typed findings artifact. The seed now configures an explicit two-attempt architecture judgment budget, and the validator retries only agent-execution no-output failures before preserving a typed blocking finding.

7. **Pipeline review recommendations not implemented in this pass**
   - Finding: `verify_only` module mode and shared prompt preamble are broader product features.
   - Fix: keep the seed explicit instead of adding a half-mode. The current seed marks verification-oriented modules through existing roles/contracts and keeps prompt changes for a product-level prompt-authority pass.

8. **Forge completion at timeout edge**
   - Finding from `seed-20260711T114314Z-26ad79665`: `04-nginx` wrote and verified its typed Forge completion artifact at the timeout edge, but Nova blocked the module before accepting it.
   - Fix: the Forge poller gives the typed `forge-completion.json` authority one final read before returning timeout, so the durable artifact contract wins over polling cadence.

9. **Buster Git sync runtime-state preservation**
   - Finding from `seed-20260711T120355Z-372bf012d`: `04-nginx` reached deterministic Buster PASS, then Nova could not apply the module completion because the lifecycle read model no longer had an open attempt.
   - Fix: Buster deterministic Git sync may reset source to the expected commit, but must preserve files classified by the shared runtime-state authority across `git reset --hard`.

10. **Required case study terminal generator**
    - Finding from `seed-20260711T122912Z-a64ffbd5e`: all modules, module review, operator approval, final Buster, and final review passed, then the run halted because `generator:case_study` returned `outputs.status="skipped"` with reason `disabled`.
    - Fix: the standard profile and generated seed config must enable the required case-study terminal generator with a concrete model, agent id, and canonical `logs/pipeline/case-study.md` output. The case-study service must fail as a config contract error instead of returning a skipped generator result when disabled.

11. **Post-success observer Redis lifetime**
    - Finding from `seed-20260711T130532Z-27e75b53e`: the product pipeline completed successfully, case study and pipeline review completed, but seed evidence failed while reading raw agent-observability Redis streams after the Redis path was already unavailable.
    - Fix: success evidence verifies promoted `agent.*` telemetry in `logs/pipeline/pipeline.jsonl`. Raw `pipeline:agent-observability:*` streams remain plugin ingress diagnostics and are not terminal seed authority.

12. **Redis cleanup after teardown**
    - Finding from `seed-20260711T130532Z-27e75b53e`: cleanup failed on `redis_run_keys_delete` because Redis was unreachable after durable evidence was already captured.
    - Fix: Redis cleanup records an explicit diagnostic-only unavailable result when Redis is already gone. Kubernetes and Git cleanup remain hard cleanup surfaces.

13. **Telemetry sink restored evidence matching**
    - Finding from `seed-20260711T134147Z-6bc9ff09e`: the product pipeline completed, and the event spine contained both `observability.degraded` and matching `observability.restored` for `telemetry_sink:builtin.telemetry.redis`, but clean completion still blocked as unresolved degraded evidence.
    - Fix: terminal clean-success scanning resolves degraded/restored evidence using the same canonical observability health key as emission: project, run, component, surface, reason, and scope. Module, gate, session, and impacted event fields remain correlation only and do not split health identity.

14. **Final preview target authority**
    - Finding from `seed-20260711T174550Z-fe8ddf6ca`: final Buster created the preview through the k8s suite and emitted both `service_url` and public `preview_url`, but `tailscale-preview` independently resolved the public tailnet hostname and failed with `ENOTFOUND`.
    - Fix: the k8s suite is the canonical final-preview target authority. `tailscale-preview` consumes k8s suite metadata, uses `service_url` for served-content and static-surface proof, and keeps public `preview_url` as exposure metadata. Explicit preview URL scenarios remain opt-in external reachability checks.

15. **No-remediation Buster gate failures**
    - Finding from `seed-20260711T174550Z-fe8ddf6ca`: final Buster's real critical suite failure was masked as `Buster remediation policy must include a positive maxFixCycles`.
    - Fix: `max_fix_cycles: 0` means no fix loop. Nova returns the terminal Buster verdict directly and does not build a remediation request.

16. **Failed gate read-model terminality**
    - Finding from `seed-20260711T174550Z-fe8ddf6ca`: `pipeline-latest.json` had terminal failure at `final-buster`, but the gate read model still showed `final-buster` as `PENDING`.
    - Fix: gate completion events for PASS, FAIL, and BLOCKED are all terminal in lifecycle read models; status and completed timestamps come from the canonical completion event.

17. **Terminal review ran before terminal state authority**
    - Finding from `seed-20260711T182850Z-b0d1608bc`: pipeline review wrote artifacts too late for the harness and reported `lifecycle/read-models.json` as `RUNNING` with missing run-scoped `summary.json`.
    - Fix: validate required terminal generator availability before clean completion, then emit `pipeline_run.completed` and run-scoped summary before running success-only terminal generators. Pipeline review reviews terminal state; blocked/failing paths do not spend time running success-only generators.

18. **Fixture dependency lint warnings**
    - Finding from `seed-20260711T182850Z-b0d1608bc`: full lint reported `0 errors, 272 warnings` because Knip scanned a tiny generated fixture with scripts but no package dependency graph.
    - Fix: Knip is dependency-graph authority only when the project has dependencies or explicit Knip config. Otherwise it records a zero-warning skip finding; ESLint and policy tools remain normal lint authority.

19. **Foundation interface leak**
    - Finding from `seed-20260711T182850Z-b0d1608bc`: architecture warned that `02/03/04` consumed `01-nginx` through Dockerfile implementation details.
    - Fix: `01-nginx` publishes a named `foundation-runtime-static-serving.v1` output interface. Downstream module contracts consume that interface plus their declared content/asset surfaces, not the Dockerfile path.

20. **Shallow deterministic fixture checks**
    - Finding from `seed-20260711T182850Z-b0d1608bc`: `02/03` tests were easy-pass marker checks and `04` relied heavily on strings.
    - Fix: module verifiers assert ownership metadata, non-owned runtime boundaries, and structured integration-map semantics for branch consumption and served paths.

21. **Agent-observability idle read warning**
    - Finding from `seed-20260711T182850Z-b0d1608bc`: one `agent observability XREADGROUP timed out` was recorded while waiting on an idle Redis stream.
    - Fix: the blocking read boundary treats XREADGROUP timeout as an idle stream result. Redis housekeeping and non-blocking command timeouts remain warnings/errors.

22. **Happy-path seed timeout budget**
    - Finding from `seed-20260711T182850Z-b0d1608bc`: the scenario process had a 30-minute global timeout even though success runs now include final Buster, final review, project summary, case study, and pipeline review.
    - Fix: successful scenarios use an explicit happy-path timeout budget. Failure scenarios keep the normal scenario timeout unless overridden.

23. **Final-preview cleanup policy handoff**
    - Finding after `seed-20260711T194346Z-af775fa06`: final-preview leases intentionally use `cleanup_policy: keep` during the run, but the real-e2e cleanup deleted those leases without first switching them to delete, so the namespace controller preserved the namespaces.
    - Fix: cleanup patches run-owned `BusterNamespaceLease` objects to `spec.cleanupPolicy=delete`, deletes the leases, and waits for lease deletion. The namespace controller waits for namespace deletion before removing its cleanup finalizer, making lease deletion the controller-backed proof.

24. **Empty rate-limit monitor detail**
    - Finding from `seed-20260711T203314Z-ec002776b`: final review reported a rate limit with an empty monitor detail, and Nova converted that absence into the configured two-hour cooldown.
    - Fix: provider reset text, retry-after fields, or explicit provider detail are required cooldown authority. Empty monitor status fails fast as missing rate-limit evidence instead of inventing a configured wait.

25. **Module-review evidence references**
    - Finding from `seed-20260711T211138Z-4c9008cfa`: Echo module review correctly failed because `.swarm/contracts/module-review.json` pointed at nonexistent `logs/buster/module/*` evidence instead of the generated `.swarm` evidence surfaces.
    - Fix: the generated module-review contract now points at `.swarm/logs/modules/<module_id>` and `.swarm/logs/echo-review/MODULE-REVIEW.json`, matching the project-local evidence authorities the reviewer is asked to audit.

26. **Review publication rebase masking**
    - Finding from `seed-20260711T211138Z-4c9008cfa`: review output publication hit a Git rebase conflict, then reported the failed `git rebase --abort` cleanup instead of preserving the original rebase-conflict authority.
    - Fix: Git pull-before-push now classifies the unsafe conflict first, attempts abort cleanup second, and throws the structured conflict even when abort cleanup fails.

27. **Checkpoint scenario module graph authority**
    - Finding from `matrix-20260711T221445Z-951f6fbaf`: checkpoint scenarios declared the canonical four-module fixture architecture, but non-success workspaces generated only `01-nginx` in `modules`, `execution_order`, and `module_outputs`, so architecture validation blocked before scenario-specific behavior could run.
    - Fix: every real E2E scenario starts from the same four-module architecture graph. Scenarios may mutate behavior, gates, timing, or failure injection, but the executable module graph and module-output contracts remain canonical unless a scenario explicitly tests architecture corruption.

28. **Checkpoint restore commit authority**
    - Finding from `matrix-20260711T235512Z-389ccf1c4`: checkpoint reuse restored lifecycle read models with module `commit_hash` values from the seed workspace, then resumed lint tried to inspect those seed-only commits in the new workspace and emitted `fatal: bad object`.
    - Fix: checkpoint restore clears commit hash fields from restored lifecycle read models. Immutable canonical events keep their original commit evidence, while resumed state uses the restored workspace's current Git authority for any new work.

29. **Checkpoint capture atomicity**
    - Finding from `seed-20260711T235009Z-20c814f65`: the seed product pipeline passed modules and entered operator approval, but the checkpoint capture controller crashed while copying a live `post-approval` bundle because a lifecycle directory changed during `fs.cpSync`.
    - Fix: checkpoint capture writes to a temporary bundle directory, validates it, then atomically replaces the canonical checkpoint directory. Transient copy races leave the previous checkpoint intact and are retried by the capture controller.

30. **Pipeline review no-output session**
    - Finding from `seed-20260713T043331Z-345fc2902`: the product pipeline completed successfully and case study generation passed, but the required `pipeline_review` terminal generator child session ended without writing `PIPELINE-REVIEW.md` or `PIPELINE-REVIEW.json`.
    - Fix: `pipeline_review.agent_max_attempts` is an explicit terminal-generator execution budget. A `session_ended_no_output` result retries within that budget, while malformed outputs, contract failures, rate limits, and exhausted attempts remain terminal generator failures.

31. **Discord Buster progress evidence**
    - Finding from `seed-20260713T051446Z-bdc8ef2a9`: the product pipeline and all terminal generators passed, but seed evidence still required old Buster subagent lifecycle card titles (`Buster Session Spawned`, `Session Complete`) even though deterministic Buster now emits canonical Redis queue and suite-result cards.
    - Fix: real-e2e Discord receipt evidence requires the current event-spine cards: `Module <id> — Buster queued` and `Suite Results: PASS — <id>`. Buster subagent lifecycle cards remain valid Buster internals when agent judgment is enabled, but are not required for deterministic suite-only success.
