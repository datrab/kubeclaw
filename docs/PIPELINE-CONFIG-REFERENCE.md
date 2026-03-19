# KubeClaw Pipeline — Konfigurations-Referenz

**Version:** 1.0  
**Datum:** 2026-03-18  
**Zweck:** Was muss wo konfiguriert sein, damit die Pipeline ein Projekt end-to-end durchlaufen kann. Für Nova und für den Operator.

---

## Überblick: Drei Files steuern alles

| File | Was es steuert | Wer pflegt es |
|---|---|---|
| `progress.json` | **Das Projekt:** Module, Gates, Reihenfolge, Models, Timeouts, Test-Configs | Nova / Operator |
| `swarm.config.json` | **Die Plattform:** Polling, Retries, Rate-Limits, Memory, Pre-Checks, Agent-Routing | Operator (selten geändert) |
| `.semgrep.yml` | **Lint-Regeln:** Welche Security/Correctness-Rules Echo's Lint-Report nutzt | Operator (optional anpassbar) |

Dazu kommen **Projekt-Dateien im Repo** die pro Modul existieren müssen:

| Datei | Wo | Wer erstellt | Wofür |
|---|---|---|---|
| `FORGE.md` | `.swarm/modules/<module-dir>/` | Nova | Bauanleitung für Forge — was soll gebaut werden |
| `BUSTER.md` | `.swarm/modules/<module-dir>/` | Nova | Testanleitung für Buster-Subagent — was soll getestet werden |
| `test-spec.json` | `.swarm/modules/<module-dir>/` | Nova / Operator | API-Test-Spezifikation für deterministische Tests (optional) |
| `baselines/` | `.swarm/modules/<module-dir>/baselines/` | Prism / manuell | Visual-Regression Baselines als PNG (optional) |

---

## 1. progress.json — Das Projekt

Dies ist die zentrale Datei. Liegt im Git-Repo unter `.swarm/progress.json`. Nova liest und schreibt sie. Die Pipeline liest sie bei jedem Schritt.

### 1.1 Top-Level-Struktur

```json
{
  "project": "kubecommand",
  "version": "2.0.0",

  "models": {
    "forge": "codex-5.4",
    "buster": "claude-sonnet-4-6",
    "echo": "claude-opus-4-6"
  },

  "execution_order": [
    "01", "02", "03", ...,
    "gate:midpoint-review",
    "14", "15", ...,
    "gate:final-buster",
    "gate:final-review"
  ],

  "phases": [ ... ],
  "modules": { ... },
  "gates": { ... }
}
```

| Feld | Pflicht | Beschreibung |
|---|---|---|
| `project` | ja | Projektname — wird für Memory-Scoping, Git-Pfade und Redis-Streams verwendet |
| `version` | nein | Semver — informativ |
| `models` | ja | Default-Modelle pro Agent. Kann pro Modul überschrieben werden |
| `execution_order` | ja | Array von Modul-IDs und Gate-Keys in exakter Ausführungsreihenfolge. Gates mit Prefix `gate:` |
| `phases` | nein | Logische Gruppierung von Modulen (informativ, Pipeline ignoriert es) |
| `modules` | ja | Modul-Definitionen (siehe §1.2) |
| `gates` | ja (wenn in execution_order) | Gate-Definitionen (siehe §1.3) |

### 1.2 Module

```json
"02": {
  "title": "Kubernetes Connection Layer",
  "dir": "02-kubernetes-connection",
  "substeps": null,
  "depends_on": ["01"],
  "timeout_minutes": 30,
  "max_fails": 3,
  "forge_subagent": "forge-codex",
  "forge_model": "codex-5.4",
  "test_suites": ["build", "health", "api", "security"],
  "test_config": {
    "serve": {
      "type": "server",
      "project_dir": "Projects/kubecommand/src",
      "start_cmd": "npm start",
      "port": 3000,
      "health_path": "/api/health"
    },
    "api": {
      "spec_file": ".swarm/modules/02-kubernetes-connection/test-spec.json"
    }
  }
}
```

| Feld | Pflicht | Default | Beschreibung |
|---|---|---|---|
| `title` | ja | — | Menschenlesbarer Modulname |
| `dir` | ja | — | Verzeichnisname im Repo (z.B. `02-kubernetes-connection`) |
| `substeps` | nein | `null` | Array von Sub-IDs (z.B. `["03a", "03b"]`). Pipeline konkateniert deren FORGE.md-Dateien in einem Forge-Spawn |
| `depends_on` | ja | `[]` | Module die vorher PASS sein müssen |
| `timeout_minutes` | nein | `45` (aus swarm.config) | Max. Laufzeit für einen Forge+Buster-Zyklus |
| `max_fails` | nein | `3` (aus swarm.config) | Max. Fehlversuche bevor BLOCKED |
| `forge_subagent` | nein | aus `models.forge` | ACP-Subagent-ID für Forge |
| `forge_model` | nein | aus `models.forge` | LLM-Modell für Forge |
| `test_suites` | nein | `["build", "health"]` | Welche Buster-Suites laufen (siehe BUSTER-CONFIG-REFERENCE.md §2) |
| `test_config` | nein | `{ serve: { type: "static" } }` | Suite-spezifische Config (siehe BUSTER-CONFIG-REFERENCE.md §3) |

**`serve.project_dir` ist Pflicht** wenn das Projekt nicht im Repo-Root liegt (Standard-Konvention: `Projects/<project>/src`). Ohne `project_dir` startet die Sandbox im Repo-Root und relative Pfade (`cd backend`, `spec_file`, etc.) brechen.

**Substeps:** Wenn ein Modul Substeps hat, bekommt Forge **einen** Spawn. `readForgeInstructions()` konkateniert alle Substep-FORGE.md-Dateien. BUSTER.md bleibt auf Modul-Ebene.

### 1.3 Gates

Gates sind Checkpoints zwischen Phasen. Drei Typen:

#### Gate Typ: `buster` — Systemtest

```json
"final-buster": {
  "type": "buster",
  "title": "Final System Test",
  "on_fail": "fix_and_retest",
  "instructions_file": "buster-test/FINAL-BUSTER.md",
  "output_file": "buster-test/FINAL-BUSTER-RESULT.json",
  "model": "claude-sonnet-4-6",
  "forge_model": "codex-5.4",
  "timeout_minutes": 60,
  "max_fix_cycles": 3,
  "test_suites": ["build", "health", "a11y", "perf", "bundle", "visual-reg", "api", "e2e", "security", "unit"],
  "test_config": {
    "serve": { "type": "static", "project_dir": "Projects/kubecommand/src" },
    "a11y": { "thresholds": { "critical": 0, "serious": 0 } },
    "perf": { "thresholds": { "performance": 80, "accessibility": 90 } },
    "bundle": { "thresholds": { "max_size_kb": 5120, "max_file_count": 500 } },
    "visual-reg": { "thresholds": { "max_diff_percent": 1.0 } },
    "api": { "spec_file": ".swarm/buster-test/final-test-spec.json", "thresholds": { "max_failures": 0 } },
    "e2e": { "tests_dir": ".swarm/buster-test/tests", "thresholds": { "max_failures": 0 } },
    "security": { "paths": ["/", "/api/health"], "thresholds": { "max_missing_headers": 0 } },
    "unit": { "thresholds": { "max_failures": 0 } }
  }
}
```

| Feld | Pflicht | Beschreibung |
|---|---|---|
| `type` | ja | `"buster"` |
| `on_fail` | ja | `"fix_and_retest"` — Pipeline sendet Failure an Forge, Forge fixt, Buster re-testet |
| `instructions_file` | ja | Pfad zu BUSTER.md für diesen Gate-Test (relativ zu `.swarm/`) |
| `output_file` | ja | Wo Buster das Ergebnis schreibt |
| `model` | nein | LLM-Modell für den Buster-Subagent |
| `forge_model` | nein | LLM-Modell für Forge bei Fixes |
| `timeout_minutes` | nein | Max. Laufzeit |
| `max_fix_cycles` | nein | Wie oft Forge fixen darf bevor BLOCKED |
| `test_suites` / `test_config` | nein | Wie bei Modulen, aber typischerweise mit `thresholds` (enforced) |

**Unterschied zu Modul-Tests:** Gate-Tests haben `thresholds` → enforced. Jeder Failure zählt.

#### Gate Typ: `review` — Echo Code-Review

```json
"midpoint-review": {
  "type": "review",
  "title": "Echo Midpoint Review",
  "review_name": "MIDPOINT-REVIEW",
  "on_nogo": "fix_and_continue",
  "instructions_file": "echo-review/MIDPOINT-REVIEW-INSTRUCTIONS.md",
  "output_file": "echo-review/MIDPOINT-REVIEW.json",
  "review_output_dir": "echo-review",
  "reviewers": null,
  "timeout_minutes": 30,
  "max_fix_cycles": null,
  "lint_tier": null
}
```

| Feld | Pflicht | Beschreibung |
|---|---|---|
| `type` | ja | `"review"` |
| `review_name` | ja | Identifier für den Review (used in output files) |
| `on_nogo` | ja | `"fix_and_continue"` oder `"fix_and_rereview"` |
| `instructions_file` | ja | Review-Anweisungen für Echo |
| `output_file` | ja | Wo Echo das Review-Ergebnis schreibt |
| `review_output_dir` | nein | Verzeichnis für Review-Artefakte |
| `reviewers` | nein | `null` = Default aus swarm.config, oder Array von `{ label, agent_id }` |
| `lint_tier` | nein | `null` = Default, `"full"`, `"pre-check"` |

### 1.4 Was Nova pro Modul vorbereiten muss

Bevor die Pipeline ein Modul bearbeiten kann, müssen diese Dateien im Repo existieren:

```
.swarm/modules/<module-dir>/
├── FORGE.md              # PFLICHT — Was Forge bauen soll
├── BUSTER.md             # PFLICHT — Was Buster testen soll
├── test-spec.json        # Optional — API-Test-Spezifikation (wenn api in test_suites)
└── baselines/
    └── baseline.png      # Optional — Visual-Regression Baseline (wenn visual-reg in test_suites)
```

**FORGE.md** beschreibt WAS gebaut werden soll: Architektur, API-Endpoints, Datenmodelle, UI-Komponenten, Acceptance Criteria. Forge übersetzt das in Code.

**BUSTER.md** beschreibt WAS getestet werden soll: Funktionale Tests, Edge Cases, Error-Handling, spezifische Szenarien die der LLM-Subagent prüfen soll (die deterministischen Suites laufen automatisch davor).

**test-spec.json** definiert deterministische API-Tests (HTTP + WebSocket). Format-Referenz: `examples/test-spec-example.json` und `docs/BUSTER-CONFIG-REFERENCE.md §3.6`.

---

## 2. swarm.config.json — Die Plattform

Liegt unter `.swarm/swarm.config.json` oder wird via Helm ConfigMap deployed. Steuert Pipeline-Verhalten — wird selten geändert.

### 2.1 Pipeline-Verhalten

```json
{
  "poll_interval_seconds": 30,
  "default_timeout_minutes": 45,
  "default_max_fails": 3,
  "auto_retry_threshold": 2,
  "session_nudge_threshold": 0.75
}
```

| Feld | Default | Beschreibung |
|---|---|---|
| `poll_interval_seconds` | `30` | Wie oft die Pipeline den Buster-Completion-Stream pollt |
| `default_timeout_minutes` | `45` | Default-Timeout wenn Modul keinen eigenen setzt |
| `default_max_fails` | `3` | Default max_fails wenn Modul keinen eigenen setzt |
| `auto_retry_threshold` | `2` | Nach N Fails → automatischer Retry mit angepasstem Prompt. Danach → EXIT 10 (NEEDS_NOVA) |
| `session_nudge_threshold` | `0.75` | Bei 75% Timeout-Verbrauch → Nudge an den laufenden Subagent |

### 2.2 Rate-Limiting

```json
{
  "rate_limit": {
    "cooldown_hours": 2,
    "max_pauses_per_module": 5
  }
}
```

| Feld | Default | Beschreibung |
|---|---|---|
| `cooldown_hours` | `2` | Wartezeit bei Rate-Limit-Hit |
| `max_pauses_per_module` | `5` | Nach N Pausen pro Modul → EXIT 40 |

### 2.3 Pre-Check (Lint vor Forge)

```json
{
  "pre_check": {
    "enabled": true,
    "lint_report_path": "/app/skills/lint-report.js",
    "semgrep_config_path": "/home/node/.openclaw/.semgrep.yml",
    "timeout_seconds": 30
  }
}
```

| Feld | Default | Beschreibung |
|---|---|---|
| `enabled` | `true` | Lint-Report vor jedem Forge-Dispatch? |
| `lint_report_path` | `/app/skills/lint-report.js` | Pfad zum Lint-Report-Script |
| `semgrep_config_path` | `.semgrep.yml` | Pfad zur Semgrep-Konfiguration |
| `timeout_seconds` | `30` | Max. Laufzeit für Lint |

**Was der Pre-Check tut:** Führt `lint-report.js` aus (tsc, ESLint, Semgrep) und hängt das Ergebnis an den Forge-Prompt an. Forge sieht bestehende Lint-Fehler bevor es neuen Code schreibt.

### 2.4 Memory (Qdrant)

```json
{
  "memory": {
    "enabled": true,
    "recall_limit": 5,
    "recall_before_forge": true,
    "feedback_after_outcome": true,
    "store_patterns_globally": true,
    "targeted_decay_amount": 0.1
  }
}
```

| Feld | Default | Beschreibung |
|---|---|---|
| `enabled` | `true` | Memory-System aktiv? |
| `memory_js_path` | `/app/skills/memory.js` | Pfad zum Memory-Script |
| `recall_limit` | `5` | Max. Memories pro Recall-Query |
| `recall_before_forge` | `true` | Vor jedem Forge-Dispatch relevante Memories recallen und in den Prompt injizieren? |
| `feedback_after_outcome` | `true` | Nach jedem PASS/FAIL automatisch Memory-Feedback speichern? |
| `store_patterns_globally` | `true` | Erkannte Patterns cross-project speichern? |
| `targeted_decay_amount` | `0.1` | Confidence-Decay bei negativem Feedback |

### 2.5 Models und Agents

```json
{
  "models": {
    "forge": "codex-5.4",
    "buster": "claude-sonnet-4-6",
    "echo": "claude-opus-4-6"
  },
  "agents": {
    "forge": { "dispatch": "acp", "acp_agent_id": "codex" },
    "buster": {},
    "echo": { "dispatch": "acp", "acp_agent_id": "claude" }
  }
}
```

**Models** sind die Default-LLM-Modelle pro Agent. `progress.json` kann sie pro Modul überschreiben via `forge_model`.

**Agents** definiert wie die Pipeline Agenten anspricht. Forge und Echo via ACP (Subagent im Gateway), Buster via Redis (separater Pod). Optionales Feld `cwd` (Default: `null`) setzt das Arbeitsverzeichnis für ACP-Sessions.

### 2.6 Review-Defaults

```json
{
  "review_defaults": {
    "reviewers": [
      { "label": "echo-opus", "agent_id": "claude" }
    ],
    "timeout_minutes": 30,
    "max_fix_cycles": 3,
    "lint_tier": "full"
  }
}
```

Defaults für Gate-Reviews wenn das Gate keine eigenen Werte setzt.

### 2.7 Discord

```json
{
  "discord_webhook_url": "https://discord.com/api/webhooks/...",
  "discord_alerts": {
    "info": true,
    "warn": true,
    "critical": true,
    "ok": true
  }
}
```

Steuert welche Pipeline-Events als Discord-Notifications gesendet werden. Die Webhook-URL kommt aus dem Kubernetes Secret.

---

## 3. .semgrep.yml — Lint-Regeln

Liegt unter `.swarm/.semgrep.yml` oder wird via Helm ConfigMap deployed. Definiert Semgrep-Regeln für `lint-report.js` (Echo's Pre-Check).

### Was enthalten ist (Default)

| Kategorie | Regeln |
|---|---|
| JS/TS Security | eval-Detection, Shell-Injection, Hardcoded Secrets, console.log in Prod |
| Node.js Backend | Path Traversal, Math.random for Security, Prototype Pollution, Open Redirect |
| Python | Bare except, SQL Injection, Timing Attacks, subprocess shell, Pickle, unsafe YAML, Jinja2 XSS |
| React/Frontend | dangerouslySetInnerHTML, innerHTML, unsanitized URLs |
| Kubernetes YAML | Privileged Containers, Missing Resource Limits, RBAC Wildcards, Host Namespaces, Root UID, :latest Tags |
| Cross-Language | Weak Crypto (MD5/SHA1) |

### Anpassen

Regeln können hinzugefügt, entfernt oder die Severity geändert werden. Jede Regel hat eine `id`, `pattern`, `message`, `languages` und `severity` (ERROR oder WARNING).

Regeln mit `severity: ERROR` blockieren bei Echo's Review. `severity: WARNING` sind informativ.

Um eine Regel zu deaktivieren: entfernen oder `severity: INFO` setzen.

Referenz für neue Regeln: https://semgrep.dev/r

---

## 4. Pipeline-Flow: Was passiert pro Modul

```
Nova startet: node pipeline.js --project kubecommand --resume

Für jedes Modul in execution_order:
│
├─ 1. Status prüfen: status.json → bereits PASS? → Skip
│
├─ 2. Dependencies prüfen: depends_on alle PASS? → Nein → Skip
│
├─ 3. FORGE.md + BUSTER.md existieren? → Nein → ERROR
│
├─ 4. Pre-Check (wenn enabled):
│     lint-report.js → Ergebnis an Forge-Prompt anhängen
│
├─ 5. Memory Recall (wenn enabled):
│     Relevante Memories für dieses Modul → an Forge-Prompt anhängen
│
├─ 6. Forge-Dispatch:
│     ACP Subagent spawnen mit: FORGE.md + Lint-Report + Memories + ggf. Retry-Prompt
│     Forge schreibt Code → git commit → status.json
│
├─ 7. Buster-Dispatch:
│     Redis-Message an swarm:buster:tasks mit:
│       instructions (BUSTER.md), test_suites, test_config, timeout
│     Orchestrator empfängt → Build/Serve → Suite-Runner → Conditional Spawn
│
├─ 8. Ergebnis:
│     PASS → Memory Feedback → Nächstes Modul
│     FAIL (auto_retry_threshold nicht erreicht) → Retry mit angepasstem Prompt
│     FAIL (auto_retry_threshold erreicht) → EXIT 10 (NEEDS_NOVA)
│     FAIL (max_fails erreicht) → EXIT 20 (BLOCKED)
│
Für jedes Gate:
│
├─ Gate type=buster → Buster-Dispatch mit enforced thresholds
│   FAIL → fix_and_retest (Forge fixt, Buster re-testet, max_fix_cycles)
│
├─ Gate type=review → Echo-Dispatch
│   NO-GO → fix_and_continue oder fix_and_rereview
```

---

## 5. Checkliste: Neues Projekt aufsetzen

Was Nova (oder der Operator) tun muss bevor `pipeline.js --resume` das erste Mal läuft:

### Pflicht

- [ ] `progress.json` mit allen Modulen, Gates, execution_order
- [ ] `models` in progress.json: welche LLMs für Forge, Buster, Echo
- [ ] Pro Modul: `serve.project_dir` in test_config (z.B. `Projects/<project>/src`)
- [ ] Pro Modul: `FORGE.md` in `.swarm/modules/<module-dir>/`
- [ ] Pro Modul: `BUSTER.md` in `.swarm/modules/<module-dir>/`
- [ ] Pro Modul: `test_suites` und `test_config` in progress.json (oder Defaults akzeptieren)
- [ ] Für Backend-Module: `serve.type: "server"` + `start_cmd` + `port` + `health_path` in test_config
- [ ] `swarm.config.json` mit korrekten Model-Names und Agent-Routing

### Empfohlen

- [ ] Für Backend-Module mit APIs: `test-spec.json` in `.swarm/modules/<module-dir>/`
- [ ] Für Frontend-Module: Visual-Regression Baselines in `.swarm/modules/<module-dir>/baselines/`
- [ ] Gate `final-buster` mit enforced `thresholds` für alle relevanten Suites
- [ ] Gate `final-review` mit Echo Code-Review
- [ ] `.semgrep.yml` angepasst an Projekt-Technologien (Default deckt JS/TS/Python/K8s ab)

### Optional

- [ ] `phases` in progress.json (informativ, keine Pipeline-Auswirkung)
- [ ] `substeps` für grosse Module (Pipeline konkateniert Substep-FORGE.md-Dateien in einem Forge-Spawn)
- [ ] Custom `timeout_minutes` und `max_fails` pro Modul (sonst Defaults aus swarm.config)
- [ ] Memory tuning in swarm.config (recall_limit, decay, patterns)

---

## 6. Referenz-Verweise

| Thema | Dokument |
|---|---|
| Buster test_suites und test_config im Detail | `docs/BUSTER-CONFIG-REFERENCE.md` |
| API-Test-Spec Format (test-spec.json) | `examples/test-spec-example.json` |
| Buster-Architektur und Suite-Details | `docs/buster-test-platform-reference-v2.md` |
| Pipeline.js Internals | `docs/pipeline-reference-v8.md` |
| Phasenplan und offene Punkte | `docs/BUSTER-TEST-PLATFORM-PLAN.md` |
| Beispiel progress.json | `examples/progress.json` |
| Beispiel swarm.config.json | `charts/kubeclaw/files/config/swarm.config.json` |
| Beispiel .semgrep.yml | `charts/kubeclaw/files/config/.semgrep.yml` |
| Beispiel buster-values.yaml | `examples/buster-values.yaml` |
| Beispiel nova-values.yaml | `examples/nova-values.yaml` |
