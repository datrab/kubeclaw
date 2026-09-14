# SDK: lokaler Abgleich der gekoppelten Verbraucher

Ausgangsstand: PR #6, `e5d4079f997f2fba0858aaa181f093e3178ad7fe`,
Tree `8c470f71c94f6055b523cdab76f042b26e96c689`. Der vorhandene SDK-/Review-/
Delivery-Produktcode wurde nicht erneut umgeschrieben. Der lokale Prüfpfad wird
an die bereits integrierte, explizit versionierte Produktkomposition angeglichen.

**PCR-SDK-001 ist damit nach D12 lokal abgeschlossen. Gesamt:131 verifiziert,
3 unvollständig,1 in Bearbeitung,19 offen. Von den sieben sind3 abgeschlossen.**

## Korrigierte Testkopplung

Der ursprüngliche semantische Summary-Test wählte bei `buildSummary` keinen
Delivery-Modus. Das wählt absichtlich das historische v2-Format. Der Test verlangte
trotzdem identische neue Digests in Englisch und Tschechisch. Genau dieser
Widerspruch trat frisch auf: en `adee8369…`, cs `7757bf62…`. Das ist kein Beleg,
dass der heutige Produkt-CLI noch v2 für neue Projekte auswählt: `project/cli.ts`
übergibt bereits ausdrücklich Source-, Report-, Review-Semantik- und Delivery-
Version. Historische Recovery liest ihre jeweils gespeicherte Auswahl.

Die bestehende Summary-Fixture verwendet jetzt genau die explizite Delivery-v3-
Auswahl und äußere Reportkodierung dieses Produktpfads. Sie prüft zusätzlich
`delivery-manifest.v3`. Keine Digestgleichheit, Herkunftsprüfung oder negative
Assertion wurde entfernt. Die beiden ursprünglichen APIs ohne Modus behalten
historische Bytes; weder Produktserializer noch gespeicherte Historie werden
stillschweigend migriert. Fehlender/falscher semantischer Modus und entfernte
Artefaktkodierung bleiben Ablehnungen.

## Lokale Nachweise

- SDK-/Semantikgruppe:13/13 ohne Skips. Originale JSON-Domänenablehnung,
  ArtifactStore, FileEffectJournal, Sourceconsumer, Compiler/Recovery,
  Policy-/Evidence-/Reduction-Owner und Summary. Die gleiche gespeicherte neue
  Summary wird in en/cs mit Digest `63d0d45f…` gelesen. Innere Policyquellen und
  erzeugte Simplification-Evidence behalten ihre explizite Kodierung. Proxy,
  Getter, falsche Provenienz, mutierte Bytes und gemischte Versionen scheitern.
- Historiengruppe:11/11 ohne Skips. Originale Effect-/Adapter-Replays,
  gespeicherte alte Journale, portable Source in beiden Sprachrichtungen,
  erlaubte historische ASCII-Recovery sowie abgelehnte unverifizierbare alte
  Unicodebindung. Ein archivierter alter Producer reproduziert ausdrücklich
  den alten Defekt; dieser Negativbeleg wird nicht als reparierter Altproducer
  ausgegeben.
- Delivery-Gruppe: Compiler/Recovery und ursprünglicher registrierter
  Summary→Artefaktspeicher→Importconsumer bestehen. Fünf Leser-Sprachumgebungen
  erreichen den verifizierten Import; falsche Referenz-/Body-/Herkunftsangaben
  werden an den jeweiligen ursprünglichen Grenzen abgewiesen.
- SDK-Pakettests und kanonischer Lint der geänderten Fixture bestehen. Der neue
  Einstieg `npm run verify:sdk:local` fasst die geprüften Originaldateien mit
  serieller Dateiausführung zusammen. Seine Komponenten wurden in den separat
  protokollierten Gruppen geprüft; kein zusätzlicher Gesamtlauf dieses neuen
  zusammengesetzten Befehls wird behauptet.

Der erste parallele Deliverylauf bestand3/5 und scheiterte in der Cancel-
Vorbereitung sowie an SIGTERM statt des erwarteten SIGKILL. Der letztere Fall
traf die vorhandene30-Sekunden-Prozessgrenze. Beide Fehler bleiben im Rohlog.
Die beiden Fälle bestehen im separaten seriellen Lauf2/2 mit unveränderten
30-Sekunden-Prozess- und10-Sekunden-Stagegrenzen: vier echte Cancelkombinationen
und zwölf SIGKILL-/Replaygrenzen für v2/v3, Write/Read, requested/accepted/completed.
Die genaue Ursache der anfänglichen Fehler wurde nicht bewiesen.

Die lokale semantische Summaryprüfung nutzt echte Core-/Effekt-/Dateispeicher-
Consumer, aber explizite Artefaktvertragsdaten für die anderen Provider. Direkte
innere Ownerprüfungen erzeugen ihre tatsächlichen Policy-/Evidencewerte; sie
sind kein vollständiger registrierter Review-/Modelllauf. Diese Beweisklassen
bleiben getrennt. Die frühere markierte Helper-Aktion wurde weder erneut
beauftragt noch umgeleitet. Vollständige Modell-/Browser-/Cluster-/Live-Abnahme
bleibt beim Auftraggeber gemäß D12.

Zusätzlich korrigiert dieser Checkpoint die Betriebsdokumentation zur vorhandenen
Attempt-, Dispatch- und Operator-Komprimierung. Sie war gegenüber dem tatsächlichen
Code veraltet. Das schließt PCR-OBS-002 nicht: eine gemeinsame, von sämtlichen
Wiederaufnahme- und Lesepfaden beachtete Freigabe bestätigter Historie fehlt
weiterhin. Ebenso bleiben die drei Findings zur Buster-/Prism-Ressourcenzurechnung
und Orphan-Bereinigung offen. Ein terminaler Status ist kein Prozessstillstand.

Rohbelege und exakte Befehle: [Prüfprotokoll](../../evidence/pr6-sdk-local/commands.json).
Der globale Dokumentations-Linkcheck scheitert weiterhin an historischen
Repositoryreferenzen; die geänderten Betriebs-/Checkpointlinks sind vorhanden.
Kein erfolgreicher Gesamt-Dokumentationscheck wird behauptet.
