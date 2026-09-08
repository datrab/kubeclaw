# kubeclaw.case-study

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1. Verantwortung und Verwendung

Nova-Manifest registriert case-study / kubeclaw.report.case-study auf src/stage.ts;
Ausführung nur durch ausgewählten Graphen, nicht Teil des neuen Projectcompilers.
Berichterstellung, keine Veröffentlichung. Beide Sourcefiles, Manifest, Schemas,
README und sämtliche Pakettests untersucht.

## 2. Verträge und Gegenstellen

Input projectId/runId/task/facts; config agent. protocol.ts sendet
kubeclaw.case-study.v2, Identität, Fakten, sechs Sections und Groundingregeln über
runtime.dispatch. HTTPadapter transportiert Payload unverändert. response.result
muss status=generated und markdown enthalten; Identität ergänzt der Parser aus
Input. Verbotene fremde Outputfelder werden abgewiesen. Returnwert wird JSON,
nicht eine Markdown-Datei, im Artefaktstore. Kein Consumer kann aus generated
allein eine inhaltliche Verifikation ableiten.

## 3. Zustand und Nebenwirkungen

Agentdispatch, dann artefacts.write unter kubeclaw.case-study und
case-study:<input.runId>; anschließend passed. Keine direkte Dateiarbeit,
Veröffentlichung oder Änderung am Projekt. Core vergibt Produceridentität.

## 4. Korrektheit und Fehler

Parser prüft NUL/CR, Länge und Reihenfolge/einmaliges Vorkommen der sechs
`## Section`-Teilstrings. Er prüft weder tatsächliche Markdown-Headingstruktur
noch nichtleere Abschnittsinhalte oder Faktentreue. Dispatch-/Parsefehler ergeben
blocked/case_study.invalid_output; Speicherfehler propagieren. generated/passed
bedeutet ausschließlich Bericht erzeugt. Runbindung siehe PCR-PREPORT-001.

## 5. Timeout, Abbruch und Duplikate

Keine eigene Timeout-/Retry-/Rate-Limitlogik. Coreattempt, Lease und Runtimeadapter
sind zuständig; statische input.runId ändert sich bei Retry nicht. Effectreceipts
müssen externe Wiederholung begrenzen; abgebrochenes Promise ist kein Agentenstop.

## 6. Recovery

Kein Zwischencheckpoint nach Agentenantwort. Crash nach Artefaktwrite kann ein
unreferenziertes Objekt zurücklassen; PCR-EXEC-002 aus Core gilt auch hier.
Transcript-/Outputwatcher-Recovery ist laut README nicht Bestandteil des Plugins.

## 7. Vertrauen

Agent und Namespace durch Grants begrenzt, Token im Runtimeadapter. facts sind
caller-owned Zeichenketten, weder unveränderliche Coreevidenz noch gelesene
Artefaktinhalte. „Do not invent“ im Prompt ist keine Verifikation. Reportidentität
ist ebenfalls Callerinhalt; [PCR-PREPORT-001](kubeclaw.pipeline-review.md)
führt die gemeinsame Provenienzlücke zentral.

## 8. Ressourcen und Retention

Task 32768 Zeichen, 1–256 Fakten, Labels 256 und Werte 8192, Markdown maximal
131072 Zeichen. Grenzen sind Zeichen, nicht Bytes; äußere Transport-/Storelimits
gelten zusätzlich. Keine lokale Cache-/Retentionlogik. Node, Runtimeagent und
persistenter Artefaktadapter erforderlich.

## 9. Architektur

Kleine reine Protokoll-/Stagegrenze sinnvoll. Gemeinsame Leaseidentität und
strukturierte Quellenverweise würden widersprüchliche Provenienz vermeiden.
Für tatsächliche Mindeststruktur sollte ein deterministischer Markdownparser
Headings und Abschnittsinhalt prüfen; dessen Erfolg wäre weiterhin kein
Faktualitätsnachweis. Keine Kompatibilitätsschicht notwendig.

## 10. Tests

Gelesen: protocol.test.mjs, live-function.test.ts, package-boundary.test.mjs.
`npm test` ausgeführt; Ergebnis:
[Originaltestprotokoll](../evidence/nova-batch-case-study-tests.txt).
Protocoltest prüft Outputfelder und doppelte Section. Live-Test verwendet echte
Adapter/HTTP/Secrets/Artefaktstore, festen lokalen Server ohne Agenten. Er ruft
run:case-study mit input.runId=run-1 auf und erwartet Artefakt case-study:run-1:
Originalnachweis der Identitätsabweichung, kein Beleg korrekter Bindung.
Keine echte Writerqualität, Quellenprüfung, Crash- oder Neustartabnahme.

## 11. Dokumentation

README beschreibt die offenen Agenten-/Faktualitätsnachweise korrekt.
Aussage zur Korrelation beschreibt nur den angeforderten Callerinput; eine
Corebindung, wie im Prompt behauptet, fehlt. Status **vorhanden, unvollständig**
zu Provenienz und tatsächlicher bloßer Teilstring-Sectionprüfung.

## 12. Befunde und Folgeprüfungen

Keine doppelte ID: PCR-PREPORT-001 umfasst diese Implementierung
(`src/protocol.ts:5–6,21`, `src/stage.ts:5–10`). Niedriggradige unklare
Provenienzaussage; Rootfix Berichts-/Ausführungsidentität unterscheiden, Regression mit echten A/B-Runcontexts.
Offene Qualitätsgrenzen: Inline-/Codeblockmarker und leere Sections sowie
unbelegte Fakten durch Originalparser/echten Writer testen. Aktuell kein
verifizierter Faktualitäts- oder Veröffentlichungsfreigabenachweis.
