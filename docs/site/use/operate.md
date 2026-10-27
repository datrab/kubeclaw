# Configure and Operate

Status: source-backed command paths with explicit unauthenticated issuer and missing cancellation boundaries
Audience: product operator, pipeline operator, Prism operator
Owner: Nova Core and platform operations
Evidence: skills/nova/project/cli.ts; skills/nova/core/cli.ts; skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json; skills/nova/core/execution/engine-snapshots.ts; skills/nova/core/execution/engine-run.ts
Upstream source scope: central Ops contract at `34cf38ef53ee41381543785d0ffae90a37fac9ca`; no runtime source adoption or live verification is established by this update
Applies to: pipeline-platform.v2 and current Prism deployment
Last verified: 2026-09-21 schema validation; canonical journal preservation, resume, recovery, and retention boundaries rechecked on 2026-10-12 at `2025f36306636b2e0c2c426447bf137d0574e11f`; no live cluster result

## Objective

Configure one governed runtime, start work, inspect durable results, and continue supported waits.
This page also identifies controls that the current CLI does not provide.

## Canonical Start, Readiness, and Observation Procedure
<!-- operator-task: start-readiness-observe -->

This section is the sole authority for `start-readiness-observe`. Start with an
installed source-bound release, explicit `<context>` and `<namespace>`, selected
component list, independent administration, and no active change. Run cluster
commands from the administration machine. Kubernetes owns process and Service
state; `scripts/deploy.sh` and the health program embedded by the chart own
component checks; a completed application transaction owns functional proof.

Before any cluster command on this page, complete
[Bind Cluster Authority](install.md#bind-cluster-authority). Keep the same bound
shell for the whole task. Every raw `kubectl`, Helm, or `scripts/deploy.sh`
command below must inherit its exported read-only `KUBECONFIG`; every shown
`<context>` must equal `EXPECTED_CONTEXT`. Run `assert_cluster_binding`
immediately before each command block. Stop on any mismatch and follow the
binding section's recovery; never fall back to the default kubeconfig.

Record source and release identities, context, namespace, time, and evidence
directory. Stop if the current context, selected images, or ownership differs
from the install record.

Observe the four levels in order:

1. **Process:**

   ```bash
   assert_cluster_binding
   kubectl --context "<context>" -n "<namespace>" rollout status deployment/agent-nova --timeout=300s
   kubectl --context "<context>" -n "<namespace>" rollout status deployment/agent-buster --timeout=300s
   kubectl --context "<context>" -n "<namespace>" get pods -o wide
   ```

   Expected observation: each selected Deployment completes rollout and every
   selected Pod is running without restart growth. Omit a role only when the
   install record says it is disabled.

2. **Service:**

   ```bash
   assert_cluster_binding
   kubectl --context "<context>" -n "<namespace>" get service agent-nova agent-buster
   kubectl --context "<context>" -n "<namespace>" get endpointslice \
     -l kubernetes.io/service-name=agent-nova
   kubectl --context "<context>" -n "<namespace>" get endpointslice \
     -l kubernetes.io/service-name=agent-buster
   ```

   Expected observation: each selected Service exists and has at least one
   ready endpoint. A Service without an endpoint is not ready.

3. **Dependency:**

   ```bash
   assert_cluster_binding
   bound_deploy smoke-agent nova
   bound_deploy smoke-agent buster
   ```

   Expected observation: each command exits zero after rollout, Pod readiness,
   gateway, startup record, Redis-aware readiness, code bundle, skills, and
   runtime configuration checks. These checks do not prove a user transaction.

4. **Functional:** execute the registered non-production
   [deployment success exercise](workflows/buster-suite.md#deployment-success-exercise)
   with its exact project, provider, receipt, and cleanup checks. Expected
   observation: the project returns terminal `succeeded`, the audit agrees, and
   all external effects have terminal receipts. This is technical proof; use
   [Deliver a Demo](demo-delivery.md#canonical-demo-delivery-procedure) for a
   separate human decision.

At any failure, stop at the first failed level. Use
[symptom diagnosis](diagnose.md#canonical-symptom-diagnosis-procedure); do not
restart all roles to hide a dependency or functional failure. Recovery is the
narrow owning-layer repair followed by all four levels again. Cleanup belongs
to the functional exercise. Retain every command, output, exit status, selected
image ID, events, audit, receipts, cleanup result, and blocked step.

## Canonical Run Control Procedure
<!-- operator-task: run-control -->

This page is the sole authority for `run-control`. The supported start state is
a `pipeline-platform.v2` and project or explicit graph at the original source
and package snapshot, with writable durable storage and a reconciled prior
effect state. Run from `<repository-root>` on the administration machine. Nova's
CLI and durable journal are authoritative; process state and plugin logs are
diagnostic only.

Complete [Validate Before Starting](#validate-before-starting),
[Start a Project Run](#start-a-project-run), [Inspect a Run](#inspect-a-run),
[Approve or Resume a Wait](#approve-or-resume-a-wait), and, after interruption,
[Recover After Interruption](#recover-after-interruption). The
[Cancellation Boundary](#cancellation-boundary) is mandatory. Stop on an
unknown run, changed graph/package digest, unresolved effect, stale or expired
wait, issuer mismatch, or terminal run. Retain input digests, output, audit,
wait and signal bytes, effects and receipts, failure, retry decision, and final
state. Follow [Evidence to Retain](#evidence-to-retain) for protected raw copies
and signal bytes; a digest alone does not authorize deletion.

## Before Each Operation

Run from `<repository-root>` unless a command states another location.
Set no implicit Kubernetes context.

The machine that runs Nova's CLI needs Linux file locking and `/usr/bin/flock`
with `--exclusive`, `--timeout`, and `--conflict-exit-code` support. Nova uses
that fixed executable to protect durable state updates. A BusyBox `flock` that
lacks these options is insufficient. Stop before a run or resume if this
interface is unavailable; a lock error does not prove that a signal was
accepted. Preserve the journal and diagnose the executable before retrying.
[Lock acquisition and release](https://github.com/datrab/kubeclaw/blob/425be378fa25d26835a5418d65bfd457e151cc16/skills/nova/core/state/file-mutex.ts#L4-L22).

Record these inputs:

- Full source commit.
- Platform configuration path and digest.
- Project or pipeline path and digest.
- Selected role and plugin package revisions.
- Operator identity for an approval or administrative decision.
- Durable storage root and its free capacity.

Do not start work while the project repository contains uncommitted changes.
The project command rejects a changed baseline or dirty worktree.

## Supported Versions

Use the [shared version rules](README.md#version-and-tool-boundary).
This procedure applies to `pipeline-platform.v2` and the pipeline command at the recorded source revision.
Start a new governed run when a platform, project, graph, package, or state format is not compatible with that revision.

## Understand the Two Command Forms

KubeClaw accepts a project document or an explicit pipeline graph.

| Form | Use | Identity source |
| --- | --- | --- |
| `--project` | Normal project operation | Compiler derives the run and graph identity |
| `--pipeline` | Direct operation of an explicit graph | Operator supplies or accepts the run identity |

Both forms require `--platform`.
Do not mix their recovery syntax.

The command does not implement `--help`.
The runnable forms in this page are the interface reference.

> **Source evidence — command surface**
>
> **Claim:** The dispatcher selects the project form only when `--project` is present. Otherwise, it uses the explicit-graph Core CLI. The two forms support the commands shown on this page.
>
> **Implementation:** [The project dispatcher validates arguments and selects compile, start, recover, or signal](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/project/cli.ts#L19-L56). [The Core CLI supports start, recover, signal, and audit for explicit graphs](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/core/cli.ts#L16-L74).
>
> **Contract or setting:** [The npm `pipeline` script selects the dispatcher](https://github.com/datrab/kubeclaw/blob/430633accc4a374a740b5f12f384eeeb9dce228d/package.json#L42-L42).
>
> **Test evidence:** [The project compiler test starts the real dispatcher and checks its compiled output](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/verification/contracts/check-project-compiler.mts#L171-L185). The test passed on 2026-09-16.
>
> **Revision:** Command sources were checked at `430633accc4a374a740b5f12f384eeeb9dce228d`; the older CLI and test links contain identical complete files. The test execution above remains a historical result at `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`.
>
> **Limit:** Neither CLI defines a `--help` option or a separate cancel command.

## Configure the Platform

The operator owns the platform configuration.
Project content cannot add trusted packages, providers, adapters, or grants.

The configuration must declare these groups:

| Group | Operator decision | Verification question |
| --- | --- | --- |
| `installationRoots` | Package locations that the registry may discover | Do all paths exist at the selected revision? |
| `trustedBuiltinRoots` | Package roots allowed as built-ins | Does each path belong to the reviewed release? |
| `externalTrust` | Allowed external source digests and attestations | Does each external package match its approved digest? |
| `providers` | One selected provider for each capability | Does the provider registration exist and activate? |
| `grants` | Resource limits for each registration and capability | Does each grant allow only the intended resource? |
| `adapters` | Adapter configuration | Do referenced endpoints and stores exist? |
| `activeAdapters` | Adapters that start in this runtime | Does every required capability have one active provider? |
| `observers` | Observer configuration | Is required delivery reachable and bounded? |
| `storageRoot` | Durable run storage | Is it persistent, writable, private, and monitored? |
| `shutdownTimeoutMs` | Bounded runtime shutdown interval | Does the interval allow the selected adapters and observers to settle? |
| issuer fields | Nova and administrative identities | Do resume signals use an authorized exact identity? |

Relative package and storage paths resolve from the platform file directory.
This prevents the shell working directory from changing their meaning.

> **Source evidence — platform authority**
>
> **Claim:** The operator-owned platform document selects trusted package roots, providers, grants, adapters, observers, durable storage, and decision issuers. Relative paths use the platform file directory.
>
> **Implementation:** The platform schema declares [its required fields, schema version, and installation roots](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/common/plugin-runtime/foundation/config/platform.schema.json#L5-L33).
> It also declares [trust, providers, and grants](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/common/plugin-runtime/foundation/config/platform.schema.json#L34-L68).
> It defines [adapter, observer, and storage authority](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/common/plugin-runtime/foundation/config/platform.schema.json#L69-L95).
> [The loader validates the document and resolves paths from its directory](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/common/plugin-runtime/foundation/config/platform.ts#L53-L69).
>
> **Contract or setting:** [`pipeline-platform.v2` is the required schema version](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/common/plugin-runtime/foundation/config/platform.schema.json#L20-L21).
>
> **Test evidence:** [The platform test checks path resolution, immutability, validation, and rejection of project-controlled installation roots](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/verification/contracts/check-plugin-system-v2-platform-config.mjs#L32-L55). The test passed on 2026-09-16.
>
> **Revision:** `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`.
>
> **Limit:** Schema validation does not prove that a configured provider, adapter, observer, or storage service is reachable.

Keep credentials outside the JSON file.
Use adapter-supported secret references or the intended secret resolver.

## Validate Before Starting

Compile the project without running stages:

```bash
npm run pipeline -- \
  --platform "<platform.json>" \
  --project "<project.json>" \
  --compile "<new-pipeline.json>"
```

The output path must not exist.
The compiler refuses to overwrite it.

Expected output contains:

- `status` equal to `compiled`.
- One derived `runId`.
- `stageCount`.
- `definitionDigest`.
- `completionScope`.

Compilation validates runtime registrations and grants.
It does not call an external provider or prove deployment reachability.

Review the compiled graph for stage types, dependencies, limits, and selected repair paths.
Retain its digest with the run record.

## Start a Project Run

Starting condition:

- Project repository HEAD equals `baseRevision`.
- Project repository has no uncommitted file.
- Platform storage has enough monitored capacity.
- Required providers and adapters are reachable.
- No existing process owns the same intended run.

Start the run:

```bash
npm run pipeline -- \
  --platform "<platform.json>" \
  --project "<project.json>"
```

The CLI result is one JSON object. Npm can print lifecycle banners before it;
do not parse the entire npm output as one JSON document.
It includes `runId`, `status`, `completionScope`, `acceptanceReadiness`, and stage states.

Exit code zero means the returned run status is `succeeded`.
It does not mean human acceptance or complete live acceptance.

For an explicit graph, use:

```bash
npm run pipeline -- \
  --platform "<platform.json>" \
  --pipeline "<pipeline.json>" \
  --run-id "<new-run-id>"
```

Use a new run identity.
Do not reuse a prior terminal run identity.

## Inspect a Run

Before every audit, recovery, or resume command, confirm that the run owner
has exited and no new operation can write this run or its adapter stores.
Make a new verified capture for each command, including a retry or a deliberately
wrong signal. Stop if ownership is
unknown. Use the original platform path and run ID from the retained start
command. Do not discover the run by auditing it first.

Audit is not a read-only storage operation.
[The audit reader opens `FileJournal`](https://github.com/datrab/kubeclaw/blob/929aadbad08b41e7a8504950f05dc0f526b706d6/skills/nova/core/telemetry/audit.ts#L14-L18). It constructs `FileJournal`, creates
an append-lock file, and acquires its lock. If `events.jsonl` ends without a
newline, the constructor removes all bytes after the last newline and
synchronizes the shorter file **before** it parses the retained records. It can
therefore change evidence even when audit later fails. A complete hash chain
needs no tail repair. Recovery and resume also open journals through this
constructor; they can create locks and repair tails before rejecting a run or
signal.
[Constructor and tail recovery](https://github.com/datrab/kubeclaw/blob/929aadbad08b41e7a8504950f05dc0f526b706d6/skills/nova/core/state/journal.ts#L30-L77)
and [append-lock creation](https://github.com/datrab/kubeclaw/blob/929aadbad08b41e7a8504950f05dc0f526b706d6/skills/nova/core/state/file-mutex.ts#L8-L21)
define these storage effects.

Preserve the raw run directory before every audit, recovery, or resume, whether
or not the prior command ended cleanly. Also preserve the owning adapters'
stores through their declared
backup procedure while their writers are stopped. The copy must retain partial
bytes, original signals, effects, snapshots, and lock files. Do not parse,
truncate, or repair the source to make the copy pass.

In Bash at the repository root, set the platform and run ID from the original
command record. Set `RUN_CONTROL_EVIDENCE_ROOT` to an existing private durable
directory selected by the incident audit owner, outside the run and adapter
stores. The owner must confirm its capacity, access restrictions, retention
period, and protection from automatic temporary-file removal before capture.
Stop if that location or its retention authority is absent. Define
`preserve_run_state` in the same terminal. It uses the platform
loader and the actual run-root resolver without opening `FileJournal`. [The resolver](https://github.com/datrab/kubeclaw/blob/929aadbad08b41e7a8504950f05dc0f526b706d6/skills/nova/core/execution/run-root.ts#L62-L75)
selects the hashed or verified legacy directory. Each call makes a new restricted copy outside the run root and verifies all file
bytes. Symlinks and special files require the owning store's backup procedure;
this command stops on them.

```bash
export RUN_CONTROL_PLATFORM="<original-platform.json>"
export RUN_CONTROL_RUN_ID="<original-run-id>"
export RUN_CONTROL_EVIDENCE_ROOT="<absolute-private-durable-evidence-root>"
preserve_run_state() {
  umask 077
  local observation_root
  test -n "${RUN_CONTROL_EVIDENCE_ROOT:-}" && test -d "$RUN_CONTROL_EVIDENCE_ROOT" || return 1
  observation_root=$(mktemp -d "$RUN_CONTROL_EVIDENCE_ROOT/nova-raw-state.XXXXXXXX") || return 1
  export RUN_CONTROL_OBSERVATION_ROOT="$observation_root"
  node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { loadPlatformConfig } from '@kubeclaw/plugin-foundation/config/platform';
import { runRoot } from './skills/nova/core/execution/run-root.ts';
import { parseHashJournal } from './skills/common/plugin-runtime/foundation/observability/hash-journal.ts';
const platform = loadPlatformConfig(process.env.RUN_CONTROL_PLATFORM);
const runId = process.env.RUN_CONTROL_RUN_ID;
const source = runRoot(platform.storageRoot, runId);
const target = process.env.RUN_CONTROL_OBSERVATION_ROOT;
if (!fs.lstatSync(source).isDirectory()) throw new Error('Run directory is required');
if (target === source || target.startsWith(source + path.sep)) throw new Error('Evidence must be outside the run root');
function inventory(root, relative = '') {
  return fs.readdirSync(path.join(root, relative)).sort().flatMap(name => {
    const file = path.join(relative, name);
    const stat = fs.lstatSync(path.join(root, file));
    if (stat.isDirectory()) return inventory(root, file);
    if (!stat.isFile()) throw new Error('Unsupported evidence entry: ' + file);
    const bytes = fs.readFileSync(path.join(root, file));
    return [{ path: file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }];
  });
}
const original = inventory(source);
if (!original.some(file => file.path === 'events.jsonl')) throw new Error('Event journal is required');
fs.cpSync(source, path.join(target, 'run'), { recursive: true, force: false, errorOnExist: true });
assert.deepEqual(inventory(source), original);
assert.deepEqual(inventory(path.join(target, 'run')), original);
fs.writeFileSync(path.join(target, 'raw-manifest.json'), JSON.stringify({ runId, source, capturedAt: new Date().toISOString(), files: original }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ rawState: target, runId, source, filesVerified: original.length }));
for (const entry of original.filter(entry => entry.path.endsWith('.jsonl'))) {
  const file = path.join(target, 'run', entry.path);
  parseHashJournal(fs.readFileSync(file), file);
}
NODE
}
preserve_run_state || exit 1
```

The helper verifies the raw copy before it parses the copied journals. Even
when a partial record causes parsing to fail, keep that directory and manifest.
Require exit zero before ordinary audit, recovery, or resume. Comparison failure means the copy is
not a verified consistency point. Stop and establish the stopped writer state before making a new copy. Hash equality
checks the copied bytes; it does not prove that every external effect completed.

For non-mutating journal inspection, use the existing strict parser on the
preserved bytes. It rejects an incomplete final record, empty records, wrong
sequence, wrong previous hash, or wrong record hash. It does not repair files or
create locks.
[The pure parser](https://github.com/datrab/kubeclaw/blob/929aadbad08b41e7a8504950f05dc0f526b706d6/skills/common/plugin-runtime/foundation/observability/hash-journal.ts#L15-L29)
defines these rejection rules. This command checks every journal below the
preserved run root:

```bash
node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import { parseHashJournal } from './skills/common/plugin-runtime/foundation/observability/hash-journal.ts';
const root = path.join(process.env.RUN_CONTROL_OBSERVATION_ROOT, 'run');
function inspect(directory) {
  for (const name of fs.readdirSync(directory).sort()) {
    const file = path.join(directory, name);
    const stat = fs.lstatSync(file);
    if (stat.isDirectory()) inspect(file);
    else if (!stat.isFile()) throw new Error('Unsupported evidence entry: ' + file);
    else if (name.endsWith('.jsonl')) {
      const records = parseHashJournal(fs.readFileSync(file), file);
      console.log(JSON.stringify({ file, records: records.length, journalHead: records.at(-1)?.hash ?? null }));
    }
  }
}
inspect(root);
NODE
```

Stop on a parse error. Keep the complete raw copy, including the rejected tail.
Determine which writes and external effects were interrupted. Do not use audit's
automatic truncation as proof of successful recovery. If the owning incident
procedure permits canonical tail recovery, keep the verified raw copy first,
reconcile external effects, then record the audit or recovery command and its
actual changes. A checksum proves byte preservation, not permission to retry an
accepted external request.

For a complete verified journal, use the Core audit command for either command
form. Capture its outputs and exit status in the retained observation directory:

```bash
audit_status=0
npm run pipeline -- \
  --platform "$RUN_CONTROL_PLATFORM" \
  --audit "$RUN_CONTROL_RUN_ID" \
  > "$RUN_CONTROL_OBSERVATION_ROOT/audit.stdout" \
  2> "$RUN_CONTROL_OBSERVATION_ROOT/audit.stderr" || audit_status=$?
printf '%s\n' "$audit_status" > "$RUN_CONTROL_OBSERVATION_ROOT/audit.exit" || exit 1
test "$audit_status" -eq 0 || exit 1
```

The command rebuilds its audit view from durable run state. Retain the whole
output; npm can print a script banner before the CLI JSON. Compare it with the
preserved journal and any previously trusted journal head. A new internally
valid chain alone cannot prove that no old records were lost.

Use [Request, State, and Recovery](../understand/request-state-recovery.md) to interpret states.
Do not infer a terminal state from one plugin log.

## Approve or Resume a Wait

The CLI uses a typed resume-signal file.
It does not provide a separate `approve` verb.

Before creating a signal, complete [Inspect a Run](#inspect-a-run). Use the
original platform, run ID, project or graph, package snapshot, storage root,
and runtime configuration from the retained start record. Confirm stopped run
and owning-adapter writers, preserve new verified raw run and adapter copies,
and require strict parsing of the copied journals. Read the active wait from
that preserved evidence. Stop on unknown ownership, changed identity, failed
copy verification, incomplete records, or a journal chain error. Copy no
identity from an earlier wait. There is no non-mutating live audit command
that can replace these prerequisites.

Read `waitId`, `signalType`,
`authorizedIssuer`, `expiresAt`, and the payload requirements from the active
`wait-request.v2` record. The signal must contain all eight fields in this
example:

```json
{
  "schemaVersion": "resume-signal.v2",
  "signalId": "signal:approval-2026-09-17T120000Z",
  "idempotencyKey": "approval:wait-7:decision-1",
  "waitId": "wait:7",
  "signalType": "approval.resolved",
  "issuer": {
    "type": "operator",
    "id": "operator:release"
  },
  "issuedAt": "2026-09-17T12:00:00.000Z",
  "payload": {
    "decision": "approved",
    "issuer": {
      "type": "operator",
      "id": "operator:release"
    },
    "reason": "Approved the exact source and report in wait:7."
  }
}
```

This example is valid for the shared envelope schema. Its payload is the
approval payload used by the approval path. Another wait type can require a
different payload. Never copy this payload without checking the active wait.

The `issuer` object is **unsigned and self-asserted by the caller**. Nova checks
that its type and ID equal the active wait's `authorizedIssuer`, but the signal
schema contains no signature and the CLI does not authenticate the human or an
external identity provider. Protect access to signal creation and the CLI as
the effective authority. Do not describe issuer matching as identity proof.

Apply these matching rules:

- Create a new `signalId` for one decision event. Nova uses it as the cause of
  the `wait.resolved` event.
- Create one `idempotencyKey` for the exact signal content. Reuse that key only
  to retry the same bytes. Signal storage treats an identical stored record as
  a no-op and rejects the same key with different content. A retry after wait
  resolution is stale and stops before this storage check.
- Copy `waitId` and `signalType` from the active wait.
- Copy the authorized issuer type and ID. This satisfies runtime matching only;
  it does not authenticate who created the file.
- Set `issuedAt` to a valid date-time at or after creation of the active wait.
- Build `payload` from that wait's request and plugin contract. Include the
  current source, decision, or repair digest when that contract requires it.

Nova validates the closed envelope before recording the accepted signal and
its durable `wait.resolved` transition. It rejects unknown fields, a stale or
unknown wait, an expired wait, a mismatched type or issuer, and a signal issued
before wait creation. After Nova records one signal for a wait, a different
signal cannot resolve that wait again.

Storage can change before those checks. [Resume opens the administrative and
event journals before wait and signal validation](https://github.com/datrab/kubeclaw/blob/2025f36306636b2e0c2c426447bf137d0574e11f/skills/nova/core/execution/engine-run.ts#L81-L95),
and [run ownership acquires durable lock state first](https://github.com/datrab/kubeclaw/blob/2025f36306636b2e0c2c426447bf137d0574e11f/skills/nova/core/execution/run-mutation.ts#L7-L16).
Opening a journal can create an append lock or truncate an incomplete tail.
A rejected envelope, wrong issuer, stale wait, or terminal run therefore does
not prove that canonical files are unchanged. Preserve original raw bytes
through [Inspect a Run](#inspect-a-run) before every submission.

Use an operator-controlled signal file with restricted permissions. Before
**each** submission below, including a retry, replay check, or wrong-signal
check:

1. Reconfirm the original platform and run ID, project or graph bytes, package
   snapshot, storage root, and runtime configuration against the retained
   start record. `<original-project.json>` and `<original-pipeline.json>` mean
   those exact original inputs, not a new candidate.
2. Confirm the prior run owner has exited. Stop new writes to the run and its
   owning adapter stores. Unknown ownership stops the command; containment
   alone does not prove that an external effect completed.
3. Reconcile accepted external effects through their owning contracts. Stop
   while any outcome is unknown or no supported continuation exists.
4. Follow [Inspect a Run](#inspect-a-run) to make and verify a **new** complete
   raw run copy and new owning-adapter copies through their declared backup
   procedures, with writers stopped. Define its `preserve_run_state` helper
   and evidence-root inputs in this Bash shell.
5. Require successful strict parsing of every copied run journal. Retain raw
   bytes and stop on a copy, identity, incomplete-record, sequence, or hash
   failure. Do not use automatic tail truncation to make submission possible.
6. Verify that the signal still names that active unexpired wait. Retain the
   exact signal bytes, ID, issue time, and idempotency key. Submit one of the
   following forms, using the same original identities.

Project form:

```bash
preserve_run_state || exit 1
resume_status=0
npm run pipeline -- \
  --platform "$RUN_CONTROL_PLATFORM" \
  --project "<original-project.json>" \
  --signal "<resume-signal.json>" \
  > "$RUN_CONTROL_OBSERVATION_ROOT/resume.stdout" \
  2> "$RUN_CONTROL_OBSERVATION_ROOT/resume.stderr" || resume_status=$?
printf '%s\n' "$resume_status" > "$RUN_CONTROL_OBSERVATION_ROOT/resume.exit" || exit 1
```

For an explicit graph, supply the original run identity:

```bash
preserve_run_state || exit 1
resume_status=0
npm run pipeline -- \
  --platform "$RUN_CONTROL_PLATFORM" \
  --pipeline "<original-pipeline.json>" \
  --run-id "$RUN_CONTROL_RUN_ID" \
  --signal "<resume-signal.json>" \
  > "$RUN_CONTROL_OBSERVATION_ROOT/resume.stdout" \
  2> "$RUN_CONTROL_OBSERVATION_ROOT/resume.stderr" || resume_status=$?
printf '%s\n' "$resume_status" > "$RUN_CONTROL_OBSERVATION_ROOT/resume.exit" || exit 1
```

Expected observation: an accepted signal records one matching resolution, and
continued execution gives the resumed stage a new attempt identity. Exit zero
requires `succeeded`; a nonzero exit can contain a waiting, failed, blocked, or
rejected result. Retain stdout, stderr, and the actual exit status before any
follow-up. The command response alone does not prove adapter or external
process quiescence. If the response or exit status was lost, retain partial
output and record that result as `not observed`; do not invent an exit status.

After **every** submission, including rejection or a lost response, confirm
that the owner has exited and re-establish stopped run and adapter writers.
If ownership is unknown, retain the previous capture and command output and
stop; do not audit or submit again. Otherwise make new verified run and adapter
copies through [Inspect a Run](#inspect-a-run), require strict copied-journal
inspection, then capture its audit outputs and exit status. Keep the previous
captures and compare the new journal head, original identities, actual wait
transition, attempt budget, and external receipts with the submitted signal.
Do not reuse the pre-submission copy for this later audit.

Stop after an issuer mismatch, expired wait, digest mismatch, or stale signal.
Do not edit the journal or change the signal identity to force acceptance.
An exact retry needs the same bytes and key, a still-active wait, known effect
outcomes, and the complete fresh preservation sequence above. A replay after
resolution is stale or terminal and does not prove unchanged lock files.
Any later incident-owner-authorized canonical tail repair must retain the
verified original raw bytes and record the command and its actual changes.

> **Source evidence — signal contract and replay rules**
>
> **Claim:** A resume signal uses a closed eight-field envelope. Nova compares its caller-supplied issuer with the active wait. An identical retry has no second effect, and a conflicting retry fails.
>
> **Implementation:** [Nova validates wait identity, signal type, issuer, expiry, and issue time](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/core/execution/engine-snapshots.ts#L137-L144). [Nova makes identical retries idempotent and permits only one recorded signal for each wait](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/core/execution/engine-run.ts#L109-L122).
>
> **Contract or setting:** [The contract requires all eight envelope fields and rejects extra fields](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L777-L802).
>
> **Test evidence:** [The recovery test exercises accepted, repeated, stale, and expired signals](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/tests/verification/reliability/attempt-projection-recovery.test.mjs#L43-L76). The publication check also validates the example on this page against the canonical schema.
>
> **Revision:** `1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de`.
>
> **Limit:** The envelope has no signature. Its issuer is self-asserted by the
> caller, and repository checks do not authenticate the human or external
> identity provider.

## Recover After Interruption
<!-- operator-variant: run-control/recover-project -->
<!-- operator-variant: run-control/recover-explicit-graph -->
<!-- operator-variant: run-control/recovery-signal-required -->
<!-- operator-variant: run-control/recovery-terminal-run -->
<!-- operator-variant: run-control/recovery-cooldown-not-due -->
<!-- operator-variant: run-control/recovery-identity-mismatch -->
<!-- operator-variant: run-control/recovery-unresolved-effect -->
<!-- operator-variant: run-control/recovery-external-continuation -->

Recovery reopens durable state after a process interruption.
It does not approve a wait or resolve an uncertain external result.

Before every audit or recovery attempt after interruption, including a retry,
stop new admission, confirm that the prior owner has exited, and verify stopped
owning-adapter writers. Follow [Inspect a Run](#inspect-a-run) to preserve and
verify new raw run and adapter copies through their declared backup procedures.
Define its `preserve_run_state` helper and evidence-root inputs in this Bash
shell; require strict copied-journal parsing before the command. Stop
on an incomplete or corrupt journal. Audit can truncate an incomplete tail;
retain the original bytes before any permitted canonical repair. Confirm the
original platform, graph or project, package snapshot, run ID, storage root,
and configuration. Retain the audit output only after this preservation step. Reconcile every accepted
external effect that lacks a terminal receipt. Stop while any outcome remains
unknown.

Project form, with the original project bytes:

```bash
preserve_run_state || exit 1
recovery_status=0
npm run pipeline -- \
  --platform "$RUN_CONTROL_PLATFORM" \
  --project "<original-project.json>" \
  --recover "$RUN_CONTROL_RUN_ID" \
  > "$RUN_CONTROL_OBSERVATION_ROOT/recovery.stdout" \
  2> "$RUN_CONTROL_OBSERVATION_ROOT/recovery.stderr" || recovery_status=$?
printf '%s\n' "$recovery_status" > "$RUN_CONTROL_OBSERVATION_ROOT/recovery.exit" || exit 1
```

Explicit graph form:

```bash
preserve_run_state || exit 1
recovery_status=0
npm run pipeline -- \
  --platform "$RUN_CONTROL_PLATFORM" \
  --pipeline "<original-pipeline.json>" \
  --recover "$RUN_CONTROL_RUN_ID" \
  > "$RUN_CONTROL_OBSERVATION_ROOT/recovery.stdout" \
  2> "$RUN_CONTROL_OBSERVATION_ROOT/recovery.stderr" || recovery_status=$?
printf '%s\n' "$recovery_status" > "$RUN_CONTROL_OBSERVATION_ROOT/recovery.exit" || exit 1
```

Recovery must use the original graph and package snapshot.
Start a new run when governed configuration must change.

Expected observation: a permitted recovery writes one JSON result for the same
run ID. Exit code zero requires terminal status `succeeded`; retain a nonzero
result as a failed or blocked recovery, not as proof that restart completed.
[Recovery opens journals and can reconcile observer state before returning](https://github.com/datrab/kubeclaw/blob/2025f36306636b2e0c2c426447bf137d0574e11f/skills/nova/core/execution/engine-run.ts#L56-L68).
It can change journals, effects, observer state, and adapter stores, including
before a failed or blocked return. The pre-recovery capture
cannot prove the bytes that the next audit will open.

After **every** recovery attempt, including failure, rejection, or a lost
response:

1. Retain the pre-command raw copies, available command stdout/stderr, and
   actual exit status. Record a lost response or exit status as `not observed`.
   Confirm that the run owner has exited and re-establish stopped run
   and owning-adapter writers. Stop if ownership is unknown.
2. Reconfirm the original run, platform, project or graph, package, storage,
   and configuration identities. Make and verify new adapter-store copies
   through their declared backup procedures, then call `preserve_run_state`
   again through [Inspect a Run](#inspect-a-run). Require successful strict
   parsing of every copied run journal. Keep rejected bytes and stop on failure.
3. Only then run the audit block in [Inspect a Run](#inspect-a-run). It captures
   stdout, stderr, and the actual exit status in this new observation directory.
   Never reuse the pre-recovery copy or overwrite the earlier audit.
4. Compare the before/after audits, original graph and package identities,
   committed journal heads, external effects and receipts, and returned state.
   A successful recovery needs a final audit that agrees with terminal
   `succeeded` and contains no unexplained duplicate effect. A failed, waiting,
   blocked, or uncertain result remains that result.

Before any further recovery retry, repeat the original-identity, stopped-writer,
new raw run/adapter copy, and strict-inspection prerequisites. Later authorized
canonical tail repair retains the original bytes first and records its actual
changes; it does not turn an uncertain external outcome into success.

Use the exact failure before choosing the next action:

| Observation | Meaning | Safe action |
| --- | --- | --- |
| `RECOVERY_SIGNAL_REQUIRED:<wait-id>` | The run has an active wait; restart cannot invent its decision | Read the active wait and use [Approve or Resume a Wait](#approve-or-resume-a-wait) with one matching signal |
| `RECOVERY_RUN_TERMINAL` | The durable run already ended as succeeded, failed, blocked, or cancelled | Do not recover it; retain the audit and start a new governed run only for new work |
| `RECOVERY_COOLDOWN_NOT_DUE:<stage-id>:<time>` | A persisted retry time has not arrived | Do not bypass the clock; wait until the recorded time, then repeat the same recovery command with new stopped-writer raw run/adapter copies and strict inspection |
| `RECOVERY_GRAPH_*`, `RECOVERY_PIPELINE_ID_MISMATCH`, or `PROJECT_RECOVERY_RUN_MISMATCH` | The supplied graph, project, or run does not match durable state | Restore the original input bytes; never edit the snapshot or reuse the run ID for a changed graph |
| `RECOVERY_PINNED_PACKAGE_*`, `RECOVERY_PACKAGE_UPGRADE_*`, or `RECOVERY_REGISTRY_SNAPSHOT_INVALID` | Installed package identity differs from the recorded snapshot | Restore the recorded package set; use only the separate authorized package-upgrade procedure when its exact contract applies |
| `RECOVERY_RUNTIME_CONFIGURATION_MISMATCH` or `RECOVERY_DEPENDENCY_IDENTITY_MISMATCH` | Runtime configuration or dependency identity changed | Restore the recorded runtime configuration and dependency set, or start a new governed run |
| `RECOVERY_EFFECT_OUTCOME_UNRESOLVED:<effect-id>` | An accepted external request has no known receipt outcome | Query the external authority with the original identity and reconcile it before any recovery retry |
| `RECOVERY_EXTERNAL_CONTINUATION_REQUIRED:<effect-id>` | An external effect has a receipt, but its interrupted attempt needs explicit continuation | Follow the owning plugin or provider continuation contract; do not replay the effect through generic recovery |

Project recovery also validates the stored generated nodes and their encoding
selectors before it verifies the whole pinned graph. The implementation
authorities are
[`recovery.ts`](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/project/recovery.ts#L5-L50)
and
[`delivery-manifest.ts`](https://github.com/datrab/kubeclaw/blob/1c30980c132e3ff0b45dc8eeaf4b46a37d6d77de/skills/nova/project/delivery-manifest.ts#L6-L33).
These are operator-visible identity mismatches, not permissions to repair the
stored graph:

| Exact outcome | Failed stored authority | Safe action |
| --- | --- | --- |
| `PROJECT_RECOVERY_SOURCE_INVALID` | Exactly one generated `source-preflight` node is absent or has the wrong type | Stop; restore the original durable run bytes from the owning store or retain the run as unrecoverable |
| `PROJECT_RECOVERY_REVIEW_NODES_MISMATCH` | Generated Review node identities differ from the project compiler | Stop; use the original project/compiler/package snapshot |
| `PROJECT_RECOVERY_REVIEW_SEMANTICS_INVALID` | A stored Review semantic or report encoding is unsupported | Stop; restore the exact compatible package snapshot; never rewrite the node |
| `PROJECT_RECOVERY_REVIEW_SEMANTICS_MIXED` | Review nodes contain mixed semantic generations | Stop; treat the durable graph as inconsistent and preserve it for diagnosis |
| `PROJECT_RECOVERY_REPORT_ENCODING_INVALID` | A Review report encoding is unsupported | Stop; restore the compatible package snapshot |
| `PROJECT_RECOVERY_REPORT_ENCODING_MIXED` | Review nodes contain mixed report encodings | Stop; preserve the inconsistent graph; do not select a mode by majority |
| `PROJECT_RECOVERY_SUMMARY_NODE_INVALID` | The one required `project-summary` identity/type pairing is missing, duplicated, or inconsistent | Stop; restore the original durable graph bytes or retain the run as unrecoverable |
| `PROJECT_RECOVERY_DELIVERY_SELECTOR_FOREIGN` | A non-summary node owns `deliveryManifestEncoding` | Stop; do not move or delete the foreign selector in durable state |
| `PROJECT_RECOVERY_DELIVERY_MANIFEST_ENCODING_INVALID` | The stored summary selector shape or value is unsupported | Stop; restore the compatible project/package snapshot |
| `PROJECT_DELIVERY_MANIFEST_ENCODING_INVALID` | A caller supplied a delivery-manifest mode outside the supported legacy/current pair | Correct the caller configuration before compilation; do not mutate an existing run |

Recovery has no separate temporary runtime object to clean up. Preserve all
before/after raw run and adapter captures, manifests, partial or rejected tails,
audits, exact commands, output, exit status, effect queries and receipts, repair
changes, and the final decision under [Evidence to Retain](#evidence-to-retain).
Do not delete a `nova-raw-state.*` observation directory because its digest was
recorded or a later command passed. Only a successful recovery result plus the
matching final audit and reconciled external receipts proves the intended
recovery; containment or a completed audit alone does not prove success.

## Cancellation Boundary

The current pipeline CLI has no supported operator cancellation command.
Do not present process termination as durable run cancellation.

An internal abort signal can cancel active work during runtime shutdown.
That mechanism is not an external operator control surface.

When urgent containment is necessary:

1. Preserve available command, process, and component observations through
   supported paths. Do not audit while run or adapter writers remain active.
2. Stop new admission through the owning service boundary.
3. Use the approved incident process for workload containment.
4. Reconcile every accepted external effect.
5. After the owner has exited and run/adapter writers are stopped, complete
   [Inspect a Run](#inspect-a-run) before audit or another run-control command.
   Preserve new verified raw run/adapter copies and strictly inspect the copied
   journals. Unknown ownership or rejected bytes stops this inspection path.
6. Do not claim `cancelled` unless durable lifecycle evidence records it.

This is an implementation limit, not a documentation shortcut.

## Inspect Results and Demo Readiness

A successful run can report `technical-only` or `demo-handoff` completion.
Only the latter can report `ready-for-acceptance`.

Human acceptance remains a separate action.
It binds to the exact source, run, result, and exposed demo.

Check result artifacts through their owning store.
Verify content digests before sharing or importing them.

For exposure and handoff, follow [Deliver a Demo](demo-delivery.md#canonical-demo-delivery-procedure).
That procedure supplies a local contract rehearsal and identifies the additional
authorities required for live delivery. KubeClaw does not supply a complete
live demo-delivery journey. Stop before Tailnet exposure until product
operations has registered the deployment procedure, stage configuration,
exposure receipts, and cleanup required by that canonical procedure.

## Operate Prism

Use the [canonical Prism and Studio procedure](prism-studio.md#canonical-prism-and-studio-procedure).
This page does not define a second deployment, health, access, or recovery path.

## Operate Role Deployments

Use targeted commands when one role changes:

```bash
assert_cluster_binding
./scripts/deploy.sh agent nova
./scripts/deploy.sh agent buster
./scripts/deploy.sh agent prism
```

Use `--with-code` only for Nova or Buster.
Prism uses its dedicated multi-workload release.

After a role change, run its smoke command and inspect its selected image ID.
Do not restart every role to hide one role-specific failure.

## Safe Retry Decision

Every permitted audit, recovery, or signal retry must first repeat the
original-identity, stopped run/adapter writer, new verified raw run/adapter copy,
and strict copied-journal inspection steps in [Inspect a Run](#inspect-a-run).
An earlier successful capture does not cover a later command's storage state.
Stop if a required check or owning-store backup procedure is unavailable.

| Condition | Next action |
| --- | --- |
| Command failed before durable request acceptance, with a verified complete journal and unchanged active authority | Correct the rejected input and review one submission |
| Durable request exists with a terminal failure | Follow its declared retry or repair decision |
| Request exists and provider outcome is absent | Inspect through a documented provider status operation; if the outcome remains uncertain, preserve evidence, stop, and escalate |
| Provider completed but local response was lost | Use an exact provider-specific idempotent import operation only when its contract documents one; otherwise preserve evidence, stop, and escalate |
| Wait remains active, unexpired, with complete history and no prior resolution | Follow [Approve or Resume a Wait](#approve-or-resume-a-wait), including new stopped-writer raw run/adapter copies and strict inspection before each submission; retain exact signal bytes and identities |
| Wait expired or resolved, or signal identity conflicts | Stop; preserve raw state before audit. Do not issue a new signal identity to force acceptance |
| Graph, package, or policy digest changed | Start a new governed run |
| Terminal run | Do not recover or resume it |

There is no generic Core operation that reconciles an uncertain external
effect and imports its result. See the
[current reconciliation boundary](../status/open-issues.md#uncertain-external-effects-have-no-supported-reconciliation-and-result-import-operation).
A provider-specific normal result import is safe only when that provider
documents the request identity, result identity, idempotency rule, authority,
and durable transition. External inspection alone does not authorize a retry,
resume, journal edit, or result import.

## Evidence to Retain

- Platform, project, graph, and signal digests.
- Complete command and nonsecret arguments.
- Start output and run identity.
- New verified raw run and owning-adapter copies and manifests before every
  audit, recovery, resume, retry, and wrong-signal check, and after each command
  before the next audit. Keep rejected or partial bytes as evidence.
- Audit output before and after recovery or signal handling, with any tail repair recorded.
- Provider request, receipt, and reconciliation record.
- Artifact identities and verified digests.
- Prism decision and demo identity when applicable.
- Unsupported-control finding when an operation stops at a missing surface.

The incident audit owner must record each capture's durable location, access
identity, retention period, and final-disposition authority. Retain complete
raw run and adapter bytes, manifests, rejected tails, exact signal bytes,
command records, and actual repair-change evidence for that period. A digest
records integrity; it cannot replace the bytes. Keep these captures separate
from disposable working copies. If evidence must move, use the audit owner's
verified complete-copy procedure and retain its receipt; stop if byte
preservation or retention cannot be proved.

Only named disposable candidate files or redundant working signal copies may
be removed after their prescribed retention and the owner's recorded
final-disposition decision. First prove that the original signal bytes and
all required evidence remain in the protected retained capture. Original raw
observation directories and their contents require the audit owner's explicit
final disposition after the retention period; ordinary run cleanup does not
authorize their removal.

## Read Next

Use [Observe and Diagnose](diagnose.md) for failed or slow work.
Use [Back Up and Recover](recovery.md) for data or access loss.

## Cluster Diagnostics Through Native Ops MCP

Nova and Buster expose central MCP functions as native agent tools after the
selected chart is deployed. Ask for a namespace overview, Pod state, recent
logs or metrics in an authorized namespace; the agent chooses the typed tool.
No shell command or manual plugin installation is required. `exec_pod` is a
separate effectful request. Reconcile effects after a lost response; do not
automatically repeat it.

Buster reads and executes only in existing/future `test*` namespaces. Nova has
`test*` plus its existing explicit scope. Ops reads every namespace, with
separate restricted exec grants. See the [grant matrix](../understand/ops-mcp.md#authorization-and-data-exposure)
and [connection diagnosis](../understand/ops-mcp.md#failure-and-recovery).
The raw Kubernetes commands elsewhere in this guide require an independently
authorized administrator; agent gateways use MCP and receive no kubeconfig. Buster workers retain their
separate direct lease-scoped workload/test Kubernetes authority.
