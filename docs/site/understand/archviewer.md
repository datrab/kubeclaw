# Archviewer: Private Static Architecture Presentations

Status: implemented as an optional Nova sidecar
Audience: platform operator, documentation publisher, Nova maintainer, security reviewer
Owner: Archviewer maintainers
Evidence: docker/Dockerfile.archviewer; docker/archviewer.nginx.conf; charts/kubeclaw/templates/archviewer.yaml; tests/verification/reliability/archviewer-native.test.mjs
Evidence revision: `5b6e1b97415ffefa4bb42bf2ae331f27597170b5`
Applies to: Nova Helm release with `archviewer.enabled=true`
Last verified: image, chart, web-server configuration, and native-test inspection on 2026-09-20

## Purpose And Product Boundary

Archviewer serves generated HTML architecture presentations from `/designs`.
It is a small read-only Nginx surface. It does not generate designs, approve a
Prism revision, update Nova state, or provide a file editor.

The sidecar is Nova-only because it reads Nova's shared architecture output.
The chart fails when another agent role enables it. This makes storage ownership
clear and avoids several roles publishing different content under one hostname.

> **Source evidence — a static, Nova-only surface**
>
> [The image contains only Nginx configuration and an initially empty `/designs` directory](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/docker/Dockerfile.archviewer#L1-L22).
>
> [The chart refuses non-Nova roles and legacy duplicate port ownership](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/charts/kubeclaw/templates/archviewer.yaml#L1-L10).

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

> **Source evidence — three access checks**
>
> [Nginx requires Basic auth, disables indexes, and exempts only health](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/docker/archviewer.nginx.conf#L1-L19).
>
> [Service, Tailscale Ingress, and Cilium policy bind the same private endpoint](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/charts/kubeclaw/templates/archviewer.yaml#L11-L53).
>
> [The deployment mounts only the named htpasswd key from the existing Secret](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/charts/kubeclaw/templates/deployment.yaml#L1644-L1652).

## Publication And Lifecycle

A producer writes the HTML files to the shared design storage. Archviewer reads
the mounted `/designs` tree and serves the current bytes. There is no index
generator, content database, publication transaction, cache invalidation API,
or version selector in Archviewer itself. A partially written file can therefore
be observed. Publishers should write a new file completely and rename it into
place when the storage supports atomic rename.

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
> [The Nova values enable the surface and define the actual sidecar, mounts, and probes](https://github.com/datrab/kubeclaw/blob/5b6e1b97415ffefa4bb42bf2ae331f27597170b5/my-values/nova-values.yaml#L87-L178).

## Failure And Recovery

| Symptom | Likely boundary | Recovery |
| --- | --- | --- |
| Helm render fails | Wrong role, missing hostname/Secret, or duplicate legacy port. | Correct values; do not bypass the template guard. |
| Health works, document returns 401 | Credentials absent or wrong. | Use an account present in the mounted htpasswd file. |
| Document returns 403 | htpasswd file is unavailable or Nginx cannot read it. | Repair the Secret mount and file mode. |
| Document returns 404 | File is not present under `/designs`. | Check the publishing producer and shared volume. |
| Tailnet hostname does not connect | Tailscale Ingress, DNS, Service, or proxy ownership failed. | Trace the Ingress and exact proxy labels before changing Nginx. |
| Connection is denied only with Cilium | Policy does not recognize the owning proxy. | Compare namespace and parent-resource labels with the rendered policy. |

The native reliability test starts real Nginx and proves unauthenticated and
wrong-password denial, authenticated retrieval, disabled listing, fail-closed
behavior after credential removal, and independent health. It runs only when
`ARCHVIEWER_TEST_NGINX` points to a real Nginx binary. It does not prove live
Tailscale DNS, TLS, or Cilium enforcement.
