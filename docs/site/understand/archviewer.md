# Archviewer: Private Static Architecture Presentations

Status: implemented as an optional Nova sidecar
Audience: platform operator, documentation publisher, Nova maintainer, security reviewer
Owner: Archviewer maintainers
Evidence: docker/Dockerfile.archviewer; docker/archviewer.nginx.conf; charts/kubeclaw/templates/archviewer.yaml; tests/verification/reliability/archviewer-native.test.mjs
Evidence revision: `569f7b4933d4859cc67c80ddf40d5154ffd95ce5`
Applies to: Nova Helm release with `archviewer.enabled=true`
Last verified: image, chart, web-server configuration, and native-test inspection on 2026-09-20

## Purpose And Product Boundary

Archviewer serves generated HTML architecture presentations from `/designs`.
It is a small read-only Nginx surface. It does not generate designs, approve a
Prism revision, update Nova state, or provide a file editor.

The sidecar is Nova-only because it reads Nova's shared architecture output.
The chart fails when another agent role enables it. This makes storage ownership
clear and avoids several roles publishing different content under one hostname.

The source proves the Nova-only rule but does not record its historical design
reason. The current assessment is an inference: a static, read-only server has
a small attack and maintenance surface, and Nova placement avoids a separate
writable publication service. The cost is that Archviewer cannot validate,
version, atomically publish, or retire content. Reconsider this design when the
product needs a supported publisher, revision selection, or independent scaling.

> **Source evidence — a static, Nova-only surface**
>
> **Claim:** Archviewer is a read-only static consumer and its Helm access resources are Nova-only.
>
> **Implementation:** The image construction and chart role/provider guards below define that surface.
>
> [The image contains only Nginx configuration and an initially empty `/designs` directory](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/docker/Dockerfile.archviewer#L1-L22).
>
> [The chart refuses non-Nova roles, invalid policy providers, and legacy duplicate port ownership](https://github.com/datrab/kubeclaw/blob/f99aecbb00cb399b46dfbbeb3ddb375fba6218e7/charts/kubeclaw/templates/archviewer.yaml#L1-L13).
>
> **Contract or setting:** The linked chart checks role, selected policy provider and duplicate port ownership; it does not implement a publisher.
>
> **Test evidence:** [Chart policy-provider checks](https://github.com/datrab/kubeclaw/blob/f99aecbb00cb399b46dfbbeb3ddb375fba6218e7/tests/verification/deployment/archviewer-policy-provider.test.mjs#L37-L45) contains Cilium selection and unknown-provider render rejection assertions. These assertions are not a recorded execution result for this callout.
>
> **Revision:** `569f7b4933d4859cc67c80ddf40d5154ffd95ce5`; `f99aecbb00cb399b46dfbbeb3ddb375fba6218e7`. These are the source bindings for the explanation above, not execution receipts.
>
> **Limit:** A chart test is not live network enforcement, document publication or proof of the historical reason for Nova placement.

## Request Path

The container listens on TCP 3456. A dedicated ClusterIP Service exposes that
port. A Tailscale Ingress publishes the configured private hostname.
`archviewer.networkPolicyProvider` selects `cilium` (the default) or `kubernetes`.
The chart renders a CiliumNetworkPolicy or standard Kubernetes NetworkPolicy,
respectively. Both select Nova pods and admit TCP 3456 from the Tailscale operator
namespace and the proxy labels for this exact Ingress.

The Tailscale Ingress controller is required for both variants. Only the `cilium`
variant requires the Cilium CRD. For a non-Cilium deployment, explicitly select
`kubernetes` and use a CNI that enforces Kubernetes NetworkPolicy. Any other
provider value fails chart rendering. A successful render proves the selected
resource shape, not live network enforcement or equivalent whole-platform
security. Verify permitted proxy access and denied unrelated-pod access before
relying on the policy. Policies are additive: another applicable allow policy
can broaden access, so inspect all policies selecting the Nova pod.

This policy is additional defense, not the only authentication. Nginx requires
HTTP Basic authentication for documents. The htpasswd file comes from key
`htpasswd` in `archviewer.existingSecret`. `/healthz` is the only unauthenticated
path and returns a fixed `ok` response. Directory listing is disabled, and an
unknown document returns 404.

| Value | Default or rule |
| --- | --- |
| `archviewer.enabled` | `false` |
| `archviewer.networkPolicyProvider` | `cilium`; accepts `cilium` or `kubernetes` |
| `archviewer.existingSecret` | Required when enabled |
| `archviewer.hostname` | `nova-architecture` |
| `archviewer.tailscaleOperatorNamespace` | `tailscale` |
| Service/container port | 3456/TCP, fixed |

`archviewer.enabled` renders only the dedicated Service, Tailscale Ingress,
selected network policy, and authentication Secret volume. It does not inject
the Nginx container or `/designs` mount. The current Nova deployment supplies those
separately through `extraContainers`. Thus both configuration parts must agree:
enabling the access resources without the sidecar leaves a Service with no
listener on pod port 3456; adding the sidecar without `archviewer.enabled` leaves no
dedicated private publication route or auth volume.

> **Source evidence — three access checks**
>
> **Claim:** Document requests require Basic authentication; only health bypasses it, while chart policies select the private proxy path.
>
> **Implementation:** Nginx, chart access resources, defaults and Secret mount below define the independent checks.
>
> [Nginx requires Basic auth, disables indexes, and exempts only health](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/docker/archviewer.nginx.conf#L1-L19).
>
> [The current chart validates the provider and renders the private Service, Ingress, and selected policy](https://github.com/datrab/kubeclaw/blob/f99aecbb00cb399b46dfbbeb3ddb375fba6218e7/charts/kubeclaw/templates/archviewer.yaml#L5-L65).
>
> [The current chart validates the provider and renders the private Service, Ingress, and selected policy (continued 2)](https://github.com/datrab/kubeclaw/blob/f99aecbb00cb399b46dfbbeb3ddb375fba6218e7/charts/kubeclaw/templates/archviewer.yaml#L66-L80).
>
> [The current values default to Cilium](https://github.com/datrab/kubeclaw/blob/f99aecbb00cb399b46dfbbeb3ddb375fba6218e7/charts/kubeclaw/values.yaml#L529-L539).
>
> [The deployment mounts only the named htpasswd key from the existing Secret](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/charts/kubeclaw/templates/deployment.yaml#L1716-L1724).
>
> **Contract or setting:** The named htpasswd Secret/key and selected networkPolicyProvider control access; all policies selecting the Pod still matter.
>
> **Test evidence:** [Native Nginx access assertions](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/tests/verification/reliability/archviewer-native.test.mjs#L43-L56) contains unauthenticated/wrong-password denial, retrieval, listing denial and credential-removal checks. These assertions are not a recorded execution result for this callout. Execution requires ARCHVIEWER_TEST_NGINX pointing to a real Nginx binary; no run result accompanies this callout.
>
> **Revision:** `569f7b4933d4859cc67c80ddf40d5154ffd95ce5`; `f99aecbb00cb399b46dfbbeb3ddb375fba6218e7`; `0e35889a3c4e65d5c47ba88e924611aace67eb1d`. These are the source bindings for the explanation above, not execution receipts.
>
> **Limit:** The native local listener does not establish Tailnet DNS/TLS or CNI enforcement; health does not prove authenticated document availability.

## Publication And Lifecycle

Archviewer reads the Nova workspace volume subpath `prism/designs` through a
read-only mount at `/designs`. Nginx maps the request path directly to that
tree. The image starts with an empty `/designs` directory, but that image
directory is hidden by the mounted workspace in the deployed sidecar.

There is no implemented production publisher for this directory. The inspected
source creates the directory and configures the read-only consumer, but it does
not define which component may write a presentation, an input schema, a file
naming rule, HTML validation, atomic publication, revision selection,
retention, or cleanup. Therefore publication is not a supported Archviewer
operation. A file placed there by another mechanism can be served, but this
page cannot identify that mechanism as a product producer contract. Do not
infer that Prism baselines, Prism Studio, or Nova stage artifacts publish here.

This missing producer is the extension boundary. The Nova and Archviewer owners
must define and implement a writer contract before they promise end-to-end
publication. A supported publisher requires an authenticated producer identity, admitted
source artifact and revision, safe filename mapping, complete-write/atomic
visibility rule, content and size validation, conflict behavior, retention and
removal, failure recovery, and an end-to-end test that starts with the producer
request and ends with authenticated retrieval. Until then, a 404 for a missing
document is a stop condition, not a reason to restart Nginx or write into the
volume manually.

The empty directory is valid, so health can be green while no presentation is
published. Health proves only that Nginx is running and its configuration loaded.
It does not prove authentication, Tailnet routing, network-policy enforcement,
Secret quality, or document presence.

The checked-in Nova example injects the sidecar through `extraContainers`,
mounts the workspace subpath `prism/designs`, and currently names the image
with a mutable `latest` tag. Treat that file as lab configuration. A controlled
release must replace the tag with the immutable Archviewer digest from the
release receipt before deployment.

> **Source evidence — current lab wiring**
>
> **Claim:** The lab values add access resources and the sidecar/mount separately; startup creates a directory, not a supported presentation publisher.
>
> **Implementation:** The values and startup lines below are the deployed-wiring inputs for this distinction.
>
> [The Nova values enable the private access resources](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/my-values/nova-values.yaml#L91-L96).
>
> [They separately define the actual sidecar and read-only workspace mount](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/my-values/nova-values.yaml#L151-L186).
>
> [Nova startup creates the directory but does not publish a document](https://github.com/datrab/kubeclaw/blob/0e35889a3c4e65d5c47ba88e924611aace67eb1d/charts/kubeclaw/templates/deployment.yaml#L454-L467).
>
> **Contract or setting:** The read-only prism/designs mount and separate extraContainers configuration must agree; the lab image tag is not an immutable release receipt.
>
> **Test evidence:** No maintained end-to-end producer test is identified because this inspected wiring supplies no publisher contract. The [native viewer test](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/tests/verification/reliability/archviewer-native.test.mjs#L10-L26) creates its own presentation file; it is not a producer test or recorded run here.
>
> **Revision:** `0e35889a3c4e65d5c47ba88e924611aace67eb1d`; `569f7b4933d4859cc67c80ddf40d5154ffd95ce5`. These are the source bindings for the explanation above, not execution receipts.
>
> **Limit:** A file served from the fixture or mounted tree does not establish authenticated production publication, revision selection, retention or cleanup.

## Failure And Recovery

| Symptom | Likely boundary | Recovery |
| --- | --- | --- |
| Helm render fails | Wrong role, invalid policy provider, missing hostname/Secret, or duplicate legacy port. | Correct values; do not bypass the template guard. |
| Health works, document returns 401 | Credentials absent or wrong. | Use an account present in the mounted htpasswd file. |
| Document returns 403 | htpasswd file is unavailable or Nginx cannot read it. | Repair the Secret mount and file mode. |
| Document returns 404 | File is not present under `/designs`; no supported publisher creates it. | Stop. Preserve the request and mounted-volume observations. Do not restart Nginx or write a file manually; publication needs an implemented producer contract. |
| Tailnet hostname does not connect | Tailscale Ingress, DNS, Service, or proxy ownership failed. | Trace the Ingress and exact proxy labels before changing Nginx. |
| Connection is denied by the selected network policy | Policy does not recognize the owning proxy. | Compare namespace and parent-resource labels with the rendered CiliumNetworkPolicy or NetworkPolicy; do not disable the policy. |

## Operation And Supported Changes

After a deployment change, render the chart and verify the Nova-only guard,
policy provider and CNI enforcement support, Secret name and `htpasswd` key,
sidecar port, read-only `/designs` mount,
Service selector, Ingress hostname, and exact Tailscale proxy labels. In the
running environment, distinguish these observations:

- `/healthz` proves only Nginx process and configuration availability.
- 401 proves that the document path reached Basic authentication without valid
  credentials.
- 403 with credentials can indicate an unreadable or missing htpasswd file.
- 404 after authentication proves that Nginx did not resolve that path in its
  current mount; it does not prove why the producer-side file is absent.
- 200 proves retrieval of the current bytes only. It does not prove their
  source revision or completeness because no publication manifest exists.

Supported changes to the viewer are static-server or access changes: the Nginx
configuration, fixed port, Basic-auth Secret contract, Nova-only chart guard,
private Service/Ingress/policy, or sidecar image and mount wiring. Update the
native Nginx test and rendered chart tests with each such change. Adding a
publisher is not a small Nginx extension; it is the missing product contract
described above.

The native reliability test starts real Nginx and proves unauthenticated and
wrong-password denial, authenticated retrieval, disabled listing, fail-closed
behavior after credential removal, and independent health. It runs only when
`ARCHVIEWER_TEST_NGINX` points to a real Nginx binary. It does not prove live
Tailscale DNS, TLS, or network-policy enforcement.
