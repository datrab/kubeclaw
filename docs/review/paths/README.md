# Komponentenübergreifende Pipeline-Traces

Status: 16 von 16 Szenarien abgeschlossen und durch den Orchestrator statisch gegengeprüft. Kein Laufzeit- oder E2E-Test ausgeführt.

Codebaseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`, Tree `e43c39eea59b07f0a749b7b49f3aefdd11b14ed0`. Alle Subagenten prüfen diesen unveränderten Stand. Pipeline-Einzelreviews: `a9e080ab1e1981ec5713e9b742f94280835fd347`; Infrastrukturreviews: `eac591fb060458ebb6c6ba34599309e8c424bd08`. Diese Dokumentationsstände werden nicht als neue Codebaseline behandelt. Spätere Remediation-Branches gehören nicht zu diesem Review.

Keine funktionalen Änderungen, Deployments, CI-Läufe oder Veröffentlichung. Nur `docs/review/paths/`. GitHub-Dokumentationscommits mit `[skip ci]`, kein PR/Merge.

## Abdeckungsmatrix

| Szenario | Komponenten / Übergänge | Variante / Fehlersituation | Subagent | Status |
|---|---|---|---|---|
| T01 | Gesamter Happy Path | Architektur bis Operatorzugang; Folgeschritte aus | trace01 | gegengeprüft (statisch) |
| T02 | Designiteration | Drei Designs, Ratings, persistiertes Feedback und spätere Nutzung | trace02 | gegengeprüft (statisch) |
| T03 | Architektur nachbessern | Manueller Modulplan, Review, Reparatur, erneute Freigabe | trace03 | gegengeprüft (statisch) |
| T04 | Risikoakzeptanz | Bewusste Akzeptanz; veraltete/doppelte/unautorisierte Freigabe | trace04 | gegengeprüft (statisch) |
| T05 | Modulreparaturen | Lint-, Echo- und Modul-Testfehler; erneute Prüfung | trace05 | gegengeprüft (statisch) |
| T06 | Parallele Module | A/B parallel, C abhängig; Merge und integrierte Revision | trace06 | gegengeprüft (statisch) |
| T07 | Git-Ausfälle | Konflikt, Commit-/Merge-/Pushfehler und ungewisser Abschluss | trace02 | gegengeprüft (statisch) |
| T08 | Restart und Resume | Crash zwischen Persistenz, Dispatch, Result und Bestätigung | trace01 | gegengeprüft (statisch) |
| T09 | Retry-Eskalation | Wiederholte/neue Fehler bis Limit; Needs Nova und Entscheidung | trace06 | gegengeprüft (statisch) |
| T10 | Minimale Prüfungen | Nur Lint, Echo aus, Test-Agent aus; unterstützte Konfigurationen | trace03 | gegengeprüft (statisch) |
| T11 | Deterministische Suites | Bisher 13; Auswahl, Provider, Ausführung, Auswertung, Agent aus | trace04 | gegengeprüft (statisch) |
| T12 | Test-Agent | Suite-first und Agenturteil; Widerspruch, Ausfall, späte Antwort | trace05 | gegengeprüft (statisch) |
| T13 | Kumulative Gates | Test-/Reviewgate nach M5; Reparatur und Invalidierung | trace02 | gegengeprüft (statisch) |
| T14 | Operator-Testzugang | Namespace erhalten, Tailscale, Auth, Nachricht, Feedback, Cleanup | trace03 | gegengeprüft (statisch) |
| T15 | Pipeline Review | Mit/ohne Auswertung; Runidentität, Beweise, Ergebnisnutzung | trace06 | gegengeprüft (statisch) |
| T16 | Case Study und Abschluss | Optionale Case Study; Beweisbindung, Summary, Abschluss ohne sie | trace01 | gegengeprüft (statisch) |

## Methode

Jeder Trace belegt Sender, Transport/Persistenz/Zuordnung, Empfänger, Rückweg und Folgezustand anhand von SHA, Pfad, Symbol und Zeilen. Source-/Run-/Attempt-/Artefaktbindung, Crashfenster, verspätete Ergebnisse und Reparaturinvalidierung gehören zum Umfang. Erste Bruchstellen und bedingte Weiterverfolgung werden ausdrücklich getrennt. Bestehende PCR-/IFR-Kennungen bleiben erhalten. Subagent-Abschluss ist erst nach Orchestratorgegenprüfung validiert.

## Erste Codeorientierung

`skills/nova/pipeline.ts` delegiert an `project/cli.ts`. Der Produktcompiler `skills/nova/project/compiler.ts::compileProject` generiert pro Modul Implementation → Lint → Review → Test, seriell (`maxConcurrency: 1`). Explizite Graphen sind ein anderer Einstieg. Registrierte Plugins sind nicht automatisch Teil des Projektgraphen. Insbesondere Behauptungen des bisherigen Inventars über finale Gates und Summary werden anhand der tatsächlichen Compiler-Rückgabe erneut geprüft.
