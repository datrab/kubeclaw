# nova.scaffold

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1. Verantwortung, Grenzen und Verwendung

`skills/nova/project_setup/tools/progress-scaffold.ts` ist ein direkt
importgeschütztes CLI mit npm progress:scaffold. Vier Hilfsmodule übernehmen
Discovery, Legacy-Providerumwandlung, Form-/Dateivalidierung und JSONausgabe.
Alle fünf Implementierungen vollständig gelesen. Erzeugt progress.scaffold.json,
danach progress.json und .swarm/pipeline.json; kein nova-project.v1-Compiler.
Die ebenfalls inventarisierten review:status/format/supervise-Skripte sind separat
vollständig im [Operations-/Packaging-Anhang](../operations-and-packaging.md)
geprüft (einschließlich PCR-SCAFFOLD-OPS-001); dieser Anhang gehört zum Abschluss.

## 2. Eingaben, Ausgaben und Verbraucher

CLI --project/--swarm/--repo/--scaffold und --apply/--check/--print.
Dateidiscovery findet Module/FORGE/Substeps/BUSTER sowie Echo-/Bustergateanweisungen,
mischt bestehende Progress-/Scaffoldwerte. Generiert TODOs für ungelöste Ziele und
Gateplatzierungen. Validation verweigert TODOs, ungültige IDs, fehlende Files,
unbekannte Referenzen und ausgewählte retirierte Suites. Tests/Fixtures werden in
Providerplan-Nodes umgewandelt (Containerbuild, HTTP, API-flow, Axe, Sizebudget,
Tailscale); explizite Ersatzkonfiguration verlangt für Unit/Lighthouse, retired
K8s/Visual/E2E/Security wird abgewiesen. Der Verbraucher des Providerplans ist
`nova/core/test-gates/pipeline.ts`/Resolver, dessen vollständige Registryprüfung
hier nicht ausgeführt wird. Legacyprogress wird vom neuen pipeline.ts-CLI nicht
als --resume-Eingabe akzeptiert; siehe nova.entry.

## 3. Zustand und Nebenwirkungen

Defaultlauf überschreibt Scaffold, Apply schreibt Progress und anschließend
Pipeline mit writeFileSync. Keine atomare Paarpublikation/fsync/Backup oder
Versionssperre. Check und Print schreiben nicht. Bereits bestehende
progress.json/pipeline.json werden als Quellen gelesen, prior.modules/gates
teilweise übernommen; prior.pipeline geht bei Regeneration verloren (Befund).

## 4. Korrektheit und Fehler

Apply wirft bei Diagnosen und schreibt davor nichts. Defaultgeneration schreibt
auch ein absichtlich unvollständiges TODO-Formular und meldet Diagnosen mit
Exitcode 0, dokumentierter Autorenschritt. ValidateExecutionOrder prüft bekannte
Referenzen/Duplikate, aber nicht alle Module enthalten oder topologische Ordnung;
Dependencyprüfung erkennt unbekannte IDs, keine Zyklen. Das ist keine vollständige
Runtimegraphvalidierung. Testplanvalidation beschränkt sich auf vorhandene Scopes,
HTTPziel und Lintform; Providerregistry muss anschließend prüfen.

## 5. Abbruch, Wiederholungen, Parallelität

Synchrones lokales Werkzeug ohne Timeouts/Lock/Retry. Kein Nebenprozess außer
separaten Tests und Operationsskripten. Gleichzeitiges Editing/Apply kann Änderungen
überschreiben; --check sagt nichts über später geänderte Quelldateien. Regeneration
sollte manuell ausgefüllte Formwerte erhalten, tut dies für Pipeline nicht.

## 6. Neustart und partielle Aktionen

Crash/ENOSPC zwischen den beiden Writes kann neues Progress mit altem Pipelineplan
hinterlassen; Neustart besitzt kein Manifest zum Erkennen eines vollständigen
Paares. Quelldateien vor Apply versionieren; langfristig atomare Generation mit
einem eindeutigen Versionszeiger. Kein externer Deployment-/Agentencommit hier.

## 7. Vertrauen und Dateigrenzen

Lokaler autorisierter Nutzer/Repoeditor vorausgesetzt. Projekt-ID wird als Segment
validiert; --swarm/--scaffold sind absichtlich explizite Dateiziele. API-Migration
prüft Realpfad und lehnt externen Symlink ab. Andere Existenzprüfungen sind oft
lexikalisch (z.B. gate instructions/substeps) und keine vollständige Sandbox.
Generierte Commands sind deklarativer Planinput; Scaffold führt sie nicht aus.
Der echte Worker muss Pfad-/Capabilitygrenzen zusätzlich erzwingen.

## 8. Ressourcen und Aufräumen

Datei-/JSON-/Textreads und rekursive TODOsuche ohne eigenes Tiefe-/Gesamtbytebudget;
vertraute lokale Artefakte vorausgesetzt. Verzeichnisse werden synchron gescannt.
Keine automatisch gelöschten Nutzerdokumente, drei beabsichtigte Ausgabedateien.
Benötigt Node/TS-Unterstützung, lesbares .swarm und .git-Marker, nicht zwingend
bereits laufende Kubernetesdienste. Deren Node-Inputanforderungen bleiben Folge-
validation, kein lokaler Deploymentnachweis.

## 9. Architektur und Vereinfachung

Viele einmalige Legacyumwandlungen neben neuem Projectcompiler erschweren einen
eindeutigen Einstieg. Dauerhafte Migration: eine kanonische Producteingabe,
explizites getrenntes Migrationstool und keine fortdauernden stillen Selector-
Übersetzungen. Bis dahin autorisierte Scaffoldedits konsistent mergen oder
Regeneration mit Konflikt ablehnen; nicht neue Eingaben kommentarlos ersetzen.

## 10. Untersuchte und ausgeführte Tests

602 Zeilen `tests/skills/nova/project_setup/progress-scaffold.test.mjs` gelesen;
`node --test .../progress-scaffold.test.mjs` **bestanden**, siehe
[Protokoll](../evidence/nova-batch-scaffold-tests.txt). Reale temporäre Dateien,
Original-CLI, echte tar-Erzeugung im Bundletest; .git ist nur ein Verzeichnis,
kein Nachweis echter Repo-/Pipelineausführung. Tests decken Generierung/Apply,
retirierte Konfigurationen, API-Symlink, Providerinputlinks und Migrationsgrenzen.
Die umfangreichen Provider-Cutovertests sind bei Test-Gates/Providern zu bewerten,
nicht hier als erneut ausgeführt gezählt. Originalprobe
`node docs/review/evidence/nova-batch-scaffold-probe.mjs` bestätigt Verlust einer
vorher eingetragenen URL bei erneuter Generierung. Operationsprüfungen im Anhang.

## 11. Dokumentation

project_setup/SKILL.md empfiehlt weiterhin `pipeline.ts --resume` und
releaseBlueprint, die der neue Entrypoint nicht bietet. progress-json.md mischt
retirierte und neue Suites (z.B. frühere API/A11y-Selectoren, Modelle und
thresholdbasierte Passlogik). **Veraltet und unvollständig**; dortiger
„strict ... stale removed fields“-Anspruch geht über aktuelle Validation hinaus.
Moduledateibeschreibungen dienen weiter als Discoveryorientierung, nicht als
Beweis aktiver Lifecyclepfade. Keine Produktdokumentation hier umgeschrieben.

## 12. PCR-SCAFFOLD-001 — Regeneration verwirft ausgefüllten Providerplan

**Mittel; mit Originalcode und echten Dateien reproduziert.**
`progress-scaffold-discovery.ts#buildScaffold` (Zeilen 649–684) liest prior,
übernimmt dessen Module/Gates/Order, baut pipeline aber allein über buildPipeline
neu aus progress.json und pipeline.json. Noch nicht angewandte Änderungen im
prior.pipeline werden ignoriert; CLI run schreibt dieses neue Scaffold sofort.
Auslöser: Scaffold erzeugen, HTTP-URL ausfüllen, erneut ohne --apply generieren.
Probe zeigt geprüfte URL ersetzt durch TODO. Auswirkung: verlorene manuelle
Providerplanarbeit, wieder blockierender Apply oder unbemerkter Ersatz von
individuell konfigurierten Nodes. Rootfix: prior.pipeline als editierte Quelle
mit expliziter Konfliktstrategie behandeln oder vor Überschreiben abbrechen.
Regression: Original-CLI über generate → edit → generate → check, alle ausgefüllten
Nodekonfigurationen erhalten; gegen echte gespeicherte Vorversion vergleichen.
Weitere Designgrenze: nichtatomare Zweidateipublikation durch echten zweiten
Writefehler/Abbruch prüfen. Operationsbefund separat PCR-SCAFFOLD-OPS-001.
