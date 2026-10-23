# OpenClaw /goal: CONFIG inventory, definition and gated implementation

Copyable start objective, current readiness, concrete next work, implementation
transition and later-phase resume rules: [GOAL-START.md](GOAL-START.md).
The whole CONFIG migration is the intended outcome; current C0 gaps are autonomous
work, not inventory tasks delegated back to the user. Package authorization below
remains explicit; bounded evidence fixes alone do not make implementation ready.

## Current C0 work checkpoint

Active work branch: `codex/config-c0-semantic-inventory-20261012`, based on the
handoff commit `9452d35524192f8665bc87254b3c63a361e7bd4a`. The current
[working definition](config-definition-current.md),
[semantic inventory](config-semantic-inventory.json),
[acceptance matrix](config-acceptance-matrix.json) and
[raw evidence](../evidence/config-acceptance/README.md) persist incremental work.
**C0 remains in progress and is not accepted.** Schema/candidate rows with open
consumers and incomplete proposed cases remain explicit; they do not satisfy
the gates below. A fresh independent reviewer checks the work against code.
No production/test implementation, C1 approval, deployment or production-finding closure
has occurred. Continue semantic closure and review before asking for approval.

The four document-integrity findings from the user-requested `21bf` review are
now [corrected and independently verified](../evidence/config-acceptance/four-findings-fix-20261013/README.md).
The fresh zero-conversation-context reviewer also identified a Runtime root
conservation guard gap; its correction has a
[clean bounded recheck](../evidence/config-acceptance/independent-four-findings-recheck-20261013/root-guard-recheck/README.md).
Historical findings and failures remain preserved. This closes only those five
evidence/validator corrections, not production findings, global C0, native or
module acceptance. Original obligations and C1–C6 authorization remain unchanged.

The original [independent Core challenge](independent-config-c0-core-domain-a07de567.md)
is preserved with its historical **NOT ACCEPTED** verdict. Its material corrections
and subsequent RCORE-001/002 fixes are now
[independently verified at bounded definition scope](independent-config-c0-core-final-recheck-40cf24e7.md).
This covers adjustable proposed domains, complete canonical case specifications,
additional schema dispositions and six retention callers, not global C0 or runtime
acceptance. Runtime/delivery/plugin/agent scope and complete C1 package remain open.
Raw failures continue to be preserved; no implementation approval is asked.

Current handoff: 12 October 2026, `datrab/kubeclaw`, branch
`codex/cloud-config-handoff-20261012`. This file is the current autonomous task
entry and does not require the previous chat or `AGENTS.md`. The user has disabled
AGENTS loading in OpenClaw. All task rules, authorization, code-quality requirements
and acceptance gates are contained in this document and its explicit references.
Do not enable AGENTS loading or require a second instruction entry to run this goal.

## Goal and current authorization

Complete **C0**, the code-based semantic inventory and concrete CONFIG definition,
have it checked by a **fresh independent subagent**, correct legitimate findings,
and present a bounded implementation package with its exact acceptance cases to
the user. Persist all results in the repo so work can resume without chat history.
**Do not implement C1–C6 before the user approves the concrete package.**
The name change requested by the user is a confirmed target: evolve/rename the
existing central `swarm.config.json` to **`pipeline.config.json`** during the
approved migration. **`pipeline.json` remains the project/workflow graph.**
Do not invent a second system index or interpret the existing `--pipeline` as
the new system-config input. Author root/location and actual CLI migration must
be justified from code. A filename decision is not permission for all C1 work.

The user asks for complete acceptance, no hardcoded configuration fallbacks, no
spaghetti code and a fresh independent acceptance reviewer. D21/D22 record these
latest decisions. They supplement D17–D20; historical wording remains readable.

## Read order and current facts

1. [Decisions D17–D22](decisions.md), including priorities and durable bindings.
2. [Original acceptance](acceptance-20260920.md): A1–A8, CONFIG F1–F6 and the
   D17 component-author amendment F2a/F3a/F4a/F5a/F-DOCa. Original F2 singleton
   wording is historical; one authoritative component author is current.
3. [Cloud task](CLOUD-CONFIG-TASK.md), [implementation order](implementation-order-20261012.md).
4. [Current code/group assessment](cloud-config-assessment-20261012.md),
   [earlier definition](config-definition-20261012.md) and
   [earlier schema discovery](config-scope-inventory-20261012.json).
5. [Baseline source navigation](../evidence/cloud-config-assessment-20261012/source-index.json),
   [AST discovery](../evidence/cloud-config-assessment-20261012/settings-discovery.json),
   [actual verification](../evidence/cloud-config-assessment-20261012/verification.json).
6. [Independent cloud assessment](independent-cloud-config-assessment-20261012.md)
   and the original sources/evidence referenced by these documents.

The production code has not been changed by this cloud assessment. Six existing
Swarm component authors, a separate Buster runtime variant, 48 Pipeline plugins,
two OpenClaw extensions and an Ops plugin are enumerated. Marker/manifest/hash
counts prove discovery/identity only, **not semantic field coverage**.
Current groups G01–G39 are a scope map, not a finished field inventory.

Baseline verification at source commit
`4b4684667c2dc27d01583fbec395c94d9f7a0456`: register consistency passes.
`verify:config:components` with Helm 3.18.4: 649 tests, 645 pass, 4 fail, 0 skips;
four negatives reject old inputs but their expected diagnostic patterns do not
match Helm wording. Raw failures are preserved. Do not declare this suite passed,
or silently fix/weaken assertions during C0. Determine intended semantic rejection
and include the test corrections in the appropriate approved implementation slice.

Still absent/not established: complete semantic C0 inventory, approved first
implementation package, approved other-session test-refactor specification,
actual deployed Nova profile, external installed-plugin roster and external
Secretstore revision contract. These do not prevent independent code-based C0.
For needed external information, document the exact missing input and continue
all unaffected work. Do not invent operator profiles, secret versions or capacity.

## Full ordered task list

| ID | Work and required output | Current state / gate |
|---|---|---|
| C0.1 | Verify current branch, history, tools, sources and original evidence. Establish source boundaries independently, including scripts, Docker, Go controller, Charts, CI filters, role packaging, releases and host inputs. Do not rely solely on the provided discovery filters. | Source/group discovery exists; semantic completeness still open |
| C0.2 | Classify every configuration field/pattern and relevant code default into operator setting, protocol invariant, version, secret reference, generated binding or task data. Trace actual productive readers and callers; resolve schema refs and dynamic ENV/CLI maps. | Open |
| C0.3 | Complete current/target authority matrix, profile/instance selection, validation, activation, recovery/retry/budget and Eval contracts. Reuse the existing Swarm architecture; target name `pipeline.config.json`. Justify physical author locations and every proposed new mechanism. | Open |
| C0.4 | Map actual execution units to modules, including project implementation/lint/review/test/repair, standalone Prism orders, Buster plans/fixtures and run-scoped adapters/observers. Define versioned durable bindings before dispatch and fixed Eval mode. | Open; no implementation |
| C0.5 | Produce full requirement/case matrix and bounded C1 proposal. Fresh independent C0 reviewer verifies completeness against code/original requirements. Correct findings and obtain review of material corrections. | Must finish before requesting implementation approval |
| C1 | Approved first slice: consolidate existing six authors/Buster profiles as justified by C0, evolve/rename the existing system entry, preserve selected effective values and deliver one generation through real Charts/Images. Migrate CI filters/buildcontexts/release guards and actual packaging callers together. | Proposal only, not approved |
| C2 | Approved Nova/Core slice: integrate system entry, orchestration/Plugin Runtime policy and compiler execution profiles; keep workflow input separate, preserve versioned recovery and actual caller compatibility. | Proposal only |
| C3 | Approved Engine/Service/Operator slice: remaining Buster runtime/entrypoint values, Prism engine/attempt/services, extensions, Namespacecontroller, deployment/endpoints/trust/storage/host bindings. | Proposal only; no D18 worker refactor |
| C4 | Approved Plugin/Agent/Model/Prompt/Tool-policy slice: complete profiles per owner/registration/instance, effective real consumers and default-free runtime resolution. Distinguish task fixtures from centrally authored settings. | Proposal only |
| C5 | Approved execution-binding slice: immutable module snapshots, persistent config closure before dispatch, allowed next-module activation, stable run policy and fixed-generation Eval selection; validate/explain/diff/materialize operations on real loaders. | Proposal only; not a complete Evalrunner |
| C6 | Consolidated F1–F6/F-DOC/A1–A8 proof, alternate operator profiles, old-author rejection, drift/mutation/real consumer evidence and fresh independent acceptance. Separate local acceptance from live gates. | Open; no global PASS from one slice |
| T | Test refactor under the specification authorized in the other session; preserve obligations and evidence. | Later phase; do not invent categories |
| W | D18 simplified Kubernetes execution: Prism order/attempt per Job; Buster full plan with fixtures per Job. Claims/identity/results/reconciliation/security/retention preserved. | After T; not CONFIG implementation |
| H | Reassess and individually address the twelve historical findings after CONFIG/T/W. | No automatic finding closure |

The twelve later findings are PCR-BUSTER-ENGINE-001/004, PCR-OBS-002,
IFR-21-001, IFR-29-001, IFR-04-001, IFR-10-001, IFR-01-001, IFR-02-001,
IFR-16-001, IFR-26-001 and IFR-28-001. Preserve their original criteria and IDs.

## Mandatory deliverables and unambiguous completion states

Keep the semantic inventory at `config-semantic-inventory.json`, requirement/case
traceability at `config-acceptance-matrix.json`, definition and package plan in
`config-definition-current.md`, execution/evidence records beneath
`../evidence/config-acceptance/`, and independent reports in
`independent-config-<gate>-<source-identity>.md`. These are required target artifacts,
**not claimed to exist yet**. Update current entry/status docs consistently.
Archive superseded reports; do not overwrite historical meaning or raw failures.

Inventory rows require: stable setting ID; owner/instance/profile scope; class;
source path/field and content identity; current value/default and precedence;
type/unit/supported domain; real reader plus productive caller chain; schema and
semantic validation/error contract; target author/ref; activation scope; recovery,
retry, claim/deadline/budget effects; profile/Eval suitability; migration action;
linked requirement/case IDs; verified source evidence. Field-pattern groups are
allowed only with identical ownership, reading, validation and activation rules;
enumerate their members. Broad labels such as “all plugins” do not close fields.
Never store actual secrets in the inventory or effective-config output.

Case rows require: stable case ID; linked setting/requirement IDs; local/live scope;
exact productive caller; input/config profile; prior state; expected effect or
exact intended rejecting boundary; observer/method; actual test/command; source
AND test digests; tool/dependency/image/config identities; raw evidence path;
actual result and reason; reviewer confirmation. Results are `passed`, `failed`,
`blocked`, `not-run`; skip/timeout/unknown/empty collection are never PASS.
Historical results are separately labelled and cannot satisfy current cases.
During C0, implementation cases describe proposed executable checks and remain
`not-run`; their specification is reviewed, their runtime PASS is not required or
claimed before implementation. C0's actual source/definition checks need real
evidence. After approval/implementation, corresponding runtime cases must execute.

Commit/tree + test identities and immutable config hashes are mandatory at each
acceptance. If dirty, retain the exact patch and every untracked input digest.
Post-test material changes invalidate affected cases. Matrix consistency check
must detect missing/duplicate IDs, dangling links, unexplained excluded inputs,
unresolved inventory rows, absent raw logs and unreviewed required cases.

## C0 gate: exhaustive definition before implementation

| Criterion | Required evidence | Reject completion when |
|---|---|---|
| C0-A source coverage | Independently enumerated current authors/readers/schema refs/ENV/CLI/deployment/entrypoint/CI/host surfaces; per-source disposition and hashes. Every discovery candidate is linked to a semantic row, duplicate or independently checked non-setting classification. Include sources missed by scanners. | Marker counts, schema lists, old reports or group names substitute for actual meaning; unexplained exclusions/dynamic refs/readers remain |
| C0-B authority | Every setting/pattern has actual current author/default/priority/consumer and exactly one proposed author per active scope. Copies/aliases/generated outputs and shared bindings classified explicitly. | Source/default/consumer unresolved; duplicate writers or runtime precedence remains ambiguous |
| C0-C real boundaries | Complete field-level activation/validation/migration/case assignment; protocol/input/version/secret classifications have concrete consumer reasons. | Operator defaults relabelled constants; optionality hides a replacement value; fake permissive schema or unsupported model parameter |
| C0-D binding | Module membership, run-stable policy and durable pre-dispatch snapshot/recovery transitions mapped to actual execution paths; crash/parallel/publish/retry/budget cases specified. | Reload-per-stage/HTTP request instead of a module contract; claims/frists/budgets reset; current config fills missing history |
| C0-E review/package | Fresh independent reviewer checks the full expected scope and matrix, samples are supplemental only, all blocking findings corrected/rechecked. C1 exact boundaries/delta/acceptance and genuine open decisions presented to user. | Self-acceptance, no fresh reviewer, hidden unresolved inventory, implementation approval inferred from filename or `/goal` |

## Implementation gates after explicit package approval

Original F1–F6/F-DOC/A1–A8 remain mandatory, supplemented by these concrete gates.
Before changes, freeze the intended requirement/case set in a recorded baseline;
expansion is allowed, reduction requires explicit user decision. Reviewer verifies
that expected case IDs were actually executed, not only process exit/test count.

| Gate | Required proof at the real production boundary |
|---|---|
| F-AUTH | One author per migrated setting. Selected values demonstrably reach productive readers. Generated Graph/Chart/ENV files are immutable projections. Missing values do not acquire schema/code/ENV/CLI/Chart/entrypoint defaults. Old competing input is rejected even if equal-valued. |
| F-VAL | Missing required field/profile/file, wrong type/unit, unknown key/owner, invalid bounds/relations, duplicate or escaping refs and incompatible grant/profile rejected before effect; working positive control reaches that same boundary. |
| F-EFFECT | Two materially different complete valid profiles change each distinct adjustable behavior at its real consumer; declarative deployment fields use real render/package/load proof. Grouping tests needs identical consumer/contract plus independent justification. No mock replacement for the component whose behavior is claimed. |
| F-DELIVERY | Real author→materializer→package/render→mount/load/image closure, known digests and complete file set. Pure config/name/profile change reaches actual CI input filter and allowed Buildcontext. Release guards detect changed generation. No test-only expander/manual Sync. |
| F-BIND | Crash before/after binding and dispatch; concurrent module starts during publish; recovery/retry/continuation/cleanup. Started A stays A, permissible unstarted module may select valid B; fixed Eval remains A. Invalid B cannot partially activate or trigger silent fallback. Grants, budgets, claims/deadlines and uncertain Effects remain stable. |
| F-MUT | In an isolated checkout, deliberately reintroduce a fallback, second author, missing binding or bypassed relevant validator/limit. The exact appropriate productive negative/behavior case must fail for the intended reason. Preserve mutant, command, identities/logs; restore clean baseline and rerun decisive cases. Compile/tool/setup failure does not kill a semantic mutant. No changes to production hosts. |
| F-CODE | Explicit ownership/dependency map and before/after productive call chains. Separate coherent loading/validation/publication/binding/business responsibilities; no duplicate parsing/default sources, circular owner dependencies, ambient mutable config, overgrown mixed-responsibility module or unrelated rewrite. Reuse suitable loaders/state/registries. Existing relevant lint/typechecks plus independent architecture inspection; token file splits or arbitrary generic abstractions do not satisfy this gate. |
| F-DOC | Correct current filenames, loader/CLI/profile rules, units/defaults/errors, migration/activation/recovery/secret limitations, runnable commands/examples and checked links; no conflicting current instruction. Full independent review of code/tests/matrix/logs, with relevant failures independently reproduced. |

Hardcoded fallback prohibition applies to configurable production settings,
including catch-and-retry defaults, coerced missing values, `useDefaults` resolution
and recovery “Latest” selection. Moving a literal to a helper/generated file is
not removal. Protocol identities/digest algorithms, supported numeric domains and
verified task-data semantics may remain constants; justify each classification
in C0. In approved migrated paths, optional feature activation must be explicit;
optional fields cannot quietly synthesize an operator policy. Legacy unmigrated
fallbacks remain inventoried open work, never excuse marking global CONFIG done.

“Spaghetti prohibited” is the F-CODE structural gate above. It is not a demand to
rewrite unrelated code or invent arbitrary file/function length thresholds/new
test categories. Existing test standards apply until the other-session standard
is authorized. Behavioral regression and architectural cleanliness are separate
mandatory checks, neither substitutes for the other.

## Fresh independent acceptance reviewer

At C0 and each claimed package/global acceptance, spawn a new reviewer with fresh
context and no implementation responsibility. Provide this goal, original criteria,
current decision records, exact checkout identity and paths to raw evidence. Do not
inherit the author's conversation or present its conclusion as an instruction to
agree. Author artifacts are inputs to challenge, not proof. The reviewer writes
its own report and does not edit production code/tests to make acceptance pass.

Reviewer independently enumerates expected sources/fields/cases, checks semantic
consumer chains and fallback/authority paths, reviews all changed productive
boundaries and test weakening/scope exclusions, inspects F-CODE and verifies
raw identities/results. For implementation it independently repeats decisive
positive/negative/mutant and recovery cases at the exact final stand where safe;
if unavailable, records that criterion blocked rather than accepting a claim.
Hash checks or reading only the summary is insufficient.

Report includes reviewer/task identity, base/final source/test identities, expected
vs covered requirement/case sets, its actual commands/observations, findings with
paths, remaining gaps, per-gate verdict and explicit limits. Fresh review after
material changes; completion requires no unresolved blocking criterion and no
unknown required result. C0 must actually close semantic inventory; it is not
waived because C1 looks small. If subagents are unavailable, the acceptance gate
is blocked and must not be replaced with author self-review.

## Stop boundaries and handoff

Continue authorized C0 independently. When it is complete and independently
reviewed, ask the user only for genuinely new decisions and approval of the exact
implementation package; do not repeat confirmed principles. Persist the response
with approved package/case IDs. `/goal` does not convert an unresolved gate into
approval. Never deploy, touch production hosts, run paid Evals, redesign tests/
workers early, merge main or promote historical findings under this goal.

No instruction can guarantee that an agent cannot lie. These gates make claims
falsifiable through independent execution, full traceability, protected expected
scope and retained raw evidence. A completion statement without that evidence
must be rejected, even when tests claim green.
