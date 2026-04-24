# Architecture Validator — Reference

The architecture validator runs **before module 01** on every pipeline execution. It detects project definition defects that would cause wasted execution time or silent failures.

---

## When It Runs

The validator runs automatically as part of pipeline startup, before the first module is dispatched. If the validator result is `BLOCKED`, the pipeline halts before executing any module work.

---

## Two-Phase Execution

### Phase 1 — Deterministic Checks

Runs without any external dependencies. Checks:

- `progress.json` field presence and coherence
- `execution_order` references (undefined module/gate IDs)
- Module directory existence
- FORGE.md and BUSTER.md presence per module
- test-spec.json validity
- Gate type presence and review-gate name fields
- Dependency graph (undefined refs, self-references)
- Architecture validator model config validity

### Phase 2 — Agent Judgment

Optional. Runs a gateway-dispatched agent to assess:

- Architecture coherence
- Gap and overlap detection in module definitions
- Dependency ordering analysis

Phase 2 is skipped when the gateway is unavailable or `agentEnabled` is false in config. The run continues normally — Phase 2 skip is recorded as an `info` finding.

---

## Blocking Policy

| Severity | Effect |
|---|---|
| `blocking` | Pipeline **halts** before module 01 |
| `error` | Recorded; pipeline **proceeds** |
| `warn` | Recorded; pipeline **proceeds** |
| `info` | Recorded; pipeline **proceeds** |

A result is `BLOCKED` only when at least one finding with `severity: "blocking"` exists.

---

## Finding Schema

Each finding has these fields:

```json
{
  "id": "MODULE_FORGE_MISSING",
  "severity": "blocking | error | warn | info",
  "scope": "module | gate | project | dependency_graph | test_spec | config",
  "paths": ["Projects/my-project/src/.swarm/modules/03-my-module/FORGE.md"],
  "explanation": "FORGE.md not found for module 03-my-module",
  "remediation": "Create the missing file on the architecture branch"
}
```

### Finding Codes

| Code | Meaning |
|---|---|
| `PROGRESS_MISSING_FIELD` | Required top-level field absent in progress.json |
| `PROGRESS_EMPTY_EXEC_ORDER` | execution_order is empty |
| `EXEC_ORDER_MODULE_UNDEFINED` | execution_order references module not defined in modules |
| `EXEC_ORDER_GATE_UNDEFINED` | execution_order references gate not defined in gates |
| `MODULE_MISSING_DIR` | Module `dir` field absent |
| `MODULE_FORGE_MISSING` | FORGE.md not present for module |
| `MODULE_BUSTER_MISSING` | BUSTER.md not present for module |
| `MODULE_TEST_SPEC_INVALID_JSON` | test-spec.json present but invalid JSON |
| `TEST_SPEC_MISSING_FIELD` | test-spec.json missing required field |
| `TEST_SPEC_MODULE_ID_MISMATCH` | test-spec.json module_id doesn't match dir |
| `GATE_MISSING_TYPE` | Gate definition missing type field |
| `GATE_INSTRUCTIONS_MISSING` | Review gate instructions file absent |
| `GATE_MISSING_REVIEW_NAME` | Review gate missing reviewer name |
| `DEP_UNDEFINED_REF` | depends_on references undefined module |
| `DEP_SELF_REFERENCE` | Module depends_on itself |
| `ARCH_VALIDATOR_MODEL_MALFORMED` | `models.arch_validator` is set but not a valid model string |
| `MODULE_FORGE_MODEL_MALFORMED` | A module's `forge_model` is set but not a non-empty string |
| `GATE_MODEL_MALFORMED` | A gate's `model` is set but not a non-empty string |
| `AGENT_JUDGMENT_SKIPPED` | Phase 2 agent judgment skipped (info) |
| `AGENT_JUDGMENT_PARSE_ERROR` | Agent response could not be parsed |
| `VALIDATOR_INTERNAL_ERROR` | Unexpected error during validation |

---

## Artifact Paths

All artifacts are written to `.swarm/logs/architecture-validator/`:

```
.swarm/logs/architecture-validator/
├── results.json        ← Machine-readable findings (always written)
├── summary.md          ← Human-readable report (always written)
└── validator-prompt.md ← Prompt used for Phase 2 agent run (written if Phase 2 ran)
```

These paths resolve to `config._logDir/architecture-validator/` in the pipeline config.

---

## results.json Schema

```json
{
  "run_id": "run-<timestamp>",
  "project": "my-project",
  "timestamp": "2026-04-02T12:00:00.000Z",
  "blocked": false,
  "findings": [
    {
      "id": "MODULE_FORGE_MISSING",
      "severity": "blocking",
      "scope": "module",
      "paths": [".swarm/modules/03-my-module/FORGE.md"],
      "explanation": "FORGE.md not found",
      "remediation": "Create FORGE.md on the architecture branch"
    }
  ],
  "agent_judgment_ran": true,
  "agent_judgment_skipped": false
}
```

---

## Inspecting Results

```bash
# Read results from project root
cat Projects/<project>/src/.swarm/logs/architecture-validator/results.json | jq '.'

# Check blocked status
cat Projects/<project>/src/.swarm/logs/architecture-validator/results.json | jq '.blocked'

# List blocking findings only
cat Projects/<project>/src/.swarm/logs/architecture-validator/results.json \
  | jq '.findings[] | select(.severity == "blocking")'

# Human-readable summary
cat Projects/<project>/src/.swarm/logs/architecture-validator/summary.md
```

---

## Governance Summary Integration

The architecture validator outcome is recorded in `summary.json` under `.governance.arch_validator`:

The summary entry also preserves `run_id` and `project`, so the governance snapshot can be joined directly back to the same pipeline replay bundle and live telemetry stream.

```json
{
  "governance": {
    "arch_validator": {
      "ran": true,
      "blocked": false,
      "run_id": "run-2026-04-11T00-00-00Z",
      "project": "my-project",
      "outcome": "PASSED_WITH_FINDINGS",
      "findings_total": 2,
      "blocking_count": 0,
      "error_count": 1,
      "warn_count": 1,
      "info_count": 0,
      "artifact_path": ".swarm/logs/architecture-validator/results.json",
      "summary_path": ".swarm/logs/architecture-validator/summary.md"
    }
  }
}
```

Outcome values:
- `PASSED` — no findings
- `PASSED_WITH_FINDINGS` — non-blocking findings only
- `BLOCKED` — at least one blocking finding

---

## Model Configuration

Default model: `openai/gpt-5.4` with `thinking: xhigh`

Override via `progress.json`:

```json
{
  "defaults": {
    "models": {
      "arch_validator": "anthropic/claude-sonnet-4-6"
    }
  }
}
```

Or via `swarm.config.json`:

```json
{
  "models": {
    "arch_validator": "anthropic/claude-sonnet-4-6"
  }
}
```

Model resolution follows the standard policy precedence chain (runtime override → scope policy → project default → config default). The arch validator uses `dispatchPath: 'subagent'`, so thinking settings are fully supported.

**Model policy log:** When Phase 2 agent judgment runs, the arch validator writes an effective-resolution record to `.swarm/logs/pipeline/model-policy.jsonl` (scope: `arch_validator`). This makes the validator's model choice visible in the standard model audit trail alongside all other agent spawns.

If the gateway is unavailable, Phase 2 is skipped gracefully — the pipeline does not fail on validator agent errors.
