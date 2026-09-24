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
> [The image contains only Nginx configuration and an initially empty `/designs` directory](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/docker/Dockerfile.archviewer#L1-L22).
>
> [The chart refuses non-Nova roles and legacy duplicate port ownership](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/charts/kubeclaw/templates/archviewer.yaml#L1-L10).

## Request Path

The container listens on TCP 3456. A dedicated ClusterIP Service exposes that
port. A Tailscale Ingress publishes the configured private hostname. A
CiliumNetworkPolicy permits port 3456 only from the Tailscale operator proxy
that owns this exact Ingress.

The Archviewer option therefore requires the Tailscale Ingress controller and
the Cilium CRD even though the main pipeline can run with another CNI. This is
an Archviewer deployment dependency, not a pipeline dependency. The template
does not have a non-Cilium policy variant.

This policy is additional defense, not the only authentication. Nginx requires
HTTP Basic authentication for documents. The htpasswd file comes from key
`htpasswd` in `archviewer.existingSecret`. `/healthz` is the only unauthenticated
path and returns a fixed `ok` response. Directory listing is disabled, and an
unknown document returns 404.

| Value | Default or rule |
| --- | --- |
| `archviewer.enabled` | `false` |
| `archviewer.existingSecret` | Required when enabled |
| `archviewer.hostname` | `nova-architecture` |
| `archviewer.tailscaleOperatorNamespace` | `tailscale` |
| Service/container port | 3456/TCP, fixed |

`archviewer.enabled` renders only the dedicated Service, Tailscale Ingress,
Cilium policy, and authentication Secret volume. It does not inject the Nginx
container or `/designs` mount. The current Nova deployment supplies those
separately through `extraContainers`. Thus both configuration parts must agree:
enabling the access resources without the sidecar leaves a Service with no
listener on pod port 3456; adding the sidecar without `archviewer.enabled` leaves no
dedicated private publication route or auth volume.

> **Source evidence — three access checks**
>
> [Nginx requires Basic auth, disables indexes, and exempts only health](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/docker/archviewer.nginx.conf#L1-L19).
>
> [Service, Tailscale Ingress, and Cilium policy bind the same private endpoint](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/charts/kubeclaw/templates/archviewer.yaml#L11-L53).
>
> [The deployment mounts only the named htpasswd key from the existing Secret](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/charts/kubeclaw/templates/deployment.yaml#L1644-L1652).

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
It does not prove authentication, Tailnet routing, Cilium policy, Secret quality,
or document presence.

The checked-in Nova example injects the sidecar through `extraContainers`,
mounts the workspace subpath `prism/designs`, and currently names the image
with a mutable `latest` tag. Treat that file as lab configuration. A controlled
release must replace the tag with the immutable Archviewer digest from the
release receipt before deployment.

> **Source evidence — current lab wiring**
>
> [The Nova values enable the private access resources](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/my-values/nova-values.yaml#L87-L92).
>
> [They separately define the actual sidecar and read-only workspace mount](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/my-values/nova-values.yaml#L147-L182).
>
> [Nova startup creates the directory but does not publish a document](https://github.com/datrab/kubeclaw/blob/569f7b4933d4859cc67c80ddf40d5154ffd95ce5/charts/kubeclaw/templates/deployment.yaml#L417-L430).

## Failure And Recovery

| Symptom | Likely boundary | Recovery |
| --- | --- | --- |
| Helm render fails | Wrong role, missing hostname/Secret, or duplicate legacy port. | Correct values; do not bypass the template guard. |
| Health works, document returns 401 | Credentials absent or wrong. | Use an account present in the mounted htpasswd file. |
| Document returns 403 | htpasswd file is unavailable or Nginx cannot read it. | Repair the Secret mount and file mode. |
| Document returns 404 | File is not present under `/designs`. | Check the publishing producer and shared volume. |
| Tailnet hostname does not connect | Tailscale Ingress, DNS, Service, or proxy ownership failed. | Trace the Ingress and exact proxy labels before changing Nginx. |
| Connection is denied only with Cilium | Policy does not recognize the owning proxy. | Compare namespace and parent-resource labels with the rendered policy. |

## Operation And Supported Changes

After a deployment change, render the chart and verify the Nova-only guard,
Secret name and `htpasswd` key, sidecar port, read-only `/designs` mount,
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
Tailscale DNS, TLS, or Cilium enforcement.
