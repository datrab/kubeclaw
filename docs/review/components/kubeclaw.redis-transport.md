# kubeclaw.redis-transport

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Schema: Revision 5. Alle Implementierungsdateien und Pakettests gelesen.

## 1. Verantwortung/Auslieferung/Nutzung

`skills/common/plugins/redis-transport/src/adapter.ts` registriert publisher für
transport.publish und telemetry für telemetry.emit; Rolle nova. Beide verwenden
dasselbe RESP-/Lua-Modul, nur capability/operation/resource unterscheiden sich.
Registrygrants wählen einen Provider pro Capability. Rollenpaket belegt Angebot,
keine produktive Redisverbindung; konkrete lokale Aufrufe sind Originalpakettests.

## 2. Ein-/Ausgaben und beide Grenzseiten

Publisher erwartet publish/transport.target, Telemetry append/telemetry.event.
Coreeffektpayload wird JSON-stringifiziert, Secret über secrets.read resolved;
AUTH und EVAL werden in einem TCPwrite gesendet. Redis empfängt Lua mit zwei
Keys und maxLen/key/payload/TTL, XADD-Felder idempotency_key und payload.
Result ist accepted:true, stream und validierte numerische entryId. Dieser
Datenkanal passt nicht zum Extension-v1-Readerfeld data und benutzt keine
bestätigte v1-Promotion. Repo besitzt hier keinen ausführbaren produktiven
Redisreader; Empfänger ist der konfigurierte Redisserver.

## 3. Zustand/Commit

Kein lokaler Store oder Receiptcache. Lua GET dedup → XADD MAXLEN~ → SET PX
ist serverseitig atomar, ACK erst nach Antwort. Das ist kein fsync-/Replikat-
Commitversprechen: Redis AOF/Failoverkonfiguration außerhalb des Adapters.
Dedupkey enthält streamPrefix und Corekey, keine Payloadprüfung; Core verhindert
normalerweise Keywiederverwendung mit verändertem Payload/Ziel vor diesem Adapter.
Direkter Adapteraufruf hätte diese Zusatzgarantie nicht.

## 4. Fehler/Disposition

Config whitelist, URLprotokoll, Secretname/Prefix und Integerlimits geprüft.
Operation/resource müssen stimmen; AUTH-/RESP-/StreamID-/Timeoutfehler werfen.
ready prüft nur stopping, keine Connectivity. parser prüft Bulk-Länge bis1MiB,
aber kein Gesamtbufferlimit (s.u.). Frühes close/end ohne Daten wird erst nach
Timeout bemerkt. telemetry accepted:true auch bei dedup ist sachlich erfolgreicher
Replay, kein Beleg einer neuen XADD-Zeile.

## 5. Timeout, Abort, Parallelität

Je invoke neue TCP/TLS-Verbindung, Timer timeoutMs bis300000, Vorab-/laufender
Abort zerstört Socket; Fehlerpfad räumt Timer/Listener auf. shutdown setzt nur
stopping und wartet nicht auf aktive Sockets. Lua serialisiert Redisänderungen,
keine lokale Queue. AUTH wird bei connect geschrieben; rediss nutzt TLSserver-
nameprüfung. Backpressure wird durch den maximal1MiB Request teilweise begrenzt,
Responsebuffer dagegen nicht.

## 6. Restart/ACK-Verlust

Nach verlorenem XADD-ACK kann derselbe Key innerhalb dedupTtlMs dieselbe ID
liefern; nach TTL oder Rediszustandsverlust kann ein zweiter Eintrag entstehen.
Streamtrimming kann den Eintrag vor Ablauf des Dedupkeys entfernen, danach
liefert GET eine inzwischen nicht mehr lesbare ID. Das ist eine offen zu
koordinierende Retentions-/Dedupfrist, keine Exactly-once-Garantie. Kein eigenes
persistiertes Abschlusspräfix oder Receipt-Recovery-API.

## 7. Vertrauen

secrets.read ist einzige Untercapability; Redis direkt als privilegierter
Adapterpfad, keine network.http-Originprüfung. URL aus Plattformconfig ohne
Userinfo/Pfadquery; redis: sendet AUTH und Payload unverschlüsselt, rediss:
verschlüsselt. Netzwerkisolation/Redis ACL sind externe Voraussetzungen.
Keine Nutzlastredaction im Provider: vorgeschaltete Projektoren sind hierfür
zuständig. Zielnamenskollision kann die logische Zieltrennung verletzen (s.u.).

## 8. Ressourcen

1MiB serialisierte Payload, maxLen≤1M approximatives XTRIM, TTL≤1Jahr,
Responsebulklimit1MiB; kein Limit der Menge offener Invocations und der Bytes
vor einer vollständigen RESPzeile. JSON.stringify läuft vor Bytebudget, Getter,
Zyklus und Nicht-JSON hängen von Corevorvalidierung ab. Kein eigener GC;
Redisvolumen und TTL gehören zur Betriebsdimensionierung.

## 9. Architektur

Zwei Providerexports auf einem Protokollpfad sind kohärent. Handgeschriebener
RESP-Parser bringt Sonderfälle, die der aktuelle Fixturetest kaum prüft.
Falls dieser Provider dauerhaft benötigt wird, gemeinsam geprüften Client/
Parservertrag einsetzen; nicht zusätzlich dritte Redisvarianten etablieren.

## 10. Tests

`npm test` im Paket bestanden: [Log](../evidence/observers-redis-transport-tests.txt).
Beide Tests vollständig gelesen. live-function startet echten lokalen TCPserver,
der jedoch fest +OK/Bulk-ID sendet; er führt kein AUTH, Lua, XADD, Dedupe oder
Trimming aus. Boundary prüft Registrierung/Importmuster. Kein redis-server
lokal verfügbar; tatsächliche Redis-/TLS-/Failover-/ACKverlusttests nicht
ausgeführt. Originalwiretest bestätigt insbesondere die Punkt→Unterstrich-
Umwandlung von pipeline.completed, aber nicht ihre Kollisionsfreiheit.

## 11. Dokumentation

README vorhanden; 'atomic idempotency' nur innerhalb TTL/Rediszustand und
Corekey-Vertrag zutreffend. 'bounded network I/O' ist wegen unbeschränktem
Responsebuffer veraltet. 'shutdown' beschreibt keine Drain-/Socketabbruch-
Garantie. Katalog/Manifest stimmen für beide Capabilityexports überein.

## 12. Befunde

### PCR-REDISTRANSPORT-001 — Unterschiedliche logische Ziele teilen einen Stream

**Mittel, nachgewiesener Defekt durch Originalcode und vorhandenes Wirefixture.**
`src/adapter.ts:143–144` ersetzt jeden Nicht-[a-zA-Z0-9:_-]-Buchstaben durch _. So
führen die unterschiedlichen gültigen Namen pipeline.completed und
pipeline_completed beide zu <prefix>:pipeline_completed. Originaltest erwartet
bereits diese Projektion für den ersten Namen. Auswirkung: Ziel-/Eventfeeds
lassen sich nicht mehr getrennt adressieren, Daten verschiedener freigegebener
Targets vermischen sich; keine zusätzliche unbewiesene Remoteautorisierung
behauptet. Ursache beheben durch reversible kollisionsfreie Kodierung oder
kanonisch validierten injektiven Namensraum, getrennt nach Providerart wenn
beabsichtigt. Regression mit originalem Redis und beiden Namen, unterschiedlichem
Payload/Key, getrennten Streams und eindeutigem Consumerlookup.

### PCR-REDISTRANSPORT-002 — RESP-Antwortbuffer wächst vor Längenprüfung unbegrenzt

**Mittel, nachgewiesener Codepfad; kein OOM-Lauf ausgeführt.**
`src/adapter.ts:53–68,96–109`: jeder Chunk wird mit Buffer.concat angehängt;
parseReply wartet bei fehlendem CRLF ohne Bytecap. Ein defekter/kompromittierter
Redispeer kann bis zum Timeout beliebig viele Bytes liefern, unabhängig vom
1MiB-Bulklimit. Auswirkung: Hostmemory-/Kopierlast, durch parallele Requests
verstärkbar. Ursache: Budget erst nach parsebarer Headerzeile. Behebung:
Gesamtbuffer/RESPheader vor Concat begrenzen, close/end sofort als Fehler,
Socket beim Überschreiten schließen. Regression am originalen Socketpfad mit
fragmentiertem Header, fehlendem CRLF, Oversizedbulk und UTF8-Chunks;
unterhalb Limit gültige Antwort weiterhin erfolgreich.
