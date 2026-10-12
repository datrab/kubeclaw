# Final Preview

## Procedure

Publish previews only through a configured transport/notification capability.
The preview observer receives metadata and must not obtain scheduler authority.

## Verify The Result

Confirm the artifact digest, target, delivery receipt, and observer checkpoint.

## Common Failures

Missing transport grants block delivery without changing pipeline lifecycle.
Retry only with the same event and effect identity.

The dynamic Ingress inherits the operator's shared proxy tag; its hostname is
not an access rule. Bind each preview to the current external policy and actual
allowed/denied clients using the [private access matrix](../deployment/tailscale-operator.md#required-client-and-decision-matrix).
Check application credentials separately from Tailnet reachability and preserve
the lease's endpoint ownership, generation and expiry in the evidence. Current
external policy and client references remain outstanding; no live allow/deny
or rotation result is claimed here.
