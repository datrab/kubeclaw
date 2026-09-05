# Cilium networking architecture and operations

This document is the source of truth for KubeClaw's Cilium design, policy ownership, first K3s cutover, validation and future edge architecture.

The target is intentionally simple: the central networking platform should require approximately the same amount of configuration with 10 project namespaces or 10,000.

## 1. Executive summary

The platform contract is:

```text
central platform
  Cilium CNI/dataplane
  + global workload default-deny
  + global workload DNS allow
  + Hubble
  + true cluster-wide guardrails
              |
              v
project namespace
  workload manifests
  + only project-specific explicit allow policies
```

The important properties are:

- Cilium is central infrastructure in namespace `cilium`.
- Ordinary workload namespaces are fail-closed automatically.
- Ingress and egress are denied unless explicitly allowed.
- DNS is the only generic workload egress allowance.
- Projects own their application-specific connectivity rules.
- Creating an ordinary project namespace does not require editing central Cilium configuration.
- No custom Namespace policy-profile label or admission-time policy injector is required.
- Hubble is the network evidence source for the read-only GPT Ops MCP.
- Public ingress, private operator access and fixed-source-IP egress are separate concerns.
- The first Flannel -> Cilium replacement is a controlled maintenance operation. Normal operation after that is Git/GitOps-driven.

## 2. Non-negotiable invariants

### 2.1 Fail closed for ordinary workloads

Every ordinary workload endpoint is selected by the central `dtlabs-workload-default-deny` CiliumClusterwideNetworkPolicy.

The policy uses Cilium's intrinsic Kubernetes namespace identity:

```yaml
endpointSelector:
  matchExpressions:
    - key: io.kubernetes.pod.namespace
      operator: NotIn
      values:
        - kube-system
        - cilium
        - tailscale
        - argocd
```

There is no opt-in label. A newly created application namespace is therefore covered automatically unless somebody deliberately adds it to the central platform exclusion list.

The isolation rule is explicit:

```yaml
enableDefaultDeny:
  ingress: true
  egress: true
ingress: []
egress: []
```

An empty list means no traffic is allowed by that policy. Do not replace the lists with `- {}`: an empty rule object is an unrestricted allow rule in Cilium.

Cilium policy enforcement is additive for allows. The central policy establishes the default-deny state; namespaced project policies add only the flows the application needs.

Official references:

- Cilium policy enforcement modes: https://docs.cilium.io/en/stable/security/policy/intro/
- Cilium Kubernetes/cluster-wide policy: https://docs.cilium.io/en/stable/security/policy/kubernetes/

### 2.2 DNS is the only generic application allowance

The second central policy, `dtlabs-workload-allow-dns`, allows TCP/UDP 53 only to `kube-dns` in `kube-system`.

It sets:

```yaml
enableDefaultDeny:
  ingress: false
  egress: false
```

This is deliberate. The DNS policy must not be the object that turns a workload into default-deny if the main baseline is temporarily absent during reconciliation. The separate default-deny policy owns that responsibility.

The initial baseline is L3/L4 only. It does not add a wildcard DNS L7 rule. This keeps the default datapath simple and avoids forcing every workload DNS request through L7 policy solely for baseline enforcement. Projects that later use `toFQDNs` or need DNS L7 visibility can opt into the DNS proxy semantics required by those policies.

### 2.3 Project policy is explicit allow only

A project does not own or duplicate the cluster baseline. It owns only its real communication contract.

Example:

```yaml
apiVersion: cilium.io/v2
kind: CiliumNetworkPolicy
metadata:
  name: api-to-postgres
  namespace: my-project
spec:
  endpointSelector:
    matchLabels:
      app.kubernetes.io/name: api
  egress:
    - toEndpoints:
        - matchLabels:
            app.kubernetes.io/name: postgres
      toPorts:
        - ports:
            - port: "5432"
              protocol: TCP
```

The reference pattern is `examples/cilium/project-network-policy.yaml`.

### 2.4 Central Cilium never becomes an application firewall catalogue

Do not add rules such as these to `cilium-cluster-policies.yaml`:

```text
kinea -> postgres:5432
shop -> redis:6379
prism -> nova:18082
```

Those belong to the repositories/releases that own the workloads.

Central policy is reserved for invariants that are truly cluster-wide.

## 3. Ownership model

### Platform-owned

The platform owns:

- Cilium Helm release and version
- CNI/dataplane choices
- IPAM and routing mode
- Hubble / Relay / UI
- global workload baseline
- genuine global deny/guardrail rules
- protection of platform-owned networking APIs such as Hubble Relay
- future Gateway API infrastructure
- future Egress Gateway infrastructure
- later host/network encryption controls

Current files:

```text
my-values/infra/cilium-values.yaml
my-values/infra/cilium-cluster-policies.yaml
scripts/deploy-cilium.sh
```

### Project-owned

Each project owns:

- its namespace manifest, Helm chart or Kustomize tree
- workload labels/service accounts
- ingress allows into its workloads
- egress allows from its workloads
- FQDN/L7 rules when genuinely required
- future HTTPRoute objects that expose that project through the public Gateway

KubeClaw's own example is:

```text
my-values/infra/network-policies.yaml
```

### Platform namespaces

The first migration intentionally excludes these bootstrap/control-plane namespaces from the ordinary workload baseline:

```text
kube-system
cilium
tailscale
argocd
```

This is a safety boundary for the initial CNI migration, not permission to run application workloads there.

Ordinary projects MUST NOT be added to the exclusion list to work around a missing policy. Missing connectivity must be solved with a narrow allow rule in the owning project.

Longer term, platform namespaces can receive their own individually tested fail-closed policies. They are not put under a generic application baseline during the first CNI cutover because breaking DNS, Cilium, Tailscale or Argo would also remove the recovery/control plane used to diagnose the problem.

## 4. Scaling to thousands of namespaces

Adding namespace #10,000 must look like namespace #10:

```text
create namespace
      |
      | central CCNP already selects it
      v
default-deny + DNS baseline already active
      |
      v
deploy workload + project-specific allows
```

Central Cilium changes required:

```text
0
```

This avoids:

- one central policy object per project
- one central namespace allow-list per project
- custom namespace profile labels
- an admission/injection controller whose only purpose is creating baseline policy
- duplicated default-deny/DNS manifests in every project

### Identity cardinality

Cilium is identity-based. High namespace count by itself is not the only scaling concern; high-cardinality identity-relevant labels are more important.

Use stable selectors such as:

- intrinsic namespace identity
- `app.kubernetes.io/name`
- `app.kubernetes.io/component`
- Cilium service-account identity when a stronger boundary is useful

Avoid using volatile labels for policy identity:

- commit SHA
- build ID
- timestamp
- random deployment/run UUID
- pod-template hash

Cilium documents identity-relevant label filtering specifically for large environments:
https://docs.cilium.io/en/stable/operations/performance/scalability/identity-relevant-labels/

Do not add a custom Cilium `labels`/identity filter in the first migration. Establish real cardinality/observability data first, then tune deliberately if needed.

## 5. Namespace labels: what we do and do not use

We do **not** use a custom namespace label such as:

```text
platform.dtlabs.ch/network-profile=restricted
```

to activate the baseline.

The global baseline uses Cilium's intrinsic `io.kubernetes.pod.namespace` identity, which already exists for Kubernetes endpoints.

Namespace labels may still be valid security identities when they represent an actual ownership fact that already exists for another reason. KubeClaw has one deliberate example: short-lived namespaces created by the Buster namespace controller carry:

```text
kubeclaw/managed-by=buster-namespace-controller
```

The Nova -> Prism trust policy uses the corresponding Cilium namespace-label identity only to preserve that existing controller-owned trust boundary. It is not a general platform policy profile.

Cilium's supported namespace-label form in `fromEndpoints` / `toEndpoints` is:

```text
io.cilium.k8s.namespace.labels.<label-key>
```

Reference: https://docs.cilium.io/en/stable/security/policy/kubernetes/

## 6. Cross-namespace trust rules

Never rely only on spoofable workload labels for a sensitive cross-namespace rule.

Bad:

```yaml
toEndpoints:
  - matchLabels:
      app.kubernetes.io/name: kubeclaw
      app.kubernetes.io/component: prism
```

An unrelated namespace could deploy those same pod labels.

Prefer one or more stronger boundaries:

- explicit namespace identity for a known permanent namespace
- namespace ownership label maintained by a trusted controller
- service account identity
- cluster identity when ClusterMesh is introduced later

KubeClaw Nova -> Prism therefore distinguishes:

1. permanent Prism in namespace `kubeclaw`;
2. temporary Prism only in namespaces carrying Buster's trusted controller-ownership label.

## 7. Cilium policy types

Cilium can enforce multiple policy APIs at the same time.

### CiliumClusterwideNetworkPolicy

Use for true platform-wide invariants:

- workload baseline
- Cilium health
- future hard-deny management ranges
- future cloud metadata protections

Only the platform should be allowed to create or modify CCNP objects.

### CiliumNetworkPolicy

Preferred for project rules that need Cilium-specific functionality:

- identity entities such as `kube-apiserver`
- FQDN egress
- L7 rules
- richer cross-namespace identities

CNP is namespaced, which gives the desired ownership boundary.

### Kubernetes NetworkPolicy

Keep it when the portable Kubernetes API expresses the contract correctly.

Cilium enforces Kubernetes NetworkPolicy too. KubeClaw deliberately keeps these dynamic/chart-owned paths portable:

- `charts/prism/templates/networkpolicy.yaml`
- NetworkPolicies generated by `cmd/buster-namespace-controller/main.go`

They do not require a central Cilium edit.

## 8. Policy governance

The intended enterprise permission model is:

```text
platform automation/service account
  can manage CiliumClusterwideNetworkPolicy

project automation/service account
  can manage CiliumNetworkPolicy only in its own namespace
  cannot manage cluster-wide policy
```

The first repository bootstrap does not need a separate Kyverno/Gatekeeper deployment simply to achieve this model. Kubernetes RBAC should be the first control.

Later, native ValidatingAdmissionPolicy or another admission-policy engine can be added for policy-quality rules such as rejecting obviously dangerous project allows. Add that only when there is a concrete governance requirement.

## 9. Initial dataplane configuration

The first rollout deliberately minimizes simultaneous changes:

```text
Cilium:                  1.20.1 (pinned)
namespace:               cilium
routing:                 VXLAN tunnel
IPAM:                    cluster-pool
pod CIDR:                10.42.0.0/16
per-node allocation:     /24
kube-proxy:              retained
kubeProxyReplacement:    false
policyEnforcementMode:   default
Hubble:                  enabled
Hubble Relay:            enabled, ClusterIP
Hubble UI:               enabled, ClusterIP
Gateway API:             not enabled in this cutover
```

The Helm values are in `my-values/infra/cilium-values.yaml`.

`namespaceOverride: cilium` intentionally keeps the Cilium platform in its own namespace rather than the common `kube-system` installation layout.

## 10. Hubble + GPT Ops

Hubble is the network-evidence layer for the read-only KubeClaw Ops MCP.

```text
ChatGPT
   |
   | OpenAI Secure MCP Tunnel
   v
KubeClaw Ops MCP
   |----------------------> Argo CD Applications
   |----------------------> Kubernetes API
   |
   +---- bounded query ---> Hubble Relay :4245
                                |
                                v
                         Cilium / eBPF flows
```

There is deliberately no extra flow collector or persistent Hubble database in this path.

The MCP image contains the Hubble CLI copied from the same pinned Cilium image family. The image build validates that the binary executes.

`get_hubble_flows` is bounded:

- namespace-scoped by default
- optional pod/verdict filters
- bounded time range
- maximum 50 returned flows
- subprocess timeout
- 2 MiB raw-output ceiling
- endpoint label sets removed from the ChatGPT response
- compact facts only: namespace/pod, IP, L4, verdict, drop reason, direction, node and summary

This is intentional for both security and scale. GPT Ops should request evidence, not ingest the cluster's entire flow history.

### Expected troubleshooting order

For a question such as:

```text
Why can Prism not reach PostgreSQL?
```

GPT Ops should normally inspect:

1. Argo desired/sync/health state;
2. Kubernetes workload readiness;
3. Kubernetes events;
4. Hubble drops/flows;
5. bounded application logs only when needed.

This makes policy failures distinguishable from scheduling, image, probe and application failures.

### Hubble Relay security

Hubble Relay is private ClusterIP and its client-facing gRPC port is not a public API.

`hubble-relay-consumers` allows TCP/4245 only from:

- `ops-mcp` in `kubeclaw`;
- Hubble UI in `cilium`;
- host/remote-node traffic needed for platform health.

The GPT MCP remains read-only and does not get Kubernetes Secrets, exec, patch, update or delete permissions.

### Manual Hubble access

UI:

```bash
kubectl -n cilium port-forward svc/hubble-ui 12000:80
```

CLI from the Cilium agent:

```bash
kubectl -n cilium exec ds/cilium -c cilium-agent -- \
  hubble observe --since 3m --verdict DROPPED
```

Useful checks:

```bash
kubectl -n cilium get pods
kubectl -n cilium get svc hubble-relay hubble-ui
kubectl get ciliumclusterwidenetworkpolicies
kubectl get ciliumnetworkpolicies -A
```

## 11. First K3s / Flannel -> Cilium cutover

This section applies only to the first CNI replacement. It is not the normal deployment workflow after Cilium is established.

### Important terminology

The default K3s configuration path is:

```text
/etc/rancher/k3s/config.yaml
```

That directory name is part of K3s itself. Using this file does **not** mean Rancher Manager is installed or required.

K3s also supports another config path via `--config` / `K3S_CONFIG_FILE`, so inspect the running service before editing anything.

Official K3s configuration reference:
https://docs.k3s.io/installation/configuration

### Why host access is required once

K3s normally starts Flannel and its own kube-router-derived network-policy controller. Cilium is replacing those pieces, so Kubernetes manifests alone cannot safely perform the entire first transition.

Official K3s custom-CNI guidance requires/recommends:

```text
--flannel-backend=none
--disable-network-policy
```

Reference: https://docs.k3s.io/networking/basic-network-options

### Preflight: do this while at the host

Before changing K3s:

```bash
kubectl get nodes -o wide
kubectl get pods -A -o wide
kubectl get networkpolicy -A
kubectl get svc -A
```

Confirm the cluster is still single-node. `scripts/deploy-cilium.sh` also refuses the initial replacement when it sees more than one node.

Inspect how K3s is actually launched:

```bash
systemctl cat k3s
ps aux | grep '[k]3s server'
```

Inspect the default config only if that is the active configuration source:

```bash
sudo test -f /etc/rancher/k3s/config.yaml && \
  sudo cat /etc/rancher/k3s/config.yaml
```

Back it up before editing:

```bash
sudo cp /etc/rancher/k3s/config.yaml \
  /etc/rancher/k3s/config.yaml.pre-cilium
```

If the file does not exist or a custom config path is used, do not create/edit the default path blindly; update the actual K3s configuration source instead.

### Required K3s configuration

The effective K3s server configuration must include:

```yaml
flannel-backend: none
disable-network-policy: true
```

Keep kube-proxy enabled for this first Cilium release. Do not add `disable-kube-proxy` yet.

### Old kube-router policy rules

K3s documents an important migration detail: disabling its network-policy controller does **not** remove already-programmed kube-router iptables policy rules.

After disabling the controller, stale `KUBE-ROUTER` rules must be removed on every node. K3s documents either `k3s-killall.sh` or targeted iptables cleanup.

For this controlled migration, inspect the rules first:

```bash
sudo iptables-save | grep KUBE-ROUTER
sudo ip6tables-save | grep KUBE-ROUTER
```

The documented targeted cleanup is:

```bash
sudo sh -c 'iptables-save | grep -v KUBE-ROUTER | iptables-restore'
sudo sh -c 'ip6tables-save | grep -v KUBE-ROUTER | ip6tables-restore'
```

Reference: https://docs.k3s.io/networking/networking-services

Do this as part of the maintenance procedure, not casually from a remote session without recovery access.

### First install sequence

The exact host steps must be confirmed against the actual machine before execution, but the intended sequence is:

1. Maintenance window and working SSH/console recovery access.
2. Verify current K3s config/service arguments.
3. Back up the effective K3s config.
4. Configure `flannel-backend: none` and `disable-network-policy: true`.
5. Restart K3s.
6. Remove stale KUBE-ROUTER policy rules as documented by K3s.
7. From the checked-out Cilium PR branch, run:

```bash
CILIUM_K3S_READY=true ./scripts/deploy-cilium.sh
```

8. Reboot/recycle the node so Pods with old Flannel sandboxes are recreated using Cilium.
9. After the node is reachable, run:

```bash
./scripts/deploy-cilium.sh
```

10. Verify the dataplane and application traffic before migrating policy objects.

Existing Pods do not magically change CNI in-place; their Pod sandbox must be recreated.

### Why the script has safety gates

First install requires:

```text
CILIUM_K3S_READY=true
```

The policy migration requires:

```text
CILIUM_DATAPLANE_VERIFIED=true
```

These are deliberate human gates around a disruptive one-time infrastructure transition.

The initial script also refuses the replacement if the cluster has more than one node. A future multi-node cluster requires Cilium's controlled migration procedure instead of this same-CIDR single-node shortcut.

## 12. Dataplane verification before policy cutover

Do not infer health from `Running` alone.

Minimum checks:

```bash
kubectl get nodes
kubectl -n cilium get pods -o wide
kubectl -n cilium rollout status daemonset/cilium
kubectl -n cilium rollout status deployment/cilium-operator
kubectl -n cilium rollout status deployment/hubble-relay
kubectl get pods -A -o wide
```

Inspect Cilium endpoint health/policy state:

```bash
kubectl -n cilium exec ds/cilium -c cilium-agent -- cilium-dbg status
kubectl -n cilium exec ds/cilium -c cilium-agent -- cilium-dbg endpoint list
```

Check Hubble for unexpected drops while exercising important application paths:

```bash
kubectl -n cilium exec ds/cilium -c cilium-agent -- \
  hubble observe --since 5m --verdict DROPPED
```

Verify at minimum the current critical flows relevant to KubeClaw:

- Kubernetes DNS
- Redis
- Qdrant
- LiteLLM
- PostgreSQL
- registry-local / registry-mirror
- Nova <-> Buster gates
- Nova -> trusted Prism endpoint
- Ops MCP -> Kubernetes API
- Ops MCP -> Hubble Relay
- Ops tunnel -> Ops MCP and OpenAI tunnel control plane

Only after those checks should `CILIUM_DATAPLANE_VERIFIED=true` be asserted.

## 13. NetworkPolicy -> Cilium policy migration

Apply the KubeClaw explicit allow policies:

```bash
CILIUM_DATAPLANE_VERIFIED=true \
  ./scripts/migrate-kubeclaw-network-policies-to-cilium.sh apply
```

The migration script first verifies that both central baseline CCNPs exist:

```text
dtlabs-workload-default-deny
dtlabs-workload-allow-dns
```

Then it applies the namespaced KubeClaw allow rules.

Inspect:

```bash
kubectl get ciliumclusterwidenetworkpolicies
kubectl -n kubeclaw get ciliumnetworkpolicies
kubectl -n cilium exec ds/cilium -c cilium-agent -- cilium-dbg policy get
```

Exercise real traffic and inspect Hubble.

Only then clean up superseded static Kubernetes NetworkPolicy objects:

```bash
CILIUM_DATAPLANE_VERIFIED=true \
  ./scripts/migrate-kubeclaw-network-policies-to-cilium.sh cleanup
```

Cleanup is fail-closed: it verifies the central baseline and every expected namespaced Cilium replacement before deleting any superseded static NetworkPolicy.

Dynamic/chart-owned NetworkPolicy objects are intentionally not removed.

## 14. Project onboarding after migration

A normal new project does not use the Cilium bootstrap scripts.

Its GitOps tree should conceptually contain:

```text
project/
  namespace.yaml
  deployment.yaml
  service.yaml
  network/
    app-ingress.yaml
    database-egress.yaml
    external-api-egress.yaml   # only if needed
```

No project baseline manifest is required. Once the namespace exists, the central fail-closed CCNP already applies.

Recommended rollout order for a new app:

1. namespace;
2. explicit network policies;
3. workloads/services.

Argo sync waves or equivalent ordering can make that deterministic. Even if a workload appears before its project allows, the result is fail-closed rather than accidentally open.

## 15. Policy authoring rules

### Prefer identity over IP

Prefer:

```text
app A -> app B -> TCP/5432
```

over hard-coded Pod IPs.

Pod IPs are ephemeral; Cilium identities survive rescheduling when stable labels remain the same.

### Cross-namespace means explicit namespace/trust identity

For a permanent dependency, include the namespace identity. For controller-created ephemeral namespaces, use a controller-owned trust marker or dedicated service account when appropriate.

### Internet access is not a baseline

Do not give every project `world:443` centrally.

A project that genuinely needs Internet/API access declares it explicitly. Prefer FQDN policy later when the destination is a stable hostname and the operational trade-off is justified.

### Use the lowest layer that solves the requirement

Default choice:

```text
L3/L4 identity + port
```

Use L7 HTTP/DNS rules only when the security requirement needs them. L7 enforcement introduces proxying and more policy complexity; it should not be enabled merely because Cilium supports it.

### Deny rules are global guardrails, not project workarounds

Cilium deny rules take precedence over allow policies. They are useful later for immutable platform restrictions such as management ranges or metadata endpoints.

Use them sparingly and centrally because a deny can override otherwise valid project connectivity.

Reference: https://docs.cilium.io/en/stable/security/policy/deny/

## 16. Observability without creating a logging problem

Hubble is a queryable network-observability plane, not automatically a requirement to persist every flow forever.

Current strategy:

```text
Hubble retains/streams operational flow data
        |
        +--> Hubble UI for humans
        |
        `--> bounded GPT Ops queries on demand
```

Do not export all endpoint labelsets and all flows through Vector by default.

If long-term flow retention is introduced later, define explicit:

- retention duration
- sampling/filtering
- label allow-list
- storage budget
- tenant/project boundaries

before enabling a broad exporter.

## 17. Future private platform entrypoint

Private operational surfaces remain Tailscale-only.

Target examples:

```text
platform.dtlabs.ch  -> private platform entrypoint
prism.dtlabs.ch     -> private Prism/operator surface
Argo                -> private
Hubble              -> private
```

`platform.dtlabs.ch` is a DNS/access name, **not** a Cilium namespace-profile label.

For a custom TLS certificate on a Tailscale-only hostname, DNS-01 is the preferred ACME pattern because the service does not have to become publicly reachable merely for certificate validation.

Certificate lifecycle/cert-manager is a separate platform concern and should be implemented in its own change.

## 18. Future public inbound: Cilium Gateway API

Public products should eventually enter through Cilium Gateway API / Envoy:

```text
Internet
   |
Cilium Gateway
   |-- dtlabs.ch ----------------------> DT Labs website
   |-- shop.pferdevilla-kunterbunt.de -> webshop
   |-- app.example --------------------> future SaaS
   `-- path/host routes ---------------> project Services
```

Projects should own their `HTTPRoute` objects; the platform owns the Gateway/listener infrastructure and public trust boundary.

Do not enable this during the first CNI migration. Kube-proxy replacement and Gateway API are separate, observable changes after the base dataplane is stable.

## 19. Future outbound: Cilium Egress Gateway

Egress Gateway solves the opposite direction:

```text
project pods
     |
     v
Cilium Egress Gateway
     |
     | stable public source IP
     v
external SaaS / partner API
```

This is valuable when an external provider requires source-IP allowlisting.

It does not publish `dtlabs.ch` or other inbound services.

## 20. Future platform features, intentionally deferred

Candidates after the initial Cilium migration is stable:

- kube-proxy replacement
- Cilium Gateway API
- Egress Gateway
- FQDN egress policies where useful
- host firewall, starting in audit mode
- transparent node-to-node encryption for multi-node deployments
- ClusterMesh if multiple clusters become necessary
- identity-relevant label tuning based on measured cardinality
- Prometheus/Grafana Cilium/Hubble metrics
- project RBAC/admission policy hardening

Each should be a separate change with a measurable reason and rollback boundary.

## 21. Rollback principles

Before the first cutover:

- preserve the current K3s config;
- preserve current Kubernetes policy manifests;
- keep direct host recovery access;
- know how K3s is actually launched;
- do not remove Flannel configuration until the maintenance window begins.

Do not use `k3s-killall.sh` casually after Cilium is installed. K3s explicitly warns that Cilium interfaces/rules need special cleanup before stopping/uninstalling K3s with that script, otherwise host connectivity can be lost.

Reference: https://docs.k3s.io/networking/basic-network-options

A detailed command-by-command rollback should be chosen after inspecting the actual host configuration at cutover time. Do not invent a rollback procedure based on an assumed K3s install layout.

## 22. Post-migration normal operating model

After the one-time CNI migration, ordinary operations should not require logging into the host.

```text
GitHub
  |
  v
Argo CD
  |
  v
Kubernetes desired state
  |
  +--> project workload
  +--> project CiliumNetworkPolicy
  `--> platform changes when intentionally approved

Hubble + Kubernetes + Argo
  |
  v
GPT Ops troubleshooting
```

Expected host-touch cases become exceptional:

- K3s/node OS maintenance
- kernel/network failure
- CNI-level disaster recovery
- storage/hardware issues
- major cluster topology changes

Application deploys and normal network-policy changes remain GitOps operations.

## 23. Change ownership cheat sheet

| Change | Owner/location |
| --- | --- |
| New project namespace | project GitOps |
| App A may call App B | project CNP |
| App may call external API | project CNP/FQDN policy |
| Global default-deny behavior | central Cilium policy |
| Global DNS baseline | central Cilium policy |
| Hubble Relay protection | central Cilium policy |
| Cilium version/IPAM/routing | central Cilium values |
| Public listener/IP | platform Gateway |
| `dtlabs.ch` route to website | DT Labs HTTPRoute/project |
| Private `platform.dtlabs.ch` | Tailscale/platform access |
| Stable outbound public IP | Egress Gateway/platform + project selection |
| Temporary Buster namespace ownership | Buster namespace controller |

## 24. Definition of done for the first Cilium migration

The migration is complete only when all of the following are true:

- Cilium `1.20.1` is installed and healthy in `cilium`.
- The node is Ready after old Flannel Pod sandboxes have been recycled.
- The K3s built-in network-policy controller is disabled.
- Stale KUBE-ROUTER network-policy iptables rules are no longer enforcing old policy.
- `dtlabs-workload-default-deny` exists.
- `dtlabs-workload-allow-dns` exists.
- KubeClaw explicit Cilium allow policies exist.
- Superseded static KubeClaw Kubernetes NetworkPolicies have been removed only after replacement verification.
- Dynamic Prism/Buster Kubernetes NetworkPolicies continue to work under Cilium enforcement.
- DNS and all listed critical application flows are verified.
- Hubble Relay/UI are healthy and private.
- GPT Ops can retrieve bounded Hubble flows through the read-only MCP path.
- No unexpected sustained Hubble drops remain for required traffic.
- Argo/Tailscale recovery paths remain reachable.
- The PR is merged only after the actual target cluster cutover is verified.

## 25. Upstream references

Primary references for this design:

- Cilium 1.20.1 policy enforcement: https://docs.cilium.io/en/stable/security/policy/intro/
- Cilium Kubernetes constructs / namespaces / CCNP: https://docs.cilium.io/en/stable/security/policy/kubernetes/
- Cilium Kubernetes policy API overview: https://docs.cilium.io/en/stable/network/kubernetes/policy/
- Cilium deny policies: https://docs.cilium.io/en/stable/security/policy/deny/
- Cilium identity-relevant label scalability: https://docs.cilium.io/en/stable/operations/performance/scalability/identity-relevant-labels/
- Cilium L7 visibility: https://docs.cilium.io/en/stable/observability/visibility/
- Cilium Helm values: https://docs.cilium.io/en/stable/helm-values/
- K3s configuration: https://docs.k3s.io/installation/configuration
- K3s custom CNI / Flannel replacement: https://docs.k3s.io/networking/basic-network-options
- K3s embedded network-policy controller cleanup: https://docs.k3s.io/networking/networking-services

## 26. Final rule of thumb

```text
If it changes how the cluster network works -> platform/Cilium.
If it changes who an application may talk to -> that project.
If it exposes an application publicly -> project route + platform Gateway.
If it exposes an operator surface privately -> Tailscale.
If it needs a stable outbound source IP -> Egress Gateway.
```

Adding an ordinary project must not require a central Cilium policy change.
