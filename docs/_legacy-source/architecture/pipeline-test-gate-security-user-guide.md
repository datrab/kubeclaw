# Security suite user guide

The Security Suite is an editable group of separate tests. Add only the domains that apply to your project. The provided suite contains all five domains.

## Inputs

- Security headers consume one typed Kubernetes deployment endpoint.
- Dependency scan reads one repository-relative project directory.
- Image scan consumes the exact `container-image.v1` output from the build node.
- Kubernetes policy consumes the checked-manifest artifact.
- Kubernetes runtime security consumes both the deployment fixture and checked manifest.

Use `api-http-v1` for an internal HTTP fixture. Use `web-https-v1` only for HTTPS. You can add, replace, or remove named header rules. The resolved rule set is stored in evidence.

An acceptance is exact. It has `findingId`, `reason`, and `expiresAt`. It does not hide the finding. Expired and unused acceptances stay visible. Do not use a numeric failure allowance.

The strict policy blocks critical or high findings, active threats, and vulnerable packages without a known fix. A scanner error is not a passing result.
