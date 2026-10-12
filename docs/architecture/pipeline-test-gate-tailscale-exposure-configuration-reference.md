# Tailscale Exposure Configuration Reference

Status: authoritative

Audience: project authors and operators
Purpose: define supported Suite 7 fields

## Provider Fields

- `endpointName` selects one deployment endpoint. Omit it for one endpoint.
- `hostname` requests one DNS label from the Tailscale operator.
- `path` sets the Ingress path. The default is `/`.
- `readinessTimeoutSeconds` sets a limit from 1 to 3600 seconds.
- `retentionMode` is `release` (default) or `await-readiness`. The latter requests
  a retained exposure handoff and requires an `awaiting-readiness` phase plus a
  positive `exposureGeneration` in the capability result. Missing handoff fails
  the attempt; it is not evidence that the endpoint is already ready. Retention
  remains bounded by the owning fixture lease and its explicit release path.

The provider requires one `deployment` input with schema
`kubeclaw.kubernetes-deployment-fixture@1`.

The `exposure` output uses schema `kubeclaw.public-endpoint-fixture@1`. It
contains the provider, HTTPS URL, hostname, namespace, lease name, creation
time, expiry time, and release action. It contains no Secret value.

The public URL includes the selected Ingress path. A linked HTTP node uses this
path when its own `path` field is absent.

## Operator Fields

The operator sets `kubectlExecutable`, `controllerNamespace`, `leaseApiGroup`,
`leaseApiVersion`, `allowedNamespacePrefixes`, and `allowedHostSuffixes`.
The operator also sets `maximumExecutionMs` and `pollIntervalMs`.

Project setup converts the legacy `max_time_seconds` value to the HTTP request
timeout. Accepted values are from 1 through 300 seconds. One request timeout
now covers DNS, connection, and response work.
