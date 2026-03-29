# PIPELINE — Vollständige Architektur- und Referenzdokumentation (v9)

**Architektur:** Modulares ES-Modul-System (Node.js)
**Zweck:** Deterministischer Swarm-Orchestrator für die KubeClaw-Multi-Agent-Plattform
**Aufrufer:** Nova (Opus-Orchestrator) oder direkt über die Kommandozeile
**Version:** v9 — Modulare-Architektur + Telemetrie + ACP-Prozess-Bereinigung
**Shim-Ort:** `/app/skills/nova/pipeline.js` (≤25 Zeilen — Kompatibilitäts-Shim)
**Modul-Verzeichnis:** `/app/skills/nova/pipeline/`
**Begleitdateien:** `/app/skills/lint-report.js` (Statische-Analyse-Aggregator), `/app/skills/redis.js` (Redis-Client + Completion-Stream)

---

## Inhaltsverzeichnis

1. [Überblick und Designphilosophie](#1-überblick-und-designphilosophie)
   - 1a. [Modulare Architektur](#1a-modulare-architektur)
2. [Exit-Codes und Status-Modell](#2-exit-codes-und-status-modell)
3. [Konfigurationssystem](#3-konfigurationssystem)
4. [Modulstruktur und öffentliche Schnittstellen](#4-modulstruktur-und-öffentliche-schnittstellen)
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
17. [Agent-Dispatch-System (Dual-Modus)](#17-agent-dispatch-system-dual-modus)
18. [Session-End-Polling (Forge-Fix-Zyklen)](#18-session-end-polling-forge-fix-zyklen)
19. [Datei-Leser](#19-datei-leser)
20. [Buster-Prompt-Aufbau](#20-buster-prompt-aufbau)
21. [Qdrant-Memory-Anbindung](#21-qdrant-memory-anbindung)
22. [Polling-System (Konsolidiert)](#22-polling-system-konsolidiert)
23. [Rate-Limit-Behandlung](#23-rate-limit-behandlung)
24. [Redis-Completion-Stream (Buster)](#24-redis-completion-stream-buster)
25. [Git-Sync (Forge → Buster-Übergabe)](#25-git-sync-forge--buster-übergabe)
26. [Dependency-Prüfung (Inhaltsbasiert)](#26-dependency-prüfung-inhaltsbasiert)
27. [Fehlerbehandlung](#27-fehlerbehandlung)
28. [Lint-Report-Integration](#28-lint-report-integration)
29. [Pre-Check (Forge-Ausgabe-Validierung)](#29-pre-check-forge-ausgabe-validierung)
30. [Forge-Prompt-Zusammensetzung](#30-forge-prompt-zusammensetzung)
31. [Modul-Runner (Stage-bewusst)](#31-modul-runner-stage-bewusst)
32. [Gate-Dispatcher](#32-gate-dispatcher)
33. [Buster-Gate-Runner (mit Fix-Loop)](#33-buster-gate-runner-mit-fix-loop)
34. [Review-Gate-Runner (Lint-Report + Einzelreviewer)](#34-review-gate-runner-lint-report--einzelreviewer)
35. [Pipeline-Runner](#35-pipeline-runner)
36. [Status-Ausgabe und Dry-Run](#36-status-ausgabe-und-dry-run)
37. [CLI-Wrapper und Einstiegspunkt](#37-cli-wrapper-und-einstiegspunkt)
38. [Exports](#38-exports)
39. [Vollständiger Ablaufgraph](#39-vollständiger-ablaufgraph)
40. [Abhängigkeitsgraph der Funktionen](#40-abhängigkeitsgraph-der-funktionen)
41. [Systemübergreifende Architektur](#41-systemübergreifende-architektur)
42. [Pipeline-Telemetrie](#42-pipeline-telemetrie)
43. [v9 Neue Funktionen](#43-v9-neue-funktionen)
44. [lint-report.js-Referenz](#44-lint-reportjs-referenz)
45. [Änderungsprotokoll v8 → v9](#45-änderungsprotokoll-v8--v9)

---

## 1. Überblick und Designphilosophie

### Kernkonzept

Die Pipeline ist der deterministische Orchestrator des KubeClaw Swarm. Sie wird von Nova aufgerufen, um den Modul-Pipeline-Ablauf autonom abzuwickeln. Auf dem Happy-Path läuft alles automatisch durch. Bei Fehlern wird mit strukturiertem JSON beendet, sodass Nova den Fehler analysieren und einen neuen Anlauf starten kann.

### Kill-and-Respawn-Strategie

Das zentrale Designprinzip ist **Kill-and-Respawn**: Frische Agenten mit besseren Prompts übertreffen veraltete Agenten mit überfüllten Kontext-Fenstern. Bei jedem Phasenwechsel oder Fehler wird die Agent-Session zerstört und eine neue gestartet.

### Deklarative Steuerung

`execution_order` in `progress.json` ist die **einzige Wahrheit**. Die Pipeline macht nichts Implizites — kein Gate-Nesting, keine versteckten Auslöser. Was in execution_order steht, wird ausgeführt. Was nicht drin steht, existiert nicht. Modul-`stages` bestimmen welche Phasen laufen (`['forge', 'buster']` Standard).

### Agent-Lebenszyklus

- **PASS** → Agent-Session wird zerstört, neuer Agent für nächstes Modul
- **FAIL** → Agent-Session wird zerstört, Nova analysiert, neuer Agent für Wiederholung
- **TIMEOUT** → Agent-Session wird zerstört, behandelt wie FAIL

### Agent-Git-Entkopplung

Agenten kennen Git nicht. Sie schreiben Dateien und fokussieren sich auf ihre Aufgabe. Alles was zwingend nötig ist (commit, push, pull) wird von der Pipeline oder dem Processor-Sidecar erledigt:

| Agent | Git-Verantwortung | Wer committet | Wer pusht |
|-------|-------------------|---------------|-----------|
| Forge (Modul) | Keine | Pipeline (`pollForSessionEnd`) | Pipeline (`gitSyncBeforeBuster`) |
| Forge (Gate-Fix) | Keine | Pipeline (`pollForSessionEnd`) | Pipeline (`gitCommitAndPush`) |
| Echo (Reviewer) | Keine | Pipeline (`_runReviewOnce`) | Pipeline (`gitCommitAndPush`) |
| Buster (Modul) | status.json schreiben | redis.js (`verify-task.js`) | redis.js |
| Buster (Gate) | output_file schreiben | redis.js | redis.js |

Grundsatz: Was ein Script deterministisch erledigen kann, darf nicht dem Agenten überlassen werden. Agenten vergessen Anweisungen; Scripts nicht.

### Aufrufarten

```
node pipeline.js --project kubecommand --repo /workspace/forgestack   # Volle Pipeline (Repo explizit)
node pipeline.js --project kubecommand                    # Volle Pipeline (Repo auto-erkennen)
node pipeline.js --project kubecommand --module 06        # Einzelmodul
node pipeline.js --project kubecommand --resume           # Fortsetzen
node pipeline.js --project kubecommand --status           # Status-JSON
node pipeline.js --project kubecommand --dry-run          # Vorschau
node pipeline.js --project kubecommand --blueprint 06     # Blueprint veröffentlichen
node pipeline.js --project kubecommand --blueprint-list   # Verfügbare Blueprints
node pipeline.js --project kubecommand --prompt "text"    # Nova-Prompt-Überschreibung
node pipeline.js --project kubecommand --prompt-file p.md # Nova-Prompt aus Datei
```

Der Einstiegspunkt `pipeline.js` ist ein dünner Kompatibilitäts-Shim. Die eigentliche Logik liegt im Modul-Verzeichnis (`pipeline/cli.js`).

---

## 1a. Modulare Architektur

### Überblick (v9-Neu)

In v9 wurde `pipeline.js` (ehemals 4921 Zeilen monolithisch) in ein modulares System aufgeteilt. Das Ergebnis ist ein Kompatibilitäts-Shim sowie ein klar strukturiertes Verzeichnis mit Modulen nach dem Prinzip der Einzelverantwortung.

### Dateibaum

```
skills/nova/pipeline.js          ← Kompatibilitäts-Shim (≤25 Zeilen)
skills/nova/pipeline/
  core/
    config.js                    ← Konfiguration laden, validieren, REPO_ROOT
    paths.js                     ← Alle Pfad-Hilfsfunktionen
    context.js                   ← PipelineContext (ersetzt alle globalen Variablen)
    logger.js                    ← Strukturiertes Logging
    temp.js                      ← Temp-Verzeichnis-Verwaltung
  integrations/
    git.js                       ← Alle Git-Operationen
    gateway.js                   ← Gateway-Tool-API-Client
    redis.js                     ← Redis-Completion-Stream
    discord.js                   ← Discord-Webhook
  agents/
    lifecycle.js                 ← spawn / kill / steer / verify
    acp-monitor.js               ← ACP-Session-Zustand + Transcript-Überwachung
    shutdown.js                  ← Kontrolliertes Herunterfahren + ACP-Prozess-Bereinigung
  prompts/
    forge.js                     ← Forge-Prompt-Aufbau
    buster-module.js             ← Buster-Modul-Prompt-Aufbau
    buster-gate.js               ← Buster-Gate-Prompt-Aufbau
    gate-fix.js                  ← Gate-Fix-Zyklus-Prompt-Aufbau
    review.js                    ← Reviewer-Prompt-Aufbau
    shared.js                    ← Gemeinsame Prompt-Abschnitte
  services/
    status-store.js              ← status.json + Artefakt-E/A
    blueprint.js                 ← Blueprint-Veröffentlichung + Steuerdatei-Abgleich
    polling.js                   ← Alle Polling-Abläufe
    rate-limit.js                ← Rate-Limit-Wiederherstellung
    failures.js                  ← Fehler-Klassifizierung + Eskalation
    telemetry.js                 ← Event-Emission an Redis-Stream
    summary.js                   ← Pipeline-Zusammenfassung + Review-Generierung
  runners/
    module-runner.js             ← Modul-Ausführungs-Lebenszyklus
    gate-runner.js               ← Gate-Dispatcher
    buster-gate-runner.js        ← Buster-Gate-Ausführung + Fix-Loop
    review-gate-runner.js        ← Review-Gate-Ausführung
    pipeline-runner.js           ← Übergeordnete Pipeline-Schleife
  tests/                         ← Unit-Test-Dateien pro Modul
  index.js                       ← Öffentliche Exports
  cli.js                         ← CLI-Einstiegspunkt
  README.md                      ← Architektur-Überblick
```

### Shim-Mechanismus

`skills/nova/pipeline.js` re-exportiert alles aus `pipeline/index.js` und delegiert den CLI-Aufruf an `pipeline/cli.js`. Bestehende Aufrufer (`node pipeline.js --project ...`) funktionieren unverändert.

```javascript
// skills/nova/pipeline.js — Kompatibilitäts-Shim
export * from './pipeline/index.js';
export { default } from './pipeline/index.js';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { runCli } = await import('./pipeline/cli.js');
  await runCli();
}
```

### PipelineContext

Der globale Zustand aus v8 (`_shutdownState`, `_tmpDir`, `RUN_ID`, `_headHashCache` usw.) ist in `PipelineContext` (`core/context.js`) gekapselt. Jede Pipeline-Ausführung erstellt einen eigenen Kontext. Das ermöglicht parallele Läufe und vereinfacht Unit-Tests erheblich.

### Modul-Zuordnung (v8 → v9)

| v8-Funktion(sgruppe) | v9-Modul |
|---|---|
| `gitExec`, `gitPull*`, `gitPush*`, `gitCommit*` | `integrations/git.js` |
| `gatewayInvoke`, `gatewayKillSync` | `integrations/gateway.js` |
| `getRedisModule`, `archiveModuleCompletions`, `readCompletionFromRedis` | `integrations/redis.js` |
| `discord`, `curlPost` | `integrations/discord.js` |
| `spawnAcpAgent`, `killAcpAgent`, `spawnAgent`, `killAgent`, `steerAgent`, `verifyAgentAlive` | `agents/lifecycle.js` |
| `registerShutdownHooks`, `trackAgent`, `untrackAgent`, `setShutdownContext` | `agents/shutdown.js` |
| `buildForgePrompt` | `prompts/forge.js` |
| `buildBusterModulePrompt`, `buildBusterCompletionProtocol` | `prompts/buster-module.js` |
| `buildBusterGatePrompt`, `buildBusterGateCompletionProtocol` | `prompts/buster-gate.js` |
| `buildGateFixPrompt` | `prompts/gate-fix.js` |
| `buildReviewerPrompt` | `prompts/review.js` |
| `buildTestWorkspaceSection` | `prompts/shared.js` |
| `loadStatus`, `saveStatus`, `initStatus`, `addHistory` | `services/status-store.js` |
| `releaseBlueprint`, `listBlueprints` | `services/blueprint.js` |
| `pollGeneric`, `pollStatus`, `pollDual`, `pollForFile`, `pollForSessionEnd` | `services/polling.js` |
| `handleRateLimit`, `withRateLimitRecovery` | `services/rate-limit.js` |
| `handleFail`, `extractAgentFailReason`, `buildNovaEscalation` | `services/failures.js` |
| `emitTelemetryEvent` | `services/telemetry.js` |
| `generatePipelineSummary`, `generateReview` | `services/summary.js` |
| `runModule`, `executeModuleAttempt` | `runners/module-runner.js` |
| `runGate` | `runners/gate-runner.js` |
| `runBusterGate`, `_runBusterGateOnce` | `runners/buster-gate-runner.js` |
| `runReviewGate`, `_runReviewOnce` | `runners/review-gate-runner.js` |
| `runPipeline`, `findNextStep` | `runners/pipeline-runner.js` |
| `loadConfig`, `validateConfig`, `loadProgress` | `core/config.js` |
| `modulePath`, `statusPath`, `relPath`, `completionStreamKey` | `core/paths.js` |
| `log`, `output` | `core/logger.js` |
| `initTempDir`, `cleanupTempDir`, `tmpFile` | `core/temp.js` |

---

## 2. Exit-Codes und Status-Modell

### Exit-Codes

| Code | Konstante          | Bedeutung                                              |
|------|--------------------|--------------------------------------------------------|
| `0`  | `EXIT_OK`          | Pipeline/Modul erfolgreich abgeschlossen               |
| `1`  | `EXIT_ERROR`       | Konfigurations- oder Systemfehler                      |
| `10` | `EXIT_NEEDS_NOVA`  | Modul/Gate fehlgeschlagen, Nova muss analysieren       |
| `20` | `EXIT_BLOCKED`     | Max. Wiederholungen überschritten, Eingriff erforderlich |
| `30` | `EXIT_TIMEOUT`     | Agent hat nicht innerhalb des Zeitlimits reagiert      |
| `40` | `EXIT_RATE_LIMITED` | Rate-Limit-Pausen überschritten                       |

### Status-Aufzählung

| Status              | Bedeutung                                                      |
|---------------------|----------------------------------------------------------------|
| `PENDING`           | Modul initialisiert, noch nicht gestartet                      |
| `IN_PROGRESS`       | Forge arbeitet am Modul                                        |
| `READY_FOR_TESTING` | Forge fertig, bereit für Buster                                |
| `TESTING`           | Buster testet das Modul                                        |
| `PASS`              | Alle Tests bestanden                                           |
| `FAIL`              | Phase fehlgeschlagen, Wiederholung möglich                     |
| `BLOCKED`           | Max. Wiederholungen überschritten, Pipeline gestoppt           |
| `RATE_LIMITED`      | Upstream-API-Limit erreicht, Pipeline pausiert                 |

---

## 3. Konfigurationssystem

### Drei Quellen

```
/app/config/swarm.config.json              ← Plattform (einmal pro Installation)
<repo>/Projects/<project>/src/.swarm/progress.json  ← Projekt (einzige Wahrheit)
Repo-Root                                  ← CLI/Env/Auto-Erkennung
```

### Repo-Root-Auflösung

Die Pipeline kann von überall gestartet werden. Der Repo-Root wird in dieser Reihenfolge aufgelöst:

| Priorität | Quelle | Beispiel |
|-----------|--------|---------|
| 1 | `--repo <Pfad>` CLI-Flag | `--repo /workspace/forgestack` |
| 2 | `REPO_ROOT` Umgebungsvariable | `REPO_ROOT=/workspace/forgestack` |
| 3 | `git rev-parse --show-toplevel` | Auto-Erkennung (nur wenn CWD im Repo) |

Validierung: Das `.git`-Verzeichnis muss existieren, sonst sofortiger Fehler.

### swarm.config.json (Plattform-Ebene)

Enthält alles was für ALLE Projekte identisch ist:

| Bereich | Felder |
|---------|--------|
| Discord | `discord_webhook_url`, `discord_alerts` |
| Polling | `poll_interval_seconds`, `default_timeout_minutes`, `default_max_fails` |
| Session-Nudge | `session_nudge_threshold` (Standard: 0.75 = 75% des Timeouts) |
| Wiederholung | `auto_retry_threshold` |
| Rate-Limit | `rate_limit.cooldown_hours`, `rate_limit.max_pauses_per_module` |
| Memory | `memory.enabled`, `memory_js_path`, `recall_limit`, `recall_before_forge`, `feedback_after_outcome`, `targeted_decay_amount` |
| Agenten | `agents.forge`, `agents.buster`, `agents.echo` (Dispatch-Modi) |
| Modelle | `models.forge`, `models.buster`, `models.echo` (optional — Rückfall-Ebene) |
| Review-Standards | `review_defaults.reviewers`, `timeout_minutes`, `max_fix_cycles`, `lint_tier` |
| Pre-Check | `pre_check.enabled`, `pre_check.lint_report_path`, `pre_check.timeout_seconds`, `pre_check.semgrep_config_path` |
| Telemetrie | `telemetry.stream_key` (Standard: `"pipeline:events"`) |

Pfad: `SWARM_CONFIG`-Umgebungsvariable oder `/app/config/swarm.config.json`

### progress.json (Projekt-Ebene)

Enthält alles Projektspezifische:

| Bereich | Felder |
|---------|--------|
| Identität | `project`, `version` |
| Ablauf | `execution_order`, `phases` |
| Module | `modules` (mit `dir`, `title`, `stages`, `forge_model`, `forge_subagent`, `depends_on`, `substeps`, `timeout_minutes`, `max_fails`, `auto_retry_threshold`) |
| Gates | `gates` (mit `type`, `title`, `on_fail`, `on_nogo`, `instructions_file`, `output_file`, `review_name`, `review_output_dir`, `model`, `forge_model`, `max_fix_cycles`, `timeout_minutes`, `reviewers`, `lint_tier`, `auto_retry_threshold`) |
| Modelle | `models.forge`, `models.buster`, `models.echo` (Projekt-Ebene-Überschreibung) |

Pfad: `<repo>/Projects/<project>/src/.swarm/progress.json` (Konvention, nicht konfigurierbar)

### Pfad-Ableitung

Alle Pfade werden aus der Konvention abgeleitet:

```
swarm_dir     = <repoRoot>/Projects/<project>/src/.swarm
modules_dir   = <swarm_dir>/modules
progress_file = <swarm_dir>/progress.json
```

### Standard-Auflösung (null = erbe vom Standard)

Review-Gate-Felder mit `null` erben von `swarm.config.review_defaults`:

| Gate-Feld | null → Quelle |
|---|---|
| `reviewers` | `review_defaults.reviewers` |
| `timeout_minutes` | `review_defaults.timeout_minutes` |
| `max_fix_cycles` | `review_defaults.max_fix_cycles` |
| `lint_tier` | `review_defaults.lint_tier` (Standard: `"full"`) |

### auto_retry_threshold — Auflösung

`auto_retry_threshold` kann auf drei Ebenen konfiguriert werden (höhere Priorität gewinnt):

| Priorität | Quelle | Beispiel |
|-----------|--------|---------|
| 1 | `modules.<id>.auto_retry_threshold` | Modul-Überschreibung in progress.json |
| 2 | `gates.<id>.auto_retry_threshold` | Gate-Überschreibung in progress.json |
| 3 | `swarm.config.auto_retry_threshold` | Plattform-Standard (Standard: `2`) |

---

## 4. Modulstruktur und öffentliche Schnittstellen

### core/config.js

Exports: `loadConfig(projectName, opts)`, `validateConfig(config, progress)`, `loadProgress(config)`.

Ablauf von `loadConfig`:
1. Repo-Root via `--repo`-Flag / `REPO_ROOT`-Umgebungsvariable / `git rev-parse --show-toplevel`
2. swarm.config.json laden
3. Pfade aus Konvention ableiten: `Projects/<project>/src/.swarm/`
4. progress.json laden
5. Zusammenführen: swarmConfig (Basis) + project + repo_root + paths
6. Discord-Webhook-Rückfall: `DISCORD_WEBHOOK`-Umgebungsvariable
7. `validateConfig(config, progress)` → Fehler sofort beenden
8. Rückgabe `{ config, progress }`

### core/context.js

`PipelineContext` kapselt den gesamten veränderlichen Zustand einer Pipeline-Ausführung:

```javascript
{
  config,                        // Zusammengeführte Konfiguration
  progress,                      // progress.json
  tmpDir,                        // Temp-Verzeichnis-Pfad
  runId,                         // UUID für Log-Korrelation
  shutdownState: {
    config: null,
    statusDir: null,
    activeSessions: new Map(),   // Label → childSessionKey
    currentLabel: null,
  },
  headHashCache: null,
  repoRoot: null,
  memoryModule: null,
  redisModule: null,
  logModule: null,
  logPhase: null,
}
```

---

## 5. Sicherheitsschicht: Sichere Ausführungs-Wrapper

### `gitExec(repoRoot, args, opts)` — integrations/git.js

Sicherer Git-Wrapper. Nutzt `-C repoRoot` für Repository-Kontext. Standard: `encoding: 'utf8'`, `timeout: 30000`.

### `nodeExec(scriptPath, args, opts)` — core/config.js

Sicherer Node.js-Script-Wrapper. Für memory.js-CLI-Rückfall, lint-report.js und Dispatch-Scripts.

### `curlPost(url, jsonPayload, opts)` — integrations/discord.js

Sicherer Webhook-Wrapper. `stdio: 'ignore'`, `timeout: 10000`. Nur von `discord()` genutzt.

**Entscheidend:** `execFileSync` statt `execSync` — übergibt Argumente als Array direkt an den Prozess, ohne Shell. Command-Injection ist unmöglich.

---

## 6. Gateway-Tool-API (ACP-Session-Verwaltung)

### Architektur

ACP-Sessions (Forge, Echo) werden über die Gateway-Tool-API per HTTP verwaltet — **nicht** über CLI-Befehle. Das Gateway ist ein lokaler HTTP-Server, der Session-Lebenszyklus-Operationen als Tool-Invocations bereitstellt.

```
GATEWAY_URL   = http://127.0.0.1:18789/tools/invoke
GATEWAY_TOKEN = process.env.OPENCLAW_GATEWAY_TOKEN
```

Das gesamte Gateway-Modul lebt in `integrations/gateway.js`.

### `gatewayInvoke(ctx, tool, args, timeoutMs)` — integrations/gateway.js

Asynchroner HTTP-POST an die Gateway-Tool-API. Nutzt `fetch()` mit `AbortController` für Timeout. Gibt geparsten JSON oder `{ raw: text }` zurück.

**Unterstützte Tools:**

| Tool | Beschreibung |
|------|-------------|
| `sessions_spawn` | Startet eine ACP-Session mit `runtime: 'acp'` |
| `sessions_send` | Sendet eine Nachricht (Steer oder `/stop` für Kill) |
| `session_status` | Fragt den Session-Status ab (ACP-Zustandsmaschine) |

### ACP-Session-Zustandsmaschine

```
creating → idle → running → idle
running → cancelling → idle | error
idle → closed
```

- `running`, `creating`, `cancelling` = Session aktiv → Polling fortsetzen
- `idle`, `closed`, `error` = Lauf beendet → Polling beendet

---

## 7. Pfadvalidierung

### `ALLOWED_PATH_PREFIXES`

```javascript
const ALLOWED_PATH_PREFIXES = ['/app/', '/opt/', '/home/'];
```

### `validateSafePath(filePath, label)` — core/config.js

Validiert dynamische Script-Pfade gegen die Zulassungsliste. `path.resolve()` normalisiert den Pfad; die Präfix-Zulassungsliste ist die eigentliche Sicherheitsgrenze.

---

## 8. Temp-Verzeichnis-Management

### `initTempDir(ctx)` — core/temp.js

Erstellt `swarm-pipeline-*` unter `os.tmpdir()`. Registriert `process.on('exit', cleanupTempDir)` für garantiertes Aufräumen.

### `cleanupTempDir(ctx)` — core/temp.js

Rekursives `fs.rmSync`. Bei Fehler nur Warnung, kein Abbruch.

### `tmpFile(ctx, prefix, moduleId, ext)` — core/temp.js

Generiert eindeutige Temp-Dateipfade: `{prefix}-{moduleId}-{ts}-{rand}{ext}`.

---

## 9. Kontrolliertes Herunterfahren (Multi-Agent)

### Architektur — agents/shutdown.js

Map-basiertes Tracking — speichert `Label → childSessionKey` für Gateway-basiertes Kill:

```javascript
shutdownState = {
  config: null,
  statusDir: null,              // Modul-Status-Verzeichnis (für FAIL-Markierung)
  activeSessions: new Map(),    // Label → childSessionKey (für Gateway-Kill)
  currentLabel: null,
};
```

### `registerShutdownHooks(ctx)` — agents/shutdown.js

SIGTERM/SIGINT-Handler: Alle getrackten Sessions via `gatewayKillSync(sessionKey)` beenden → Status als FAIL markieren → Temp aufräumen → Exit 1.

**v9-Neu — ACP-Prozess-Bereinigung:** Nach dem Kill via Gateway sendet `registerShutdownHooks` zusätzlich ein SIGTERM an alle OS-Prozesse, die dem beendeten ACP-Agenten zugeordnet waren (via PID-Tracking in `acp-monitor.js`). Verhindert verwaiste Prozesse nach ungeplanten Herunterfahrvorgängen.

### `trackAgent(ctx, label, sessionKey)` — agents/shutdown.js

Fügt ein ACP-Session-Label + sessionKey zur Map hinzu. Aufgerufen von `spawnAcpAgent` und `spawnReviewerAgent`.

### `untrackAgent(ctx, label)` — agents/shutdown.js

Entfernt ein Label aus der Map. Ruft zusätzlich `reapAcpProcess(ctx, label)` auf.

### `setShutdownContext(ctx, agentType, moduleId, statusDir)` — agents/shutdown.js

Setzt Modul-Kontext (statusDir für FAIL-Markierung). Pre-tracked das Modul-Agent-Label mit `null`-SessionKey.

### `clearShutdownContext(ctx)` — agents/shutdown.js

Entfernt `currentLabel` aus `activeSessions` und löscht `statusDir`.

---

## 10. Strukturiertes Logging

### `log(ctx, level, msg, data)` — core/logger.js

JSON-Zeilen auf stderr: `{ ts, level, run_id, module?, phase?, msg, data? }`. Die `run_id` aus dem Kontext korreliert alle Einträge einer Pipeline-Ausführung.

### `output(result)` — core/logger.js

Schön formatiertes JSON auf stdout. Nova parst diesen Output.

---

## 11. Konfiguration laden und validieren

### `loadConfig(projectName, opts)` — core/config.js

Lädt und führt swarm.config.json (Plattform) + progress.json (Projekt) zusammen. Ablauf siehe Abschnitt 4.

### `validateConfig(config, progress)` — core/config.js

Fehler-sofort-Validierung beider Quellen:

**Konfigurations-Felder:** project, repo_root, paths, agents.forge, agents.buster. `config.models` wird per `??= {}` optional initialisiert. Buster wird hart auf `dispatch: 'redis'` und `redis_js_path: '/app/skills/redis.js'` gesetzt.

**Standards:** `poll_interval_seconds: 30`, `default_timeout_minutes: 45`, `default_max_fails: 3`.

**Progress-Felder:** project, execution_order, modules. Gate-Typ-Validierung (`buster` | `review`). on_nogo-Aufzählung (`fix_and_continue` | `fix_and_rereview`). on_fail-Aufzählung (`fix_and_retest`).

**Sicherheit:** Dynamische Script-Pfade via `validateSafePath`. `_doc`-Felder werden übersprungen.

---

## 12. Pfad-Hilfsfunktionen und Model-Auflösung

### Pfad-Funktionen — core/paths.js

| Funktion | Beschreibung |
|----------|-------------|
| `modulePath(config, dir)` | `modules_dir + dir` |
| `statusPath(config, dir)` | `modulePath + status.json` |
| `swarmRoot(config)` | `config.paths.swarm_dir` |
| `projectSrcPath(config)` | Parent von swarm_dir (wo Agenten Code lesen/schreiben) |
| `relPath(config, absPath)` | Absolut → Repo-relativ |
| `completionStreamKey(config)` | `swarm:pipeline:<project>:completions` |

### `resolveModel(agentType, config, progress, override)` — core/paths.js

**Dreistufiger Rückfall** für die Model-Auflösung:

| Priorität | Quelle | Beispiel |
|-----------|--------|---------|
| 1 | Explizite Überschreibung | `mod.forge_model`, `gate.model`, `reviewer.model` |
| 2 | `progress.models.<agent>` | Projekt-Ebene-Standard in progress.json |
| 3 | `config.models.<agent>` | Plattform-Ebene-Standard in swarm.config.json |

Wirft Fehler wenn keine der drei Quellen ein Model liefert.

### `modelToHarness(modelId)` — core/paths.js

Ordnet Model-IDs ACP-Harness-IDs zu:

| Model-Muster | Harness |
|--------------|---------|
| `*claude*` | `claude` |
| `*codex*` | `codex` |
| `*gpt*` | `codex` |
| `*gemini*` | `gemini` |
| `*opencode*` | `opencode` |
| `*kimi*` | `kimi` |

Verfügbare acpx-Harnesses: `pi`, `claude`, `codex`, `opencode`, `gemini`, `kimi`.

---

## 13. Status-Management und Git-Integration

### `loadStatus(config, dir)` — services/status-store.js

Lädt status.json. Bei Parse-Fehler: `null` + Inhaltsvorschau (erste 200 Zeichen) für Diagnose.

**Defensive Standards:** Führt `STATUS_DEFAULTS` auf das geparste Objekt zusammen. Schützt vor Agent-Überschreibungen.

### `saveStatus(config, dir, status)` — services/status-store.js

**Atomares Schreiben:** `.tmp` + `fs.renameSync`. Committet via `gitCommitQuiet()`.

### `gitCommitQuiet(config, filePath, message)` — integrations/git.js

Stiller Git-Commit. "nothing to commit" wird still ignoriert. Echte Commit-Fehler: Warnung + Discord-Alert (kein Abbruch).

### `addHistory(status, newStatus, agent, note)` — services/status-store.js

Verlaufseintrag: `{ timestamp, status, agent, note, commit_hash }`.

### `initStatus(moduleId, moduleConfig)` — services/status-store.js

Frisches Status-Objekt mit allen Feldern:

```javascript
{
  module_id,
  title,
  status: 'PENDING',
  current_phase: null,
  fail_count: 0,
  started_at: null,
  updated_at: '<now>',
  completed_at: null,
  substeps: [...] | null,
  history: [...],
  fail_summaries: [],
  completion_summary: null,
  forge_commit_hash: null,
  forge_diff_stat: null,
  decayed_memory_ids: [],
  cost: {
    forge_tokens_in: 0, forge_tokens_out: 0,
    buster_tokens_in: 0, buster_tokens_out: 0,
    total_duration_seconds: 0,
  },
}
```

---

## 14. Git-Operationen

### `_gitPullCore(ctx, allowDestructiveRecovery)` — integrations/git.js

Kern für `git pull --rebase` mit Rebase-Abbruch-Wiederherstellung. Destruktiv (Polling) vs. Abbruch (vor Push).

### `gitPullForPolling(ctx)` | `gitPullBeforePush(ctx)` — integrations/git.js

### `gitPushWithRetry(ctx, maxRetries, delayMs)` — integrations/git.js

3 Versuche, 5s Verzögerung, 60s Timeout pro Versuch. **Asynchron.**

### `gitCommitAndPush(ctx, message, opts)` — integrations/git.js

Einheitliche Funktion für alle Git-Commit+Push-Vorgänge. Optionen: `addPaths`, `captureHash`, `softFail`. Prüft `git status --porcelain` vor Commit (kein leerer Commit). **Asynchron.**

---

## 15. Discord-Benachrichtigungen

### `discord(ctx, level, title, description, fields)` — integrations/discord.js

Formatierte Embeds an Discord-Webhook. Vollständig in try/catch um URL-Leck zu verhindern. **Asynchron.**

**Bedingung:** Sendet nur wenn `config.discord_webhook_url` gesetzt UND `config.discord_alerts[level]` wahr ist.

**Embed-Aufbau:**

| Feld | Wert |
|------|------|
| title | `{icon} {title}` |
| description | Freitext |
| color | INFO: `0x3498db` (Blau), WARN: `0xe67e22` (Orange), CRITICAL: `0xe74c3c` (Rot), OK: `0x2ecc71` (Grün) |
| fields | Array von `{ name, value, inline: true }` |
| footer | `KubeClaw Pipeline · {project} · {run_id}` |
| timestamp | ISO 8601 |

Icons: INFO: ℹ️, WARN: ⚠️, CRITICAL: 🚨, OK: ✅

---

## 16. Blueprint-Manager

### `listBlueprints(ctx)` — services/blueprint.js

### `releaseBlueprint(ctx, moduleId, moduleDir, stages)` — services/blueprint.js

Kopiert Blueprint vom Architecture-Branch. **Stage-bewusst:** Verifiziert nur Dateien die von den konfigurierten Stages benötigt werden. Sicherheitsprüfung: überschreibt keine existierende non-PENDING status.json. **Asynchron.**

---

## 17. Agent-Dispatch-System (Dual-Modus)

### Architektur

| Agent-Typ | Dispatch | Lebenszyklus | Tracking |
|-----------|----------|--------------|----------|
| Forge | ACP (Gateway-Tool-API) | Pipeline kontrolliert | `trackAgent(label, sessionKey)` / `untrackAgent` |
| Echo/Reviewer | ACP (Gateway-Tool-API) | Pipeline kontrolliert | `trackAgent(label, sessionKey)` / `untrackAgent` |
| Buster | Redis | Processor kontrolliert | No-Op-Kill |

### ACP-Dispatch (via Gateway-Tool-API) — agents/lifecycle.js

- `acpLabel(agentType, moduleId)`: Format `<type>-<moduleId>`
- `spawnAcpAgent(ctx, agentType, moduleId, model, taskPrompt)`: Gateway `sessions_spawn` mit `runtime: 'acp'`, `thread: true`, `mode: 'session'`, `cleanup: 'keep'`.
- `killAcpAgent(ctx, agentType, moduleId)`: Gateway `sessions_send` mit `/stop`. Ruft `untrackAgent(ctx, label)` und `reapAcpProcess(ctx, label)`.

### Redis-Dispatch — agents/lifecycle.js

- `buildBusterPayload(ctx, progress, moduleId, taskType, taskPrompt, status, opts)`: Strukturierter Payload. **Duale Task-Typen:** `module_test` und `gate_test`.

**`module_test`-Payload-Aufbau:**
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

**`gate_test`-Payload-Aufbau:**
```javascript
{
  task_type: 'gate_test',
  module: gateId, project, commit_hash, timestamp, completion_stream,
  instructions: taskPrompt,
  session: { model, agentId, cwd, timeout_seconds, label: 'buster-gate-{gateId}-{ts}' },
  gate_id, gate_title,
  work_dir,           // Repo-relativ (Swarm-Root)
  output_file,        // Repo-relativ
  instructions_file,  // Repo-relativ
}
```

### Einheitliche Schnittstelle — agents/lifecycle.js

| Funktion | ACP-Routing | Redis-Routing |
|----------|------------|---------------|
| `spawnAgent()` | `spawnAcpAgent()` via Gateway | `dispatchRedisTask()` |
| `killAgent()` | `killAcpAgent()` via Gateway `/stop` | No-Op |
| `steerAgent()` | Gateway `sessions_send` (HTTP-POST) | `dispatchRedisTask(steer)` |

### `verifyAgentAlive(ctx, agentType, moduleId, waitMs)` — agents/lifecycle.js

Zustandsprüfung nach ACP-Spawn. **Asynchron:** `await sleep(8000)`, dann `gatewayInvoke('session_status', ...)`. Terminal States (`closed`, `error`) = Spawn fehlgeschlagen. Redis: immer wahr.

---

## 18. Session-End-Polling (Forge-Fix-Zyklen)

### `pollForSessionEnd(ctx, sessionLabel, timeoutMinutes, logLabel)` — services/polling.js

Extrahierte Hilfsfunktion für Forge-Fix-Polling in Gate-Zyklen.

**Gateway-basiert:** Pollt via `gatewayInvoke('session_status', { sessionKey })`. Parst ACP-Zustand aus Response.

**Funktionalität:**
1. Löst `sessionKey` aus `ctx.shutdownState.activeSessions` via Label auf
2. Erfasst `headHash()` vor dem Polling (Rückfall für Änderungs-Erkennung)
3. Pollt Gateway `session_status` bis die Session endet oder Timeout
4. **Zweiphasige Änderungs-Erkennung nach Session-Ende:**
   - Phase 1: `git add -A` → `git status --porcelain` → Pipeline committet uncommitteten Agent-Output
   - Phase 2 (Rückfall): HEAD-Diff gegen Ausgangspunkt
5. **Absturz-Erkennung:** Session-Ende ohne Änderungen = Agent abgestürzt (OOM, API-Fehler)
6. **Timeout-Anstoß:** Bei `session_nudge_threshold` (Standard 75%) wird ein einmaliger Steer gesendet.

**Rückgabe:** `{ completed: boolean, hasChanges: boolean, reason: string }`

---

## 19. Datei-Leser

- `readForgeInstructions(config, moduleDir, moduleConfig)` — services/status-store.js: Unterstützt `moduleConfig.substeps` — wenn vorhanden, werden FORGE.md-Dateien aus allen Substep-Verzeichnissen zusammengefügt (mit `---`-Trennzeichen).
- `readBusterInstructions(config, moduleDir)` — services/status-store.js
- `readGateInstructions(config, gate)` — services/status-store.js

---

## 20. Buster-Prompt-Aufbau

### Designprinzip

Analoges System zu `buildForgePrompt` — die Pipeline besitzt den vollständigen Prompt. Der Processor ist nur ein Relais. Prompt-Reihenfolge optimiert für LLM-Aufmerksamkeit: Kontext → Test-Arbeitsbereich → Anweisungen → Abschluss-Protokoll.

### Funktionen

| Funktion | Modul | Beschreibung |
|----------|-------|-------------|
| `buildTestWorkspaceSection(testWorkspacePath)` | prompts/shared.js | Gemeinsamer Block der dem Agenten sagt wo Test-Scripts hingehören (`attempt-N/`-Verzeichnisse). |
| `buildBusterModulePrompt(ctx, moduleId, mod, dir, status, maxFails)` | prompts/buster-module.js | Vollständiger `module_test`-Prompt. Gibt `{ prompt }` oder `{ error }` zurück. |
| `buildBusterGatePrompt(ctx, gateId, gate, instructions, commitHash, attempt)` | prompts/buster-gate.js | Vollständiger `gate_test`-Prompt. Gibt rohen `string` zurück. |
| `buildBusterCompletionProtocol(ctx, moduleId, dir, status)` | prompts/buster-module.js | 3-Schritt-Modul-Abschluss: (1) status.json aktualisieren, (2) Erkenntnisse via memory.js speichern, (3) Abschluss via redis.js signalisieren. |
| `buildBusterGateCompletionProtocol(ctx, gateId, gate)` | prompts/buster-gate.js | 3-Schritt-Gate-Abschluss. |

### Kontext-Block-Felder

| Feld | Modul-Prompt | Gate-Prompt |
|------|--------------|-------------|
| Projekt | ✓ | ✓ |
| Modul/Gate + Titel | ✓ | ✓ |
| Projektquelle (relativ) | ✓ | ✓ |
| Modul-Pfad (relativ) | ✓ | — |
| Status-JSON (relativ) | ✓ | — |
| Repo-Root | ✓ | ✓ |
| Arbeitsverzeichnis | ✓ | ✓ |
| Versuch | ✓ | ✓ |
| Commit-Hash | bedingt | bedingt |
| forge_diff_stat | bedingt | — |

---

## 21. Qdrant-Memory-Anbindung

### Drei Integrationspunkte

1. **VOR FORGE:** `recallForModule()` — Memories in Forge-Prompt injizieren
2. **NACH PASS/FAIL:** `feedbackMemory()` — Vertrauenswerte aktualisieren
3. **NACH FAIL:** `decayRecalledMemories()` — Gezielter Decay der Prompt-Memories

### Interne Hilfsfunktionen

| Funktion | Beschreibung |
|----------|-------------|
| `memoryEnabled(config)` | Schutz: `config.memory?.enabled !== false`. |
| `memoryJsPath(config)` | Auflösung + Validierung des memory.js-Pfads via `validateSafePath`. |
| `getMemoryModule(ctx)` | Gecachter dynamischer Import von memory.js. Bei Fehler: `null` → CLI-Rückfall. |

### Memory-Recall-Formatierung

`recallForModule` formatiert Memories als Markdown-Block mit Vertrauens-Sternebewertungen:

| Vertrauen | Bewertung | Bedeutung |
|-----------|-----------|-----------|
| ≥ 0.75 | ★★★ | Validiertes Muster |
| ≥ 0.45 | ★★☆ | Neutral |
| < 0.45 | ★☆☆ | Ungeprüft |

### Konfigurations-Schalter

| Feld | Standard | Beschreibung |
|------|----------|-------------|
| `memory.enabled` | `true` (implizit) | Haupt-Schalter |
| `memory.recall_before_forge` | `true` (implizit) | Schutz für `recallForModule` |
| `memory.feedback_after_outcome` | — | Schutz für `feedbackMemory` |
| `memory.targeted_decay_amount` | `0.1` | Vertrauens-Decay pro Erinnerung |
| `memory.recall_limit` | `5` | Max. Memories pro Recall |

### Gezielter Decay vs. Breites Feedback

| Auslöser | Aktion | Geltungsbereich |
|---------|--------|----------------|
| Jeder Fehlschlag | `decayRecalledMemories` | Nur die IDs die im Prompt waren |
| Max. Fehlschläge (BLOCKED) | `feedbackMemory('blocked')` | Alle zum Modul getaggten Memories |
| PASS | `feedbackMemory('pass')` | Alle zum Modul getaggten Memories |

---

## 22. Polling-System (Konsolidiert)

### Basis-Hilfsfunktionen — services/polling.js

| Funktion | Beschreibung |
|----------|-------------|
| `sleep(ms)` | `new Promise(resolve => setTimeout(resolve, ms))`. Von allen asynchronen Funktionen genutzt. |
| `pollResult(ok, reason, status)` | Factory für konsistente Rückgabeobjekte. Aufbau: `{ ok: boolean, reason: string, status: object\|null }`. |

### Architektur

**Alle Poller bauen auf `pollGeneric` auf.**

```
pollGeneric(ctx, checkFn, timeoutMinutes, label)   ← Gemeinsame Basis
  ├── pollForFile(...)     → checkFn prüft fs.existsSync
  ├── pollStatus(...)      → checkFn prüft loadStatus + expectedStatuses
  └── pollDual(...)        → checkFn prüft Redis + Git parallel
```

### `pollGeneric(ctx, checkFn, timeoutMinutes, label)` — services/polling.js

Gemeinsame Basis. Übernimmt: Deadline-Schleife, sleep, `gitPullForPolling`, Parse-Corruption-Tracking.

**PollResult-Semantik:** `ok=true` bedeutet "ein terminaler Status wurde erreicht" — NICHT "Modul bestanden". Reason-Aufzählung: `target_reached`, `gate_fail`, `timeout`, `blocked`, `rate_limited`, `rate_limit_exhausted`, `parse_corrupted`, `spawn_failed`.

**checkFn-Protokoll:**

| Rückgabe | Bedeutung |
|----------|-----------|
| `{ done: true, result: PollResult }` | Terminal — sofort zurückgeben |
| `{ done: false, logMsg?: string }` | Weiter pollen |
| `{ rate_limited: true, status }` | Rate-Limit erkannt — an Aufrufer delegieren |
| `{ parse_error: true }` | Korrupten Zähler inkrementieren (max. 10) |

### `pollStatus(ctx, moduleDir, expectedStatuses, timeoutMinutes)` — services/polling.js

Liest `loadStatus()` und prüft ob `status.status` in `expectedStatuses` enthalten ist. Für die **Forge-Phase**.

### `pollDual(ctx, moduleDir, moduleId, expectedStatuses, timeoutMinutes)` — services/polling.js

Prüft **zwei Kanäle** parallel pro Zyklus:
1. **Kanal 1 (Redis, schnell):** `readCompletionFromRedis()` → `mapRedisStatus()`.
2. **Kanal 2 (Git, Rückfall):** `loadStatus()` wie `pollStatus`.

Für die **Buster-Phase**.

### Rate-Limit-Wiederherstellung (Vereinheitlicht) — services/rate-limit.js

- `withRateLimitRecovery(ctx, moduleDir, pollFn)`: Generischer Rate-Limit-Wiederherstellungs-Wrapper.
- `pollWithRateLimitRecovery(...)`: Wrapper für `pollStatus`.
- `pollDualWithRateLimitRecovery(...)`: Wrapper für `pollDual`.

---

## 23. Rate-Limit-Behandlung

### `handleRateLimit(ctx, ...)` — services/rate-limit.js

Abkühlzeit → Discord-Alert → Warten → Frischen Status laden → Phase wiederherstellen. Mutiert den Status des Aufrufers **nicht**.

### Gate-Level Rate-Limit-Behandlung (Inline)

Gates implementieren eigenen inline Rate-Limit-Handler: Warten → Discord → `attempt--` (Rate-Limit zählt nicht als Fix-Versuch) → Fortsetzen.

---

## 24. Redis-Completion-Stream (Buster)

```
Aktiv:   swarm:pipeline:<project>:completions       ← aktuelle Einträge
Archiv:  swarm:pipeline:<project>:completions:log   ← verarbeitete Einträge
```

### Direkter Import von redis.js — integrations/redis.js

Pipeline importiert `redis.js` direkt via `getRedisModule(ctx)` (gecacht). Bei Import-Fehler: Graceful Degradation auf Git-only-Polling.

### Konstanten

| Konstante | Wert | Beschreibung |
|-----------|------|-------------|
| `COMPLETION_ARCHIVE_MAX_LEN` | `1000` | Maximale Anzahl Einträge im Archiv-Stream. |

### Pipeline-Funktionen

- `getRedisModule(ctx)` — Gecachter Direktimport.
- `archiveModuleCompletions(ctx, moduleId)` — VOR jedem Buster-Dispatch. **Asynchron.**
- `readCompletionFromRedis(ctx, moduleId)` — Neuesten Abschluss lesen. **Asynchron.**
- `mapRedisStatus(redisStatus)` — PASS→PASS, FAIL→FAIL, ISSUES_FOUND→FAIL.

---

## 25. Git-Sync (Forge → Buster-Übergabe)

### `gitSyncBeforeBuster(ctx, moduleDir, status)` — integrations/git.js

`gitCommitAndPush()` mit `captureHash: true`. Zeichnet `forge_commit_hash` in Status auf. Erfasst `forge_diff_stat` via `git diff --stat HEAD~1 HEAD`.

---

## 26. Dependency-Prüfung (Inhaltsbasiert)

### `checkDependencies(ctx, progress, moduleId)` — runners/module-runner.js

Prüft Gate-Dependencies und Modul-Dependencies. **Inhaltsbasiert:** Output-File-Status wird geprüft. `mod.depends_on || []`-Schutz verhindert Absturz bei fehlendem Feld.

---

## 27. Fehlerbehandlung

### `extractAgentFailReason(status, phase)` — services/failures.js

Extrahiert Agent-Fehlergrund. Priorität: Agent-Verlaufseintrag (nicht `pipeline`) → `completion_summary` → generischer Rückfall.

### `handleFail(ctx, ...)` — services/failures.js

**fail_count++** (immer) → Fehlzusammenfassung → Gezielter Memory-Decay → Breites Feedback (nur bei BLOCKED) → Status-Update → Auto-Wiederhol-Entscheidung → Eskalation.

Auto-Wiederholung vs. Eskalation: `fail_count <= auto_retry_threshold` (per Modul/Gate oder Plattform-Standard: 2) UND kein Timeout → `_retry: true`, sonst `EXIT_NEEDS_NOVA` oder `EXIT_TIMEOUT`.

**Rückgabe bei Auto-Wiederholung:**
```javascript
{ _retry: true, module, module_dir, fail_count, max_fails, last_fail }
```

**Rückgabe bei BLOCKED (`fail_count >= maxFails`):**
```javascript
{ exit: EXIT_BLOCKED, reason, module, status }
```

### `buildNovaEscalation(ctx, ...)` — services/failures.js

Vollständiges Kontext-Paket für Nova:

```javascript
{
  exit: EXIT_NEEDS_NOVA | EXIT_TIMEOUT,
  module, module_dir, is_timeout,
  reason,
  fail_count, max_fails,
  auto_retry_threshold,
  remaining_attempts,
  fail_history: [{ attempt, phase, summary, is_timeout, files_changed, timestamp }],
  last_fail,
  module_status: { status, current_phase, started_at, forge_commit_hash, cost },
  resume_command,
}
```

---

## 28. Lint-Report-Integration

### `generateLintReport(ctx, tier, opts)` — services/summary.js

Gemeinsamer Kern. Unterstützt `--semgrep-config` wenn `config.pre_check.semgrep_config_path` gesetzt. Gibt `{ report, error }` zurück.

### `formatLintErrors(report)` — services/summary.js

Anti-Pattern-Formatierer. Begrenzt auf 20 pro Tool.

### `formatLintReportForReviewer(report)` — services/summary.js

Reviewer-Prompt-Block. Icons (✅ 🔴 🟡 ❌), begrenzt auf 30 pro Tool.

---

## 29. Pre-Check (Forge-Ausgabe-Validierung)

### `runPreCheck(ctx, moduleDir, status, moduleId)` — services/summary.js

Schnelle statische Analyse. Abschalter: `config.pre_check.enabled = false`. Gibt `{ passed, report, error }` zurück.

---

## 30. Forge-Prompt-Zusammensetzung

### `buildForgePrompt(ctx, moduleId, mod, dir, status, maxFails, novaPrompt)` — prompts/forge.js

**Text-Reihenfolge** (optimiert für "Lost in the Middle"-Effekt):
```
Kontext-Block → Prioritäts-Header → Nova-Direktive → FORGE.md → Anti-Muster → Memory-Kontext
```

Kontext-Block steht vor dem Prioritäts-Header weil er sachlicher Kontext ist. Anti-Muster stehen nahe am Ende (Aktualitäts-Bias).

**Asynchron:** buildForgePrompt ist async (wegen `recallForModule`). Gibt `{ prompt, recalledMemoryIds }` zurück.

---

## 31. Modul-Runner (Stage-bewusst)

### `runModule(ctx, progress, moduleId, opts)` — runners/module-runner.js

Wiederholungs-Schleife um `executeModuleAttempt()`. Dependencies einmal geprüft.

### `executeModuleAttempt(ctx, ...)` — runners/module-runner.js

**Stages:** `['forge', 'buster']` Standard. Kontrolliert welche Phasen laufen.

**Forge-Phase:** `buildForgePrompt` → `spawnAgent('forge')` → `verifyAgentAlive` → `pollWithRateLimitRecovery` → `killAgent('forge')`.

**Forge-Only-Pass:** Wenn `'buster' ∉ stages` und Status ist READY_FOR_TESTING → direkt PASS.

**Buster-Only-Hochstufung:** Wenn `'forge' ∉ stages` → PENDING/FAIL → READY_FOR_TESTING.

**Buster-Phase:** `buildBusterModulePrompt` → `archiveModuleCompletions` → `emitTelemetryEvent` → `spawnAgent('buster')` → `pollDualWithRateLimitRecovery` → `killAgent('buster')`.

---

## 32. Gate-Dispatcher

### `runGate(ctx, progress, gateId)` — runners/gate-runner.js

Leitet nach `gate.type` weiter:

| Typ | Runner | Beschreibung |
|-----|--------|-------------|
| `buster` | `runBusterGate()` | Einzelner Buster-Agent mit optionalem Fix-Loop |
| `review` | `runReviewGate()` | Einzelner Reviewer mit Lint-Report und Fix-Lebenszyklus |

---

## 33. Buster-Gate-Runner (mit Fix-Loop)

### `gateStatusPath(ctx, gateId)` — runners/buster-gate-runner.js

Baut den Pfad für die Gate-Status-Datei: `<swarm_dir>/<gateId>-gate-status.json`.

### `_runBusterGateOnce(ctx, ...)` — runners/buster-gate-runner.js

Einzelversuch: `buildBusterGatePrompt` → spawn (mit `taskType: 'gate_test'`) → `pollGeneric` → kill → PollResult.

### `runBusterGate(ctx, progress, gateId)` — runners/buster-gate-runner.js

**Bereits-abgeschlossen-Prüfung:** Inhaltsbasiert + Rückfall auf gate-status.json.

**Veraltete-Ausgabe-Bereinigung:** `output_file` und `gate-status.json` löschen nach der Bereits-abgeschlossen-Prüfung.

**Fix-Loop:** `on_fail === 'fix_and_retest'` → extractGateIssues → `buildGateFixPrompt` (mit `fixHistory`-Anti-Mustern) → Forge-Fix via `pollForSessionEnd` → hasChanges-Prüfung → Git-Sync → Ausgabe bereinigen → Nochmals testen.

### `extractGateIssues(gateResult)` — runners/buster-gate-runner.js

Extrahiert behebbare Probleme aus dem Buster-Gate-Ergebnis:

**Strukturiert:** `gateResult.status.issues[]` → filtert nach `severity: 'critical' | 'moderate'`

**Flacher Rückfall:** `gateResult.status.reason || summary`

---

## 34. Review-Gate-Runner (Lint-Report + Einzelreviewer)

### `resolveReviewConfig(config, gate)` — runners/review-gate-runner.js

Führt Gate-Ebene-Überschreibungen mit Plattform-Standards zusammen. Rückgabe:
```javascript
{ reviewers: [], timeout: number, maxFixCycles: number, lintTier: 'full' | 'pre-check' }
```

### `cleanupReviewFiles(ctx, gate, reviewers)` — runners/review-gate-runner.js

Löscht alle Reviewer-Ausgabe-Dateien UND die Gate-Ausgabe-Datei. Wird vor `_runReviewOnce` in `fix_and_rereview`-Zyklen aufgerufen.

### Architektur

```
_runReviewOnce():
  1. generateLintReport(tier: full)  ← Deterministische Tool-Befunde
  2. readGateInstructions()           ← Review-Anweisungen
  3. Reviewer-Prompt aufbauen:        ← Kontext + Anweisungen + Lint-Report + Ausgabe-Schema
  4. Veraltete-Ausgabe-Bereinigung
  5. spawnReviewerAgent() × 1         ← Einzelner Reviewer
  6. pollForFile()                    ← Eine Ausgabe-Datei
  7. killReviewerAgent()
  8. gitCommitAndPush()
  9. Review-JSON parsen               ← GO / NO-GO + critical_issues
```

### Fix-Lebenszyklen

#### `fix_and_continue`

Forge-Fix nutzt `pollForSessionEnd()` mit `hasChanges`-Prüfung. Fix-Verlauf-Tracking. Nach Fix: GO-Status-Datei schreiben → Pipeline fährt fort.

#### `fix_and_rereview`

Forge-Fix → `cleanupReviewFiles` → `_runReviewOnce` (frischer Lint-Report + frisches Review). Bei Erschöpfung: `EXIT_NEEDS_NOVA`.

---

## 35. Pipeline-Runner

### `findNextStep(ctx, progress)` — runners/pipeline-runner.js

Iteriert `execution_order`. Inhaltsbasierte Gate-Prüfung + Rückfall auf `gateStatusPath()`.

### `runPipeline(ctx, progress, opts)` — runners/pipeline-runner.js

Hauptschleife: `findNextStep()` → `runGate()` oder `runModule()`. Angereichertes Pipeline-Start-Discord mit Ausstehend/Gesamt-Anzahl.

---

## 36. Status-Ausgabe und Dry-Run

### `printStatus(ctx, progress)` — runners/pipeline-runner.js

Status-JSON aller Module + Gates.

### `dryRun(ctx, progress)` — runners/pipeline-runner.js

Ausführungsplan ohne Agenten zu spawnen. Nutzt `resolveModel` für Model-Anzeige mit dreistufigem Rückfall.

---

## 37. CLI-Wrapper und Einstiegspunkt

`pipeline/cli.js` — Manuelles Argument-Parsing.

**Umgebungsvariablen-Rückfälle:**

| Umgebungsvariable | Beschreibung | Priorität |
|---|---|---|
| `CURRENT_PROJECT` | Projektname (falls `--project` nicht angegeben) | 2 |
| `REPO_ROOT` | Git-Repo-Root (falls `--repo` nicht angegeben). Nützlich wenn die Pipeline aus einem Verzeichnis ausserhalb des Repos aufgerufen wird. | 2 |
| `SWARM_CONFIG` | Pfad zu swarm.config.json | — |
| `DISCORD_WEBHOOK` | Webhook-URL (Rückfall) | — |
| `OPENCLAW_GATEWAY_TOKEN` | Gateway-Auth-Token | — |

**Ablauf:**
```
1. initTempDir(ctx) + registerShutdownHooks(ctx)
2. const { config, progress } = loadConfig(flags.project, { repoRoot: flags.repo })
3. Blueprint-Befehle (frühzeitig beenden)
4. Status/Dry-Run (frühzeitig beenden)
5. Nova-Prompt aus --prompt oder --prompt-file auflösen
6. runPipeline(ctx) → Aufräumen → Beenden
```

**CLI-Flags:**

| Flag | Beschreibung |
|------|-------------|
| `--project <n>` | Projektname (oder `CURRENT_PROJECT`-Umgebungsvariable) |
| `--repo <Pfad>` | Git-Repo-Root (oder `REPO_ROOT`-Umgebungsvariable) |
| `--module <id>` | Einzelmodul ausführen |
| `--resume` | Pipeline fortsetzen |
| `--prompt "Text"` | Nova-Prompt-Überschreibung |
| `--prompt-file <Pfad>` | Nova-Prompt aus Datei laden |
| `--status` | Status-JSON ausgeben |
| `--dry-run` | Ausführungsplan ohne Agenten |
| `--blueprint <id>` | Blueprint veröffentlichen |
| `--blueprint-list` | Verfügbare Blueprints |
| `--help` | Hilfetext |

**Modul-Konfigurations-Felder (in progress.json):**

| Feld | Pflicht | Standard | Beschreibung |
|------|---------|---------|-------------|
| `title` | ja | — | Menschenlesbarer Modulname |
| `dir` | ja | — | Verzeichnisname im Repo |
| `stages` | nein | `['forge', 'buster']` | Welche Phasen laufen |
| `substeps` | nein | `null` | Array von Sub-IDs |
| `depends_on` | ja | `[]` | Module die vorher PASS sein müssen |
| `timeout_minutes` | nein | `45` (aus swarm.config) | Max. Laufzeit |
| `max_fails` | nein | `3` (aus swarm.config) | Max. Fehlversuche |
| `forge_model` | nein | aus `models.forge` | LLM-Modell für Forge |
| `test_suites` | nein | `["build", "health"]` | Buster-Suites |
| `test_config` | nein | `{ serve: { type: "static" } }` | Suite-Konfiguration |
| `auto_retry_threshold` | nein | aus swarm.config | Max. Auto-Wiederholungen vor Nova-Eskalation |

---

## 38. Exports

```javascript
// pipeline/index.js
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
  emitTelemetryEvent, createContext,
  STATUS, EXIT_OK, EXIT_ERROR, EXIT_NEEDS_NOVA, EXIT_BLOCKED, EXIT_TIMEOUT, EXIT_RATE_LIMITED,
};

export default runPipeline;
```

**v9-Änderungen gegenüber v8:**
- **Neu exportiert:** `emitTelemetryEvent`, `createContext`, `generatePipelineSummary`

---

## 39. Vollständiger Ablaufgraph

### Happy Path

```
CLI-Einstiegspunkt (pipeline/cli.js)
  │
  ├─ initTempDir(ctx) + registerShutdownHooks(ctx)
  ├─ const { config, progress } = loadConfig(projectName, { repoRoot })
  │
  └─ runPipeline(ctx)
       │
       └─ SCHLEIFE: findNextStep()
            │
            ├─ Typ: 'gate' (buster)
            │   └─ runBusterGate()
            │       ├─ _runBusterGateOnce()
            │       │   ├─ buildBusterGatePrompt()
            │       │   ├─ spawnAgent('buster', gate_test) → Redis
            │       │   ├─ pollGeneric (output_file + gate-status.json)
            │       │   ├─ killAgent('buster')
            │       │   → PASS → fertig
            │       │   → rate_limited → inline-Abkühlung, attempt--, fortsetzen
            │       └─ on_fail: fix_and_retest
            │           ├─ extractGateIssues()
            │           ├─ buildGateFixPrompt(ctx, fixHistory)
            │           ├─ Forge-Fix → spawnAgent → verifyAgentAlive
            │           │   → pollForSessionEnd(Gateway) → hasChanges-Prüfung
            │           ├─ killAgent → gitCommitAndPush → Ausgabe bereinigen
            │           └─ Nochmals-testen-Schleife
            │
            ├─ Typ: 'gate' (review)
            │   └─ runReviewGate()
            │       ├─ resolveReviewConfig() (inkl. lintTier)
            │       ├─ _runReviewOnce()
            │       │   ├─ generateLintReport(tier: full)
            │       │   ├─ formatLintReportForReviewer()
            │       │   ├─ Veraltete-Ausgabe-Bereinigung
            │       │   ├─ spawnReviewerAgent(ctx, progress, ...) × 1
            │       │   ├─ pollForFile()
            │       │   ├─ killReviewerAgent()
            │       │   └─ Review-JSON parsen → GO / NO-GO
            │       │
            │       ├─ on_nogo: fix_and_continue
            │       │   └─ Forge-Fix → pollForSessionEnd() → hasChanges-Prüfung
            │       │      → GO-Datei schreiben → fortsetzen
            │       │
            │       └─ on_nogo: fix_and_rereview
            │           └─ Forge-Fix → pollForSessionEnd() → hasChanges-Prüfung
            │              → cleanupReviewFiles → _runReviewOnce (frisch) → Schleife
            │
            ├─ Typ: 'module'
            │   └─ runModule()
            │       ├─ checkDependencies()
            │       ├─ Beschädigte-status.json-Prüfung (EXIT_ERROR)
            │       └─ WIEDERHOLUNGS-SCHLEIFE: executeModuleAttempt()
            │           │
            │           ├─ stages = mod.stages || ['forge', 'buster']
            │           │
            │           ├─ FORGE-PHASE (wenn 'forge' in stages)
            │           │   ├─ resolveModel('forge', config, progress, mod.forge_model)
            │           │   ├─ buildForgePrompt()
            │           │   ├─ spawnAgent('forge') → ACP via Gateway
            │           │   ├─ verifyAgentAlive() (Gateway session_status)
            │           │   ├─ pollWithRateLimitRecovery()
            │           │   └─ killAgent('forge') → Gateway /stop → reapAcpProcess()
            │           │
            │           ├─ GIT-SYNC (wenn 'buster' in stages)
            │           │   └─ gitSyncBeforeBuster() + forge_diff_stat erfassen
            │           │
            │           └─ BUSTER-PHASE (wenn 'buster' in stages)
            │               ├─ buildBusterModulePrompt()
            │               ├─ archiveModuleCompletions()
            │               ├─ emitTelemetryEvent('buster_dispatched', ...)
            │               ├─ spawnAgent('buster') → Redis (module_test)
            │               └─ pollDualWithRateLimitRecovery()
            │
            └─ Typ: 'done' → generatePipelineSummary() → Discord "Pipeline abgeschlossen" → EXIT_OK
```

---

## 40. Abhängigkeitsgraph der Funktionen

### Aufrufe (pro Funktion → ruft auf)

| Funktion | Modul | Ruft auf |
|----------|-------|----------|
| `loadConfig` | core/config.js | `execFileSync`, `validateConfig` |
| `validateConfig` | core/config.js | `validateSafePath` |
| `saveStatus` | services/status-store.js | `fs.writeFileSync` (tmp), `fs.renameSync` (atomar), `gitCommitQuiet` |
| `gitCommitAndPush` | integrations/git.js | `gitExec`, `invalidateHeadHash`, `gitPullBeforePush`, `gitPushWithRetry` |
| `spawnAcpAgent` | agents/lifecycle.js | `modelToHarness`, `gatewayInvoke('sessions_spawn')`, `trackAgent` |
| `killAcpAgent` | agents/lifecycle.js | `gatewayInvoke('sessions_send', /stop)`, `untrackAgent`, `reapAcpProcess` |
| `pollGeneric` | services/polling.js | `sleep`, `gitPullForPolling` |
| `pollForSessionEnd` | services/polling.js | `sleep`, `gitPullForPolling`, `gatewayInvoke('session_status')`, `headHash`, `invalidateHeadHash` |
| `handleFail` | services/failures.js | `decayRecalledMemories`, `feedbackMemory`, `saveStatus`, `discord`, `buildNovaEscalation` |
| `buildForgePrompt` | prompts/forge.js | `readForgeInstructions`, `recallForModule`, `relPath`, `modulePath`, `statusPath`, `projectSrcPath` |
| `executeModuleAttempt` | runners/module-runner.js | `buildForgePrompt`, `buildBusterModulePrompt`, `resolveModel`, `spawnAgent`, `verifyAgentAlive`, `pollWithRateLimitRecovery`, `archiveModuleCompletions`, `gitSyncBeforeBuster`, `pollDualWithRateLimitRecovery`, `handleFail`, `feedbackMemory`, `killAgent`, `gitCommitAndPush`, `emitTelemetryEvent` |
| `runBusterGate` | runners/buster-gate-runner.js | `_runBusterGateOnce`, `resolveModel`, `extractGateIssues`, `buildGateFixPrompt`, `spawnAgent`, `verifyAgentAlive`, `pollForSessionEnd`, `killAgent`, `gitCommitAndPush`, `discord` |
| `runReviewGate` | runners/review-gate-runner.js | `resolveReviewConfig`, `_runReviewOnce`, `resolveModel`, `extractReviewIssues`, `buildReviewFixPrompt`, `cleanupReviewFiles`, `spawnAgent`, `verifyAgentAlive`, `pollForSessionEnd`, `killAgent`, `gitCommitAndPush`, `discord` |
| `runPipeline` | runners/pipeline-runner.js | `findNextStep`, `runModule`, `runGate`, `discord`, `generatePipelineSummary` |

### Globaler Zustand (in PipelineContext)

| Feld | Gesetzt durch | Genutzt durch |
|------|---------------|---------------|
| `tmpDir` | `initTempDir(ctx)` | `tmpFile(ctx)`, `cleanupTempDir(ctx)`, `process.on('exit')` |
| `shutdownState` | `trackAgent`, `untrackAgent`, `setShutdownContext` | Herunterfahren-Handler, `pollForSessionEnd`, `killAcpAgent` |
| `runId` | Kontext-Erstellung | `log(ctx)`, `discord(ctx)` |
| `logModule` / `logPhase` | `runModule()`, `executeModuleAttempt()` | `log(ctx)` |
| `headHashCache` / `repoRoot` | `loadConfig()`, `headHash(ctx)` | `headHash(ctx)`, `gitExec` |
| `memoryModule` | `getMemoryModule(ctx)` | Memory-Funktionen |
| `redisModule` | `getRedisModule(ctx)` | `readCompletionFromRedis`, `archiveModuleCompletions` |

---

## 41. Systemübergreifende Architektur

### Betroffene Dateien

| Datei | Rolle | Version |
|-------|-------|---------|
| `skills/nova/pipeline.js` | Kompatibilitäts-Shim (≤25 Zeilen) | v9 |
| `skills/nova/pipeline/core/config.js` | Konfiguration laden, validieren, REPO_ROOT | v9 |
| `skills/nova/pipeline/core/paths.js` | Pfad-Hilfsfunktionen, Model-Auflösung | v9 |
| `skills/nova/pipeline/core/context.js` | PipelineContext (ersetzt globale Variablen) | v9 |
| `skills/nova/pipeline/core/logger.js` | Strukturiertes Logging | v9 |
| `skills/nova/pipeline/core/temp.js` | Temp-Verzeichnis-Verwaltung | v9 |
| `skills/nova/pipeline/integrations/git.js` | Alle Git-Operationen | v9 |
| `skills/nova/pipeline/integrations/gateway.js` | Gateway-Tool-API-Client | v9 |
| `skills/nova/pipeline/integrations/redis.js` | Redis-Completion-Stream | v9 |
| `skills/nova/pipeline/integrations/discord.js` | Discord-Webhook | v9 |
| `skills/nova/pipeline/agents/lifecycle.js` | spawn / kill / steer / verify | v9 |
| `skills/nova/pipeline/agents/acp-monitor.js` | ACP-Session-Zustand + Transcript-Überwachung | v9 |
| `skills/nova/pipeline/agents/shutdown.js` | Kontrolliertes Herunterfahren + ACP-Prozess-Bereinigung | v9 |
| `skills/nova/pipeline/prompts/forge.js` | Forge-Prompt-Aufbau | v9 |
| `skills/nova/pipeline/prompts/buster-module.js` | Buster-Modul-Prompt-Aufbau | v9 |
| `skills/nova/pipeline/prompts/buster-gate.js` | Buster-Gate-Prompt-Aufbau | v9 |
| `skills/nova/pipeline/prompts/gate-fix.js` | Gate-Fix-Zyklus-Prompt-Aufbau | v9 |
| `skills/nova/pipeline/prompts/review.js` | Reviewer-Prompt-Aufbau | v9 |
| `skills/nova/pipeline/prompts/shared.js` | Gemeinsame Prompt-Abschnitte | v9 |
| `skills/nova/pipeline/services/status-store.js` | status.json + Artefakt-E/A | v9 |
| `skills/nova/pipeline/services/blueprint.js` | Blueprint-Veröffentlichung + Steuerdatei-Abgleich | v9 |
| `skills/nova/pipeline/services/polling.js` | Alle Polling-Abläufe | v9 |
| `skills/nova/pipeline/services/rate-limit.js` | Rate-Limit-Wiederherstellung | v9 |
| `skills/nova/pipeline/services/failures.js` | Fehler-Klassifizierung + Eskalation | v9 |
| `skills/nova/pipeline/services/telemetry.js` | Event-Emission an Redis-Stream | v9 |
| `skills/nova/pipeline/services/summary.js` | Pipeline-Zusammenfassung + Review-Generierung | v9 |
| `skills/nova/pipeline/runners/module-runner.js` | Modul-Ausführungs-Lebenszyklus | v9 |
| `skills/nova/pipeline/runners/gate-runner.js` | Gate-Dispatcher | v9 |
| `skills/nova/pipeline/runners/buster-gate-runner.js` | Buster-Gate-Ausführung + Fix-Loop | v9 |
| `skills/nova/pipeline/runners/review-gate-runner.js` | Review-Gate-Ausführung | v9 |
| `skills/nova/pipeline/runners/pipeline-runner.js` | Übergeordnete Pipeline-Schleife | v9 |
| `skills/nova/pipeline/index.js` | Öffentliche Exports | v9 |
| `skills/nova/pipeline/cli.js` | CLI-Einstiegspunkt | v9 |
| `skills/nova/pipeline/README.md` | Architektur-Überblick | v9 |
| `skills/lint-report.js` | Statische-Analyse-Aggregator | v1 |
| `.semgrep.yml` | Kuratierte Semgrep-Regeln | v1 |
| `swarm.config.json` | Plattform-Konfiguration | v3 (Telemetrie, auto_retry_threshold pro Modul/Gate) |
| `progress.json` | Projekt-Konfiguration | v2 (auto_retry_threshold pro Modul/Gate) |
| `buster-processor.cjs` | Buster-Sidecar (spawnt Subagenten) | v6.0 |
| `redis.js` | Redis-Client + Completion-Stream | v2 |
| `verify-task.js` | Agent-Scope-Firewall + Push-Gate | v2 |

### Redis-Streams

| Stream | Richtung | Zweck |
|--------|----------|-------|
| `swarm:buster:tasks` | Pipeline → Processor | Task-Dispatch |
| `swarm:pipeline:<project>:completions` | Subagent → Pipeline | Abschluss-Signal |
| `swarm:pipeline:<project>:completions:log` | Archiv | Alte Abschlüsse |
| `pipeline:events` | Pipeline → Abonnenten | Telemetrie-Events (v9-Neu, konfigurierbar) |

### Dateibenennung (Review-Gates)

```
.swarm/echo-reviews/
├── MIDPOINT-REVIEW-INSTRUCTIONS.md        ← Eingabe (Architecture-Branch)
├── echo-opus-MIDPOINT-REVIEW.json         ← Reviewer-Ausgabe (Einzelreviewer)
└── MIDPOINT-REVIEW.json                   ← Gate-Ausgabe (Kopie der Reviewer-Ausgabe)
```

Muster: `{reviewer.label}-{gate.review_name}.json`

---

## 42. Pipeline-Telemetrie

### Überblick (v9-Neu)

`services/telemetry.js` emittiert strukturierte Events an einen Redis-Stream. Externe Überwachungssysteme können diesen Stream konsumieren, ohne in den Pipeline-Code eingreifen zu müssen.

### Konfiguration

```json
{
  "telemetry": {
    "stream_key": "pipeline:events"
  }
}
```

| Feld | Standard | Beschreibung |
|------|----------|-------------|
| `telemetry.stream_key` | `"pipeline:events"` | Redis-Stream-Schlüssel für Telemetrie-Events |

Wenn `telemetry` nicht konfiguriert ist oder Redis nicht erreichbar ist, werden Events still verworfen.

### `emitTelemetryEvent(ctx, eventType, payload)` — services/telemetry.js

Emittiert ein Event an den konfigurierten Redis-Stream via `XADD`.

**Event-Schema:**
```javascript
{
  event_type: string,
  project: string,
  run_id: string,
  module_id?: string,
  gate_id?: string,
  timestamp: string,   // ISO 8601
  payload: object,
}
```

### Standard-Events

| Event | Auslöser | Nutzlast-Felder |
|-------|----------|----------------|
| `pipeline_started` | `runPipeline()`-Start | `{ total_modules, pending_modules }` |
| `module_started` | Forge-Phase-Start | `{ module_id, title, attempt }` |
| `forge_completed` | Forge-Phase-Ende | `{ module_id, has_changes, forge_commit_hash }` |
| `buster_dispatched` | Buster-Dispatch | `{ module_id, test_suites, commit_hash }` |
| `module_passed` | PASS-Status | `{ module_id, duration_seconds, fail_count }` |
| `module_failed` | FAIL-Status | `{ module_id, phase, fail_count, is_timeout }` |
| `gate_started` | Gate-Start | `{ gate_id, gate_type, attempt }` |
| `gate_passed` | Gate-PASS | `{ gate_id, gate_type }` |
| `gate_failed` | Gate-FAIL | `{ gate_id, gate_type, fix_cycles_used }` |
| `pipeline_completed` | `runPipeline()`-Ende | `{ exit_code, total_duration_seconds, modules_passed }` |
| `rate_limit_hit` | Rate-Limit erkannt | `{ module_id, pause_count, cooldown_hours }` |

---

## 43. v9 Neue Funktionen

### REPO_ROOT-Umgebungsvariable

`REPO_ROOT` wurde bereits in v8 unterstützt (Priorität 2 bei der Repo-Root-Auflösung). In v9 ist die Variable in der Umgebungsvariablen-Tabelle des CLI explizit dokumentiert und in den Fehlermeldungen des Konfigurations-Loaders beschrieben.

**Verwendung:**
```bash
REPO_ROOT=/workspace/meinprojekt node pipeline.js --project meinprojekt
```

Nützlich wenn die Pipeline aus einem Verzeichnis ausserhalb des Repos aufgerufen wird (z.B. aus `/app/skills/nova/`).

### Konfigurierbare Auto-Wiederhol-Schwelle pro Modul/Gate

`auto_retry_threshold` kann jetzt in `progress.json` pro Modul oder Gate überschrieben werden:

```json
{
  "modules": {
    "03": {
      "title": "Komplexes Auth-Modul",
      "auto_retry_threshold": 3
    }
  },
  "gates": {
    "final-buster": {
      "auto_retry_threshold": 1
    }
  }
}
```

Auflösung: Modul/Gate-Überschreibung → Plattform-Standard aus `swarm.config.json`. Damit können kritische Module mehr Wiederholungen erhalten, während Gates strenger behandelt werden.

### Pipeline-Telemetrie

Strukturierte Events werden an den Redis-Stream `pipeline:events` emittiert (konfigurierbar via `telemetry.stream_key` in swarm.config.json). Für Details siehe Abschnitt 42.

### ACP-Prozess-Bereinigung

Wenn ein ACP-Agenten-Kill via Gateway (`/stop`) ausgeführt wird, beräumt `agents/shutdown.js` automatisch verwaiste OS-Prozesse:

1. `acp-monitor.js` trackt die OS-PIDs aller ACP-Subprozesse über Transcript-Überwachung
2. `untrackAgent(ctx, label)` ruft `reapAcpProcess(ctx, label)` auf
3. `reapAcpProcess` sendet SIGTERM an alle dem Agenten zugeordneten PIDs
4. Nach 5s folgt SIGKILL für Prozesse die nicht terminiert haben

Verhindert verwaiste Prozesse die nach ungeplanten Agenten-Kills weiterhin Rechenzeit und Speicher belegen.

### Verbesserte Pipeline-Zusammenfassung

`services/summary.js` generiert am Ende jeder Pipeline-Ausführung eine strukturierte Zusammenfassung:

```javascript
{
  project: string,
  run_id: string,
  duration_seconds: number,
  modules_total: number,
  modules_passed: number,
  modules_failed: number,
  modules_blocked: number,
  fail_patterns: [{ module, phase, summary }],
  recommendations: string[],
  cost_summary: { total_tokens_in, total_tokens_out, total_duration_seconds },
}
```

Die Zusammenfassung wird als Discord-Embed gesendet und an Nova zurückgegeben.

---

## 44. lint-report.js-Referenz

### Tool-Verzeichnis (14 Tools, 2 Tiers)

| Tool | Programm | Sprache | Tier | Erkennung |
|------|----------|---------|------|-----------|
| tsc | `tsc` | TS | pre-check | `tsconfig.json` |
| ruff | `ruff` | Python | pre-check | `pyproject.toml` / `requirements.txt` |
| shellcheck | `shellcheck` | Shell | pre-check | `*.sh`-Dateien |
| eslint | `eslint` | JS/TS | full | `package.json` |
| knip | `knip` | JS/TS | full | `package.json` / `tsconfig.json` |
| madge | `madge` | JS/TS | full | `package.json` / `tsconfig.json` |
| npm-audit | `npm` | JS/TS | full | `package.json` |
| mypy | `mypy` | Python | full | `pyproject.toml` / `requirements.txt` |
| pip-audit | `pip-audit` | Python | full | `pyproject.toml` / `requirements.txt` |
| semgrep | `semgrep` | Multi | full | immer (kuratiertes `.semgrep.yml` oder auto) |
| hadolint | `hadolint` | Docker | full | `Dockerfile` |
| helm-lint | `helm` | K8s | full | `Chart.yaml` |
| kubeconform | `kubeconform` | K8s | full | `Chart.yaml` |
| yamllint | `yamllint` | YAML | full | `*.yaml` / `*.yml` |

---

## 45. Änderungsprotokoll v8 → v9

### Designprinzip

| Prinzip | Beschreibung |
|---------|-------------|
| **Modulare Architektur** | `pipeline.js` (4921 Zeilen monolithisch) aufgeteilt in ~25 Einzelverantwortungs-Module unter `skills/nova/pipeline/`. Ein dünner Shim sichert Abwärtskompatibilität. |
| **PipelineContext statt globaler Variablen** | Alle veränderlichen globalen Variablen sind in `PipelineContext` gekapselt. Ermöglicht parallele Läufe und vereinfachte Unit-Tests. |
| **ACP-Prozess-Bereinigung** | Automatisches Beräumen verwaister OS-Prozesse nach Agent-Kill. `acp-monitor.js` trackt PIDs, `reapAcpProcess()` sendet SIGTERM/SIGKILL. |
| **Pipeline-Telemetrie** | `services/telemetry.js` emittiert strukturierte Events an Redis-Stream `pipeline:events`. Konfigurierbar via `telemetry.stream_key`. |
| **Konfigurierbare Auto-Wiederhol-Schwelle** | `auto_retry_threshold` kann in `progress.json` pro Modul oder Gate überschrieben werden. |

### Neue Module

| Modul | Beschreibung |
|-------|-------------|
| `core/context.js` | PipelineContext — kapselt allen veränderlichen Zustand |
| `agents/acp-monitor.js` | ACP-Session-Zustand + Transcript-Überwachung + PID-Tracking |
| `services/telemetry.js` | Event-Emission an Redis-Stream |
| `services/summary.js` | Pipeline-Zusammenfassung + strukturierte Review-Generierung |

### Neue Funktionen

| Funktion | Modul | Beschreibung |
|----------|-------|-------------|
| `emitTelemetryEvent(ctx, eventType, payload)` | services/telemetry.js | Sendet strukturiertes Event an Redis-Stream. |
| `reapAcpProcess(ctx, label)` | agents/shutdown.js | SIGTERM/SIGKILL für verwaiste OS-Prozesse nach Agent-Kill. |
| `generatePipelineSummary(ctx, result)` | services/summary.js | Strukturierte End-of-Run-Analyse mit Empfehlungen. |
| `createContext(config, progress)` | core/context.js | Erstellt neuen PipelineContext für eine Ausführung. |

### Signatur-Änderungen

Alle Funktionen erhalten jetzt `ctx` (PipelineContext) als ersten Parameter statt `config`. Externe Aufrufer müssen einen Kontext erstellen:

```javascript
import { loadConfig, createContext, runPipeline } from './pipeline/index.js';
const { config, progress } = await loadConfig('meinprojekt');
const ctx = createContext(config, progress);
await runPipeline(ctx, progress);
```

### Entfernte Funktionen / Code

| Entfernt | Grund |
|----------|-------|
| Globale Zustandsvariablen (`_shutdownState`, `_tmpDir`, `RUN_ID` usw.) | Ersetzt durch PipelineContext |
| Monolithische `pipeline.js` (4921 Zeilen) | Aufgeteilt in ~25 Module unter `pipeline/` |

### CLI

| Flag / Umgebungsvariable | Status |
|------|--------|
| `REPO_ROOT` | Explizit in der CLI-Dokumentation aufgeführt (war in v8 bereits funktional aber undokumentiert) |

### Konfiguration (swarm.config.json)

| Feld | Status |
|------|--------|
| `telemetry.stream_key` | v9 NEU — Redis-Stream-Schlüssel für Telemetrie-Events |
| `auto_retry_threshold` pro Modul/Gate | v9 NEU — kann in progress.json pro Modul/Gate überschrieben werden |

### Exports (Änderungen)

| Funktion | Status |
|----------|--------|
| `emitTelemetryEvent` | v9 NEU (exportiert) |
| `generatePipelineSummary` | v9 NEU (exportiert) |
| `createContext` | v9 NEU (exportiert) |
