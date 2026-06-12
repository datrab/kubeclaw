# Batch S00 — Other skill instructions and docs

Status: completed
Date started: 2026-05-09
Date completed: 2026-05-09
Reviewer: Nova

## Scope

```text
skills/nova/project_setup/SKILL.md
skills/nova/project_setup/module-files.md
skills/nova/project_setup/progress-json.md
skills/prism/frontend-design.md
skills/prism/prism-conventions.md
skills/prism/tmp
```

Scope expansion verified live: 6 files, under the 10-file maximum. All scoped files were read end to end.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/nova/project_setup/SKILL.md
kubeclaw-main/skills/nova/project_setup/module-files.md
kubeclaw-main/skills/nova/project_setup/progress-json.md
kubeclaw-main/skills/prism/frontend-design.md
kubeclaw-main/skills/prism/prism-conventions.md
kubeclaw-main/skills/prism/tmp
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/skills/buster/pipeline/suites/visual-reg.js
kubeclaw-main/skills/buster/pipeline/tools/screenshot.js
kubeclaw-main/skills/common/pipeline/agents/acp-monitor.js
kubeclaw-main/docs/open-issues.md
```

## Per-file map

### `skills/nova/project_setup/SKILL.md`

Role: Project-setup skill entry instructions for creating a `.swarm` architecture branch, progress.json, module task files, gates, and run checklist.

Imports/dependencies: Markdown-only skill metadata and references to project setup docs.

Exports/public surface: Skill name `project-setup`, description triggers, and operator-facing setup instructions.

Defines: Architecture branch layout, minimal progress.json template, key module/gate fields, suite selection matrix, k8s suite field reference, setup checklist, common errors, references.

Important variables/state: None; doc defines required project artifacts and default assumptions.

Calls out to: CLI docs mention `node /app/skills/pipeline.js --project <name> --dry-run` and `--resume`; Git branch/add/commit/push commands.

Called by / expected callers: Operators and agents preparing projects for the Nova pipeline.

Environment variables / CLI inputs / config fields: Documents project/gate/module fields including models, execution order, stages, thinking levels, test suites, `session.runtime`, and k8s `namespace_prefix`.

Paths built/read/written: `Projects/<project>/src/.swarm/`, `.swarm/progress.json`, `echo-review/`, `buster-test/`, `modules/<module-dir>/`, `FORGE.md`, `BUSTER.md`, `test-spec.json`.

Authority behavior: Documentation only; does not execute or validate setup.

Error/retry/terminal behavior: Common-errors table gives troubleshooting guidance; no executable error behavior.

Verification coverage: Indirect through project dry-run and setup docs; no direct verification harness for doc examples found in S00 scope.

Findings: None new; B03 namespace cleanup issue already tracks `namespace_prefix` implementation risk.

### `skills/nova/project_setup/module-files.md`

Role: Writing guide for module-level `FORGE.md`, `BUSTER.md`, `test-spec.json`, and visual-reg baseline assets.

Imports/dependencies: Markdown-only guide, references Prism conventions and screenshot/visual-reg tools.

Exports/public surface: Documentation sections for FORGE task format, BUSTER test instructions, API test spec schema, visual regression baselines.

Defines: Required FORGE sections, unit-test guidance, BUSTER vs FORGE responsibility split, API/WebSocket test examples, sandbox testing strategy, visual baseline directory conventions.

Important variables/state: None.

Calls out to: Mentions `visual-reg.cjs`, `screenshot.cjs`, `node /app/skills/screenshot.cjs`, visual-reg suite behavior.

Called by / expected callers: Operators and agents writing module task files.

Environment variables / CLI inputs / config fields: Documents API spec fields, static bearer token headers, visual-reg `baseline_dir`, `thresholds.max_diff_percent`, `discord`, and `SANDBOX=true` app behavior.

Paths built/read/written: `.swarm/modules/<module-dir>/baselines/preview.html`, `paths.json`, `*-baseline.png`, `baseline.png`, FORGE/BUSTER/test-spec files.

Authority behavior: Documentation asserts Prism preview HTML is visual-reg source of truth; current implementation derives baseline dir and rejects legacy path config, creating a doc/source drift tracked in S00 issue.

Error/retry/terminal behavior: Documents visual-reg mode detection and SKIP when no baselines; no executable behavior.

Verification coverage: B04 source review covers actual visual-reg/screenshot behavior; this doc has stale path/config names tracked in S00 issue.

Findings: `S00-ISSUE-001`.

### `skills/nova/project_setup/progress-json.md`

Role: Complete progress.json field reference for projects, modules, gates, post-pipeline agents, telemetry, serve config, suites, ACP monitor, and payload rate limits.

Imports/dependencies: Markdown-only schema guide.

Exports/public surface: Field tables and complete JSON example for project setup.

Defines: Top-level progress.json schema, module schema, review/buster/approval gate schemas, arch validation, pipeline review, case study, telemetry, serve config, suite config, manifest config, ACP monitor, payload rate-limit config.

Important variables/state: None.

Calls out to: Mentions canonical telemetry stream and `docs/telemetry-event-schema.md`.

Called by / expected callers: Operators/agents authoring `.swarm/progress.json`.

Environment variables / CLI inputs / config fields: Documents many pipeline config fields including models, module/gate paths, telemetry, `acp_monitor`, payload rate-limit, serve/suite config.

Paths built/read/written: `.swarm`-relative gate and agent output paths; repo-root serve/docker/manifest paths; `.swarm/modules/<module>/test-spec.json`.

Authority behavior: Documentation only; observed drift with current visual-reg baseline config and common ACP monitor defaults is tracked.

Error/retry/terminal behavior: Documents timeouts and gate behaviors; no executable behavior.

Verification coverage: Cross-checked against B04 visual-reg/screenshot and C00b ACP monitor source; drift tracked as S00 issues.

Findings: `S00-ISSUE-001`, `S00-ISSUE-002`.

### `skills/prism/frontend-design.md`

Role: Prism frontend-design skill guidance for creating distinctive production-grade frontend interfaces.

Imports/dependencies: Markdown-only skill metadata.

Exports/public surface: Skill name `frontend-design`, description triggers, design execution guidance.

Defines: Design-thinking checklist, aesthetic guidelines for typography/color/motion/composition/background, anti-generic-AI aesthetic rules.

Important variables/state: None.

Calls out to: None.

Called by / expected callers: Frontend/UI generation agents and operators.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: None.

Authority behavior: Prompt/behavior guidance only; no pipeline runtime authority.

Error/retry/terminal behavior: None found in scoped files.

Verification coverage: None found in scoped files.

Findings: None.

### `skills/prism/prism-conventions.md`

Role: Prism preview convention spec for route manifests and auth bypass used by visual-reg baseline generation.

Imports/dependencies: Markdown-only convention guide.

Exports/public surface: Route manifest format, auth-bypass rules, file placement, regeneration logic, minimal preview example.

Defines: `<script type="application/json" data-routes>` schema, route `name`/`nav` rules, `?baselines=true` behavior, baseline file tree, regeneration condition.

Important variables/state: None.

Calls out to: Mentions `screenshot.cjs`, `visual-reg.cjs`, `node /app/skills/screenshot.cjs --generate-baselines`.

Called by / expected callers: Prism preview authors and visual-reg baseline authors.

Environment variables / CLI inputs / config fields: Documents `?baselines=true` preview query param and real-app `SANDBOX=true` behavior.

Paths built/read/written: `.swarm/modules/<module-dir>/baselines/preview.html`, gate-level `.swarm/buster-test/baselines/`, generated `paths.json` and `*-baseline.png`.

Authority behavior: Documentation asserts preview HTML is source of truth; stale tool filenames/config drift tracked with module-files.

Error/retry/terminal behavior: Documents regeneration based on preview mtime greater than `paths.json`; no executable behavior.

Verification coverage: B04 source review covered screenshot generator and visual-reg behavior; stale references tracked.

Findings: `S00-ISSUE-001`.

### `skills/prism/tmp`

Role: Empty one-line placeholder file under Prism scope.

Imports/dependencies: None.

Exports/public surface: None.

Defines: No content found in scoped file.

Important variables/state: None.

Calls out to: None.

Called by / expected callers: None found in scoped files.

Environment variables / CLI inputs / config fields: None.

Paths built/read/written: None.

Authority behavior: None found in scoped files.

Error/retry/terminal behavior: None found in scoped files.

Verification coverage: None found in scoped files.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| Project setup docs | Nova pipeline CLI | `/app/skills/pipeline.js --project ... --dry-run/--resume` | Operator command examples for validation and run. |
| Module/prism docs | Buster screenshot/visual-reg tools | `screenshot.cjs`, `visual-reg.cjs` references | Tool names are stale relative to scoped B04 source paths; tracked as S00 issue. |
| Prism conventions | Visual-reg baseline generator | route manifest and `?baselines=true` conventions | Source screenshot tool implements these conventions. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `SKILL.md` suite selection | Suite chosen in `test_suites` | Backend/frontend module type | Indicates appropriate Buster suites and requirements | Guides project setup. |
| `module-files.md` visual-reg mode detection | `paths.json`, `.html`, `baseline.png`, or nothing in baseline dir | Baseline artifacts | Multi-path, auto-generate, single-path, or SKIP | Mirrors intended visual-reg flow but stale config/tool names tracked. |
| `prism-conventions.md` route generation | Route `name === setup` | `data-routes` manifest | Setup captured without auth bypass; other routes use `?baselines=true` and nav click | Baseline generator behavior. |
| `progress-json.md` gate routing | Gate `type` | review/buster/approval | Documents gate-specific required fields and timeout/fix behavior | Project schema guidance. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `SKILL.md` project setup | Git branch and `.swarm` artifacts | Operator steps | Create architecture branch, add `.swarm`, commit/push, return to main | Pipeline can release blueprints per module. |
| `module-files.md` baseline generation | `paths.json` and baseline PNGs | Prism preview `data-routes` | Preview is source; generator writes one PNG per route and paths JSON | Baseline artifacts align with preview manifest. |
| `progress-json.md` config defaults | Progress config | Top-level/module/gate values | Documents defaults and per-module/gate overrides | Agents/suites select models, paths, and thresholds. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `progress-json.md` ACP monitor docs | Transcript extension limits | None in docs | Documents `max_transcript_extensions` and `transcript_grace_ms`; current default drift tracked | Timeout behavior guidance. |
| `progress-json.md` payload rate-limit docs | Rate-limit pauses | Exponential backoff implied by cooldown fields | Max pauses/cooldown fields documented | Rate-limit behavior guidance. |
| S00 scoped files | Other loops/polling | None found in scoped files | None found in scoped files | None found in scoped files |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `progress.json` top-level/module/gate fields | Project config | Nova pipeline | Documented in `progress-json.md` | Full setup schema reference. |
| `test_config.serve.*` | Buster suite config | Buster suites | Documented backend/static defaults | Includes project dir, commands, image, health, docker/manifest paths. |
| `test_config.visual-reg.baseline_dir` | Documented suite config | S00 docs; current B04 source rejects legacy baseline path config | Docs say default `.swarm/baselines` | Stale doc/source drift tracked as `S00-ISSUE-001`. |
| `acp_monitor.max_transcript_extensions`, `transcript_grace_ms` | Documented monitor config | Common ACP monitor | Docs say 10 and 60000 ms; current common defaults are 3 and 300000 ms | Drift tracked as `S00-ISSUE-002`. |
| `SANDBOX=true` | Runtime env convention | App implementation / visual-reg docs | Passed by Buster build per docs | Real app auth bypass guidance. |
| `?baselines=true` | Preview query param | Prism preview/baseline generator | Preview-only | Static preview auth bypass for baseline generation. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| `Projects/<project>/src/.swarm/progress.json` | Project setup docs | Nova pipeline | Operator/agent setup | Primary project config artifact. |
| `.swarm/modules/<module-dir>/FORGE.md` | Project setup docs | Forge prompt builders | Operator/agent setup | Module implementation instructions. |
| `.swarm/modules/<module-dir>/BUSTER.md` | Project setup docs | Buster task generation | Operator/agent setup | Module testing instructions. |
| `.swarm/modules/<module-dir>/test-spec.json` | Module files doc | Buster API suite | Operator/agent setup | API test spec when `api` suite configured. |
| `.swarm/modules/<module-dir>/baselines/preview.html` | Prism/module docs | Screenshot baseline generator | Prism/agent setup | Source of truth for visual-reg baselines. |
| `.swarm/modules/<module-dir>/baselines/paths.json` and `*-baseline.png` | Screenshot baseline generator | Visual-reg and health smoke docs | Generator | Generated route/baseline artifacts. |
| `.swarm/buster-test/baselines/` | Prism conventions | Gate-level visual-reg docs | Operator/agent setup | Gate-level visual-reg baseline location. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Project setup documentation | `skills/nova/project_setup/*` | Operators/agents configuring pipeline projects | Visual-reg and ACP monitor drift tracked. |
| Prism preview conventions | `skills/prism/prism-conventions.md` | Prism preview authors, screenshot generator expectations | Tool filename/path references stale relative to current source. |
| Frontend design behavior guidance | `skills/prism/frontend-design.md` | Frontend generation agents | None. |
| Empty Prism `tmp` file | None found in scoped files | None found in scoped files | Could be removed if confirmed unused; no actionable runtime impact found. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| `progress.json` top-level | Setup docs | `project`, `models`, `execution_order`, `modules`, `gates`, optional agents/telemetry/acp/payload | Nova config validation outside S00 | Nova pipeline. |
| Module definition | Setup docs | `title`, `dir`, `depends_on`, optional `stages`, model/thinking, `test_suites`, `test_config` | Nova module validators outside S00 | Nova runner/Buster suites. |
| Review gate definition | Setup docs | `type:'review'`, `title`, `review_name`, instruction/output paths, reviewers, fix-cycle fields | Gate validators outside S00 | Review gate runner. |
| Buster gate definition | Setup docs | `type:'buster'`, instruction/output paths, model/fix fields, `test_suites`, `test_config` | Gate validators outside S00 | Buster gate runner. |
| API `test-spec.json` | Module docs | `base_url`, `defaults.headers`, `defaults.timeout_ms`, `tests[]`; test entries with HTTP or WS fields and `expect` | Buster API suite outside S00 | API suite. |
| Prism `data-routes` manifest | Prism conventions | Array of `{name:string, nav:string}`; lowercase slug rule | Screenshot generator validates route fields outside S00 | Baseline generator / visual-reg. |
| Generated `paths.json` | Prism conventions | Array with `{name,path}` in examples, source generator also carries `nav` | Screenshot generator outside S00 | Visual-reg and health smoke autodetection. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Project setup skill | `skills/nova/project_setup/SKILL.md` | `.swarm/` project artifacts | Create architecture branch, progress.json, FORGE/BUSTER/test specs, verify dry-run, run pipeline | Git and pipeline CLI commands in docs | Valid `.swarm` project setup committed to architecture branch. |
| FORGE.md guidance | `module-files.md` | `.swarm/modules/<module>/FORGE.md` | Goal, acceptance criteria, architecture constraints, files, required unit tests | Markdown task contract | Concrete implementation and deterministic unit tests. |
| BUSTER.md guidance | `module-files.md` | `.swarm/modules/<module>/BUSTER.md` | Test scope, requirements, setup/fixtures, conventions | Markdown task contract | Cluster-capable exploratory/system tests. |
| Prism frontend-design skill | `frontend-design.md` | Caller-chosen frontend files | Bold aesthetic direction, production-grade UI, avoid generic AI aesthetics | None found in scoped files | Working distinctive frontend code. |
| Prism preview conventions | `prism-conventions.md` | `preview.html` and generated baselines | `data-routes`, `?baselines=true`, visible nav exact match | Screenshot generator CLI | Preview supports baseline generation and route screenshots. |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `SKILL.md` setup verification | Dry-run/setup errors | Operator retry | No retry mechanics in docs | Common-errors table gives fixes | None. |
| `module-files.md` API tests | Endpoint/WS expectation failures | Suite-owned | `timeout_ms` default documented 5000 ms | API suite status outside S00 | Static bearer token examples shown directly. |
| `module-files.md` visual-reg | Missing baseline artifacts | Suite-owned | Regeneration when preview newer than paths JSON documented | Docs say SKIP when no baseline; stale config tracked | None. |
| `progress-json.md` gate/agent timeouts | Review/buster/approval/case-study timeouts | Runner-owned | Timeout minutes documented per agent/gate | Runner behavior outside S00 | None. |
| `progress-json.md` telemetry | Telemetry disabled/enabled | Runtime-owned | None in docs | Enabled publishes canonical stream; disabled no stream | None. |
| Prism preview conventions | Missing/bad manifest/nav/auth bypass | Generator-owned | No retry mechanics in docs | Generator behavior outside S00 | None. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `SKILL.md` setup verification | Dry-run/setup errors | None in scoped files | Pipeline CLI outside S00 decides | none | none | Docs only. |
| `module-files.md` API tests | Test failures | None in scoped files | Buster suite outside S00 decides | none | none | Docs only. |
| `module-files.md` visual-reg | Missing/stale baselines | None in scoped files | Visual-reg/screenshot tools outside S00 decide | none | none | Docs only; stale config tracked. |
| `progress-json.md` gate/agent timeouts | Timeout/failure behavior | None in scoped files | Nova runners outside S00 decide | none | none | Docs only. |
| `progress-json.md` telemetry | Telemetry config | None in scoped files | Nova/Buster telemetry outside S00 emits | `pipeline:telemetry:<project>:<run_id>` documented | none | Docs only. |
| Prism preview conventions | Manifest/nav/auth bypass problems | None in scoped files | Screenshot generator outside S00 decides | none | none | Docs only. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Nova pipeline CLI | `/app/skills/pipeline.js` documented command | Runtime image path | `SKILL.md` | Dry-run and pipeline resume | Path is production compatibility entry; source file is `skills/nova/pipeline.js`. |
| Git CLI | System tool | runtime/operator | `SKILL.md` | Architecture branch setup and commit/push | Operator-owned. |
| Buster screenshot/visual-reg tools | Documented as `.cjs`; current source is `.js` | Runtime image/source drift | `module-files.md`, `prism-conventions.md` | Baseline generation and visual-reg comparison | Stale references tracked as `S00-ISSUE-001`. |
| Prism preview HTML | Static HTML/React/Babel preview | Browser/runtime | `prism-conventions.md` | Baseline source of truth | Needs manifest and auth bypass. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Approval gate wait | Timeout | `timeout_minutes` default 60 documented | `on_timeout` block/continue documented | Runner outside S00 | None. |
| Review/Buster gate fix cycles | Max cycles | `max_fix_cycles` default 3 documented | Escalation outside S00 | Runner outside S00 | None. |
| ACP monitor transcript extensions | Extension cap | Docs say 10/60000 ms, source default differs | Drift tracked | C00b source | `S00-ISSUE-002`. |
| Payload rate-limit pauses | Pause budget/backoff | docs max pauses/cooldowns | Runtime outside S00 | B05/C00b source | None. |
| S00 scoped files | Queues/streams | None found in scoped files | None found in scoped files | None found in scoped files | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Reviewer dispatch config | Reviewer object `{label, model, dispatch, agent_id}` | `progress-json.md` authors | Review gate runner | None in scoped files | Review gate docs. |
| Module session runtime config | `session.runtime: 'acp'\|'subagent'` | `progress-json.md` authors | Nova task dispatch | None in scoped files | Module field docs. |
| ACP monitor config | `acp_monitor.max_transcript_extensions`, `transcript_grace_ms` | `progress-json.md` authors | Common/Nova ACP monitor | Defaults drift tracked | `S00-ISSUE-002`. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Visual-reg baseline behavior | B04 source review and visual-reg repo-scoped contracts | Good for source | S00 docs stale on `baseline_dir` and `.cjs` names. |
| ACP monitor defaults | C00b source review/runtime-monitor behavior | Good for source | S00 docs stale on default values. |
| Project setup docs | None found in scoped-adjacent tests | Gap | No docs example validation harness for progress.json snippets. |
| Prism conventions | Screenshot generator source behavior | Partial | No direct markdown lint or link/path test for `.cjs` references. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- `S00-ISSUE-001` — project setup/Prism docs still document legacy visual-reg `baseline_dir` and `.cjs` tool names.
- `S00-ISSUE-002` — progress-json ACP monitor default docs drift from current common monitor defaults.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
