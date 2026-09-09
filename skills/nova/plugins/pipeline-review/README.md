# Pipeline review protocol

The optional reviewer produces an agent assessment across five dimensions. The
v3 runtime request and stored report distinguish `execution` (the active Core
lease's run, stage, attempt ID and attempt number) from `reportTarget` (the caller's
requested run and attempt, including historical runs). Top-level report `runId`
and `attempt` describe execution. Artifact IDs derive from the full execution
identity, and returned producer, digest, byte size, namespace and ID must match.

Caller evidence remains available to the reviewer and is retained in the report
with `evidenceStatus: unverified-caller-input`. A format-valid `reviewed` report
and a passed report-generation stage do not establish factual correctness, source
revision, run completeness or successful mandatory tests. T15-F01 remains open:
there is no authoritative historical run projection or evidence-content resolver
in this plugin. Suggestions are not applied automatically.

The original local tests run the actual Core, authenticated runtime HTTP and
artifact store, including an invalid first output, authorized second attempt,
durable replay and a different executing run for the same historical target.
They read the original stored report and verify its producer/hash/byte binding.
The HTTP responder is a transport fixture; no reviewer model runs. Reviewer
judgment, transcript archival, rate-limit policy, presentation and no-output
recovery remain separate runtime gates.
