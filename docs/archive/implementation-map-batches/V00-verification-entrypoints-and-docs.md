# Batch V00 — Verification entrypoints and documentation surface

Status: completed
Date started: 2026-05-09
Date completed: 2026-05-09
Reviewer: Nova

## Scope

```text
tests/verification/README.md
tests/verification/behavior-verification.md
tests/verification/packaging-verification.md
tests/verification/run-fast-verification.sh
tests/verification/run-full-verification.sh
tests/verification/run-local-acp-verification.sh
```

Scope expansion verified live: 6 files, under the 10-file maximum. All scoped files were read end to end.

## Sources checked

Implementation files:

```text
kubeclaw-main/tests/verification/README.md
kubeclaw-main/tests/verification/behavior-verification.md
kubeclaw-main/tests/verification/packaging-verification.md
kubeclaw-main/tests/verification/run-fast-verification.sh
kubeclaw-main/tests/verification/run-full-verification.sh
kubeclaw-main/tests/verification/run-local-acp-verification.sh
```

Adjacent tests/contracts/config/docs:

```text
kubeclaw-main/tests/verification/runtime/check-acp-launch.mjs
```

## Per-file map

### `tests/verification/README.md`

Role: Canonical verification migration/status overview and quick-run guide.

Imports/dependencies: Markdown-only documentation.

Exports/public surface: Documents fast/full/local ACP wrappers, current canonical verifier entrypoints, migration rules, cleanup status, prerequisites, and canonical artifact paths.

Defines: Fast local lane, full fail-fast lane, local ACP lane, migration phases, canonical runtime/contract/behavior/deployment entrypoints, replay/audit bundle layout.

Important variables/state: None.

Calls out to: `./tests/verification/run-fast-verification.sh`, `./tests/verification/run-full-verification.sh`, `./tests/verification/run-local-acp-verification.sh`, canonical node verifier scripts, `scripts/deploy.sh` live commands.

Called by / expected callers: Maintainers running repo verification.

Environment variables / CLI inputs / config fields: Documents `BEHAVIOR_AREAS`, `SKIP_FAST_BEHAVIOR`, `--verbose`, `VERIFICATION_VERBOSE=1`.

Paths built/read/written: Documents `tests/verification/**`, `.swarm/logs/pipeline/latest.json`, run-scoped replay bundle, Redis audit artifacts, `/app/skills/pipeline.js` compatibility path.

Authority behavior: Documentation declares `tests/verification/` canonical verification home and `scripts/` as operator utilities, not verifier implementation home.

Error/retry/terminal behavior: Documents fail-fast full wrapper and local-only ACP semantics; no executable behavior.

Verification coverage: Self-referential; V00 validation runs docs-surface/repo-docs and shell syntax checks.

Findings: None.

### `tests/verification/behavior-verification.md`

Role: Canonical behavior verification explainer, policy, prerequisites, commands, and representative coverage inventory.

Imports/dependencies: Markdown-only documentation.

Exports/public surface: Behavior verification command reference and current gate expectations.

Defines: Source root and contract defaults, prerequisites, canonical commands, repo-truth baseline, full wrapper expectations, coverage areas, canonical telemetry/replay/audit paths.

Important variables/state: None.

Calls out to: Runtime collisions, telemetry contract, behavior harness, deployment truth, subagent launch, local ACP launch, deploy smoke commands.

Called by / expected callers: Maintainers interpreting or rerunning behavior verification.

Environment variables / CLI inputs / config fields: Documents `--source-root`, `--contract`, `--list-areas`, `--areas`.

Paths built/read/written: Documents `<repo-root>/kubeclaw-main`, telemetry contract/schema docs, `.swarm/logs/pipeline/**`, `.swarm/logs/redis/**`.

Authority behavior: Documents live repo as source of truth and telemetry contract/schema authority split.

Error/retry/terminal behavior: Documents wrapper fail-fast behavior, ACP local-only failure interpretation, and python prerequisite handling.

Verification coverage: `docs-surface` and `repo-docs` behavior areas validate docs surfaces.

Findings: None.

### `tests/verification/packaging-verification.md`

Role: Packaging verification explainer for materialized `/app/skills` runtime ownership and import validity.

Imports/dependencies: Markdown-only documentation.

Exports/public surface: Packaging guard policy, covered regressions, reproducible command, latest packaging summary, owner mapping.

Defines: General/sandbox image copy ownership rules, runtime collision guard coverage, resolved packaged runtime owners.

Important variables/state: None.

Calls out to: `tests/verification/runtime/check-runtime-collisions.mjs`.

Called by / expected callers: Maintainers checking packaged runtime ownership.

Environment variables / CLI inputs / config fields: Documents `--source-root`.

Paths built/read/written: Documents `/app/skills`, `/skills-merged`, `skills/common`, `skills/nova`, `skills/buster`, Dockerfiles, Helm deployment template.

Authority behavior: Documents runtime collision guard as authoritative executable check for packaged ownership/import validity.

Error/retry/terminal behavior: Guard fails on collisions, broken imports, entrypoint import failure, or owner drift; no executable logic in doc.

Verification coverage: Runtime collision guard validates the documented packaging surface.

Findings: None.

### `tests/verification/run-fast-verification.sh`

Role: Fast local deterministic verification wrapper without cluster/live-agent dependencies.

Imports/dependencies: Bash, `node`, `python` or `python3`, contract-suite helper, runtime/contract/behavior verifier scripts.

Exports/public surface: Executable shell wrapper.

Defines: Script/root path resolution, telemetry contract path, default behavior area subset, temp python shim cleanup, `run_step` output wrapper.

Important variables/state: `SCRIPT_DIR`, `REPO_DIR`, `CONTRACT_PATH`, `BEHAVIOR_AREAS`, `TEMP_DIR`; temporary PATH mutation when aliasing `python` to `python3`.

Calls out to: Nova/Buster startup smokes, runtime collisions, final-gate hardening, `tests/verification/lib/run-contract-suite.sh`, behavior harness.

Called by / expected callers: Maintainers and CI-like local checks.

Environment variables / CLI inputs / config fields: `BEHAVIOR_AREAS` default `foundations,runtime-surface,redaction-surface,shell-boundary`; `SKIP_FAST_BEHAVIOR=1` skips behavior areas.

Paths built/read/written: Computes repo root from script location; contract path `docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md`; may create/delete temp dir for python shim.

Authority behavior: Owns fast-lane sequencing and default behavior subset.

Error/retry/terminal behavior: `set -euo pipefail`; missing node or python/python3 exits 1; any failed step exits immediately; cleanup trap removes temp dir.

Verification coverage: Direct validation uses `bash -n` and shell execution can be run manually; behavior/docs validation covers wrapper docs.

Findings: None.

### `tests/verification/run-full-verification.sh`

Role: Full fail-fast clean-checkout verification wrapper including deployment truth, runtime smokes, subagent launch, contract suite, and full behavior harness.

Imports/dependencies: Bash, `node`, `helm`, `kubeconform`, `python` or `python3`, runtime/deployment/contract/behavior verifier scripts.

Exports/public surface: Executable shell wrapper.

Defines: Script/root path resolution, telemetry contract path, python shim cleanup, `run_step`, fail-fast ordered verification sequence, local ACP exclusion notice.

Important variables/state: `SCRIPT_DIR`, `REPO_DIR`, `CONTRACT_PATH`, `TEMP_DIR`; temporary PATH mutation for python shim.

Calls out to: Deployment truth, runtime collisions, final-gate hardening, Nova/Buster startup smokes, subagent launch, contract suite, behavior harness.

Called by / expected callers: Maintainers running default full clean-checkout verification.

Environment variables / CLI inputs / config fields: No custom env overrides in wrapper; underlying tools accept their own flags. Requires `helm` and `kubeconform` on PATH.

Paths built/read/written: Computes repo root; contract path; temp dir for python shim.

Authority behavior: Owns default full verification sequencing; intentionally excludes local ACP launch.

Error/retry/terminal behavior: `set -euo pipefail`; missing dependencies exit 1; any failed step exits immediately; cleanup trap removes temp dir.

Verification coverage: Direct validation uses `bash -n`; full run depends on local tools/live subagent readiness.

Findings: None.

### `tests/verification/run-local-acp-verification.sh`

Role: Explicit local ACP/provider launch smoke wrapper.

Imports/dependencies: Bash, `node`, `tests/verification/runtime/check-acp-launch.mjs`.

Exports/public surface: Executable shell wrapper forwarding arguments to ACP launch smoke.

Defines: Script/root path resolution and local-only explanatory log lines.

Important variables/state: `SCRIPT_DIR`, `REPO_DIR`.

Calls out to: `node tests/verification/runtime/check-acp-launch.mjs "$@"`.

Called by / expected callers: Maintainers validating local ACP provider/gateway setup.

Environment variables / CLI inputs / config fields: Forwards all CLI args to `check-acp-launch.mjs`; no custom env reads in wrapper.

Paths built/read/written: Computes repo root; no writes.

Authority behavior: Owns explicit ACP local lane outside default full wrapper.

Error/retry/terminal behavior: `set -euo pipefail`; missing node exits 1; ACP smoke failure exits with node status.

Verification coverage: Wrapper syntax and adjacent `check-acp-launch.mjs` import surface.

Findings: None.

## Cross-file call map

| Caller | Callee | Function/surface | Notes |
| --- | --- | --- | --- |
| `run-fast-verification.sh` | runtime smoke scripts | Nova/Buster startup, runtime collisions, final-gate hardening | Fast deterministic local lane. |
| `run-fast-verification.sh` | `tests/verification/lib/run-contract-suite.sh` | deterministic contract suite | Uses `--source-root`, `--contract`, label prefix. |
| `run-fast-verification.sh` | behavior harness | `verify.mjs --areas "$BEHAVIOR_AREAS"` | Skippable with `SKIP_FAST_BEHAVIOR=1`. |
| `run-full-verification.sh` | deployment/runtime smoke scripts | deployment truth, collisions, final-gate, startup, subagent launch | Full fail-fast lane. |
| `run-full-verification.sh` | contract suite and behavior harness | full deterministic suite + full behavior verify | Uses canonical telemetry contract path. |
| `run-local-acp-verification.sh` | ACP launch smoke | `check-acp-launch.mjs "$@"` | Explicit local/provider lane. |
| V00 docs | V00 wrappers | fast/full/local commands | Docs describe wrapper authority and expectations. |

## Internal logic and algorithm map updates

### Branch / routing conditions

| File/function | Condition | Inputs checked | Route/result | Why it matters |
| --- | --- | --- | --- | --- |
| `run-fast-verification.sh` prerequisite check | `node` missing | PATH | Print error and exit 1 | Required runtime. |
| `run-fast-verification.sh` python check | `python` missing, `python3` present | PATH | Create temp dir symlink `python -> python3`, prepend PATH | Makes representative fixtures work locally. |
| `run-fast-verification.sh` behavior branch | `SKIP_FAST_BEHAVIOR != 1` | Env var | Run selected behavior areas or skip | Fast feedback tunability. |
| `run-full-verification.sh` prerequisite check | `node`, `helm`, `kubeconform`, python missing | PATH | Exit 1 or create python shim | Full lane dependency gate. |
| `run-full-verification.sh` ACP route | Always excludes ACP launch | Static wrapper logic | Prints local-only ACP notice | Keeps default clean-checkout gate independent of local ACP setup. |
| `run-local-acp-verification.sh` | `node` missing | PATH | Print error and exit 1 | Required runtime before ACP smoke. |

### State mutations / merge behavior

| File/function | State/artifact mutated | Inputs | Precedence/merge algorithm | Output/invariant |
| --- | --- | --- | --- | --- |
| `run-fast-verification.sh`, `run-full-verification.sh` | `PATH` and temp dir | `python`/`python3` availability | If `python` absent and `python3` present, temp symlink prepended to PATH | Underlying fixtures can invoke `python`. |
| `run-fast-verification.sh`, `run-full-verification.sh` | Temp dir lifecycle | `TEMP_DIR` | Trap cleanup removes temp dir on exit | No persistent shim artifact. |
| V00 docs | Canonical verification ownership statements | Migration status | Tests live under `tests/verification`; scripts are operator utilities | Documentation points to current verification home. |

### Loops / polling / timeout mechanics

| File/function | Loop condition | Sleep/backoff | Timeout/deadline calculation | Terminal/break conditions |
| --- | --- | --- | --- | --- |
| V00 wrapper scripts | None found in scoped files | None found in scoped files | None found in scoped files | Sequenced fail-fast commands only. |
| V00 docs | Underlying launch/behavior checks | Docs reference underlying tools only | Underlying tools own timeouts | Wrapper docs describe local-only ACP and fail-fast behavior. |

## Environment/config/input map updates

| Name | Type | Read by | Default/source | Notes |
| --- | --- | --- | --- | --- |
| `BEHAVIOR_AREAS` | Env var | `run-fast-verification.sh` | `foundations,runtime-surface,redaction-surface,shell-boundary` | Fast behavior area selection. |
| `SKIP_FAST_BEHAVIOR` | Env var | `run-fast-verification.sh` | `0`/unset means run behavior | Set `1` for contract/runtime-only fast run. |
| `VERIFICATION_VERBOSE`, `--verbose` | Env/CLI docs | `README.md` documents | Off by default | Passing runtime logs are quiet unless enabled. |
| `--source-root` | CLI flag | documented verifier commands/wrappers | `$REPO_DIR` in wrappers | Source root for verifier scripts. |
| `--contract` | CLI flag | contract/behavior docs and wrappers | `docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md` | Canonical telemetry contract path. |
| `--areas`, `--list-areas` | CLI flags | behavior harness docs | all areas unless specified | Behavior harness selection/listing. |
| forwarded ACP args | CLI args | `run-local-acp-verification.sh` | none | Passed directly to `check-acp-launch.mjs`. |

## Path map updates

| Path/artifact | Built by | Read by | Written by | Authority notes |
| --- | --- | --- | --- | --- |
| `$REPO_DIR` | wrappers from script dir | all wrapper steps | none | Resolves to `kubeclaw-main` repo root. |
| `docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md` | wrappers/docs | contract/behavior verifiers | docs authors | Canonical telemetry contract for verification. |
| `tests/verification/lib/run-contract-suite.sh` | wrapper literal | fast/full wrappers | none | Shared deterministic contract-suite helper. |
| `.swarm/logs/pipeline/latest.json` and run bundle | docs | replay/audit consumers | pipeline runtime outside V00 | Canonical replay/audit bundle documented. |
| `.swarm/logs/redis/*.jsonl` | docs | Redis audit consumers | pipeline runtime outside V00 | Canonical Redis audit mirror documented. |
| temp python shim dir | fast/full wrappers | shell PATH | wrappers create/delete | Only used when `python3` exists but `python` does not. |

## Authority map updates

| State/artifact | Authoritative writer | Readers/projections | Open questions |
| --- | --- | --- | --- |
| Fast verification lane | `run-fast-verification.sh` | README and maintainers | None. |
| Full clean-checkout verification lane | `run-full-verification.sh` | README/behavior docs and maintainers | Requires helm/kubeconform/live subagent readiness. |
| Local ACP verification lane | `run-local-acp-verification.sh` | README/behavior docs and maintainers | Local/provider-specific by design. |
| Packaging verification policy | `packaging-verification.md` plus runtime collision guard | Maintainers | None. |
| Behavior verification policy | `behavior-verification.md` plus behavior harness | Maintainers | Static rerun summary can age; doc tells users to trust live JSON for exact counts. |

## Data schema updates

| Artifact/payload/result | Producer | Schema keys/types/required fields | Validator/normalizer | Consumers |
| --- | --- | --- | --- | --- |
| Wrapper step log | V00 shell wrappers | Blank line, `[fast-verification] === <label> ===` or `[full-verification] === <label> ===` before command | `run_step` helper | Maintainers/CI logs. |
| Fast wrapper env contract | `run-fast-verification.sh` | `BEHAVIOR_AREAS` comma list, `SKIP_FAST_BEHAVIOR` string flag | Shell condition only | Behavior harness invocation. |
| Verification command result | underlying node/shell scripts | JSON summaries from verifier scripts; shell exit codes | Underlying verifier implementations | Wrapper fail-fast semantics. |
| Replay/audit bundle docs | README/behavior docs | `pipeline.jsonl`, `discord.jsonl`, `nova-injections.jsonl`, `buster-telemetry-fallback.jsonl`, `redis/redis-exchanges.jsonl`, `redis/redis-ops.jsonl`, `summary.json` | Pipeline runtime outside V00 | Operators/replay/audit. |

## Prompt and agent behavior updates

| Agent/prompt/tool | Builder/source | Generated artifact path | Base instructions / few-shot examples | Allowed tools / tool schema | Required output contract |
| --- | --- | --- | --- | --- | --- |
| V00 scoped files | None found in scoped files | None found in scoped files | None found in scoped files | None found in scoped files | None found in scoped files |

## Error handling and resiliency updates

| File/function | Failure class | Retryable? | Retry/backoff/timeout details | Soft-fail vs terminal behavior | Redaction behavior |
| --- | --- | --- | --- | --- | --- |
| `run-fast-verification.sh` prerequisites | Missing node/python/python3 | No | None | Terminal exit 1 | None. |
| `run-fast-verification.sh` step failure | Any invoked verifier exits nonzero | No | None in wrapper | `set -e` fail-fast terminal | Underlying tools own redaction. |
| `run-fast-verification.sh` python shim cleanup | Temp dir exists | N/A | trap on EXIT | Best-effort `rm -rf` under strict shell | None. |
| `run-full-verification.sh` prerequisites | Missing node/helm/kubeconform/python/python3 | No | None | Terminal exit 1 | None. |
| `run-full-verification.sh` step failure | Any invoked verifier exits nonzero | No | None in wrapper | `set -e` fail-fast terminal | Underlying tools own redaction. |
| `run-local-acp-verification.sh` prerequisites/ACP failure | Missing node or ACP smoke nonzero | No wrapper retry | Underlying ACP smoke owns polling/timeouts | Terminal nonzero | Underlying tool owns redaction. |
| V00 docs | Stale docs or verifier failures | Operator rerun | Docs instruct rerun direct entrypoints for downstream failures | Docs only | None. |

### Mandatory telemetry / observability rows

For every error/resiliency row above, add at least one telemetry row below. If no telemetry exists, write `none` explicitly and carry a finding when that creates operator risk.

| File/function | Failure path | Telemetry happens? | Emitted/recorded where | Event/artifact/log name | Producer function | Notes/gap |
| --- | --- | --- | --- | --- | --- | --- |
| `run-fast-verification.sh` | Missing prerequisites | Partial | stderr | `[fast-verification] missing required command: ...` | shell `echo >&2` | No pipeline telemetry; local wrapper. |
| `run-fast-verification.sh` | Step failure | Partial | stdout/stderr and underlying verifier JSON/logs | step label + underlying output | `run_step` + invoked verifier | Wrapper fail-fast. |
| `run-fast-verification.sh` | Python shim cleanup | None | none | none | none | Cleanup silent. |
| `run-full-verification.sh` | Missing prerequisites | Partial | stderr | `[full-verification] missing required command: ...` | shell `echo >&2` | No pipeline telemetry; local wrapper. |
| `run-full-verification.sh` | Step failure | Partial | stdout/stderr and underlying verifier JSON/logs | step label + underlying output | `run_step` + invoked verifier | Wrapper fail-fast. |
| `run-local-acp-verification.sh` | Missing node / ACP smoke failure | Partial | stderr/stdout and ACP smoke JSON | local ACP explanatory lines + `check-acp-launch` result | wrapper echo + invoked verifier | Local/provider smoke. |
| V00 docs | Docs stale or verifier failure interpretation | None in scoped files | none | none | none | Docs only. |

## Dependency matrix updates

| Dependency/tool | Package/binary/source | Version/major version | Used by | Purpose | Failure/compat notes |
| --- | --- | --- | --- | --- | --- |
| Bash | System shell | bash | V00 wrappers | Wrapper execution with `set -euo pipefail` | Required by shebang. |
| Node.js | System binary | runtime installed | all V00 wrappers | Runs verifier scripts | Missing node exits 1. |
| Python / Python 3 | System binary | runtime installed | fast/full wrappers and behavior fixtures | Representative fixtures invoke `python` | Wrappers create temp `python` shim to `python3` when needed. |
| Helm | System binary | runtime installed | full wrapper | Deployment truth dependencies | Missing helm exits 1. |
| kubeconform | System binary | runtime installed | full wrapper | Kubernetes manifest validation dependencies | Missing kubeconform exits 1. |
| OpenClaw gateway/provider | Local runtime service | local setup | local ACP/subagent launch checks | Launch reachability smoke | ACP is local-only; subagent in full wrapper. |

## Concurrency and backpressure updates

| Surface | Limit/throttle/queue | Config/default | Overload behavior | Telemetry/evidence | Open questions |
| --- | --- | --- | --- | --- | --- |
| Fast/full wrappers | Sequential fail-fast execution | hard-coded order | First failing command stops wrapper | step labels + underlying output | None. |
| Fast behavior selection | Area subset | `BEHAVIOR_AREAS` env | Smaller area set reduces runtime; skip flag omits behavior entirely | wrapper log | None. |
| Full wrapper live launch | Subagent launch included; ACP excluded | hard-coded | Subagent failure fails full wrapper; ACP checked separately | wrapper ACP notice | None. |
| Python shim temp dir | One temp dir per wrapper run when needed | `mktemp -d` | Removed on EXIT trap | shell message when shim created | None. |

## ACP protocol updates

| ACP surface | Record/delta shape | Producer | Consumer | Throttle/flush behavior | Evidence/artifact |
| --- | --- | --- | --- | --- | --- |
| Subagent launch smoke | Underlying `check-subagent-launch.mjs` result JSON | full wrapper invokes runtime check | Maintainers/full verification | Underlying runtime check owns polling | Full wrapper step `subagent launch`. |
| ACP launch smoke | Underlying `check-acp-launch.mjs` result JSON | local ACP wrapper invokes runtime check | Maintainers/local verification | Underlying runtime check owns polling | Local ACP wrapper explanatory output and JSON. |
| V00 docs | ACP/default lane distinction | README/behavior docs | Maintainers | ACP excluded from default full wrapper | Documented local-only ACP semantics. |

## Verification map updates

| Claim/surface | Verification file | Coverage quality | Gap |
| --- | --- | --- | --- |
| V00 wrapper syntax | `bash -n` validation in this batch | Good syntax coverage | Does not execute full wrapper due external dependencies. |
| Verification docs surface | `tests/verification/behavior/verify.mjs --areas docs-surface,repo-docs` | Good docs harness coverage | Static latest rerun summaries can still age. |
| Packaging docs policy | `check-runtime-collisions.mjs` direct/indirect use | Good source guard | V00 validation did not run full packaging guard separately beyond docs/source checks. |
| Local ACP wrapper | Adjacent `check-acp-launch.mjs` read | Surface coverage | Live ACP run is local/provider-specific and not run by default. |

## Findings to carry forward

Actionable issues to add/update in `kubeclaw-main/docs/open-issues.md`:

- None yet.

Future ideas to add/update in `kubeclaw-main/docs/future-implementation-ideas.md`:

- None yet.
