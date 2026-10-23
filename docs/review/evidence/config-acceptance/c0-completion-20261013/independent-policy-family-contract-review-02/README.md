# Independent policy-family correction recheck 02

**Bounded verdict: NOT ACCEPTED as the complete proposed acceptance-recipe package.**
PFCR-01–03's concrete corrections are verified at definition scope; PFCR-04's
FIFO, attempt-exhaustion and post-read phase controls are substantially corrected.
Two remaining concrete oracle gaps are identified below. No native effects,
implementation, global C0, package authorization or historical production-finding
closure is accepted by this report.

Reviewer: `/root/policy_family_contract_review`, independent source/definition
reviewer, with no implementation responsibility. Reviewed package:
`../policy-family-contracts-02`, against the preserved original package and
`../independent-policy-family-contract-review-01/README.md`. The exact HEAD,
source/input/artifact hashes and per-item observations are in
[observations.json](observations.json). Dirty patch and checkout status are
retained in [worktree.patch](worktree.patch) and [git-status.txt](git-status.txt).
Only this review directory was written. No production/schema/test edits,
productive tests, runtime/native/API/credential execution, deployment or Eval
were performed.

## Actual review and conservation

Commands: `cat`/`sed -n`/`rg -n` read the full README, contracts, fault transform,
all 31 case bodies, 17 full fixture projections and relevant surrounding productive
sources. Python JSON inspection computed SHA-256, compared all source pins,
checked canonical case and existing harness joins, compared old/new P2/P3 bodies
and domains, and independently enumerated all diagnostic fixture differences.
`git rev-parse HEAD`, `git diff --binary`, and `git status --porcelain` recorded
the stand. These are task-local observations, not a new validator or runtime
acceptance harness.

Expected/covered: **4/4 families, 17/17 fixtures, 31/31 controls, 34/34 pinned inputs,
102/102 exact source witnesses**. No input/pin/fixture/old-artifact digest mismatches
were found. All diagnostic changes fall within their explicitly declared pointers.
Domain fragment bytes and full P2/P3 family bodies are identical to package01.
All canonical case joins and harness paths resolve; all controls remain `not-run`.
Package01 and review01 remain preserved at their recorded identities.

## Verified corrections against real sources

**PFCR-01:** all four full trust B role projections now select 2000/4000/4000ms
and probe5s, preserving A1000/2000/2000ms/probe3s. Their strict inner/outer/probe
relations hold. P1-L1 explicitly requires all five functional helper instances
and all 15 matching workload probe fields to carry the chosen values. The
hardcoded probe3 mutant now has an exact B oracle, rather than an unspecified
future variant. Same existing KubeClaw/Prism owner paths are retained.

**PFCR-02:** the diagnostic transform places the real Envoy HTTP fault filter in
the actual TLS self-check listener before its original router, delaying matched
GET `/ready` request processing for6s after establishment. The original direct200
route, TLS identity, socket, and helper line84 connect_timeout0.5s are retained.
The forwarded explicit diagnostic header is not one of the five removed override
headers. Successful connection/TLS/request/fault-counter prerequisites distinguish
the phase from the earlier connection timeout. Exact 504/UT/
`upstream_response_timeout` and fixed A900..1100ms/B1900..2100ms intervals are
specified; UF/UC/SI and missing phases reject. This is a source-feasible proposed
original-Envoy diagnostic, not a substitute responder. Actual binary extension,
identity and observation support remain native prerequisites, not verified facts.

**PFCR-03:** the map now correctly names `platform_cluster_state` and
`platform_network_state`, matching actual registrations205/219 and reads212/231.
The full local-only variants bind127.0.0.1/configured8080, an explicitly allowed
`policy-c0-fixture` namespace, and same unrelated selected fields. P4-L2 observes
actual caller URLs, one-page counts50/25 and opaque cursor reuse for both tools.
P4-L3 isolates finite30s/15s by disabling aggregate caps and retaining perGET10s;
three7s response phases with real oversized halving4→2→1 are feasible: A succeeds
near21s, B cancels near15s during the third request. It states exact phase and
cancellation tolerances and finite-deadline partial truth. The two5000-byte item
corpus can exceed8192 at both limits4 and2 but fit when halved to1. These controlled
TLS peer observations are explicitly library/caller definition proof only, not
native Kubernetes/CRD/grant acceptance.

**PFCR-04 corrected portions:** P4-L4 gives exact two-reservation saturation,
ordered waiters, original JSON rejection/release, pods FIFO transfer, final
attempts3/successes2 and proper separation from production Promise.all failure.
P4-L5's first oversized GET with pages0/attempts1 isolates attempt exhaustion from
page/deadline exhaustion, including no null-cursor completeness inference.
P4-L6's real synchronous token/CA reads plus60ms return hold against20ms deadline
make a post-read monotonic check necessary even while timer callbacks are blocked.
Counting original ClientRequest constructions, not just wire traffic, makes that
mutant decisive. These use public fixture bytes/transparent instruments and do
not claim authentication, original-provider, or native credential proof.

## Remaining material definition findings

### PFCR-05 — Fractional-millisecond encoder oracle was lost by the profile change

**Medium; blocks complete supported-domain recipe closure.**
All eight currently selected positive trust fixtures now use whole-second
1000/2000/4000ms inputs. P1-D1 and P1-L1 only assert whole-second renders. The
domain still accepts integral milliseconds and the contract explicitly promises
quotient/remainder rendering (`500 → 0.500s`); P1-L1 still claims wrong
ms↔seconds encoding mutation coverage. But truncating milliseconds with integer
division by1000 yields the correct output for every selected positive profile.
P1-X1's fractional *numeric* input rejection does not exercise a valid500ms value.
Malformed native duration-string rejection likewise does not detect a valid
policy that the renderer incorrectly truncates.

**Correction:** preserve the new probe5s B recipe and add a concrete complete
selected trust diagnostic clone (or explicit clone recipe with exact pointers)
using, for example, selfCheck500ms and request/idle1500ms. Specify actual helper
render outputs0.500s/1.500s and the same native parsing boundary where applicable;
join the truncating-integer-seconds mutant to this oracle. This is a definition/
render correction, not a request for extra runtime functionality.

### PFCR-06 — P4-L5 cannot kill its event-outer-iteration reset mutant

**Medium; PFCR-04 event-loop renewal proof remains incomplete.**
P4-L5 sets pages1/attempts1 and makes the very first event page oversized. The
attempt cap blocks its size1 retry before any successful parsed page or nonempty
continuation is returned. Thus the event outer loop cannot reach a second
successful-page iteration. Its stated mutation
“Create newbudget eachrecentEventsouteriteration ... GETcount exceeds1” is false
for the event-iteration-only mutant: the first iteration still admits one GET
and denies its retry, so the exact stated oracle passes unchanged. The namespace
child-reset part of the control remains decisive and is not disputed.

P4-L6 also expires before its first GET, so it cannot supply that second-iteration
attempt-counter proof. P4-N3/S1 retain general multi-page/no-reset expectations,
but do not specify an exact successful-event page corpus and an isolated
attempt-counter-reset oracle that repairs this particular claimed killer.

**Correction:** keep the existing first-page oversized control, but add a distinct
complete selected variant (for example page cap2/attempt cap3, satisfying the
configured relation), a successful event first
page with explicit nonempty cursor, and enough genuine oversized retry attempts
on a later page to exhaust the *carried* attempt cap before successful-page or
deadline caps. Specify exact cursor/limit/attempt/page sequence and expected
partial reason, then show the event-iteration-reset mutant permits a forbidden
later GET. Alternatively give an equally decisive exact multi-page cumulative
deadline recipe and narrow L5's claim to the counter behavior it actually tests.
Do not change production error semantics or count a generic source assertion.

## Final scope and gates

| Criterion | Bounded conclusion |
| --- | --- |
| Source/fixture/canonical identity and prior evidence preservation | Verified |
| Existing sole-author paths, current/proposed split, P2/P3 and domains | Conserved |
| PFCR-01/02/03 corrections | Verified as proposed definitions |
| PFCR-04 exact phase/queue/attempt/post-read corrections | Substantially verified; event renewal oracle remains PFCR-06 |
| Complete proposed recipe acceptance | **Not accepted: PFCR-05/06** |
| Runtime/native/global C0/approval | Not executed/not accepted/not granted |

Original Envoy/TLS/build receipts and isolated diagnostic observations;
authenticated original Kubernetes/CA/token/namespace/grants/datasets;
Hubble/relay/peer/known-flow identity; and actual credential provider/mounted
revision/process receipts remain genuine external inputs. Neither remaining
finding is an external-input blocker. All31 proposed controls remain unexecuted;
public diagnostic references and controlled TLS fixtures never establish live
grants or original credential/native behavior.
