# Tailscale Exposure Security Model

Status: authoritative

Audience: security reviewers and operators
Purpose: define Suite 7 trust boundaries

The provider receives deployment facts. It does not receive Kubernetes or
Tailscale credentials. The Buster capability holds the projected Kubernetes
identity and runs `kubectl` without a shell.

The capability verifies the lease, namespace, Service, port, expiry, and
controller status. It accepts only HTTPS URLs under approved suffixes. It
rejects URL credentials and redirects remain under the HTTP provider policy.

The CRD permits changes only to `purpose` and `exposure`. Namespace ownership,
access, Service identity, retention, Secrets, and expiry inputs remain
immutable.

The controller digest covers those immutable fields. It excludes only purpose
and exposure. A bounded upgrade rule accepts the known former digest once.

Prepare and cleanup verify the same lease, namespace, Service, port, and
expiry. Cleanup cannot disable a different allowed lease by name alone.

The namespace controller creates and removes the Ingress. The provider cannot
create an Ingress directly. The returned value contains references and public
facts. It contains no Secret value.
