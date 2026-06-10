# Deployment Decisions

Status: current
Audience: operator, maintainer

## Shared Helm chart

Decision: Nova and Buster use one chart with role-specific values.

Reason: The chart renders common ConfigMaps, PVCs, services, deployments, and optional RBAC while values decide image, command, ports, sandboxing, service account, and sidecars.

## NodePort exposure

Decision: Production values expose gateway and supporting services through NodePorts where configured.

Reason: Current values set NodePorts for Nova, Buster, LiteLLM, registry-local, and Nova's Prism preview sidecar. This is documented as current behavior and tracked as a risk in `../open-issues.md`.

## Legacy processor removal

Decision: The former processor deployment surface is not part of current rendered manifests.

Reason: Deployment verification asserts that no stream-processor sidecar, processor ConfigMap, `.Values.processor`, or production `processor:` values remain.
