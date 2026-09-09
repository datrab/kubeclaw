# Tailscale Exposure Provider

`kubeclaw.tailscale-exposure@1` exposes one Kubernetes deployment fixture to
the configured Tailscale network.

The provider consumes a typed deployment value. It asks the brokered
`kubernetes.exposure` capability to update the existing namespace lease. It
returns a typed HTTPS endpoint after the controller reports readiness.

The provider does not receive Kubernetes credentials. It does not test page
content. Link its output to `kubeclaw.http@1` for HTTP assertions.

Readiness acknowledges the exact exposure owner and Kubernetes lease generation.
The owner is derived from the immutable attempt and target identity; matching
replay adopts existing work, while changed input for that attempt is rejected.

Cleanup verifies the same owner and uses a resource-version precondition. A
superseded attempt leaves the replacement exposure intact. The controller also
uses conditional ingress updates and UID/resource-version deletion preconditions.
The deployment lease keeps final expiry and namespace cleanup authority; exposure
does not reset its lifetime. Final demo handoff must keep normal fixture cleanup
from releasing an exposure still needed by the operator.
