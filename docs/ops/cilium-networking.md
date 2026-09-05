# Cilium networking architecture

## Ownership model

Cilium itself is cluster infrastructure and runs centrally in the `cilium` namespace. The central Cilium layer owns only installation, observability and generic cluster guardrails. It must not become the place where application-specific ports, peers or external destinations are maintained.

Project connectivity is declared beside the project that needs it:

- central: `my-values/infra/cilium-values.yaml`
- central generic policy: `my-values/infra/cilium-cluster-policies.yaml`
- KubeClaw project policy: `my-values/infra/network-policies.yaml`
- future projects: a namespaced `CiliumNetworkPolicy` in that project's Helm/Kustomize/manifest tree

`CiliumNetworkPolicy` is namespaced. Kubernetes distributes the CRD objects and Cilium applies them, so a project can deploy its policy together with its workloads. No Cilium Helm edit and no policy-injection webhook is required for ordinary project rules.

## Automatic baseline for new namespaces

For projects that want an automatic baseline, the central `kubeclaw-project-default-deny` `CiliumClusterwideNetworkPolicy` is opt-in by namespace label:

```yaml
metadata:
  labels:
    networking.kubeclaw.io/profile: default-deny
```

Once a project creates a namespace with that label, the generic cluster default-deny applies automatically. The project's own `CiliumNetworkPolicy` resources then add only the traffic that project needs. The label is deliberately opt-in so installing Cilium cannot unexpectedly isolate unrelated namespaces.

See `examples/cilium/project-network-policy.yaml` for the project-side pattern.

## K3s migration boundary

Cilium is intended to become the primary CNI, not a permanent Flannel chaining layer. K3s therefore has to be configured with its built-in Flannel CNI and network-policy controller disabled before the first Cilium installation:

```yaml
# /etc/rancher/k3s/config.yaml
flannel-backend: none
disable-network-policy: true
```

Treat this as a maintenance-window dataplane migration. Keep SSH/console access to the node and do not run the first install through the generic `scripts/deploy.sh all` path.

The bootstrap requires an explicit acknowledgement:

```bash
CILIUM_K3S_READY=true ./scripts/deploy-cilium.sh
```

Upgrades of an existing `cilium/cilium` release do not require the acknowledgement.

## Initial dataplane choices

The first Cilium rollout intentionally keeps the change surface small:

- Cilium `1.20.1` pinned by the bootstrap script
- dedicated `cilium` namespace
- cluster-pool IPAM using the K3s `10.42.0.0/16` pod CIDR
- VXLAN tunnel routing
- kube-proxy retained (`kubeProxyReplacement: false`)
- policy enforcement mode `default`
- Hubble + Relay + UI enabled, with no public ingress

Kube-proxy replacement can be evaluated later as its own change after the Cilium dataplane and policies are stable.

## KubeClaw policy cutover

The KubeClaw base policies are now expressed as `CiliumNetworkPolicy`. The migration is intentionally two-phase so a failed conversion cannot create an accidental allow-all window:

```bash
./scripts/migrate-kubeclaw-network-policies-to-cilium.sh apply
kubectl -n kubeclaw get ciliumnetworkpolicies

# Verify application traffic and policy verdicts, then:
./scripts/migrate-kubeclaw-network-policies-to-cilium.sh cleanup
```

The `cleanup` phase refuses to delete the old baseline until replacement Cilium policies exist.

Cilium also continues to understand ordinary Kubernetes `NetworkPolicy`. This is useful for portable Helm components and controller-generated ephemeral rules; Cilium remains the enforcement engine even when a project chooses the portable Kubernetes API for a particular rule.

## Hubble

Hubble is enabled as part of the central installation. The UI is not exposed publicly:

```bash
kubectl -n cilium port-forward svc/hubble-ui 12000:80
```

For CLI-level policy debugging:

```bash
kubectl -n cilium exec ds/cilium -c cilium-agent -- cilium-dbg endpoint list
kubectl -n cilium exec ds/cilium -c cilium-agent -- hubble observe --last 50
```

## Rule of thumb

Change central Cilium when the concern is cluster networking itself. Change a project when the concern is who that project's workloads may talk to.
