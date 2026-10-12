# Migration gate repair — 2026-09-21

Scope: repair obsolete proof references and the manifest-to-lint cutover test's
outdated experimental-tool expectation. Production and live-acceptance status are
unchanged. The existing HTTP proof moved into the verification integration suite;
the common network adapter's similarly named test exercises a different adapter
and is not a substitute.

## Cases recorded before edits

| Case | Required evidence |
| --- | --- |
| MG1 | Execute the complete migration workflow before and after; retain all failures, including unrelated environment or documentation failures. |
| MG2 | Each of the 23 obsolete HTTP references maps to actual current provider/capability assertions, adding missing behaviors before replacing references. |
| MG3 | HTTP proof exercises actual local TCP requests with explicit origins and ports, root default, configurable bounded Accept, invalid path/assertion rejection before contact, connection failure severity, timeout, declared and streamed byte limits, cancellation before headers and during body reads. Production configuration function proves the 10000 ms default directly. |
| MG4 | Manifest cutover requires the exact three documented experimental type-evidence tools and keeps Kubernetes raw-manifest/policy-pack assertions and all legacy-absence checks. |
| MG5 | Run changed proof tests. Deliberate mutations of the expected tool set and selected HTTP behavior must fail their assertions. |
| MG-DOC | Update the ledger with real proof locations and this report with results and limits; no claim of cluster production acceptance. |

## Results

The actual baseline contains **23**, rather than 20, stale references across
three parity ledgers. They now point to
`tests/verification/integration/http-provider-live.test.ts`, which imports the
original provider and `NetworkHttpCapabilityInvoker` and contacts a real local
TCP server. The existing proof already covered endpoint fixtures, explicit port,
root-path resolution, timeout, declared body length, and response assertions.
Added assertions cover the actual production configuration's 10000 ms timeout
(default only; invocation/policy can cap it), received Accept header and invalid
bounds, invalid paths/assertions without server contact, disconnected TCP request
failure with high severity, streamed body overflow, and in-flight cancellation.
The initial body-cancellation case aborted 50 ms after server contact. Independent
review correctly rejected that timing as proof of client body reading. The
corrected case delegates to the actual fetch and original response reader,
observes the exact first socket chunk, then schedules cancellation during the
second read and requires that original read to reject with `AbortError`. No
response, chunk or rejection is fabricated. The temporary wrapper is restored
in `finally`; the test's output explicitly reports this instrumentation.
The reviewer also proved that forcing content-type acceptance still passed the
initial tests. A real mismatched content-type case now requires failure and the
specific `http.content-type` finding. These corrections need the recorded
independent follow-up, not just the earlier positive logs.

The reviewer additionally showed that unconditional status acceptance escaped
the original test. Both a default-denied 404 and a 200 outside an explicit
`[404]` expectation now require `failed` plus `http.status`. The
[independent follow-up](independent-migration-gates-20260921.md) reran the final
original test and TypeScript check successfully; status, content-type and a
body-fetch-signal mutant now fail at the intended assertions. This closes those
concrete proof gaps. A separately stalled DNS-resolution phase is not exercised
by this local TCP program; its timeout case proves the bounded response path.

Both changed proof programs passed locally; the HTTP project's TypeScript check
was also run (see raw evidence). The Accept mutant increases the production
maximum to 513 and fails the 513-byte rejection assertion. Removing the generated
type-evidence tool from the cutover assertion fails exact-array comparison. No
production source was modified for these repairs; mutants were isolated temporary
copies and removed. The Kubernetes and legacy-path assertions remain intact.

Raw logs: `docs/review/evidence/migration-gates-20260921/` contains the original
workflow and lint failures, `http-after.txt`, `lint-after.txt`,
`http-typecheck.txt`, `http-accept-mutant.txt`, `lint-tools-mutant.txt`, and the
complete workflow rerun in `after.txt`. The rerun result is recorded below once
terminal; passing these bounded proofs is not a whole-workflow or live-cluster
acceptance claim.

## Reference mapping

All entries below now cite the integration proof. The rationale column preserves
the ledger's claim so reviewers can compare it directly with the executable
assertions; it does not change any disposition or production acceptance status.

| Entry | Required behavior |
| --- | --- |

| HEALTH-ARCH-006 | The replacement performs HTTP requests without browser automation. |
| HEALTH-CONF-002 | The replacement uses an explicit endpoint instead of a serve type. |
| HEALTH-CONF-003 | The target endpoint now supplies its actual port explicitly. |
| HEALTH-CONF-004 | The target endpoint now supplies its actual port explicitly. |
| HEALTH-CONF-005 | An explicit allowed origin selects the required target port. |
| HEALTH-CONF-006 | The replacement still defaults the request path to root. |
| HEALTH-CONF-009 | The replacement request timeout defaults to 10000 milliseconds. |
| HEALTH-CONF-012 | The provider accepts only bounded absolute request paths. |
| HEALTH-CONF-014 | Expected response text must remain a non-empty string. |
| HEALTH-HTTP-002 | Operator allowlists replace the fixed localhost-only target rule. |
| HEALTH-HTTP-003 | The provider sends one bounded configurable Accept header. |
| HEALTH-HTTP-004 | The capability aborts requests when the declared timeout expires. |
| HEALTH-HTTP-005 | The replacement reads the bounded response body for assertions. |
| HEALTH-HTTP-008 | A connection failure produces a failed HTTP test result. |
| HEALTH-HTTP-015 | A connection failure creates a high-severity test finding. |
| HEALTH-RES-006 | Invalid request paths fail with a stable HTTP configuration code. |
| HEALTH-RES-007 | Invalid assertion configuration fails before any network request. |
| HEALTH-DEFECT-001 | The capability enforces declared and streamed response byte limits. |
| HEALTH-DEFECT-002 | The capability honors cancellation during request and body reads. |
| TSX-HTTP-002 | The HTTP provider consumes the typed public endpoint and preserves its default route path. |
| TSX-HTTP-003 | The HTTP provider retains status, text, content-type, timeout, and response-size checks. |
| TSX-MIG-004 | The HTTP capability uses one bounded deadline for DNS, connection, and response work. |
| API-HTTP-005 | The capability rejects redirects. |

## Complete workflow rerun

`node scripts/check-suite-migration-workflow.mjs` exited **1**. All 23 stale
HTTP-reference errors and the obsolete empty experimental-tool assertion are
absent. Six other proof failures remain: phase10 vertical (`/usr/bin/tar`
missing), manifest-lint production, size-budget cutover and production, HTTP
cutover, and Tailscale-exposure cutover. See `after.txt` for their unabridged
output; these were not suppressed or reclassified. The HTTP TypeScript command
`node node_modules/typescript/bin/tsc --noEmit -p tests/verification/integration/tsconfig.http.json`
exited **0**. Both deliberate mutants exited **1** at the targeted assertions.
A fresh independent review remains required.

## Next reproduced CRD assertion repair (before implementation)

The complete workflow rejects `self == oldSelf` anywhere in the lease CRD.
Current source deliberately applies it to individual human-decision receipts;
it does not freeze the complete mutable exposure specification. The replacement
test must render the original chart and separately assert (1) no whole-object
equality rule at root/spec, (2) the access-identity immutability rule remains,
and (3) each recorded human decision remains immutable. This is a structural
Helm proof, not a CEL/API-server mutation proof. Positive rendering and a
deliberately added whole-spec equality rule must produce pass/failure respectively.

The rendered original passed. Independent review confirmed that adding whole-spec
immutability or removing decision-item immutability fails. It additionally found
that merely checking the access validation's message allowed its actual rule to
be replaced by `true`. The test now checks the exact access CEL rule and message;
that mutation must also fail. This preserves the intended protection without
claiming to execute Kubernetes CEL locally.

The subsequent complete workflow with actual GNU tar/flock via proot still exits
1; [raw output](../../evidence/migration-gates-20260921/all-native-tools.txt).
The Tailscale proof now passes. Five remaining proof failures reach deeper
prerequisites: phase10 and size-budget production have absent result/provider
details, manifest lint lacks the installed Kubernetes schema directory,
size-budget implementation expects Debian's `/usr/lib/x86_64-linux-gnu`, and
HTTP cutover still fails in its original runner path. These have not been
converted into passes or removed from the workflow. The earlier six-failure
run remains historical evidence of its actual environment.

The HTTP runner's precise next error was `TEST_PROVIDER_SANDBOX_NOT_BUILT`.
Actual Alpine compiler/header packages were extracted into the ignored tool cache
and the original `scripts/build-plugin-sandbox.mjs` completed successfully.
[Source/binary/package receipt](../../evidence/migration-gates-20260921/sandbox-build-receipt.json).
No system installation or source weakening occurred. The
[subsequent HTTP cutover](../../evidence/migration-gates-20260921/http-cutover-built-sandbox.txt)
still fails: provider initialization exits with `SIGSEGV` in this proot/Alpine
environment. Its cause has not been established. A compiled binary is not a
passed isolation/runtime gate, and this result is not presented as one.
