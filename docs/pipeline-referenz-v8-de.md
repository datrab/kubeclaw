# PIPELINE.JS — Vollständige Architektur- und Referenzdokumentation (v8)

**Datei:** `pipeline.js` (4921 Zeilen)
**Typ:** ES Module (Node.js)
**Zweck:** Deterministischer Swarm-Orchestrator für die KubeClaw Multi-Agent-Plattform
**Aufrufer:** Nova (Opus-Orchestrator) oder direkt via CLI
**Version:** v8 — Gateway-Tool-API-Migration + Buster-Prompt-Aufbau + Multi-Harness-ACP
**Ort:** `/app/skills/pipeline.js`
**Begleitdateien:** `/app/skills/lint-report.js` (Statische Analyse Aggregator), `/app/skills/redis.js` (Redis Client + Completion Stream)

---

## Inhaltsverzeichnis

1. [Überblick und Designphilosophie](#1-überblick-und-designphilosophie)
2. [Exit-Codes und Status-Modell](#2-exit-codes-und-status-modell)
3. [Konfigurationssystem](#3-konfigurationssystem)
4. [Imports und Abhängigkeiten](#4-imports-und-abhängigkeiten)
5. [Sicherheitsschicht: Sichere Ausführungs-Wrapper](#5-sicherheitsschicht-sichere-ausführungs-wrapper)
6. [Gateway-Tool-API (ACP-Session-Verwaltung)](#6-gateway-tool-api-acp-session-verwaltung)
7. [Pfadvalidierung](#7-pfadvalidierung)
8. [Temp-Verzeichnis-Management](#8-temp-verzeichnis-management)
9. [Kontrolliertes Herunterfahren (Multi-Agent)](#9-kontrolliertes-herunterfahren-multi-agent)
10. [Strukturiertes Logging](#10-strukturiertes-logging)
11. [Konfiguration laden und validieren](#11-konfiguration-laden-und-validieren)
12. [Pfad-Hilfsfunktionen und Model-Auflösung](#12-pfad-hilfsfunktionen-und-model-auflösung)
13. [Status-Management und Git-Integration](#13-status-management-und-git-integration)
14. [Git-Operationen](#14-git-operationen)
15. [Discord-Benachrichtigungen](#15-discord-benachrichtigungen)
16. [Blueprint-Manager](#16-blueprint-manager)
17. [Agent-Dispatch-System (Dual Mode)](#17-agent-dispatch-system-dual-mode)
18. [Session-End-Polling (Forge-Fix-Cycles)](#18-session-end-polling-forge-fix-cycles)
19. [Datei-Leser](#19-datei-leser)
20. [Buster-Prompt-Aufbau](#20-buster-prompt-aufbau)
21. [Qdrant-Memory-Anbindung](#21-qdrant-memory-anbindung)
22. [Polling-System (Konsolidiert)](#22-polling-system-konsolidiert)
23. [Rate-Limit-Handling](#23-rate-limit-handling)
24. [Redis Completion Stream (Buster)](#24-redis-completion-stream-buster)
25. [Git-Sync (Forge → Buster Handoff)](#25-git-sync-forge--buster-handoff)
26. [Dependency-Prüfung (Inhaltsbasiert)](#26-dependency-prüfung-inhaltsbasiert)
27. [Fehlerbehandlung](#27-fehlerbehandlung)
28. [Lint-Report-Integration](#28-lint-report-integration)
29. [Pre-Check (Forge-Output-Validierung)](#29-pre-check-forge-output-validierung)
30. [Forge-Prompt-Zusammenbau](#30-forge-prompt-zusammenbau)
31. [Modul-Ausführung (Stages-basiert)](#31-modul-ausführung-stages-basiert)
32. [Gate-Verteiler](#32-gate-verteiler)
33. [Buster-Gate-Runner (mit Fix-Loop)](#33-buster-gate-runner-mit-fix-loop)
34. [Review-Gate-Runner (Lint-Report + Single Reviewer)](#34-review-gate-runner-lint-report--single-reviewer)
35. [Pipeline-Ausführung](#35-pipeline-ausführung)
36. [Status-Ausgabe und Dry-Run](#36-status-ausgabe-und-dry-run)
37. [CLI-Wrapper und Einstiegspunkt](#37-cli-wrapper-und-einstiegspunkt)
38. [Exports](#38-exports)
39. [Vollständiger Ablaufgraph](#39-vollständiger-ablaufgraph)
40. [Abhängigkeitsgraph der Funktionen](#40-abhängigkeitsgraph-der-funktionen)
41. [Systemübergreifende Architektur](#41-systemübergreifende-architektur)
42. [lint-report.js Referenz](#42-lint-reportjs-referenz)
43. [Changelog v7 → v8](#43-changelog-v7--v8)

---

## 1. Überblick und Designphilosophie

### Kernkonzept

`pipeline.js` ist der deterministische Orchestrator des KubeClaw Swarm. Er wird von Nova aufgerufen, um den Modul-Pipeline-Ablauf autonom abzuwickeln. Auf dem Happy-Path läuft alles automatisch durch. Bei Fehlern wird mit strukturiertem JSON beendet, sodass Nova den Fehler analysieren und einen neuen Anlauf starten kann.

### Kill-and-Respawn-Strategie

Das zentrale Designprinzip ist **Kill-and-Respawn**: Frische Agenten mit besseren Prompts übertreffen verbrauchte Agenten mit verschmutzten Context-Windows. Bei jedem Phasenwechsel oder Fehler wird die Agent-Session zerstört und eine neue gestartet.

### Deklarative Steuerung

`execution_order` in `progress.json` ist die **einzige Wahrheit**. Die Pipeline macht nichts Implizites — kein Gate-Nesting, keine versteckten Trigger. Was in execution_order steht, wird ausgeführt. Was nicht drin steht, existiert nicht. Module `stages` bestimmen welche Phasen laufen (`['forge', 'buster']` Default).

### Agent-Lifecycle

- **PASS** → Agent-Session wird zerstört, neuer Agent für nächstes Modul
- **FAIL** → Agent-Session wird zerstört, Nova analysiert, neuer Agent für Retry
- **TIMEOUT** → Agent-Session wird zerstört, behandelt wie FAIL

### Agent-Git-Entkopplung

Agents kennen Git nicht. Sie schreiben Dateien und fokussieren sich auf ihre Aufgabe. Alles was zwingend nötig ist (commit, push, pull) wird von der Pipeline oder dem Processor-Sidecar erledigt:

| Agent | Git-Verantwortung | Wer commitet | Wer pushed |
|-------|-------------------|-------------|------------|
| Forge (Modul) | Keine | Pipeline (`pollForSessionEnd`) | Pipeline (`gitSyncBeforeBuster`) |
| Forge (Gate-Fix) | Keine | Pipeline (`pollForSessionEnd`) | Pipeline (`gitCommitAndPush`) |
| Echo (Reviewer) | Keine | Pipeline (`_runReviewOnce`) | Pipeline (`gitCommitAndPush`) |
| Buster (Modul) | status.json schreiben | redis.js (`verify-task.js`) | redis.js |
| Buster (Gate) | output_file schreiben | redis.js | redis.js |

Prinzip: Was ein Script deterministisch erledigen kann, darf nicht dem Agent überlassen werden. Agents vergessen Instruktionen; Scripts nicht.

### Aufrufarten

```
node pipeline.js --project kubecommand --repo /workspace/forgestack   # Volle Pipeline (Repo explizit)
node pipeline.js --project kubecommand                    # Volle Pipeline (Repo auto-detect)
node pipeline.js --project kubecommand --module 06        # Einzelmodul
node pipeline.js --project kubecommand --resume           # Fortsetzen
node pipeline.js --project kubecommand --status           # Status-JSON
node pipeline.js --project kubecommand --dry-run          # Vorschau
node pipeline.js --project kubecommand --blueprint 06     # Blueprint releasen
node pipeline.js --project kubecommand --blueprint-list   # Verfügbare Blueprints
node pipeline.js --project kubecommand --prompt "text"    # Nova-Prompt-Override
node pipeline.js --project kubecommand --prompt-file p.md # Nova-Prompt aus Datei
```

---

## 2. Exit-Codes und Status-Modell

### Exit-Codes

| Code | Konstante          | Bedeutung                                        |
|------|--------------------|--------------------------------------------------|
| `0`  | `EXIT_OK`          | Pipeline/Modul erfolgreich abgeschlossen         |
| `1`  | `EXIT_ERROR`       | Konfigurations- oder Systemfehler                |
| `10` | `EXIT_NEEDS_NOVA`  | Modul/Gate fehlgeschlagen, Nova muss analysieren |
| `20` | `EXIT_BLOCKED`     | Max Retries überschritten, Mensch muss eingreifen|
| `30` | `EXIT_TIMEOUT`     | Agent hat nicht innerhalb des Zeitlimits reagiert|
| `40` | `EXIT_RATE_LIMITED` | Rate-Limit-Pausen überschritten                 |

### Status-Enum (Zeile 206)

| Status              | Bedeutung                                                      |
|---------------------|----------------------------------------------------------------|
| `PENDING`           | Modul initialisiert, noch nicht gestartet                      |
| `IN_PROGRESS`       | Forge arbeitet am Modul                                        |
| `READY_FOR_TESTING` | Forge fertig, bereit für Buster                                |
| `TESTING`           | Buster testet das Modul                                        |
| `PASS`              | Alle Tests bestanden                                           |
| `FAIL`              | Phase fehlgeschlagen, Retry möglich                            |
| `BLOCKED`           | Max Retries überschritten, Pipeline gestoppt                   |
| `RATE_LIMITED`      | Upstream-API-Limit erreicht, Pipeline pausiert                 |

---

## 3. Konfigurationssystem

### Drei Quellen

```
/app/config/swarm.config.json              ← Plattform (einmal pro Installation)
<repo>/Projects/<project>/src/.swarm/progress.json  ← Projekt (Single Source of Truth)
Repo Root                                  ← CLI/Env/Auto-detect
```

### Repo-Root-Resolution

Die Pipeline kann von überall gestartet werden (z.B. `/app/skills/`). Repo-Root wird in dieser Reihenfolge aufgelöst:

| Priorität | Quelle | Beispiel |
|-----------|--------|---------|
| 1 | `--repo <path>` CLI-Flag | `--repo /workspace/forgestack` |
| 2 | `REPO_ROOT` Environment | `REPO_ROOT=/workspace/forgestack` |
| 3 | `git rev-parse --show-toplevel` | Auto-detect (nur wenn CWD im Repo) |

Validierung: `.git`-Directory muss existieren, sonst sofortiger Fehler.

### swarm.config.json (Plattform-Level)

Enthält alles was für ALLE Projekte identisch ist:

| Bereich | Felder |
|---------|--------|
| Discord | `discord_webhook_url`, `discord_alerts` |
| Polling | `poll_interval_seconds`, `default_timeout_minutes`, `default_max_fails` |
| Session Nudge | `session_nudge_threshold` (Default: 0.75 = 75% des Timeouts) |
| Retry | `auto_retry_threshold` |
| Rate Limit | `rate_limit.cooldown_hours`, `rate_limit.max_pauses_per_module` |
| Memory | `memory.enabled`, `memory_js_path`, `recall_limit`, `recall_before_forge` (Default: `true`), `feedback_after_outcome` (Guard für feedbackMemory), `targeted_decay_amount` (Default: `0.1`) |
| Agents | `agents.forge`, `agents.buster`, `agents.echo` (Dispatch-Modi) |
| Models | `models.forge`, `models.buster`, `models.echo` (optional — Fallback-Level) |
| Review Defaults | `review_defaults.reviewers`, `timeout_minutes`, `max_fix_cycles`, `lint_tier` |
| Pre-Check | `pre_check.enabled`, `pre_check.lint_report_path`, `pre_check.timeout_seconds`, `pre_check.semgrep_config_path` (optional, Pfad zu custom `.semgrep.yml`) |

Pfad: `SWARM_CONFIG` Env oder `/app/config/swarm.config.json`

**v8-Änderung — `models` ist optional:** `config.models` wird per `??= {}` mit leerem Objekt initialisiert. Model-Resolution passiert zur Laufzeit via `resolveModel()` (Drei-Level-Fallback: explicit override → `progress.models` → `config.models`).

### progress.json (Projekt-Level)

Enthält alles projektspezifische:

| Bereich | Felder |
|---------|--------|
| Identität | `project`, `version` |
| Ablauf | `execution_order`, `phases` |
| Module | `modules` (mit `dir`, `title`, `stages`, `forge_model`, `forge_subagent` (Display-only), `depends_on`, `substeps`, `timeout_minutes`, `max_fails`) |
| Gates | `gates` (mit `type`, `title`, `on_fail`, `on_nogo`, `instructions_file`, `output_file`, `review_name`, `review_output_dir` (Default: `'echo-reviews'`), `model`, `forge_model`, `max_fix_cycles`, `timeout_minutes`, `reviewers`, `lint_tier`) |
| Models | `models.forge`, `models.buster`, `models.echo` (Projekt-Level-Override) |

Pfad: `<repo>/Projects/<project>/src/.swarm/progress.json` (Konvention, nicht konfigurierbar)

### Pfad-Ableitung

Alle Pfade werden aus der Konvention abgeleitet — keine Pfad-Konfiguration:

```
swarm_dir     = <repoRoot>/Projects/<project>/src/.swarm
modules_dir   = <swarm_dir>/modules
progress_file = <swarm_dir>/progress.json
```

### Default-Resolution (null = erbe vom Default)

Review-Gate-Felder mit `null` erben von `swarm.config.review_defaults`:

| Gate-Feld | null → Quelle |
|---|---|
| `reviewers` | `review_defaults.reviewers` |
| `timeout_minutes` | `review_defaults.timeout_minutes` |
| `max_fix_cycles` | `review_defaults.max_fix_cycles` |
| `lint_tier` | `review_defaults.lint_tier` (Default: `"full"`) |

---

## 4. Imports und Abhängigkeiten

**Zeilen 37–41** — Ausschließlich Node.js Built-in Module:

| Import              | Verwendung                                              |
|---------------------|---------------------------------------------------------|
| `execFileSync`      | Shell-lose Ausführung externer Befehle (Sicherheit)     |
| `fs`                | Dateisystem-Operationen (sync)                          |
| `path`              | Pfadauflösung, -zusammensetzung, -normalisierung        |
| `fileURLToPath`     | ESM `import.meta.url` → Dateipfad (CLI-Erkennung)      |
| `os`                | `os.tmpdir()` für Temp-Verzeichnis                      |

---

## 5. Sicherheitsschicht: Sichere Ausführungs-Wrapper

### `gitExec(repoRoot, args, opts)` — Zeile 56

Sicherer Git-Wrapper. Nutzt `-C repoRoot` für Repository-Kontext. Default: `encoding: 'utf8'`, `timeout: 30000`.

### `nodeExec(scriptPath, args, opts)` — Zeile 69

Sicherer Node.js-Script-Wrapper. Für memory.js CLI-Fallback, lint-report.js, und dispatch-Scripts.

### `curlPost(url, jsonPayload, opts)` — Zeile 81

Sicherer Webhook-Wrapper. `stdio: 'ignore'`, `timeout: 10000`. Nur von `discord()` genutzt.

**Kritisch:** `execFileSync` statt `execSync` — übergibt Argumente als Array direkt an den Prozess, ohne Shell. Command Injection ist unmöglich.

**v8-Änderung:** `clawExec` (OpenClaw-CLI-Wrapper) existiert nicht mehr. Alle ACP-Operationen laufen über die Gateway Tool API (Sektion 6).

---

## 6. Gateway-Tool-API (ACP-Session-Verwaltung)

### Architektur (v8-Neu)

ACP Sessions (Forge, Echo) werden über die Gateway Tool API per HTTP verwaltet — **nicht** über CLI-Befehle. Das Gateway ist ein lokaler HTTP-Server, der Session-Lifecycle-Operationen als Tool Invocations bereitstellt.

```
GATEWAY_URL   = http://127.0.0.1:18789/tools/invoke    (Zeile 98)
GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN       (Zeile 99)
```

### `gatewayInvoke(tool, args, timeoutMs)` — Zeile 110

Asynchroner HTTP-POST an die Gateway-Tool-API. Nutzt `fetch()` mit `AbortController` für Timeout. Retourniert geparstes JSON oder `{ raw: text }` bei nicht-parseablem Response.

**Fehlerbehandlung:** Non-2xx → Error mit `httpStatus` und `httpBody` Properties. AbortController-Timeout → Abort-Error.

**Unterstützte Tools:**

| Tool | Beschreibung |
|------|-------------|
| `sessions_spawn` | Startet eine ACP-Session mit `runtime: 'acp'` |
| `sessions_send` | Sendet eine Nachricht (Steer oder `/stop` für Kill) |
| `session_status` | Fragt den Session-Status ab (ACP State Machine) |

### `gatewayKillSync(sessionKey)` — Zeile 234

Synchroner Kill via `execFileSync('curl', ...)` — **ausschließlich** im Shutdown-Handler verwendet. Alle regulären Operationen nutzen async `gatewayInvoke`.

### ACP-Session-Zustandsmaschine

Dokumentierte States aus dem ACP Thread Bound Agents Plan:

```
creating → idle → running → idle
running → cancelling → idle | error
idle → closed
```

- `running`, `creating`, `cancelling` = Session aktiv → Polling fortsetzten
- `idle`, `closed`, `error` = Run beendet → Polling beendet
- Unreachable / Error-Response = Session weg → Polling beendet

Die State Machine wird von `pollForSessionEnd` und `verifyAgentAlive` ausgewertet.

---

## 7. Pfadvalidierung

### `ALLOWED_PATH_PREFIXES` — Zeile 144

```javascript
const ALLOWED_PATH_PREFIXES = ['/app/', '/opt/', '/home/'];
```

### `validateSafePath(filePath, label)` — Zeile 146

Validiert dynamische Script-Pfade (redis_js_path, memory_js_path) gegen die Allowlist. Prüft auf leere Strings und Prefix-Match. `path.resolve()` normalisiert den Pfad (eliminiert alle `..`-Segmente); die Prefix-Allowlist ist die eigentliche Security-Boundary.

---

## 8. Temp-Verzeichnis-Management

### `initTempDir()` — Zeile 169

Erstellt `swarm-pipeline-*` unter `os.tmpdir()`. Registriert `process.on('exit', cleanupTempDir)` für garantiertes Cleanup.

### `cleanupTempDir()` — Zeile 179

Rekursives `fs.rmSync`. Bei Fehler nur Warning, kein Throw.

### `tmpFile(prefix, moduleId, ext)` — Zeile 190

Generiert eindeutige Temp-Dateipfade: `{prefix}-{moduleId}-{ts}-{rand}{ext}`.

---

## 9. Kontrolliertes Herunterfahren (Multi-Agent)

### Architektur (Zeile 223)

**v8-Änderung:** Map-basiertes Tracking (statt Set) — speichert `label → childSessionKey` für Gateway-basiertes Kill:

```javascript
_shutdownState = {
  config: null,
  statusDir: null,              // Module status dir (für FAIL-Markierung)
  activeSessions: new Map(),    // label → childSessionKey (für Gateway kill)
  currentLabel: null,           // Label von setShutdownContext
};
```

### `registerShutdownHooks()` — Zeile 250

SIGTERM/SIGINT Handler: Alle tracked Sessions via `gatewayKillSync(sessionKey)` killen → Status als FAIL markieren → Temp aufräumen → Exit 1. Iteriert `activeSessions.entries()` und überspringt Einträge mit `null` sessionKey (pre-tracked aber Spawn noch nicht completed).

### `trackAgent(config, label, sessionKey)` — Zeile 290

**v8-Signatur:** 3 Parameter (config, label, **sessionKey**). Fügt ein ACP-Session-Label + sessionKey zur Map hinzu. Aufgerufen von `spawnAcpAgent` und `spawnReviewerAgent` nach erfolgreichem Gateway-Spawn.

### `untrackAgent(label)` — Zeile 298

Entfernt ein Label aus der Map. Aufgerufen von `killAcpAgent` und `killReviewerAgent`.

### `setShutdownContext(config, agentType, moduleId, statusDir)` — Zeile 306

Setzt Modul-Kontext (statusDir für FAIL-Markierung). Pre-tracked das Modul-Agent-Label mit `null` sessionKey (wird nach Spawn via `trackAgent` aktualisiert). Nur für ACP-Agents — Redis-Agents werden nicht pre-tracked.

### `clearShutdownContext()` — Zeile 328

Entfernt `currentLabel` aus `activeSessions` (idempotent — safe auch wenn killAgent es bereits entfernt hat) und löscht `statusDir`. Config bleibt erhalten für eventuelle Gate-Agents.

---

## 10. Strukturiertes Logging

### `log(level, msg, data)` — Zeile 348

JSON-Lines auf stderr: `{ ts, level, run_id, module?, phase?, msg, data? }`. Die `RUN_ID` (Zeile 344) korreliert alle Einträge einer Pipeline-Invokation.

### `output(result)` — Zeile 361

Formatiertes JSON auf stdout. Nova parst diesen Output.

---

## 11. Konfiguration laden und validieren

### `loadConfig(projectName, opts)` — Zeile 382

Lädt und mergt swarm.config.json (Plattform) + progress.json (Projekt).

**Ablauf:**
1. Repo-Root via `--repo` Flag / `REPO_ROOT` Env / `git rev-parse --show-toplevel`
2. swarm.config.json laden (`SWARM_CONFIG` env oder `/app/config/swarm.config.json`)
3. Pfade aus Konvention ableiten: `Projects/<project>/src/.swarm/`
4. progress.json laden
5. Merge: swarmConfig (Basis) + project + repo_root + paths
6. Discord-Webhook Fallback: `DISCORD_WEBHOOK` env
7. `validateConfig(config, progress)` → fail-fast
8. Return `{ config, progress }`

### `validateConfig(config, progress)` — Zeile 471

Fail-fast-Validierung beider Quellen:

**Config-Felder:** project, repo_root, paths, agents.forge, agents.buster. Agent dispatch/redis_js_path. **v8-Änderung:** `config.models` wird per `??= {}` optional initialisiert (nicht mehr Required). Buster wird hart auf `dispatch: 'redis'` und `redis_js_path: '/app/skills/redis.js'` gesetzt.

**Defaults:** `poll_interval_seconds: 30`, `default_timeout_minutes: 45`, `default_max_fails: 3`.

**Progress-Felder:** project, execution_order, modules. Gate-Typ-Validierung (`buster` | `review`). on_nogo Enum (`fix_and_continue` | `fix_and_rereview`). on_fail Enum (`fix_and_retest`). Cross-Referenz: execution_order Items müssen in modules oder gates existieren.

**Security:** Dynamische Script-Pfade via `validateSafePath`. `_doc` Felder werden übersprungen.

### `loadProgress(config)` — Zeile 602

Dünner Wrapper für Export-Kompatibilität.

---

## 12. Pfad-Hilfsfunktionen und Model-Auflösung

### Pfad-Funktionen

| Funktion | Zeile | Beschreibung |
|----------|-------|-------------|
| `modulePath(config, dir)` | 608 | `modules_dir + dir` |
| `statusPath(config, dir)` | 609 | `modulePath + status.json` |
| `swarmRoot(config)` | 610 | `config.paths.swarm_dir` |
| `projectSrcPath(config)` | 613 | Parent von swarm_dir (wo Agents Code lesen/schreiben) |
| `relPath(config, absPath)` | 616 | Absolut → Repo-relativ |
| `completionStreamKey(config)` | 619 | `swarm:pipeline:<project>:completions` |

### `resolveModel(agentType, config, progress, override)` — Zeile 635 (v8-Neu)

**Drei-Level-Fallback** für Model-Resolution:

| Priorität | Quelle | Beispiel |
|-----------|--------|---------|
| 1 | Expliziter Override | `mod.forge_model`, `gate.model`, `reviewer.model` |
| 2 | `progress.models.<agent>` | Projekt-Level-Standard in progress.json |
| 3 | `config.models.<agent>` | Plattform-Level-Standard in swarm.config.json |

Wirft Error wenn keine der drei Quellen ein Model liefert. Wird verwendet in: `executeModuleAttempt` (Forge, Buster), `spawnReviewerAgent` (Echo), `runBusterGate` (Buster/Forge-Fix), `runReviewGate` (Forge-Fix).

### `modelToHarness(modelId)` — Zeile 1071 (v8-Neu)

Mappt Model-IDs auf ACP Harness-IDs. Der Harness bestimmt welches Coding-Tool die ACP-Session ausführt (Claude Code, Codex, Gemini CLI, etc.).

| Model-Pattern | Harness |
|---------------|---------|
| `*claude*` | `claude` |
| `*codex*` | `codex` |
| `*gpt*` | `codex` |
| `*gemini*` | `gemini` |
| `*opencode*` | `opencode` |
| `*kimi*` | `kimi` |

Verfügbare acpx Harnesses: `pi`, `claude`, `codex`, `opencode`, `gemini`, `kimi`.

---

## 13. Status-Management und Git-Integration

### `loadStatus(config, dir)` — Zeile 643

Lädt status.json. Bei Parse-Fehler: `null` + Content-Preview (erste 200 Chars) für Diagnose.

**Defensive Defaults:** Mergt `STATUS_DEFAULTS` (`fail_summaries: []`, `fail_count: 0`, `history: []`, `decayed_memory_ids: []`, `cost: {...}`) auf das geparste Objekt. Schützt gegen Agent-Overwrites.

### `saveStatus(config, dir, status)` — Zeile 680

**Atomic Write:** `.tmp` + `fs.renameSync`. Committet via `gitCommitQuiet()`.

### `gitCommitQuiet(config, filePath, message)` — Zeile 693

Leiser Git-Commit. `--allow-empty` entfernt — "nothing to commit" wird still ignoriert (kein leerer Commit, kein Warn-Log). Echte Commit-Fehler: Warning + Discord-Alert (kein Throw). `invalidateHeadHash()` wird nur bei tatsächlichem Commit aufgerufen.

### Git-Hash-Cache (Zeilen 860–880)

`headHash()` cached, `invalidateHeadHash()` nach jeder HEAD-ändernden Operation. Nutzt `_repoRoot` (gesetzt von `loadConfig`), nicht `config`-Parameter.

### `addHistory(status, newStatus, agent, note)` — Zeile 882

History-Eintrag: `{ timestamp, status, agent, note, commit_hash }`.

### `initStatus(moduleId, moduleConfig)` — Zeile 892

Frisches Status-Objekt mit allen Feldern:

```javascript
{
  module_id,                   // String: Modul-ID
  title,                       // String: aus moduleConfig.title
  status: 'PENDING',
  current_phase: null,         // 'forge' | 'buster' | null
  fail_count: 0,
  started_at: null,            // ISO-Timestamp, gesetzt bei erstem Forge-Start
  updated_at: '<now>',
  completed_at: null,          // ISO-Timestamp, gesetzt bei PASS
  substeps: [...] | null,      // Array von { id, title, forge_done: false } wenn moduleConfig.substeps
  history: [{ timestamp, status: 'PENDING', agent: 'pipeline', note: 'Initialized', commit_hash }],
  fail_summaries: [],          // Array von { attempt, timestamp, summary, phase, is_timeout, files_changed }
  completion_summary: null,    // String: Buster-Output bei PASS
  forge_commit_hash: null,     // String: HEAD nach Forge-Sync
  forge_diff_stat: null,       // String: git diff --stat Output
  decayed_memory_ids: [],      // String[]: Qdrant-IDs die bereits decayed wurden
  cost: {                      // Informational — kein Budget-Enforcement
    forge_tokens_in: 0, forge_tokens_out: 0,
    buster_tokens_in: 0, buster_tokens_out: 0,
    total_duration_seconds: 0,
  },
}
```

---

## 14. Git-Operationen

### `_gitPullCore(config, allowDestructiveRecovery)` — Zeile 732

Kern für `git pull --rebase` mit Rebase-Abort-Recovery. Destruktiv (Polling) vs. Throw (vor Push).

### `gitPullForPolling(config)` — Zeile 782 | `gitPullBeforePush(config)` — Zeile 787

### `gitPushWithRetry(config, maxRetries, delayMs)` — Zeile 798

3 Versuche, 5s Delay, 60s Timeout pro Versuch. **Async.**

### `gitCommitAndPush(config, message, opts)` — Zeile 825

Einheitliche Funktion für alle Git-Commit+Push. Optionen: `addPaths`, `captureHash`, `softFail`. Prüft `git status --porcelain` vor Commit (kein leerer Commit). **Async.**

---

## 15. Discord-Benachrichtigungen

### `discord(config, level, title, description, fields)` — Zeile 934

Formatierte Embeds an Discord-Webhook. Komplett in try/catch um URL-Leak zu verhindern. **Async** (nutzt intern synchrones `curlPost`, erlaubt `.catch()` Syntax).

**Bedingung:** Sendet nur wenn `config.discord_webhook_url` gesetzt UND `config.discord_alerts[level]` truthy ist.

**Embed-Aufbau:**

| Feld | Wert |
|------|------|
| title | `{icon} {title}` |
| description | Freitext |
| color | INFO: `0x3498db` (Blau), WARN: `0xe67e22` (Orange), CRITICAL: `0xe74c3c` (Rot), OK: `0x2ecc71` (Grün) |
| fields | Array von `{ name, value, inline: true }` |
| footer | `KubeClaw Pipeline · {project} · {RUN_ID}` |
| timestamp | ISO 8601 |

Icons: INFO: ℹ️, WARN: ⚠️, CRITICAL: 🚨, OK: ✅

---

## 16. Blueprint-Manager

### `listBlueprints(config)` — Zeile 963

### `releaseBlueprint(config, moduleId, moduleDir, stages)` — Zeile 978

Kopiert Blueprint vom Architecture-Branch. **Stage-bewusst:** Verifiziert nur Files die von den konfigurierten Stages benötigt werden. Sicherheitsprüfung: überschreibt keine existierende non-PENDING status.json. **Async.**

---

## 17. Agent-Dispatch-System (Dual Mode)

### Architektur

| Agent-Typ | Dispatch | Lifecycle | Tracking |
|-----------|----------|-----------|----------|
| Forge | ACP (Gateway Tool API) | Pipeline kontrolliert | `trackAgent(label, sessionKey)` / `untrackAgent` |
| Echo/Reviewer | ACP (Gateway Tool API) | Pipeline kontrolliert | `trackAgent(label, sessionKey)` / `untrackAgent` |
| Buster | Redis | Processor kontrolliert | No-Op kill |

### ACP-Dispatch (v8 — via Gateway-Tool-API)

- `acpLabel(agentType, moduleId)` — Zeile 1056: Format `<type>-<moduleId>`
- `modelToHarness(modelId)` — Zeile 1071: Model → ACP-Harness-ID-Zuordnung
- `spawnAcpAgent(config, agentType, moduleId, model, taskPrompt)` — Zeile 1087: Gateway `sessions_spawn` mit `runtime: 'acp'`, `thread: true`, `mode: 'session'`, `cleanup: 'keep'`. Harness-Prio: model-derived → `agentConfig.acp_agent_id` → agentType. Ruft `trackAgent(config, label, childSessionKey)`.
- `killAcpAgent(config, agentType, moduleId)` — Zeile 1125: Gateway `sessions_send` mit `/stop`. Ruft `untrackAgent()`.

### Redis-Dispatch

- `buildBusterPayload(config, progress, moduleId, taskType, taskPrompt, status, opts)` — Zeile 1154: Strukturierter Payload. **Dual Task-Type:** `module_test` und `gate_test`. Nutzt `modelToHarness` für Harness-ID im Session-Objekt.

**`module_test` Payload-Shape:**
```javascript
{
  task_type: 'module_test',
  module, project, commit_hash, timestamp, completion_stream,
  instructions: taskPrompt,
  session: { model, agentId, cwd, timeout_seconds, label: 'buster-test-{moduleId}-{ts}' },
  module_path,        // Repo-relativ
  buster_md_path,     // Repo-relativ
  status_json_path,   // Repo-relativ
}
```

**`gate_test` Payload-Shape:**
```javascript
{
  task_type: 'gate_test',
  module: gateId, project, commit_hash, timestamp, completion_stream,
  instructions: taskPrompt,
  session: { model, agentId, cwd, timeout_seconds, label: 'buster-gate-{gateId}-{ts}' },
  gate_id, gate_title,
  work_dir,           // Repo-relativ (swarm root)
  output_file,        // Repo-relativ
  instructions_file,  // Repo-relativ
}
```
- `dispatchRedisTask(...)` — Zeile 1209: Payload + Script in Temp-Files, `nodeExec`.

### Einheitliche Schnittstelle (Zeile 1256)

| Funktion | ACP-Routing | Redis-Routing |
|----------|------------|---------------|
| `spawnAgent()` | `spawnAcpAgent()` via Gateway | `dispatchRedisTask()` |
| `killAgent()` | `killAcpAgent()` via Gateway `/stop` | No-Op |
| `steerAgent()` | Gateway `sessions_send` (HTTP POST, kein Temp-File) | `dispatchRedisTask(steer)` |

### `verifyAgentAlive(config, agentType, moduleId, waitMs)` — Zeile 1321

Zustandsprüfung nach ACP-Spawn. **Async:** `await sleep(8000)`, dann `gatewayInvoke('session_status', ...)`. Prüft ACP State — Terminal States (`closed`, `error`) = Spawn fehlgeschlagen. Redis: immer true.

### Reviewer-Agenten

- `spawnReviewerAgent(config, progress, gateId, reviewer, instructions)` — Zeile 4003: **v8-Signatur — 5 Parameter** (config, **progress**, gateId, reviewer, instructions). `progress` wird für `resolveModel('echo', config, progress, reviewer.model)` benötigt. Harness-Prio: model-derived → `reviewer.agent_id` → `'claude'` Fallback.
- `killReviewerAgent(config, gateId, reviewer)` — Zeile 4042: Label-Schema `echo-{label}-{gateId}`. Kill via Gateway `sessions_send /stop`.

---

## 18. Session-End-Polling (Forge-Fix-Cycles)

### `pollForSessionEnd(config, sessionLabel, timeoutMinutes, logLabel)` — Zeile 1373

Extrahierte Hilfsfunktion für Forge-Fix-Polling in Gate-Zyklen.

**v8-Änderung — Gateway-basiert:** Pollt via `gatewayInvoke('session_status', { sessionKey })`. Parsed ACP State aus Response (`statusResult?.acp?.state || statusResult?.state`). Bei `cleanup: 'keep'` bleibt die Session-Entry nach Beendigung erhalten — deshalb muss der ACP State geparsed werden, nicht nur Erreichbarkeit geprüft.

**Funktionalität:**
1. Resolved `sessionKey` aus `_shutdownState.activeSessions` via Label
2. Captured `headHash()` vor dem Polling (Fallback für Change-Detection)
3. Pollt Gateway `session_status` bis die Session endet oder Timeout
4. **Zwei-Phasen Change-Detection nach Session-Ende:**
   - Phase 1: `git add -A` → `git status --porcelain` → Pipeline committet uncommitted Agent-Output
   - Phase 2 (Fallback): HEAD-Diff gegen Baseline (für Legacy-Agents die selbst committen)
5. **Crash-Detection:** Session-Ende ohne Änderungen = Agent gecrasht (OOM, API-Error)
6. **Timeout-Nudge:** Bei `session_nudge_threshold` (Default 75%) wird dem Agent ein einmaliger Steer via `gatewayInvoke('sessions_send', ...)` geschickt.

**Rückgabe:** `{ completed: boolean, hasChanges: boolean, reason: string }`

---

## 19. Datei-Leser

- `readForgeInstructions(config, moduleDir, moduleConfig)` — Zeile 1500: Unterstützt `moduleConfig.substeps` — wenn vorhanden, werden FORGE.md Files aus allen Substep-Verzeichnissen zusammengefügt (mit `---` Separator).
- `readBusterInstructions(config, moduleDir)` — Zeile 1518
- `readGateInstructions(config, gate)` — Zeile 1524

---

## 20. Buster-Prompt-Aufbau (v8-Neu)

### Designprinzip

Analoges System zu `buildForgePrompt` — die Pipeline besitzt den vollständigen Prompt. Der Processor ist nur ein Relay. Prompt-Reihenfolge optimiert für LLM-Aufmerksamkeit: Context → Test Workspace → Instructions → Completion Protocol.

### Funktionen

| Funktion | Zeile | Beschreibung |
|----------|-------|-------------|
| `buildTestWorkspaceSection(testWorkspacePath)` | 1550 | Shared Block der dem Agent sagt wo Test-Scripts hingehören (`attempt-N/` Dirs). Read-only-Hint für Application Code. |
| `buildBusterModulePrompt(config, moduleId, mod, dir, status, maxFails)` | 1581 | Kompletter `module_test`-Prompt. Enthält: Context Block (Project, Module, Paths, Attempt, Commit, forge_diff_stat), Test Workspace, BUSTER.md inline, Completion Protocol. Gibt `{ prompt }` oder `{ error }` zurück. |
| `buildBusterGatePrompt(config, gateId, gate, instructions, commitHash, attempt)` | 1648 | Kompletter `gate_test`-Prompt. Struktur analog zu Module-Prompt aber mit Gate-Kontext und Gate-Completion-Protocol. **Achtung Rückgabetyp-Asymmetrie:** Gibt einen rohen `string` zurück (nicht `{ prompt }` wie `buildBusterModulePrompt`), da Instructions bereits als Parameter übergeben werden und kein File-Read fehlschlagen kann. |
| `buildBusterCompletionProtocol(config, moduleId, dir, status)` | 1692 | 3-Step Module-Completion: (1) Update status.json (Read→Modify→Write, nicht Overwrite), (2) Store insights via memory.js, (3) Signal completion via redis.js. |
| `buildBusterGateCompletionProtocol(config, gateId, gate)` | 1744 | 3-Step Gate-Completion: (1) Write output_file as JSON, (2) Store insights, (3) Signal via redis.js. |

### Context Block Felder

| Feld | Module-Prompt | Gate-Prompt |
|------|---------------|-------------|
| Project | ✓ | ✓ |
| Module/Gate + Title | ✓ | ✓ |
| Project Source (relativ) | ✓ | ✓ |
| Module Path (relativ) | ✓ | — |
| Status JSON (relativ) | ✓ | — |
| Repo Root | ✓ | ✓ |
| Working Directory | ✓ | ✓ |
| Attempt | ✓ | ✓ |
| Commit Hash | conditional | conditional |
| forge_diff_stat | conditional | — |

---

## 21. Qdrant-Memory-Anbindung

### Drei Integrationspunkte

1. **VOR FORGE:** `recallForModule()` (Zeile 1851) — Memories in Forge-Prompt injizieren
2. **NACH PASS/FAIL:** `feedbackMemory()` (Zeile 1942) — Confidence-Scores updaten
3. **NACH FAIL:** `decayRecalledMemories()` (Zeile 1993) — Gezieltes Decay der Prompt-Memories

### Interne Helfer

| Funktion | Zeile | Beschreibung |
|----------|-------|-------------|
| `memoryEnabled(config)` | 1812 | Guard: `config.memory?.enabled !== false`. Alle Memory-Funktionen prüfen dies als Erstes. |
| `memoryJsPath(config)` | 1816 | Auflösung + Validierung des memory.js-Pfads: `config.memory?.memory_js_path \|\| '/app/skills/memory.js'` via `validateSafePath`. |
| `getMemoryModule(config)` | 1831 | Cached Dynamic-Import von memory.js. Bei Fehler: `null` → CLI-Fallback. Import wird nur einmal versucht (`_memoryImportAttempted` Flag). |

### Memory-Recall-Formatierung

`recallForModule` formatiert Memories als Markdown-Block mit Confidence-Star-Ratings:

| Confidence | Rating | Bedeutung |
|-----------|--------|-----------|
| ≥ 0.75 | ★★★ | Validiertes Pattern |
| ≥ 0.45 | ★★☆ | Neutral |
| < 0.45 | ★☆☆ | Ungeprüft |

Format pro Memory: `{N}. [{stars} relevance:{score}] {text}\n   _({module} · {agent} · {tags})_`

Prompt-Block-Header: `## 📎 CONTEXT FROM SWARM MEMORY`. Auf Retry: Caveat-Hinweis dass Anti-Patterns Vorrang haben.

Memory-Import: Direct Import bevorzugt (`getMemoryModule()`), CLI-Fallback wenn nötig.

### Konfigurations-Schalter

| Feld | Default | Beschreibung |
|------|---------|-------------|
| `memory.enabled` | `true` (implizit) | Master-Switch für das gesamte Memory-System |
| `memory.recall_before_forge` | `true` (implizit) | Guard für `recallForModule` — wenn `false`, kein Memory-Recall vor Forge |
| `memory.feedback_after_outcome` | — | Guard für `feedbackMemory` — wenn falsy, kein Outcome-Feedback an Qdrant |
| `memory.targeted_decay_amount` | `0.1` | Confidence-Decay pro Erinnerung bei `decayRecalledMemories` |
| `memory.recall_limit` | `5` | Max Memories pro Recall |

### Recall-Abfragestrategie

Natural-Language-Query für Embedding-Suche (statt Keyword-Dump). Auf Retry: Fail-Context wird mitgegeben um die Suche Richtung "Lösung" zu biasieren. Retry-Memories erhalten ein Caveat im Header.

### Gezielter Decay vs. Breites Feedback

| Auslöser | Aktion | Geltungsbereich |
|---------|--------|-------|
| Jeder Fail | `decayRecalledMemories` | Nur die IDs die im Prompt waren |
| Max Fails (BLOCKED) | `feedbackMemory('blocked')` | Alle zum Modul getaggten Memories |
| PASS | `feedbackMemory('pass')` | Alle zum Modul getaggten Memories |

Cross-Run-Protection via `status.decayed_memory_ids` — bereits decayte Memories werden übersprungen.

---

## 22. Polling-System (Konsolidiert)

### Basis-Helfer

| Funktion | Zeile | Beschreibung |
|----------|-------|-------------|
| `sleep(ms)` | 2062 | `new Promise(resolve => setTimeout(resolve, ms))`. Genutzt von allen async Funktionen. |
| `pollResult(ok, reason, status)` | 2076 | Factory für konsistente Rückgabeobjekte. Shape: `{ ok: boolean, reason: string, status: object\|null }`. `ok=true` = terminaler Status erreicht (nicht zwingend PASS). |

### Architektur

**Alle Poller bauen auf `pollGeneric` auf.** pollStatus und pollDual sind checkFn-Callbacks statt eigenständige Loops.

```
pollGeneric(config, checkFn, timeoutMinutes, label)   ← Gemeinsame Basis
  ├── pollForFile(...)     → checkFn prüft fs.existsSync
  ├── pollStatus(...)      → checkFn prüft loadStatus + expectedStatuses
  └── pollDual(...)        → checkFn prüft Redis + Git parallel
```

### `pollGeneric(config, checkFn, timeoutMinutes, label)` — Zeile 2094

Gemeinsame Basis. Übernimmt: Deadline-Loop, sleep, `gitPullForPolling`, Parse-Corruption-Tracking. Rate-Limits an Caller zurückgegeben.

**PollResult-Semantik:** `ok=true` bedeutet "ein terminaler Status wurde erreicht" — NICHT "Modul bestanden". Reason-Enum: `target_reached`, `gate_fail`, `timeout`, `blocked`, `rate_limited`, `rate_limit_exhausted`, `parse_corrupted`, `spawn_failed`.

**checkFn-Protokoll** (jeder Poller implementiert dies):

| Rückgabe | Bedeutung |
|----------|-----------|
| `{ done: true, result: PollResult }` | Terminal — sofort zurückgeben |
| `{ done: false, logMsg?: string }` | Weiter pollen |
| `{ rate_limited: true, status }` | Rate-Limit erkannt — an Caller delegieren |
| `{ parse_error: true }` | Korrupten Counter inkrementieren (max 10) |

### `pollForFile(config, filePath, timeoutMinutes, label)` — Zeile 2151

Prüft `fs.existsSync(filePath)` pro Zyklus. Genutzt von `_runReviewOnce` (Reviewer-Output-File). Gibt `pollResult(true, 'target_reached', { file })` bei Fund zurück.

### `pollStatus(config, moduleDir, expectedStatuses, timeoutMinutes)` — Zeile 2164

Liest `loadStatus()` und prüft ob `status.status` in `expectedStatuses` enthalten ist. Behandelt: BLOCKED → `pollResult(false, 'blocked')`, RATE_LIMITED → an Caller. Parse-Fehler bei existierender Datei → `parse_error`. Genutzt für die **Forge-Phase**.

### `pollDual(config, moduleDir, moduleId, expectedStatuses, timeoutMinutes)` — Zeile 2369

Prüft **zwei Kanäle** parallel pro Zyklus:

1. **Channel 1 (Redis, schnell):** `readCompletionFromRedis()` → `mapRedisStatus()`. Erste Antwort in Sekunden.
2. **Channel 2 (Git, Fallback):** `loadStatus()` wie `pollStatus`. `gitPullForPolling` wird von `pollGeneric` bereits aufgerufen.

Erster Kanal mit terminalem Status gewinnt. Genutzt für die **Buster-Phase**. Redis-Ergebnisse enthalten `_source: 'redis'`, Git-Ergebnisse `_source: 'git'`.

### Rate-Limit-Wiederherstellung (Vereinheitlicht)

### `withRateLimitRecovery(config, moduleDir, pollFn)` — Zeile 2198

Generischer Rate-Limit-Recovery-Wrapper. Akzeptiert eine beliebige `pollFn` (zero-arg async).

### `pollWithRateLimitRecovery(...)` — Zeile 2225

Zwei-Zeilen-Wrapper: `withRateLimitRecovery(config, moduleDir, () => pollStatus(...))`.

### `pollDualWithRateLimitRecovery(...)` — Zeile 2231

Zwei-Zeilen-Wrapper: `withRateLimitRecovery(config, moduleDir, () => pollDual(...))`.

---

## 23. Rate-Limit-Handling

### `handleRateLimit(...)` — Zeile 2243

Cooldown → Discord-Alert → Sleep → Fresh Status → Phase wiederherstellen. Mutiert den Status des Callers **nicht**. Liest frischen Status von Disk.

### Gate-Level Rate-Limit-Behandlung (Inline)

Gates implementieren eigenen inline Rate-Limit-Handler: Sleep → Discord → `attempt--` (Rate-Limit zählt nicht als Fix-Attempt) → Continue.

---

## 24. Redis Completion Stream (Buster)

```
Active:  swarm:pipeline:<project>:completions       ← aktuelle Entries
Archive: swarm:pipeline:<project>:completions:log   ← verarbeitete Entries
```

### Direkter Import von redis.js

Pipeline importiert `redis.js` direkt via `getRedisModule(config)` (Zeile 2304, cached). Bei Import-Fehler: Graceful Degradation auf Git-only-Polling.

### Konstanten

| Konstante | Wert | Beschreibung |
|-----------|------|-------------|
| `COMPLETION_ARCHIVE_MAX_LEN` | `1000` | Maximale Anzahl Entries im Archive-Stream. `archiveCompletions` trimmt auf diesen Wert. |

### Pipeline-Funktionen

- `getRedisModule(config)` — Gecachter Direktimport. Löst Pfad aus erstem Redis-Dispatch-Agent auf.
- `archiveModuleCompletions(config, moduleId)` — VOR jedem Buster-Dispatch. Verschiebt alte Entries für dieses Modul vom Active- in den Archive-Stream, trimmt Archive auf `COMPLETION_ARCHIVE_MAX_LEN`. **Async.**
- `readCompletionFromRedis(config, moduleId)` — Neueste Completion lesen. **Async.**
- `mapRedisStatus(redisStatus)` — PASS→PASS, FAIL→FAIL, ISSUES_FOUND→FAIL.

---

## 25. Git-Sync (Forge → Buster Handoff)

### `gitSyncBeforeBuster(config, moduleDir, status)` — Zeile 2438

`gitCommitAndPush()` mit `captureHash: true`. Zeichnet `forge_commit_hash` in Status auf. Captured `forge_diff_stat` via `git diff --stat HEAD~1 HEAD`.

---

## 26. Dependency-Prüfung (Inhaltsbasiert)

### `checkDependencies(config, progress, moduleId)` — Zeile 2480

Prüft Gate-Dependencies und Modul-Dependencies. **Inhaltsbasiert:** Output-File-Status wird geprüft. `mod.depends_on || []` Guard verhindert Crash bei fehlendem Feld.

---

## 27. Fehlerbehandlung

### `extractAgentFailReason(status, phase)` — Zeile 2554

Extrahiert Agent-Failure-Reason. Priorität: Agent-History-Entry (nicht `pipeline`) → `completion_summary` → generischer Fallback.

### `handleFail(...)` — Zeile 2567

**fail_count++** (unconditional) → Fail-Summary → Targeted Memory-Decay → Broad Feedback (nur bei BLOCKED) → Status-Update → Auto-Retry-Entscheidung → Eskalation.

Auto-Retry vs. Eskalation: `fail_count <= auto_retry_threshold` (Default: 2) UND kein Timeout → `_retry: true`, sonst `EXIT_NEEDS_NOVA` oder `EXIT_TIMEOUT`.

**Rückgabe bei Auto-Retry:**
```javascript
{ _retry: true, module, module_dir, fail_count, max_fails, last_fail }
```

**Rückgabe bei BLOCKED (`fail_count >= maxFails`):**
```javascript
{ exit: EXIT_BLOCKED, reason, module, status }
```

**Rückgabe bei Eskalation:** Delegiert an `buildNovaEscalation()`.

### `buildNovaEscalation(...)` — Zeile 2695

Vollständiges Context-Paket für Nova:

```javascript
{
  exit: EXIT_NEEDS_NOVA | EXIT_TIMEOUT,
  module, module_dir, is_timeout,
  reason,                          // Menschenlesbarer Grund
  fail_count, max_fails,
  auto_retry_threshold,
  remaining_attempts,
  fail_history: [{                 // ALLE Failures, nicht nur der letzte
    attempt, phase, summary, is_timeout, files_changed, timestamp
  }],
  last_fail,                       // Letzter fail_summaries Eintrag
  module_status: {                 // Snapshot des aktuellen Modul-Status
    status, current_phase, started_at, forge_commit_hash, cost
  },
  resume_command,                  // Expliziter CLI-Befehl für Nova
}
```

---

## 28. Lint-Report-Integration

### `generateLintReport(config, tier, opts)` — Zeile 2764

Gemeinsamer Kern. Unterstützt `--semgrep-config` wenn `config.pre_check.semgrep_config_path` gesetzt. Returns `{ report, error }`.

### `formatLintErrors(report)` — Zeile 2834

Anti-Pattern-Formatter. Gekappt bei 20 pro Tool.

### `formatLintReportForReviewer(report)` — Zeile 2856

Reviewer-Prompt-Block. Icons (✅ 🔴 🟡 ❌), gekappt bei 30 pro Tool.

---

## 29. Pre-Check (Forge-Output-Validierung)

### `runPreCheck(config, moduleDir, status, moduleId)` — Zeile 2917

Schnelle statische Analyse. Notausschalter: `config.pre_check.enabled = false`. Returns `{ passed, report, error }`.

---

## 30. Forge-Prompt-Zusammenbau

### `buildForgePrompt(config, moduleId, mod, dir, status, maxFails, novaPrompt)` — Zeile 2963

**Text-Reihenfolge** (optimiert für "Lost in the Middle"-Effekt):
```
Context Block → Priority Header → Nova Directive → FORGE.md → Anti-Patterns → Memory Context
```

Context Block steht vor dem Priority-Header weil er faktueller Kontext ist (keine Instruktion). Anti-Patterns stehen nahe am Ende (Recency-Bias).

**v8-Neu — Project Source Path:** Context Block enthält `Project Source` (von `projectSrcPath`) und instruiert `cd` dorthin.

**v8-Neu — `async`:** buildForgePrompt ist jetzt async (wegen `recallForModule`). Returns `{ prompt, recalledMemoryIds }`.

---

## 31. Modul-Ausführung (Stages-basiert)

### `runModule(config, progress, moduleId, opts)` — Zeile 3115

Retry-Loop um `executeModuleAttempt()`. Dependencies einmal geprüft.

### `executeModuleAttempt(...)` — Zeile 3161

**Stages:** `['forge', 'buster']` Default. Kontrolliert welche Phasen laufen.

**Forge Phase:** `buildForgePrompt` → `spawnAgent('forge')` → `verifyAgentAlive` → `pollWithRateLimitRecovery` → `killAgent('forge')`. Model via `resolveModel('forge', config, progress, mod.forge_model)`.

**Forge-Only Pass:** Wenn `'buster' ∉ stages` und Status ist READY_FOR_TESTING → direkt PASS.

**Buster-Only Promotion:** Wenn `'forge' ∉ stages` → PENDING/FAIL → READY_FOR_TESTING.

**Pre-Check:** Nur wenn forge + buster in stages und Forge gelaufen ist.

**Buster Phase:** `buildBusterModulePrompt` → `archiveModuleCompletions` → `spawnAgent('buster')` → `pollDualWithRateLimitRecovery` → `killAgent('buster')`. Model via `resolveModel('buster', config, progress)`.

---

## 32. Gate-Verteiler

### `runGate(config, progress, gateId)` — Zeile 4598

Routet nach `gate.type`:

| Type | Runner | Beschreibung |
|------|--------|-------------|
| `buster` | `runBusterGate()` | Einzelner Buster-Agent mit optionalem Fix-Loop |
| `review` | `runReviewGate()` | Einzelner Reviewer mit Lint-Report und Fix-Lifecycle |

---

## 33. Buster-Gate-Runner (mit Fix-Loop)

### `gateStatusPath(config, gateId)` — Zeile 3555

Baut den Pfad für die Gate-Status-Datei: `<swarm_dir>/<gateId>-gate-status.json`. Genutzt als sekundäres Completion-Signal in `_runBusterGateOnce`, `runBusterGate`, `findNextStep`, und `checkDependencies`.

### `_runBusterGateOnce(...)` — Zeile 3564

Einzelversuch: `buildBusterGatePrompt` → spawn (mit `taskType: 'gate_test'`) → `pollGeneric` → kill → PollResult.

### `runBusterGate(config, progress, gateId)` — Zeile 3716

**Bereits-abgeschlossen-Prüfung:** Inhaltsbasiert + Fallback auf gate-status.json.

**Bereinigung veralteter Ausgaben:** Nach dem Already-Completed-Check werden `output_file` und `gate-status.json` gelöscht.

**Fix-Loop:** `on_fail === 'fix_and_retest'` → extractGateIssues → `buildGateFixPrompt` (mit `fixHistory` Anti-Patterns) → Forge fix via `pollForSessionEnd` → hasChanges check → git sync → Cleanup output → Retest.

### `extractGateIssues(gateResult)` — Zeile 3635

Extrahiert fixierbare Issues aus dem Buster-Gate-Ergebnis. Zwei Formate:

**Strukturiert:** `gateResult.status.issues[]` → filtert nach `severity: 'critical' | 'moderate'`
```javascript
[{ title, description, affected_module, affected_files: [], severity, reproduction }]
```

**Flat-Fallback:** `gateResult.status.reason || summary` →
```javascript
[{ title: 'Gate test failure', description: reason, severity: 'unknown', affected_files: [] }]
```

### `buildGateFixPrompt(config, gate, issues, attempt, maxAttempts, fixHistory)` — Zeile 3661

Context-Header (Project, Project Source, Working Directory, Repo Root) + Anti-Pattern-Block aus fixHistory.

---

## 34. Review-Gate-Runner (Lint-Report + Single Reviewer)

### Hilfsfunktionen

### `resolveReviewConfig(config, gate)` — Zeile 3958

Mergt Gate-Level-Overrides mit Plattform-Defaults. Rückgabe:

```javascript
{ reviewers: [], timeout: number, maxFixCycles: number, lintTier: 'full' | 'pre-check' }
```

Quellen: `gate.reviewers ?? review_defaults.reviewers`, etc.

### `reviewOutputPath(config, gate, reviewerLabel)` — Zeile 3973

Baut den Pfad für das Output-JSON eines Reviewers. Pattern:
```
<swarm_dir>/<review_output_dir>/<reviewerLabel>-<review_name>.json
```
Beispiel: `.swarm/echo-reviews/echo-opus-MIDPOINT-REVIEW.json`. `review_output_dir` Default: `'echo-reviews'`.

### `extractReviewIssues(mergedResult)` — Zeile 4225

Extrahiert kritische Issues aus dem Review-JSON für Forge-Fixes. Sucht in `critical_issues[]` und `critical_blockers[]`:

```javascript
[{ module, location, description, recommended_fix }]
```

### `buildReviewFixPrompt(config, gate, issues, attempt, maxAttempts, fixHistory)` — Zeile 4249

Baut einen Forge-Prompt für Review-Fix-Zyklen. Struktur analog zu `buildGateFixPrompt`:

1. **Context-Header:** Project, Project Source, Working Directory, Repo Root
2. **Anti-Patterns:** `fixHistory[]` mit `{ attempt, hasChanges, issues }` pro vorherigem Versuch
3. **Issue-Blöcke:** Pro Issue: Description, Module, Location, Recommended Fix

### `cleanupReviewFiles(config, gate, reviewers)` — Zeile 4303

Löscht alle Reviewer-Output-Files (via `reviewOutputPath`) UND das Gate-Output-File (`gate.output_file`). Wird vor `_runReviewOnce` in `fix_and_rereview`-Zyklen aufgerufen, damit frische Reviews geschrieben werden.

### Architektur

```
_runReviewOnce():
  1. generateLintReport(tier: full)  ← Deterministische Tool-Findings
  2. readGateInstructions()           ← Review-Instructions
  3. Build Reviewer-Prompt:           ← Context + Instructions + Lint-Report + Output-Schema
  4. Stale-Output-Cleanup             ← v7-Fix K3
  5. spawnReviewerAgent() × 1         ← Single Reviewer (nicht N parallel)
  6. pollForFile()                    ← Ein Output-File
  7. killReviewerAgent()
  8. gitCommitAndPush()
  9. Parse Review JSON                ← GO / NO-GO + critical_issues
```

### Fix-Lebenszyklen

#### `fix_and_continue` (Midpoint-Review)

Forge-Fix nutzt `pollForSessionEnd()` mit `hasChanges`-Check. Fix-History-Tracking. Nach Fix: GO-Status-File schreiben → Pipeline fährt fort.

#### `fix_and_rereview` (Final-Review)

Forge-Fix → `cleanupReviewFiles` → `_runReviewOnce` (frischer Lint-Report + frisches Review). Bei Exhaustion: `EXIT_NEEDS_NOVA`.

---

## 35. Pipeline-Ausführung

### `findNextStep(config, progress)` — Zeile 4616

Iteriert `execution_order`. Inhaltsbasiert Gate-Check + Fallback auf `gateStatusPath()`.

### `runPipeline(config, progress, opts)` — Zeile 4672

Hauptschleife: `findNextStep()` → `runGate()` oder `runModule()`. Enriched Pipeline-Start-Discord mit Pending/Total counts.

---

## 36. Status-Ausgabe und Dry-Run

### `printStatus(config, progress)` — Zeile 4770

Status-JSON aller Module + Gates.

### `dryRun(config, progress)` — Zeile 4792

Ausführungsplan ohne Agenten zu spawnen. Nutzt `resolveModel` für Model-Anzeige mit Drei-Level-Fallback.

---

## 37. CLI-Wrapper und Einstiegspunkt

Zeile 4831+. Manuelles Argument-Parsing. Environment-Fallbacks: `CURRENT_PROJECT`, `REPO_ROOT`.

**Einstiegs-Erkennung:** Das Script erkennt ob es direkt ausgeführt (`node pipeline.js`) oder importiert (`import { runPipeline } from './pipeline.js'`) wird via Vergleich von `fs.realpathSync(fileURLToPath(import.meta.url))` mit `fs.realpathSync(process.argv[1])`. Der CLI-Block läuft nur bei Direktausführung.

**Ablauf:**
```
1. initTempDir() + registerShutdownHooks()
2. const { config, progress } = loadConfig(flags.project, { repoRoot: flags.repo })
3. Blueprint-Commands (exit early)
4. Status/Dry-Run (exit early)
5. Nova-Prompt aus --prompt oder --prompt-file auflösen
6. runPipeline() → Cleanup → Exit
```

**CLI-Flags:**

| Flag | Beschreibung |
|------|-------------|
| `--project <n>` | Projektname (oder `CURRENT_PROJECT` env) |
| `--repo <path>` | Git Repo Root (oder `REPO_ROOT` env) |
| `--module <id>` | Einzelmodul ausführen |
| `--resume` | Pipeline fortsetzen |
| `--prompt "text"` | Nova-Prompt-Override |
| `--prompt-file <path>` | Nova-Prompt aus Datei laden (v8-Neu) |
| `--status` | Status-JSON ausgeben |
| `--dry-run` | Ausführungsplan ohne Agenten |
| `--blueprint <id>` | Blueprint releasen |
| `--blueprint-list` | Verfügbare Blueprints |
| `--help` | Hilfe-Text |

---

## 38. Exports

```javascript
export {
  loadConfig, loadProgress, loadStatus, saveStatus,
  releaseBlueprint, listBlueprints,
  spawnAgent, killAgent, steerAgent, verifyAgentAlive, modelToHarness,
  spawnAcpAgent, killAcpAgent, dispatchRedisTask,
  recallForModule, feedbackMemory, decayRecalledMemories,
  buildForgePrompt, buildBusterModulePrompt, buildBusterGatePrompt,
  executeModuleAttempt, runPreCheck, generateLintReport, formatLintReportForReviewer,
  runModule, runGate, runBusterGate, runReviewGate, runPipeline,
  printStatus, gitSyncBeforeBuster, gitPullForPolling, gitPullBeforePush, gitPushWithRetry, gitCommitAndPush,
  pollStatus, pollWithRateLimitRecovery, pollDual, pollDualWithRateLimitRecovery, pollGeneric, pollForFile,
  handleRateLimit, completionStreamKey, archiveModuleCompletions,
  STATUS, EXIT_OK, EXIT_ERROR, EXIT_NEEDS_NOVA, EXIT_BLOCKED, EXIT_TIMEOUT, EXIT_RATE_LIMITED,
};

export default runPipeline;
```

**v8-Änderungen gegenüber v7:**
- **Neu exportiert:** `modelToHarness`, `buildBusterModulePrompt`, `buildBusterGatePrompt`
- **Entfernt:** `pollForAllFiles` (Funktion und Export entfernt — Dead Code)

---

## 39. Vollständiger Ablaufgraph

### Erfolgsfall

```
CLI Entrypoint
  │
  ├─ initTempDir() + registerShutdownHooks()
  ├─ const { config, progress } = loadConfig(projectName, { repoRoot })
  │
  └─ runPipeline()
       │
       └─ LOOP: findNextStep()  (inhaltsbasiert gate checks + gate-status.json fallback)
            │
            ├─ type: 'gate' (buster)
            │   └─ runBusterGate()
            │       ├─ _runBusterGateOnce()
            │       │   ├─ buildBusterGatePrompt()
            │       │   ├─ spawnAgent('buster', gate_test) → Redis
            │       │   ├─ pollGeneric (output_file + gate-status.json)
            │       │   ├─ killAgent('buster')
            │       │   → PASS → done
            │       │   → rate_limited → inline cooldown, attempt--, continue
            │       └─ on_fail: fix_and_retest
            │           ├─ extractGateIssues()
            │           ├─ buildGateFixPrompt(config, fixHistory)
            │           ├─ Forge fix → spawnAgent → verifyAgentAlive
            │           │   → pollForSessionEnd(Gateway) → hasChanges check
            │           ├─ killAgent → gitCommitAndPush → Cleanup output
            │           └─ retest loop
            │
            ├─ type: 'gate' (review)
            │   └─ runReviewGate()
            │       ├─ resolveReviewConfig() (incl. lintTier)
            │       ├─ _runReviewOnce()
            │       │   ├─ generateLintReport(tier: full)
            │       │   ├─ formatLintReportForReviewer()
            │       │   ├─ Stale-output cleanup
            │       │   ├─ spawnReviewerAgent(config, progress, ...) × 1
            │       │   ├─ pollForFile()
            │       │   ├─ killReviewerAgent()
            │       │   └─ Parse review JSON → GO / NO-GO
            │       │
            │       ├─ on_nogo: fix_and_continue
            │       │   └─ Forge fix → pollForSessionEnd() → hasChanges check
            │       │      → write GO file → continue
            │       │
            │       └─ on_nogo: fix_and_rereview
            │           └─ Forge fix → pollForSessionEnd() → hasChanges check
            │              → cleanupReviewFiles → _runReviewOnce (fresh) → loop
            │
            ├─ type: 'module'
            │   └─ runModule()
            │       ├─ checkDependencies()
            │       ├─ corrupt status.json check (EXIT_ERROR)
            │       └─ RETRY LOOP: executeModuleAttempt()
            │           │
            │           ├─ stages = mod.stages || ['forge', 'buster']
            │           │
            │           ├─ FORGE PHASE (if 'forge' in stages)
            │           │   ├─ resolveModel('forge', config, progress, mod.forge_model)
            │           │   ├─ buildForgePrompt() (Nova → FORGE.md → Anti-Patterns → Memory)
            │           │   ├─ spawnAgent('forge') → ACP via Gateway
            │           │   ├─ verifyAgentAlive() (Gateway session_status)
            │           │   ├─ pollWithRateLimitRecovery() → pollStatus → pollGeneric
            │           │   └─ killAgent('forge') → Gateway /stop
            │           │
            │           ├─ FORGE-ONLY PASS (if 'buster' ∉ stages)
            │           │   └─ gitCommitAndPush → PASS
            │           │
            │           ├─ BUSTER-ONLY PROMOTION (if 'forge' ∉ stages)
            │           │   └─ PENDING → READY_FOR_TESTING
            │           │
            │           ├─ PRE-CHECK (if 'forge' + 'buster' in stages)
            │           │   └─ runPreCheck() → generateLintReport(tier: pre-check)
            │           │       → PASS → continue to GIT SYNC
            │           │       → FAIL → handleFail(phase: 'pre_check') → Forge retry
            │           │       → TOOL CRASH → skip, continue to GIT SYNC
            │           │
            │           ├─ GIT SYNC (if 'buster' in stages)
            │           │   └─ gitSyncBeforeBuster() + forge_diff_stat capture
            │           │
            │           └─ BUSTER PHASE (if 'buster' in stages)
            │               ├─ resolveModel('buster', config, progress)
            │               ├─ buildBusterModulePrompt()
            │               ├─ archiveModuleCompletions()
            │               ├─ spawnAgent('buster') → Redis (module_test)
            │               ├─ pollDualWithRateLimitRecovery() → pollDual → pollGeneric
            │               └─ killAgent('buster')
            │
            └─ type: 'done' → Discord "Pipeline Complete" → EXIT_OK
               (non-OK exit → Discord "Pipeline halted" with exit code label)
```

---

## 40. Abhängigkeitsgraph der Funktionen

### Aufrufe (pro Funktion → ruft auf)

| Funktion | Ruft auf |
|----------|----------|
| `loadConfig` | `execFileSync`, `validateConfig` |
| `validateConfig` | `validateSafePath` |
| `saveStatus` | `fs.writeFileSync` (tmp), `fs.renameSync` (atomic), `gitCommitQuiet` |
| `gitCommitAndPush` | `gitExec(add, status, commit)`, `invalidateHeadHash`, `gitPullBeforePush`, `gitPushWithRetry` |
| `releaseBlueprint` | `gitExec(cat-file, checkout)`, `gitCommitAndPush` |
| `spawnAcpAgent` | `modelToHarness`, `gatewayInvoke('sessions_spawn')`, `trackAgent` |
| `killAcpAgent` | `gatewayInvoke('sessions_send', /stop)`, `untrackAgent` |
| `spawnReviewerAgent` | `resolveModel`, `modelToHarness`, `gatewayInvoke('sessions_spawn')`, `trackAgent` |
| `killReviewerAgent` | `gatewayInvoke('sessions_send', /stop)`, `untrackAgent` |
| `buildBusterPayload` | `completionStreamKey`, `modelToHarness`, `relPath`, `modulePath`, `gateStatusPath` |
| `buildBusterModulePrompt` | `readBusterInstructions`, `buildTestWorkspaceSection`, `buildBusterCompletionProtocol`, `relPath`, `projectSrcPath` |
| `buildBusterGatePrompt` | `buildTestWorkspaceSection`, `buildBusterGateCompletionProtocol`, `relPath`, `projectSrcPath` |
| `pollGeneric` | `sleep`, `gitPullForPolling` |
| `pollStatus` | `pollGeneric`, `loadStatus` |
| `pollDual` | `pollGeneric`, `readCompletionFromRedis`, `loadStatus`, `mapRedisStatus` |
| `withRateLimitRecovery` | `handleRateLimit` |
| `pollForSessionEnd` | `sleep`, `gitPullForPolling`, `gatewayInvoke('session_status')`, `gatewayInvoke('sessions_send')`, `headHash`, `invalidateHeadHash`, `gitExec(add, status, commit)` |
| `verifyAgentAlive` | `sleep`, `gatewayInvoke('session_status')` |
| `steerAgent` (ACP) | `gatewayInvoke('sessions_send')` |
| `handleFail` | `decayRecalledMemories`, `feedbackMemory`, `saveStatus`, `discord`, `buildNovaEscalation` |
| `buildForgePrompt` | `readForgeInstructions`, `recallForModule`, `relPath`, `modulePath`, `statusPath`, `projectSrcPath` |
| `resolveModel` | — (pure lookup) |
| `modelToHarness` | — (pure mapper) |
| `executeModuleAttempt` | `releaseBlueprint`, `buildForgePrompt`, `buildBusterModulePrompt`, `resolveModel`, `spawnAgent`, `verifyAgentAlive`, `pollWithRateLimitRecovery`, `runPreCheck`, `archiveModuleCompletions`, `gitSyncBeforeBuster`, `pollDualWithRateLimitRecovery`, `handleFail`, `feedbackMemory`, `killAgent`, `gitCommitAndPush` |
| `generateLintReport` | `validateSafePath`, `nodeExec`, `tmpFile`, `relPath`, `modulePath` |
| `formatLintErrors` | — (pure formatter) |
| `formatLintReportForReviewer` | — (pure formatter) |
| `runPreCheck` | `generateLintReport`, `formatLintErrors` |
| `_runBusterGateOnce` | `buildBusterGatePrompt`, `spawnAgent` (gate_test), `pollGeneric`, `killAgent`, `headHash` |
| `runBusterGate` | `_runBusterGateOnce`, `resolveModel`, `extractGateIssues`, `buildGateFixPrompt`, `spawnAgent`, `verifyAgentAlive`, `pollForSessionEnd`, `killAgent`, `gitCommitAndPush`, `gateStatusPath`, `discord` |
| `_runReviewOnce` | `generateLintReport`, `formatLintReportForReviewer`, `readGateInstructions`, `reviewOutputPath`, `spawnReviewerAgent`, `pollForFile`, `killReviewerAgent`, `gitCommitAndPush` |
| `runReviewGate` | `resolveReviewConfig`, `_runReviewOnce`, `resolveModel`, `extractReviewIssues`, `buildReviewFixPrompt`, `cleanupReviewFiles`, `spawnAgent`, `verifyAgentAlive`, `pollForSessionEnd`, `killAgent`, `gitCommitAndPush`, `discord` |
| `runGate` | `runBusterGate`, `runReviewGate` |
| `runPipeline` | `findNextStep`, `runModule`, `runGate`, `discord` |
| `findNextStep` | `loadStatus`, `gateStatusPath` |

### Globaler Zustand

| Variable | Gesetzt durch | Genutzt durch |
|----------|---------------|---------------|
| `_tmpDir` | `initTempDir()` | `tmpFile()`, `cleanupTempDir()`, `process.on('exit')` |
| `_shutdownState` | `trackAgent`, `untrackAgent`, `setShutdownContext`, `clearShutdownContext` | Shutdown-Handler, `pollForSessionEnd`, `killAcpAgent`, `steerAgent`, `verifyAgentAlive` |
| `RUN_ID` | Initialisierung (const) | `log()`, `discord()` |
| `LOG_MODULE` / `LOG_PHASE` | `runModule()`, `executeModuleAttempt()` | `log()` |
| `_headHashCache` / `_repoRoot` | `loadConfig()`, `headHash()` | `headHash()`, `gitExec` |
| `_memoryModule` | `getMemoryModule()` | Memory-Funktionen |
| `_redisModule` | `getRedisModule()` | `readCompletionFromRedis`, `archiveModuleCompletions` |
| `GATEWAY_URL` / `GATEWAY_TOKEN` | Konstanten (Zeile 98-99) | `gatewayInvoke`, `gatewayKillSync` |

---

## 41. Systemübergreifende Architektur

### Betroffene Dateien

| Datei | Rolle | Version |
|-------|-------|---------|
| `pipeline.js` | Orchestrator (in Nova) | v8 (4921 Zeilen) |
| `lint-report.js` | Statische Analyse Aggregator | v1 (1099 Zeilen) |
| `.semgrep.yml` | Curated Semgrep Rules | v1 |
| `swarm.config.json` | Plattform-Config | v2 (pre_check + lint_tier) |
| `progress.json` | Projekt-Config | v1 |
| `buster-processor.cjs` | Buster Sidecar (spawnt Subagents) | v6.0 |
| `redis.js` | Redis Client + Completion Stream (v7: Direct-Import von Pipeline) | v2 |
| `verify-task.js` | Agent-Scope-Firewall + Push-Gate | v2 |

### Redis Streams

| Stream | Richtung | Zweck |
|--------|----------|-------|
| `swarm:buster:tasks` | Pipeline → Processor | Task-Dispatch |
| `swarm:pipeline:<project>:completions` | Subagent → Pipeline | Completion-Signal |
| `swarm:pipeline:<project>:completions:log` | Archiv | Alte Completions |

### Dateinamens-Konvention (Review-Gates)

```
.swarm/echo-reviews/
├── MIDPOINT-REVIEW-INSTRUCTIONS.md        ← Input (Architecture Branch)
├── echo-opus-MIDPOINT-REVIEW.json         ← Reviewer Output (single reviewer)
└── MIDPOINT-REVIEW.json                   ← Gate Output (copy of reviewer output)
```

Pattern: `{reviewer.label}-{gate.review_name}.json`

---

## 42. lint-report.js Referenz

### Tool-Verzeichnis (14 Tools, 2 Stufen)

| Tool | Binary | Sprache | Tier | Erkennung |
|------|--------|---------|------|-----------|
| tsc | `tsc` | TS | pre-check | `tsconfig.json` |
| ruff | `ruff` | Python | pre-check | `pyproject.toml` / `requirements.txt` |
| shellcheck | `shellcheck` | Shell | pre-check | `*.sh` files |
| eslint | `eslint` | JS/TS | full | `package.json` |
| knip | `knip` | JS/TS | full | `package.json` / `tsconfig.json` |
| madge | `madge` | JS/TS | full | `package.json` / `tsconfig.json` |
| npm-audit | `npm` | JS/TS | full | `package.json` |
| mypy | `mypy` | Python | full | `pyproject.toml` / `requirements.txt` |
| pip-audit | `pip-audit` | Python | full | `pyproject.toml` / `requirements.txt` |
| semgrep | `semgrep` | Multi | full | immer (curated `.semgrep.yml` oder auto) |
| hadolint | `hadolint` | Docker | full | `Dockerfile` |
| helm-lint | `helm` | K8s | full | `Chart.yaml` |
| kubeconform | `kubeconform` | K8s | full | `Chart.yaml` |
| yamllint | `yamllint` | YAML | full | `*.yaml` / `*.yml` |

---

## 43. Changelog v7 → v8

### Designprinzip

| Prinzip | Beschreibung |
|---------|-------------|
| **Gateway-Tool-API-Migration** | Alle ACP-Session-Operationen (spawn, kill, send, status) nutzen jetzt die Gateway Tool API (HTTP POST an `127.0.0.1:18789/tools/invoke`) statt CLI-Commands. Eliminiert `clawExec` und alle `openclaw sessions *` CLI-Aufrufe. |
| **Multi-Harness-ACP-Unterstützung** | `modelToHarness()` mappt Model-IDs auf ACP Harness-IDs. Ermöglicht nahtlosen Wechsel zwischen Claude Code, Codex, Gemini CLI etc. ohne Config-Änderungen. |
| **Buster-Prompt-Hoheit** | Pipeline besitzt den vollständigen Buster-Prompt (analog zu Forge). Neues Subsystem mit `buildBusterModulePrompt`, `buildBusterGatePrompt`, und Completion-Protocol-Builder. |
| **Dreistufige Model-Auflösung** | `resolveModel()` mit Fallback: explicit override → `progress.models` → `config.models`. Entkoppelt Plattform- von Projekt-Config. |

### Neue Funktionen

| Funktion | Beschreibung |
|----------|-------------|
| `gatewayInvoke(tool, args, timeoutMs)` | Asynchroner HTTP-POST an die Gateway-Tool-API. Ersetzt `clawExec`. |
| `gatewayKillSync(sessionKey)` | Synchrones Beenden via curl — nur im Shutdown-Handler. |
| `modelToHarness(modelId)` | Model-ID → ACP Harness-ID Mapping (claude, codex, gemini, opencode, kimi). |
| `resolveModel(agentType, config, progress, override)` | Drei-Level-Fallback Model-Resolution. |
| `projectSrcPath(config)` | Ableitung des Project Source Root (Parent von swarm_dir). |
| `buildTestWorkspaceSection(testWorkspacePath)` | Shared Test-Workspace-Block für Buster-Prompts. |
| `buildBusterModulePrompt(config, moduleId, mod, dir, status, maxFails)` | Kompletter module_test-Prompt. |
| `buildBusterGatePrompt(config, gateId, gate, instructions, commitHash, attempt)` | Kompletter gate_test-Prompt. |
| `buildBusterCompletionProtocol(config, moduleId, dir, status)` | 3-Step Completion (status.json → memory → redis). |
| `buildBusterGateCompletionProtocol(config, gateId, gate)` | Gate-Variante des Completion Protocol. |

### Entfernte Funktionen / Code

| Entfernt | Grund |
|----------|-------|
| `clawExec(args, opts)` | Ersetzt durch `gatewayInvoke` (HTTP statt CLI) |
| ACP Session-Management via CLI (`openclaw sessions spawn/kill/send/status`) | Ersetzt durch Gateway Tool API |
| `_shutdownState.activeLabels: Set()` | Ersetzt durch `_shutdownState.activeSessions: Map()` (label → sessionKey) |

### Signaturänderungen

| Funktion | Alt | Neu |
|----------|-----|-----|
| `trackAgent` | `(config, label)` | `(config, label, sessionKey)` |
| `spawnReviewerAgent` | `(config, gateId, reviewer, instructions)` | `(config, progress, gateId, reviewer, instructions)` |

### Exports (Änderungen)

| Funktion | Status |
|----------|--------|
| `modelToHarness` | v8 NEU (exportiert) |
| `buildBusterModulePrompt` | v8 NEU (exportiert) |
| `buildBusterGatePrompt` | v8 NEU (exportiert) |
| `clawExec` | ENTFERNT |

### CLI

| Flag | Status |
|------|--------|
| `--prompt-file <path>` | v8 NEU — Lädt Nova-Prompt aus Datei statt Inline |

### Bereinigter Code (in v8 aufgeräumt)

Die folgenden Punkte wurden im Rahmen der v8-Bereinigung aus `pipeline.js` entfernt oder korrigiert:

| Was | Aktion |
|-----|--------|
| `pollForAllFiles()` | **Entfernt** — Dead Code, Überbleibsel des alten N-Parallel-Reviewer-Systems |
| `extractReviewIssues()` Fallback auf `individual_reviews` | **Entfernt** — Toter Pfad, Array existiert nicht mehr seit v6 |
| `STATUS.REVIEWING` | **Entfernt** — Nirgends gesetzt oder abgefragt |
| `mod.forge_subagent` in Logs/History/Discord | **Ersetzt** — Nutzt jetzt `forgeHarness` via `modelToHarness(forgeModel)` |
| Kommentar «3 parallel reviewers» (Shutdown) | **Korrigiert** — Aktualisiert auf «module agent + gate fix agent» |
| JSDoc `runGate` «parallel reviewers, merge» | **Korrigiert** — Aktualisiert auf «single reviewer with lint report» |
| Discord Footer «OpenClaw Pipeline» | **Korrigiert** — Umbenannt zu «KubeClaw Pipeline» |
| CLI Help «OpenClaw Swarm Pipeline» | **Korrigiert** — Umbenannt zu «KubeClaw Swarm Pipeline» |

### Verbleibende Hinweise

| Ort | Typ | Beschreibung |
|-----|-----|-------------|
| `discord()` (Zeile 934) | Anomalie | Deklariert als `async function`, nutzt aber intern nur synchrones `curlPost()`. Funktioniert korrekt (erlaubt `.catch()` Syntax), ist aber ungewöhnlich. |
