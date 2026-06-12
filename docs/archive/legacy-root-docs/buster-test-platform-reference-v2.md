# Buster Test Platform — Architektur- und Referenzdokumentation (v2.2)

**Status:** Phase 1 + Phase 2 + Phase 3 + Phase 4 (partial) + Phase 5 (partial) implementiert
**Datum:** 2026-03-18
**Ort:** Source `skills/buster/`; Docker kopiert den Inhalt nach `/app/skills/` (z.B. `skills/buster/pipeline/...` → `/app/skills/pipeline/...`)
**Companion:** `skills/nova/pipeline.ts` (dispatcht Tasks), `skills/buster/buster-pipeline.ts` (Buster Worker)

---

## Inhaltsverzeichnis

1. [Überblick und Designphilosophie](#1-überblick-und-designphilosophie)
2. [Architektur](#2-architektur)
3. [File-Übersicht](#3-file-übersicht)
4. [Verdict-Schema (pipeline/services/verdict-schema.ts)](#4-verdict-schema)
5. [Suite-Runner (pipeline/runners/suite-runner.ts)](#5-suite-runner)
6. [Suite: build (pipeline/suites/build.ts)](#6-suite-build)
7. [Suite: health (pipeline/suites/health.ts)](#7-suite-health)
8. [Suite: a11y (pipeline/suites/a11y.ts)](#8-suite-a11y)
9. [Suite: perf (pipeline/suites/perf.ts)](#9-suite-perf)
10. [Suite: bundle (pipeline/suites/bundle.ts)](#10-suite-bundle)
11. [Suite: visual-reg (pipeline/suites/visual-reg.ts)](#11-suite-visual-reg)
12. [Screenshot-Utility (pipeline/tools/screenshot.ts)](#12-screenshot-utility)
13. [Suite: api (pipeline/suites/api.ts)](#13-suite-api)
14. [Suite: e2e (pipeline/suites/e2e.ts)](#14-suite-e2e)
15. [Suite: security (pipeline/suites/security.ts)](#15-suite-security)
16. [Suite: unit (pipeline/suites/unit.ts)](#16-suite-unit)
17. [Dual-Mode: Informational vs Enforced](#17-dual-mode)
18. [Buster Pipeline (buster-pipeline.ts)](#18-buster-pipeline)
19. [Datenfluss und Payload-Struktur](#19-datenfluss-und-payload-struktur)
20. [Prompt-Anreicherung](#20-prompt-anreicherung)
21. [Konfiguration (progress.json)](#21-konfiguration)
22. [Deployment (buster-values.yaml)](#22-deployment)
23. [Pipeline-Integration (pipeline.ts)](#23-pipeline-integration)
24. [Discord-Benachrichtigungen](#24-discord-benachrichtigungen)
25. [Robustheit und Fehlerbehandlung](#25-robustheit-und-fehlerbehandlung)
26. [Rollback auf Processor-Sidecar](#26-rollback)
27. [CLI-Referenz](#27-cli-referenz)
28. [Changelog](#28-changelog)

---

## 1. Überblick und Designphilosophie

### Kernprinzip

**Alles was ohne LLM geprüft werden kann, wird ohne LLM geprüft.**

Die Buster Test Platform führt deterministische Test-Suites (Build, Health, a11y, Perf, ...) automatisch aus, BEVOR ein LLM-Subagent gespawnt wird. Bei kritischen Failures (z.B. Build schlägt fehl) wird kein Subagent gestartet — null Token-Verbrauch, direkt FAIL an die Pipeline.

### Vorher (Processor-Sidecar v7)

```
Redis-Task → Processor (256MB Sidecar) → git pull → Subagent spawnen → Subagent baut, testet, alles
```

Probleme:
- Processor hat keinen Zugriff auf Sandbox (separater Container, kein Podman, kein `/sandbox`)
- Alle deterministischen Checks mussten vom LLM-Subagent manuell ausgeführt werden
- Bei Build-Failure wurde trotzdem ein Subagent gespawnt (Token-Verschwendung)
- Prompt konnte nicht angereichert werden

### Nachher (Buster Pipeline v1)

```
Redis-Task → Buster Pipeline (im Gateway-Container, 16GB/4CPU)
           → git pull → sandbox-cleanup → Build + Serve
           → Suite-Runner (deterministisch, kein LLM)
           → Entscheidung:
               NO_SUBAGENT → direkt FAIL (0 Tokens)
               SPAWN → Prompt anreichern → Subagent bekommt Verdict-JSON + laufende App
```

### Design-Entscheidungen

| Entscheidung | Begründung |
|---|---|
| Buster Pipeline im Gateway-Container, nicht als Sidecar | Voller Zugriff auf Podman, Playwright, nginx, `/sandbox` |
| Suite-Output als JSON, nicht Markdown | Konsistent mit `output_file`, `progress.json` und den übrigen Maschinen-Artefakten. LLMs lesen JSON problemlos |
| Zwei Recommendations: `NO_SUBAGENT` / `SPAWN` | Einfach. Der Subagent bekommt immer das volle Verdict — ob Findings drin sind oder nicht |
| Suites als einzelne JS-Module | Erweiterbar: neue Suite = neues File in `pipeline/suites/`, fertig |
| Abhängigkeits-Chain im Runner | build FAIL → alles SKIP. Kein sinnloser Health-Check gegen eine App die nicht existiert |

---

## 2. Architektur

### Pod-Layout (nach Migration)

```
Buster Pod
┌─────────────────────────────────────────────────────────┐
│  Gateway Container (kubeclaw-sandbox)       [16GB/4CPU] │
│  ┌─ Podman, Playwright, k6, Chromium, nginx            │
│  ├─ /sandbox (www, results, scripts)                    │
│  ├─ /app/skills/ (alle Skills)                          │
│  │                                                       │
│  ├─ Process 1: node /app/skills/buster-pipeline.ts  │
│  │  └─ Redis-Poll → Suite-Runner → Conditional Spawn    │
│  │                                                       │
│  └─ Process 2: node /app/openclaw.mjs gateway           │
│     └─ OpenClaw Gateway auf :18789                      │
│                                                          │
│  Kein Processor-Sidecar mehr.                           │
└─────────────────────────────────────────────────────────┘
```

### Dual-Process-Start

Beide Prozesse werden in `buster-values.yaml` via `gateway.command` gestartet. `wait -n` sorgt dafür, dass wenn einer der Prozesse stirbt, beide beendet werden → Kubernetes Restart-Policy startet den Pod neu.

### Task-Flow pro Modul

```
pipeline.ts (Nova)                  buster-pipeline.ts (Buster)
      │                                      │
      ├─ buildBusterPayload()                │
      │  (inkl. test_suites, test_config)    │
      │                                      │
      ├──── Redis XADD ─────────────────────▶│
      │                                      ├─ 0. sandbox-cleanup
      │                                      ├─ 1. git pull --rebase
      │                                      ├─ 2. Prompt als File speichern
      │                                      ├─ 3. pipeline/runners/suite-runner.ts
      │                                      │     ├─ build.ts (Build + Serve)
      │                                      │     └─ health.ts (HTTP Check)
      │                                      │
      │                                      ├─ 4. Entscheidung
      │                                      │     ├─ NO_SUBAGENT → FAIL an Stream
      │                                      │     └─ SPAWN →
      │                                      │         ├─ Prompt anreichern
      │                                      │         ├─ Timeout berechnen
      │                                      │         ├─ ACP Session spawnen
      │                                      │         └─ Completion-Stream monitoren
      │                                      │
      │◀── Redis Completion ─────────────────┤
      │                                      ├─ 5. Kill Session
      │                                      └─ 6. sandbox-cleanup + ACK
```

---

## 3. File-Übersicht

### Neue Files (Phase 1)

| File | Zeilen | Beschreibung |
|---|---|---|
| `pipeline/services/verdict-schema.ts` | 221 | Konstanten, Factory-Funktionen für Suite- und Runner-Verdicts, Truncation-Helper |
| `pipeline/runners/suite-runner.ts` | 298 | Suite-Orchestrator. Lädt Suites, führt sie sequentiell aus, respektiert Abhängigkeiten, aggregiert |
| `pipeline/suites/build.ts` | 256 | Build + Serve. Static (sandbox-build + nginx) oder Server (sandbox-run). Fehler-Parsing |
| `pipeline/suites/health.ts` | 159 | HTTP Health-Check. Fetch mit Retry + exponential Backoff |
| `buster-pipeline.ts` | 709 | Ersetzt Processor-Sidecar. Redis-Poll → Suites → Conditional Spawn → Monitor |

### Neue Files (Phase 2)

| File | Zeilen | Beschreibung |
|---|---|---|
| `pipeline/tools/screenshot.ts` | 171 | Shared Playwright-Screenshot-Utility. Akzeptiert URLs und lokale HTML-Dateien. CLI für Baseline-Erstellung |
| `pipeline/suites/a11y.ts` | 203 | Accessibility-Scan via @axe-core/playwright. WCAG-Violations als Findings |
| `pipeline/suites/perf.ts` | 202 | Lighthouse CLI Performance-Audit. Scores gegen konfigurierbare Thresholds |
| `pipeline/suites/bundle.ts` | 174 | Build-Output-Größe messen. Dateianzahl, Top-5 größte Files |
| `pipeline/suites/visual-reg.ts` | 259 | Screenshot-Diff gegen Baseline via pixelmatch. Diff-Image bei Abweichung |

### Geänderte Files (Phase 1)

| File | Änderung |
|---|---|
| `my-values/buster-values.yaml` | `gateway.command` (Dual-Process), Soul/Agents aktualisiert |
| `skills/nova/pipeline.ts` | 2 Zeilen: `test_suites` + `test_config` in `buildBusterPayload()` |

### Geänderte Files (Phase 2)

| File | Änderung |
|---|---|
| `docker/Dockerfile.sandbox` | `npm install -g @axe-core/playwright pixelmatch pngjs` hinzugefügt |

### Neue Files (Phase 3)

| File | Zeilen | Beschreibung |
|---|---|---|
| `pipeline/suites/api.ts` | 528 | JSON-Spec HTTP/WS Test-Runner. Auth-Setup, Template-Variablen, WebSocket-Support |
| `pipeline/suites/e2e.ts` | 318 | Playwright-Test-Discovery + Runner. Tests aus `.swarm/modules/<module>/tests/` |
| `examples/test-spec-example.json` | 127 | Kommentiertes Beispiel-Template für test-spec.json |

### Neue Files (Phase 4)

| File | Zeilen | Beschreibung |
|---|---|---|
| `pipeline/suites/security.ts` | 372 | HTTP-Response-Header-Audit: HSTS, CSP, X-Frame, XCTO, XSS, Referrer, Cookies, CORS |
| `pipeline/suites/unit.ts` | 345 | `npm test` Runner mit Jest/Vitest/Mocha/TAP Output-Parsing |

### Neue Files (Phase 5)

| File | Zeilen | Beschreibung |
|---|---|---|
| `CONVENTIONS.md` | 114 | Output-Format, Naming, Timeouts, Error-Reporting, Exit-Codes für Buster-Subagent |
| `docs/BUSTER-CONFIG-REFERENCE.md` | ~520 | Vollständige Referenz aller Suite-Config-Felder, Defaults, Dual-Mode, Gate-Config |
| `docs/PIPELINE-CONFIG-REFERENCE.md` | ~470 | Referenz für progress.json, swarm.config.json, .semgrep.yml |

### Unveränderte Files

| File | Warum |
|---|---|
| `pipeline/tools/redis.ts` | Redis CLI/communication helper moved under `pipeline/tools/` |
| `pipeline/tools/verify-task.ts` | Keine Änderung nötig |
| `pipeline/tools/visual-audit.ts` | Native TypeScript visual audit CLI/tool |
| `templates/deployment.yaml` | Legacy Processor Sidecar entfernt; Gateway-Container startet Buster Pipeline direkt |

---

## 4. Verdict-Schema

**Datei:** `pipeline/services/verdict-schema.ts` (224 Zeilen)
**Zweck:** Einheitliches Datenformat für alle Test-Suite-Ergebnisse

### Konstanten

```js
const STATUS = { PASS, FAIL, SKIP, ERROR }

const SEVERITY = { CRITICAL, SERIOUS, MODERATE, MINOR }

const RECOMMENDATION = { NO_SUBAGENT, SPAWN }
```

### Suite-Verdict (Einzelne Suite)

Jede Suite gibt dieses Format zurück (via `createSuiteVerdict()`):

```json
{
  "suite": "build",
  "status": "FAIL",
  "critical": true,
  "duration_ms": 1800,
  "checks_total": 1,
  "checks_passed": 0,
  "checks_failed": 1,
  "findings": [
    {
      "severity": "critical",
      "message": "tsc: 3 errors in handler.ts",
      "rule": "tsc",
      "element": null,
      "file": "src/handler.ts",
      "line": 12
    }
  ],
  "metadata": {
    "tool": "sandbox-build",
    "serve_type": "static"
  }
}
```

### Runner-Verdict (Aggregiert)

`pipeline/runners/suite-runner.ts` aggregiert alle Suites (via `createRunnerVerdict()`):

```json
{
  "run_id": "buster-test-06-1710756000",
  "module": "06",
  "project": "kubecommand",
  "timestamp": "2026-03-18T12:00:00Z",
  "overall_status": "FAIL",
  "critical_failure": true,
  "duration_ms": 1800,
  "suites": {
    "build": { "suite": "build", "status": "FAIL", "critical": true, "..." : "..." },
    "health": { "suite": "health", "status": "SKIP", "reason": "build failed" }
  },
  "summary": "build: tsc: 3 errors in handler.ts (1 suite skipped) [CRITICAL]",
  "recommendation": "NO_SUBAGENT"
}
```

### Recommendation-Logik

| Bedingung | Recommendation | Aktion |
|---|---|---|
| Irgendeine Suite mit `critical: true` ist `FAIL` oder `ERROR` | `NO_SUBAGENT` | Direkt FAIL an Pipeline. Kein Subagent, 0 Tokens |
| Alles andere (Alle PASS, non-critical FAIL, SKIP) | `SPAWN` | Subagent bekommt Verdict-JSON + laufende App |

### Exports

```js
module.exports = {
  STATUS,           // { PASS, FAIL, SKIP, ERROR }
  SEVERITY,         // { CRITICAL, SERIOUS, MODERATE, MINOR }
  RECOMMENDATION,   // { NO_SUBAGENT, SPAWN }
  createSuiteVerdict(suite, status, opts),
  createFinding(severity, message, opts),
  createRunnerVerdict(module, project, suiteResults),
  truncateForPrompt(runnerVerdict, maxFindings),
}
```

### truncateForPrompt()

Für die Prompt-Injection: Limitiert Findings pro Suite auf `maxFindings` (Default 5). Überzählige Findings werden durch einen Hinweis auf die vollständige Datei ersetzt:

```json
{ "severity": "info", "message": "9 more findings in /sandbox/results/a11y-verdict.json" }
```

---

## 5. Suite-Runner

**Datei:** `pipeline/runners/suite-runner.ts` (298 Zeilen)
**Zweck:** Suites laden, sequentiell ausführen, Ergebnisse aggregieren

### Interface

```js
// Modul-Interface (von der Buster Pipeline aufgerufen)
import { runSuites } from './pipeline/runners/suite-runner.ts';
const verdict = await runSuites(['build', 'health'], {
  moduleId: '06',
  payload: {
    project: 'kubecommand',
    test_config: { serve: { type: 'static' } },
  },
  logDir: '/path/to/.swarm/logs/buster/module-06',
});

// Kein eigenes CLI: direkte Nutzung über Import-Harness oder über buster-pipeline.ts.
```

### Suite-Vertrag

Jede Suite-Datei in `pipeline/suites/<name>.ts` muss exportieren:

```ts
export default async function suiteName(context): Promise<SuiteVerdict>
```

Das `context`-Objekt enthält:

```js
{
  module: '06',            // Modul-ID
  project: 'kubecommand',  // Projekt-Name
  config: { serve: {...}, perf: {...} },  // Test-Config aus progress.json
  resultsDir: '/sandbox/results',
}
```

### Execution Order und Abhängigkeiten

Feste Reihenfolge:

```
build → health → [a11y, perf, bundle, security, visual-reg, api, e2e, unit]
```

Abhängigkeits-Chain:

| Suite | Hängt ab von |
|---|---|
| `build` | (keine) |
| `health` | build |
| `a11y`, `perf`, `security`, `visual-reg`, `api`, `e2e` | build + health |
| `bundle`, `unit` | build |

Wenn eine Dependency `FAIL` (critical) oder `ERROR` ist → Suite wird `SKIP` mit Reason.

### Fehlerbehandlung

Suite crasht (wirft Exception) → wird als `ERROR`-Verdict aufgefangen mit `critical: true` für build/health, `critical: false` für andere.

### Result-Persistenz

Ergebnisse werden an zwei Orten geschrieben:

| Ort | Zweck | Lebensdauer |
|---|---|---|
| `/sandbox/results/` | Subagent-Zugriff | Bis Task-Ende (Cleanup) |
| `.swarm/modules/<module>/test-results/` | Git-Persistenz | Permanent |

Geschriebene Files: `runner-verdict.json`, `<suite>-verdict.json` pro Suite.

### Exit-Codes (CLI)

| Code | Bedeutung |
|---|---|
| 0 | PASS oder SPAWN |
| 1 | Critical Failure (NO_SUBAGENT) |
| 2 | ERROR oder ungültige Argumente |

---

## 6. Suite: build

**Datei:** `pipeline/suites/build.ts` (257 Zeilen)
**Zweck:** Projekt kompilieren + App starten (serven)

### Zwei Modi

| Modus | Trigger | Was passiert |
|---|---|---|
| `static` | `config.serve.type === 'static'` (Default) | `sandbox-build` → Output in `/sandbox/www/` → nginx starten auf `:9999` |
| `server` | `config.serve.type === 'server'` | `sandbox-run` mit `start_cmd` → App auf konfiguriertem Port → 3s Crash-Detection |

### Konfiguration (aus `context.config.serve`)

```json
// Static (Default)
{ "type": "static", "build_cmd": "npm run build", "image": "node:20-slim" }

// Server
{ "type": "server", "start_cmd": "npm start", "port": 3000, "image": "node:20-slim" }
```

### Defaults

| Parameter | Default |
|---|---|
| `type` | `static` |
| `image` | `node:20-slim` |
| `build_cmd` | `npm run build` |
| `start_cmd` | `npm start` |
| `port` | `3000` (Server) |
| `timeout` | `300s` |

### Fehler-Parsing

build.ts parsed stderr/stdout für strukturierte Findings:

| Pattern | Wird erkannt als |
|---|---|
| `src/file.ts(12,5): error TS2307: ...` | TypeScript Error (Rule, File, Line) |
| `ERROR: ...` / `Error: ...` | Generic Error |
| `npm ERR! ...` | npm Error |
| (kein Pattern) | Roher Output als Fallback |

Findings werden auf max 20 gekappt.

### Wichtig: nginx statt sandbox-serve

Nach `sandbox-build` wird nginx direkt gestartet — NICHT `sandbox-serve`. Grund: `sandbox-serve` führt `rm -rf /sandbox/www/*` aus, bevor es kopiert, und würde den Build-Output löschen.

### Metadata bei Erfolg

```json
{ "tool": "sandbox-build", "serve_type": "static", "output_size": "2.1M" }
```

---

## 7. Suite: health

**Datei:** `pipeline/suites/health.ts` (159 Zeilen)
**Zweck:** HTTP Health-Check gegen die laufende App

### Verhalten

1. Bestimmt URL aus Config: `http://localhost:<port><health_path>`
2. Fetch mit AbortController-Timeout
3. Bei Fehler: Retry mit exponential Backoff
4. PASS wenn HTTP 2xx, FAIL bei allem anderen

### Konfiguration

| Parameter | Default static | Default server |
|---|---|---|
| `port` | `9999` | `3000` |
| `health_path` | `/` | `/` |
| `health_retries` | `3` | `3` |
| `health_base_delay` | `1000ms` | `1000ms` |
| `health_timeout` | `10000ms` | `10000ms` |

### Retry-Schema

```
Attempt 1: sofort
Attempt 2: nach 1000ms
Attempt 3: nach 2000ms
(exponential: base_delay * 2^(attempt-1))
```

### Metadata bei Erfolg

```json
{
  "url": "http://localhost:9999/",
  "status_code": 200,
  "response_time_ms": 45,
  "attempts": 1
}
```

### Metadata bei Fehler

```json
{
  "url": "http://localhost:9999/",
  "status_code": null,
  "response_time_ms": 10032,
  "attempts": 3,
  "last_error": "Timeout after 10000ms"
}
```

---

## 8. Suite: a11y

**Datei:** `pipeline/suites/a11y.ts` (203 Zeilen)
**Zweck:** Accessibility-Scan via @axe-core/playwright
**Dependencies:** build + health
**Requires:** `@axe-core/playwright` (Dockerfile.sandbox)

### Verhalten

1. Playwright-Browser launchen, zur App navigieren
2. `AxeBuilder` mit konfigurierbaren WCAG-Tags ausführen
3. Violations in Findings mappen (axe Impact → SEVERITY ist 1:1)
4. Ein Finding pro betroffenem Element (nicht pro Rule)
5. Cap auf 50 Findings

### Konfiguration (aus `context.config.a11y`)

```json
// Informational (Default)
{ "tags": ["wcag2a", "wcag2aa"], "exclude": [".cookie-banner"] }

// Enforced (Gate-Test)
{ "tags": ["wcag2a", "wcag2aa"], "thresholds": { "critical": 0, "serious": 0 } }
```

| Parameter | Default |
|---|---|
| `tags` | `['wcag2a', 'wcag2aa']` |
| `exclude` | `[]` |
| `max_findings` | `50` |
| `timeout` | `15000ms` |

### Impact-Mapping

axe-core Impact und Verdict SEVERITY sind identisch: `critical`, `serious`, `moderate`, `minor`. Kein Mapping nötig.

### Dual-Mode

Ohne `thresholds` → informational (immer PASS, Violations als Findings). Mit `thresholds: { critical: 0, serious: 0 }` → enforced (FAIL wenn Anzahl Violations pro Severity-Level den Threshold übersteigt).

### Metadata

```json
{
  "tool": "axe-core (wcag2a,wcag2aa)",
  "url_tested": "http://localhost:9999/",
  "mode": "informational",
  "violations": 3,
  "passes": 44,
  "incomplete": 2,
  "inapplicable": 12
}
```

---

## 9. Suite: perf

**Datei:** `pipeline/suites/perf.ts` (202 Zeilen)
**Zweck:** Lighthouse Performance-Audit
**Dependencies:** build + health
**Requires:** `lighthouse` (bereits in Dockerfile.sandbox)

### Verhalten

1. Lighthouse CLI als Child-Process gegen die laufende App
2. JSON-Report parsen, Scores extrahieren (0-100)
3. Je nach Modus: Scores reporten oder gegen Thresholds prüfen

### Konfiguration (aus `context.config.perf`)

```json
// Informational (Default)
{}

// Enforced (Gate-Test)
{ "thresholds": { "performance": 80, "accessibility": 90, "best-practices": 90, "seo": 80 } }
```

| Parameter | Default |
|---|---|
| `timeout` | `60s` |
| `output_path` | `/sandbox/results/lighthouse-report.json` |

### Lighthouse-Kategorien

| Kategorie | Beschreibung |
|---|---|
| `performance` | Ladezeit, TTI, Layout Shifts |
| `accessibility` | Lighthouse-eigene a11y Checks |
| `best-practices` | HTTPS, Console-Errors, Image-Aspect-Ratio |
| `seo` | Meta-Tags, Crawlability |

### Dual-Mode

Ohne `thresholds` → informational. Scores werden reported, Findings nur bei auffällig niedrigen Werten (< 50 = moderate, < 70 = minor). Mit `thresholds` → enforced. FAIL wenn ein Score unter seinem Threshold liegt. Severity skaliert mit dem Gap: 30+ unter Threshold = critical, 15+ = serious, 5+ = moderate.

### Metadata

```json
{
  "tool": "Lighthouse CLI",
  "url_tested": "http://localhost:9999/",
  "mode": "enforced",
  "scores": { "performance": 92, "accessibility": 78, "best-practices": 95, "seo": 100 },
  "thresholds": { "performance": 80, "accessibility": 90 },
  "report_path": "/sandbox/results/lighthouse-report.json"
}
```

---

## 10. Suite: bundle

**Datei:** `pipeline/suites/bundle.ts` (174 Zeilen)
**Zweck:** Build-Output-Größe und Dateianzahl messen
**Dependencies:** build (kein Health nötig — braucht keine laufende App)
**Requires:** keine externen Packages

### Verhalten

1. Prüft ob `/sandbox/www/` existiert (SKIP bei Server-Modulen)
2. `du -sk` für Gesamtgröße
3. Rekursives File-Listing für Count und Top-5 größte Files
4. Je nach Modus: Größe reporten oder gegen Thresholds prüfen

### Konfiguration (aus `context.config.bundle`)

```json
// Informational (Default)
{}

// Enforced (Gate-Test)
{ "thresholds": { "max_size_kb": 5120, "max_file_count": 200 } }
```

### Dual-Mode

Ohne `thresholds` → informational. Größe wird reported, Findings bei > 3MB (minor) oder > 5MB (moderate). Mit `thresholds` → enforced. FAIL wenn `max_size_kb` oder `max_file_count` überschritten.

### Metadata

```json
{
  "total_size_kb": 2340,
  "file_count": 47,
  "largest_files": ["chunk-vendor.js (890 KB)", "main.js (120 KB)", "..."],
  "mode": "informational"
}
```

---

## 11. Suite: visual-reg

**Datei:** `pipeline/suites/visual-reg.ts` (260 Zeilen)
**Zweck:** Screenshot der laufenden App mit reviewed Baseline-PNG vergleichen
**Dependencies:** build + health
**Requires:** `pixelmatch`, `pngjs` (Dockerfile.sandbox), `pipeline/tools/screenshot.ts`

### Baseline-Workflow

Baselines werden extern erstellt und reviewed, **bevor** Forge das Modul baut:

1. Prism (oder manuell) legt `baseline.html` in `.swarm/modules/<module>/baselines/`
2. `pipeline/tools/screenshot.ts --generate-baselines` erstellt daraus reviewed baseline PNGs plus `paths.json`: `node pipeline/tools/screenshot.ts baseline.html baseline.png`
3. Forge baut das echte Modul
4. visual-reg screenshottet die laufende App → vergleicht gegen `baseline.png`

Keine Baseline vorhanden → SKIP (nicht auto-create).

### Verhalten

1. Prüft ob Baseline-PNG existiert (SKIP wenn nicht)
2. Screenshot der laufenden App via `takeScreenshot()`
3. Pixel-Vergleich mit `pixelmatch`
4. Bei Abweichung: Diff-Image erzeugen (`visual-reg-diff.png`)
5. Size-Mismatch-Handling: Canvas wird auf die größere Dimension gepadded

### Konfiguration (aus `context.config['visual-reg']`)

```json
// Informational (Default)
{ "baseline_dir": ".swarm/modules/15/baselines" }

// Enforced (Gate-Test)
{
  "baseline_dir": ".swarm/modules/15/baselines",
  "thresholds": { "max_diff_percent": 1.0 }
}
```

| Parameter | Default |
|---|---|
| `baseline_file` | `baseline.png` |
| `pixelmatch.threshold` | `0.1` (Farbdistanz-Toleranz 0-1) |
| `viewport` | `{ width: 1280, height: 720 }` |
| `fullPage` | `true` |

### Dual-Mode

Ohne `thresholds` → informational (immer PASS, Diff-Prozent als Finding). Mit `thresholds: { max_diff_percent: 1.0 }` → enforced (FAIL wenn Diff > 1%).

### Artefakte

| File | Ort | Beschreibung |
|---|---|---|
| `visual-reg-actual.png` | `/sandbox/results/` | Screenshot der aktuellen App |
| `visual-reg-diff.png` | `/sandbox/results/` | Diff-Image (nur bei Abweichung) |

### Metadata

```json
{
  "tool": "pixelmatch",
  "url_tested": "http://localhost:9999/",
  "mode": "enforced",
  "diff_percent": 3.2,
  "diff_pixels": 29440,
  "canvas_size": "1280x920",
  "baseline_path": "<project-root>/.swarm/modules/15/baselines/baseline.png",
  "actual_path": "/sandbox/results/visual-reg-actual.png",
  "diff_path": "/sandbox/results/visual-reg-diff.png",
  "thresholds": { "max_diff_percent": 1.0 }
}
```

---

## 12. Screenshot-Utility

**Datei:** `pipeline/tools/screenshot.ts` (171 Zeilen)
**Zweck:** Shared Playwright-Screenshot-Funktion

### Consumer

| Consumer | Zweck |
|---|---|
| `pipeline/suites/visual-reg.ts` | Screenshot der laufenden App für Pixel-Diff |
| `pipeline/tools/visual-audit.ts` | Screenshot für Discord-Upload (Refactor ausstehend) |
| CLI | Baseline-Erstellung aus HTML-Previews |

### API

```js
import { takeScreenshot } from './pipeline/tools/screenshot.ts';
const result = await takeScreenshot(target, outputPath, opts);
// result: { ok: true, path, width, height } oder { ok: false, error }
```

### Input-Erkennung

| Input | Verhalten |
|---|---|
| `http://...` oder `https://...` | Direkt als URL navigieren |
| `/path/to/file.html` | Zu `file:///path/to/file.html` konvertieren |
| `relative/path.html` | Zu absolutem Pfad resolven, dann `file://` |

### CLI (Baseline-Erstellung)

```bash
# HTML-Preview → Baseline-PNG
node pipeline/tools/screenshot.ts .swarm/modules/15/baselines/baseline.html .swarm/modules/15/baselines/baseline.png

# Laufende App screenshotten
node pipeline/tools/screenshot.ts http://localhost:9999 /tmp/screenshot.png --width 1920 --height 1080

# Ohne Fullpage
node pipeline/tools/screenshot.ts http://localhost:9999 /tmp/viewport-only.png --no-fullpage
```

### Parameter

| Param | Typ | Default | Beschreibung |
|---|---|---|---|
| `viewport` | `{width, height}` | `{1280, 720}` | Browser-Viewport |
| `fullPage` | boolean | `true` | Fullpage oder Viewport-only |
| `waitUntil` | string | `'networkidle'` | Playwright goto waitUntil |
| `timeout` | number | `15000` | Navigation-Timeout in ms |

---

## 13. Suite: api (pipeline/suites/api.ts)

**Phase 3** — JSON-Spec HTTP/WS Test-Runner.

### Überblick

Liest eine `test-spec.json` Datei, feuert HTTP-Requests (und optional WebSocket-Verbindungen) gegen die laufende App, und vergleicht Responses gegen Erwartungen. Keine Spec → SKIP.

### Funktionsweise

1. Spec-Datei laden aus `test_config.api.spec_file` (relativ zu project_dir)
2. Optional: Auth-Setup (POST an auth_endpoint → Token in `{{token}}` verfügbar)
3. Tests sequentiell ausführen:
   - HTTP: fetch mit Method, Headers, Body → Status/Body/Timing prüfen
   - WS: WebSocket connect, Messages senden, Responses prüfen
4. Verdict-JSON zurückgeben

### Spec-Format (`test-spec.json`)

```json
{
  "base_url": "http://localhost:3000",
  "defaults": {
    "headers": { "Content-Type": "application/json" },
    "timeout_ms": 5000,
    "ws_timeout_ms": 5000
  },
  "setup": {
    "auth_endpoint": "/api/auth/login",
    "auth_body": { "username": "admin", "password": "admin" },
    "token_path": "token"
  },
  "tests": [
    {
      "name": "GET /api/health returns 200",
      "method": "GET",
      "path": "/api/health",
      "expect": { "status": 200 }
    }
  ]
}
```

### HTTP-Test-Felder

| Feld | Typ | Pflicht | Beschreibung |
|---|---|---|---|
| `name` | string | empfohlen | Test-Name für Logs und Findings |
| `method` | string | nein | HTTP-Methode (default: GET) |
| `path` | string | ja | URL-Pfad (wird an base_url angehängt) |
| `headers` | object | nein | Zusätzliche Headers (merged mit defaults) |
| `body` | object | nein | Request-Body (für POST/PUT/PATCH) |
| `expect.status` | number | nein | Erwarteter HTTP-Status-Code |
| `expect.body_type` | string | nein | Erwarteter Body-Typ: "array", "object", "string" |
| `expect.body_min_length` | number | nein | Minimale Array-Länge |
| `expect.body_contains` | object | nein | Key-Value-Paare die im Body existieren müssen. Wert `true` = nur Existenz prüfen |
| `expect.max_response_ms` | number | nein | Max. Response-Zeit in ms |

### WebSocket-Test-Felder

| Feld | Typ | Pflicht | Beschreibung |
|---|---|---|---|
| `protocol` | string | ja | Muss `"ws"` sein |
| `path` | string | ja | WebSocket-Pfad (http→ws automatisch) |
| `ws_messages` | array | nein | Messages zum Senden: `[{ "send": {...} }]` |
| `expect.ws_connected` | boolean | nein | `true` = Verbindung erwartet, `false` = Ablehnung erwartet |
| `expect.ws_response_contains` | object | nein | Key-Value in mindestens einer WS-Response |
| `expect.ws_min_messages` | number | nein | Minimale Anzahl empfangener Messages |

### Template-Variablen

Strings in Headers, Path, Body können `{{varName}}` Platzhalter enthalten. Aktuell wird `{{token}}` vom Auth-Setup befüllt. Beispiel: `"Authorization": "Bearer {{token}}"`.

### Config

```json
{
  "test_config": {
    "api": {
      "spec_file": ".swarm/modules/02-kubernetes-connection/test-spec.json",
      "thresholds": { "max_failures": 0 }
    }
  }
}
```

| Feld | Default | Beschreibung |
|---|---|---|
| `spec_file` | keiner (→ SKIP) | Pfad zur test-spec.json |
| `thresholds` | `null` (informational) | `{ max_failures: N }` → FAIL bei >N fehlgeschlagenen Tests |

Beispiel-Template: `examples/test-spec-example.json`

---

## 14. Suite: e2e (pipeline/suites/e2e.ts)

**Phase 3** — Playwright E2E Test-Runner.

### Überblick

Entdeckt existierende Playwright-Test-Dateien in `.swarm/modules/<module>/tests/` und führt sie via `npx playwright test` aus. Keine Tests → SKIP. Tests werden vom Buster-Subagent geschrieben und bei nachfolgenden Runs deterministisch wiederverwendet.

### Selbstkorrigierender Loop

```
1. Erster Run: Keine Tests → SKIP → Subagent schreibt Tests
2. Zweiter Run: Tests gefunden → ausführen
   → PASS: Tests bleiben, nächster Run = deterministisch
   → FAIL: Subagent sieht Verdict mit Fehlern → fixt Tests
3. Dritter Run: Gefixte Tests → PASS
```

### Test-Discovery

Sucht rekursiv nach Dateien mit diesen Patterns:
- `*.spec.js`, `*.spec.ts`
- `*.test.js`, `*.test.ts`, `*.test.mjs`

Ignoriert: `node_modules/`, versteckte Verzeichnisse

### Environment-Variablen für Tests

| Variable | Wert | Beschreibung |
|---|---|---|
| `BASE_URL` | `http://localhost:<port>` | App-URL für Tests |
| `CI` | `true` | Headless-Modus |
| `PLAYWRIGHT_BROWSERS_PATH` | `/ms-playwright` | Chromium-Location im Sandbox |

### Config

```json
{
  "test_config": {
    "e2e": {
      "tests_dir": ".swarm/modules/06-websockets/tests",
      "timeout_ms": 60000,
      "thresholds": { "max_failures": 0 }
    }
  }
}
```

| Feld | Default | Beschreibung |
|---|---|---|
| `tests_dir` | `.swarm/modules/<module>/tests` | Verzeichnis mit Playwright-Tests |
| `timeout_ms` | `60000` | Max. Laufzeit für gesamten Playwright-Run |
| `thresholds` | `null` (informational) | `{ max_failures: N }` → FAIL bei >N fehlgeschlagenen Tests |

---

## 15. Suite: security (pipeline/suites/security.ts)

**Phase 4** — HTTP Response Header Audit.

### Überblick

Prüft HTTP-Response-Headers und Cookie-Flags gegen Security Best Practices. Rein fetch-basiert — kein Browser, kein Playwright. Prüft alle konfigurierten Paths sequentiell.

### Geprüfte Headers

| Header | Severity | Was geprüft wird |
|---|---|---|
| `Strict-Transport-Security` | serious | Vorhanden + `max-age` ≥ 1 Jahr (konfigurierbar) |
| `Content-Security-Policy` | serious | Vorhanden + nicht leer. Warnung bei `unsafe-inline` + `unsafe-eval` |
| `X-Frame-Options` | moderate | `DENY` oder `SAMEORIGIN` |
| `X-Content-Type-Options` | moderate | `nosniff` |
| `X-XSS-Protection` | minor | Vorhanden (empfohlen: `0` für moderne Browser) |
| `Referrer-Policy` | minor | Vorhanden |

### Cookie-Prüfung

Automatisch für alle `Set-Cookie` Headers in der Response:
- `HttpOnly` Flag (serious wenn fehlt)
- `Secure` Flag (serious wenn fehlt)
- `SameSite` Attribut (moderate wenn fehlt)

### CORS-Check

Wenn `check_cors: true` (Default): Warnt bei `Access-Control-Allow-Origin: *` (serious). Kein CORS-Header = kein Problem.

### Config

```json
{
  "test_config": {
    "security": {
      "paths": ["/", "/api/health", "/api/pods"],
      "check_cors": true,
      "min_hsts_max_age": 31536000,
      "thresholds": { "max_missing_headers": 0 }
    }
  }
}
```

| Feld | Default | Beschreibung |
|---|---|---|
| `paths` | `[serve.health_path \|\| "/"]` | Pfade zum Prüfen |
| `check_cors` | `true` | CORS-Wildcard-Check ein/aus |
| `min_hsts_max_age` | `31536000` (1 Jahr) | Minimaler HSTS max-age in Sekunden |
| `timeout_ms` | `10000` | Timeout pro Request |
| `thresholds` | `null` (informational) | `{ max_missing_headers: N }` → FAIL bei >N Issues |

---

## 16. Suite: unit (pipeline/suites/unit.ts)

**Phase 4** — Unit Test Runner (`npm test`).

### Überblick

Führt `npm test` im Projektverzeichnis aus und parst den Output. Unterstützt Jest, Vitest, Mocha und TAP. Kein Test-Script vorhanden → SKIP.

### Ablauf

1. `package.json` lesen → `scripts.test` vorhanden?
2. npm-Default-Stub erkennen (`echo "Error: no test specified" && exit 1`) → SKIP
3. `npm test` ausführen mit CI=true, NODE_ENV=test
4. Output parsen: Framework erkennen, passed/failed/skipped extrahieren
5. Failure-Details aus Output extrahieren (Jest `●`, Mocha nummeriert)
6. Verdict-JSON zurückgeben

### Unterstützte Frameworks

| Framework | Erkennungsmuster |
|---|---|
| Jest | `Tests: X failed, Y passed, Z total` |
| Vitest | `Tests X failed \| Y skipped \| Z passed (N)` |
| Mocha | `X passing` + `Y failing` |
| TAP | `# tests N` + `# pass N` + `# fail N` |
| Unbekannt | Fallback auf Exit-Code: 0 = PASS, non-zero = FAIL |

### Config

```json
{
  "test_config": {
    "unit": {
      "test_cmd": "npm test",
      "timeout_ms": 60000,
      "thresholds": { "max_failures": 0 }
    }
  }
}
```

| Feld | Default | Beschreibung |
|---|---|---|
| `test_cmd` | `npm test` | Befehl zum Ausführen |
| `timeout_ms` | `60000` | Max. Laufzeit |
| `thresholds` | `null` (informational) | `{ max_failures: N }` → FAIL bei >N fehlgeschlagenen Tests |

---

## 17. Dual-Mode: Informational vs Enforced

Phase 2–4 führen ein einheitliches Prinzip für alle non-critical Suites ein:

**Keine `thresholds` in Config → Informational (immer PASS)**
Suite läuft, Ergebnisse werden als Findings reported, aber Status bleibt PASS. Typisch für Modul-Tests während der Entwicklung.

**`thresholds` in Config → Enforced (kann FAILen)**
Suite prüft gegen konfigurierte Thresholds. Bei Überschreitung → FAIL. Typisch für Gate-Tests (finale Validierung vor Production).

### Übersicht

| Suite | Informational (Default) | Enforced (Gate-Test) |
|---|---|---|
| `build` | — | Immer enforced, immer `critical: true` |
| `health` | — | Immer enforced, immer `critical: true` |
| `a11y` | Violations als Findings, PASS | `thresholds: { critical: 0, serious: 0 }` → FAIL |
| `perf` | Scores als Findings, PASS | `thresholds: { performance: 80 }` → FAIL |
| `bundle` | Größe als Findings, PASS | `thresholds: { max_size_kb: 5120 }` → FAIL |
| `visual-reg` | Diff-% als Finding, PASS | `thresholds: { max_diff_percent: 1.0 }` → FAIL |
| `api` | Failures als Findings, PASS | `thresholds: { max_failures: 0 }` → FAIL |
| `e2e` | Failures als Findings, PASS | `thresholds: { max_failures: 0 }` → FAIL |
| `security` | Missing headers als Findings, PASS | `thresholds: { max_missing_headers: 0 }` → FAIL |
| `unit` | Failures als Findings, PASS | `thresholds: { max_failures: 0 }` → FAIL |

Build und Health haben keinen Dual-Mode — die sind immer enforced und critical.

### Konfigurationsbeispiel (progress.json)

```json
{
  "modules": {
    "15": {
      "test_suites": ["build", "health", "a11y", "perf", "bundle", "visual-reg"],
      "test_config": {
        "serve": { "type": "static" }
      }
    },
    "02": {
      "test_suites": ["build", "health", "api", "e2e"],
      "test_config": {
        "serve": { "type": "server", "start_cmd": "npm start", "port": 3000, "health_path": "/api/health" },
        "api": { "spec_file": ".swarm/modules/02-kubernetes-connection/test-spec.json" },
        "e2e": { "tests_dir": ".swarm/modules/02-kubernetes-connection/tests" }
      }
    }
  },
  "gates": {
    "final-buster": {
      "test_suites": ["build", "health", "a11y", "perf", "bundle", "security", "visual-reg", "api", "e2e", "unit"],
      "test_config": {
        "serve": { "type": "static" },
        "a11y": { "thresholds": { "critical": 0, "serious": 0 } },
        "perf": { "thresholds": { "performance": 80, "accessibility": 90 } },
        "bundle": { "thresholds": { "max_size_kb": 5120 } },
        "security": { "thresholds": { "max_missing_headers": 0 } },
        "visual-reg": { "thresholds": { "max_diff_percent": 1.0 } },
        "api": { "spec_file": ".swarm/buster-test/final-test-spec.json", "thresholds": { "max_failures": 0 } },
        "e2e": { "tests_dir": ".swarm/buster-test/tests", "thresholds": { "max_failures": 0 } },
        "unit": { "thresholds": { "max_failures": 0 } }
      }
    }
  }
}
```

Modul-Test → keine Thresholds → alles informational. Gate-Test → Thresholds gesetzt → enforced.

### Metadata

Jede Suite mit Dual-Mode enthält `mode: 'informational' | 'enforced'` in ihrer Metadata. Damit ist im Verdict-JSON sofort sichtbar in welchem Modus die Suite lief.

---

## 18. Buster Pipeline

**Datei:** `buster-pipeline.ts` (700 Zeilen)
**Zweck:** Ersetzt den Processor-Sidecar. Kernstück der Test-Plattform.

### Feature-Parity mit Processor v7

| Feature | Processor v7 | Buster Pipeline v1 |
|---|---|---|
| Redis XREADGROUP | ✅ | ✅ |
| Consumer Group Setup | ✅ | ✅ |
| git pull --rebase | ✅ | ✅ |
| ACP Session Spawn | ✅ | ✅ |
| Completion-Stream Monitor | ✅ | ✅ |
| Session Kill | ✅ | ✅ |
| Discord Notifications | ✅ | ✅ |
| Timeout → FAIL an Stream | ✅ | ✅ |
| ACK nach Task | ✅ | ✅ |

### Neue Features

| Feature | Beschreibung |
|---|---|
| Gateway-Readiness-Check | Wartet max 120s auf Gateway (Port 18789) bevor Redis-Polling beginnt |
| Periodischer Gateway-Health | Alle 60s prüfen. Bei Failure → exit → Pod-Restart |
| sandbox-cleanup (Schritt 0) | Clean Slate vor jedem Task |
| Suite-Runner-Integration | Ruft `runSuites()` auf, bekommt Verdict zurück |
| Conditional Spawn | `NO_SUBAGENT` → direkt FAIL, kein Subagent |
| Prompt-Anreicherung | Verdict-JSON wird in den Prompt injiziert |
| Timeout-Kalkulation | `Gesamt - Suite-Zeit - 60s Buffer = Subagent-Timeout` (min 300s) |
| Suite-Discord-Embed | Pre-Test Results als formatiertes Embed |
| SIGTERM-Handler | Aktiven Subagent killen → Cleanup → Redis disconnect → exit |

### Funktions-Übersicht

| Funktion | Zeilen | Beschreibung |
|---|---|---|
| `discord(embed)` | ~10 | Webhook-Post |
| `notifyTaskResult(...)` | ~25 | Task-Ergebnis-Embed |
| `notifySuiteResults(moduleId, verdict)` | ~30 | Pre-Test-Results-Embed (NEU) |
| `checkGatewayHealth()` | ~8 | Einzelner Health-Check |
| `waitForGateway()` | ~15 | Blockierender Wait (max 120s) |
| `startGatewayHealthMonitor()` | ~10 | Periodischer Check (60s) |
| `sandboxCleanup()` | ~8 | sandbox-cleanup Wrapper |
| `gitSync(expectedHash)` | ~20 | git pull + Hash-Check |
| `enrichPrompt(original, verdict, config)` | ~20 | Verdict-JSON in Prompt injizieren |
| `spawnBusterSession(payload, prompt, timeout)` | ~50 | ACP Session Spawn (von Processor) |
| `killSession(childSessionKey)` | ~20 | Session Kill (von Processor) |
| `monitorSession(payload, key, runId, timeout)` | ~70 | Completion-Monitor (von Processor, + shutdown check) |
| `processTask(payload)` | ~100 | Kernlogik: Cleanup → Git → Suites → Spawn/Fail |
| `processOne()` | ~40 | Einzelne Redis-Message verarbeiten |
| `shutdown(signal)` | ~15 | Graceful Shutdown |
| `main()` | ~30 | Startup: Gateway wait → Health monitor → Consumer group → Loop |

### processTask() — Schritt für Schritt

```
0. sandbox-cleanup           — Clean Slate
1. git pull --rebase         — Code auf erwartetem Commit
2. Prompt als File speichern — /tmp/buster-task-<module>-<ts>.md (Audit)
3. runSuites()               — Deterministisch (build + health + ...)
4. Discord: Suite-Results    — Embed mit Ergebnis-Übersicht
5. Entscheidung:
   └─ NO_SUBAGENT → FAIL an completion_stream → cleanup → return
   └─ SPAWN → weiter mit 6
6. enrichPrompt()            — Verdict-JSON in Prompt injizieren
7. Timeout berechnen         — total - suite_time - 60s buffer (min 300s)
8. spawnBusterSession()      — ACP Session via Gateway API
9. monitorSession()          — Completion-Stream pollen bis done/timeout
10. sandbox-cleanup          — Immer, auch bei Error
```

### State

```js
let activeSessionKey = null;  // Für SIGTERM-Cleanup
let shuttingDown = false;     // Shutdown-Flag
```

---

## 19. Datenfluss und Payload-Struktur

### Redis-Payload (pipeline.ts → Buster Pipeline)

```json
{
  "task_type": "module_test",
  "module": "06",
  "project": "kubecommand",
  "commit_hash": "a1b2c3d4",
  "timestamp": "2026-03-18T12:00:00Z",
  "completion_stream": "swarm:kubecommand:completion",
  "instructions": "... vollständiger Buster-Prompt ...",
  "session": {
    "model": "claude-sonnet-4-6",
    "agentId": null,
    "cwd": "/workspace/forgestack",
    "timeout_seconds": 2700,
    "label": "buster-test-06-1710756000"
  },
  "module_path": "Projects/kubecommand/src/06-websocket-events",
  "buster_md_path": "Projects/kubecommand/src/06-websocket-events/BUSTER.md",
  "output_file": "Projects/kubecommand/src/.swarm/modules/06-websocket-events/buster-result.json",
  "test_suites": ["build", "health"],
  "test_config": {
    "serve": { "type": "server", "start_cmd": "npm start", "port": 3000, "health_path": "/api/health" }
  }
}
```

`test_suites` und `test_config` sind die in Phase 1 hinzugefügten Felder. Bei `null` nutzt die Buster Pipeline Defaults: `["build", "health"]` und `{ serve: { type: "static" } }`.

---

## 20. Prompt-Anreicherung

Die Buster Pipeline injiziert das Verdict-JSON als Block VOR dem originalen Prompt. Das JSON ist die vollständige Runner-Verdict-Struktur, trunciert auf max 5 Findings pro Suite via `truncateForPrompt()`:

```
## Pre-Test Results (automatisch ausgeführt — kein Handlungsbedarf)

Die App läuft bereits auf http://localhost:9999 — du musst NICHT bauen oder serven.

```json
{
  "overall_status": "PASS",
  "recommendation": "SPAWN",
  "suites": {
    "build": {
      "status": "PASS",
      "critical": true,
      "duration_ms": 3200,
      "checks_total": 1,
      "checks_passed": 1,
      "findings": []
    },
    "health": {
      "status": "PASS",
      "critical": true,
      "duration_ms": 1100,
      "checks_total": 1,
      "checks_passed": 1,
      "findings": []
    }
  },
  "metadata": {
    "module": "15",
    "project": "kubecommand",
    "timestamp": "2026-03-18T10:00:00.000Z"
  }
}
```

Vollständiger Report: /sandbox/results/runner-verdict.json

---

[... originaler Buster-Prompt ...]
```

Bei mehr als 5 Findings pro Suite wird ein Referenz-Finding angehängt: `"X more findings in /sandbox/results/<suite>-verdict.json"`.

---

## 21. Konfiguration

### progress.json — Modul-Level

```json
{
  "modules": {
    "06": {
      "title": "WebSocket Events",
      "dir": "06-websocket-events",
      "test_suites": ["build", "health"],
      "test_config": {
        "serve": {
          "type": "server",
          "start_cmd": "npm start",
          "port": 3000,
          "health_path": "/api/health"
        }
      }
    },
    "15": {
      "title": "Dashboard + Core Pages",
      "dir": "15-dashboard-core-pages",
      "test_suites": ["build", "health", "a11y", "perf", "bundle", "visual-reg"],
      "test_config": {
        "serve": {
          "type": "static",
          "build_cmd": "npm run build",
          "image": "node:20-slim"
        },
        "visual-reg": {
          "baseline_dir": ".swarm/modules/15-dashboard-core-pages/baselines"
        }
      }
    }
  }
}
```

### progress.json — Gate-Level (Enforced)

```json
{
  "gates": {
    "final-buster": {
      "test_suites": ["build", "health", "a11y", "perf", "bundle", "security", "visual-reg", "api", "e2e", "unit"],
      "test_config": {
        "serve": { "type": "static" },
        "a11y": { "thresholds": { "critical": 0, "serious": 0 } },
        "perf": { "thresholds": { "performance": 80, "accessibility": 90 } },
        "bundle": { "thresholds": { "max_size_kb": 5120 } },
        "security": { "thresholds": { "max_missing_headers": 0 } },
        "visual-reg": { "thresholds": { "max_diff_percent": 1.0 } },
        "api": { "spec_file": ".swarm/buster-test/final-test-spec.json", "thresholds": { "max_failures": 0 } },
        "e2e": { "tests_dir": ".swarm/buster-test/tests", "thresholds": { "max_failures": 0 } },
        "unit": { "thresholds": { "max_failures": 0 } }
      }
    }
  }
}
```

### Defaults

| Feld | Default wenn nicht gesetzt |
|---|---|
| `test_suites` | `["build", "health"]` |
| `test_config` | `{ serve: { type: "static" } }` |
| `serve.image` | `node:20-slim` |
| `serve.build_cmd` | `npm run build` |
| `serve.start_cmd` | `npm start` |
| `serve.port` | `9999` (static) / `3000` (server) |
| `serve.health_path` | `/` |
| `a11y.tags` | `['wcag2a', 'wcag2aa']` |
| `a11y.max_findings` | `50` |
| `perf.timeout` | `60s` |
| `bundle.www_dir` | `/sandbox/www` |
| `visual-reg.baseline_file` | `baseline.png` |
| `visual-reg.pixelmatch.threshold` | `0.1` |

---

## 22. Deployment

### buster-values.yaml — Schlüsselfelder

```yaml
# Sidecar deaktiviert
processor:
  enabled: false

# Dual-Process-Start
gateway:
  command:
    - "/bin/bash"
    - "-c"
    - |
      node /app/skills/buster-pipeline.ts &
      ORCH_PID=$!
      node /app/openclaw.mjs gateway --bind lan --port 18789 &
      GW_PID=$!
      wait -n $ORCH_PID $GW_PID
      kill $ORCH_PID $GW_PID 2>/dev/null
      exit 1
```

### Workspace — Anpassungen an Soul und Agents

- **Soul:** "App ist bereits gebaut/serviert" statt "Sandbox always"
- **Agents:** Klarer Subagent-Workflow: Pre-Test Results lesen → BUSTER.md Tests ausführen → NICHT bauen/serven

---

## 23. Pipeline-Integration

### Änderung in pipeline.ts

Genau 2 Zeilen in `buildBusterPayload()` hinzugefügt (Zeile 1179-1180):

```js
test_suites: mod?.test_suites || null,
test_config: mod?.test_config || null,
```

Pipeline liest `test_suites` und `test_config` aus `progress.json` und reicht sie 1:1 im Redis-Payload durch. Bei `null` nutzt die Buster Pipeline ihre Defaults.

Kein anderer Code in pipeline.ts wurde verändert. Kein Breakage-Risiko.

---

## 24. Discord-Benachrichtigungen

### Bestehend (von Processor übernommen)

- Task empfangen
- ACP Session spawned
- ACP Session complete (PASS/FAIL)
- ACP Session timeout
- Task-Fehler

### Neu

**Suite-Results Embed (Erfolg):**
```
🔬 Pre-Test Results: Module 06
━━━━━━━━━━━━━━━━━━━━━━
✅ build      — PASS (3.2s)
✅ health     — PASS (1.1s)
━━━━━━━━━━━━━━━━━━━━━━
→ Spawning Subagent (results injected)
```

**Suite-Results Embed (Kritischer Failure):**
```
❌ Pre-Test FAIL: Module 06
━━━━━━━━━━━━━━━━━━━━━━
❌ build      — FAIL (1.8s)
   tsc: 3 errors in handler.ts
⏭ health     — SKIP (build failed)
━━━━━━━━━━━━━━━━━━━━━━
→ Kein Subagent. FAIL an Pipeline gemeldet.
```

---

## 25. Robustheit und Fehlerbehandlung

### Gateway-Readiness

Die Buster Pipeline wartet max 120s auf Gateway (Health-Check-Loop alle 3s). Wenn nicht ready → `process.exit(1)` → Pod-Restart.

### Gateway-Health-Monitor

Periodischer Check alle 60s. Bei Failure → `process.exit(1)` → `wait -n` killt beide Prozesse → Pod-Restart.

### SIGTERM

```
SIGTERM/SIGINT empfangen
  → shuttingDown = true
  → Aktiven Subagent killen (falls vorhanden)
  → sandbox-cleanup
  → Redis disconnect
  → process.exit(0)
```

### Sequentielle Verarbeitung

`XREADGROUP COUNT 1, BLOCK 2000`. Ein Task gleichzeitig. Kein Parallelismus — Podman/nginx/Sandbox sind nicht parallel-safe.

### ACK-Timing

Redis-Message wird erst nach dem kompletten Task geACKt. Bei Pod-Crash → Message wird redelivered → Task wird erneut bearbeitet.

### Doppeltes Cleanup

sandbox-cleanup läuft als Schritt 0 (clean slate) UND als Schritt 10 (nach Task). Schützt vor State-Leaks zwischen Tasks.

### Suite-Crash

Wenn eine Suite eine Exception wirft, fängt der Runner sie als `ERROR`-Verdict ab. Bei build/health wird `critical: true` gesetzt → `NO_SUBAGENT`.

---

## 26. Rollback

Falls die Buster Pipeline Probleme macht, Rollback in 3 Schritten:

1. `buster-values.yaml`: `gateway.command` Block entfernen oder auf einen bekannten guten Dual-Process-Start zurücksetzen
2. `helm upgrade` mit einem Image/Chart-Revision vor der Processor-Entfernung, falls Sidecar-Rollback benötigt wird

---

## 27. CLI-Referenz

### pipeline/runners/suite-runner.ts

`pipeline/runners/suite-runner.ts` ist ein ESM-Modul ohne eigenes CLI. Manuelles Testen läuft entweder über `buster-pipeline.ts` mit Redis-Payload oder über ein kleines Import-Harness, das `runSuites([...], opts)` aufruft.

### pipeline/tools/screenshot.ts (Baseline-Erstellung)

```bash
# HTML-Preview → Baseline-PNG
node /app/skills/pipeline/tools/screenshot.ts .swarm/modules/15/baselines/baseline.html .swarm/modules/15/baselines/baseline.png

# Laufende App screenshotten
node /app/skills/pipeline/tools/screenshot.ts http://localhost:9999 /tmp/screenshot.png

# Custom Viewport
node /app/skills/pipeline/tools/screenshot.ts http://localhost:9999 /tmp/wide.png --width 1920 --height 1080

# Viewport-only (kein Fullpage)
node /app/skills/pipeline/tools/screenshot.ts http://localhost:9999 /tmp/viewport.png --no-fullpage
```

### Buster Pipeline (wird automatisch gestartet)

```bash
# Startet automatisch via buster-values.yaml gateway.command
node /app/skills/buster-pipeline.ts

# Logs
kubectl logs -n kubeclaw deploy/agent-buster -c kubeclaw -f | grep '\[SUITE\]\|\[TASK\]\|\[SPAWN\]'
```

---

## 28. Changelog

### Phase 4 (partial) — Security + Unit Suites (Buster Pipeline v2.2)

**Hinzugefügt:**
- `pipeline/suites/security.ts` (372Z) — HTTP-Response-Header-Audit: HSTS (max-age Check), CSP (weak-Policy-Erkennung), X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy, Cookie-Flags (HttpOnly/Secure/SameSite), CORS-Wildcard-Check. Multiple Paths, Dual-Mode
- `pipeline/suites/unit.ts` (345Z) — `npm test` Runner. npm-Default-Stub-Erkennung → SKIP. Parst Jest, Vitest, Mocha, TAP. Failure-Detail-Extraktion. Dual-Mode

**Design-Entscheidungen:**
- security.ts prüft OWASP Secure Headers Empfehlungen, Cookie-Flags automatisch für alle Set-Cookie Headers
- unit.ts erkennt npm-Default-Stub → SKIP statt ERROR (falsches Negativ vermeiden)
- unit.ts: Fallback auf Exit-Code bei unbekanntem Test-Framework
- LLM-Features (Chaos, Triage, Exploratory, Visual Audit) auf Phase 5 verschoben — brauchen laufendes System zum iterativen Tunen
- Beide Suites `critical: false` — blockieren nie den Subagent-Spawn
- Keine Änderungen an pipeline/runners/suite-runner.ts, pipeline/services/verdict-schema.ts, Dockerfile.sandbox nötig

### Phase 3 — API + E2E Test Framework (Buster Pipeline v2.1)

**Hinzugefügt:**
- `pipeline/suites/api.ts` (528Z) — JSON-Spec HTTP/WS Test-Runner. Liest `test-spec.json`, Auth-Setup mit Token-Injection, Template-Variablen (`{{token}}`), WebSocket-Support via `protocol: "ws"`, Dual-Mode
- `pipeline/suites/e2e.ts` (310Z) — Playwright-Test-Discovery + Runner. Entdeckt `*.spec.js`/`*.test.js` in `.swarm/modules/<module>/tests/`, führt via `npx playwright test` aus, parsed Output zu Verdict-JSON, Dual-Mode
- `examples/test-spec-example.json` (127Z) — Kommentiertes Beispiel-Template mit allen Feldern (HTTP, WS, Auth, Assertions)

**Design-Entscheidungen:**
- API-Test-Spec-Format: JSON-Spec (`test-spec.json`), deterministisch, kein LLM. Keine Spec → SKIP (analog visual-reg)
- E2E-Test-Caching: Subagent schreibt Tests, e2e.ts führt sie deterministisch aus. Selbstkorrigierender Loop
- WebSocket-Testing: In api.ts integriert (`protocol: "ws"`), kein separater Helper
- Beide Suites `critical: false` — blockieren nie den Subagent-Spawn
- Keine Änderungen an pipeline/runners/suite-runner.ts, pipeline/services/verdict-schema.ts, Dockerfile.sandbox nötig

### Phase 2 — Frontend-Testing Suites (Buster Pipeline v2)

**Hinzugefügt:**
- `pipeline/tools/screenshot.ts` (171Z) — Shared Playwright-Screenshot-Utility, akzeptiert URLs + lokale HTML-Dateien, CLI für Baseline-Erstellung
- `pipeline/suites/a11y.ts` (203Z) — Accessibility-Scan via @axe-core/playwright, WCAG-Violations als Findings
- `pipeline/suites/perf.ts` (202Z) — Lighthouse CLI Performance-Audit, 4 Kategorien
- `pipeline/suites/bundle.ts` (174Z) — Build-Output-Größe + Dateianzahl, Top-5 größte Files
- `pipeline/suites/visual-reg.ts` (260Z) — Screenshot-Diff gegen Baseline via pixelmatch, Diff-Image-Erzeugung
- Dual-Mode-Konzept: Informational (immer PASS) vs Enforced (kann FAILen) — gesteuert durch `thresholds` in Config

**Geändert:**
- `Dockerfile.sandbox` — `npm install -g @axe-core/playwright pixelmatch pngjs` hinzugefügt

**Design-Entscheidungen:**
- `scope.js` gestrichen — Suite-Auswahl ist bereits durch `progress.json` determiniert, kein git-diff-Mapping nötig
- pipeline/tools/visual-audit.ts Refactor verschoben — pipeline/tools/screenshot.ts steht bereit, Refactor wenn nötig
- Baselines werden extern erstellt (Prism/manuell), keine Auto-Erstellung. Keine Baseline → SKIP
- Alle Phase-2-Suites sind `critical: false` — blockieren nie den Subagent-Spawn

### Phase 1 — Foundation (Processor v7 → Buster Pipeline v1)

**Entfernt:**
- Processor-Sidecar-Container (256MB/0.2CPU) — eingespart

**Ersetzt:**
- `handlePipelineTask()` → `processTask()` mit Suite-Runner-Integration
- Inline git-pull → `gitSync()` Funktion

**Hinzugefügt:**
- `pipeline/services/verdict-schema.ts` — Einheitliches Datenformat
- `pipeline/runners/suite-runner.ts` — Suite-Orchestrator mit Abhängigkeiten
- `pipeline/suites/build.ts` — Deterministic Build + Serve
- `pipeline/suites/health.ts` — HTTP Health-Check mit Retry
- Gateway-Readiness-Check (120s)
- Gateway-Health-Monitor (60s periodisch)
- sandbox-cleanup (Schritt 0 + Schritt 10)
- Prompt-Anreicherung mit Verdict-JSON
- Timeout-Kalkulation (Gesamt - Suite-Zeit - Buffer)
- Suite-Results Discord-Embeds
- SIGTERM-Handler (Graceful Shutdown)
- `test_suites` + `test_config` im Redis-Payload
- Workspace-Docs aktualisiert (Soul, Agents)
