# Independent targeted policy recipe recheck 03

**Verdict: VERIFIED at bounded proposed-definition scope for PFCR-05 and PFCR-06.**
No unresolved material defect was found in these two corrected recipes. This
does not execute or accept native/runtime cases, authorize implementation, accept
whole C0, or close historical production findings. Previous review conclusions
remain historical and unchanged.

Reviewer: `/root/policy_family_contract_review`, independent source/definition
reviewer with no implementation responsibility. Inputs: policy-family-contracts-03,
the prior02 package and independent review02. The exact dirty checkout HEAD and
all identities are in [observations.json](observations.json); dirty patch and
status are retained in [worktree.patch](worktree.patch) and
[git-status.txt](git-status.txt). Only this review directory was written. No
source/schema/test edits, productive tests, runtime/native/API/credential calls,
deployment or Eval occurred.

## Actual scope and commands

Read the package03 README, full P1-L2/P4-L7/P4-L5 bodies, full
`event-carry-sequence.json`, all five new diagnostic fixtures, source witnesses,
and surrounding productive `server.mjs` event registration/outer loop and
`kubernetes.mjs` list/retry/cursor boundaries. Rechecked the earlier helper/include/
probe source pins implicated by P1-L2. This is a targeted correction recheck, not
a new family-wide review.

Actual commands: `cat`, `sed -n`, Python JSON inspection/hash comparisons,
`git rev-parse HEAD`, `git diff --binary`, and `git status --porcelain`.
The task-local inspection compared all declared input/file/line identities,
old/new P2/P3 bodies and domain bytes, canonical/harness joins for the two new
controls, C-vs-A unrelated fields, and the event profile/task/sequence relation.
It is not a new validator, mock execution, or runtime proof.

Observed counts: **22 full fixtures, 33 proposed controls, 107 exact source pins,
34 source input identities, 29 preserved prior package/review files**. All match
their hashes/pins; no mismatch was found. Domains and P2/P3 family bodies are
identical to02. All33 controls remain `not-run`. Both new canonical case joins
and existing harness paths resolve. Existing sole owner paths and current/proposed
separation remain explicit.

## PFCR-05 — verified correction

Each complete C projection is identical to its corresponding full A except
readiness self500ms/request1500ms/idle1500ms/probe3s. All four relations hold.
The Nova, Buster, Prism-agent and standalone Prism projections cover the existing
five functional helper/proxy instances. B's separate whole-second probe5s proof
is retained rather than displaced.

P1-L2 requires actual selected-owner materialization/Helm includes and extracted
route/HCM fields, not a miniature encoder. It compares native Duration meaning:
500000000ns and1500000000ns, permitting equivalent0.5s/1.5s spelling rather than
creating a lexical false failure. All15 matching probe fields stay3; the separate
connect_timeout0.5s is not confused with the route field merely because equal.

The floor(ms/1000) mutant produces self0s/outer1s and therefore fails the explicit
semantic equality oracle even if Envoy parses0s. Partial fractional wiring and
ignored-C projection also have concrete wrong-value oracles. Original pinned
Envoy parsing of the actual extracted configuration remains separately required
and unexecuted, with genuine identity/SDS bindings rather than substituted proof.

## PFCR-06 — verified correction

P4-L7's complete selected Ops variant declares and permits
`policy-c0-fixture`, task objectName, limit40, page/event sizes4, maxBytes8192,
shared pages2/attempts3/deadline60s, finite inner30s and perGET10s. The two counter
caps satisfy attempts≥pages. Real source `recentEvents`107–131 calls the list
with local maxPages1, maps/trims the parsed page, carries the returned cursor and
re-enters its outer loop. Real list code retains cursor/selectors while halving
an oversized page. The diagnostic sequence is feasible at those exact boundaries.

GET1 succeeds with two small Event objects and cursorc1; GET2(c1,limit4) and
GET3(c1,limit2) exceed8192 using two5000-byte message objects. Only GET1 commits
a page; GET2/3 retain the potential second-page reservation and consume attempts.
Thus successfulPages1 does not reach pageCap2, while attempts3 blocks GET4.
The response/whole-sequence timing requirements keep high deadlines from masking
that attempt boundary. Retained E1/E2, scanned2, unresolvedc1 and explicit partial
truth are separate from dispatch proof.

The outer-iteration-only reset mutant now reaches its changed branch: it starts
the second iteration with fresh attempts and admits GET2/3/**4**. A fitting
limit1 response is armed for the forbidden fourth request. An independent
append-only real TLS peer GET trace distinguishes correct3 from mutant4 even
if local reported counters reset or final arrays trim. Request-construction
observations and parser/page identities cross-check that trace; cleanup requires
no later fourth GET. This is a decisive future test recipe, not an observed
mutant kill or native Kubernetes acceptance.

P4-L5's first-page recipe now expressly disclaims killing an event-iteration-only
reset mutant and narrows that reset claim to namespace children. P4-N3/S1's
deadline/capture responsibilities are separated from the exact carried-attempt
proof assigned to L7. No productive error or credential semantics are replaced
to make the recipe pass.

## Limits and closeout

| Targeted criterion | Result |
| --- | --- |
| PFCR-05 full fractional positive and truncation-mutant recipe | Verified definition |
| PFCR-06 successful outer transition and independent forbidden-GET oracle | Verified definition |
| Source/profile/prior evidence conservation | Verified |
| Native parsing, API/grants, credentials, execution or actual mutant kills | Not run/not accepted |
| Global C0 or implementation approval | Not assessed/not granted |

The controlled TLS peer/public fixture token/CA are explicitly library transport
definition evidence only. Authentic original Envoy/SPIFFE/SDS and other original
provider/native/grant/credential bindings remain required by their unexecuted
cases; public projection references do not authenticate them. No further
corrective definition finding is raised within this targeted scope.
