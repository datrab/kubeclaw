# HTTP Test User Guide

Status: replacement configuration after Suite 6 cutover

Audience: project authors
Purpose: declare bounded HTTP response checks

## Purpose

Use `kubeclaw.http@1` to check one HTTP endpoint. Declare separate test nodes
for separate paths or assertions.

The provider does not deploy a workload or wait for Kubernetes readiness. Use
a deployment fixture for those actions.

## Terms

An origin contains a scheme, host, and port. An assertion states the response
that the test accepts.

## Smallest Direct Check

```json
{
  "url": "https://service.example.test",
  "path": "/health"
}
```

The default assertion accepts any status from 200 through 299.

## Check a Deployment Fixture

Link the fixture output to the `deployment` input. Select an endpoint when the
fixture returns more than one endpoint.

```json
{
  "endpointName": "web",
  "path": "/health",
  "expectedStatuses": [200],
  "expectedText": "ready",
  "expectedContentType": "application/json",
  "maximumResponseBytes": 65536,
  "requestTimeoutMs": 10000
}
```

The provider derives the origin from the typed fixture output. Project input
cannot replace that origin with another host.

## Multiple Paths

Declare one test node for each path. This keeps each result, retry, and finding
independent.

Use the shared node `retries` field for retry behavior. A value of `2` permits
three total attempts.

## Blocking and Advisory Checks

Set `mode` to `blocking` when failure must block the gate. Set `mode` to
`advisory` when the result must remain visible without blocking the gate.

## Evidence

The result records status, content type, response size, duration, and a body
digest. It does not record response content.

## Cancellation and Restart

Cancellation stops the active request and response read. A restarted Buster
worker uses the shared attempt recovery rules and does not invent a result.

## Remove the Test

Delete the HTTP node and remove dependent links. Do not retain the legacy
`health` suite name.

## Verification

Run:

```bash
npm test --prefix skills/buster/plugins/http
```

Use the error reference when the provider returns an execution error.
