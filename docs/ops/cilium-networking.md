# Cilium networking architecture and operations

Status: current
Audience: maintainer, platform operator, developer

This document is the technical source of truth for KubeClaw's Cilium architecture, policy ownership, observability, first K3s/Flannel -> Cilium cutover, validation, rollback principles and future edge architecture.

If Cilium is new to you, read [`cilium-quickstart.md`](cilium-quickstart.md) first. It explains the model and terminology in about five minutes. This document intentionally goes deeper.

The design goal is simple:

> The central networking platform should require approximately the same amount of configuration with 10 application namespaces or 10,000.

---

## 1. Executive summary

The platform contract is:

```text
                         PLATFORM
                            |
                         Cilium
                            |
              +-------------+-------------+
              |                           |
      cluster-wide baseline             Hubble
      default deny + DNS                flows
              |                           |
              v                           v
       project namespace              GPT Ops
              |
              +-- workload manifests
              +-- project-specific explicit allows
```

For ordinary application workloads:

- ingress is denied unless explicitly allowed;
- egress is denied unless explicitly allowed;
- DNS to cluster DNS is the only generic workload egress allowance;
- projects own their application-specific connectivity rules;
- a new normal namespace does not require a central Cilium edit;
- no custom namespace policy-profile label is required;
- no admission-time policy injector is required;
- no central namespace registry is required;
- Hubble provides bounded network evidence to GPT Ops.

The first CNI replacement is a controlled host maintenance operation. Normal operation after that is intended to be Git/GitOps-driven.

---

## 2. Terminology

| Term | Meaning | Usage here |
| --- | --- | --- |
| CNI | Kubernetes network plugin | Cilium replaces Flannel as the CNI. |
| Cilium | CNI, dataplane, policy engine and networking platform | Runs centrally in namespace `cilium`. |
| eBPF | Linux kernel technology used by Cilium | Implements much of the datapath, policy enforcement and observability. |
| Hubble | Cilium observability layer | Supplies network-flow evidence to operators and GPT Ops. |
| CCNP | `CiliumClusterwideNetworkPolicy` | Platform-owned cluster-wide invariants. |
| CNP | `CiliumNetworkPolicy` | Namespaced policy using Cilium-specific capabilities. |
| KNP | Kubernetes `NetworkPolicy` | Portable namespaced policy; Cilium enforces it too. |
| Default deny | No implicit network access | An allow must exist for required traffic. |
| Ingress | Traffic entering a workload | Example: frontend -> API. |
| Egress | Traffic leaving a workload | Example: API -> PostgreSQL. |
| Identity | Stable workload facts used by Cilium policy | Prefer namespace, application/component and service-account identities over Pod IPs. |
| Gateway API | Kubernetes API for inbound routing | Future public entrypoint. |
| Egress Gateway | Controlled outbound source path | Future stable source IP for external allowlists. |

### Policy choice rule

Use the simplest API that safely expresses the requirement:

```text
Genuine cluster-wide invariant?
  -> CCNP

Project rule requiring Cilium-specific identity/FQDN/L7 functionality?
  -> CNP

Simple portable L3/L4 project rule?
  -> KNP
```

Cilium can enforce CCNP, CNP and KNP simultaneously. CRD uniformity is not a goal by itself; correct semantics and clear ownership are more important.

---

## 3. Non-negotiable security invariants

### 3.1 Ordinary workloads are fail-closed automatically

The platform-owned `dtlabs-workload-default-deny` CCNP selects every ordinary workload namespace using Cilium's intrinsic Kubernetes namespace identity.

Current selector:

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
        - paperless # explicit temporary owner-approved exception
```

Paperless is temporarily excluded by explicit owner decision to preserve its existing
connectivity. This is not a reusable project-onboarding escape hatch. It still
experiences the CNI interruption; existing Paperless KNPs remain effective. Confirm
its actual namespace is exactly `paperless` before the cutover. Website downtime is
accepted. KubeClaw pipeline and Paperless recovery are mandatory release criteria.

There is no opt-in profile label. A new normal application namespace is covered automatically.

The isolation semantics are explicit:

```yaml
enableDefaultDeny:
  ingress: true
  egress: true
ingress: []
egress: []
```

`ingress: []` / `egress: []` means no flow is allowed by this rule. Do not replace those lists with `- {}`: an empty rule object is an unrestricted allow rule in Cilium.

Cilium allow policy is additive. The cluster baseline establishes default deny; project policies add only the flows the application requires.

### 3.2 DNS is the only generic application allowance

The second platform-owned CCNP, `dtlabs-workload-allow-dns`, permits:

```text
ordinary workload -> kube-dns : UDP/53, TCP/53
```

It deliberately sets:

```yaml
enableDefaultDeny:
  ingress: false
  egress: false
```

The DNS policy must not independently activate default-deny if the main baseline is temporarily absent during reconciliation.

The baseline is initially L3/L4 only. It does not force every DNS request through an L7 rule. Projects that later use `toFQDNs` or require DNS L7 policy can opt into the additional DNS-proxy behavior required by those rules.

### 3.3 Project policy is explicit allow only

A normal project does not duplicate the global baseline. It owns only its communication contract.

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

### 3.4 Central Cilium is not an application-firewall catalogue

Do not add project-specific rules like these to `cilium-cluster-policies.yaml`:

```text
kinea -> postgres:5432
shop -> redis:6379
prism -> nova:18082
```

Those belong to the release/repository that owns the workload.

Central policy is reserved for true platform-wide invariants and guardrails.

---

## 4. Ownership model

### Platform-owned

The platform owns:

- Cilium Helm release/version;
- CNI/dataplane configuration;
- IPAM/routing mode;
- Hubble, Relay and UI;
- global workload default-deny/DNS baseline;
- genuine global guardrails;
- protection of platform networking APIs such as Hubble Relay;
- future Gateway API infrastructure;
- future Egress Gateway infrastructure;
- later host/network encryption controls.

Current central files:

```text
my-values/infra/cilium-values.yaml
my-values/infra/cilium-cluster-policies.yaml
scripts/deploy-cilium.sh
```

### Project-owned

Each project owns:

- its namespace manifest/Helm/Kustomize tree;
- stable workload and service-account identities;
- ingress allows into its workloads;
- egress allows from its workloads;
- FQDN/L7 policy when genuinely required;
- future `HTTPRoute` objects for public exposure.

KubeClaw's project-owned policy file is currently:

```text
my-values/infra/network-policies.yaml
```

Future projects should keep equivalent policies with their own project/release rather than editing central Cilium configuration.

### Platform namespaces

The first migration excludes four platform namespaces plus the temporary Paperless exception:

```text
kube-system
cilium
tailscale
argocd
paperless (temporary owner-approved application exception)
```

from the generic application baseline.

This is a cutover safety boundary, not a permanent security exemption and not permission to run application workloads there.

Normal projects MUST NOT be added to this list to work around missing connectivity. Add a narrow project-owned allow instead.

After the CNI migration is proven stable, platform namespaces can receive individually tested fail-closed policies. They are not put under the generic application baseline during the first cutover because accidentally breaking DNS, Cilium, Tailscale or Argo would also remove important recovery/diagnostic paths.

---

## 5. Scaling to thousands of namespaces

Namespace #10 and namespace #10,000 follow the same flow:

```text
create namespace
      |
      | central CCNP already selects it
      v
default-deny + DNS already active
      |
      v
deploy workloads + explicit project allows
```

Central Cilium changes required for a normal new project:

```text
0
```

This intentionally avoids:

- one central policy object per project;
- one central namespace allow-list per project;
- custom namespace policy-profile labels;
- an admission/injection controller whose sole job is creating baseline policy;
- duplicated default-deny/DNS manifests in every project.

### Identity cardinality

Large namespace count alone is not the main scaling concern. High-cardinality identity-relevant labels can be more expensive.

Prefer stable identity inputs such as:

- intrinsic namespace identity;
- `app.kubernetes.io/name`;
- `app.kubernetes.io/component`;
- service-account identity where a stronger boundary is useful.

Avoid using volatile deployment metadata as security identity unless there is a concrete reason:

- commit SHA;
- build ID;
- timestamp;
- random run/deployment UUID;
- pod-template hash.

Do not introduce custom Cilium identity-label filtering during the first migration. First observe real identity cardinality and memory/flow behavior; optimize only from evidence.

### Namespace labels

We do **not** use a custom label such as:

```text
platform.dtlabs.ch/network-profile=restricted
```

to activate policy.

Namespace labels may still be used where they represent an independent, trusted ownership fact. KubeClaw has one deliberate case: temporary namespaces created by the Buster namespace controller carry:

```text
kubeclaw/managed-by=buster-namespace-controller
```

That existing controller-owned identity can participate in a cross-namespace trust rule. It is not a general Cilium profile mechanism.

---

## 6. Namespaced and cross-namespace policy semantics

A CNP is namespaced. Its `endpointSelector` selects endpoints in the CNP's own namespace.

For namespaced CNP `fromEndpoints` / `toEndpoints`, selectors without an explicit namespace identity are likewise scoped to the policy namespace by default. Cross-namespace traffic must be expressed explicitly through namespace identity/namespace-label selectors.

This matters for custom deployments:

- production Prism is selected by workload identity in the same namespace as the Nova CNP;
- it therefore follows a custom deployment `NAMESPACE` without hard-coding `kubeclaw`;
- temporary Prism is the separate cross-namespace case and requires the Buster-controller namespace ownership boundary.

### Cross-namespace trust rule

Never authorize sensitive cross-namespace communication using only spoofable application labels.

Avoid relying on this alone across namespace boundaries:

```yaml
matchLabels:
  app.kubernetes.io/name: kubeclaw
  app.kubernetes.io/component: prism
```

Use a stronger trust fact such as:

- explicit namespace identity;
- namespace ownership maintained by a trusted controller;
- service-account identity;
- later, cluster identity when ClusterMesh exists.

### Why one static KubeClaw rule remains KNP

`kubeclaw-agents-ingress` deliberately remains standard Kubernetes `NetworkPolicy`.

KNP expresses its requirement directly:

```yaml
from:
  - podSelector: {}
```

which means all pods in the policy's own namespace.

Cilium enforces that KNP natively. There is no benefit in translating a simple, portable rule only for CRD uniformity.

---

## 7. Current project-policy specifics

The current KubeClaw policy set is intentionally mixed.

### Native CNP examples

Native CNP is used where Cilium identities improve precision, including:

- Ops MCP -> `kube-apiserver:443`;
- Buster namespace controller -> `kube-apiserver:443`;
- Ops MCP -> Hubble Relay;
- controlled cross-namespace Prism trust;
- regular application/service allow relationships.

The Buster namespace controller has a dedicated API-server rule. Generic KubeClaw agent Internet egress does **not** implicitly grant Kubernetes API access because Cilium's `world` and `kube-apiserver` identities are distinct trust domains.

### Retained KNP examples

KNP remains appropriate where portable Kubernetes semantics already express the rule cleanly, including:

- `kubeclaw-agents-ingress`;
- Prism chart-owned policies;
- policies dynamically generated by the Buster namespace controller.

This mixed model is intentional and supported by Cilium.

---

## 8. Governance and RBAC target

The intended enterprise permission boundary is:

```text
platform automation/service account
  can manage CCNP

project automation/service account
  can manage CNP/KNP in its own namespace
  cannot manage CCNP
```

Kubernetes RBAC should be the first governance control.

Do not add Kyverno/Gatekeeper merely because the design sounds "enterprise". Add native `ValidatingAdmissionPolicy` or another admission engine later only for a concrete requirement, for example:

- rejecting dangerous wildcard project policies;
- enforcing required ownership metadata;
- prohibiting project writes to platform namespaces/resources.

---

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

Values live in:

```text
my-values/infra/cilium-values.yaml
```

`namespaceOverride: cilium` intentionally keeps the Cilium platform in its own namespace.

Do not combine the first CNI replacement with kube-proxy replacement, Gateway API, Egress Gateway, encryption or ClusterMesh. Each is a separate observable change after the baseline dataplane is stable.

---

## 10. Hubble + GPT Ops

Hubble is the network-evidence layer for the read-only KubeClaw Ops MCP.

```text
ChatGPT
   |
   | OpenAI Secure MCP Tunnel
   v
KubeClaw Ops MCP
   |---------------------> Argo CD Applications
   |---------------------> Kubernetes API
   |
   +--- bounded query ---> Hubble Relay :4245
                               |
                               v
                         Cilium/eBPF flows
```

There is deliberately no mandatory persistent Hubble flow database or Vector/Loki flow export in this initial path.

The MCP image contains the Hubble CLI copied from the same pinned Cilium image family. The image build validates that the binary executes.

`get_hubble_flows` is bounded by design:

- namespace scoped by default;
- optional pod/verdict filters;
- bounded time range;
- maximum 50 returned flows;
- subprocess timeout;
- 2 MiB raw-output ceiling;
- complete endpoint label sets removed from the ChatGPT result;
- compact output only: namespace/pod, IP, L4, verdict, drop reason, direction, node and summary.

This avoids turning GPT Ops or application logs into a high-cardinality flow archive.

### Expected troubleshooting sequence

For a connectivity problem:

```text
1. Argo desired/sync/health state
2. Kubernetes workload readiness
3. Kubernetes events
4. Hubble forwarded/dropped flows
5. bounded application logs only when needed
```

This separates network-policy failures from scheduling, image, probe and application failures.

### Hubble Relay security

Relay remains `ClusterIP`. Its client-facing gRPC port is plaintext inside the cluster for simplicity, but is protected by identity-based Cilium policy.

`hubble-relay-consumers` permits TCP/4245 only from expected consumers:

- `ops-mcp` in `kubeclaw`;
- Hubble UI in `cilium`;
- required host/remote-node health traffic.

Do not expose Relay publicly.

Manual UI access:

```bash
kubectl -n cilium port-forward svc/hubble-ui 12000:80
```

Useful checks:

```bash
kubectl -n cilium get pods
kubectl -n cilium get svc hubble-relay hubble-ui
kubectl get ciliumclusterwidenetworkpolicies
kubectl get ciliumnetworkpolicies -A
kubectl get networkpolicies -A
```

---

## 11. First K3s / Flannel -> Cilium cutover

This section applies only to the first CNI replacement. It is not the normal deployment workflow after Cilium is established.

### 11.1 Why host access is required once

K3s normally starts Flannel and its kube-router-derived NetworkPolicy controller. Kubernetes manifests alone cannot safely disable those host-level components.

The effective K3s configuration must disable them before Cilium becomes the CNI:

```yaml
flannel-backend: none
disable-network-policy: true
```

### 11.2 `/etc/rancher/k3s` does not mean Rancher Manager

The normal K3s configuration path is:

```text
/etc/rancher/k3s/config.yaml
```

The directory name is part of K3s. Rancher Manager is not required.

K3s can also use another configuration path through `--config` / `K3S_CONFIG_FILE`. Therefore **inspect the running service before editing anything**.

### 11.3 Preflight at the PC/host

Before changing K3s:

```bash
kubectl get nodes -o wide
kubectl get pods -A -o wide
kubectl get networkpolicy -A
kubectl get svc -A
```

Confirm the current topology. The bootstrap script intentionally refuses the first disruptive replacement when it sees more than one node.

Inspect how K3s is actually launched:

```bash
systemctl cat k3s
ps aux | grep '[k]3s server'
```

Only inspect/edit the default file if that is actually the active source:

```bash
sudo test -f /etc/rancher/k3s/config.yaml && \
  sudo cat /etc/rancher/k3s/config.yaml
```

Back up the effective configuration before modifying it.

Example for the default path:

```bash
sudo cp /etc/rancher/k3s/config.yaml \
  /etc/rancher/k3s/config.yaml.pre-cilium
```

Keep direct SSH/console recovery access. Do not improvise this migration from a fragile remote-only session.

### 11.4 The KUBE-ROUTER trap

Disabling K3s' NetworkPolicy controller stops future rule management, but already-programmed kube-router iptables rules can remain.

That can create this confusing state:

```text
Cilium policy says ALLOW
         |
         v
stale KUBE-ROUTER iptables rule says DROP
         |
         v
traffic still fails
```

Inspect both IPv4 and IPv6 tables:

```bash
sudo iptables-save | grep KUBE-ROUTER
sudo ip6tables-save | grep KUBE-ROUTER
```

K3s documents `k3s-killall.sh` or targeted removal. For the targeted cleanup path documented for this migration:

```bash
sudo sh -c 'iptables-save | grep -v KUBE-ROUTER | iptables-restore'
sudo sh -c 'ip6tables-save | grep -v KUBE-ROUTER | ip6tables-restore'
```

Perform this only after the old policy controller is disabled and as part of the maintenance procedure with recovery access.

### 11.5 Controlled single-node replacement

Deploy and configure Argo, then the PR #1 MCP/tunnel while Flannel still works.
Verify their real tools and a successful KubeClaw pipeline run before networking
changes. Build the PR #2 MCP candidate by workflow_dispatch and record its digest.
Do not auto-sync Cilium as an ordinary unattended Application rollout.

Before the maintenance window, prepare policies for every required dependency.
SPIRE in `spire-server`/`spire-system` is NOT excluded. Apply the SPIRE-owned
`my-values/infra/spire-network-policies.yaml` before resuming it. These rules follow
the pinned hardened chart 0.30.0 (server/agent names, API and webhook, agent gRPC
8081 behind Service 443, CSI and hook API access). Compare actual chart overrides,
ServiceAccounts and rendered labels; verify API, DNS and SVID renewal paths. Do not proceed until that inventory is complete.

1. Record successful KubeClaw pipeline and Paperless checks. Stop accepting new
   pipeline work, finish or checkpoint active tasks; suspend CronJobs/producers.
   Preserve controller replica counts and Jobs. Pause Argo auto-sync so it cannot
   undo deliberate maintenance changes. Back up database/storage appropriately.
2. Cordon the single node. No workload may bypass this with `nodeName` or an
   unschedulable toleration during maintenance; inventory DaemonSets separately.
3. On the host, save effective K3s config, unit/drop-ins, CNI configs/binaries,
   iptables/ip6tables rules and interfaces/routes. Record exact restore paths.
   Stop K3s; use the installed K3s stop/killall maintenance procedure to stop old
   containers/sandboxes. Do not uninstall K3s or remove PVC/storage data.
4. Disable Flannel and the old policy controller in EFFECTIVE K3s configuration.
   Move only the recorded old Flannel CNI config out of the active CNI directory
   while stopped; preserve it for rollback. Inspect/clean legacy rules as above.
   Restart K3s without the old CNI. Ordinary pods cannot acquire an old network.
   The initial installer checks the local CRI and rejects any ready non-host
   sandbox, including retries of failed Helm releases.
5. Run on the host with kubectl/Helm and CRI permissions:

   ```bash
   CILIUM_K3S_READY=true ./scripts/deploy-cilium.sh install
   ```

   The script always requires one cordoned node for `install`, installs Cilium
   without Helm waiting for the whole release, waits for CRDs, applies the baseline,
   then verifies agent/operator rollout. The host-network operator has an explicit
   unschedulable toleration so cluster-pool IPAM can initialize. It never uncordons.
6. Verify imported baseline on every agent. Apply KubeClaw Allows using the migration script's `apply` mode after dataplane
   inspection. Stage Ops separately with `deploy-ops-mcp.sh policies` piped to
   `kubectl apply -f -`, passing the configured Tailscale operator namespace. Apply the prepared
   SPIRE/other required project policies. Keep legacy KNPs for now. The baseline
   excludes Paperless, not arbitrary other namespaces.
7. Deliberately uncordon, restore desired controllers/producers in dependency
   order and wait for recreated pods. Verify every ordinary pod is Cilium-managed,
   not merely Ready. Now check Hubble Relay/UI and the digest-pinned #2 MCP.
8. Run the positive/negative and pipeline checks below, cleanup legacy Allows,
   then repeat checks. Keep the legacy KubeClaw default-deny safety belt through
   cleanup; retiring this redundant deny is a separate verified action.

A partial install is not permission to bypass these gates. `upgrade` requires the
explicit `kubeclaw-cutover-verified` ConfigMap in `cilium`, created only after all
post-cleanup checks. Existence of a Helm release alone never grants upgrade mode.

---

## 12. Dataplane verification before policy migration

Do not migrate project policy merely because the Cilium DaemonSet says Ready.

Verify at minimum:

```bash
kubectl get nodes -o wide
kubectl -n cilium get pods -o wide
kubectl -n cilium get svc hubble-relay hubble-ui
kubectl get ciliumclusterwidenetworkpolicies
kubectl get ciliumnetworkpolicies -A
```

Verify:

- the node is Ready;
- Cilium agent/operator are healthy;
- Hubble Relay/UI are healthy;
- `dtlabs-workload-default-deny` exists;
- `dtlabs-workload-allow-dns` exists;
- cluster DNS works from ordinary workloads;
- required application traffic works with the current policy state;
- stale KUBE-ROUTER rules are no longer enforcing old policy;
- Hubble can show forwarded and dropped traffic.

Use Hubble to verify policy behavior instead of widening rules based on guesses.

---

## 13. Project-policy migration

The Cilium dataplane must be explicitly verified before this script runs:

```bash
CILIUM_DATAPLANE_VERIFIED=true \
  ./scripts/migrate-kubeclaw-network-policies-to-cilium.sh apply
```

The migration is intentionally mixed API:

- expected native CNP replacements are verified;
- intentionally retained portable KNPs are verified;
- central CCNP baseline is verified;
- only superseded legacy KNPs are candidates for cleanup.

After `apply`:

```bash
kubectl get ciliumclusterwidenetworkpolicies
kubectl -n kubeclaw get ciliumnetworkpolicies
kubectl -n kubeclaw get networkpolicies
kubectl -n cilium exec ds/cilium -c cilium-agent -- cilium-dbg policy get
```

Exercise real application traffic and inspect Hubble.

Only after verification:

```bash
CILIUM_DATAPLANE_VERIFIED=true CILIUM_TRAFFIC_VERIFIED=true \
  ./scripts/migrate-kubeclaw-network-policies-to-cilium.sh cleanup
```

The verification helper requires Python 3 and PyYAML 6.0.3 on the operator machine.
Install these before maintenance. It performs server-side dry-run validation, then
compares source specs strictly, including unexpected extra fields.

Cleanup compares source policy specs with live specs and checks
current endpoint desired/realized revisions through `verify-cilium-policies.py`.
It additionally requires the explicit traffic-test acknowledgement. These checks
are complementary: object existence or endpoint revision alone is not proof that
all required traffic works. Legacy Allows can mask a bad replacement, so repeat
positive tests after cleanup and use fresh isolated pods for negative tests.

Dynamic/chart-owned KNP objects are untouched. `kubeclaw-agents-ingress` remains
portable; legacy `kubeclaw-default-deny` is deliberately retained through cleanup.
The fixed deletion list contains only previously superseded static Allows. CNP
replacement names come from manifests rather than a second hardcoded list.

---

## 14. Project onboarding after migration

A new normal project should require no platform networking change.

Recommended sequence:

```text
1. create namespace
2. deploy workloads/services
3. central fail-closed baseline is already active
4. deploy only explicit project allow policies
5. verify flows with Hubble
6. manage desired state through Git/Argo
```

Do not create project-specific rules under the central Cilium policy file.

### Example connectivity contract

For each required flow, be able to answer:

```text
source identity
-> destination identity/FQDN
-> protocol/port
-> why required
```

Examples:

```text
frontend -> api : TCP/8080
api -> postgres : TCP/5432
worker -> api.openai.com : TCP/443
```

### Policy authoring principles

- deny by default;
- allow the minimum required peer/port;
- prefer identities over Pod IPs;
- use FQDN policy for external destinations when useful;
- use L7 policy only when the security requirement justifies the added complexity;
- do not use `world:443` when a narrower stable destination can be expressed;
- never use a platform-namespace exclusion as a project connectivity workaround;
- review cross-namespace trust as a security boundary.

---

## 15. Observability and logging strategy

Hubble is primarily an on-demand/network-observability system in the initial design, not a requirement to ship every flow into the general log pipeline.

This is deliberate for scale:

- do not dump complete Hubble flow/label objects into Vector by default;
- avoid multiplying high-cardinality label data in application logs;
- keep GPT Ops queries bounded and targeted;
- export only metrics/logs that answer a real operational or security question.

If persistent flow retention becomes necessary later, design it as a separate capacity/retention decision rather than enabling it implicitly.

Useful future observability options include:

- Hubble metrics to Prometheus;
- Grafana dashboards;
- alerts on policy drops or DNS failures;
- targeted security-event retention.

---

## 16. Private platform access

Administrative/platform surfaces stay private through Tailscale.

Target examples:

```text
platform.dtlabs.ch   -> Tailscale only
prism.dtlabs.ch      -> Tailscale only
Argo CD              -> Tailscale only
Hubble UI            -> Tailscale/port-forward only
operator surfaces    -> Tailscale only
```

A private custom hostname can later use cert-manager with DNS-01 so certificate issuance does not require exposing the service through a public HTTP challenge.

Do not confuse private platform access with public application ingress.

---

## 17. Future public Gateway API architecture

Public inbound routing is a future Cilium Gateway API change, not an Egress Gateway use case.

Target:

```text
Internet
   |
Cilium Gateway API
   +-> dtlabs.ch
   +-> shop.pferdevilla-kunterbunt.de
   +-> future SaaS hostname/path routes
```

Projects should eventually own their `HTTPRoute` objects while the platform owns the shared Gateway infrastructure and security boundary.

Gateway API is intentionally not part of the first CNI replacement. kube-proxy replacement and Gateway API should be introduced as separate, observable changes after the baseline dataplane is proven stable.

---

## 18. Future Egress Gateway architecture

Egress Gateway controls **outbound** traffic and stable source identity.

Target example:

```text
project workload
      |
Cilium Egress Gateway
      |
stable public source IP
      |
external SaaS/API allow-list
```

Useful cases include partners or SaaS platforms that require source-IP allowlisting.

Do not use the term Egress Gateway for publishing `dtlabs.ch`; public inbound routing belongs to Gateway API.

---

## 19. Later capabilities intentionally deferred

Potential future changes, each independently designed/reviewed:

- kube-proxy replacement;
- Gateway API;
- Egress Gateway;
- transparent WireGuard/IPsec node encryption;
- host firewall;
- ClusterMesh/multi-cluster identity;
- advanced FQDN/L7 policy;
- persistent Hubble flow retention;
- platform-namespace default-deny hardening;
- admission-policy governance.

Do not enable them merely because Cilium supports them. Add them when they solve a concrete requirement.

---

## 20. Rollback principles

The safest rollback is evidence-driven and phase-specific.

Before changing the host:

- preserve the effective K3s configuration;
- record current Pods/services/policies;
- keep recovery/console access.

During the CNI cutover:

- Before any new Cilium sandbox exists: keep the node cordoned, stop K3s and
  Cilium processes, restore the recorded K3s/Flannel config and CNI configuration,
  then restart and verify old networking before resuming controllers.
- After Cilium sandboxes exist: quiesce workloads again, cordon and stop K3s and
  all affected sandboxes. Stop/uninstall Cilium through the recorded Helm recovery
  path while API access is available, and verify it cannot rewrite CNI config.
  `cni.uninstall: false` intentionally leaves files behind: remove/move the recorded
  Cilium CNI file explicitly before restoring Flannel. Do not leave both active.
- Restore known-good K3s settings, Flannel config/binaries and pre-cutover project
  KNP manifests. Native CNPs have no enforcement effect under Flannel. Recreate
  pods under Flannel, then repeat pipeline/Paperless tests before enabling producers.
- Inspect residual Cilium routes/interfaces/BPF and firewall state using the
  version-matched recovery instructions; do not blindly restore a live iptables
  snapshot over a running kube-proxy/controller. A controlled host reboot may be
  appropriate after restoring configuration. Keep independent host access throughout.
- If exact CNI paths or restoration steps are unknown, stop at preflight. This
  document is not authorization for generic filesystem deletion or firewall flushing.

During project-policy migration:

- `apply` is additive;
- verify real traffic/Hubble first;
- `cleanup` deletes superseded legacy Allows after spec/revision checks and traffic acknowledgement; retains the old default-deny and requires post-cleanup testing.

Do not use emergency `allow world` rules as a generic rollback mechanism.

---

## 21. Definition of Done for the first migration

The first Cilium migration is complete only when all of the following are true:

- Cilium `1.20.1` is installed and healthy in namespace `cilium`;
- the node is Ready after old Flannel Pod sandboxes have been recycled;
- K3s is no longer starting Flannel;
- the K3s built-in NetworkPolicy controller is disabled;
- stale `KUBE-ROUTER` iptables policy rules are no longer enforcing old policy;
- `dtlabs-workload-default-deny` exists;
- `dtlabs-workload-allow-dns` exists;
- ordinary workload namespaces are demonstrably fail-closed;
- required DNS works;
- expected KubeClaw CNPs exist;
- intentionally retained KNPs exist;
- superseded static KNPs are removed only after replacement verification;
- dynamic Prism/Buster KNPs continue to work under Cilium enforcement;
- Buster namespace controller can reach `kube-apiserver:443` through its dedicated CNP;
- Ops MCP can reach Kubernetes API and Hubble Relay through explicit policy;
- Hubble reports useful forwarded/dropped flows;
- GPT Ops can use bounded Hubble evidence without write privileges;
- Docs Checks and Ops MCP image build are green;
- no normal project namespace was added to the platform exclusion list as a workaround.

Only after successful real dataplane verification should the Cilium migration PR become the operational branch state.

---

## 22. Normal operating model after cutover

The desired steady state is:

```text
Git / GitHub
     |
   Argo CD
     |
 Kubernetes
     |
     +-> workloads
     +-> project CNP/KNP
     +-> central CCNP
     +-> Cilium dataplane
     +-> Hubble evidence
              |
            GPT Ops
```

Normal application deployment, policy updates and troubleshooting should not require logging into the host.

Host access remains for genuine node-level work such as:

- OS/kernel maintenance;
- K3s upgrades/configuration;
- CNI/dataplane migrations;
- node storage/hardware problems;
- recovery from control-plane/node failure.

That separation is the operational value of this architecture: the host becomes infrastructure, not the everyday user interface.

---

## 23. Upstream references

Cilium:

- policy overview/enforcement: https://docs.cilium.io/en/v1.20.1/security/policy/intro/
- Kubernetes/Cilium policy semantics: https://docs.cilium.io/en/v1.20.1/security/policy/kubernetes/
- L3 policy: https://docs.cilium.io/en/v1.20.1/security/policy/language/
- identity scalability: https://docs.cilium.io/en/stable/operations/performance/scalability/identity-relevant-labels/
- Hubble: https://docs.cilium.io/en/stable/observability/hubble/
- Gateway API: https://docs.cilium.io/en/stable/network/servicemesh/gateway-api/gateway-api/
- Egress Gateway: https://docs.cilium.io/en/stable/network/egress-gateway/egress-gateway/

K3s:

- configuration: https://docs.k3s.io/installation/configuration
- custom CNI/basic network options: https://docs.k3s.io/networking/basic-network-options
- networking services / NetworkPolicy cleanup: https://docs.k3s.io/networking/networking-services

Repository implementation:

```text
my-values/infra/cilium-values.yaml
my-values/infra/cilium-cluster-policies.yaml
my-values/infra/network-policies.yaml
scripts/deploy-cilium.sh
scripts/migrate-kubeclaw-network-policies-to-cilium.sh
docs/ops/cilium-quickstart.md
examples/cilium/project-network-policy.yaml
```

## Review closure: operational contracts

### Diagnostic portions, not content censorship

Hubble accepts absolute `startTime`/`endTime`, at most 15 minutes per call, default
last five minutes. Old windows are allowed. At most 50 flows are returned; stdout
and stderr share a 2 MiB raw budget, timeout is 12 seconds, at most two child
processes run concurrently. Normalized flow JSON has a 192 KiB budget; individual
Summary text has an 8 KiB technical ceiling. Metadata is additional. UTF-8 boundaries
are preserved. No content scanner or redaction is applied. Complete endpoint
labelsets are omitted as agreed. These limits are per call, not per investigation.

Inspect status, reasons, warnings and returnedWindow. Relay errors, lost events,
unknown messages, saturation and buffer/timeout exits produce partial results.
Continue with smaller/older windows or exact pod/node filters. Identical timestamps
and peer ring-buffer overwrite preclude a lossless historical cursor. Empty results
are not evidence of coverage or absence of drops. Pod-log continuation limitations
are documented in `chatgpt-ops-bootstrap.md`.

Relay's node allowance is restricted to TCP 4245/4222; ordinary clients use 4245.
The UI has its own ingress isolation and is accessed via authenticated kubectl
port-forward only. Its backend explicitly targets `hubble-relay:4245`.

### KubeClaw release evidence

Record before and after: Nova requests a lease; Buster controller reconciles it;
Buster builds/pushes/pulls a candidate through registries; test namespace and Prism
start; Nova reaches production and temporary Prism; test gates finish; cleanup
completes. Include API clients Nova/Buster/controller and Ops on the actual K3s
API backend port (443 Service / normally 6443 backend). Also verify Redis, Qdrant,
LiteLLM/PostgreSQL and SPIRE SVID renewal, not just current cached credentials.
Use the existing repository pipeline entrypoints and retain its run IDs/outcomes.

Fresh ordinary namespace probes must demonstrate DNS-only baseline, blocked
same/cross-namespace and external connections without Allows, then successful
explicit bilateral Allows. Test unauthorized Relay/UI/MCP and spoofed Prism peers.
Repeat pipeline and Paperless UI/document processing after legacy cleanup.
Only then record the cutover marker:

```bash
kubectl -n cilium create configmap kubeclaw-cutover-verified \
  --from-literal=checks=pipeline-paperless-negative-probes-post-cleanup-passed
```

### Ownership and capacity

Ordinary project owners must not write platform namespaces, namespace trust labels,
CCNPs or privileged ServiceAccounts. The Buster VAP now reserves its ownership label
on CREATE/UPDATE and renders the actor namespace from NAMESPACE in deploy.sh.
Platform break-glass is explicitly system:masters; authorize a future GitOps actor
narrowly before handing it namespace ownership. Shared KubeClaw/Ops is a trusted
platform namespace, not a boundary for untrusted pod creators. Before delegation,
use dedicated namespaces and enforce restricted Pod Security as in the example.
Do not blanket-enforce restricted on existing workloads without compatibility tests.

With policyEnforcementMode=default, deleting the baseline can remove isolation.
HostNetwork/privileged pods and unmanaged old CNI sandboxes are outside the ordinary
endpoint guarantee. Protect policy ownership and disallow such pods in delegated
projects; do not advertise unconditional fail-closed under arbitrary admin actions.

Central policy count is O(1); identities/endpoints/services are not. A /16 with /24
per node has 256 node blocks. Budget workloads per namespace, pod churn, API/etcd,
kube-proxy service load, BPF maps and identity allocation before 1k/10k namespaces.
A stable shared namespace label is not automatically extra identity cardinality;
unique per-lease UID labels are. Existing lease UID selectors are security-relevant:
do not strip them globally. Exclude new Git SHA/build ID/timestamp/UUID labels from
security identity design; inspect actual effective identity labels first.

### Explicit broad contracts

Agent world TCP22/80/443 remains deliberate for Git/package/provider access. Tunnel
world TCP443 remains a documented v1 outbound contract until actual tunnel endpoint
names/rotation are verified; do not invent a hostname allowlist that breaks access.
LiteLLM ingress is now limited to same-namespace KubeClaw clients. Registry pulls
allow explicit host/remote-node identities rather than all RFC1918 clients.
Archviewer NodePort TCP3456 still requires a proven host/Tailscale firewall boundary
before private-only claims; replacing it with existing Tailscale ingress is a later
access change. No general Allow-All is introduced to make tests pass.

The PostgreSQL example above describes sender egress only: the database needs its
own matching ingress Allow. Replies on an established allowed connection are stateful;
this is not a requirement for a second reverse initiated connection.

### SPIRE namespace ownership on a fresh Cilium cluster

The current cutover uses the already existing SPIRE namespaces. `deploy.sh infra`
requires them before applying policies, to avoid deadlocking Helm hooks under default
deny. For a genuinely fresh cluster, create `spire-server` for the release and
prepare `spire-system` with the ownership its chart expects before applying policies:

```bash
kubectl create namespace spire-server
kubectl create namespace spire-system
kubectl label namespace spire-system app.kubernetes.io/managed-by=Helm
kubectl annotate namespace spire-system meta.helm.sh/release-name=spire meta.helm.sh/release-namespace=spire-server
kubectl apply -f my-values/infra/spire-network-policies.yaml
```

These fresh-cluster commands intentionally fail on existing namespaces; never relabel
an unrelated existing namespace for adoption. The chart keeps its namespace resource
ownership. Do not flip namespace creation off on an existing Helm release as a
shortcut: removing that managed Namespace from a release can delete its workloads.
