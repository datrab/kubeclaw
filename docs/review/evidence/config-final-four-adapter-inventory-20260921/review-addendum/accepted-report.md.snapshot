# Final four adapter registrations: bounded configuration inventory

Status: bounded source inventory independently accepted; no migration or runtime acceptance. See [independent review](independent-config-final-four-adapter-inventory-20260921.md). This covers Nova `demo-handoff:handoff`, `lint:executor`, `pipeline-review:evidence` and `repository-adapter:repository`, the four remaining registrations in the previously established 26 adapter/observer roster. It does not close F1, all plugin settings, stage/provider settings, tool policy, native execution or CONFIG/D17. No tests, network calls, secret reads or production edits were performed.

## Registry boundary and proposed owners

All four enter through their actual `plugin.json` adapter declaration and its config schema. Normal `prepareRuntime` selects providers/grants, enables required dependencies, validates `platform.adapters`, then supplies each config to AdapterRuntime. Schema validation does not insert defaults; direct factory calls can have different behavior and are not proof of normal registry acceptance. The complete configuration is persisted in the run snapshot and compared during recovery. Historical omitted values must not be filled from a new current file.

| Registration | Provides / required nested capabilities | Proposed single plugin owner |
| --- | --- | --- |
| `kubeclaw.demo-handoff:handoff` | `demo.handoff`; requires `artifacts.read`, `test.plan.evidence`, `operator.request`, `operator.receipt` | `plugin-demo-handoff.config.json`, explicit `handoff` section |
| `kubeclaw.lint:executor` | `lint.execute`; no nested registry capability | `plugin-lint.config.json`, explicit executor section; existing lint policy must be reconciled, not duplicated |
| `kubeclaw.pipeline-review:evidence` | `report.evidence.read`; requires `artifacts.read` | `plugin-pipeline-review.config.json`, explicit evidence section |
| `kubeclaw.repository-adapter:repository` | `git.repository.read`; no nested registry capability | `plugin-repository-adapter.config.json`, explicit repository section |

These are proposed files, not installed authors. Activation, provider selection and caller grants belong to orchestrator policy. A plugin-owned root does not confer access by itself. Existing stage configurations in these packages are excluded from this four-adapter schema count and still require their own inventory before a complete plugin migration.

## Handoff: all ten fields

Every adapter property is required; unknown properties are rejected. There are no adapter-schema defaults.

| Field | Validation / effect |
| --- | --- |
| candidateStageId | Nonempty ≤2048-character text; candidate artifact producer binding |
| deliveryStageId | Same text bounds; only this stage can `deliver`, and operator receipt lookup binds this stage |
| readyStageId | Same bounds; only this stage can `commit` |
| manifestStageId | Same bounds; exact manifest artifact producer binding |
| endpoint | Schema text ≤2048; decoder canonical HTTPS URL with exact `/v1/demo-ready`, no credentials/query/fragment; status requests append `/status` |
| tokenPath | Schema text; decoder absolute normalized path; token bytes are read from file per request, never central config values |
| caPath | Same path rule; per-request CA file for actual HTTPS trust |
| stateRoot | Same path rule; durable intent/receipt store |
| operatorTarget | Lowercase alphanumeric/`._:-`, 1–128 characters; operator publication and receipt target |
| timeoutMs | Schema integer 100–60000; direct factory uses Number before integer/range validation, so coercible direct input is broader than normal schema |

Text decoder also rejects controls, stronger than the generic schema strings. File credentials are not the `secrets.read` capability; direct HTTPS is not the `network.http` adapter. Caller `demo.handoff` grants constrain artifact namespace; nested artifact/evidence grants constrain their namespaces and operator request/receipt grants constrain targets. The adapter additionally binds caller stage, run, manifest, candidate/delivery digests, source evidence and authoritative operator receipt. A successful controller response must bind exact request digest, lease/request identity and retention timestamps.

Code capacity authors outside the schema: records 10000 / 64 MiB serialized state / 65536 bytes per record; request and response each 16384 bytes; token file 16384 bytes; CA file 1 MiB; source artifacts 8 MiB; generic text 2048 characters. Controller reads allow normal mounted-file symlink traversal; this inventory does not claim a no-follow credential boundary. Invocation combines the caller signal, shutdown signal and explicit timeout. Receipt recovery has no caller-signal parameter and combines only shutdown with its explicit timeout. Durable commit replays status rather than issuing another initial commit; preserve those intent/receipt bytes and exact body equality.

`protocol.retention(value=604800)` is an additional lower-level code fallback, bounded 1–9223372036 seconds. Current candidate/binding exact-shape paths require retentionSeconds explicitly, so the fallback is not evidence of an omitted accepted adapter setting. Retention is request/stage protocol authority and must be classified with those consumers, not silently moved into the adapter file. Namespace, schema IDs and request-identity algorithms remain protocol constants.

## Lint: two adapter fields, a separate productive policy surface

`allowedRepositoryRoots` and `allowedPolicyRoots` are required nonempty unique arrays of nonempty strings in the schema. The factory resolves entries against cwd and realpaths them; direct calls check strings but do not repeat every schema uniqueness/minLength rule. Requests are independently constrained by caller `allowedRoots`, `allowedPolicyRoots` and `allowedProjects`. The adapter checks the requested working directory and policy path against its own canonical roots. `lint.execute` executes local tools directly; no `command.execute` grant is introduced by the manifest.

Adapter schema coverage is only two fields. The actual engine reads request-selected `policyPath` under that authority, currently backed by `charts/kubeclaw/files/config/lint-policy.json` and referenced tool configs, baseline and Kubernetes packs. This is another real configuration author, not an ignored fixture. The policy requires explicit project/language/discovery settings, tools and positive `timeout_ms`; tool config files and packs contribute stored content digests. A plugin migration must choose one coherent policy author and reference model and retire the former writer; copying policy values into a new plugin file while continuing to read the old file would violate D17.

Verified code authors and default branches along the executor path:

- `engine/execution.ts` uses `opts.timeout ?? DEFAULT_TOOL_TIMEOUT` (30000 ms); normal tool invocations generally pass their policy timeout. Tool availability invokes `which` with 5000 ms. `safeExec` does not forward a maxBuffer override, so `process.ts` supplies its combined-output fallback of 10 MiB.
- Candidate checkout Git has explicit 60000-ms / 16-MiB process budgets and disables Git hooks. Its environment is inherited because this call omits env; normal tools use the separate allowlisted environment builder.
- Cleanup escalates at 250 ms, is bounded at 1500 ms, polls acknowledgment at 10 ms and scans `/proc` in batches of 64. These are distinct lifecycle policies, not tool execution timeouts or native cgroup proof.
- Normal-tool environment explicitly allowlists PATH/HOME/user/locale/temp/CI/editor/Node/XDG/Terraform/Semgrep/Go/Trivy/container/socket variables. Cache paths are code-derived below `os.tmpdir()/kubeclaw-lint-cache`; per-call allowed overrides apply after these paths. Tool executable names are code-authored and resolved through PATH.
- Discovery helper default depth is 3; normal policy discovery supplies `project.discovery_max_depth`. Missing Kubernetes settings produce disabled source arrays with default limits 128 files / 1 MiB per file / 10 MiB rendered / 2048 documents. Configured Kubernetes limits have explicit maxima 128 / 16 MiB / 64 MiB / 100000. Packs are ≤1 MiB each, ≤256 rules and ≤256 selected packs. Selected packs plus manifest/chart sources have a separate 256-entry evidence capacity.
- Missing Go settings produce empty modules; missing Terraform settings produce empty roots and null mirror. Optional tool config_path becomes null, arguments become empty; empty Semgrep targets become `['.']`. Missing Kubernetes pack list becomes empty. These are actual policy normalization branches requiring classification, not proof that absent data is centrally authored.

The adapter can execute against the current directory or a selected immutable revision checkout. It waits for active invocation settlement during shutdown. SourceRevision, tier, changed files, policyProject and optional request features remain request/stage inputs. This inventory does not finish the full lint-policy field/tool-rule taxonomy: every language scanner option, rule bundle, external binary behavior and stage selector remains a clearly identified follow-up surface despite having bound source copies. The four-registration roster must not be used to claim those settings complete.

## Pipeline review evidence: all five fields

| Field | Boundary / actual effect |
| --- | --- |
| storageRoot | Required nonempty schema string; factory string check, then Core readRunEvidence applies canonical/path authority |
| orchestratorIssuerId | Required nonempty string; binds original orchestrator evidence issuer |
| maximumJournalBytes | Required positive integer, factory safe-integer; budget supplied to original snapshot/journal/effect evidence reader |
| maximumArtifactBytes | Same numeric rule; aggregate selected artifact bytes, not merely a per-file cap |
| maximumBundleBytes | Same numeric rule; canonical serialized output bundle ceiling checked after construction |

No decoder fallback exists for these five fields. Caller `allowedRunIds` must include exact selected run ID; nested `artifacts.read` separately checks namespaces. Selection binds journal head, snapshot digest, source stage/revision and 1–128 unique artifact refs. The reader requires those refs to belong to the run/latest stage attempt, verifies actual JSON bytes/digest/size through the artifact provider, and rereads the evidence projection before returning to reject changes. A budget check after construction is not a transport allocation or global storage quota.

This is itself a historical consumer: Core reads immutable run-snapshot and journals; package/config evidence is retained but intentionally not exported as raw credentials/config in the report bundle. Narrative status remains draft rather than an entailment claim. Source/namespace/stage-kind schemas and the 128-selection bound are distinct protocol/capacity classifications. No current plugin config may reinterpret historical source identity.

## Repository adapter: all four fields and underlying Git authors

| Field | Boundary / effect |
| --- | --- |
| repositoryRoot | Required nonempty string; rejects leaf symlink and mismatched realpath; ready checks directory; no default root |
| maxFileBytes | Optional positive schema integer; direct safe-integer decoder fallback 4 MiB (`null` also falls back only on direct invocation) |
| maxChangedPaths | Same rule; fallback 2048; changed-manifest bound and basis for list/inventory request fallback |
| expectedHead | Optional exact 40/64 lowercase hex schema; factory requires string then RevisionReader validates full object ID; freeze compares resolved head |

Caller `git.repository.read` requires allowedPrefixes. Ordinary relative-path operations validate their resource path; freeze_head uses `.` and changed_manifest additionally validates requested prefixes. Provider root and immutable per-attempt HMAC head proof add independent constraints. The proof key is instance-local random identity, not editable config. There is no nested Git-process capability: actual Git is invoked directly by name through inherited PATH/environment.

Additional code policies: synchronous Git helper defaults to 1 MiB maxBuffer with no explicit timeout or AbortSignal. Overrides are 16 MiB for changed manifest/line diffs, 64 MiB for list-tree, 256 MiB for inventory, 32 MiB for reference grep and 2 MiB for reference candidate contents. These limits are independent of maxFileBytes. List/inventory request maxPaths defaults to maxChangedPaths×8, with ceilings 65536 and 1000000 respectively; reference output defaults to 256 with ceiling 4096. Reference candidate scan ceiling is 32768, source list ≤256 and prefix list ≤128. `freeze_head` request ref defaults to HEAD and requireClean only applies when true. Request defaults are not adapter schema defaults and must be included in a later compatibility decision.

Working-tree reads use the dedicated path/no-follow file boundary and maxFileBytes; revision reads bind head/proof, regular file mode and bounded Git output. Synchronous child operations cannot be claimed to honor asynchronous cancellation just because the adapter checked its signal before calling them. This is a source limitation, not an executed timeout finding, and must not be hidden by centralizing numeric settings.

## Historical configuration and evidence scope

For all four, `engine-runtime.ts`, registry `schema.ts`/`configuration.ts`, AdapterRuntime and `engine-snapshots.ts` are the actual normal activation, non-defaulting validation, snapshot writer and strict recovery equality chain. No new owner file may overwrite a saved configuration or supply missing historical meaning. The handoff additionally has durable intent/receipt replay; pipeline evidence consumes pinned historical run evidence; lint records raw policy/config/pack digests in reports; repository head proofs are instance/attempt-local rather than a durable saved-config authority.

A focused search of production scripts/Core/charts/values found no extra plugin-ID-specific historical reader for these four analogous to remote dispatch retirement. This is bounded search evidence, not a repository-wide absence proof. Existing repository-review supervisor integration scripts author explicit fixture platform objects and must be included in future migration coverage, not labeled production defaults. Their schemas and assertions are not changed here.

## Criteria before migration

- FA1: Preserve all 21 adapter schema fields, units, authority distinctions and existing bounds; classify every identified code fallback and external policy author. One explicit owner file per plugin, no duplicate inline/ENV/generated author; rejected legacy keys include equal-valued inputs.
- FA2: Prove normal registry selection and nested grant denials, not only direct activate calls. Existing malformed/direct-factory differences must be deliberately closed or preserved with an explicit compatibility decision, not silently coerced.
- FA3: Two real authored profiles for editable timing/capacity fields reach actual readers/process/HTTP/store consumers. Missing/invalid settings fail before side effects. Do not replace production adapters with models to claim their integrations.
- FA4: Preserve exact historical config/package equality, immutable artifact/source authority, durable handoff intent/receipt replay and policy digests. Missing historical config has no current-file fallback; recovery negatives exercise mismatches.
- FA5: Preserve full original package scripts and relevant Core/integration tests. Semantic removal/restoration mutants must reach intended boundaries. Bind actual source/tool/dependency closures, retain failures and run in the serialized test slot. Live TLS/operator/BuildKit/Git/model prerequisites are separate explicit evidence gates.
- FA-DOC: Explain effective values, supported protocol constants versus editable policies, migration/restart and old-author rejection, secrets/file credentials, store budget domains and remaining scope. Fresh nonauthor review is required. No claim of all stage/provider/tool settings or F1/CONFIG completion from four adapter registrations.

The named-source manifest and exact copies under `docs/review/evidence/config-final-four-adapter-inventory-20260921` bind this source checkpoint only. The schema coverage file records all 21 properties and required/optional status without treating a regex count as behavioral completeness. Original package commands are retained verbatim in the same evidence. No runtime check was performed.
