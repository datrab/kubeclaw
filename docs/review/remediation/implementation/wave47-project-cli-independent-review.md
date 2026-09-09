# Independent T01-F01 setup and execution-entry review

Reviewed original requirement: `register.json` → `T01-F01.source_finding_text` at
`cff3fff`; original finding describes an unusable setup path, rejected CLI flags,
and mismatched scaffold/compiler inputs. It specifically calls for real fresh
project files, documented commands, and separate compile/execution evidence.
It does not demand completion of the product lifecycle assigned to T01-F02.

## Findings and disposition

The original e834426 execution probe reproduced successfully against Product
tree `867b5538ce4969c135c72decbe213914e92defb2`. Its execution-entry assertions are
valid: the original 13-stage graph is preserved in the durable snapshot; actual
source-preflight and blueprint-sync attempts pass with artifact references; the
first module creates its real Git workspace and reaches dispatch secret resolution.
It then blocks with the exact `SECRET_UNAVAILABLE:worker` boundary. This is real
entry into execution, not successful implementation or delivery.

Review found a remaining original-scope documentation defect: the setup checklist
still required unsupported `--dry-run`. The actual current CLI rejects that flag
with `PROJECT_ARGUMENT_INVALID:--dry-run`. The setup guide also did not present
the now-implemented explicit import command, and its public overview reference
pointed to a nonexistent file. This review fixes these documentation defects;
no production implementation or parser allowance changes. Root must independently
review this documentation change before integrating and changing finding status.

## Genuine command chain

A second additive probe keeps every original compiler and importer assertion.
Before the original fixture commits its fresh two-module Git repository, it runs
the actual npm scaffold command, explicitly authors generated description/notes,
execution order and the app→library dependency, then runs `--apply` and `--check`.
The generated version-1 progress and pipeline files are committed as real inputs.
The real import CLI combines that exact generated progress with explicitly authored
v2 requirements/coverage/agents/policy, writing a new project file. The original
CLI separately compiles the imported file and executes that same imported file.
No original stage, edge, implementation adapter or assertion is removed or mocked.
The `--repo` and `--swarm` options locate the isolated fixture; normal project-layout
discovery is independently covered by the original scaffold suite.

The imported graph must equal all 13 stages of the original compiled graph.
Source-preflight and blueprint-sync must succeed, the first module must have
an actual completed attempt and Git workspace, and the exact missing-secret
diagnostic must occur. The final test must remain pending and CLI must exit 1.
No external model/HTTP response or native provider is substituted.

Commands verified:

| Command surface | Evidence/result |
| --- | --- |
| `npm run progress:scaffold -- --project …` | Real generated scaffold |
| Same with `--apply` | Real progress/pipeline publication |
| Same with `--check` | Original validator passes |
| `npm run progress:scaffold:typecheck` | TypeScript exits 0 |
| `pipeline.ts --import-legacy … --authoring … --platform … --output …` | Generated scaffold imported, authoring-only |
| `pipeline.ts --project … --platform … --compile …` | New graph matches original 13 stages |
| `pipeline.ts --project … --platform …` | Actual source/sync passed and first module entered; external execution remains blocked |
| Obsolete `--dry-run` | Actual parser rejection preserved as evidence; obsolete instruction removed |

Git initialization/add/commit execute locally in the fixture. The setup guide’s
ordinary remote `git push` command is not executed: publishing a project or
starting remote CI is outside this review authorization. No claim of live remote
Git/provider acceptance is inferred from command-surface validation.

## Evidence and reproducibility

- `docs/review/evidence/wave47-project-cli-execution-independent.txt`: original probe rerun.
- `docs/review/evidence/wave47-project-scaffold-cli-probe.mjs`: additive full setup probe.
- `docs/review/evidence/wave47-project-scaffold-cli-independent.txt`: final npm/import/compile/execution raw output.
- `docs/review/evidence/wave47-project-scaffold-cli-first-pass.txt`: earlier direct-Node scaffold chain also passes.
- `docs/review/evidence/wave47-project-scaffold-cli-initial.txt`: retained two harness setup errors (Git initialization ordering and explicit project name), corrected without changing production source or requirements.
- `docs/review/evidence/wave47-project-scaffold-original-tests.txt`: 25 original scaffold tests pass, zero skipped.
- `docs/review/evidence/wave47-project-scaffold-typecheck.txt`: original typecheck passes.

Run from repository root with the actual Node 24 toolchain and dependencies:

```sh
node docs/review/evidence/wave47-project-cli-execution-probe.mjs <product-tree>
node docs/review/evidence/wave47-project-scaffold-cli-probe.mjs .
npm run progress:scaffold:typecheck
node --test tests/skills/nova/project_setup/progress-scaffold.test.mjs
```

The probes temporarily add an adjacent fixture copy solely for additive assertions
and remove it afterward. Original source files are unchanged.
No mock executor, test shim, deployment, CI or third-party message was used.

## Closure recommendation

T01-F01 can close after root verifies this documentation correction and accepts
the attached actual setup/import/compile/entry evidence. The precise original
failure (operators cannot reach the first module through the documented setup
path) is reproduced as fixed, including the generated scaffold path. T01-F02
stays open: no successful agent implementation, native suite, demo readiness or
authenticated human acceptance is proved here. This report changes no register.

The later SDK identity/recovery cutover is outside this tested source and must
retain these consumer checks before integration.

Current independently exercised source (`cff3fff`, plus documentation/evidence only):

| File | SHA-256 |
| --- | --- |
| `skills/nova/project/cli.ts` | `0415a84628567152cb8f067edc38881459ebb66e8c03c73b8426ac42989e1de0` |
| `skills/nova/project/compiler.ts` | `6dfd903c5802f53d69d93aed8366ef1e774a05d8af72987df9170dd4b177f54d` |
| `skills/nova/project/source.ts` | `c6817af987740b406d5226b124ac3b7611a5c36128d2198ca3dd03c49a079762` |
| `skills/nova/project/legacy-import.ts` | `33f224dec078bf4e306ff31deef7ab263650202e7802267ccb1065326e402623` |
| `skills/nova/project_setup/tools/progress-scaffold.ts` | `ccb59cfb186e4d0917290f8f75a61644da2fdfb0e03694ece51995cb70ee3a2f` |
| `tests/verification/contracts/check-project-compiler.mts` | `f43245243462e6e02e4c07c368883ac114796a0a8c8d0bcf4f32846d82b1d739` |
