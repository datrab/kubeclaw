# Rehearse Human Approval and Resume

Status: source and bounded local checks available; full local lifecycle and deployment execution open
Audience: pipeline authors and operators
Owner: product integration maintainers; platform operations owns execution access
Evidence: skills/nova/plugins/human-approval; skills/nova/core/execution; skills/common/plugins/wait-store; skills/common/plugins/operator-messaging
Applies to: `pipeline-definition.v2`, `pipeline-platform.v2`, `resume-signal.v2`
Last verified: 2026-10-11; bounded source and contract evidence only; no successful full local lifecycle or deployment evidence
Source revision: `ffb0b7a6393f7db44eb948f3ff8346b4b4b50f1a`; wait/journal corrections checked at `929aadbad08b41e7a8504950f05dc0f526b706d6`

This guide supplies a complete disposable approval input set. Nova executes
the installed human-approval stage, persists a wait, and sends its request to a
notification receiver. An operator then supplies one decision. Nova records
that decision and starts a second attempt. The second attempt returns `passed`
without sending another notification.

The [canonical run-control procedure](../operate.md#canonical-run-control-procedure)
owns the start, audit, signal, and recovery rules. Follow those rules throughout
this exercise. The concrete commands below bind that procedure to this input set.
An approval here concerns the disposable rehearsal request. It is not demo or
product acceptance.

**Execution status:** input schemas, focused plugin boundary/guidance checks,
receiver contract checks, and runtime registration validation passed within
their local scope. Runtime validation selected the installed stage and four
adapters; it did not start an approval run. These checks do not establish a
completed local wait/resume lifecycle. The full local rehearsal has no successful
execution evidence.
The mandatory deployment wait/resume run remains open and unexecuted.

## Input Set

Use these three files from the same checkout:

| Input | Exact file | Meaning |
| --- | --- | --- |
| Pipeline | [approval.pipeline.json](wait-resume/approval.pipeline.json) | One `approval` stage of type `kubeclaw.decision.human-approval`; no dependent stage or external product change. |
| Platform template | [platform.template.json](wait-resume/platform.template.json) | Exact registrations, grants, loopback receiver, secret selector, and storage placeholders. Materialize a private copy before use. |
| Signal template | [signal.template.json](wait-resume/signal.template.json) | All eight required envelope fields and the approval payload. Replace its identities and deliberately stale time from the new durable wait. Never submit the unchanged template. |

The wait-stage package is `skills/nova/plugins/human-approval/plugin.json`,
registration `kubeclaw.human-approval:approval`, module `src/stage.ts`, export
`execute`. This exercise uses the generic approval registration, not the
separate architecture approval registration. Generic approval accepts a summary
and an operator decision; it does not bind a source/report digest. Use a
separate contract when that binding is required.

The pipeline sets `maxAttempts: 2`, `maxRemediationCycles: 0`,
`timeoutMs: 10000`, and `timeoutMinutes: 60`. The initial waiting attempt consumes
one attempt. The resumed attempt consumes the second. Setting `maxAttempts: 1`
would exhaust the attempt budget when the stage tries to wait. The 60-minute
expiry limits when Core accepts the decision. It is distinct from the 10-second
stage execution limit. This guide schedules no retry or remediation.

The platform selects these providers and grants:

| Consumer | Capability and provider | Effective scope |
| --- | --- | --- |
| `kubeclaw.human-approval:approval` | `signal.wait` → `kubeclaw.wait-store:waits` | `approval.resolved`, issuer ID `operator:local` |
| Same stage | `operator.request` → `kubeclaw.operator-messaging:operator` | Target `operators` |
| Operator adapter | `network.http` → `kubeclaw.network-http:http` | Loopback origin `http://127.0.0.1:18765`; POST, listed headers, and byte/time limits also enforced by adapter configuration |
| Operator adapter | `secrets.read` → `kubeclaw.secret-resolver:secrets` | Secret name `operator.webhook`, selected from environment variable `WAIT_REHEARSAL_WEBHOOK_KEY` |

The notification adapter signs its HTTP body with an HMAC key. That transport
signature authenticates the notification to this local receiver. The later
resume envelope is **unsigned**. Its issuer is self-asserted by the file's
creator. Restricted signal creation and CLI access are the effective operator
authority; issuer matching does not authenticate a person.

> **Source evidence — installed stage and budgets**
>
> **Claim:** Generic approval creates one wait and notification, then applies resumed guidance in a separate attempt.
>
> **Implementation:** [`execute` branches on guidance before creating effects](https://github.com/datrab/kubeclaw/blob/ffb0b7a6393f7db44eb948f3ff8346b4b4b50f1a/skills/nova/plugins/human-approval/src/stage.ts#L13-L54). [The reducer counts completed attempts and stops an exhausted wait](https://github.com/datrab/kubeclaw/blob/ffb0b7a6393f7db44eb948f3ff8346b4b4b50f1a/skills/nova/core/lifecycle/reducer.ts#L69-L72), [wait projection](https://github.com/datrab/kubeclaw/blob/ffb0b7a6393f7db44eb948f3ff8346b4b4b50f1a/skills/nova/core/lifecycle/reducer.ts#L96-L101), [attempt count](https://github.com/datrab/kubeclaw/blob/ffb0b7a6393f7db44eb948f3ff8346b4b4b50f1a/skills/nova/core/lifecycle/reducer.ts#L124-L128).
>
> **Contract or setting:** [The installed registration declares both required capabilities](https://github.com/datrab/kubeclaw/blob/ffb0b7a6393f7db44eb948f3ff8346b4b4b50f1a/skills/nova/plugins/human-approval/plugin.json#L5-L19). [`parseApprovalGuidance` validates decision, payload issuer, and reason](https://github.com/datrab/kubeclaw/blob/ffb0b7a6393f7db44eb948f3ff8346b4b4b50f1a/skills/nova/plugins/human-approval/src/approval.ts#L102-L129).
>
> **Test evidence:** [The production-package local HTTP fixture asserts one notification and two causal attempts](https://github.com/datrab/kubeclaw/blob/ffb0b7a6393f7db44eb948f3ff8346b4b4b50f1a/tests/verification/reliability/operator-retention-authority-fixture.test.mjs#L83-L125). Focused plugin boundary and guidance unit checks passed locally. These checks do not prove a completed lifecycle.
>
> **Revision:** `ffb0b7a6393f7db44eb948f3ff8346b4b4b50f1a`.
>
> **Limit:** Source and unit checks do not prove a deployed approval flow or authenticated human identity.

## Starting Conditions

Use an isolated Linux operator host with Node.js 24 and the paired npm version.
Complete [the canonical checkout and dependency setup](../quickstart.md#locked-dependency-installation).
Run all commands from that checkout, in Bash, as the same restricted operator.
Define `preserve_run_state` from [Inspect a Run](../operate.md#inspect-a-run) in
that terminal before starting. Its platform and run variables are bound below.
Keep this function available until the final audit.
The repository and installed packages must stay unchanged during the run.
Record the full commit and require a clean checkout before the measured run.
These instructions apply to the source revision above; a changed package or
graph requires a new governed run.

The host must have `/usr/bin/flock` with `--exclusive`, `--timeout`, and
`--conflict-exit-code`. Test the exact interface on a disposable file:

```bash
lock_probe=$(mktemp)
if /usr/bin/flock --exclusive --timeout 1 --conflict-exit-code 75 "$lock_probe" true; then
  rm "$lock_probe"
else
  probe_status=$?
  rm "$lock_probe"
  printf 'Stop: required flock interface failed, exit %s\n' "$probe_status" >&2
  exit 1
fi
```

Stop on failure. A `PATH` override cannot replace the fixed executable. Do not
disable locking or substitute a lock mock. Use a platform-approved operator
host that passes this exact prerequisite before continuing.

The local exercise needs an unused loopback port 18765, a new private directory
outside the checkout, capacity for Core/delivery/wait records, and permission to
start and stop the disposable receiver. It requires no cluster or live provider.
Stop on a bind error; do not use an unrelated service already on that port.

## Prepare the Private Inputs and Receiver

These setup steps are for the local rehearsal only. For a deployment, first
complete [Deployment Registration](#deployment-registration).

Create a new private directory and materialize the platform. The loader resolves
installation and Core paths from the platform file's directory. Adapter roots
are set explicitly to absolute paths by this step.

```bash
umask 077
export WAIT_REHEARSAL_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/wait-resume.XXXXXXXX")
export WAIT_REHEARSAL_WEBHOOK_KEY=$(node --input-type=module -e 'import crypto from "node:crypto"; process.stdout.write(crypto.randomBytes(32).toString("hex"));')
export WAIT_REHEARSAL_RUN_ID="run:wait-resume:$(node --input-type=module -e 'import crypto from "node:crypto"; process.stdout.write(crypto.randomUUID());')"
node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
const root = process.env.WAIT_REHEARSAL_ROOT;
const base = 'docs/site/use/workflows/wait-resume/';
const originals = ['approval.pipeline.json', 'platform.template.json', 'signal.template.json'];
const inputManifest = originals.map(name => {
  const file = path.join(root, name);
  fs.copyFileSync(base + name, file, fs.constants.COPYFILE_EXCL);
  const bytes = fs.readFileSync(file);
  return { path: name, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
});
fs.writeFileSync(path.join(root, 'input-manifest.json'), JSON.stringify(inputManifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
const p = JSON.parse(fs.readFileSync(path.join(root, 'platform.template.json'), 'utf8'));
p.installationRoots = ['skills/common/plugins', 'skills/nova/plugins'].map(x => path.resolve(x));
p.trustedBuiltinRoots = [...p.installationRoots];
p.storageRoot = path.join(root, 'core');
p.adapters['kubeclaw.wait-store:waits'].root = path.join(root, 'waits');
p.adapters['kubeclaw.operator-messaging:operator'].deliveryRoot = path.join(root, 'deliveries');
fs.writeFileSync(path.join(root, 'platform.json'), JSON.stringify(p, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
fs.copyFileSync(path.join(root, 'approval.pipeline.json'), path.join(root, 'pipeline.json'), fs.constants.COPYFILE_EXCL);
fs.writeFileSync(path.join(root, 'run-id.txt'), process.env.WAIT_REHEARSAL_RUN_ID + '\n', { flag: 'wx' });
fs.writeFileSync(path.join(root, 'source-commit.txt'), execFileSync('git', ['rev-parse', 'HEAD']), { flag: 'wx' });
NODE
```

The setup copies all three original inputs and records their exact byte counts
and SHA-256 digests in `input-manifest.json`. Materialization and signal creation
use those private copies. Keep the originals unchanged.

The setup command generates the key for this disposable receiver; it is not a
deployment credential. Do not print it, write it to evidence, or reuse it for deployment.

Start this receiver as a child of the same Bash terminal. Leave that terminal
open until cleanup. It checks the real adapter's HMAC
header and stores the delivered body and idempotency identity, without the key
or signature. A 202 response supplies a notification receipt, not approval.

```bash
node --input-type=module > "$WAIT_REHEARSAL_ROOT/receiver.stdout" 2> "$WAIT_REHEARSAL_ROOT/receiver.stderr" <<'NODE' &
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
const root = process.env.WAIT_REHEARSAL_ROOT;
const key = process.env.WAIT_REHEARSAL_WEBHOOK_KEY;
if (!root || !key) throw new Error('Restricted receiver configuration is required');
const file = path.join(root, 'receiver.jsonl');
const server = http.createServer(async (req, res) => {
  if (req.method !== 'POST' || req.url !== '/messages') { res.writeHead(404); res.end(); return; }
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 16384) { res.writeHead(413); res.end(); return; }
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks).toString('utf8');
  const id = req.headers['idempotency-key'];
  const signature = 'v1=' + crypto.createHmac('sha256', key).update(`${id}.${body}`).digest('hex');
  if (!id || req.headers['x-kubeclaw-signature'] !== signature) { res.writeHead(403); res.end(); return; }
  fs.appendFileSync(file, JSON.stringify({ idempotencyKey: id, payload: JSON.parse(body) }) + '\n', { mode: 0o600 });
  res.writeHead(202, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ messageId: 'wait-rehearsal-local' }));
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(18765, '127.0.0.1', () => console.log('Local receiver ready on 127.0.0.1:18765'));
process.on('SIGINT', () => server.close());
NODE
WAIT_REHEARSAL_RECEIVER_PID=$!
for receiver_check in {1..50}; do
  test -s "$WAIT_REHEARSAL_ROOT/receiver.stdout" && break
  kill -0 "$WAIT_REHEARSAL_RECEIVER_PID" || break
  sleep 0.1
done
test -s "$WAIT_REHEARSAL_ROOT/receiver.stdout" || { cat "$WAIT_REHEARSAL_ROOT/receiver.stderr" >&2; exit 1; }
```

Require the readiness line in `receiver.stdout`. Keep the child process ID for
cleanup. Keep the key out of command arguments and logs.

## Validate Registration and Start

Validate the exact runtime using the exported Nova validator. This performs
package discovery, grant checks, module activation, and stage input checks.
It does not execute stages, send the approval request, or prove receiver
reachability.

```bash
node --input-type=module <<'NODE'
import path from 'node:path';
import { loadPlatformConfig } from '@kubeclaw/plugin-foundation/config/platform';
import { loadPipelineDefinition, validatePipelineRuntimeV2 } from '@kubeclaw/nova-core';
const root = process.env.WAIT_REHEARSAL_ROOT;
const platform = loadPlatformConfig(path.join(root, 'platform.json'));
const pipeline = loadPipelineDefinition(path.join(root, 'pipeline.json'));
console.log(JSON.stringify(await validatePipelineRuntimeV2(platform, pipeline)));
NODE
```

Stop if validation fails. Keep its diagnostic and correct the private input
before starting a run. An explicit graph uses this validation path; the
project-only `--compile` action does not compile this graph.

Start with the canonical explicit-graph command, and retain both outputs and
the exit status. These commands intentionally record exit 1 for `waiting`.
They do not turn every nonzero result into an accepted observation.

```bash
start_status=0
npm run pipeline -- \
  --platform "$WAIT_REHEARSAL_ROOT/platform.json" \
  --pipeline "$WAIT_REHEARSAL_ROOT/pipeline.json" \
  --run-id "$WAIT_REHEARSAL_RUN_ID" \
  > "$WAIT_REHEARSAL_ROOT/start.stdout" 2> "$WAIT_REHEARSAL_ROOT/start.stderr" || start_status=$?
printf '%s\n' "$start_status" > "$WAIT_REHEARSAL_ROOT/start.exit"
```

Require start exit 1 and JSON `status: waiting` before continuing. Stop on a
start error or any other state. Confirm the command exited and no writer owns
this run. The receiver has finished its one request. Preserve the private
Core run and the three known adapter/receiver files before the first audit.
Define this helper in the same terminal. It uses the canonical run copy, then
copies each store without parsing or removing partial bytes. It retains adapter
bytes even if the Core copy has an incomplete journal; its nonzero result stops
before audit:

```bash
export RUN_CONTROL_PLATFORM="$WAIT_REHEARSAL_ROOT/platform.json"
export RUN_CONTROL_RUN_ID="$WAIT_REHEARSAL_RUN_ID"
preserve_rehearsal_state() {
  preservation_status=0
  preserve_run_state || preservation_status=$?
  node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const source = process.env.WAIT_REHEARSAL_ROOT;
const target = process.env.RUN_CONTROL_OBSERVATION_ROOT;
const files = ['waits/records/store.json', 'deliveries/records/store.json', 'receiver.jsonl'];
const manifest = files.map(file => {
  const original = path.join(source, file);
  if (!fs.lstatSync(original).isFile()) throw new Error('Regular store file required: ' + file);
  const bytes = fs.readFileSync(original);
  const copy = path.join(target, 'adapters', file);
  fs.mkdirSync(path.dirname(copy), { recursive: true, mode: 0o700 });
  fs.writeFileSync(copy, bytes, { flag: 'wx', mode: 0o600 });
  assert.deepEqual(fs.readFileSync(original), bytes);
  assert.deepEqual(fs.readFileSync(copy), bytes);
  return { path: file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
});
fs.writeFileSync(path.join(target, 'adapter-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
NODE
  adapter_copy_status=$?
  test "$preservation_status" -eq 0 && test "$adapter_copy_status" -eq 0
}
preserve_rehearsal_state || exit 1
printf '%s\n' "$RUN_CONTROL_OBSERVATION_ROOT" > "$WAIT_REHEARSAL_ROOT/wait.raw-state.txt"
cp -R -- "$RUN_CONTROL_OBSERVATION_ROOT" "$WAIT_REHEARSAL_ROOT/wait.raw-state" || exit 1
npm run pipeline -- \
  --platform "$WAIT_REHEARSAL_ROOT/platform.json" \
  --audit "$WAIT_REHEARSAL_RUN_ID" \
  > "$WAIT_REHEARSAL_ROOT/wait.audit.stdout" 2> "$WAIT_REHEARSAL_ROOT/wait.audit.stderr"
printf '%s\n' "$?" > "$WAIT_REHEARSAL_ROOT/wait.audit.exit"
```

Require start exit 1 with JSON `status: waiting`, stage `approval` waiting,
`attemptsUsed: 1`, and audit exit 0. A start error, `failed`, or `blocked` is a
stop. npm writes its script banner before the CLI JSON; retain the whole output.

Read the durable wait with the strict non-mutating parser. It rejects
incomplete records and sequence or hash errors; it does not create locks or
repair the journal. Stop on failure and preserve raw bytes before any audit or
recovery. Read from the hash-verified journal, not from a copied example
or the notification alone. This script also creates the valid signal and the
two declared negative inputs. It records the creation time and budget summary.

```bash
node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseHashJournal } from './skills/common/plugin-runtime/foundation/observability/hash-journal.ts';
import { runRoot } from './skills/nova/core/execution/run-root.ts';
const root = process.env.WAIT_REHEARSAL_ROOT;
const run = runRoot(path.join(root, 'core'), process.env.WAIT_REHEARSAL_RUN_ID);
const eventsFile = path.join(run, 'events.jsonl');
const records = parseHashJournal(fs.readFileSync(eventsFile), eventsFile);
const completed = records.filter(r => r.entry.type === 'attempt.completed');
if (completed.length !== 1 || completed[0].entry.payload.result.outcome !== 'wait') throw new Error('Expected one completed waiting attempt');
const creation = completed[0].entry;
const wait = creation.payload.result.wait;
if (wait.signalType !== 'approval.resolved' || wait.authorizedIssuer.id !== 'operator:local' || Date.now() >= Date.parse(wait.expiresAt)) throw new Error('Unexpected or expired wait');
const signal = JSON.parse(fs.readFileSync(path.join(root, 'signal.template.json'), 'utf8'));
const id = 'signal:' + crypto.randomUUID();
Object.assign(signal, { signalId: id, idempotencyKey: id, waitId: wait.waitId, signalType: wait.signalType, issuer: wait.authorizedIssuer, issuedAt: new Date().toISOString() });
signal.payload.issuer = wait.authorizedIssuer;
const write = (name, value) => fs.writeFileSync(path.join(root, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
write('active-wait.json', { wait, createdAt: creation.occurredAt, journalHead: records.at(-1).hash, attemptsUsed: 1 });
write('valid.signal.json', signal);
write('wrong-wait.signal.json', { ...signal, waitId: 'wait:wrong-rehearsal' });
write('wrong-issuer.signal.json', { ...signal, issuer: { type: 'operator', id: 'operator:wrong' } });
fs.writeFileSync(path.join(root, 'run-root.txt'), run + '\n', { flag: 'wx' });
NODE
```

Read `active-wait.json` and compare its summary, issuer, wait identity, signal
type, and expiry with the receiver body. Generic waits can have explicit null
expiry; this human-approval input always sets a date-time. The signal must be
issued at or after the recorded creation time, and Core's current clock must
remain before expiry. Core does not check an upper bound on `issuedAt` against
its current time or expiry. Set the accurate operator time; do not treat this
minimum-time check as rejection of a future timestamp. Review the decision
before submission.

## Observe the Durable Authority

The run root recorded in `run-root.txt` contains `events.jsonl`, `effects.jsonl`,
graph/package snapshots, and, after valid resume, `signals.jsonl`. The adapter
stores are `$WAIT_REHEARSAL_ROOT/waits/records/store.json` and
`$WAIT_REHEARSAL_ROOT/deliveries/records/store.json`. Read them without editing.

In `effects.jsonl`, match the `signal.wait` create request to its completed
receipt and returned `wait-request.v2`. Match the `operator.request` publish
request to its accepted and completed records. The notification receipt has
`accepted: true`, target `operators`, HTTP status 202, and the local message ID.
Its request idempotency key matches `receiver.jsonl`. The HMAC is a transport
check; this receipt cannot resolve the wait.

In the delivery store, retain the `notification-delivery-request.v1` and
`notification-delivery-receipt.v1` records, bound to the original attempt and
request. In the wait store, retain the `wait-value.v1` record with the same
wait. The wait store keeps creation evidence after resolution; Core's journal
determines whether the wait remains active.

> **Source evidence — input validation, notification, and durable records**
>
> **Claim:** The input set uses installed registrations and a notification receipt distinct from Core's later signal resolution.
>
> **Implementation:** [The exported validator prepares the runtime and checks the graph](https://github.com/datrab/kubeclaw/blob/ffb0b7a6393f7db44eb948f3ff8346b4b4b50f1a/skills/nova/core/execution/engine.ts#L18-L22). [The runner checks stage schemas against their owners](https://github.com/datrab/kubeclaw/blob/ffb0b7a6393f7db44eb948f3ff8346b4b4b50f1a/skills/nova/core/execution/runner.ts#L40-L47). [The platform loader resolves paths](https://github.com/datrab/kubeclaw/blob/ffb0b7a6393f7db44eb948f3ff8346b4b4b50f1a/skills/common/plugin-runtime/foundation/config/platform.ts#L53-L69). [Operator delivery signs the exact body and records the response](https://github.com/datrab/kubeclaw/blob/ffb0b7a6393f7db44eb948f3ff8346b4b4b50f1a/skills/common/plugins/operator-messaging/src/adapter.ts#L44-L62). [Wait creation derives an identity from the effect key and persists it](https://github.com/datrab/kubeclaw/blob/ffb0b7a6393f7db44eb948f3ff8346b4b4b50f1a/skills/common/plugins/wait-store/src/adapter.ts#L214-L237). [Audit reads the verified journal and reports its head](https://github.com/datrab/kubeclaw/blob/ffb0b7a6393f7db44eb948f3ff8346b4b4b50f1a/skills/nova/core/telemetry/audit.ts#L14-L27).
>
> **Contract or setting:** [Approval config](https://github.com/datrab/kubeclaw/blob/ffb0b7a6393f7db44eb948f3ff8346b4b4b50f1a/skills/nova/plugins/human-approval/schemas/config.schema.json#L1-L29) and [approval input](https://github.com/datrab/kubeclaw/blob/ffb0b7a6393f7db44eb948f3ff8346b4b4b50f1a/skills/nova/plugins/human-approval/schemas/input.schema.json#L1-L14) constrain the stage. [Notification target and quotas](https://github.com/datrab/kubeclaw/blob/ffb0b7a6393f7db44eb948f3ff8346b4b4b50f1a/skills/common/plugins/operator-messaging/schemas/config.schema.json#L1-L70) constrain delivery. [HTTP origin, methods, headers, and limits](https://github.com/datrab/kubeclaw/blob/ffb0b7a6393f7db44eb948f3ff8346b4b4b50f1a/skills/common/plugins/network-http/schemas/config.schema.json#L1-L1) constrain network access. [Environment secret selector](https://github.com/datrab/kubeclaw/blob/ffb0b7a6393f7db44eb948f3ff8346b4b4b50f1a/skills/common/plugins/secret-resolver/schemas/config.schema.json#L1-L1) selects the key source.
>
> **Test evidence:** [The installed-package test identifies original effects, HMAC body, wait identity, delivery record, and receipt](https://github.com/datrab/kubeclaw/blob/ffb0b7a6393f7db44eb948f3ff8346b4b4b50f1a/tests/verification/reliability/operator-retention-authority-fixture.test.mjs#L60-L108). Published input schema checks and exported runtime validation passed locally. Those checks do not execute or prove the complete installed-package HTTP lifecycle.
>
> **Revision:** `ffb0b7a6393f7db44eb948f3ff8346b4b4b50f1a`.
>
> **Limit:** Validation does not execute the receiver or the stage. The local receiver has no reconciliation lookup endpoint; uncertain delivery requires a safe stop.

Before testing signals, define this read-only observation helper. It records
SHA-256 and byte count, including the absence of `signals.jsonl`, plus attempt
and resolution counts. A comparison fails on any difference. It does not edit
the authority files. Preserve the full files with these observations.

```bash
authority_snapshot() {
  node --input-type=module - "$1" "${2:-}" <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { parseHashJournal } from './skills/common/plugin-runtime/foundation/observability/hash-journal.ts';
const root = process.env.WAIT_REHEARSAL_ROOT;
const run = fs.readFileSync(path.join(root, 'run-root.txt'), 'utf8').trim();
const files = {
  events: path.join(run, 'events.jsonl'), effects: path.join(run, 'effects.jsonl'),
  signals: path.join(run, 'signals.jsonl'),
  waits: path.join(root, 'waits/records/store.json'),
  deliveries: path.join(root, 'deliveries/records/store.json'),
  receiver: path.join(root, 'receiver.jsonl'),
};
const hashes = Object.fromEntries(Object.entries(files).map(([name, file]) => {
  if (!fs.existsSync(file)) { if (name !== 'signals') throw new Error('Missing authority: ' + name); return [name, null]; }
  const bytes = fs.readFileSync(file);
  return [name, { bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }];
}));
const journals = ['events', 'effects', 'signals'];
for (const name of journals) {
  if (hashes[name] !== null) parseHashJournal(fs.readFileSync(files[name]), files[name]);
}
const events = parseHashJournal(fs.readFileSync(files.events), files.events).map(record => record.entry);
const completed = events.filter(e => e.type === 'attempt.completed');
const snapshot = { hashes, attemptsUsed: completed.length,
  outcomes: completed.map(e => e.payload.result.outcome),
  resolutions: events.filter(e => e.type === 'wait.resolved').length };
const [name, compare] = process.argv.slice(2);
if (compare) assert.deepEqual(snapshot, JSON.parse(fs.readFileSync(path.join(root, compare + '.authority.json'), 'utf8')));
fs.writeFileSync(path.join(root, name + '.authority.json'), JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
NODE
}
authority_snapshot before
```

## Reject the Wrong Inputs, Then Resume Once

This helper invokes only the canonical explicit-graph resume command. It
retains each response and status. Run it in the original operator terminal.

```bash
resume_case() {
  case_name=$1
  signal_file=$2
  resume_status=0
  npm run pipeline -- \
    --platform "$WAIT_REHEARSAL_ROOT/platform.json" \
    --pipeline "$WAIT_REHEARSAL_ROOT/pipeline.json" \
    --run-id "$WAIT_REHEARSAL_RUN_ID" \
    --signal "$signal_file" \
    > "$WAIT_REHEARSAL_ROOT/$case_name.stdout" 2> "$WAIT_REHEARSAL_ROOT/$case_name.stderr" || resume_status=$?
  printf '%s\n' "$resume_status" > "$WAIT_REHEARSAL_ROOT/$case_name.exit"
}
resume_case wrong-wait "$WAIT_REHEARSAL_ROOT/wrong-wait.signal.json"
authority_snapshot after-wrong-wait before
```

Require exit 1 and `WAIT_UNKNOWN_OR_STALE:wait:wrong-rehearsal`. Compare the
five retained authority files with the before checksums; require unchanged
bytes and absent signal journal. Stop on any changed authority or other error.

Then test the wrong envelope issuer:

```bash
resume_case wrong-issuer "$WAIT_REHEARSAL_ROOT/wrong-issuer.signal.json"
authority_snapshot after-wrong-issuer before
```

Require exit 1 and `WAIT_ISSUER_DENIED:operator:operator:wrong`. Require the same
unchanged authority files and absent signal journal. The payload issuer stays
unchanged in this negative case, so it tests Core's envelope issuer matching.
Do not correct a rejected signal by editing durable state.

Submit the reviewed valid bytes only after both negative checks pass:

```bash
resume_case valid "$WAIT_REHEARSAL_ROOT/valid.signal.json"
```

Require valid exit 0 and `status: succeeded` before the final audit. If the
response is lost, nonzero, or uncertain, stop and use the preservation and
reconciliation steps in [Failure and Interruption](#failure-and-interruption).
After the command exits and all writers are stopped, preserve raw state again:

```bash
preserve_rehearsal_state || exit 1
printf '%s\n' "$RUN_CONTROL_OBSERVATION_ROOT" > "$WAIT_REHEARSAL_ROOT/final.raw-state.txt"
cp -R -- "$RUN_CONTROL_OBSERVATION_ROOT" "$WAIT_REHEARSAL_ROOT/final.raw-state" || exit 1
npm run pipeline -- \
  --platform "$WAIT_REHEARSAL_ROOT/platform.json" \
  --audit "$WAIT_REHEARSAL_RUN_ID" \
  > "$WAIT_REHEARSAL_ROOT/final.audit.stdout" 2> "$WAIT_REHEARSAL_ROOT/final.audit.stderr"
printf '%s\n' "$?" > "$WAIT_REHEARSAL_ROOT/final.audit.exit"
authority_snapshot after-valid
```

Require valid exit 0, `status: succeeded`, stage `approval` succeeded,
`attemptsUsed: 2`, and audit exit 0. Require these causal observations:

1. The first `attempt.completed` result is `wait`.
2. Exactly one `wait.resolved` names this wait. Its `causationId` equals the
   signal's `signalId`, and its payload contains the exact submitted signal.
3. A second, different attempt ID completes with `passed`, after the resolution.
4. `signals.jsonl` contains one signal. The final journal records `run.succeeded`.
5. The wait store, delivery store, and receiver file are unchanged. There is
   still one HTTP notification and no second publish effect. No remediation
   cycle has been used.

Record the event, effect, and signal journal checksums at this point. The valid
decision has advanced durable state. There is no rollback operation that
restores the earlier wait. Preserve the completed run; use a new run for new work.

Replay the same file without changing a byte, time, ID, or key:

```bash
resume_case replay "$WAIT_REHEARSAL_ROOT/valid.signal.json"
authority_snapshot after-replay after-valid
```

Require exit 1 with `WAIT_RUN_TERMINAL` for this successful run. Other supported
stale-resolution paths can return `WAIT_ALREADY_RESOLVED` or
`WAIT_UNKNOWN_OR_STALE`; they are not a saved successful CLI response. Require
unchanged event, effect, signal, wait, delivery, and receiver files. Attempt
count stays two; resolution count stays one. An identical stored signal is
idempotent, but terminal/stale checks run before signal storage on this replay.

Check the retained causal chain with this read-only command:

```bash
node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { parseHashJournal } from './skills/common/plugin-runtime/foundation/observability/hash-journal.ts';
const root = process.env.WAIT_REHEARSAL_ROOT;
const run = fs.readFileSync(path.join(root, 'run-root.txt'), 'utf8').trim();
const readJournal = name => {
  const file = path.join(run, name);
  return parseHashJournal(fs.readFileSync(file), file).map(record => record.entry);
};
const events = readJournal('events.jsonl');
const signal = JSON.parse(fs.readFileSync(path.join(root, 'valid.signal.json'), 'utf8'));
const completed = events.filter(e => e.type === 'attempt.completed');
const resolved = events.filter(e => e.type === 'wait.resolved');
assert.deepEqual(completed.map(e => e.payload.result.outcome), ['wait', 'passed']);
assert.equal(resolved.length, 1);
assert.equal(resolved[0].identity.waitId, signal.waitId);
assert.equal(resolved[0].causationId, signal.signalId);
assert.deepEqual(resolved[0].payload.signal, signal);
assert.notEqual(completed[0].identity.attemptId, completed[1].identity.attemptId);
assert(completed[0].sequence < resolved[0].sequence && resolved[0].sequence < completed[1].sequence);
assert.equal(events.filter(e => e.type === 'run.succeeded').length, 1);
assert.deepEqual(readJournal('signals.jsonl'), [signal]);
const effects = readJournal('effects.jsonl');
const publish = effects.filter(e => e.type === 'requested' && e.request.capability === 'operator.request');
assert.equal(publish.length, 1);
const receipt = effects.find(e => e.type === 'completed' && e.receipt.idempotencyKey === publish[0].request.idempotencyKey);
assert.equal(receipt.receipt.result.accepted, true);
assert.equal(receipt.receipt.result.status, 202);
assert.equal(fs.readFileSync(path.join(root, 'receiver.jsonl'), 'utf8').trim().split('\n').length, 1);
console.log(JSON.stringify({ localCausalChecks: 'passed', attemptsUsed: 2, resolutions: 1, notifications: 1, deployment: false }));
NODE
```

> **Source evidence — authority and exact replay**
>
> **Claim:** Core validates the active wait before storing a signal, writes one causal resolution, and rejects post-resolution replay before consuming another attempt.
>
> **Implementation:** [Resume checks and record order](https://github.com/datrab/kubeclaw/blob/ffb0b7a6393f7db44eb948f3ff8346b4b4b50f1a/skills/nova/core/execution/engine-run.ts#L82-L100) govern submission. [Signal deduplication and causal event](https://github.com/datrab/kubeclaw/blob/ffb0b7a6393f7db44eb948f3ff8346b4b4b50f1a/skills/nova/core/execution/engine-run.ts#L109-L122) preserve resolution identity. [Issuer, current-time expiry, and creation-time freshness](https://github.com/datrab/kubeclaw/blob/ffb0b7a6393f7db44eb948f3ff8346b4b4b50f1a/skills/nova/core/execution/engine-snapshots.ts#L137-L144) constrain acceptance.
>
> **Contract or setting:** [The closed envelope requires eight fields and excludes a signature field](https://github.com/datrab/kubeclaw/blob/ffb0b7a6393f7db44eb948f3ff8346b4b4b50f1a/skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json#L777-L802).
>
> **Test evidence:** [Recovery prefix test](https://github.com/datrab/kubeclaw/blob/ffb0b7a6393f7db44eb948f3ff8346b4b4b50f1a/tests/verification/reliability/attempt-projection-recovery.test.mjs#L25-L76). The test truncates private journal copies at each original completion/projection prefix. It checks rejection, expiry, one resolution, and two attempts. Available evidence does not establish successful execution of these lifecycle assertions. This test does not prove deployment behavior.
>
> **Revision:** `ffb0b7a6393f7db44eb948f3ff8346b4b4b50f1a`.
>
> **Limit:** Neither this source nor a local fixture proves the mandatory deployed run. Do not truncate or rewrite an operator run's journals to reproduce test-only crash prefixes.

## Failure and Interruption

| Observation | Cause to distinguish | Safe next action |
| --- | --- | --- |
| `FILE_MUTEX_ACQUIRE_FAILED` | Required fixed host lock interface unavailable | Stop before state claims. Use a supported host; preserve the failed attempt. |
| Registry, provider, grant, or config validation error | Wrong package/configuration selection | Correct before a new run. Do not change a running graph or package snapshot. |
| Receiver 403 or delivery error | Missing/wrong secret, HMAC, origin/header permission, or receiver response | Preserve request and receipt evidence. If delivery outcome is uncertain, stop and reconcile through the owning receiver. Do not replay publication by starting another run. |
| `WAIT_UNKNOWN_OR_STALE` | Wrong identity or resolved wait | Preserve raw state before reading the same run's durable audit. Do not guess a replacement wait. |
| `WAIT_ISSUER_DENIED` or `WAIT_SIGNAL_TYPE_MISMATCH` | Envelope differs from the active wait | Stop this submission; compare the reviewed signal with the durable request. |
| `WAIT_SIGNAL_STALE` or `WAIT_EXPIRED` | Issue time predates creation or current clock reached expiry | Preserve the rejection. Do not change the clock or journal; expired approval needs a new governed run. |
| Valid command response lost | Acceptance may already be durable | Stop writers and preserve raw run and adapter state before audit. Inspect complete hash-verified journals, then audit under the canonical procedure. Keep the original signal bytes, ID, time, and key. Do not invent a successor signal or repeat an uncertain effect. |
| `RECOVERY_SIGNAL_REQUIRED` | Recovery found an active wait | Follow the canonical signal procedure. Recovery cannot create approval. |
| Terminal run error | Run already succeeded, failed, blocked, or cancelled | Preserve the terminal audit. Use a new governed run for new work. |

For process interruption, use [Recover After Interruption](../operate.md#recover-after-interruption)
with the original graph, platform, package identities, run ID, and storage.
Preserve raw partial bytes and checksums before the first audit or recovery.
Stop on incomplete or corrupt journal records; do not trim them for inspection.
Reconcile unresolved external effects before any permitted canonical repair or
recovery. Audit can create lock files and truncate an unterminated journal tail;
its success alone does not prove that an external operation completed. For this
local input set, use `preserve_rehearsal_state` after writers stop; it binds the
known Core and adapter paths. A missing file is a stop, not permission to create
replacement authority. This guide supplies no
generic receipt import or cancellation command. Stopping the local receiver
does not cancel a durable Nova run. A signal payload with `decision: rejected`
is a separate decision that yields `blocked` with reason `approval.rejected`;
do not mutate the approved signal or replay it as a rejection.

## Final Check and Cleanup

Stop the owned receiver child after retaining the last request evidence:

```bash
kill -INT "$WAIT_REHEARSAL_RECEIVER_PID"
wait "$WAIT_REHEARSAL_RECEIVER_PID"
node --input-type=module <<'NODE'
import net from 'node:net';
const connection = net.connect({ host: '127.0.0.1', port: 18765 });
connection.on('connect', () => { connection.destroy(); console.error('Stop: a listener remains'); process.exitCode = 1; });
connection.on('error', error => { if (error.code !== 'ECONNREFUSED') { console.error(error.message); process.exitCode = 1; } });
NODE
```

Require receiver exit and refused connection. If a listener remains, inspect
its ownership before termination; do not kill an unrelated listener.

Retain a restricted evidence copy outside the disposable directory. Include
the source commit, package and graph snapshots, materialized platform and
pipeline, all three original inputs, `input-manifest.json`, and actual signal
bytes, run ID, commands, timestamps,
exit statuses, wait/final audits, replay output, all journals, wait/delivery stores,
receiver body, checksum/byte-count comparisons, and final operator decision.
Do not retain the HMAC key. Check the copy's file digests before removing any
source copy. A stopped or uncertain run requires preservation, not successful
cleanup status.

Before copying, save the nonsecret command transcript, start/end timestamps,
signal-review decision, final operator decision, and any blocked step in the
private root. The command blocks do not generate these operator records. Do not
record environment values or enable shell tracing around the key. Stop writers
before the archive copy.

Create and verify the restricted local evidence copy:

```bash
export WAIT_REHEARSAL_ARCHIVE_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/wait-resume-evidence.XXXXXXXX")
node --input-type=module <<'NODE'
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
const source = process.env.WAIT_REHEARSAL_ROOT;
const target = process.env.WAIT_REHEARSAL_ARCHIVE_ROOT;
fs.cpSync(source, target, { recursive: true, force: false, errorOnExist: true });
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
const inputs = JSON.parse(fs.readFileSync(path.join(source, 'input-manifest.json'), 'utf8'));
assert.deepEqual(inputs.map(input => input.path), ['approval.pipeline.json', 'platform.template.json', 'signal.template.json']);
for (const input of inputs) {
  assert.deepEqual(original.find(file => file.path === input.path), input);
}
assert.deepEqual(inventory(target), original);
fs.writeFileSync(path.join(target, 'archive-manifest.json'), JSON.stringify(original, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ retainedEvidence: target, filesVerified: original.length }));
NODE
```

Require exit 0 and retain `WAIT_REHEARSAL_ARCHIVE_ROOT`. The copy includes all
local state and diagnostic output, not the environment key. Move it to the
approved retention location before temporary storage can expire.

After the evidence copy is verified and the receiver has exited, remove only
this new local rehearsal directory. Verify its identity before removal:

```bash
case "$WAIT_REHEARSAL_ROOT" in
  "${TMPDIR:-/tmp}"/wait-resume.*) test -f "$WAIT_REHEARSAL_ROOT/run-id.txt" || exit 1 ;;
  *) printf 'Stop: unexpected rehearsal root\n' >&2; exit 1 ;;
esac
test "$(cat "$WAIT_REHEARSAL_ROOT/run-id.txt")" = "$WAIT_REHEARSAL_RUN_ID" || exit 1
rm -r -- "$WAIT_REHEARSAL_ROOT"
unset WAIT_REHEARSAL_WEBHOOK_KEY WAIT_REHEARSAL_ROOT WAIT_REHEARSAL_RUN_ID
```

Unset `WAIT_REHEARSAL_RECEIVER_PID` too. The archive retains authoritative local
run evidence. This disposable cleanup rule does not authorize deleting shared
deployment journals, waits, delivery records, lock files, or secret bindings.

## Deployment Registration

**Status: mandatory, open, and unexecuted.** The input set gives exact
pipeline, platform-template, signal-template, and wait-stage package paths. The
platform template is a loopback fixture; it is not a registered deployment
platform. The local receiver and `operator:local` label are not a deployment
authority or credential. This guide supplies no deployment registration.

Before a measured deployment run, platform operations and product integration
maintainers must jointly record:

- The immutable checkout and runtime/image identity, supported execution host,
  protected operator principal, CLI route, and signal-file ownership/access.
- The exact installed human-approval package content identity, adapter package
  identities, pipeline file and digest, materialized platform file and digest,
  signal-template path and digest, and new run ID with clean journal.
- Approved durable Core, wait, and notification store paths, permissions,
  capacity, retention owner, and backup/evidence location.
- Registered notification target, endpoint/origin, receiver authority, permitted
  network route, named secret binding and environment selector, rotation owner,
  receipt query/reconciliation procedure, and cleanup authority. Record secret
  names and owners; never their values.
- The deployment operator issuer ID in stage config and the matching wait grant,
  target grant, provider selections, adapter origin/method/header permissions,
  byte/time limits, and active-adapter list. Review the effective configuration
  before the run; do not edit it after wait creation.

Stop before deployment execution while any registration is missing. This is
the current blocked step, owned by platform operations for host/access/storage
and product integration maintainers for the registered workflow and packages.
Do not replace the missing registration with a localhost result.

Closure requires a fresh protected deployment run at the recorded immutable
revision, persisted wait and journal head, wrong wait and wrong issuer rejection
before valid submission, exactly one causal resolution, two completed attempts,
the unchanged original delivery receipt, exact replay returning terminal/stale
rejection with no second transition or budget, and cleanup that preserves all
required evidence. Keep actual deployment outputs, exit codes, identities,
checksums, and observations. An unexecuted or blocked run stays open even when
all templates and local tests validate.
