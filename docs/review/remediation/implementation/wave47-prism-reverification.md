# Wave 47 — independent Prism re-verification

Reviewed 2026-09-09 at code base `a8cf34f` in an isolated worktree. Scope is the
13 findings listed below. Resource measurement/cancellation findings
PCR-PRISM-WORKER-002/003 belong to the separate resource-accounting slice.

All complete `source_finding_text` entries in the remediation register were read,
alongside their implementation notes and current producer/consumer code. The
historical trace report is absent from this checkout; the retained full finding
text is the source, not a claimed checkout of its historical Git SHA. No new
causal source defect was established in this bounded review. Existing fixes were
preserved. This commit changes only review documentation and captures fresh
local evidence; it does not equate local verification with full native platform acceptance.
PATH-T02-003 meets its original bounded persistence/retry acceptance, as distinguished below.

## Fresh local results

- **97/97 original tests passed**, zero skipped/cancelled. The selected suites
  cover preference snapshots, rounds, job persistence/reopen, original child
  execution and HTTP/CAS boundaries, decisions, corpus, engine/cache, renderer,
  and Studio projection/assets. Their native Node/HTTP/filesystem evidence and
  embedded PGlite SQL evidence remain distinct. An existing test using a
  controlled design provider is not a real model execution.
- **3/3 visual identity tests passed**, covering the actual schema/runtime,
  original provider rejection and original preflight rejection of unbound v1.
- Current **Prism typecheck, Studio TSX typecheck and Studio production build
  pass**. Earlier notes about six Studio type errors are not current blockers.
  Build retains its chunk-size advisory; no threshold was relaxed.
- Focused canonical ESLint passes the eight reviewed helper modules listed in
  `commands.txt`. No full-monolith lint pass is inferred from that result.

Raw outputs and exact commands are in
[`../../evidence/wave47-prism/`](../../evidence/wave47-prism/commands.txt).

## Native prerequisites were checked again

The real native PostgreSQL binary reports **17.5**. A fresh `initdb` invocation
fails with `cannot be run as root`. Current effective UID is 0 and the actual
`/proc/self/uid_map` contains only `0 0 1`. No configured database environment
variable was present; local connection probes at 5432, 5433, 55432 and 55433
returned connection refused. This is not an exhaustive assertion about every
possible server. No real usable server was identified. Neither PostgreSQL's UID
guard nor the execution environment was patched or bypassed. The native pooled
transaction gate and corpus gate were actually invoked and fail explicitly for
missing dedicated database configuration. PGlite was not substituted into them.

No Chromium or OpenClaw executable was found on PATH; no browser existed in the
standard installation/cache locations or searched scratch/toolchain locations.
The original locked Playwright installer was run with a 10-second connection
budget. Its CDN retries all failed; Chrome for Testing 151.0.7922.34 / Chromium
revision 1234 was not installed. The actual engine cache capture, visual provider
and Studio remediation gates were invoked. Cache/Studio fail at browser launch;
visual fails its explicit real-browser prerequisite. Studio reports one failed
case and three not run, not four completed browser regressions. No substitute
browser, prerecorded screenshot or fake OpenClaw program was used.

## Finding-by-finding disposition

“Code present” below means the original root cause is addressed in the inspected
source and the stated local regressions pass. It is not a complete operational
acceptance claim.

| Finding | Original acceptance scope | Current source and fresh local evidence | Missing original gate / separate platform boundary |
| --- | --- | --- | --- |
| PATH-T02-001 | Original services + real DB, save event, capture agent request and demonstrate the persisted snapshot in a new session. | Code present: trusted subject resolution → persisted consent/policy/event-bound preference generation → original prompt/tool generation identity. SQL snapshot and producer/prompt tests pass across projects, with override/disable and subject exclusion. | Original Control/database request admission and captured new-session agent input remain unexercised. No actual model generation or design-quality requirement is added to this finding. |
| PATH-T02-002 | Original Control/agent tool + real DB; overlap A1/A2 and reverse results without A1 mutating A2. | Code present: round binds request, architecture digest/revision and source revision; repository checks before mutations. Reversed architecture-result order, rejection and exact replay tests pass on original repositories/PGlite. | Original Control/agent-tool HTTP flow with DB and reversed A1/A2 delivery remains unexercised. A model call or browser is not required for this original gate. |
| PATH-T02-003 | Persist first round, reject all three, persist a different second round under the same architecture; replay creates no third round. | Code present: distinct successor round with current parent, retained feedback and independent idempotency. Three rejections → new round → exact retry SQL tests pass; original client HTTP retry tests pass. | **Original bounded acceptance met locally:** original migrations, repositories and decisions run on real PGlite SQL; test asserts exactly two rounds, six documents and three historical rejections after exact delivery retry. Native pool/Studio/model E2E remains a separate platform gate and is not an additional blocker for this finding. |
| PCR-PRISM-AGENT-BRIDGE-001 | Original bridge/agent/Control; actual aborts after 202, before spawn and after tool commit; restart without duplicate revision. | Code present: durable accepted/running/terminal job, fenced callback transaction, uncertain running outcome becomes NeedsNova without restart. Real database reopen, local process/HTTP and callback rollback tests pass. | Native DB pool, real OpenClaw/gateway accepted/spawn/tool-commit crash prefixes and session reconciliation; Node child tests do not establish gateway cancellation. |
| PCR-PRISM-AGENT-BRIDGE-002 | Original requests with long common prefixes and punctuation; separate sessions/history with correct project binding. | Code present: SHA-256 over complete trusted namespace/project tuple, preserved mapping; punctuation, long-prefix and namespace separation tests pass. | Actual OpenClaw session/history isolation for separate real project requests. |
| PCR-PRISM-CONTROL-001 | Original Control handler + native Postgres and authenticated transport; another real attempt rejected before persistence, valid path accepted. | Code present: original receiver validates full attempt/claim/worker/result/schema binding before evidence import and DB commit; bound cache replay also validates. Wrong real attempt and altered binding tests pass through original worker/artifact components. | Full original Control + Worker + native PostgreSQL commit/rollback observation, including an authenticated foreign result and valid result. |
| PCR-PRISM-CONTROL-002 | Original Control + native temporary Postgres; selection/four feedback actions, real DB error rollback and lost-ACK replay. | Code present: internal UUID separate from wire identity; direction change and preference/receipt share reserved transaction. Original SQL trigger failures, rollback, four feedback actions and exact replay pass. | Native pooled Control HTTP/session flow, SQL failure before event, lost acknowledgement. |
| PCR-PRISM-CORPUS-001 | Native Postgres pool ≥2 connections, competing requests and insert failures; no partial rows/open transaction. | Code present: entire lookup/advisory lock/write scope uses the reserved `inTransaction` connection. Original corpus SQL regressions pass. | Genuine pg.Pool with two backend PIDs, real pgvector, competing barriers and insert failures; existing native gate cannot start without a dedicated DB. |
| PCR-PRISM-WORKER-001 | Original Control/Worker + temporary Postgres/artifact store; readable correct full log and store failure remains errored. | Code present: required full log uses the original authenticated/digest-bound artifact path; original Executor/Engine/HTTP/CAS regression yields readable matching bytes; corrupt store still errors and budget rejects oversized log. | Complete original Control + Worker with native DB and artifact storage, confirming completion/rollback at the actual service boundary. |
| PCR-PRISM-ENGINE-001 | Many actual captures in a long-lived worker, retained cache/heap budget, coalesced same-key work and Control-backed restart. | Code present: bounded active ownership and completed LRU entry/byte budgets with immutable serialized retention. Original repeated-render/cache/coalescing and durable artifact reopen tests pass. | Long-lived genuine capture/retained-heap acceptance and Control-backed restart replay; prepared capture gate fails because Chromium is absent. |
| PCR-PRISM-RENDERER-002 | Actual iframe Previous/Next clicks cause the original App transitions in both directions. | Code present: distinct declarative previous/next actions reach original preview flow protocol; renderer tests pass. | Actual sandbox iframe clicks changing original App state in both directions; prepared Studio gate fails at browser launch. |
| PCR-PRISM-STUDIO-002 | Real canonical image preview/browser rendering with load/size/integrity denials and retained sandbox/CSP. | Code present: same-origin bounded digest-verified asset loading, cancellation, separate resolved sources and data-image CSP retain sandbox. Original asset HTTP/store and projection tests pass. | Real browser image decode/naturalWidth, CSP/sandbox and denied/corrupt/oversized UI cases. Prepared tests did not reach those assertions. |
| PCR-VISUAL-001 | Old manifest version versus actual new capture rejects; accepted newly captured/reviewed baseline succeeds. | Code present: v2 manifest captures actual browser version, provider rejects mismatch before comparison, old manifests require recapture. Three original local identity/preflight tests pass. | Actual browser capture versus obsolete manifest and approved newly captured baseline; native provider gate fails for missing Chromium. No baseline was fabricated or approved. |

## Scope of remaining work

Except PATH-T02-003's completed original local acceptance, the missing original
proofs are native integration acceptance, not permission to silently mark the
remaining findings verified. Optional broader E2E evidence is not promoted into
an additional prerequisite for the bounded round-persistence finding. Required practical prerequisites are a
non-root environment or an explicitly provided dedicated local PostgreSQL server
(with pgvector for corpus), the actual locked Chromium runtime, and the actual
OpenClaw/gateway integration for agent/session lifecycle checks. No deployment,
CI run, external message, model call or production migration occurred.
