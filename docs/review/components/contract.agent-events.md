# contract.agent-events — Agent-Observability-Bridge v1

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Review-Schema Revision 2; alle sechs src-Dateien, Paket-/Builddateien, README und
vollständiger validation.test.ts untersucht.

## 1–2. Verantwortung, Verwendung und Gegenstellen

`contracts/agent-observability/v1/src/index.ts` exportiert Wiretypen, Konstanten,
handgeschriebene Validierung, Streamrouting und deklarative Telemetriemappings.
13 Ingress-Ereignisse, 12 Hooks plus model.usage-Diagnostic. Version 1 und
fester Source-String; Eventtyp muss zum Payloadhook passen. Optionaler Run/
Session-/Dispatchbezug; Toolereignisse verlangen Tool- und Modelcall-ID.
LLM-/Toolinhalte gehen in payload, übrige Ereignisse in control; Redisfeld data.
Mapping ist Metadatenbeschreibung, keine tatsächlich ausgeführte Promotion.

Tatsächlicher Produzent: OpenClaw-Extension hook-normalizers.ts:126–155 ruft
assertAgentObservabilityIngressEvent auf. redis-writer.ts:122–153 misst Bytes,
wählt Stream und serialisiert. Extension importiert eine selbständig ausgelieferte
Kopie unter src/generated/agent-observability, erstellt durch sync-contract.mjs
als vollständige Kopie dieser Quelle. Im lokalen Checkout ist diese generierte
Kopie noch nicht vorhanden; keine Gleichheit oder ausgeführte Extension behauptet.
Rollenmanifeste liefern zusätzlich das neutrale Paket für nova/buster/prism aus.

Empfängerseite: Repositoryweite Suche nach Paketimport, Validator/Mappingnamen,
Streamschlüsseln und Ingresstypen (Produktcode/Skripte außerhalb Vertrag,
Extension und generierten Verzeichnissen) findet keinen aktiven Ingressconsumer.
`agent-observability/src/observers.ts` konsumiert bereits kanonische v2
ObserverDelivery und ruft telemetry.emit/artifacts.write; `openclaw-agent-events`
normalisiert direkte Hooks zu v2 Plugin-Domainevents. Beide sind keine Empfänger
dieser Redis-Wireform. Deshalb: aktiv als Extension-Producervertrag, behauptete
Pipeline-Promotion im Repository nicht nachgewiesen; kein endgültiges Urteil
über einen möglichen außerhalb dieses Repositorys betriebenen Consumer.

## 3–6. Zustand, Fehler, Parallelität und Wiederaufnahme

Reine Funktionen ohne Store, IO oder Retry. Validator liefert ok/errors bzw.
assert wirft ContractError. Timestampprüfung validiert RFC3339-Kalendertag,
Offset und ECMAScript-Darstellbarkeit; Schaltsekunden ausdrücklich ausgeschlossen.
JSON-Sicherheitsprüfung erkennt zyklische Arrays/Objekte und nichtendliche Zahlen,
hat aber kein Tiefenbudget (Befund unten). Unbekannte Identityfelder abgewiesen,
äußere Event-/Payloadfelder nicht generell geschlossen. Optional nullable
Identitywerte sind runtime weiter als die TypeScript-Optionen.

Keine Event-ID, Sequenz, Claim oder ACK im Wirevertrag. Genau-einmal-Zustellung,
Lückenbeweis und Wiederanlauf können daraus nicht abgeleitet werden. Extension
hat separate flüchtige Dedupe-/Queuezustände; Control-XADD kann wiederholt werden.
Keine Vertragsgarantie für atomare externe Aktionen oder Terminalabschluss.

## 7–9. Vertrauen, Ressourcen und Architektur

Source-String ist keine Authentifizierung. Identitäts-/Runzuordnung und Redis-
ACL/TLS müssen an Transport/Consumergrenzen nachgewiesen werden; Infrastruktur
hier nur als Folgeprüfung. Rohprompts, History, Toolparameter und Resultate sind
zulässig, der Vertrag redigiert sie nicht. Separater Stream ist kein Datenschutz-
oder Aufbewahrungsnachweis. Größe wird durch explizites checkPayloadSize geprüft,
nicht vom Validator; konfigurierbarer positiver Wert bis absolut 5 MiB. Messung
serialisiert erst das komplette Event. Keine eigenen Timer, Löschung oder Retention.
Mappings sind außen eingefroren, Einträge nicht tief immutable; aktuell keine
produktiven Mapping-Aufrufer gefunden, deshalb kein behaupteter Zustandsdefekt.

Begrenzte Brücke ist nachvollziehbar, aber zwei Agentpfade plus unbenutzte
Promotionsmetadaten verschleiern Zuständigkeit. Erst vorhandenen Consumer und
Migrationsziel klären, danach obsolete Formen entfernen; kein zusätzlicher
Adapter nur zur Rettung veralteter Dokumentationsaussagen.

## 10. Tests

Pakettest und Typecheck unverändert bestanden:
[agent-contract-tests.txt](../evidence/agent-contract-tests.txt).
Test prüft Zyklusabwehr und gültige/ungültige Zeitformate, keine vollständige
13-Typenmatrix, Bytebudget-, Routing- oder unbekannte-Felder-Matrix.
Extension-Syncscript, Produceraufrufe und Paketboundarytest gelesen, letzterer
nicht ausgeführt (generierte Quelle nicht hergestellt). Keine Redis-/OpenClaw-
Integration, kein Empfang oder Promotion als Laufzeittest bestätigt.

## 11. Dokumentation / frühere Befunde

README veraltet/unvollständig: pauschale Behauptung, Pipeline validiere/promoviere
in contracts/telemetry/v1, findet keinen aktuellen Implementierungsbeleg.
Raw-Content-Retention, fehlender Consumer und Synchronisierung fehlen.
Historische Bestandsaufnahme pipeline-observability-phase-5-7-a-inventory.json:
217–230 nennt fehlendes dauerhaftes ACK/Closure/Replay; am Wireformat weiterhin
bestätigt. Die dort behauptete optionale Projektion belegt keine aktuelle
Verdrahtung dieser Brücke. Keine Übernahme historischer Test-Erfolge.

## 12. Befund und Restunsicherheiten

### PCR-AGENT-CONTRACT-001 — Tiefe gültige JSON-Nutzlast überläuft Validatorstack

- **Mittel, nachgewiesener Defekt:** Validierungs-API wirft unerwartet statt
  ungültige/zu komplexe Eingabe kontrolliert abzulehnen; Prozessabsturz nicht
  behauptet, weil Aufrufer den Fehler abfangen können.
- **Beleg:** src/validation.ts:71–83 rekursives isJsonSafe ohne Tiefe/Nodes;
  validatePayload:211–220 prüft metadata vor jeglicher Bytebegrenzung.
- **Auslöser/Ablauf:** JSON.parse erzeugt etwa 20 KiB gültiges JSON mit 10000
  verschachtelten Arrays in metadata; Validierung läuft in RangeError.
  Originalvalidator: [Reproduktion — historischer Stand](https://github.com/datrab/kubeclaw/blob/815b7edea4af1e23ef7b40b43806db6741fb0007/docs/review/evidence/agent-contract-depth.mjs),
  Ausgabe im Testprotokoll. Kein Mock und kein geänderter Runtimecode.
- **Auswirkung:** zulässiger Größenrahmen schützt nicht vor Diagnoseverlust/
  Ausnahme an Normalisierungsgrenze; ein künftiger Ingressconsumer wäre ebenfalls
  betroffen. Über konkreten bestehenden Remoteangriff keine Aussage.
- **Ursachenbehebung:** explizites Tiefen-/Knotenbudget bereits während
  Validierung, kontrollierter Fehler, keine stille Nutzdatenkürzung.
- **Regression:** Originalvalidator mit knapp erlaubter/überschrittener Tiefe,
  Zyklen und wiederverwendeten nichtzyklischen Referenzen; normaler Hookpfad muss
  weiterhin vollständig validieren. Repro nach Fix auf ok=false ohne Throw ändern.

Consumerverbleib ist eine offene Architekturfrage, keine behauptete unbesichtigte
Implementierung. Lifecycle-/Writerdetails gehören zur Extensionreview.
