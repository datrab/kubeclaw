# Prism phase 9 audit

Status: passed for chart rendering and static security checks. Cluster deployment proof remains an environment acceptance step.

The chart contains separate control, Studio, worker, optional ingestion, and PostgreSQL workloads. Service account tokens are off. Application pods have no Kubernetes RBAC. Containers drop all capabilities and use read-only root filesystems where applicable. Network access starts denied. Studio is the only Tailscale-facing service. Resource values are generous and configurable. A weekly backup restore proof job is included.

Proof: `npm run verify:prism:helm`.
