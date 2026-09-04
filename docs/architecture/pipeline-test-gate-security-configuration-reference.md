# Security suite configuration reference

All provider schemas reject unknown fields.

- `profile`: Header profile `api-http-v1` or `web-https-v1`.
- `paths`: One to 32 absolute URL paths without query text or fragments.
- `rules.add`, `rules.replace`, `rules.remove`: Named header changes. Each rule defines an ID, lowercase header, severity, check kind, and required value when applicable.
- `projectDirectory`: Repository-relative dependency root.
- `requestTimeoutMs`: Per-request deadline for the header provider.
- `timeoutMs`: Per-capability deadline inside the smaller operator deadline.
- `policy`: Required strict security policy object.
- `policy.profile`: Must be `strict-v1`.
- `policy.acceptances`: Up to 128 exact entries with finding ID, reason of at least eight characters, and RFC 3339 expiry.

Operator-only fields include the Trivy executable and database path, registry prefixes, kubectl executable, controller namespace, lease API group, namespace prefixes, output ceilings, and polling interval. A project cannot change these fields.
