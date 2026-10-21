# Independent four failure/recovery workflow review

2026-10-21; reviewer /root/operator_acceptance, author /root/workflow_acceptance. Read-only review, no source/public/register changes. Source checkout at report: `0e7606922f9a1859dad8709959784a4794d57a84`. Exact candidate hashes below. All four drafts and complete helper, author reports and raw local proof reviewed. Parent owns public integration, helper execution at installed paths, publication and actual Reader artifact checks.

## Verdict and complete finding set

**NOT_READY for unconditional four-guide union; four bounded corrections below.** These are actual content/procedure guards, not refusal because native Redis or a delegated cgroup host is unavailable. Interruption guide is independently **Source PASS / semantic Reader PASS / Quality PASS** in its stated scope. Repair, Redis and Worker drafts have the specific findings below; their remaining reviewed content is sound. No additional material finding found in this review.

### F1 — redis-replay-recovery.md:85

Other observers/runs can continue is only best_effort behavior; required mode throws and aborts drain. Source: `skills/nova/core/telemetry/observers.ts:90`.

Bounded off-tree fix: In best_effort mode, later events for that observer/run stop for this drain while other observers/runs can continue. In required mode, runtime throws REQUIRED_OBSERVER_DELIVERY_FAILED and aborts that drain; restoration does not waive the failure policy.

### F2 — worker-result-recovery.md:79

Not every record with absent scope is a stop: empty transitions to disposed; no binding or prior boot transitions to abandoned after host-identity validation. Source: `skills/worker/core/worker/native-worker-ownership.ts:262`.

Bounded off-tree fix: Ownership recovery kills/drains a verified present matching scope and retains counters. A missing scope with durable empty phase transitions to disposed; a missing unbound reservation or prior-boot binding transitions to abandoned under the validated original host identity. A missing same-boot bound nonempty scope, unrecorded scope, reappearing retired scope or changed binding stops recovery. Keep the existing full-state-map link.

### F3 — repair-retry.mjs:42

Invalid resume is invoked after first audit without a new complete raw capture; invalid control submissions can themselves open/repair journals. Source: `docs/site/use/operate.md:303`.

Bounded off-tree fix: Immediately before invalid-resume CLI invoke add capture(directory, raw-before-invalid-resume, runId), with a literal quoted label, retaining existing before-valid and before-final captures. Document the added capture. Verify the capture exists and strict parses before the intentionally rejected child starts.

### F4 — repair-retry.mjs:34

Partial-execution guard checks run.command.json, which is written only after child return; helper termination while first child runs leaves no guard and allows a later run to spawn another child before existing-run validation. Source: `repair-retry.mjs:25`.

Bounded off-tree fix: Create an exclusive whole-fixture run-start intent with flag wx after ownership/unused-fixture checks but before spawning any child, reject any existing intent on later run calls, and retain it on failure. Test an owned fixture with run-start intent but no command result rejects before CLI or journal access; do not rewrite original source markers or repair runtime code.

## Coherent complete Source/consumer assessment

**Repair/retry:** actual budgetFixture copies the trusted TEST stage and production artifact store, creates native private Git history, explicit nine-attempt/seven-remediation/one-technical-retry budgets and two automatic orders per lint/review/test category plus one extra orchestrator order. The source TEST stage changes/commits version only on non-retry calls, writes real artifact evidence and emits deterministic findings. Documentation accurately excludes production quality-agent/plugin-isolation proof. Actual Core CLI child, strict pure journal parser and real lifecycle reducer are used. Mixed5source/1technical/3category orders and4/3/2 checks; technical2source/1retry/0orders; extra4source/3lint orders/exactly1authorization with later test pending all match retained results and current algorithms. Invalid digest is rejected before event append, actual wait/issuer/digest/history bind authorization, and fixture issuer text is explicitly not production authentication. Completed-child state/artifact captures and strict replay are meaningful; F3/F4 must finish the helper's intended preservation/re-entry boundary. UID/path/source-root/HEAD ownership guards, exclusive writes, private root and owned cleanup reviewed. Natural HEAD-drift rejection is a real retained stop, not silently edited into successful cleanup. No helper execution at its not-yet-installed relative import path is claimed here.

**Interruption:** complete original checkpoint fixture, test stage, actual Core recovery/effect-safety logic and all three external-effect tests read. A real child is killed only after an awaited artifact response and durable marker, confirmed SIGKILL, original event observation, same-platform/graph/run CLI recover, recovered attempt2 reading the actual original artifact, exactly one artifact-created event and terminal success. Separate dependency graph is accurately distinct. The local HTTP service really fsyncs one mutation; before-receipt/after-receipt/lost-response yield unresolved/continuation-required/terminal stops and exactly one mutation, not synthetic application success. No generic external replay authority or hidden TEST-to-production crossover. The page separately sends real incidents through stopped-writer whole raw state/adapter preservation, pure parse before storage-opening audit/recover/resume, original identities and final audit. Native fixture cleanup is explicitly not an incident archive. Supports FLW-009's documented task without pretending live deployed execution.

**Worker:** read complete actual native executor, attempt recovery/journal, ownership supervisor, final-result construction, Prism startup/execution and local writer/ownership tests; exact unchanged Worker conceptual scope reused only where sourced. Accepted full envelope persists before launch; private journal stripes/quota and full identity bind; binary original spool/process archive/sealed result survive. Prism reconciles ownership then journal before HTTP listen. Cached original sealed receipt bypasses re-admission; archived process reconstruction requires disposed ownership/final-counter equality and original output integrity. Accepted/no-process seals errored interrupted-result-unavailable, with never-launched cleanup not_required vs other cleanup failed and admission fencing. Claims/generation/host identity/PVC migration and scope authority are not inferred from PID/directory. F2 is the narrow exception-map wording defect. Storage/lock crash tests do not become kernel workload execution. Native-scope command and four real environment prerequisite names match actual source; no unsupported universal recover/kill/result-import operator control is invented. A source-backed explicit stop with named owners is valid completion under compact contract1–4, not failure merely for lacking a host.

**Redis/observer:** actual adapter/Lua/stream identity, observer deliver/recovery/drain and native/socket/file-observer tests fully read. Kind/target streams, canonical-key dedup SHA, real receipt ID, credential boundary, payload size, approximate trim, TTL loss and no payload comparison are accurate. Same effect receipt replay is distinct from second physical send through a NEW TEST-ONLY journal; this is expressly not a production retransmission operation. Original completed delivery/checkpoint rebuilding, persisted attempts, stable effect keys and exception for operator-messaging are sourced. Required-mode distinction is missing only at F1. No generic checkpoint rewind/budget reset/receipt clear/terminal-run replay exists and the guide does not invent one. A registered original-event recovery can end in exact safe stop if an owner continuation is unavailable. Direct host ingress lossy queue/dead-letter distinction remains preserved; Nova observer history is not falsely offered as its replay source. Native redis-server was not run and source/native fixture explanation is not represented as its successful execution. Existing deployed diagnose page remains owner of approved fault/restore identity; new health entries are expressly not original-event replay.

## Independent checks and evidence

- Own execution exit0: `env -u SWARM_CONFIG -u NODE_ENV node --test tests/verification/reliability/external-effect-recovery.test.mts tests/verification/reliability/observer-recovery.test.mts tests/verification/reliability/worker-native-journal.test.mts tests/verification/reliability/worker-ownership-store.test.mts`. **19/19 PASS, 0 skips**, 7780ms. Log `failure-workflows-independent-tests.txt`. Only local owned fixtures/HTTP/writer processes; no deployed service or cgroup workload.
- Own immutable Source check exit0: all **24 excerpts /21 distinct source files** in four drafts use complete bytes equal to current Source and valid ranges <=60lines. Details `failure-workflows-independent-source-links.json`. This is citation integrity, separately from complete semantic review above.
- Read author's actual raw logs: checkpoint0; external3/3; observer1/1; Worker ambient production import failure retained, explicit development selection15/15; repair mixed/technical/extra results + invalid digest/event-byte control + raw replay + cleanup previous fixture and natural current-HEAD stop. These remain author execution evidence, not relabelled our runs. Native Redis not run; host scope absent, no fabricated live green.
- Read source CLI and canonical operate preservation instructions: audit/recover/resume open mutable FileJournal and may repair incomplete tails, hence F3 applies even to rejected signals. Existing pure parser rejects incomplete/corrupt copied chains without opening source stores.

## Requirement/gate decision and Reader limits

FLW-009: content independently READY within local actual checkpoint recovery + exact external-mutation stops, contingent only parent installation/navigation/publication checks; candidate canonical target is interruption-recovery.md plus existing operate/recovery owners. This off-tree report is not a matrix completion or actual built-reader acceptance.

FLW-007: after F3/F4 and targeted independent helper re-entry/capture checks, this rehearsal can close the concrete retry/repair gap; do not claim production implementation gates passed. FLW-015 and FLW-016: F1/F2 respectively require correction and targeted rereview; unexecuted native Redis/kernel are truthful product/proof limits, not themselves outstanding documentation gaps. Their procedures otherwise explain prerequisites, permissions, retained identities, supported actions, actual states, retry authority, recovery stop and cleanup.

A99-08 is NOT wholly accepted by this batch: these four topics supply Redis/Worker/external-effect components; registry/image, Tailscale and Demo-delivery components must come from their independently accepted unchanged scopes. A99-12 is NOT wholly accepted here: root owns actual fresh-context installed minimal/full/error journey integration/execution; our source/semantic traversal and author raw proof are not fabricated fresh-reader execution. No other gates or register records are promoted.

## Exact reviewed candidate SHA256s

- `repair-retry.md`: `e7b9df1740d37d8f82d5f571a67ffe1b1325b7e9c95a0d8255072a9057062f7c`
- `repair-retry.mjs`: `78e1b60c4c05d832fb3d0d662f19af38f122db42a27201a5657c4c4107c0337d`
- `interruption-recovery.md`: `b61a37d28ad9f9305cd0d69ebdb199ddfed6ab8168c843b4f299efc2298097e0`
- `worker-result-recovery.md`: `41a8696e70bd8424cbe16ee43b45a895e480910a13e76fa5c1e28a0431be3f1f`
- `redis-replay-recovery.md`: `ef49e101cb5b7206ef0c077ec94296c3b211c1cbf081eb0f1694e692831ada28`

Source additions beyond linked-object manifest:

- `skills/worker/core/worker/native-worker-ownership.ts`: `e297616eae31d0c14a0e319c18f1c64090bd39e42603bb661c0ea096c4dc8bfd`
- `skills/worker/core/worker/native-attempt-journal.ts`: `9115ef644c440d5024745149613f63b971ba444ac54147b750f405e1ac2167e4`
- `skills/worker/core/worker/native-result.ts`: `11c8074a973fec8f764e64668e29c7d4907a5b9e605b6bad04cbfa0454d318bd`
- `skills/nova/core/state/journal.ts`: `25be25a991c93c0e523178e3c45e2f7fb15ecad6e1a03566fca241d6b27f40bf`
- `docs/site/use/operate.md`: `aa713a0462cf8b4781831c2021f3f96fa4e4a263806c27350247d7aa5366f745`
- `tests/verification/reliability/worker-ownership-store.test.mts`: `af2319b4a8c90b71b58cd6a3d46e7349fde0593151d4130af7d9c09a8765787b`
