# Case study protocol

The optional writer produces a Markdown draft with six required, ordered
sections. The v3 request and stored report bind `execution` to the active Core
lease's run, stage, attempt ID and attempt number. `reportTarget` retains the
requested project/run, including historical runs. Top-level `runId` describes
execution; `projectId` remains the requested project, not an inferred execution
project. Artifact IDs derive from the complete execution identity, and the store
response must match the producer, ID, namespace, digest and byte size.

Caller facts remain in the request and report with
`evidenceStatus: unverified-caller-input`. `generated` and a passed generation
stage mean a draft was produced, not that its metrics, tests, factual claims or
publication readiness were verified. T15-F01 remains open until an authoritative
run/source evidence resolver is available. Prompt instructions alone do not
verify prose against source artifacts.

The original tests use the real Core, authenticated runtime HTTP and artifact
store. They cover historical target versus execution identity, two actual Core
attempts, authorized retry replay, another executing run and stored-byte/producer
checks. The HTTP responder is a transport fixture, not a writer model. Factuality,
session lifecycle, transcripts, output-file watching, rate-limit recovery and
presentation remain separate runtime gates.
