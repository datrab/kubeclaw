# Batch P22 — Nova prompts

Status: completed
Date started: 2026-05-08
Date completed: 2026-05-08
Reviewer: Nova

## Scope

```text
skills/nova/pipeline/prompts/*.js
```

Scope expansion verified live: 7 files, under the 10-file maximum. All scoped files were read end to end. Live paths are under `kubeclaw-main/` in this checkout.

## Sources checked

Implementation files:

```text
kubeclaw-main/skills/nova/pipeline/prompts/buster-gate.js
kubeclaw-main/skills/nova/pipeline/prompts/buster-instructions.js
kubeclaw-main/skills/nova/pipeline/prompts/buster-module.js
kubeclaw-main/skills/nova/pipeline/prompts/forge.js
kubeclaw-main/skills/nova/pipeline/prompts/gate-fix.js
kubeclaw-main/skills/nova/pipeline/prompts/review.js
kubeclaw-main/skills/nova/pipeline/prompts/shared.js
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/behavior/areas/lifecycle-state-surface.mjs
kubeclaw-main/tests/verification/behavior/areas/module-failures.mjs
kubeclaw-main/tests/verification/behavior/areas/gates.mjs
kubeclaw-main/tests/verification/behavior/areas/fix-cycles.mjs
kubeclaw-main/tests/verification/contracts/check-critical-dynamic-imports.mjs
```

## Per-file map

### `skills/nova/pipeline/prompts/buster-gate.js`

Role: Buster gate instruction reader and gate test prompt builder.

Imports/dependencies: Node `fs`/`path`, path helpers, shared prompt builders.

Exports/public surface: `readGateInstructions`, `buildBusterGatePrompt`.

Defines: Gate context block, git sync/tool/workspace sections, inline gate instructions section, and gate completion protocol assembly.

Important variables/state: Pure prompt assembly; no module state.

Calls out to: `swarmRoot`, `relPath`, `projectSrcPath`, `makePromptResult`, shared section builders, filesystem instruction read.

Called by / expected callers: Buster gate runner/task builders.

Environment variables / CLI inputs / config fields: Reads `config.project`, `config.repo_root`, `config.paths.swarm_dir`, gate `title`, `instructions_file`, `output_file`, commit hash, attempt, completion identity.

Paths built/read/written: Reads gate instructions at `.swarm/<gate.instructions_file>`; computes gate test workspace `.swarm/<gateDir>/tests/attempt-<n>` and output file path via shared completion protocol. No writes.

Authority behavior: Owns Buster gate test prompt text only; result artifact authority is held by gate runner/completion reader.

Error/retry/terminal behavior: Missing gate instructions throw. Prompt builder otherwise returns prompt result.

Verification coverage: Gates behavior through stubs; no direct absolute path regression.

Findings: None.

### `skills/nova/pipeline/prompts/buster-instructions.js`

Role: Module `BUSTER.md` reader.

Imports/dependencies: Node `fs`/`path`, module path helper.

Exports/public surface: `readBusterInstructions`.

Defines: Direct module `BUSTER.md` file existence/read.

Important variables/state: None.

Calls out to: `modulePath`, filesystem read.

Called by / expected callers: `buildBusterModulePrompt`.

Environment variables / CLI inputs / config fields: Reads module dir and config paths via helper.

Paths built/read/written: Reads `<modulePath>/BUSTER.md`. No writes.

Authority behavior: Only reads test instructions.

Error/retry/terminal behavior: Throws if `BUSTER.md` missing.

Verification coverage: Lifecycle-state prompt surface and module-failures prompt-error paths.

Findings: None.

### `skills/nova/pipeline/prompts/buster-module.js`

Role: Module Buster prompt builder.

Imports/dependencies: Node `path`, path helpers, shared prompt builders, `readBusterInstructions`.

Exports/public surface: `buildBusterModulePrompt`.

Defines: Module test context block, changed-files block, shared git/tool/workspace sections, inline BUSTER instructions, typed Buster result completion protocol.

Important variables/state: Pure prompt assembly; no module state.

Calls out to: `readBusterInstructions`, path helpers, shared prompt helpers.

Called by / expected callers: Module runner Buster dispatch.

Environment variables / CLI inputs / config fields: Reads config/project/repo paths, module id/config/title, module status `fail_count`, `forge_commit_hash`, `forge_diff_stat`, max fails, completion identity.

Paths built/read/written: Reads `BUSTER.md`; references module `status.json`, `buster-result.json`, and tests workspace `<module>/tests/attempt-<n>`. No writes.

Authority behavior: Tells Buster not to mutate status and to write typed result artifact; pipeline owns lifecycle transition.

Error/retry/terminal behavior: Missing BUSTER instructions returns `{error}` instead of throwing. No retry.

Verification coverage: Lifecycle-state prompt surface and module-failures behavior.

Findings: None.

### `skills/nova/pipeline/prompts/forge.js`

Role: Forge module implementation instruction reader and prompt builder.

Imports/dependencies: Node `fs`/`path`, path helpers, logger, shared Forge completion helpers.

Exports/public surface: `readForgeInstructions`, `buildForgePrompt`.

Defines: Single/substep `FORGE.md` reading, module context block, retry anti-pattern block, Nova directive block, disabled memory block, priority header, completion artifact and git commit/push final steps.

Important variables/state: Local `memoryBlock`/`recalledMemoryIds` are disabled placeholders; no module state.

Calls out to: `modulePath`, `statusPath`, `projectSrcPath`, `relPath`, `log`, `buildForgeCompletionArtifactCommand`, `forgeCompletionArtifactPath`, `makePromptResult`.

Called by / expected callers: Module runner Forge attempt.

Environment variables / CLI inputs / config fields: Reads `config.agents.forge.cwd`, project/repo paths, module `substeps`/stages/title, status `status`, `fail_count`, `fail_summaries`, `forge_commit_hash`, optional Nova prompt.

Paths built/read/written: Reads `FORGE.md` or substep `<substep>/FORGE.md`; references module `status.json`, backend package path if present, `forge-completion.json`. No writes by builder.

Authority behavior: Prompt says Nova directive overrides anti-patterns/Forge instructions and tells Forge not to mutate lifecycle `status.json`; pipeline owns READY_FOR_TESTING transition after artifact/git verification.

Error/retry/terminal behavior: Missing FORGE instructions returns `{error}`. Nova prompt injection logs INFO. No retry.

Verification coverage: Lifecycle-state prompt surface, module-failures, many-module soak stubs.

Findings: `P22-ISSUE-001` — prompt tells Forge to run broad `git add -A`.

### `skills/nova/pipeline/prompts/gate-fix.js`

Role: Forge gate-fix prompt builder for Buster gate remediation.

Imports/dependencies: Path helpers and shared prompt result helper.

Exports/public surface: `buildGateFixPrompt`.

Defines: Gate fix context, previous fix attempt anti-patterns, issue list rendering, final commit/push instructions.

Important variables/state: Pure prompt assembly; no module state.

Calls out to: `relPath`, `projectSrcPath`, `swarmRoot`, `makePromptResult`.

Called by / expected callers: Buster gate fix cycle.

Environment variables / CLI inputs / config fields: Reads config project/repo paths, gate title/id, issue fields, attempt/max attempts/fix history.

Paths built/read/written: References project source and swarm working directory; no direct reads/writes.

Authority behavior: Prompt text only; gate engine owns remediation control result and fix loop.

Error/retry/terminal behavior: No local errors; malformed issue/fix history shapes may surface as runtime errors from property access.

Verification coverage: Fix-cycles and gates behavior through stubs.

Findings: `P22-ISSUE-001` — prompt tells fix agent to run broad `git add -A`.

### `skills/nova/pipeline/prompts/review.js`

Role: Echo reviewer prompt builder and review-fix prompt builder.

Imports/dependencies: Path helpers and shared prompt result helper.

Exports/public surface: `buildReviewFixPrompt`, `buildReviewerPrompt`.

Defines: Review fix context/anti-patterns/issues/final git instructions and reviewer JSON output prompt with lint block and review rules.

Important variables/state: Pure prompt assembly; no module state.

Calls out to: `relPath`, `projectSrcPath`, `swarmRoot`, `makePromptResult`.

Called by / expected callers: Review gate task and review gate fix cycle.

Environment variables / CLI inputs / config fields: Reads config project/repo paths, gate title, reviewer label/model, instructions, lint block, output path, issue/fix history fields.

Paths built/read/written: Reviewer prompt instructs writing review JSON to caller-provided relative output. Fix prompt references project source/swarms paths. No direct reads/writes.

Authority behavior: Owns reviewer output JSON contract in prompt; review gate parser/runner owns result validation and lifecycle.

Error/retry/terminal behavior: No local catch; malformed issue/fix history/reviewer inputs may throw from property access or render undefined strings.

Verification coverage: Gates behavior through stubs.

Findings: `P22-ISSUE-001` — review-fix prompt tells fix agent to run broad `git add -A`.

### `skills/nova/pipeline/prompts/shared.js`

Role: Shared prompt result shape, common Buster sections, artifact path builders, and Forge/Buster completion command/protocol builders.

Imports/dependencies: Node `path`, path helpers.

Exports/public surface: `makePromptResult`, `buildGitSyncSection`, `buildAvailableToolsSection`, `buildTestWorkspaceSection`, `forgeCompletionArtifactPath`, `busterResultArtifactPath`, `buildForgeCompletionArtifactCommand`, `buildBusterResultArtifactCommand`, `buildBusterCompletionProtocol`, `buildBusterGateCompletionProtocol`.

Defines: Prompt result object with `toString` compatibility, git sync/tool/workspace sections, shell-quoted artifact env vars, Node snippets to write typed completion/result artifacts, module/gate Buster completion instructions.

Important variables/state: No module state.

Calls out to: `relPath`, `statusPath`, `modulePath`, `swarmRoot`, `projectSrcPath`.

Called by / expected callers: Forge/Buster/gate prompt builders and lifecycle-state tests.

Environment variables / CLI inputs / config fields: Reads config paths and module/gate dirs via helpers; completion identity parameters are accepted by protocol functions but not rendered.

Paths built/read/written: References `<module>/forge-completion.json`, `<module>/buster-result.json`, gate output file, Buster test workspace paths. Builders do not write; generated shell snippets do.

Authority behavior: Owns typed completion/result artifact prompt contract. Pipeline owns interpreting artifacts and lifecycle transitions.

Error/retry/terminal behavior: `shellQuote` escapes single quotes in artifact paths. Generated Node snippets throw if required env/status invalid. No local catch.

Verification coverage: Lifecycle-state prompt surface checks completion commands and absence of status mutation instructions.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `buster-module.js` | `buster-instructions.js` | `readBusterInstructions` | Module BUSTER.md read. |
| Prompt builders | `shared.js` | `makePromptResult` | Standard prompt result shape and metadata. |
| Forge/Buster prompt builders | Path helpers | `modulePath`, `statusPath`, `projectSrcPath`, `swarmRoot`, `relPath` | Prompt path context. |
| `forge.js` | `shared.js` | Forge completion artifact helpers | Completion artifact contract in prompt. |
| `buster-module.js` / `buster-gate.js` | `shared.js` | Buster sections and completion protocols | Result artifact/output instructions. |
| Gate/review fix prompts | `shared.js` | `makePromptResult` | Prompt metadata for fix phases. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `readForgeInstructions` | Module has `substeps` | Module config | Read root `FORGE.md` or concatenate existing substep FORGE files | Determines base implementation instructions. |
| `buildForgePrompt` | Retry with fail summaries | `status.status`, `fail_summaries` | Adds anti-pattern block | Prevents repeated failed approaches. |
| `buildForgePrompt` | Nova prompt present | `novaPrompt` | Adds highest-priority directive and priority header | Nova overrides lower-priority guidance. |
| `buildBusterModulePrompt` | Missing BUSTER instructions | `readBusterInstructions` error | Returns `{error}` | Module runner can fail/handle prompt setup without throwing. |
| `buildBusterModulePrompt` | Forge diff stat present | `status.forge_diff_stat` | Adds changed-files block | Gives Buster scoped test context. |
| `buildAvailableToolsSection` | Static section | None | Tool restrictions and no Redis completion | Keeps Buster completion artifact-driven. |
| `buildReviewFixPrompt` / `buildGateFixPrompt` | Fix history present | `fixHistory.length` | Adds previous-attempt anti-patterns | Guides remediation away from repeated fixes. |
| `buildReviewerPrompt` | Static reviewer contract | Reviewer/instructions/lint output | Strict JSON output instructions | Review gate parser expectations. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `makePromptResult` | Returned prompt result object | Prompt and metadata | Default metadata merged before overrides; adds `toString` shim | Builders can return object or string-compatible result. |
| `readForgeInstructions` | Returned instruction string | Root or substep FORGE files | Substep content joined in configured order with `---` separators; missing individual substeps skipped | At least one FORGE required. |
| `buildForgePrompt` | Prompt string | Context, priority, Nova, base, anti-patterns, memory placeholder, completion | Fixed order: context + priority/Nova + FORGE + anti-patterns + memory + completion | Completion protocol is last. |
| `buildBusterResultArtifactCommand` / Forge command | Generated shell/Node snippet | Artifact path/env placeholders | Env vars exported then Node writes JSON with defaults | Typed artifact shape. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| `readForgeInstructions` | Iterates `moduleConfig.substeps` | None | None | Finishes after all substeps; throws if none found. |
| Fix prompt builders | Iterates `fixHistory` and issues | None | None | Finishes after rendered entries. |
| `buildReviewerPrompt` / shared sections | None found in scoped files | N/A | N/A | Pure string assembly. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `config.project`, `config.repo_root` | Config fields | All prompt builders | Required by callers | Prompt context. |
| `config.paths.swarm_dir`, `paths.modules_dir`, project source paths | Config paths | Path helpers used by prompts | Config-derived | Prompt path references and instruction reads. |
| `config.agents.forge.cwd` | Config field | `buildForgePrompt` | `config.repo_root` | Forge working directory display. |
| Module config `substeps`, `stages`, `title` | Progress/module config | Forge/Buster prompts | `stages` default `forge,buster` in prompt | Instruction selection and context. |
| Module status `status`, `fail_count`, `fail_summaries`, `forge_commit_hash`, `forge_diff_stat` | Runtime status | Forge/Buster prompts | Caller supplied | Attempts, anti-patterns, commit/diff context. |
| Gate config `instructions_file`, `output_file`, `title` | Gate config | Buster gate prompt | Required by gate | Instruction read/output path. |
| Reviewer config `label`, `model` | Gate reviewer input | `buildReviewerPrompt` | Caller supplied | Reviewer identity in prompt. |
| Issues/fix history arrays | Gate/review fix input | Fix prompt builders | Caller supplied | Remediation prompt content. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| `<module>/FORGE.md` and `<module>/<substep>/FORGE.md` | `readForgeInstructions` | Forge prompt builder | None in scoped files | Base Forge instructions. |
| `<module>/BUSTER.md` | `readBusterInstructions` | Buster module prompt builder | None in scoped files | Base Buster test instructions. |
| `.swarm/<gate.instructions_file>` | `readGateInstructions` | Buster gate prompt builder | None in scoped files | Gate instructions. |
| `<module>/forge-completion.json` | `forgeCompletionArtifactPath` | Prompt and pipeline completion reader | Generated shell snippet/Forge agent | Typed Forge completion artifact. |
| `<module>/buster-result.json` | `busterResultArtifactPath` | Prompt and Buster completion reader | Generated shell snippet/Buster agent | Typed Buster result artifact. |
| `<module>/tests/attempt-<n>` | Buster module prompt | Buster agent | Buster agent | Test workspace. |
| `.swarm/<gateDir>/tests/attempt-<n>` | Buster gate prompt | Buster agent | Buster agent | Gate test workspace. |
| Reviewer JSON output path | `buildReviewerPrompt` caller input `relOutput` | Reviewer agent/gate parser | Reviewer agent | Review output contract. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Prompt result shape | `makePromptResult` | Module/gate runners | None. |
| Forge completion prompt contract | `shared.js` / `forge.js` | Forge agent and module runner | P22 issue: broad git add in prompt. |
| Buster result prompt contract | `shared.js` / Buster prompts | Buster agent and runner | None. |
| Reviewer JSON prompt contract | `buildReviewerPrompt` | Echo/review agent and review gate parser | None. |
| Gate/review fix prompts | `gate-fix.js`, `review.js` | Forge fix agents | P22 issue: broad git add in prompts. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Prompt result | `makePromptResult` | `{prompt:string, metadata:{phase,moduleId,attempt,recalledMemoryIds,...}, toString()}` | Builder only | Runners and tests. |
| Forge completion artifact | Generated shell/Node snippet | JSON `{artifact_type:'forge_completion', status:'READY_FOR_TESTING', summary, completed_at}` | Generated snippet validates env path only | Module runner completion reader. |
| Buster module result artifact | Generated shell/Node snippet | JSON `{artifact_type:'buster_module_result', status:'PASS'\|'FAIL', summary, completed_at}` | Generated snippet validates status enum | Buster completion reader. |
| Buster gate output | `buildBusterGateCompletionProtocol` prompt contract | JSON with at minimum `status:'PASS'\|'FAIL'`, `summary`, `findings[]` | Gate runner/parser outside P22 | Buster gate runner. |
| Reviewer output JSON | `buildReviewerPrompt` prompt contract | `{status:'GO'\|'NO-GO', critical_issues[], deferred_issues[], summary}` with issue source/description/affected_files/recommended_fix | Review gate parser outside P22 | Review gate runner. |
| Fix prompt issue input | Fix prompt builders | Issue fields `title`/`description`, optional severity/reproduction/affected files/module/location/recommended_fix | None in scoped files | Forge fix agent prompt. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| Forge module agent | `buildForgePrompt` | Writes `<module>/forge-completion.json` via generated command | Context, optional Nova directive, FORGE.md, retry anti-patterns, disabled memory placeholder, final completion protocol | Shell/git/Node snippet in prompt; no explicit tool schema | Write Forge completion artifact, commit/push changes, do not mutate status lifecycle fields. |
| Buster module agent | `buildBusterModulePrompt` / `buildBusterCompletionProtocol` | Writes `<module>/buster-result.json` via generated command | Context, git sync, tools, test workspace, BUSTER.md, completion protocol | Test tools listed; no Redis completion; generated Node snippet validates PASS/FAIL | Write typed Buster result artifact, then stop. |
| Buster gate agent | `buildBusterGatePrompt` / `buildBusterGateCompletionProtocol` | Gate `output_file` under `.swarm` when configured | Context, git sync, tools, workspace, gate instructions, completion protocol | Test tools listed; no Redis completion | Write JSON result with status, summary, findings, then stop. |
| Echo reviewer | `buildReviewerPrompt` | Caller-provided review JSON path | Gate context, review instructions, lint block, strict rules | No tool schema; writes file | Valid JSON with GO/NO-GO, critical/deferred issues, summary. |
| Forge gate/review fix agent | `buildGateFixPrompt`, `buildReviewFixPrompt` | None specific besides git commit/push | Context, prior failed fix attempts, issue list | Shell/git commands in prompt | Fix all issues and commit/push changes. |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `readForgeInstructions` | Missing root FORGE or no substep FORGE files | No | None | Throws; `buildForgePrompt` converts to `{error}` | None. |
| `readBusterInstructions` | Missing BUSTER.md | No | None | Throws; `buildBusterModulePrompt` converts to `{error}` | None. |
| `readGateInstructions` | Missing gate instructions file | No | None | Throws to caller | None. |
| Prompt builders | Malformed issue/fix/reviewer/gate input | No | None | May render `undefined` or throw from property access | None. |
| Generated Forge completion command | Missing completion path env | No | None | Node snippet throws in agent shell | None. |
| Generated Buster result command | Missing result path or invalid status | No | None | Node snippet throws in agent shell | None. |
| Agent final git commands in prompts | Broad staging/commit risk | No | Agent/operator execution | Agent may commit unrelated changes | None. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `buildForgePrompt` | Missing FORGE instructions | Yes via returned error only | Caller result | `{error}` prompt result | `buildForgePrompt` | Caller owns telemetry/status. |
| `buildBusterModulePrompt` | Missing BUSTER instructions | Yes via returned error only | Caller result | `{error}` prompt result | `buildBusterModulePrompt` | Caller owns telemetry/status. |
| `readGateInstructions` | Missing gate instructions | None locally | Thrown error | none | N/A | Caller/gate runner owns telemetry. |
| Prompt builders | Malformed inputs | None locally | Thrown error or prompt text | none | N/A | Caller owns diagnostics. |
| Generated Forge completion command | Agent shell validation failure | None locally | Agent transcript/log only | Node snippet error | Generated prompt command | Pipeline later sees missing artifact/session failure. |
| Generated Buster result command | Agent shell validation failure | None locally | Agent transcript/log only | Node snippet error | Generated prompt command | Pipeline later sees missing artifact/session failure. |
| Agent final git commands | Broad staging/commit risk | None locally | Git history if executed | Commit from agent | Prompt text | P22-ISSUE-001 tracks operator risk. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Node.js runtime | `node` binary | Observed `v24.14.0` during review | Prompt builders and generated snippets | ESM, fs/path, generated artifact writers | No package pin in scoped files. |
| Git CLI | Agent runtime shell | System git | Forge/fix prompt final steps | Commit/push agent changes | P22 issue: prompts use broad `git add -A`. |
| Buster testing tools | Prompt-listed tools (`npx playwright`, `k6`, `curl`, visual audit) | Environment-provided | Buster agents | Test execution | Prompt says env vars pre-set and app already served; not validated in scoped files. |
| Filesystem/module docs | Repo/.swarm files | Internal | Prompt builders | FORGE/BUSTER/gate instruction reads and artifact paths | Missing files throw or return prompt errors. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Prompt construction | Synchronous file reads and string assembly | No explicit cap | Large FORGE/BUSTER/gate instructions are included inline | Prompt artifact/caller output | None. |
| Reviewer prompt lint findings | Caller-provided lint block | P21 formatter caps findings | Prompt size depends on caller block | Prompt text | None. |
| Generated agent artifacts | One completion/result file per module/gate attempt path | Attempt-specific test workspace; artifact path fixed per module result | Last write wins if agent reruns same artifact path | Pipeline artifact reader | None in scoped files. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Prompt result metadata | `{phase, stageId?, workerType?, moduleId, attempt, recalledMemoryIds?}` | Prompt builders | Agent dispatch/runners | Synchronous; no ACP streaming in scoped files | Prompt result object. |
| Forge completion artifact | JSON file written by agent shell | Forge prompt generated command | Nova module runner | No Redis completion; file-based detection by caller | `<module>/forge-completion.json`. |
| Buster result artifact | JSON file written by agent shell | Buster prompt generated command | Nova/Buster completion reader | No Redis completion; file-based detection by caller | `<module>/buster-result.json`. |
| Gate/reviewer output files | Prompt instructions | Buster/Echo agents | Gate runners/parsers | File-based completion by caller | Gate output/review JSON paths. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| Forge/Buster prompt lifecycle instructions avoid status mutation and use artifacts | `lifecycle-state-surface.mjs` | Good | Does not cover broad git add risk. |
| Prompt error results for missing module prompts | `module-failures.mjs` | Good indirect | Gate instruction missing path not directly covered. |
| Gate/review prompt integration | `gates.mjs`, `fix-cycles.mjs` | Mostly stubbed | Prompt content not deeply asserted. |
| Buster Redis completion no broad fallback add | `check-critical-dynamic-imports.mjs` | Narrow | Does not cover prompt text broad `git add -A`. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- `P22-ISSUE-001` — Forge and fix prompts instruct agents to run broad `git add -A`.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
