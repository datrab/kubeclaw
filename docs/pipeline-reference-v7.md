# PIPELINE.JS — Vollständige Architektur- und Referenzdokumentation (v7)

**Datei:** `pipeline.js` (4511 Zeilen)  
**Typ:** ES Module (Node.js)  
**Zweck:** Deterministischer Swarm-Orchestrator für die OpenClaw Multi-Agent-Plattform  
**Aufrufer:** Nova (Opus-Orchestrator) oder direkt via CLI  
**Version:** v7 — Integritäts-Hardening + Redis Direct-Import  
**Ort:** `/app/skills/pipeline.js`  
**Companion:** `/app/skills/lint-report.js` (Statische Analyse Aggregator), `/app/skills/redis.js` (Redis Client + Completion Stream)

---

## Inhaltsverzeichnis

1. [Überblick und Designphilosophie](#1-überblick-und-designphilosophie)
2. [Exit-Codes und Status-Modell](#2-exit-codes-und-status-modell)
3. [Konfigurationssystem](#3-konfigurationssystem)
4. [Imports und Abhängigkeiten](#4-imports-und-abhängigkeiten)
5. [Sicherheitsschicht: Safe Execution Wrappers](#5-sicherheitsschicht-safe-execution-wrappers)
6. [Pfadvalidierung](#6-pfadvalidierung)
7. [Temp-Verzeichnis-Management](#7-temp-verzeichnis-management)
8. [Graceful Shutdown (Multi-Agent)](#8-graceful-shutdown-multi-agent)
9. [Structured Logging](#9-structured-logging)
10. [Config Loading und Validierung](#10-config-loading-und-validierung)
11. [Status-Management und Git-Integration](#11-status-management-und-git-integration)
12. [Git-Operationen](#12-git-operationen)
13. [Discord-Benachrichtigungen](#13-discord-benachrichtigungen)
14. [Blueprint-Manager](#14-blueprint-manager)
15. [Agent-Dispatch-System (Dual Mode)](#15-agent-dispatch-system-dual-mode)
16. [Session-End-Polling (Forge-Fix-Cycles)](#16-session-end-polling-forge-fix-cycles)
17. [File Readers](#17-file-readers)
18. [Qdrant Memory Integration](#18-qdrant-memory-integration)
19. [Polling-System (Konsolidiert)](#19-polling-system-konsolidiert)
20. [Rate-Limit-Handling](#20-rate-limit-handling)
21. [Redis Completion Stream (Buster)](#21-redis-completion-stream-buster)
22. [Git-Sync (Forge → Buster Handoff)](#22-git-sync-forge--buster-handoff)
23. [Dependency-Prüfung (Content-Aware)](#23-dependency-prüfung-content-aware)
24. [Failure Handler](#24-failure-handler)
25. [Lint-Report-Integration](#25-lint-report-integration)
26. [Pre-Check (Forge-Output-Validierung)](#26-pre-check-forge-output-validierung)
27. [Forge Prompt Assembly](#27-forge-prompt-assembly)
28. [Module Runner (Stages-Aware)](#28-module-runner-stages-aware)
29. [Gate-Dispatcher](#29-gate-dispatcher)
30. [Buster-Gate-Runner (mit Fix-Loop)](#30-buster-gate-runner-mit-fix-loop)
31. [Review-Gate-Runner (Lint-Report + Single Reviewer)](#31-review-gate-runner-lint-report--single-reviewer)
32. [Pipeline Runner](#32-pipeline-runner)
33. [Status-Ausgabe und Dry-Run](#33-status-ausgabe-und-dry-run)
34. [CLI-Wrapper und Entrypoint](#34-cli-wrapper-und-entrypoint)
35. [Exports](#35-exports)
36. [Vollständiger Ablaufgraph](#36-vollständiger-ablaufgraph)
37. [Abhängigkeitsgraph der Funktionen](#37-abhängigkeitsgraph-der-funktionen)
38. [Systemübergreifende Architektur](#38-systemübergreifende-architektur)
39. [lint-report.js Referenz](#39-lint-reportjs-referenz)
40. [Changelog v4 → v5](#40-changelog-v4--v5)
41. [Changelog v5 → v6](#41-changelog-v5--v6)
42. [Changelog v6 → v7](#42-changelog-v6--v7)

---

## 1. Überblick und Designphilosophie

### Kernkonzept

`pipeline.js` ist der deterministische Orchestrator des OpenClaw Swarm. Er wird von Nova aufgerufen, um den Modul-Pipeline-Ablauf autonom abzuwickeln. Auf dem Happy-Path läuft alles automatisch durch. Bei Fehlern wird mit strukturiertem JSON beendet, sodass Nova den Fehler analysieren und einen neuen Anlauf starten kann.

### Kill-and-Respawn-Strategie

Das zentrale Designprinzip ist **Kill-and-Respawn**: Frische Agenten mit besseren Prompts übertreffen stale Agenten mit verschmutzten Context-Windows. Bei jedem Phasenwechsel oder Fehler wird die Agent-Session zerstört und eine neue gestartet.

### Deklarative Steuerung

`execution_order` in `progress.json` ist die **einzige Wahrheit**. Die Pipeline macht nichts Implizites — kein Gate-Nesting, keine versteckten Trigger. Was in execution_order steht, wird ausgeführt. Was nicht drin steht, existiert nicht. Module `stages` bestimmen welche Phasen laufen (`['forge', 'buster']` Default).

### Agent-Lifecycle

- **PASS** → Agent-Session wird zerstört, neuer Agent für nächstes Modul
- **FAIL** → Agent-Session wird zerstört, Nova analysiert, neuer Agent für Retry
- **TIMEOUT** → Agent-Session wird zerstört, behandelt wie FAIL

### Agent-Git-Entkopplung (v5)

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

### Status-Enum (Zeile 170)

| Status              | Bedeutung                                                      |
|---------------------|----------------------------------------------------------------|
| `PENDING`           | Modul initialisiert, noch nicht gestartet                      |
| `IN_PROGRESS`       | Forge arbeitet am Modul                                        |
| `READY_FOR_TESTING` | Forge fertig, bereit für Buster                                |
| `TESTING`           | Buster testet das Modul                                        |
| `REVIEWING`         | Echo (Code-Review) prüft (reserviert)                          |
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
Repo Root                                  ← CLI/Env/Auto-detect (v5)
```

### Repo-Root-Resolution (v5)

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
| Memory | `memory.enabled`, `memory_js_path`, `recall_limit`, etc. |
| Agents | `agents.forge`, `agents.buster`, `agents.echo` (Dispatch-Modi) |
| Models | `models.buster` (Fallback-Model) |
| Review Defaults | `review_defaults.reviewers`, `timeout_minutes`, `max_fix_cycles`, `lint_tier` |
| Pre-Check | `pre_check.enabled`, `pre_check.lint_report_path`, `pre_check.timeout_seconds` |

Pfad: `SWARM_CONFIG` Env oder `/app/config/swarm.config.json`

### progress.json (Projekt-Level)

Enthält alles projektspezifische:

| Bereich | Felder |
|---------|--------|
| Identität | `project`, `version` |
| Ablauf | `execution_order`, `phases` |
| Module | `modules` (mit `stages`, `forge_model`, `depends_on`, etc.) |
| Gates | `gates` (mit `type`, `on_fail`, `on_nogo`, etc.) |

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

## 5. Sicherheitsschicht: Safe Execution Wrappers

### `gitExec(repoRoot, args, opts)` — Zeile 56

Sicherer Git-Wrapper. Nutzt `-C repoRoot` für Repository-Kontext. Default: `encoding: 'utf8'`, `timeout: 30000`.

### `clawExec(args, opts)` — Zeile 68

Sicherer OpenClaw-CLI-Wrapper. Für ACP-Agent-Lifecycle (spawn, kill, send, status).

### `nodeExec(scriptPath, args, opts)` — Zeile 81

Sicherer Node.js-Script-Wrapper. Für memory.js CLI-Fallback, lint-report.js, und dispatch-Scripts.

### `curlPost(url, jsonPayload, opts)` — Zeile 93

Sicherer Webhook-Wrapper. `stdio: 'ignore'`, `timeout: 10000`. Nur von `discord()` genutzt.

**Kritisch:** `execFileSync` statt `execSync` — übergibt Argumente als Array direkt an den Prozess, ohne Shell. Command Injection ist unmöglich.

---

## 6. Pfadvalidierung

### `ALLOWED_PATH_PREFIXES` — Zeile 107

```javascript
const ALLOWED_PATH_PREFIXES = ['/app/', '/opt/', '/home/'];
```

### `validateSafePath(filePath, label)` — Zeile 109

Validiert dynamische Script-Pfade (redis_js_path, memory_js_path) gegen die Allowlist. Prüft auf leere Strings und Prefix-Match. `path.resolve()` normalisiert den Pfad (eliminiert alle `..`-Segmente); die Prefix-Allowlist ist die eigentliche Security-Boundary.

---

## 7. Temp-Verzeichnis-Management

### `initTempDir()` — Zeile 133

Erstellt `swarm-pipeline-*` unter `os.tmpdir()`. Registriert `process.on('exit', cleanupTempDir)` für garantiertes Cleanup.

### `cleanupTempDir()` — Zeile 143

Rekursives `fs.rmSync`. Bei Fehler nur Warning, kein Throw.

### `tmpFile(prefix, moduleId, ext)` — Zeile 154

Generiert eindeutige Temp-Dateipfade: `{prefix}-{moduleId}-{ts}-{rand}{ext}`.

---

## 8. Graceful Shutdown (Multi-Agent)

### Architektur (Zeile 186)

Set-basiertes Tracking unterstützt mehrere gleichzeitige Agents (z.B. 3 parallele Reviewer):

```javascript
_shutdownState = {
  config: null,
  statusDir: null,          // Module status dir (für FAIL-Markierung)
  activeLabels: new Set(),  // Alle aktiven ACP-Session-Labels
  currentLabel: null,       // Label von setShutdownContext (für clearShutdownContext Cleanup)
};
```

### `registerShutdownHooks()` — Zeile 193

SIGTERM/SIGINT Handler: Alle tracked Agents killen → Status als FAIL markieren → Temp aufräumen → Exit 1.

### `trackAgent(config, label)` — Zeile 232

Fügt ein ACP-Session-Label zum Set hinzu. Aufgerufen von `spawnAcpAgent` und `spawnReviewerAgent`.

### `untrackAgent(label)` — Zeile 240

Entfernt ein Label. Aufgerufen von `killAcpAgent` und `killReviewerAgent`.

### `setShutdownContext()` — Zeile 248

Setzt Modul-Kontext (statusDir für FAIL-Markierung). Tracked das Modul-Agent-Label und speichert es als `currentLabel` für deterministische Cleanup.

### `clearShutdownContext()` — Zeile 267

Entfernt `currentLabel` aus `activeLabels` (idempotent — safe auch wenn killAgent es bereits entfernt hat) und löscht `statusDir`. Config bleibt erhalten für eventuelle Gate-Agents.

---

## 9. Structured Logging

### `log(level, msg, data)` — Zeile 287

JSON-Lines auf stderr: `{ ts, level, run_id, module?, phase?, msg, data? }`. Die `RUN_ID` (Zeile 283) korreliert alle Einträge einer Pipeline-Invokation.

### `output(result)` — Zeile 300

Pretty-printed JSON auf stdout. Nova parst diesen Output.

---

## 10. Config Loading und Validierung

### `loadConfig(projectName)` — Zeile 321

Lädt und mergt swarm.config.json (Plattform) + progress.json (Projekt).

**Ablauf:**
1. Repo-Root via `git rev-parse --show-toplevel`
2. swarm.config.json laden (`SWARM_CONFIG` env oder `/app/config/swarm.config.json`)
3. Pfade aus Konvention ableiten: `Projects/<project>/src/.swarm/`
4. progress.json laden
5. Merge: swarmConfig (Basis) + project + repo_root + paths
6. `validateConfig(config, progress)` → fail-fast
7. Return `{ config, progress }`

### `validateConfig(config, progress)` — Zeile 392

Fail-fast-Validierung beider Quellen:

**Config-Felder:** project, repo_root, paths, models.buster, agents.forge, agents.buster. Agent dispatch/redis_js_path. Defaults: `poll_interval_seconds: 30`, `default_timeout_minutes: 45`, `default_max_fails: 3`.

**Progress-Felder:** project, execution_order, modules. Gate-Typ-Validierung (`buster` | `review`). on_nogo Enum (`fix_and_continue` | `fix_and_rereview`). on_fail Enum (`fix_and_retest`). Cross-Referenz: execution_order Items müssen in modules oder gates existieren.

**Security:** Dynamische Script-Pfade via `validateSafePath`. `_doc` Felder werden übersprungen.

### `loadProgress(config)` — Zeile 513

Thin Wrapper für Export-Kompatibilität. Primärer Pfad: `loadConfig()` gibt `{ config, progress }` direkt zurück.

---

## 11. Status-Management und Git-Integration

### `loadStatus(config, dir)` — Zeile 544

Lädt status.json. Bei Parse-Fehler: `null` + Content-Preview (erste 200 Chars) für Diagnose.

**v7 — Defensive Defaults:** Mergt `STATUS_DEFAULTS` (`fail_summaries: []`, `fail_count: 0`, `history: []`, `decayed_memory_ids: []`, `cost: {...}`) auf das geparste Objekt. Schützt gegen Agent-Overwrites: wenn Buster die gesamte status.json mit `{ "status": "FAIL", "reason": "..." }` überschreibt, crasht die Pipeline nicht mehr auf `.push()`, `.map()`, `.length` oder `++` fehlender Felder. Spread-Semantik: existierende Werte bleiben erhalten, Defaults füllen nur Lücken.

### `saveStatus(config, dir, status)` — Zeile 550

**Atomic Write:** `.tmp` + `fs.renameSync`. Committet via `gitCommitQuiet()`.

### `gitCommitQuiet(config, filePath, message)` — Zeile 563

Leiser Git-Commit. **v5-Änderung:** `--allow-empty` entfernt — "nothing to commit" wird still ignoriert (kein leerer Commit, kein Warn-Log). Echte Commit-Fehler: Warning + Discord-Alert (kein Throw). `invalidateHeadHash()` wird nur bei tatsächlichem Commit aufgerufen.

### Git-Hash-Cache (Zeilen 725–745)

`headHash()` cached, `invalidateHeadHash()` nach jeder HEAD-ändernden Operation.

### `addHistory(status, newStatus, agent, note)` — Zeile 747

History-Eintrag: `{ timestamp, status, agent, note, commit_hash }`.

### `initStatus(moduleId, moduleConfig)` — Zeile 757

Frisches Status-Objekt mit allen Feldern inkl. `decayed_memory_ids`, `forge_diff_stat` und Cost-Tracking.

---

## 12. Git-Operationen

### `_gitPullCore(config, allowDestructiveRecovery)` — Zeile 597

Kern für `git pull --rebase` mit Rebase-Abort-Recovery. Destruktiv (Polling) vs. Throw (vor Push).

### `gitPullForPolling(config)` — Zeile 647 | `gitPullBeforePush(config)` — Zeile 652

### `gitPushWithRetry(config, maxRetries, delayMs)` — Zeile 663

3 Versuche, 5s Delay (via `await sleep()`), 60s Timeout pro Versuch. **Async** — blockiert den Event-Loop nicht mehr.

### `gitCommitAndPush(config, message, opts)` — Zeile 690

Einheitliche Funktion für alle Git-Commit+Push. Optionen: `addPaths`, `captureHash`, `softFail`. **Async** — nutzt `await gitPushWithRetry()`.

---

## 13. Discord-Benachrichtigungen

### `discord(config, level, title, description, fields)` — Zeile 799

Rich Embeds an Discord-Webhook. Komplett in try/catch um URL-Leak zu verhindern.

---

## 14. Blueprint-Manager

### `listBlueprints(config)` — Zeile 828

### `releaseBlueprint(config, moduleId, moduleDir, stages)` — Zeile 861

Kopiert Blueprint vom Architecture-Branch. **v6-Änderung: Stage-Aware.** Verifiziert nur Files die von den konfigurierten Stages benötigt werden: `stages: ['forge']` → nur FORGE.md, `stages: ['buster']` → nur BUSTER.md, beide → beide. Default-Parameter `stages = ['forge', 'buster']` für Rückwärtskompatibilität. **Async** — nutzt `await gitCommitAndPush()`.

---

## 15. Agent-Dispatch-System (Dual Mode)

### Architektur

| Agent-Typ | Dispatch | Lifecycle | Tracking |
|-----------|----------|-----------|----------|
| Forge | ACP | Pipeline kontrolliert | `trackAgent` / `untrackAgent` |
| Echo/Reviewer | ACP | Pipeline kontrolliert | `trackAgent` / `untrackAgent` |
| Buster | Redis | Processor kontrolliert | No-Op kill |

### ACP Dispatch

- `acpLabel(agentType, moduleId)` — Zeile 917: Format `<type>-<moduleId>`
- `spawnAcpAgent(...)` — Zeile 923: Prompt → Temp-File → `openclaw sessions spawn`. Ruft `trackAgent()`.
- `killAcpAgent(...)` — Zeile 969: `sessions kill --label`. Ruft `untrackAgent()`.

### Redis Dispatch

- `buildBusterPayload(...)` — Zeile 988: Strukturierter Payload. **Dual Task-Type:** `module_test` (Module) und `gate_test` (Gates mit gate-spezifischem Kontext: `gate_id`, `gate_title`, `work_dir`, `output_file`, `instructions_file`).
- `dispatchRedisTask(...)` — Zeile 1039: Payload + Script in Temp-Files, `nodeExec`. Akzeptiert `opts` für Gate-Kontext-Weiterleitung.

### Unified Interface (Zeile 1086)

| Funktion | ACP-Routing | Redis-Routing |
|----------|------------|---------------|
| `spawnAgent()` | `spawnAcpAgent()` | `dispatchRedisTask()` |
| `killAgent()` | `killAcpAgent()` | No-Op |
| `steerAgent()` | Temp-File + `sessions send` | `dispatchRedisTask(steer)` |

### `verifyAgentAlive(...)` — Zeile 1147

Health-Check nach ACP-Spawn. **Async:** `await sleep(8000)`, dann `sessions status` prüfen. Redis: immer true.

### Reviewer-Agents

- `spawnReviewerAgent(config, gateId, reviewer, instructions)` — Zeile 3171: Spawnt mit explizitem `agent_id` + `model` pro Reviewer. Ruft `trackAgent()`.
- `killReviewerAgent(config, gateId, reviewer)` — Zeile 3212: Label-Schema `echo-{label}-{gateId}`. Ruft `untrackAgent()`.

---

## 16. Session-End-Polling (Forge-Fix-Cycles)

### `pollForSessionEnd(config, sessionLabel, timeoutMinutes, logLabel)` — Zeile 1193

Extrahierte Hilfsfunktion für Forge-Fix-Polling in Gate-Zyklen. Ersetzt die rohen while-Loops in `runBusterGate` und `runReviewGate`.

**Funktionalität:**
1. Captured `headHash()` vor dem Polling (Fallback für Change-Detection)
2. Pollt `clawExec sessions status` bis die Session endet oder Timeout
3. **v5-Änderung — Zwei-Phasen Change-Detection nach Session-Ende:**
   - Phase 1: `git add -A` → `git status --porcelain` → Pipeline committet uncommitted Agent-Output
   - Phase 2 (Fallback): HEAD-Diff gegen Baseline (für Legacy-Agents die selbst committen)
4. **Crash-Detection:** Session-Ende ohne Änderungen = Agent gecrasht (OOM, API-Error)
5. **v5-Neu — Timeout-Nudge:** Bei `session_nudge_threshold` (Default 75%) wird dem Agent ein einmaliger Steer geschickt: `"TIMEOUT WARNING: You have ~X minutes remaining..."`. Konfigurierbar via `config.session_nudge_threshold`.

**Returns:** `{ completed: boolean, hasChanges: boolean, reason: string }`

**Caller nutzen `hasChanges`** um sinnlose Retests zu vermeiden: Wenn der Agent nichts geändert hat, wird der Buster-Retest übersprungen und direkt zum nächsten Fix-Cycle gesprungen.

**v5-Designprinzip:** Agents machen kein Git — die Pipeline committed Agent-Output nach Session-Ende. Das eliminiert vergessene `git commit`-Instruktionen als Fehlerquelle.

---

## 17. File Readers

- `readForgeInstructions(config, moduleDir, moduleConfig)` — Zeile 1239
- `readBusterInstructions(config, moduleDir)` — Zeile 1257
- `readGateInstructions(config, gate)` — Zeile 1263

---

## 18. Qdrant Memory Integration

### Drei Integrationspunkte

1. **VOR FORGE:** `recallForModule()` (Zeile 1330) — Memories in Forge-Prompt injizieren
2. **NACH PASS/FAIL:** `feedbackMemory()` (Zeile 1421) — Confidence-Scores updaten
3. **NACH FAIL:** `decayRecalledMemories()` (Zeile 1449) — Gezieltes Decay der Prompt-Memories

Memory-Import: Direct Import bevorzugt (`getMemoryModule()`), CLI-Fallback wenn nötig.

---

## 19. Polling-System (Konsolidiert)

### Architektur (v4-Redesign)

**Alle Poller bauen auf `pollGeneric` auf.** pollStatus und pollDual sind jetzt checkFn-Callbacks statt eigenständige Loops. Dies eliminiert duplizierte Deadline/Parse-Corruption/Progress-Logik.

```
pollGeneric(config, checkFn, timeoutMinutes, label)   ← Gemeinsame Basis
  ├── pollForFile(...)     → checkFn prüft fs.existsSync
  ├── pollStatus(...)      → checkFn prüft loadStatus + expectedStatuses
  ├── pollDual(...)        → checkFn prüft Redis + Git parallel
  └── pollForAllFiles(...) → checkFn prüft mehrere Dateien
```

### `pollGeneric(config, checkFn, timeoutMinutes, label)` — Zeile 1568

Gemeinsame Basis für alle Polling-Loops. Übernimmt: Deadline-Loop, sleep, `gitPullForPolling`, Parse-Corruption-Tracking. **Rate-Limits werden an den Caller zurückgegeben** (kein internes Handling — Caller haben den nötigen moduleDir-Kontext).

**PollResult-Semantik (v5-Klarstellung):** `ok=true` bedeutet "ein terminaler Status wurde erreicht" — NICHT "Modul bestanden". FAIL ist ein valider terminaler Status. Der Caller prüft `status.status` um PASS von FAIL zu unterscheiden. Reason-Enum: `target_reached`, `gate_fail`, `timeout`, `blocked`, `rate_limited`, `rate_limit_exhausted`, `parse_corrupted`, `spawn_failed`.

### `pollStatus(...)` — Zeile 1638

checkFn-Wrapper um `loadStatus`. Forge-Phase. Gebaut auf `pollGeneric`.

### `pollDual(...)` — Zeile 1888

Redis + Git parallel als checkFn. Buster-Phase. Gebaut auf `pollGeneric`. Kommentar: `gitPullForPolling` wird von pollGeneric bereits aufgerufen, nicht doppelt.

### `pollForFile(...)` — Zeile 1625 | `pollForAllFiles(...)` — Zeile 3155

### Rate-Limit-Recovery (Unified)

### `withRateLimitRecovery(config, moduleDir, pollFn)` — Zeile 1672

**Neu in v4.** Generischer Rate-Limit-Recovery-Wrapper. Akzeptiert eine beliebige `pollFn` (zero-arg async). Ersetzt die duplizierten `pollWithRateLimitRecovery` / `pollDualWithRateLimitRecovery` Wrapper.

### `pollWithRateLimitRecovery(...)` — Zeile 1699

Jetzt ein Zwei-Zeilen-Wrapper: `withRateLimitRecovery(config, moduleDir, () => pollStatus(...))`.

### `pollDualWithRateLimitRecovery(...)` — Zeile 1705

Jetzt ein Zwei-Zeilen-Wrapper: `withRateLimitRecovery(config, moduleDir, () => pollDual(...))`.

---

## 20. Rate-Limit-Handling

### `handleRateLimit(...)` — Zeile 1717

Cooldown → Discord-Alert → Sleep → Fresh Status → Phase wiederherstellen. Timeout-Uhr wird resettet.

**v4-Änderung:** Mutiert den Status des Callers **nicht mehr**. Liest frischen Status von Disk, schreibt History, speichert — ohne das Caller-Objekt zu verändern. Caller können nach Return sicher mit ihrer eigenen Status-Referenz weiterarbeiten.

### Gate-Level Rate-Limit-Handling (Inline)

Gates haben keinen `moduleDir`/`statusDir` Kontext, den `handleRateLimit` benötigt. Deshalb implementieren Buster-Gates (`runBusterGate`) einen eigenen, inline Rate-Limit-Handler (Zeile 3010–3031): Sleep → Discord → `attempt--` (Rate-Limit zählt nicht als Fix-Attempt) → Continue.

---

## 21. Redis Completion Stream (Buster)

```
Active:  swarm:pipeline:<project>:completions       ← aktuelle Entries
Archive: swarm:pipeline:<project>:completions:log   ← verarbeitete Entries
```

### Direct Import von redis.js (v7)

Die Pipeline importiert `redis.js` direkt via `getRedisModule(config)` (cached, analog zu `getMemoryModule`). Eine persistente Redis-Connection wird über alle Poll-Cycles wiederverwendet. Eliminiert ~90 Temp-Files und ~90 Node-Subprocesses pro Buster-Phase.

Bei Import-Fehler: Graceful Degradation — `readCompletionFromRedis` returned `null`, `pollDual` fällt auf Git-only-Polling (Channel 2) zurück.

### redis.js Funktionen (v7)

| Funktion | Beschreibung |
|----------|-------------|
| `readCompletion(streamKey, moduleId)` | Liest neueste Completion für ein Modul aus dem aktiven Stream |
| `archiveCompletions(streamKey, archiveStreamKey, moduleId, maxLen)` | Verschiebt alte Entries in den Archive-Stream, trimmt auf maxLen |

### Pipeline-Funktionen

- `getRedisModule(config)` — Cached Direct-Import von redis.js. Löst Pfad aus `agents.*.redis_js_path` auf.
- `archiveModuleCompletions(config, moduleId)` — VOR jedem Buster-Dispatch. **Async.**
- `readCompletionFromRedis(config, moduleId)` — Neueste Completion lesen. **Async.**
- `mapRedisStatus(redisStatus)` — PASS→PASS, FAIL→FAIL, ISSUES_FOUND→FAIL.

---

## 22. Git-Sync (Forge → Buster Handoff)

### `gitSyncBeforeBuster(config, moduleDir, status)` — Zeile 1957

`gitCommitAndPush()` mit `captureHash: true`. Zeichnet `forge_commit_hash` in Status auf.

**v4-Neu:** Captured `forge_diff_stat` via `git diff --stat HEAD~1 HEAD`. Diese Info wird in `fail_summaries` aufgenommen und dem nächsten Forge-Attempt als Anti-Pattern-Kontext mitgegeben — Forge sieht welche Dateien geändert wurden bevor der Test fehlschlug.

---

## 23. Dependency-Prüfung (Content-Aware)

### `checkDependencies(config, progress, moduleId)` — Zeile 2083

Prüft Gate-Dependencies und Modul-Dependencies. **Content-aware:** Output-File-Existenz allein reicht nicht — der Status im JSON wird geprüft. FAIL/ISSUES_FOUND/NO-GO = Dependency nicht erfüllt.

**v7-Fix:** `mod.depends_on || []` Guard — Module ohne `depends_on` Feld in progress.json crashen nicht mehr mit TypeError.

**v4-Neu:** Buster-Gate-Dependencies prüfen jetzt `gateStatusPath()` statt eines hardcoded Pfad-Patterns. Parse-Fehler werden als "nicht erfüllt" behandelt (statt Exception).

---

## 24. Failure Handler

### `extractAgentFailReason(status, phase)` — Zeile 2139 (v7)

Extrahiert eine aussagekräftige Failure-Reason aus der status.json des Agents. Prüft in Prioritätsreihenfolge: letzter Agent-History-Eintrag (nicht `pipeline`) → `completion_summary` → generischer Fallback. Wird von allen `handleFail`-Callern verwendet, sodass `fail_summaries` immer informative Anti-Pattern-Daten enthalten.

### `handleFail(...)` — Zeile 2152

Sechs Schritte: **fail_count++** (unconditional) → Fail-Summary (mit `files_changed` aus `forge_diff_stat`) → Targeted Memory-Decay → Status-Update → Auto-Retry-Entscheidung → Eskalation.

**v7-KRITISCHER Fix:** `fail_count++` ist jetzt **unconditional** — wird immer inkrementiert, unabhängig davon ob `reason` truthy ist. Vorher wurde `fail_count` nur innerhalb des `if (reason)` Blocks inkrementiert. Da Caller `reason = null` übergaben wenn `fail_summaries` bereits Einträge hatte, blieb `fail_count` nach dem ersten Fail stecken → Endlos-Retry-Loop, kein BLOCKED, kein NEEDS_NOVA, unbegrenzter Token-Burn.

**v7-Fix — Caller liefern immer reason:** Alle `handleFail`-Caller verwenden `extractAgentFailReason(status, phase)` statt des alten `fail_summaries.length > 0 ? null : '...'` Patterns. Doppelte Absicherung: auch wenn `extractAgentFailReason` theoretisch null zurückgäbe, schützt das unconditional `fail_count++`.

**v5-Änderung — Single-Save bei BLOCKED:** Wenn `fail_count >= maxFails`, setzt `handleFail` FAIL + BLOCKED in einem einzigen `saveStatus`-Aufruf (= ein Git-Commit) statt zwei separaten. Die History zeigt weiterhin FAIL → BLOCKED in Reihenfolge.

### `buildNovaEscalation(...)` — Zeile 2185

Vollständiges Context-Paket für Nova: reason, fail_history (inkl. `files_changed`), module_status, resume_command.

---

## 25. Lint-Report-Integration

### Designprinzip (v6)

> "Was ein Script deterministisch erledigen kann, darf nicht dem Agent überlassen werden."

Mechanische Code-Checks (Type-Errors, Lint-Violations, Unused Code, Security) werden von `lint-report.js` erledigt — deterministisch, in Sekunden, reproduzierbar. Echo-Agents konzentrieren sich auf Architektur-Urteil das Tools nicht leisten können.

### Zwei Tiers

| Tier | Tools | Laufzeit | Kontext |
|------|-------|----------|---------|
| `pre-check` | tsc, ruff, shellcheck | < 10s | Nach jedem Forge, vor Buster |
| `full` | Alle 14 applicable Tools | 30–120s | Vor Review-Gates |

### `generateLintReport(config, tier, opts)` — Shared Core

Zentrale Funktion für alle Lint-Aufrufe. Wird von `runPreCheck()` und `_runReviewOnce()` genutzt.

**Parameter:**
- `tier`: `'pre-check'` oder `'full'`
- `opts.moduleDir`: Module-Directory für `--module-path`
- `opts.moduleId`: Für Temp-File-Naming
- `opts.forgeDiffStat`: Aus status.json für `--changed-files` Scope
- `opts.timeoutMs`: Timeout (Default: 30s pre-check, 120s full)

**Returns:** `{ report: object|null, error: string|null }`

Graceful Degradation: Bei Crash von lint-report.js oder unparseablem Output → `{ report: null, error: '...' }`. Caller entscheidet ob skip (Pre-Check) oder Eskalation (Review-Gate).

### `formatLintErrors(report)` — Anti-Pattern-Formatter

Formatiert Lint-Errors als Markdown-Block für `handleFail` → Anti-Pattern-Block. Gruppiert nach Tool, zeigt File:Line:Message, gekappt bei 20 Findings pro Tool.

### `formatLintReportForReviewer(report)` — Reviewer-Prompt-Block

Formatiert den vollständigen Lint-Report als strukturierten Markdown-Block für Injection in den Reviewer-Prompt. Enthält: Tool-Status-Icons (✅ 🔴 🟡 ❌), alle Findings mit Severity, Summary-Header. Gekappt bei 30 Findings pro Tool.

---

## 26. Pre-Check (Forge-Output-Validierung)

### `runPreCheck(config, moduleDir, status, moduleId)`

Schnelle statische Analyse auf Forge-Output **nach** Forge-Complete, **vor** Git-Sync und Buster. Fängt Type-Errors in Sekunden statt nach einem 45-Minuten-Buster-Cycle.

**Flow:**
```
Forge Complete (READY_FOR_TESTING)
  → runPreCheck(tier: pre-check)
    → PASS → gitSyncBeforeBuster → Buster
    → FAIL → handleFail(phase: 'pre_check') → Forge Retry mit Errors als Anti-Pattern
    → TOOL CRASH → Warning, skip Pre-Check → Buster läuft normal
```

**Bedingungen:** Nur wenn `stages.includes('forge') && stages.includes('buster')` und Forge tatsächlich gelaufen ist (`needsForge`). Buster-Only-Module überspringen den Pre-Check.

**Kill-Switch:** `config.pre_check.enabled = false` deaktiviert global.

**Graceful Degradation:**
- `lint-report.js` nicht vorhanden → skip, Warning
- lint-report.js crasht ohne Output → skip, Warning
- Output unparseable → skip, Warning
- Errors gefunden → `handleFail` mit strukturiertem Error-Summary

**Config:**

```json
{
  "pre_check": {
    "enabled": true,
    "lint_report_path": "/app/skills/lint-report.js",
    "timeout_seconds": 30
  }
}
```

---

## 27. Forge Prompt Assembly

### `buildForgePrompt(...)` — Zeile 2444

**v4-Redesign der Text-Reihenfolge** (optimiert für LLM-Aufmerksamkeitsmuster):

**v5-Neu — Module Context Block:** Strukturierter Orientierungsblock ganz am Anfang des Prompts. Enthält: Project, Module + Title, Module Path (relativ), Status JSON Path, Repo Root, CWD, Current Status, Attempt X/Y, Stages, Last Forge Commit (bei Retries). ~80-100 Tokens die dem Agent Orientierungs-Commands (`pwd`, `find .`, `git log`) ersparen.

**Prioritätshierarchie** (im Header deklariert):
1. **NOVA DIRECTIVE** — höchste Autorität
2. **ANTI-PATTERNS** — konkrete Constraints
3. **FORGE.md** — Basis-Instruktionen
4. **MEMORY CONTEXT** — supplementär, möglicherweise veraltet

**Text-Reihenfolge** (optimiert für "Lost in the Middle"-Effekt):
```
Context Block → Priority Header → Nova Directive → FORGE.md → Anti-Patterns → Memory Context
```

Context Block steht vor dem Priority-Header weil er faktueller Kontext ist (keine Instruktion, kein Prioritätskonflikt). Anti-Patterns stehen nahe am Ende (Recency-Bias → Constraints bleiben besser haften).

**v4-Neu in Anti-Patterns:** Jeder Eintrag enthält optional `files_changed` (aus `forge_diff_stat`), sodass Forge sieht welche Dateien der vorherige Attempt geändert hat.

---

## 28. Module Runner (Stages-Aware)

### Module Stages

Module können optional `stages` definieren:

```json
{ "stages": ["forge", "buster"] }   // Default wenn fehlt
{ "stages": ["forge"] }             // Nur Build, kein Test
{ "stages": ["buster"] }            // Nur Test, kein Build
```

### `runModule(config, progress, moduleId, opts)` — Zeile 2371

Retry-Loop um `executeModuleAttempt()`. Dependencies einmal geprüft. Stages im Log.

### `executeModuleAttempt(...)` — Zeile 2481

**v4-Neu — Korrupte-Status-Schutz:** Vor Blueprint-Release wird explizit geprüft ob `statusPath` existiert. Wenn die Datei existiert aber `loadStatus` `null` zurückgibt (= korrupt), wird mit `EXIT_ERROR` abgebrochen statt den Blueprint zu releasen. Dies verhindert, dass existierender Forge-Output mit dem Architecture-Branch-Template überschrieben wird.

**v5-Neu — Blueprint-Release EXIT_NEEDS_NOVA:** `releaseBlueprint` wird in try/catch gefangen. Bei Fehler (Branch nicht vorhanden, Fetch-Fehler) → `EXIT_NEEDS_NOVA` statt `EXIT_ERROR`, mit `resume_command` für Nova.

**v5-Neu — Attempt-Start-Log:** Loggt Status, fail_count und Stages beim Eintritt in jeden Attempt für bessere Debugging-Visibilität.

**v5-Neu — Buster-Prompt-Enrichment:** Der Buster-Prompt erhält einen strukturierten Test-Target-Block mit: Module Path, Status JSON Path, Commit-Hash (conditional), forge_diff_stat (conditional), und ein Completion Protocol. Pfade sind immer da (auch bei buster-only), Commit/Diff nur wenn Forge gelaufen ist.

**v7-Fix — Completion Protocol (O3):** Das Completion Protocol instruiert Buster explizit: "Read the existing JSON, then set ONLY the `status` and `reason`/`completion_summary` fields. Do NOT overwrite other fields." Vorher sagte es "update" mit vollständigen JSON-Beispielen, was LLMs als "overwrite file with this JSON" interpretierten → Verlust aller Pipeline-Metadaten. Kombiniert mit defensiven Defaults in `loadStatus` (H2) als Backup.

**v7-Fix — Buster `!result.ok` Catch-All (K2):** Der Buster-Pfad hat jetzt einen Catch-All am Ende des `!result.ok` Blocks (analog zum Forge-Pfad). Vorher fielen unbehandelte Poll-Reasons (z.B. `blocked`) durch → `EXIT_ERROR` statt `EXIT_BLOCKED`. Zusätzlich behandelt der Status-Check nach dem `!result.ok` Block jetzt `STATUS.BLOCKED` neben `STATUS.FAIL`.

---

## 29. Gate-Dispatcher

### `runGate(config, progress, gateId)` — Zeile 3706

Routet nach `gate.type`:

| Type | Runner | Beschreibung |
|------|--------|-------------|
| `buster` | `runBusterGate()` | Einzelner Buster-Agent mit optionalem Fix-Loop |
| `review` | `runReviewGate()` | N parallele Reviewer mit Merge und Fix-Lifecycle |

---

## 30. Buster-Gate-Runner (mit Fix-Loop)

### `_runBusterGateOnce(...)` — Zeile 2778

Einzelversuch: **Commit-Hash-Injection** in Instructions → spawn (mit `taskType: 'gate_test'`) → poll (Content-aware: FAIL/ISSUES_FOUND = gate_fail, PASS/OK = target_reached) → kill → PollResult. Spawn-Failure gibt `pollResult(false, 'spawn_failed')`.

**v4-Neu:** Erkennt PASS/OK auch aus `gate-status.json` (nicht nur aus `output_file`), was die Edge-Case-Abdeckung verbessert wenn Buster die gate-status.json vor der output_file schreibt.

### `runBusterGate(config, progress, gateId)` — Zeile 2910

**Already-completed Check:** Content-aware. FAIL/ISSUES_FOUND Output → re-run. Non-JSON → completed. **v4-Neu:** Fallback-Check auf `gate-status.json` wenn `output_file` fehlt.

**v7-Fix — Stale-Output-Cleanup (H1):** Nach dem Already-Completed-Check und vor dem Main-Loop werden `output_file` und `gate-status.json` gelöscht. Verhindert, dass `_runBusterGateOnce` ein altes FAIL-File sofort findet und einen Phantom-Failure auslöst — was einen Buster-Spawn + Forge-Fix-Cycle auf veralteten Daten verschwendet.

**v4-Neu — Gate-Level Rate-Limit-Handling:** Eigene Rate-Limit-Tracking-Variable und inline Cooldown-Sleep. Rate-Limit-Pausen dekrementieren `attempt` (zählen nicht als Fix-Versuch). Discord-Alerts bei Rate-Limit und bei Gate-Spawn-Failures.

**v4-Neu — Forge-Fix mit Crash-Detection:** Nutzt `pollForSessionEnd()` statt des rohen while-Loops. Prüft `hasChanges` — wenn Forge keine Änderungen produziert hat, wird der Retest übersprungen.

**v5-Neu — Fix-History Anti-Pattern-Framing:** `runBusterGate` trackt ein `fixHistory`-Array mit `{ attempt, hasChanges, issues }` pro Fix-Cycle. `buildGateFixPrompt(config, gate, issues, attempt, maxAttempts, fixHistory)` erzeugt daraus einen Anti-Pattern-Block, der dem frisch gespawnten Forge-Fix-Agent zeigt was vorherige Attempts versucht haben und warum sie gescheitert sind. Neue Signatur — `config` wird für Kontext-Header (Project, Working Directory, Repo Root) benötigt.

**v5-Neu — Discord-Alert bei Fix-Timeout/Crash:** Wenn `pollForSessionEnd` für einen Gate-Fix in Timeout geht oder keine Änderungen produziert, wird ein Discord WARN gesendet (unterscheidet "timeout" vs "no changes (crashed?)").

**v5-Neu — Rate-Limit-Cooldown-Log:** Nach Rate-Limit-Cooldown wird der Attempt-Counter im Log explizit erwähnt.

**Hauptloop:**

```
if on_fail === 'fix_and_retest':
  for attempt 1..maxFixCycles+1:
    _runBusterGateOnce()
    → PASS → EXIT_OK
    → spawn_failed/timeout/parse_corrupted → EXIT sofort (+ Discord)
    → rate_limited → inline cooldown, attempt--, continue
    → FAIL →
      if !hasFixLoop → EXIT_NEEDS_NOVA
      if exhausted → EXIT_NEEDS_NOVA
      → Forge fix (spawn → verifyAlive → pollForSessionEnd → kill)
      → hasChanges check (skip retest if no changes)
      → git sync → Cleanup output files
      → Loop (nächster Buster-Versuch)

if kein on_fail:
  Einmal testen → PASS oder EXIT_NEEDS_NOVA
```

---

## 31. Review-Gate-Runner (Lint-Report + Single Reviewer)

### Architektur (v6-Redesign)

```
_runReviewOnce():
  1. generateLintReport(tier: full)  ← Deterministische Tool-Findings
  2. readGateInstructions()           ← Review-Instructions
  3. Build Reviewer-Prompt:           ← Instructions + Lint-Report + Output-Schema
  4. spawnReviewerAgent() × 1         ← Single Reviewer (nicht N parallel)
  5. pollForFile()                    ← Ein Output-File (nicht pollForAllFiles)
  6. killReviewerAgent()
  7. Parse Review JSON                ← GO / NO-GO + critical_issues
  8. gitCommitAndPush()
```

### `_runReviewOnce(...)` — Refactored

Ein kompletter Review-Durchlauf mit Lint-Report-Integration.

**Phase 1:** `generateLintReport(tier: full)` → Deterministische Tool-Findings. Intentionell kein `moduleDir` oder `forgeDiffStat` — Review-Gates prüfen das Gesamtprojekt (Cross-Module-Regressions, Architektur-Issues), nicht einzelne Module. Vergleiche `runPreCheck`, das modul-scoped ist.
**Phase 2:** Reviewer-Prompt aus Instructions + `formatLintReportForReviewer()` + Output-Schema.
**Phase 3:** Stale Review-Output wird gelöscht (v7-Fix K3), dann einzelner Reviewer gespawnt, `pollForFile()` auf sein Output-File.
**Phase 4:** Review-JSON parsed: `{ status: "GO"|"NO-GO", critical_issues, deferred_issues, summary }`.
**Phase 5:** Kopie zu `gate.output_file` wenn nötig.

**v7-KRITISCHER Fix — Stale-Review-Cleanup (K3):** `_runReviewOnce` löscht das Reviewer-Output-File **vor** dem Spawn. Ohne dies findet `pollForFile` ein altes NO-GO-File sofort und returned stale Review-Daten, während der Reviewer noch nicht mal angefangen hat.

**Graceful Degradation:**
- Lint-Report failt → Reviewer läuft ohne Lint-Daten (mit Warning-Hinweis im Prompt)
- Reviewer-Spawn failt → `{ ok: false, error: '...' }`
- Non-JSON Review-Output → Regex-Fallback für NO-GO Detection

### `resolveReviewConfig(config, gate)` — Erweitert

**v6-Neu:** `lintTier` Feld. Bestimmt welcher lint-report.js Tier vor dem Review läuft. Default: `'full'`.

### Reviewer Output-Schema

```json
{
  "status": "GO" or "NO-GO",
  "critical_issues": [
    { "source": "tsc|eslint|architectural|security", "description": "...",
      "affected_files": [...], "recommended_fix": "..." }
  ],
  "deferred_issues": [...],
  "summary": "..."
}
```

### Fix-Lifecycles (unverändert von v5)

#### `fix_and_continue` (Midpoint-Review)

Forge-Fix nutzt `pollForSessionEnd()` mit `hasChanges`-Check. Fix-History-Tracking und Anti-Pattern-Framing via `buildReviewFixPrompt()`. Nach Fix: GO-Status-File schreiben → Pipeline fährt fort.

#### `fix_and_rereview` (Final-Review)

Forge-Fix nutzt `pollForSessionEnd()` mit `hasChanges`-Check. Fix-History-Tracking mit `currentIssues`. Nach Fix: `cleanupReviewFiles` → `_runReviewOnce` (frischer Lint-Report + frisches Review). Bei Exhaustion: `EXIT_NEEDS_NOVA`.

---

## 32. Pipeline Runner

### `findNextStep(config, progress)` — Zeile 3870

Iteriert `execution_order`. **Content-aware Gate-Check:** Output-File mit FAIL/ISSUES_FOUND/NO-GO → Gate muss erneut laufen.

**v4-Neu:** Fallback-Check auf `gateStatusPath()` (`gate-status.json`) für Buster-Gates. Deckt den Edge-Case ab wo Buster PASS in gate-status.json schreibt aber vor dem output_file crasht.

**v5-Neu — Status-Logging:** FAIL-Module werden mit fail_count geloggt ("Module X is FAIL (N attempts) — will retry"). Resumed Module zeigen ihren aktuellen Status ("Module X resuming from IN_PROGRESS").

### `runPipeline(config, progress, opts)` — Zeile 3964

Hauptschleife: `findNextStep()` → `runGate()` oder `runModule()`.

**v5-Neu — Enriched Pipeline-Start-Discord:** Start-Alert zeigt `"Full pipeline: 5/12 modules pending, 3 gate(s)"` statt nur `"Full pipeline run"`. Berechnet pending/total via `loadStatus` pro Modul.

**v4-Neu — Pipeline-Halt-Notifications:** Bei jedem nicht-OK Exit-Code sendet die Pipeline eine Discord-Nachricht mit dem gestoppten Step, Exit-Code-Label und Grund. Auch Single-Module-Mode hat jetzt Exit-Notifications.

---

## 33. Status-Ausgabe und Dry-Run

### `printStatus(config, progress)` — Zeile 3857

Status-JSON aller Module + Gates.

### `dryRun(config, progress)` — Zeile 3879

Ausführungsplan ohne Agenten zu spawnen.

---

## 34. CLI-Wrapper und Entrypoint

Zeile 4130+. Manuelles Argument-Parsing. Environment-Fallbacks: `CURRENT_PROJECT`, `REPO_ROOT`.

```
1. initTempDir() + registerShutdownHooks()
2. const { config, progress } = loadConfig(flags.project, { repoRoot: flags.repo })
3. Blueprint-Commands (exit early)
4. Status/Dry-Run (exit early)
5. Nova-Prompt auflösen → runPipeline() → Cleanup → Exit
```

**v5-Neu — `--repo` Flag:** `loadConfig(projectName, opts)` akzeptiert `opts.repoRoot`. CLI: `--repo <path>`. Env: `REPO_ROOT`. Ermöglicht Pipeline-Start von außerhalb des Repos (z.B. `/app/skills/`).

---

## 35. Exports

```javascript
export {
  loadConfig, loadProgress, loadStatus, saveStatus,
  releaseBlueprint, listBlueprints,
  spawnAgent, killAgent, steerAgent, verifyAgentAlive,
  spawnAcpAgent, killAcpAgent, dispatchRedisTask,
  recallForModule, feedbackMemory, decayRecalledMemories,
  buildForgePrompt, executeModuleAttempt, runPreCheck, generateLintReport, formatLintReportForReviewer,
  runModule, runGate, runBusterGate, runReviewGate, runPipeline,
  printStatus, gitSyncBeforeBuster, gitPullForPolling, gitPullBeforePush,
  gitPushWithRetry, gitCommitAndPush,
  pollStatus, pollWithRateLimitRecovery, pollDual, pollDualWithRateLimitRecovery,
  pollGeneric, pollForFile,
  handleRateLimit, completionStreamKey, archiveModuleCompletions,
  STATUS, EXIT_OK, EXIT_ERROR, EXIT_NEEDS_NOVA, EXIT_BLOCKED, EXIT_TIMEOUT, EXIT_RATE_LIMITED,
};

export default runPipeline;
```

---

## 36. Vollständiger Ablaufgraph

### Happy Path

```
CLI Entrypoint
  │
  ├─ initTempDir() + registerShutdownHooks()
  ├─ const { config, progress } = loadConfig(projectName)
  │
  └─ runPipeline()
       │
       └─ LOOP: findNextStep()  (content-aware gate checks + gate-status.json fallback)
            │
            ├─ type: 'gate' (buster)
            │   └─ runBusterGate()
            │       ├─ _runBusterGateOnce() (commit hash injected, gate_test payload)
            │       │   → PASS → done
            │       │   → rate_limited → inline cooldown, attempt--, continue
            │       └─ on_fail: fix_and_retest
            │           ├─ extractGateIssues()
            │           ├─ Forge fix → pollForSessionEnd() → hasChanges check
            │           ├─ kill → git sync → Cleanup output
            │           └─ retest loop
            │
            ├─ type: 'gate' (review)
            │   └─ runReviewGate()
            │       ├─ resolveReviewConfig() (incl. lintTier)
            │       ├─ _runReviewOnce()
            │       │   ├─ generateLintReport(tier: full)      ← v6: deterministic tools
            │       │   ├─ formatLintReportForReviewer()        ← v6: structured prompt block
            │       │   ├─ spawnReviewerAgent() × 1             ← v6: single reviewer (was N)
            │       │   ├─ pollForFile()                        ← v6: one file (was pollForAllFiles)
            │       │   ├─ killReviewerAgent()
            │       │   └─ Parse review JSON → GO / NO-GO
            │       │
            │       ├─ on_nogo: fix_and_continue
            │       │   └─ Forge fix → pollForSessionEnd() → hasChanges check
            │       │      → write GO file → continue
            │       │
            │       └─ on_nogo: fix_and_rereview
            │           └─ Forge fix → pollForSessionEnd() → hasChanges check
            │              → cleanup → _runReviewOnce (fresh lint + review) → loop
            │
            ├─ type: 'module'
            │   └─ runModule()
            │       ├─ checkDependencies()  (content-aware + gate-status.json)
            │       ├─ corrupt status.json check (EXIT_ERROR if exists but unparseable)
            │       └─ RETRY LOOP: executeModuleAttempt()
            │           │
            │           ├─ stages = mod.stages || ['forge', 'buster']
            │           │
            │           ├─ FORGE PHASE (if 'forge' in stages)
            │           │   ├─ buildForgePrompt() (Nova → FORGE.md → Anti-Patterns → Memory)
            │           │   ├─ spawnAgent('forge') → ACP
            │           │   ├─ verifyAgentAlive() (async, await sleep)
            │           │   ├─ pollWithRateLimitRecovery() → pollStatus → pollGeneric
            │           │   └─ killAgent('forge')
            │           │
            │           ├─ FORGE-ONLY PASS (if 'buster' ∉ stages)
            │           │   └─ gitCommitAndPush → PASS
            │           │
            │           ├─ BUSTER-ONLY PROMOTION (if 'forge' ∉ stages)
            │           │   └─ PENDING → READY_FOR_TESTING
            │           │
            │           ├─ PRE-CHECK (if 'forge' + 'buster' in stages, v6)
            │           │   └─ runPreCheck() → generateLintReport(tier: pre-check)
            │           │       → PASS → continue to GIT SYNC
            │           │       → FAIL → handleFail(phase: 'pre_check') → Forge retry
            │           │       → TOOL CRASH → skip, continue to GIT SYNC
            │           │
            │           ├─ GIT SYNC (if 'buster' in stages)
            │           │   └─ gitSyncBeforeBuster() + forge_diff_stat capture
            │           │
            │           └─ BUSTER PHASE (if 'buster' in stages)
            │               ├─ readBusterInstructions() + commit hash injection
            │               ├─ archiveModuleCompletions()
            │               ├─ spawnAgent('buster') → Redis (module_test)
            │               ├─ pollDualWithRateLimitRecovery() → pollDual → pollGeneric
            │               └─ killAgent('buster')
            │
            └─ type: 'done' → Discord "Pipeline Complete" → EXIT_OK
               (non-OK exit → Discord "Pipeline halted" with exit code label)
```

---

## 37. Abhängigkeitsgraph der Funktionen

### Aufrufe (pro Funktion → ruft auf)

| Funktion | Ruft auf |
|----------|----------|
| `loadConfig` | `execFileSync`, `validateConfig` |
| `validateConfig` | `validateSafePath` |
| `saveStatus` | `fs.writeFileSync` (tmp), `fs.renameSync` (atomic), `gitCommitQuiet` |
| `gitCommitAndPush` | `gitExec(add, commit)`, `invalidateHeadHash`, `gitPullBeforePush`, `gitPushWithRetry` |
| `releaseBlueprint` | `gitExec(cat-file)`, `gitCommitAndPush` |
| `spawnAcpAgent` | `tmpFile`, `clawExec`, `trackAgent` |
| `killAcpAgent` | `clawExec`, `untrackAgent` |
| `spawnReviewerAgent` | `tmpFile`, `clawExec`, `trackAgent` |
| `killReviewerAgent` | `clawExec`, `untrackAgent` |
| `buildBusterPayload` | `completionStreamKey`, `relPath`, `modulePath`, `gateStatusPath` |
| `pollGeneric` | `sleep`, `gitPullForPolling` |
| `pollStatus` | `pollGeneric`, `loadStatus` |
| `pollDual` | `pollGeneric`, `readCompletionFromRedis`, `loadStatus`, `mapRedisStatus` |
| `pollForAllFiles` | `pollGeneric` |
| `withRateLimitRecovery` | `handleRateLimit` |
| `pollForSessionEnd` | `sleep`, `gitPullForPolling`, `clawExec`, `headHash`, `invalidateHeadHash`, `gitExec(add, status, commit)` |
| `handleFail` | `decayRecalledMemories`, `feedbackMemory`, `saveStatus`, `discord`, `buildNovaEscalation` |
| `buildForgePrompt` | `readForgeInstructions`, `recallForModule`, `relPath`, `modulePath`, `statusPath` |
| `executeModuleAttempt` | `releaseBlueprint`, `buildForgePrompt`, `spawnAgent`, `verifyAgentAlive`, `pollWithRateLimitRecovery`, `runPreCheck`, `archiveModuleCompletions`, `gitSyncBeforeBuster`, `pollDualWithRateLimitRecovery`, `handleFail`, `feedbackMemory`, `killAgent`, `gitCommitAndPush` |
| `generateLintReport` | `validateSafePath`, `nodeExec`, `tmpFile`, `relPath`, `modulePath` |
| `formatLintErrors` | — (pure formatter) |
| `formatLintReportForReviewer` | — (pure formatter) |
| `runPreCheck` | `generateLintReport`, `formatLintErrors` |
| `_runBusterGateOnce` | `spawnAgent` (gate_test), `pollGeneric`, `killAgent`, `headHash` |
| `runBusterGate` | `_runBusterGateOnce`, `extractGateIssues`, `buildGateFixPrompt`, `spawnAgent`, `verifyAgentAlive`, `pollForSessionEnd`, `killAgent`, `gitCommitAndPush`, `gateStatusPath`, `discord` |
| `_runReviewOnce` | `generateLintReport`, `formatLintReportForReviewer`, `readGateInstructions`, `reviewOutputPath`, `spawnReviewerAgent`, `pollForFile`, `killReviewerAgent`, `gitCommitAndPush` |
| `runReviewGate` | `resolveReviewConfig`, `_runReviewOnce`, `extractReviewIssues`, `buildReviewFixPrompt`, `cleanupReviewFiles`, `spawnAgent`, `verifyAgentAlive`, `pollForSessionEnd`, `killAgent`, `gitCommitAndPush`, `discord` |
| `runGate` | `runBusterGate`, `runReviewGate` |
| `runPipeline` | `findNextStep`, `runModule`, `runGate`, `discord` |
| `findNextStep` | `loadStatus`, `gateStatusPath` |

### Globaler State

| Variable | Gesetzt durch | Genutzt durch |
|----------|---------------|---------------|
| `_tmpDir` | `initTempDir()` | `tmpFile()`, `cleanupTempDir()`, `process.on('exit')` |
| `_shutdownState` | `trackAgent`, `untrackAgent`, `setShutdownContext`, `clearShutdownContext` | Shutdown-Handler |
| `RUN_ID` | Initialisierung (const) | `log()`, `discord()` |
| `LOG_MODULE` / `LOG_PHASE` | `runModule()`, `executeModuleAttempt()` | `log()` |
| `_headHashCache` / `_repoRoot` | `loadConfig()`, `headHash()` | `headHash()`, `gitExec` |
| `_memoryModule` | `getMemoryModule()` | Memory-Funktionen |
| `_redisModule` | `getRedisModule()` | `readCompletionFromRedis`, `archiveModuleCompletions` |

---

## 38. Systemübergreifende Architektur

### Betroffene Dateien

| Datei | Rolle | Version |
|-------|-------|---------|
| `pipeline.js` | Orchestrator (in Nova) | v7 (4511 Zeilen) |
| `lint-report.js` | Statische Analyse Aggregator | v1 (1073 Zeilen) |
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

### File Naming Convention (Review Gates)

```
.swarm/echo-reviews/
├── MIDPOINT-REVIEW-INSTRUCTIONS.md        ← Input (Architecture Branch)
├── echo-opus-MIDPOINT-REVIEW.json         ← Reviewer Output (v6: single reviewer)
└── MIDPOINT-REVIEW.json                   ← Gate Output (copy of reviewer output)
```

Pattern: `{reviewer.label}-{gate.review_name}.json`

**v6-Änderung:** Nur noch 1 Reviewer-Output statt N. Kein Merge-Schritt. Reviewer-Output wird direkt als Gate-Output kopiert.

### Content-Aware Gate-Completion

Alle Gate-Output-File-Checks (findNextStep, runBusterGate, runReviewGate, checkDependencies) sind Content-aware:

| Output-File Status | Interpretation |
|---|---|
| File nicht vorhanden | Gate nicht abgeschlossen → run |
| JSON mit `status: "PASS"` / `"GO"` / `"OK"` | Gate erfolgreich → skip |
| JSON mit `status: "FAIL"` / `"ISSUES_FOUND"` | Buster-Gate fehlgeschlagen → re-run |
| JSON mit `status: "NO-GO"` | Review-Gate fehlgeschlagen → re-run |
| Non-JSON (z.B. Markdown) | Abgeschlossen → skip |
| `gate-status.json` mit PASS/OK | Fallback-Signal → skip (v4-Neu) |

---

## 39. lint-report.js Referenz

**Datei:** `/app/skills/lint-report.js` (1073 Zeilen)
**Typ:** ES Module (Node.js)
**Zweck:** Deterministischer Static-Analysis-Aggregator — läuft Tools, aggregiert Findings, schreibt JSON-Report
**Aufrufer:** `pipeline.js` (via `generateLintReport()`) oder CLI

### CLI

```
node lint-report.js --repo /workspace/forgestack --tier full --output /tmp/report.json
node lint-report.js --repo /workspace/forgestack --tier pre-check --module-path Projects/kubecommand/src/modules/06
node lint-report.js --repo /workspace/forgestack --changed-files "src/handler.ts,src/auth.ts"
```

### Tool-Registry (14 Tools, 2 Tiers)

| Tool | Binary | Sprache | Tier | Detection |
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

### Projekt-Typ-Detection

Automatisch via Marker-Files: `tsconfig.json`, `package.json`, `pyproject.toml`, `requirements.txt`, `Chart.yaml`, `Dockerfile`, `*.sh`, `*.yaml`. Mehrere Typen gleichzeitig möglich (Full-Stack).

### Output-Schema

```json
{
  "project": "kubecommand",
  "scope": "module-06",
  "timestamp": "...",
  "tier": "full",
  "changed_files": [],
  "detected_types": ["typescript", "python", "yaml"],
  "tools": {
    "<tool_id>": {
      "status": "ok | error | skipped",
      "errors": 3,
      "warnings": 5,
      "findings": [
        { "file": "...", "line": 42, "column": 1, "severity": "error", "code": "TS2345", "message": "..." }
      ],
      "duration_ms": 1234
    }
  },
  "summary": {
    "total_errors": 15,
    "total_warnings": 5,
    "tools_ok": 10,
    "tools_skipped": 3,
    "tools_failed": 1
  }
}
```

### Graceful Degradation

- Tool nicht in PATH → `status: "skipped"` mit Reason
- Tool-Timeout → `status: "error"` mit Timeout-Meldung
- Tool-Crash → `status: "error"` mit Error-Message
- Output unparseable → `{ errors: 0, warnings: 0, findings: [] }` (leere Findings statt Crash)
- Gesamtes Script crasht → Caller (runPreCheck / _runReviewOnce) degraded graceful

### Exit-Code

`0` wenn keine Errors, `1` wenn Errors gefunden. Wird von `runPreCheck` ausgewertet.

### Exports

```javascript
export { runAllTools, detectProjectTypes, TOOL_REGISTRY, TIERS };
export default main;
```

Kann direkt importiert werden (`import { runAllTools } from './lint-report.js'`) oder via CLI.

---

## 40. Changelog v4 → v5

### Designprinzip

| Prinzip | Beschreibung |
|---------|-------------|
| **Agent-Git-Entkopplung** | Agents kennen Git nicht. Kein `git add`, `commit`, `push`, `pull` in Agent-Prompts. Pipeline und Processor-Sidecar übernehmen alle Git-Operationen. `pollForSessionEnd` committed Agent-Output nach Session-Ende. |

### Agent-Prompt-Enrichment

| Änderung | Beschreibung |
|----------|-------------|
| **Forge Context Block** | `buildForgePrompt` injiziert strukturierten Kontext-Header: Project, Module Path, Status JSON, Repo Root, CWD, Current Status, Attempt X/Y, Stages, Last Forge Commit. ~80-100 Tokens die Orientierungs-Commands eliminieren. |
| **Buster Test-Target-Enrichment** | Module-Tests erhalten Module Path, Status JSON Path, forge_diff_stat, Completion Protocol mit erwarteten JSON-Formaten. Pfade immer da (auch buster-only), Commit/Diff conditional. |
| **Buster Completion Protocol** | Expliziter Hint mit erwartetem `{ "status": "PASS", "completion_summary": "..." }` / `{ "status": "FAIL", "reason": "..." }` Format. Verweis auf redis.js für Completion-Signal. |
| **Gate-Fix-Prompt-Enrichment** | `buildGateFixPrompt(config, gate, issues, attempt, maxAttempts, fixHistory)` — neue Signatur. Kontext-Header (Project, Working Directory, Repo Root) + Anti-Pattern-Block aus fixHistory. |
| **Review-Fix-Prompt-Enrichment** | `buildReviewFixPrompt(config, gate, issues, attempt, maxAttempts, fixHistory)` — identische Erweiterung für Review-Fixes. |
| **Git-Referenzen entfernt** | Alle `git push`, `git commit`, `git add`, `git pull` Anweisungen aus Agent-Prompts entfernt. Agents fokussieren sich nur auf ihre Aufgabe. |

### Robustheit

| Änderung | Beschreibung |
|----------|-------------|
| **pollForSessionEnd Change-Detection** | Zwei-Phasen-Erkennung: (1) `git add -A` → `git status --porcelain` → Pipeline committed uncommitted Output, (2) HEAD-Diff als Fallback. Agents brauchen kein Git. |
| **Timeout-Nudge** | `pollForSessionEnd` sendet bei `session_nudge_threshold` (Default 75%) einen einmaligen Steer an den Agent: "TIMEOUT WARNING: ~X minutes remaining." Konfigurierbar via `swarm.config.json`. |
| **releaseBlueprint EXIT_NEEDS_NOVA** | Blueprint-Fehler (fehlender Branch, Fetch-Error) → `EXIT_NEEDS_NOVA` statt `EXIT_ERROR`. Enthält `resume_command` für Nova. |
| **--repo / REPO_ROOT** | Pipeline kann von außerhalb des Repos gestartet werden. Repo-Root via `--repo <path>` CLI-Flag oder `REPO_ROOT` env. `.git`-Validierung bei explizitem Pfad. `loadConfig(project, { repoRoot })` neue Signatur (rückwärtskompatibel). |

### Hardening

| Änderung | Beschreibung |
|----------|-------------|
| **handleFail Single-Save** | BLOCKED-Pfad setzt FAIL + BLOCKED in einem `saveStatus`-Aufruf statt zwei. Eliminiert redundanten Git-Commit. |
| **gitCommitQuiet --allow-empty entfernt** | "Nothing to commit" wird still ignoriert (Regex-Match). Keine leeren Commits mehr. `invalidateHeadHash()` wird nur bei tatsächlichem Commit aufgerufen (Bugfix: vorher fälschlich bei No-Op). |

### Observability

| Änderung | Beschreibung |
|----------|-------------|
| **Pipeline-Start Discord** | Zeigt `"Full pipeline: 5/12 modules pending, 3 gate(s)"` statt `"Full pipeline run"`. |
| **findNextStep Logging** | FAIL-Module: `"Module X is FAIL (N attempts) — will retry"`. Resumed Module: `"Module X resuming from IN_PROGRESS"`. |
| **Attempt-Start-Log** | `executeModuleAttempt` loggt Status, fail_count und Stages beim Eintritt. |
| **Gate Rate-Limit-Log** | Attempt-Counter explizit im Cooldown-Complete-Log. |
| **Discord bei Gate-Fix-Timeout/Crash** | Alle drei Fix-Lifecycles (Buster-Gate, fix_and_continue, fix_and_rereview) senden Discord WARN bei Timeout oder No-Changes. Unterscheidet "timeout" vs "no changes (crashed?)". |
| **PollResult JSDoc** | `ok=true` bedeutet "terminaler Status erreicht" (nicht "PASS"). Reason-Enum vollständig dokumentiert. |

### Fix-History-Tracking

| Lifecycle | Tracking |
|-----------|----------|
| `runBusterGate` | `fixHistory[]` mit `{ attempt, hasChanges, issues }` → `buildGateFixPrompt` |
| `runReviewGate` (fix_and_continue) | `fixHistory[]` mit `{ attempt, hasChanges, issues }` → `buildReviewFixPrompt` |
| `runReviewGate` (fix_and_rereview) | `fixHistory[]` mit `{ attempt, hasChanges, currentIssues }` → `buildReviewFixPrompt` |

---

## 41. Changelog v5 → v6

### Designprinzip

| Prinzip | Beschreibung |
|---------|-------------|
| **Tool-First Review** | Mechanische Code-Checks (Type-Errors, Lint, Security, Unused Code) werden von deterministischen Tools erledigt, nicht von LLM-Agents. Echo wird zum Architektur-Reviewer mit Lint-Report als Input. |
| **Pre-Check** | Schnelle statische Analyse nach Forge, vor Buster. Fängt Type-Errors in Sekunden statt nach 45-Minuten-Buster-Cycle. |

### Neue Dateien

| Datei | Beschreibung |
|-------|-------------|
| **lint-report.js** | Standalone Static-Analysis-Aggregator. 14 Tools, 2 Tiers (pre-check + full). Projekt-Typ-Detection, Per-Tool Timeout/Graceful-Degradation, JSON-Output. 1073 Zeilen. |
| **.semgrep.yml** | Curated Semgrep-Ruleset. JS/TS (eval, shell-injection, hardcoded secrets, console.log), Python (bare except, SQL injection, compare_digest, subprocess shell=True, requests timeout), K8s (privileged containers, resource limits, RBAC wildcards). |

### Neue Funktionen in pipeline.js

| Funktion | Beschreibung |
|----------|-------------|
| **generateLintReport()** | Shared Core für alle lint-report.js Aufrufe. Akzeptiert `tier`, `moduleDir`, `forgeDiffStat`, `timeoutMs`. Returns `{ report, error }`. Graceful Degradation bei Crash. |
| **formatLintErrors()** | Formatiert Lint-Errors als Markdown für Anti-Pattern-Block (handleFail). Gruppiert nach Tool, gekappt bei 20 pro Tool. |
| **formatLintReportForReviewer()** | Formatiert vollständigen Lint-Report als strukturierten Block für Reviewer-Prompt. Icons (✅ 🔴 🟡 ❌), gekappt bei 30 pro Tool. |
| **runPreCheck()** | Tier-1-Check nach Forge-Complete, vor Git-Sync. Bei Errors → handleFail(phase: 'pre_check'). Bei Tool-Crash → skip. Konfigurierbar via `config.pre_check`. |

### Review-Gate-Refactor

| Änderung | Beschreibung |
|----------|-------------|
| **_runReviewOnce Redesign** | Lint-Report (Tier 2) → 1 Reviewer (statt N parallel) → pollForFile (statt pollForAllFiles) → Parse JSON. |
| **resolveReviewConfig** | Neues `lintTier` Feld (Default: `'full'`). `merge_script` komplett entfernt. |
| **Reviewer-Prompt** | Instructions + `formatLintReportForReviewer()` + Output-Schema (JSON: `{ status, critical_issues, deferred_issues, summary }`). |
| **Reviewer-Output** | JSON statt Markdown. Direkt parsebar von `extractReviewIssues()` für Forge Fix-Loops. |
| **Entfernte Komplexität** | Paralleler Spawn (N→1), `pollForAllFiles` (→ `pollForFile`), `merge-reviews.js` (komplett entfernt), `_parseIndividualReviews` (komplett entfernt), `merge_script` Config-Feld (komplett entfernt). |

### Blueprint-Manager

| Änderung | Beschreibung |
|----------|-------------|
| **Stage-Aware releaseBlueprint** | `releaseBlueprint(config, moduleId, moduleDir, stages)` — neuer `stages` Parameter. Verifiziert nur Files die von den konfigurierten Stages benötigt werden. `stages: ['buster']` → nur BUSTER.md, nicht FORGE.md. Default-Parameter für Rückwärtskompatibilität. |

### Konfiguration

| Änderung | Beschreibung |
|----------|-------------|
| **pre_check Section** | Neue Config-Section: `enabled`, `lint_report_path`, `timeout_seconds`. Kill-Switch für Pre-Check. |
| **review_defaults.lint_tier** | Neues Feld. Steuert welcher lint-report.js Tier vor Review-Gates läuft. Default: `'full'`. |
| **review_defaults.merge_script** | Komplett entfernt (war `'echo-reviews/merge-reviews.js'`). Kein Merge-Schritt mehr nötig bei Single-Reviewer. |
| **review_defaults.reviewers** | Empfehlung: 1 Reviewer (echo-opus) statt 3 parallele. |

### Pipeline-Flow (Pre-Check-Insertion)

```
Forge Complete (READY_FOR_TESTING)
  → PRE-CHECK (tsc + ruff + shellcheck)     ← v6-NEU
    → FAIL → handleFail(phase: 'pre_check') → Forge Retry (kein Buster!)
    → PASS → gitSyncBeforeBuster → Buster Phase
```

### Exports

| Funktion | Neu |
|----------|-----|
| `runPreCheck` | v6 |
| `generateLintReport` | v6 |
| `formatLintReportForReviewer` | v6 |

---

## 42. Changelog v6 → v7

### Designprinzip

| Prinzip | Beschreibung |
|---------|-------------|
| **Pipeline-Integritäts-Hardening** | Alle Retry-Counter, Status-Checks und Poll-Pfade wurden auf Symmetrie und Vollständigkeit geprüft. Fehlende Catch-Alls, steckengebliebene Counter und stale Files wurden als kritische Bugs identifiziert und behoben. |
| **Defense-in-Depth bei Agent-Output** | Drei Verteidigungsschichten gegen fehlerhafte Agent-Writes: (1) Prompt instruiert Read-then-Merge, (2) `loadStatus` mergt Defaults, (3) `fail_count++` ist unconditional. |
| **Direct-Import statt Script-Generierung** | Redis-Completion-Operationen nutzen Direct-Import von redis.js statt per-Cycle generierter Inline-CJS-Scripts. Eliminiert ~90 Temp-Files und ~90 Node-Subprocesses pro Buster-Phase. |

### Kritische Bugfixes

| Fix | Schweregrad | Beschreibung |
|-----|-------------|-------------|
| **K1: Endlos-Retry-Loop** | 🔴 KRITISCH | `handleFail` inkrementiert `fail_count` jetzt **unconditional** — nicht mehr nur innerhalb des `if (reason)` Guards. Caller verwenden `extractAgentFailReason()` statt `null`. Verhindert unbegrenzten Token-Burn durch steckengebliebenen Counter. |
| **K2: Buster Catch-All** | 🔴 KRITISCH | Buster `!result.ok` Block hat jetzt einen Catch-All (wie Forge). Status-Check behandelt `BLOCKED` neben `FAIL`. Verhindert `EXIT_ERROR` statt `EXIT_BLOCKED` bei unbehandelten Poll-Reasons. |
| **K3: Stale Review-Output** | 🔴 KRITISCH | `_runReviewOnce` löscht stale Reviewer-Output vor dem Spawn. Verhindert sofortiges Zurücklesen alter NO-GO-Reviews. |

### Hohe Priorität

| Fix | Schweregrad | Beschreibung |
|-----|-------------|-------------|
| **H1: Stale Gate-Output** | 🟠 HOCH | `runBusterGate` löscht output_file + gate-status.json vor dem Main-Loop. Verhindert Phantom-Failure durch alte FAIL-Files. |
| **H2: Agent-Overwrite-Schutz** | 🟠 HOCH | `loadStatus` mergt `STATUS_DEFAULTS` auf geparste Objekte. Schützt gegen Agent-Overwrites von status.json mit minimalen JSON-Objekten. |

### Mittlere Priorität & Cleanup

| Fix | Schweregrad | Beschreibung |
|-----|-------------|-------------|
| **M1: depends_on Guard** | 🟡 MITTEL | `mod.depends_on \|\| []` in `checkDependencies` — Module ohne depends_on crashen nicht mehr. |
| **M2: Toter ..-Check** | 🟡 NIEDRIG | Unerreichbarer Path-Traversal-Check nach `path.resolve()` entfernt. Kommentar erklärt warum Prefix-Allowlist die Security-Boundary ist. |

### Prompt & Dokumentation

| Fix | Typ | Beschreibung |
|-----|-----|-------------|
| **O1: Lint-Scope-Dokumentation** | 📝 DOC | Review-Gate Lint-Report ist intentionell projekt-scoped (kein moduleDir). Kommentar in `_runReviewOnce` eingefügt. |
| **O3: Completion Protocol** | 📝 PROMPT | "update" → "Read existing JSON, set ONLY these fields, do NOT overwrite." Keine vollständigen JSON-Beispiel-Objekte mehr die LLMs als Overwrite-Template interpretieren. Defense-in-Depth mit H2. |

### Refactoring

| Änderung | Beschreibung |
|----------|-------------|
| **O2: Redis Direct-Import** | `readCompletionFromRedis` und `archiveModuleCompletions` nutzen Direct-Import von redis.js via `getRedisModule()` (cached, analog zu `getMemoryModule`). Eliminiert ~90 Temp-Files + ~90 Node-Subprocesses pro Buster-Phase. `redisConnectionBlock()` und alle Inline-CJS-Script-Generierung komplett entfernt. Bei Import-Fehler: Graceful Degradation auf Git-only-Polling. |
| **redis.js v2** | Zwei neue Funktionen im `lib`-Objekt: `readCompletion(streamKey, moduleId)`, `archiveCompletions(streamKey, archiveStreamKey, moduleId, maxLen)`. Bestehende API (`sendTask`, `readMyTasks`, `disconnect`, `client`) unverändert. |

### Neue Funktionen in pipeline.js

| Funktion | Beschreibung |
|----------|-------------|
| `extractAgentFailReason(status, phase)` | Extrahiert Agent-Failure-Reason aus status.json History/completion_summary. Priorität: Agent-History-Entry → completion_summary → generischer Fallback. |
| `getRedisModule(config)` | Cached Direct-Import von redis.js. Löst Pfad aus `agents.*.redis_js_path` auf. Null bei Fehler (Graceful Degradation). |

### Entfernte Funktionen / Code

| Entfernt | Grund |
|----------|-------|
| `redisConnectionBlock()` | Ersetzt durch Direct-Import von redis.js |
| Inline-CJS-Script-Generierung (Redis) | Ersetzt durch `redis.js` Funktionen `readCompletion` / `archiveCompletions` |
| `..`-Check in `validateSafePath` | Toter Code — `path.resolve()` eliminiert alle `..`-Segmente |
| `fail_summaries.length > 0 ? null : '...'` Pattern | Ersetzt durch `extractAgentFailReason()` in allen Callern |

### Exports (Änderungen)

| Funktion | Status |
|----------|--------|
| `runPreCheck` | v6 (unverändert) |
| `generateLintReport` | v6 (unverändert) |
| `formatLintReportForReviewer` | v6 (unverändert) |
| `extractAgentFailReason` | Nicht exportiert (pipeline-intern) |
| `getRedisModule` | Nicht exportiert (pipeline-intern) |
