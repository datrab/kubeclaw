# Tailscale Exposure Operator Guide

Status: deployment configuration reference

Audience: KubeClaw operators
Purpose: configure and verify the Tailscale exposure fixture

## Required Parts

Install the Buster namespace controller, its CRD, and the Tailscale Kubernetes
operator. Configure the Tailscale Ingress class. Keep the lease controller as
the only Ingress owner for this fixture.

Add `kubernetes.exposure` to the Buster plan runtime. Configure the real
`kubectl` path, controller namespace, lease API, namespace prefixes, and
approved public suffixes. The default deployment permits only `.ts.net`.

The Buster lease client needs `get` and `patch` for BusterNamespaceLease
objects. The existing chart already grants these verbs. Do not grant direct
Ingress authority to the provider process.

## Run the Live Check

Deploy the current Nova and Buster images. Create a normal Kubernetes fixture.
Then run the live command inside the Buster plan container.

```sh
KUBECLAW_TAILSCALE_EXPOSURE_LIVE=1 \
KUBECLAW_TAILSCALE_LIVE_LEASE=test-LEASE \
KUBECLAW_TAILSCALE_LIVE_NAMESPACE=test-NAMESPACE \
KUBECLAW_TAILSCALE_LIVE_SERVICE=web \
KUBECLAW_TAILSCALE_LIVE_PORT=80 \
KUBECLAW_TAILSCALE_LIVE_EXPIRES_AT=LEASE-EXPIRY \
npm --prefix /app run verify:test-gate:tailscale-exposure-live
```

The command must reach the real Kubernetes API. It must wait for the real
Tailscale URL. It must send a real HTTPS request. It must disable the exposure
before it exits.
