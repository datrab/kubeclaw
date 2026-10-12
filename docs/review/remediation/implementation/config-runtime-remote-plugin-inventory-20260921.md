# Runtime-dispatch and remote-test-gate configuration inventory

Status: source inventory accepted by the [independent source review](independent-config-runtime-remote-plugin-inventory-20260921.md), not migration or runtime acceptance. No tests, network calls, secret reads or production changes were performed. One proposed file per plugin: `plugin-runtime-dispatch.config.json` with explicit `runtime` and `openclaw` registration sections; `plugin-remote-test-gate.config.json` with `plan` and `evidence` sections. Activation, provider selection and caller grants remain orchestrator policy. This does not close F1 or CONFIG.

## Normal registry and authority chain

Both Runtime registrations provide `runtime.dispatch`, selected by the orchestrator, with caller `allowedAgents` matching target IDs exactly. `runtime` requires `network.http` and `secrets.read`; `openclaw` additionally requires `git.repository.read`. Those required dependencies/grants are resolved even if a particular configured target uses SPIFFE or remote results and does not invoke one dependency. Plugin target configuration cannot supply or bypass these grants.

Network grants compare URL origins; the selected network adapter separately enforces its configured origins, methods, headers, body/response limits and timeout. HMAC dispatch requires permitted content-type, idempotency-key and x-kubeclaw-signature; OpenClaw requires authorization and content-type. A valid Runtime target alone is not proof the required nested call is permitted. Secret names must be authorized by `allowedNames` and resolved through the selected secret provider, never embedded values. OpenClaw local result reads require the corresponding repository-relative `allowedPrefixes` grant and provider policy. These identities fit the existing vocabulary; no Command-style catalog grant equivalence is assumed.

Remote `plan` provides `test.plan.execute`, requiring `secrets.read`. Its caller grant requires `allowedRoots`; actual authorization requires resource canonicalId and payload repositoryRoot to resolve to the same existing directory inside those roots. Provider `allowedRepositoryRoots` adds a second constraint. The plan adapter uses Core's direct HTTP transport, not `network.http`; do not invent a network grant on this path. Plan-node `payload.grants` are another request authority map, checked against exact resolved-plan node IDs, not the adapter's registry grants.

Remote `evidence` provides `test.plan.evidence`, with caller `allowedNamespaces`, and requires `artifacts.read` with its own namespace grants. The configured manifest/gate stage IDs, exact artifact producer/run/digests, coverage and verified imported result all remain required. A mere artifact namespace grant does not authorize fabricated evidence.

## Runtime registration fields

The root `targets` map is required and nonempty. Each target object is closed; target IDs additionally match the decoder's lowercase alphanumeric/`._:-` grammar, bounded at 128 characters. Schema annotations do not supply defaults on normal adapter validation; the decoder does.

| Target field | Schema / actual decoder | Actual effect |
| --- | --- | --- |
| endpoint | Required URI; decoder HTTP(S), no credentials or fragment | Exact POST destination; path/query are not forbidden. HMAC plaintext only loopback. |
| authentication | Optional enum hmac/spiffe-proxy, annotated and decoded default hmac | HMAC signs idempotencyKey + dot + JSON body with resolved secret; SPIFFE uses local proxy, no token. Direct invalid enum values fall into hmac, unlike schema validation. |
| tokenSecret | Nonempty string, required for HMAC/absent for SPIFFE in schema; HMAC decoder also ID grammar | Confidential secret reference. Direct SPIFFE factory ignores a supplied token; normal schema rejects it. |
| maxRequestBytes | 1–8388608 integer; decoder Number(value ?? 1048576) | UTF-8 JSON request ceiling before HTTP. Direct factory accepts some coercible inputs rejected by schema. |
| maxResponseBytes | Same range/default/coercion | JSON response size checked after selected network provider returns; not a transport allocation ceiling by itself. |

SPIFFE schema specifically requires `http://` literal loopback with an explicit port. The factory itself checks HTTP(S) and loopback, so standalone direct calls have a broader endpoint surface. Do not describe direct factory acceptance as normal registry acceptance.

## OpenClaw registration fields

This is another required nonempty `targets` map with closed target objects and the same decoder target-ID grammar. The following rows cover every target property; code defaults and schema constants are distinguished.

| Target field | Required/default/bounds | Consumer |
| --- | --- | --- |
| endpoint | Required URI; decoder HTTP(S), no credentials/fragment | Tool gateway POST; unlike HMAC runtime, no additional HTTPS-only nonloopback check here. Network provider policy remains separate. |
| tokenSecret | Required nonempty string; decoder trims and requires ID grammar | Confidential Bearer-token lookup for gateway calls. |
| runtime | Required acp/subagent | Selects session spawn, polling/cancellation protocol; ACP streams to parent. |
| agentId | Optional nonempty schema string; decoder invalid/missing ID becomes codex | Gateway spawn agent identity; not an executable or secret. |
| agentRole | Optional nonempty string; decoder invalid/missing ID becomes target ID | Session labels/dispatch identity context. |
| model | Required nonempty string; decoder trims, rejects empty | Spawn model and returned model equality checks; no implicit model selection. |
| thinking | Optional nonempty string; missing/nonstring direct value becomes high; strings trimmed | Gateway spawn parameter, not interpreted as a local numeric budget. |
| controllerSessionKey | Optional 1–512 schema string; decoder requires `agent:<agentId>:` prefix | Gateway sessionKey, pacing/cache identity; absence omits it. |
| collectorMode | Optional boolean, false annotation/code default | Only allowed with subagent; selects collector transport/result protocol. Direct nontrue values become false. |
| spawnIntervalMs | Optional integer 0–60000, default 1500 | Per endpoint/controller spawn pacing. |
| tokenizerEncoding | Optional schema const/default o200k_base; decoder same | Prompt/output token counting; currently a fixed supported profile, not an arbitrary encoding knob. |
| maxPromptBytes | Optional const/default 900000 | Actual UTF-8 prompt ceiling. |
| maxInputTokens | Optional const/default 120000 | Actual counted input-token ceiling. |
| maxOutputTokens | Optional const/default 6000 | Counted output ceiling, also compared with request-declared budget. |
| maxContextTokens | Optional const/default 128000 | Combined input+output budget check; fixed values must remain internally consistent. |
| cwd | Required string starting `/` | Spawn working directory; normal parser does not realpath it. A supplied owned workspace replaces cwd after stricter checks. |
| repositoryRoot | Required string starting `/` | Retained result destination and repository binding; later filesystem publication requires canonical no-follow root. |
| workspaceRoot | Optional string starting `/` | Required when request includes workspaceReference; exact canonical directories, attempt ownership, distinct workspace and owner-record equality then checked. |
| pollMs | Optional integer ≥10, default 1000 | Initial polling backoff. |
| maxPollMs | Optional integer ≥10, default 15000; decoder additionally ≥pollMs | Backoff ceiling. |
| maxPolls | Optional integer ≥1, default 1800 | Attempt-count timeout alongside wall-clock timeout. |
| sessionTimeoutMs | Optional integer 10–86400000, default 1800000; decoder additionally ≥pollMs | Actual session deadline/AbortSignal, recent-session lookback derivation. |
| resultPathPrefix | Required nonempty relative path, rejects parent segments | Digest-derived result filename beneath selected root; publication adds stricter no-dot/no-control/no-backslash checks. |
| resultEndpoint | Optional URI, paired with resultTokenSecret | GET destination formed by appending result basename to endpoint pathname. Decoder URL-normalizes and strips trailing slashes, but does not apply gateway HTTP/credential/hash restrictions here; downstream provider may reject. |
| resultTokenSecret | Optional nonempty string, paired; decoder ID grammar | Separate confidential Bearer token for remote result fetch. |

OpenClaw numeric decoding uses Number with fallback only for undefined; normal schema rejects strings/null, while direct factories can coerce some values. Poll/maxPoll/maxPolls have safe-integer decoder checks but no explicit timer-safe schema maxima. Configurable-looking token fields currently use schema `const` and matching code equality: migration must separate supported dispatch-profile protocol from editable capacity policy instead of silently changing model/serialization behavior.

The gateway performs sessions_spawn with run mode, cleanup keep and thread false, optional collection/output schema, and an attempt/payload-derived idempotency identity. Immutable dispatch-profile versions, collector generation labels, digests, source/workspace ownership and response parsing are protocol rules, not operator fallback replacements.

Additional code policies: JSON runtime payload depth 20, array/object entries 1000, key length 128; OpenClaw recent lookback=max(10 minutes, ceil(sessionTimeout/60000)+5), session-list cache 250 ms, exponential polling exponent capped 8, cleanup polling 25 ms, history limit 1, workspace owner read 32768 bytes and local result read 1048576 bytes. The cleanup authority/deadline comes from `context.withCleanup`, not a new plugin-owned timeout. Result files use no-follow directory-descriptor publication and no-replace/equal-content replay; preserved output must not be overwritten during config migration. Missing local result can fall back to authenticated terminal structured/result/history content; this is a result protocol branch, not an operator default.

## Remote plan registration fields

| Field | Schema / actual boundary | Consumer |
| --- | --- | --- |
| endpoint | Required HTTP(S) URI | Core adds credential rejection and forbids nonloopback plaintext; transport appends `/v1/plan-jobs`, encoded job IDs and evidence/results digest paths. |
| authentication | Required bearer/spiffe-proxy | Decoder uses spiffe only for that literal, otherwise bearer; direct calls can therefore default invalid/missing auth unlike schema. SPIFFE schema requires literal HTTP loopback with port, and forbids tokenSecret. |
| tokenSecret | Required bearer; absent SPIFFE | Confidential bearer secret reference; transport requires resolved token length ≥32. |
| sourcePrivateKeySecret | Required nonempty string | Confidential source-attestation private key reference, including SPIFFE mode; never config key material. |
| sourceAuthority | Required nonempty string; source builder adds ID grammar | Signed source snapshot creator authority, not caller grant. |
| stateRoot | Required nonempty string | Adapter path.resolve against cwd, then Core absolute-root check; stores use separate dispatch and imports subdirectories. |
| allowedRepositoryRoots | Required nonempty unique string array | Adapter requires absolute existing directories, realpaths them and restricts selected repository; source builder additionally requires actual repository top-level root. |

Provider config has no timeout/quota fields although actual plan composition supplies polling 500 ms; response/result/archive/evidence limits each 64 MiB; archive-store and evidence-store budgets each 1 GiB; record limits 10000 records/1 GiB serialized state/64 MiB per payload. These apply to separate stores/domains, not one total stateRoot disk cap. Core cancellation cleanup defaults 10000 ms. These are real policy authors outside the schema and must be inventoried in the proposed plan section before D17 migration.

Request values remain separate: timeoutMs positive safe integer≤7200000, maximumConcurrency≤64, revision/repositoryId/submittedAt, immutable resolved plan, exact node grants and optional expectedCoverage/gateId. The actual adapter requires revision and passes an explicit remaining deadline to source building: the lower-level HEAD and 30000-ms defaults are not used on this path. Source archive maximum is additionally bounded at 128 MiB; Git metadata commands use 65536-byte caps. Source Git is spawned via `git` with process environment/PATH, unlike the common git-workspace plugin's configured executable and empty environment. Its cleanup uses 250-ms TERM escalation/1500-ms bound. Do not merge those two execution authorities.

HTTP transport uses direct bounded fetch with redirect:error and propagated deadline/abort. Authentication fallback bearer and result-limit fallback to response-limit exist in the reusable transport, but this adapter's composition explicitly supplies both auth and limits. The dispatcher cleanup default remains exercised. No separate `network.http` grant or its timeout protects this direct transport.

## Remote evidence registration fields

| Field | Schema / actual boundary | Consumer |
| --- | --- | --- |
| stateRoot | Required nonempty string; factory text ≤2048, absolute normalized; invocation requires realpath equality | Opens `<root>/imports`; must refer to the plan import store, not a new independent evidence source. |
| manifestStageId | Required nonempty string; factory text ≤2048 | Exact delivery-manifest artifact producer and contract validation. |
| gateStageId | Required nonempty string; factory text ≤2048 | Exact quality-gate artifact producer, coverage source and verified imported result lookup. |

Evidence composition repeats record 10000/1 GiB/64 MiB and evidence-store 1 GiB policy, plus an 8 MiB input artifact bound. Treat shared underlying store compatibility deliberately; one plugin owner with explicit registration sections does not imply independently lowering one registration's read limits safely. Artifact run/stage/namespace/media/digest/size, manifest decision/result equality and native successful attempt/source-link checks are evidence authority, not configurable booleans. Namespace names and schema IDs are protocol identifiers. authNodeId comes from the request, not provider configuration.

## Migration and evidence requirements

Retain immutable run configuration/package provenance and strict recovery equality. No current central file may supply omitted historical policy retrospectively. The new files must own settings exactly once; old inline adapters, schema defaults and decoder substitutes need explicit removal or documented historical protocol handling. Do not infer normal-path usability from direct factory tests, especially authentication modes, malformed IDs and nested dependency grants.

Acceptance needs full four-schema coverage, two real profiles for genuine configurable policies, omission/invalid/direct-factory controls, actual nested-grant denials, real bounded transport and storage behavior, attestation and imported-result integrity, and original plugin suites. Session/model/secret integrations require their actual environment and cannot be claimed from this inventory. Numeric constants above are classified as capacity/timing policy or protocol/validation rules; they are not automatically all new operator knobs. Source inspection is not proof of live endpoint reachability, installed model availability or valid credentials.

The [schema coverage](../../evidence/config-runtime-remote-plugin-inventory-20260921/schema-coverage.json)
retains every registration schema property, map target and conditional constraint.
The [named source manifest](../../evidence/config-runtime-remote-plugin-inventory-20260921/source-identities.json)
binds this inspection checkpoint with exact copies. It is not a transitive runtime
execution proof. Original package scripts remain unchanged: Runtime live-function,
package-boundary and repository-result-paths; Remote live-function and evidence-projection.

## Additive review correction: historical consumers and process bounds

The original snapshot set remains unchanged. The additive v2 source manifest binds this correction and four additional production sources. Normal `prepareRuntime` calls `validateRuntimeRegistrationConfiguration` and returns the raw platform adapter/observer configuration. Registry schema validation uses its non-default-inserting validator; `resolveReferencedValue` is a separate API and is not this runtime path. `frozenRegistryRecord` persists that configuration and selected provider/package provenance. Recovery `verifyPinnedPackages` compares the complete stored configuration with the current runtime configuration; package-upgrade authorization does not remove configuration equality. Therefore central-file migration cannot normalize omitted historical fields or replace their old meaning with current values.

`scripts/observability-retirement/dispatch.mjs` is an existing production historical consumer, not merely a test. `coreDispatchRoots` reads the pinned run snapshot, validates the selected remote-plan and artifact providers, requires the pinned `remote-test-gate:plan.stateRoot` to equal the retirement scope, and opens the original pinned artifact root. `boundProviderPlan` also binds source snapshot creator authority to pinned `remote-test-gate:plan.sourceAuthority`, alongside the original stage/request and source-revision evidence. Any configuration migration must preserve this reader's historical evidence contract; relocating state or reconstructing authority from today's config is not equivalent.

Two additional source-process bounds were omitted from the initial inventory: Git stderr retention is capped at 4,096 JavaScript string characters (not a raw-byte limit); Linux process-group cleanup acknowledgement polls at 10 ms until the existing cleanup deadline. The first is a diagnostic retention bound; the second is a cleanup observation cadence. Neither changes the configured plan deadline or establishes quiescence by quiet-time alone. These are separate from the already inventoried stdout/archive, force-kill and cleanup deadlines. No process was started to produce this source correction.
