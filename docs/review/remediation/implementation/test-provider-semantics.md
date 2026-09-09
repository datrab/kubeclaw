# WP06 contained provider semantics remediation

Scope: PCR-DELIVERY-001, PCR-APIFLOW-001, PCR-OPENAPI-001/002,
PCR-HTTP-001, PCR-JUNIT-001 (six findings, five plugin packages). No shared
contract, registry, runner, isolation, or domain sources changed in this batch.
No report/register dispositions changed by the author.

## Root causes and behavior

- Delivery used a two-token regular expression for COPY. The package-local
  parser now handles shell/JSON forms, flags, final destination among multiple
  sources, continuations, WORKDIR, and final-stage/inherited-stage tracking.
  Unknown path semantics fail explicitly. This remains lexical evidence and
  cannot assert external image metadata, source existence, or RUN mutations.
- API flow treated no executed main steps as success because skipped records
  had no assertion failures. It now adds an explicit coverage finding while
  preserving honest skipped counts. Setup/cleanup do not count as main coverage.
- OpenAPI ignored false child schemas through truthiness. Presence checks and
  recursive supported-subset validation cover false/true/object children,
  including empty arrays and absent properties. Unknown assertion keywords,
  invalid schema shapes, unsupported formats and assertion siblings of refs
  fail closed instead of silently accepting unvalidated payloads.
- API flow/OpenAPI blanket catches hid capability execution failures. A local
  invocation boundary retains the original error, stops further main work,
  attempts cleanup, and rethrows. Cancellation wins and stops cleanup requests.
  Declared API mismatches retain their existing assertion-result behavior.
- HTTP's schema default replaced the linked endpoint path before execution.
  Removing only that default preserves the provider's existing fallback order.
- JUnit's lexer allowed zero whitespace after a quoted attribute. It now
  requires XML S between attributes and rejects non-XML spacing around `=`.
  Capture caps do not bypass lexical validation.

## Before/after evidence

Before edits, all four Buster plugin original suites passed. The unchanged
Delivery suite also passed after an initial concurrent registry integrity
failure during another author's repository-adapter edits. Historical probe
logic, using original providers and real local HTTP, reproduced all six findings:
zero-contact all-skipped flow passed; items:false accepted [1]; denied origin
became failed assertion; resolved HTTP path became `/`; malformed XML passed;
valid JSON COPY was rejected. Historical evidence files were not rewritten.

After edits:

- JUnit original parser suite plus XML separator/capture-cap cases passed.
- HTTP original live suite plus real buildRegistry → resolveTestPlan → original
  provider → real HTTP checks passed: omitted linked path, explicit override,
  and bare-origin root fallback. Root route and endpoint route respond differently.
- API flow original HTTP/WebSocket suite and dedicated remediation cases passed:
  zero-contact all-skipped failure, setup/cleanup-only failure, independent main
  execution after skip, assertion mismatch, real header-policy denial with real
  cleanup, response-size rejection, active caller cancellation without cleanup.
- OpenAPI original suite and 40 request/response schema cases passed, plus real
  origin/header-policy denial, response limit, cleanup, and active cancellation.
- Delivery original registry/adapters/stage suite plus eleven COPY matrices
  passed. No parser mock or Docker substitute was used; no image build claimed.

`node tests/verification/contracts/check-provider-semantics-remediation.mts`
remains a mandatory-failure integration probe in this environment. It uses the
original resolver/worker/runner with real capabilities; before the provider
starts, the native launcher reports `open task children: No such file or directory`
and the attempt ends with `write EPIPE`. The parent confirmed the platform lacks
usable task-children proc entries and delegated cgroups. No bypass, conditional
pass, or replacement execution backend was introduced. Provider-to-worker error
normalization is therefore not claimed as runtime-verified here; direct provider
and capability evidence is separate.

Canonical ESLint on unchanged HEAD already reports 11 API flow, 20 OpenAPI, and
6 JUnit errors (existing complexity, depth, size and one fallback chain). Scoped
new helpers/tests are checked separately; no lint disable or threshold changes.
Build/test final results and reviewer findings will be appended below.

## Final author gates

All five packages passed their current `npm test` and `npm run build` scripts:
`skills/buster/plugins/{api-flow,openapi,http,junit-report-adapter}` and
`skills/nova/plugins/delivery-lint`. API flow/OpenAPI package scripts include the
new remediation tests, not an optional separate run.

Scoped canonical ESLint passed for new helpers, every new/changed test, and all
Delivery sources. Existing source lint totals are API flow 11 → 8, OpenAPI 20 → 19,
and JUnit 6 → 6 versus unchanged local HEAD. Existing source lint debt remains a
separate incomplete gate; it is not relabeled as passing. The full worker probe
remains blocked as described above. Independent six-finding review is pending.
