# Extend Prism Safely

Status: implemented extension guidance with stated runtime limits
Audience: Prism maintainer, service developer, contract author, Studio developer
Owner: Prism maintainers
Evidence: skills/prism; contracts/prism/v1; tests/verification/contracts
Evidence revision: `4e52c72788ac002788bc036a497d76c13e6a35fd`
Applies to: current Prism source, contracts, services, and deployment integration
Last verified: source and test inspection on 2026-09-19

## Purpose

Use this page when you change Prism itself.
It explains where a change belongs, which boundary it can cross, and which
checks must prove the change.

Read [Prism runtime architecture](../../understand/prism-runtime.md) before you
change a service boundary. Read [Prism data architecture](../../understand/prism-data.md)
before you change a durable record. Use the [Prism operator journey](../../use/prism-studio.md)
to verify that a new feature remains operable.

## Start With the Smallest Owner

Do not add a feature to Control only because callers can reach Control directly.
Select the component that owns the meaning.

| Change | Primary owner | Other boundaries that can change |
| --- | --- | --- |
| A field, identity, or wire shape | `contracts/prism/v1` | Domain, Engine, Control, Studio, migrations, and consumers |
| A typed document edit | `skills/prism/domain` | Contract operation schema, Studio adapter, tests |
| A design operation | `skills/prism/engine` | Worker binding and engine request/result schemas |
| A provider call | Engine provider implementation | Cancellation, limits, secrets, evidence, and cache identity |
| A public HTTP operation | Prism Control | Session, CSRF, internal identity, database transaction, client |
| Attempt execution | Prism Worker and neutral Worker Core | Profile, envelope, artifact hydration, result binding |
| Source acquisition | Prism Ingestion | Rights, quarantine, digest, retention, Control handoff |
| Retrieval or ranking | Corpus module and PostgreSQL | Eligibility policy, query evidence, benchmark |
| A visual editor action | Prism Studio | Typed domain operation and stale-revision handling |
| HTML rendering | Renderer | Contract node catalog, output limits, preview isolation |
| A durable field or invariant | Prism storage migration and repository | Backup, rollback, reader compatibility, operator procedure |
| Nova or Buster handoff | Prism pipeline adapter or Nova stage plugin | Approved digest, immutable artifacts, downstream contract |

**Decision:** Keep product meaning in Prism and generic attempt mechanics in
Worker Core.

**Reason:** Buster and future engines need the same admission, deadline,
cancellation, resource, journal, and result rules without importing design
policy.

**Rejected alternative:** Add Prism request types or renderer policy to Worker
Core.

**Cost:** A change can require coordinated updates to a Prism contract and its
Worker binding.

> **Source evidence — ownership boundary**
>
> [The public Prism runtime exports Engine, Worker binding, and Domain without changing Worker Core](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/runtime.ts#L1-L3).
>
> [The Worker binding admits only the five Prism operations and validates exact request and result schema identities](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/engine/worker-binding.ts#L1-L49).
>
> [The Prism role declares neutral Worker Core as a separate package dependency](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/packaging/runtime/roles/prism.json#L1-L28).
>
> **Claim:** Prism owns specialist design meaning while its runtime and role consume neutral Worker Core separately.
> **Implementation:** The runtime exports Engine, Worker binding and Domain; `executePrismOperation()` validates the specialist request and result contracts.
> **Contract or setting:** Only `generate`, `render`, `evaluate`, `ingest` and `publish` belong to `kubeclaw.prism-design-engine@1`.
> **Test evidence:** `engine.test.mts` asserts opaque Worker transport and unknown-operation rejection; inspected, not executed for this batch.
> **Revision:** `4e52c72788ac002788bc036a497d76c13e6a35fd`; the linked runtime, Worker binding and role remain byte-identical.
> **Limit:** A valid specialist operation or role declaration does not prove admitted native execution or a deployed Worker.

## Prepare a Development Checkout

1. Use Node.js 24 and install the repository lockfile without changing it.
2. Run `npm run typecheck --prefix skills/prism`.
3. Run `npm test --prefix contracts/prism/v1`.
4. Run the smallest Prism test command for the component that you will change.
5. Record whether PostgreSQL, a browser, cgroup v2, or root launcher authority
   is available. Do not report a source-only check as live proof.

The Prism package separates component checks from environment checks.
The normal test suite uses local and in-memory substitutes where the test name
does not state a native dependency. Native PostgreSQL, browser, worker, backup,
and deployment checks require their named environment.

> **Source evidence — maintained commands**
>
> [The Prism package defines focused Domain, Renderer, Storage, Engine, Corpus, Quality, Pipeline, Studio, and native-worker commands](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/package.json#L1-L48).
>
> [The contract package keeps schema generation, contract tests, and type checking together](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/contracts/prism/v1/package.json).
>
> **Claim:** Prism exposes focused component commands; contract generation and environment-dependent checks remain separate prerequisites.
> **Implementation:** Prism and contract package scripts select their own tests, generation, type checking and service/build entrypoints.
> **Contract or setting:** Contract `pretest`/`pretypecheck` generate validators; Studio `prebuild:studio` does likewise, so selected checks can write generated files.
> **Test evidence:** Package scripts were inspected, not executed; their declarations give no component, browser, PostgreSQL or native-worker result.
> **Revision:** `4e52c72788ac002788bc036a497d76c13e6a35fd`; both linked package definitions remain byte-identical.
> **Limit:** Command availability does not supply its dependencies, native authority or a successful prepared checkout.

## Change a Public Contract

Prism contracts are versioned machine boundaries.
The JSON schemas and generated standalone validators are the wire authority.
TypeScript types make the same shapes usable by services and browsers.

Use this sequence:

1. Identify every producer, consumer, durable record, and artifact that uses
   the shape.
2. Decide whether the change is compatible. Use a new schema or contract major
   for an incompatible change.
3. Change the source schema.
4. Update semantic checks when JSON structure alone cannot protect the rule.
5. Regenerate validators. Do not edit generated validators by hand.
6. Update the Engine request/result digest mapping when the operation wire
   shape changes.
7. Add positive, unknown-field, size, depth, reference, and old-version tests.
8. Update Studio and service consumers before publication.
9. Define recovery for durable old values before deployment.

The public admission limit is 32 MiB encoded JSON, depth 256, and 1,000,000
visited values or properties. A service can set a smaller transport limit.
Increasing a transport limit does not increase the contract limit.

> **Source evidence — contract change path**
>
> [The contract entry exports generated validation plus semantic checks for public Prism values](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/contracts/prism/v1/src/index.ts).
>
> [Complexity admission defines the depth, visit, and encoded-byte ceilings](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/contracts/prism/v1/src/complexity.ts).
>
> [The generator creates browser-compatible standalone validators from the maintained schemas](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/contracts/prism/v1/scripts/generate-validators.mjs).
>
> **Claim:** Public Prism validation combines generated schemas, semantic rules and bounded JSON-complexity admission.
> **Implementation:** `validatePrism()` and engine validators apply complexity checks; the generator writes browser-compatible standalone validators from maintained schemas.
> **Contract or setting:** Public JSON ceilings are depth 256, one million visited nodes/properties and 32 MiB encoded bytes; transport limits may be smaller.
> **Test evidence:** No contract test or validator generation ran here; schema and generator inspection does not prove old/new consumer compatibility.
> **Revision:** `4e52c72788ac002788bc036a497d76c13e6a35fd`; the linked validation entry, complexity guard and generator retain those bytes.
> **Limit:** Fresh-schema validation does not establish migration of durable old records or all browser/service consumers.

## Add or Change a Document Operation

The canonical Studio editor input is a typed operation, not a replacement
document. Each operation carries `baseRevision`. Control applies it only to
that revision and creates a new immutable revision.

There is one separate whole-document boundary. A fenced Agent job can submit a
complete next `PrismDocument`. Control validates its job, project, round,
preference generation, source revision, exact revision increment, and complete
document before the repository replaces the current pointer. Do not reuse this
privileged Agent boundary as a browser update shortcut.

The current operation owners are:

- `node.insert` adds one declared subtree;
- `node.remove` removes a non-root node;
- `node.duplicate` copies a subtree with new stable IDs;
- `node.move` changes one parent and index without creating a cycle;
- `node.props.set` changes canonical properties;
- `responsive.props.set` changes one viewport patch; and
- `operation.batch` applies operations with one common base revision.

To add an operation:

1. Add its closed schema and TypeScript union member.
2. Define its revision rule, target identity, allowed fields, and invalid state.
3. Apply it to a structured clone. Do not mutate the accepted prior revision.
4. Validate the complete resulting Design Document.
5. Add the Studio conversion only after the domain operation exists.
6. Test stale revision, duplicate IDs, missing targets, root protection,
   cycles, invalid indexes, responsive patches, and batches.

Do not accept a complete browser document as an update shortcut.
That shortcut hides who changed which invariant and makes concurrent edits
unsafe.

> **Source evidence — operation authority**
>
> [The Domain union checks the supplied base revision and enforces structural rules, cloning, and full result validation](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/domain/index.ts#L5-L113).
>
> [The Puck adapter converts supported editor changes into typed Prism operations](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/studio/puck-adapter.ts#L204-L263).
>
> [The fenced Agent revision route validates a complete next document before repository replacement](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/server/control-server.ts#L265-L277).
>
> **Claim:** Browser edits use typed base-revision operations; fenced Agent replacement is a distinct privileged complete-document path.
> **Implementation:** `applyOperation()` clones and validates the result; the Agent route checks job, project, generation and exact next revision before replacement.
> **Contract or setting:** An operation must match the source revision; Agent replacement additionally requires its current job fence and complete document validation.
> **Test evidence:** `domain.test.mts` asserts stale-revision rejection and no partial source mutation; inspected, not run for this batch.
> **Revision:** `4e52c72788ac002788bc036a497d76c13e6a35fd`; linked Domain, Puck adapter and Agent route retain those bytes.
> **Limit:** Pure Domain assertions do not prove database compare-and-swap, Agent authentication or concurrent deployed editing.

## Add a Node Type or Renderer Feature

A node type crosses four boundaries: contract, semantics, renderer, and Studio.
Treat these changes as one unit.

1. Add the node name and closed property rules to the contract catalog.
2. Define which properties accept tokens, data bindings, actions, children,
   variants, state patches, and responsive patches.
3. Add semantic rules for references and forbidden type changes.
4. Render escaped text and allowlisted attributes only.
5. Add the Studio component and property controls.
6. Add evaluation rules when accessibility or flow behavior changes.
7. Test canonical rendering, each viewport, each state, malformed properties,
   missing assets, unsafe text, and CSP-compatible preview use.

Do not let a document supply arbitrary HTML, JavaScript, CSS declarations,
browser flags, or network locations. These values would turn design data into
execution authority.

> **Source evidence — rendering boundary**
>
> [The renderer checks the contract node catalog, resolves bounded tokens and data, escapes output, and selects explicit render branches](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/renderer/index.ts#L1-L225).
>
> [Document semantics prevent component-type replacement through state and responsive patches](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/contracts/prism/v1/src/document-semantics.ts).
>
> **Claim:** Renderer changes must preserve contract-governed nodes and escaped output rather than treating design data as executable markup.
> **Implementation:** The renderer resolves declared tokens/data and explicit node branches; document semantics reject component-type changes through patches.
> **Contract or setting:** Node catalog and document semantics constrain supported properties; a new renderer feature cannot bypass those input rules.
> **Test evidence:** The maintained `test:renderer` command selects renderer/remediation assertions; it was not executed for this inspection.
> **Revision:** `4e52c72788ac002788bc036a497d76c13e6a35fd`; linked renderer and document-semantics files remain byte-identical.
> **Limit:** Escaped renderer output does not prove browser layout, CSP isolation, accessibility or arbitrary external asset safety.

## Change a Design Provider

A `DesignProvider` has two bounded operations: propose typed document operations
and create an embedding with model identity.
The Engine, not the provider, applies operations and validates the final
document.

For a provider change:

1. Keep credentials outside request values and durable documents.
2. Forward `AbortSignal` to every network call and stop parsing after abort.
3. Bound response bytes and reject non-JSON or incomplete structured output.
4. Return typed operations. Do not return a trusted complete document.
5. Record model and model-version identity with every embedding.
6. Include every behavior-changing input in cache or idempotency identity.
7. Test abort before dispatch, abort in flight, timeout, malformed output,
   duplicate delivery, and changed input under one idempotency key.

The Engine supports only `generate`, `render`, `evaluate`, `ingest`, and
`publish` in contract major 1. Adding an operation is a contract change, not a
provider-only change.

> **Source evidence — provider containment**
>
> [The provider interface returns typed operations and model-bound embeddings](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/engine/index.ts#L12-L34).
>
> [The Engine fingerprints operation and input, owns idempotent execution, validates documents, and applies provider operations itself](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/engine/index.ts#L69-L176).
>
> **Claim:** Providers propose typed operations or model-bound embeddings; Engine owns validated document mutation and idempotent request identity.
> **Implementation:** Engine fingerprints operation/input, shares cached execution and applies provider operations through Domain before returning the result.
> **Contract or setting:** Generation accepts declared operation input; ingest requires nonempty bounded text and a nonempty finite embedding vector.
> **Test evidence:** `engine.test.mts` asserts shared concurrent execution and conflicting-key rejection; inspected, not executed for this batch.
> **Revision:** `4e52c72788ac002788bc036a497d76c13e6a35fd`; the linked Engine/provider interface retains those bytes.
> **Limit:** Deterministic-provider assertions do not prove live provider cancellation, network limits, persistence or human publication approval.

## Change Retrieval or Ingestion

Ingestion and retrieval share data, but they have different authority.
Ingestion decides whether source material can enter quarantine and durable
corpus storage. Retrieval can select only already eligible records.

For an ingestion change:

1. Define the source class, locator policy, rights input, redirect policy,
   byte limit, and quarantine lifetime.
2. Acquire bytes in the isolated service.
3. Verify TLS, pinned address behavior, redirects, media type, and digest.
4. Normalize only allowed facts.
5. Create embedding evidence with model identity.
6. Commit rights, revision, current pointer, and embedding in one database
   transaction.
7. Remove or retain quarantine data according to the recorded outcome.

For a retrieval change:

1. Apply status, rights, validity, model, required, and avoid filters before
   ranking.
2. Keep text and vector candidate identity visible.
3. Use stable tie breaking.
4. Apply preferred traits and source-family diversity after eligibility.
5. Record the ranking profile and inputs needed to reproduce the result.
6. Change weights only with a representative benchmark.

Do not make an external provider response eligible before rights and digest
admission.

> **Source evidence — corpus safety**
>
> [Corpus ingestion validates source and rights data, serializes duplicate inputs, and commits the rights, revision, current pointer, and embedding together](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/corpus/index.ts#L30-L148).
>
> [Search filters current usable records and combines text and vector candidates with deterministic ranking and source-family limits](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/corpus/index.ts#L150-L238).
>
> **Claim:** Corpus ingestion and retrieval retain separate admission, transactional ownership and eligibility/ranking responsibilities.
> **Implementation:** `ingest()` serializes equal input digests and writes related rows transactionally; `search()` filters eligible current records before final selection.
> **Contract or setting:** Retrieval requires active, rights-eligible, unexpired records; vector retrieval also matches the requested embedding model before ranking.
> **Test evidence:** The maintained `test:corpus` command selects corpus assertions; no native PostgreSQL/pgvector or acquisition test ran for this inspection.
> **Revision:** `4e52c72788ac002788bc036a497d76c13e6a35fd`; the linked corpus implementation remains byte-identical.
> **Limit:** Corpus row admission does not prove Ingestion TLS/address/quarantine enforcement or representative retrieval quality.

## Change Evaluation or Preferences

Evaluation reports findings. It does not approve a design.
A human approval remains bound to one exact revision and digest.

When you add an evaluation rule:

1. Select `blocking`, `review`, or `information`.
2. Select an existing gate or version the finding contract.
3. Produce a stable finding ID from stable content.
4. Name a view, node, flow, or other exact target when possible.
5. Add a valid example and a failing example.
6. Keep the rule deterministic. Put model critique in a separate evidence path.

Preference events are append-only evidence.
A projection can decay scores or group evidence, but it must retain origins and
respect retractions.
Do not replace source events with one mutable preference score.

> **Source evidence — evaluation and preference boundaries**
>
> [The evaluator emits stable findings but does not emit its reserved visual-quality gate](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/evaluation/index.ts#L4-L180).
>
> [Preference projection validates events, deduplicates identity, applies retractions, retains origins, and calculates time-dependent effective scores](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/preferences/index.ts#L1-L89).
>
> **Claim:** Evaluation findings and time-dependent preference projections supply evidence, not human approval or replacement source history.
> **Implementation:** The evaluator hashes stable finding content; preference projection validates identities, rejects conflicting duplicates and honors retractions before scoring.
> **Contract or setting:** Finding levels remain blocking/review/information; effective preference scores depend on the supplied projection time and retained origins.
> **Test evidence:** `quality.test.mts` asserts blocked findings, preference retraction and decay; inspected, not executed; this gives no human approval result.
> **Revision:** `4e52c72788ac002788bc036a497d76c13e6a35fd`; the linked evaluator and preference projection retain those bytes.
> **Limit:** Deterministic findings give no visual-quality gate or approval, and projection scores do not erase original preference events.

## Change Control or an HTTP Route

Control is the public product authority, not a generic router.
Every write route must identify its caller, validate bounded input, bind an
idempotency or revision identity, perform one explicit durable transition, and
return a stable failure.

Use this sequence:

1. Decide whether the route is public, Studio-only, agent-only, worker-only,
   ingestion-only, or internal artifact traffic.
2. Select session, CSRF, ingress secret, bearer secret, or SPIFFE identity as
   required by that trust boundary.
3. Define authorization separately from authentication: identify which role or
   project membership can read or change each resource.
4. Set the request byte and body-time limit before JSON parsing.
5. Validate the contract and relationship rules.
6. Put related database changes in one transaction.
7. Use compare-and-swap for a mutable current pointer.
8. Commit durable intent before remote dispatch.
9. Reconcile an uncertain remote response by stable identity.
10. Add client handling and an operator diagnosis path.
11. Test wrong method, wrong identity, unauthorized resource, stale revision, duplicate request,
    conflicting duplicate, cancellation, restart, and storage failure.

The current shared browser-session helper authenticates a Prism audience and
checks CSRF. It does not enforce stored roles or project membership on the
general Studio routes. The current JSON body helper also enforces a byte limit,
but no body-read deadline. New work must close these gaps explicitly; using the
existing helpers does not satisfy the authorization or body-time requirements.
Most current Control failures become `422`, including several authentication
and storage failures, so a stable failure does not yet imply a precise HTTP
status class.

Do not infer an operator identity from a normal browser header.
Do not expose internal artifact upload or worker dispatch through the public
Studio proxy.

> **Source evidence — Control boundary**
>
> [The Control server separates health, session, dispatch, agent, project, document, revision, approval, baseline, artifact, corpus, and preference routes](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/server/control-server.ts#L142-L940).
>
> [Session exchange signs a bounded Prism audience and derives identity from the trusted ingress boundary](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/control/session.ts#L3-L20).
>
> **Claim:** Control separates product, internal and Agent routes; session authentication does not supply missing general project-role authorization.
> **Implementation:** The Control router selects explicit handlers; session exchange derives its Prism audience from the trusted ingress identity.
> **Contract or setting:** Session verification and CSRF protect browser authentication; the shared body helper bounds bytes but provides no body-read deadline.
> **Test evidence:** No Control HTTP or database test ran for this inspection; existing role-authorization, body-deadline and broad 422 limits remain.
> **Revision:** `4e52c72788ac002788bc036a497d76c13e6a35fd`; linked Control and session sources remain byte-identical.
> **Limit:** Router/session code alone does not establish deployed ingress identity, per-project authorization or precise failure-status classification.

## Change Worker Execution

The worker HTTP service accepts a neutral Worker envelope.
The Prism binding validates the specialist contract and result.
Native execution adds a root-owned launcher, cgroup scope, durable attempt and
ownership records, artifact hydration, and a bounded result body.

Before you change this path:

1. Decide whether the rule is generic Worker Core behavior or Prism meaning.
2. Keep claim, profile, engine digest, schema digest, package, capability,
   deadline, and cancellation binding intact.
3. Preserve admission before launch.
4. Preserve one owner for engine execution and idempotency cache entries.
5. Keep artifact digests and media types authoritative after hydration.
6. Forward cancellation through HTTP, Worker Core, Engine, provider, browser,
   and cleanup.
7. Seal a result only after cleanup and final resource observation.
8. Stop admission when ownership, process termination, or journal state is
   uncertain.

Do not add a direct fallback that runs specialist code outside the admitted
native boundary in production.

> **Source evidence — worker integration**
>
> [The worker service limits probes and attempts and routes accepted work through the configured attempt executor](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/server/worker-service.ts#L1-L107).
>
> [Native execution binds the fixed host entry, environment, browser path, Control URL, and runtime policy](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/server/native-worker-execution.ts#L1-L38).
>
> **Claim:** Prism Worker admits neutral envelopes through its configured native executor rather than a production in-process specialist fallback.
> **Implementation:** The HTTP service authenticates and validates attempts; native execution recovers ownership/journal state and fixes the per-attempt host command/environment.
> **Contract or setting:** Native readiness gates dispatch; new attempts require the accepted profile and requested resource budgets within supervisor policy.
> **Test evidence:** No worker-service or native-host fixture ran for this inspection; configured execution and reconciliation gates are Source evidence only.
> **Revision:** `4e52c72788ac002788bc036a497d76c13e6a35fd`; linked Worker service and native-execution implementations retain those bytes.
> **Limit:** A readiness branch does not establish host authority, descendant cleanup, artifact hydration or final result sealing in deployment.

## Change Studio

Studio is a client of Control.
It does not own database state, approval authority, or publication authority.

For a Studio change:

1. Start from a supported Control read or write contract.
2. Keep the project, round, design-set, document, revision, and approval
   identities visible in client state.
3. Convert editor changes to typed operations.
4. Send the exact base revision.
5. On conflict, preserve local intent, load the current revision, and ask the
   user to reconcile. Do not silently overwrite.
6. Keep preview messages origin-bound and map actions only to declared flows.
7. Keep Control proxy paths on the allowlist.
8. Test desktop and compact layouts, keyboard use, focus, failure messages,
   stale revisions, disconnected requests, and reload.

> **Source evidence — Studio boundary**
>
> [Studio derives flow transitions only from declared Design Document actions](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/studio/flows.ts#L1-L47).
>
> [The Studio server separates health, approved proxy routes, and static-file containment](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/server/studio-request.ts#L1-L139).
>
> **Claim:** Studio follows declared flow actions and proxies Control requests without acquiring durable state or approval authority.
> **Implementation:** Flow helpers validate document actions; the Studio server separates health, `/v1/` forwarding and contained static-path resolution.
> **Contract or setting:** Preview actions must match declared source location/action/node; proxying needs its configured ingress secret and bounded upstream timeout.
> **Test evidence:** `studio-roundtrip.test.mts` asserts projection/edit preservation; inspected, not run; no browser or proxy execution occurred.
> **Revision:** `4e52c72788ac002788bc036a497d76c13e6a35fd`; linked flow and Studio-request implementations retain those bytes.
> **Limit:** Static-path containment is not symlink isolation; `/v1/` forwarding is not a per-route authorization allowlist or Control health proof.

## Change Storage or Add a Migration

Never change an existing applied migration.
Add the next ordered migration and keep older readers in mind.

1. Name the durable invariant and the owner of every new column or table.
2. Define whether existing rows remain valid.
3. Write an additive migration when possible.
4. Separate schema change from credential-role transition.
5. Use the migrator role for DDL and the runtime role for application access.
6. Add repository methods with explicit transactions and compare-and-swap.
7. Test from a new database and from the oldest supported schema state.
8. Test rollback of application code while the new schema remains.
9. Update backup grouping and restore order when the new data depends on an
   artifact or another store.
10. Run native PostgreSQL checks before cluster acceptance.

Do not put large binary content in PostgreSQL.
Upload immutable content-addressed bytes first, verify their digest, and then
commit the database reference.

> **Source evidence — storage change path**
>
> [The migration runner serializes migration application and records each migration filename and application time; it does not store a content digest](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/storage/index.ts#L11-L75).
>
> [The revision repository creates immutable revisions and advances the current pointer with a compare-and-swap update](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/storage/index.ts#L262-L330).
>
> [The content-addressed artifact store verifies bytes and uses no-replace publication](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/storage/artifacts.ts#L39-L67).
>
> **Claim:** Migration ordering, immutable revision advancement and content-addressed artifacts protect different durable boundaries.
> **Implementation:** Migration records filenames under its transaction lock; revision writes use compare-and-swap, while artifact publication verifies bytes without replacing existing objects.
> **Contract or setting:** An applied migration filename skips reapplication without SQL-content hashing; artifact IDs must name their verified SHA-256 bytes.
> **Test evidence:** `storage.test.mts` asserts migration locking, revision conflicts and artifact roundtrip with PGlite; inspected, not executed here.
> **Revision:** `4e52c72788ac002788bc036a497d76c13e6a35fd`; linked storage/revision and artifact-store implementations retain those bytes.
> **Limit:** PGlite assertions do not prove native PostgreSQL privileges, SQL-content drift detection, crash durability or a matched application restore.

## Change Publication or Pipeline Handoff

Publication uses human approval authority.
Bind approval to the exact design revision, document digest, warnings,
architecture input, previews, specification, and bundle content.

The handoff to Forge is read-only and module-scoped.
The handoff to Buster names fixed visual targets and the approved baseline
digest.

For a handoff change:

1. Start with an approved immutable baseline.
2. Preserve its digest in every downstream assignment or test declaration.
3. Reject an unknown target.
4. Keep Forge access read-only.
5. Keep Git visual baselines under a separate reviewed change workflow.
6. Do not let a render, test, or notification path create approval.

> **Source evidence — downstream binding**
>
> [The pipeline adapter rejects a missing digest or target and creates fixed Buster targets and read-only Forge assignments](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/prism/pipeline-adapter/index.ts#L1-L57).
>
> [The Nova Prism stage verifies architecture and approval identity before it returns a baseline](https://github.com/datrab/kubeclaw/blob/4e52c72788ac002788bc036a497d76c13e6a35fd/skills/nova/plugins/prism-design/src/stage.ts).
>
> **Claim:** Downstream plans and assignments preserve approved baseline identity without granting Buster or Forge design-approval authority.
> **Implementation:** The adapter maps fixed visual targets/read-only module assignments; the Nova stage verifies architecture references and imports the approved archive.
> **Contract or setting:** Handoff needs a valid baseline digest; Forge assignments reject unknown targets, while Nova approval binds issuer, architecture and approved bundle digest.
> **Test evidence:** `pipeline-adapter.test.mts` asserts malformed-digest rejection and read-only module targets; inspected, not executed for this batch.
> **Revision:** `4e52c72788ac002788bc036a497d76c13e6a35fd`; linked pipeline adapter and Nova Prism stage retain those bytes.
> **Limit:** A mapped digest alone does not authenticate human approval or prove the complete Nova-to-Prism-to-Forge/Buster deployment path.

## Verification Matrix

Run the smallest row that covers the change, then run the complete Prism suite.

| Change | Required local proof | Additional environment proof |
| --- | --- | --- |
| Contract or semantics | Prism contract tests, validator generation check, typecheck | Browser consumer build when browser contracts change |
| Domain operation | Domain and domain-storage tests | PostgreSQL test for durable application |
| Engine or provider | Engine, provider-cancellation, worker-binding tests | Real provider only when release policy permits it |
| Renderer or evaluation | Renderer, remediation, quality tests | Playwright capture for browser behavior |
| Corpus or retrieval | Corpus tests | Native PostgreSQL with pgvector and representative benchmark |
| Preference projection | Preference and preference-generation tests | Native database transition when stored wire identity changes |
| Control route | Control, internal-auth, and focused route tests | Native PostgreSQL and deployed ingress identity |
| Worker path | Worker service, cancellation, readiness, and binding tests | Native worker, cgroup v2, launcher, browser, and PostgreSQL |
| Studio | Studio adapter, roundtrip, preview-asset, typecheck, and build | Playwright desktop and compact flows |
| Migration | Storage and domain-storage tests, plus an explicit review that applied filenames match the intended SQL | New database, upgrade database, backup, and restore; add a digest guard before claiming SQL-content drift detection |
| Pipeline handoff | Pipeline-adapter and Nova-stage contract tests | Complete Nova-to-Prism environment acceptance |

Relevant environment tests can be unavailable on a development machine.
Record this as unavailable proof. Do not convert it to a pass.

## Review Checklist

Before merge, answer each question:

1. Which component owns the new meaning?
2. Did a wire or durable contract change?
3. Which old version remains readable?
4. Which exact identity makes a retry safe?
5. What happens after cancellation or process loss?
6. Can a stale browser or worker overwrite newer state?
7. Can untrusted content become code, HTML, CSS, a URL, or a database query?
8. Which secret and peer identity protect each new call?
9. Which artifact and database records must enter one backup group?
10. Which focused, native, browser, and live checks prove the claim?

If an answer is unknown, stop the change at that boundary.

## Related Reading

- [Prism architecture](../../understand/prism.md) gives the complete reader route.
- [Prism runtime architecture](../../understand/prism-runtime.md) explains service
  ownership and communication.
- [Prism data architecture](../../understand/prism-data.md) explains durable state,
  retrieval, rendering, approval, and publication.
- [Operate Prism](../../use/prism-studio.md) gives the user and operator journey.
- [Worker Core](../../understand/worker-core.md) explains the neutral attempt layer.
- [Prism decisions](../../decisions/prism.md) preserves accepted alternatives and
  their costs.
