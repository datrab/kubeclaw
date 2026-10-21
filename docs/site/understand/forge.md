# Forge: Bounded Implementation And Git Integration

Status: implemented for the Nova implementation stage
Audience: pipeline operator, Forge maintainer, plugin author, security reviewer
Owner: Forge maintainers
Evidence: skills/nova/plugins/implementation-agent; skills/common/plugins/runtime-dispatch; skills/common/plugins/git-workspace; tests/verification/reliability/forge-workspace.test.mts; tests/verification/reliability/forge-lock-wait.test.mts; skills/nova/plugins/blueprint-sync
Evidence revision: `569f7b4933d4859cc67c80ddf40d5154ffd95ce5`
Applies to: `kubeclaw.implementation-agent` and its OpenClaw runtime-dispatch path; separate `kubeclaw.generate.blueprint-sync` package section; Git workspace adapter `kubeclaw.git-workspace:git`
Last verified: source, schema, manifest, and focused test inspection on 2026-09-20; added package sections source/test checked 2026-10-21 only; original other-scope verification date unchanged; no new live dependency claim

## Purpose And Authority

Forge changes one declared part of a repository. It is an implementation
specialist, not a pipeline controller. Nova owns the attempt, the capability
grant, the final stage transition, and every later test or review decision.
Forge can propose file changes and report checks only through a bounded output.

The stage requires separate capabilities for dispatch, workspace creation and
removal, commit, merge, and artifact access. A grant for one action does not
imply another action. This is the implemented safety property. The source does
not record the historical reason for selecting this design. The current design
assessment is an inference: separate grants limit the effect of a compromised
specialist and keep lifecycle authority in Nova. The cost is more adapters,
fences, and reconciliation work. Reconsider this split only if a replacement
keeps per-effect authorization, fixed attempt identity, and uncertain-effect
reconciliation.

> **Source evidence — authority is split by capability**
>
> [The implementation manifest declares the stage and its seven required capabilities](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/implementation-agent/plugin.json#L1-L23).
>
> [The stage creates and integrates the workspace through separate capability calls](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/implementation-agent/src/stage.ts#L13-L71).
>
> [The stage binds the active attempt, dispatches, and cleans up after integration](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/implementation-agent/src/stage.ts#L81-L115).
>
> [It stores completion and cleanup evidence and returns only Nova stage outcomes](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/implementation-agent/src/stage.ts#L118-L150).

## Input And Dispatch Contract

The stage input identifies the run, module, attempt, task, and source commit.
The optional workspace block names the repository root, worktree path, branch,
base reference, merge target, and commit message. The optional source binding
connects repair work to an approved earlier result.

The JSON Schema rejects unknown fields. It limits the task to 32,768
characters, identifiers to 128 characters, paths to 4,096 characters, and the
commit message to 4,096 characters. `headBefore` must be a 40- to 64-character
lowercase hexadecimal object ID. These bounds make admission deterministic and
stop an agent prompt from becoming an unbounded transport.

At dispatch, the stage sends protocol `kubeclaw.implementation.v2`, the selected
agent, attempt identity, accepted source, optional workspace reference, task,
and a strict output contract. Runtime Core adds session evidence. The agent must
not invent that evidence.

> **Source evidence — exact wire shapes**
>
> [The first half of the input schema defines identity, task, source, and workspace fields](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/implementation-agent/schemas/input.schema.json#L1-L55).
>
> [The second half defines workspace bounds and rejects unknown input fields](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/implementation-agent/schemas/input.schema.json#L56-L106).
>
> [The request builder fixes the wire protocol and agent-owned output](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/implementation-agent/src/protocol.ts#L40-L76).

## Workspace And Git Flow

1. Nova replaces caller-supplied run and attempt values with the active lease.
2. The stage adds an attempt generation to the workspace path and branch. This
   keeps a repair attempt separate from an earlier attempt.
3. The `git.workspace.create` adapter creates the worktree at the requested
   base. A repair uses the current `HEAD`; an ordinary attempt uses `baseRef`.
4. The adapter returns a signed runtime workspace reference and a 40-character
   source revision. The stage checks the repository, path, branch, revision,
   and attempt owner before it dispatches Forge.
5. Forge works only in that referenced workspace and returns repository-relative
   changed paths plus the checks that it ran.
6. A ready result causes `git.commit` with an expected parent. This detects a
   changed baseline instead of committing on an unknown parent.
7. `git.merge` integrates that exact commit into the declared merge target.
8. The stage removes the workspace only after integration succeeds.

The runtime-dispatch adapter repeats the workspace proof. It resolves real
directories, requires the worktree below the configured workspace root, refuses
the repository root itself, opens the owner file without following a final
symlink, and compares the complete canonical owner record. This check is
necessary because a path string alone does not prove who owns a directory.

> **Source evidence — workspace fencing**
>
> [Attempt generation changes both workspace path and branch](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/implementation-agent/src/workspace.ts#L1-L11).
>
> [Creation, commit, merge, and removal validate returned revisions and references](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/implementation-agent/src/stage.ts#L13-L66).
>
> [Runtime dispatch verifies the real path and workspace owner file](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugins/runtime-dispatch/src/workspace-target.ts#L1-L30).

## Completion, Commit Selection, And Merge

Forge can return `ready_for_testing` or `blocked`.

| Result | Required evidence | Nova stage effect |
| --- | --- | --- |
| `ready_for_testing` | At least one changed path, at least one check, every check passed, and session termination `completed`. | Commit declared paths, merge the exact commit, store the completion, and return `passed`. |
| `blocked` | No changed path, no successful check, and a session that did not terminate as completed. | Store no commit, return `blocked`, and retain the workspace when it can help recovery. |

Changed paths must be relative and cannot contain `..`. There can be at most
512 paths and 128 checks. The commit adapter receives only these paths. It does
not implicitly select all uncommitted files.

The stored implementation artifact includes the accepted source, integrated
revision, session digest, summary, paths, and checks. If cleanup fails after a
successful merge, the stage writes a separate cleanup artifact. Cleanup failure
does not erase the integrated revision.

The Git repository is the authority for integrated source. The artifact store
is the authority for the stage report and cleanup evidence. A retained worktree
is temporary recovery evidence, not a second source authority. Attempt-specific
paths and the expected-parent check prevent two attempts from silently
committing through the same workspace or parent. The Git merge adapter remains
the final concurrency boundary.

## Failure And Recovery

| Failure | Safe effect | Recovery |
| --- | --- | --- |
| Source approval needs a workspace, but none is declared | Stage blocks before dispatch. | Add a workspace or correct the pipeline input. |
| Workspace reference or returned revision is invalid | Stage blocks and retains an already created workspace. | Inspect the adapter and owner record. Start a new attempt; do not reuse an unproved path. |
| Agent output violates the strict completion contract | Stage returns `implementation.invalid_completion`. | Fix the agent response or target configuration, then retry through Nova. |
| An external effect has an unresolved outcome | Stage returns `implementation.effect_reconciliation_required`. | Reconcile the effect journal before retry. Do not repeat commit or merge blindly. |
| Agent reports `blocked` | Stage stores the explanation and blocks. | Change the task, inputs, or environment. Nova decides whether a new attempt is valid. |
| Merge succeeds and workspace removal fails | Integrated result remains valid; cleanup evidence is stored. | Remove only the referenced generation after verifying its owner record. |

There is no automatic conflict repair inside Forge integration. Git adapters
must fail a stale expected parent or unsafe merge. Nova then controls a repair
attempt with a new generation and current source evidence.

Cancellation follows the active Nova abort signal into runtime dispatch. The
adapter cancels the OpenClaw subagent or sends the ACP stop message and then
waits for terminal proof. A cancelled completion cannot claim
`ready_for_testing`. Forge has no command that resumes the same failed stage as
if it never stopped.

A repair is a new Nova-owned attempt. Core supplies `repair-request.v1`
evidence, the stage verifies that the request targets this stage and attempt,
and workspace generation creates a new path and branch. The repair starts from
current `HEAD`, not the original stale `baseRef`. A retained old workspace is
diagnostic evidence; it is not implicit input to the new attempt.

> **Source evidence — repair and cancellation do not reuse authority**
>
> [Only a Core-issued repair request can select repair evidence](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/implementation-agent/src/repair-evidence.ts#L1-L30).
>
> [OpenClaw cancellation first resolves the accepted session identity](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugins/runtime-dispatch/src/openclaw-cleanup.ts#L25-L47).
>
> [Cleanup cancels and polls to terminal state or returns an unresolved result](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugins/runtime-dispatch/src/openclaw-cleanup.ts#L49-L72).

## Configuration And Extension

The compiled stage configuration is the direct source for these values. There
is no Forge environment-variable fallback and no Forge default for `agent`.

| Setting | Rule and effective precedence |
| --- | --- |
| `agent` | Required non-empty runtime target ID. The stage passes this ID to `runtime.dispatch`. The capability grant and runtime target allowlist must also admit it. |
| `agentRole` | Optional orchestration metadata. The Forge stage does not read it to select the target. |
| Runtime target | The runtime-dispatch package configuration defines endpoint, secret name, identity, workspace roots, budgets, polling, and result collection. Those values are not overridden by Forge input. |
| Attempt identity | The active Nova lease replaces caller-supplied `runId` and `attempt`. A repair request also makes `HEAD` win over the declared `baseRef`. |

> **Source evidence — configuration and precedence**
>
> [The configuration schema requires `agent` and allows only `agentRole` beside it](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/implementation-agent/schemas/config.schema.json#L1).
>
> [The active lease replaces input identity before workspace creation and dispatch](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/implementation-agent/src/stage.ts#L81-L101).

To add a Forge backend, implement a `runtime.dispatch` target that preserves the
implementation request and completion contract. Do not add Git commit, merge,
or workspace authority to the backend. A new completion field is a coordinated
contract change: update the output contract, parser, stored artifact consumers,
schema, tests, and this page. A prompt-only field is not a supported extension.

## Operation And Diagnosis

Observe the stage result, the implementation artifact, the integrated revision
fact, and any cleanup artifact together. A `passed` result without
`implementation.source_revision` means that the successful completion had no
declared workspace to integrate. A `blocked` result with `retainedWorkspace`
means that an attempt-owned worktree remains for inspection. Verify its complete
owner record before any removal. If an effect-reconciliation code is present,
inspect the effect journal and Git refs before a retry. If the merge is already
present, do not issue a second commit or merge.

Run these checks after a Forge change:

- implementation-agent package tests for protocol and live stage behavior;
- runtime-dispatch package tests for target, cancellation, and workspace proof;
- `tests/verification/reliability/forge-workspace.test.mts`;
- `tests/verification/reliability/forge-lock-wait.test.mts`.

The tests prove contract behavior in controlled repositories. They do not prove
that a remote model follows a task well or that every external Git host remains
available.

## Blueprint Sync: Approved Control Files, Not Agent Implementation

`kubeclaw.blueprint-sync` registers `kubeclaw.generate.blueprint-sync` with empty
configuration. It never dispatches Forge or invents implementation work. Input
names `blueprintId`, `repositoryRoot`, `branchRef`, non-empty unique
`controlPaths`, and optional `sourceBinding`. The manifest requires separate
`artifacts.read`, `artifacts.write`, `state.append`, `git.sync`, and `git.commit`
grants. The selected adapters own filesystem/Git/state authority; the stage
uses no secret or direct network client. See the [recursive configuration
reference](../reference/plugin-configuration.md) for its exact schemas.

With a source binding, `approvedSource` verifies approval/lineage. Repository
identity and branch must match the approved subject, and every requested
control path must be in its approved path set. Sync reads the immutable
`architectureRevision`, not a later ambient branch tip. Without a binding it
uses the declared branch reference; do not describe that path as approved.

The [maintained effectful-plugin walkthrough](../extend/effectful-plugin.md)
owns this package's complete multi-effect construction, idempotency, interruption
and recovery explanation. Its concrete order is sync selected paths, commit
returned synced paths when any exist, append `blueprint.controls.synced` under
namespace `kubeclaw.blueprint-sync`, then publish a summary in the same artifact
namespace with resource `blueprint-sync:<blueprintId>`. When bound, the commit
must return a source revision. The summary retains blueprint/branch, synced and
missing paths, plus approved subject digest, architecture revision, repository,
and before/after source revisions. A bound subject's identity encoding is
carried to the artifact request.

A successful sync with no missing controls returns passed. Missing controls
return `request_fix`, `blueprint.control_files_missing`, with the missing list
and the already-written summary. This is **not** an all-or-nothing transaction:
a request for two files can copy and commit the existing file, append state and
write the report, then request repair for the missing one. Add the missing
control file under the owning approval/source policy, inspect the integrated
revision and prior effects, then let Nova schedule a new attempt. Do not blindly
repeat the whole mutation sequence or edit the old summary.

Invalid identity, empty/duplicate paths, mismatched approved input, missing
returned bound revision, or adapter failure throws rather than returning a
package-local retry. No state append follows a failed earlier Git call; a
failed later append/artifact write does not undo an earlier commit. Preserve
the Git refs, source/approval artifacts, effect receipts, state stream and
report together. Acceptance without receipt or an incomplete attempt after
external mutation follows the effectful guide's explicit reconciliation stop.
An unchanged invalid declaration will fail again; uncertain Git outcomes need
inspection before any retry.

There is no stage-local retry loop, wait/resume cursor, child process or private
store. Concurrent mutation and cancellation are enforced by Core's effect
locks/fences and the selected Git/state adapters, not by a stage transaction.
Cancellation can leave committed files and appended state; it is not rollback.
Only adapter-owned temporary data is eligible for owned cleanup. Synced files,
Git commits and durable state/artifacts remain until their owners' retention
requirements end. Drain pinned runs before disabling adapters or removing
packages via the [canonical plugin lifecycle](../use/plugins.md).

To change sync behavior, update stage input/schema, approved-source checks,
Git sync/commit contract, summary/state consumers and tests together. Reuse the
effectful walkthrough's least-authority authoring and activation steps; run
`npm test --prefix skills/nova/plugins/blueprint-sync` and
`npm run docs:extensions:effectful:check`. Check both all-files-present success
and partial missing-file repair, as well as source-binding rejection and
interruption evidence. A controlled repository test is not live remote Git or
agent proof. Removing this stage does not revert committed control files.

Source: [complete sync, commit, state, artifact and repair sequence](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/blueprint-sync/src/stage.ts#L1-L60); [complete sync, commit, state, artifact and repair sequence (continued 2)](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/blueprint-sync/src/stage.ts#L61-L64),
[registration and authority](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/nova/plugins/blueprint-sync/plugin.json#L1-L25).

## Git Workspace Adapter: Complete Mutation Surface

`kubeclaw.git-workspace:git` provides five capabilities with eight supported
operation combinations. The Forge flow above is one consumer, not the whole
adapter API. Core grants and resource locks remain separate for workspace
create/remove, commit, merge and sync. The [per-plugin dependency matrix](../use/plugins.md)
owns remote URL/authentication authority and the empty child environment;
package activation is not proof of remote reachability or credentials.

### Configuration and ownership

All eight configuration fields are required: `allowedRepositoryRoots`,
`workspaceRoot`, `gitExecutable`, `authorName`, `authorEmail`, `maxExecutionMs`,
`maxOutputBytes`, and `terminationGraceMs`. There is no adapter
fallback to ambient Git author identity. Schema maximums are one hour per Git
command, 16 MiB combined output, and 60 seconds termination grace. The
[recursive configuration reference](../reference/plugin-configuration.md)
supplies field types and constraints. Repository roots and executable must be
existing absolute canonical non-symlink paths; activation creates workspaceRoot
if needed and then checks its canonical directory identity. That creation is an
activation side effect. Executable type is checked there, not a successful Git
launch; `ready()` is empty.

The adapter asserts a fence only for non-confidential invocation. Core owns
resource/grant admission; canonical root checks do not grant a new capability.
Workspace creation writes a private, synchronized owner record containing the
complete `runtime-workspace.v1` reference and Core attempt identity. Later
operations **when supplied** a workspaceReference verify its exact protected
owner record and attempt. Do not claim that a bare direct request must carry
one: removal and workspace operations allow omission. Forge's normal protocol
supplies the reference and additional source checks described above.

### Actual operations, inputs and results

| Capability / operation | Inputs and external result |
| --- | --- |
| `git.workspace.create` / `create` | Resource is canonical repository root; optional payload repositoryRoot must agree. workspacePath is a new descendant of configured workspaceRoot; branch and baseRef select worktree identity. Optional approvedSource pins the accepted revision. Runs worktree add, resolves its HEAD, records owner; returns workspace, sourceRevision and workspaceReference. |
| `git.workspace.remove` / `remove` | Resource/repositoryRoot agree; workspacePath must be below workspaceRoot, never the root itself. Optional branch is deleted after worktree removal. Optional reference verifies repository/path/branch/attempt. Returns removed (whether path existed) and branchRemoved (whether branch was requested). Removal uses force and is not a backup of dirty work. |
| `git.commit` / `commit` | Resource names an authorized repository/workspace; paths are explicitly scoped and message is bounded. Adds and commits only those paths, then resolves sourceRevision. Optional expectedParent requires an owned reference and checks HEAD before and commit parent after; approvedSource also verifies accepted source and resulting transition. Returns Git result plus sourceRevision. |
| `git.merge` / `merge` | Resource names the destination's **current checkout**; the adapter resolves sourceRef once to a commit. Optional sourceRevision must match that commit. Runs merge --no-edit --no-ff of the resolved ID and returns Git result plus destination sourceRevision. It does not switch to a payload target branch. |
| `git.sync` / `sync_paths` | ref plus non-empty paths; resolves ref once to an immutable tree, then synchronizes only requested literal paths. Returns synced entries (created/updated) and missing paths. Equal content with matching executable mode is unchanged and omitted from synced. This operation itself creates no commit. |
| `git.sync` / `fetch` | remote defaults to origin; runs fetch --prune against that named remote. Returns Git exitCode/signal/stdout/stderr, not a sourceRevision or proof of any expected branch. Fetch can update/prune remote-tracking refs. |
| `git.sync` / `rebase` | upstreamRef selects the rebase base of the authorized current checkout. Returns Git result; does not return a new sourceRevision or implement an automatic conflict decision/abort procedure. Existing commits can be rewritten. |
| `git.sync` / `push` | remote defaults to origin; localRef and remoteRef produce the single explicit localRef:remoteRef refspec, with porcelain output. Returns Git result, not a remote receipt/status-query contract. A lost response can follow remote acceptance. |

For ordinary workspace operations the canonical resource directory must be an
allowed repository descendant or inside workspaceRoot. If a reference is
supplied, non-merge operations require its workspacePath; merge instead
requires its repositoryRoot and sourceRef equal its branch. This is an owner
binding, not a general repository-discovery policy.

Branch/remote/base tokens, slash-separated refs, commit messages and scoped
paths reject their respective option/control/ref-expression injections. Commit
paths cannot traverse a symlink. The runner uses fixed argv, no shell,
`core.hooksPath=/dev/null`, disabled commit signing, configured author identity
and empty environment. These controls do not sandbox Git against everything
its OS identity or selected repository configuration can access.

### Source approval and partial effects

For create, sync_paths, commit and merge, the adapter parses supplied approvedSource
against the active run and repository. It checks current source HEAD, declared
architecture ref/revision and cleanliness. Commit disables the dirty-working-tree
rejection generally; its add/commit calls still select only declared paths.
The adapter verifies reviewed file modes/bytes where the operation
requires them. Source transition checks require the resulting first parent to
be the accepted source and reviewed control files to remain unchanged. Forge's
expectedParent and pinned merge revision checks add attempt-workspace and exact
commit bindings. A source-less call does not gain approval by being a valid Git
operation. Fetch/rebase/push do not invoke those approved-source verification
helpers; do not infer approval semantics from an unused approvedSource field.

sync_paths performs literal ls-tree/show/checkout against its resolved tree.
Only successful lookup with no entry means missing. Invalid ref, non-blob,
abort, timeout or output failure is an error, not a missing deliverable. Files
copied before a later error remain copied: this is not a multi-file transaction.
A copied Git symlink remains a Git object/path outcome, not permission to
follow an escaping filesystem path. Blueprint Sync separately commits returned
changes and can request repair for missing files; use its section above.

### Failure and safe continuation

| Trigger | Effect and safe action |
| --- | --- |
| Invalid configuration, noncanonical/outside path, existing workspace destination, unsafe token/path/message or symlink | `GIT_CONFIG_*`, `GIT_PATH_*`, `GIT_WORKSPACE_EXISTS`, `GIT_VALUE_INVALID`, `GIT_PATHS_INVALID` or `GIT_SYMLINK_DENIED`; reject the affected call. Correct the exact declaration/root; unchanged retry is not repair. Activation can already have created workspaceRoot. |
| Owner/reference mismatch, moved expected parent/merge source, stale approval or changed reviewed bytes/mode | `GIT_WORKSPACE_*`, `GIT_MERGE_*`, `REVIEW_SUBJECT_STALE` or `SOURCE_APPROVAL_*`; stop integration and preserve refs/owner/approval. Freeze a new authorized candidate through Nova instead of relabelling the old proof. Some checks run after mutation and do not roll it back. |
| Git returns nonzero, including merge/rebase conflict or remote refusal | `GIT_COMMAND_FAILED` includes exit/signal and at most 4,096 stderr characters. No successful adapter result exists. Preserve the repository/index/operation state and inspect the actual failure. The adapter supplies no conflict resolver or rebase abort/continue operation; the repository owner must establish a reviewed recovery path before a new pipeline attempt. |
| Execution/output limit or caller abort | `GIT_TIMEOUT`, `GIT_OUTPUT_LIMIT_EXCEEDED` or `ADAPTER_CANCELLED`. Termination is local process handling, not rollback or proof that push failed remotely. Reconcile exact refs and any remote acceptance before retry. |
| Later sync step, commit verification, branch deletion, owner persistence or report consumer fails | Earlier copied paths, commits, worktree creation/removal or remote effects can remain. Keep effect receipts, Git refs and owner data; do not repeat the whole sequence as though it were atomic. |

The runner bounds **each Git command**, not the entire multi-command operation.
It tracks active children, sends process-group SIGTERM on abort/timeout/limit,
then SIGKILL after configured grace when the leader is still active. Shutdown
denies new launches, signals active children and waits for their settlement.
This is not the common CommandRunner's `/proc` descendant-acknowledgement or a
hard cgroup containment proof. Do not infer orphan reaping, rolled-back Git
state, or completed external cleanup from leader exit or a timeout alone.

There is no adapter-local retry loop, durable remote receipt store, resume
cursor or compensation. Git repositories/refs/worktrees and private owner
records survive; Core owns mutation request/receipt/recovery authority. Retain
those with source/approval artifacts through interrupted or pinned runs. Normal
Forge removal is explicit and attempt-owned; disabling this adapter does not
remove worktrees, undo merges, delete owner records or reverse a push. Follow
the [plugin lifecycle](../use/plugins.md) and [effect recovery](../extend/effectful-plugin.md)
before replacement, retry or owner-authorized retirement. Never blindly repeat
an accepted push with unknown outcome.

### Change and verification

Extend an operation only with matching capability vocabulary/grants, dispatch,
argument validation, ownership/source checks, result consumers and tests. New
remote behavior needs an explicit credential and reconciliation contract, not
ambient shell/environment access. Keep pathspec literals, explicit commit
selection and source-transition checks in both positive and negative fixtures.
Run `npm test --prefix skills/common/plugins/git-workspace`: the maintained
suite covers real disposable Git repositories, a local bare remote for
fetch/push/rebase, scoped commit/merge/workspace behavior, denial, cancellation,
time/output limits, and sync partial/missing/literal-path cases. A valid local
fetch returns exit0; an invalid sync ref must throw, whereas a valid tree with
an absent requested path returns missing. These fixtures prove those local
contracts, not an external Git host, live authentication or deployed recovery.
Compile the selected provider and least grants, verify exact result/ref/owner
observations in a controlled repository, and drain pinned work before changing
configuration or activating incompatible package bytes.

> [plugin.json](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugins/git-workspace/plugin.json#L1-L23)

> [schemas/config.schema.json](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugins/git-workspace/schemas/config.schema.json#L1-L30)

> [src/adapter.ts](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugins/git-workspace/src/adapter.ts#L1-L27)

> [src/operations.ts](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugins/git-workspace/src/operations.ts#L1-L60)

> [src/operations.ts (continued 2)](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugins/git-workspace/src/operations.ts#L61-L120)

> [src/operations.ts (continued 3)](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugins/git-workspace/src/operations.ts#L121-L126)

> [src/review-source.ts](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugins/git-workspace/src/review-source.ts#L1-L60)

> [src/runner.ts](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugins/git-workspace/src/runner.ts#L1-L60)

> [src/runner.ts (continued 2)](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugins/git-workspace/src/runner.ts#L61-L75)

> [src/values.ts](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugins/git-workspace/src/values.ts#L1-L60)

> [src/values.ts (continued 2)](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugins/git-workspace/src/values.ts#L61-L110)

> [src/workspace-ownership.ts](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/skills/common/plugins/git-workspace/src/workspace-ownership.ts#L1-L34)
