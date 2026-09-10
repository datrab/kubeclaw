# Delivery-manifest v3 bounds candidate partial independent review

Status: **REJECTED AS INCOMPLETE; THREE NEW CONTRACT/REGISTRATION
BLOCKERS CONFIRMED.** This is review-only evidence. It is not implementation
acceptance, native acceptance, a register update, PCR-SDK-001 closure, or
all-47 completion.

I reviewed the exact frozen candidate
`a7b3bdbd7859c0ab1e293723c41edfe9dacf4a8a`, tree
`c31213558537c4be28b6d274ce36657040a2ef8f`, with sole parent
`15f6a808ed1666c3b7a2a3909749e3d4ee377904` and exactly 38 changed paths.
The candidate fixes the three source defects recorded against 122cd5: v3
evidence media type is a literal `application/json`, legacy delivery preserves
the prior graph, and the complete serialized artifact is bounded to eight MiB.

## Blocking findings

1. Runtime rejects `final.reviewSemanticEncoding` without the required Review
   stage/artifact encoding chain, but the published v3 JSON Schema accepts it.
   The schema therefore admits an impossible public value.
2. Runtime rejects an evidence producer `attemptNumber` above
   `Number.MAX_SAFE_INTEGER`, but the published schema accepts it because it
   has no safe-integer upper bound.
3. The v3 compiler emits `final.reviewArtifactEncoding` for a valid final
   Review graph, while the registered closed project-summary input schema does
   not declare that property. Actual AJV validation rejects the compiler's own
   v3 Summary input before the stage can run.

The public TypeScript final binding in this candidate also models the three
Review fields as independently optional, wider than runtime's conditional
contract. It must be a finite union for no Review, Review only, Review plus
artifact encoding, and Review plus artifact and semantic encoding.

## Independently confirmed passing behavior

- The fixed public media-type domain, complete eight-MiB bound, caller-digest
  rejection, validation-before-hashing, deep freeze, nested external schema
  refs, and Proxy/accessor no-trap behavior pass.
- Legacy compiler graphs are exact against the pre-v3 semantic-source compiler
  blob; the four-dimensional v3 graph and recovery/negative matrix pass.
- The registered v2 proof corpus remains readable for both English outer-ref
  domains and fails closed for the Czech legacy artifact.

Raw command summaries and exact exits are preserved beside this report. The
independent tests are committed with the report.

## Acceptance held

Freeze a corrected source commit and rerun all independent matrices. Even after
these contract blockers pass, acceptance still requires the full registered
producer/consumer chain, genuine FileNovaGateImportStore success, disk
requested/accepted/completed and OS SIGKILL histories, consumer-negative and
replay matrices, repository/package/discovery/pin/schema/lint gates, fresh-head
regressions, and the documented native Go prerequisite. Missing import or an
unavailable native prerequisite remains open.
