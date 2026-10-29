# Observe and Diagnose

Status: source-backed diagnosis path; controlled exercises are not live-environment evidence
Audience: operator, incident responder
Owner: platform operations
Evidence: scripts/deploy.sh; skills/nova/core/telemetry/audit.ts
Applies to: current runtime roles and durable pipeline state
Last verified: 2026-10-12; local snippet and bounded process checks only; no live dependency failure result is available

## Objective

Classify a failure without destroying its evidence or repeating an uncertain effect.
Finish with one cause class, one safe next action, and retained evidence.

## Canonical Symptom Diagnosis Procedure
<!-- operator-task: symptom-diagnosis -->

This page is the sole authority for `symptom-diagnosis`. Start with an
observable symptom, explicit target and time window, independently reachable
administration, and a new protected evidence directory. Use clients from the
recorded release; an unaccepted client/server difference remains a possible
cause. Run cluster checks from the administration machine and pipeline audit
from `<repository-root>`. Kubernetes, the durable Nova audit, component-native
state, and external provider receipts are the authorities in that order.

Before any cluster command on this page, complete
[Bind Cluster Authority](install.md#bind-cluster-authority). Keep the same bound
shell for the whole incident. Every raw `kubectl`, Helm, or
`scripts/deploy.sh` command below must inherit its exported read-only
`KUBECONFIG`, `NAMESPACE`, and `PRISM_NAMESPACE`. The binding section
validates and freezes both namespace names before any command here; every shown
`<context>` must equal `EXPECTED_CONTEXT`. Run
`assert_cluster_binding` immediately before each command block. Stop on any
mismatch and preserve it as incident evidence; never fall back to the default
kubeconfig.

Complete [Start an Incident Record](#start-an-incident-record), take the
[Cluster and Workload Snapshot](#cluster-and-workload-snapshot), and follow
[Diagnosis Order](#diagnosis-order) from the reported symptom through the
[Symptom Index](#symptom-index). Use a controlled exercise only in its named
non-production environment and fault window.

Stop before restart or retry when the target is uncertain, an external effect
has no terminal receipt, durable evidence is corrupt, access depends on the
failed workload, or cleanup ownership is absent. Expected completion is one
distinguished cause class, the first safe action, a narrow recovery check, an
end-consumer result, and verified cleanup. Retain commands, timestamps, output,
identities, failed and successful observations, recovery, cleanup, and any
remaining uncertainty without secret values.

## Supported Versions

Use the [shared version rules](README.md#version-and-tool-boundary).
Diagnose with clients from the selected operator environment.
When client and server versions differ from the recorded release inputs, preserve that fact as a possible cause instead of assuming compatibility.

## Diagnosis Order

Use the same order for every incident:

1. Confirm target and time window.
2. Check cluster and storage availability.
3. Check workload health and Kubernetes events.
4. Check service and role logs.
5. Read durable run and job state. For Nova, complete
   [Durable Run Inspection](#durable-run-inspection) before audit.
6. Check the external system for accepted effects.
7. Decide retry, reconciliation, recovery, or escalation.

Do not begin with a restart.
A restart can remove short-lived logs and hide the original condition.

## Start an Incident Record

Create `<evidence-dir>` outside workload PVCs.
Record:

- UTC start time and operator.
- Kubernetes context and namespace.
- Source commit and selected image digests.
- Run, stage, attempt, job, wait, and effect identities.
- First observed symptom.
- Every command and exit status.
- Changed resources and cleanup owner.

Do not copy Secret values, bearer tokens, private keys, or confidential payloads.

## Cluster and Workload Snapshot

Run from the administration machine:

```bash
assert_cluster_binding || exit 126
kubectl config current-context
kubectl get nodes -o wide
./scripts/deploy.sh status
kubectl -n "$NAMESPACE" get deploy,statefulset,pods,svc,pvc -o wide
kubectl -n "$NAMESPACE" get events --sort-by=.metadata.creationTimestamp
helm list -n "$NAMESPACE"
```

Expected observation: the context matches the incident record.
Commands must return current objects rather than cached screenshots.

If the API does not respond, leave this path.
Use the independent host or control-plane route from the installation record.

## Health and Logs

Check one affected Pod before broad log collection:

```bash
assert_cluster_binding || exit 126
kubectl -n "$NAMESPACE" describe pod "<pod>"
kubectl -n "$NAMESPACE" logs "<pod>" -c "<container>" --since=30m --timestamps
kubectl -n "$NAMESPACE" logs "<pod>" -c "<container>" --previous --timestamps
```

The `--previous` output exists only after a container restart and before Pod replacement.
Its absence does not prove a clean previous run.

Use role smoke checks after capturing failure evidence:

```bash
assert_cluster_binding || exit 126
./scripts/deploy.sh smoke-agent nova
./scripts/deploy.sh smoke-agent buster
kubectl -n "$NAMESPACE" exec deployment/agent-nova -c kubeclaw -- \
  node /runtime-config/kubeclaw-health.mjs startup
./scripts/deploy.sh prism-smoke
```

A failed smoke narrows the component boundary.
A passing smoke does not prove a specific pipeline attempt.

## Durable Run Inspection

Before any audit, recovery, or resume, complete
[Inspect a Run](operate.md#inspect-a-run) in Bash at the original Nova
repository root. Use the original platform path and run ID from the retained
start command. Confirm that the run owner has exited, that no new operation
can write the run, and that the owning adapter writers are stopped. Stop if
ownership or the original identities are unknown. Do not audit an active run
to discover its identity; use the retained command output and the component's
supported observation path while work continues.

Audit is not read-only. [The audit reader opens FileJournal](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/nova/core/telemetry/audit.ts#L14-L18).
[Its constructor truncates an incomplete tail before parsing](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/nova/core/state/journal.ts#L30-L77),
and [its mutex creates the append-lock file](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/nova/core/state/file-mutex.ts#L8-L21).
A later audit failure does not restore discarded bytes. Recovery and resume
can open the same journals before rejecting a run or signal.


> **Source evidence — durable audit and journal effects**
>
> **Claim:** Audit rebuilds events from the journal. Opening FileJournal can truncate an incomplete tail and create an append-lock file; preserve stopped-writer raw bytes first.
>
> **Implementation:** [readPipelineAudit](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/nova/core/telemetry/audit.ts#L14-L27); [FileJournal opening](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/nova/core/state/journal.ts#L30-L77); [FileMutex lock file](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/nova/core/state/file-mutex.ts#L8-L21).
>
> **Contract or setting:** The [audit projection shape](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/nova/core/telemetry/audit.ts#L19-L27) binds the original run ID and journal head. [Durable Run Inspection](#durable-run-inspection) supplies the required preservation conditions.
>
> **Test evidence:** [Audit reconstruction, redaction and corrupt-history regression](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/tests/verification/reliability/audit-projection.test.mts#L10-L28) and [lock exception, exclusion and stable-inode regression](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/tests/verification/reliability/state-ownership.test.mjs#L83-L91): **SOURCE ONLY; NOT EXECUTED**. These test sources were read. There is no maintained repository test for the complete operator raw-copy and adapter-preservation procedure.
>
> **Revision:** 4d3068465a2e202d2d5073b77e9273c308497995
>
> **Limit:** These sources do not establish live recovery, external-effect reconciliation, or harmless audit of an active or incomplete run.


Follow the canonical section to define `preserve_run_state`, verify a complete
raw run copy, and preserve the owning adapters' stores through their declared
backup procedures. Retain partial bytes, signals, effects, snapshots, and lock
files. Require successful strict parsing of every copied run journal before
ordinary audit. On a copy comparison, incomplete record, sequence, or hash
failure, preserve the raw copy and manifest and stop. Do not repair the source
to make inspection pass.

After the adapter copies are verified and writers remain stopped, capture the
audit with the same original identities:

```bash
export RUN_CONTROL_PLATFORM="<original-platform.json>"
export RUN_CONTROL_RUN_ID="<original-run-id>"
preserve_run_state || exit 1
audit_status=0
npm --silent run pipeline -- \
  --platform "$RUN_CONTROL_PLATFORM" \
  --audit "$RUN_CONTROL_RUN_ID" \
  > "$RUN_CONTROL_OBSERVATION_ROOT/audit.json" \
  2> "$RUN_CONTROL_OBSERVATION_ROOT/audit.stderr" || audit_status=$?
printf '%s\n' "$audit_status" > "$RUN_CONTROL_OBSERVATION_ROOT/audit.exit" || exit 1
test "$audit_status" -eq 0 || exit 1
```

Retain the raw-copy path and manifests with the incident record, alongside
JSON, stderr, and exit status. Compare the audit with provider and Kubernetes
evidence by identity, not by time alone. If a later owner-authorized incident
procedure permits canonical tail repair, keep the original raw bytes,
reconcile external effects, and record the command and its actual changes.
Do not edit journal, snapshot, effect, wait, or receipt files to manufacture a
recovery result.

## Capacity and Growth

Check scheduling and filesystem signals separately:

```bash
assert_cluster_binding || exit 126
kubectl -n "$NAMESPACE" get resourcequota,limitrange
kubectl -n "$NAMESPACE" get pvc
kubectl -n "$NAMESPACE" top pods --containers
kubectl top nodes
```

Metrics commands can fail when Metrics Server is absent.
That failure means usage data is unavailable, not that usage is safe.

For each durable root, record used bytes, free bytes, inode use, and growth rate.
Do not delete history merely because a filesystem is full.

The current system lacks complete connected history retirement.
[Complete connected retirement](../status/open-issues.md#confirmed-run-history-lacks-complete-connected-retirement) tracks that implementation gap.

Use the [canonical capacity and retention procedure](capacity.md#canonical-capacity-and-retention-procedure).
It does not authorize broad run deletion.

## Queue and Delivery Checks

Separate four concepts:

| Concept | Evidence | Meaning |
| --- | --- | --- |
| Admission | Durable job or attempt record | The owner accepted responsibility |
| Queue presence | Transport-specific record | Work awaits or has delivery state |
| Execution | Attempt start and owner evidence | A worker began the bounded operation |
| Delivery acknowledgement | Receiver-bound receipt | The intended receiver accepted output |

Redis telemetry or observer delivery is not canonical pipeline authority.
Loss of telemetry does not erase durable run state.

When a response is missing, search for the accepted request and provider receipt.
Never submit a second request from absence of a UI update alone.

## Symptom Index

| Symptom | Distinguishing checks | Safe next action |
| --- | --- | --- |
| Stage appears hung | Audit state, attempt deadline, plugin log, process owner | Wait for deadline or use approved containment; preserve attempt identity |
| Job has no response | Job admission, provider status, receipt store, import journal | Use a documented provider-specific status or import operation only when it exists; otherwise preserve evidence, stop the run, and escalate |
| Git operation conflicts | Worktree path, lock owner, branch, remote state | Resolve in the owned worktree; reconcile a possibly successful push |
| Gate failed | Gate decision, original report, source digest, provider receipt | Repair the defect or follow the declared repair route |
| External effect is uncertain | Effect request, idempotency key, external resource, receipt | Inspect the external state, preserve evidence, stop, and escalate; never blind-retry or edit the journal |
| Resume fails | Preserve raw state through [Durable Run Inspection](#durable-run-inspection), then check active wait ID, signal type, issuer, expiry, and graph digest | Stop on rejected copied journals or unknown effects; use [Resume a Waiting Run](operate.md#approve-or-resume-a-wait) only with the original identities and current wait |
| Cancellation seems incomplete | Durable terminal event, process owner, child processes | Keep resources; escalate until quiescence is proven |
| Plugin is unavailable | Registry validation, activation log, selected provider, grant | Correct platform configuration and start a new governed run |
| PVC is `Lost`, or events report `ClaimLost` / `ClaimMisbound` | Read stored `volumeName`, the named PV and namespace/name/UID in `claimRef`; compare retained prior identities, not names alone | Follow [lost binding diagnosis](../reference/configuration-change-impact.md#a-previously-bound-claim-loses-its-binding); stop before replacement storage or claimRef edits and obtain storage-owner data observations |
| PV is `Released`, or deletion/reclaim result is uncertain | Check claim UID, actual PV reclaim policy, CSI driver, finalizers, attachments and timestamped provisioner errors; API disappearance is not erasure | Follow [read-only storage investigation](../reference/configuration-change-impact.md#diagnose-before-changing-cleanup); keep data and backup evidence, stop before retry or forced cleanup |
| Pod reports `FailedMount` or mount timeout | First select the actual PV driver and workload node; only for selected SMB inspect the corresponding node `smb` container and runtime inputs | Follow [SMB runtime discovery](../reference/configuration-change-impact.md#discover-the-selected-smb-runtime-inputs); stop before retry until the node/storage owner proves staging and worker state through an approved inspection procedure |
| Service is unreachable, DNS lookup fails, or external address stays pending | Select the actual producer, namespace and effective port; distinguish missing Pods/ports or EndpointSlices from DNS, forwarding, listener, policy and provider failure | Follow [Service route diagnosis](../reference/service-routing.md#act-inspect-without-changing-the-cluster); obtain network-owner evidence for the failed stage before changes or retries |
| Worker repeatedly restarts | Pod events, previous logs, resource limits, storage | Repair the first failing dependency or capacity cause |
| Prism test lease reports an unknown `spec.capabilityProfile`, stays `Rejected`, or times out | Compare the actual client validation, installed CRD, stored lease spec, phase and message; inspect prior effects under the same lease identity | Follow [Prism test lease admission and recovery](prism-studio.md#prism-test-lease-admission-and-recovery); stop before retry or cleanup until the producer/receiver mismatch and retained state are understood |
| Prism result is missing | Control, Worker, PostgreSQL, artifact, and dispatch identities | Reconcile by identity; do not create another design round |
| Demo URL fails | Ingress, Tailnet identity, execution receipt, expiry | Repair access or rerun the governed exposure stage |
| Observer message is missing | Canonical event, observer checkpoint, delivery attempts, receiver receipt | Replay only through the observer contract |
| Disk grows after terminal jobs | Ownership and quiescence evidence | Retain data until safe cleanup authority exists |
| Wrong configuration seems active | Rendered values, Pod spec, ConfigMap/Secret revision, persisted config | Correct the owned source and perform a targeted rollout |
| OpenClaw memory indexing fails, recall is empty/stale, or an embedding times out | Select the actual agent Pod/container and `main` status workspace/index; distinguish consumer-key or gateway SecretRef resolution from LiteLLM readiness/database, Vertex/model/quota, and vector/freshness failures | Follow [the actual memory-consumer diagnosis](#prepare-the-openclaw-memory-reader); keep writers stopped when identity or process quiescence is unknown; restore route and prove the same consumer result before cleanup |
| LiteLLM is ready but an embedding fails, or a managed reasoning model is unavailable | Check the selected consumer and model route, credential owners, provider error and budget; HTTP readiness does not test Vertex; an embedding result does not test managed reasoning | Follow [LiteLLM route and memory diagnosis](#litellm-upstream-timeout) for `gemini-embedding-001`; use [managed model boundaries](../understand/platform-and-operations.md#litellm-model-gateway) for other models; retain the failed operation rather than substitute a route probe |
| Redis connection is refused or times out | Redis Pod, Service endpoint, network policy, DNS, and TCP error before authentication | Repair reachability; do not rotate credentials or delete data |
| Redis reports `NOAUTH` or `WRONGPASS` | Endpoint remains reachable; compare Secret name/version and consumer mount without exposing the value | Correct credential distribution through its owner; do not change the data store |
| Redis connects but expected stream or data is absent | Authenticated `PING`, exact key/stream identity, persistence mode, PVC identity, and application audit | Keep writers stopped if loss is possible; restore only from a verified owned backup |

KubeClaw does not currently provide a generic Core operation that reconciles an
uncertain external effect and imports its result. The
[open reconciliation boundary](../status/open-issues.md#uncertain-external-effects-have-no-supported-reconciliation-and-result-import-operation)
is different from a provider-specific normal result import that has its own
documented contract. If the selected provider has no such operation, retain the
request identity, idempotency key, external evidence, and receipts. Stop and
escalate instead of retrying, resuming, or editing durable state.

## Hangs and Timeouts

A running state alone does not prove a live process.
Compare these facts:

1. Attempt creation and dispatch records.
2. Lease expiry and configured timeout.
3. Current process or worker ownership.
4. Provider request and status.
5. Terminal attempt record.

If the deadline has passed without a terminal record, preserve all five facts.
Do not create a synthetic result.

For Buster, current ownership does not cover every capability child in production.
[Whole-attempt resource ownership](../status/open-issues.md#capability-work-is-missing-from-the-attempt-budget) tracks the boundary.

## Lost Responses and Uncertain Effects

For Nova, complete [Durable Run Inspection](#durable-run-inspection) before
using audit to find the request or receipt. Keep stopped-writer raw copies and
strict inspection results before any recovery or resume.

Use this decision sequence:

1. Find the durable effect request.
2. Read its idempotency key and resource identity.
3. Look for a durable receipt.
4. Query the external resource through an authorized read path.
5. Match external state to the exact request.
6. Record the reconciliation result.
7. Continue only through the supported recovery path.

No receipt plus no visible result does not prove nonexecution.
The response may have failed after external acceptance.

## Plugin and Provider Failures

Classify the failure before changing configuration:

| Layer | Example signal | Owner |
| --- | --- | --- |
| Package | Manifest, module, export, or digest rejection | Release or plugin maintainer |
| Registration | Stage type or adapter not found | Platform configuration owner |
| Activation | Configuration schema or startup failure | Adapter or provider owner |
| Authorization | Missing grant or denied resource | Security operator |
| Reachability | DNS, network, TLS, or service error | Platform operator |
| Execution | Typed plugin result or timeout | Plugin or external service owner |

Do not widen a grant to diagnose reachability.
Use a separate authorized connectivity check.

## Controlled Dependency Failure Exercises

The implementation links below were inspected at revision
`4d3068465a2e202d2d5073b77e9273c308497995`. Bash and Node.js 24 syntax checks
passed for the published command blocks. Synthetic local data exercised the
OAuth fingerprint and cleanup guards, backup-group comparison, and compact
Git receipt projection. These checks do not execute any dependency outage or
prove a cluster, Tailnet, model, registry, or full pipeline result.

This section is the command authority for the controlled Redis, Prism
PostgreSQL, registry/BuildKit, Tailscale, LiteLLM, and Git dependency-failure
procedures below.
These are operator exercises, not claims that the failures have already been
run. Each exercise must produce its own failed observation, safe-stop decision,
restoration record, end-consumer verification, and cleanup result.


> **Source evidence — controlled-exercise helper checks**
>
> **Claim:** The page distinguishes source authority, local helper checks and actual dependency-failure results. The fault guards bind selected object lifetimes; they do not provide a cluster-wide fence.
>
> **Implementation:** [Fault-window helpers](#bind-the-fault-window-to-object-lifetimes) and [memory observer helpers](#prepare-the-openclaw-memory-reader); the [maintained smoke wrapper](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/scripts/deploy.sh#L1571-L1579) is a separate runtime check.
>
> **Contract or setting:** [JSON Patch test semantics](https://www.rfc-editor.org/rfc/rfc6902#section-4.6) and [Kubernetes update conflicts](https://kubernetes.io/docs/reference/using-api/api-concepts/#updates-to-existing-resources). Each procedure requires namespace/consumer exclusion and Node.js 24 above.
>
> **Test evidence:** There is no maintained repository test for these page-defined fault-binding, cause-classification and cleanup helpers as a complete procedure. **LOCAL CHECKS PASSED:** 32 Bash and 53 Node syntax checks in their published modes. Also: 20 native-default CommonJS programs ran on synthetic fixtures, with bounded mutation/cause probes. The six actual dependency scenarios are **NOT EXECUTED**.
>
> **Revision:** 4d3068465a2e202d2d5073b77e9273c308497995
>
> **Limit:** Local parsing and synthetic helpers do not prove cluster enforcement, target-image compatibility, pipeline success or end-consumer recovery.


Use a registered non-production acceptance environment during an approved
fault window. The operator must have an independent cluster administration
path, permission to change only the named dependency, and a second operator or
automatic deadline able to restore it. Start no unrelated work during the
window. Existing runs that could touch the dependency must be terminal or
explicitly selected as the one test run.

Prepare one evidence directory and record the original state. The OAuth source
file named below must be outside the repository and evidence directory, mode
`0600`, and contain only `client_id=...` and `client_secret=...`. It is needed
only for the Tailscale exercise; never copy it into evidence.

```bash
assert_cluster_binding || exit 126
set -euo pipefail
test "$NAMESPACE" = "<namespace>"
test "$PRISM_NAMESPACE" = "<prism-namespace>"
export TAILSCALE_OPERATOR_NAMESPACE="tailscale"
export PLATFORM_FILE="<platform.json>"
export PROJECT_FILE="<project.json>"
export SELECTED_RUN_ID="<existing-nova-run-id>"
export TAILSCALE_PROBE_IMAGE="<registry>/<repository>@sha256:<64-hex-digest>"
export TAILSCALE_OAUTH_ENV_FILE="<absolute-secure-path>/tailscale-oauth.env"
export EVIDENCE_DIR="<new-evidence-dir>"
test ! -e "$EVIDENCE_DIR"
mkdir -m 0700 "$EVIDENCE_DIR"
kubectl config current-context | tee "$EVIDENCE_DIR/context.txt"
kubectl -n "$NAMESPACE" get deploy,statefulset,pods,svc,pvc -o wide \
  | tee "$EVIDENCE_DIR/platform-before.txt"
kubectl -n "$PRISM_NAMESPACE" get deploy,statefulset,pods,svc,pvc,ingress -o wide \
  | tee "$EVIDENCE_DIR/prism-before.txt"
```

A preflight command must exit zero before its matching fault is injected. A
nonzero command in the fault window is expected only where the procedure says
so. Capture that status explicitly; `tee` can otherwise hide the status of the
left-hand command in shells without `pipefail`. The examples below therefore
write failure output to a file and record `$?` before displaying it.

### Bind the Fault Window to Object Lifetimes

A namespace name and a resource name can be reused. A UID identifies one
object lifetime. Before each exercise, the platform owner must independently
confirm the application and Prism namespace UIDs. For Tailscale, also confirm
its operator namespace UID. Obtain these values from the installation inventory
through the independent administration route, not from the lookup being tested.
The owner must exclude namespace deletion or replacement, workload replacement,
GitOps reconciliation, autoscaling, Secret rotation, and competing changes to
the selected resources until restoration and cleanup finish. Record the owner,
targets, exclusion method, and end of the window. If this condition cannot be
established, stop before mutation. A verbal expectation or a final UID comparison
does not establish it.

Run these helpers in Bash with Node.js 24 and the selected kubectl. Access must
include namespace and selected resource reads, JSON patches for the named
StatefulSets, Service, Secret and Deployments, and create/delete for the one
Cilium policy where used. Check the required verbs through
[the selected-scope authority check](install.md#check-authority-for-the-selected-scope).
The helper stores metadata only, including for Secrets. Keep the evidence files
unchanged until the window closes. The selected workload must also keep each
consumer Pod stable for fault exec: no eviction, restart, rollout, or replacement.
Capture its Pod UID, container ID, and restart count before and after the check.
A missing exec, changed consumer, or unrelated error cannot pass the fault check.

```bash
export EXPECTED_FAULT_NAMESPACE_UID="<independently-recorded-application-namespace-uid>"
export EXPECTED_FAULT_PRISM_NAMESPACE_UID="<independently-recorded-prism-namespace-uid>"
readonly EXPECTED_FAULT_NAMESPACE_UID EXPECTED_FAULT_PRISM_NAMESPACE_UID
bind_fault_namespace() {
  assert_cluster_binding || return 126
  local namespace="$1" expected="$2" actual
  test -n "$expected" || return 126
  actual=$(kubectl get namespace "$namespace" -o jsonpath='{.metadata.uid}') || return 126
  test "$actual" = "$expected" || return 126
  test ! -e "$EVIDENCE_DIR/namespace-$namespace.uid" || return 126
  printf '%s\n' "$expected" > "$EVIDENCE_DIR/namespace-$namespace.uid"
}
assert_fault_namespace() {
  assert_cluster_binding || return 126
  local namespace="$1" actual
  test -s "$EVIDENCE_DIR/namespace-$namespace.uid" || return 126
  actual=$(kubectl get namespace "$namespace" -o jsonpath='{.metadata.uid}') || return 126
  test "$actual" = "$(cat "$EVIDENCE_DIR/namespace-$namespace.uid")" || return 126
}
fault_metadata() {
  assert_fault_namespace "$1" || return 126
  kubectl -n "$1" get "$2" -o json | node --input-type=module -e '
let input = ""; for await (const chunk of process.stdin) input += chunk;
const value = JSON.parse(input), m = value.metadata;
if (!m?.uid || !m.resourceVersion || m.deletionTimestamp) process.exit(1);
console.log(JSON.stringify({ name: m.name, namespace: m.namespace,
  uid: m.uid, resourceVersion: m.resourceVersion,
  templateAnnotations: value.spec?.template?.metadata?.annotations ?? {} }));
'
}
freeze_fault_target() {
  local key="$1" namespace="$2" resource="$3"
  test ! -e "$EVIDENCE_DIR/$key-frozen.json" || return 126
  fault_metadata "$namespace" "$resource" > "$EVIDENCE_DIR/$key-frozen.json"
}
assert_fault_target() {
  local key="$1" namespace="$2" resource="$3"
  fault_metadata "$namespace" "$resource" > "$EVIDENCE_DIR/$key-current.json" || return 126
  node - "$EVIDENCE_DIR/$key-frozen.json" "$EVIDENCE_DIR/$key-current.json" <<'NODE'
const fs = require('node:fs');
const [before, current] = process.argv.slice(2).map(p => JSON.parse(fs.readFileSync(p, 'utf8')));
if (before.uid !== current.uid || before.name !== current.name
  || before.namespace !== current.namespace) throw new Error('selected resource lifetime changed; stop');
NODE
}
patch_fault_target() {
  local key="$1" namespace="$2" resource="$3" changes
  changes=$(cat) || return 126
  assert_fault_target "$key" "$namespace" "$resource" || return 126
  printf '%s\n' "$changes" | node --input-type=module -e '
import fs from "node:fs";
let input = ""; for await (const chunk of process.stdin) input += chunk;
const current = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const changes = JSON.parse(input);
if (!Array.isArray(changes) || !changes.length) process.exit(1);
console.log(JSON.stringify([
  { op: "test", path: "/metadata/uid", value: current.uid },
  { op: "test", path: "/metadata/resourceVersion", value: current.resourceVersion },
  ...changes
]));
' "$EVIDENCE_DIR/$key-current.json" | kubectl -n "$namespace" patch "$resource" \
    --type=json --patch-file=/dev/stdin || return 126
  assert_fault_target "$key" "$namespace" "$resource"
}
scale_fault_target() {
  local key="$1" namespace="$2" resource="$3" replicas="$4"
  [[ "$replicas" =~ ^[0-9]+$ ]] || return 126
  printf '[{"op":"replace","path":"/spec/replicas","value":%s}]\n' "$replicas" \
    | patch_fault_target "$key" "$namespace" "$resource"
}
restart_fault_target() {
  local key="$1" namespace="$2" resource="$3"
  assert_fault_target "$key" "$namespace" "$resource" || return 126
  node --input-type=module -e '
import fs from "node:fs";
const m = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
console.log(JSON.stringify([
  { op: "test", path: "/metadata/uid", value: m.uid },
  { op: "test", path: "/metadata/resourceVersion", value: m.resourceVersion },
  { op: "add", path: "/spec/template/metadata/annotations", value: {
    ...m.templateAnnotations, "kubectl.kubernetes.io/restartedAt": new Date().toISOString()
  } }
]));
' "$EVIDENCE_DIR/$key-current.json" | kubectl -n "$namespace" patch "$resource" \
    --type=json --patch-file=/dev/stdin || return 126
  assert_fault_target "$key" "$namespace" "$resource"
}
fault_consumer_identity() {
  assert_fault_namespace "$1" || return 126
  kubectl -n "$1" get pod "$2" -o json | node --input-type=module -e '
let input = ""; for await (const chunk of process.stdin) input += chunk;
const p = JSON.parse(input), name = process.argv[1];
const c = p.spec?.containers?.find(c => c.name === name);
const r = p.status?.containerStatuses?.find(c => c.name === name);
if (!p.metadata?.uid || p.metadata.deletionTimestamp || !c || !r?.state?.running
  || !r.containerID || !r.imageID) process.exit(1);
console.log(JSON.stringify({ name: p.metadata.name, uid: p.metadata.uid,
  owners: p.metadata.ownerReferences, container: name, image: c.image,
  imageID: r.imageID, containerID: r.containerID, restarts: r.restartCount }));
' "$3"
}
freeze_fault_consumer() {
  local key="$1" namespace="$2" pod="$3" container="$4"
  test ! -e "$EVIDENCE_DIR/$key-consumer.json" || return 126
  fault_consumer_identity "$namespace" "$pod" "$container" > "$EVIDENCE_DIR/$key-consumer.json"
}
assert_fault_consumer() {
  local key="$1" namespace="$2" pod="$3" container="$4" current
  current=$(fault_consumer_identity "$namespace" "$pod" "$container") || return 126
  test "$current" = "$(cat "$EVIDENCE_DIR/$key-consumer.json")" || return 126
}
fault_consumer_exec() {
  local key="$1" namespace="$2" pod="$3" container="$4" status=0
  shift 4
  assert_fault_consumer "$key" "$namespace" "$pod" "$container" || return 126
  kubectl -n "$namespace" exec "$pod" -c "$container" -- "$@" || status=$?
  assert_fault_consumer "$key" "$namespace" "$pod" "$container" || return 126
  return "$status"
}
bind_fault_namespace "$NAMESPACE" "$EXPECTED_FAULT_NAMESPACE_UID" || exit 126
if [ "$PRISM_NAMESPACE" = "$NAMESPACE" ]; then
  test "$EXPECTED_FAULT_PRISM_NAMESPACE_UID" = "$EXPECTED_FAULT_NAMESPACE_UID" || exit 126
else
  bind_fault_namespace "$PRISM_NAMESPACE" "$EXPECTED_FAULT_PRISM_NAMESPACE_UID" || exit 126
fi
```

For every consumer name below, use the actual Pod and container from the
independent administration record. Verify its controller owner references through
the ReplicaSet to the selected Deployment UID before freezing it. These helpers
do not discover that ownership for you. Record the read and stop for mismatch.
The identity check permits a Running container that is no longer Ready, so the
fault does not block the dependency observation at a readiness wait.
JSON Patch tests bind the UID and current resource version to the same resource
mutation. A conflict, missing target, or lost response stops the sequence.
Read the same guarded object to determine whether its intended field changed;
do not repeat an uncertain request without that observation. The tests do not
atomically bind a namespace UID or a later Pod exec request. The owner's exclusion
must cover those check/request intervals and controller actions. If it lapses,
stop even when all UID checks match. Restore traps use the same guards and must
stop on replacement; they never repair a new object with an old snapshot.
Use the independent route and platform owner to contain that incident.

The [Kubernetes update contract](https://kubernetes.io/docs/reference/using-api/api-concepts/#updates-to-existing-resources)
explains patch and resource-version conflicts. The
[JSON Patch test operation](https://www.rfc-editor.org/rfc/rfc6902#section-4.6)
explains the atomic field comparisons. These guards apply only to the resources
that these KubeClaw exercises select; they are not a general cluster fencing service.

### Redis Unavailable

The [role health client bounds Redis connection and command waits](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/charts/kubeclaw/templates/deployment.yaml#L797-L821),
[uses `XADD` for the startup stream check](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/charts/kubeclaw/templates/deployment.yaml#L825-L840),
and [exits nonzero on a failed enabled check](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/charts/kubeclaw/templates/deployment.yaml#L903-L929).
The [audit reader rebuilds hash-verified durable events from filesystem state](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/nova/core/telemetry/audit.ts#L14-L27).
These mechanisms explain why Redis availability and readable Nova lifecycle
state are separate observations. The checks for this page did not execute a Redis outage.


> **Source evidence — Redis health and durable run authority**
>
> **Claim:** Enabled role health bounds Redis connection/command waits; startup writes a health-stream entry. Nova audit remains a separate filesystem authority.
>
> **Implementation:** [openRedis and PING](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/charts/kubeclaw/templates/deployment.yaml#L797-L824); [startup XADD](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/charts/kubeclaw/templates/deployment.yaml#L825-L840); [readPipelineAudit](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/nova/core/telemetry/audit.ts#L14-L27).
>
> **Contract or setting:** [Enabled startup/readiness checks and failed exit](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/charts/kubeclaw/templates/deployment.yaml#L903-L929); the selected role render must enable Redis health and Nova stream checks.
>
> **Test evidence:** [Filesystem audit regression with unavailable projections](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/tests/verification/reliability/audit-projection.test.mts#L10-L28): **SOURCE ONLY; NOT EXECUTED**. It covers audit reconstruction, not a Redis outage. There is no maintained repository test for this role-health/outage procedure. **LOCAL CHECKS PASSED:** the extracted cause classifier and before/during/after audit comparison used synthetic data.
>
> **Revision:** 4d3068465a2e202d2d5073b77e9273c308497995
>
> **Limit:** We ran no actual Redis denial, in-window live audit or authenticated stream recovery here. We established no unchanged-PVC result.


Before the first audit in this exercise, complete
[Inspect a Run](operate.md#inspect-a-run) and define its canonical
`preserve_run_state` helper in the same shell. Select an existing run from its
retained start record whose Nova owner has exited. Verify its original
`PLATFORM_FILE` and `SELECTED_RUN_ID`, stop new writes to that run and its
owning adapter stores, and retain verified adapter copies. Keep these writers
stopped through the baseline, fault-window, and recovery audits. Do not interrupt an active pipeline to manufacture
a successful Redis exercise. If ownership or preservation cannot be established,
stop before the fault. Role health checks are separate from run writers.

Precondition: `statefulset/redis-master` has a positive ready replica count,
its PVC is bound, and both role smoke checks pass. Both roles must have Redis
health checks enabled; Nova must also have its Redis stream startup check
enabled. Confirm these conditions in the reviewed render before the fault. Scaling to zero stops the process but
does not delete its PVC. Record the original replica count so restoration does
not assume one.

```bash
assert_cluster_binding || exit 126
./scripts/deploy.sh smoke-agent nova
./scripts/deploy.sh smoke-agent buster
export REDIS_CONSUMER_POD="<recorded-actual-nova-pod>"
readonly REDIS_CONSUMER_POD
freeze_fault_consumer redis "$NAMESPACE" "$REDIS_CONSUMER_POD" kubeclaw || exit 126
freeze_fault_target redis "$NAMESPACE" statefulset/redis-master || exit 126
kubectl -n "$NAMESPACE" get statefulset/redis-master \
  -o jsonpath='{.spec.replicas}' > "$EVIDENCE_DIR/redis-replicas.txt"
grep -Eq '^[1-9][0-9]*$' "$EVIDENCE_DIR/redis-replicas.txt"
kubectl -n "$NAMESPACE" get pvc -l app.kubernetes.io/name=redis \
  -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.metadata.uid}{"\n"}{end}' \
  | sort > "$EVIDENCE_DIR/redis-pvc-before.txt"
test -s "$EVIDENCE_DIR/redis-pvc-before.txt"
export RUN_CONTROL_PLATFORM="$PLATFORM_FILE"
export RUN_CONTROL_RUN_ID="$SELECTED_RUN_ID"
preserve_run_state || exit 1
printf '%s\n' "$RUN_CONTROL_OBSERVATION_ROOT" > "$EVIDENCE_DIR/redis-raw-before.txt" || exit 1
npm --silent run pipeline -- --platform "$RUN_CONTROL_PLATFORM" --audit "$RUN_CONTROL_RUN_ID" \
  > "$EVIDENCE_DIR/redis-nova-audit-before.json"
redis_restore_pending=1
restore_redis() {
  assert_cluster_binding || return 126
  if [ "${redis_restore_pending:-0}" -eq 1 ]; then
    redis_replicas="$(cat "$EVIDENCE_DIR/redis-replicas.txt")"
    scale_fault_target redis "$NAMESPACE" statefulset/redis-master "$redis_replicas" || return 126
    kubectl -n "$NAMESPACE" rollout status statefulset/redis-master --timeout=180s || return 1
    ./scripts/deploy.sh smoke-agent nova || return 1
    ./scripts/deploy.sh smoke-agent buster || return 1
    kubectl -n "$NAMESPACE" exec deployment/agent-nova -c kubeclaw -- \
      node /runtime-config/kubeclaw-health.mjs startup
  fi
}
trap 'restore_redis' EXIT
trap 'exit 130' HUP INT TERM
scale_fault_target redis "$NAMESPACE" statefulset/redis-master 0 || exit 126
kubectl -n "$NAMESPACE" wait --for=delete pod -l app.kubernetes.io/name=redis \
  --timeout=120s
set +e
date -u +%Y-%m-%dT%H:%M:%SZ > "$EVIDENCE_DIR/redis-fault-start.txt"
fault_consumer_exec redis "$NAMESPACE" "$REDIS_CONSUMER_POD" kubeclaw \
  node /runtime-config/kubeclaw-health.mjs readiness \
  > "$EVIDENCE_DIR/redis-fault.txt" 2>&1
redis_fault_status=$?
set -e
printf '%s\n' "$redis_fault_status" > "$EVIDENCE_DIR/redis-fault.exit"
test "$redis_fault_status" -ne 0
node - "$EVIDENCE_DIR/redis-fault.txt" <<'NODE'
const fs = require('node:fs');
const lines = fs.readFileSync(process.argv[2], 'utf8').trim().split('\n');
const result = JSON.parse(lines.at(-1));
const failures = result.failures;
if (result.ok !== false || result.mode !== 'readiness' || result.agent !== 'nova'
  || !Array.isArray(failures) || failures.length !== 1
  || !/^redis ping: /u.test(failures[0])
  || /NOAUTH|WRONGPASS|credential|password/iu.test(failures[0])
  || !/ECONNREFUSED|ETIMEDOUT|timeout|timed out|connect|Connection is closed/iu.test(failures[0])) {
  throw new Error('not an isolated Redis reachability failure; stop');
}
NODE
preserve_run_state || exit 1
printf '%s\n' "$RUN_CONTROL_OBSERVATION_ROOT" > "$EVIDENCE_DIR/redis-raw-during.txt" || exit 1
npm --silent run pipeline -- --platform "$RUN_CONTROL_PLATFORM" --audit "$RUN_CONTROL_RUN_ID" \
  > "$EVIDENCE_DIR/redis-nova-audit-during.json"
date -u +%Y-%m-%dT%H:%M:%SZ > "$EVIDENCE_DIR/redis-fault-end.txt"
```

Expected observation: Nova's enabled health consumer reports only a Redis PING
reachability failure. The direct readiness call does not wait for the Deployment
to become Ready. A wrapper timeout, exec error, authentication failure, unrelated
health failure, or missing JSON is a different result and stops this exercise.
The selected Nova audit must remain readable inside the recorded Redis outage,
after a new verified raw copy and with all its writers still stopped.
Record journal state separately from the missing Redis projection. The safe
decision is to stop only Redis-dependent adapters and observers. Do not reset
Nova or Buster state, recreate an event, or loop the request.

Restore exactly the recorded replica count, then require both authenticated
role checks. The startup portion also exercises the bounded stream check; a Pod
becoming Ready by itself is not functional recovery.

```bash
assert_cluster_binding || exit 126
restore_redis
kubectl -n "$NAMESPACE" exec deployment/agent-nova -c kubeclaw -- \
  node --input-type=module -e '
import Redis from "ioredis";
const redis = new Redis({ host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT),
  username: process.env.REDIS_USERNAME || undefined, password: process.env.REDIS_PASSWORD,
  lazyConnect: true, maxRetriesPerRequest: 1 });
try {
  await redis.connect();
  const stream = process.env.KUBECLAW_HEALTH_REDIS_STREAM || "kubeclaw:health:nova";
  const rows = await redis.xrevrange(stream, "+", "-", "COUNT", 1);
  if (!rows[0]?.[0]) process.exit(1);
  console.log(JSON.stringify({ streamKey: stream, entryId: rows[0][0] }));
} finally { await redis.quit().catch(() => redis.disconnect()); }
' > "$EVIDENCE_DIR/redis-stream-after.json"
preserve_run_state || exit 1
printf '%s\n' "$RUN_CONTROL_OBSERVATION_ROOT" > "$EVIDENCE_DIR/redis-raw-after.txt" || exit 1
npm --silent run pipeline -- --platform "$RUN_CONTROL_PLATFORM" --audit "$RUN_CONTROL_RUN_ID" \
  > "$EVIDENCE_DIR/redis-nova-audit-after.json"
node - "$EVIDENCE_DIR/redis-nova-audit-before.json" \
  "$EVIDENCE_DIR/redis-nova-audit-during.json" \
  "$EVIDENCE_DIR/redis-nova-audit-after.json" "$SELECTED_RUN_ID" <<'NODE'
const fs = require('node:fs');
const [beforeFile, duringFile, afterFile, runId] = process.argv.slice(2);
const audits = [beforeFile, duringFile, afterFile].map(p => JSON.parse(fs.readFileSync(p, 'utf8')));
if (audits.some(a => a.runId !== runId || !a.journalHead)
  || audits.some(a => a.journalHead !== audits[0].journalHead)) {
  throw new Error('stopped selected run was unreadable or changed across the Redis outage');
}
NODE
kubectl -n "$NAMESPACE" get pvc -l app.kubernetes.io/name=redis \
  -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.metadata.uid}{"\n"}{end}' \
  | sort > "$EVIDENCE_DIR/redis-pvc-after.txt"
diff -u "$EVIDENCE_DIR/redis-pvc-before.txt" "$EVIDENCE_DIR/redis-pvc-after.txt"
kubectl -n "$NAMESPACE" get pods -l app.kubernetes.io/name=redis -o wide \
  | tee "$EVIDENCE_DIR/redis-after.txt"
redis_restore_pending=0
trap - EXIT HUP INT TERM
```

Cleanup consists only of removing any deliberately queued test observation
through its owning adapter's retention rule. Keep the original Nova journal,
the failure output, and the successful new stream identity. If rollout or the
functional checks fail, keep admission stopped and escalate; do not delete the
PVC.

### Prism PostgreSQL Unavailable

The [Prism smoke command probes Control, Worker, gateway, and the Prism
database separately](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/scripts/deploy.sh#L1802-L1811).
[Control readiness queries PostgreSQL](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/prism/server/control-server.ts#L145-L149),
and [the Worker bounds its private nonce-database connection and query waits](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/prism/server/worker-readiness.ts#L32-L50).
The [LiteLLM deployment consumes its own Secret configuration and database
startup state](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/my-values/infra/litellm-deployment.yaml#L32-L63).
These sources define the consumers checked here; the two live outage windows
remain unexecuted for this page.

The SQL observer uses the [Control database configuration](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/charts/prism/templates/workloads.yaml#L98-L103)
and the [selected Control image's Node dependencies](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/docker/Dockerfile.prism-control#L13-L18).
Its five-second connection/query deadlines are operator observer limits, not
the live Control pool's timeout. The [Control HTTP error response](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/prism/server/control-server.ts#L923-L931)
reports a failed readiness database query as status 422.


> **Source evidence — separate PostgreSQL owners and consumers**
>
> **Claim:** Prism Control queries its selected database for readiness; Worker bounds its nonce-database checks. LiteLLM consumes a separate Secret/database configuration.
>
> **Implementation:** [Control ready query](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/prism/server/control-server.ts#L145-L149); [WorkerNonceDatabase limits](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/prism/server/worker-readiness.ts#L32-L50); [LiteLLM database startup configuration](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/my-values/infra/litellm-deployment.yaml#L32-L63).
>
> **Contract or setting:** [Control DATABASE_URL Secret reference](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/charts/prism/templates/workloads.yaml#L98-L103) and [Control HTTP error response](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/prism/server/control-server.ts#L923-L931). The five-second direct SQL observer is an operator limit.
>
> **Test evidence:** [Worker native connection-refusal and query-cancellation tests](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/prism/tests/worker-readiness.test.mts#L8-L41): **SOURCE ONLY; NOT EXECUTED**. The cancellation case requires an isolated migrated database. These tests do not cover Control, Studio or the opposite LiteLLM outage. There is no maintained repository test for that complete two-window procedure. **LOCAL CHECKS PASSED:** direct cause-classifier vectors used a private SQL dependency double.
>
> **Revision:** 4d3068465a2e202d2d5073b77e9273c308497995
>
> **Limit:** We ran no live database loss/restoration or Studio reader. The existing-document comparison cannot verify a retained artifact digest.


This exercise targets Prism PostgreSQL only. Precondition: `prism-smoke` passes,
LiteLLM and its separate `statefulset/postgresql` are ready, and no Prism write
or database backup is in progress. Record the selected project and operation
IDs before the fault. In Studio, select a project with no pending revision or
design-round request. Record the project ID, document ID from the final URL,
displayed title, revision, and one selected design value before the outage.
Keep all project writers stopped. Do not use a session that will reconnect a
pending mutation on opening Studio.

```bash
assert_cluster_binding || exit 126
./scripts/deploy.sh prism-smoke
kubectl -n "$NAMESPACE" rollout status statefulset/postgresql --timeout=120s
export PRISM_DATABASE_CONSUMER_POD="<recorded-actual-prism-control-pod>"
export PRISM_DATABASE_CONSUMER_CONTAINER="<recorded-control-container-name>"
readonly PRISM_DATABASE_CONSUMER_POD PRISM_DATABASE_CONSUMER_CONTAINER
freeze_fault_consumer prism-db "$PRISM_NAMESPACE" "$PRISM_DATABASE_CONSUMER_POD" \
  "$PRISM_DATABASE_CONSUMER_CONTAINER" || exit 126
freeze_fault_target prism-postgresql "$PRISM_NAMESPACE" statefulset/prism-postgresql || exit 126
kubectl -n "$PRISM_NAMESPACE" get statefulset/prism-postgresql \
  -o jsonpath='{.spec.replicas}' > "$EVIDENCE_DIR/prism-postgresql-replicas.txt"
grep -Eq '^[1-9][0-9]*$' "$EVIDENCE_DIR/prism-postgresql-replicas.txt"
kubectl -n "$PRISM_NAMESPACE" get pvc -l app=prism-postgresql \
  -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.metadata.uid}{"\n"}{end}' \
  | sort > "$EVIDENCE_DIR/prism-postgresql-pvc-before.txt"
test -s "$EVIDENCE_DIR/prism-postgresql-pvc-before.txt"
prism_postgresql_restore_pending=1
restore_prism_postgresql() {
  assert_cluster_binding || return 126
  if [ "${prism_postgresql_restore_pending:-0}" -eq 1 ]; then
    prism_db_replicas="$(cat "$EVIDENCE_DIR/prism-postgresql-replicas.txt")"
    scale_fault_target prism-postgresql "$PRISM_NAMESPACE" statefulset/prism-postgresql "$prism_db_replicas" || return 126
    kubectl -n "$PRISM_NAMESPACE" rollout status statefulset/prism-postgresql \
      --timeout=180s || return 1
    ./scripts/deploy.sh prism-smoke || return 1
    kubectl -n "$PRISM_NAMESPACE" exec statefulset/prism-postgresql -- \
      pg_isready -U postgres -d prism
  fi
}
trap 'restore_prism_postgresql' EXIT
trap 'exit 130' HUP INT TERM
scale_fault_target prism-postgresql "$PRISM_NAMESPACE" statefulset/prism-postgresql 0 || exit 126
kubectl -n "$PRISM_NAMESPACE" wait --for=delete pod -l app=prism-postgresql \
  --timeout=120s
set +e
date -u +%Y-%m-%dT%H:%M:%SZ > "$EVIDENCE_DIR/prism-postgresql-fault-start.txt"
fault_consumer_exec prism-db "$PRISM_NAMESPACE" "$PRISM_DATABASE_CONSUMER_POD" \
  "$PRISM_DATABASE_CONSUMER_CONTAINER" node --input-type=module -e '
const r = await fetch("http://127.0.0.1:8080/ready", { signal: AbortSignal.timeout(10000) });
console.log(JSON.stringify({ status: r.status, body: await r.text() }));
if (r.ok) process.exit(1);
' > "$EVIDENCE_DIR/prism-control-fault.json" 2> "$EVIDENCE_DIR/prism-control-fault.stderr"
prism_control_observer_status=$?
fault_consumer_exec prism-db "$PRISM_NAMESPACE" "$PRISM_DATABASE_CONSUMER_POD" \
  "$PRISM_DATABASE_CONSUMER_CONTAINER" node --input-type=module -e '
import pg from "pg";
if (!process.env.DATABASE_URL) process.exit(2);
const url = new URL(process.env.DATABASE_URL);
if (url.hostname !== "prism-postgresql" || url.pathname !== "/prism") process.exit(2);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000, statement_timeout: 5000 });
try { await client.connect(); await client.query("SELECT 1"); process.exitCode = 1; }
catch (error) {
  const code = error?.code ?? "";
  if (!["ECONNREFUSED", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH"].includes(code)
    && !/connection timeout|timeout expired|timeout exceeded/iu.test(error?.message ?? "")) process.exitCode = 2;
  else console.log(JSON.stringify({ observation: "prism-database-unreachable", host: url.hostname,
    database: "prism", code, at: new Date().toISOString() }));
} finally { await client.end(); }
' > "$EVIDENCE_DIR/prism-postgresql-fault.json" 2> "$EVIDENCE_DIR/prism-postgresql-fault.stderr"
prism_database_observer_status=$?
set -e
printf '%s\n' "$prism_control_observer_status" > "$EVIDENCE_DIR/prism-control-fault.exit"
printf '%s\n' "$prism_database_observer_status" > "$EVIDENCE_DIR/prism-postgresql-fault.exit"
test "$prism_control_observer_status" -eq 0
test "$prism_database_observer_status" -eq 0
node - "$EVIDENCE_DIR/prism-control-fault.json" <<'NODE'
const fs = require('node:fs');
const result = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (result.status !== 422 || !/ECONNREFUSED|ETIMEDOUT|connect|connection timeout/iu.test(result.body)
  || /password|authentication|role .* does not exist/iu.test(result.body)) {
  throw new Error('Control failure was not the selected database reachability failure');
}
NODE
date -u +%Y-%m-%dT%H:%M:%SZ > "$EVIDENCE_DIR/prism-postgresql-fault-end.txt"
kubectl -n "$NAMESPACE" rollout status statefulset/postgresql --timeout=120s
```

Expected observation: the direct Control readiness request returns its database
reachability error, and the bounded SQL client from the same consumer cannot
connect to `prism-postgresql` database `prism`. The database Pod is absent, so
exec into that StatefulSet cannot supply an in-window `pg_isready` result.
LiteLLM PostgreSQL remains ready. Failed exec, missing client, wrong database,
authentication, schema, or unclassified failure cannot pass this observation. The safe
decision is to stop new Prism mutations and preserve Control operation,
revision, and artifact identities. Do not fail over, restore, or point Prism at
the LiteLLM database merely to make readiness green.

```bash
restore_prism_postgresql
```

After the database check, use the maintained
[Studio project read](prism-studio.md#step-2-open-studio-and-choose-the-project).
Open the recorded project and document. Compare the final URL's project and
document IDs, displayed title and revision, and the recorded design value with
the baseline. Record both reads with UTC times. A changed document, automatic
round reconnect, or unreadable design stops application recovery. Do not edit,
approve, or publish to make the comparison pass.

This proves recovery of the retained design document through its application
reader. Studio [loads the existing document](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/prism/studio/app.tsx#L112-L147)
and [displays its revision](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/prism/studio/app.tsx#L531-L545).
It does not display an existing artifact or bundle digest. The digest shown
[after approval and publication](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/prism/studio/app.tsx#L366-L403)
belongs to that new mutation. It cannot prove retention of an older artifact.
If the incident also requires artifact integrity, retain its original object
identity and digest from the original receipt. Stop that part of recovery:
this Studio read supplies no matching retained-artifact digest lookup.
The Prism artifact/runtime owner must supply a maintained authorized read that
binds the original object and digest, verifies its existing bytes after recovery,
and describes credential, retention, and cleanup boundaries before artifact
recovery can close. No new publication can substitute for that read.

The exercise creates no disposable database resource. Keep the rollback trap
armed through the document comparison and original replica/PVC identity checks.
After those supported checks pass, disarm it. Retain an artifact incident as
open separately when its digest read is unavailable:

```bash
assert_cluster_binding || exit 126
kubectl -n "$PRISM_NAMESPACE" get pvc -l app=prism-postgresql \
  -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.metadata.uid}{"\n"}{end}' \
  | sort > "$EVIDENCE_DIR/prism-postgresql-pvc-after.txt"
diff -u "$EVIDENCE_DIR/prism-postgresql-pvc-before.txt" \
  "$EVIDENCE_DIR/prism-postgresql-pvc-after.txt"
prism_postgresql_restore_pending=0
trap - EXIT HUP INT TERM
```

The two PostgreSQL domains must also be distinguishable in the opposite
direction. As a separate window, run the healthy embedding command in
[the LiteLLM exercise](#litellm-upstream-timeout), record the
LiteLLM database replica count, stop only that database, and restart LiteLLM so
startup cannot hide behind an established pool. Prism must continue to pass its
own smoke check.

```bash
assert_cluster_binding || exit 126
litellm_embedding_probe() {
  assert_cluster_binding || return 126
  probe_text="$1"
  kubectl -n "$NAMESPACE" exec deployment/agent-nova -c kubeclaw -- \
    env KUBECLAW_PROBE_TEXT="$probe_text" node --input-type=module -e '
const r = await fetch(`${process.env.LITELLM_URL}/v1/embeddings`, {
  method: "POST",
  headers: { authorization: `Bearer ${process.env.LITELLM_API_KEY}`, "content-type": "application/json" },
  body: JSON.stringify({ model: "gemini-embedding-001", input: process.env.KUBECLAW_PROBE_TEXT }),
  signal: AbortSignal.timeout(60000)
});
const b = await r.json(); const v = b?.data?.[0]?.embedding;
if (!r.ok || !Array.isArray(v) || v.length === 0 || !v.every(Number.isFinite)) process.exit(1);
console.log(JSON.stringify({ model: b.model ?? "gemini-embedding-001", dimensions: v.length }));
'
}
litellm_embedding_probe "database pre-fault probe" \
  | tee "$EVIDENCE_DIR/litellm-postgresql-before.json"
freeze_fault_target litellm-postgresql "$NAMESPACE" statefulset/postgresql || exit 126
kubectl -n "$NAMESPACE" get statefulset/postgresql \
  -o jsonpath='{.spec.replicas}' > "$EVIDENCE_DIR/litellm-postgresql-replicas.txt"
grep -Eq '^[1-9][0-9]*$' "$EVIDENCE_DIR/litellm-postgresql-replicas.txt"
kubectl -n "$NAMESPACE" get pvc -l app.kubernetes.io/instance=postgresql \
  -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.metadata.uid}{"\n"}{end}' \
  | sort > "$EVIDENCE_DIR/litellm-postgresql-pvc-before.txt"
test -s "$EVIDENCE_DIR/litellm-postgresql-pvc-before.txt"
freeze_fault_target litellm-db-consumer "$NAMESPACE" deployment/litellm || exit 126
litellm_postgresql_restore_pending=1
restore_litellm_postgresql() {
  assert_cluster_binding || return 126
  if [ "${litellm_postgresql_restore_pending:-0}" -eq 1 ]; then
    litellm_db_replicas="$(cat "$EVIDENCE_DIR/litellm-postgresql-replicas.txt")"
    scale_fault_target litellm-postgresql "$NAMESPACE" statefulset/postgresql "$litellm_db_replicas" || return 126
    kubectl -n "$NAMESPACE" rollout status statefulset/postgresql --timeout=180s || return 1
    kubectl -n "$NAMESPACE" rollout status deployment/litellm --timeout=180s || return 1
    ./scripts/deploy.sh prism-smoke || return 1
    litellm_embedding_probe "database recovery probe"
  fi
}
trap 'restore_litellm_postgresql' EXIT
trap 'exit 130' HUP INT TERM
scale_fault_target litellm-postgresql "$NAMESPACE" statefulset/postgresql 0 || exit 126
kubectl -n "$NAMESPACE" wait --for=delete pod \
  -l app.kubernetes.io/instance=postgresql --timeout=120s
litellm_db_fault_started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
restart_fault_target litellm-db-consumer "$NAMESPACE" deployment/litellm || exit 126
set +e
kubectl -n "$NAMESPACE" rollout status deployment/litellm --timeout=90s \
  > "$EVIDENCE_DIR/litellm-postgresql-fault.txt" 2>&1
litellm_postgresql_fault_status=$?
set -e
printf '%s\n' "$litellm_postgresql_fault_status" > "$EVIDENCE_DIR/litellm-postgresql-fault.exit"
test "$litellm_postgresql_fault_status" -ne 0
assert_fault_target litellm-db-consumer "$NAMESPACE" deployment/litellm || exit 126
kubectl -n "$NAMESPACE" logs deployment/litellm --all-containers=true --timestamps \
  --since-time="$litellm_db_fault_started_at" > "$EVIDENCE_DIR/litellm-postgresql-fault-logs.txt"
./scripts/deploy.sh prism-smoke
restore_litellm_postgresql
litellm_embedding_probe "database recovery evidence" \
  | tee "$EVIDENCE_DIR/litellm-postgresql-after.json"
kubectl -n "$NAMESPACE" get pvc -l app.kubernetes.io/instance=postgresql \
  -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.metadata.uid}{"\n"}{end}' \
  | sort > "$EVIDENCE_DIR/litellm-postgresql-pvc-after.txt"
diff -u "$EVIDENCE_DIR/litellm-postgresql-pvc-before.txt" \
  "$EVIDENCE_DIR/litellm-postgresql-pvc-after.txt"
litellm_postgresql_restore_pending=0
trap - EXIT HUP INT TERM
```

The failed rollout alone cannot identify database loss. In the recorded LiteLLM
startup logs, require a PostgreSQL connection/refusal or timeout for its selected
`postgresql` database endpoint inside this fault interval. Authentication,
migration/schema, missing configuration, image pull, capacity, or an unrelated
startup error is a different cause. If the runtime emits no retained error that
identifies that endpoint, stop this ownership check and retain the actual logs
for the LiteLLM/platform owners; do not infer the cause from nonzero status.
Record the selected restarted Pod/container identity and startup error separately
from the original Deployment UID. That Pod replacement is intended here.
Pass this ownership check only when LiteLLM recovers, Prism stayed healthy, and
both database PVC identities are unchanged. Never cross-restore or copy
credentials between the two PostgreSQL releases.

### Registry Endpoint Unavailable During BuildKit Push

The [deploy command selects the maintained Nova-to-Buster BuildKit proof](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/scripts/deploy.sh#L2036-L2042).
That proof [requires completed remote work, matching imported evidence, and a
digest-qualified image output](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/tests/verification/e2e/nova-buildkit-production-preflight.mts#L88-L109)
before it [emits `registryPushVerified`, `manifestVerified`, and the immutable
image receipt](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/tests/verification/e2e/nova-buildkit-production-preflight.mts#L117-L127).
A `/v2/` response is only a reachability observation. It does not replace those
assertions or a node pull. This live proof was not run for this page.


> **Source evidence — BuildKit publication and imported image receipt**
>
> **Claim:** The maintained preflight requires completed remote work, matching import evidence and a digest-qualified image before it emits its build receipt.
>
> **Implementation:** [Build preflight checks and receipt](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/tests/verification/e2e/nova-buildkit-production-preflight.mts#L88-L127); [deployment command selection](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/scripts/deploy.sh#L2036-L2042).
>
> **Contract or setting:** [Resolved container plan and limits](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/tests/verification/e2e/nova-buildkit-production-preflight.mts#L58-L86) bind the source/request sent to the selected Buster provider.
>
> **Test evidence:** [Maintained build preflight assertions](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/tests/verification/e2e/nova-buildkit-production-preflight.mts#L88-L116): **SOURCE ONLY; NOT EXECUTED**. This program is both the task implementation and its maintained test authority. It was read, not run. **LOCAL CHECKS PASSED:** selector/endpoint helpers used synthetic objects.
>
> **Revision:** 4d3068465a2e202d2d5073b77e9273c308497995
>
> **Limit:** No real build, registry push, digest verification, import, node pull or application consumer result is established.


This lab-profile exercise requires the selected writable Service to be
`registry-local` and the mirror to be `registry-mirror`. For another production
registry, use that registry owner's maintained deny-push policy and restore
command; do not translate the lab Service mutation below to a credential or TLS
bypass. Preflight must prove the full Nova-to-Buster build path first.
The commands below are a bounded endpoint-denial rehearsal. The original
BuildKit failure and recovery task remains blocked at the custody and image
consumer boundaries described below. Read those limits before starting.
If the healthy baseline fails or disconnects, stop before the Service mutation
and follow the original-build uncertainty rule; do not retry it.

```bash
assert_cluster_binding || exit 126
registry_baseline_status=0
./scripts/deploy.sh nova-buildkit-preflight \
  > "$EVIDENCE_DIR/registry-buildkit-baseline.txt" 2>&1 || registry_baseline_status=$?
printf '%s\n' "$registry_baseline_status" > "$EVIDENCE_DIR/registry-buildkit-baseline.exit"
test "$registry_baseline_status" -eq 0 || exit 1
kubectl auth can-i patch services -n "$NAMESPACE" | grep -qx yes
freeze_fault_target registry-service "$NAMESPACE" service/registry-local || exit 126
export REGISTRY_CONSUMER_POD="<recorded-actual-buster-pod>"
readonly REGISTRY_CONSUMER_POD
freeze_fault_consumer registry "$NAMESPACE" "$REGISTRY_CONSUMER_POD" kubeclaw || exit 126
kubectl -n "$NAMESPACE" get service/registry-local -o json \
  > "$EVIDENCE_DIR/registry-service-before.json"
kubectl -n "$NAMESPACE" get service/registry-local \
  -o jsonpath='{.spec.selector}' \
  > "$EVIDENCE_DIR/registry-selector-before.json"
node - "$EVIDENCE_DIR/registry-service-before.json" \
  "$EVIDENCE_DIR/registry-selector-before.json" \
  "$EVIDENCE_DIR/registry-selector-restore-patch.json" <<'NODE'
const fs = require('node:fs');
const [serviceFile, selectorFile, patchFile] = process.argv.slice(2);
const service = JSON.parse(fs.readFileSync(serviceFile, 'utf8'));
const selector = JSON.parse(fs.readFileSync(selectorFile, 'utf8'));
if (service.metadata?.name !== 'registry-local'
  || service.metadata?.namespace !== process.env.NAMESPACE
  || !selector || Array.isArray(selector) || !Object.keys(selector).length
  || !service.spec?.ports?.some(port => port.protocol === 'TCP' && port.port === 5001
    && port.targetPort === 5000)) {
  throw new Error('registry-local target or original selector is invalid');
}
const patch = [{ op: 'replace', path: '/spec/selector', value: selector }];
fs.writeFileSync(patchFile, `${JSON.stringify(patch)}\n`, { flag: 'wx', mode: 0o600 });
NODE
kubectl -n "$NAMESPACE" get endpoints/registry-local -o json \
  > "$EVIDENCE_DIR/registry-endpoints-before.json"
node -e '
const value = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
if (!(value.subsets ?? []).some(item => (item.addresses ?? []).length > 0)) process.exit(1);
' "$EVIDENCE_DIR/registry-endpoints-before.json"
kubectl -n "$NAMESPACE" get deployment/registry-mirror service/registry-mirror -o wide \
  | tee "$EVIDENCE_DIR/registry-mirror-before.txt"
registry_restore_pending=1
restore_registry_selector() {
  assert_cluster_binding || return 126
  if [ "${registry_restore_pending:-0}" -eq 1 ]; then
    assert_fault_target registry-service "$NAMESPACE" service/registry-local || return 126
    kubectl -n "$NAMESPACE" get service/registry-local \
      -o jsonpath='{.spec.selector}' \
      > "$EVIDENCE_DIR/registry-selector-rollback.json"
    if ! cmp -s "$EVIDENCE_DIR/registry-selector-before.json" \
      "$EVIDENCE_DIR/registry-selector-rollback.json"; then
      patch_fault_target registry-service "$NAMESPACE" service/registry-local \
        < "$EVIDENCE_DIR/registry-selector-restore-patch.json" || return 126
      kubectl -n "$NAMESPACE" get service/registry-local \
        -o jsonpath='{.spec.selector}' \
        > "$EVIDENCE_DIR/registry-selector-rollback.json"
    fi
    node -e '
const fs = require("node:fs");
const [before, after] = process.argv.slice(1).map(file => JSON.parse(fs.readFileSync(file, "utf8")));
const canonical = value => JSON.stringify(Object.fromEntries(Object.entries(value).sort()));
if (canonical(before) !== canonical(after)) process.exit(1);
' "$EVIDENCE_DIR/registry-selector-before.json" \
      "$EVIDENCE_DIR/registry-selector-rollback.json"
  fi
}
trap 'restore_registry_selector' EXIT
trap 'exit 130' HUP INT TERM
printf '%s\n' '[{"op":"replace","path":"/spec/selector","value":{"kubeclaw-fault":"unavailable-during-buildkit-push"}}]' \
  | patch_fault_target registry-service "$NAMESPACE" service/registry-local || exit 126
kubectl -n "$NAMESPACE" get service/registry-local \
  -o jsonpath='{.spec.selector}' \
  > "$EVIDENCE_DIR/registry-selector-fault.json"
node -e '
const value = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
if (JSON.stringify(value) !== JSON.stringify({"kubeclaw-fault":"unavailable-during-buildkit-push"})) process.exit(1);
' "$EVIDENCE_DIR/registry-selector-fault.json"
registry_endpoints_drained=0
registry_endpoint_attempt=0
while [ "$registry_endpoint_attempt" -lt 60 ]; do
  kubectl -n "$NAMESPACE" get endpoints/registry-local -o json \
    > "$EVIDENCE_DIR/registry-endpoints-fault.json"
  if node -e '
const value = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
process.exit((value.subsets ?? []).some(item => (item.addresses ?? []).length > 0) ? 1 : 0);
' "$EVIDENCE_DIR/registry-endpoints-fault.json"; then
    registry_endpoints_drained=1
    break
  fi
  registry_endpoint_attempt=$((registry_endpoint_attempt + 1))
  sleep 2
done
test "$registry_endpoints_drained" -eq 1
fault_consumer_exec registry "$NAMESPACE" "$REGISTRY_CONSUMER_POD" kubeclaw node --input-type=module -e '
const r = await fetch("http://registry-mirror:5000/v2/", { signal: AbortSignal.timeout(5000) });
if (!r.ok) process.exit(1);
'
date -u +%Y-%m-%dT%H:%M:%SZ > "$EVIDENCE_DIR/registry-route-fault-start.txt"
fault_consumer_exec registry "$NAMESPACE" "$REGISTRY_CONSUMER_POD" kubeclaw node --input-type=module -e '
try {
  const r = await fetch("http://registry-local:5001/v2/", { signal: AbortSignal.timeout(5000) });
  console.error(`writable endpoint responded with HTTP ${r.status}; not endpoint denial`);
  process.exitCode = 1;
} catch (error) {
  const code = error?.cause?.code ?? "";
  if (error?.name !== "TimeoutError" && !["ECONNREFUSED", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH"].includes(code)) {
    console.error(`unclassified route failure: ${code}`); process.exitCode = 1;
  } else console.log(JSON.stringify({ endpoint: "registry-local:5001", operation: "GET /v2/",
    classification: "writable-endpoint-unreachable", code, at: new Date().toISOString() }));
}
' > "$EVIDENCE_DIR/registry-route-fault.json" 2> "$EVIDENCE_DIR/registry-route-fault.stderr"
date -u +%Y-%m-%dT%H:%M:%SZ > "$EVIDENCE_DIR/registry-route-fault-end.txt"
```

Expected observation for this narrow route check: the writable endpoint has no
ready addresses and the Buster network observer reports a connection failure or
its five-second deadline, while the mirror `/v2/` check succeeds. This is route
evidence. It does not establish a BuildKit push failure, registry authorization,
digest verification, a node pull, or application recovery.

**Original build custody boundary:** Stop before submitting a build while the
endpoint is denied. The maintained preflight
[creates a new UUID and source fixture](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/tests/verification/e2e/nova-buildkit-production-preflight.mts#L16-L49)
and [uses a new idempotency key](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/tests/verification/e2e/nova-buildkit-production-preflight.mts#L65-L86)
on every invocation. Its
[finally block removes the temporary source and Nova state](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/tests/verification/e2e/nova-buildkit-production-preflight.mts#L127-L129),
also after failure. It supplies no operator custody/read operation for the
original failed request, source, imported result, and possibly accepted push.
The wrapper can also fail
[during receipt signing after remote success](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/scripts/deploy.sh#L2010-L2033).
A nonzero wrapper is therefore insufficient to classify registry denial or
prove that no image was published. Do not run it again as a retry.

For an existing failed or disconnected invocation, preserve its stdout, stderr,
exit status and UTC interval, all original run/job/attempt/request identities
and source/image digests that actually exist, and any signed or unsigned receipt.
Keep absent identities marked unavailable. Do not invent a digest or recreate
deleted state. Stop new build admission. The Buster provider, Nova runtime, and
registry owners must reconcile that original job and registry transaction
through an authorized original-identity read before another build is allowed.
If no supported read is available, retain the uncertainty and escalate through
[Lost Responses and Uncertain Effects](#lost-responses-and-uncertain-effects).
Do not manually import a result or edit durable state.

Before the required build-failure exercise can proceed, those owners must
provide a maintained custody and reconciliation procedure that retains the
original source, immutable plan/request/idempotency identities, attempt image
reference, remote result and logs through failure and interruption. It must
distinguish token/source/key/provider failures, BuildKit build or launch errors,
an actual push network/authentication error, manifest verification, import,
cleanup and signing failures. Require the original attempt's push-phase error
for the denied writable endpoint inside the fault interval, alongside mirror
health. Unrelated failures or missing logs leave that observation unproved.
The procedure must query the intended original digest or original attempt tag
through the registry owner's authorized read, verify any returned manifest
against that request, and resolve its terminal outcome without changed input.
This page has no supported original-state read to supply those steps today.


> **Source evidence — original build custody and retry boundary**
>
> **Claim:** Each preflight creates a new run, source and idempotency identity, then removes temporary source/state. A wrapper failure can follow successful remote work. A new preflight cannot reconcile the original uncertain push.
>
> **Implementation:** [Fixture/run creation](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/tests/verification/e2e/nova-buildkit-production-preflight.mts#L16-L49); [new request identity](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/tests/verification/e2e/nova-buildkit-production-preflight.mts#L81-L86); [temporary-state removal](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/tests/verification/e2e/nova-buildkit-production-preflight.mts#L127-L129).
>
> **Contract or setting:** [Receipt signing after preflight](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/scripts/deploy.sh#L2010-L2033) and the original-identity custody/stop conditions in this section apply before any new build.
>
> **Test evidence:** [Maintained successful build assertions](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/tests/verification/e2e/nova-buildkit-production-preflight.mts#L88-L116): **SOURCE ONLY; NOT EXECUTED**. They test successful remote completion/import; they do not test original failed-state custody, uncertain-push reconciliation or same-image consumer recovery. There is no maintained repository test for those unavailable operator steps.
>
> **Revision:** 4d3068465a2e202d2d5073b77e9273c308497995
>
> **Limit:** The Nova/Buster/registry owners must provide the original-state read described above. Route restoration or a distinct diagnostic image cannot close original-image recovery.


Restore the captured selector using the guarded original Service. Keep the
trap armed until selector comparison and endpoint checks pass. These restore
the route only. Do not start another preflight from this recovery block:

```bash
assert_cluster_binding || exit 126
restore_registry_selector
kubectl -n "$NAMESPACE" get service/registry-local \
  -o jsonpath='{.spec.selector}' \
  > "$EVIDENCE_DIR/registry-selector-after.json"
node - "$EVIDENCE_DIR/registry-selector-before.json" \
  "$EVIDENCE_DIR/registry-selector-after.json" <<'NODE'
const fs = require('node:fs');
const [before, after] = process.argv.slice(2).map(file => JSON.parse(fs.readFileSync(file, 'utf8')));
const canonical = value => JSON.stringify(Object.fromEntries(Object.entries(value).sort()));
if (canonical(before) !== canonical(after)) throw new Error('registry selector was not restored exactly');
NODE
registry_endpoints_ready=0
registry_endpoint_attempt=0
while [ "$registry_endpoint_attempt" -lt 60 ]; do
  kubectl -n "$NAMESPACE" get endpoints/registry-local -o json \
    > "$EVIDENCE_DIR/registry-endpoints-after.json"
  if node -e '
const value = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
process.exit((value.subsets ?? []).some(item => (item.addresses ?? []).length > 0) ? 0 : 1);
' "$EVIDENCE_DIR/registry-endpoints-after.json"; then
    registry_endpoints_ready=1
    break
  fi
  registry_endpoint_attempt=$((registry_endpoint_attempt + 1))
  sleep 2
done
test "$registry_endpoints_ready" -eq 1
registry_restore_pending=0
trap - EXIT HUP INT TERM
```

**Immutable-image recovery boundary:** The maintained build preflight verifies
push, registry manifest, and import, then emits a digest-qualified receipt. It
does not deploy that image onto a Kubernetes node or perform an application
consumer probe. The required recovery remains open after route restoration.
The platform and registry owners must provide a maintained digest-bound node
pull and application reader procedure for the original retained image, including
node/runtime trust and credentials, Pod/image identity, expected fixture content,
owned test-resource UIDs, uncertain CREATE/exec handling, and guarded cleanup.
Completion requires push and manifest verification for the original transaction,
a node pull of that exact digest, a consumer response matching its retained
source, and verified cleanup. A `/v2/` response or a later diagnostic image does
not supply those results. A separately authorized new preflight creates different
source bytes and image identity; label its receipt as a new diagnostic build.

Cleanup here is the guarded restoration of the original Service selector.
Keep baseline receipt and route observations. The maintained baseline preflight
owns removal of its temporary workspace; that removal is not custody of an
uncertain original failed build. If the shell exits early, the trap attempts
the same guarded rollback. Its failure is an incident requiring immediate
manual restoration through the
independent administration route. Do not delete registry blobs or BuildKit
cache as incident cleanup.

### Tailscale Authentication Rejected

The [maintained fixture explicitly allocates a Kubernetes lease, creates its
Tailscale exposure, and probes the new HTTP route](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/tests/verification/e2e/nova-tailscale-production-preflight.mts#L126-L145).
Its [receipt assertions bind exposure, lease, namespace, and imported evidence](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/tests/verification/e2e/nova-tailscale-production-preflight.mts#L174-L204).
The [deployment wrapper waits for both cluster objects to disappear](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/scripts/deploy.sh#L2552-L2578).
These are functional route and cleanup checks; this page does not claim they
ran against a Tailnet. The OAuth rejection check below classifies recorded
operator output. It fails if that output lacks a recognizable rejection.


> **Source evidence — Tailscale fixture, receipt and cleanup**
>
> **Claim:** The maintained preflight allocates a new lease/exposure, requires the HTTP node and imported result to pass, and returns the selected fixture identities. The wrapper separately observes cluster cleanup.
>
> **Implementation:** [Fixture and route nodes](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/tests/verification/e2e/nova-tailscale-production-preflight.mts#L126-L145); [receipt/import identity assertions](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/tests/verification/e2e/nova-tailscale-production-preflight.mts#L174-L204); [cleanup observation](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/scripts/deploy.sh#L2552-L2578).
>
> **Contract or setting:** [Probe image and credential prerequisites](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/tests/verification/e2e/nova-tailscale-production-preflight.mts#L16-L46) and [controller lease-ownership labels](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/cmd/buster-namespace-controller/main.go#L788-L806).
>
> **Test evidence:** [Maintained Tailscale preflight assertions](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/tests/verification/e2e/nova-tailscale-production-preflight.mts#L174-L204): **SOURCE ONLY; NOT EXECUTED**. They require a configured cluster, worker and Tailnet. There is no maintained repository test for this page's OAuth-rejection classifier and failed-fixture cleanup helper. **LOCAL CHECKS PASSED:** fingerprint, rejection and UID/resource-version cleanup probes used synthetic data or an owned loopback API.
>
> **Revision:** 4d3068465a2e202d2d5073b77e9273c308497995
>
> **Limit:** We ran no actual OAuth rejection, Tailnet device/route, authorized client response or cluster cleanup here.


Precondition: the official operator is ready, `IngressClass/tailscale` exists,
the digest-pinned probe image is pullable, the secure OAuth source file is
available, and the healthy production preflight passes. Existing routes may
continue on already-issued device state, so the failure check must allocate a
new fixture route; inspecting an old route is not the intended fault.

```bash
assert_cluster_binding || exit 126
export EXPECTED_FAULT_TAILSCALE_NAMESPACE_UID="<independently-recorded-operator-namespace-uid>"
readonly EXPECTED_FAULT_TAILSCALE_NAMESPACE_UID
if [ "$TAILSCALE_OPERATOR_NAMESPACE" = "$NAMESPACE" ]; then
  test "$EXPECTED_FAULT_TAILSCALE_NAMESPACE_UID" = "$EXPECTED_FAULT_NAMESPACE_UID" || exit 126
elif [ "$TAILSCALE_OPERATOR_NAMESPACE" = "$PRISM_NAMESPACE" ]; then
  test "$EXPECTED_FAULT_TAILSCALE_NAMESPACE_UID" = "$EXPECTED_FAULT_PRISM_NAMESPACE_UID" || exit 126
else
  bind_fault_namespace "$TAILSCALE_OPERATOR_NAMESPACE" "$EXPECTED_FAULT_TAILSCALE_NAMESPACE_UID" || exit 126
fi
freeze_fault_target tailscale-oauth "$TAILSCALE_OPERATOR_NAMESPACE" secret/operator-oauth || exit 126
export TAILSCALE_OPERATOR_DEPLOYMENT="$(kubectl -n "$TAILSCALE_OPERATOR_NAMESPACE" get deployment \
  -l app.kubernetes.io/instance=tailscale-operator -o json | node --input-type=module -e '
let input = ""; for await (const chunk of process.stdin) input += chunk;
const items = JSON.parse(input).items;
if (items?.length !== 1 || !items[0].metadata?.name) process.exit(1);
console.log(items[0].metadata.name);
')"
test -n "$TAILSCALE_OPERATOR_DEPLOYMENT"
readonly TAILSCALE_OPERATOR_DEPLOYMENT
freeze_fault_target tailscale-operator "$TAILSCALE_OPERATOR_NAMESPACE" \
  "deployment/$TAILSCALE_OPERATOR_DEPLOYMENT" || exit 126
test "$(stat -c '%a' "$TAILSCALE_OAUTH_ENV_FILE")" = 600
./scripts/deploy.sh nova-tailscale-preflight "$TAILSCALE_PROBE_IMAGE"
kubectl -n "$TAILSCALE_OPERATOR_NAMESPACE" get deploy,pods -l \
  app.kubernetes.io/instance=tailscale-operator -o wide \
  | tee "$EVIDENCE_DIR/tailscale-before.txt"
kubectl -n "$TAILSCALE_OPERATOR_NAMESPACE" get secret/operator-oauth \
  -o jsonpath='{.metadata.uid}' > "$EVIDENCE_DIR/tailscale-secret-uid-before.txt"
test -s "$EVIDENCE_DIR/tailscale-secret-uid-before.txt"
tailscale_source_fingerprints() {
  node - "$TAILSCALE_OAUTH_ENV_FILE" <<'NODE'
const crypto = require('node:crypto');
const fs = require('node:fs');
const rows = fs.readFileSync(process.argv[2], 'utf8').trimEnd().split('\n');
const values = Object.fromEntries(rows.map(row => {
  const offset = row.indexOf('=');
  if (offset < 1) throw new Error('invalid OAuth authority file');
  return [row.slice(0, offset), row.slice(offset + 1)];
}));
if (rows.length !== 2 || Object.keys(values).sort().join(',') !== 'client_id,client_secret'
  || !values.client_id || !values.client_secret) throw new Error('OAuth authority keys are invalid');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
console.log(JSON.stringify({ client_id: digest(values.client_id), client_secret: digest(values.client_secret) }));
NODE
}
tailscale_secret_fingerprints() {
  assert_cluster_binding || return 126
  kubectl -n "$TAILSCALE_OPERATOR_NAMESPACE" get secret/operator-oauth -o json \
    | node --input-type=module -e '
import crypto from "node:crypto";
let input = ""; process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;
const secret = JSON.parse(input); const names = Object.keys(secret.data ?? {}).sort();
if (names.join(",") !== "client_id,client_secret") process.exit(1);
const digest = name => crypto.createHash("sha256").update(Buffer.from(secret.data[name], "base64")).digest("hex");
console.log(JSON.stringify({ client_id: digest("client_id"), client_secret: digest("client_secret") }));
'
}
tailscale_source_fingerprints > "$EVIDENCE_DIR/tailscale-authority-fingerprints.json"
tailscale_secret_fingerprints > "$EVIDENCE_DIR/tailscale-secret-fingerprints-before.json"
diff -u "$EVIDENCE_DIR/tailscale-authority-fingerprints.json" \
  "$EVIDENCE_DIR/tailscale-secret-fingerprints-before.json"
kubectl -n "$NAMESPACE" get busternamespaceleases -o json \
  > "$EVIDENCE_DIR/tailscale-leases-before.json"
test ! -e "$EVIDENCE_DIR/tailscale-fault-cleanup.json"
tailscale_restore_pending=1
tailscale_watch_pid=""
tailscale_proxy_pid=""
restore_tailscale_oauth() {
  assert_cluster_binding || return 126
  if [ "${tailscale_restore_pending:-0}" -eq 1 ]; then
    if [ -n "${tailscale_watch_pid:-}" ]; then
      kill "$tailscale_watch_pid" 2>/dev/null || true
      wait "$tailscale_watch_pid" 2>/dev/null || true
      tailscale_watch_pid=""
    fi
    if [ -n "${tailscale_proxy_pid:-}" ]; then
      kill "$tailscale_proxy_pid" 2>/dev/null || true
      wait "$tailscale_proxy_pid" 2>/dev/null || true
      tailscale_proxy_pid=""
    fi
    assert_fault_target tailscale-oauth "$TAILSCALE_OPERATOR_NAMESPACE" secret/operator-oauth || return 126
    assert_fault_target tailscale-operator "$TAILSCALE_OPERATOR_NAMESPACE" \
      "deployment/$TAILSCALE_OPERATOR_DEPLOYMENT" || return 126
    tailscale_secret_fingerprints > "$EVIDENCE_DIR/tailscale-secret-fingerprints-restored.json"
    if ! cmp -s "$EVIDENCE_DIR/tailscale-authority-fingerprints.json" \
      "$EVIDENCE_DIR/tailscale-secret-fingerprints-restored.json"; then
      kubectl -n "$TAILSCALE_OPERATOR_NAMESPACE" create secret generic operator-oauth \
        --from-env-file="$TAILSCALE_OAUTH_ENV_FILE" --dry-run=client -o json \
        | node --input-type=module -e '
let input = ""; for await (const chunk of process.stdin) input += chunk;
const secret = JSON.parse(input);
console.log(JSON.stringify([{ op: "replace", path: "/data", value: secret.data }]));
' | patch_fault_target tailscale-oauth "$TAILSCALE_OPERATOR_NAMESPACE" secret/operator-oauth || return 126
      restart_fault_target tailscale-operator "$TAILSCALE_OPERATOR_NAMESPACE" \
        "deployment/$TAILSCALE_OPERATOR_DEPLOYMENT" || return 126
    fi
    kubectl -n "$TAILSCALE_OPERATOR_NAMESPACE" rollout status \
      "deployment/$TAILSCALE_OPERATOR_DEPLOYMENT" --timeout=180s || return 1
    kubectl get ingressclass tailscale || return 1
    assert_fault_target tailscale-oauth "$TAILSCALE_OPERATOR_NAMESPACE" secret/operator-oauth || return 126
    assert_fault_target tailscale-operator "$TAILSCALE_OPERATOR_NAMESPACE" \
      "deployment/$TAILSCALE_OPERATOR_DEPLOYMENT" || return 126
    tailscale_secret_fingerprints > "$EVIDENCE_DIR/tailscale-secret-fingerprints-restored.json"
    diff -u "$EVIDENCE_DIR/tailscale-authority-fingerprints.json" \
      "$EVIDENCE_DIR/tailscale-secret-fingerprints-restored.json"
  fi
}
trap 'restore_tailscale_oauth' EXIT
trap 'exit 130' HUP INT TERM
node --input-type=module -e '
console.log(JSON.stringify([{ op: "replace", path: "/data", value: {
  client_id: Buffer.from("invalid-acceptance-client").toString("base64"),
  client_secret: Buffer.from("invalid-acceptance-secret").toString("base64")
} }]));
' | patch_fault_target tailscale-oauth "$TAILSCALE_OPERATOR_NAMESPACE" secret/operator-oauth || exit 126
restart_fault_target tailscale-operator "$TAILSCALE_OPERATOR_NAMESPACE" \
  "deployment/$TAILSCALE_OPERATOR_DEPLOYMENT" || exit 126
kubectl -n "$TAILSCALE_OPERATOR_NAMESPACE" rollout status deployment \
  -l app.kubernetes.io/instance=tailscale-operator --timeout=180s || true
tailscale_fault_started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
tailscale_lease_resource_version="$(node -e '
const value = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
if (!value.metadata?.resourceVersion) process.exit(1);
process.stdout.write(value.metadata.resourceVersion);
' "$EVIDENCE_DIR/tailscale-leases-before.json")"
timeout 900s kubectl -n "$NAMESPACE" get busternamespaceleases \
  --watch-only --output-watch-events \
  --resource-version="$tailscale_lease_resource_version" \
  -o jsonpath='{.type}{"\t"}{.object.apiVersion}{"\t"}{.object.metadata.name}{"\t"}{.object.metadata.uid}{"\t"}{.object.spec.namespaceName}{"\t"}{.object.status.phase}{"\n"}' \
  > "$EVIDENCE_DIR/tailscale-lease-watch.tsv" &
tailscale_watch_pid=$!
sleep 1
set +e
./scripts/deploy.sh nova-tailscale-preflight "$TAILSCALE_PROBE_IMAGE" \
  > "$EVIDENCE_DIR/tailscale-auth-fault.txt" 2>&1
tailscale_fault_status=$?
set -e
kill "$tailscale_watch_pid" 2>/dev/null || true
wait "$tailscale_watch_pid" 2>/dev/null || true
tailscale_watch_pid=""
test "$tailscale_fault_status" -ne 0
kubectl -n "$TAILSCALE_OPERATOR_NAMESPACE" logs \
  -l app.kubernetes.io/instance=tailscale-operator --all-containers=true \
  --since-time="$tailscale_fault_started_at" --prefix=true \
  > "$EVIDENCE_DIR/tailscale-operator-auth-rejection.txt"
node - "$EVIDENCE_DIR/tailscale-leases-before.json" \
  "$EVIDENCE_DIR/tailscale-lease-watch.tsv" \
  "$EVIDENCE_DIR/tailscale-new-lease.json" <<'NODE'
const fs = require('node:fs');
const [beforeFile, watchFile, outputFile] = process.argv.slice(2);
const before = JSON.parse(fs.readFileSync(beforeFile, 'utf8'));
const known = new Set((before.items ?? []).map(item => `${item.metadata?.name}\0${item.metadata?.uid}`));
const added = fs.readFileSync(watchFile, 'utf8').trim().split('\n').filter(Boolean)
  .map(line => line.split('\t'))
  .filter(([type, apiVersion, name, uid, namespace]) => type === 'ADDED' && apiVersion.includes('/')
    && name && uid && namespace
    && !known.has(`${name}\0${uid}`));
if (added.length !== 1) throw new Error('exactly one new fault-window fixture lease is required');
const [, apiVersion, leaseName, leaseUid, namespace, phase] = added[0];
fs.writeFileSync(outputFile, `${JSON.stringify({ apiVersion, leaseName, leaseUid, namespace, phase })}\n`,
  { flag: 'wx', mode: 0o600 });
NODE
node - "$EVIDENCE_DIR/tailscale-operator-auth-rejection.txt" \
  "$EVIDENCE_DIR/tailscale-auth-fault.txt" <<'NODE'
const fs = require('node:fs');
const [operatorFile, preflightFile] = process.argv.slice(2);
const operator = fs.readFileSync(operatorFile, 'utf8');
const preflight = fs.readFileSync(preflightFile, 'utf8');
const rejection = /invalid[_ -]?client|unauthori[sz]ed|authentication\s+(?:failed|rejected)|oauth[^\n]*(?:401|403|denied|failed|rejected)|status(?:\s+code)?[=: ]+(?:401|403)/iu;
if (!rejection.test(operator)) throw new Error('operator logs lack an explicit OAuth rejection');
if (!/tailscale|exposure|ingress|lease/iu.test(preflight)) {
  throw new Error('failed preflight did not reach the new Tailscale fixture path');
}
NODE
```

Expected observation: the watch records exactly one new lease name, UID, and
fixture namespace that were absent before the fault. The preflight reaches that
fixture and fails, and logs from the official operator during the same window
contain an explicit OAuth or authentication rejection. A nonzero preflight by
itself is not this result. Internal Kubernetes Service access and unrelated
pipeline processing remain separate facts. The safe decision is to create no
additional public Ingress, reuse no revoked credential, and avoid allocating a
replacement lease while the first lease outcome is uncertain.

The Secret patch and operator restart test their original UID and current
resource version before changing either object. The selected operator Deployment
must be the one recorded above; a multiple-Deployment selection stops this
exercise. Namespace exclusion remains required through both restart rollouts.
Restore the Secret from its external authority without printing its contents,
restart the operator, then remove only the failed fixture recorded above. The
cleanup uses Kubernetes UID and resource-version preconditions. The
[controller requires its ownership labels to match the exact lease](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/cmd/buster-namespace-controller/main.go#L788-L806).
The snippet applies that boundary and refuses an unguarded deletion. It stops if a
lease with the captured name has a different UID, or if the namespace does not
carry all three ownership labels for that lease. It then waits for both exact
objects to be absent and writes the cleanup result before the rollback trap can
be disarmed. A same-name replacement is never a cleanup target.

```bash
assert_cluster_binding || exit 126
restore_tailscale_oauth
kubectl proxy --port=0 --api-prefix=/ \
  > "$EVIDENCE_DIR/tailscale-kubectl-proxy.txt" 2>&1 &
tailscale_proxy_pid=$!
tailscale_proxy_port=""
tailscale_proxy_attempt=0
while [ "$tailscale_proxy_attempt" -lt 100 ]; do
  tailscale_proxy_port="$(sed -n 's/^Starting to serve on 127\.0\.0\.1:\([0-9][0-9]*\)$/\1/p' \
    "$EVIDENCE_DIR/tailscale-kubectl-proxy.txt" | head -n 1)"
  [ -n "$tailscale_proxy_port" ] && break
  kill -0 "$tailscale_proxy_pid" 2>/dev/null
  tailscale_proxy_attempt=$((tailscale_proxy_attempt + 1))
  sleep 0.1
done
test -n "$tailscale_proxy_port"
node --input-type=module - "http://127.0.0.1:$tailscale_proxy_port" "$NAMESPACE" \
  "$EVIDENCE_DIR/tailscale-new-lease.json" \
  "$EVIDENCE_DIR/tailscale-fault-cleanup.json" <<'NODE'
import fs from 'node:fs';
const [origin, leaseNamespace, identityFile, outputFile] = process.argv.slice(2);
const identity = JSON.parse(fs.readFileSync(identityFile, 'utf8'));
const [group, version, extra] = String(identity.apiVersion ?? '').split('/');
if (!group || !version || extra || !identity.leaseName || !identity.leaseUid || !identity.namespace) {
  throw new Error('captured fixture identity is incomplete');
}
const segment = encodeURIComponent;
const leasePath = `/apis/${segment(group)}/${segment(version)}/namespaces/${segment(leaseNamespace)}`
  + `/busternamespaceleases/${segment(identity.leaseName)}`;
const namespacePath = `/api/v1/namespaces/${segment(identity.namespace)}`;
let expectedNamespaceUid;

async function request(path, options = {}) {
  const response = await fetch(`${origin}${path}`, {
    ...options,
    signal: AbortSignal.timeout(10000),
  });
  if (response.status === 404) return { status: 404, value: null };
  const text = await response.text();
  const value = text ? JSON.parse(text) : null;
  return { status: response.status, value };
}
async function read(path) {
  const result = await request(path);
  if (result.status !== 200 && result.status !== 404) {
    throw new Error(`Kubernetes read failed with status ${result.status}`);
  }
  return result.value;
}
function verifyLease(value) {
  if (value.metadata?.uid !== identity.leaseUid
    || value.spec?.namespaceName !== identity.namespace) {
    throw new Error('same-name lease replacement exists; refusing to delete it');
  }
}
function verifyNamespace(value) {
  const labels = value.metadata?.labels ?? {};
  if (labels['kubeclaw/managed-by'] !== 'buster-namespace-controller'
    || labels['kubeclaw/buster-lease'] !== identity.leaseName
    || labels['kubeclaw/buster-lease-uid'] !== identity.leaseUid) {
    throw new Error('fixture namespace ownership does not match the captured lease; refusing to delete it');
  }
  if (expectedNamespaceUid && value.metadata?.uid !== expectedNamespaceUid) {
    throw new Error('same-name namespace replacement exists; refusing to delete it');
  }
  expectedNamespaceUid ??= value.metadata?.uid;
}
async function deleteOwned(path, verify) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const value = await read(path);
    if (!value) return 'already-absent';
    verify(value);
    const uid = value.metadata?.uid;
    const resourceVersion = value.metadata?.resourceVersion;
    if (!uid || !resourceVersion) throw new Error('owned object lacks a deletion precondition');
    if (value.metadata?.deletionTimestamp) return 'deletion-in-progress';
    const result = await request(path, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        apiVersion: 'v1',
        kind: 'DeleteOptions',
        propagationPolicy: 'Foreground',
        preconditions: { uid, resourceVersion },
      }),
    });
    if (result.status === 404) return 'already-absent';
    if (result.status === 409) continue;
    if (result.status !== 200 && result.status !== 202) {
      throw new Error(`preconditioned delete failed with status ${result.status}`);
    }
    return 'delete-accepted';
  }
  throw new Error('object changed during cleanup; refusing an unguarded delete');
}
async function waitAbsent(path, verify, label) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const value = await read(path);
    if (!value) return;
    verify(value);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error(`${label} was not deleted within 180 seconds`);
}

const leaseDelete = await deleteOwned(leasePath, verifyLease);
const namespaceDelete = await deleteOwned(namespacePath, verifyNamespace);
await Promise.all([
  waitAbsent(leasePath, verifyLease, 'captured fixture lease'),
  waitAbsent(namespacePath, verifyNamespace, 'captured fixture namespace'),
]);
fs.writeFileSync(outputFile, `${JSON.stringify({
  leaseName: identity.leaseName,
  leaseUid: identity.leaseUid,
  namespace: identity.namespace,
  namespaceUid: expectedNamespaceUid ?? null,
  leaseDelete,
  namespaceDelete,
  leaseAbsent: true,
  namespaceAbsent: true,
})}\n`, { flag: 'wx', mode: 0o600 });
NODE
kill "$tailscale_proxy_pid" 2>/dev/null || true
wait "$tailscale_proxy_pid" 2>/dev/null || true
tailscale_proxy_pid=""
./scripts/deploy.sh nova-tailscale-preflight "$TAILSCALE_PROBE_IMAGE" \
  | tee "$EVIDENCE_DIR/tailscale-recovery.txt"
kubectl -n "$TAILSCALE_OPERATOR_NAMESPACE" get secret/operator-oauth \
  -o jsonpath='{.metadata.uid}' > "$EVIDENCE_DIR/tailscale-secret-uid-after.txt"
diff -u "$EVIDENCE_DIR/tailscale-secret-uid-before.txt" \
  "$EVIDENCE_DIR/tailscale-secret-uid-after.txt"
tailscale_restore_pending=0
trap - EXIT HUP INT TERM
```

The second preflight verifies the route, authorized application response,
receipt import, and its own cleanup. Keep both fixture identities, the recorded
cleanup result, operator/device identity, and release result; remove the invalid
credential from shell history if the local shell records commands.

### LiteLLM Upstream Timeout

The [deployed model route names `gemini-embedding-001` and its Vertex
provider](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/my-values/infra/litellm-config.yaml#L1-L11).
The [deployment distinguishes liveliness and readiness probes](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/my-values/infra/litellm-deployment.yaml#L47-L63).
The [secured policy separates database egress from world egress](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/my-values/infra/network-policies.yaml#L248-L270).
The direct HTTP probes below test the LiteLLM-to-Vertex route. They bypass the
OpenClaw memory manager, even when they run inside `agent-nova`. Their
70-second outer deadline and cause classification belong to the route observer.
They do not prove OpenClaw retries, memory state, or end-consumer recovery.
Run the memory-client task below as well. No live upstream-denial or
memory-client result is established here.

This exercise requires the secured Cilium profile. The temporary
`CiliumNetworkPolicy` denies only world egress from the LiteLLM Pod; cluster
egress to its PostgreSQL remains available. A different CNI must use its
maintained equivalent deny-and-restore command and demonstrate the same narrow
boundary. Use a disposable secured cluster with no active memory writers or
agent jobs. The denial affects every consumer of this LiteLLM deployment.
First prove gateway readiness, a route embedding, and the memory-client
baseline below. Stop before injecting the fault if any baseline check fails.

#### Prepare the OpenClaw Memory Reader

The memory-consumer procedure below records historical OpenClaw `v2026.9.4`
source at `3a9d69db306cd7f081e06254cb89c4bcc14a7107`. The selected
[embedding client](../understand/platform-and-operations.md#embedding-client-limits-and-failure-rules)
is OpenClaw `2026.10.3`, not that historical client.

Stop before the memory-reader baseline or fault injection.
Ask the OpenClaw and platform maintainers for the selected image's memory commands and configuration.
They must identify the workspace, database, reader ownership and necessary Pod and administration access.
They must also give the synthetic-note, derived-index and network-policy cleanup steps.
Continue only after those maintainers give these inputs for the selected image.

The historical commands, source links and local checks below do not give those current inputs.
Do not use the newer version label in place of the old client's behavior.
A direct HTTP probe is not memory-consumer evidence.

 Run these commands from the operator shell used for this exercise. Use the
existing `NAMESPACE`, `EVIDENCE_DIR`, and `assert_cluster_binding` procedure.
Access must permit Pod exec, Deployment and Pod reads, and creation and removal
of the named Cilium policy. The agent container must have Node, the pinned
OpenClaw entry point `/app/openclaw.mjs`, and a running gateway that supports
`secrets.resolve`. Keep the gateway running: the CLI resolves the configured
memory SecretRef through its authenticated gateway snapshot. A SecretRef is a configured reference to a credential; the gateway resolves it without putting the value in the command. A route probe
can succeed while this resolution fails.

The chart enables `memory.search`, selects sources `memory` and `sessions`,
provider `openai-compatible`, model `gemini-embedding-001`, and the chart's
LiteLLM `/v1` base URL. Its remote key is the `LITELLM_API_KEY` SecretRef.
Init seeds `/home/node/.openclaw/openclaw.json` and synchronizes its managed
memory settings on restart. It creates
`/home/node/.openclaw/workspace/memory` on the workspace volume.
[The rendered settings](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/charts/kubeclaw/templates/configmap-gateway.yaml#L55-L75),
[workspace and config initialization](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/charts/kubeclaw/templates/deployment.yaml#L419-L438),
and [managed memory synchronization](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/charts/kubeclaw/templates/deployment.yaml#L516-L524)
define this bootstrap. Do not substitute an inline key or a different provider.

The supported caller is the OpenClaw memory CLI for agent `main`, not a Nova
pipeline stage. `memory index` calls the configured manager's `sync` method;
`memory search` calls its `search` method. The manager sends embeddings through
the selected adapter to LiteLLM, which calls Vertex. OpenClaw keeps the derived
SQLite index and embedding cache separately from the source workspace files.
The status output identifies the actual workspace and database path. The source
file below is synthetic input; it contains no project or session data.
[CLI registration](https://github.com/openclaw/openclaw/blob/3a9d69db306cd7f081e06254cb89c4bcc14a7107/extensions/memory-core/src/cli.ts#L200-L246),
[SecretRef resolution](https://github.com/openclaw/openclaw/blob/3a9d69db306cd7f081e06254cb89c4bcc14a7107/extensions/memory-core/src/cli-runtime-common.ts#L57-L90),
[manager acquisition](https://github.com/openclaw/openclaw/blob/3a9d69db306cd7f081e06254cb89c4bcc14a7107/extensions/memory-core/src/cli-runtime-common.ts#L162-L199) and
[manager close](https://github.com/openclaw/openclaw/blob/3a9d69db306cd7f081e06254cb89c4bcc14a7107/extensions/memory-core/src/cli-runtime-common.ts#L200-L218),
and [SQLite and cache selection](https://github.com/openclaw/openclaw/blob/3a9d69db306cd7f081e06254cb89c4bcc14a7107/src/agents/memory-search.ts#L296-L318)
support this path. See [agent state and its backup boundary](../understand/data-and-state.md#complete-store-matrix).

Select one actual agent Pod and container from the administration record. Read
its owner references and verify the ReplicaSet and Deployment UIDs against the
selected Nova deployment; do not guess a Pod from a label or use Deployment
exec. Record those owner observations with the exercise. The workload owner
must hold this disposable consumer stable for the whole exercise: no rollout,
scale, deletion, eviction, restart, config change, or other memory writer.
If the owner cannot establish this controlled condition, stop before baseline.
Kubernetes exec selects a Pod by name; it has no atomic UID precondition here.
The checks below detect changed identity before and after exec. They cannot
prevent a replacement between the check and the API request. An identity change
makes the operation uncertain and stops the exercise; it is never accepted as
work on the original consumer. See the [kubectl exec contract](https://kubernetes.io/docs/reference/generated/kubectl/kubectl-commands#exec) for Pod and container selection.

Define the identity guards first. Replace the two placeholders with the actual
names you recorded. The snapshot binds Pod UID, owner UID, container image,
running container ID, restart count, and selected volume mounts. The image ID
is an observed runtime identity, not an attestation of the pinned source.

```bash
assert_cluster_binding || exit 126
export MEMORY_POD="<recorded-actual-agent-pod-name>"
export MEMORY_CONTAINER="<recorded-actual-agent-container-name>"
readonly MEMORY_POD MEMORY_CONTAINER
kubectl -n "$NAMESPACE" get pod "$MEMORY_POD" \
  -o jsonpath='{.metadata.name}{" "}{.metadata.uid}{" "}{.metadata.ownerReferences}{"\n"}' \
  > "$EVIDENCE_DIR/memory-pod-owner.txt"
kubectl -n "$NAMESPACE" get replicaset "<actual-owner-replicaset-name>" \
  -o jsonpath='{.metadata.name}{" "}{.metadata.uid}{" "}{.metadata.ownerReferences}{"\n"}' \
  > "$EVIDENCE_DIR/memory-replicaset-owner.txt"
kubectl -n "$NAMESPACE" get deployment "<actual-selected-nova-deployment-name>" \
  -o jsonpath='{.metadata.name}{" "}{.metadata.uid}{"\n"}' \
  > "$EVIDENCE_DIR/memory-deployment-owner.txt"
# Stop here unless both controller owner UIDs match these actual objects.
memory_pod_identity() {
  assert_cluster_binding || return 126
  kubectl -n "$NAMESPACE" get pod "$MEMORY_POD" -o json | node --input-type=module -e '
let input = ""; for await (const chunk of process.stdin) input += chunk;
const p = JSON.parse(input); const name = process.argv[1];
const c = p.spec?.containers?.find(c => c.name === name);
const r = p.status?.containerStatuses?.find(c => c.name === name);
if (p.metadata?.deletionTimestamp || !p.metadata?.uid || !c || !r?.ready
  || !r.state?.running || !r.imageID || !r.containerID) process.exit(1);
console.log(JSON.stringify({ name: p.metadata.name, uid: p.metadata.uid,
  owners: p.metadata.ownerReferences, container: name, image: c.image,
  imageID: r.imageID, containerID: r.containerID, restarts: r.restartCount,
  mounts: c.volumeMounts, volumes: (p.spec.volumes ?? []).map(v => ({
    name: v.name, claim: v.persistentVolumeClaim?.claimName,
    emptyDir: v.emptyDir, configMap: v.configMap?.name, secret: v.secret?.secretName
  })) }));
' "$MEMORY_CONTAINER"
}
memory_pod_identity > "$EVIDENCE_DIR/memory-pod-frozen.json" || exit 126
assert_memory_pod() {
  assert_cluster_binding || return 126
  local current
  current=$(memory_pod_identity) || { test -e "$EVIDENCE_DIR/memory-stop" || : > "$EVIDENCE_DIR/memory-stop"; return 126; }
  if [ "$current" != "$(cat "$EVIDENCE_DIR/memory-pod-frozen.json")" ]; then
    printf '%s\n' "consumer identity changed; stop" >&2
    test -e "$EVIDENCE_DIR/memory-stop" || : > "$EVIDENCE_DIR/memory-stop"
    return 126
  fi
}
owned_memory_exec() {
  assert_cluster_binding || return 126
  assert_memory_pod || return 126
  local status=0 stdin_flag=""
  if [ "${1:-}" = -i ]; then stdin_flag=-i; shift; fi
  kubectl -n "$NAMESPACE" exec ${stdin_flag:+"$stdin_flag"} "$MEMORY_POD" \
    -c "$MEMORY_CONTAINER" -- "$@" || status=$?
  assert_memory_pod || return 126
  return "$status"
}
```

Define a bounded CLI observer. Its seconds argument is the operator deadline,
not the provider timeout. It creates one Linux process group in that container.
The group ID is its own spawned child's PID. Signal 0 tests this negative group
ID without sending a signal. `ESRCH` means that no member remains. Permission
errors or other errors mean unknown, which must stop further work. A direct
child close does not prove that its descendants stopped. After close or the
deadline, the observer checks the group every 100 milliseconds, sends SIGTERM
to remaining members, sends SIGKILL after five seconds, and stops observation
after ten seconds. It never signals a group it did not spawn. A descendant
that leaves this group is outside this check; the selected CLI and this
controlled exercise must not launch independently detached work. If that
condition is unknown, stop and obtain ownership proof from the maintainers.

Exit 124 means the deadline expired with verified group absence. Exit 125
means quiescence (the absence of running group members) is unproved. The
receipt records both direct-child close and group absence. Neither result
proves remote cancellation. Retain stderr, the receipt, and the exit status. The [Node 24 detached-child contract](https://nodejs.org/docs/latest-v24.x/api/child_process.html#optionsdetached) defines the Linux group, and [signal 0](https://nodejs.org/docs/latest-v24.x/api/process.html#processkillpid-signal) supplies the existence observation.
`OPENCLAW_LOG_LEVEL=debug` applies to this child only; review logs before sharing.

```bash
assert_cluster_binding || exit 126
run_memory_observer() {
  assert_cluster_binding || return 126
  assert_memory_pod || return 126
  test ! -e "$EVIDENCE_DIR/memory-stop" || return 125
  local receipt status=0
  receipt=$(mktemp "$EVIDENCE_DIR/memory-observer.XXXXXX") || return 125
  : > "$EVIDENCE_DIR/memory-stop" || return 125
  owned_memory_exec node --input-type=module -e '
import { spawn } from "node:child_process";
const [seconds, ...args] = process.argv.slice(1);
if (!/^[1-9][0-9]*$/.test(seconds) || args.length === 0) process.exit(2);
const child = spawn(process.execPath, ["/app/openclaw.mjs", "memory", ...args], {
  detached: true, stdio: "inherit",
  env: { ...process.env, OPENCLAW_LOG_LEVEL: "debug" }
});
let overdue = false, closed = false, code = null, signal = null;
let stoppingAt = null, killed = false, finished = false;
const group = child.pid;
const present = () => {
  if (!Number.isSafeInteger(group) || group < 1) return null;
  try { process.kill(-group, 0); return true; }
  catch (error) { return error.code === "ESRCH" ? false : null; }
};
const send = sig => {
  try { process.kill(-group, sig); return true; }
  catch (error) { return error.code === "ESRCH"; }
};
console.error(JSON.stringify({ observer: "memory-cli-start", group, pid: child.pid }));
const finish = quiescent => {
  if (finished) return; finished = true;
  clearTimeout(deadline); clearInterval(poll);
  console.error(JSON.stringify({ observer: "memory-cli", group, overdue,
    closed, code, signal, quiescent }));
  process.exit(quiescent ? (overdue ? 124 : (code ?? 1)) : 125);
};
const stop = () => {
  if (stoppingAt === null) { stoppingAt = Date.now(); if (!send("SIGTERM")) finish(false); }
};
const deadline = setTimeout(() => { overdue = true; stop(); }, Number(seconds) * 1000);
const poll = setInterval(() => {
  if (!closed && !overdue) return;
  const exists = present();
  if (exists === null) return finish(false);
  if (!exists && closed) return finish(true);
  stop();
  if (finished) return;
  const elapsed = Date.now() - stoppingAt;
  if (elapsed >= 5000 && !killed) { killed = true; if (!send("SIGKILL")) return finish(false); }
  if (elapsed >= 10000) finish(false);
}, 100);
child.on("error", error => { console.error(error.message); finish(false); });
child.on("close", (c, s) => { clearTimeout(deadline); closed = true; code = c; signal = s; });
' "$@" 2> "$receipt" || status=$?
  cat "$receipt" >&2
  assert_memory_pod || return 126
  node --input-type=module -e '
import fs from "node:fs";
const lines = fs.readFileSync(process.argv[1], "utf8").trim().split("\n");
let last; try { last = JSON.parse(lines.at(-1)); } catch { process.exit(1); }
if (last?.observer !== "memory-cli" || last.quiescent !== true || last.closed !== true
  || !Number.isSafeInteger(last.group) || last.group < 1) process.exit(1);
' "$receipt" || return 125
  rm -- "$EVIDENCE_DIR/memory-stop" || return 125
  return "$status"
}
# This bootstrap reads the manager-selected paths before source work.
run_memory_observer 210 status --agent main --json \
  > "$EVIDENCE_DIR/memory-paths.json" 2> "$EVIDENCE_DIR/memory-paths.stderr" || exit $?
```

Read the one `main` entry in `memory-paths.json`. Record its actual absolute
`status.workspaceDir` and `status.dbPath` below. Verify the workspace matches
the managed chart path and the database belongs to that agent. Stop for a
missing path, another backend, or an unexpected mount. The source directory is
`memory` below that workspace; the SQLite database and cache are derived state.
Freeze their paths, the workspace and index-parent filesystem identities, and
the managed configuration digest before note creation. The database inode is
not frozen: indexing can replace derived files. Retain the snapshot outside
these volumes. These read-only checks do not prove that storage is durable.

```bash
assert_cluster_binding || exit 126
export MEMORY_WORKSPACE="<actual-main-status-workspaceDir>"
export MEMORY_DATABASE="<actual-main-status-dbPath>"
readonly MEMORY_WORKSPACE MEMORY_DATABASE
memory_source_identity() {
  assert_cluster_binding || return 126
  owned_memory_exec node --input-type=module -e '
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
const [workspace, database] = process.argv.slice(1);
if (!path.isAbsolute(workspace) || !path.isAbsolute(database)) process.exit(1);
const identity = p => { const real = fs.realpathSync(p); const s = fs.statSync(real);
  return { path: real, device: s.dev, inode: s.ino }; };
console.log(JSON.stringify({ workspace: identity(workspace), source: identity(path.join(workspace, "memory")),
  database: fs.realpathSync(database), indexParent: identity(path.dirname(database)),
  configDigest: createHash("sha256").update(fs.readFileSync("/home/node/.openclaw/openclaw.json")).digest("hex") }));
' "$MEMORY_WORKSPACE" "$MEMORY_DATABASE"
}
memory_source_identity > "$EVIDENCE_DIR/memory-source-frozen.json" || exit 126
memory_source_matches_frozen() {
  assert_cluster_binding || return 126
  local current
  current=$(memory_source_identity) || {
    test -e "$EVIDENCE_DIR/memory-stop" || : > "$EVIDENCE_DIR/memory-stop"
    return 126
  }
  if [ "$current" != "$(cat "$EVIDENCE_DIR/memory-source-frozen.json")" ]; then
    test -e "$EVIDENCE_DIR/memory-stop" || : > "$EVIDENCE_DIR/memory-stop"
    printf '%s\n' "source or index identity changed; stop" >&2
    return 126
  fi
}
assert_memory_source() {
  assert_cluster_binding || return 126
  test ! -e "$EVIDENCE_DIR/memory-stop" || return 125
  memory_source_matches_frozen
}
memory_state_exec() {
  assert_cluster_binding || return 126
  assert_memory_source || return $?
  local action="${1:-}" operation_id receipt status=0 stdin_flag=""
  case "$action" in create|delete) shift ;; *) return 2 ;; esac
  if [ "${1:-}" = -i ]; then stdin_flag=-i; shift; fi
  test "${1:-}" = node && test "${2:-}" = --input-type=module \
    && test "${3:-}" = -e || return 2
  operation_id=$(node -e 'process.stdout.write(require("node:crypto").randomUUID())') || return 125
  receipt=$(mktemp "$EVIDENCE_DIR/memory-state.XXXXXX") || return 125
  # Exclusive, flushed stop record exists before the remote note can change.
  node --input-type=module -e '
import fs from "node:fs";
const [file, operationId, action, pod, container] = process.argv.slice(1);
const fd = fs.openSync(file, "wx", 0o600);
try {
  fs.writeFileSync(fd, JSON.stringify({ operationId, action, pod, container,
    state: "in-progress", startedAt: new Date().toISOString() }) + "\n");
  fs.fsyncSync(fd);
} finally { fs.closeSync(fd); }
' "$EVIDENCE_DIR/memory-stop" "$operation_id" "$action" \
    "$MEMORY_POD" "$MEMORY_CONTAINER" || return 125
  owned_memory_exec ${stdin_flag:+"$stdin_flag"} "$@" "$operation_id" \
    2> "$receipt" || status=$?
  cat "$receipt" >&2
  test "$status" -eq 0 || return "$status"
  node --input-type=module -e '
import fs from "node:fs";
const [stopFile, receiptFile, operationId, action, pod, container, workspace] = process.argv.slice(1);
const stop = JSON.parse(fs.readFileSync(stopFile, "utf8"));
const lines = fs.readFileSync(receiptFile, "utf8").trim().split("\n");
let result; try { result = JSON.parse(lines.at(-1)); } catch { process.exit(1); }
if (stop.operationId !== operationId || stop.action !== action || stop.pod !== pod
  || stop.container !== container || stop.state !== "in-progress"
  || result?.observer !== "memory-state" || result.operationId !== operationId
  || result.action !== action || result.completed !== true || result.verified !== true
  || typeof result.path !== "string" || !result.path.startsWith(`${workspace}/memory/`)
  || !/^litellm-reader-[0-9a-f-]{36}\.md$/.test(result.path.slice(`${workspace}/memory/`.length))) process.exit(1);
' "$EVIDENCE_DIR/memory-stop" "$receipt" "$operation_id" "$action" \
    "$MEMORY_POD" "$MEMORY_CONTAINER" "$MEMORY_WORKSPACE" || return 125
  # This invocation owns the marker; only frozen-identity reads bypass it.
  assert_memory_pod || return 126
  memory_source_matches_frozen || return 126
  rm -- "$EVIDENCE_DIR/memory-stop" || return 125
}
bounded_memory_cli() {
  assert_cluster_binding || return 126
  assert_memory_source || return $?
  local status=0
  run_memory_observer "$@" || status=$?
  assert_memory_source || return $?
  return "$status"
}
bounded_memory_cli 210 status --agent main --deep --json \
  > "$EVIDENCE_DIR/memory-before.json" 2> "$EVIDENCE_DIR/memory-before.stderr" || exit $?
```

Use the note helper only for the two inline Node programs below. Each program
changes one owned file, verifies its result, emits a completion receipt with
this invocation's unique operation ID, and exits. It starts no child process.
Before exec, `memory_state_exec` writes an exclusive `memory-stop` record with
that ID, action, Pod, and container. It requests a storage flush with
[`fs.fsyncSync`](https://nodejs.org/docs/latest-v24.x/api/fs.html#fsfsyncsyncfd). It retains the receipt in a
new `memory-state.*` evidence file. It removes its stop only after exit zero,
a matching verified receipt, and unchanged Pod and source identities. Its
post-check reads the frozen source identity directly while its own marker
exists; this bypass permits identity inspection, not another mutation.

A nonzero exit, missing or invalid receipt, interruption, exec loss, or failed
post-check leaves the stop record in place. Even a receipt received before a
lost session does not authorize a new shell to remove it. There is no automatic
reattachment or retry of an uncertain note write or deletion. These short
filesystem operations have no separate process watchdog in this helper. If
completion is uncertain, the OpenClaw and platform operations owners must
inspect the recorded consumer, note result, and process/storage ownership
through their approved independent procedure before any stateful follow-up.
Retain the stop, synthetic-note receipt, and partial output. Do not delete the
note, reindex, or remove the stop to finish this exercise.

Inspect the one entry for `main`. Its status must select the builtin backend (the in-process SQLite memory manager),
`openai-compatible`, `gemini-embedding-001`, and the expected workspace.
The embedding probe must report `ok: true`. Disabled memory, another agent,
a fallback provider, a gateway SecretRef error, or a failed vector probe stops
this task. Exit zero alone is insufficient: status can report degraded state.
[Deep status invokes embedding and vector probes](https://github.com/openclaw/openclaw/blob/3a9d69db306cd7f081e06254cb89c4bcc14a7107/extensions/memory-core/src/cli-status.runtime.ts#L161-L198) and
[status JSON includes the probe results](https://github.com/openclaw/openclaw/blob/3a9d69db306cd7f081e06254cb89c4bcc14a7107/extensions/memory-core/src/cli-status.runtime.ts#L247-L268).

Create one new note, index it, and query its content. The generated file name
is exclusive to this exercise. Retain its receipt for cleanup.

```bash
assert_cluster_binding || exit 126
memory_state_exec create \
  node --input-type=module -e '
import fs from "node:fs";
import { randomUUID } from "node:crypto";
const name = `litellm-reader-${randomUUID()}.md`;
const text = "The amber observatory stores its calibration record in the northern cabinet.\n";
const file = `${process.argv[1]}/memory/${name}`;
fs.writeFileSync(file, text, { flag: "wx", mode: 0o600 });
if (fs.readFileSync(file, "utf8") !== text) throw new Error("new note content differs");
console.log(JSON.stringify({ name, text, path: file, operationId: process.argv[2] }));
console.error(JSON.stringify({ observer: "memory-state", operationId: process.argv[2],
  action: "create", path: file, completed: true, verified: true }));
' "$MEMORY_WORKSPACE" > "$EVIDENCE_DIR/memory-note.json"
bounded_memory_cli 900 index --agent main --verbose \
  > "$EVIDENCE_DIR/memory-index-before.txt" 2> "$EVIDENCE_DIR/memory-index-before.stderr"
bounded_memory_cli 210 search --agent main \
  --query "Where does the amber observatory keep its calibration record?" --json \
  > "$EVIDENCE_DIR/memory-query-before.json" 2> "$EVIDENCE_DIR/memory-query-before.stderr"
```

Require successful indexing without a vector-degraded warning. Require a query
result whose path names the receipt's note and whose snippet contains the
northern cabinet. A stale-index warning, empty result, or lexical-only result
is incomplete evidence. Confirm the selected provider and successful query
embedding in the consumer diagnostics; the result's text alone can also come
from full-text search. Indexing can reuse cached embeddings for existing files;
the new note tests new input. Retain the index output and provider request
observations before the denial. The CLI may also write recall bookkeeping when
dreaming is enabled; a search is not a promise of zero local writes.
[Index outcomes and degraded-vector warnings](https://github.com/openclaw/openclaw/blob/3a9d69db306cd7f081e06254cb89c4bcc14a7107/extensions/memory-core/src/cli-index-search.runtime.ts#L143-L190)
and [query execution](https://github.com/openclaw/openclaw/blob/3a9d69db306cd7f081e06254cb89c4bcc14a7107/extensions/memory-core/src/cli-index-search.runtime.ts#L197-L237) and
[recall bookkeeping and JSON results](https://github.com/openclaw/openclaw/blob/3a9d69db306cd7f081e06254cb89c4bcc14a7107/extensions/memory-core/src/cli-index-search.runtime.ts#L238-L262)
explain these checks.

The 900-second index observer is a stop rule for this small test, not a bound
for arbitrary indexing. Inline index requests have a 10-minute watchdog per
call, three transient attempts or five rate-limit attempts, and can split
failed batches recursively. Do not inject a second fault into indexing or
start another index while a stopped writer remains uncertain. Keep the note
and index evidence until the observer reports `quiescent: true` for its own
process group and both consumer identity checks pass. A missing receipt leaves
`memory-stop` in the evidence directory and blocks further memory work.

#### Deny and Observe the Model Route

```bash
assert_cluster_binding || exit 126
kubectl -n "$NAMESPACE" rollout status deployment/litellm --timeout=120s
owned_memory_exec node --input-type=module -e '
const r = await fetch(`${process.env.LITELLM_URL}/v1/embeddings`, {
  method: "POST",
  headers: { authorization: `Bearer ${process.env.LITELLM_API_KEY}`, "content-type": "application/json" },
  body: JSON.stringify({ model: "gemini-embedding-001", input: "pre-fault probe" }),
  signal: AbortSignal.timeout(60000)
});
const b = await r.json(); const v = b?.data?.[0]?.embedding;
if (!r.ok || !Array.isArray(v) || v.length === 0 || !v.every(Number.isFinite)) process.exit(1);
console.log(JSON.stringify({ model: b.model ?? "gemini-embedding-001", dimensions: v.length }));
'
test -z "$(kubectl -n "$NAMESPACE" get ciliumnetworkpolicy \
  acceptance-litellm-upstream-timeout --ignore-not-found -o name)"
litellm_workload_ready() {
  assert_cluster_binding || return 126
  kubectl -n "$NAMESPACE" get deployment/litellm -o json \
    | node --input-type=module -e '
let input = ""; process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;
const value = JSON.parse(input); const desired = value.spec?.replicas;
if (!Number.isSafeInteger(desired) || desired < 1 || value.status?.observedGeneration !== value.metadata?.generation
  || value.status?.updatedReplicas !== desired || value.status?.availableReplicas !== desired
  || (value.status?.unavailableReplicas ?? 0) !== 0) process.exit(1);
console.log(JSON.stringify({ generation: value.metadata.generation, readyReplicas: desired }));
'
}
litellm_readiness_probe() {
  assert_cluster_binding || return 126
  owned_memory_exec node --input-type=module -e '
const endpoint = new URL("/health/readiness", process.env.LITELLM_URL);
const r = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
if (!r.ok) process.exit(1);
console.log(JSON.stringify({ endpoint: endpoint.pathname, status: r.status, ready: true }));
'
}
litellm_pod_identity() {
  assert_cluster_binding || return 126
  kubectl -n "$NAMESPACE" get pods -l app=litellm -o json \
    | node --input-type=module -e '
let input = ""; process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;
const value = JSON.parse(input); const pods = (value.items ?? []).map(pod => ({
  name: pod.metadata?.name, uid: pod.metadata?.uid,
  ready: pod.status?.conditions?.some(condition => condition.type === "Ready" && condition.status === "True") === true,
  restarts: (pod.status?.containerStatuses ?? []).reduce((total, item) => total + (item.restartCount ?? 0), 0)
})).sort((a, b) => a.name.localeCompare(b.name));
if (pods.length < 1 || pods.some(pod => !pod.name || !pod.uid || !pod.ready)) process.exit(1);
console.log(JSON.stringify(pods));
'
}
litellm_policy_restore_pending=1
restore_litellm_policy() {
  assert_cluster_binding || return 126
  if [ "${litellm_policy_restore_pending:-0}" -eq 1 ]; then
    assert_fault_namespace "$NAMESPACE" || return 126
    test -s "$EVIDENCE_DIR/litellm-policy-created.json" || return 126
    test -s "$EVIDENCE_DIR/litellm-policy-frozen.json" || return 126
    local remaining_policy
    remaining_policy=$(kubectl -n "$NAMESPACE" get ciliumnetworkpolicy \
      acceptance-litellm-upstream-timeout --ignore-not-found -o name) || return 126
    if [ -n "$remaining_policy" ]; then
      assert_fault_target litellm-policy "$NAMESPACE" \
        ciliumnetworkpolicy/acceptance-litellm-upstream-timeout || return 126
      node --input-type=module -e '
import fs from "node:fs";
const m = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
console.log(JSON.stringify({ apiVersion: "v1", kind: "DeleteOptions",
  preconditions: { uid: m.uid, resourceVersion: m.resourceVersion } }));
' "$EVIDENCE_DIR/litellm-policy-current.json" | kubectl delete --raw \
        "/apis/cilium.io/v2/namespaces/$NAMESPACE/ciliumnetworkpolicies/acceptance-litellm-upstream-timeout" \
        -f - > "$EVIDENCE_DIR/litellm-policy-delete-response.json" || return 126
    fi
    # Absence is separate from DELETE acceptance. Never delete a replacement.
    local attempt=0
    while [ "$attempt" -lt 60 ]; do
      remaining_policy=$(kubectl -n "$NAMESPACE" get ciliumnetworkpolicy \
        acceptance-litellm-upstream-timeout --ignore-not-found -o json) || return 126
      [ -z "$remaining_policy" ] && break
      printf '%s\n' "$remaining_policy" | node --input-type=module -e '
import fs from "node:fs";
let input = ""; for await (const chunk of process.stdin) input += chunk;
const original = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (JSON.parse(input).metadata?.uid !== original.uid) process.exit(1);
' "$EVIDENCE_DIR/litellm-policy-frozen.json" || return 126
      attempt=$((attempt + 1)); sleep 1
    done
    test -z "$remaining_policy" || return 126
    printf '%s\n' 'original policy absent' > "$EVIDENCE_DIR/litellm-policy-cleanup.txt"
    owned_memory_exec node --input-type=module -e '
const r = await fetch(`${process.env.LITELLM_URL}/v1/embeddings`, {
  method: "POST",
  headers: { authorization: `Bearer ${process.env.LITELLM_API_KEY}`, "content-type": "application/json" },
  body: JSON.stringify({ model: "gemini-embedding-001", input: "rollback recovery probe" }),
  signal: AbortSignal.timeout(60000)
});
const b = await r.json(); const v = b?.data?.[0]?.embedding;
if (!r.ok || !Array.isArray(v) || v.length === 0 || !v.every(Number.isFinite)) process.exit(1);
console.log(JSON.stringify({ model: b.model ?? "gemini-embedding-001", dimensions: v.length }));
'
  fi
}
trap 'restore_litellm_policy' EXIT
trap 'exit 130' HUP INT TERM
assert_fault_namespace "$NAMESPACE" || exit 126
kubectl create -o json -f - > "$EVIDENCE_DIR/litellm-policy-created.json" <<EOF
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: acceptance-litellm-upstream-timeout
  namespace: ${NAMESPACE}
spec:
  endpointSelector:
    matchLabels:
      app: litellm
  egressDeny:
    - toEntities: [world]
EOF
node - "$EVIDENCE_DIR/litellm-policy-created.json" "$EVIDENCE_DIR/litellm-policy-frozen.json" <<'NODE'
const fs = require('node:fs');
const value = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), m = value.metadata;
if (value.apiVersion !== 'cilium.io/v2' || value.kind !== 'CiliumNetworkPolicy'
  || m?.name !== 'acceptance-litellm-upstream-timeout' || m.namespace !== process.env.NAMESPACE
  || !m.uid || !m.resourceVersion || m.deletionTimestamp) throw new Error('CREATE identity unavailable; stop');
fs.writeFileSync(process.argv[3], JSON.stringify({ name: m.name, namespace: m.namespace,
  uid: m.uid, resourceVersion: m.resourceVersion }) + '\n', { flag: 'wx', mode: 0o600 });
NODE
kubectl -n "$NAMESPACE" rollout status deployment/litellm --timeout=120s
litellm_workload_ready > "$EVIDENCE_DIR/litellm-workload-ready-during-fault.json"
litellm_readiness_probe > "$EVIDENCE_DIR/litellm-readiness-during-fault-before.json"
litellm_pod_identity > "$EVIDENCE_DIR/litellm-pods-during-fault-before.json"
set +e
owned_memory_exec node --input-type=module -e '
const expectedStatus = new Set([500, 502, 503, 504]);
const rejectedCause = /auth|unauthori[sz]ed|forbidden|credential|api.?key|configuration|database|postgres|invalid[^\n]*model|model[^\n]*(?:not found|unknown|invalid)|quota|rate.?limit/iu;
const upstreamCause = /timed?\s*out|timeout|connect|connection|network|unreachable|socket|\bdns\b|name resolution|egress/iu;
try {
  const r = await fetch(`${process.env.LITELLM_URL}/v1/embeddings`, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.LITELLM_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: "gemini-embedding-001", input: "timeout fault probe" }),
    signal: AbortSignal.timeout(70000)
  });
  const body = await r.text();
  if (r.ok) throw new Error("embedding unexpectedly succeeded during world-egress denial");
  if ([400, 401, 403, 404, 422, 429].includes(r.status) || rejectedCause.test(body)) {
    throw new Error(`fault was authentication, configuration, model, database, or quota related: ${r.status}`);
  }
  if (!expectedStatus.has(r.status) || !upstreamCause.test(body)) {
    throw new Error(`failure was not a classified upstream network failure: ${r.status}`);
  }
  console.log(JSON.stringify({ observation: "bounded-upstream-failure", status: r.status,
    classification: "upstream-network-denied" }));
} catch (error) {
  if (error?.name === "TimeoutError" || error?.name === "AbortError") {
    console.log(JSON.stringify({ observation: "bounded-upstream-failure", status: null,
      classification: "outer-timeout" }));
  } else {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
' > "$EVIDENCE_DIR/litellm-timeout-fault.txt" 2>&1
litellm_fault_status=$?
set -e
test "$litellm_fault_status" -eq 0
litellm_readiness_probe > "$EVIDENCE_DIR/litellm-readiness-during-fault-after.json"
litellm_workload_ready > "$EVIDENCE_DIR/litellm-workload-ready-after-fault.json"
litellm_pod_identity > "$EVIDENCE_DIR/litellm-pods-during-fault-after.json"
diff -u "$EVIDENCE_DIR/litellm-pods-during-fault-before.json" \
  "$EVIDENCE_DIR/litellm-pods-during-fault-after.json"
```

The deployment replica proof and `/health/readiness` checks must remain green
before and after the failed embedding. The LiteLLM Pod UID and restart count
must also remain unchanged. The embedding observer exits zero only
after classifying an HTTP 500, 502, 503, or 504 response with an upstream
network cause, or after reaching the 70-second outer timeout. Authentication,
credential, configuration, database, model, quota, rate-limit, Pod, exec, and
unclassified failures make the exercise fail. Record the model, route owner,
Cilium policy, route-probe operation, and bounded classification. The repository
does not configure an OpenClaw retry override. The selected upstream memory
manager defines the client limits below. Route-probe logs do not measure those
attempts. Keep the model-backed operation incomplete; never expose credentials
or loop on the failure.

The policy's successful CREATE response supplies its UID. A failed CREATE,
lost response, missing frozen identity, or same-name replacement stops automatic
cleanup; a later lookup cannot prove which CREATE the API server accepted. The platform
owner must resolve that uncertainty through the independent administration route.
Do not adopt or delete a later same-name object. The restore helper sends
UID/resource-version DeleteOptions through
[kubectl raw DELETE](https://github.com/kubernetes/kubectl/blob/b2cb112e103aff2bb7d5e300d56105cd63fddb21/pkg/cmd/delete/delete.go#L297-L313),
then separately waits for absence. A conflict or lost DELETE response requires
guarded observation before any owner-authorized retry. Never fall back to ordinary
name-only delete. These namespace checks still require the owner's exclusion
through the interval between reads and requests.

#### Observe the Actual Memory Consumer During the Fault

Leave the named denial policy in place. Run the same memory query through the
bounded CLI observer, with a distinct output file. Keep its exit code even if
the command fails.

```bash
assert_cluster_binding || exit 126
set +e
bounded_memory_cli 210 search --agent main \
  --query "Where does the amber observatory keep its calibration record?" --json \
  > "$EVIDENCE_DIR/memory-query-fault.json" 2> "$EVIDENCE_DIR/memory-query-fault.stderr"
memory_fault_status=$?
set -e
printf '%s\n' "$memory_fault_status" > "$EVIDENCE_DIR/memory-query-fault.exit"
```

For this query path, each embedding call has a 60-second watchdog. Recognized
transport, timeout, 5xx, or rate-limit failures permit at most three attempts.
The combined retry-wait budget is eight seconds. The query embedding budget
can therefore consume 188 seconds; initialization and memory maintenance are
outside that calculation. The 210-second observer limits this exercise as a
whole. See [client limits and failure rules](../understand/platform-and-operations.md#embedding-client-limits-and-failure-rules)
for the exact index limits, message classifier, and recursive splitting.

Require the configured model and provider in the consumer evidence. If query
retries exhaust, the manager wraps the cause as
`MEMORY_EMBEDDING_OPERATION_FAILED` with operation `query`; the CLI reports
`Memory search failed: ...` and exits 1. The wrapper retains the cause's
message; the CLI does not serialize its internal `code` or `operation` fields.
The fault check requires this CLI message, exit 1, query-attempt diagnostics,
and an upstream timeout/network cause. To prove the upstream-timeout scenario,
also require a timed-out call with its elapsed time and retry observations.
A denial that returns an immediate network rejection proves that rejection
only. It cannot pass the timeout scenario. Keep that result and have the
platform operator supply an isolated, controlled upstream delay beyond the
60-second query watchdog before repeating the registered timeout check.
Do not change production model routing to obtain the delay. The structured error code is a
source-level mapping, not a promised CLI output. Authentication, quota,
malformed vectors, gateway SecretRef resolution, or local index errors are
different failures. Exit 124 proves only that the outer observer stopped
waiting. It cannot pass the terminal-mapping check. A zero exit, cached result,
or full-text fallback also cannot prove this fault. Record that outcome and
stop; do not reinterpret it as successful semantic memory.
[The error fields and preserved message](https://github.com/openclaw/openclaw/blob/3a9d69db306cd7f081e06254cb89c4bcc14a7107/extensions/memory-core/src/memory/manager-embedding-errors.ts#L15-L32),
[the query retry invocation and wrapper](https://github.com/openclaw/openclaw/blob/3a9d69db306cd7f081e06254cb89c4bcc14a7107/extensions/memory-core/src/memory/manager-embedding-ops.ts#L610-L665),
[the retry profiles](https://github.com/openclaw/openclaw/blob/3a9d69db306cd7f081e06254cb89c4bcc14a7107/extensions/memory-core/src/memory/manager-embedding-policy.ts#L65-L82) and
[the retry loop](https://github.com/openclaw/openclaw/blob/3a9d69db306cd7f081e06254cb89c4bcc14a7107/extensions/memory-core/src/memory/manager-embedding-policy.ts#L132-L172),
and [search failure handling](https://github.com/openclaw/openclaw/blob/3a9d69db306cd7f081e06254cb89c4bcc14a7107/extensions/memory-core/src/cli-index-search.runtime.ts#L218-L238)
support this mapping.

A tool caller can supply an AbortSignal: it stops query retries, interrupts
retry waits, and reaches the provider watchdog. This CLI search call supplies
no caller signal. Killing its process group is an operator stop, not proof of
that tool cancellation contract. Vertex may already have processed a request
when the caller stops. Keep request and timing evidence; do not infer zero
provider use. The query failure does not commit a Nova stage or Prism operation
result. Source notes and existing index data remain available for recovery;
provider availability, memory freshness, and semantic-vector state (similarity that uses a remotely produced embedding) must be
checked separately. The manager can attempt fallback or return lexical results
under other settings, which this task does not accept.
[Search signal and fallback admission](https://github.com/openclaw/openclaw/blob/3a9d69db306cd7f081e06254cb89c4bcc14a7107/extensions/memory-core/src/memory/manager-search-orchestration.ts#L343-L380) and
[fallback and lexical-result handling](https://github.com/openclaw/openclaw/blob/3a9d69db306cd7f081e06254cb89c4bcc14a7107/extensions/memory-core/src/memory/manager-search-orchestration.ts#L381-L427)
explains this boundary. Keep the owning agent operation incomplete if it
requires semantic recall. The platform operator repairs the route; the agent
operation owner decides whether its original identity and deadline permit
resume. Do not create a replacement run to hide the failed recall.

#### Restore the Route and Memory Reader

A verified `quiescent: true` receipt means that Linux no longer reports any
member of this observer's process group. Exit 124 with that receipt permits
route restoration, but cannot pass the terminal-failure scenario. Exit 125,
missing receipt, exec loss, interruption, unknown observation, Pod replacement,
container restart, or changed source identity blocks every subsequent memory
call, note deletion, and reindex. Keep `memory-stop` and all source/index files.
The platform operations owner restores the narrow network policy through the
bound independent administration path. The OpenClaw and platform operations
owners must establish process and storage ownership through their approved
inspection procedure before any new stateful work. This page provides no safe
post-disconnect process-group reattachment command: a reused numeric process
ID cannot identify the original group. Do not remove the stop file to bypass
this limit, kill other processes, or restart production to finish the exercise.
Local process absence cannot prove that Vertex aborted an accepted request.

Delete only the policy UID captured from its successful CREATE response, confirm
its absence, and repeat the direct
HTTP embedding. This proves route recovery only. Then repeat the real memory
reader. Gateway readiness or a direct vector alone is not consumer recovery.

```bash
assert_cluster_binding || exit 126
restore_litellm_policy
owned_memory_exec node --input-type=module -e '
const r = await fetch(`${process.env.LITELLM_URL}/v1/embeddings`, {
  method: "POST",
  headers: { authorization: `Bearer ${process.env.LITELLM_API_KEY}`, "content-type": "application/json" },
  body: JSON.stringify({ model: "gemini-embedding-001", input: "recovery probe" }),
  signal: AbortSignal.timeout(60000)
});
const b = await r.json(); const v = b?.data?.[0]?.embedding;
if (!r.ok || !Array.isArray(v) || v.length === 0 || !v.every(Number.isFinite)) process.exit(1);
console.log(JSON.stringify({ model: b.model ?? "gemini-embedding-001", dimensions: v.length }));
' | tee "$EVIDENCE_DIR/litellm-recovery.json"
litellm_policy_restore_pending=0
trap - EXIT HUP INT TERM
```

Repeat the supported memory calls after route restoration.

```bash
assert_cluster_binding || exit 126
bounded_memory_cli 900 index --agent main --verbose \
  > "$EVIDENCE_DIR/memory-index-recovery.txt" 2> "$EVIDENCE_DIR/memory-index-recovery.stderr"
bounded_memory_cli 210 status --agent main --deep --json \
  > "$EVIDENCE_DIR/memory-recovery.json" 2> "$EVIDENCE_DIR/memory-recovery.stderr"
bounded_memory_cli 210 search --agent main \
  --query "Where does the amber observatory keep its calibration record?" --json \
  > "$EVIDENCE_DIR/memory-query-recovery.json" 2> "$EVIDENCE_DIR/memory-query-recovery.stderr"
```

Apply the same provider, embedding-probe, vector, freshness, and note-result
checks as before the fault. Retain both baselines, fault exit and stderr,
request timestamps and observed attempt count, route identity, Secret names
without values, Pod identities, and policy cleanup evidence. The pinned manager defines the attempt limits. Count this CLI's
`memory embeddings: query start` events and retry-wait messages to record
observed attempts. Missing diagnostics leave the attempt observation unproved. Do not derive a count from readiness or the 70-second route observer.

Remove only the synthetic note whose receipt you retained. Reindex to remove
its derived search entry, then confirm its path is absent from a repeated
query. Do not reset the agent database or delete source sessions to clean up a
single probe. Recall bookkeeping and provider request records can remain.

```bash
assert_cluster_binding || exit 126
memory_state_exec delete -i \
  node --input-type=module -e '
import fs from "node:fs";
let input = ""; for await (const chunk of process.stdin) input += chunk;
const { name, text, path } = JSON.parse(input);
if (!/^litellm-reader-[0-9a-f-]{36}\.md$/.test(name)) process.exit(1);
const file = `${process.argv[1]}/memory/${name}`;
if (path !== file || fs.readFileSync(file, "utf8") !== text) process.exit(1);
fs.unlinkSync(file);
if (fs.existsSync(file)) throw new Error("owned note remains after deletion");
console.error(JSON.stringify({ observer: "memory-state", operationId: process.argv[2],
  action: "delete", path: file, completed: true, verified: true }));
' "$MEMORY_WORKSPACE" < "$EVIDENCE_DIR/memory-note.json"
bounded_memory_cli 900 index --agent main --verbose \
  > "$EVIDENCE_DIR/memory-index-cleanup.txt" 2> "$EVIDENCE_DIR/memory-index-cleanup.stderr"
bounded_memory_cli 210 search --agent main \
  --query "Where does the amber observatory keep its calibration record?" --json \
  > "$EVIDENCE_DIR/memory-query-cleanup.json" 2> "$EVIDENCE_DIR/memory-query-cleanup.stderr"
```


> **Source evidence — memory-consumer procedure**
>
> **Claim:** The selected CLI reaches the configured memory manager. Query retries and error mapping belong to that manager; direct HTTP probes test only the model route.
>
> **Implementation:** [CLI search and error exit](https://github.com/openclaw/openclaw/blob/3a9d69db306cd7f081e06254cb89c4bcc14a7107/extensions/memory-core/src/cli-index-search.runtime.ts#L197-L238); [query retry invocation](https://github.com/openclaw/openclaw/blob/3a9d69db306cd7f081e06254cb89c4bcc14a7107/extensions/memory-core/src/memory/manager-embedding-ops.ts#L610-L665).
>
> **Contract or setting:** [Query/index retry profiles](https://github.com/openclaw/openclaw/blob/3a9d69db306cd7f081e06254cb89c4bcc14a7107/extensions/memory-core/src/memory/manager-embedding-policy.ts#L65-L82); [managed memory settings and SecretRef](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/charts/kubeclaw/templates/configmap-gateway.yaml#L55-L75); [restart synchronization](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/charts/kubeclaw/templates/deployment.yaml#L516-L524).
>
> **Test evidence:** There is no maintained KubeClaw repository test for these operator memory helpers or the selected target-image CLI exercise. **LOCAL CHECKS PASSED:** published Bash/Node syntax and extracted binding/consumer guards. Also: owned Linux process probes for normal exit, deadline escalation and a surviving descendant after direct-child close. Those probes used a synthetic child, not OpenClaw. The linked CLI, configuration and retry sources are **SOURCE ONLY**; the actual target-image memory reader is **NOT EXECUTED**.
>
> **Revision:** OpenClaw `3a9d69db306cd7f081e06254cb89c4bcc14a7107`; KubeClaw configuration `4d3068465a2e202d2d5073b77e9273c308497995`.
>
> **Limit:** These local checks do not prove image compatibility, managed SecretRef resolution, actual retry counts, upstream timeout injection, semantic memory recovery or remote cancellation.

**Current verification boundary:** The pinned sources expose and configure this
CLI path. These commands have not been run against the selected target image
or a live cluster here. If the deployed image lacks this CLI, cannot resolve
the managed SecretRef, or cannot produce the required semantic observations,
stop at that exact failed step. Preserve its output and image identity for the
platform and OpenClaw maintainers. A direct HTTP probe remains useful route
evidence but cannot replace the missing memory-consumer result. Completion
requires a clean reader to run the baseline, observe the bounded consumer
failure and retries while LiteLLM remains ready, restore the route, and pass
the same memory-reader checks. This procedure does not establish managed
reasoning, tool-caller cancellation, image/source attestation, or a successful
pipeline resume.

### Git Revision Unavailable

The [project compiler records the architecture ref and inserts mandatory
source admission before sync](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/nova/project/source.ts#L33-L65).
The [subject reader resolves the declared ref without substituting HEAD](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/common/plugin-runtime/sdk/src/review-subject.ts#L50-L75).
The [source stage maps a read failure to `blocked` with
`source_preflight.invalid`](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/nova/plugins/preflight-contract/src/source-stage.ts#L20-L40).
The [source-prefix regression checks prevent downstream implementation after
failed admission](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/tests/verification/reliability/project-source.test.mjs#L37-L53).
Those checks cover the source/Git prefix, not a full live Buster run. This
unavailable-revision exercise and its later successful run are not recorded as
executed here.


> **Source evidence — immutable Git source admission**
>
> **Claim:** The compiler binds the requested architecture ref; failed source admission prevents downstream review/sync/implementation instead of substituting another revision.
>
> **Implementation:** [Project source prefix](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/nova/project/source.ts#L33-L65); [exact subject ref resolution](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/common/plugin-runtime/sdk/src/review-subject.ts#L50-L75); [blocked source stage](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/nova/plugins/preflight-contract/src/source-stage.ts#L20-L40).
>
> **Contract or setting:** The original project descriptor and [source admission binding](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/nova/project/source.ts#L33-L65) determine the required ref. Fault and restored descriptors have separate run identities.
>
> **Test evidence:** [Mandatory source failure and invalid binding regression](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/tests/verification/reliability/project-source.test.mjs#L37-L53): **SOURCE ONLY; NOT EXECUTED**. This regression source was read. It covers the source/Git prefix, not the full remote Buster path. **LOCAL CHECKS PASSED:** failed-source audit helpers used synthetic records.
>
> **Revision:** 4d3068465a2e202d2d5073b77e9273c308497995
>
> **Limit:** We ran no actual unavailable-origin exercise, Git fetch, full pipeline, restored run or remote import here.

Before either run audit below, complete
[Inspect a Run](operate.md#inspect-a-run) and define the canonical
`preserve_run_state` helper in this shell. Each start command must have exited;
verify stopped run and adapter writers and preserve the owning adapter stores
through their declared backup procedures for that exact run. Use the original
`PLATFORM_FILE` and each descriptor's original run ID. A returned status alone
does not prove that all writers stopped. On missing ownership, failed copies,
or rejected strict copied journals, retain raw bytes and stop before audit or
any new run. No interruption or tail repair can substitute for terminal success.

Use a disposable registered `nova-project.v2` project whose repository and
immutable release ref are owned by the acceptance operator. Its compact Buster
plan must finish without another human wait so this exercise can distinguish
the Git failure from later behavior. Its `test.plan.execute` results must fit
within the 16 KiB inline-audit result limit for the receipt check below. Do not rewrite a production ref or edit
the original project descriptor. Create two descriptor copies outside the
project repository: one distinct failed-run identity with an unavailable
architecture revision and one distinct successful-run identity with the exact
valid revision restored.

```bash
export PROJECT_REPOSITORY="<absolute-path-to-disposable-project>"
export GIT_EXERCISE_DIR="<absolute-path-outside-project>/git-unavailable-evidence"
export SOURCE_REF="<advertised-immutable-ref>"
export RELEASE_COMMIT="<full-git-commit>"
export UNAVAILABLE_COMMIT="1111111111111111111111111111111111111111"
export GIT_FAULT_RUN_ID="<new-registered-fault-run-id>"
export GIT_SUCCESS_RUN_ID="<different-new-registered-success-run-id>"
export GIT_FAULT_PROJECT="$GIT_EXERCISE_DIR/project-fault.json"
export GIT_SUCCESS_PROJECT="$GIT_EXERCISE_DIR/project-success.json"
export GIT_FAULT_PIPELINE="$GIT_EXERCISE_DIR/pipeline-fault.json"
export GIT_SUCCESS_PIPELINE="$GIT_EXERCISE_DIR/pipeline-success.json"
mkdir -p "$GIT_EXERCISE_DIR"
test "$GIT_FAULT_RUN_ID" != "$GIT_SUCCESS_RUN_ID"
case "$GIT_EXERCISE_DIR" in
  "$PROJECT_REPOSITORY"|"$PROJECT_REPOSITORY"/*) exit 1 ;;
esac
test "$(git -C "$PROJECT_REPOSITORY" rev-parse --verify HEAD)" = "$RELEASE_COMMIT"
test -z "$(git -C "$PROJECT_REPOSITORY" status --porcelain)"
git -C "$PROJECT_REPOSITORY" fetch --no-tags origin "$SOURCE_REF"
test "$(git -C "$PROJECT_REPOSITORY" rev-parse --verify FETCH_HEAD^{commit})" = "$RELEASE_COMMIT"
set +e
git -C "$PROJECT_REPOSITORY" cat-file -e "$UNAVAILABLE_COMMIT^{commit}" \
  > "$GIT_EXERCISE_DIR/git-local-unavailable.txt" 2>&1
git_local_status=$?
git -C "$PROJECT_REPOSITORY" fetch --no-tags origin "$UNAVAILABLE_COMMIT" \
  > "$GIT_EXERCISE_DIR/git-origin-unavailable.txt" 2>&1
git_fault_status=$?
set -e
test "$git_local_status" -ne 0
test "$git_fault_status" -ne 0
git -C "$PROJECT_REPOSITORY" ls-remote --exit-code origin "$SOURCE_REF" \
  | tee "$GIT_EXERCISE_DIR/git-reachable-ref.txt"
```

Create the two closed descriptor copies. Changing a project `runId` also
requires changing every embedded resolved Buster plan and recomputing its
`planDigest`; changing only the top-level field does not compile. The script
below performs exactly those changes and refuses to overwrite a file.

```bash
node --input-type=module - "$PROJECT_FILE" "$GIT_FAULT_PROJECT" \
  "$GIT_SUCCESS_PROJECT" <<'NODE'
import fs from 'node:fs';
import { resolvedTestPlanDigest } from '@kubeclaw/pipeline-test-gate-contract';
const [sourceFile, faultFile, successFile] = process.argv.slice(2);
const source = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
if (source.schemaVersion !== 'nova-project.v2'
  || source.repositoryRoot !== process.env.PROJECT_REPOSITORY
  || source.baseRevision !== process.env.RELEASE_COMMIT) {
  throw new Error('source descriptor is not the selected disposable project');
}
const rewritePlan = (providerPlan, runId) => {
  const plan = providerPlan?.plan;
  if (!plan) throw new Error('every test scope must have a resolved provider plan');
  plan.runId = runId;
  const { planDigest: _old, ...unsigned } = plan;
  plan.planDigest = resolvedTestPlanDigest(unsigned);
};
const descriptor = (runId, architectureRef) => {
  const value = structuredClone(source);
  value.runId = runId;
  value.architecture.ref = architectureRef;
  for (const module of value.modules) rewritePlan(module.test.providerPlan, runId);
  rewritePlan(value.final.test.providerPlan, runId);
  return value;
};
fs.writeFileSync(faultFile,
  `${JSON.stringify(descriptor(process.env.GIT_FAULT_RUN_ID, process.env.UNAVAILABLE_COMMIT))}\n`,
  { flag: 'wx', mode: 0o600 });
fs.writeFileSync(successFile,
  `${JSON.stringify(descriptor(process.env.GIT_SUCCESS_RUN_ID, process.env.RELEASE_COMMIT))}\n`,
  { flag: 'wx', mode: 0o600 });
NODE
```

Compile and start the fault descriptor. Compilation must succeed because it
validates the registered graph, schemas, and grants without reading the Git
revision. Start must then return exit status `1` and a terminal `blocked` or
`failed` run. Unlike a CLI argument error before run creation, this result has
a durable audit.

```bash
npm --silent run pipeline -- \
  --platform "$PLATFORM_FILE" \
  --project "$GIT_FAULT_PROJECT" \
  --compile "$GIT_FAULT_PIPELINE" \
  > "$GIT_EXERCISE_DIR/compile-fault.json"
set +e
npm --silent run pipeline -- \
  --platform "$PLATFORM_FILE" \
  --project "$GIT_FAULT_PROJECT" \
  > "$GIT_EXERCISE_DIR/run-fault.json" \
  2> "$GIT_EXERCISE_DIR/run-fault.stderr"
git_run_status=$?
set -e
test "$git_run_status" -eq 1
```

Before the fault-run audit, verify stopped writers and complete the adapter
copies for `GIT_FAULT_RUN_ID` through their declared backup procedures. Then
perform the canonical raw-run preservation and strict copied-journal checks.
Stop and retain raw bytes if either store copy or inspection fails.

```bash
export RUN_CONTROL_PLATFORM="$PLATFORM_FILE"
export RUN_CONTROL_RUN_ID="$GIT_FAULT_RUN_ID"
preserve_run_state || exit 1
printf '%s\n' "$RUN_CONTROL_OBSERVATION_ROOT" > "$GIT_EXERCISE_DIR/raw-fault.txt" || exit 1
npm --silent run pipeline -- \
  --platform "$RUN_CONTROL_PLATFORM" \
  --audit "$RUN_CONTROL_RUN_ID" \
  > "$GIT_EXERCISE_DIR/audit-fault.json"
node - "$GIT_EXERCISE_DIR/run-fault.json" \
  "$GIT_EXERCISE_DIR/audit-fault.json" <<'NODE'
const fs = require('node:fs');
const [runFile, auditFile] = process.argv.slice(2);
const run = JSON.parse(fs.readFileSync(runFile, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditFile, 'utf8'));
if (run.runId !== process.env.GIT_FAULT_RUN_ID || audit.runId !== run.runId
  || !['blocked', 'failed'].includes(run.status)) throw new Error('expected durable failed run');
const source = run.stages?.['source-preflight'];
if (!source || !['blocked', 'failed'].includes(source.status)
  || source.reason?.code !== 'source_preflight.invalid') throw new Error('Git source preflight did not fail');
if (!JSON.stringify(source).includes(process.env.UNAVAILABLE_COMMIT)) {
  throw new Error('failed source state does not retain the unavailable revision');
}
if (audit.events.some(event => event.type === 'effect.requested'
  && event.payload?.capability === 'test.plan.execute')) {
  throw new Error('Buster must not receive or import work from the unavailable revision');
}
NODE
```

The expected observation is a failed source preflight naming the unavailable
revision, no `test.plan.execute` effect, no source archive, and no Buster
import. A reachable branch head or another local commit is not a substitute.
Preserve this audit. Do not recover it with changed input.

Fetch and revalidate the exact valid revision, then compile and start the
separate restored descriptor. This is a new governed run because its run and
source request differ from the failed one.

```bash
git -C "$PROJECT_REPOSITORY" fetch --no-tags origin "$SOURCE_REF"
test "$(git -C "$PROJECT_REPOSITORY" rev-parse --verify FETCH_HEAD^{commit})" = "$RELEASE_COMMIT"
git -C "$PROJECT_REPOSITORY" cat-file -e "$RELEASE_COMMIT^{commit}"
test "$(git -C "$PROJECT_REPOSITORY" rev-parse --verify HEAD)" = "$RELEASE_COMMIT"
test -z "$(git -C "$PROJECT_REPOSITORY" status --porcelain)"
npm --silent run pipeline -- \
  --platform "$PLATFORM_FILE" \
  --project "$GIT_SUCCESS_PROJECT" \
  --compile "$GIT_SUCCESS_PIPELINE" \
  > "$GIT_EXERCISE_DIR/compile-success.json"
npm --silent run pipeline -- \
  --platform "$PLATFORM_FILE" \
  --project "$GIT_SUCCESS_PROJECT" \
  > "$GIT_EXERCISE_DIR/run-success.json" \
  2> "$GIT_EXERCISE_DIR/run-success.stderr"
```

Before the successful-run audit, verify stopped writers and complete the
adapter copies for `GIT_SUCCESS_RUN_ID` through their declared backup
procedures. Preserve and strictly inspect this distinct run's raw bytes.
Missing copy or ownership proof stops the exercise; retain the terminal
command output and do not replace it with an interrupted run.

```bash
export RUN_CONTROL_PLATFORM="$PLATFORM_FILE"
export RUN_CONTROL_RUN_ID="$GIT_SUCCESS_RUN_ID"
preserve_run_state || exit 1
printf '%s\n' "$RUN_CONTROL_OBSERVATION_ROOT" > "$GIT_EXERCISE_DIR/raw-success.txt" || exit 1
npm --silent run pipeline -- \
  --platform "$RUN_CONTROL_PLATFORM" \
  --audit "$RUN_CONTROL_RUN_ID" \
  > "$GIT_EXERCISE_DIR/audit-success.json"
node - "$GIT_EXERCISE_DIR/run-success.json" \
  "$GIT_EXERCISE_DIR/audit-success.json" \
  "$GIT_EXERCISE_DIR/buster-source-receipt.json" <<'NODE'
const fs = require('node:fs');
const [runFile, auditFile, receiptFile] = process.argv.slice(2);
const run = JSON.parse(fs.readFileSync(runFile, 'utf8'));
const audit = JSON.parse(fs.readFileSync(auditFile, 'utf8'));
const terminal = [...audit.events].reverse().find(event =>
  ['run.succeeded', 'run.failed', 'run.blocked', 'run.cancelled'].includes(event.type));
if (run.runId !== process.env.GIT_SUCCESS_RUN_ID || run.status !== 'succeeded'
  || audit.runId !== run.runId || terminal?.type !== 'run.succeeded') {
  throw new Error('restored run did not succeed under its distinct identity');
}
const requests = audit.events.filter(event => event.type === 'effect.requested'
  && event.payload?.capability === 'test.plan.execute');
const results = requests.map(request => audit.events.find(event =>
  event.type === 'effect.completed' && event.identity?.effectId === request.identity?.effectId)?.payload?.result);
if (results.some(result => result?.schemaVersion === 'effect-result-summary.v1')) {
  throw new Error('AUDIT_RESULT_EXTERNALIZED: compact inline receipt proof is unavailable; stop');
}
const decisions = results.filter(result => result?.schemaVersion === 'test-gate-decision.v2'
    && result.runId === run.runId && result.state === 'passed'
    && result.coverage?.policy?.baseRevision === process.env.RELEASE_COMMIT
    && /^git:[a-f0-9]{40}$/.test(result.coverage?.sourceRevision ?? '')
    && /^git:[a-f0-9]{40}$/.test(result.coverage?.sourceTree ?? '')
    && /^sha256:[a-f0-9]{64}$/.test(result.coverage?.archiveContentDigest ?? ''));
if (!decisions.length) throw new Error('verified Buster source receipt is missing');
const receipt = decisions.map(result => ({
  jobId: result.jobId,
  planId: result.planId,
  runId: result.runId,
  resultDigest: result.resultDigest,
  planDigest: result.coverage.planDigest,
  pipelineStageId: result.coverage.pipelineStageId,
  baseRevision: result.coverage.policy.baseRevision,
  sourceRevision: result.coverage.sourceRevision,
  sourceTree: result.coverage.sourceTree,
  archiveContentDigest: result.coverage.archiveContentDigest
}));
fs.writeFileSync(receiptFile, `${JSON.stringify(receipt)}\n`, { flag: 'wx', mode: 0o600 });
NODE
export BUSTER_SOURCE_COMMIT="$(node -e '
const receipt = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
process.stdout.write(receipt[0].sourceRevision.slice(4));
' "$GIT_EXERCISE_DIR/buster-source-receipt.json")"
git -C "$PROJECT_REPOSITORY" cat-file -e "$BUSTER_SOURCE_COMMIT^{commit}"
git -C "$PROJECT_REPOSITORY" merge-base --is-ancestor \
  "$RELEASE_COMMIT" "$BUSTER_SOURCE_COMMIT"
```

The [coverage contract derives source revision, tree, archive digest, plan,
and stage identity from the verified remote job](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/contracts/pipeline-test-gate/v1/src/coverage-result.ts#L17-L27).
The [effect journal projection binds completed results to effect IDs](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/nova/core/execution/engine-runtime.ts#L53-L82).
That projection summarizes results larger than 16 KiB as
`effect-result-summary.v1`. The snippet stops on such a summary. A summary's
content digest does not prove the projected source receipt. The release/runtime
owner must provide a documented read of the original verified result, including
its binding checks, before this exercise can accept an externalized result.
Preserve the summary and audit unchanged; do not reconstruct the decision from
counts or edit the journal. This is a current operator boundary, not a missing
receipt that can be ignored.


> **Source evidence — source receipt and bounded audit projection**
>
> **Claim:** Verified job state supplies source revision/tree/archive, plan and stage identity. Lifecycle effect IDs bind completed results; results above 16 KiB become summaries that this operator helper cannot accept as the original receipt.
>
> **Implementation:** [bindGateCoverage](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/contracts/pipeline-test-gate/v1/src/coverage-result.ts#L17-L27); [effectAppender and auditResult](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/skills/nova/core/execution/engine-runtime.ts#L53-L82).
>
> **Contract or setting:** [Coverage result fields](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/contracts/pipeline-test-gate/v1/src/coverage-result.ts#L5-L14) and the exact original run/effect/source checks in the compact receipt helper above.
>
> **Test evidence:** [Remote skipped-coverage and source/plan binding regression](https://github.com/datrab/kubeclaw/blob/4d3068465a2e202d2d5073b77e9273c308497995/tests/verification/reliability/coverage-remote.test.mts#L62-L76): **SOURCE ONLY; NOT EXECUTED**. It checks remote coverage decisions, not this operator receipt read. There is no maintained repository test for the compact-receipt helper or its externalized-result stop. **LOCAL CHECKS PASSED:** the compact receipt projection used synthetic effect-linked records.
>
> **Revision:** 4d3068465a2e202d2d5073b77e9273c308497995
>
> **Limit:** No actual remote result or restored-run receipt was read. An externalized summary requires the release/runtime owner's documented original-result read before recovery can close.


The final ancestry check allows the governed project stages to produce a later
candidate while proving that Buster received a source descended from the exact
restored baseline. Preserve both distinct run audits and the projected Buster
source receipt. The descriptor and compiled-graph copies are disposable after
their retention period; remove only those exact files. Never rewrite the
failed run's source identity or its audit.

## Prism Diagnosis

Check in this order:

1. `prism-postgresql` readiness and database connection.
2. `prism-control` readiness and logs.
3. `prism-worker` readiness and operation journal.
4. Artifact PVC availability and object digest.
5. `agent-prism` gateway status.
6. Studio Service or Ingress access.
7. Tailnet authorization for external access.

Use [Prism Upgrade](maintenance.md#prism-upgrade) for database transition failures.
Use [Back Up and Recover](recovery.md) for data corruption or loss.

## Worker Trust Diagnosis

Use the fixed failure order in [Worker Trust](worker-trust.md).
An [SVID (SPIFFE Verifiable Identity Document)](../reference/glossary.md#svid)
is a workload credential. These deployed paths use a short-lived X.509
certificate that contains the workload's SPIFFE identity. Check context,
namespace, CSI, SPIRE, SVID, Envoy, Service, policy, allowlist, and signing keys.
Distinguish a failed identity check from an application denial: successful
identity verification does not grant application permission. The receiving
application must also allow that identity.

Do not disable mTLS to make a protected path pass.
That action changes the security contract instead of diagnosing it.

## Escalation Conditions

Stop and escalate for any of these conditions:

- Journal hash or sequence failure.
- Changed graph, package, source, or policy digest.
- Uncertain external effect without a reconciliation method.
- Unknown process ownership after worker restart.
- Corrupt or incomplete backup group.
- Lost cluster access without an independent path.
- Database migration beyond its rollback point.
- Secret or signing-key exposure.
- Storage deletion request without complete reference ownership.

## Recovery and Cleanup

Before run audit, recovery, or resume, complete
[Durable Run Inspection](#durable-run-inspection). Use
[Recover After Interruption](operate.md#recover-after-interruption) for supported
run recovery; stop while copied journals or external outcomes remain uncertain.
Use [Back Up and Recover](recovery.md) for state restoration.

After resolution:

1. Re-run the narrow failed check.
2. Re-run the component smoke check.
3. Compare durable state before and after recovery.
4. Remove temporary credentials and diagnostic workloads.
5. Verify their removal.
6. Preserve failed and successful evidence separately.
7. Record any remaining uncertainty.

Do not close an incident because a Pod restarted.
Close it only after the intended application result and cleanup both pass.
