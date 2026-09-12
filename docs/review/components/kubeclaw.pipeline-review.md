# kubeclaw.pipeline-review

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1. Verwendung und Grenzen

Manifest registriert `review` / `kubeclaw.report.pipeline-review`, `src/stage.ts`.
In Nova installiert, nur bei expliziter Graphauswahl aktiv; neuer Projectcompiler
verwendet stattdessen die getrennte blocking `kubeclaw.decision.review`.
Hier geht es um einen nachträglichen Bericht über architecture/agents/prompts/
tests/configuration, keine Freigabe von Implementierungen. Vollständig gelesen:
beide Sourcefiles, Manifest, drei Schemas, README und alle drei Pakettests.

## 2. Eingaben, Ausgaben, Gegenstellen

Input runId/attempt/task plus 1–128 kind/digest-Evidenzverweise; config agent,
optional ungenutztes agentRole. Request `kubeclaw.pipeline-review.v2` geht durch
runtime.dispatch. Dessen HTTPadapter (`runtime-dispatch/src/adapter.ts:111–132`)
sendet den Payload unverändert; er bindet dessen fachliche runId nicht neu.
Outputparser erwartet response.result mit status/summary/observations, prüft
alle fünf Dimensionen und ergänzt Identität aus Input. Ergebnisreport wird als
JSONartefakt gespeichert. Kein artifacts.read-Grant: Digests werden weder
aufgelöst noch gegen Coreartefakte geprüft; der Agent sieht hier nur Referenzen.

## 3. Zustand und Nebenwirkungen

Dispatch → Artefaktschreiben `pipeline-review:<input.runId>:<input.attempt>` →
passed. Keine eigenen Journale oder Repoänderungen. Produzentidentität der
Artefaktref kommt vom Core; Berichtinhalt kann davon abweichen (Befund unten).

## 4. Korrektheit und Fehler

Ungültige Agentenform oder Dispatchfehler blockieren unter invalid_report;
Artefaktschreibfehler propagieren. high-Priority-Observation ergibt dennoch passed,
weil dies Berichtfertigstellung, kein Qualitätspass ist. Fehlende Dimensionen und
unbekannte Felder werden abgewiesen. Evidenzgüte wird nicht deterministisch geprüft.

## 5. Zeitlimits, Abbruch und Konkurrenz

Stage hat keine eigene Retry-/Timeoutschleife; Corelease und Adaptereffect
führen diese Semantik. Inputattempt bleibt über Corewiederholungen unverändert.
Keine eigenständige Duplikatsperre. Adapterawait-Abbruch beweist kein Stoppen des
externen Agenten; beim Runtimeadapter separat prüfen.

## 6. Neustart und Commitfenster

Kein Zwischencheckpoint. Crash nach Dispatch/Artefaktwrite erfordert bestehende
Effectsreceipts und Core-Recovery; PCR-EXEC-002 kann Artefaktprojektionen verlieren.
Nicht als eigene zweite Defekt-ID wiederholt. Transcript-/No-output-Recovery
wird im README ausdrücklich als offen geführt.

## 7. Vertrauen

Grants begrenzen Agent und Schreibnamespace, Secrets bleiben im Runtimeadapter.
Das ist kein Beweis für die gelieferten Evidenzdigests oder Berichtwahrheit.
Caller darf aktuell eine fremde Run-ID im Bericht erzeugen; daraus folgt keine
Umgehung der Artefakt-ACL, wohl aber widersprüchliche Provenienz.

## 8. Ressourcen

Task maximal 32768 Zeichen, 128 Referenzen, Summary 8192, 5–128 Observations je
Finding 8192. Transport- und Storequoten können früher blockieren; kein Streaming
oder eigener Retentionprozess. Node, installierte Pluginpakete, freigegebener
Runtimeendpoint und persistenter Artefaktstore erforderlich.

## 9. Vereinfachung

Kleine Pipeline sauber getrennt vom entscheidenden Reviewplugin. Ausführungsidentität
soll aus dem Lease stammen, historisches Berichtziel davon getrennt sein. Falls belastbare evidence-pinned
Reviewqualität beabsichtigt ist, Referenzen zentral lesen/validieren und die
Inhalte über einen begrenzten Evidenzvertrag liefern; kein paralleles
agenteneigenes Nachschlagen unbekannter Digests.

## 10. Tests

`npm test` im Paket umfasst protocol.test.mjs, live-function.test.ts und
package-boundary.test.mjs; alle gelesen. Ergebnis im
[Originaltestprotokoll](../evidence/nova-batch-pipeline-review-tests.txt).
Live-Test nutzt Originalregistry, Dispatch-/HTTP-/Secret-/Artefaktadapter und
einen lokalen Server mit fester Antwort; kein echter Agent. Der Test führt
`runner.run('run:pipeline-review')` mit `input.runId='run-1'` aus und erwartet
explizit das Artefakt `pipeline-review:run-1:1`; somit wird die unten genannte
Abweichung im Originaltest bereits akzeptiert. Keine Crash-/Deadline-/LLMabnahme.

## 11. Dokumentation

README-Aussage „Reports must match the active run and attempt“ ist **veraltet/
falsch**; Source bindet Inputidentität, nicht Lease. „evidence-pinned“ ist nur
syntaktisches Digesttransportieren, kein Inhaltsnachweis. Dokumentation zu
Agentenparität und offenen Runtimeprüfungen bleibt zutreffend.

## 12. PCR-PREPORT-001 — Calleridentität statt aktiver Run-/Attemptbindung

**Niedrig; nachgewiesener Dokumentations-/Provenienzvertragsdefekt durch Code und bestehenden Originaltest.**
`src/protocol.ts:10–13,31`, `src/stage.ts:7–15` übernehmen Inputidentität ohne
Vergleich mit `context.contract.lease.attempt`; Runtime-HTTP sendet sie unverändert.
Auslöser: Graph für Run B enthält Berichtinput Run A oder ein neuer Attempt
verwendet die alte input.attempt. Parser ergänzt A, Artefaktname enthält A,
Coreproducer bleibt B. Auswirkung: falsch zugeordnete Berichte/Auditinterpretation;
kein behaupteter ACLbypass. Gleiche Ursache in
[case-study](kubeclaw.case-study.md), `src/protocol.ts:5–6,21`, stage.ts.
Ursachenbehebung: Berichtziel (auch historischer Run zulässig) und ausführenden
Run/Attempt ausdrücklich unterscheiden. Ausführungsidentität aus Lease ableiten;
angefragte historische Identität als solche kennzeichnen, Dokumentation und
Evidenzbindung an diese Semantik anpassen. Historische Reports nicht verbieten.
Echter Regressionstest: bestehende Realadaptertests mit Run A/B und zwei echten
Coreattempts erweitern, Artefaktinhalt und Producer auf Gleichheit prüfen.
Zusätzlich offene Qualitätsfrage: Welche Instanz liefert dem Reviewer die
Inhalte der nur als Digests übergebenen Evidenz? Ein Formatpass beantwortet das nicht.
