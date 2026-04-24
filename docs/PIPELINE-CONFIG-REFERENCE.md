# KubeClaw Pipeline — Konfigurations-Referenz

**Version:** 2.1
**Datum:** 2026-04-03
**Zweck:** Was muss wo konfiguriert sein, damit die Pipeline ein Projekt end-to-end durchlaufen kann. Für Nova und für den Operator.
**Hinweis:** Aktualisiert für v10 (Wave 3): acp_monitor-Felder, case_study, telemetry-Flag-Semantik, progress.defaults ergänzt.

---

## Überblick: Drei Files steuern alles

| File | Was es steuert | Wer pflegt es |
|---|---|---|
| `progress.json` | **Das Projekt:** Module, Gates, Reihenfolge, Models, Timeouts, Test-Configs | Nova / Operator |
| `swarm.config.json` | **Die Plattform:** Polling, Retries, Rate-Limits, Memory, Pre-Checks, Agent-Routing, Telemetrie | Operator (selten geändert) |
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
| `models` | ja | Default-Modelle pro Agent. Kann pro Modul überschrieben werden (entspricht `defaults.models` unten) |
| `execution_order` | ja | Array von Modul-IDs und Gate-Keys in exakter Ausführungsreihenfolge. Gates mit Prefix `gate:` |
| `phases` | nein | Logische Gruppierung von Modulen (informativ, Pipeline ignoriert es) |
| `modules` | ja | Modul-Definitionen (siehe §1.2) |
| `gates` | ja (wenn in execution_order) | Gate-Definitionen (siehe §1.3) |
| `defaults` | nein | Projekt-Level Model/Thinking-Overrides (Wave 3, siehe §1.5) |

### 1.5 progress.json `defaults` — Projekt-Level Model/Thinking-Override (Wave 3 Neu)

Der `defaults`-Block ermöglicht Projekt-Level-Overrides für Model und Thinking-Level pro Agent. Diese haben Priorität 3 in der 4-stufigen Policy-Auflösung (nach Runtime-Override und Scope-Policy, vor Config-Default).

```json
{
  "defaults": {
    "models": {
      "forge": "claude-sonnet-4-6",
      "buster": "claude-sonnet-4-6",
      "echo": "claude-opus-4-6"
    },
    "thinking": {
      "forge": "medium",
      "echo": "high"
    }
  }
}
```

| Feld | Beschreibung |
|---|---|
| `defaults.models.<agent>` | Projekt-Level Model-Override für den genannten Agenten. Überschreibt `config.models.<agent>`. |
| `defaults.thinking.<agent>` | Projekt-Level Thinking-Level für den Agenten. Gültige Werte: `none`, `low`, `medium`, `high`, `xhigh`, `adaptive`. |

**Hinweis:** Thinking wird nur auf ACP/Subagent-Dispatch-Pfaden unterstützt. Auf Redis/Buster-Pfaden wird Thinking ignoriert (source: `not_supported_on_redis`).

### 1.2 Module

```json
"02": {
  "title": "Kubernetes Connection Layer",
  "dir": "02-kubernetes-connection",
  "substeps": null,
  "depends_on": ["01"],
  "timeout_minutes": 30,
  "max_fails": 3,
  "auto_retry_threshold": 3,
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
| `substeps` | nein | `null` | Array von Sub-IDs. Pipeline konkateniert deren FORGE.md-Dateien in einem Forge-Spawn |
| `depends_on` | ja | `[]` | Module die vorher PASS sein müssen |
| `timeout_minutes` | nein | `45` (aus swarm.config) | Max. Laufzeit für einen Forge+Buster-Zyklus |
| `max_fails` | nein | `3` (aus swarm.config) | Max. Fehlversuche bevor BLOCKED |
| `auto_retry_threshold` | nein | aus swarm.config | Max. automatische Retries vor Nova-Eskalation (EXIT 10). Überschreibt den Plattform-Default für dieses Modul. |
| `forge_subagent` | nein | aus `models.forge` | ACP-Subagent-ID für Forge |
| `forge_model` | nein | aus `models.forge` | LLM-Modell für Forge |
| `test_suites` | nein | `["build", "health"]` | Welche Buster-Suites laufen |
| `test_config` | nein | `{ serve: { type: "static" } }` | Suite-spezifische Config |

**`serve.project_dir` ist Pflicht** wenn das Projekt nicht im Repo-Root liegt. Ohne `project_dir` startet die Sandbox im Repo-Root und relative Pfade brechen.

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
  "auto_retry_threshold": 1,
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
| `auto_retry_threshold` | nein | aus swarm.config | Max. Auto-Retries vor Nova-Eskalation für dieses Gate |
| `test_suites` / `test_config` | nein | Wie bei Modulen, aber typischerweise mit `thresholds` (enforced) |

**Unterschied zu Modul-Tests:** Gate-Tests haben `thresholds` → enforced. Jeder Failure zählt.

#### Gate Typ: `review` — Echo Code-Review

```json
"midpoint-review": {
  "type": "review",
  "title": "Echo Midpoint Review",
  "review_name": "MIDPOINT-REVIEW",
  "on_nogo": "fix_and_rereview",
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
| `on_nogo` | ja | `"fix_and_rereview"` (required) |
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

---

## 2. swarm.config.json — Die Plattform

Standard: via `SWARM_CONFIG` Env-Variable oder portable Auto-Erkennung der Plattformdatei `swarm.config.json` (typisch `~/.openclaw/swarm.config.json`, mit Repo-/Image-Fallback). Alternativ als Helm ConfigMap deployed. Steuert Pipeline-Verhalten — wird selten geändert.

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
| `auto_retry_threshold` | `2` | Plattform-Default: Nach N Fails → automatischer Retry mit angepasstem Prompt. Danach → EXIT 10 (NEEDS_NOVA). Kann in progress.json pro Modul/Gate überschrieben werden. |
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
    "timeout_seconds": 30
  }
}
```

| Feld | Default | Beschreibung |
|---|---|---|
| `enabled` | `true` | Lint-Report vor jedem Forge-Dispatch? |
| `lint_report_path` | `/app/skills/lint-report.js` | Pfad zum Lint-Report-Script |
| `semgrep_config_path` | `auto-detect` | Optionaler Override für die Semgrep-Konfiguration. Ohne Wert: Suche zuerst neben der erkannten Plattformdatei `swarm.config.json` (z.B. `SWARM_CONFIG`, `~/.openclaw/swarm.config.json`, Helm-/Image-Fallback), dann unter `~/.openclaw/.semgrep.yml`, dann als Legacy-Fallback im Repo (`<repo>/.semgrep.yml`) |
| `timeout_seconds` | `30` | Max. Laufzeit für Lint |

**Was der Pre-Check tut:** Führt `lint-report.js` aus (tsc, ESLint, Semgrep) und hängt das Ergebnis an den Forge-Prompt an.

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
| `recall_before_forge` | `true` | Vor jedem Forge-Dispatch relevante Memories recallen? |
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

**Agents** definiert wie die Pipeline Agenten anspricht. Forge und Echo via ACP (Subagent im Gateway), Buster via Redis (separater Pod).

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

Steuert welche Pipeline-Events als Discord-Notifications gesendet werden.

### 2.8 Telemetrie (v9-Neu)

```json
{
  "telemetry": {
    "enabled": true
  }
}
```

| Feld | Default | Beschreibung |
|---|---|---|
| `telemetry.stream_key` | — | **Enable-Flag:** Wenn gesetzt (beliebiger nicht-leerer Wert), ist Telemetrie aktiv. Der Wert selbst wird NICHT als Stream Key verwendet. |
| `telemetry.enabled` | — | Alternative Enable-Flag: `true` aktiviert Telemetrie. |

**Wichtig:** Der tatsächliche Stream Key wird dynamisch generiert: `pipeline:telemetry:<project>:<run_id>`. Die Konfigurationsfelder dienen nur als Aktivierungsschalter.

Wenn weder `stream_key` noch `enabled` gesetzt ist, bleibt Telemetrie aus. Ist Telemetrie aktiviert und Redis nicht erreichbar, bleibt die Pipeline nicht-blockierend, schreibt aber ein explizites `observability.degraded`-Fallback-Artefakt statt Events still zu verwerfen.

**Emittierte Event-Typen:** Kanonisches Event-Inventar in `docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md`, event-spezifische Payload-Felder und Beispiele in `docs/telemetry-event-schema.md`.

### 2.9 ACP-Monitor (Wave 3 Neu)

```json
{
  "acp_monitor": {
    "unknown_poll_limit": 10,
    "stale_poll_limit": 10,
    "max_transcript_extensions": 3,
    "transcript_grace_ms": 300000
  }
}
```

| Feld | Default | Beschreibung |
|---|---|---|
| `acp_monitor.unknown_poll_limit` | `10` | Maximale aufeinanderfolgende Polls bei unbekanntem ACP-Session-State bevor Timeout |
| `acp_monitor.stale_poll_limit` | `10` | Maximale aufeinanderfolgende Polls bei stagniertem Transcript bevor Timeout |
| `acp_monitor.max_transcript_extensions` | `3` | Maximale Transcript-Erweiterungen pro Session (0 = keine Verlängerungen) |
| `acp_monitor.transcript_grace_ms` | `300000` (5min) | Wartezeit nach dem letzten Transcript-Update bevor Session als stale gilt |

### 2.10 Case Study (Wave 3 Neu)

```json
{
  "case_study": {
    "enabled": true,
    "model": "claude-opus-4-6",
    "output_file": ".swarm/logs/pipeline/case-study.md"
  }
}
```

| Feld | Default | Beschreibung |
|---|---|---|
| `case_study.enabled` | `false` | Case-Study-Agent am Pipeline-Ende aktivieren? |
| `case_study.model` | aus `models.echo` | LLM-Modell für den Case-Study-Agenten |
| `case_study.output_file` | automatisch generiert | Pfad der output-Datei (relativ zu Repo-Root) |

---

## 3. .semgrep.yml — Lint-Regeln

Wird standardmäßig portable entdeckt: zuerst als `.semgrep.yml` neben der aktiven oder erkannten Plattformdatei `swarm.config.json` (z.B. neben `SWARM_CONFIG`, `~/.openclaw/swarm.config.json` oder der Image-/Helm-Config), danach unter `~/.openclaw/.semgrep.yml`, dann als Legacy-Repo-Fallback unter `<repo>/.semgrep.yml`.

Im Source-Tree liegt das Helm-Beispiel weiterhin unter `charts/kubeclaw/files/config/.semgrep.yml` und wird in Deployments typischerweise neben die ausgerollte `swarm.config.json` kopiert.

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

Regeln mit `severity: ERROR` blockieren bei Echo's Review. `severity: WARNING` sind informativ. Um eine Regel zu deaktivieren: entfernen oder `severity: INFO` setzen.

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
│     Telemetrie: module.started + agent.spawned, später module.status_changed
│
├─ 7. Buster-Dispatch:
│     Redis-Message an swarm:buster:tasks
│     Telemetrie: nach Task-Annahme buster.task_started / buster.task_completed
│     Buster Pipeline empfängt → Build/Serve → Suite-Runner → Conditional Spawn
│
├─ 8. Ergebnis:
│     PASS → Memory Feedback → Telemetrie: module.status_changed (PASS) → Nächstes Modul
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
│   NO-GO → fix_and_rereview
│
Am Pipeline-Ende:
│
└─ generatePipelineSummary() → Discord + Nova (Empfehlungen, Fail-Patterns, Kosten)
```

---

## 5. Pipeline-Script-Ort (v9 Modular)

```
/app/skills/nova/pipeline.js              ← Kompatibilitäts-Shim (≤25 Zeilen)
/app/skills/nova/pipeline/
  core/         ← config, paths, context, logger, temp
  integrations/ ← git, gateway, redis, discord
  agents/       ← lifecycle, acp-monitor, shutdown
  prompts/      ← forge, buster-module, buster-gate, gate-fix, review, shared
  services/     ← status-store, blueprint, polling, rate-limit, failures, telemetry, summary
  runners/      ← module-runner, gate-runner, buster-gate-runner, review-gate-runner, pipeline-runner
  index.js      ← öffentliche Exports
  cli.js        ← CLI-Einstiegspunkt
```

Aufruf (unverändert zu v8):
```bash
node /app/skills/nova/pipeline.js --project kubecommand --resume
```

Der Shim delegiert automatisch an `pipeline/cli.js`.

**REPO_ROOT Environment Variable:**

| Variable | Beschreibung |
|---|---|
| `REPO_ROOT` | Überschreibt die automatische Git-Repo-Erkennung. Nützlich wenn die Pipeline aus einem Verzeichnis ausserhalb des Repos aufgerufen wird (z.B. aus `/app/skills/nova/`). Priorität 2 (nach `--repo` Flag, vor `git rev-parse`). |

```bash
REPO_ROOT=/workspace/myproject node pipeline.js --project myproject --resume
```

---

## 6. Checkliste: Neues Projekt aufsetzen

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
- [ ] `.semgrep.yml` angepasst an Projekt-Technologien
- [ ] Telemetrie aktivieren (`telemetry.enabled: true` oder legacy `telemetry.stream_key`) für externe Monitoring-Anbindung

### Optional

- [ ] `phases` in progress.json (informativ, keine Pipeline-Auswirkung)
- [ ] `substeps` für grosse Module
- [ ] Custom `timeout_minutes`, `max_fails` und `auto_retry_threshold` pro Modul (sonst Defaults)
- [ ] Memory tuning in swarm.config (recall_limit, decay, patterns)

---

## 7. Referenz-Verweise

| Thema | Dokument |
|---|---|
| Buster test_suites und test_config im Detail | `docs/BUSTER-CONFIG-REFERENCE.md` |
| API-Test-Spec Format (test-spec.json) | `examples/test-spec-example.json` |
| Buster-Architektur und Suite-Details | `docs/buster-test-platform-reference-v2.md` |
| Pipeline Internals (v9) | `docs/pipeline-reference-v9.md` |
| Phasenplan und offene Punkte | `docs/BUSTER-TEST-PLATFORM-PLAN.md` |
| Beispiel progress.json | `examples/progress.json` |
| Beispiel swarm.config.json | `charts/kubeclaw/files/config/swarm.config.json` |
| Beispiel .semgrep.yml | `charts/kubeclaw/files/config/.semgrep.yml` |
| Beispiel buster-values.yaml | `examples/buster-values.yaml` |
| Beispiel nova-values.yaml | `examples/nova-values.yaml` |
