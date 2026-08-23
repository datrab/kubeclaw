# Pipeline Worker-Core Contract v1

This package defines the neutral messages used by Nova and specialist workers.

The contract does not contain test, design, security, agent, or gate policy.
It defines one immutable worker attempt and its lifecycle messages.

## Definitions

- `workerProfile`
- `workerRegistration`
- `workerHealth`
- `attemptClaim`
- `workerAttemptEnvelope`
- `attemptProgressEvent`
- `workerLogPart`
- `workerCancellationRequest`
- `workerEvidenceRef`
- `workerAttemptResult`
- `workerLifecycleState`

## Trust Boundary

Worker IDs inside messages are not proof of identity. A distributed transport
must authenticate Nova and workers. Nova must bind a claim to the authenticated
worker before it accepts progress, logs, evidence references, cancellation
acknowledgements, or results.

The first implementation uses the contracts inside one local Buster worker.
The future distributed worker system must use the same contracts.

## Digest Rules

All contract digests use SHA-256 and the `sha256:<lowercase hex>` form.

JSON values use RFC 8785 JSON Canonicalization Scheme before hashing.

- `profileDigest` covers the complete worker profile except `profileDigest`.
- `attemptSpecDigest` covers the complete attempt envelope except
  `attemptSpecDigest` and `claim`. Claim expiry can be renewed without changing
  the immutable attempt specification.
- A log-part `contentDigest` covers the UTF-8 bytes in `text`.
- `resultDigest` covers the complete attempt result except `resultDigest` and
  `receipt`.

The Phase 5.5-B executor will calculate and verify these digests. Phase 5.5-A
defines their portable contract.

## Specialist Data

The worker core treats specialist input and result data as typed JSON. Each
payload has a schema identity and schema digest. The specialist engine owns its
payload schema.
