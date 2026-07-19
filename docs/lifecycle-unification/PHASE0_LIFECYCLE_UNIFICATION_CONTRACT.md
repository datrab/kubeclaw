# Phase 0 contract and checklist for Nova / Buster lifecycle unification

This document freezes the pre-refactor contract for the Nova / Buster lifecycle unification work.

It is intentionally opinionated.
The goal is to remove ambiguity before Phase 1 starts.

---

## Goal

Unify the shared lifecycle mechanics used by Nova pipeline and Buster while preserving:
- Nova stability
- path-stable runtime imports under `/app/skills/pipeline/**`
- clear separation between shared mechanics and agent-specific orchestration
- ClawDeck-facing telemetry compatibility

---

## Core invariant

The source of truth is the **final runtime path after Docker copy**, not the source repo path.

So if a shared file lands at the same final runtime path Nova already uses, Nova caller imports should not need to change.

Canonical target:
- `skills/common/pipeline/**` -> `/app/skills/pipeline/**`

---

## Locked decisions

### 1. Packaging invariant

Locked:
- There should be **no intentional duplicate live file** in both `skills/common/**` and an agent-specific tree for the same final runtime path.
- A file is either:
  - shared, or
  - agent-specific
- Empty directories are not a design concern unless a build/copy script explicitly depends on them.

Rule:
- We still perform **one explicit packaging sanity check** before implementation and again after the first shared-file switch, to ensure no silent shadowing exists.

---

### 2. Canonical shared tree

Locked shared targets:
- `skills/common/pipeline/integrations/gateway.ts`
- `skills/common/pipeline/agents/acp-monitor.ts`
- `skills/common/pipeline/agents/lifecycle.ts`
- `skills/common/pipeline/agents/runtime.ts`

No further tree reshuffling during this unification.

---

### 3. “No Nova caller churn” means exactly this

Locked:
- Nova remains as stable as possible.
- Nova caller import paths should remain unchanged whenever the same final runtime path is preserved.
- Buster is the adapting side.

Allowed on Nova side:
- internal extraction
- internal file splitting
- re-export / thin wrapper behavior if needed

Not desired on Nova side:
- broad caller rewrites
- import churn caused only by source-tree aesthetics

---

### 4. Boundary: shared mechanics vs orchestration

#### Shared mechanics
These belong in shared `pipeline/**`:
- runtime selection
- gateway invocation
- spawn
- transcript path resolution
- monitor / session-status interpretation
- wait-for-idle
- kill
- rate-limit recovery policy
- git polling, where the logic is truly generic and lifecycle-related

#### Nova-only orchestration
These stay Nova-specific:
- blueprint management
- prompt building
- Forge / Echo / Buster sequencing
- Redis dispatch to Buster
- pipeline status tracking
- shutdown reaper
- tracked multi-session coordination

#### Buster-only orchestration
These stay Buster-specific:
- Redis completion emission
- suite telemetry
- suite execution
- task loop
- pod-local task handling

Rule:
- Shared code owns mechanics.
- Agent-specific code owns workflow and product behavior.

---

### 5. Shared API surface

Locked:
- Shared modules should preserve the **same exported names** whenever possible.
- For shared replacements, preserve not only function names, but also:
  - argument shape
  - return shape
  - side-effect expectations
  - failure/error semantics

Rule:
- If two files do the same job, they should not drift into different export names unless there is a compelling architectural reason.

Practical goal:
- minimize adapter code
- minimize drift
- minimize caller changes

---

### 6. Env contract

Locked:
- Nova env behavior is canonical.
- Buster should adopt Nova env names and resolution behavior.

Transition rule:
- Temporary fallback support for legacy Buster env names is acceptable during migration only.
- End state should be one canonical env contract.

---

### 7. Runtime selection semantics

Locked for migration:
- Preserve Nova runtime-selection behavior as the canonical implementation during unification.
- Explicit `runtime` in payload or config can override inference.
- Incomplete payloads should degrade gracefully rather than fail hard.

Migration safety rule:
- Do **not** change the global default runtime policy at the same time as lifecycle unification.
- Default-policy simplification can happen later, after the shared mechanics are stable.

---

### 8. Transcript path resolution behavior

Locked behavior:
- Missing transcript path is allowed.
- Missing transcript path is retried later.
- Missing transcript path is **not** a spawn failure by itself.

Empirically verified on this host via a subagent probe:
- Subagent session key shape is `agent:<agentId>:subagent:<uuid>`.
- The spawned subagent session was persisted under:
  - `/home/node/.openclaw/agents/main/sessions/sessions.json`
- The session entry contained:
  - `sessionId`
  - `sessionFile`
  - `spawnedBy`
  - `label`
  - `status`
- The transcript file for the probe session was:
  - `/home/node/.openclaw/agents/main/sessions/2285eec4-731e-476c-850f-40008bf29ef4.jsonl`

Working resolution rule:
1. Use the child session key to determine the target agent namespace.
2. Read `/home/node/.openclaw/agents/<agentId>/sessions/sessions.json`.
3. Resolve the exact child session key entry.
4. Prefer the recorded `sessionFile` value when present.
5. If the entry or `sessionFile` is not available yet, retry later.

Open implementation caution:
- Avoid hard-coding brittle assumptions beyond the documented session key structure.
- Prefer lookup from `sessions.json` over hand-built transcript filenames when possible.

---

### 9. Kill contract

Runtime-relevant facts:
- ACP work is sent through `connection.prompt({ sessionId, prompt })`.
- ACP cancellation is done through `connection.cancel({ sessionId })`.
- ACP session teardown is done through `connection.unstable_closeSession({ sessionId })`.
- ACP session continuation/resume uses `session/load` semantics.
- Subagent control is a separate requester-session control path and is **not** the ACP backend control surface.

Important clarification:
- Human slash commands like `/stop`, `/subagents kill`, `/acp cancel`, and `/acp close` are useful operator affordances.
- They are **not** the refactor target surface.
- For unification, the relevant layer is the runtime/API control path underneath them.

Locked architectural rule:
- ACP and subagent keep **different kill paths**.
- ACP and subagent keep **different monitoring paths**.
- Shared lifecycle may unify the interface, but must not erase the runtime-specific control differences.
- Nova reaper behavior remains Nova-specific unless deliberately extracted later.

Implementation rule:
- Before touching shared kill logic, verify the exact low-level behavior already used in Nova code and preserve it unless there is a proven reason to change it.

---

### 10. Monitor semantics

Locked:
- Nova monitor semantics are canonical.
- Shared monitor implementation must preserve Nova behavior.
- Buster adapts to the shared/Nova contract.

This includes:
- terminal-state interpretation
- unreachable handling
- transcript fallback behavior
- idle / wait semantics
- rate-limit interpretation

---

### 11. Buster gets a real `pipeline/` subtree

Locked:
- Buster should consume the same normalized `pipeline/**` runtime tree.
- Buster should physically receive that tree through the same packaging/copy mechanism.

Meaning:
- Buster imports should move toward `./pipeline/...` or `../pipeline/...` as appropriate.

---

### 12. Old Buster `agents/*` files

Locked end state:
- old Buster-local lifecycle files should be deleted or moved once the normalized tree is live
- do not keep parallel old and new paths around longer than necessary

Rule:
- troubleshoot the target design, not a temporary forest of deprecated duplicates

---

### 13. Telemetry compatibility

Locked:
- Telemetry must be documented before lifecycle implementation proceeds far enough to risk drift.
- ClawDeck is the practical consumer contract and must be treated as externally constrained.
- Telemetry contract changes must land in the implementation repo **and** in ClawDeck together. No one-sided drift.

Buster-reported surface that ClawDeck must understand:
- 9 Buster-native event types:
  - `buster.task_started`
  - `buster.task_completed`
  - `buster.resource_cleanup`
  - `buster.git_sync`
  - `buster.suite_started`
  - `buster.suite_completed`
  - `buster.visual_reg`
  - `buster.decision`
  - `buster.session_monitor`
- plus reused shared event types emitted from Buster context:
  - `agent.spawned`
  - `agent.killed`
  - `agent.transcript`
  - `rate_limit.detected`

Must preserve or explicitly version:
- event names
- required fields
- semantic meaning of state/outcome fields
- ordering and dedupe semantics
- cadence / expectations for monitor-related events where ClawDeck depends on them
- `.swarm/logs/**` artifact layout for telemetry-adjacent logs
- Discord log record shape where ClawDeck or operators rely on it

Rule:
- “more complete telemetry” is welcome
- “silent semantic drift” is not

Canonical follow-up:
- `kubeclaw-main/docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md` is the detailed contract for ordering, dedupe, provenance, cost, rate-limit, Redis, and log artifact behavior.

---

### 14. Redis payload contract

Locked proposal:

#### Required top-level
- `schema_version`
- `task_type`
- `module_id`
- `project`
- `run_id`
- `prompt`
- `completion_stream`

#### Required `session`
- `model`
- `cwd`
- `timeout_seconds`
- `label`

#### Optional `session`
- `runtime`
- `agentId`
- `thinking`

#### Optional task context
- `module_path`
- `status_json_path`
- `buster_md_path`
- `suites`
- `test_config`
- `attempt`
- `log_dir`

Rules:
- `session.runtime` overrides runtime inference
- if `session.runtime` is absent, infer via the canonical shared runtime logic
- if `agentId` is absent and ACP is needed, resolve it from the model/harness mapping
- transcript-path absence is not fatal by itself

---

### 15. Rollout strategy

Locked:
- architecturally big bang
- git-wise stepwise

Meaning:
- one coherent end-state design
- implemented in small, careful commits
- each step should leave the tree understandable
- deprecated duplicates are removed as soon as the target path is live

---

## Mandatory checklist for every implementation step

For every file touched in Phase 1+:

1. classify it as shared, Nova-only, or Buster-only
2. define its final runtime path under `/app/skills/**`
3. confirm whether export names stay stable
4. confirm env behavior stays correct
5. confirm telemetry behavior is preserved
6. confirm relative imports still resolve after packaging
7. delete or relocate deprecated duplicates immediately when safe
8. validate against the overall architecture, not just local convenience
9. commit and push

---

## Pre-Phase-1 readiness checklist

Before implementation starts:
- [ ] packaging sanity check performed against real copy/build behavior
- [x] canonical shared tree locked
- [x] no-Nova-caller-churn rule locked
- [x] shared vs orchestration boundary locked
- [x] shared API-surface rule locked
- [x] env contract locked with Nova as source of truth
- [x] migration-safe runtime semantics locked
- [x] transcript-path behavior locked
- [x] subagent session-key storage pattern empirically sampled on this host
- [x] kill-path docs checked
- [x] Nova monitor semantics chosen as canonical
- [x] Buster normalized `pipeline/` subtree chosen
- [x] Buster legacy lifecycle files marked for removal
- [ ] telemetry contract documented in implementation-facing detail
- [x] Redis payload contract locked
- [x] rollout strategy locked

---

## Short version

The contract is now:
- shared lifecycle mechanics live under `skills/common/pipeline/**`
- final runtime paths under `/app/skills/pipeline/**` are what matter
- Nova stays stable
- Buster adapts
- Nova semantics are canonical for monitor, env behavior, and migration-time runtime behavior
- transcript resolution should prefer recorded session metadata and tolerate temporary absence
- ACP and subagent remain distinct runtimes even when wrapped by one shared interface
- telemetry and payload contracts must be explicit before deeper implementation proceeds
