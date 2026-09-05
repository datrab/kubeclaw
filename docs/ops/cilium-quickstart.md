# Cilium in 5 minutes

Status: current
Audience: maintainer, operator, developer

This is the short entry point for KubeClaw's networking model. The detailed source of truth is [`cilium-networking.md`](cilium-networking.md).

## The whole model in one picture

```text
                         PLATFORM
                            |
                         Cilium
                            |
             +--------------+--------------+
             |                             |
      cluster-wide baseline              Hubble
      default deny + DNS                 flows
             |                             |
             v                             v
       project namespace              GPT Ops
             |
             +-- workload manifests
             +-- explicit allow policies

Default rule: traffic is denied unless an allow policy exists.
```

For an ordinary application namespace, creating namespace #10,000 should require no central Cilium edit. The cluster-wide baseline already applies; the project only declares the connections it actually needs.

## Glossary

| Term | Plain-English meaning | How we use it |
| --- | --- | --- |
| CNI | Kubernetes network plugin | Cilium becomes the cluster CNI instead of Flannel. |
| Cilium | Networking dataplane + policy engine | Central platform component in namespace `cilium`. |
| eBPF | Linux kernel mechanism used by Cilium | Implements much of Cilium's networking, policy and observability datapath. You normally do not operate eBPF directly. |
| Hubble | Cilium network observability | Shows forwarded/dropped flows and feeds bounded evidence to GPT Ops. |
| CCNP | `CiliumClusterwideNetworkPolicy` | Platform-owned rules that intentionally apply across namespaces. |
| CNP | `CiliumNetworkPolicy` | Namespaced project rule when Cilium-specific features are useful. |
| KNP | Kubernetes `NetworkPolicy` | Portable namespaced rule; Cilium enforces it too. |
| Default deny | Nothing is implicitly allowed | Ordinary workloads start isolated in both ingress and egress directions. |
| Ingress | Traffic entering a workload | Example: frontend -> API. |
| Egress | Traffic leaving a workload | Example: API -> PostgreSQL or an external SaaS API. |
| Identity | Labels/service-account/namespace facts Cilium uses instead of fixed Pod IPs | Policies survive Pod rescheduling and changing IP addresses. |
| Gateway API | Kubernetes API for inbound HTTP/TCP routing | Later: public `dtlabs.ch`, shop/SaaS hostnames and paths. |
| Egress Gateway | Controlled path for outbound traffic | Later: stable source IPs for SaaS allowlisting. It is not the public website ingress. |

## Which policy type do I use?

Use the simplest policy API that expresses the requirement safely:

```text
Is this a genuine cluster-wide invariant?
  YES -> CCNP

Otherwise, is it a project rule that needs Cilium-specific features
such as toFQDNs, kube-apiserver identity or L7 policy?
  YES -> CNP

Otherwise:
  KNP
```

Examples:

```text
All ordinary workloads default-deny           -> CCNP
All ordinary workloads may reach kube-dns     -> CCNP
Kinea API may reach PostgreSQL:5432            -> CNP or KNP
Worker may reach api.openai.com                -> CNP (toFQDNs)
All agent pods in this same namespace may
reach the agent gateway ports                  -> KNP
```

A project normally never needs to create or modify a CCNP.

## What happens when a new project is created?

```text
1. Create namespace
2. Deploy workloads
3. Central default-deny already applies
4. DNS already works
5. Deploy only the project's explicit allow rules
6. Verify with Hubble
```

No custom namespace policy-profile label is required. No central namespace registry is required. No policy-injection controller is required.

## Current fail-closed baseline

Two platform-owned CCNP objects establish the ordinary workload baseline:

```text
dtlabs-workload-default-deny
  ingress: deny unless another policy allows it
  egress:  deny unless another policy allows it

dtlabs-workload-allow-dns
  allow TCP/UDP 53 -> kube-dns only
```

The initial CNI migration deliberately excludes these bootstrap/control-plane namespaces from the generic application baseline:

```text
kube-system
cilium
tailscale
argocd
```

This is a migration safety boundary, not a place for application workloads and not a permanent security exemption. Platform namespaces are hardened separately after the CNI cutover is stable.

## CNP versus KNP: an important detail

Cilium enforces both CNP and ordinary Kubernetes NetworkPolicy.

Do not convert a KNP to CNP merely for consistency. Semantics matter more than CRD uniformity.

For example, in Kubernetes NetworkPolicy:

```yaml
from:
  - podSelector: {}
```

means "all pods in this policy's namespace".

That is exactly what `kubeclaw-agents-ingress` needs, so that rule deliberately remains KNP. A superficially similar empty Cilium endpoint selector can have broader identity semantics and should not be used as a mechanical translation.

## Hubble + GPT Ops

Hubble is the network evidence layer, not a giant log archive.

```text
Question: "Why can Prism not reach PostgreSQL?"

GPT Ops
  1. checks Argo desired/sync state
  2. checks Kubernetes readiness
  3. checks Kubernetes events
  4. queries a bounded Hubble flow window
  5. reads bounded pod logs only if still necessary
```

The MCP returns compact flow facts rather than complete Hubble label sets. This keeps troubleshooting useful without turning flow metadata into a high-cardinality logging problem.

## The KUBE-ROUTER migration trap

This matters only during the one-time K3s/Flannel -> Cilium migration.

K3s normally includes a kube-router-derived NetworkPolicy controller. Disabling that controller stops it from managing policy, but already-programmed `KUBE-ROUTER` iptables rules can remain on the node.

That can produce this confusing state:

```text
Cilium says ALLOW
        |
        v
old KUBE-ROUTER iptables rule says DROP
        |
        v
traffic still fails
```

Therefore the maintenance procedure inspects and removes stale `KUBE-ROUTER` rules after the old K3s policy controller is disabled. Do this only during the documented cutover with recovery access. See the full runbook in [`cilium-networking.md`](cilium-networking.md).

## Normal operation after the cutover

The first CNI replacement requires host access because K3s itself must stop starting Flannel/the old policy controller. That is exceptional.

After Cilium is established, ordinary operations should be Git/GitOps-driven:

```text
GitHub
  -> Argo CD
     -> Kubernetes
        -> Cilium policies
        -> Hubble evidence
        -> GPT Ops troubleshooting
```

Host access should then be reserved for actual node/OS/CNI maintenance, not normal application deployment or network-policy work.

## Future edge architecture

Keep inbound public traffic, private platform access and outbound fixed-IP traffic as separate concerns:

```text
Internet
  -> Cilium Gateway API
     -> dtlabs.ch
     -> shop.pferdevilla-kunterbunt.de
     -> future SaaS hostnames/routes

Tailscale
  -> platform.dtlabs.ch
  -> prism.dtlabs.ch
  -> Argo / Hubble / operator surfaces

Workload
  -> Cilium Egress Gateway
     -> external SaaS/API with stable source IP
```

Gateway API and Egress Gateway are later changes. They are intentionally not mixed into the first CNI migration.

## Safety rules worth remembering

- Default deny is the baseline; an allow must be explicit.
- Do not add ordinary project namespaces to platform exclusions to make something work.
- Prefer stable workload/service-account identities over volatile build/hash/timestamp labels.
- Cross-namespace trust must use a real trust boundary, not just spoofable workload labels.
- A public endpoint belongs behind the future Gateway API; platform/admin endpoints stay Tailscale-only.
- Use Hubble to prove what the network is doing before widening a policy.
- The first CNI cutover is a maintenance operation. Do not improvise it from a remote session without recovery access.

## Where to go next

For implementation details, exact manifests, preflight commands, rollback, K3s configuration, policy migration, Hubble Relay security, identity cardinality and Definition of Done, read [`cilium-networking.md`](cilium-networking.md).
