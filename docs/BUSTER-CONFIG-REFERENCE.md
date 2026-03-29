# Buster Test Platform — Config-Referenz

**Version:** 1.0  
**Datum:** 2026-03-18  
**Zweck:** Vollständige Referenz aller Konfigurationsmöglichkeiten für die Buster Test Platform. Dient als Nachschlagewerk für Menschen UND als Skill-Dokument für Nova (pipeline.js).

---

## 1. Wo wird konfiguriert?

Alle Test-Konfiguration lebt in **einer einzigen Stelle**: `progress.json`, pro Modul und pro Gate.

```
progress.json
├── modules
│   └── "02": { test_suites: [...], test_config: {...} }
└── gates
    └── "final-buster": { test_suites: [...], test_config: {...} }
```

Nova's `pipeline.js` liest `test_suites` und `test_config` aus `progress.json` und schickt sie im Redis-Payload an Buster. Buster's Orchestrator gibt sie an den Suite-Runner weiter. Kein Agent muss die Config kennen — sie fliesst automatisch durch.

### Externe Artefakte (müssen VOR dem Buster-Run existieren)

| Artefakt | Wo ablegen | Erstellt von | Referenziert via |
|---|---|---|---|
| API-Test-Spec | `.swarm/modules/<module-dir>/test-spec.json` | Manuell / Prism / Pipeline | `test_config.api.spec_file` |
| Visual-Reg Baselines | `.swarm/modules/<module-dir>/baselines/preview.html` | Prism + `screenshot.cjs --generate-baselines` | `test_config.visual-reg.baseline_dir` |
| E2E Playwright Tests | `.swarm/modules/<module-dir>/tests/*.spec.js` | Buster-Subagent (1. Run) | `test_config.e2e.tests_dir` |

**Wichtig:** Wenn ein Artefakt fehlt → die zugehörige Suite wird SKIP (kein Fehler, kein FAIL).

---

## 2. test_suites — Welche Suites laufen?

`test_suites` ist ein Array von Suite-Namen. Reihenfolge im Array ist egal — der Suite-Runner sortiert automatisch nach Abhängigkeiten.

### Verfügbare Suites

| Suite | Phase | Braucht laufende App? | Beschreibung |
|---|---|---|---|
| `build` | 1 | Nein (baut sie) | Kompiliert Code, startet App. **Immer empfohlen** |
| `health` | 1 | Ja | HTTP-Health-Check mit Retry. **Immer empfohlen** |
| `a11y` | 2 | Ja | Accessibility via axe-core (WCAG) |
| `perf` | 2 | Ja | Lighthouse Performance-Audit |
| `bundle` | 2 | Nein (braucht Build-Output) | Build-Output-Grösse messen |
| `visual-reg` | 2 | Ja | Screenshot-Diff gegen Baseline |
| `api` | 3 | Ja | HTTP/WS-Tests gegen JSON-Spec |
| `e2e` | 3 | Ja | Vorhandene Playwright-Tests ausführen |
| `security` | 4 | Ja | HTTP-Response-Header-Audit |
| `unit` | 4 | Nein (braucht Code) | `npm test` ausführen |

### Abhängigkeiten (automatisch vom Runner respektiert)

```
build → health → [a11y, perf, security, visual-reg, api, e2e]
build → [bundle, unit]
```

- `build` FAIL → alle anderen werden SKIP
- `health` FAIL → alle ausser `build`, `bundle`, `unit` werden SKIP
- Restliche Suites laufen unabhängig voneinander

### Default

Wenn `test_suites` nicht gesetzt oder `null` → Default: `["build", "health"]`.

---

## 3. test_config — Suite-spezifische Einstellungen

`test_config` ist ein Objekt mit einem Key pro Suite. Jeder Key ist optional — nicht gesetzte Suites verwenden Defaults.

### 3.1 serve — Wie wird die App gestartet?

**Betrifft:** Alle Suites die eine laufende App brauchen (health, a11y, perf, visual-reg, api, e2e, security).

```json
"serve": {
  "type": "static",
  "project_dir": "Projects/kubecommand/src",
  "build_cmd": "npm run build",
  "image": "node:20-slim",
  "port": 9999,
  "health_path": "/"
}
```

**Zwei Typen:**

| Typ | Für | Was passiert | Default Port |
|---|---|---|---|
| `static` | Frontend (Module 14-18) | `sandbox-build` → `/sandbox/www/` → nginx auf Port | 9999 |
| `server` | Backend (Module 01-13) | `sandbox-run` mit `start_cmd` → App auf Port | 3000 |

| Feld | Typ | Default | Beschreibung |
|---|---|---|---|
| `type` | string | `"static"` | `"static"` oder `"server"` |
| `project_dir` | string | Repo-Root | **Pflicht** wenn Projekt nicht im Repo-Root liegt (z.B. `Projects/<project>/src`). Alle relativen Pfade (`spec_file`, `tests_dir`, etc.) resolven von hier |
| `build_cmd` | string | `"npm run build"` | Build-Befehl (nur bei static). `sandbox-build` kopiert automatisch `dist/`, `build/` oder `out/` nach `/sandbox/www/` |
| `start_cmd` | string | `"npm start"` | Start-Befehl (nur bei server) |
| `image` | string | `"node:20-slim"` | Podman-Image für sandbox-build/sandbox-run |
| `port` | number | 9999 (static) / 3000 (server) | Port auf dem die App lauscht |
| `health_path` | string | `"/"` | Pfad für Health-Check |
| `timeout` | number | `300` | Build/Serve-Timeout in Sekunden |
| `health_retries` | number | `3` | Anzahl Health-Check-Versuche |
| `health_base_delay` | number | `1000` | Initiale Wartezeit in ms (verdoppelt sich pro Retry) |
| `health_timeout` | number | `10000` | Timeout pro Health-Check-Request in ms |

**Beispiel Backend:**
```json
"serve": {
  "type": "server",
  "project_dir": "Projects/kubecommand/src",
  "start_cmd": "npm start",
  "port": 3000,
  "health_path": "/api/health"
}
```

**Beispiel Frontend:**
```json
"serve": {
  "type": "static",
  "project_dir": "Projects/kubecommand/src",
  "build_cmd": "npm run build",
  "image": "node:20-slim"
}
```

### 3.2 a11y — Accessibility

```json
"a11y": {
  "tags": ["wcag2a", "wcag2aa"],
  "path": "/",
  "exclude": [".cookie-banner"],
  "max_findings": 50,
  "timeout": 15000,
  "thresholds": { "critical": 0, "serious": 0 }
}
```

| Feld | Typ | Default | Beschreibung |
|---|---|---|---|
| `tags` | string[] | `["wcag2a", "wcag2aa"]` | axe-core WCAG-Tags zum Prüfen |
| `path` | string | `"/"` | URL-Pfad zum Scannen |
| `exclude` | string[] | `[]` | CSS-Selektoren die vom Scan ausgeschlossen werden |
| `max_findings` | number | `50` | Max. Findings im Verdict |
| `timeout` | number | `15000` | Navigation-Timeout in ms |
| `thresholds` | object \| null | `null` | Siehe Dual-Mode (§4) |

**Threshold-Felder:** `{ critical: N, serious: N, moderate: N, minor: N }` — FAIL wenn Violations in einer Severity den Wert überschreiten.

### 3.3 perf — Performance (Lighthouse)

```json
"perf": {
  "thresholds": {
    "performance": 80,
    "accessibility": 90,
    "best-practices": 80,
    "seo": 80
  }
}
```

| Feld | Typ | Default | Beschreibung |
|---|---|---|---|
| `thresholds` | object \| null | `null` | Lighthouse-Kategorie → Mindest-Score (0-100) |
| `path` | string | `"/"` | URL-Pfad für Lighthouse-Audit |
| `output_path` | string | `/sandbox/results/lighthouse-report.json` | Pfad für den Lighthouse-JSON-Report |
| `timeout` | number | `60` | Lighthouse-Timeout in Sekunden |

**Threshold-Felder:** `{ performance: N, accessibility: N, "best-practices": N, seo: N }` — FAIL wenn ein Score unter dem Threshold liegt.

### 3.4 bundle — Build-Output-Grösse

```json
"bundle": {
  "www_dir": "/sandbox/www",
  "thresholds": {
    "max_size_kb": 5120,
    "max_file_count": 500
  }
}
```

| Feld | Typ | Default | Beschreibung |
|---|---|---|---|
| `www_dir` | string | `"/sandbox/www"` | Build-Output-Verzeichnis |
| `thresholds` | object \| null | `null` | Siehe Dual-Mode (§4) |

**Threshold-Felder:** `{ max_size_kb: N, max_file_count: N }` — FAIL wenn Grösse oder Dateianzahl überschritten.

### 3.5 visual-reg — Visual Regression

```json
"visual-reg": {
  "baseline_dir": ".swarm/modules/15-dashboard-core-pages/baselines",
  "thresholds": { "max_diff_percent": 1.0 },
  "discord": "summary"
}
```

| Feld | Typ | Default | Beschreibung |
|---|---|---|---|
| `baseline_dir` | string | `.swarm/modules/<module>/baselines` | Verzeichnis mit `preview.html` / `paths.json` / PNGs |
| `baseline_file` | string | `"baseline.png"` | Dateiname der Baseline (nur Single-Path-Modus) |
| `path` | string | `"/"` | URL-Pfad für den Screenshot (nur Single-Path-Modus) |
| `pixelmatch.threshold` | number | `0.1` | Farbdistanz pro Pixel (0 = exakt, 1 = alles akzeptiert) |
| `discord` | string | auto | `"summary"` (1 Embed bei >3 Pfaden) oder `"all"` (einzeln pro Seite) |
| `thresholds` | object \| null | `null` | Siehe Dual-Mode (§4) |

**Threshold-Felder:** `{ max_diff_percent: N }` — FAIL wenn Pixel-Diff den Prozentsatz überschreitet.

**Multi-Path-Modus (empfohlen):** Wenn `baseline_dir` eine `paths.json` enthält (oder eine `.html` Preview mit `data-routes` Manifest), wird jede Seite einzeln screenshottet und verglichen. `paths.json` + Baseline-PNGs werden automatisch aus Prism-Preview-HTML generiert. Siehe `skills/nova/project_setup/prism-conventions.md`.

**Single-Path-Modus (Rückwärtskompatibel):** Wenn nur `baseline.png` existiert (kein `paths.json`, keine `.html`), wird ein einzelner Screenshot gegen die Baseline verglichen. Erstellen via: `node screenshot.cjs baseline.html baseline.png`.

**Keine Baseline** (kein `.png`, `.html` oder `paths.json` im `baseline_dir`) → SKIP.

### 3.6 api — API-Tests (JSON-Spec)

```json
"api": {
  "spec_file": ".swarm/modules/02-kubernetes-connection/test-spec.json",
  "thresholds": { "max_failures": 0 }
}
```

| Feld | Typ | Default | Beschreibung |
|---|---|---|---|
| `spec_file` | string \| null | `null` (→ SKIP) | Pfad zur `test-spec.json` (relativ zu project_dir) |
| `thresholds` | object \| null | `null` | Siehe Dual-Mode (§4) |

**Threshold-Felder:** `{ max_failures: N }` — FAIL wenn mehr als N Tests fehlschlagen.

**Voraussetzung:** `test-spec.json` muss existieren. Format-Referenz: `examples/test-spec-example.json`. Keine Spec → SKIP.

### 3.7 e2e — E2E-Tests (Playwright)

```json
"e2e": {
  "tests_dir": ".swarm/modules/06-websockets/tests",
  "timeout_ms": 60000,
  "thresholds": { "max_failures": 0 }
}
```

| Feld | Typ | Default | Beschreibung |
|---|---|---|---|
| `tests_dir` | string | `.swarm/modules/<module>/tests` | Verzeichnis mit Playwright-Test-Files |
| `timeout_ms` | number | `60000` | Max. Laufzeit für gesamten Playwright-Run |
| `thresholds` | object \| null | `null` | Siehe Dual-Mode (§4) |

**Threshold-Felder:** `{ max_failures: N }` — FAIL wenn mehr als N Tests fehlschlagen.

**Voraussetzung:** Test-Files (*.spec.js, *.spec.ts, *.test.js, *.test.ts) im `tests_dir`. Keine Tests → SKIP (werden vom Subagent beim ersten Run geschrieben).

### 3.8 security — HTTP-Header-Audit

```json
"security": {
  "paths": ["/", "/api/health", "/api/pods"],
  "check_cors": true,
  "min_hsts_max_age": 31536000,
  "timeout_ms": 10000,
  "thresholds": { "max_missing_headers": 0 }
}
```

| Feld | Typ | Default | Beschreibung |
|---|---|---|---|
| `paths` | string[] | `[serve.health_path \|\| "/"]` | Pfade die geprüft werden |
| `check_cors` | boolean | `true` | CORS-Wildcard-Check ein/aus |
| `min_hsts_max_age` | number | `31536000` (1 Jahr) | Minimaler HSTS max-age in Sekunden |
| `timeout_ms` | number | `10000` | Timeout pro Request |
| `thresholds` | object \| null | `null` | Siehe Dual-Mode (§4) |

**Threshold-Felder:** `{ max_missing_headers: N }` — FAIL wenn mehr als N Issues gefunden.

**Geprüft:** HSTS, CSP, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy, Cookie-Flags (HttpOnly, Secure, SameSite), CORS.

### 3.9 unit — Unit-Tests

```json
"unit": {
  "test_cmd": "npm test",
  "timeout_ms": 60000,
  "thresholds": { "max_failures": 0 }
}
```

| Feld | Typ | Default | Beschreibung |
|---|---|---|---|
| `test_cmd` | string | `"npm test"` | Befehl zum Ausführen. Bei Python z.B. `"cd backend && pip install -r requirements.txt -r dev-requirements.txt -q && python -m pytest tests/ -v --tb=short"` |
| `timeout_ms` | number | `60000` | Max. Laufzeit |
| `thresholds` | object \| null | `null` | Siehe Dual-Mode (§4) |

**Threshold-Felder:** `{ max_failures: N }` — FAIL wenn mehr als N Tests fehlschlagen.

**Voraussetzung:** Wenn `test_cmd` nicht gesetzt ist (Default `npm test`): `package.json` muss ein `"test"` Script definieren das nicht der npm-Default-Stub ist. Kein Test-Script → SKIP. Wenn `test_cmd` explizit gesetzt ist (z.B. für pytest): `package.json`-Check wird übersprungen — der Operator weiß was er tut.

**Unterstützte Frameworks:** Jest, Vitest, Mocha, TAP, pytest (Fallback auf Exit-Code bei unbekanntem Format).

---

## 4. Dual-Mode: Informational vs Enforced

Jede Suite ausser `build` und `health` unterstützt zwei Modi:

**Kein `thresholds` in Config (oder Config fehlt) → Informational**
- Suite läuft und reported Ergebnisse
- Status ist IMMER `PASS`
- Findings werden als Awareness-Info in den Prompt injiziert
- Typisch für: Modul-Tests während Entwicklung

**`thresholds` gesetzt → Enforced**
- Suite prüft gegen Thresholds
- Status kann `FAIL` werden
- Typisch für: Gate-Tests (finale Validierung)

**`build` und `health` sind immer enforced und `critical: true`.** Bei FAIL → kein Subagent, direkt FAIL an Pipeline.

**Alle anderen Suites sind `critical: false`.** Auch bei enforced FAIL → Subagent wird trotzdem gespawnt, bekommt aber die Findings im Prompt.

### Übersicht

| Suite | Informational (Default) | Enforced | Threshold-Felder |
|---|---|---|---|
| `build` | — (immer enforced) | immer `critical: true` | — |
| `health` | — (immer enforced) | immer `critical: true` | — |
| `a11y` | Violations als Findings, PASS | FAIL bei Überschreitung | `critical`, `serious`, `moderate`, `minor` |
| `perf` | Scores als Findings, PASS | FAIL bei Score unter Threshold | `performance`, `accessibility`, `best-practices`, `seo` |
| `bundle` | Grösse als Findings, PASS | FAIL bei Überschreitung | `max_size_kb`, `max_file_count` |
| `visual-reg` | Diff-% als Finding, PASS | FAIL bei Überschreitung | `max_diff_percent` |
| `api` | Failures als Findings, PASS | FAIL bei Überschreitung | `max_failures` |
| `e2e` | Failures als Findings, PASS | FAIL bei Überschreitung | `max_failures` |
| `security` | Missing Headers als Findings, PASS | FAIL bei Überschreitung | `max_missing_headers` |
| `unit` | Failures als Findings, PASS | FAIL bei Überschreitung | `max_failures` |

---

## 5. Entscheidungshilfe: Welche Suites pro Modultyp?

### Backend-Modul (Module 01-13)

Typische Config:

```json
{
  "test_suites": ["build", "health", "api", "security", "unit"],
  "test_config": {
    "serve": {
      "type": "server",
      "project_dir": "Projects/<project>/src",
      "start_cmd": "npm start",
      "port": 3000,
      "health_path": "/api/health"
    },
    "api": {
      "spec_file": ".swarm/modules/<module-dir>/test-spec.json"
    }
  }
}
```

**Warum diese Suites:**
- `build` + `health`: Fundamental — kompiliert und startet der Server?
- `api`: Endpoints gegen Spec prüfen (deterministisch, kein LLM)
- `security`: Response-Headers prüfen (HSTS, CSP, Cookies)
- `unit`: Forge-geschriebene Unit-Tests ausführen

**Nicht sinnvoll:** `a11y`, `perf`, `bundle`, `visual-reg` (Frontend-spezifisch)

### Frontend-Modul (Module 14-18)

Typische Config:

```json
{
  "test_suites": ["build", "health", "a11y", "perf", "bundle", "visual-reg", "e2e", "unit"],
  "test_config": {
    "serve": {
      "type": "static",
      "project_dir": "Projects/<project>/src",
      "build_cmd": "npm run build",
      "image": "node:20-slim"
    },
    "visual-reg": {
      "baseline_dir": ".swarm/modules/<module-dir>/baselines",
      "discord": "summary"
    },
    "e2e": {
      "tests_dir": ".swarm/modules/<module-dir>/tests"
    }
  }
}
```

**Warum diese Suites:**
- `build` + `health`: Fundamental — baut und rendert das Frontend?
- `a11y`: WCAG-Compliance (axe-core)
- `perf`: Lighthouse Performance-Score
- `bundle`: Build-Output-Grösse (keine 20MB Bundles)
- `visual-reg`: Screenshot-Diff gegen Design-Baseline (Multi-Path: jede Seite einzeln aus Prism-Preview)
- `e2e`: Playwright-Tests (Navigation, Interactions)
- `unit`: Vitest Component-Tests

**Nicht sinnvoll:** `api` (kein eigener Server), `security` (nginx-Defaults, wenig Wert)

### WebSocket-Modul (Module 06)

Wie Backend, aber mit WS-Tests in der API-Spec:

```json
{
  "test_suites": ["build", "health", "api", "e2e", "security"],
  "test_config": {
    "serve": {
      "type": "server",
      "project_dir": "Projects/<project>/src",
      "start_cmd": "npm start",
      "port": 3000,
      "health_path": "/api/health"
    },
    "api": {
      "spec_file": ".swarm/modules/06-websockets/test-spec.json"
    },
    "e2e": {
      "tests_dir": ".swarm/modules/06-websockets/tests"
    }
  }
}
```

Die `test-spec.json` enthält sowohl HTTP-Tests als auch WS-Tests (`"protocol": "ws"`).

### Minimal-Modul (nur Build-Validierung)

Für Module die noch keine detaillierten Tests haben:

```json
{
  "test_suites": ["build", "health"],
  "test_config": {
    "serve": { "type": "server", "project_dir": "Projects/<project>/src", "start_cmd": "npm start", "port": 3000 }
  }
}
```

Das ist auch der Default wenn `test_suites` nicht gesetzt ist.

### Gate (Enforced, alle Suites)

Gates laufen am Ende einer Phase und prüfen alles mit strikten Thresholds:

```json
{
  "test_suites": ["build", "health", "a11y", "perf", "bundle", "visual-reg", "api", "e2e", "security", "unit"],
  "test_config": {
    "serve": { "type": "static", "project_dir": "Projects/<project>/src" },
    "a11y": { "thresholds": { "critical": 0, "serious": 0 } },
    "perf": { "thresholds": { "performance": 80, "accessibility": 90 } },
    "bundle": { "thresholds": { "max_size_kb": 5120, "max_file_count": 500 } },
    "visual-reg": { "thresholds": { "max_diff_percent": 1.0 } },
    "api": {
      "spec_file": ".swarm/buster-test/final-test-spec.json",
      "thresholds": { "max_failures": 0 }
    },
    "e2e": {
      "tests_dir": ".swarm/buster-test/tests",
      "thresholds": { "max_failures": 0 }
    },
    "security": {
      "paths": ["/", "/api/health"],
      "thresholds": { "max_missing_headers": 0 }
    },
    "unit": { "thresholds": { "max_failures": 0 } }
  }
}
```

**Unterschied zum Modul-Test:** Alle Suites haben `thresholds` → enforced. Jeder Failure zählt.

---

## 6. Datenfluss: Von progress.json bis zum Verdict

```
progress.json                    Nova (pipeline.js)
  modules.02.test_suites    ──→  buildBusterPayload()
  modules.02.test_config         fügt test_suites + test_config in Redis-Payload ein

Redis-Payload                    Buster (buster-orchestrator.js)
  payload.test_suites       ──→  processTask()
  payload.test_config            gibt Config an suite-runner.js weiter

suite-runner.js                  suites/*.js
  config.serve              ──→  build.js, health.js (App starten)
  config.a11y               ──→  a11y.js
  config.api                ──→  api.js
  ...                            ...

Suite Verdict                    buster-orchestrator.js
  { status, findings, ... } ──→  Entscheidung: SPAWN oder NO_SUBAGENT
                                 Prompt-Anreicherung mit Verdict-JSON
                                 Discord-Notification
```

**Nova muss nur `test_suites` und `test_config` in `progress.json` setzen.** Alles andere fliesst automatisch.

---

## 7. Häufige Fragen

**Was passiert wenn ich eine Suite in `test_suites` liste aber keine Config dafür habe?**
→ Die Suite läuft mit Defaults. Bei Suites die ein externes Artefakt brauchen (api → spec_file, visual-reg → baseline, e2e → tests) wird sie SKIP.

**Was passiert wenn ich `test_suites` gar nicht setze?**
→ Default: `["build", "health"]`. Nur Build + Health-Check.

**Kann ich Suites nur im Gate enforced machen und im Modul-Test informational?**
→ Genau so ist es designed. Im Modul: keine `thresholds` → informational (immer PASS). Im Gate: `thresholds` setzen → enforced (kann FAILen).

**Muss ich `serve` immer konfigurieren?**
→ Wenn nicht gesetzt, wird `{ type: "static" }` angenommen. Für Backend-Module MUSS `serve.type: "server"` gesetzt sein, sonst versucht Buster einen Static-Build.

**Was passiert bei einem FAIL einer non-critical Suite?**
→ Subagent wird trotzdem gespawnt. Er bekommt die FAIL-Findings im Prompt und kann entscheiden ob es ein echtes Problem ist.

**Was ist der Unterschied zwischen SKIP und nicht in `test_suites` gelistet?**
→ Nicht gelistet: Suite wird gar nicht geladen. SKIP: Suite wurde geladen, aber eine Voraussetzung fehlt (kein Artefakt, Dependency FAIL, Suite-File nicht vorhanden).
