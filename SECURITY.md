# Security Policy

## Reporting security issues

This repository does not yet publish a maintainer-selected public security contact or disclosure channel. Do not disclose exploitable issues publicly before maintainers have selected one. Use the private maintainer coordination channel available to your repository access, then track any source-backed remediation in `docs/open-issues.md`.

The missing public security contact is recorded as a documentation and process gap in `docs/open-issues.md`.

## Current documented security surfaces

- Kubernetes RBAC and Buster sandboxing are documented in `docs/deployment/rbac-and-sandbox.md`.
- Secret sources and runtime persistence are documented in `docs/deployment/secrets.md`.
- NodePort exposure and networking are documented in `docs/deployment/networking.md`.
- The architecture trust model is documented in `docs/architecture/security-model.md`.
