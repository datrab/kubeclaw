# Module 03 Review Gate

## Review Goal

Decide whether the landing page, Dockerfile, and Kubernetes manifest are ready
for final Buster validation.

## Review Checklist

- The app still serves a single coherent landing page.
- The three sections map clearly to the three module scopes.
- The Kubernetes manifest includes only Deployment and Service resources.
- The manifest does not include a namespace, Ingress, Tailscale resource, or
  private cluster-specific configuration.
- The Deployment has `/health` readiness and liveness probes.
- The Service exposes port `3000`.
- Unit tests cover page sections and basic manifest shape.

## Decision Policy

Return GO when the project is ready for final deterministic validation. Return
NO-GO for broken manifest shape, missing probes, missing tests, or accidental
Tailscale/approval scope.

