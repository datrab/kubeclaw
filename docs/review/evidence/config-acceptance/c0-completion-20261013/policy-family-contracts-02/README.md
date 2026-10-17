# Additive PFCR-01–04 policy recipe correction

**Corrected proposed C3 package; fresh independent bounded recheck pending.** No source/schema/test implementation, native/API/credential execution, deployment, Eval or C0 approval. The original [package01](../policy-family-contracts-01/README.md) and [independent rejection](../independent-policy-family-contract-review-01/README.md) remain byte-identical and committed history.

[contracts.json](contracts.json) supersedes only the specified profile/recipe/caller gaps. [case-specifications.json](case-specifications.json) contains the original26 revised controls plus five exact P4 phase controls: **31 total**, all `not-run`. [fixtures](fixtures) contains all ten complete base projection fixtures plus seven complete diagnostic Ops variants. Domains/owner paths remain unchanged; P2/P3 and current/A defaults are preserved. No additional settings author or global canonical setting/case IDs are introduced.

## PFCR-01: independently adjustable probe seconds now exercised

All four full trust-role B fixtures now select:

| Field | Current/A | B |
|---|---:|---:|
| self-check timeout | 1s | 2s |
| outer request / idle timeout | 2s / 2s | 4s / 4s |
| proxy probe timeout | 3s | 5s |

Both full generations satisfy inner < outer < probe. P1-D1/P1-L1 specify actual selected materializer/Helm extraction for every helper and all startup/readiness/liveness probes of the five functional proxies: Nova, Buster, Prism-agent, standalone Control and Worker. **All15 probe fields must change3→5.** The exact hardcoded3s mutant is joined to that B render oracle, not a future unspecified variant. Started A remains A until controlled replacement.

## PFCR-02: route timing cannot be preempted by connection timing

[p1-response-phase-fault.json](p1-response-phase-fault.json) specifies an isolated future fault in the **original Envoy self-check HTTP listener**, retaining its original TLS identity, socket, route, direct200 response and separate `connect_timeout:0.5s` at helper84.

Prepend the original Envoy HTTP fault filter before the router only in a separately pinned native diagnostic render. It matches the conjunction GET + exact `/ready` + explicit test header and delays request processing/response generation6s **after original TCP/TLS and HTTP request establishment**. This is neither port DROP nor a replacement responder. Capture connection-ready/TLS success, actual upstream request and injected-delay counters before evaluating the route deadline. A healthy request and recovery must still produce200; POST/business controls do not match the fault selector.

Exact route oracle: original outer Envoy **504, flag UT, `upstream_response_timeout`**, measured A900..1100ms versus B1900..2100ms. The100ms tolerance is fixed before execution. UF/UC/SI, connect/TLS failure, missing phase evidence, client-only timeout or out-of-tolerance scheduling cannot pass. Do not enlarge configured budgets. The original connection policy is explicitly outside this route proof. The native filter placement and observation fields follow [Envoy1.39 fault documentation](https://www.envoyproxy.io/docs/envoy/v1.39.0/configuration/http/http_filters/fault_filter) and [formatter semantics](https://www.envoyproxy.io/docs/envoy/v1.39.0/configuration/advanced/substitution_formatter).

P1-N1 also clarifies that malformed duration strings fail native parsing; zero policy is rejected at the selected-profile boundary, not falsely claimed universally illegal to Envoy.

## PFCR-03: exact tools and decisive field-specific effects

The caller map now names actual **`platform_cluster_state`** and **`platform_network_state`**, with registrations205/219 and productive reads212/231. No nonexistent namespace tool is credited.

### P4-L2 — `singlePageSize`50→25

Full `ops-single-page-A/B-values.json` variants enable the actual local-only registrations with the same isolated127.0.0.1 service and original configured8080. They differ only in the selected page size. Invoke both actual MCP registrations and observe original request/list functions:

- Cluster resource: `/apis/cilium.io/v2/ciliumclusterwidenetworkpolicies`.
- Namespace network resource: `/apis/networking.k8s.io/v1/namespaces/policy-c0-fixture/networkpolicies`.

For a controlled51-item corpus, A sends `limit=50`, returns one50-item page and continuation; B sends `limit=25`, returns one25-item page and continuation. Explicit second calls retain returned cursor and selected limit. A hardcoded50 mutant fails both actual caller oracles. Argo's accepted task limit remains separately classified.

A real TLS transport peer proves the actual caller/HTTP projection **only**; original Kubernetes effects require the separately declared authenticated API/CRD/dataset bindings. No transport fixture is promoted to native Kubernetes/RBAC proof.

### P4-L3 — isolate finite local30s→15s

Full `ops-finite-call-A/B-values.json` variants keep aggregate mode **unbounded**, existing perGET timeout10s, byte ceiling8192 and single page size4. Only finite local deadline differs30s/15s. Through the actual network registration and unchanged real Kube transport/list functions, a declared future transport-response phase yields:

1. TLS/GET establishment succeeds; after7s a size4 response exceeds8192.
2. Retry size2, same cursor/selectors; after7s it still exceeds8192.
3. Retry size1; after7s its response fits.

A completes the third response near21s before30s. B begins it near14s but **cancels near15s**, returning explicit local-deadline partial/unknown truth. Each7s response phase remains below perGET10s; shared5s is disabled. Exact response-phase tolerance is250ms, cancellation tolerance500ms, both declared before execution. Actual client/TLS machinery is retained; this is a library transport definition, not substituted native API acceptance. Hardcoded30s and per-retry deadline reset mutants fail this same B oracle.

## PFCR-04: three edge rules now have exact complete variants

| Control | Full selected variant | Decisive observations and mutant |
|---|---|---|
| P4-L4 FIFO | `ops-fifo-values.json`: 2 pages, 4 attempts, 5s | Six real list clients use the six namespace-overview resource paths and one shared budget. First two occupy both slots; remaining four queue in exact order. First response produces a real JSON rejection and releases its uncommitted slot without refund. Pods alone dequeues while second response remains held; two later successes commit the cap. GET order is deployments/statefulsets/pods only, attempts3/successes2. False temporary-exhaustion, nonFIFO transfer or leak/refund mutants fail. The first provider error remains rejection; fixture `Promise.allSettled` observes library cleanup, never replaces production tool error semantics. |
| P4-L5 attempt cap | `ops-attempt-cap-values.json`: 1 page, 1 attempt, 5s; page/event size2;8192 bytes | One actual GET is oversized before the deadline. Attempt cap blocks the otherwise viable size1 retry; pages0 means page cap did not preempt it. Partial reason is `scan_attempt_limit`, not complete empty results. Repeat actual `get_events/recentEvents` and shared six-resource scope: budget is minted once, not per event page/branch. Ignored cap, reset budget, oversized-success counting and null-cursor-is-complete mutants fail. |
| P4-L6 post-read gate | `ops-post-credential-values.json`: 6 pages/attempts,20ms | Separate token and CA controls call actual `readFileSync` on valid public fixture files, then a transparent task-only instrument holds return60ms without replacing bytes/client. Scheduled timers cannot run while blocked. Original `https.request` construction observer must see0 after the deadline, as must wire dispatch. Omitting post-read recheck yields ≥1 real ClientRequest construction even if queued timer later cancels before wire; this is the decisive oracle. Repeat shared six-resource and event outer budgets with full captured generation identities. |

The local instruments/controlled peer are definition evidence only; they do not replace the production Kube client, fake time, generate native proof, or grant external access. Native API/auth/JSON failures retain their rejecting boundary. Actual original-provider native controls remain separately required and unexecuted.

## Identity and scope closeout

Every control requires full selected fixture SHA256/generation identity and actual source/caller/request/list/budget/test/tool pins; P4 explicitly includes token/CA read22/24, HTTPS dispatch26, list66/69/86, actual tool205/212/219/231 and event/namespace callers. Diagnostic full variants remain projections of the **same existing Ops profile author**. P1 stays in existing KubeClaw/Prism profiles. Imagebaked component delivery02 is untouched.

[correction-receipt.json](correction-receipt.json) pins preserved package01/review01 inputs, current sources and this exact additive package. No empty name-filter collection, unknown/late native fixture, or proposed recipe is reported as a pass. **Whole C0 and implementation authorization remain open.**
