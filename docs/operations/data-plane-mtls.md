# Redis and registry mTLS migration

Status: inventory and acceptance requirements only. Redis and registry traffic
has **not** been migrated by adding this document or running the inventory.
Existing worker Envoy protection does not establish protection for these services.

## Inventory from the Controlnode

```sh
cd ~/kubeclaw
git pull --ff-only
export KUBE_CONTEXT="$(kubectl config current-context)"
umask 077
python3 scripts/inspect-data-plane-mtls.py > /tmp/kubeclaw-data-plane-inventory.json
cat /tmp/kubeclaw-data-plane-inventory.json
```

The script reads workload metadata and references, including scaled-down
Deployments and CronJobs. It does not retrieve Secrets or print environment
literal values, command arguments, or annotations. Output still contains
internal service and identity names; do not publish it as a public artifact.
Failure to read an API resource aborts the inventory instead of reporting an
empty successful result.

`clientsComplete: false` is intentional. Configuration-file consumers, dynamic
jobs, BuildKit, Trivy and host containerd need a separate review. An observed
client is not automatically authorized. Only clients of this specific Redis
instance are migrated; other namespaces' independent Redis instances are not
implicitly in scope.

## Required transport boundary

Use existing SPIRE workload identities and Envoy SDS for certificate delivery.
Each service must have an explicit peer identity allowlist; membership in the
trust domain alone is insufficient. Clients also verify the exact service
identity. An empty allowlist is an error, never allow-all. Authentication and
application permissions are separate: registry push/delete and Redis command
permissions must not be inferred merely from an accepted certificate.

Redis and registry backend sockets must only be reachable inside their own Pod
network namespace. Services and any required node endpoint expose Envoy's mTLS
listener. Removing a Service port alone does not block direct Pod-IP access.
Check IPv4 and IPv6 bindings. Envoy admin interfaces remain local. Network
policies provide an additional boundary, but the rollout cannot assume Cilium
is already installed or enforcing its policies.

Local plaintext between an application and its proxy is inside the Pod/host
trust boundary. Other containers sharing that network namespace are trusted
peers. Host root, privileged Pods and principals allowed to create Pods using
an authorized ServiceAccount are outside this transport isolation guarantee.
Review these privileges before describing identity checks as isolation.

The registry migration must cover actual BuildKit pushes, manifest resolution,
Trivy scans and CRI pulls on every participating node. A SPIFFE URI SAN is not a
DNS certificate: existing HTTPS clients cannot simply be pointed at a SPIFFE
listener. The adapter design must preserve client validation, digest identity,
authorization and rotation without global insecure flags or a network HTTP
fallback. Proxies and SPIRE must bootstrap without pulling from the registry
they protect. Docker Hub mirror routing is reviewed separately.

## Cutover and acceptance

1. Record all consumers, intended permissions and current endpoint dependencies.
2. Prepare and test server and client adapters before switching production
   endpoints. Preserve Redis storage and credentials. The local registry remains
   intentionally ephemeral; a restart can invalidate active pipeline image pulls.
3. Test real clients against pinned production images in Linux. Configuration
   rendering, Pod readiness and existing worker tests are insufficient evidence.
4. Switch consumers and close direct network backend access as a coordinated
   maintenance operation. Test the complete image and Redis paths again.
5. Keep infrastructure sync manual. A rollback must not silently restore exposed
   plaintext access; stop affected workloads if secure connectivity cannot be
   restored. Record any service-specific rollback procedure before cutover.

Required proof includes:

- Allowed peers can complete Redis operations and push/scan/pull the same image
  digest through the real clients, including host containerd.
- Missing certificates, an untrusted issuer, an expired certificate, the wrong
  client identity and the wrong server identity all fail.
- Certificate and trust-bundle rotation work through SDS. Loss of SPIRE/SDS does
  not select plaintext; cached credentials must not permit new handshakes after
  expiry. Define and test bounds for already-established connections separately.
- Direct Pod-IP, Service and old NodePort plaintext paths fail from an unrelated
  Pod and the host. Test both supported IP families and declared local exceptions.
- Envoy restart, backend restart and node restart cannot open a bypass. Retries
  do not repeat non-idempotent operations without application safeguards.
- Logs, generated manifests and CI artifacts contain no credentials or private
  keys. Live evidence records versions, identities, endpoints and test results,
  not just a generic PASS.

These are acceptance requirements, not completed test results. No claim of
complete protection follows from the inventory.
