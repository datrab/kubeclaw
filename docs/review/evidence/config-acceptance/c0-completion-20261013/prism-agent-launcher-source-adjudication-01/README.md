# Prism agent launcher: concrete WCR04 source adjudication

Author source notes, **not a complete accepted profile or C0 closure**. The 12 original field bodies and 13 case bodies are retained verbatim in `original-bodies.json`; the 12 implementation cases remain not-run. Existing historical C0 evidence is not a new observation. Exact consulted repository and installed-host software identities are in `source-identities.json`. No launcher, provider, CLI command, credential, network or native action was executed.

## Actual coupled consumers

`agent-jobs.ts` admits only accepted work, computes a database deadline from a fixed 16-minute interval, calls `agentAttempt`, and durably stores the complete envelope with fence/runner/deadline before launch. `agent-job-runner.mjs` requires that envelope's job/fence/worker identity and compares the current local launcher profile digest. The current digest includes five launcher source files; it is not yet a receipt for a selected configurable launcher policy or remote model/agent implementation.

`agentAttempt` fixes execution 900,000 ms, cleanup 10,000 ms, log/result 1 MiB, evidence 2 MiB/two files. Runner CLI arguments independently contain `--agent main --timeout 900`. The proposed sole author remains the original `config/engines/prism-agent.config.json#/profiles/<selected>`; CLI seconds must be a generated projection of its accepted timeout, not a second timeout author. The selected full policy must be captured by Control before claim storage and authenticated at the launcher; current code does not supply this configuration receiving ABI.

The actual `WorkerAttemptExecutor` completion phase formula is `3 + cleanup-hook + evidence-hook + retained-log-store + finalization-hook`. This launcher has only the log-store hook, therefore four completion phases. Admission at executor start requires **remaining claim time >= timeoutMs + 4*cleanupTimeoutMs**: current 940,000 ms. The original 960,000-ms deadline leaves 20,000 ms between claim creation and executor startup before that check fails. This is an exact source condition, not a guarantee about database/transport scheduling or remote completion. Do not redefine the original deadline relative to a later startup or retry.

Claim/finish HTTP budgets are runner/service transport policies; job/session/request/generation/fence are durable task identities, not CONFIG. `lockAgentResult` accepts only a live matching fence (or an identical already committed result). Expired running claims become `needs_nova`; launch is never replayed simply because transport or the local process failed.

## Supported timeout projection and external identities

The consulted installed-host OpenClaw parser accepts strict nonnegative integer seconds; zero disables its timeout. Its gateway transport wait adds 30 seconds and clamps to **2,147,000,000 ms**, distinct from Core's schema maximum **2,147,483,647 ms**. A positive finite Core timeout cannot project to CLI zero. A target no-truncation/no-clamp domain for this exact parser requires whole-second Core values and `(seconds + 30)*1000 <= 2147000000`; an explicit version-qualified target contract must also account for the remote agent timer implementation, not just this wait parser.

These installed `/app` files are **not evidence of the deployed Prism image's parser, installed agent roster or remote gateway version**. They supply a concrete version-dependent compatibility condition, replacing an unqualified guessed domain. Preserve an activation gate for exact selected-image CLI/parser and authentic allowed agent identities. Do not invent a second installed agent or call a schema-accepted string an authorization grant.

Local timeout/termination does not prove gateway/model cancellation. `AgentProcess` signals only its detached local process group, waits child closure and exposes unavailable child-tree CPU/memory/process observations. It reports local process closure, not authoritative remote success. The target grace must fit the accepted cleanup budget; unresolved termination/completion remains reconciliation work, not a new attempt or replenished claim.

## Quota applicability: do not invent native alternates

Core limits logs to 16 MiB and counts rendered stream bytes, not remote model tokens. Actual log storage adds at most one evidence item to this launcher's empty operation evidence array. Thus changing `evidenceFiles` from two to one does not demonstrate an independent current-launcher native effect; zero can reject a nonempty log but a full profile must preserve its required evidence contract. The original EFFECT obligation remains, pending an explicit supported consumer/group disposition rather than a fabricated second evidence-producing hook.

The successful launcher specialist result is a fixed local-closure object. Different admitted positive `resultBytes` ceilings above that object's serialized size do not themselves change this caller's output. Current `AgentProcess.prepare` ignores accepted limits and no result/evidence customization task exists. Preserve the original quota obligations and decide precise admission/behavior grouping in the full launcher definition; generic variable-result Core tests alone are not this productive caller's F-EFFECT proof.

## Finite remaining definition work

Complete the single selected launcher schema/profile, Control-to-launcher policy/digest/version receiving ABI, parameterized SQL deadline and generated CLI timeout relation, whole valid A/B profiles, required log/result/evidence adequacy, exact installed-capability gate, unsupported alternate dispositions, original case commands/observers/mutants, and J/S/R recovery/Eval bindings. Pure C0 schema/projection/serialization checks can establish definition facts. Actual Control/CLI/process/gateway effects remain future not-run after approval. This source note neither grants implementation nor closes WCR04 or the 12 original effects.
