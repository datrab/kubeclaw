# pipeline.js — Referenz & Architektur (v2.0)

## Was ist pipeline.js?

pipeline.js ist der deterministische Orchestrator des OpenClaw Swarm. Nova ruft dieses Script auf, um das Build-Pipeline für KubeCommand (oder ein anderes Projekt) autonom durchzuführen. Es steuert den gesamten Lebenszyklus eines Moduls: Blueprints auschecken, Forge spawnen (baut den Code), Git-Sync, Buster spawnen (testet den Code), Chaos-Tests nach Phase-Completion, und Memory-Integration via Qdrant.

Die Kernphilosophie ist **Kill-and-Respawn**: Bei Fehlern wird nie versucht, einen laufenden Agent zu reparieren. Stattdessen wird die Session zerstört, Nova analysiert den Fehler, schreibt einen besseren Prompt, und ein frischer Agent wird gestartet. Frische Agents mit besseren Prompts schlagen immer stale Agents mit verunreinigtem Context-Window.


## Erwartete Dateien & Verzeichnisstruktur

### Config-Dateien (wo pipeline.js sie sucht)

```
<script_dir>/                        # Verzeichnis wo pipeline.js liegt
  pipeline.js                        # Das Script selbst
  pipeline.config.json               # ← Haupt-Konfiguration (muss neben pipeline.js liegen)

<repo_root>/                         # Git-Repository Root (aus config oder git rev-parse)
  <paths.progress_file>              # z.B. swarm/kubecommand/progress.json
  <paths.modules_dir>/               # z.B. swarm/kubecommand/modules/
    <module_dir>/                     # z.B. 06-websockets/
      FORGE.md                        # Anweisungen für Forge (Builder)
      BUSTER.md                       # Anweisungen für Buster (Tester)
      status.json                     # Runtime-Status des Moduls
      <substep>/FORGE.md              # Optional: Substep-Anweisungen
```

### pipeline.config.json — Erwartete Felder

```jsonc
{
  "project": "kubecommand",           // Projektname (überschreibbar via --project)
  "repo_root": "/app/repo",           // Git-Repo Root (optional, wird auto-detected)

  "paths": {
    "progress_file": "swarm/${project}/progress.json",
    "modules_dir": "swarm/${project}/modules"
  },

  "models": {
    "buster": "gemini-flash",          // Pflichtfeld
    "echo": "claude-sonnet-4-6"        // Optional (für Summary Agent)
  },

  "agents": {
    "forge": {
      "dispatch": "acp",               // "acp" oder "redis" — Pflicht
      "acp_agent_id": "forge",         // Optional
      "cwd": "/app/repo"               // Optional (default: repo_root)
    },
    "buster": {
      "dispatch": "redis",             // Pflicht
      "redis_js_path": "/app/skills/redis.js"  // Pflicht für Redis-Agents
    }
  },

  // Optional mit Defaults:
  "poll_interval_seconds": 30,         // Default: 30
  "default_timeout_minutes": 60,       // Default: 60
  "default_max_fails": 3,             // Default: 3
  "auto_retry_threshold": 2,          // Default: 2 (auto-retries before Nova escalation)

  "discord_webhook_url": "https://discord.com/api/webhooks/...",
  "discord_alerts": {
    "info": true, "warn": true, "critical": true, "ok": true
  },

  "memory": {
    "enabled": true,
    "memory_js_path": "/app/skills/memory.js",
    "recall_limit": 5,
    "recall_before_forge": true,
    "feedback_after_outcome": true,
    "store_patterns_globally": true
  },

  "rate_limit": {
    "cooldown_hours": 2,
    "max_pauses_per_module": 5
  },

  "chaos_test": {
    "after_phases": ["phase_1", "phase_2"],
    "model": "claude-sonnet-4-6",
    "time_limit_minutes": 30,
    "max_fix_attempts": 2
  }
}
```

### progress.json — Projekt-Manifest

```jsonc
{
  "execution_order": ["01", "02", "gate:review_1", "03", "04"],
  "modules": {
    "01": {
      "title": "Auth API",
      "dir": "01-auth",
      "depends_on": [],
      "forge_model": "codex-5.3",
      "forge_subagent": "forge",
      "substeps": null,                  // oder ["01a", "01b"]
      "timeout_minutes": 90,
      "max_fails": 3
    }
  },
  "gates": {
    "review_1": {
      "title": "Architecture Review",
      "type": "forge",                   // Agent-Typ der den Gate ausführt
      "model": "claude-sonnet-4-6",
      "instructions_file": "gates/review_1.md",
      "output_file": "gates/review_1-result.json",
      "timeout_minutes": 30
    }
  },
  "phases": [
    {
      "id": "phase_1",
      "name": "Core Backend",
      "modules": ["01", "02", "03"]
    }
  ]
}
```

### status.json — Modul-Runtime-Status (pro Modul)

```jsonc
{
  "module_id": "06",
  "title": "WebSocket Streaming",
  "status": "PASS",                    // PENDING|IN_PROGRESS|READY_FOR_TESTING|TESTING|PASS|FAIL|BLOCKED|RATE_LIMITED
  "current_phase": null,               // "forge"|"buster"|null
  "fail_count": 1,
  "started_at": "2025-03-08T10:00:00Z",
  "updated_at": "2025-03-08T11:30:00Z",
  "completed_at": "2025-03-08T11:30:00Z",
  "substeps": [{ "id": "06a", "title": "06a", "forge_done": false }],
  "history": [
    { "timestamp": "...", "status": "PENDING", "agent": "pipeline", "note": "Initialized", "commit_hash": "abc1234" }
  ],
  "fail_summaries": [
    { "attempt": 1, "timestamp": "...", "summary": "TypeError in handler", "phase": "buster", "is_timeout": false }
  ],
  "forge_commit_hash": "abc1234def5678...",
  "cost": {
    "forge_tokens_in": 0, "forge_tokens_out": 0,
    "buster_tokens_in": 0, "buster_tokens_out": 0,
    "total_duration_seconds": 5400
  }
}
```


## Startup-Sequenz (CLI Entry Point)

```
node pipeline.js --project kubecommand [--module 06] [--resume] [--status] [--dry-run]
node pipeline.js --project kubecommand --resume --module 06 --prompt "Use X instead of Y"
node pipeline.js --project kubecommand --resume --module 06 --prompt-file /tmp/nova-fix.md
```

1. **`initTempDir()`** — Erstellt ein isoliertes Temp-Verzeichnis (`/tmp/swarm-pipeline-XXXXXX`) für alle temporären Dateien dieses Runs
2. **`registerShutdownHooks()`** — Registriert SIGTERM/SIGINT Handler für Graceful Shutdown
3. **`loadConfig(projectName)`** — Liest `pipeline.config.json` neben dem Script, löst `${project}`-Templates auf
4. **`validateConfig(config)`** — Prüft alle Pflichtfelder, setzt Defaults, validiert Script-Pfade gegen Allowlist
5. **`loadProgress(config)`** — Liest `progress.json` aus dem Repo
6. Dispatch basierend auf CLI-Flags:
   - `--blueprint-list` → `listBlueprints()` → exit
   - `--blueprint 06` → `releaseBlueprint()` → exit
   - `--status` → `printStatus()` → exit
   - `--dry-run` → `dryRun()` → exit
   - Default → `runPipeline()` (full oder single-module)
7. **`cleanupTempDir()`** + `process.exit(exitCode)`


## Pipeline-Hauptschleife

`runPipeline()` iteriert über `progress.execution_order`:

```
┌─────────────────────────────────────────────────────┐
│  findNextStep()                                      │
│    Iteriert execution_order linear                   │
│    Überspringt PASS-Module und completed Gates       │
│    Stoppt bei BLOCKED                                │
│    Gibt zurück: { type: 'module'|'gate'|'blocked'|  │
│                         'done', id }                 │
└──────────────────────┬──────────────────────────────┘
                       │
            ┌──────────▼──────────┐
            │  type === 'done'?   │──yes──→ EXIT_OK (Pipeline complete)
            └──────────┬──────────┘
                       │no
            ┌──────────▼──────────┐
            │  type === 'blocked'?│──yes──→ EXIT_BLOCKED (Human needed)
            └──────────┬──────────┘
                       │no
            ┌──────────▼──────────┐
            │  type === 'gate'?   │──yes──→ runGate() ──→ Loop zurück
            └──────────┬──────────┘
                       │no (module)
            ┌──────────▼──────────┐
            │    runModule()      │
            │                     │──FAIL──→ output(result) → exit
            │                     │──OK────→ Check chaos test → Loop
            └─────────────────────┘
                       │
            ┌──────────▼──────────────────┐
            │  getCompletedPhaseId()       │
            │  Prüft ob gerade eine ganze  │
            │  Phase abgeschlossen wurde   │
            │  UND chaos_test konfiguriert │
            └──────────┬──────────────────┘
                       │ Phase complete?
            ┌──────────▼──────────┐
            │  runChaosTest()     │
            └─────────────────────┘
```


## runModule() — Detaillierter Ablauf

```
╔══════════════════════════════════════════════════════╗
║  MODULE 06: WebSocket Streaming                       ║
╠══════════════════════════════════════════════════════╣

  1. LOG_MODULE = moduleId, LOG_PHASE = null
  
  2. checkDependencies()
     Prüft depends_on[] in progress.json
     Gates: Existiert output_file? Ist gate-status PASS?
     Module: Ist status PASS?
     → Wenn nicht erfüllt: EXIT_ERROR

  3. loadStatus() oder initStatus()
     Wenn PASS → skip
     Wenn BLOCKED → EXIT_BLOCKED
     Wenn PENDING oder null → releaseBlueprint()
       └─ Safety-Check: Überschreibt nicht non-PENDING status
       └─ git checkout origin/<project>/architecture -- <module_path>
       └─ git commit + push

  4. Bestimme Resume-Punkt
     needsForge = PENDING | IN_PROGRESS | FAIL (und phase ≠ buster)
     needsBuster = READY_FOR_TESTING | (TESTING + phase=buster)
```

### Phase 1: FORGE (Code schreiben)

```
  LOG_PHASE = 'forge'
  
  5a. readForgeInstructions()
      Liest FORGE.md (oder substep/FORGE.md für jedes substep)
  
  5b. Retry-Context anhängen (wenn status=FAIL)
      Letzte fail_summary wird als "## RETRY CONTEXT" an den Prompt gehängt
  
  5c. recallForModule() — Qdrant Memory
      ┌─ Versucht dynamic import von memory.js (kein Subprocess)
      ├─ Fallback: nodeExec('node', [memPath, 'recall', ...])
      └─ Formatiert als "## CONTEXT FROM SWARM MEMORY" Block
      
  5d. Status → IN_PROGRESS, phase → forge
      Discord: "Module 06 started"
  
  5e. setShutdownContext() — Für SIGTERM cleanup
  
  5f. spawnAgent(config, progress, 'forge', moduleId, model, prompt)
      ├─ ACP-Agent: Schreibt Prompt in Temp-File, übergibt Dateipfad als --task
      │   (vermeidet E2BIG bei grossen Prompts)
      └─ Redis-Agent: Baut Payload, schreibt .mjs Dispatch-Script, führt es aus
  
  5g. pollStatus() — Polling-Loop
      ┌─ Alle poll_interval_seconds: sleep → gitPullSafe → loadStatus
      ├─ Wartet auf: READY_FOR_TESTING | FAIL | BLOCKED
      ├─ Bei RATE_LIMITED: handleRateLimit() (sleep 2h, fresh status danach)
      ├─ Bei parse corruption (10x): pollResult(false, 'parse_corrupted')
      └─ Timeout: pollResult(false, 'timeout')
      
      Rückgabe: { ok: boolean, reason: string, status: object|null }
  
  5h. killAgent() — IMMER, auch bei Erfolg (Kill-and-Respawn)
      clearShutdownContext()
  
  5i. Ergebnis auswerten:
      ├─ !ok + timeout → handleFail(isTimeout: true) → EXIT_TIMEOUT
      ├─ !ok + rate_limit_exhausted → EXIT_RATE_LIMITED
      ├─ !ok + parse_corrupted → handleFail()
      ├─ FAIL/BLOCKED → handleFail()
      └─ READY_FOR_TESTING → weiter zu Git Sync
```

### Git Sync (Forge → Buster Übergabe)

```
  6. gitSyncBeforeBuster()
     ├─ git add -A
     ├─ git commit (wenn uncommitted changes)
     ├─ gitPullSafe(false) — kein destructive recovery vor push
     ├─ git push origin HEAD
     └─ forge_commit_hash in status.json speichern
```

### Phase 2: BUSTER (Code testen)

```
  LOG_PHASE = 'buster'
  
  7a. readBusterInstructions()
      Liest BUSTER.md, injiziert Commit-Hash als "## Test Target"
  
  7b. Status → TESTING, phase → buster
      setShutdownContext()
  
  7c. spawnAgent(config, progress, 'buster', ...)
      Redis-Dispatch: Payload mit session config, on_complete Hooks
  
  7d. pollStatus() — Wartet auf PASS | FAIL | BLOCKED
  
  7e. killAgent() + clearShutdownContext()
  
  7f. Bei PASS:
      ├─ completed_at + total_duration berechnen
      ├─ saveStatus()
      ├─ Discord: "Module 06 PASS ✓"
      ├─ feedbackMemory('pass') — Qdrant confidence boost
      ├─ spawnSummaryAgent() — Fire-and-forget Echo agent
      │   └─ Liest git diff, extrahiert 1-5 technische Insights
      │   └─ Speichert via memory.js remember
      │   └─ Schreibt Marker-File: summary-markers/<moduleId>-summary.json
      └─ EXIT_OK
  
  7g. Bei FAIL:
      └─ handleFail() → EXIT_NEEDS_NOVA oder EXIT_BLOCKED
```

### handleFail() — Fehlerbehandlung

```
  ├─ fail_summary anhängen (attempt, phase, reason, is_timeout)
  ├─ fail_count++
  ├─ Memory feedback:
  │   fail_count == 1 → feedbackMemory('fail') — single decay
  │   fail_count > 1 && < max → skip (memories nicht schuld)
  │   fail_count >= max → feedbackMemory('blocked') — strong signal
  ├─ Status → FAIL, current_phase → null
  ├─ Wenn fail_count >= maxFails:
  │   Status → BLOCKED, Discord: CRITICAL
  │   → EXIT_BLOCKED
  └─ Sonst: Discord WARN
      → EXIT_TIMEOUT (wenn timeout) oder EXIT_NEEDS_NOVA
```


## runGate() — Gate-Durchführung

```
  1. Prüfe ob output_file schon existiert → skip
  2. readGateInstructions()
  3. spawnAgent() mit gate.type als agentType
  4. Polling-Loop (eigene, nicht pollStatus):
     ├─ Prüft output_file Existenz (Hauptsignal)
     ├─ Prüft <gateId>-gate-status.json für FAIL-Detection
     │   → EXIT_NEEDS_NOVA wenn FAIL
     └─ Timeout → EXIT_TIMEOUT
```


## runChaosTest() — Chaos-Testing nach Phase-Completion

Wird ausgelöst wenn alle Module einer Phase PASS sind und die Phase in `chaos_test.after_phases` konfiguriert ist.

```
  1. Chaos-Marker prüfen (chaos-tests/<phaseId>-done.json)
  2. Buster spawnen mit chaos_test taskType
     └─ Prompt: "Break the application. Write plan + results JSON."
  3. Polling auf results file (nicht status.json)
  4. Ergebnis auswerten:
     ├─ severity none → Marker schreiben, weiter
     ├─ severity low → Discord-Summary, Memory speichern, weiter
     └─ severity critical/moderate → Auto-Fix Loop:
         ┌─ Forge spawnen mit Fix-Prompt
         ├─ Polling über ALLE betroffenen Module (nicht nur letztes)
         ├─ Git sync
         ├─ Buster erneut spawnen zur Verifikation
         └─ Max fix_attempts erreicht? → EXIT_NEEDS_NOVA
```


## Logging — Was wird wo geloggt

### Ausgabekanäle

| Kanal | Format | Konsument |
|-------|--------|-----------|
| **stderr** | JSON Lines (eine Zeile pro Event) | Mission Control, Log-Aggregatoren, Terminal |
| **stdout** | JSON (pretty-printed) | Nova (parst das Result programmatisch) |

### Log-Entry Struktur (stderr)

```json
{
  "ts": "2025-03-08T14:30:00.123Z",
  "level": "INFO",
  "run_id": "run-1741448400000-a3f2",
  "module": "06",
  "phase": "forge",
  "msg": "Forge complete → READY_FOR_TESTING",
  "data": null
}
```

- **run_id** — Eindeutig pro Pipeline-Invokation, korreliert alle Logs eines Runs
- **module** — Wird gesetzt wenn `runModule()` betreten wird (`LOG_MODULE`)
- **phase** — `forge`, `buster`, `chaos`, `chaos-fix-N`, `chaos-verify-N` (`LOG_PHASE`)

### Wo wird was geloggt

| Event | Level | Phase | Nachricht |
|-------|-------|-------|-----------|
| Pipeline Start | STEP | — | `PIPELINE: KUBECOMMAND` |
| Modul Start | STEP | — | `MODULE 06: WebSocket Streaming` |
| Forge Start | STEP | forge | `Phase: FORGE (subagent: forge, model: codex-5.3)` |
| Agent Spawn (ACP) | STEP→OK | forge | `Spawning ACP session` → `ACP session spawned` |
| Agent Spawn (Redis) | STEP→OK | — | `Dispatching to Redis` → `Redis task dispatched` |
| Memory Recall | STEP | forge | `Memory recall for module 06` |
| Memory Inject | INFO | forge | `3 memories injected into Forge prompt` |
| Poll Tick | INFO | forge | `status=IN_PROGRESS phase=forge 120s/3600s` |
| Git Pull Conflict | WARN | — | `Git pull left repo in REBASING state` |
| Git Commit Fail | WARN | — | `Git commit failed for status update` |
| Target Reached | OK | forge | `Target status reached: READY_FOR_TESTING` |
| Session Kill | STEP→OK | forge | `Destroying ACP session` → `Session destroyed` |
| Git Sync | STEP→OK | — | `Git sync: committing...` → `Forge commit hash recorded` |
| Buster Start | STEP | buster | `Phase: BUSTER (model: gemini-flash)` |
| Module PASS | OK | buster | `Module 06 PASS` |
| Module FAIL | — | — | (via handleFail → saveStatus → Discord) |
| Rate Limit | WARN | — | `Rate limit detected! Pause 1/5. Sleeping 2h` |
| Timeout | ERROR | — | `Timeout after 60 minutes` |
| Chaos Test | STEP | chaos | `CHAOS TEST: Core Backend (phase_1)` |
| Shutdown Signal | WARN | — | `Received SIGTERM — initiating graceful shutdown` |

### Discord-Benachrichtigungen

| Event | Level | Wann |
|-------|-------|------|
| Module gestartet | INFO | Forge-Phase beginnt |
| Module PASS | OK | Buster bestätigt |
| Module FAIL/TIMEOUT | WARN | Jeder Fehlversuch |
| Module BLOCKED | CRITICAL | Max-Retries überschritten |
| Rate Limited | WARN | API Rate-Limit erkannt |
| Gate PASS/FAIL/TIMEOUT | OK/CRITICAL | Gate abgeschlossen/fehlgeschlagen |
| Chaos Test Ergebnis | INFO/WARN/OK | Nach Auswertung |
| Git Commit Failed | WARN | Status auf Disk aber nicht in Git |
| Pipeline Complete | OK | Alle Module PASS |


## Retry-Verhalten (v2.0)

Die Pipeline hat einen **gestuften Retry-Mechanismus**:

### Auto-Retry (intern, kein Exit)

Die ersten `auto_retry_threshold` Fehlversuche (default: 2) werden **intern** gehandhabt. Die Pipeline stoppt nicht, exitiert nicht — sie looped intern zurück und startet einen frischen Forge-Agent mit dem Retry-Context. Discord informiert über jeden Fehlversuch.

```
Attempt 1: Forge baut → Buster testet → FAIL
  ↓ handleFail returns { _retry: true }
  ↓ runModule while-loop: continue → re-read status.json
Attempt 2: Forge baut (mit Retry-Context) → Buster testet → FAIL
  ↓ handleFail returns { _retry: true }
  ↓ runModule while-loop: continue
Attempt 3: fail_count (2) > auto_retry_threshold (2)
  ↓ handleFail returns EXIT_NEEDS_NOVA (exit code 10)
  ↓ Pipeline stoppt
```

### Nova-Eskalation (EXIT_NEEDS_NOVA = 10)

Nach Überschreitung des Auto-Retry-Thresholds exitiert die Pipeline mit Code 10. Nova (oder du) muss dann mit einem neuen Ansatz fortfahren:

```bash
# Nova analysiert den Fehler und gibt einen neuen Ansatz vor:
node pipeline.js --project kubecommand --resume --module 06 \
  --prompt "Der WebSocket-Handler muss auf app direkt registriert werden, nicht auf dem APIRouter. Verwende app.websocket() statt router.websocket()."

# Für längere Prompts:
node pipeline.js --project kubecommand --resume --module 06 \
  --prompt-file /tmp/nova-analysis-06.md
```

### Was der Forge-Agent bekommt

Der zusammengebaute Prompt hat diese Reihenfolge (höchste Priorität zuletzt):

```
1. FORGE.md                    ← Original-Anweisungen von Disk (unverändert)
2. ## RETRY CONTEXT             ← Automatisch: letzte fail_summary
3. ## NOVA DIRECTIVE            ← Nur wenn --prompt angegeben
4. ## CONTEXT FROM SWARM MEMORY ← Qdrant Recall (confidence-adjusted nach Fails)
```

### Config

```jsonc
{
  "auto_retry_threshold": 2,   // Default: 2 (Attempts 1+2 auto, ab 3 → Nova)
  "default_max_fails": 3       // Default: 3 (Attempt 3 = BLOCKED wenn Nova auch scheitert)
}
```

Das Zusammenspiel: `auto_retry_threshold` kontrolliert wann Nova eingeschaltet wird. `max_fails` kontrolliert wann das Modul BLOCKED wird (Human needed). Bei default Werten: 2 Auto-Retries, 1 Nova-Retry, dann BLOCKED.


## Exit-Codes

| Code | Konstante | Bedeutung | Nächste Aktion |
|------|-----------|-----------|----------------|
| 0 | EXIT_OK | Erfolg | — |
| 1 | EXIT_ERROR | Config/System-Fehler | Davide prüft Config |
| 10 | EXIT_NEEDS_NOVA | Auto-Retries erschöpft | Nova: `--resume --module <id> --prompt "..."` |
| 20 | EXIT_BLOCKED | Max-Retries überschritten | Davide greift manuell ein |
| 30 | EXIT_TIMEOUT | Agent hat nicht geantwortet | Nova passt Timeout/Prompt an |
| 40 | EXIT_RATE_LIMITED | API Rate-Limit erschöpft | Abwarten oder Plan anpassen |


## Status-Transitionen

```
PENDING → IN_PROGRESS → READY_FOR_TESTING → TESTING → PASS
                ↓                              ↓
              FAIL ←─────────────────────── FAIL
                │
    ┌───────────┤
    │ auto-retry (internal loop, ≤ threshold)
    │           │
    │   ┌───────▼──────┐
    │   │ FAIL (again)  │──── still under threshold? ──→ loop again
    │   └───────┬──────┘
    │           │ threshold exceeded
    │   ┌───────▼──────────┐
    │   │ EXIT_NEEDS_NOVA  │  Nova: --resume --prompt "..."
    │   └───────┬──────────┘
    │           │
    │   ┌───────▼──────┐
    │   │ FAIL (nova)   │──── fail_count >= max_fails?
    │   └───────┬──────┘
    │           │ yes
    │   ┌───────▼──────┐
    │   │   BLOCKED    │  Human intervention needed
    │   └──────────────┘
    │
    └── * → RATE_LIMITED → (vorheriger Status nach Cooldown)
```


## Agent-Dispatch Modi

### ACP Agents (Forge, Echo)
- Nova's Subagents via OpenClaw CLI (`openclaw sessions spawn`)
- Pipeline hat volle Lifecycle-Kontrolle (spawn/kill)
- Prompt wird in Temp-File geschrieben, Agent bekommt Dateipfad
- Session wird nach jeder Phase zerstört

### Redis Agents (Buster)
- Eigenständige OpenClaw-Instanzen in separatem K8s-Pod
- Task wird via Redis Stream dispatcht (`redis.js`)
- Processor-Sidecar nimmt Task auf, injiziert Qdrant-Context, füttert Gateway
- Pipeline hat KEINE direkte Lifecycle-Kontrolle — "Kill" ist no-op
- Buster läuft als Podman-in-Pod Sandbox (SYS_ADMIN, SYS_CHROOT)


## Sicherheitsmassnahmen (v2.0)

- **Path Validation**: `validateSafePath()` prüft redis_js_path und memory_js_path gegen Allowlist (`/app/`, `/opt/`, `/home/`)
- **No Shell**: Alle externen Commands via `execFileSync` mit Array-Args (kein Shell-Bypass)
- **Temp Isolation**: Ein `mkdtempSync`-Verzeichnis pro Run, automatisch aufgeräumt
- **Config Validation**: Alle Pflichtfelder beim Start geprüft, klare Fehlermeldungen
- **Graceful Shutdown**: SIGTERM/SIGINT tötet laufenden Agent, setzt Status auf FAIL
- **Discord URL Protection**: Gesamte `discord()` Funktion in try/catch (kein URL-Leak in Stacktrace)
- **Git Safe Mode**: `gitPullSafe()` default `allowDestructiveRecovery=false` — kein `reset --hard` ohne explizite Erlaubnis


## Generierte Runtime-Dateien

| Pfad | Erzeugt von | Zweck |
|------|-------------|-------|
| `/tmp/swarm-pipeline-XXXXXX/` | `initTempDir()` | Temp-Dir für diesen Run |
| `.../prompt-<mod>-*.md` | `spawnAcpAgent()` | Forge/Echo Prompt-Dateien |
| `.../payload-<mod>-*.json` | `dispatchRedisTask()` | Redis Task-Payloads |
| `.../dispatch-<mod>-*.mjs` | `dispatchRedisTask()` | Redis Dispatch-Scripts |
| `<swarmRoot>/summary-markers/<mod>-summary.json` | Summary Agent | Completion-Marker |
| `<swarmRoot>/chaos-tests/<phase>-plan.md` | Chaos Buster | Test-Plan |
| `<swarmRoot>/chaos-tests/<phase>-results.json` | Chaos Buster | Test-Ergebnisse |
| `<swarmRoot>/chaos-tests/<phase>-done.json` | Pipeline | Chaos-Completion-Marker |
| `<swarmRoot>/<gateId>-gate-status.json` | Gate Agent | Gate FAIL-Detection |
