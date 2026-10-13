# P1–P4 concrete policy-family proposal

**Proposed C3 definitions only. No implementation, native run, C0 acceptance or implementation authorization.** This package closes the four internal policy choices as a concrete reviewable proposal. Remaining native inputs are genuine external provider/tool/credential/test-stand identities, not missing policy designs.

Artifacts:

- [contracts.json](contracts.json): exact current/proposed split, existing sole-author paths, typed fields, relations, real source/caller chains, activation and precedence.
- [policy-block-domains.json](policy-block-domains.json): four closed proposed policy blocks, required fields, no schema defaults or const-only numeric policies. This is a definition fragment for existing deployment schemas, **not a new validator or root loader**.
- [case-specifications.json](case-specifications.json): **26 finite proposed controls**, joined to original canonical case IDs without changing original bodies/results.
- [fixtures](fixtures): **10 complete flattened Chart projection fixtures**, A/B for Nova, Buster, Prism-agent, standalone Prism and Ops. Public fixture names are not authentic native receipts.
- [author-consistency.json](author-consistency.json): task-local JSON/value/identity checks only; zero productive/native harness runs.

## One existing owner per policy

P1 remains in `charts/kubeclaw/values.yaml` or `charts/prism/values.yaml` at `profiles.<selected>.settings.workerTrust.readiness`. P2–P4 remain in the existing Ops `charts/ops-pod/values.yaml` profile, respectively `settings.credentials`, `settings.mcp.hubble`, and `settings.mcp.kubernetes.pagination`. Their existing deployment-profile schemas and materializer/service constructors must consume these fields together.

Current numeric literals/fallbacks are historical facts; target required fields have **no** ENV/CLI/Chart/function/schema fallback. Equal and unequal competing policy sources reject before publication/effect. Task query parameters and immutable generated provider/image/Secret/grant references are not alternate policy authors.

The original entropy row's proposed `config/deployment/ops/...` author is explicitly superseded **as a proposal** by the same existing Ops values profile. Integration must retain the old canonical body and record one alias, never silently enable two authors.

Component delivery02 is unchanged: imagebaked regular seven-file tree, expected-delivery receipt ConfigMap transport, minimal root tuple, caller selection and all-six/all-profile validation. No image-instance CONFIG values or second editable component copy are introduced.

## P1 — readiness, not business dispatch

| Required field | Current/A | B | Typed domain |
|---|---:|---:|---|
| `selfCheckTimeoutMs` | 1,000 | 500 | Positive integer ms, protobuf Duration representation |
| `requestTimeoutMs` | 2,000 | 1,500 | Same |
| `streamIdleTimeoutMs` | 2,000 | 1,500 | Same |
| `proxyProbeTimeoutSeconds` | 3 | 3 | Positive native int32 seconds |

Relations: self-check is strictly less than both outer timers; both outer timers are strictly less than the proxy probe budget converted to ms. The integer-ms duration encoder preserves `1000 → 1s`, `2000 → 2s`, and `500 → 0.500s` without truncation. Protobuf duration bounds and representation are defined by [the primary Protobuf specification](https://protobuf.dev/reference/protobuf/google.protobuf/); probe seconds use the [selected Kubernetes 1.35.6 API type](https://raw.githubusercontent.com/kubernetes/api/v0.35.6/core/v1/types.go).

Actual helpers receive the selected readonly policy through their real include callers; corresponding proxy startup/readiness/liveness probes consume the same selected probe seconds. Five override-denial headers, GET-only health/bootstrap/ready routes, 404 fallback, SPIFFE/mTLS and grants remain unchanged. All three agent roles plus standalone Control and Worker are covered.

Six controls cover complete values, actual renders, missing/type/unit/relation/competing sources, original Envoy parsing, genuine self-check timing/override denial, and A-process/B-publication capture. Native timing uses the original Envoy and isolated fault control, never a substitute TLS responder.

## P2 — entropy is not token length

| Required field | Current/A | B | Typed domain |
|---|---:|---:|---|
| `minimumBearerCharacters` | 32 | 64 | Integer 32..512 |
| `maximumBearerCharacters` | 512 | 256 | Integer 32..512, ≥ minimum |
| `bearerTokenEntropyBytes` | 48 | 64 | Integer 48..384, encoded token must fit interval |

Unpadded base64url produces `ceil(4*entropyBytes/3)` characters: A64, B86. The file read ceiling derives from maximum characters plus2; it is not another editable author. Preserve actual pre-trim raw ceiling behavior: under A, token512 plus LF513 is accepted, but plus CRLF514 reaches the rejecting raw limit. Shape/length is not entropy proof.

Bootstrap must use the same resolved `bearerSecret`/Ops namespace/token-key reference as the workload mount, rather than its current hardcoded `codex-ops-bearer` name. Existing supplied/retained credentials are validated, not regenerated on profile publication. The generator, supervisor and MCP authentication share the selected policy. Once-read Codex and per-request reopened MCP files remain distinct; credential cutover/restart is explicit, and invalid rotation never disables authentication.

Six controls cover numeric/encoding relations, exact string/file bounds, genuine producer/mount/authorization, missing/competing references, rotation, and mutants ignoring entropy/min/max or caching credentials. No credential bytes are included in this package.

## P3 — policy ceilings versus task queries

| Required field | Current/A | B |
|---|---:|---:|
| `defaultWindowMs` | 300,000 | 120,000 |
| `maximumWindowMs` | 900,000 | 600,000 |
| `defaultFlowLimit` | 20 | 10 |
| `maximumFlowLimit` | 50 | 25 |

Windows are integral1..900000ms and flow quotas integral1..50; defaults must not exceed maxima. These are nonconstant, nonweakening supported envelopes, not permission to remove the current guard and claim larger scopes supported. `queryWindow`, the actual MCP input schema and real installed CLI argv consume one captured policy. Explicit absolute times, namespace/pod/node/verdict and accepted task limit remain task input.

Current 12s timeout, two active queries, 2MiB raw/192KiB output caps, exact peer filter and loss/node warnings remain separate existing policy/protocol contracts. Ringbuffer coverage stays unknown; empty output is not absence and there is no lossless cursor.

Six controls distinguish pure parser/controlled-CLI definitions from original Hubble/relay effects, include an11-minute A-allowed/B-rejected window, A20/B10 defaults and caps, invalid/competing inputs, capture and ignored-policy/unit/postfilter mutants. A fake CLI never supplies native proof.

## P4 — explicit unbounded mode and one shared operation budget

| Required field | Current/A | B |
|---|---:|---:|
| `defaultPageSize` | 500 | 1 |
| `eventPageSize` | 500 | 1 |
| `singlePageSize` | 50 | 25 |
| `finiteCallDeadlineMs` | 30,000 | 15,000 |
| `aggregateScan` | `{ "mode": "unbounded" }` | bounded: 7 pages, 14 attempts, 5,000ms |

Page sizes/counters are positive safe integers. Timer delays are1..2147483647ms; larger Node delays would collapse to1ms rather than implement the requested deadline, per [the primary Node timer documentation](https://nodejs.org/download/release/v24.12.0/docs/api/timers.html). Bounded mode requires all three cap fields; unbounded mode forbids them. No JSON Infinity, missing-mode fallback or accidental finite cap is introduced under A.

One budget is created **outside** six concurrent namespace-resource calls and **outside** the `recentEvents` outer loop. Each page reserves a shared potential-success slot; each GET invocation consumes an attempt. Oversized retries keep the page slot and spend additional attempts, preserving selectors/cursor/byte ceiling. Parsed successes commit one page, including empty pages; terminal failures release only uncommitted slots, never attempts. Temporary occupied slots use FIFO waiting under the same deadline, not false exhaustion. Successful cap/attempt cap/deadline closes admission; reservations commit/release exactly once.

The same monotonic overall deadline persists through branches/pages/retries. Effective request cancellation is the minimum of existing perGET timeout, finite local deadline and remaining shared deadline. Recheck after token/CA file reads and immediately before actual dispatch. Timer scheduling is measured separately; do not enlarge configured budgets to hide lateness. Late cancelled replies cannot commit pages. Native API/auth/JSON errors retain their rejecting boundary.

Quota expiry returns explicit partial reasons and perresource `complete|partial|not-started` metadata with original continuations. Unstarted/partial empty resources never prove absence. A retains current perGET10s/8MiB, finite one-page30s calls, unbounded namespace aggregation and unbounded event outer scan; trimming event results is not a total-scan bound.

Eight controls cover mode/type/timer rejection, reservations/retries, actual six-resource API scan, real oversized responses, native deadline cancellation, A/B capture and independent-cap/reset/refund/partial-truth mutants. The native fixture uses two Services and two Ingresses: A completes six first pages; B requires eight pages but its shared cap7 leaves explicit partial continuation. Resource race winner is not assumed.

## Complete fixture strategy and remaining external gates

Reuse the existing whole deployment A fixtures; B is a complete clone with only the named policy blocks changed, never a runtime patch merge. Prism-agent materializes the checked-in Chart base, actual role values and existing release projection once because no matching historical whole pair existed. Ops image references come from the existing generated version projection, not newly guessed digests. All unrelated image/owner/namespace/Secret/grant settings remain equal within pairs.

These are full **offline projection definitions**, not assertions that the future whole root schema/loader is implemented or that public fixture references authenticate a native stand. The original component/profile layout and version/native bindings remain separately owned. No current template already consumes these new blocks.

Only native gates require external inputs: original Envoy/tool/image receipts and isolated fault capability; authenticated original Kubernetes/API/CA/token/namespace and independent audit/wire observations; original Hubble/relay known flows; actual credential provider revision/mount rollover. Code/fixture/negative/mutation procedures are specified internally. All26 controls remain `not-run`; current test-name filters finding zero new cases cannot be promoted to PASS.
