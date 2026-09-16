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

Use [Observability Retention](../../operations/observability-retention.md) for supported narrow compaction paths.
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

## Prism Diagnosis

Check in this order:

1. `prism-postgresql` readiness and database connection.
2. `prism-control` readiness and logs.
3. `prism-worker` readiness and operation journal.
4. Artifact PVC availability and object digest.
5. `agent-prism` gateway status.
6. Studio Service or Ingress access.
7. Tailnet authorization for external access.

Use [Prism Database Transitions](../../operations/prism-database-transitions.md) for migration failures.
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
