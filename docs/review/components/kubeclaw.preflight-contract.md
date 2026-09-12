# kubeclaw.preflight-contract

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1. Verantwortung und Verwendung

Nova-Stage validate / kubeclaw.validate.preflight-contract → src/stage.ts.
Explizit ausgewählter deterministischer Forgeblueprint-Check, keine Containerbuild-
Ausführung. Kompletten Source, Manifest, Schemas, README und drei Tests gelesen.
Neuer Projectcompiler erzeugt diese Stage nicht; das widerlegt nicht Verwendung
in expliziten Graphen/älteren Projektabläufen.

## 2. Schnittstellen

Input moduleId/modulePath/ownedPaths/serveDockerfile/apiSpecFile plus optionale
substeps. Leere substeps im Schema verboten; Stage prüft zusätzlich. Blueprint
über git.repository.read/read_text, Empfänger repository-adapter/src/adapter.ts
prüft Realpfad, Dateityp und Größenlimit. Einzeldokument oder sequenziell gelesene
Substep-FORGE.md werden zu Text zusammengeführt. validateDeclarations sucht
Dockerfile/API-Basenamen. Ergebnisreport enthält moduleId/passed/failures und
wird via artifacts.write gespeichert. passed, request_fix bei fehlender
Deklaration, blocked bei fehlender Datei/ungültigem Pfad sind getrennt.

## 3. Zustand und Nebenwirkungen

Nur Lesecapability und immutable Reportwrite; keine Gitänderung/Builds. Report
vor Stageabschluss. Wiederholung schreibt attemptgebundene Referenzen; keine
eigene Cacheliste. Gelesener Text ist Worktreeinhalt, kein festgefrorener Commit.

## 4. Korrektheit

Pfadprüfung lehnt absolute Pfade, Laufwerkpfade, Traversal und NUL/Zeilenumbrüche
ab; Adapter ergänzt Symlink-/Rootgrenze. Fehlercode nach Readfailure wird als
blueprint_missing/path_invalid/substep_invalid klassifiziert, einschließlich
Transport-/Zugriffsfehlern. Das ist fail-closed, aber nicht präzise Fehlerdiagnose.
Fachliche Deklarationsprüfung ist nur Substringsuche; PCR-PREFLIGHT-001 unten.

## 5. Abbruch, Wiederholung und Parallelität

Keine eigenen Timer/Retries. Jede Read-/Writeoperation unter Corelease; große
Substeplisten können viele sequenzielle Reads verursachen. Gleichzeitige
Worktreeänderungen können verschiedene Versionen der Substeptexte mischen;
kein Snapshotprotokoll. Antrag auf Reparatur über Graph/on.request_fix, nicht
plugininterne Endlosschleife.

## 6. Neustart

Erneuter Attempt liest aktuelle Dateien neu, kein eigener persistierter
Blueprintdigest. Crash nach Report, vor Result gilt unter Coreprojektion
PCR-EXEC-002. Keine externe irreversible Aktion, deshalb keine eigene
Reconciliationlogik erforderlich.

## 7. Vertrauen

Repositorygrants/Realpfadprüfung beschränken Lesezugriff; keine Secrets. Input-
Ownership wird nur als Callerbehauptung verglichen. API-Spec wird immer geprüft,
Dockerfile nur wenn ownsPath es als eigenes erkennt (exakt oder Suffix, keine
allgemeine Directoryprefixsemantik). Zeichenketteninhalt ist untrusted Blueprint,
keine belastbare strukturierte Lieferzusage.

## 8. Ressourcen

Repositoryadapter begrenzt eine Datei standardmäßig auf 4 MiB. Inputschema
begrenzt weder Substepanzahl noch summierte Textbytes; zusammengeführter Speicher
kann deutlich größer sein. Outer lease begrenzt Dauer, nicht synchrone
Textallokation. Keine Retention im Plugin; Artefaktstore verwaltet Reportquote.
Node, Repositoryvolume und Store erforderlich, keine laufende Buildinfra.

## 9. Architektur

Einfacher Capabilitypfad sinnvoll; strukturierte verbindliche Deliverables wären
robuster als heuristische Textprüfung. Zusammenfassung mehrerer Substeps verliert
Zuordnung, welcher Substep welche Datei liefern muss. Eine spätere Neufassung
soll dieselbe Deklarationsquelle für Compiler/Forge/Prüfer verwenden.

## 10. Tests

`npm test` **bestanden** (Boundary, declarations.unit, live-function):
[Protokoll](../evidence/nova-batch-preflight-contract-tests.txt).
Echte Dateien, Repositoryadapter, Registry, Store und Runner; kein Agent/Missing-
Infra-Mock. Pass, fehlende API-Deklaration, fehlende Dateien, Traversal und
Substeps getestet. Zusätzlicher Originalfunktionsaufruf:
`node docs/review/evidence/nova-batch-preflight-probe.mjs` **bestanden als
Defektreproduktion**, Ausgabe negativeDeclarationAccepted=true. Keine neue
Ersatzimplementierung. Keine Tests für Crash/mutierende Worktrees/Gesamtbytebudget.

## 11. Dokumentationsabgleich

README nennt „verifies ... deliverables are declared“; tatsächlich beweist der
Code nur Basenamenvorkommen. Dokumentation damit **unvollständig/überstark**.
Containerbuildbeschreibung ist separate produktive Testplanroute, nicht hier
ausgeführter Build. Die Testbeschreibung zu echten Dateien stimmt.

## 12. PCR-PREFLIGHT-001 — Dateinennung wird als Lieferdeklaration akzeptiert

**Mittel; nachgewiesener Defekt der deklarierten Preflightaussage.**
`src/stage.ts`, validateDeclarations, insbesondere `content.includes(name)` in
beiden Zweigen (Zeilen 84–102 am Baseline). Auslöser: gültiger Blueprinttext
„Do not deliver Dockerfile or openapi.yaml. These files belong to another project.“
bei Input mit diesen eigenen Dateien. Originalfunktion liefert keine Failure.
Auswirkung: fehlende oder explizit ausgeschlossene Deliverables passieren den
Preflight; außerdem genügt gleichnamige Datei an anderer Stelle. Dies behauptet
keine spätere erfolgreiche Build-/Reviewumgehung. Lösung an der Ursache:
maschinenlesbare normalisierte Deliverablepfade als gemeinsame Quelle prüfen,
Prosa als Erklärung behalten. Echter Regressionstest: solche negierten/fremden
Basenamen durch vorhandenen Realdatei-/Runnerpfad führen, bis ausschließlich
explizite richtige Pfaddeklarationen bestehen. Ownership-Verzeichnisse und
Substepzuordnung dabei separat spezifizieren.
