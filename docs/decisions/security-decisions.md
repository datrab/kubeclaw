# Security Decisions

Status: current
Audience: operator, maintainer

## Separate sandbox posture for Buster

Decision: Buster runs with sandbox-specific image, service account, RBAC, and privileged container settings.

Reason: Buster performs browser, container, Kubernetes, and destructive test work that the general Nova image does not perform.

## Custom skills as extension-only

Decision: Helm `customSkills` cannot override protected core runtime paths.

Reason: The deployment init script rejects protected custom skill paths, and the ConfigMap template documents the extension-only boundary.

## Secret redaction and runtime persistence

Decision: Runtime code redacts common secret keys from logs and subprocess environments, while deployment writes rendered OpenClaw config to the agent config PVC.

Reason: Redaction reduces accidental disclosure in runtime artifacts. Persisted config remains a tracked risk because substituted secrets can live in PVC-backed files.
