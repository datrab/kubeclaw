# nova.observability — Wiederanlaufentscheidungen für Worker-Belege

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Review-Schema Revision 3. Vollständige Implementierung
`skills/nova/core/observability/reconciler.ts` und 439-zeiliger direkter Test gelesen.

## 1. Verantwortung und tatsächliche Verwendung

NovaObservabilityReconciler ordnet dauerhafte Workergebnisse Run/Plan/Node/Attempt/
Claim zu und protokolliert Wiederanlaufentscheidungen. Export in core/src/index.ts:77.
`engine-run.ts:51–63` ruft reconcileNovaObservabilityOnRecovery unter Runmutation-
Lock vor Graphwiederaufnahme auf. Ohne reconciliation-plan.json sofort leere
Antwort. Repositoryweite Suche nach persistNovaObservabilityPlan und Dateiname:
Planproduzent nur im eigenen Vertragstest, kein produktiver Dispatcheraufruf.
Engine verwirft den Rückgabewert der Entscheidungen und rekonstruiert anschließend
Lifecyclezustand aus events.jsonl. Das ist ein verfügbarer Persistenz-/Recoveryhook,
keine nachgewiesene aktive Zuordnung dieser Entscheidungen in die Stagegraphik.
Nova Remote-Dispatch/-Import verwenden eigenständige RecordStorepfade; sie sind
separate Test-Gate-Komponenten, keine stillschweigende Verwendung dieses Plans.

## 2. Eingaben, Ausgaben und Gegenstellen

ReconciliationAttempt enthält Run, Plan/Node, Attempt, Claimgeneration/ID, Worker,
Claimexpiry, Gateklasse und erwartete Producerclosures. Result ist Entscheidung
(imported/already-imported/reconnect/requeue/stale/identity mismatch/degraded/
blocked), optional result/completeness und nächste Generation. Plan muss zum
Run passen; Parser prüft Version/Array/Plan-Node, nicht vollständiges Laufzeitschema.
Die interne API erwartet TypeScript-Vertrag; fremde Planwriter dürfen daraus
keine vollständige Autorisierungs-/Validierungsgrenze ableiten.

Buster.runner:1780–1882 speichert Evidence, bindet neu berechneten Resultdigest
an CompletionIntent und Owner. Reconciler liest Store.snapshot, wählt höchste
Generation und prüft Plan/Node/Claim/Worker. Fehlender Intent bzw. undeclared
Intentclosure verhindert vollständigen Import; Finalgate ohne erwartete Closure
scheitert schon am Eingang. Foundation.resumeCompletion nimmt Record auf und
schreibt Closure, evaluateCompleteness liest erforderliche Evidencebytes erneut.
Deren unverifizierter Metadatareplay: [PCR-OBS-001](foundation.observability.md).

## 3–4. Zustand, Seiteneffekte und Fehler

Planwrite verwendet atomaren durable-state-Writer, ersetzt ganze Datei ohne
inhaltliche Versions-/CAS-Konkurrenzkontrolle. Reconcile journalisiert je
Decisionkey (Run/Plan/Node/Attempt/Generation/Resultdigest/Action) hashverkettet.
Idempotenter erneuter imported wird already-imported. Keine Provider-/Agent-
Ausführung, kein automatisches tatsächliches Requeue und kein Lifecycleevent
als Nebenwirkung; die Namen beschreiben Entscheidungen.

Pending Result wird durch storeResult erneut versucht. Fehler lässt pending;
bei uncommitted/zu spät gespeichertem Result Entscheidung requeue. Bei fehlendem
Result und noch lebender Claim reconnect, nach Ablauf nächste Generation.
Admission-/Closurefehler werden abgefangen; Completeness entscheidet sichtbar
partial. development erlaubt continue-degraded, safety-critical/final blockieren.
Sonstige Store-/Schema-/Journalfehler verlassen den Aufruf, ohne gefälschten Erfolg.

## 5–6. Parallelität, Zeit und Wiederanlauf

Gesamtscan arbeitet auf kopierter Erwartungsmenge und einmaligem Resultsnapshot;
Storeoperationen selbst sind gesperrt. Direkte parallele reconcile-Aufrufe
haben keinen übergreifenden Snapshotlock. Produktiver Engineaufruf besitzt
Runmutationlock; direkter API-Nutzer muss gleiche Exklusivität sichern.
Journal.transact schützt Dedupe, trägt jedoch [PCR-STATE-002](nova.state.md).
Nachprüfen von mapped Node erfolgt vor Resultscan und ist kein eigener CAS.
Kein AbortSignal; Dateisystem-/flockzeit und Journaloperationen begrenzen nicht
den gesamten Recoverylauf. Clock now injizierbar, Commitzeit kommt vom echten
Store; Claim ist absolute Zeit. storedAt >= expiry führt zu requeue, auch genau
am Rand. Neustart verwendet Plan/Result/Intent/Journal, nicht Arbeitsspeicher.
Partielle Aufnahme kann über persistierten Intent ohne Provider-Neuausführung
fortgesetzt werden. Result-/Closureintegrität hängt von Foundation-Replay ab.

## 7–9. Vertrauen, Ressourcen und Architektur

Keine eigene Authentifizierung. Plan, Storereferenzen und gewünschte Identitäten
sind Core-/Operatorinput; geschützte runlokale Filesystemwurzel vorausgesetzt.
Keine neue Remote-Schnittstelle. SHA-Journal bestätigt Historie, keinen externen
Workerpublisher. Evidence-Fakten sind keine Berechtigung zur Lifecycleänderung.
Embedded-Profil: bis 100000 Results/Closures/Evidenceobjekte, 10 GiB Evidence,
1 GiB Objekt/Attemptmetadata; Admission bis 1M Records/4 GiB, Quarantäne 1 GiB.
Das sind Speichergrenzen, kein Nachweis RAM-tauglichen Full-Snapshot-Replays.
Keine eigene Retention; [PCR-OBS-002](foundation.observability.md).

Der nicht angeschlossene Planwriter und ignorierte Entscheidungsrückgabewert
sollten bei späterer Architekturarbeit zusammen mit dem heutigen Remoteimport
bewertet werden. Entweder klar abgegrenzte aktive Verantwortung anschließen oder
überflüssigen Zwischenpfad entfernen; keine dritte Recovery-/Kompatibilitäts-
schicht. Jetzt keine Funktionsänderung. Die Benennung imported sollte in der
Dokumentation ausdrücklich von tatsächlicher Stagezustandsübernahme getrennt sein.

## 10. Tests und Aussagekraft

`check-pipeline-observability-nova-reconciliation.mts` vollständig gelesen und
unverändert bestanden: 20 synthetische Workerresult-Vertragswerte über echte
Stores/Journal, gemischte Reihenfolge, Neustart nach 10 Imports, Idempotenz,
Owner/Nodekonflikt, fehlende Closure, development/final, Claimexpiry und
zurückgesetzter Pendingmarker. [Protokoll](../evidence/nova-observability-tests.txt).
Keine 20 gestarteten Worker; keine Agent-/Providerergebnisse. Dateimutation für
Pendingzustand ist explizite Crashzustandsvorbereitung, kein SIGKILL-Nachweis.
Fehlen: produktiver Planwriter/Graphübernahme, konkurrierende direkte Reconciler,
volles RAM-/Diskbudget und korruptes Replay. Keine neue CI, kein Cluster.

## 11. Dokumentation / frühere Audits

Keine lokale Betriebs-README. phase-5-7-final-audit.md gelesen: Import/Reconnect/
Requeue und strengere Finalklasse sind als Algorithmus implementiert, der letzte
Absatz erklärt fehlende Plan-/Graphverknüpfung. Frühe pauschale Aussagen „Nova
imports each result once“ ohne diesen Vorbehalt sind missverständlich.
Enginekommentar „Phase 7 persists … before dispatch“ ist am aktuellen Aufrufgraph
nicht belegt. Blueprint-Evidenzmatrix ist Zuordnung, keine Betriebsanleitung.
Dokumentation insgesamt unvollständig und stellenweise veraltet; frühere
„pipeline-side complete“-Aussage kein heutiger produktiver E2E-Beleg.

## 12. Befunde und offene Verifikation

Keine Duplikate für Journal-/Storefehler: PCR-STATE-001/002 und PCR-OBS-001/002
bei ihren Eigentümern. Kein zusätzlicher unabhängig reproduzierter Defekt dieses
Entscheidungsalgorithmus. Noch nicht beantwortete Produktentscheidung: Rolle
des unverbundenen Planpfads gegenüber heutigem Remoteimport. Konkrete spätere
Verifikation nur bei dessen beabsichtigter Aktivierung: echten Dispatcherplan
persistieren, Prozess nach durable Result stoppen und nach Wiederstart genau
passende Stage übernehmen, ohne Provider erneut auszuführen. Dieser Einzelreview
hat alle vorhandenen Implementierungspfade untersucht, nicht diesen fehlenden
Produktablauf als erfolgreich ausgegeben.
