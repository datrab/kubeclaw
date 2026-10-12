# Independent migration gate review — 2026-09-21

Verdict after correction: **bounded migration gate repair accepted**. Both
initial findings below were corrected by the implementer and independently
rechecked. The complete workflow still has six open failures; this verdict does
not close those failures or any broader remediation item. This reviewer did not
modify production code or the submitted tests.

## Scope and method

A fresh reviewer inspected the actual HEAD-to-worktree diffs, all 23 remapped
ledger entries, the complete HTTP integration program, the HTTP provider and
network capability, the lint cutover program, and the implementation report.
Machine comparison confirms the three ledgers change exactly 23 proof locations;
the entries' rationales, dispositions, and status fields are unchanged. Recorded
SHA-256 values in `docs/review/evidence/independent-migration-gates-20260921/scope.json`
identify this reviewed source snapshot.

Independent executions:

- `node tests/verification/integration/http-provider-live.test.ts`: exit 0.
- `node tests/verification/contracts/check-pipeline-manifest-lint-cutover.mts`: exit 0.
- `node node_modules/typescript/bin/tsc --noEmit -p tests/verification/integration/tsconfig.http.json`: exit 0.

Logs are in `docs/review/evidence/independent-migration-gates-20260921/`.
These are two standalone proof programs, not a count of individually reported
unit tests. The integration program uses the actual provider, actual capability,
and actual local TCP server. Its success JSON is consistent with those boundaries.

## Initial findings (subsequently corrected)

### MG-R1 — TSX-HTTP-003 does not prove status and content-type rejection

Priority: medium. The remapped entry claims retained status, text, content-type,
timeout, and response-size checks. The program proves text rejection and the
latter limits, but its status and content-type assertions only cover accepted
responses. Independently replacing the production provider's `contentTypePassed`
expression with `true` in an isolated copy leaves the complete proof green.
Independently replacing `statusPassed` with `true` also leaves it green. Both
mutant programs exited 0; raw output is retained in `content-type-mutant.txt` and
`status-mutant.txt`. Temporary copies were removed; original files were untouched.

Required correction: exercise a real response with a mismatched content type,
a rejected default status, and a rejected explicit expected status. Assert failed
outcome and the corresponding `http.content-type` / `http.status` findings. Rerun
the original and both targeted mutants. Preserve the original ledger requirement.

### MG-R2 — MG3 / HEALTH-DEFECT-002 body-read cancellation remains uncertain

Priority: medium. The test schedules cancellation 50 ms after server request
contact; the server writes its first chunk before holding the body open. This
usually places cancellation during body reading, but does not establish that
`fetch` resolved and the client reader consumed a chunk or has a pending read.
Under scheduling delay it may cancel before headers are processed. The same
assertion then passes without testing the claimed body-read boundary.

The implementation report correctly discloses this limitation. Disclosure avoids
a false claim but does not satisfy MG3. Required correction: deterministically
observe entry into the real response read path, then abort while a subsequent
read is pending; retain actual TCP transport and original provider/capability.
If observation instrumentation is necessary, describe it precisely instead of
continuing an inaccurate blanket claim of zero wrappers. A targeted mutation
must show that a broken body-cancellation path is detected.

## Mapping assessment

| Ledger entries | Independent assessment |
| --- | --- |
| HEALTH-ARCH-006 | Actual provider/capability HTTP request; no browser dependency in exercised path. |
| HEALTH-CONF-002, HEALTH-CONF-003, HEALTH-CONF-004, HEALTH-CONF-005 | Explicit target origin and ephemeral port used by successful real requests. |
| HEALTH-CONF-006 | Resolved root default asserted in result URL and accepted response. |
| HEALTH-CONF-009 | Actual production configuration function directly asserts 10000 ms default; execution remains capped by invocation/policy. |
| HEALTH-CONF-012, HEALTH-RES-006 | Relative, oversized, and authority-style paths rejected with stable code before contact. |
| HEALTH-CONF-014 | Empty and non-string expected text rejected. |
| HEALTH-HTTP-002 | Allowed explicit origin succeeds; denied origin/port/method/header cases reject. |
| HEALTH-HTTP-003 | Server observes configured Accept; invalid, oversized, and CRLF values reject. |
| HEALTH-HTTP-004 | Delayed-header real request produces timeout finding at configured 25 ms. |
| HEALTH-HTTP-005 | Real bounded body consumed for text success/failure and digest. |
| HEALTH-HTTP-008, HEALTH-HTTP-015 | Real socket disconnect produces failed outcome and high-severity connection finding. |
| HEALTH-RES-007 | Invalid assertion configuration rejects with server contact count unchanged. |
| HEALTH-DEFECT-001 | Real Content-Length response and chunked response exceed limit and reject. |
| HEALTH-DEFECT-002 | Already-aborted and in-flight request cancellation exercised; body boundary requires MG-R2. |
| TSX-HTTP-002 | Typed endpoint consumed after real plan resolution; endpoint route preserved and explicit override asserted. |
| TSX-HTTP-003 | Partial coverage; status/content-type rejection requires MG-R1. |
| TSX-MIG-004 | Source visibly creates one combined signal before fetch and passes it through body reading. Runtime proof uses a literal IP and delayed headers; DNS delay and timeout during body reading are not independently exercised. Do not present this as separate runtime proof of each deadline phase. |
| API-HTTP-005 | Real 302 response rejected with redirect-denied code. |

## Lint cutover and workflow limits

The lint change asserts exactly the three configured type-evidence tools rather
than accepting an arbitrary nonempty set. All existing legacy-file/token absence,
raw-manifest/policy-pack, scaffold, and production wiring assertions remain.
The retained implementation mutant log fails the exact-array assertion after
removing one expected tool; the retained HTTP Accept mutant fails its rejection
assertion. I inspected those logs; I did not independently recreate those two
specific mutations. My two additional independent mutations are described above.

The original complete workflow rerun in
`docs/review/evidence/migration-gates-20260921/after.txt` reports six failed proof
programs: phase10 vertical, manifest-lint production, size-budget cutover,
size-budget production, HTTP cutover, and Tailscale-exposure cutover. The report
keeps all six open and does not claim full workflow success. This reviewer ran
the two changed programs independently, not a second entire workflow. Root
schema/error documentation repairs are outside this review. No production or
cluster acceptance is inferred.

## Independent re-review of corrections

MG-R1 is resolved. The current original test passes with real negative cases
for mismatched content type, rejected default status, and rejected explicit
status. Both isolated production mutants now fail at the intended failed-outcome
assertions: `content-type-final.txt` and `status-final.txt`, each exit 1.

MG-R2 is resolved. The temporary observation wrapper calls the original fetch,
original getReader, and original reader.read. It verifies the actual first chunk
is `first`, invokes the second original read, and schedules caller cancellation
in a microtask. The assertion requires that original pending read to reject with
AbortError as well as the provider returning the expected cancellation error.
No fake transport data or synthetic rejection is introduced. The fetch wrapper
is restored in finally, and the proof output accurately names instrumentation.

An independent isolated capability mutant removes the fetch AbortSignal only for
`/body-wait`, leaving all preceding requests unaffected. It fails the precise
pending-read cancellation assertion (exit 1, `body-cancel-final.txt`). The positive
program exits 0 (`original-final.txt`). Thus this correction detects a transport
body read that continues after cancellation instead of relying on a 50 ms guess.

Final source hashes are in `scope-final.json`. Earlier findings and logs remain
as the before-state record. These conclusions cover the inspected 23 remappings
and two proof-program changes; the DNS-delay/runtime deadline coverage limitation
and six whole-workflow failures above remain explicit.


## Separate follow-up: rendered Tailscale lease structure

Final follow-up verdict: bounded structural correction accepted after MG-R3
was fixed and independently rechecked. This follow-up covers
only `check-pipeline-tailscale-exposure-implementation.mts` replacing a global
ban on `self == oldSelf` with assertions at its intended schema locations.
The actual CRD intentionally freezes individual decision receipts, while exposure
updates require the spec to remain mutable. Checking schema location is a valid
correction of the obsolete global regex; the remaining source assertions and
injected-executor ownership/cancellation vectors were preserved.

Independent original program: exit 0 (`tailscale-positive.txt`). Three isolated
chart copies were rendered through actual Helm with the original proof program
copied only to change its chart argument. No production chart was edited:

- Add whole-spec equality rule: exit 1 at the spec-must-remain-mutable assertion
  (`tailscale-whole-spec.txt`).
- Replace decision-item equality rule with true: exit 1 at the immutable receipt
  assertion (`tailscale-decision-disabled.txt`).
- Replace access-identity CEL rule with true, retaining its descriptive message:
  **exit 0** (`tailscale-access-disabled.txt`).

Finding MG-R3 (medium): the new access assertion checks only `message`, so it does
not establish the access-identity rule required by the pre-edit matrix. Require
the actual expected rule together with its message, then rerun the last mutant.
This is a gap in the new structural proof, not a demonstrated defect in the
unchanged production CRD. The original rule is present in the inspected chart.
No Kubernetes admission or native CEL execution is claimed; rendering only proves
the submitted schema structure. The executor vectors use injection, explicitly
reported by the proof's `nativeCluster: false` output.

MG-R3 re-review: the assertion now requires both the exact access-identity CEL
expression and its message. An isolated unmodified chart rendered through Helm
passes the complete proof program (exit 0, `tailscale-positive-final.txt`). The
same isolated access-disabled mutant now fails at the intended actual-rule
assertion (exit 1, `tailscale-access-disabled-final.txt`). Final identities are in
`tailscale-scope-final.json`. The production chart remained unchanged throughout.
The initial whole-spec and decision-receipt negative controls remain applicable;
the correction only strengthens the access assertion. No outstanding finding
remains within this separate structural correction's stated scope.
