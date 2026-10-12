# Unabhängiger Review: gemeinsames Prism-Eingabelimit

Frischer Reviewer, nicht an der Umsetzung beteiligt. Geprüft wurde ausschließlich
CI01–CI06 und CI-DOC aus `config-input-limit-20260921.md` am vorliegenden
Arbeitsbaum. Ergebnis: **kein offener Korrekturbefund in diesem Schnitt**.
Das ist keine Abnahme des gesamten CONFIG-/Buster-/Native-Ziels.

## Selbst ausgeführte Nachweise

- Originale Loader-, Eingabelimit- und Deploymenttests: **123/123 bestanden,
  null Skips**. Enthält tatsächliches Helmrendering und Chartpaketprüfung,
  echte HTTP422-Grenzen sowie gestartete Originalhostprozesse bis zum Parser.
  [Rohausgabe](../../evidence/independent-prism-input-20260921/runtime-helm.txt).
- Zusätzlich selbst geschriebene Prüfung: Chunked-HTTP mit zwei Eurozeichen
  (sechs UTF-8-Bytes) erreicht bei Limit sechs die echte Authentifizierung;
  ein zusätzliches ASCII-Byte wird vorher mit HTTP422 abgewiesen. Änderung
  der Autorendatei nach dem Laden auf 2147483647 ändert diesen Snapshot nicht.
  Dieselben Eingaben erreichen im gestarteten Originalhost bei sechs Bytes
  den JSONparser bzw. scheitern bei sieben am Inputlimit. Kein Executor wurde
  aufgerufen. [Prüfprogramm](../../evidence/independent-prism-input-20260921/utf8-probe.mjs),
  [Ergebnis](../../evidence/independent-prism-input-20260921/utf8-probe.txt).
- Eigene Negativkontrolle: temporäre Kopie des originalen HTTPservice ersetzt
  die Snapshotweitergabe durch den früheren 16-MiB-Wert. Das unveränderte eigene
  Prüfprogramm (nur Import umgebogen) scheitert fachlich an der erwarteten
  Übergrößenantwort. Produktionsdateien wurden nicht verändert.
  [Ergebnis](../../evidence/independent-prism-input-20260921/mutant-result.json),
  [Rohausgabe](../../evidence/independent-prism-input-20260921/mutant-http.txt).

## Quellenprüfung und Grenzen

| Kriterium | Prüfung und Urteil |
|---|---|
| CI01 | Kanonische Datei, striktes AJV-Schema und beide Autorenprofile geprüft; keine implizite Inputvorgabe im Loader. Alle sechs Werte erforderlich. |
| CI02 | Alter und reservierter Environmentkey werden am Operatorloader auch bei gleichem Wert abgewiesen. Originalchildloader verwirft den alten Key. Repositorysuche fand keine weitere produktive Lesestelle des alten Keys. |
| CI03 | Reale Grenzanfragen sowie UTF-8-/Chunked-Nachweis bestanden. Ablehnung bleibt vor Authentifizierung und Execution; nach Ablehnung erneute Annahme bis Authentifizierung. |
| CI04 | `runNativePrismWorker` lädt einmal und übergibt dieselbe Konfiguration an Supervisor und HTTPserver. Supervisor übernimmt `config.ingress.maximumInputBytes`; Journal, Prozessbudget und Commandbuilder verwenden diesen Wert. Geschlossenes Childenvironment übernimmt keine fremde Prozessenv. Realer Childparser getestet. Journal/Prozessweitergabe und deren echte Byteprüfungen wurden quellengeprüft, nicht als ausgeführter nativer Attempt ausgegeben. |
| CI05 | Autoren-/Schemasymlinks, generierte ConfigMap, Mount und Checksum sowie unveränderte Imagesmokeverdrahtung geprüft; Render-/Pakettests ausgeführt. Beide alten Helmkeys scheitern bereits am strikten Valueschema. Kein Imagebuild oder Deployment ausgeführt. |
| CI06 | 123 vorhandene/erweiterte Tests erneut ausgeführt; eigene Negativkontrolle erkennt ignoriertes Inputlimit. Historische sieben Lifecycle-Verhaltenstests dieses Schnitts nicht nochmals ausgeführt und nicht als eigene Ergebnisse beansprucht. |
| CI-DOC | Operatoranleitung erklärt Autorität, Einheiten, Startup-Snapshot, Umstellung alter Keys, interne Childübertragung, Fehler422 und Nachweisgrenzen. Prismguide verlinkt alle sechs Einstellungen. Inventarschnitt löst ausschließlich die drei Inputfundstellen auf; keine Gesamtzentralisierung behauptet. |

Die kleine Änderung bleibt nachvollziehbar: typisierter Snapshot statt weiterer
Envreader; ein Commandbuilder macht den echten Childtransport prüfbar. Secrets
bleiben außerhalb des Autorenobjekts, ursprüngliche Authentifizierungsprüfungen
bestehen. Andere Native-/Control-/Pipeline-Settings sind von diesem ausdrücklich
begrenzten Schnitt nicht migriert und bleiben Teil des offenen Gesamtziels.

Kein Kernel-/cgroup-/Launcher-/Journal-Recovery-Nachweis, kein Containerbuild,
kein Cluster- oder Live-Nachweis wurde durchgeführt oder hier behauptet.
[Dateiidentitäten](../../evidence/independent-prism-input-20260921/identities.json)
fixieren den geprüften Stand; spätere Änderungen benötigen neue Prüfung.
