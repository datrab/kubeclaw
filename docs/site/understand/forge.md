# Forge: Bounded Implementation And Git Integration

Status: implemented for the Nova implementation stage
Audience: pipeline operator, Forge maintainer, plugin author, security reviewer
Owner: Forge maintainers
Evidence: skills/nova/plugins/implementation-agent; skills/common/plugins/runtime-dispatch; skills/common/plugins/git-workspace; tests/verification/reliability/forge-workspace.test.mts; tests/verification/reliability/forge-lock-wait.test.mts
Evidence revision: `5b6e1b97415ffefa4bb42bf2ae331f27597170b5`
Applies to: `kubeclaw.implementation-agent` and its OpenClaw runtime-dispatch path
Last verified: source, schema, manifest, and focused test inspection on 2026-09-20

## Purpose And Authority

Forge changes one declared part of a repository. It is an implementation
specialist, not a pipeline controller. Nova owns the attempt, the capability
grant, the final stage transition, and every later test or review decision.
Forge can propose file changes and report checks only through a bounded output.

This boundary prevents a capable coding agent from silently widening its task.
The stage requires separate capabilities for dispatch, workspace creation and
removal, commit, merge, and artifact access. A grant for one action does not
imply another action.

> **Source evidence — authority is split by capability**
>
> [The implementation manifest declares the stage and its seven required capabilities](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/implementation-agent/plugin.json#L1-L23).
>
> [The stage invokes each effect separately and returns a typed stage result](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/implementation-agent/src/stage.ts#L13-L111).

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
> [The input schema defines all accepted fields and bounds](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/implementation-agent/schemas/input.schema.json#L1-L106).
>
> [The request builder defines the protocol and agent-owned output](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/implementation-agent/src/protocol.ts#L1-L62).

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
> [Attempt generation changes both workspace path and branch](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/implementation-agent/src/workspace.ts#L1-L11).
>
> [Creation, commit, merge, and removal validate returned revisions and references](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/implementation-agent/src/stage.ts#L13-L66).
>
> [Runtime dispatch verifies the real path and workspace owner file](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/common/plugins/runtime-dispatch/src/workspace-target.ts#L1-L30).

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
> [Only a Core-issued repair request can select repair evidence](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/nova/plugins/implementation-agent/src/repair-evidence.ts#L1-L30).
>
> [OpenClaw cancellation addresses the known task or session and requires terminal reconciliation](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/skills/common/plugins/runtime-dispatch/src/openclaw-cleanup.ts#L1-L72).

## Configuration And Extension

The stage requires `config.agent`; `agentRole` is optional. Runtime dispatch has
the detailed OpenClaw target settings described in [OpenClaw integration](openclaw.md).
To add a Forge implementation backend, keep the implementation request and
completion contract stable and add a `runtime.dispatch` target. Do not add Git
authority to the backend. The stage and Git adapters must retain that authority.

Run these checks after a Forge change:

- implementation-agent package tests for protocol and live stage behavior;
- runtime-dispatch package tests for target, cancellation, and workspace proof;
- `tests/verification/reliability/forge-workspace.test.mts`;
- `tests/verification/reliability/forge-lock-wait.test.mts`.

The tests prove contract behavior in controlled repositories. They do not prove
that a remote model follows a task well or that every external Git host remains
available.
