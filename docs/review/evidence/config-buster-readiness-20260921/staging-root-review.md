# Root review of the private readiness draft

The 35-file draft remains unintegrated and unexecuted. The two known LC overlaps
(`production.ts` and the Worker local-config contract) must be rebased after the
LC source freeze. Nothing here establishes BR1–BR4/DOC acceptance.

Two test evidence gaps found during source review are now addressed in the
private files:

1. Every factory profile requires a real start record, exact child arguments,
   PID/start-time identity and an observed exited process before accepting the
   response. The observer forwards the existing stderr write unchanged and checks
   the actual `DEPENDENCY_OK`, `DEPENDENCY_TIMEOUT` or `DEPENDENCY_OUTPUT_LIMIT`
   event. A generic 503 or failed executable cannot establish a negative pass.
2. Later file mutation is correctly distinguished from caller-object mutation.
   Separate real service profiles mutate the originally supplied policy object
   after construction and require the original timeout/output boundary to remain
   effective. No runtime or process implementation is substituted for this check.

The prior test drafts are retained in `staging/review-correction-before` and the
author's correction binding. Runtime execution, full original modules, semantic
controls, strict lint/types, real package delivery checks and independent final
review remain required. Source review does not predict their results.
