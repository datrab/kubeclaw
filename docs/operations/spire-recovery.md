# SPIRE state, backup and recovery

Applies to release `spire`, namespace `spire-server`, chart `spire` 0.30.0 and
`my-values/infra/spire-values.yaml`. This procedure has been checked against a
local render on 2026-09-21. No snapshot, restore, timed rotation or outage has
been executed in a cluster. Use the [Worker Trust runbook](worker-trust-runbook.md)
for deployment and identity acceptance; changes below require an authorized
maintenance window and independent cluster access.

## Effective configuration

The chart was fetched from `https://spiffe.github.io/helm-charts-hardened/` with
archive SHA-256 `8e133a142915f4938328e2524f6262607e41f61e06f15cb06dc3d94f018be341`.
The umbrella chart's `appVersion` is 1.14.5, but its bundled server and agent
render image tags **1.15.2**. Read the rendered image and the running image ID,
not only Helm's app-version column. This discrepancy does not establish that an
upstream archive changed: no earlier archive digest was recorded.

| Component/state | Effective value and recovery significance |
| --- | --- |
| Server | StatefulSet `spire-server` in `spire-server`, one replica; SQLite is not a multi-server HA datastore |
| Persistent state | Claim template `spire-data`, expected claim `spire-data-spire-server-0`; RWO, 1Gi, no explicit storageClassName (cluster default applies); mounted at `/run/spire/data` |
| Database | SQL plugin, SQLite `/run/spire/data/datastore.sqlite3`; preserve entire directory including any SQLite sidecars, not a live copy of the main file |
| Signing keys | Disk KeyManager `/run/spire/data/keys.json` on the same PVC; private material, not a Kubernetes Secret in this render |
| CA | No UpstreamAuthority plugin; local CA, RSA-2048, configured CA TTL 24h; subject and trust domain `kubeclaw.internal` |
| Workload SVID | Default X.509 TTL 4h; rendered default ClusterSPIFFEID has no TTL override; JWT SVIDs disabled (the otherwise rendered 1h JWT default is inactive) |
| Public bundle | Server publishes `spire-system/spire-bundle`, key `bundle.spiffe`; agent mounts this at `/run/spire/bundle/bundle.spiffe`; public trust data alone cannot restore signing capability |
| Agent | DaemonSet `spire-agent` in `spire-system`; `/var/lib/spire` is emptyDir, KeyManager is memory; restarting loses ephemeral agent state and requires re-attestation |
| Bootstrap | k8s_psat cluster `kubeclaw-cluster2`, audience `spire-server`, allowed agent SA `spire-system:spire-agent`; rebootstrap mode `always`, delay `10m`; requires working Kubernetes token validation and server connectivity |
| Host boundary | Agent hostNetwork true; CSI has a privileged driver and hostPath mounts. Restore server data does not repair node sockets, CSI or kubelet connectivity |
| Ownership | Server container runs UID/GID 1000 with fsGroup 1000; preserve compatible volume ownership/permissions during restore |
| Resources | Rendered server and controller resources are empty; this document provides no capacity or recovery-time guarantee |

Neither `agent_ttl` nor `availability_target` is set in the rendered ConfigMaps.
For SPIRE 1.15.2, the agent SVID TTL therefore inherits the configured 4h
`default_x509_svid_ttl` ([server reference](https://github.com/spiffe/spire/blob/v1.15.2/doc/spire_server.md#server-configuration-file)).
The default renewal strategy rotates agent and workload X.509-SVIDs at roughly
half their lifetime; this setting does not govern JWT-SVIDs
([agent reference](https://github.com/spiffe/spire/blob/v1.15.2/doc/spire_agent.md#availability-target)).
For a full 4h SVID this means renewal is normally attempted around 2h, not that a
replacement is guaranteed then. Envoy consumes certificate/bundle updates through SDS.
The 4h default is a requested lifetime, **not** a promise of four hours of outage
tolerance: current certificates have already aged, CA validity and registration
settings affect issuance, clocks matter, and new agents/workloads may need the
server immediately. The `10m` rebootstrap delay is not a recovery deadline.
Record actual serials, `notBefore`/`notAfter` and subsequent replacement times.
Do not infer a successful renewal from a pod remaining Ready.

## Peer and connection conditions

Workload identities have form
`spiffe://kubeclaw.internal/ns/<namespace>/sa/<service-account>` and require the
`kubeclaw.dev/worker-trust=true` pod label. The default identity selector excludes
`spire-server` and `spire-system`. Worker Trust templates require client
certificates, validate the trust bundle and match explicit URI SAN identities;
application checks also require the authenticated loopback proxy identity.
Inspect the rendered per-route allowlists when namespaces or service accounts
change. Sharing a trust domain does not authorize every peer.

A new full TLS handshake needs valid certificates, the right trust bundle and
matching peer identity on both ends. Existing TLS connections need not close
when a certificate expires or its issuer disappears from a later bundle. TLS
session resumption and connection pools must be measured separately; a new HTTP
request is not proof of a new full handshake. This deployment has no documented
immediate revocation or universal connection-eviction mechanism. For incident
containment, explicitly stop admissions and coordinate connection draining or
isolation through the incident procedure, then verify both fresh handshakes and
pre-existing sessions. Do not remove certificate validation or switch to HTTP.

## Prepare a recoverable backup

Before a maintenance window, record the context, Git revision, exact chart digest,
Helm values/revision, running image IDs, server claim/PV UID, storage class and
snapshot implementation. Discover the actual storage objects; never assume the
expected claim name establishes the backing disk:

```bash
kubectl -n spire-server get statefulset spire-server -o wide
kubectl -n spire-server get pod spire-server-0 \
  -o jsonpath='{range .spec.volumes[*]}{.name}{" "}{.persistentVolumeClaim.claimName}{"\n"}{end}'
kubectl -n spire-server get pvc spire-data-spire-server-0 -o wide
kubectl -n spire-server get configmap spire-server
kubectl -n spire-system get configmap spire-agent spire-bundle
```

Keep an access-controlled backup manifest containing protected object references
for the encrypted whole-volume snapshot/archive, encryption-key version, restore
credentials and independent copy. Preserve values, registration resources
(including ClusterSPIFFEIDs and any manually managed entries), RBAC and relevant
cluster identity configuration. Snapshot contents include CA private keys and
must never enter Git, ordinary logs or a support attachment. Store hashes and
snapshot IDs in evidence, not secret bytes. Test decrypt/read access from the
recovery environment without relying on the failed cluster's only credentials.

Use a **cold whole-volume backup** for this SQLite/disk-key configuration:

1. Pause new protected jobs and infrastructure reconciliation that could undo
   maintenance scaling. Record and drain active work as the maintenance plan
   requires. Existing sessions are not automatically terminated by this pause.
2. Record the desired replica count (normally one). With approved authority,
   scale `statefulset/spire-server` to zero in `spire-server`. Wait for
   `spire-server-0` to terminate and verify that no pod/process mounts or writes
   the backing volume. The colocated controller stops with that pod. A failed
   termination or unknown writer invalidates the cold boundary: stop here.
3. Through the actual storage provider, snapshot the entire backing volume or
   take a complete filesystem archive while it remains unmounted/quiescent.
   Preserve database, keys, directory contents and ownership together. Do not
   mix a database dump from one time with `keys.json` from another. A live
   filesystem copy or uncoordinated SQLite-only backup is not this procedure.
4. Wait for provider completion; copy/export to independent protected storage,
   verify integrity and record the snapshot boundary and key references.
   A snapshot on the only failed node is not disaster recovery.
5. Restore the recorded replica count, wait for server/agent readiness and run
   identity acceptance. Resume admissions only after expected peers succeed and
   wrong identities remain rejected. Record the interruption actually observed.

The repository does not provide a storage-provider snapshot command. Select and
validate that command for the discovered PV **before** stopping the server.
Missing snapshot/restore capability or missing decrypt authority is a failed
preflight, not permission to use a crash-inconsistent copy.

## Restore the server and CA together

1. Identify the failure and preserve the failed volume read-only where possible.
   Stop reconciliation and the server writer as above. Do not run a second
   server against the same SQLite volume. Do not delete state for diagnosis.
2. Choose a complete, verified backup generation. Check backup age, CA validity,
   encryption-key availability and the expected lost registration/state changes
   since that boundary. Recovery from old state can roll back authorization
   changes; reconcile them before allowing work. An expired CA backup is not a
   promise of transparent continuation for existing agents.
3. Restore into an isolated recovery volume/environment using the matching chart,
   values and recorded image versions first. Never merge files into a partly
   initialized volume or restore only `keys.json`. Preserve UID/GID 1000 access.
   Do not attach the recovery server to production agents during validation.
4. Verify storage-provider integrity, SQLite integrity on the offline restored
   database with compatible tooling, and presence/readability of the disk-key
   file without printing it. Then start the isolated server; require successful
   datastore/key-manager initialization, a usable CA/bundle and readiness.
   File existence and SQLite integrity alone do not prove usable signing keys.
5. Test re-attestation, actual issuance and mutual TLS with isolated allowed and
   forbidden peers. Compare public CA fingerprints and trust domain with the
   backup manifest. If keys and database do not form a usable generation, stop;
   do not silently accept fresh unrelated trust as a successful restore.
6. In the approved cutover, keep the original writer stopped, bind the verified
   restored volume through the storage/StatefulSet recovery procedure and start
   one server. Confirm bundle publication, agent re-attestation and SDS updates.
   The exact PVC binding operation depends on the provider and must be rehearsed;
   deleting a claim is not a generic safe rebinding command.
7. Require full allowed/wrong-identity acceptance, fresh full-handshake checks,
   and the timed tests below before recording recovery as validated. Keep the
   failed original and backup protected until the rollback window ends.

## Diagnose by failed component

| Failure | Action and boundary |
| --- | --- |
| Server process/pod; volume intact | Preserve PVC; repair deployment/configuration and restart matching server. Watch database/key-manager errors, readiness and fresh issuance; agents may serve cached material for a limited, measured interval |
| Server volume or signing keys lost | Restore coherent whole-state backup above. Public bundle, Helm values or database alone cannot replace missing CA private keys |
| No usable CA backup | Treat as trust re-establishment, with a planned interruption: create replacement authority only under incident authorization, re-attest agents, distribute new bundle, reissue SVIDs and verify both sides. Do not call this restoration of the old identity authority |
| CA suspected compromised | Do not restore compromised keys to claim containment. Establish replacement trust and remove compromised trust under an incident plan; separately handle still-open/resumed connections and measure rejection |
| One node's agent or CSI | Inspect node, DaemonSet, sockets and CSI mount; repair affected component. Agent restart requires re-attestation because keys/state are ephemeral; do not delete server PVC or restart all workers blindly |
| Controller manager | Repair controller/RBAC/API connectivity and inspect registration reconciliation. Existing server records may still issue certificates; healthy server readiness does not establish correct new registrations |
| Kubernetes API/token validation | Restore that dependency through independent access. Rebootstrap requires it; restarting all agents can worsen the outage |

## Rotation and live recovery acceptance

Routine X.509 rotation uses SPIRE and SDS; do not replace the CA to force a
workload renewal. Observe public certificate metadata through the local Envoy
`127.0.0.1:9901/certs` endpoint from the workload, as the existing live script
does. Do not expose the admin listener or dump private key/configuration data.
Record old/new serials and validity windows, trust-bundle fingerprints and
request outcomes while real work is active. The existing
`npm run verify:worker-core:trust:live` checks loaded SVIDs and identity access;
it does **not** prove timed renewal, certificate-expiry failure or server restore.

Before an authorized failure exercise, define maximum acceptable interruption,
maximum allowed data/registration loss, exact affected nodes and an independent
recovery route. Record continuously:

- successful allowed traffic and forbidden-peer rejection before the fault;
- renewal during active work, including changed certificate metadata;
- server and separately agent unavailability beyond the **observed** certificate
  validity, with full new handshakes distinguished from an existing connection
  and resumed sessions;
- restart and coherent backup restore, fresh issuance and mutual authentication;
- no plaintext/fail-open route, observed time to recovery and comparison with the
  predeclared target, plus any interrupted or retried jobs.

An unexpected surviving connection is evidence about connection lifetime, not
proof that certificate validation was bypassed. An expected handshake failure
alone is not proof that all active access was revoked. Keep this live gate open
until the complete permitted exercise has raw timestamped evidence.
