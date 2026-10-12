# Security suite error reference

- `SECURITY_SCAN_HTTP_LAB_UNSUPPORTED`: an image belongs to the configured
  plaintext lab registry. This pinned scanner path cannot constrain plaintext
  transport without relaxing TLS verification and rejects the scan before
  invoking Trivy. Configure an authenticated HTTPS registry; do not interpret
  this unsupported path as a clean scan.
- `SECURITY_SCAN_REGISTRY_AUTH_INVALID`: the registry reference is malformed or
  its configured username/password is empty. Correct operator registry settings
  and external secret references before activating the capability. Never put
  secret values in the evidence log.
- `SECURITY_SCAN_*`: Invalid scan request, denied path or image, scanner failure, timeout, cancellation, output limit, or invalid result.
- `SECURITY_POLICY_*`: Invalid strict policy or acceptance.
- `SECURITY_HEADERS_*`: Invalid profile, path, rule, deployment, timeout, or response.
- `DEPENDENCY_SCAN_*`: Invalid repository directory, response, timeout, or configuration.
- `IMAGE_SCAN_*`: Missing or invalid immutable image input, response, timeout, or configuration.
- `KUBERNETES_POLICY_*`: Invalid checked manifest, response, timeout, or configuration.
- `KUBERNETES_RUNTIME_SECURITY_*`: Invalid lease input, path, namespace, broker result, timeout, cancellation, or configuration.
- `LEGACY_SECURITY_CONFIGURATION_RETIRED`: The old suite selection or configuration remains. Define explicit provider nodes.

All configuration and scanner failures are errors. A failed security assertion is a normal failed provider result with visible findings.

## Stable codes

| Code | Meaning |
|---|---|
| `SECURITY_POLICY_INVALID` | The strict policy object is invalid. |
| `SECURITY_POLICY_ACCEPTANCES_INVALID` | An acceptance is malformed, duplicated, or excessive. |
| `SECURITY_SCANNER_RESPONSE_INVALID` | A provider returned malformed scanner findings. |
| `SECURITY_SCAN_CAPABILITY_DENIED` | The caller requested a different capability. |
| `SECURITY_SCAN_OPERATION_DENIED` | The scan operation is not supported. |
| `SECURITY_SCAN_REQUEST_INVALID` | The trusted scan request is malformed. |
| `SECURITY_SCAN_PATH_DENIED` | A repository or manifest path is outside the approved root. |
| `SECURITY_SCAN_IMAGE_DENIED` | The image is mutable or outside an approved registry. |
| `SECURITY_SCAN_MANIFEST_DIGEST_MISMATCH` | The manifest bytes do not match the declared digest. |
| `SECURITY_SCAN_REGISTRY_POLICY_INVALID` | The operator registry allowlist is invalid. |
| `SECURITY_SCAN_LIMIT_INVALID` | An operator scan limit is invalid. |
| `SECURITY_SCAN_TIMEOUT` | Trivy exceeded the approved deadline. |
| `SECURITY_SCAN_CANCELLED` | The caller cancelled Trivy. |
| `SECURITY_SCAN_OUTPUT_LIMIT_EXCEEDED` | Trivy produced more output than permitted. |
| `SECURITY_SCANNER_EXECUTION_FAILED` | Trivy did not complete successfully. |
| `SECURITY_SCANNER_RESULT_INVALID` | Trivy returned invalid JSON or an unsupported result. |
| `KUBERNETES_RUNTIME_SECURITY_CAPABILITY_DENIED` | The caller requested a different capability. |
| `KUBERNETES_RUNTIME_SECURITY_OPERATION_DENIED` | The runtime operation is not supported. |
| `KUBERNETES_RUNTIME_SECURITY_REQUEST_INVALID` | The runtime request is malformed. |
| `KUBERNETES_RUNTIME_SECURITY_CONFIG_INVALID` | A required [RuntimeSecurity setting](buster-runtime-security-configuration.md) or direct constructor binding is missing or invalid. Validation precedes invoker file access. |
| `KUBERNETES_RUNTIME_SECURITY_PATH_DENIED` | The manifest path is outside the approved root. |
| `KUBERNETES_RUNTIME_SECURITY_NAMESPACE_DENIED` | The namespace is outside the approved prefixes. |
| `KUBERNETES_RUNTIME_SECURITY_MANIFEST_DIGEST_MISMATCH` | The local manifest bytes do not match the request's declared manifest digest; this check precedes lease lookup. |
| `KUBERNETES_RUNTIME_SECURITY_RESULT_DIGEST_MISMATCH` | The controller digest does not match the returned findings and counts. |
| `KUBERNETES_RUNTIME_SECURITY_LEASE_MISMATCH` | The lease does not own the requested namespace. |
| `KUBERNETES_RUNTIME_SECURITY_TIMEOUT` | The inspection deadline expired, either while executing kubectl or waiting for a matching, fresh controller observation. Check command progress and observation identity/timestamps. |
| `KUBERNETES_RUNTIME_SECURITY_CANCELLED` | The caller cancelled runtime inspection. |
| `KUBERNETES_RUNTIME_SECURITY_OUTPUT_LIMIT_EXCEEDED` | Combined stdout and stderr from one kubectl child exceeded the selected byte quota. This error takes precedence over the consequent abort signal. |
| `KUBERNETES_RUNTIME_SECURITY_EXECUTION_FAILED` | Kubectl could not start, exited unsuccessfully or ended on a signal. Nonzero-exit diagnostics include stderr truncated to the selected `diagnosticCodeUnits`; check executable access, credentials and the reported CLI error. |
| `KUBERNETES_RUNTIME_SECURITY_RESPONSE_INVALID` | The lease or controller status is malformed. |
