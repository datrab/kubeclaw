# Service routes and diagnosis

Status: source-backed procedure; live routing unverified
Audience: operator, platform maintainer
Owner: platform networking
Evidence: charts/kubeclaw/templates/service.yaml; charts/prism/templates/services.yaml; charts/ops-pod/templates/workload.yaml; scripts/docs-kubernetes-core-receiver-contracts.mjs
Applies to: supported local Service producers and the explicitly selected upstream source baselines
Last verified: 2026-10-10; source and local renders checked, cluster behavior unverified

A stored Service is network intent. It does not prove that a Pod listens, that DNS has updated, or that a client is allowed to connect. Use this page to find the selected producer, understand its receiving path, and inspect the failed stage before any change. The generated [configuration precedence](configuration-precedence.md) and [Helm values](helm-values.md) provide field types, defaults and input authorities. This page explains their product relationships; it does not duplicate the full field tables.

## Find the producer

Use the deployment's release namespace and selected procedure. Raw manifests and Helm releases are separate authorities; do not merge their values as if they update one universal Service. For Helm, chart defaults are followed by the ordered selected values files and explicit command overrides. Inspect the render and stored object to resolve admission changes and field ownership.

| Producer and selection | Namespace and selector | Service port → target and effective exposure |
| --- | --- | --- |
| `charts/kubeclaw/templates/service.yaml`, every agent release | Release namespace; `_helpers.tpl` selects `app.kubernetes.io/name=kubeclaw` and exact release instance, without role/component | Default ClusterIP: gateway 18789 → `gateway`; enabled bridge 18790 → `bridge`. Deployment declares the named ports. Extra ports also join this Service. |
| Same chart with supported NodePort override | Same release selector | Positive gateway/bridge nodePort values are emitted only for NodePort; zero omits the field and requests allocation. Extra port nodePort is emitted on this main Service only for NodePort. |
| Same chart with supported LoadBalancer override | Same release selector | Gateway/bridge fixed nodePort inputs are ignored by the template. API defaults request LB node-port allocation. This requires an externally supplied cluster controller/provider, described below. |
| `service-extra-nodeports.yaml`, extra port has nodePort and main type is not NodePort | Same release namespace/selector; separate `<fullname>-<port-name>` identity | Dedicated NodePort route in addition to the extra port on the main Service, including with a LoadBalancer main Service. |
| `my-values/prism-agent-values.yaml` | Agent release namespace/selector | Gateway 8080 → `prism-dispatch`; bridge disabled. Match the actual sidecar named port. |
| `my-values/buster-values.yaml` | Agent release namespace/selector | Adds 18891 → `buster-plan`, supplied by the sidecar. |
| `examples/nova-values.yaml` | Agent release namespace/selector | nodePort 30063 alone leaves default ClusterIP; the NodePort-only branch does not emit it. It is an inactive override, not an exposed port. |
| GitOps LiteLLM `resources.yaml` | Explicit `kubeclaw`; `app=litellm` | TCP 4000 → numeric 4000; NodePort 30050. |
| Direct apply of raw `my-values` LiteLLM manifest | Manifest omits namespace; the apply command/context selects it; `app=litellm` | TCP 4000 → numeric 4000; NodePort number omitted, so the API allocates it. |
| `scripts/deploy.sh` LiteLLM procedure | Selected `NAMESPACE`, including workspace selection; `app=litellm` | Renderer/apply first requests allocation, then a merge patch replaces the single port list with `LITELLM_NODE_PORT`. Default 30050; procedure validates 30000–32767. Read the stored result after either step. |
| GitOps registry-local | Explicit `kubeclaw`; `app=registry-local` | TCP 5001 → numeric 5000; NodePort 30051. |
| Direct raw my-values registry-local or selected registry renderer | Raw input omits namespace; direct apply/context or script `NAMESPACE` selects it; `app=registry-local` | TCP 5001 → numeric 5000; ClusterIP. The separate raw registry-mirror is also ClusterIP in its selected apply namespace. |
| Prometheus external-chart values | Namespace/selector from selected chart render | Values request NodePort 30030. Values alone are not a full render or a proof of the external chart's listener/selector. Use its pinned chart authority and generated inventory. |
| `charts/prism/templates/services.yaml` | Release namespace; `app=prism-studio`, `prism-control`, `prism-worker` or enabled `prism-ingestion` | 80 → 8080 or 8080 → 8080; omitted type/protocol default ClusterIP/TCP. Conditional SPIFFE trust Services use 8443 → `worker-trust`. Inspect matching workload and trust policy. |
| `charts/prism/templates/postgresql.yaml`, PostgreSQL enabled | Release namespace; `app=prism-postgresql` | 5432; omitted targetPort defaults to numeric 5432. |
| `demo-ready-service.yaml`, broker enabled, Buster role and controller readiness enabled | Release namespace; release labels plus `component=buster-namespace-controller` | ClusterIP 8443 → `demo-ready`; its NetworkPolicy names allowed producer namespaces/Pods. |
| `archviewer.yaml`, archviewer enabled and Nova role | Release namespace; agent release selector | ClusterIP 3456 → `archviewer`; separate Tailscale ingress and Cilium policy. Requires the configured private ingress owner and sidecar listener. Other roles fail rendering. |
| `charts/ops-pod/templates/workload.yaml` | Release namespace; exact release-name label | Headless `clusterIP: None`, health 8080 → 8080; StatefulSet serviceName links stable network identity. The ops-mcp loopback listener is not exposed by this declaration. |

Product evidence at revision `57ba25bbf55f53a55efc65ede06b0e0d90eb0a70`: [main Service template](https://github.com/datrab/kubeclaw/blob/57ba25bbf55f53a55efc65ede06b0e0d90eb0a70/charts/kubeclaw/templates/service.yaml#L1-L36), [dedicated extra NodePort template](https://github.com/datrab/kubeclaw/blob/57ba25bbf55f53a55efc65ede06b0e0d90eb0a70/charts/kubeclaw/templates/service-extra-nodeports.yaml#L1-L22), [Prism Services](https://github.com/datrab/kubeclaw/blob/57ba25bbf55f53a55efc65ede06b0e0d90eb0a70/charts/prism/templates/services.yaml#L1-L39), and [Ops headless identity](https://github.com/datrab/kubeclaw/blob/57ba25bbf55f53a55efc65ede06b0e0d90eb0a70/charts/ops-pod/templates/workload.yaml#L8-L24). The exact selected raw/value paths are listed in the generated Helm reference.

The deployment script initializes `NAMESPACE` from a nonempty environment value
or `kubeclaw`; its selected workspace command can replace that namespace.
For LiteLLM, a nonempty `LITELLM_NODE_PORT` environment value overrides 30050.
The later port-list patch takes precedence over the rendered omission. The
script's numeric range check does not prove that the cluster allocator permits
or can allocate that port. Apply can succeed while the later patch fails, leaving
the initially allocated port active. After an error or interrupted response,
read the current Service namespace, UID and port list before repeating a change.
See [environment inputs](environment-variables.md) and the pinned
[namespace and port defaults](https://github.com/datrab/kubeclaw/blob/d52688cd8ca79337fc377a04e9a2ebeaa713b35f/scripts/deploy.sh#L82-L91),
[workspace selection](https://github.com/datrab/kubeclaw/blob/d52688cd8ca79337fc377a04e9a2ebeaa713b35f/scripts/deploy.sh#L675-L684),
[LiteLLM render, apply and patch](https://github.com/datrab/kubeclaw/blob/d52688cd8ca79337fc377a04e9a2ebeaa713b35f/scripts/deploy.sh#L1166-L1180),
and [registry render and apply](https://github.com/datrab/kubeclaw/blob/d52688cd8ca79337fc377a04e9a2ebeaa713b35f/scripts/deploy.sh#L1195-L1216).

Selectors select Pods only in the Service namespace. The broad agent release selector can match additional Pods with the same labels. A selector is not authorization. A numeric targetPort selects that number; a named targetPort must resolve with the matching protocol on the selected Pod. Declaring a container port does not start a listener.

All IP-bearing local routes omit requested clusterIP/clusterIPs/families/family policy. Their allocated addresses and primary family depend on the actual API allocator. Do not infer IPv4 or dual stack from an example. The omitted affinity defaults to None, internal traffic policy to Cluster, and NodePort/LB external policy to Cluster. publishNotReadyAddresses defaults false. These producers do not request trafficDistribution, externalIPs, LB source ranges/class/IP. For LB, node-port allocation defaults true; Cluster external policy does not request a healthCheckNodePort. Admission can change the stored result.

The supported main-chart type policy is ClusterIP, NodePort or LoadBalancer. Explicit empty service.type renders YAML null, then fresh typed API decoding/defaulting produces ClusterIP. Removing the override uses the chart default. ExternalName can render but this chart has no externalName input, so it cannot produce the required nonempty alias. Treat that and other unused Kubernetes alternatives as [upstream API reference](https://kubernetes.io/docs/reference/kubernetes-api/service-resources/service-v1/) choices, not supported chart interfaces.

## Understand the receiving path

The source scope is Kubernetes v1.35.0, revision `66452049f3d692768c39c797b21b793dce80314e`, and conditional CoreDNS v1.13.1, revision `1db4568df6aaacda6ebbce87717156bd855f8103`. These are source expectations, not the discovered installed versions.

[Service defaults, lines 106–163](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/apis/core/v1/defaults.go#L106-L163) supply type, protocol, targetPort and applicable traffic policies. [Validation, lines 6570–6777](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/apis/core/validation/validation.go#L6570-L6777) rejects invalid type/port/IP combinations, including ExternalName without its name. [Allocation, lines 65–188](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/registry/core/service/storage/alloc.go#L65-L188) is a distinct storage stage: a valid intent can still encounter allocation failure.

[EndpointSlice reconciliation, lines 395–415](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/pkg/controller/endpointslice/endpointslice_controller.go#L395-L415) selects namespace-local Pods for nonnil selectors and skips ExternalName. [Endpoint conversion, lines 38–101](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/staging/src/k8s.io/endpointslice/utils.go#L38-L101) records readiness/termination and skips unresolved target ports; [named resolution, lines 381–409](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/staging/src/k8s.io/endpointslice/utils.go#L381-L409) reads regular and restartable-init container ports. Headless skips VIP allocation and virtual-Service forwarding. Conditional [CoreDNS queries, lines 487–539](https://github.com/coredns/coredns/blob/1db4568df6aaacda6ebbce87717156bd855f8103/plugin/kubernetes/kubernetes.go#L487-L539) return endpoint addresses for headless queries and cluster addresses for ordinary ClusterIP queries. Default readiness filtering can suppress headless addresses.

`my-values/infra/cilium-values.yaml` sets kubeProxyReplacement false and keeps kube-proxy. Do not infer Cilium Service replacement. The cluster networking owner must supply deployed API/K3s version, address/NodePort allocator ranges and families, kube-proxy image/configuration/mode and DNS image/Corefile/zone. The receiver reference preserves conditional iptables/IPVS/nftables and DNS clauses; only the supplied installed mode is applicable. For a replacement dataplane or DNS, qualify its immutable original source first. No propagation deadline follows from these sources.

A LoadBalancer override additionally requires the networking owner to identify the installed controller/provider and version, its default/class selection, image/source authority, address allocation/announcement/routing owner and external filtering/allowed-client rules. The chart supplies no class input. Do not assume K3s ServiceLB or the default cloud controller is installed. Stop before trusting external exposure when that authority is absent. Later proof must include the selected immutable provider contract, stored class/status/finalizers, controller/provider resources and separately authorized allowed/denied connectivity observations. The documentation owner records that evidence under its actual evidence class.

For the conditional default cloud controller, [cleanup, lines 374–398](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/staging/src/k8s.io/cloud-provider/controllers/service/controller.go#L374-L398) calls GetLoadBalancer, calls deletion only if exists is true, tolerates ImplementedElsewhere, and then attempts finalizer removal. Other errors stop that sequence. A removed finalizer does not prove external erasure. [Creation, lines 403–438](https://github.com/kubernetes/kubernetes/blob/66452049f3d692768c39c797b21b793dce80314e/staging/src/k8s.io/cloud-provider/controllers/service/controller.go#L403-L438) can leave completed provider work with stale API status after a publication error.

## Act: inspect without changing the cluster

Run from an approved operator workstation with kubectl compatible with the supplied server version and read access to the named namespace, Pods, EndpointSlices, events, workloads and relevant cluster controller/DNS configuration. RBAC denial is an access boundary; obtain the required read authority from the cluster owner. The examples assume POSIX shell, kubectl and jq. Replace `APPROVED_CONTEXT`, `SERVICE_NAMESPACE` and `SERVICE_NAME` with the approved context and identity from the selected producer/render. Replace controller/DNS identities only after discovery by their owner; never guess a production context.

```sh
ctx='APPROVED_CONTEXT'
ns='SERVICE_NAMESPACE'
svc='SERVICE_NAME'
kubectl config get-contexts "$ctx"
kubectl --context "$ctx" version --client
kubectl --context "$ctx" get --raw /version
kubectl --context "$ctx" -n "$ns" get service "$svc" -o json
kubectl --context "$ctx" -n "$ns" get service "$svc" -o yaml --show-managed-fields
kubectl --context "$ctx" -n "$ns" get events --field-selector involvedObject.kind=Service,involvedObject.name="$svc"
```

Confirm identity, UID, resourceVersion, owners, managedFields, selector, all ports/targetPorts/nodePorts, clusterIPs/families/policies, class, status and finalizers. An absent object after a rejected write is different from a stored object with no backends. Events are transient and their absence proves no success. Keep request errors and the selected render alongside these reads; validation errors and allocator exhaustion occur before a working Service exists.

```sh
selector=$(kubectl --context "$ctx" -n "$ns" get service "$svc" -o json | jq -r '.spec.selector // {} | to_entries | map(.key + "=" + .value) | join(",")')
printf '%s\n' "$selector"
if [ -z "$selector" ]; then
  printf "%s\n" "STOP: confirm the stored selector with the deployment owner." >&2
  exit 1
fi
# Confirm this is the expected selector before the next reads.
kubectl --context "$ctx" -n "$ns" get pods -l "$selector" -o json
kubectl --context "$ctx" -n "$ns" get endpointslices -l "kubernetes.io/service-name=$svc" -o json
```

An empty selector command would list every Pod; stop and inspect the stored nil/empty representation and producer before using it. No matching Pod indicates labels/namespace/workload selection failure. Matching unready Pods indicate workload readiness failure; inspect their conditions and the named workload's events/logs with approved read access. Compare each targetPort with Pod container ports, protocol, address and readiness. A missing name is not a listener failure: the controller can omit the endpoint port. Compare Slice Service owner UID, manager, address family, port and ready/serving/terminating fields. Missing or stale Slices with matching ready Pods require EndpointSlice controller/version/events/log evidence from its owner; do not create manual Slices as recovery.

For routing and DNS, the networking owner supplies `SYSTEM_NAMESPACE`, `PROXY_CONFIGMAP`, `PROXY_WORKLOAD`, `DNS_CONFIGMAP` and `DNS_WORKLOAD` identities. Use only the identities and resource kinds the owner confirms:

```sh
system_ns='SYSTEM_NAMESPACE'
proxy_cm='PROXY_CONFIGMAP'
proxy_workload='PROXY_WORKLOAD'
dns_cm='DNS_CONFIGMAP'
dns_workload='DNS_WORKLOAD'
kubectl --context "$ctx" -n "$system_ns" get configmap "$proxy_cm" -o yaml
kubectl --context "$ctx" -n "$system_ns" get "$proxy_workload" -o yaml
kubectl --context "$ctx" -n "$system_ns" get configmap "$dns_cm" -o yaml
kubectl --context "$ctx" -n "$system_ns" get "$dns_workload" -o yaml
```

Workload placeholders include a kind/name, such as `daemonset/kube-proxy` only if confirmed. K3s can package kube-proxy outside such a workload; ask its owner for the actual read-only configuration/log capture. Missing ConfigMaps are not proof of a disabled component. Confirm mode, images, DNS zone/cache/options and logs before assigning the fault to rules or DNS. Healthy Slices with failed forwarding require approved node rule/connection-tracking evidence for the selected mode; these API reads cannot prove kernel rules. Correct endpoint forwarding with a failed name requires query/cache evidence from an existing authorized client and actual DNS configuration. Record query name, server, result and time; distinguish unsynchronized SERVFAIL from synchronized NXDOMAIN and cache effects. No pod creation or exec is authorized by this procedure.

For LB, inspect the owner-supplied controller workload/configuration/logs and read-only provider inventory using its approved tool and identity. Compare provider resources with Service UID, class, ingress, finalizers and controller events. Pending status can indicate absent controller, provider failure or failed publication; an IP/hostname in status proves none of routing, firewall or authorization. Stop before relying on it when provider evidence is missing.

Inspect NetworkPolicy/Cilium policy separately from endpoint/routing checks. Inspect the actual application's listener/bind address separately from declared ports. Allowed and denied connectivity require their own authorized client identities, paths and observations; no Live PASS follows from this document or its offline checks.

These reads create no cluster resources and need no cluster cleanup. Save sanitized observations with timestamps/version/context/UID/resourceVersion as private evidence; protect internal addresses and policy information under operator rules. Concurrent reconciliation can change any read: capture another object/Slice snapshot if identities or versions differ. This procedure has no rollback because it makes no mutation. Recovery or a configuration rollback is a separate owner-authorized change: first read current object/ownership, correct the identified input or dependency and preserve immutable allocated fields where required. After an interrupted write, read before retrying. After uncertain LB cleanup, preserve provider resources and finalizers until the owner establishes their state; do not remove finalizers to force progress. Reverting values cannot guarantee rollback of provider work, allocator choices or application effects.

Execution status: the commands above are documented read-only checks, not executed live checks. Offline renders and pinned source reads do not establish admission, controller convergence, security, DNS, connectivity or provider cleanup success.
