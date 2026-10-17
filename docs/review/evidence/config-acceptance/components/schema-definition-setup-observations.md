# C0 definition script setup observations (not PASS)

First command omitted required `PRISM_ENGINE_CONTENT_DIGEST` while current
NODE_ENV was production. It exited1 at `prismEngineContentDigest` with
`PRISM_NATIVE_ENGINE_CONTENT_IDENTITY_REQUIRED`. The initial `.log` is empty
because only stdout was redirected; stderr was returned by exec and the observed
failure is retained here, not rewritten as a semantic rejection or runtime PASS.

Second command supplied the explicit synthetic definition digest but the evidence
script incorrectly selected `selected.prism.control.nativeResourcePolicy`.
`schema-definition-validation-attempt2.log` retains that TypeError/setup failure.
Corrected the evidence script to the actual `selected.prism.native.resourcePolicy`;
no production/test edit. Attempt3 records19 successful definition checks at the
then-script identity. Attempt4 expanded to native result checks and records25.
These old logs are distinct, not acceptance for the materially changed script.

First schema collector invocation failed to infer lowercase role from uppercase
extra case IDs (KeyError None). Fixed only evidence script inference; retained
collection attempts separately. No counts or setup failures treated as PASS.
