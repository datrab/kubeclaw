# Runtime module boundaries — C0 proposal, not implemented

Source commit/tree is in `source-verification.json`; all named source identities in
`inventory-fragment.json`, `consumer-excerpts.json` and raw reader logs. No production
or test file was edited. No live deployment or paid Eval was run.

## Actual execution path

1. `skills/nova/project/cli.ts` selects `--project` compilation, or imports the Core
   CLI for explicit graph `--pipeline`. `--platform` is a distinct required author
   input. Core CLI currently accepts arbitrary flags into a dictionary and duplicate
   flags overwrite earlier values; project CLI has a closed whitelist/duplicate check.
   `--pipeline` must remain workflow graph selection, never be silently repurposed.
2. Project `compileProject` generates source-preflight, optional architecture-review
   and architecture-approval, blueprint-sync, each module's implement/lint/optional
   review/test sequence, cumulative final-lint/optional final-review/final-test,
   project-summary, optional demo-candidate/demo-delivery/demo-ready. Module ordering
   is a stable topological order and each module starts after the previous test gate;
   compileProject also authors `maxConcurrency:1`.
3. `validatePipelineRuntimeV2` -> `prepareRuntime`: discovery/trust checks,
   `buildRegistry`, enabled registration selection (stage types, platform observer map,
   active adapter list), `resolveCapabilityGrants`, registration config validation,
   activation. Test providers use their separate registry/config resolution boundary.
4. `runNewPipeline` prepares runtime before the run lock. Under `withRunMutationLock`
   it writes `run-snapshot.v4` atomically using a fsync'd temporary file and no-replace
   hardlink. Graph and registry are one authoritative snapshot, not independent
   partially published files. The snapshot stores finite runtime-dispatch/cache
   **encoding profiles**, not operator CONFIG generation.
5. `executePrepared` verifies graph, reads frozen profiles, checks effect recovery,
   creates/starts run-wide adapter instances and serializes observer drains.
   `PipelineRunner`/`PipelineLoop` select ready stages and enforce `maxConcurrency`
   and consumed attempts. `stage.started` is appended and observer flush completes
   before `StageExecutor.execute` creates a lease. `StageExecutor` records
   `attempt.created`/`attempt.dispatched`, then calls registered execute with the
   graph's config/input and wall-time cancellation. Lease memory is assigned 512MiB
   in source; this is not evidence of OS memory enforcement.
6. Stage capability calls flow through `createPluginInvocationContext` lease/grant
   checks -> `authorizeCapabilityInvocation` -> `AdapterRuntime.invoke` -> durable
   `EffectCoordinator` -> activated adapter. Adapter dependencies pass the same
   capability checks and durable ownership/idempotency construction. Raw config is
   passed to plugin activation; generic registry validation DOES NOT resolve schema
   defaults for stages/adapters/observers.
7. Quality gate executes `test.plan.execute` first. Native Buster decision is verified
   and stored; an optional evaluator-agent dispatch only happens after native pass.
   Module test config and plugin both currently treat omitted testAgentEnabled as true.
8. The exported Nova test-plan resolver API applies node config ->
   `resolveTestProviderConfiguration` -> Ajv `useDefaults:true` clone -> resolved
   provider configuration with schema digest -> plan. No in-repo production caller of resolveTestPlan was found; project CLI accepts already resolved plans, so this API default expansion cannot be claimed as its productive author path. Buster `TestPlanRunner` ->
   `RunnerScheduler` -> `executeRunnerNode` -> `prepareRunnerAttempt` -> worker envelope
   -> `executeRunnerAttempt` -> `createRunnerProviderOperation.executeProvider` ->
   registered provider instance.execute. Fixture readiness/retention/cleanup and
   report finalization are part of this plan's lifetime; per-node settings are not
   automatically appropriate independently hot-reloadable module boundaries.

## Actual recovery contract (not the proposed contract)

`recoverPipeline`/`resumePipeline` call `prepareRuntime` again before lock acquisition,
then verify pinned package set/version/digest and graph digest. The exact serialized
`runtime.configuration` contains providers, grants, adapters, activeAdapters,
observers and optional isolation. It **does not** include storageRoot,
shutdownTimeoutMs, effectLockTtlMs, orchestratorIssuerId, administrativeDecisionIssuers,
installationRoots, trustedBuiltinRoots or externalTrust. Trust/package checks still
exist, but there is no blanket proof every platform setting is recovery-pinned.

Project recovery reconstructs historic identity/report/review/delivery encoding
modes from the stored snapshot, compiles the corresponding graph and verifies the
whole graph. Legacy skeleton compilation is an identity aid, not authorization to
supply latest operator values for historical missing CONFIG.

Reducer/recovery replay retains attempts/remediation/technical retry counters,
repair-budget records, cooldown due time, wait creation/issuer/expiration and durable
external effects. A configuration publish must never reinterpret consumed counters,
remove unknown effects or reopen historical terminal decisions. Current graph pins
prevent changing the config of an unstarted module too: next-module CONFIG tuning
requires a versioned split between stable graph/run policy and tunable closure.

## Proposed module membership (explicit, versioned before dispatch)

- `source-admission`: source-preflight, optional architecture-review and
  architecture-approval, blueprint-sync; one stable source/approval/blueprint contract.
- `project-module:<moduleId>`: implement-<id>, lint-<id>, optional review-<id>, test-<id>,
  every authorized implementation repair, lint/review/test recheck, technical retry,
  related model sessions, workspace integration/cleanup, test plan and its fixtures.
  No per-stage reload. Starting lint after implementation is not a new tuning boundary.
- `project-final`: final-lint, optional final-review, final-test, project-summary,
  and their compatible technical retries. Exact treatment of summary-only presentation
  settings can be narrower only after an explicit owned module contract, not ambient reload.
- `demo-handoff`: demo-candidate, demo-delivery, demo-ready and durable readiness/retention
  effects. It consumes source-bound final outputs; a new config cannot rewrite candidate
  identity or revoke acknowledged handoff history.
- `repository-audit:<stageId>` / `repository-revalidation:<stageId>`: complete audit
  including slicing, primary jobs, context expansion, verification, retries, token/cost
  reservations, cache/approval/reduction. Never a separate generation per model call.
- `explicit-graph-module:<declaredId>`: author declares module membership for arbitrary
  Core graphs using finite stage IDs. Derivation from stage names alone is unsafe.
  Absence requires a versioned migration/explicit policy, not an implicit whole-run fallback.
- Standalone Prism: one durable order/attempt lifetime (server accepted attempt,
  worker claim/envelope, agent/engine work, artifact/result/cleanup). Actual launcher
  paths include `server/agent-job-runner.mjs` -> claim -> accepted envelope identity
  check -> `agentAttempt` profile comparison -> `WorkerAttemptExecutor.execute` and
  `server/native-worker-execution.ts` -> native attempt journal/worker-core. Independent
  Prism source inventory must close Engine and HTTP/studio caller bindings; this
  note does not claim complete Prism consumer coverage.
- Standalone Buster: one submitted/prepared plan including provider nodes, fixture
  readiness and retention, reports, reconciliation and cleanup. `remote-plan-runtime`
  calls service.recover before listening; `remote-plan-service`/prepared execution
  are durable plan boundaries. This CONFIG grouping does not implement D18 Job execution.
- Run-owned adapter/observer/security/storage profile: discovery grants, provider
  selection, auth, effect stores/lock/issuer contracts and observer delivery policy
  remain stable for a run. Shared adapter tuning cannot change under a live instance.
  A tunable adapter instance must be module-owned and receive the module closure;
  justify dependency scope/teardown and avoid duplicating parsers/author values.

## Minimal target extension, no second index/server

Reuse the existing Swarm bundle author/materializer and rename its central entry
`pipeline.config.json` only in the approved migration. Preserve `pipeline.json` as
workflow graph. Existing six component authors remain the start point; profile/plugin
refs are validated owner-scoped descendants, not a second manually maintained index.
Physical author layout must be settled with the packaging/Chart slice; filenames in
runtime row target proposals are role names, not approved files.

Before any first effect/attempt dispatch, persist one immutable module closure:
version + run/module identity + mode + stable run-policy digest + selected CONFIG
revision/root digest + every resolved author/ref/schema/package/profile digest +
secret reference identity/version contract (not secret values) + effective config
and graph membership digest. Persist verified referenced bytes (or content-addressed
retained projection) so restart cannot depend on mutable author files. Validate whole
closure and cross-owner constraints before its atomic journal/store publication.

Normal mode: an unbound permissible next module can select the latest complete valid
published generation; publication A/B races result in exactly A or B, never mixed
files. Invalid B must cause a clear activation rejection without selecting A behind
operator intent. Once bound, repairs/retries/continuations/cleanup remain on that
closure. Recovery of a bound module loads retained closure only; missing/corrupt
history blocks, not latest-file lookup. Fixed-generation Eval mode binds one complete
revision at admission and every module uses it; no paid Eval or complete Evalrunner
is required for C0.

The existing run mutation lock, snapshot atomic publication, immutable registry and
hash journals are suitable foundations. An additive versioned binding record and
owner-coherent validation/materialization composition are justified; a config server,
ambient hot reload or second generic plugin registry is not.

## Proposed decisive binding cases (all not-run)

RT-BIND-01 crash before binding: no effect dispatched; restart may bind selected complete
revision under run mode. RT-BIND-02 crash after fsync/before dispatch: restart uses exact
bound closure; no double model/fixture effect. RT-BIND-03 concurrent starts/publish:
exact A or B per permitted module, same fixed Eval generation across all modules.
RT-BIND-04 running A vs published B: lint/review/test/repair/retries/cleanup stay A;
next unbound module can use B. RT-BIND-05 invalid/missing B: no partial activation or
silent A fallback. RT-BIND-06 missing/corrupt retained A: explicit recovery block.
RT-BIND-07 publish/retry/repair: spent budget/claims/deadlines/waits unchanged.
RT-BIND-08 unknown external effect: reconciliation remains mandatory; generation
change cannot replay it. RT-BIND-09 grant/profile conflict: reject before effect.
RT-BIND-10 standalone Prism/Buster module grouping: exact durable attempt/plan/fixtures
retain one closure. RT-BIND-11 run-owned adapter/observer settings: no ambient mutation;
module adapters receive compatible closure and durable dependency identity.
RT-BIND-12 mutant missing binding/latest-on-recovery: exact crash/recovery case must
fail for intended semantic reason, not build/setup failure.

## Remaining C0 obligations

1,221 rows are not a completion claim. Most schema-location rows still require
field-specific default/reader/error/activation/task-policy disposition; 4,642 syntax
candidates include task-data sentinels and validators as well as real settings and need
explicit explanation. The broad schema discovery case passes identity/ID extraction
only. Proposed runtime cases remain not-run and exact executable harness definitions
are not yet complete. Deployed profile/external plugin/Secretstore revision inputs
remain absent. A fresh reviewer must challenge the complete scope, not sample only
this note or accept row/hash counts.
