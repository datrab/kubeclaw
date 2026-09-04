# Tailscale Exposure Error Reference

Status: authoritative

Audience: operators and project authors
Purpose: explain Suite 7 failures

- `TAILSCALE_EXPOSURE_DEPLOYMENT_INVALID` means the typed input is incomplete.
- `TAILSCALE_EXPOSURE_DEPLOYMENT_INPUT_INVALID` means the deployment link uses the wrong schema.
- `TAILSCALE_EXPOSURE_INPUT_UNKNOWN` means the fixture received an unsupported input name.
- `TAILSCALE_EXPOSURE_CONFIG_INVALID` means the fixture configuration is not an object.
- `TAILSCALE_EXPOSURE_REQUEST_INVALID` means a capability field has the wrong type or size.
- `TAILSCALE_EXPOSURE_CAPABILITY_REQUEST_INVALID` means the capability grant does not match the attempt.
- `TAILSCALE_EXPOSURE_OPERATION_INVALID` means the request does not use `prepare` or `release`.
- `TAILSCALE_EXPOSURE_INTERNAL_ENDPOINT_INVALID` means the Service URL does not match the leased namespace.
- `TAILSCALE_EXPOSURE_ENDPOINT_AMBIGUOUS` means the deployment has multiple endpoints without a selection.
- `TAILSCALE_EXPOSURE_ENDPOINT_NAME_INVALID` means the selected endpoint name is not a DNS label.
- `TAILSCALE_EXPOSURE_ENDPOINT_NOT_FOUND` means the selected endpoint does not exist.
- `TAILSCALE_EXPOSURE_PATH_INVALID` means the Ingress path is unsafe or malformed.
- `TAILSCALE_EXPOSURE_HOSTNAME_INVALID` means the requested Tailscale name is not a DNS label.
- `TAILSCALE_EXPOSURE_READINESS_TIMEOUT_INVALID` means the configured wait limit is outside the allowed range.
- `TAILSCALE_EXPOSURE_KUBECTL_INVALID` means the configured `kubectl` file is not available.
- `TAILSCALE_EXPOSURE_KUBECTL_FAILED` means the real `kubectl` process failed.
- `TAILSCALE_EXPOSURE_KUBECTL_OUTPUT_LIMIT` means `kubectl` exceeded its output limit.
- `TAILSCALE_EXPOSURE_API_INVALID` means the lease API group or version is invalid.
- `TAILSCALE_EXPOSURE_CONTROLLER_NAMESPACE_INVALID` means the controller namespace is invalid.
- `TAILSCALE_EXPOSURE_NAMESPACE_POLICY_INVALID` means the namespace-prefix policy is invalid.
- `TAILSCALE_EXPOSURE_NAMESPACE_DENIED` means the lease namespace is outside the approved prefixes.
- `TAILSCALE_EXPOSURE_HOST_POLICY_INVALID` means the host-suffix policy is empty or invalid.
- `TAILSCALE_EXPOSURE_HOST_SUFFIX_INVALID` means one approved suffix is malformed.
- `TAILSCALE_EXPOSURE_RBAC_DENIED` means Buster lacks lease get or patch access.
- `TAILSCALE_EXPOSURE_LEASE_MISMATCH` means the lease does not own the requested Service.
- `TAILSCALE_EXPOSURE_LEASE_EXPIRED` means the deployment lifetime ended.
- `TAILSCALE_EXPOSURE_LEASE_NAME_INVALID` means the lease name is not a DNS label.
- `TAILSCALE_EXPOSURE_LEASE_CHANGED` means ownership or expiry changed during the operation.
- `TAILSCALE_EXPOSURE_CONTROLLER_FAILED` means the controller reported a failed lease or exposure.
- `TAILSCALE_EXPOSURE_READINESS_TIMEOUT` means the controller did not publish the URL in time.
- `TAILSCALE_EXPOSURE_URL_INVALID` means controller status contains an unsafe or noncanonical URL.
- `TAILSCALE_EXPOSURE_HOST_DENIED` means the URL is outside an approved public suffix.
- `TAILSCALE_EXPOSURE_HOST_MISMATCH` means the URL host differs from the controller host fact.
- `TAILSCALE_EXPOSURE_PREPARATION_FAILED` means the capability did not return the required endpoint facts.
- `TAILSCALE_EXPOSURE_ROLLBACK_FAILED` means preparation failed and the compensating exposure-disable patch also failed; inspect both causes before retrying.
- `TAILSCALE_EXPOSURE_CANCELLED` means Nova or Buster cancelled the attempt.

Do not add a fixed URL as a fallback. Correct the lease, controller, Tailscale
operator, or policy problem.
