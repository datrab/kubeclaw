# Command and Git plugin configuration inventory

Status: author source inventory; independent review pending. No runtime checks, plugin migration or overall F1/CONFIG acceptance. This adds `kubeclaw.command-runner:command` and `kubeclaw.git-workspace:git` to the [plugin inventory](config-plugin-settings-inventory-20260921.md). Repository presence does not establish selection in a deployed platform.

## Sole authors and authority boundaries

Proposed central owners are `plugin-command-runner.config.json` and `plugin-git-workspace.config.json`. The orchestrator references these provider settings and separately owns activation, selected providers and caller grants. Moving settings must not combine those authorities. Both manifests bind their actual adapter factory and schema, advertise the capabilities below and require no nested capability grants of their own.

Command caller authorization checks exact request executable identity against the caller's `allowedExecutables`, and canonical working directory against caller `allowedWorkingRoots`. Provider configuration then independently restricts executable/cwd. A grant for `catalog:name` is an identity grant, not an automatically expanded filesystem permission. Catalog targets are added to the provider executable set; they are not required to be duplicated in provider `allowedExecutables`. Changing this union into an intersection would alter actual policy.

Git caller grants require `allowedRoots`; create/remove additionally require `allowedWorkspaceRoots`. The provider independently constrains repositories and worktree destinations. Neither grant replaces workspace ownership, approved-source or revision checks when those request bindings are present. Optional request bindings are not claimed universally mandatory by this inventory.

## Complete schema fields

Neither schema defines numeric defaults. Command has six top-level fields (five required); Git has eight (all required). The coverage artifact includes nested array items and catalog key/value constraints.

| Plugin / property | Current default and units/bounds | Actual effect |
| --- | --- | --- |
| Command `allowedExecutables` | Required nonempty unique string array; strings nonempty | Existing paths resolve against cwd, then realpath; require regular file and X_OK. Canonical targets form provider allowlist, augmented by catalog targets. No PATH search or content-digest pin. |
| Command `executableCatalog` | Optional; omission produces empty Map. At most 128 names, each `[A-Za-z0-9][A-Za-z0-9._-]{0,127}`, nonempty string values in schema | `catalog:name` resolves to canonical executable. Catalog target paths use the same cwd/realpath/executable checks. Absence-to-empty is an existing code policy to decide explicitly under D17, not a hidden future author. |
| Command `allowedWorkingRoots` | Required nonempty unique array of nonempty strings | Each root resolves against cwd and realpath to an existing directory; request working directory must be equal to or beneath a canonical provider root. Symlinks are resolved, not categorically rejected. |
| Command `maxOutputBytes` | Required integer ≥1; direct factory requires safe integer, no coercion or upper schema bound | Combined stdout/stderr byte ceiling; exceeding terminates the execution. Separate record-count ceiling below also applies. |
| Command `maxExecutionMs` | Required integer ≥1; direct factory safe integer; no schema timer ceiling | Actual timer deadline, also inherited CPU-millisecond budget on this adapter path. Values above platform timer range must not be described as correctly implemented merely because schema accepts them. |
| Command `terminationGraceMs` | Required integer ≥1; direct factory safe integer; no schema timer ceiling | SIGTERM-to-SIGKILL budget and shutdown process-group cleanup. Normal adapter is unsandboxed; sandbox-only minimum differs below. |
| Git `allowedRepositoryRoots` | Required nonempty unique array of nonempty strings | Runtime requires existing absolute normalized real directories with no symlink alias. Requests must match authorized roots/subtrees. Schema alone does not enforce these path conditions. |
| Git `workspaceRoot` | Required nonempty string | Runtime requires absolute normalized path; recursively creates it during activation, then requires canonical real directory. Worktree destination must be strictly beneath this root; parent directories are checked/created. |
| Git `gitExecutable` | Required nonempty string | Absolute normalized canonical regular file, no symlink alias. No explicit X_OK check in decoder and no executable content digest; spawn supplies actual execution failure. |
| Git `authorName` | Required 1–320 characters, no CR/LF/NUL | Explicit `git -c user.name=...` for each command, no ambient Git identity default. |
| Git `authorEmail` | Required 1–320 characters, no CR/LF/NUL | Explicit `git -c user.email=...`; this is an identity string, not an email-format validator or credential. |
| Git `maxExecutionMs` | Required integer 1–3600000 ms | Timer per individual Git child, not a cumulative multi-command operation deadline. Factory only checks positive safe integer, so direct calls bypass the schema upper bound. |
| Git `maxOutputBytes` | Required integer 1–16777216 bytes | Combined stdout/stderr per Git child. Direct factory checks positive safe integer but not schema maximum. |
| Git `terminationGraceMs` | Required integer 1–60000 ms | SIGTERM-to-SIGKILL timer, including shutdown of active children. Factory upper-bound discrepancy as above. |

Provider roots are not generic platform-relative paths. Command resolves relative paths using process cwd; Git rejects relative roots/executable outright. Migrating to component files must preserve these distinct meanings rather than silently resolve all paths relative to the new JSON file.

## Additional code policy and shared-runner boundary

The public CommandRunner is also consumed by Buster's `direct-command-runtime.ts`; it is not solely this plugin's internal class. Its explicit sandbox inputs and policies must retain their separate Buster/engine author. A Command plugin migration cannot assign all shared runner settings to this plugin file.

| Existing code rule | Effective scope and classification |
| --- | --- |
| Command maximumProcesses 1024, memoryBytes 1073741824, cpuMillis=maxExecutionMs | Hidden resource-policy defaults in `executionLimits`; this actual adapter supplies only its three numeric schema settings, so these defaults are used. Enforcement is sampled here, not a claimed kernel isolation guarantee. |
| openFiles 256 | Default runner option, but only translated to sandbox arguments; the unsandboxed plugin path does not enforce this through an rlimit. |
| Request limit omitted **or invalid** | `positive` substitutes the runner option, then Math.min caps it. Adapter does not forward request limits; this matters for other direct runner callers. Do not present invalid override rejection as existing behavior. |
| 4096 Command output records; 25 ms sampling | Additional observable capacity/timing policies, absent from schema. Adjacent same-stream chunks coalesce; combined byte cap remains independent. |
| Sandbox grace floor 250 ms; open-files floor 8; CPU ceil to ≥1 second | Sandbox-only argument/termination behavior, not active through the current common Command adapter. Buster explicitly supplies sandboxOpenFiles = 1024 and other resource options. |
| Cgroup pids budget +1; memory.swap.max = 0 when available; CPU period 100000 µs and quota floor 1000 µs | Sandbox/kernel translation rules, distinct from user units. Cgroup path has real delegation side effects; no such operations were executed for this inventory. |
| Process-group poll ≤10 ms; cleanup acknowledgment +1000 ms; identity scan 250 ms | Existing shared cleanup/time budgets outside schemas. Sampled `/proc` CPU conversion assumes 100 ticks/s; unit conversion/implementation assumption, not an authored capacity setting. |
| Command environment `{}`; request.environment rejected | No inherited environment or secret injection by adapter. `shell:false`; direct executable invocation. Empty environment does not itself prove arbitrary child code cannot access files or secrets. |
| Git remote `origin` when request.remote absent | Request-level fallback for fetch/push, outside plugin schema. Migration needs an explicit classification/author decision; do not silently remove or centralize request semantics. |
| Git hooks `/dev/null`; commit.gpgSign=false; environment `{}` | Explicit execution/trust policy, not operator-configured secret references. Git repository/system configuration is not proven disabled merely by empty environment. |
| Git error stderr slice 4096 characters; owner record read limit 32768 bytes | Additional diagnostic/storage bounds absent from schema; owner file has mode 0600 and directory mode 0700, canonical/NOFOLLOW checks and fsync publication. |
| Git tokens 512, refs 1024, commit messages 4096, scoped path 4096 characters | Request validation bounds, not missing plugin config fields. Tokens/paths reject dangerous syntax; paths reject symlink traversal and escaping segments. |

There is no numeric fallback in the Git adapter itself. Its activation currently creates workspaceRoot before validating all later fields. Any future promise that invalid complete configuration has no filesystem side effects requires changing that ordering and a real regression test, not merely adding a new config loader.

## Digests, executable identity and secrets

Both plugin manifests are discovered with package provenance and pinned package-content digests. That is not a digest pin for an arbitrary configured executable. Command canonicalization/ready checks verify path/type/access; Git canonicalization verifies path/type. Neither adapter hashes executable bytes.

Git approved-source operations conditionally verify commit identity, architecture revision, dirty state and approved file mode/content digest/byte size; commits and merges check parent/transition constraints. Runtime-workspace references bind owner attempt and original source revision, with a durable owner record under workspaceRoot. These evidence digests are protocol authority, not editable plugin defaults. Preserve their semantics and immutable histories.

Neither schema contains a secret value or secret reference. Author identity is public attribution. Empty child environment prevents inherited environment injection on these paths but does not establish that Git cannot read repository-configured credentials or helper settings. This inventory does not add a secret-loading route or claim remote Git operations work without separately provisioned credentials.

## Required migration evidence and remaining scope

Before edits, decide the Command resource defaults, optional catalogue semantics, Git request remote default, timing/output/owner-record budgets and genuine protocol constants explicitly. Do not automatically promote every numeric literal into operator configuration or omit genuine capacity policy because it lies below a factory.

Use actual two-profile consumers for output, execution/grace and root/executable policy; negative tests must cover missing/invalid values, direct-factory coercion/bounds, catalogue plus caller-grant intersection, cwd versus absolute-path behavior, child environment, and malformed configuration before mkdir. Preserve original package scripts and all assertions: Command package-boundary/live-function/process-group/process-group-exit and Git package-boundary/live-function/sync-disposition. Real process-group/kernel claims need their actual environment; no tests ran here.

Retain original RunSnapshots/package provenance and current strict recovery configuration equality. New config must not reinterpret old omitted values from today's files, rewrite journals or bypass approved-source/workspace identity. This inventory is complete for the named schemas and inspected execution closure, not all plugins, external installations, credential stores or overall F1.

The [schema coverage](../../evidence/config-command-git-plugin-inventory-20260921/schema-coverage.json)
records all 14 top-level fields with their complete nested schema constraints.
The [source manifest](../../evidence/config-command-git-plugin-inventory-20260921/source-identities.json)
and retained copies bind the named implementation checkpoint. This is source
coverage, not evidence that any configured executable or deployed caller was run.
