# Buster Test Platform — Phasenplan

**Version:** 2.5 (Phase 1-4 partial + Phase 5 partial implementiert)  
**Datum:** 2026-03-18  
**Status:** Phase 1 ✅ Phase 2 ✅ Phase 3 ✅ Phase 4 partial ✅ Phase 5 partial ✅ — LLM-Features + Prompt-Integration offen

---

## 1. Architektur-Überblick

### 1.1 Alter Zustand (vor Migration)

```
Nova Pod                              Buster Pod
┌──────────────────────┐              ┌─────────────────────────────────────┐
│  Gateway (OpenClaw)  │              │  Gateway (OpenClaw)     [16GB/4CPU] │
│  pipeline.js         │──── Redis ──▶│  ┌ Podman, Playwright, k6, nginx  │
│  buildBusterPrompt() │    Stream    │  └ Sandbox (/sandbox)             │
└──────────────────────┘              │                                     │
                                      │  Processor Sidecar      [256MB/0.2]│
                                      │  ┌ Pollt Redis                    │
                                      │  ├ git pull                       │
                                      │  ├ Spawnt ACP Subagent            │
                                      │  └ Monitort Completion            │
                                      └─────────────────────────────────────┘
```

**Probleme:**

- Processor ist ein separater Container ohne Zugriff auf Sandbox (kein Podman, kein Playwright, kein `/sandbox` Volume, kein `/var/lib/containers`)
- Alle deterministischen Checks (Build, a11y, Perf) müssen vom LLM-Subagent manuell ausgeführt werden → Token-Verschwendung
- Wenn der Build scheitert, wird trotzdem ein LLM-Subagent gespawnt → unnötige Kosten
- Processor hat nur 256MB RAM / 200m CPU — kann keine schweren Tools ausführen
- Processor kann Prompt nicht anreichern — reicht `payload.instructions` 1:1 an Gateway weiter

### 1.2 Neue Architektur

```
Nova Pod                              Buster Pod
┌──────────────────────┐              ┌─────────────────────────────────────┐
│  Gateway (OpenClaw)  │              │  Gateway (OpenClaw)     [16GB/4CPU] │
│  pipeline.js         │──── Redis ──▶│  ┌ Podman, Playwright, k6, nginx  │
│  buildBusterPrompt() │    Stream    │  ├ Sandbox (/sandbox)             │
└──────────────────────┘              │  └ Skills (/app/skills)           │
                                      │                                     │
                                      │  buster-orchestrator.js             │
                                      │  (Hintergrundprozess im SELBEN      │
                                      │   Container — voller Sandbox-Zugriff)│
                                      │  ┌ Pollt Redis                    │
                                      │  ├ git pull                       │
                                      │  ├ sandbox-build + sandbox-serve  │
                                      │  ├ suite-runner.js (deterministisch)│
                                      │  ├ Prompt anreichern mit Results  │
                                      │  ├ Spawnt ACP Subagent            │
                                      │  └ Monitort Completion            │
                                      └─────────────────────────────────────┘

                                      Kein Processor-Sidecar mehr.
```

**Vorteile:**

- Orchestrator läuft im Gateway-Container → hat Zugriff auf Podman, Playwright, Chromium, k6, nginx, `/sandbox`
- Deterministische Suites laufen VOR dem Subagent-Spawn → kein LLM nötig für Build-Check, a11y, Perf
- Bei kritischem Failure (Build failed) → direkt FAIL an Completion-Stream, kein Subagent, null Token-Verbrauch
- Ein Container weniger → einfacheres Deployment, kein Volume-Sharing-Problem
- 16GB RAM und 4 CPUs für die Suites — mehr als genug

### 1.3 Warum die Trennung Nova/Buster richtig ist

Die Pods bleiben getrennt. Gründe:

- **Security:** Nova läuft unprivilegiert (`runAsNonRoot: true`, keine Capabilities). Buster braucht `privileged: true`, `SYS_ADMIN`, AppArmor `Unconfined` für Podman. Zusammenlegen würde Nova unnötig exponieren.
- **Resources:** Nova braucht ~4GB RAM. Buster braucht 16GB (Chromium, Podman, k6).
- **Identität:** Verschiedene SSH-Keys, Git-Autoren, Discord-Channels, AGENT_NAME.
- **Lifecycle:** Nova läuft dauerhaft als Orchestrator. Buster ist task-driven (idle zwischen Tasks).

### 1.4 Task-Flow (Detail)

```
1. pipeline.js (Nova) baut Buster-Prompt
   → Enthält: Kontext, BUSTER.md, test_suites Config, Completion Protocol
   → Sendet als Redis-Message an swarm:buster:tasks

2. buster-orchestrator.js empfängt Message
   → Extrahiert Payload: instructions, test_suites, module, completion_stream

3. Schritt 0: Sandbox Cleanup (defensive — clean slate)
   → sandbox-cleanup (Podman containers, /sandbox/www, /sandbox/results)

4. Schritt 1: git pull --rebase
   → Sicherstellen: aktueller Code vom Forge-Commit

5. Schritt 2: Prompt als Datei speichern
   → /tmp/buster-task-<id>.md (für Audit/Debug)

6. Schritt 3: Build + Serve
   → sandbox-build (Frontend) ODER Server starten (Backend)
   → sandbox-serve (nginx auf :9999) ODER App auf konfiguriertem Port
   → App bleibt für den gesamten Task laufen!

7. Schritt 4: suite-runner.js ausführen (DETERMINISTISCH — kein LLM)
   → Liest test_suites aus Payload
   → Führt jede Suite sequentiell gegen die laufende App aus
   → Aggregiert Verdict-JSON
   → Speichert Results in /sandbox/results/ UND .swarm/modules/<module>/test-results/

8. Schritt 5: Entscheidung

   WENN kritische Suite FAIL (z.B. Build oder Health):
   → FAIL direkt an Completion-Stream schreiben
   → Discord-Notification mit Suite-Details
   → Sandbox Cleanup
   → Kein Subagent, fertig
   → pipeline.js routet zurück an Forge

   WENN alle Suites PASS oder nur Warnings:
   → Verbleibenden Timeout berechnen (Gesamt - Suite-Zeit - Buffer)
   → Prompt anreichern: Suite-Results als Block einfügen
     (Top-N Findings inline, Rest als File-Referenz)
   → Prompt anpassen: "App läuft auf localhost:9999, starte direkt mit Tests"
   → ACP Subagent spawnen via Gateway API (localhost:18789)
   → Subagent arbeitet:
     - Hat Suite-Results bereits im Prompt
     - App läuft bereits — kein Build/Serve nötig
     - Führt modul-spezifische Tests aus (BUSTER.md)
     - Chaos/Edge-Case Tests (LLM-Kreativität)
     - Visual Audit bei Frontend-Modulen
     - status.json → memory.js → redis.js --action complete
   → Orchestrator monitort Completion-Stream
   → Bei Completion/Timeout: Kill Subagent

9. Schritt 6: Cleanup (IMMER — auch bei Timeout/Error)
   → sandbox-cleanup
   → Temp-Files löschen
   → Redis ACK
```

### 1.5 Start-Mechanismus

Der Gateway-Container startet beide Prozesse:

```yaml
# buster-values.yaml
gateway:
  command:
    - "/bin/bash"
    - "-c"
    - |
      node /app/skills/buster-orchestrator.js &
      ORCH_PID=$!
      node /app/openclaw.mjs gateway --bind lan --port 18789 &
      GW_PID=$!
      wait -n $ORCH_PID $GW_PID
      kill $ORCH_PID $GW_PID 2>/dev/null
      exit 1
```

Falls einer der Prozesse stirbt, werden beide beendet → Kubernetes Restart-Policy startet den Pod neu.

### 1.6 Robustheit

**Gateway-Readiness:** Der Orchestrator wartet beim Start bis der Gateway auf Port 18789 ready ist (Health-Check-Loop mit Timeout 120s), dann beginnt er mit dem Redis-Polling.

**Gateway-Health-Monitor:** Periodischer Health-Check im Orchestrator. Wenn der Gateway nicht mehr antwortet, beendet sich der Orchestrator selbst → `wait -n` killt beide → Pod-Restart.

**Graceful Shutdown (SIGTERM):**
```
1. Aktiven Subagent killen (falls vorhanden)
2. sandbox-cleanup
3. Redis disconnect
4. process.exit(0)
```

**Sequentielle Verarbeitung:** Ein Task zur Zeit (XREADGROUP COUNT 1, blockierend). Kein Parallelismus — Podman/nginx/Sandbox sind nicht parallel-safe.

**ACK-Timing:** Redis-Message wird erst nach dem kompletten Task geACKt (nach Subagent-Completion oder nach direktem FAIL). Bei Pod-Crash → Message wird redelivered → Task wird erneut bearbeitet.

**Sandbox-Cleanup:** Defensiv als Schritt 0 jedes Tasks UND als Schritt 6 am Ende. Doppelt schützt vor State-Leaks zwischen Tasks.

### 1.7 Abgrenzung Echo vs Buster

Buster und Echo haben klar getrennte Zuständigkeiten. Es gibt keinen Overlap:

| Echo (Statische Analyse / Review) | Buster (Runtime-Tests) |
|---|---|
| Lint-Report (tsc, ESLint, Semgrep) | Build kompiliert in Sandbox? |
| Circular Dependencies (madge) | Server startet? Ports offen? |
| Unused Code (knip) | API antwortet korrekt? |
| npm audit (Dependency-Vulnerabilities) | Accessibility (axe-core Runtime) |
| Code-Qualität / Architektur-Review | Performance (Lighthouse Runtime) |
| Helm/YAML Validation | Visual Regression (Screenshot-Diff) |
| GO / NO-GO Entscheidung | PASS / FAIL Entscheidung |

Buster bekommt KEINEN Lint-Report. Echo bekommt KEINE Test-Suite-Results. Beide arbeiten unabhängig.

---

## 2. Suite-Runner Framework

### 2.1 Einheitliches Verdict-Schema

Jede Suite gibt dieses JSON-Format zurück:

```json
{
  "suite": "a11y",
  "status": "FAIL",
  "critical": false,
  "duration_ms": 4200,
  "checks_total": 47,
  "checks_passed": 44,
  "checks_failed": 3,
  "findings": [
    {
      "severity": "critical",
      "rule": "color-contrast",
      "element": "button.primary",
      "message": "Element hat Kontrastverhältnis von 2.1:1 (erwartet: 4.5:1)",
      "file": null,
      "line": null
    }
  ],
  "metadata": {
    "tool": "axe-core 4.x",
    "url_tested": "http://localhost:9999",
    "threshold": null
  }
}
```

### 2.2 Aggregiertes Runner-Verdict

`suite-runner.js` aggregiert alle Suites zu:

```json
{
  "run_id": "buster-test-06-1710756000",
  "module": "06",
  "project": "kubecommand",
  "timestamp": "2026-03-18T12:00:00Z",
  "overall_status": "FAIL",
  "critical_failure": true,
  "duration_ms": 18500,
  "suites": {
    "build": { "status": "FAIL", "critical": true, "...": "..." },
    "health": { "status": "SKIP", "reason": "build failed" },
    "a11y": { "status": "SKIP", "reason": "build failed" }
  },
  "summary": "Build failed: tsc found 3 errors. Downstream suites skipped.",
  "recommendation": "NO_SUBAGENT"
}
```

`recommendation` Werte:

- `NO_SUBAGENT` — Kritischer Failure, direkt FAIL melden
- `SPAWN` — Suites OK oder nur non-critical Findings, Subagent bekommt Verdict-JSON + laufende App

### 2.3 Suite-Konfiguration in progress.json

```json
{
  "modules": {
    "02": {
      "title": "Kubernetes Connection Layer",
      "dir": "02-kubernetes-connection",
      "test_suites": ["build", "health", "api"],
      "test_config": {
        "serve": {
          "type": "server",
          "start_cmd": "npm start",
          "port": 3000,
          "health_path": "/api/health"
        },
        "api": { "spec_file": ".swarm/modules/02-kubernetes-connection/test-spec.json" }
      }
    },
    "15": {
      "title": "Dashboard + Core Pages",
      "dir": "15-dashboard-core-pages",
      "test_suites": ["build", "health", "a11y", "perf", "visual-reg"],
      "test_config": {
        "serve": {
          "type": "static",
          "build_cmd": "npm run build",
          "image": "node:20-slim"
        },
        "perf": { "thresholds": { "performance": 80, "accessibility": 90 } },
        "visual-reg": { "baseline_dir": ".swarm/modules/15-dashboard-core-pages/baselines" }
      }
    }
  }
}
```

**Serve-Strategie** — zwei Typen:

| Typ | Verwendung | Wie |
|---|---|---|
| `static` | Frontend-Module (14-18) | `sandbox-build` → `/sandbox/www/` → nginx auf :9999 |
| `server` | Backend-Module (01-13) | `sandbox-run` mit `start_cmd` → App auf konfiguriertem Port |

**Defaults:** Wenn `test_suites` nicht gesetzt → `["build", "health"]`. Wenn `test_config` nicht gesetzt → Autodetect aus `package.json`.

### 2.4 Suite-Abhängigkeiten (Execution Order)

Manche Suites sind voneinander abhängig. Der Runner respektiert eine feste Reihenfolge und skippt Downstream-Suites bei kritischem Failure:

```
build → health → [api, a11y, perf, security, visual-reg, e2e, unit, bundle]
```

- `build` FAIL → alle anderen werden SKIP (kritisch)
- `health` FAIL → alle ausser `build` werden SKIP (kritisch)
- Restliche Suites laufen sequentiell, unabhängig voneinander

### 2.5 Prompt-Injection

Der Orchestrator reichert den Prompt an. Bei grossen Suite-Results werden die Findings truncated (Top-N nach Severity inline, Rest als File-Referenz):

```markdown
## Pre-Test Results (Automatisch — kein Handlungsbedarf)

Die folgenden Tests wurden deterministisch vor deiner Session ausgeführt.
Die App läuft bereits auf http://localhost:9999 — du musst NICHT bauen oder serven.

### ✅ build — PASS (3.2s)
Build erfolgreich. Output: /sandbox/www/ (2.1 MB)

### ✅ health — PASS (1.1s)
Server antwortet auf http://localhost:9999 (Status 200, 45ms)

### ⚠️ a11y — 3 von 47 Checks fehlgeschlagen (4.2s)
1. **critical** color-contrast: button.primary (Ratio 2.1:1, erwartet 4.5:1)
2. **serious** aria-label: nav.main (fehlend)
3. **moderate** heading-order: h3 direkt nach h1

Vollständiger Report: /sandbox/results/a11y-verdict.json

### ✅ perf — PASS (8.1s)
Lighthouse: Performance 92, Accessibility 78, Best Practices 95, SEO 100

---

Fokussiere dich auf die modul-spezifischen Tests in den Test Instructions.
Die a11y-Findings oben sind bereits dokumentiert — bewerte ob sie PASS/FAIL-relevant sind.
```

### 2.6 Timeout-Kalkulation

pipeline.js setzt einen Gesamt-Timeout (z.B. 2700s = 45 min). Der Orchestrator zieht die Suite-Laufzeit ab:

```
Gesamt-Timeout aus Payload:           2700s
- Suite-Laufzeit:                     -300s
- Buffer (Cleanup, Spawn-Overhead):    -60s
= Subagent-Timeout:                   2340s
```

Dieser berechnete Timeout wird an `runTimeoutSeconds` im Spawn-Aufruf übergeben.

---

## 3. Logging und Discord-Benachrichtigungen

### 3.1 Stdout/Stderr (kubectl logs)

Format konsistent mit bestehendem Processor. Prefixes:

| Prefix | Quelle |
|---|---|
| `[REDIS]` | Redis-Verbindung / Polling |
| `[TASK]` | Task-Empfang, Routing |
| `[GIT]` | git pull, Sync |
| `[SUITE]` | suite-runner.js Output |
| `[BUILD]` | sandbox-build Output |
| `[SERVE]` | sandbox-serve / Server-Start |
| `[SPAWN]` | ACP Session Spawn |
| `[MONITOR]` | Completion-Stream-Polling |
| `[COMPLETE]` | Task abgeschlossen |
| `[CLEANUP]` | Sandbox-Cleanup |

### 3.2 Discord-Notifications (Webhook)

**Bestehende Notifications** (übernommen 1:1 vom Processor):

- Task empfangen (wer → buster, type, module)
- ACP Session gespawnt (session key, model, timeout)
- ACP Session complete (PASS/FAIL, summary, commit)
- ACP Session timeout
- Dispatch-Fehler

**Neue Notifications:**

Suite-Results Embed (Erfolg):
```
🔬 Pre-Test Results: Module 06
━━━━━━━━━━━━━━━━━━━━━━
✅ build    — PASS (3.2s)
✅ health   — PASS (1.1s)  
⚠️ a11y     — 3 issues (4.2s)
✅ perf     — Score 92 (8.1s)
━━━━━━━━━━━━━━━━━━━━━━
→ Spawning Subagent (results injected)
```

Kritischer Failure Embed:
```
❌ Pre-Test FAIL: Module 06
━━━━━━━━━━━━━━━━━━━━━━
❌ build    — FAIL (1.8s)
   tsc: 3 errors in handler.ts
⏭ health   — SKIP (build failed)
⏭ a11y     — SKIP (build failed)
━━━━━━━━━━━━━━━━━━━━━━
→ Kein Subagent. FAIL an Pipeline gemeldet.
```

### 3.3 Suite-Results Persistenz

Zwei Speicherorte:

| Ort | Zweck | Lebensdauer |
|---|---|---|
| `/sandbox/results/` | Subagent-Zugriff, Prompt-Referenz | Bis Cleanup (Task-Ende) |
| `.swarm/modules/<module>/test-results/` | Git-Persistenz, Audit-Trail | Permanent (committet vom Subagent via verify-task.js) |

---

## 4. Phasen

### Phase 1: Foundation — Orchestrator + Suite-Runner + Build/Health

**Ziel:** Die neue Architektur steht. Buster kann deterministisch bauen, serven und Health-Checks ausführen, bevor ein LLM involviert wird.

**Neue Files:**

| File | Ort | Zeilen | Beschreibung |
|---|---|---|---|
| `buster-orchestrator.js` | `skills/buster/` | 709 | Ersetzt Processor-Sidecar. Redis-Poll → Build/Serve → Suite-Runner → Conditional Spawn → Monitor. Inkl. Gateway-Health-Check, SIGTERM-Handler, Discord-Notifications |
| `suite-runner.js` | `skills/buster/` | 298 | Suite-Orchestrator. Lädt Config, führt Suites sequentiell aus, respektiert Abhängigkeiten (build→health→rest), aggregiert Verdicts, trunciert Findings für Prompt-Injection |
| `verdict-schema.js` | `skills/buster/` | 221 | Einheitliches Verdict-Schema. Konstanten (STATUS, SEVERITY, RECOMMENDATION), Factory-Funktionen, Truncation-Helper |
| `suites/build.js` | `skills/buster/suites/` | 256 | Build-Check. Erkennt serve-type (static vs server), ruft sandbox-build/sandbox-run auf, captured stdout/stderr, parsed Errors, Verdict-JSON |
| `suites/health.js` | `skills/buster/suites/` | 159 | HTTP-Health-Check. Fetch mit Timeout + Retry (3x, exponential backoff), Status-Code Check, Response-Time Messung, Verdict-JSON |

**Geänderte Files:**

| File | Änderung |
|---|---|
| `buster-values.yaml` | `gateway.command` überschreiben (Dual-Process-Start). `processor.enabled: false`. Soul + Agents aktualisiert |
| `progress.json` (Beispiel) | `test_suites` und `test_config` Felder pro Modul hinzufügen |
| `pipeline.js` | `buildBusterPayload()`: `test_suites` und `test_config` aus progress.json in den Payload aufnehmen (2 Zeilen) |

**Nicht geändert (entgegen ursprünglicher Planung):**

- `Dockerfile.sandbox` — keine Änderung nötig, `COPY skills/buster/ /app/skills/` kopiert automatisch alle neuen Files inkl. `suites/`

**Nicht geändert:**

- `buster-processor.cjs` bleibt als File bestehen (Rollback-Option), wird aber nicht mehr gestartet
- `pipeline.js` `buildBusterModulePrompt()` bleibt unverändert — der Orchestrator übernimmt die Prompt-Anreicherung
- `charts/kubeclaw/templates/deployment.yaml` — kein Breakage, Processor-Sidecar wird über `processor.enabled` gesteuert

**Definition of Done Phase 1:**

- [x] Orchestrator wartet auf Gateway-Readiness, dann pollt Redis
- [x] Orchestrator führt Sandbox-Cleanup als Schritt 0 aus
- [x] Orchestrator führt git pull aus
- [x] Orchestrator erkennt serve-type (static/server) und startet App
- [x] suite-runner.js führt build + health Suites aus
- [x] Bei Build-Fail: direkt FAIL an Completion-Stream, kein Subagent
- [x] Bei Build-Pass: Subagent mit Suite-Results im Prompt, App bleibt laufen
- [x] Prompt sagt dem Subagent: "App läuft bereits, starte direkt mit Tests"
- [x] Timeout-Kalkulation: Suite-Zeit wird vom Gesamt-Timeout abgezogen
- [x] Discord-Notifications für Suite-Results (PASS/FAIL Embed)
- [x] SIGTERM-Handler: Subagent killen, Cleanup
- [x] Cleanup nach jedem Task (auch bei Error/Timeout)
- [x] Sequentielle Verarbeitung (ein Task zur Zeit)
- [x] ACK erst nach komplettem Task
- [x] Processor-Sidecar deaktiviert
- [x] Bestehender Buster-Flow funktioniert weiterhin (keine Regression)
- [x] Rollback auf alten Processor möglich (processor.enabled: true)

**Implementiert:** 2026-03-18 — Referenzdokumentation: `docs/buster-test-platform-reference-v1.md`

**Geschätzter Aufwand:** ~900 Zeilen → **Tatsächlich: 1638 Zeilen** (verdict-schema war nicht eingeplant, build.js und health.js umfangreicher als geschätzt)

---

### Phase 2: Frontend-Testing Suites ✅

**Ziel:** Deterministische Frontend-Tests. Für Module 14-18 laufen a11y, Performance, Bundle-Size und Visual-Regression automatisch.

**Neue Files:**

| File | Ort | Zeilen | Beschreibung |
|---|---|---|---|
| `screenshot.js` | `skills/buster/` | 171 | Shared Playwright-Screenshot-Utility. Akzeptiert URLs + lokale HTML-Dateien. CLI für Baseline-Erstellung |
| `suites/a11y.js` | `skills/buster/suites/` | 203 | axe-core via Playwright. WCAG-Violations als Findings. Dual-Mode |
| `suites/perf.js` | `skills/buster/suites/` | 202 | Lighthouse CLI Wrapper. 4 Kategorien, konfigurierbare Thresholds. Dual-Mode |
| `suites/bundle.js` | `skills/buster/suites/` | 174 | Build-Output-Größe + Dateianzahl. Top-5 größte Files. Dual-Mode |
| `suites/visual-reg.js` | `skills/buster/suites/` | 259 | Playwright Screenshot + pixelmatch gegen Baseline. Diff-Image bei Abweichung. Dual-Mode |

**Geänderte Files:**

| File | Änderung |
|---|---|
| `Dockerfile.sandbox` | `npm install -g @axe-core/playwright pixelmatch pngjs` hinzugefügt |

**Nicht implementiert (gegenüber Plan):**

| Geplant | Entscheidung |
|---|---|
| `suites/scope.js` | Gestrichen — Suite-Auswahl ist durch `progress.json` bereits determiniert, kein git-diff nötig |
| `visual-audit.js` Refactor | Verschoben — screenshot.js steht bereit, Refactor wenn nötig |

**Design-Entscheidungen während Implementierung:**

- **Dual-Mode** eingeführt: Keine `thresholds` in Config → informational (immer PASS). `thresholds` gesetzt → enforced (kann FAILen). Gilt für a11y, perf, bundle, visual-reg
- **Baselines extern erstellt:** Prism (oder manuell) legt HTML-Preview ab → screenshot.js macht PNG → visual-reg vergleicht. Keine Baseline → SKIP
- **Alle Phase-2-Suites `critical: false`** — blockieren nie den Subagent-Spawn, auch im Enforced-Mode

**Definition of Done Phase 2:**

- [x] axe-core Suite erkennt WCAG-Violations und gibt Verdict-JSON
- [x] Lighthouse Suite prüft Scores (informational oder enforced)
- [x] Bundle-Size Suite misst Build-Output mit Top-5 größte Files
- [x] Visual-Regression Suite vergleicht Screenshots gegen Baselines
- [x] screenshot.js als Shared-Utility mit CLI für Baseline-Erstellung
- [x] Dual-Mode (informational/enforced) für alle Phase-2-Suites
- [x] Dockerfile.sandbox: Phase-2-Dependencies installiert
- [ ] Frontend-Module (14+) in progress.json haben `test_suites` konfiguriert
- [ ] Integration-Test auf Cluster

**Implementiert:** 2026-03-18 — Referenzdokumentation: `docs/buster-test-platform-reference-v2.md`

**Geschätzter Aufwand:** ~450 Zeilen → **Tatsächlich: 1010 Zeilen** (Dual-Mode-Logik, CLI in screenshot.js, Size-Mismatch-Handling in visual-reg umfangreicher als geschätzt)

---

### Phase 3: API + E2E Test Framework ✅

**Ziel:** Strukturierte API-Tests und E2E-Tests. Deterministisch wo möglich, LLM für komplexe Cases.

**Neue Files:**

| File | Ort | Zeilen | Beschreibung |
|---|---|---|---|
| `suites/api.js` | `skills/buster/suites/` | 528 | JSON-Spec HTTP/WS Test-Runner. Liest `test-spec.json`, feuert Requests, vergleicht Responses. Auth-Setup, Template-Variablen ({{token}}), WebSocket-Support (protocol: ws). Dual-Mode |
| `suites/e2e.js` | `skills/buster/suites/` | 318 | Playwright-Test-Runner. Entdeckt Test-Scripts in `.swarm/modules/<module>/tests/` (*.spec.js, *.spec.ts, *.test.js, *.test.ts, *.test.mjs), führt sie via `npx playwright test` aus. Dual-Mode |
| `test-spec-example.json` | `examples/` | 127 | Kommentiertes Beispiel-Template für test-spec.json mit allen Feldern und Varianten |

**Design-Entscheidungen:**

| Entscheidung | Ergebnis |
|---|---|
| API-Test-Spec-Format | **JSON-Spec** (`test-spec.json`). Deterministisch, kein LLM. Keine Spec → SKIP |
| E2E-Test-Caching | Buster-Subagent schreibt Tests nach `.swarm/modules/<module>/tests/`. e2e.js entdeckt + führt sie aus. Selbstkorrigierender Loop |
| WebSocket-Testing | In `api.js` integriert via `protocol: "ws"`. Kein separater Helper |
| Wer schreibt E2E-Tests? | Buster-Subagent. Broken Tests → FAIL Verdict → Subagent fixt beim nächsten Zyklus |
| Wer schreibt test-spec.json? | Manuell oder von Pipeline/Prism erstellt. Analog zu Baselines bei visual-reg |

**Definition of Done Phase 3:**

- [x] API-Suite führt HTTP-Tests gegen JSON-Spec aus
- [x] API-Suite unterstützt Auth-Setup mit Token-Injection
- [x] API-Suite unterstützt WebSocket-Tests (protocol: ws)
- [x] E2E-Suite entdeckt Playwright-Test-Files automatisch
- [x] E2E-Suite führt existierende Tests aus und parsed Output
- [x] Beide Suites: Dual-Mode (informational/enforced)
- [x] Beide Suites: critical: false (blockieren nie Subagent)
- [x] Beispiel-Template in examples/
- [ ] Backend-Module in progress.json haben api/e2e konfiguriert
- [ ] Integration-Test auf Cluster

**Implementiert:** 2026-03-18 — Referenzdokumentation: `docs/buster-test-platform-reference-v2.md`

**Geschätzter Aufwand:** ~600-900 Zeilen → **Tatsächlich: ~973 Zeilen** (api.js 528 + e2e.js 318 + template 127)

---

### Phase 4: Security + Unit ✅ (partial) + Chaos + Advanced (offen)

**Ziel:** Maximaler Buster-Impact. Security Audits, Unit-Test-Runner, Chaos-Testing, Exploratory Testing.

**Neue Files (implementiert):**

| File | Ort | Zeilen | Beschreibung |
|---|---|---|---|
| `suites/security.js` | `skills/buster/suites/` | 372 | Response-Header-Audit: HSTS (inkl. max-age Check), CSP (weak-Policy-Erkennung), X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy, Cookie-Flags (HttpOnly/Secure/SameSite), CORS-Wildcard-Check. Multiple Paths konfigurierbar. Dual-Mode |
| `suites/unit.js` | `skills/buster/suites/` | 345 | `npm test` Runner. Erkennt npm-Default-Stub → SKIP. Parst Jest, Vitest, Mocha, TAP Output zu strukturierten Results. Failure-Detail-Extraktion. Dual-Mode |

**Design-Entscheidungen:**

| Entscheidung | Ergebnis |
|---|---|
| Security: Welche Header? | HSTS, CSP, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy — deckt OWASP Secure Headers ab |
| Security: Cookie-Prüfung | Automatisch für alle Set-Cookie Headers: HttpOnly, Secure, SameSite |
| Security: CORS | `check_cors: true` (Default) — warnt bei `Access-Control-Allow-Origin: *` |
| Unit: Welche Frameworks? | Jest, Vitest, Mocha, TAP — Fallback auf Exit-Code für unbekannte Frameworks |
| Unit: Kein Test-Script? | npm-Default-Stub ("no test specified") → SKIP, nicht ERROR |
| Beide Suites | `critical: false` — blockieren nie den Subagent-Spawn |

**LLM-gesteuerte Features → verschoben nach Phase 5:**

| Feature | Status | Begründung |
|---|---|---|
| Chaos Testing | ⏳ verschoben | Prompt-Anpassung, braucht laufendes System zum Tunen |
| Error Triage | ⏳ verschoben | Prompt-Anpassung, iterativ bei laufendem System |
| Exploratory Testing | ⏳ verschoben | Prompt-Anpassung, Gate-spezifisch |
| Visual Audit Interpretation | ⏳ verschoben | Prompt-Anpassung, abhängig von screenshot.js Refactor |

**Gate-Level Konfiguration (für verschobene LLM-Features):**
```json
{
  "gates": {
    "final-buster": {
      "test_suites": ["build", "health", "a11y", "perf", "security", "visual-reg"],
      "chaos_enabled": true,
      "exploratory_enabled": true
    }
  }
}
```

**Definition of Done Phase 4:**

- [x] Security-Suite prüft Response-Headers (HSTS, CSP, X-Frame, X-Content-Type, X-XSS, Referrer-Policy)
- [x] Security-Suite prüft Cookie-Flags (HttpOnly, Secure, SameSite)
- [x] Security-Suite prüft CORS (Wildcard-Check)
- [x] Security-Suite: Multiple Paths konfigurierbar
- [x] Unit-Suite führt `npm test` aus
- [x] Unit-Suite erkennt npm-Default-Stub → SKIP
- [x] Unit-Suite parst Jest, Vitest, Mocha, TAP Output
- [x] Beide Suites: Dual-Mode (informational/enforced)
- [ ] Chaos-Testing-Anweisungen im Gate-Prompt (→ Phase 5)
- [ ] Exploratory-Testing-Modus für finale Gates (→ Phase 5)
- [ ] Error-Triage: Strukturierte Failure-Summaries (→ Phase 5)
- [ ] Integration-Test auf Cluster

**Implementiert (Suites):** 2026-03-18

**Geschätzter Aufwand:** ~400-600 Zeilen → **Tatsächlich: 717 Zeilen** (security.js 372 + unit.js 345). LLM-Features ausstehend.

---

### Phase 5: Skills, Templates und Konventionen ✅ (partial)

**Ziel:** Buster (und später Forge) bekommt standardisierte Templates und Konventionen, damit der Subagent nicht jedes Mal von Null anfängt und Tokens für repetitives Boilerplate verbrennt.

**Neue Files (implementiert):**

| File | Ort | Zeilen | Beschreibung |
|---|---|---|---|
| `CONVENTIONS.md` | `skills/buster/` | 114 | Konventionen: Output-Format, Naming, Timeouts, Error-Reporting, Exit-Codes, Workflow |
| `PIPELINE-CONFIG-REFERENCE.md` | `docs/` | 466 | Pipeline-Konfigurationsreferenz: progress.json, swarm.config.json, .semgrep.yml |
| `BUSTER-CONFIG-REFERENCE.md` | `docs/` | 521 | Buster-Test-Konfigurationsreferenz: test_suites, test_config, Dual-Mode |

**Gestrichen:**

| Item | Begründung |
|---|---|
| Templates (playwright-e2e.js, k6-load.js, api-test.js, ws-test.js) | LLMs brauchen kein Boilerplate — sie schreiben Tests besser von Null. Templates verleiten zum oberflächlichen Kopieren statt modulspezifischem Nachdenken. Die Konventionen in CONVENTIONS.md (Output-Format, Naming, Timeouts) sind was zählt |

**Noch offen:**

| Item | Status | Beschreibung |
|---|---|---|
| LLM-Feature Prompt-Blöcke | ⏳ | Chaos, Triage, Exploratory — Änderungen in buster-orchestrator.js |
| visual-audit.js Refactor | ⏳ | Optional — screenshot.js steht bereit |
| Forge-Konventionen | ⏳ | Separates Projekt (§7.6) |

**Definition of Done Phase 5:**

- [x] Konventionen dokumentiert (CONVENTIONS.md)
- [x] Config-Referenzdokumentation erstellt (Pipeline + Buster)
- [x] Templates evaluiert und bewusst gestrichen (LLMs brauchen kein Boilerplate)
- [ ] Subagent-Prompts referenzieren CONVENTIONS.md (buster-values.yaml TOOLS.md Update)
- [ ] LLM-Feature Prompt-Blöcke (Chaos, Triage, Exploratory)
- [ ] visual-audit.js Refactor

**Implementiert (Konventionen + Doku):** 2026-03-18

**Geschätzter Aufwand:** ~500 Zeilen → **Tatsächlich: 1101 Zeilen** (CONVENTIONS 114 + Config-Referenzen 987). Templates gestrichen

---

## 5. Determinismus vs LLM — Vollständige Übersicht

### Deterministisch (Suite-Runner, kein LLM, kein Token-Verbrauch)

| Suite | Tool | Was es prüft |
|---|---|---|
| `build` | sandbox-build / sandbox-run | Kompiliert der Code? |
| `health` | fetch/curl | Startet der Server? Antwortet er? |
| `a11y` | @axe-core/playwright | WCAG-Violations |
| `perf` | Lighthouse CLI | Performance-Score gegen Thresholds |
| `bundle` | du / fs.stat | Build-Output-Grösse gegen Threshold |
| `security` | fetch + Header-Parsing | HSTS, CSP, Cookie-Flags, CORS |
| `visual-reg` | Playwright + pixelmatch | Screenshot vs Baseline Pixel-Diff |
| `api` | fetch | HTTP-Requests gegen Spec (Status-Codes, Response-Format) |
| `e2e` | Playwright Test Runner | Vorhandene Test-Scripts ausführen |
| `unit` | npm test | Vorhandene Unit-Tests ausführen |

### LLM (Buster-Subagent)

| Task | Warum LLM nötig |
|---|---|
| Modul-spezifische Tests (BUSTER.md) | Natürliche Sprache → Test-Strategie |
| Testscripts schreiben | BUSTER.md beschreibt WAS, Subagent schreibt WIE |
| Chaos/Edge-Case Testing | Kreativität: "Was könnte schiefgehen?" |
| Visual Audit Interpretation | "Sieht die UI korrekt aus?" (Vision-Fähigkeit) |
| Error Root Cause Analysis | 500 Zeilen stderr → eine Zeile Root Cause |
| Exploratory Testing | Frei navigieren, Bugs finden |
| Test-Strategie-Entscheidungen | "Welche Edge Cases sind am riskantesten?" |
| PASS/FAIL bei Grenzfällen | a11y Warning = blockierend oder akzeptabel? |

---

## 6. File-Struktur (Ziel)

```
skills/buster/
├── buster-orchestrator.js     # NEU Ph1 ✅ — Ersetzt Processor-Sidecar
├── suite-runner.js            # NEU Ph1 ✅ — Suite-Orchestrator
├── verdict-schema.js          # NEU Ph1 ✅ — Einheitliches Verdict-Schema
├── screenshot.js              # NEU Ph2 ✅ — Shared Screenshot-Utility + CLI
├── suites/                    # NEU — Einzelne Test-Suites
│   ├── build.js               #   Phase 1 ✅
│   ├── health.js              #   Phase 1 ✅
│   ├── a11y.js                #   Phase 2 ✅
│   ├── perf.js                #   Phase 2 ✅
│   ├── bundle.js              #   Phase 2 ✅
│   ├── visual-reg.js          #   Phase 2 ✅
│   ├── api.js                 #   Phase 3 ✅
│   ├── e2e.js                 #   Phase 3 ✅
│   ├── security.js            #   Phase 4 ✅
│   └── unit.js                #   Phase 4 ✅
├── CONVENTIONS.md             # NEU Phase 5 ✅ — Subagent-Konventionen
├── redis.js                   # Bestehend — keine Änderung
├── verify-task.js             # Bestehend — keine Änderung
└── visual-audit.js            # Bestehend — Refactor ausstehend (screenshot.js bereit)
```

---

## 7. Offene Punkte

### 7.1 Unit Tests — Wer schreibt sie?

**Status:** Nicht definiert. Aktuell schreibt kein Agent persistente Unit-Tests die im Applikationscode leben.

**Optionen:**

| Option | Pro | Contra |
|---|---|---|
| **A: Forge schreibt Unit-Tests** als Teil des Moduls | Tests leben im Code, laufen bei jedem Build. Buster prüft nur ob sie bestehen (`npm test`). Sauberste Trennung | Forge-Prompts werden komplexer. FORGE.md muss Test-Specs definieren |
| **B: Buster schreibt persistente Tests** im Applikationscode | Buster versteht Failure-Modes besser | verify-task.js blockiert Schreiben ausserhalb `.swarm/`. Scope-Firewall müsste aufgeweicht werden |
| **C: Keine Unit-Tests** — nur Integration/E2E/Runtime | Einfach. Klare Trennung | Keine Code-Level Test-Coverage |

**Empfehlung:** Option A. `unit.js` (Phase 4 ✅) ist bereit und parst bereits Jest, Vitest, Mocha, TAP Output.

**Konkrete Aktion (vor Pipeline-Start):**
- Forge-Prompt (FORGE.md) muss für Frontend-Module (14-18) Vitest als Test-Framework vorgeben: `"test": "vitest run"` in `package.json`, Component-Tests in `src/**/*.test.tsx`
- Forge-Prompt muss für Backend-Module (01-13) ein Test-Framework vorgeben (Jest oder Vitest): Unit-Tests für API-Handler, Middleware, Utils
- Buster's `unit.js` führt `npm test` aus → Framework-agnostisch, alles was `npm test` startet wird unterstützt
- Dies ist ein **Forge-Scope-Thema**, nicht Buster. Separates Projekt (siehe §7.6)

### 7.2 API-Test-Spec-Format ✅ ENTSCHIEDEN

**JSON-Spec** (`test-spec.json`). Dedizierte Spec-Datei pro Modul in `.swarm/<module>/test-spec.json`. Referenziert von `progress.json` via `test_config.api.spec_file`. Deterministisch, kein LLM. Keine Spec → SKIP. Beispiel-Template: `examples/test-spec-example.json`.

WebSocket-Tests integriert via `protocol: "ws"` im gleichen Spec-Format. E2E-Tests über separates e2e.js mit Test-Discovery in `.swarm/modules/<module>/tests/`.

### 7.3 Visual-Regression Baselines ✅ ENTSCHIEDEN

Baselines werden **extern erstellt, bevor Forge das Modul baut**:

1. Prism (oder manuell) legt `baseline.html` in `.swarm/modules/<module>/baselines/`
2. `screenshot.js` erstellt daraus `baseline.png`: `node screenshot.js baseline.html baseline.png`
3. Baseline existiert als Design-Spezifikation, nicht als Snapshot vom letzten Run
4. Keine Baseline vorhanden → Suite wird SKIP (nicht auto-create)

### 7.4 Processor für Nova

Nova's Processor-Sidecar bleibt unverändert. Nur Buster's Processor wird durch den Orchestrator ersetzt.

### 7.5 Rollback-Strategie

`buster-processor.cjs` bleibt als File im Repo. Falls der Orchestrator Probleme macht:

1. `buster-values.yaml`: `gateway.command` entfernen (zurück auf Default)
2. `processor.enabled: true` setzen
3. Helm Upgrade → zurück zum alten Sidecar-Pattern

### 7.6 Forge-Konventionen und Templates

Analog zu Phase 5 für Buster sollten auch für Forge Konventionen und Templates erstellt werden. Das ist ein separates Projekt und nicht Teil dieses Plans.

### 7.7 Config-Referenzdokumentation ✅ ERSTELLT

**Datei:** `docs/BUSTER-CONFIG-REFERENCE.md` (521 Zeilen)

Vollständige Referenz aller Konfigurationsmöglichkeiten. Dient als Nachschlagewerk und als Nova-Skill-Dokument. Enthält:
- Alle `test_config`-Felder pro Suite mit Defaults, Typen, Beispielen
- Entscheidungshilfe pro Modultyp (Backend, Frontend, WebSocket, Gate)
- Dual-Mode-Erklärung, externe Artefakte, Datenfluss-Diagramm, FAQ

### 7.8 E2E-Test-Vertrauensproblem und mögliche E2E-Spec (Phase 5)

**Status:** Offen — Known Limitation in Phase 3, mögliche Erweiterung in Phase 5

**Problem:** Der Buster-Subagent schreibt Playwright-Tests UND bildet sein Verdict darauf. Wenn die Tests falsch geschrieben sind (falscher Selektor, Assert auf falschen Wert, Test prüft nicht was er soll), meldet Buster trotzdem PASS. Dieses falsche PASS geht an die Pipeline. `e2e.js` erkennt das Problem frühestens ab dem zweiten Run — aber im ersten Durchlauf ist der Schaden bereits passiert.

**Warum das für API-Tests kein Problem ist:** `test-spec.json` wird vorab definiert (TDD: Contract zuerst, Code danach). `api.js` führt sie deterministisch aus, kein LLM involviert, kein Vertrauensproblem.

**Warum E2E-Tests anders sind:** Playwright braucht Selektoren, DOM-Struktur, Routing — Dinge die erst nach Forge's Arbeit existieren. Aber es gibt zwei Ebenen:

- **Contract-Level** (geht ohne Code): Route `/dashboard` existiert und rendert, Klick auf Logout leitet nach `/login`, Navigation funktioniert
- **Implementation-Level** (braucht Code): Button `.btn-deploy` öffnet Modal, Tabelle zeigt korrekt sortierten Data

**Mögliche Lösung (Phase 5):** Ein deklaratives **E2E-Spec-Format** (analog zu test-spec.json) für Contract-Level-Tests. Nova definiert vorab: "Route X existiert, enthält Text Y, Link Z führt zu Seite W." Ein Runner führt das deterministisch aus. Der Subagent ergänzt dann nur noch Implementation-Level-Tests und Edge-Cases.

**Aktuelle Mitigation:** Die deterministischen Suites (build, health, api-spec, a11y, perf, bundle, visual-reg) decken den Großteil der vertrauenswürdigen Prüfungen ab. E2E ist Restrisiko — akzeptabel, weil der Subagent schon immer die Runtime-Tests gemacht hat. `e2e.js` verbessert die Situation ab Run 2 durch den selbstkorrigierenden Loop.

---

## 8. Implementierungs-Reihenfolge (Phase 1 Detail)

```
Schritt 1:  ✅ Verdict-Schema definieren
            → verdict-schema.js (221 Zeilen)
            → STATUS, SEVERITY, RECOMMENDATION Konstanten
            → Factory-Funktionen: createSuiteVerdict, createFinding, createRunnerVerdict
            → truncateForPrompt() für Prompt-Injection
            → Vereinfacht: SPAWN_CLEAN/SPAWN_WITH_RESULTS → ein einziges SPAWN

Schritt 2:  ✅ suite-runner.js Grundgerüst
            → suite-runner.js (298 Zeilen)
            → Suite-Loading aus ./suites/<n>.js
            → Sequentielle Ausführung mit Abhängigkeits-Chain
            → Aggregation via createRunnerVerdict()
            → Result-Persistenz: /sandbox/results/ + .swarm/modules/<module>/test-results/
            → CLI: node suite-runner.js --module 06 --project kubecommand
              --suites build,health --config '{"serve":{"type":"static"}}'

Schritt 3:  ✅ suites/build.js
            → suites/build.js (256 Zeilen)
            → Static: sandbox-build + nginx (NICHT sandbox-serve — würde Output löschen)
            → Server: sandbox-run + 3s Crash-Detection
            → TypeScript/npm/Generic Fehler-Parsing → strukturierte Findings
            → Max 20 Findings

Schritt 4:  ✅ suites/health.js
            → suites/health.js (159 Zeilen)
            → fetch mit AbortController-Timeout
            → 3x Retry mit exponential Backoff (1s, 2s, 4s)
            → PASS bei 2xx, FAIL bei allem anderen

Schritt 5:  ✅ buster-orchestrator.js
            → buster-orchestrator.js (709 Zeilen)
            → Feature-Parity mit Processor v7 + neue Features
            → Gateway-Readiness-Check (120s), Health-Monitor (60s)
            → processTask(): cleanup → git → suites → decision → spawn/fail
            → Prompt-Anreicherung mit Verdict-JSON
            → Timeout-Kalkulation (Gesamt - Suite-Zeit - 60s Buffer, min 300s)
            → Suite-Results Discord-Embeds
            → SIGTERM-Handler (Graceful Shutdown)

Schritt 6:  ✅ buster-values.yaml anpassen
            → processor.enabled: false
            → gateway.command: Dual-Process-Start (Orchestrator + Gateway)
            → Soul: "App bereits gebaut/serviert"
            → Agents: Subagent-Workflow aktualisiert

Schritt 7:  ✅ pipeline.js minimal erweitern
            → 2 Zeilen in buildBusterPayload():
              test_suites: mod?.test_suites || null,
              test_config: mod?.test_config || null,

Schritt 8:  ✅ Dockerfile.sandbox — keine Änderung nötig
            → COPY skills/buster/ /app/skills/ kopiert automatisch
              alle neuen Files inkl. suites/ Subdirectory

Schritt 9:  ⏳ Integration-Test (manuell auf Cluster)
            → Redis-Message senden → Orchestrator empfängt
            → Suite-Runner läuft (build + health)
            → Bei PASS: Subagent mit enriched Prompt
            → Bei FAIL: direkt FAIL an Completion-Stream
            → Discord-Notifications korrekt
```
