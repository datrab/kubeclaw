# HTTP Test Security Model

Status: authoritative Suite 6 security boundary

Audience: operators, security reviewers, and maintainers
Purpose: define HTTP test authority and denied actions

## Trusted Components

Nova owns the graph and gate decision. Buster owns bounded execution. The HTTP
provider owns response assertions. The network capability owns transport
policy.

## Untrusted Input

Treat project URLs, paths, headers, assertions, and fixture selections as
untrusted input. Schema validation does not grant network access.

## Network Boundary

The operator allowlists exact origins or controlled DNS suffixes and ports.
The provider cannot expand this policy.

The runtime permits GET and HEAD. It denies redirects, URL credentials,
fragments, unsupported headers, and unsupported methods.

## Response Boundary

The runtime enforces response-byte and time limits. It cancels body reading
when a limit or attempt signal ends the request.

The provider stores a body digest. It does not store or log the response body.

## Fixture Integrity

A deployment target must arrive through a typed value link. The provider
selects only an endpoint contained in that value.

An explicit URL and a deployment input cannot control the same test.

## Credentials

Suite 6 accepts no authorization header and no URL credentials. A later suite
must define any authenticated API contract.

## Denied Ownership

The provider cannot deploy, expose, restart, or mutate a target. It cannot
approve a pipeline or add its own retry authority.

## Proof

Real local-server tests cover the network boundary. The final production run
must repeat the check against an operator-approved deployed endpoint.
