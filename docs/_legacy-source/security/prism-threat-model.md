# Prism threat model

Prism treats generated documents, user text, assets, mock data, and imported
corpus material as untrusted data.

Controls:

- Studio has no database, Redis, provider, or Kubernetes credential.
- Preview uses an opaque-origin sandbox and a strict message contract.
- Runtime code is trusted and pinned. Design Documents cannot contain code.
- Ingestion blocks loopback, private, metadata, and redirect targets.
- All workloads drop Linux capabilities and disable service-account tokens.
- NetworkPolicy denies traffic by default.
- State changes require a signed session and CSRF token.
- Publication needs approval for the exact input digests.

The main remaining risks are supply-chain compromise, a bad reviewed component
pack, provider data handling, and operator error during backup or removal.
