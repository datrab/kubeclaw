# HTTP Test Operator Guide

Status: Buster runtime configuration reference

Audience: KubeClaw operators
Purpose: configure the Suite 6 network boundary

## Responsibilities

The operator selects reachable origins, internal DNS suffixes, and ports. The
project selects only a target within that policy.

## Configure Buster

Add `network.http` to `allowedCapabilities`. Add the following object to the
Buster remote runtime configuration.

```json
{
  "networkHttp": {
    "allowedOrigins": ["https://service.example.test"],
    "allowedHostSuffixes": [".svc.cluster.local"],
    "allowedPorts": [80, 443, 8080],
    "maximumResponseBytes": 1048576,
    "maximumExecutionMs": 30000
  }
}
```

Use exact origins for external targets. Use a host suffix only for an internal
DNS zone that the operator controls.

## Security Rules

The runtime denies redirects, URL credentials, fragments, unlisted ports, and
unsupported methods. It accepts only the `Accept` request header.

The runtime reads at most `maximumResponseBytes`. It cancels a request after
`maximumExecutionMs` or the smaller project timeout.

## Verify the Boundary

Run:

```bash
npm test --prefix skills/buster/plugins/http
npm run verify:test-gate:http-live
```

The first check binds a real local HTTP server. It tests success, assertions,
timeouts, redirects, response limits, origin denial, and cancellation.

The second check contacts `registry-local.kubeclaw.svc.cluster.local` through the real cluster network.

After Nova and Buster are deployed, run the authoritative production proof
from the control node with a digest-pinned HTTP image that listens on port
`8080`:

```bash
./scripts/deploy.sh nova-http-preflight \
  registry-local.kubeclaw.svc.cluster.local:5001/kubeclaw/pipeline/HTTP-IMAGE@sha256:DIGEST
```

The command stores `dist/verification/http-production-receipt.json`. It uses
the production-operator Ed25519 private key outside the repository. Install
the approved public key at
`/etc/kubeclaw/production-receipt-authority.pub` before the run. The command
signs the receipt only after the control node observes namespace and lease
deletion. It also binds the signed HTTP target to the exact Service and
namespace that the Kubernetes fixture created.

## Troubleshooting

Read the attempt summary and stable error code. Confirm that the configured
origin or suffix and port match the resolved target.

Do not widen the policy to an uncontrolled domain. Add the smallest exact
origin or controlled internal suffix.

## Rollback

Remove `network.http` from `allowedCapabilities` to stop new HTTP attempts.
Existing requests fail closed when the capability is unavailable.
