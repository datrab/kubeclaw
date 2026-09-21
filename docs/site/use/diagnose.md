# Observe and Diagnose

Status: implemented source-backed diagnosis path; complete live alert delivery remains open
Audience: operator, incident responder
Owner: platform operations
Evidence: scripts/deploy.sh; skills/nova/core/telemetry/audit.ts; docs/operations/observability-retention.md
Applies to: current runtime roles and durable pipeline state
Last verified: 2026-09-16, source inspection and local documentation checks

## Objective

Classify a failure without destroying its evidence or repeating an uncertain effect.
Finish with one cause class, one safe next action, and retained evidence.

## Supported Versions

Use the [shared version rules](README.md#supported-versions-and-tools).
Diagnose with clients from the selected operator environment.
When client and server versions differ from the recorded release inputs, preserve that fact as a possible cause instead of assuming compatibility.

## Diagnosis Order

Use the same order for every incident:

1. Confirm target and time window.
2. Check cluster and storage availability.
3. Check workload health and Kubernetes events.
4. Check service and role logs.
5. Read durable run and job state.
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
kubectl config current-context
kubectl get nodes -o wide
./scripts/deploy.sh status
kubectl -n "<namespace>" get deploy,statefulset,pods,svc,pvc -o wide
kubectl -n "<namespace>" get events --sort-by=.metadata.creationTimestamp
helm list -n "<namespace>"
```

Expected observation: the context matches the incident record.
Commands must return current objects rather than cached screenshots.

If the API does not respond, leave this path.
Use the independent host or control-plane route from the installation record.

## Health and Logs

Check one affected Pod before broad log collection:

```bash
kubectl -n "<namespace>" describe pod "<pod>"
kubectl -n "<namespace>" logs "<pod>" -c "<container>" --since=30m --timestamps
kubectl -n "<namespace>" logs "<pod>" -c "<container>" --previous --timestamps
```

The `--previous` output exists only after a container restart and before Pod replacement.
Its absence does not prove a clean previous run.

Use role smoke checks after capturing failure evidence:

```bash
./scripts/deploy.sh smoke-agent nova
./scripts/deploy.sh smoke-agent buster
kubectl -n "$NAMESPACE" exec deployment/agent-nova -c kubeclaw -- \
  node /runtime-config/kubeclaw-health.mjs startup
./scripts/deploy.sh prism-smoke
```

A failed smoke narrows the component boundary.
A passing smoke does not prove a specific pipeline attempt.

## Durable Run Inspection

Read the canonical audit:

```bash
npm run pipeline -- \
  --platform "<platform.json>" \
  --audit "<run-id>"
```

Preserve the JSON before recovery.
Compare it with provider and Kubernetes evidence by identity, not by time alone.

Do not edit journal, snapshot, effect, wait, or receipt files.
Manual edits break the recovery and audit boundary.

## Capacity and Growth

Check scheduling and filesystem signals separately:

```bash
kubectl -n "<namespace>" get resourcequota,limitrange
kubectl -n "<namespace>" get pvc
kubectl -n "<namespace>" top pods --containers
kubectl top nodes
```

Metrics commands can fail when Metrics Server is absent.
That failure means usage data is unavailable, not that usage is safe.

For each durable root, record used bytes, free bytes, inode use, and growth rate.
Do not delete history merely because a filesystem is full.

The current system lacks complete connected history retirement.
[PCR-OBS-002](../status/open-issues.md#pcr-obs-002) tracks that implementation gap.

Use [Capacity and Retention](maintenance.md#capacity-and-retention) for supported narrow compaction paths.
Those paths do not authorize broad run deletion.

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
| Job has no response | Job admission, provider status, receipt store, import journal | Reconcile provider and import existing result |
| Git operation conflicts | Worktree path, lock owner, branch, remote state | Resolve in the owned worktree; reconcile a possibly successful push |
| Gate failed | Gate decision, original report, source digest, provider receipt | Repair the defect or follow the declared repair route |
| External effect is uncertain | Effect request, idempotency key, external resource, receipt | Reconcile externally; never blind-retry |
| Resume fails | Active wait ID, signal type, issuer, expiry, graph digest | Create one matching current signal or start a new run |
| Cancellation seems incomplete | Durable terminal event, process owner, child processes | Keep resources; escalate until quiescence is proven |
| Plugin is unavailable | Registry validation, activation log, selected provider, grant | Correct platform configuration and start a new governed run |
| Worker repeatedly restarts | Pod events, previous logs, resource limits, storage | Repair the first failing dependency or capacity cause |
| Prism result is missing | Control, Worker, PostgreSQL, artifact, and dispatch identities | Reconcile by identity; do not create another design round |
| Demo URL fails | Ingress, Tailnet identity, execution receipt, expiry | Repair access or rerun the governed exposure stage |
| Observer message is missing | Canonical event, observer checkpoint, delivery attempts, receiver receipt | Replay only through the observer contract |
| Disk grows after terminal jobs | Ownership and quiescence evidence | Retain data until safe cleanup authority exists |
| Wrong configuration seems active | Rendered values, Pod spec, ConfigMap/Secret revision, persisted config | Correct the owned source and perform a targeted rollout |

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
[PCR-BUSTER-ENGINE-001](../status/open-issues.md#pcr-buster-engine-001) tracks the boundary.

## Lost Responses and Uncertain Effects

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

This section is the command authority for `EXEC-FAIL-REDIS`,
`EXEC-FAIL-POSTGRESQL`, `EXEC-FAIL-REGISTRY-ENDPOINT`,
`EXEC-FAIL-TAILSCALE`, `EXEC-FAIL-LITELLM`, and `EXEC-FAIL-GIT`.
These are operator exercises, not claims that the failures have already been
run. Each exercise must produce its own failed observation, safe-stop decision,
restoration record, end-consumer verification, and cleanup result.

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
set -euo pipefail
export NAMESPACE="<namespace>"
export PRISM_NAMESPACE="<prism-namespace>"
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

### Redis Unavailable: EXEC-FAIL-REDIS

Precondition: `statefulset/redis-master` has one ready replica, its PVC is
bound, and both role smoke checks pass. Scaling to zero stops the process but
does not delete its PVC. Record the original replica count so restoration does
not assume one.

```bash
./scripts/deploy.sh smoke-agent nova
./scripts/deploy.sh smoke-agent buster
kubectl -n "$NAMESPACE" get statefulset/redis-master \
  -o jsonpath='{.spec.replicas}' > "$EVIDENCE_DIR/redis-replicas.txt"
grep -Eq '^[1-9][0-9]*$' "$EVIDENCE_DIR/redis-replicas.txt"
kubectl -n "$NAMESPACE" get pvc -l app.kubernetes.io/name=redis \
  -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.metadata.uid}{"\n"}{end}' \
  | sort > "$EVIDENCE_DIR/redis-pvc-before.txt"
test -s "$EVIDENCE_DIR/redis-pvc-before.txt"
npm --silent run pipeline -- --platform "$PLATFORM_FILE" --audit "$SELECTED_RUN_ID" \
  > "$EVIDENCE_DIR/redis-nova-audit-before.json"
redis_restore_pending=1
restore_redis() {
  if [ "${redis_restore_pending:-0}" -eq 1 ]; then
    redis_replicas="$(cat "$EVIDENCE_DIR/redis-replicas.txt")"
    kubectl -n "$NAMESPACE" scale statefulset/redis-master --replicas="$redis_replicas"
    kubectl -n "$NAMESPACE" rollout status statefulset/redis-master --timeout=180s
    ./scripts/deploy.sh smoke-agent nova
    ./scripts/deploy.sh smoke-agent buster
    kubectl -n "$NAMESPACE" exec deployment/agent-nova -c kubeclaw -- \
      node /runtime-config/kubeclaw-health.mjs startup
  fi
}
trap 'restore_redis' EXIT
trap 'exit 130' HUP INT TERM
kubectl -n "$NAMESPACE" scale statefulset/redis-master --replicas=0
kubectl -n "$NAMESPACE" wait --for=delete pod -l app.kubernetes.io/name=redis \
  --timeout=120s
set +e
./scripts/deploy.sh smoke-agent nova > "$EVIDENCE_DIR/redis-fault.txt" 2>&1
redis_fault_status=$?
set -e
test "$redis_fault_status" -ne 0
sed -n '1,200p' "$EVIDENCE_DIR/redis-fault.txt"
```

Expected observation: the first Redis consumer reports a bounded connection or
timeout failure while the Nova audit for the selected run remains readable.
Record journal state separately from the missing Redis projection. The safe
decision is to stop only Redis-dependent adapters and observers. Do not reset
Nova or Buster state, recreate an event, or loop the request.

Restore exactly the recorded replica count, then require both authenticated
role checks. The startup portion also exercises the bounded stream check; a Pod
becoming Ready by itself is not functional recovery.

```bash
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
npm --silent run pipeline -- --platform "$PLATFORM_FILE" --audit "$SELECTED_RUN_ID" \
  > "$EVIDENCE_DIR/redis-nova-audit-after.json"
node - "$EVIDENCE_DIR/redis-nova-audit-before.json" \
  "$EVIDENCE_DIR/redis-nova-audit-after.json" "$SELECTED_RUN_ID" <<'NODE'
const fs = require('node:fs');
const [beforeFile, afterFile, runId] = process.argv.slice(2);
const before = JSON.parse(fs.readFileSync(beforeFile, 'utf8'));
const after = JSON.parse(fs.readFileSync(afterFile, 'utf8'));
if (before.runId !== runId || after.runId !== runId || !before.journalHead || !after.journalHead) {
  throw new Error('selected Nova audit was not readable before and after the Redis fault');
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

### Prism PostgreSQL Unavailable: EXEC-FAIL-POSTGRESQL

This exercise targets Prism PostgreSQL only. Precondition: `prism-smoke` passes,
LiteLLM and its separate `statefulset/postgresql` are ready, and no Prism write
or database backup is in progress. Record the selected project and operation
IDs before the fault.

```bash
./scripts/deploy.sh prism-smoke
kubectl -n "$NAMESPACE" rollout status statefulset/postgresql --timeout=120s
kubectl -n "$PRISM_NAMESPACE" get statefulset/prism-postgresql \
  -o jsonpath='{.spec.replicas}' > "$EVIDENCE_DIR/prism-postgresql-replicas.txt"
grep -Eq '^[1-9][0-9]*$' "$EVIDENCE_DIR/prism-postgresql-replicas.txt"
kubectl -n "$PRISM_NAMESPACE" get pvc -l app=prism-postgresql \
  -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.metadata.uid}{"\n"}{end}' \
  | sort > "$EVIDENCE_DIR/prism-postgresql-pvc-before.txt"
test -s "$EVIDENCE_DIR/prism-postgresql-pvc-before.txt"
prism_postgresql_restore_pending=1
restore_prism_postgresql() {
  if [ "${prism_postgresql_restore_pending:-0}" -eq 1 ]; then
    prism_db_replicas="$(cat "$EVIDENCE_DIR/prism-postgresql-replicas.txt")"
    kubectl -n "$PRISM_NAMESPACE" scale statefulset/prism-postgresql \
      --replicas="$prism_db_replicas"
    kubectl -n "$PRISM_NAMESPACE" rollout status statefulset/prism-postgresql \
      --timeout=180s
    ./scripts/deploy.sh prism-smoke
    kubectl -n "$PRISM_NAMESPACE" exec statefulset/prism-postgresql -- \
      pg_isready -U postgres -d prism
  fi
}
trap 'restore_prism_postgresql' EXIT
trap 'exit 130' HUP INT TERM
kubectl -n "$PRISM_NAMESPACE" scale statefulset/prism-postgresql --replicas=0
kubectl -n "$PRISM_NAMESPACE" wait --for=delete pod -l app=prism-postgresql \
  --timeout=120s
set +e
./scripts/deploy.sh prism-smoke > "$EVIDENCE_DIR/prism-postgresql-fault.txt" 2>&1
postgres_fault_status=$?
set -e
test "$postgres_fault_status" -ne 0
kubectl -n "$NAMESPACE" rollout status statefulset/postgresql --timeout=120s
```

Expected observation: Control or Worker readiness and the direct Prism
`pg_isready` check fail, while LiteLLM PostgreSQL remains ready. The safe
decision is to stop new Prism mutations and preserve Control operation,
revision, and artifact identities. Do not fail over, restore, or point Prism at
the LiteLLM database merely to make readiness green.

```bash
restore_prism_postgresql
```

After the database check, use the maintained
[Studio project read](prism-studio.md#step-2-open-studio-and-choose-the-project)
to open the same project and confirm its revision and artifact digest. That
application read is the recovery proof; `pg_isready` alone is not. The exercise
creates no disposable database resource, so cleanup verifies that the original
StatefulSet replica count and PVC identities are unchanged. Keep the rollback
trap armed while performing that Studio read. After recording the matching
project, revision, and artifact digest, compare the PVC identities and only
then disarm it:

```bash
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
[the LiteLLM exercise](#litellm-upstream-timeout-exec-fail-litellm), record the
LiteLLM database replica count, stop only that database, and restart LiteLLM so
startup cannot hide behind an established pool. Prism must continue to pass its
own smoke check.

```bash
litellm_embedding_probe() {
  probe_text="$1"
  kubectl -n "$NAMESPACE" exec deployment/agent-nova -c kubeclaw -- \
    env KUBECLAW_PROBE_TEXT="$probe_text" node -e '
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
kubectl -n "$NAMESPACE" get statefulset/postgresql \
  -o jsonpath='{.spec.replicas}' > "$EVIDENCE_DIR/litellm-postgresql-replicas.txt"
grep -Eq '^[1-9][0-9]*$' "$EVIDENCE_DIR/litellm-postgresql-replicas.txt"
kubectl -n "$NAMESPACE" get pvc -l app.kubernetes.io/instance=postgresql \
  -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.metadata.uid}{"\n"}{end}' \
  | sort > "$EVIDENCE_DIR/litellm-postgresql-pvc-before.txt"
test -s "$EVIDENCE_DIR/litellm-postgresql-pvc-before.txt"
litellm_postgresql_restore_pending=1
restore_litellm_postgresql() {
  if [ "${litellm_postgresql_restore_pending:-0}" -eq 1 ]; then
    litellm_db_replicas="$(cat "$EVIDENCE_DIR/litellm-postgresql-replicas.txt")"
    kubectl -n "$NAMESPACE" scale statefulset/postgresql \
      --replicas="$litellm_db_replicas"
    kubectl -n "$NAMESPACE" rollout status statefulset/postgresql --timeout=180s
    kubectl -n "$NAMESPACE" rollout status deployment/litellm --timeout=180s
    ./scripts/deploy.sh prism-smoke
    litellm_embedding_probe "database recovery probe"
  fi
}
trap 'restore_litellm_postgresql' EXIT
trap 'exit 130' HUP INT TERM
kubectl -n "$NAMESPACE" scale statefulset/postgresql --replicas=0
kubectl -n "$NAMESPACE" wait --for=delete pod \
  -l app.kubernetes.io/instance=postgresql --timeout=120s
kubectl -n "$NAMESPACE" rollout restart deployment/litellm
set +e
kubectl -n "$NAMESPACE" rollout status deployment/litellm --timeout=90s \
  > "$EVIDENCE_DIR/litellm-postgresql-fault.txt" 2>&1
litellm_postgresql_fault_status=$?
set -e
test "$litellm_postgresql_fault_status" -ne 0
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

Pass this ownership check only when LiteLLM recovers, Prism stayed healthy, and
both database PVC identities are unchanged. Never cross-restore or copy
credentials between the two PostgreSQL releases.

### Registry Endpoint Unavailable During BuildKit Push: EXEC-FAIL-REGISTRY-ENDPOINT

This lab-profile exercise requires the selected writable Service to be
`registry-local` and the mirror to be `registry-mirror`. For another production
registry, use that registry owner's maintained deny-push policy and restore
command; do not translate the lab Service mutation below to a credential or TLS
bypass. Preflight must prove the full Nova-to-Buster build path first.

```bash
./scripts/deploy.sh nova-buildkit-preflight
kubectl auth can-i patch services -n "$NAMESPACE" | grep -qx yes
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
  if [ "${registry_restore_pending:-0}" -eq 1 ]; then
    kubectl -n "$NAMESPACE" get service/registry-local \
      -o jsonpath='{.spec.selector}' \
      > "$EVIDENCE_DIR/registry-selector-rollback.json"
    if ! cmp -s "$EVIDENCE_DIR/registry-selector-before.json" \
      "$EVIDENCE_DIR/registry-selector-rollback.json"; then
      kubectl -n "$NAMESPACE" patch service/registry-local --type=json \
        --patch-file "$EVIDENCE_DIR/registry-selector-restore-patch.json"
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
kubectl -n "$NAMESPACE" patch service/registry-local --type=json \
  -p='[{"op":"replace","path":"/spec/selector","value":{"kubeclaw-fault":"unavailable-during-buildkit-push"}}]'
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
kubectl -n "$NAMESPACE" exec deployment/agent-buster -c kubeclaw -- node -e '
const r = await fetch("http://registry-mirror:5000/v2/", { signal: AbortSignal.timeout(5000) });
if (!r.ok) process.exit(1);
'
set +e
./scripts/deploy.sh nova-buildkit-preflight \
  > "$EVIDENCE_DIR/registry-buildkit-fault.txt" 2>&1
registry_fault_status=$?
set -e
test "$registry_fault_status" -ne 0
```

Expected observation: the BuildKit attempt cannot push to the registered
writable endpoint, while the mirror `/v2/` check still succeeds. Retain the
intended image reference, expected digest if already known, BuildKit attempt,
and registry error. The safe decision is to stop that build node and query the
intended digest before another build. Never switch to a mutable tag, direct
Docker Hub pull, anonymous production endpoint, or different registry.

Restore the exact captured selector; do not assume the checked-in lab default is
still the selected value. Keep the `EXIT` trap armed until the live selector is
byte-for-byte equal as JSON to the captured object. Then run the complete proof
again. Its receipt must show `registryPushVerified`, `manifestVerified`,
imported evidence, and one digest-qualified image.

```bash
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
./scripts/deploy.sh nova-buildkit-preflight \
  | tee "$EVIDENCE_DIR/registry-buildkit-recovery.txt"
registry_restore_pending=0
trap - EXIT HUP INT TERM
```

Cleanup is the asserted restoration of the captured selector and deletion only
of the preflight's disposable source workspace, which the maintained command
owns. If the shell exits early, the trap attempts the same exact rollback; its
failure is an incident requiring immediate manual restoration through the
independent administration route. Do not delete registry blobs or BuildKit
cache as incident cleanup.

### Tailscale Authentication Rejected: EXEC-FAIL-TAILSCALE

Precondition: the official operator is ready, `IngressClass/tailscale` exists,
the digest-pinned probe image is pullable, the secure OAuth source file is
available, and the healthy production preflight passes. Existing routes may
continue on already-issued device state, so the failure check must allocate a
new fixture route; inspecting an old route is not the intended fault.

```bash
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
  kubectl -n "$TAILSCALE_OPERATOR_NAMESPACE" get secret/operator-oauth -o json \
    | node --input-type=module -e '
const crypto = require("node:crypto");
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
    tailscale_secret_fingerprints > "$EVIDENCE_DIR/tailscale-secret-fingerprints-restored.json"
    if ! cmp -s "$EVIDENCE_DIR/tailscale-authority-fingerprints.json" \
      "$EVIDENCE_DIR/tailscale-secret-fingerprints-restored.json"; then
      kubectl -n "$TAILSCALE_OPERATOR_NAMESPACE" create secret generic operator-oauth \
        --from-env-file="$TAILSCALE_OAUTH_ENV_FILE" \
        --dry-run=client -o yaml | kubectl apply -f -
      kubectl -n "$TAILSCALE_OPERATOR_NAMESPACE" rollout restart deployment \
        -l app.kubernetes.io/instance=tailscale-operator
    fi
    kubectl -n "$TAILSCALE_OPERATOR_NAMESPACE" rollout status deployment \
      -l app.kubernetes.io/instance=tailscale-operator --timeout=180s
    kubectl get ingressclass tailscale
    tailscale_secret_fingerprints > "$EVIDENCE_DIR/tailscale-secret-fingerprints-restored.json"
    diff -u "$EVIDENCE_DIR/tailscale-authority-fingerprints.json" \
      "$EVIDENCE_DIR/tailscale-secret-fingerprints-restored.json"
  fi
}
trap 'restore_tailscale_oauth' EXIT
trap 'exit 130' HUP INT TERM
kubectl -n "$TAILSCALE_OPERATOR_NAMESPACE" create secret generic operator-oauth \
  --from-literal=client_id=invalid-acceptance-client \
  --from-literal=client_secret=invalid-acceptance-secret \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n "$TAILSCALE_OPERATOR_NAMESPACE" rollout restart deployment \
  -l app.kubernetes.io/instance=tailscale-operator
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

Restore the Secret from its external authority without printing its contents,
restart the operator, then remove only the failed fixture recorded above. The
cleanup uses Kubernetes UID and resource-version preconditions. It stops if a
lease with the captured name has a different UID, or if the namespace does not
carry all three ownership labels for that lease. It then waits for both exact
objects to be absent and writes the cleanup result before the rollback trap can
be disarmed. A same-name replacement is never a cleanup target.

```bash
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
node - "http://127.0.0.1:$tailscale_proxy_port" "$NAMESPACE" \
  "$EVIDENCE_DIR/tailscale-new-lease.json" \
  "$EVIDENCE_DIR/tailscale-fault-cleanup.json" <<'NODE'
const fs = require('node:fs');
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

### LiteLLM Upstream Timeout: EXEC-FAIL-LITELLM

This exercise requires the secured Cilium profile. The temporary
`CiliumNetworkPolicy` denies only world egress from the LiteLLM Pod; cluster
egress to its PostgreSQL remains available. A different CNI must use its
maintained equivalent deny-and-restore command and demonstrate the same narrow
boundary. First prove gateway readiness and a real embedding.

```bash
kubectl -n "$NAMESPACE" rollout status deployment/litellm --timeout=120s
kubectl -n "$NAMESPACE" exec deployment/agent-nova -c kubeclaw -- node -e '
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
  kubectl -n "$NAMESPACE" exec deployment/agent-nova -c kubeclaw -- node -e '
const endpoint = new URL("/health/readiness", process.env.LITELLM_URL);
const r = await fetch(endpoint, { signal: AbortSignal.timeout(5000) });
if (!r.ok) process.exit(1);
console.log(JSON.stringify({ endpoint: endpoint.pathname, status: r.status, ready: true }));
'
}
litellm_pod_identity() {
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
  if [ "${litellm_policy_restore_pending:-0}" -eq 1 ]; then
    kubectl -n "$NAMESPACE" delete ciliumnetworkpolicy \
      acceptance-litellm-upstream-timeout --ignore-not-found --wait=true
    test -z "$(kubectl -n "$NAMESPACE" get ciliumnetworkpolicy \
      acceptance-litellm-upstream-timeout --ignore-not-found -o name)"
    kubectl -n "$NAMESPACE" exec deployment/agent-nova -c kubeclaw -- node -e '
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
kubectl create -f - <<EOF
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
kubectl -n "$NAMESPACE" rollout status deployment/litellm --timeout=120s
litellm_workload_ready > "$EVIDENCE_DIR/litellm-workload-ready-during-fault.json"
litellm_readiness_probe > "$EVIDENCE_DIR/litellm-readiness-during-fault-before.json"
litellm_pod_identity > "$EVIDENCE_DIR/litellm-pods-during-fault-before.json"
set +e
kubectl -n "$NAMESPACE" exec deployment/agent-nova -c kubeclaw -- node -e '
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
Cilium policy, consumer operation, and bounded classification. The repository
does not define OpenClaw's inner retry count, so do not claim a particular retry
mapping from Pod logs. The safe decision is to keep the model-backed operation
incomplete and stop at its owner deadline; never expose credentials or loop on
the failure.

Delete only the named denial policy, confirm its absence, and repeat one real
embedding from the end consumer. Gateway readiness alone is not recovery.

```bash
restore_litellm_policy
kubectl -n "$NAMESPACE" exec deployment/agent-nova -c kubeclaw -- node -e '
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

### Git Revision Unavailable: EXEC-FAIL-GIT

Use a disposable registered `nova-project.v2` project whose repository and
immutable release ref are owned by the acceptance operator. Its compact Buster
plan must finish without another human wait so this exercise can distinguish
the Git failure from later behavior. Do not rewrite a production ref or edit
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
npm --silent run pipeline -- \
  --platform "$PLATFORM_FILE" \
  --audit "$GIT_FAULT_RUN_ID" \
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
npm --silent run pipeline -- \
  --platform "$PLATFORM_FILE" \
  --audit "$GIT_SUCCESS_RUN_ID" \
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
const decisions = requests.map(request => audit.events.find(event =>
  event.type === 'effect.completed' && event.identity?.effectId === request.identity?.effectId)?.payload?.result)
  .filter(result => result?.schemaVersion === 'test-gate-decision.v2'
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
Check context, namespace, CSI, SPIRE, SVID, Envoy, Service, policy, allowlist, and signing keys.

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

Use [Configure and Operate](operate.md) for supported run recovery.
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
