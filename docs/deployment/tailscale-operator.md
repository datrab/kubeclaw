# Tailscale private access

The repository defines four private ingress families and an optional outbound
Ops connection. Their current external Tailnet policy is **not recorded here**.
A rendered Ingress or a Ready proxy does not establish which clients may access
it. Local T1/T2 completion remains open until each row is bound to a current
redacted policy revision and real allowed/denied clients, with the required local
checks and documentation complete. Live tests remain a separate acceptance gate
under D12; they are not claimed by that local completion.

## Access and credential inventory

| Path | Authored endpoint and backend | Network identity | Application decision and credential owner |
| --- | --- | --- | --- |
| Argo CD | `argocd`; `argocd/argocd-server:80` | Ingress class `tailscale`; inherits proxy default `tag:k8s` | Argo login and RBAC still decide permitted operations. Tailnet administrator owns grants/tag owners; Argo administrator owns application credentials. [Manifest](../../my-values/infra/argocd-tailscale-ingress.yaml). |
| Nova architecture viewer | Default `nova-architecture`; generated Nova Archviewer Service, port 3456 | Same inherited proxy tag; backend policy selects the managed proxy and its parent resource/namespace | HTTP Basic Auth uses `nova-archviewer-auth`, key `htpasswd`; `/healthz` is a probe, not an authenticated content check. Nova operator owns this Secret. [Values](../../my-values/nova-values.yaml), [template](../../charts/kubeclaw/templates/archviewer.yaml). |
| Prism Studio | Default `prism-studio`; Studio Service port 80 | Same inherited proxy tag; backend policy selects its managed proxy | Studio forwards the server-held `PRISM_INGRESS_SECRET` to Control. This does **not** authenticate each Tailnet browser individually. Missing secret blocks Control proxying with 503. The Prism operator owns the external secret. [Service/Ingress](../../charts/prism/templates/services.yaml), [configuration](../operations/operator-configuration.md#studio-listener-and-control-proxy). |
| Dynamic Buster previews | Lease-bound hostname/path, Service and port from the accepted exposure | Controller creates class `tailscale`, without a per-Ingress tag override; therefore shares the proxy default tag | Application authentication belongs to the deployed preview and its declared credential flow; Tailnet reachability alone proves no application login. Buster owns lease/endpoint lifecycle. [Controller](../../cmd/buster-namespace-controller/main.go), [exposure provider](../../skills/buster/plugins/tailscale-exposure/src/provider.js). |
| Optional Ops sidecar | Outbound SOCKS at `127.0.0.1:1055` inside the Pod; **no inbound Ops Ingress** | Device identity/tags come from the externally issued auth key and persistent login state; no fixed device tag is authored here | Disabled by default. Ops operator supplies `codex-ops-tailscale/authkey`; Tailnet administrator controls its issuance and device authority. MCP bearer authentication is separate and is not published by this sidecar. [Ops procedure](../ops/ops-pod.md), [workload](../../charts/ops-pod/templates/workload.yaml). |

The [operator values](../../my-values/infra/tailscale-operator-values.yaml) author
`tag:k8s-operator` for the operator and `tag:k8s` for proxies. None of these four
ingress authors supplies a distinct proxy tag. Record the **effective** external
grant destinations and tag owners; do not describe these services as separated
by distinct tags. Different application credentials do not establish different
network permissions. The dynamic Preview backend currently selects the operator
namespace `tailscale`; do not assume its policy follows a renamed namespace.

OAuth credentials are external: the default operator namespace is `tailscale`
and Secret `operator-oauth` contains `client_id` and `client_secret`. Empty inline
OAuth fields select this existing Secret path. The Tailnet administrator owns
OAuth privileges and allowed tags; the cluster operator owns Secret delivery.
Names of responsible people, external policy revision and actual OAuth grants
remain to be supplied. Keep only references and redacted policy evidence here.

The current release path pins the chart archive and operator/proxy images through
[versions.json](../../versions.json) and
[the infrastructure release resolver](../../scripts/infrastructure-release.mjs).
The older static infrastructure review's unpinned-chart statement describes its
historical review commit, not this current release path.

## Required client and decision matrix

Complete each row using actual device/user references from the redacted external
policy. The entries below define checks; they are not fabricated test identities
or evidence that the current policy already implements the intended restriction.

| Access | Allowed real client | Denied real client | Expected network and application observations |
| --- | --- | --- | --- |
| Argo CD | Pending policy/client reference | Pending policy/client reference | Allowed client reaches HTTPS and performs an explicitly permitted Argo operation. Denied client cannot reach the protected service. Separately, invalid app credentials must not permit that operation. |
| Nova architecture | Pending policy/client reference | Pending policy/client reference | Allowed client reaches HTTPS and reads an actual protected page with valid Basic credentials. Missing/wrong credentials deny content; a health probe alone is insufficient. Denied client cannot reach the service. |
| Prism Studio | Pending policy/client reference | Pending policy/client reference | Allowed client loads Studio and performs an intended Control operation. Denied client cannot reach Studio; server ingress-secret injection must not be mistaken for per-user authorization. |
| Each dynamic preview | Pending lease, policy and client references | Pending policy/client reference | Allowed client reaches the exact current lease hostname/path and performs the intended app action. Denied client cannot reach it. Include old/superseded or expired exposure identities and required app authentication. |
| Ops outbound route | Pending Ops device identity and allowed destination | Pending destination explicitly forbidden to that device | Through the actual localhost SOCKS path, the allowed connection succeeds and the forbidden destination cannot be reached. Do not invent an inbound listener or use successful MCP localhost access as Tailnet proof. |

For every row retain policy revision/digest, observation time, redacted source
identity, effective destination identity/tags/port, matching grant/ACL and tag-owner
references, plus separate network and application outcomes. A failure caused by
DNS, missing credentials, a stopped backend or a generally unreachable destination
is not evidence of a policy deny. Establish the allowed positive control in the
same test window. Do not store auth keys, OAuth secrets, bearer tokens or passwords
in these records.

## Rotation and recovery verification

Run the completed matrix before and after each applicable change: managed proxy
restart/recreation, OAuth credential rotation and HTTPS certificate renewal or
rotation. Preserve old/new device or proxy references and observed certificate
identity/validity without exporting private keys. Recheck application login and
lease ownership as well as network reachability. Report unexecuted changes
separately; replacing a Secret is not proof that a new credential was consumed.

For Ops, persistent state and `TS_AUTH_ONCE=true` can retain the existing login.
Changing its auth key alone is not a device rotation. Follow the existing
[Ops credential procedure](../ops/ops-pod.md), explicitly identify the device being
revoked/re-enrolled and repeat the outbound allow/deny checks. This sidecar does
not prove an independent host recovery path; IFR-28-001 remains separate.

## Diagnosis and local checks

First identify the failing layer: external client/device and grant, name/TLS,
operator/proxy reconciliation, backend Service/Endpoints and NetworkPolicy, then
application credentials. Read status/events without dumping Secret data. Compare
the actual parent resource/namespace labels with the backend policy. Preview
lease ownership, generation and expiry must match the endpoint being checked.

OAuth bootstrap distinguishes an absent Secret from an unavailable API through a
successful exact-name Secret collection lookup. Its caller needs namespace Secret
`list` permission, not only named `get`. Existing credentials are left untouched;
lookup, validation or Secret-apply failure stops installation. See
[deployment observation failures](setup-flow.md#troubleshooting).

`node --test tests/verification/contracts/infra-private-access.test.mjs` checks
local authored manifests and actual Helm rendering. Its synthetic namespaces and
CI image references are not real Tailnet clients, a cluster deployment or a live
policy check. [Current local scope and remaining evidence](../review/remediation/implementation/tailscale-access-matrix-20260921.md).
