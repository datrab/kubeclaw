# CONFIG C0 — current working definition

Status: **C0 in progress; not accepted; C1–C6 not approved.** This document
supersedes neither historical evidence nor the authorization boundary in
[OPENCLAW-CONFIG-GOAL.md](OPENCLAW-CONFIG-GOAL.md). D17–D22 apply. Nothing in
this branch implements CONFIG, changes tests, deploys, or closes a finding.

## Source and delivery identity

Source baseline: `9452d35524192f8665bc87254b3c63a361e7bd4a`, tree
`89fa8e4d683cf442deb189d60ce8b7cc1ff05327`, obtained after fetching/pulling the
repository and checking out the current CONFIG handoff into an isolated worktree.
Work branch: `codex/config-c0-semantic-inventory-20261012`.
The PR must target `codex/cloud-config-handoff-20261012`: targeting `main`
would include substantial pre-existing unrelated implementation/history. That
history is source input, not new work authorized by this C0 task.

The whole tracked tree is enumerated in
[source-boundary.json](../evidence/config-acceptance/author/source-boundary.json).
Candidate markers in the adjacent ledger are discovery obligations, **not
semantic settings or acceptance**. Current code, build-time tests, examples,
generated release copies, documentation and historical evidence have distinct
boundaries. Test files copied into real images must remain in delivery closure;
their path alone does not establish they are nonproductive.
Fragments under `components/`, `runtime/` and `delivery/` are incremental author
inputs. A schema-location row with an unresolved consumer is explicitly open.
Complete acceptance requires source dispositions, field contracts and a fresh
independent reviewer, not counts or successful integrity checks alone.

## Confirmed goals versus proposed mechanisms

Confirmed: evolve existing `swarm.config.json` to **`pipeline.config.json`**;
`pipeline.json` and `--pipeline` remain project/workflow graph inputs. One
editable author per setting/active owner/registration/instance/profile. No code,
schema, ENV, CLI, Chart or entrypoint may supply missing migrated operator values.
Migrate existing Swarm architecture rather than invent a second system index.
No D18 worker refactor, paid Eval, host intervention or test reclassification.

Proposed author root: repo `config/`, separated from Helm/Docker projections.
This is justified only together with real packaging migration: Helm `.Files.Get`
cannot read outside its packaged chart; `.dockerignore` and image change filters
must include the selected immutable generation. Retaining current chart-root
authors is technically possible, but obscures non-Chart component ownership and
still requires profile materialization. The proposal chooses one root and one
materializer, not two synchronized editable copies. Existing owner names remain
unless a specific consumer contract requires a change.

`config/pipeline.config.json` owns composition and selected profile references,
not component setting values. Complete owner profiles live in service/engine/core
files, plugin profiles by actual manifest identity and registration/instance.
Agent profiles refer to supported provider/model/prompt resources. Shared
endpoints/identity/storage grants belong to explicit deployment/runtime owners;
consumer quotas and task parameters are not silently shared by matching names.
Versions stay in the established version authority; external secret bytes are
never included in inventory, explanation, snapshots or normal author files.

## Activation and instance contracts

- **S, service/process**: ports, transport roots, trust, storage, concurrency
  pools and endpoints activate by validated startup/drain/restart. A running
  server is not changed by a stage profile refresh.
- **R, run**: graph, module membership, grants, provider ABI, issuer, recovery
  foundations, total budget ceilings and mode are immutable for that run.
- **M, module**: only eligible tuning/agent/model/prompt/quality profile fields
  select a new generation before the next unbound module, within R constraints.
  Implementation, repairs and all associated lint/review/test attempts share it.
- **J, operation/plan**: standalone Prism order or Buster plan binds before
  admission/dispatch; children inherit it rather than independently reading Latest.
- **V, nonsetting**: protocol/version/generated binding/task data retains its
  actual owner and reason. A literal is not exempt just because it is convenient.

S/R/J/M is assigned per field after tracing its consumer. Fixed Eval selects one
complete generation for all units; a scenario/dataset/scorer is task input, not
permission to alter grants or reset budgets. No generic Evalrunner is claimed.
Instance selection is by owner + registration + stable instance ID + explicit
complete profile; existence of a profile does not activate a plugin or grant it
capabilities. No implicit first profile, ENV override, missing-value coercion,
fallback model or automatic old-filename lookup. An explicitly configured model
fallback list is policy; actual selected model must be recorded and supported by
the real adapter, not assumed from a profile label.

## Actual module and recovery source paths

`skills/nova/project/compiler.ts::moduleStages` creates `implement-<module.id>`,
`lint-<module.id>`, optional `review-<module.id>` and `test-<module.id>`;
request-fix routes return to implementation. `source.ts`, `coverage.ts` and
`demo.ts` generate source/architecture, cumulative integration and handoff stages.
Current `module.id` is input identity, not a universal runtime config binding.
Free graphs therefore need explicit versioned stage-membership metadata; do not
guess modules from stage names or reload separately for each stage/HTTP request.

`engine-run.ts::runNewPipeline` prepares runtime, enters `withRunMutationLock`,
writes `run-snapshot.v4`, then calls `executePrepared`. `engine-snapshots.ts`
publishes by exclusive temp write, file fsync, no-replace hardlink and directory
fsync. `executePrepared` verifies graph and checks uncertain effects before
starting adapters and runner. Recovery verifies the stored package set/digests
and whole runtime configuration, recovers lifecycle state and reconciles durable
observability. These existing checks must not simply be removed for dynamic config.

`stage-executor.ts` passes `definition.config`, creates a lease and appends
`attempt.created` / `attempt.dispatched` before plugin invocation. Its current
attempt record contains retry/remediation usage and lease identity but no
separate module generation closure. `state/journal.ts::FileJournal` provides
mutex-serialized, hash-chained fsync append/transact and rejects rewind/drift;
its append-lock timeout is itself a current hardcoded policy candidate.

### Proposed durable pre-dispatch transition (C5, not implemented)

1. Pin R contract at new-run creation: graph/module/repair membership, grants,
   ceilings, effect identity, code/packages and live-module versus fixed mode.
2. Under the existing run mutation/transaction boundary, look up the unique
   logical `(runId,moduleId)` or standalone operation key. Existing binding must
   recover its original closure; never supplement it from current author files.
3. If unbound, select a complete validated generation once. Validate M eligibility
   against R; persist immutable content-addressed owner/profile/prompt objects and
   their complete file set, identities and secret revision references durably.
4. Append/fsync the versioned binding before attempt/dispatch. Include generation,
   effective profile/instance mapping, input and original runpolicy/claim/deadline
   references. The binding introduces no independent budget counters.
5. Dispatch from that closure. Technical retry, repair, wait/resume, cancellation,
   result reconciliation and cleanup inherit it with existing consumed budgets,
   cooldowns, deadlines and uncertain-effect states.

Crash before step 4 permits selection without an effect; crash after binding but
before dispatch recovers the same binding; crash after dispatch reconciles the
real effect before repeating. Concurrent starts and publication linearize to a
complete A or B, never mixed files. Started A remains A; eligible unbound module
may use B; fixed Eval remains A. Invalid B fails before publication/dispatch, no
silent fallback. Historical versioned runs drain/recover with original supported
contracts; missing historic closure is a concrete rejection, not Latest.

Secretstore revision identity is an external unresolved input. Existing
unversioned ENV resolver cannot prove fixed secret revision recovery. A retired
or revoked ref blocks its consumer explicitly; no substitution with latest.
External installed-plugin roster, actual deployed Nova profile, operator host
capacity and other-session approved test standard remain separately requested
inputs at their affected later boundaries; none excuses skipping repo-based C0.

## C1 proposal boundaries — not yet ready for approval

The intended first slice preserves all existing six component effective values
and the complete Buster runtime variant, keeps no-follow/hash/freeze and startup
contracts, and consolidates profile authors. Current runtime variant differs from
base in the Kubernetes fixture secret allowlist; it is whole-document selection,
not keywise overlay. Select full same-owner profiles and reject competing inputs
even if equal-valued. Frozen current required case set remains unchanged.

Author → validated materializer → immutable bundle → both real Helm packages /
Buster image / role-bundle closure → normal loaders and service consumers is one
delivery generation. Migrate actual `.dockerignore`, Docker-specific contexts,
runtime-input filters, release configuration guards, image verification and role
packaging together. A config-only change must trigger its actual delivery route.
The runtime locator is transport, not a settings override. Runtime wire/schema
name migration must be decided from all actual callers; no second editable entry.

Exact package and per-setting cases will be completed in
`config-acceptance-matrix.json` after semantic field closure. Cases for C1–C6
remain `not-run` until approval/implementation. Required behavior includes two
complete materially different profiles at each distinct real consumer, missing /
type / unit / relation / unknown / competing-author / escaping-reference
rejections with same-boundary positive controls, real Chart/image/filter/release
closure, atomic A/B, startup freeze, isolated semantic mutants and F-CODE/F-DOC.
Existing four Helm diagnostic-assertion failures are preserved and assigned to
the eventual approved test correction, not silently weakened during C0.

## Acceptance state

C0-A through C0-E remain open until the consolidated inventory has no unexplained
candidate, unknown reader/default/validation or incomplete field-level case and
the fresh reviewer independently closes it. Integrity/whitespace/register checks
are narrower evidence. No implementation approval is being requested now.
