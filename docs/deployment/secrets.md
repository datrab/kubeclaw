# Deployment Secrets

## Procedure

Store provider, gateway, Git, Discord, Redis, and registry credentials in
Kubernetes Secrets. Configuration contains references, not secret values.

## Verify

Confirm required Secret names and keys before starting the gateway.

## Common Failures

Missing references prevent adapter readiness. Secrets must never be copied into
plugin manifests or journals.
