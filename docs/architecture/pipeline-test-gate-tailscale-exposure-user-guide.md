# Tailscale Exposure User Guide

Status: authoritative replacement configuration after cutover

Audience: project authors
Purpose: publish a Kubernetes fixture through Tailscale

## Declare the Fixture

Add the exposure after the Kubernetes deployment fixture.

```json
{
  "fixtures": {
    "public-exposure": {
      "uses": "kubeclaw.tailscale-exposure@1",
      "needs": ["deployment"],
      "config": { "path": "/", "readinessTimeoutSeconds": 120 },
      "inputs": {
        "deployment": {
          "from": "deployment",
          "output": "deployment",
          "schemaId": "kubeclaw.kubernetes-deployment-fixture@1"
        }
      }
    }
  }
}
```

Set `endpointName` only when the deployment contains more than one endpoint.
Set `hostname` only when the operator permits a stable Tailscale hostname.

## Test the Public URL

Link `public-exposure.exposure` to the `endpoint` input of
`kubeclaw.http@1`. Put status, text, content type, and response limits in the
HTTP node. Omit the HTTP `path` to test the exposure path. Set the HTTP `path`
to test a different absolute path on the same public host. The exposure fixture
does not test page content.

## Understand Cleanup

The exposure cleanup disables the Ingress first. The deployment cleanup then
deletes or retains the lease. The deployment expiry remains the final cleanup
limit.
