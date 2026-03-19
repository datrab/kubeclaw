# Buster Test Platform — Kontext für Implementierung

Dieses Dokument fasst die Architektur-Entscheidungen zusammen, die im Brainstorming-Chat erarbeitet wurden. Es dient als Schnelleinstieg für den Implementierungs-Chat.

## Was ist KubeClaw?

KubeClaw ist eine autonome Multi-Agent AI Swarm Platform auf Kubernetes. Vier Agents:
- **Nova** — Orchestrator, läuft `pipeline.js`
- **Forge** — Code-Writer (ACP Subagent von Nova)
- **Buster** — Destructive Tester (eigener Pod, Tasks via Redis)
- **Echo** — Code-Reviewer (ACP Subagent von Nova)

Pipeline-Flow pro Modul: Forge baut → Pre-Check (Lint) → Buster testet → bei FAIL zurück an Forge → bei PASS weiter.

## Was wir bauen

Eine deterministische Test-Suite-Plattform für Buster, die automatisch Tests ausführt BEVOR ein LLM-Subagent gespawnt wird. Kernprinzip: Alles was ohne LLM geprüft werden kann, wird ohne LLM geprüft.

## Zentrale Architektur-Entscheidung

**Der Processor-Sidecar (`buster-processor.cjs`) wird durch `buster-orchestrator.js` ersetzt.** Der Orchestrator läuft als Hintergrundprozess im Gateway-Container (nicht als separater Sidecar). Dadurch hat er vollen Zugriff auf Podman, Playwright, Chromium, nginx, `/sandbox`.

Grund: Der Processor-Sidecar ist ein separater Container mit nur 256MB RAM und keinem Zugriff auf die Sandbox-Volumes. Er kann keine Tests ausführen.

## Kritische Design-Details

1. **App bleibt laufen:** Der Orchestrator baut und servt die App, dann laufen Suites dagegen. Die App bleibt für den Subagent laufen — der Subagent muss NICHT selbst bauen/serven.

2. **Conditional Spawn:** Bei kritischem Suite-Failure (Build, Health) wird KEIN Subagent gespawnt. FAIL geht direkt an den Completion-Stream zurück.

3. **Prompt-Anreicherung:** Der Orchestrator injiziert Suite-Results in den Prompt bevor er den Subagent spawnt. Top-N Findings inline, Rest als File-Referenz.

4. **Serve-Strategie:** Zwei Typen — `static` (Frontend, sandbox-build + nginx) und `server` (Backend, sandbox-run + App-Port).

5. **Abgrenzung Echo/Buster:** Echo = Lint/Statische Analyse. Buster = Runtime-Tests. Kein Overlap. Buster bekommt KEINEN Lint-Report.

6. **Timeout:** Orchestrator zieht Suite-Laufzeit + Buffer vom Gesamt-Timeout ab bevor er den Subagent spawnt.

## Aktuell: Phase 1 ✅ + Phase 2 ✅ + Phase 3 ✅ + Phase 4 (partial) ✅ + Phase 5 (partial) ✅ implementiert

### Phase 1 — Foundation

1. ✅ Verdict-Schema (`verdict-schema.js`, 221 Zeilen)
2. ✅ suite-runner.js (298 Zeilen)
3. ✅ suites/build.js (256 Zeilen)
4. ✅ suites/health.js (159 Zeilen)
5. ✅ buster-orchestrator.js (709 Zeilen)
6. ✅ buster-values.yaml (processor.enabled: false, Dual-Process-Start)
7. ✅ pipeline.js (2 Zeilen: test_suites + test_config im Payload)
8. ⏳ Integration-Test Phase 1 (manuell auf Cluster)

### Phase 2 — Frontend-Testing Suites

1. ✅ screenshot.js (171 Zeilen) — Shared Screenshot-Utility, akzeptiert URLs + lokale HTML-Dateien
2. ✅ suites/a11y.js (203 Zeilen) — Accessibility via axe-core/Playwright
3. ✅ suites/perf.js (202 Zeilen) — Lighthouse Performance-Audit
4. ✅ suites/bundle.js (174 Zeilen) — Build-Output-Größe
5. ✅ suites/visual-reg.js (259 Zeilen) — Screenshot-Diff gegen Baseline via pixelmatch
6. ✅ Dockerfile.sandbox (+1 Zeile: @axe-core/playwright, pixelmatch, pngjs)
7. ⏳ Integration-Test Phase 2 (manuell auf Cluster)

### Phase 3 — API + E2E Test Framework

1. ✅ suites/api.js (528 Zeilen) — JSON-Spec HTTP/WS Test-Runner mit Auth-Setup, Template-Variablen, Dual-Mode
2. ✅ suites/e2e.js (318 Zeilen) — Playwright-Test-Discovery + Runner, liest `.swarm/modules/<module>/tests/`, Dual-Mode
3. ✅ examples/test-spec-example.json — Template mit allen Feldern + Kommentaren
4. ⏳ Integration-Test Phase 3 (manuell auf Cluster)

### Phase 4 (partial) — Security + Unit Suites

1. ✅ suites/security.js (372 Zeilen) — HTTP-Response-Header-Audit: HSTS, CSP, X-Frame-Options, X-Content-Type-Options, Cookies, CORS. Dual-Mode
2. ✅ suites/unit.js (345 Zeilen) — `npm test` Runner mit Jest/Vitest/Mocha/TAP Output-Parsing. Dual-Mode
3. ⏳ LLM-Features (Chaos, Triage, Exploratory) — verschoben nach Phase 5, braucht laufendes System zum Tunen
4. ⏳ Integration-Test Phase 4 (manuell auf Cluster)

### Phase 5 (partial) — Konventionen und Dokumentation

1. ✅ CONVENTIONS.md (114 Zeilen) — Subagent-Konventionen: Output, Naming, Timeouts, Error-Reporting
2. ✅ docs/PIPELINE-CONFIG-REFERENCE.md (466 Zeilen) — Gesamte Pipeline-Konfiguration end-to-end
3. ✅ docs/BUSTER-CONFIG-REFERENCE.md (521 Zeilen) — test_suites + test_config Detail-Referenz
4. ❌ Templates (gestrichen) — LLMs brauchen kein Boilerplate, Konventionen reichen
5. ⏳ LLM-Feature Prompt-Blöcke (Chaos, Triage, Exploratory)
6. ⏳ visual-audit.js Refactor (optional)

Design-Entscheidungen während Implementierung:
- Phase 1: `SPAWN_CLEAN` und `SPAWN_WITH_RESULTS` zu einem einzigen `SPAWN` vereinfacht
- Phase 1: Suite-Output ist JSON (nicht Markdown) — konsistent mit dem Rest der Plattform
- Phase 2: **Dual-Mode** eingeführt: Keine `thresholds` → informational (immer PASS). `thresholds` gesetzt → enforced (kann FAILen). Modul-Tests = informational, Gate-Tests = enforced
- Phase 2: `scope.js` gestrichen — Suite-Auswahl durch `progress.json` bereits determiniert
- Phase 2: Baselines für visual-reg werden extern erstellt (Prism/manuell). Keine Baseline → SKIP
- Phase 2: visual-audit.js Refactor verschoben — screenshot.js steht bereit
- Phase 3: **API-Test-Spec-Format → JSON-Spec** (`test-spec.json`). Deterministisch, kein LLM. Keine Spec → SKIP
- Phase 3: **E2E-Test-Caching**: Buster-Subagent schreibt Playwright-Tests nach `.swarm/modules/<module>/tests/`. e2e.js entdeckt + führt sie aus. Selbstkorrigierender Loop: Broken Test → FAIL → Subagent fixt → nächster Run PASS
- Phase 3: **WebSocket-Testing in api.js integriert** via `protocol: "ws"`. Kein separater Helper. Subagent übernimmt komplexere WS-Szenarien (Reconnect, Heartbeat)
- Phase 3: Beide Suites `critical: false` — blockieren nie den Subagent-Spawn
- Phase 4: **security.js** prüft multiple Paths (konfigurierbar), Cookie-Flags inkl. HttpOnly/Secure/SameSite, CORS-Wildcard-Check
- Phase 4: **unit.js** erkennt npm-Default-Stub ("no test specified") → SKIP statt ERROR. Parst Jest, Vitest, Mocha, TAP
- Phase 4: **LLM-Features verschoben** (Chaos, Triage, Exploratory, Visual Audit Interpretation) → Phase 5. Braucht laufendes System zum Tunen
- Phase 5: **Templates gestrichen** — LLMs brauchen kein Boilerplate, schreiben Tests besser von Null. Konventionen (CONVENTIONS.md) sind was zählt
- Phase 5: **CONVENTIONS.md** definiert Output-Format, Naming, Timeouts, Error-Reporting, Exit-Codes, Workflow
- Phase 5: **Zwei Config-Referenzen**: PIPELINE-CONFIG-REFERENCE.md (Gesamtübersicht für Nova) + BUSTER-CONFIG-REFERENCE.md (Suite-Detail)

Referenzdoku: `docs/buster-test-platform-reference-v2.md`

Der vollständige Plan mit allen 5 Phasen, offenen Punkten und Details steht in `BUSTER-TEST-PLATFORM-PLAN.md`.
