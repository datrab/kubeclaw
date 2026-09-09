# PCR-PREPORT-001 — report target and execution provenance

This bounded slice repairs the shared pipeline-review/case-study identity defect.
Both original stages obtain run ID, stage ID, attempt ID and attempt number from
the active Core lease. Caller run/attempt/project fields remain supported as an
explicit `reportTarget`, including historical reports. No historical lookup or
new source authority is introduced.

The v3 runtime requests distinguish execution from target. Strict agent output
parsers still reject attempts to supply identity or other owner fields. The owner
adds execution and target metadata to the report, retains the caller evidence or
facts with `evidenceStatus: unverified-caller-input`, and derives an artifact ID
from the complete actual execution identity. It validates the original artifact
store response against the exact producer, namespace, media type, artifact ID,
canonical content hash and UTF-8 byte length. Artifact producer and report
execution now agree even when reporting Run A during attempt 2 of Run B.

Existing reviewed/generated status and useful report content remain. Passed means
report generation succeeded, not that tests, facts, metrics, run completeness or
publication readiness were independently verified. T15-F01 remains open for both
plugins: the available plugin context contains current-run artifact references,
not the authoritative historical run/source projection the finding requires.
The READMEs remove the prior evidence-pinned/authoritative overstatement. D03/D10
mandatory gates are not replaced by these optional reports.

## Original consumer verification

Both original plugin test suites and source builds pass. Canonical ESLint for
changed sources/tests and `git diff --check` also pass. Full raw suite logs:
[pipeline review](../../evidence/report-identity-review-tests.txt) and
[case study](../../evidence/report-identity-case-tests.txt). Both were inspected
before preservation; they contain suite status and the npm environment-option
advisory, without secret values or private operator data.

Each plugin's original npm test command runs its protocol parser, actual Core
engine/runtime HTTP/artifact path and package-boundary checks. The real HTTP
responder validates the original HMAC and records the dispatched request. Its
first response tries to inject an execution identity and is rejected. An
explicit administrator decision through the original administrative-reopen path
creates actual Core attempt 2; replay of that same durable decision performs no
additional HTTP dispatch or artifact mutation. Another real run creates a
separate report for the same historical target. Actual lifecycle journal attempt
IDs, dispatched identities, persisted report content and artifact producers are
compared. Original artifact reads verify canonical bytes and digest. Foreign run,
foreign attempt ID/number, namespace, byte size, digest and altered report content
are rejected by the same owner validator using the real stored artifact as the
starting point. No generated hash is used as proof of external evidence.

The HTTP outputs are transport fixtures, not model judgment or factuality proof.
No model, cluster, CI or deployment is invoked. T15's real two-source-revision
bundle gate is not claimed satisfied by these identity tests.

```bash
npm test --workspace=@kubeclaw/plugin-pipeline-review
npm test --workspace=@kubeclaw/plugin-case-study
npm run build --workspace=@kubeclaw/plugin-pipeline-review
npm run build --workspace=@kubeclaw/plugin-case-study
```

Exact owned paths (14): `src/protocol.ts`, `src/stage.ts`,
`tests/protocol.test.mjs`, `tests/live-function.test.ts` and `README.md` beneath
each of `skills/nova/plugins/pipeline-review` and
`skills/nova/plugins/case-study`, plus
`tests/verification/reliability/report-identity-fixture.mjs`, this note, and
`docs/review/evidence/report-identity-review-tests.txt` plus
`docs/review/evidence/report-identity-case-tests.txt`.
No SDK, Core, schema, registry or historical-authority changes are included.
