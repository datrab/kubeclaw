# Transport and agent observer configuration source inventory

Status: authored source inventory, pending independent review. This is a bounded F1 inventory, not a migration, runtime acceptance, or complete CONFIG/F1 acceptance. No plugin, environment, registry, service, or runtime was changed or executed. The accompanying source manifest captures the named implementation, schema, registry, storage, SDK, original test, and documentation sources; it is not a complete executable dependency closure.

## Ownership proposal and normal activation

Proposed future owners are `redis-transport.config.json` with explicit `publisher` and `telemetry` registration sections; `transport-publisher.config.json` with `publisher`; `agent-observability.config.json` with `ingester` and `evidence`; and `openclaw-agent-events.config.json` with `source`. These are proposals, not files already consumed. One orchestrator reference must select each owner and pin its effective configuration in immutable run snapshots. Provider selection and caller grants remain distinct orchestrator policy. Neither a target map nor a secret reference grants permission. Historical snapshots and stored delivery receipts must not be rewritten or interpreted using today's defaults.

The actual registry validates enabled registration configuration against its schema; adapter startup validates it again and passes the original config to the factory. This validation path does not insert JSON Schema defaults. Factory fallbacks therefore remain active authors. Registry capability resolution selects providers, enables dependencies, and requires validated grants for declared requirements. Invocation authorization additionally checks operation/resource kinds and constraints. Publisher callers need `transport.publish` / `publish` / `transport.target` with `allowedTargets`; telemetry callers need `telemetry.emit` / `append` / `telemetry.event` with `allowedEventPrefixes`; source status uses `agent.events.subscribe` / `status` / `agent.events` with `allowedSources`. These identity forms are representable by the actual grant vocabulary, unlike the previously inventoried command catalog integration gap.

Both Redis registrations require `secrets.read`; transport publisher requires `network.http` and `secrets.read`. The ingester requires telemetry emission; evidence requires `artifacts.write` with `allowedNamespaces` containing `kubeclaw.agent-observability-evidence`. Network origin/method/header policy and allowed secret names still constrain nested calls. Although these plugins call ordinary `context.invoke` for secrets, adapter startup recognizes confidential capabilities and routes secret reads through confidential execution; ordinary invocation syntax does not imply durable secret receipts.

## Redis: six fields per registration

Both registrations share the closed schema and decoder, independently configured.

| Field | Actual effect, default, units and bounds |
| --- | --- |
| `url` | Required; schema max 512 characters, `redis://` or `rediss://` host with explicit numeric port, no credentials/path/query/fragment. Schema excludes colon-containing IPv6 hosts. Factory URL checks allow an empty or `/` pathname and do not independently enforce explicit port or 512 characters. Direct factory acceptance is broader than normal registry acceptance. |
| `passwordSecret` | Required secret identifier, lowercase-leading grammar, up to 128 characters; resolved on each invocation, never a literal password config. Secret value must be nonempty and contain no CR/LF. |
| `streamPrefix` | Required lowercase-leading identifier, up to 128 characters, permits colon/underscore/dot/hyphen; stream namespace input. |
| `maxLen` | Required integer 1–1,000,000 stream entries; Lua uses approximate Redis `MAXLEN ~`, not an exact maximum or byte quota. |
| `dedupTtlMs` | Required schema integer 1,000–31,536,000,000 ms. Direct decoder accepts 1–31,536,000,000; schema enforces the stronger lower bound on the normal path. |
| `timeoutMs` | Required integer 1–300,000 ms for the socket exchange. No fallback. |

Numbers must be actual safe integers, not numeric strings. Stream identity is prefix + `:v2:` + publisher/telemetry kind + encoded target; a canonical idempotency-key digest identifies the dedup key. Lua checks the dedup key, appends once, and stores its result with configured TTL atomically. A duplicate after TTL expiry can append again. Existing stream identities, dedup keys, and protocol version are compatibility constraints, not new operator knobs.

The adapter rejects JSON payloads above 1,048,576 bytes. RESP parsing separately limits bulk replies to 1,048,576 bytes, headers to 1,024 bytes, and cumulative exchange bytes to bulk + twice header + 6. Its 1,024-byte initial buffer grows under that ceiling. It expects precisely AUTH and EVAL replies, rejects trailing data and malformed UTF-8/protocol responses. These are wire/parser safety limits. The source manifest binds all parser files.

Each invocation opens a direct Node TCP or TLS socket; there is no Redis subprocess and no `network.http` provider mediation. TLS uses Node defaults and hostname/servername; this plugin has no custom CA field. Abort and timeout destroy the socket. `ready()` checks stopping state, not Redis connectivity; shutdown marks stopping and does not independently drain tracked sockets. There are no direct environment reads in these plugin sources. Host TLS/runtime environment and external Redis availability remain deployment prerequisites, not plugin configuration claims.

## HTTP transport publisher: seven field patterns

| Field | Actual effect, default, units and bounds |
| --- | --- |
| `deliveryRoot` | Required nonempty string; durable record store resolves relative paths against process cwd, not config-file directory. Persistent idempotency/terminal state. |
| `maximumDeliveryRecords` | Optional schema; factory nullish fallback 100,000; positive safe integer record count across durable streams, not a number of deliveries. |
| `maximumDeliveryBytes` | Optional schema; factory nullish fallback 268,435,456 bytes; serialized store budget, not an aggregate filesystem quota or network body limit. |
| `targets` | Required nonempty map; target keys lowercase-leading and at most 128 characters; nested objects closed. |
| `targets.*.endpoint` | Required HTTP(S) URI. Factory rejects credentials and fragments; path/query permitted. Selected network provider and caller grant impose additional endpoint policy. |
| `targets.*.signingSecret` | Required secret identifier, lowercase-leading and at most 128 characters; selected secret provider supplies actual value. |
| `targets.*.maxPayloadBytes` | Optional schema; factory nullish fallback 262,144; safe integer 1–1,048,576 bytes. Applies to serialized `{message: ...}` including wrapper, not only the inner message. |

The direct decoder rejects numeric strings but uses defaults for null as well as missing fields; the schema rejects null. Request `message` is a JSON object, not an operator setting. Publication IDs follow a fixed 1–256-character grammar; receipt accepted/target/publicationId/status fields and HTTP 200–299 are protocol contracts. The request and receipt schemas are separately captured, not counted as configuration fields.

Additional code policy: maximum durable record is 1,048,576 + 65,536 bytes, terminal reservation 8,192 bytes, JSON nesting depth 64, bounded keys up to 128 characters, retained failure reason first 2,048 characters plus digest. Durable metadata framing and aggregate record admission are real storage consumers. They are distinct from per-target payload limits and remote provider response limits; the byte limit is not a RAM guarantee. Existing identical/terminal requests and CAS payload identity govern reuse and reconciliation.

Invocation persists the request and reserves terminal space before network publication, obtains the signing secret, then HMAC-SHA256 signs target, idempotency key, and exact serialized body. Content type, idempotency key, target, and signature headers are fixed protocol. The plugin has no timeout setting of its own: network provider policy and invocation cancellation govern the call. It spawns no child and reads no environment directly. Changing deliveryRoot, record grammar, key derivation, or default quotas requires an explicit persistent-state migration contract; restarting against a different empty directory does not preserve prior idempotency.

## Agent observability: no config properties, two manifest policy authors

Both registration configuration schemas are closed empty objects. The ingester subscribes to all twelve OpenClaw event types listed below; evidence subscribes only to agent-end, subagent-delivery-target, subagent-ended, model-call-ended and session-end. Each manifest specifies `at_least_once`, `per_run`, and best-effort failure policy: `maxAttempts` 5, `backoffMs` 1,000 ms, `timeoutMs` 10,000 ms. These are actual manifest policy authors despite the empty config schema. A future owner can centralize operational retry/deadline values only with a maintained consumer change; merely adding unused fields would fail.

Core observer delivery uses the manifest timeout for both wall and CPU lease values and separately assigns a 256 MiB memory lease limit. This is a declared lease budget, not proof of OS memory isolation. Core retry logic uses persisted prior attempts, waits the configured backoff between failures, and reports exhausted attempts. Observer config fallback `{}` is structural for the current zero-field contract, not evidence of operator settings already centralized.

The projected event carries delivery/event identity, sequence, timestamp and redacted payload. SDK redaction caps depth above 16, arrays/object entries at 1,000, and strings at 65,536 characters; sensitive-key matching covers authorization/cookie/password/secret/token/API-key/credential. These are privacy/projection rules, not payload-wide byte accounting. Evidence writes the fixed namespace and `agent-evidence:<eventId>` identity via artifacts provider; provider metadata/blob limits remain independent. The checkpoint schema has required `sequence` integer >= 0 and nullable-string `eventId`: these are persisted progress fields, not config knobs. No plugin subprocess, direct environment read, endpoint, or local state-root field exists here.

## OpenClaw agent events: four fields

| Field | Actual effect, default, units and bounds |
| --- | --- |
| `hooks` | Required nonempty unique list of supported hook enum values, no default. |
| `maxQueueEvents` | Optional; schema and factory default 256; integer 1–10,000 normalized pending events. |
| `maxQueueBytes` | Optional; schema and factory default 1,048,576; integer 1–16,777,216 bytes of JSON-serialized queue entries including hook/normalized wrapper. |
| `drainTimeoutMs` | Optional; schema and factory default 5,000; integer 1–60,000 ms for drain wait. |

The twelve supported hooks are `agent_end`, `llm_input`, `llm_output`, `subagent_spawned`, `subagent_delivery_target`, `subagent_ended`, `before_tool_call`, `after_tool_call`, `model_call_started`, `model_call_ended`, `session_start`, `session_end`. Factory checks hook membership/uniqueness and number types; nullish numeric values receive defaults directly, while normal schema rejects null and unknown fields. The factory alone does not reject all unknown config keys.

`activate` loads `openclaw/plugin-sdk` using Node createRequire; installed SDK `on` support is a prerequisite. The plugin package declares only the Kubeclaw SDK dependency, not OpenClaw itself. This is host integration, not a spawned sidecar or implicit external endpoint. Source has no direct environment reads or secret references.

Queue count/bytes include the currently emitting head until completion. Full queues reject admission. Emission is serialized; failed emission increments failure state and removes that item, rather than retrying it. Observer retry is a separate downstream mechanism. Drain timeout does not cancel an already awaited emit. Shutdown unsubscribes and drains with caller cancellation. Status request `waitForDrain !== false` defaults to waiting; that is request behavior, not another operator setting.

Normalization requires a run ID of 1–512 characters, optionally stage/attempt IDs with the same bound, using nested then outer identity aliases. Invalid run identity drops the event. Projection removes sensitive and identity fields, retains at most 128 field names truncated to 128 characters, and exposes only whitelisted finite numeric/boolean metrics. Schema version, hook-to-event namespace conversion and these privacy rules are fixed semantic contracts. Queue limits measure normalized events, not arbitrary raw OpenClaw objects or total process RSS.

## Migration acceptance criteria and documentation

1. Bind every configuration field above and the separate checkpoint/request/receipt schemas. Keep both Redis and both observer registrations explicit, with normal registry validation and actual grant construction exercised. Preserve original tests and all existing assertions; this inventory executes none of them.
2. Make the proposed config owners real consumers through an explicit orchestrator reference and immutable effective run snapshot. Remove operational code/schema fallbacks only after complete caller/fixture migration; reject missing, null, wrong-type and legacy settings even when equal to prior defaults. Do not silently make today's values govern historical delivery/state.
3. Prove two authored queue, payload, quota and deadline profiles through real consumers. Distinguish Redis approximate entry retention, dedup expiry, socket deadline, RESP bytes, publisher metadata/record reservation, provider network limits and OpenClaw normalized queue bytes. Preserve protocol/privacy guards; classify fixed constants before proposing them as operator settings.
4. Exercise missing/denied secret, target/event-prefix/namespace/network grants, normal registry vs direct-factory boundary differences, startup dependency/SDK failure, Redis AUTH/EVAL failure/abort, publisher persisted retry/CAS, queue overflow/emission failure/drain timeout and observer persisted retry exhaustion. Use semantic fallback/omitted-consumer mutants. Model-only SDK/socket/provider tests must not claim deployed integration.
5. Explain cwd-relative deliveryRoot, stable stream/receipt identities, secret references without values, selected external provider policy, dependency availability, time/byte/count units, failure semantics and historical compatibility in each plugin README and central operator guidance. Bind doc/source identities after implementation; retain failed evidence. The current manifests and exact schema coverage JSON provide a reviewable starting inventory, not fulfilled migration acceptance.
