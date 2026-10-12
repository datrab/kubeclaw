# Stage and report-adapter configuration inventory

Status: authored source inventory, pending independent review. No runtime, image, native sandbox, deployment, or overall F1/CONFIG acceptance is claimed. This inventory covers every `stages` and `reportAdapters` registration in the 48 maintained plugin manifests, including manifests with neither registration. Classification is not a D17 exception: configurable defaults still need explicit authored configuration and migration before fallback removal can be accepted.

Evidence: [complete roster, schemas and field mapping](../../evidence/config-stage-report-plugin-inventory-20260921/mapping.json), [verbatim source-expression index](../../evidence/config-stage-report-plugin-inventory-20260921/source-expressions.json), [original source identities and snapshots](../../evidence/config-stage-report-plugin-inventory-20260921/source-identities.json). The mapping preserves raw schemas, required membership, bounds, enums, nested properties, local references and conditional branches. Name occurrences are navigation evidence, not proof that each occurrence is a consumer. The snapshots are an inventory scope, not a complete execution dependency closure.

## Actual configuration path

Nova stage definitions supply `config` and `input` separately. Foundation `registry/configuration.ts` validates stage configuration through `validateReferencedValue`; `registry/schema.ts` distinguishes that validator from its default-applying resolver. Stage configuration does **not** acquire schema defaults through the test-provider resolver. `core/execution/stage-executor.ts` forwards the definition's configuration into the plugin invocation. Runtime registration validation, capability-grant validation and invocation authorization remain independent boundaries. Declaring `requiredCapabilities` does not create a grant or bypass resource constraints.

`engine-runtime.ts` validates the runtime configuration; `engine-snapshots.ts` retains configuration and execution definitions for recovery. Changing a current owner file must not reinterpret or rewrite a historical snapshot, its policy digest, selected encoding, agent identity or wait expiry. A migrated current adapter can remain incompatible with an old pinned runtime; do not silently normalize old records into the new configuration. Read-only historical interpretation needs its own explicit, version-bound contract.

`agentRole` is not an alternative dispatch target: Core's `run-decisions.ts` and `pipeline-loop.ts` use it as event metadata. The actual `agent` values feed dispatch. Thus an apparently unused plugin-local property can still have a Core consumer.

## Stage registrations and proposed owners

One future plugin file per package, with explicit registration sections, is proposed below. These names describe proposed authority, not implemented files. Stage-specific inputs, repository revisions, grants and historical format selectors remain distinct from shared operator policy. Empty schemas do not justify inventing an operator section with defaults.

| Proposed owner | Registrations | Actual config and current interpretation |
| --- | --- | --- |
| `architecture-validator.config.json` | architecture | Required `agent` is the dispatch identity; optional `agentRole` is Core metadata. |
| `blueprint-sync.config.json` | sync | Closed empty config; behavior is supplied by stage inputs and capabilities. No operator settings identified in its config schema. |
| `buster-quality-gate.config.json` | quality | Optional `agent`, `agentRole`, `testAgentEnabled`; schema declares `true`, while code independently uses `!== false`. An enabled evaluator requires a nonempty agent; disabled evaluator still executes the native test plan and records its decision. This is not a bypass of test-plan authority. |
| `case-study.config.json` | case-study | Required `agent` selects runtime dispatch. |
| `delivery-lint.config.json` | delivery-lint | Closed empty config. Dockerfile parsing defaults such as inherited `/` working directory are parsing semantics, not evidence of an operator-configured filesystem root. |
| `demo-handoff.config.json` | candidate, delivery, ready | All three use a closed empty stage config. This package also contains a separately configured adapter; its controller endpoint, trust/secret references and durable-store limits must not be attributed to these stage schemas. A future owner must keep adapter and stage sections explicit. |
| `human-approval.config.json` | approval, architecture-approval | Required `target` and `issuerId`; optional `timeoutMinutes`, schema default 60, bounds 1–525600 minutes. `approval.ts` separately defaults to 60 and computes wait expiry; issuer identity participates in actual wait authorization. Target/issuer have bounded, trimmed, control-free schema strings. |
| `implementation-agent.config.json` | implementation | Required `agent`, optional `agentRole`; dispatch identity and event annotation are separate. |
| `lint.config.json` | pre-check, full | Required `policyPath`, `policyProject`; optional `includeDebt` and `includeExperimental`, each schema default false and actual code enabled only by `=== true`. Stage forwards these into `lint.execute`; the same package's adapter restricts repository and policy roots before invocation. A path in a stage definition does not grant access outside those roots. |
| `pipeline-review.config.json` | review | Required `agent`, optional `agentRole`; agent dispatch and metadata, not provider implementation settings. |
| `preflight-contract.config.json` | validate, source | Closed empty configs; declaration and source inputs are separate request contracts. |
| `prism-design.config.json` | design | Required `agent` constant `prism`, `target`, `issuerId`, and `timeoutMinutes` with 1–525600 minute schema bounds. Normal registry validation is stronger than the direct runtime decoder, which checks a positive safe integer but not the schema upper bound. The no-design branch returns before local config decoding; this does not remove normal registration validation. |
| `project-summary.config.json` | summary | Optional `agentRole` and `deliveryManifestEncoding`. The latter is a historical serialization selector, not an operator timeout or a new default to insert into old snapshots. |
| `review.config.json` | review, repository-audit, repository-revalidation | Required review agent, audit/revalidation reviewer model and optional runtime/agent/thinking/profile/policy and encoding fields, as enumerated in the exact schemas. This package has substantial code-authored policy described below; configuration property presence does not prove each registration consumes every shared-schema property. |

There are 21 stage registrations across 14 packages. Input and result schemas are preserved with the package snapshots and are not counted as config properties. For example, repository-review request grade, scope, concurrency and phase budgets are not interchangeable with registration configuration.

## Review policy, code limits and historical selectors

Review's ordinary stage defaults `profile` to `gate`; repository audit defaults it to `audit`. Repository audit and revalidation independently default reviewer runtime to `subagent`, reviewer agent to `codex`, and thinking to `high`; the model remains required. Revalidation also derives its execution profile from its request. Do not assume the shared audit schema's optional `profile` or `policy` automatically overrides that revalidation request path.

`review-policy-profiles.ts` owns the `gate`, `lean` and `audit` profiles. These include limits, blocking criteria, priority/category weights, scope policy and advisory policy. For orientation, gate has maximum proposals 64, root causes 5, instances 100, bundle 4 MiB, context files 48 (initial 40), individual file 512 KiB, total context 3 MiB (initial 2 MiB), dependency depth 2 and expansion 8. Priority weights are P0=1000, P1=500, P2=100, P3=10; category weights include correctness/security 1000, contract 900, architecture 100 and simplification 10. The bound source and nested policy schema are authoritative for the complete profile, not this abbreviated illustration.

`review-policy-resolver.ts` validates complete candidate policies, chooses the last authorized candidate, freezes it and binds its digest and source provenance. Its `settingsFile` parameter is a supplied policy **object**, not a file-read implementation. The generic resolver can accept an explicitly authorized run override; that API must not be represented as an automatically exposed operator/stage override. Stage calls supply a built-in profile and optional config policy. Moving built-in policy to an owner file must preserve selection, provenance, encodings and digest semantics, while preventing two independent operator authors.

Encoding selectors (`reviewSemanticEncoding`, `reportArtifactEncoding`, `deliveryManifestEncoding`) preserve old versus explicitly selected serialization behavior. An absent selector must not silently become the newest encoding during recovery. This is a compatibility boundary, not permission to retain configurable operational defaults indefinitely.

Additional source-level capacities and protocols are indexed separately. Prism design bounds architecture artifact reads at 256 KiB and archive processing at 32 MiB/4096 names. Review helpers contain further bounded request/profile and evidence-processing rules; package sources and the expression index preserve their actual values. Request acceptance, parser grammar, security ceilings and adjustable resource policy must be classified before migration, rather than indiscriminately converting literals into knobs. A later migration must explicitly decide the destination of each configurable limit and test its actual consumer.

No new direct environment-based author is established by the stage registration path. Referenced capabilities can still reach adapters, subprocesses, files, credentials and provider-specific environment; stage config is not the full authority for those paths. The lint and demo-handoff overlaps are concrete examples. Source expressions involving `process.env` or file reads are preserved for inspection, without claiming that every package-local adapter is exercised by every stage.

## Report adapter: registration versus execution policy

The only report registration is `kubeclaw.junit-report` / `junit`: format `junit`, contract version 1, export `adapt`, media types `application/junit+xml`, `application/xml`, `text/xml`. There is **no report-adapter configuration schema** or default-applying registration config resolver to migrate. The plan pins adapter identity, format, contract and package. `specialist-report-finalization.ts` checks those associations; accepting arbitrary compatible-looking output is not sufficient.

A proposed `junit-report.config.json` can own genuinely configurable parser/detail policy only if the normal report execution contract is extended explicitly. Shared execution budgets belong once in Buster's report-execution policy, not duplicated as imaginary registration settings. Today their real author is `specialist-report-finalization.ts`:

| Budget | Current author and units |
| --- | --- |
| Accumulated result bytes | 16 MiB per finalization; each invocation receives the remaining bytes. |
| Input source bytes | At least 1, at most 64 MiB, derived from the selected artifact's declared size. |
| Cases / findings / findings per case | 5000 / 5000 / 100. |
| Timeout | Minimum of cleanup timeout and 300000 ms. |
| Memory | 512 MiB per adapter child. |
| CPU | Timeout rounded down to whole seconds, minimum 1000 ms. This is an existing derivation, not an independent configured value. |
| Open descriptors | 64. |

`report-adapter-runtime.ts` requires all nine limit fields, positive safe integers, and enforces security ceilings: source 64 MiB, result 16 MiB, timeout/CPU 300000 ms, memory 2 GiB, open files 256; descriptors must be at least 16 and CPU an exact second. Required memory is 64 MiB + 3×source + 2×result. Detail ceilings are 5000/5000/100. These domains are separate: source bytes, aggregate result bytes, process memory and CPU cannot be treated as a single storage quota.

The runner constructs a file artifact reader rooted at its artifact root and a private adapter-package directory beneath `observabilityRoot/report-adapters`. Package/source captures and artifact-reader validation are actual file boundaries. The child is launched through the plugin sandbox with explicit memory/CPU/open-file constraints, Node heap derived as 70% of memory with a 16 MiB minimum, restricted filesystem access, disabled addons/SQLite, and environment `{NODE_NO_WARNINGS: '1'}`. Input is newline-delimited JSON with base64 artifact bytes and explicit detail caps; output must be exactly one JSON line. This source description is not proof that sandbox enforcement has run on the target kernel.

JUnit code further caps XML depth at 256, tag scanning at 65536 JavaScript string units, captured text at 8192 string units and normalized emitted text at 4096 string units; despite the tag constant’s `BYTES` name, its consumer indexes the decoded string, not the original UTF-8 bytes; case duration is capped at 30 days. XML grammar/entity/encoding validation and fixed labels are protocol behavior. Capacity choices require a separate explicit policy decision under D17; calling them parser behavior does not authorize keeping configurable defaults in code. Credentials or endpoints are not JUnit configuration fields. Files and process authority originate in the Buster runtime boundary above.

## Migration and documentation acceptance

1. Preserve the 48-manifest roster, all 21 stage and one report registration contracts, every raw schema property/branch, and existing assertion/deadline scope. Establish one physical owner file per applicable plugin with explicit registration sections; shared report execution policy has one Buster owner. Empty stage sections must not become alternate authors for their package's adapters.
2. Enumerate each actual stage definition/config author and resolve operator-owned settings once before invocation. Preserve stage-input values, grant authority, agent/model identities, event metadata and resolver precedence. Exercise normal registry validation and actual consumers, not only direct factory calls. Test two authored values for every migrated operational budget, missing/invalid/legacy fields (including equal/empty), and omission mutants against the actual consumer.
3. Remove both schema and code operational defaults with an explicit activation/migration boundary. Test disabled quality evaluation, no-design behavior, both human-approval registrations, both lint registrations and all three review registrations. For shared schemas, prove consumption or explicitly retire unused properties through a versioned contract; do not infer consumption from schema presence.
4. Preserve historical snapshot bytes, runtime compatibility, review policy provenance and encoding selectors. Demonstrate recovery refusal where required and separately test any permitted read-only historical interpretation. Never select historical limits from today's owner file or fabricate an unknown producer's defaults.
5. Report policy migration must test actual artifact/package selection, the accumulated result budget, two real process profiles and timeout/output/memory/descriptor boundaries, malformed adapter output and identity mismatch. Separate host/source checks from genuine sandbox/kernel proof. Do not count a mocked executor as that proof.
6. Operator documentation must name each physical owner, loader/activation and restart behavior, every unit/bound and derivation, relative-path base, credential-reference authority, validation/side-effect order and rollback limitations. Document normal grants and adapter restrictions alongside stages, and clearly distinguish current-source inventory, implemented migration, local runtime and live deployment acceptance.

This document completes an authored inventory scope only. Independent semantic/source review and every migration/runtime acceptance step remain separate.
