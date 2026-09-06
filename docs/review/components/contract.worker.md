# contract.worker — neutraler Worker-Core-Vertrag v1

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1. Verantwortung, Grenzen und tatsächliche Nutzung

`contracts/pipeline-worker-core/v1`: sämtliche src-Dateien, Schema und README
untersucht. Das Paket exportiert Types, Digest-, Validierungs- und Trust-Helfer.
Rollenpakete Nova/Buster/Prism enthalten den Vertrag. WorkerAttemptExecutor und
LocalWorkerRuntime importieren und validieren ihn; Buster baut ihn in
`engine/test-gates/runner.ts:1530–1600`; Prism in
`engine/worker-envelope.ts:20–36`, angenommen von `server/worker.ts:150–156`.
Keine Test-/Design-Gate-Entscheidung im Vertrag.

Die Exporte `checkWorkerAttemptMessageBinding`, `checkWorkerCancellationBinding`,
`checkWorkerAttemptEnvelopeConsistency`, `signWorkerTrustEnvelope` und
`verifyWorkerTrustEnvelope` haben nach repositoryweiter Symbolsuchen keine
Produktionsaufrufer, nur Vertragstests. Nicht automatisch als aktive
Sicherheitskontrollen beschreiben. Tatsächliche Source-/Transport-Authentisierung
hat andere Implementierungspfade, die separat reviewt werden müssen.

## 2. Nachrichten und beide Schnittstellenseiten

12 öffentliche Definitionen: Trust-Envelope, Lifecycle-State, Profile,
Registration, Health, Claim, Attempt-Envelope, Progress, LogPart, Cancellation,
EvidenceRef und Result. Schema schließt unbekannte Felder an Nachrichtengrenzen
und begrenzt Sammlungen; registrierbare Zukunftsprotokolle sind erlaubt,
ausführbares v1-Envelope akzeptiert nur worker-protocol.v1.

Ajv-Schema plus relationErrors prüfen Capacity-Summe, aktive IDs, Worker-Typ,
Profile-/Attempt-/Result-Digests, Zeitreihenfolge, Capability-Untermenge,
eindeutige Input-/Paketnamen und Cleanup/Result-Konsistenz. Der Vertrag validiert
nicht automatisch fachliche Specialist-Schemas; deren ID/Digest und Werte
muss die Engine zusammen prüfen. Prism worker-binding tut dies beim Eintritt
und Ergebnis; Buster hat seinen eigenen Provider-Vertrag.

Buster persistWorkerCompletion vergleicht Versuch, Claim, Generation und Worker
mit dem Envelope (`runner.ts:1758–1768`). Prism-Control prüft beim HTTP-Ergebnis
nur state=completed; der neutrale Validator wird dort nicht benutzt. Dieser
Schnittstellenbefund gehört zu [prism.service-control](prism.service-control.md),
nicht zum Schema. Schemaexistenz bedeutet keine Prüfung am Empfänger.

## 3–6. Zustand, Fehler, Retry und Recovery

Nur lazy kompilierte Validatoren im Prozess; keine Persistenz oder externen
Mutationen. Validierung wirft PipelineWorkerCoreContractError bzw. liefert
{ok, errors}; Binding-Helfer setzen bereits typisierte/validierte Inputs voraus.
Es sind keine kombinierten Decoder. Hash-/Validierungsfunktionen synchron;
keine Abort-/Timeout-/Retry- oder Duplikatverwaltung in dieser Komponente.

Profil-Digest schließt sein eigenes Feld aus, Attempt-Digest zusätzlich Claim,
Result-Digest zusätzlich Receipt. Deshalb muss Claim-Änderung separat gebunden
werden. Consistency-Helfer erlaubt nur Verlängerung derselben Claim-Identität.
Lokaler Runtime-Replay-Schutz und persistente Dienst-Idempotenz liegen außerhalb.
Signaturen prüfen Zeit, Issuer/Audience/Purpose und Ed25519-Key; Nonce-Replay-
Speicherung, subject/context-Erwartungswerte und Key-Auswahl bleiben beim Aufrufer.
Kein automatisches Schlüssel-/Receipt-Recovery.

## 7. Vertrauen

Unsignierte Digests sind Integritätsidentitäten, keine Authentisierung.
verifyWorkerTrustEnvelope vergleicht keine vom Aufrufer erwarteten subject/context-
Digests; diese sind zwar mitsigniert, müssten aber fachlich separat gebunden werden.
Derzeit nur testgenutzter Export, kein daraus abgeleiteter Produktionsbypass.
Worker-Core-XFCC-Prüfung liegt in worker.core. Zertifikate/Proxy-Sanitisierung und
Schlüsselbereitstellung sind Infrastrukturannahmen, kein Bestandteil dieses Audits.

## 8–9. Grenzen und Vereinfachung

Schema beschränkt Timer auf Node-Timerbereich und Logs auf 16 MiB; rekursive
JSON-Werte haben lokal Array-/Objektlimits, aber keine globale Tiefe/Bytegrenze.
WorkerAttemptExecutor legt deshalb eigenen Vorfilter (Bytes/Tiefe/Nodes) davor.
Andere direkte Validatoraufrufer müssen den Wire-Body vor Parsing begrenzen.
canonicalJson setzt JSON-artige Werte voraus, keine allgemeine sichere Traversierung
beliebiger zyklischer JavaScript-Objekte. Keine Dateiaufbewahrung/Aufräumaufgabe.

Mehrere unbenutzte Binding-/Trust-Helfer neben manuellen produktiven Prüfungen
sind eine Wartungslücke. Bei späterem Umbau einen kanonischen validierten
Ein-/Ausgangspfad wählen und tatsächlich obsolete Exporte entfernen, ohne
zusätzlichen Kompatibilitätsadapter. Erst Tests und Gegenstellen angleichen.

## 10. Tests und Aussagekraft

`tests/verification/contracts/check-pipeline-worker-core-contracts.mts`
vollständig untersucht und unverändert bestanden: alle öffentlichen Schemas,
zusätzliche Felder, Capacity, Claim-Zeiten, Capability-Untermenge, Timer/Loglimit,
Result-Digest/Status, Binding, Claim-Verlängerung, Unicode-Keyordnung und echte
Ed25519-/RSA-Negativprüfungen. Kryptografie ist echt; Envelope-/Result-Daten sind
Testdaten, kein laufender Worker. `check-worker-trust-spiffe.mts` ebenfalls gelesen
und bestanden; Headerparser-Test, kein mTLS-Handshake.

Fehlende Nachweise: jeder produktive Empfänger muss dieselben Bindings erzwingen;
Stress mit maximaler rekursiver Eingabe; Cross-Language-Digestparität, falls ein
weiterer Worker implementiert wird. Ausführung in `../evidence/worker-contract-tests.txt`.

## 11–12. Dokumentation, Befunde und Unsicherheiten

README spricht noch von zukünftigem Phase-5.5-B-Executor und nur lokaler Buster-
Nutzung. Executor und Prism-Dienst sind längst vorhanden: Status veraltet.
Digest-Auslassungen sind korrekt dokumentiert; konkrete Validator-vs-Binding-
Grenze und tatsächlich ungenutzte Helfer fehlen. Kein neuer bestätigter Fehler
in der neutralen Validatorimplementierung festgestellt. Das ist kein vollständiger
Laufzeitnachweis der Worker-Systeme; deren Einzelreviews bleiben offen.
