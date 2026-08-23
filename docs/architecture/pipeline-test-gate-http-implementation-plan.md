# HTTP Provider Implementation Plan

Status: complete

Audience: maintainers, reviewers, and operators
Purpose: define the non-authoritative Suite 6 replacement

## Objective

Implement `kubeclaw.http@1` as a bounded HTTP assertion provider. The legacy
`health` suite remains authoritative during this phase.

## Contracts

The provider accepts one explicit origin or one typed deployment input. It
sends one GET or HEAD request and checks declared response assertions.

The project controls the path, method, Accept value, expected response,
response limit, and request timeout. The operator controls reachable origins,
host suffixes, ports, response size, and execution time.

The provider returns normalized counts, findings, metrics, and result details.
It does not store the response body.

## Security Boundary

The provider has only `network.http` authority. The Buster runtime validates
the origin, host suffix, port, method, header, response size, and timeout.

Redirects, credentials in URLs, fragments, unsupported methods, and undeclared
origins are denied. Project configuration cannot expand operator policy.

## Real Proof

The implementation proof uses the real provider process, capability runtime,
Node HTTP stack, and a bound local HTTP server. It uses no mock or fake API.

The Kubernetes live chain remains covered by the Suite 5 deployment deferral.
Suite 6 does not require a new deployment to prove its HTTP boundary.

## Stop Conditions

Phase A requires the baseline, documents, schemas, real HTTP tests, registry
checks, language checks, complete verification, and a clean review.

Do not start parity until all Phase A checks pass.
