# Tailscale Exposure Provider

`kubeclaw.tailscale-exposure@1` exposes one Kubernetes deployment fixture to
the configured Tailscale network.

The provider consumes a typed deployment value. It asks the brokered
`kubernetes.exposure` capability to update the existing namespace lease. It
returns a typed HTTPS endpoint after the controller reports readiness.

The provider does not receive Kubernetes credentials. It does not test page
content. Link its output to `kubeclaw.http@1` for HTTP assertions.

Cleanup verifies the same lease and disables exposure. The deployment lease
keeps final expiry and namespace cleanup authority.
