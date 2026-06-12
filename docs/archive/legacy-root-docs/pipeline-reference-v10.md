# PIPELINE — Vollständige Architektur- und Referenzdokumentation (v10)

**Architektur:** Modulares ES-Modul-System (Node.js)
**Zweck:** Deterministischer Swarm-Orchestrator für die KubeClaw Multi-Agent-Plattform
**Aufrufer:** Nova (Opus-Orchestrator) oder direkt via CLI
**Version:** v10 — Wave 3 Feature-Audit: Approval Gates, Governance, Budget, Validierung, Modul-Exporte korrigiert
**Shim-Ort:** `/app/skills/nova/pipeline.ts` (≤25 Zeilen — Kompatibilitäts-Shim)
**Modul-Verzeichnis:** `/app/skills/nova/pipeline/`
**Companion:** `/app/skills/pipeline/tools/lint-report.ts` (Statische Analyse Aggregator), `/app/skills/pipeline/tools/redis.ts` (Redis Client + Completion Stream)

---

## Inhaltsverzeichnis

1. [Überblick und Designphilosophie](#1-überblick-und-designphilosophie)
   - 1a. [Modulare Architektur](#1a-modulare-architektur)
2. [Exit-Codes und Status-Modell](#2-exit-codes-und-status-modell)
3. [Konfigurationssystem](#3-konfigurationssystem)
4. [Modulstruktur und öffentliche Schnittstellen](#4-modulstruktur-und-öffentliche-schnittstellen)
5. [Sicherheitsschicht: Safe Execution Wrappers](#5-sicherheitsschicht-safe-execution-wrappers)
6. [Gateway Tool API (ACP Session Management)](#6-gateway-tool-api-acp-session-management)
7. [Pfadvalidierung](#7-pfadvalidierung)
8. [Temp-Verzeichnis-Management](#8-temp-verzeichnis-management)
9. [Graceful Shutdown (Multi-Agent)](#9-graceful-shutdown-multi-agent)
10. [Structured Logging](#10-structured-logging)
11. [Config Loading und Validierung](#11-config-loading-und-validierung)
12. [Pfad-Helpers und Model Resolution](#12-pfad-helpers-und-model-resolution)
13. [Status-Management und Git-Integration](#13-status-management-und-git-integration)
14. [Git-Operationen](#14-git-operationen)
15. [Discord-Benachrichtigungen](#15-discord-benachrichtigungen)
16. [Blueprint-Manager](#16-blueprint-manager)
17. [Agent-Dispatch-System (Dual Mode)](#17-agent-dispatch-system-dual-mode)
18. [Session-End-Polling (Forge-Fix-Cycles)](#18-session-end-polling-forge-fix-cycles)
19. [File Readers](#19-file-readers)
20. [Buster Prompt Builder](#20-buster-prompt-builder)
21. [Qdrant Memory Integration](#21-qdrant-memory-integration)
22. [Polling-System (Konsolidiert)](#22-polling-system-konsolidiert)
23. [Rate-Limit-Handling](#23-rate-limit-handling)
24. [Redis Completion Stream (Buster)](#24-redis-completion-stream-buster)
25. [Git-Sync (Forge → Buster Handoff)](#25-git-sync-forge--buster-handoff)
26. [Dependency-Prüfung (Content-Aware)](#26-dependency-prüfung-content-aware)
27. [Failure Handler](#27-failure-handler)
28. [Lint-Report-Integration](#28-lint-report-integration)
29. [Pre-Check (Forge-Output-Validierung)](#29-pre-check-forge-output-validierung)
30. [Forge Prompt Assembly](#30-forge-prompt-assembly)
31. [Module Runner (Stages-Aware)](#31-module-runner-stages-aware)
32. [Gate-Dispatcher](#32-gate-dispatcher)
33. [Buster-Gate-Runner (mit Fix-Loop)](#33-buster-gate-runner-mit-fix-loop)
34. [Review-Gate-Runner (Lint-Report + Single Reviewer)](#34-review-gate-runner-lint-report--single-reviewer)
34a. [Approval-Gate-Runner (Human-in-the-Loop)](#34a-approval-gate-runner-human-in-the-loop)
35. [Pipeline Runner](#35-pipeline-runner)
36. [Status-Ausgabe und Dry-Run](#36-status-ausgabe-und-dry-run)
37. [CLI-Wrapper und Entrypoint](#37-cli-wrapper-und-entrypoint)
38. [Exports](#38-exports)
39. [Vollständiger Ablaufgraph](#39-vollständiger-ablaufgraph)
40. [Abhängigkeitsgraph der Funktionen](#40-abhängigkeitsgraph-der-funktionen)
41. [Systemübergreifende Architektur](#41-systemübergreifende-architektur)
42. [Pipeline Telemetrie](#42-pipeline-telemetrie)
42a. [Validation Service (Wave 3)](#42a-validation-service-wave-3-neu)
42b. [Observability und Cost Service (Wave 3)](#42b-observability-und-cost-service-wave-3-neu)
43. [v9 Neue Features](#43-v9-neue-features)
44. [lint-report.ts Referenz](#44-lint-reportjs-referenz)
45. [Changelog v8 → v9 → v10](#45-changelog-v8--v9--v10)

---

## 1. Überblick und Designphilosophie

### Kernkonzept

Die Pipeline ist der deterministische Orchestrator des KubeClaw Swarm. Sie wird von Nova aufgerufen, um den Modul-Pipeline-Ablauf autonom abzuwickeln. Auf dem Happy-Path läuft alles automatisch durch. Bei Fehlern wird mit strukturiertem JSON beendet, sodass Nova den Fehler analysieren und einen neuen Anlauf starten kann.

### Kill-and-Respawn-Strategie

Das zentrale Designprinzip ist **Kill-and-Respawn**: Frische Agenten mit besseren Prompts übertreffen stale Agenten mit verschmutzten Context-Windows. Bei jedem Phasenwechsel oder Fehler wird die Agent-Session zerstört und eine neue gestartet.

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
| Buster (Modul) | `output_file` schreiben | redis.ts (`verify-task.ts`) | redis.ts |
| Buster (Gate) | output_file schreiben | redis.ts | redis.ts |

Prinzip: Was ein Script deterministisch erledigen kann, darf nicht dem Agent überlassen werden. Agents vergessen Instruktionen; Scripts nicht.

### Aufrufarten

```
node pipeline.ts --project kubecommand --repo /workspace/forgestack   # Volle Pipeline (Repo explizit)
node pipeline.ts --project kubecommand                    # Volle Pipeline (Repo auto-detect)
node pipeline.ts --project kubecommand --module 06        # Einzelmodul
node pipeline.ts --project kubecommand --resume           # Fortsetzen
node pipeline.ts --project kubecommand --status           # Status-JSON
node pipeline.ts --project kubecommand --dry-run          # Vorschau
node pipeline.ts --project kubecommand --blueprint 06     # Blueprint releasen
node pipeline.ts --project kubecommand --blueprint-list   # Verfügbare Blueprints
node pipeline.ts --project kubecommand --prompt "text"    # Nova-Prompt-Override
node pipeline.ts --project kubecommand --prompt-file p.md # Nova-Prompt aus Datei
```

Der Einstiegspunkt `pipeline.ts` ist ein dünner Kompatibilitäts-Shim. Die eigentliche Logik liegt im Modul-Verzeichnis (`pipeline/cli.js`).

---

## 1a. Modulare Architektur

### Überblick (v9-Neu)

In v9 wurde `pipeline.ts` (ehemals 4921 Zeilen monolithisch) in ein modulares System aufgeteilt. Das Ergebnis ist ein Kompatibilitäts-Shim plus ein klar strukturiertes Verzeichnis mit Single-Responsibility-Modulen.

### Dateibaum

```
skills/nova/pipeline.ts          ← Kompatibilitäts-Shim (≤25 Zeilen)
skills/nova/pipeline/
  core/
    config.js                    ← Config laden, validieren, Model-Resolution
    constants.js                 ← STATUS-Enum und EXIT-Codes
    context.js                   ← PipelineContext (ersetzt alle Globals)
    git.js                       ← Git-Basis (getRepoRoot, headHash, gitExec)
    logger.js                    ← Structured Logger
    paths.js                     ← Alle Pfad-Helpers
    policy.js                    ← Model/Thinking-Policy-Resolver
    runtime.ts                   ← Context/config-first Run-State, output, loadProgress
    temp.js                      ← Temp-Verzeichnis-Manager
  integrations/
    discord.js                   ← Discord Webhook
    gateway.js                   ← Gateway Tool API Client
    git.js                       ← Alle Git-Operationen (pull, push, commit)
    redis.ts                     ← Redis Completion Stream
  agents/
    acp-monitor.js               ← ACP Session State + Transcript Monitoring
    lifecycle.js                 ← spawn / kill / steer / verify / modelToHarness
    shutdown.js                  ← Graceful Shutdown + ACP Process Reaping
  prompts/
    buster-gate.js               ← Buster Gate Prompt Builder
    buster-instructions.js       ← Buster Instructions Reader
    buster-module.js             ← Buster Module Prompt Builder
    forge.js                     ← Forge Prompt Builder + readForgeInstructions
    gate-fix.js                  ← Gate Fix Cycle Prompt Builder
    review.js                    ← Reviewer Prompt Builder
    shared.js                    ← Gemeinsame Prompt-Abschnitte
  services/
    arch-validator.js            ← Architektur-Validator (Deterministic + Agent)
    blueprint.ts                 ← Blueprint Release + Control File Sync
    case-study.js                ← Case Study Generation
    dependencies.js              ← Modul-Abhängigkeitsprüfung
    failures.js                  ← Fehler-Klassifizierung + Eskalation
    governance-context.js        ← Governance-Kontext (Arch-Validator + Approval)
    lint.js                      ← Lint-Report + Pre-Check (generateLintReport, runPreCheck)
    observability.js             ← Artefakt-Logging, Usage/Kosten-Tracking, Budget-Thresholds, appendStructuredEvent
    polling.js                   ← Alle Polling-Flows
    rate-limit.js                ← Rate-Limit-Recovery
    redis-log.js                 ← Redis-Exchange-Log (logRedisSent, logRedisReceived)
    status-store.js              ← Lifecycle Read Models + Artefakt-I/O
    summary.js                   ← Pipeline Summary + Review-Generierung
    telemetry.js                 ← Event-Emission an Redis Stream
    validation.js                ← Preflight Contract + Delivery Lint Validation
  runners/
    approval-gate-runner.js      ← Human-in-the-Loop Approval Gate
    buster-gate-runner.ts        ← Buster Gate Execution + Fix Loop
    gate-runner.js               ← Gate-Dispatcher (Strategy-Map)
    module-runner.ts             ← Modul-Ausführungs-Lifecycle
    pipeline-runner.js           ← Top-Level Pipeline Loop
    review-gate-runner.js        ← Review Gate Execution
  tests/                         ← Unit-Test-Dateien pro Modul
  index.js                       ← Öffentliche Exports
  cli.js                         ← CLI-Einstiegspunkt
  README.md                      ← Architektur-Überblick
```

### Shim-Mechanismus

`skills/nova/pipeline.ts` re-exportiert alles aus `pipeline/index.js` und delegiert den CLI-Aufruf an `pipeline/cli.js`. Bestehende Aufrufer (`node pipeline.ts --project ...`) funktionieren unverändert.

```javascript
// skills/nova/pipeline.ts — Kompatibilitäts-Shim
export * from './pipeline/index.js';
export { default } from './pipeline/index.js';
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { runCli } = await import('./pipeline/cli.js');
  await runCli();
}
```

### PipelineContext

Der globale Run-State aus v8 (`_shutdownState`, `_tmpDir`, etc.) ist in `PipelineContext` (`core/context.ts`) gekapselt; Git-HEAD-Caches sind repo-scoped in den gemeinsamen Git-Primitives. Jede Pipeline-Invokation erstellt einen eigenen Context. Das ermöglicht parallele Runs und vereinfacht Unit-Tests erheblich.

### Modul-Mapping (v8 → v9)

| v8-Funktion(sgruppe) | v9-Modul |
|---|---|
| `gitExec`, `gitPull*`, `gitPush*`, `gitCommit*` | `integrations/git-worktree.ts` |
| `gatewayInvoke` | `integrations/gateway.js` |
| `discord`, `discordEmbeds` | `integrations/discord.js` |
| `spawnAcpAgent`, `killAcpAgent`, `spawnAgent`, `killAgent`, `steerAgent`, `verifyAgentAlive` | `agents/lifecycle.js` |
| `registerShutdownHooks`, `trackAgent`, `untrackAgent`, `setShutdownContext` | `agents/shutdown.js` |
| `buildForgePrompt` | `prompts/forge.js` |
| `buildBusterModulePrompt`, `buildBusterCompletionProtocol` | `prompts/buster-module.js` |
| `buildBusterGatePrompt`, `buildBusterGateCompletionProtocol` | `prompts/buster-gate.js` |
| `buildGateFixPrompt` | `prompts/gate-fix.js` |
| `buildReviewerPrompt` | `prompts/review.js` |
| `buildTestWorkspaceSection` | `prompts/shared.js` |
| `loadStatus`, `saveStatus`, `initStatus` | `services/status-store.js` |
| `releaseBlueprint`, `listBlueprints` | `services/blueprint.ts` |
| `pollGeneric`, `pollStatus`, `pollDual`, `pollForFile`, `pollForSessionEnd` | `services/polling.js` |
| `handleRateLimit`, `withRateLimitRecovery` | `services/rate-limit.js` |
| `handleFail`, `buildNovaEscalation` | `services/failures/retry-policy.js` |
| `extractAgentFailReason` | `services/failures/classification.js` |
| `emitEvent`, `onModuleStarted` u.a. Wrapper | `services/telemetry.ts` |
| `generateProjectSummary`, `generatePipelineReview` | `services/summary.js` |
| `generateCaseStudy` | `services/case-study.js` |
| `runArchValidator` | `services/arch-validator.js` |
| `writeCostReport` | `services/observability.js` |
| `runApprovalGate` | `runners/approval-gate-runner.js` |
| `runModule`, `executeModuleAttempt` | `runners/module-runner.ts` |
| `runGate` | `runners/gate-runner.js` |
| `runBusterGate`, `_runBusterGateOnce` | `runners/buster-gate-runner.ts` |
| `runReviewGate`, `_runReviewOnce` | `runners/review-gate-runner.js` |
| `runPipeline`, `findNextStep` | `runners/pipeline-runner.js` |
| `loadConfig`, `validateConfig`, `loadProgress` | `core/config.js` |
| `modulePath`, `statusPath`, `relPath`, `completionStreamKey` | `core/paths.js` |
| `log`, `output` | `core/logger.js` |
| `initTempDir`, `cleanupTempDir`, `tmpFile` | `core/temp.js` |

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

### Status-Enum

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
/home/node/.openclaw/swarm.config.json             ← Plattform (einmal pro Installation; SWARM_CONFIG secondary candidate)
<repo>/Projects/<project>/src/.swarm/progress.json  ← Projekt (Single Source of Truth)
Repo Root                                  ← CLI/Env/Auto-detect
```

### Repo-Root-Resolution

Die Pipeline kann von überall gestartet werden (z.B. `/app/skills/nova/`). Repo-Root wird in dieser Reihenfolge aufgelöst:

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
| Session Nudge | `session_nudge_threshold` (erforderlicher Plattformwert; Chart: 0.75 = 75% des Timeouts) |
| Retry | `auto_retry_threshold` |
| Rate Limit | `rate_limit.cooldown_hours`, `rate_limit.max_pauses_per_module` |
| Memory | `memory.enabled`, `memory_js_path`, `recall_limit`, `recall_before_forge` (Default: `true`), `feedback_after_outcome`, `targeted_decay_amount` (Default: `0.1`) |
| Agents | `agents.forge`, `agents.buster`, `agents.echo` (Dispatch-Modi) |
| Model Fallback | `fallback_model` (einziger Plattform-Fallback; Progress-/Runtime-Modelle haben Vorrang) |
| Review Defaults | `timeout_minutes`, `max_fix_cycles`, `lint_tier` |
| Pre-Check | `pre_check.enabled`, `pre_check.lint_report_path`, `pre_check.timeout_seconds`, `pre_check.semgrep_config_path` |
| Telemetrie | `telemetry.enabled`, `telemetry.stream_key` compatibility |

Pfad: `/home/node/.openclaw/swarm.config.json`; `SWARM_CONFIG` nur als expliziter Override

**`fallback_model` ist die einzige Plattform-Model-Konfiguration:** Rollenmodelle (`forge`, `buster`, `echo`, `arch_validator`) gehören in `progress.json` (`defaults.models`, Modul-/Gate-/Generator-/Arch-Overrides). Model-Resolution passiert zur Laufzeit via `resolvePolicy()` (runtime override → scope policy → `progress.defaults.models` → `fallback_model`). Für Details siehe §12.

### progress.json (Projekt-Level)

Enthält alles projektspezifische:

| Bereich | Felder |
|---------|--------|
| Identität | `project`, `version` |
| Ablauf | `execution_order`, `phases` |
| Module | `modules` (mit `dir`, `title`, `stages`, `forge_model`, `forge_subagent`, `depends_on`, `substeps`, `timeout_minutes`, `max_fails`, `auto_retry_threshold`) |
| Gates | `gates` (mit `type`, `title`, `on_fail`, `on_nogo`, `on_timeout`, `instructions_file`, `output_file`, `review_name`, `review_output_dir`, `model`, `forge_model`, `max_fix_cycles`, `timeout_minutes`, `reviewers`, `lint_tier`, `auto_retry_threshold`) |
| Defaults | `defaults.models.<agent>`, `defaults.thinking.<agent>` (Priorität 3 in Policy-Auflösung) |

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
| `reviewers` | Gate `reviewers` oder `progress.defaults.reviewers`; sonst keine Reviewer |
| `timeout_minutes` | `review_defaults.timeout_minutes` |
| `max_fix_cycles` | `review_defaults.max_fix_cycles` |
| `lint_tier` | `review_defaults.lint_tier` |

### auto_retry_threshold — Auflösung

`auto_retry_threshold` kann auf drei Ebenen konfiguriert werden (höhere Priorität gewinnt):

| Priorität | Quelle | Beispiel |
|-----------|--------|---------|
| 1 | `modules.<id>.auto_retry_threshold` | Modul-Override in progress.json |
| 2 | `gates.<id>.auto_retry_threshold` | Gate-Override in progress.json |
| 3 | `swarm.config.auto_retry_threshold` | Erforderliche Plattformkonfiguration (Chart-Wert: `7`) |

---

## 4. Modulstruktur und öffentliche Schnittstellen

### core/config.js

Exports: `loadConfig(projectName, opts)`, `validateConfig(config, progress)`, `validateBusterConfig(config)`. Re-exportiert aus `core/policy.js`: `resolvePolicy`, `validateThinkingLevel`, `logEffectivePolicy`, `VALID_THINKING_LEVELS`, `THINKING_SUPPORTED_PATHS`, `THINKING_UNSUPPORTED_PATHS`.

**Hinweis:** `loadProgress(config)` liegt in `core/runtime.js` — wird von dort aus `index.js` exportiert.

Ablauf von `loadConfig`:
1. Repo-Root via `--repo` Flag / `REPO_ROOT` Env / `git rev-parse --show-toplevel`
2. swarm.config.json laden (`/home/node/.openclaw/swarm.config.json`, `SWARM_CONFIG` nur als expliziter Override)
3. Pfade aus Konvention ableiten: `Projects/<project>/src/.swarm/`
4. progress.json laden
5. Merge: swarmConfig (Basis) + project + repo_root + paths
6. Discord-Webhook kommt aus dem kanonischen `discord_webhook_url`; Deployment kann `DISCORD_WEBHOOK` vor dem Runtime-Start dorthin materialisieren.
7. `validateConfig(config, progress)` → fail-fast
8. Return `{ config, progress }`

### core/paths.js

Exports: `modulePath`, `statusPath`, `swarmRoot`, `projectSrcPath`, `relPath`, `completionStreamKey`, `gateStatusPath`, `moduleLogDir`, `moduleLintLogDir`, `gateLogDir`, `gateLintLogDir`, `costLogDir`, `redisLogDir`, `archValidatorLogDir`, `validateSafePath`.

**Hinweis:** `resolvePolicy` liegt in `core/policy.js`; `modelToHarness` liegt in `agents/lifecycle.js`.

### core/constants.js

Exports: `STATUS` (Enum-Objekt), `EXIT_OK`, `EXIT_ERROR`, `EXIT_NEEDS_NOVA`, `EXIT_BLOCKED`, `EXIT_TIMEOUT`, `EXIT_RATE_LIMITED`. Keine Laufzeit-Logik — reine Konstanten.

### core/runtime.ts

Exports: `createRunId`, `createRunStats`, `bindRunContext`, `resolveRunContext`, `getRunId`, `getRunStats`, `getRunState`, `output`, `loadProgress`.

`PipelineContext` / explicit config projections are authoritative for run identity and stats. No global run-id fallback is authoritative.

### core/policy.js

Exports: `resolvePolicy`, `validateThinkingLevel`, `logEffectivePolicy`, `VALID_THINKING_LEVELS`, `THINKING_SUPPORTED_PATHS`, `THINKING_UNSUPPORTED_PATHS`. Wird von `core/config.js` re-exportiert.

### core/context.js

`PipelineContext` kapselt den gesamten mutable State einer Pipeline-Invokation:

```javascript
{
  config,                        // Merged config
  progress,                      // progress.json
  tmpDir,                        // Temp-Verzeichnis-Pfad
  runId,                         // UUID für Log-Korrelation
  shutdownState: {
    config: null,
    statusDir: null,
    activeSessions: new Map(),   // label → childSessionKey
    currentLabel: null,
  },
  headHashCache: null,
  repoRoot: null,
  memoryModule: null,
  redisModule: null,
  logModule: null,               // current module for log context
  logPhase: null,                // current phase for log context
}
```

### core/logger.js

Exports: `createLogger(ctx)`, `log(level, msg, data)`, `setActiveContext(ctx)`, `clearActiveContext()`, `getActiveContext()`, `initContextLogging(ctx, pipelineLogFd)`.

JSON-Lines auf stderr: `{ ts, level, run_id, module?, phase?, msg, data? }`. `log()` delegiert an den aktiven Context aus `AsyncLocalStorage`; fällt auf reines stderr-Schreiben zurück wenn kein Context aktiv ist.

**Hinweis:** `output(result)` (Pretty-printed JSON auf stdout) ist in `core/runtime.js`, nicht in logger.js.

### core/temp.js

Exports: `createTempManager(ctx)`. Stellt `initTempDir`, `cleanupTempDir` und `tmpFile` als Methoden des zurückgegebenen Managers bereit.

---

## 5. Sicherheitsschicht: Safe Execution Wrappers

### `gitExec(repoRoot, args, opts)` — integrations/git-worktree.ts

Sicherer Git-Wrapper. Nutzt `-C repoRoot` für Repository-Kontext. Default: `encoding: 'utf8'`, `timeout: 30000`.

### `postDiscordWebhook(url, options)` — common Discord webhook transport

Gemeinsamer Webhook-Wrapper für Nova/Buster Runtime-Pfade. Nutzt `fetch()`, Default-Timeout `10000`, und validiert HTTP-Erfolg über `response.ok`.

**Kritisch:** Non-OK HTTP-Antworten (`4xx`/`5xx`) gelten als Delivery-Fehler mit sicherer Status-/Body-Preview-Metadaten, nicht als erfolgreicher Versand.

---

## 6. Gateway Tool API (ACP Session Management)

### Architektur

ACP Sessions (Forge, Echo) werden über die Gateway Tool API per HTTP verwaltet — **nicht** über CLI-Befehle. Das Gateway ist ein lokaler HTTP-Server, der Session-Lifecycle-Operationen als Tool Invocations bereitstellt.

```
resolveGatewayInvokeUrl()  // OPENCLAW_GATEWAY_URL -> GATEWAY_URL -> default /tools/invoke
resolveGatewayToken()      // OPENCLAW_GATEWAY_TOKEN -> GATEWAY_TOKEN -> ''
```

Das gesamte Gateway-Modul lebt in `integrations/gateway.js`.

### `gatewayInvoke(ctx, tool, args, timeoutMs)` — integrations/gateway.js

Async HTTP POST an die Gateway Tool API. Nutzt `fetch()` mit `AbortController` für Timeout. Retourniert geparstes JSON oder `{ raw: text }` bei nicht-parseablem Response.

**Fehlerbehandlung:** Non-2xx → Error mit `httpStatus` und `httpBody` Properties.

**Supported Tools:**

| Tool | Beschreibung |
|------|-------------|
| `sessions_spawn` | Startet eine ACP-Session mit `runtime: 'acp'` |
| `sessions_send` | Sendet eine Nachricht (Steer oder `/stop` für Kill) |
| `session_status` | Fragt den Session-Status ab (ACP State Machine) |

### Module-private shutdown stop helper — agents/shutdown.js

`registerShutdownHooks(...)` nutzt jetzt denselben gemeinsamen `killSession(...)` Stop/Confirm-Pfad wie die Lifecycle-Helfer. Lokal in `agents/shutdown.js` bleibt nur der nachgelagerte Reaper für begrenzte Prozessbereinigung.

### ACP Session State Machine

```
creating → idle → running → idle
running → cancelling → idle | error
idle → closed
```

- `running`, `creating`, `cancelling` = Session aktiv → Polling fortsetzten
- `idle`, `closed`, `error` = Run beendet → Polling beendet

---

## 7. Pfadvalidierung

### `ALLOWED_PATH_PREFIXES`

```javascript
const ALLOWED_PATH_PREFIXES = ['/app/', '/opt/', '/home/'];
```

### `validateSafePath(filePath, label)` — core/paths.js

Validiert dynamische Script-Pfade (redis_js_path, memory_js_path) gegen die Allowlist. Prüft auf leere Strings und Prefix-Match. `path.resolve()` normalisiert den Pfad; die Prefix-Allowlist ist die eigentliche Security-Boundary.

---

## 8. Temp-Verzeichnis-Management

### `initTempDir(ctx)` — core/temp.js

Erstellt `swarm-pipeline-*` unter `os.tmpdir()`. Registriert `process.on('exit', cleanupTempDir)` für garantiertes Cleanup.

### `cleanupTempDir(ctx)` — core/temp.js

Rekursives `fs.rmSync`. Bei Fehler nur Warning, kein Throw.

### `tmpFile(ctx, prefix, moduleId, ext)` — core/temp.js

Generiert eindeutige Temp-Dateipfade: `{prefix}-{moduleId}-{ts}-{rand}{ext}`.

---

## 9. Graceful Shutdown (Multi-Agent)

### Architektur — agents/shutdown.js

Map-basiertes Tracking — speichert `label → childSessionKey` für Gateway-basiertes Kill:

```javascript
shutdownState = {
  config: null,
  statusDir: null,              // Module status dir (für FAIL-Markierung)
  activeSessions: new Map(),    // label → childSessionKey (für Gateway kill)
  currentLabel: null,
};
```

### `registerShutdownHooks(ctx)` — agents/shutdown.js

SIGTERM/SIGINT Handler: Alle tracked Sessions via module-private Shutdown-Helfer stoppen/aufräumen → Status als FAIL markieren → Temp aufräumen → Exit 1.

**v9-Neu — ACP Process Reaping:** Nach dem Kill via Gateway sendet `registerShutdownHooks` zusätzlich ein SIGTERM an alle OS-Prozesse, die dem beendeten ACP-Agent zugeordnet waren (via PID-Tracking in `acp-monitor.js`). Verhindert Orphan-Prozesse nach ungeplanten Shutdowns.

### `trackAgent(ctx, label, sessionKey)` — agents/shutdown.js

Fügt ein ACP-Session-Label + sessionKey zur Map hinzu. Aufgerufen von `spawnAcpAgent` und `spawnReviewerAgent`.

### `untrackAgent(ctx, label)` — agents/shutdown.js

Entfernt ein Label aus der Map. Aufgerufen von `killAcpAgent` und `killReviewerAgent`.

**v9-Neu:** `untrackAgent` ruft zusätzlich `reapAcpProcess(ctx, label)` aus `acp-monitor.js` auf, um verwaiste OS-Prozesse des beendeten Agents zu beräumen.

### `setShutdownContext(ctx, agentType, moduleId, statusDir)` — agents/shutdown.js

Setzt Modul-Kontext (statusDir für FAIL-Markierung). Pre-tracked das Modul-Agent-Label mit `null` sessionKey.

### `clearShutdownContext(ctx)` — agents/shutdown.js

Entfernt `currentLabel` aus `activeSessions` und löscht `statusDir`.

---

## 10. Structured Logging

### `log(ctx, level, msg, data)` — core/logger.js

JSON-Lines auf stderr: `{ ts, level, run_id, module?, phase?, msg, data? }`. Die `run_id` aus dem Context korreliert alle Einträge einer Pipeline-Invokation.

### `output(result)` — core/logger.js

Pretty-printed JSON auf stdout. Nova parst diesen Output.

---

## 11. Config Loading und Validierung

### `loadConfig(projectName, opts)` — core/config.js

Lädt und mergt swarm.config.json (Plattform) + progress.json (Projekt). Ablauf siehe Sektion 4.

### `validateConfig(config, progress)` — core/config.js

Fail-fast-Validierung beider Quellen:

**Config-Felder:** project, repo_root, paths sowie die erforderlichen Plattformfelder aus `swarm.config.json`: `agents.forge`, `agents.buster`, `agents.echo`, `fallback_model`, `poll_interval_seconds`, `default_timeout_minutes`, `default_max_fails`, `auto_retry_threshold`, `session_nudge_threshold`, `rate_limit`, `discord_alerts`, `pre_check`, `review_defaults`, `plugins`, und `acp_monitor`. Agent dispatch/redis_js_path werden validiert, aber nicht synthetisiert.

**Plattformwerte:** Die Runtime erzeugt keine versteckten Defaults für `swarm.config.json`-Felder; fehlende Werte sind Config-Fehler.

**Progress-Felder:** project, execution_order, modules. Gate-Typ-Validierung (`buster` | `review` | `approval`). on_nogo Enum (`fix_and_rereview`). on_fail Enum (`fix_and_retest`). on_timeout Enum (`block` | `continue`).

**Wave 3 Felder**: `acp_monitor` ist erforderliche Plattformkonfiguration in `swarm.config.json` (`unknown_poll_limit`, `stale_poll_limit`, `max_transcript_extensions`, `transcript_grace_ms`, `monitor_poll_ms`) und wird ohne versteckte Runtime-Defaults validiert; außerdem `telemetry.enabled` (boolean), `case_study.enabled` (boolean), `case_study.model` (string), `case_study.output_file` (string).

**Security:** Dynamische Script-Pfade via `validateSafePath` aus `core/paths.js`.

### `loadProgress(config)` — core/runtime.js

Lädt `progress.json` aus `config.paths.progress_file`. Thin Wrapper für Export-Kompatibilität.

---

## 12. Pfad-Helpers und Model Resolution

### Pfad-Funktionen — core/paths.js

| Funktion | Beschreibung |
|----------|-------------|
| `modulePath(config, dir)` | `modules_dir + dir` |
| `swarmRoot(config)` | `config.paths.swarm_dir` |
| `projectSrcPath(config)` | Parent von swarm_dir (wo Agents Code lesen/schreiben) |
| `relPath(config, absPath)` | Absolut → Repo-relativ |
| `completionStreamKey(config)` | `swarm:pipeline:<project>:completions` |

### `resolvePolicy(config, progress, agentName, options)` — core/policy.js

Zentrale Model-/Thinking-Policy. Model-Resolution läuft über Runtime-Override, Scope-Policy, `progress.defaults.models.<agent>` und zuletzt das explizite Plattform-`fallback_model`.

### `modelToHarness(modelId)` — agents/lifecycle.js

Mappt Model-IDs auf ACP Harness-IDs:

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

### `loadStatus(config, dir)` — services/status-store.js

Lädt den Modulstatus aus den run-scoped Lifecycle-Read-Models. Bei fehlendem Modul-Eintrag: `null`.

**Defensive Defaults:** Mergt `STATUS_DEFAULTS` (`fail_summaries: []`, `fail_count: 0`, `history: []`, `decayed_memory_ids: []`, `cost: {...}`) auf das geparste Objekt. Schützt gegen Agent-Overwrites.

### `saveStatus(config, dir, status)` — services/status-store.js

**Atomic Write:** `.tmp` + `fs.renameSync`. Committet via `gitCommitQuiet()`.

### `gitCommitQuiet(config, filePath, message)` — integrations/git-worktree.ts

Leiser Git-Commit. `--allow-empty` entfernt — "nothing to commit" wird still ignoriert. Echte Commit-Fehler: Warning + Discord-Alert (kein Throw). `invalidateHeadHash()` wird nur bei tatsächlichem Commit aufgerufen.

### Git-Hash-Cache — integrations/git-worktree.ts

`headHash(ctx)` cached, `invalidateHeadHash(ctx)` nach jeder HEAD-ändernden Operation. Nutzt `ctx.repoRoot` (gesetzt von `loadConfig`).

### `initStatus(moduleId, moduleConfig)` — services/status-store.js

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
  substeps: [...] | null,      // Array von { id, title, forge_done: false }
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

### `_gitPullCore(ctx, allowDestructiveRecovery)` — integrations/git-worktree.ts

Kern für `git pull --rebase` mit Rebase-Abort-Recovery. Destruktiv (Polling) vs. Throw (vor Push).

### `gitPullForPolling(ctx)` | `gitPullBeforePush(ctx)` — integrations/git-worktree.ts

### `gitPushWithRetry(ctx, maxRetries, delayMs)` — integrations/git-worktree.ts

3 Versuche, 5s Delay, 60s Timeout pro Versuch. **Async.**

### `gitCommitAndPush(ctx, message, opts)` — integrations/git-worktree.ts

Einheitliche Funktion für alle Git-Commit+Push. Optionen: `addPaths`, `captureHash`, `softFail`. Prüft `git status --porcelain` vor Commit (kein leerer Commit). **Async.**

---

## 15. Discord-Benachrichtigungen

### `discord(ctx, level, title, description, fields)` — integrations/discord.js

Rich Embeds an Discord-Webhook über den gemeinsamen `postDiscordWebhook()` Transport. Komplett in try/catch um URL-Leak zu verhindern. **Async.**

**Guard:** Sendet nur wenn `config.discord_webhook_url` gesetzt UND `config.discord_alerts[level]` truthy ist.

**Embed-Struktur:**

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

### `listBlueprints(ctx)` — services/blueprint.ts

### `releaseBlueprint(ctx, moduleId, moduleDir, stages)` — services/blueprint.ts

Kopiert Blueprint vom Architecture-Branch. **Stage-Aware:** Verifiziert nur Files die von den konfigurierten Stages benötigt werden. Safety-Check: überschreibt keine existierende non-PENDING Lifecycle-Modulausführung. **Async.**

---

## 17. Agent-Dispatch-System (Dual Mode)

### Architektur

| Agent-Typ | Dispatch | Lifecycle | Tracking |
|-----------|----------|-----------|----------|
| Forge | ACP (Gateway Tool API) | Pipeline kontrolliert | `trackAgent(label, sessionKey)` / `untrackAgent` |
| Echo/Reviewer | ACP (Gateway Tool API) | Pipeline kontrolliert | `trackAgent(label, sessionKey)` / `untrackAgent` |
| Buster | Redis | Processor kontrolliert | No-Op kill |

### ACP Dispatch (via Gateway Tool API) — agents/lifecycle.js

- `acpLabel(agentType, moduleId)`: Format `<type>-<moduleId>`
- `modelToHarness(modelId)`: Model → ACP Harness ID Mapping
- `spawnAcpAgent(ctx, agentType, moduleId, model, taskPrompt)`: Gateway `sessions_spawn` mit `runtime: 'acp'`, `thread: true`, `mode: 'session'`, `cleanup: 'keep'`. Harness-Prio: model-derived → `agentConfig.acp_agent_id` → agentType. Ruft `trackAgent(ctx, label, childSessionKey)`.
- `killAcpAgent(ctx, agentType, moduleId)`: Gateway `sessions_send` mit `/stop`. Ruft `untrackAgent(ctx, label)`.

### Redis Dispatch — agents/lifecycle.js

- `buildBusterPayload(ctx, progress, moduleId, taskType, taskPrompt, status, opts)`: Strukturierter Payload. **Dual Task-Type:** `module_test` und `gate_test`. Nutzt `modelToHarness` für Harness-ID im Session-Objekt.

**`module_test` Payload-Shape:**
```javascript
{
  task_type: 'module_test',
  module, project, commit_hash, timestamp, completion_stream,
  instructions: taskPrompt,
  session: { model, agentId, cwd, timeout_seconds, label: 'buster-test-{moduleId}-{ts}' },
  module_path,        // Repo-relativ
  buster_md_path,     // Repo-relativ
  output_file,        // Repo-relativ
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

- `dispatchRedisTask(ctx, ...)`: Payload + Script in Temp-Files, `nodeExec`.

### Unified Interface — agents/lifecycle.js

| Funktion | ACP-Routing | Redis-Routing |
|----------|------------|---------------|
| `spawnAgent()` | `spawnAcpAgent()` via Gateway | `dispatchRedisTask()` |
| `killAgent()` | `killAcpAgent()` via Gateway `/stop` | No-Op |
| `steerAgent()` | Gateway `sessions_send` (HTTP POST) | `dispatchRedisTask(steer)` |

### `verifyAgentAlive(ctx, agentType, moduleId, waitMs)` — agents/lifecycle.js

Health-Check nach ACP-Spawn. **Async:** `await sleep(8000)`, dann `gatewayInvoke('session_status', ...)`. Prüft ACP State — Terminal States (`closed`, `error`) = Spawn fehlgeschlagen. Redis: immer true.

### Reviewer-Agents — agents/lifecycle.js

- `spawnReviewerAgent(ctx, progress, gateId, reviewer, instructions)`: `progress` wird für `resolvePolicy('echo', config, progress, reviewer.model)` benötigt.
- `killReviewerAgent(ctx, gateId, reviewer)`: Label-Schema `echo-{label}-{gateId}`.

---

## 18. Session-End-Polling (Forge-Fix-Cycles)

### `pollForSessionEnd(ctx, sessionLabel, timeoutMinutes, logLabel)` — services/polling.js

Extrahierte Hilfsfunktion für Forge-Fix-Polling in Gate-Zyklen.

**Gateway-basiert:** Pollt via `gatewayInvoke('session_status', { sessionKey })`. Parsed ACP State aus Response (`statusResult?.acp?.state || statusResult?.state`). Bei `cleanup: 'keep'` bleibt die Session-Entry nach Beendigung erhalten.

**Funktionalität:**
1. Resolved `sessionKey` aus `ctx.shutdownState.activeSessions` via Label
2. Captured `headHash()` vor dem Polling (Fallback für Change-Detection)
3. Pollt Gateway `session_status` bis die Session endet oder Timeout
4. **Zwei-Phasen Change-Detection nach Session-Ende:**
   - Phase 1: `git add -A` → `git status --porcelain` → Pipeline committet uncommitted Agent-Output
   - Phase 2: HEAD-Diff gegen Baseline (für Agents die selbst committen)
5. **Crash-Detection:** Session-Ende ohne Änderungen = Agent gecrasht (OOM, API-Error)
6. **Timeout-Nudge:** Bei dem erforderlichen Plattformwert `session_nudge_threshold` wird dem Agent ein einmaliger Steer via `gatewayInvoke('sessions_send', ...)` geschickt.

**Returns:** `{ completed: boolean, hasChanges: boolean, reason: string }`

---

## 19. File Readers

- `readForgeInstructions(config, moduleDir, moduleConfig)` — prompts/forge.js: Unterstützt `moduleConfig.substeps` — wenn vorhanden, werden FORGE.md Files aus allen Substep-Verzeichnissen zusammengefügt (mit `---` Separator).
- `readBusterInstructions(config, moduleDir)` — prompts/buster-instructions.js
- `readGateInstructions(config, gate)` — prompts/buster-gate.js

---

## 20. Buster Prompt Builder

### Designprinzip

Analoges System zu `buildForgePrompt` — die Pipeline besitzt den vollständigen Prompt. Der Processor ist nur ein Relay. Prompt-Reihenfolge optimiert für LLM-Aufmerksamkeit: Context → Test Workspace → Instructions → Completion Protocol.

### Funktionen

| Funktion | Modul | Beschreibung |
|----------|-------|-------------|
| `buildTestWorkspaceSection(testWorkspacePath)` | prompts/shared.js | Shared Block der dem Agent sagt wo Test-Scripts hingehören (`attempt-N/` Dirs). Read-only-Hint für Application Code. |
| `buildBusterModulePrompt(ctx, moduleId, mod, dir, status, maxFails)` | prompts/buster-module.js | Kompletter `module_test`-Prompt. Enthält: Context Block (Project, Module, Paths, Attempt, Commit, forge_diff_stat), Test Workspace, BUSTER.md inline, Completion Protocol. Returns `{ prompt }` oder `{ error }`. |
| `buildBusterGatePrompt(ctx, gateId, gate, instructions, commitHash, attempt)` | prompts/buster-gate.js | Kompletter `gate_test`-Prompt. Gibt rohen `string` zurück (nicht `{ prompt }`). |
| `buildBusterCompletionProtocol(ctx, moduleId, dir, status)` | prompts/buster-module.js | 3-Step Module-Completion: (1) Write `output_file`, (2) Store insights via memory.js, (3) Signal via redis.ts. |
| `buildBusterGateCompletionProtocol(ctx, gateId, gate)` | prompts/buster-gate.js | 3-Step Gate-Completion: (1) Write output_file as JSON, (2) Store insights, (3) Signal via redis.ts. |

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

## 21. Qdrant Memory Integration

### Drei Integrationspunkte

1. **VOR FORGE:** `recallForModule()` — Memories in Forge-Prompt injizieren
2. **NACH PASS/FAIL:** `feedbackMemory()` — Confidence-Scores updaten
3. **NACH FAIL:** `decayRecalledMemories()` — Gezieltes Decay der Prompt-Memories

### Interne Helfer

| Funktion | Beschreibung |
|----------|-------------|
| `memoryEnabled(config)` | Guard: `config.memory?.enabled !== false`. |
| `memoryJsPath(config)` | Auflösung + Validierung des memory.js-Pfads via `validateSafePath`. |
| `getMemoryModule(ctx)` | Cached Dynamic-Import von memory.js. Bei Fehler: `null` → CLI-Fallback. |

### Memory Recall Formatierung

`recallForModule` formatiert Memories als Markdown-Block mit Confidence-Star-Ratings:

| Confidence | Rating | Bedeutung |
|-----------|--------|-----------|
| ≥ 0.75 | ★★★ | Validiertes Pattern |
| ≥ 0.45 | ★★☆ | Neutral |
| < 0.45 | ★☆☆ | Ungeprüft |

Format pro Memory: `{N}. [{stars} relevance:{score}] {text}\n   _({module} · {agent} · {tags})_`

Prompt-Block-Header: `## 📎 CONTEXT FROM SWARM MEMORY`.

### Config-Toggles

| Feld | Default | Beschreibung |
|------|---------|-------------|
| `memory.enabled` | `true` (implizit) | Master-Switch |
| `memory.recall_before_forge` | `true` (implizit) | Guard für `recallForModule` |
| `memory.feedback_after_outcome` | — | Guard für `feedbackMemory` |
| `memory.targeted_decay_amount` | `0.1` | Confidence-Decay pro Erinnerung |
| `memory.recall_limit` | `5` | Max Memories pro Recall |

### Targeted Decay vs. Broad Feedback

| Trigger | Aktion | Scope |
|---------|--------|-------|
| Jeder Fail | `decayRecalledMemories` | Nur die IDs die im Prompt waren |
| Max Fails (BLOCKED) | `feedbackMemory('blocked')` | Alle zum Modul getaggten Memories |
| PASS | `feedbackMemory('pass')` | Alle zum Modul getaggten Memories |

---

## 22. Polling-System (Konsolidiert)

### Basis-Helfer — services/polling.js

| Funktion | Beschreibung |
|----------|-------------|
| `sleep(ms)` | `new Promise(resolve => setTimeout(resolve, ms))`. |
| `pollResult(ok, reason, status)` | Factory für konsistente Rückgabeobjekte. Shape: `{ ok: boolean, reason: string, status: object\|null }`. |

### Architektur

**Alle Poller bauen auf `pollGeneric` auf.**

```
pollGeneric(ctx, checkFn, timeoutMinutes, label)   ← Gemeinsame Basis
  ├── pollForFile(...)     → checkFn prüft fs.existsSync
  ├── pollStatus(...)      → checkFn prüft loadStatus + expectedStatuses
  └── pollDual(...)        → checkFn prüft Redis + Git parallel
```

### `pollGeneric(ctx, checkFn, timeoutMinutes, label)` — services/polling.js

Gemeinsame Basis. Übernimmt: Deadline-Loop, sleep, `gitPullForPolling`, Parse-Corruption-Tracking.

**PollResult-Semantik:** `ok=true` bedeutet "ein terminaler Status wurde erreicht" — NICHT "Modul bestanden". Reason-Enum: `target_reached`, `gate_fail`, `timeout`, `blocked`, `rate_limited`, `rate_limit_exhausted`, `parse_corrupted`, `spawn_failed`.

**checkFn-Protokoll:**

| Rückgabe | Bedeutung |
|----------|-----------|
| `{ done: true, result: PollResult }` | Terminal — sofort zurückgeben |
| `{ done: false, logMsg?: string }` | Weiter pollen |
| `{ rate_limited: true, status }` | Rate-Limit erkannt — an Caller delegieren |
| `{ parse_error: true }` | Korrupten Counter inkrementieren (max 10) |

### `pollForFile(ctx, filePath, timeoutMinutes, label)` — services/polling.js

Prüft `fs.existsSync(filePath)` pro Zyklus. Genutzt von `_runReviewOnce`.

### `pollStatus(ctx, moduleDir, expectedStatuses, timeoutMinutes)` — services/polling.js

Liest `loadStatus()` und prüft ob `status.status` in `expectedStatuses` enthalten ist. Genutzt für die **Forge-Phase**.

### `pollDual(ctx, moduleDir, moduleId, expectedStatuses, timeoutMinutes)` — services/polling.js

Prüft **zwei Kanäle** parallel pro Zyklus:
1. **Channel 1 (Redis, schnell):** `readCompletionFromRedis()` → `mapRedisStatus()`.
2. **Channel 2 (Git, Fallback):** `loadStatus()` wie `pollStatus`.

Erster Kanal mit terminalem Status gewinnt. Genutzt für die **Buster-Phase**.

### Rate-Limit-Recovery (Unified) — services/rate-limit.js

- `withRateLimitRecovery(ctx, moduleDir, pollFn)`: Generischer Rate-Limit-Recovery-Wrapper.
- `pollWithRateLimitRecovery(...)`: Wrapper für `pollStatus`.
- `pollDualWithRateLimitRecovery(...)`: Wrapper für `pollDual`.

---

## 23. Rate-Limit-Handling

### `handleRateLimit(ctx, ...)` — services/rate-limit.js

Canonical owner for Nova-side rate-limit pauses: `rate_limit.detected` telemetry → Discord alert → sleep → fresh status reload → phase restore. Mutiert den Status des Callers **nicht**.

### Gate-Level Rate-Limit-Handling (Inline)

Gate polling still handles the control-flow decision inline, but the structured pause event is emitted only once by the rate-limit recovery layer so Buster/Nova do not double-emit the same pause.

---

## 24. Redis Completion Stream (Buster)

```
Active:  swarm:pipeline:<project>:completions       ← aktuelle Entries
Archive: swarm:pipeline:<project>:completions:log   ← verarbeitete Entries
```

### Direct Import von redis.ts — integrations/redis.ts

Pipeline importiert `redis.ts` direkt via `getRedisModule(ctx)` (cached). Bei Import-Fehler: Graceful Degradation auf Git-only-Polling.

### Konstanten

| Konstante | Wert | Beschreibung |
|-----------|------|-------------|
| `COMPLETION_ARCHIVE_MAX_LEN` | `1000` | Maximale Anzahl Entries im Archive-Stream. |

### Pipeline-Funktionen

- `getRedisModule(ctx)` — Cached Direct-Import.
- `archiveModuleCompletions(ctx, moduleId)` — VOR jedem Buster-Dispatch. Verschiebt alte Entries in Archive-Stream. **Async.**
- `readCompletionFromRedis(ctx, moduleId)` — Neueste Completion lesen. **Async.**
- `mapRedisStatus(redisStatus)` — PASS→PASS, FAIL→FAIL, ISSUES_FOUND→FAIL.

---

## 25. Git-Sync (Forge → Buster Handoff)

### `gitSyncBeforeBuster(ctx, moduleDir, status)` — integrations/git-worktree.ts

`gitCommitAndPush()` mit `captureHash: true`. Zeichnet `forge_commit_hash` in Status auf. Captured `forge_diff_stat` via `git diff --stat HEAD~1 HEAD`.

---

## 26. Dependency-Prüfung (Content-Aware)

### `checkDependencies(ctx, progress, moduleId)` — services/dependencies.js

Prüft Gate-Dependencies und Modul-Dependencies. **Content-aware:** Output-File-Status wird geprüft. `mod.depends_on || []` Guard verhindert Crash bei fehlendem Feld.

---

## 27. Failure Handler

### `extractAgentFailReason(status, phase)` — services/failures/classification.js

Extrahiert Agent-Failure-Reason. Priorität: Agent-History-Entry (nicht `pipeline`) → `completion_summary` → generischer Fallback.

### `handleFail(ctx, ...)` — services/failures/retry-policy.js

**fail_count++** (unconditional) → Fail-Summary → Targeted Memory-Decay → Broad Feedback (nur bei BLOCKED) → Status-Update → Auto-Retry-Entscheidung → Eskalation.

Auto-Retry vs. Eskalation: `fail_count <= auto_retry_threshold` (per Modul/Gate oder erforderlicher Plattformwert aus `swarm.config.json`) UND kein Timeout → `_retry: true`, sonst `EXIT_NEEDS_NOVA` oder `EXIT_TIMEOUT`.

**Rückgabe bei Auto-Retry:**
```javascript
{ _retry: true, module, module_dir, fail_count, max_fails, last_fail }
```

**Rückgabe bei BLOCKED (`fail_count >= maxFails`):**
```javascript
{ exit: EXIT_BLOCKED, reason, module, status }
```

**Rückgabe bei Eskalation:** Delegiert an `buildNovaEscalation()`.

### `buildNovaEscalation(ctx, ...)` — services/failures/retry-policy.js

Vollständiges Context-Paket für Nova:

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

### `generateLintReport(ctx, tier, opts)` — services/lint.js

Shared Core. Unterstützt `--semgrep-config` wenn `config.pre_check.semgrep_config_path` gesetzt. Returns `{ report, error }`.

### `formatLintReportForReviewer(report)` — services/lint.js

Reviewer-Prompt-Block. Icons (✅ 🔴 🟡 ❌), gekappt bei 30 pro Tool.

---

## 29. Pre-Check (Forge-Output-Validierung)

### `runPreCheck(ctx, moduleDir, status, moduleId)` — services/lint.js

Schnelle statische Analyse. Kill-Switch: `config.pre_check.enabled = false`. Returns `{ passed, report, error }`.

---

## 30. Forge Prompt Assembly

### `buildForgePrompt(ctx, moduleId, mod, dir, status, maxFails, novaPrompt)` — prompts/forge.js

**Text-Reihenfolge** (optimiert für "Lost in the Middle"-Effekt):
```
Context Block → Priority Header → Nova Directive → FORGE.md → Anti-Patterns → Memory Context
```

Context Block steht vor dem Priority-Header weil er faktueller Kontext ist. Anti-Patterns stehen nahe am Ende (Recency-Bias).

Context Block enthält `Project Source` (von `projectSrcPath`) und instruiert `cd` dorthin.

**async:** buildForgePrompt ist async (wegen `recallForModule`). Returns `{ prompt, recalledMemoryIds }`.

---

## 31. Module Runner (Stages-Aware)

### `runModule(ctx, progress, moduleId, opts)` — runners/module-runner.ts

Retry-Loop um `executeModuleAttempt()`. Dependencies einmal geprüft.

### `executeModuleAttempt(ctx, ...)` — runners/module-runner.ts

**Stages:** `['forge', 'buster']` Default. Kontrolliert welche Phasen laufen.

**Forge Phase:** `buildForgePrompt` → `spawnAgent('forge')` → `verifyAgentAlive` → `pollWithRateLimitRecovery` → `killAgent('forge')`.

**Forge-Only Pass:** Wenn `'buster' ∉ stages` und Status ist READY_FOR_TESTING → direkt PASS.

**Buster-Only Promotion:** Wenn `'forge' ∉ stages` → PENDING/FAIL → READY_FOR_TESTING.

**Pre-Check:** Nur wenn forge + buster in stages und Forge gelaufen ist.

**Buster Phase:** `buildBusterModulePrompt` → `archiveModuleCompletions` → `spawnAgent('buster')` → `pollDualWithRateLimitRecovery` → `killAgent('buster')`.

---

## 32. Gate-Dispatcher

### `runGate(ctx, progress, gateId)` — runners/gate-runner.js

Routet nach `gate.type` via Strategy-Map `GATE_RUNNERS`:

| Type | Runner | Beschreibung |
|------|--------|-------------|
| `buster` | `runBusterGate()` | Einzelner Buster-Agent mit optionalem Fix-Loop |
| `review` | `runReviewGate()` | Einzelner Reviewer mit Lint-Report und Fix-Lifecycle |
| `approval` | `runApprovalGate()` | Human-in-the-Loop Pause bis Operator APPROVE/REJECT sendet |

Neue Gate-Typen werden durch Hinzufügen zu `GATE_RUNNERS` registriert — kein Ändern von `pipeline-runner.js` nötig.

---

## 33. Buster-Gate-Runner (mit Fix-Loop)

### `gateStatusPath(config, gateId)` — core/paths.js

Baut den Pfad für die Gate-Status-Datei: `<swarm_dir>/<gateId>-gate-status.json`. Genutzt von buster-gate-runner, approval-gate-runner und pipeline-runner.

### `_runBusterGateOnce(ctx, ...)` — runners/buster-gate-runner.ts

Einzelversuch: `buildBusterGatePrompt` → spawn (mit `taskType: 'gate_test'`) → `pollGeneric` → kill → PollResult.

### `runBusterGate(ctx, progress, gateId)` — runners/buster-gate-runner.ts

**Already-completed Check:** Content-aware via canonical `output_file`; `gate-status.json` bleibt diagnostisch.

**Stale-Output-Cleanup:** `output_file` und `gate-status.json` löschen nach Already-Completed-Check.

**Fix-Loop:** `on_fail === 'fix_and_retest'` → extractGateIssues → `buildGateFixPrompt` (mit `fixHistory` Anti-Patterns) → Forge fix via `pollForSessionEnd` → hasChanges check → git sync → Cleanup output → Retest.

### `extractGateIssues(gateResult)` — runners/buster-gate-runner.ts

Extrahiert fixierbare Issues aus dem Buster-Gate-Ergebnis:

**Strukturiert:** `gateResult.status.issues[]` → filtert nach `severity: 'critical' | 'moderate'`

**Flat issue summary:** `gateResult.status.reason || summary`

### `buildGateFixPrompt(ctx, gate, issues, attempt, maxAttempts, fixHistory)` — prompts/gate-fix.js

Context-Header (Project, Project Source, Working Directory, Repo Root) + Anti-Pattern-Block aus fixHistory.

---

## 34. Review-Gate-Runner (Lint-Report + Single Reviewer)

### Hilfsfunktionen — runners/review-gate-runner.js

### `resolveReviewConfig(config, gate)` — runners/review-gate-runner.js

Mergt Gate-Level-Overrides mit Plattform-Defaults. Rückgabe:
```javascript
{ reviewers: [], timeout: number, maxFixCycles: number, lintTier: 'full' | 'pre-check' }
```

### `reviewOutputPath(config, gate, reviewerLabel)` — runners/review-gate-runner.js

Pattern: `<swarm_dir>/<review_output_dir>/<reviewerLabel>-<review_name>.json`

### `extractReviewIssues(mergedResult)` — runners/review-gate-runner.js

Extrahiert kritische Issues aus dem Review-JSON. Sucht in `critical_issues[]` und `critical_blockers[]`.

### `buildReviewFixPrompt(ctx, gate, issues, attempt, maxAttempts, fixHistory)` — prompts/review.js

Struktur analog zu `buildGateFixPrompt`: Context-Header + Anti-Patterns + Issue-Blöcke.

### `cleanupReviewFiles(ctx, gate, reviewers)` — runners/review-gate-runner.js

Löscht alle Reviewer-Output-Files UND das Gate-Output-File. Wird vor `_runReviewOnce` in `fix_and_rereview`-Zyklen aufgerufen.

### Architektur

```
_runReviewOnce():
  1. generateLintReport(tier: full)  ← Deterministische Tool-Findings
  2. readGateInstructions()           ← Review-Instructions
  3. Build Reviewer-Prompt:           ← Context + Instructions + Lint-Report + Output-Schema
  4. Stale-Output-Cleanup
  5. spawnReviewerAgent() × 1         ← Single Reviewer
  6. pollForFile()                    ← Ein Output-File
  7. killReviewerAgent()
  8. gitCommitAndPush()
  9. Parse Review JSON                ← GO / NO-GO + critical_issues
```

### Fix-Lifecycles

#### `fix_and_continue`

Forge-Fix nutzt `pollForSessionEnd()` mit `hasChanges`-Check. Fix-History-Tracking. Nach Fix: GO-Status-File schreiben → Pipeline fährt fort.

#### `fix_and_rereview`

Forge-Fix → `cleanupReviewFiles` → `_runReviewOnce` (frischer Lint-Report + frisches Review). Bei Exhaustion: `EXIT_NEEDS_NOVA`.

---

## 34a. Approval-Gate-Runner (Human-in-the-Loop)

### `runApprovalGate(config, progress, gateId)` — runners/approval-gate-runner.js

Pausiert die Pipeline an konfigurierten Entscheidungspunkten bis ein Operator explizit APPROVE oder REJECT signalisiert oder ein Timeout abläuft.

**V1 Interaktionsmodell:**
1. Pipeline schreibt initialen State in `<swarm_dir>/<gateId>-gate-status.json` mit Status `PENDING_APPROVAL`.
2. Discord-Embed wird gepostet (Titel, Timeout-Deadline, Approve/Reject-Befehle, Pipeline-Kontext).
3. Polling-Loop liest `gate-status.json` in regelmäßigen Abständen.
4. Nova/OpenClaw schreibt die Entscheidung direkt in `gate-status.json`.
5. Pipeline liest den aktualisierten State und fährt fort oder hält an.

**Authoritative Storage:** `<swarm_dir>/<gateId>-gate-status.json` (via `gateStatusPath()`)

**Status-Enum:** `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `TIMED_OUT`, `CANCELLED`

**on_timeout-Verhalten:** `"block"` → `EXIT_NEEDS_NOVA`; `"continue"` → Pipeline fährt fort

**Normalisierung:** Die Config bleibt bei lower-case `on_timeout` (`block` / `continue`), aber der persistierte Gate-State, die Approval-Audit-Artefakte und das Telemetrie-Feld `approval.requested.timeout_policy` werden auf die kanonischen Uppercase-Werte `BLOCK` / `CONTINUE` normalisiert.

**Audit-Artefakte** unter `.swarm/logs/gates/<gateId>/`:
- `approval-request.json` — normalisierter Request-Payload
- `approval-request.md` — Operator-facing Summary
- `approval-transitions.jsonl` — Append-only Transition-Log
- `approval-decision.json` — Final resolved Decision Record

Persistierter Gate-State, `approval-request.json`, und `approval-decision.json` tragen dieselbe Kernkorrelation (`gate_id`, `gate_type`, `run_id`, `project`) wie die zugehörigen Telemetrie- und Discord-Surfaces.
`approval-transitions.jsonl` persistiert dieselbe Korrelation pro Zustandswechsel (`run_id`, `project`, `gate_id`, `gate_type`, `from`, `to`, `note`).
`summary.json` hält dieselbe Governance-Korrelation fest: `.governance.arch_validator` trägt `run_id` und `project`, und `.governance.approval_gates[]` persistiert `gate_id`, `gate_type`, `run_id`, `project` sowie die Pfade zu State-, Request-, Decision- und Transition-Artefakten.
Dieselben Summary-Approval-Einträge persistieren auch `decision_via`, normalisierte `timeout_policy` und `continued`, sodass Offline-Replay einen blockierenden Timeout von einem Auto-Continue-Timeout unterscheiden kann, ohne den rohen Gate-State erneut zu öffnen.
`summary.json.governance.overall_outcome` unterscheidet jetzt auch `CONTINUED_AFTER_APPROVAL_TIMEOUT` und `CANCELLED_BY_OPERATOR`, sodass Auto-Continue-Timeouts und Operator-Abbrüche nicht mehr in demselben halted- oder unknown-Summary-Zustand landen.

---

## 35. Pipeline Runner

### `findNextStep(config, progress)` — runners/pipeline-runner.js

Iteriert `execution_order`. Gate completion authority kommt aus typed controls / canonical output; `gateStatusPath()` bleibt diagnostische Evidenz. Unterstützt alle Gate-Typen (buster, review, approval).

### `runPipeline(ctx, progress, opts)` — runners/pipeline-runner.js

Hauptschleife: `findNextStep()` → `runGate()` oder `runModule()`. Enriched Pipeline-Start-Discord mit Pending/Total counts.

---

## 36. Status-Ausgabe und Dry-Run

### `printStatus(ctx, progress)` — runners/pipeline-runner.js

Status-JSON aller Module + Gates.

### `dryRun(ctx, progress)` — runners/pipeline-runner.js

Ausführungsplan ohne Agenten zu spawnen. Nutzt `resolvePolicy` für Model-Anzeige.

---

## 37. CLI-Wrapper und Entrypoint

`pipeline/cli.js` — Manuelles Argument-Parsing.

**Environment-Fallbacks:**

| Env-Variable | Beschreibung | Priorität |
|---|---|---|
| `CURRENT_PROJECT` | Projekt-Name (falls `--project` nicht angegeben) | 2 |
| `REPO_ROOT` | Git Repo Root (falls `--repo` nicht angegeben) | 2 |
| `SWARM_CONFIG` | Pfad zu swarm.config.json (falls nicht Default) | — |
| `DISCORD_WEBHOOK` | Deployment-Eingang, der vor Runtime-Start nach `discord_webhook_url` materialisiert werden kann | — |
| `OPENCLAW_GATEWAY_TOKEN` | Gateway Auth Token | — |

**Entry-Detection:** Das Script erkennt ob es direkt ausgeführt oder importiert wird. Der CLI-Block läuft nur bei Direktausführung.

**Ablauf:**
```
1. initTempDir(ctx) + registerShutdownHooks(ctx)
2. const { config, progress } = loadConfig(flags.project, { repoRoot: flags.repo })
3. Blueprint-Commands (exit early)
4. Status/Dry-Run (exit early)
5. Nova-Prompt aus --prompt oder --prompt-file auflösen
6. runPipeline(ctx) → Cleanup → Exit
```

**CLI-Flags:**

| Flag | Beschreibung |
|------|-------------|
| `--project <n>` | Projektname (oder `CURRENT_PROJECT` env) |
| `--repo <path>` | Git Repo Root (oder `REPO_ROOT` env) |
| `--module <id>` | Einzelmodul ausführen |
| `--resume` | Pipeline fortsetzen |
| `--prompt "text"` | Nova-Prompt-Override |
| `--prompt-file <path>` | Nova-Prompt aus Datei laden |
| `--status` | Status-JSON ausgeben |
| `--dry-run` | Ausführungsplan ohne Agenten |
| `--blueprint <id>` | Blueprint releasen |
| `--blueprint-list` | Verfügbare Blueprints |
| `--help` | Hilfe-Text |

**Modul-Config-Felder (in progress.json):**

| Feld | Pflicht | Default | Beschreibung |
|------|---------|---------|-------------|
| `title` | ja | — | Menschenlesbarer Modulname |
| `dir` | ja | — | Verzeichnisname im Repo |
| `stages` | nein | `['forge', 'buster']` | Welche Phasen laufen |
| `substeps` | nein | `null` | Array von Sub-IDs |
| `depends_on` | ja | `[]` | Module die vorher PASS sein müssen |
| `timeout_minutes` | nein | `45` (aus swarm.config) | Max. Laufzeit |
| `max_fails` | nein | `3` (aus swarm.config) | Max. Fehlversuche |
| `forge_model` | nein | aus `defaults.models.forge` oder `fallback_model` | LLM-Modell für Forge |
| `forge_subagent` | nein | aus `defaults.models.forge` oder `fallback_model` | ACP-Subagent-ID (Display-only) |
| `test_suites` | nein | `["build", "health"]` | Buster-Suites |
| `test_config` | nein | `{ serve: { type: "static" } }` | Suite-Config |
| `auto_retry_threshold` | nein | aus swarm.config | Max. Auto-Retries vor Nova-Eskalation |

---

## 38. Exports

Die vollständige Exportliste aus `pipeline/index.js` (Stand v10-Audit):

```javascript
// core/
export { loadConfig } from './core/config.js';
export { createRunId, createRunStats, bindRunContext,
         resolveRunContext, getRunState, getRunId, getRunStats, output, loadProgress } from './core/runtime.ts';
export { getRepoRoot, gitExec, headHash, invalidateHeadHash, setRepoRoot } from './core/git-context.js';

// services/
export { sleep, pollGeneric, pollForFile, pollStatus, pollForSessionEnd,
         pollDual, pollWithRateLimitRecovery, pollDualWithRateLimitRecovery } from './services/polling.js';
export { emitEvent, onPipelineStarted, onPipelineCompleted, onPipelineHalted,
         onModuleStarted, onModulePass, onModuleFail, onModuleBlocked,
         onGateStarted, onGatePass, onGateFail, onAgentSpawned, onAgentKilled,
         onPhaseStarted, onPhaseCompleted, onRetryScheduled, onRetryExhausted,
         onEscalated, onSummaryStarted, onSummaryCompleted, onBudgetWarning,
         onBudgetExceeded, emitCostUpdate, emitRateLimitDetected,
         emitObservabilityDegraded, emitObservabilityRestored,
         emitTranscriptLine, emitAgentProgress } from './services/telemetry.ts';

// integrations/

// agents/
export { registerShutdownHooks } from './agents/shutdown.js';

// runners/
export { runPipeline } from './runners/pipeline-runner.js';

// constants/
export { STATUS, EXIT_OK, EXIT_ERROR, EXIT_NEEDS_NOVA, EXIT_BLOCKED,
         EXIT_TIMEOUT, EXIT_RATE_LIMITED } from './core/constants.js';

export default runPipeline;
```

**v10-Korrekturen gegenüber v9-Dokumentation:**
- **Entfernt:** `emitTelemetryEvent` (existiert nicht; stattdessen benannte Wrapper wie `onModuleStarted`, `emitEvent` etc.)
- **Entfernt:** `recallForModule`, `feedbackMemory`, `decayRecalledMemories`, `executeModuleAttempt` (nicht in index.js exportiert)
- **Neu dokumentiert:** alle Wave 3 Exports (arch-validator, cost, observability, redis-log, case-study, validation, approval-gate, governance)

---

## 39. Vollständiger Ablaufgraph

### Happy Path

```
CLI Entrypoint (pipeline/cli.js)
  │
  ├─ initTempDir(ctx) + registerShutdownHooks(ctx)
  ├─ const { config, progress } = loadConfig(projectName, { repoRoot })
  │
  └─ runPipeline(ctx)
       │
       └─ LOOP: findNextStep()  (content-aware gate checks + gate-status.json fallback)
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
            │           ├─ buildGateFixPrompt(ctx, fixHistory)
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
            │       │   ├─ spawnReviewerAgent(ctx, progress, ...) × 1
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
            │       ├─ corrupt lifecycle-state check (EXIT_ERROR)
            │       └─ RETRY LOOP: executeModuleAttempt()
            │           │
            │           ├─ stages = mod.stages || ['forge', 'buster']
            │           │
            │           ├─ FORGE PHASE (if 'forge' in stages)
            │           │   ├─ resolvePolicy('forge', config, progress, mod.forge_model)
            │           │   ├─ buildForgePrompt() (Nova → FORGE.md → Anti-Patterns → Memory)
            │           │   ├─ spawnAgent('forge') → ACP via Gateway
            │           │   ├─ verifyAgentAlive() (Gateway session_status)
            │           │   ├─ pollWithRateLimitRecovery() → pollStatus → pollGeneric
            │           │   └─ killAgent('forge') → Gateway /stop → reapAcpProcess()
            │           │
            │           ├─ FORGE-ONLY PASS (if 'buster' ∉ stages)
            │           │   └─ gitCommitAndPush → PASS
            │           │
            │           ├─ BUSTER-ONLY PROMOTION (if 'forge' ∉ stages)
            │           │   └─ PENDING → READY_FOR_TESTING
            │           │
            │           ├─ PRE-CHECK (if 'forge' + 'buster' in stages)
            │           │   └─ runPreCheck() → generateLintReport(tier: pre-check)
            │           │
            │           ├─ GIT SYNC (if 'buster' in stages)
            │           │   └─ gitSyncBeforeBuster() + forge_diff_stat capture
            │           │
            │           └─ BUSTER PHASE (if 'buster' in stages)
            │               ├─ resolvePolicy('buster', config, progress)
            │               ├─ buildBusterModulePrompt()
            │               ├─ archiveModuleCompletions()
            │               ├─ authoritative structured telemetry continues via plugin.event (`plugin_id: buster`, `plugin_event: task_started/task_completed`) once Buster consumes the task
            │               ├─ spawnAgent('buster') → Redis (module_test)
            │               ├─ pollDualWithRateLimitRecovery() → pollDual → pollGeneric
            │               └─ killAgent('buster')
            │
            └─ type: 'done' → generatePipelineSummary() → Discord "Pipeline Complete" → EXIT_OK
               (non-OK exit → Discord "Pipeline halted" with exit code label)
```

---

## 40. Abhängigkeitsgraph der Funktionen

### Aufrufe (pro Funktion → ruft auf)

| Funktion | Modul | Ruft auf |
|----------|-------|----------|
| `loadConfig` | core/config.js | `execFileSync`, `validateConfig` |
| `validateConfig` | core/config.js | `validateSafePath` |
| `saveStatus` | services/status-store.js | `fs.writeFileSync` (tmp), `fs.renameSync` (atomic), `gitCommitQuiet` |
| `gitCommitAndPush` | integrations/git-worktree.ts | `gitExec(add, status, commit)`, `invalidateHeadHash`, `gitPullBeforePush`, `gitPushWithRetry` |
| `releaseBlueprint` | services/blueprint.ts | `gitExec(cat-file, checkout)`, `gitCommitAndPush` |
| `spawnAcpAgent` | agents/lifecycle.js | `modelToHarness`, `gatewayInvoke('sessions_spawn')`, `trackAgent` |
| `killAcpAgent` | agents/lifecycle.js | `gatewayInvoke('sessions_send', /stop)`, `untrackAgent`, `reapAcpProcess` |
| `spawnReviewerAgent` | agents/lifecycle.js | `resolvePolicy`, `modelToHarness`, `gatewayInvoke('sessions_spawn')`, `trackAgent` |
| `killReviewerAgent` | agents/lifecycle.js | `gatewayInvoke('sessions_send', /stop)`, `untrackAgent`, `reapAcpProcess` |
| `buildBusterModulePrompt` | prompts/buster-module.js | `readBusterInstructions`, `buildTestWorkspaceSection`, `buildBusterCompletionProtocol`, `relPath`, `projectSrcPath` |
| `buildBusterGatePrompt` | prompts/buster-gate.js | `buildTestWorkspaceSection`, `buildBusterGateCompletionProtocol`, `relPath`, `projectSrcPath` |
| `pollGeneric` | services/polling.js | `sleep`, `gitPullForPolling` |
| `pollStatus` | services/polling.js | `pollGeneric`, `loadStatus` |
| `pollDual` | services/polling.js | `pollGeneric`, `readCompletionFromRedis`, `loadStatus`, `mapRedisStatus` |
| `withRateLimitRecovery` | services/rate-limit.js | `handleRateLimit` |
| `pollForSessionEnd` | services/polling.js | `sleep`, `gitPullForPolling`, `gatewayInvoke('session_status')`, `gatewayInvoke('sessions_send')`, `headHash`, `invalidateHeadHash`, `gitExec(add, status, commit)` |
| `verifyAgentAlive` | agents/lifecycle.js | `sleep`, `gatewayInvoke('session_status')` |
| `handleFail` | services/failures/retry-policy.js | `decayRecalledMemories`, `feedbackMemory`, `saveStatus`, `discord`, `buildNovaEscalation` |
| `buildForgePrompt` | prompts/forge.js | `readForgeInstructions`, `recallForModule`, `relPath`, `modulePath`, `statusPath`, `projectSrcPath` |
| `executeModuleAttempt` | runners/module-runner.ts | `releaseBlueprint`, `buildForgePrompt`, `buildBusterModulePrompt`, `resolvePolicy`, `spawnAgent`, `verifyAgentAlive`, `pollWithRateLimitRecovery`, `runPreCheck`, `runPreflightValidation`, `runDeliveryLintValidation`, `archiveModuleCompletions`, `gitSyncBeforeBuster`, `pollDualWithRateLimitRecovery`, `handleFail`, `killAgent`, `gitCommitAndPush`, `onModulePass`, `onModuleFail` |
| `runBusterGate` | runners/buster-gate-runner.ts | `_runBusterGateOnce`, `resolvePolicy`, `extractGateIssues`, `buildGateFixPrompt`, `spawnAgent`, `verifyAgentAlive`, `pollForSessionEnd`, `killAgent`, `gitCommitAndPush`, `gateStatusPath`, `discord` |
| `runReviewGate` | runners/review-gate-runner.js | `resolveReviewConfig`, `_runReviewOnce`, `resolvePolicy`, `extractReviewIssues`, `buildReviewFixPrompt`, `cleanupReviewFiles`, `spawnAgent`, `verifyAgentAlive`, `pollForSessionEnd`, `killAgent`, `gitCommitAndPush`, `discord` |
| `runApprovalGate` | runners/approval-gate-runner.js | `gateStatusPath`, `discord`, `onApprovalRequested`, `onApprovalResolved`, `recordApprovalGateOutcome` |
| `runPipeline` | runners/pipeline-runner.js | `findNextStep`, `runModule`, `runGate`, `discord`, `generateProjectSummary`, `generatePipelineReview`, `generateCaseStudy`, `runArchValidator`, `writeCostReport` |

### Globaler State (in PipelineContext)

| Feld | Gesetzt durch | Genutzt durch |
|------|---------------|---------------|
| `tmpDir` | `initTempDir(ctx)` | `tmpFile(ctx)`, `cleanupTempDir(ctx)`, `process.on('exit')` |
| `shutdownState` | `trackAgent`, `untrackAgent`, `setShutdownContext` | Shutdown-Handler, `pollForSessionEnd`, `killAcpAgent`, `steerAgent` |
| `runId` | Context-Erstellung | `log(ctx)`, `discord(ctx)` |
| `logModule` / `logPhase` | `runModule()`, `executeModuleAttempt()` | `log(ctx)` |
| `headHashCache` / `repoRoot` | `loadConfig()`, `headHash(ctx)` | `headHash(ctx)`, `gitExec` |
| `memoryModule` | `getMemoryModule(ctx)` | Memory-Funktionen |
| `redisModule` | `getRedisModule(ctx)` | `readCompletionFromRedis`, `archiveModuleCompletions` |

---

## 41. Systemübergreifende Architektur

### Betroffene Dateien

| Datei | Rolle | Version |
|-------|-------|---------|
| `skills/nova/pipeline.ts` | Kompatibilitäts-Shim (≤25 Zeilen) | v9 |
| `skills/nova/pipeline/core/config.ts` | Config laden, validieren, REPO_ROOT | v9 |
| `skills/nova/pipeline/core/paths.ts` | Pfad-Helpers, Model-Resolution | v9 |
| `skills/nova/pipeline/core/context.ts` | PipelineContext (ersetzt Globals) | v9 |
| `skills/nova/pipeline/core/logger.ts` | Structured Logger | v9 |
| `skills/nova/pipeline/core/temp.ts` | Temp-Verzeichnis-Manager | v9 |
| `skills/nova/pipeline/integrations/git-worktree.ts` | Alle Git-Operationen | v9 |
| `skills/nova/pipeline/integrations/gateway.ts` | Gateway Tool API Client | v9 |
| `skills/nova/pipeline/integrations/redis.ts` | Redis Completion Stream | v9 |
| `skills/nova/pipeline/integrations/discord.ts` | Discord Webhook | v9 |
| `skills/nova/pipeline/agents/lifecycle.ts` | spawn / kill / steer / verify | v9 |
| `skills/nova/pipeline/agents/acp-monitor.ts` | ACP Session State + Transcript Monitoring | v9 |
| `skills/nova/pipeline/agents/shutdown.ts` | Graceful Shutdown + ACP Process Reaping | v9 |
| `skills/nova/pipeline/prompts/forge.ts` | Forge Prompt Builder | v9 |
| `skills/nova/pipeline/prompts/buster-module.ts` | Buster Module Prompt Builder | v9 |
| `skills/nova/pipeline/prompts/buster-gate.ts` | Buster Gate Prompt Builder | v9 |
| `skills/nova/pipeline/prompts/gate-fix.ts` | Gate Fix Cycle Prompt Builder | v9 |
| `skills/nova/pipeline/prompts/review.ts` | Reviewer Prompt Builder | v9 |
| `skills/nova/pipeline/prompts/shared.ts` | Gemeinsame Prompt-Abschnitte | v9 |
| `skills/nova/pipeline/core/constants.ts` | STATUS-Enum + EXIT-Codes | v9 |
| `skills/nova/pipeline/core/git-context.ts` | Git-Basis (getRepoRoot, headHash) | v9 |
| `skills/nova/pipeline/core/policy.ts` | Model/Thinking-Policy-Resolver | v9 |
| `skills/nova/pipeline/core/runtime.ts` | Run-State, output, loadProgress | v9 |
| `skills/nova/pipeline/services/arch-validator.ts` | Architektur-Validator | Wave3 |
| `skills/nova/pipeline/services/blueprint.ts` | Blueprint Release + Control File Sync | v9 |
| `skills/nova/pipeline/services/case-study.ts` | Case Study Generation | Wave3 |
| `skills/nova/pipeline/services/dependencies.ts` | Modul-Abhängigkeitsprüfung | v9 |
| `skills/nova/pipeline/services/failures/` | Fehler-Klassifizierung, Präsentation + Eskalation | v9 |
| `skills/nova/pipeline/services/governance-context.ts` | Governance-Kontext (Arch + Approval) | Wave3 |
| `skills/nova/pipeline/services/lint.ts` | Lint-Report + Pre-Check | v9 |
| `skills/nova/pipeline/services/observability.ts` | Artefakt-Logging, Usage/Kosten-Tracking, Budget-Thresholds, appendStructuredEvent | Wave3 |
| `skills/nova/pipeline/services/polling.ts` | Alle Polling-Flows | v9 |
| `skills/nova/pipeline/services/rate-limit.ts` | Rate-Limit-Recovery | v9 |
| `skills/nova/pipeline/services/redis-log.ts` | Redis-Exchange-Log | Wave3 |
| `skills/nova/pipeline/services/status-store.ts` | Lifecycle Read Models + Artefakt-I/O | v9 |
| `skills/nova/pipeline/services/summary.ts` | Pipeline Summary + Review-Generierung | v9 |
| `skills/nova/pipeline/services/telemetry.ts` | Event-Emission an Redis Stream | v9 |
| `skills/nova/pipeline/services/validation.ts` | Preflight Contract + Delivery Lint | Wave3 |
| `skills/nova/pipeline/runners/approval-gate-runner.ts` | Human-in-the-Loop Approval Gate | Wave3 |
| `skills/nova/pipeline/runners/buster-gate-runner.ts` | Buster Gate Execution + Fix Loop | v9 |
| `skills/nova/pipeline/runners/gate-runner.ts` | Gate-Dispatcher (Strategy-Map) | v9 |
| `skills/nova/pipeline/runners/module-runner.ts` | Modul-Ausführungs-Lifecycle | v9 |
| `skills/nova/pipeline/runners/pipeline-runner.ts` | Top-Level Pipeline Loop | v9 |
| `skills/nova/pipeline/runners/review-gate-runner.ts` | Review Gate Execution | v9 |
| `skills/nova/pipeline/index.ts` | Öffentliche Exports | v9 |
| `skills/nova/pipeline/cli.ts` | CLI-Einstiegspunkt | v9 |
| `skills/nova/pipeline/README.md` | Architektur-Überblick | v9 |
| `skills/lint-report.ts` | Statische Analyse Aggregator | v1 |
| `.semgrep.yml` | Curated Semgrep Rules | v1 |
| `swarm.config.json` | Plattform-Config | v3 (telemetry, per-module auto_retry_threshold) |
| `progress.json` | Projekt-Config | v2 (auto_retry_threshold per module/gate) |
| `buster-pipeline.ts` | Buster Pipeline Worker (spawnt Subagents) | v10 |
| `redis.ts` | Redis Client + Completion Stream | v2 |
| `verify-task.ts` | Agent-Scope-Firewall + Push-Gate | v2 |

### Redis Streams

| Stream | Richtung | Zweck |
|--------|----------|-------|
| `swarm:buster:tasks` | Pipeline → Processor | Task-Dispatch |
| `swarm:pipeline:<project>:completions` | Subagent → Pipeline | Completion-Signal |
| `swarm:pipeline:<project>:completions:log` | Archiv | Alte Completions |
| `pipeline:telemetry:<project>:<run_id>` | Pipeline/Buster → Subscriber | Kanonischer Telemetrie-Stream pro Run |

### File Naming Convention (Review Gates)

```
.swarm/echo-reviews/
├── MIDPOINT-REVIEW-INSTRUCTIONS.md        ← Input (Architecture Branch)
├── echo-opus-MIDPOINT-REVIEW.json         ← Reviewer Output (single reviewer)
└── MIDPOINT-REVIEW.json                   ← Gate Output (copy of reviewer output)
```

Pattern: `{reviewer.label}-{gate.review_name}.json`

---

## 42. Pipeline Telemetrie

### Überblick (v9-Neu)

`services/telemetry.ts` emittiert strukturierte Events an einen Redis Stream. Externe Monitoring-Systeme können diesen Stream konsumieren, ohne in den Pipeline-Code eingreifen zu müssen.

### Konfiguration

```json
{
  "telemetry": {
    "enabled": true
  }
}
```

| Feld | Default | Beschreibung |
|------|---------|-------------|
| `telemetry.stream_key` | — | **Enable-Flag:** Wenn gesetzt (beliebiger Wert), ist Telemetrie aktiv. Der Wert selbst wird NICHT als Stream Key verwendet. |
| `telemetry.enabled` | — | Alternative Enable-Flag: `true` aktiviert Telemetrie. |

**Wichtig:** Der tatsächliche Stream Key wird dynamisch generiert als `pipeline:telemetry:<project>:<run_id>`. Die Konfigurationsfelder `stream_key` und `enabled` dienen nur als Aktivierungsschalter — der Wert von `stream_key` hat keine Auswirkung auf den Key-Namen.

Wenn `telemetry` nicht konfiguriert ist (weder `stream_key` noch `enabled` gesetzt), bleibt Telemetrie aus. Ist Telemetrie aktiviert und Redis nicht erreichbar, bleibt die Pipeline nicht-blockierend, schreibt aber ein explizites `observability.degraded`-Artefakt statt Events still zu verwerfen.

### `emitEvent(ctx, eventType, payload)` — services/telemetry.ts

Primäre Funktion zur Event-Emission an den Redis Stream via `XADD`. Fire-and-forget — wirft nie, blockiert nie.

Convenience-Wrapper für Standard-Events (alle sind Thin Wrappers um `emitEvent`):

**Event-Schema:**
```javascript
{
  type: string,         // z.B. 'module.started', 'plugin.event', 'module.status_changed'
  seq: number,
  project: string,
  run_id: string,
  module_id?: string,
  gate_id?: string,
  ts: string,           // ISO 8601
  // plus event-spezifische Felder auf Top-Level
}
```

### Standard-Events (mit Export-Namen)

Das kanonische Event-Inventar lebt in `docs/lifecycle-unification/TELEMETRY_CONTRACT_V1.md`; `docs/telemetry-event-schema.md` dokumentiert die event-spezifischen Payload-Felder und Beispiele. Alle Events folgen dem Schema `v1` mit `type`, `ts`, `run_id`, `project`, `seq`.

| Export-Name | Event-Typ | Auslöser |
|-------------|-----------|----------|
| `onPipelineStarted` | `pipeline.started` | `runPipeline()` Start |
| `onPipelineCompleted` | `pipeline.completed` | `runPipeline()` Ende |
| `onPipelineHalted` | `pipeline.halted` | Frühzeitiges Ende |
| `onModuleStarted` | `module.started` | Modul-Ausführung beginnt |
| `onModulePass` | `module.status_changed` (PASS) | PASS-Status |
| `onModuleFail` | `module.status_changed` (FAIL) | FAIL-Status |
| `onModuleBlocked` | `module.status_changed` (BLOCKED) | BLOCKED-Status |
| `onGateStarted` | `gate.started` | Gate-Ausführung beginnt |
| `onGatePass` | `gate.verdict` (GO) | Gate GO |
| `onGateFail` | `gate.verdict` (NO-GO) | Gate NO-GO |
| `onAgentSpawned` | `agent.spawned` | Agent gestartet |
| `onAgentKilled` | `agent.killed` | Agent beendet |
| `onPhaseStarted` | `phase.started` | Modul-Phase beginnt |
| `onPhaseCompleted` | `phase.completed` | Modul-Phase endet |
| `onRetryScheduled` | `retry.scheduled` | Retry eingereiht |
| `onRetryExhausted` | `retry.exhausted` | Alle Retries verbraucht |
| `onEscalated` | `error.escalation` | Eskalation an Nova |
| `onSummaryStarted` | `summary.started` | Summary-Agent gestartet |
| `onSummaryCompleted` | `summary.completed` | Summary-Agent beendet; für `summary_type: pipeline` auch mit `terminal_status`, `reason_code`, `summary_json_path`, `pipeline_summary_path` und `latest_json_path` |
| `onBudgetWarning` | `budget.warning` | Budget-Schwelle überschritten |
| `onBudgetExceeded` | `budget.exceeded` | Hard-Budget-Limit erreicht |
| `emitCostUpdate` | `cost.update` | Token/Kosten-Update |
| `emitRateLimitDetected` | `rate_limit.detected` | Rate-Limit erkannt |
| `emitObservabilityDegraded` | `observability.degraded` | Sichtbarkeit ist eingeschränkt |
| `emitObservabilityRestored` | `observability.restored` | Sichtbarkeit wurde wiederhergestellt |
| `emitTranscriptLine` | `agent.transcript` | Transcript-Zeile |
| `emitAgentProgress` | `agent.progress` | Agent-Fortschritt (~30s) |

Die veralteten Hilfs-Exports `onRedisMessage`, `emitBusterResult` und
`emitMemoryRecalled` wurden entfernt. Die kanonische Surface bleibt auf den
dokumentierten strukturierten Events in `services/telemetry.ts` und
`pipeline/index.js` begrenzt.

---

## 42a. Validation Service (Wave 3 Neu)

### `runPreflightValidation(config, moduleDir, mod)` — services/validation.js

Läuft **vor** dem Forge-Spawn. Prüft ob `test_config`-Dateireferenzen in der FORGE.md-Blueprint deklariert sind.

### `runDeliveryLintValidation(config, moduleDir, mod)` — services/validation.js

Läuft **nach** Forge-Output, vor Buster. Prüft ob produzierte Artefakte intern konsistent sind (z.B. Dockerfile-Pfade).

### `formatValidationFailures(failures)` — services/validation.js

Formatiert Validation-Failures für Log-Output und Nova-Eskalation.

**ValidationFailure-Shape:**
```javascript
{
  stage: 'preflight_contract' | 'delivery_lint',
  code: string,      // z.B. 'SERVE_DOCKERFILE_NOT_DECLARED'
  explanation: string,
  next_step: string,
}
```

**VALIDATION_CODES:** `SERVE_DOCKERFILE_NOT_DECLARED`, `API_SPEC_NOT_DECLARED`, `SERVE_DOCKERFILE_MISSING`, `STATIC_PATH_MISMATCH`

---

## 42b. Observability und Cost Service (Wave 3 Neu)

### `appendStructuredEvent(config, eventType, payload)` — services/observability.js

Schreibt strukturiertes Lifecycle-Event in beide kanonischen Artefakte: `projectLogDir(config)/pipeline/pipeline.jsonl` (standardmäßig `.swarm/logs/pipeline/pipeline.jsonl` als Operator-Tail) und, wenn vorhanden, zusätzlich `resolvePipelineRunLogDir(config)/pipeline.jsonl` (die run-scoped `pipeline.jsonl` im Audit-Tree unter `.swarm/logs/pipeline/runs/<run_id>/`).
Die Artefakte verwenden das kanonische Envelope-Schema mit Top-Level-Feldern wie `type`, `ts`, `run_id`, `project`, `source` und `emitter`, statt eines separaten `event`/`timestamp`-Altformats.

### `recordUsageSnapshot(config, opts)` / `aggregateUsage(config)` — services/observability.js

Token/Kosten-Tracking pro Agent-Session.

### `isBudgetExceeded(config)` / `emitBudgetWarnings(config)` — services/observability.js

Budget-Threshold-Prüfung. Konfiguration via `observability.budget` in swarm.config.json:
```json
{
  "observability": {
    "budget": {
      "warn_cost_usd": 1.00,
      "hard_limit_cost_usd": 5.00,
      "warn_tokens": 500000
    }
  }
}
```

### `writeCostReport(config)` — services/observability.js

Schreibt OpenClaw-Usage/Kosten-Artefakte unter `.swarm/logs/cost/`.

---

## 43. v9 Neue Features

### REPO_ROOT Environment Variable

`REPO_ROOT` wurde bereits in v8 unterstützt (Priority 2 bei Repo-Root-Resolution). In v9 ist das Feld in der Umgebungsvariablen-Tabelle des CLI explizit dokumentiert und in den Fehlermeldungen des Config-Loaders beschrieben, wenn das Repo nicht gefunden wird.

**Verwendung:**
```bash
REPO_ROOT=/workspace/myproject node pipeline.ts --project myproject
```

Nützlich wenn die Pipeline aus einem Verzeichnis ausserhalb des Repos aufgerufen wird (z.B. aus `/app/skills/nova/`).

### Konfigurierbare Auto-Retry-Schwelle per Modul/Gate

`auto_retry_threshold` kann jetzt in `progress.json` pro Modul oder Gate überschrieben werden:

```json
{
  "modules": {
    "03": {
      "title": "Complex Auth Module",
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

Die Auflösung erfolgt: Modul/Gate-Override → Platform-Default aus `swarm.config.json`. Damit können kritische oder bekannt schwierige Module mehr Retries erhalten, während Gates strenger behandelt werden.

### Pipeline Telemetrie

Strukturierte Events werden an den kanonischen Redis Stream `pipeline:telemetry:<project>:<run_id>` emittiert. `telemetry.enabled` oder `telemetry.stream_key` compatibility aktivieren die Emission, aber `telemetry.stream_key` benennt den Stream nicht um. Für Details siehe Sektion 42.

Der Stream ermöglicht:
- Echtzeit-Monitoring externer Dashboards
- Automatische Alerting-Integration (PagerDuty, Grafana)
- Nachträgliche Analyse von Pipeline-Laufzeiten und Fehlermustern

### ACP Process Reaping

Wenn ein ACP-Agent-Kill via Gateway (`/stop`) ausgeführt wird, beräumt `agents/shutdown.js` jetzt automatisch verwaiste OS-Prozesse:

1. `acp-monitor.js` trackt die OS-PIDs aller ACP-Subprozesse über Transcript-Monitoring
2. `untrackAgent(ctx, label)` ruft `reapAcpProcess(ctx, label)` auf
3. `reapAcpProcess` sendet SIGTERM an alle dem Agent zugeordneten PIDs
4. Nach 5s folgt SIGKILL für Prozesse die nicht terminiert haben

Verhindert Orphan-Prozesse die nach ungeplanten Agent-Kills weiterhin CPU/Speicher belegen.

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
  fail_patterns: [{ module, phase, summary }],  // Häufige Fehlerursachen
  recommendations: string[],                     // Umsetzbare Empfehlungen
  cost_summary: { total_tokens_in, total_tokens_out, total_duration_seconds },
}
```

Die Zusammenfassung wird als Discord-Embed gesendet (OK oder CRITICAL Level) und an Nova zurückgegeben.

---

## 44. lint-report.ts Referenz

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

---

## 45. Changelog v8 → v9 → v10

### v10 — Dokumentations-Audit (2026-04-03)

Korrekturen gegenüber v9-Dokumentation (kein Code-Change):

| Bereich | Korrektur |
|---------|-----------|
| `core/logger.js` Exports | Korrekte Export-Liste: `createLogger`, `log`, `setActiveContext`, `clearActiveContext`, `getActiveContext`, `initContextLogging` |
| `core/config.js` Exports | `validateBusterConfig` + Policy-Re-Exports ergänzt; `loadProgress` korrekt nach `core/runtime.js` verschoben |
| `validateSafePath` Location | `core/config.js` → `core/paths.js` |
| Gate-Typ-Validierung | `approval` als gültiger Typ ergänzt |
| `on_nogo` Enum | `fix_and_continue` entfernt (nicht im Code); nur `fix_and_rereview` gültig |
| `modelToHarness` Location | `core/paths.js` → `agents/lifecycle.js` |
| File Readers Locations | `status-store.js` → korrekte Module (`prompts/forge.js`, `prompts/buster-instructions.js`, `prompts/buster-gate.js`) |
| `checkDependencies` Location | `runners/module-runner.ts` → `services/dependencies.js` |
| Lint-Funktionen Location | `services/summary.js` → `services/lint.js` |
| `gateStatusPath` Location | `runners/buster-gate-runner.ts` → `core/paths.js` |
| `findNextStep` Signatur | `ctx` → `config` als ersten Parameter |
| Exports Section (§38) | Vollständig neu nach aktuellem `index.js` |
| Dateibaum (§1a) | Alle fehlenden Module ergänzt (constants, git, policy, runtime, services/*, runners/approval-gate-runner) |
| System-Tabelle (§41) | Fehlende Wave-3-Module ergänzt |
| Gate-Dispatcher (§32) | `approval` Gate-Typ + `runApprovalGate()` ergänzt |
| Neue Sektionen | §34a Approval-Gate-Runner, §42a Validation Service, §42b Observability & Cost |

### v9 — Modulare Architektur (2026-03)

### v9 Designprinzip

| Prinzip | Beschreibung |
|---------|-------------|
| **Modulare Architektur** | `pipeline.ts` (4921 Zeilen monolithisch) aufgeteilt in ~25 Single-Responsibility-Module unter `skills/nova/pipeline/`. Ein dünner Shim (`skills/nova/pipeline.ts`) sichert Abwärtskompatibilität. |
| **PipelineContext statt Globals** | Mutable run state is owned by `PipelineContext` / explicit config projections. Ermöglicht parallele Runs und vereinfachte Unit-Tests. |
| **ACP Process Reaping** | Automatisches Beräumen von Orphan-OS-Prozessen nach Agent-Kill. `acp-monitor.js` trackt PIDs, `reapAcpProcess()` sendet SIGTERM/SIGKILL. |
| **Pipeline Telemetrie** | `services/telemetry.ts` emittiert strukturierte Events an den kanonischen Redis Stream `pipeline:telemetry:<project>:<run_id>`. `telemetry.stream_key` bleibt nur als Compatibility-Enable-Flag bestehen. |
| **Konfigurierbare Auto-Retry-Schwelle** | `auto_retry_threshold` kann jetzt in `progress.json` pro Modul oder Gate überschrieben werden (bisher nur Platform-Level in swarm.config.json). |

### Neue Module

| Modul | Beschreibung |
|-------|-------------|
| `core/context.js` | PipelineContext — kapselt allen mutable State |
| `agents/acp-monitor.js` | ACP Session State + Transcript Monitoring + PID-Tracking |
| `services/telemetry.ts` | Event-Emission an Redis Stream |
| `services/summary.js` | Pipeline Summary + strukturierte Review-Generierung |

### Neue Funktionen

| Funktion | Modul | Beschreibung |
|----------|-------|-------------|
| `reapAcpProcess(ctx, label)` | agents/shutdown.js | SIGTERM/SIGKILL für Orphan-OS-Prozesse nach Agent-Kill. |
| `generatePipelineSummary(ctx, result)` | services/summary.js | Strukturierte End-of-Run-Analyse mit Empfehlungen. |

### Signaturänderungen

Alle Funktionen erhalten jetzt `ctx` (PipelineContext) als ersten Parameter statt der v8-Variante mit `config` als erstem Parameter. Externe Aufrufer die v8-APIs nutzen müssen einen Context erstellen:

```javascript
import { loadConfig, createContext, runPipeline } from './pipeline/index.js';
const { config, progress } = await loadConfig('myproject');
const ctx = createContext(config, progress);
await runPipeline(ctx, progress);
```

### Entfernte Funktionen / Code

| Entfernt | Grund |
|----------|-------|
| Globale State-Variablen (`_shutdownState`, `_tmpDir`, etc.) | Ersetzt durch PipelineContext und explizite config projections |
| Monolithische `pipeline.ts` (4921 Zeilen) | Aufgeteilt in ~25 Module unter `pipeline/` |

### CLI

| Flag / Env | Status |
|------|--------|
| `REPO_ROOT` | Explizit in der CLI-Dokumentation aufgeführt (war in v8 bereits funktional aber undokumentiert) |

### Config (swarm.config.json)

| Feld | Status |
|------|--------|
| `auto_retry_threshold` per Modul/Gate | v9 NEU — kann in progress.json pro Modul/Gate überschrieben werden |

### Exports (Änderungen)

| Funktion | Status |
|----------|--------|
| `generatePipelineSummary` | v9 NEU (exportiert) |
| `createContext` | v9 NEU (exportiert) |
