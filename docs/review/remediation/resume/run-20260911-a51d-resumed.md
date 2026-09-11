# Fortsetzung nach dem vorzeitigen Stopp

Der frühere Stopp war ein Fehler: Es gab noch ausführbare Ursachenarbeit. Für die fehlenden **84 Minuten** läuft diese Fortsetzung von **16:54:11 bis 18:18:11 UTC am 11. September 2026**. Die Pause zwischen den Turns zählt nicht als Arbeitszeit.

**Laufstatus: An der Zeitgrenze gestoppt. Die fehlenden 84 Minuten sind nachgeholt.** Arbeitsende: 2026-09-11T18:18:11.019598+00:00; anschließende Speicherung des Abschlussstands.

Der Stand bleibt **94 lokal verifiziert / 39 teilweise umgesetzt / 2 in Bearbeitung / 19 offen**. Alle 154 ursprünglichen Kennungen, Statuswerte und Findingtexte sind unverändert. Die eingefrorene Teilmenge enthält weiterhin 8 vollständig verifizierte und 39 unvollständige Findings. Keine Teilprüfung wurde zur vollständigen Abnahme umgedeutet.

## Geprüfte und integrierte Änderungen

- **Testzuordnung:** Die verschobenen Integrationstests sind wieder vollständig statisch erfasst. Sechs echte Typfehler und drei Root-Negative bestätigen die reparierte Abdeckung; ursprüngliche Paketeinstiege bleiben erhalten.
- **Prism/Worker:** Die unabhängig geprüfte Enginezerlegung ist integriert. HTTP-Abbruch erreicht den ursprünglichen Worker Core und laufende Artefakt-I/O. SIGTERM/SIGINT stoppt neue Aufträge, unterbricht unvollständige Bodies, wartet begrenzt auf aktive Arbeit und schließt den ursprünglichen nonce-Pool. Unaufgelöste Arbeit führt zum Fehlerexit.
- **Supervisor:** Stop während der Recoverypause startet keine weitere Pipeline. Beschädigte Lease-/Heartbeat-Zustände werden erhalten und sichtbar abgewiesen. Ein tatsächlicher npm-Startfehler wird aufgezeichnet und gibt die eigene Lease frei. Die sechs bisherigen Lintfehler sind behoben.
- **Release-Nachweise:** Der signierte Prism-Prüfer akzeptiert jetzt die vom Releasevertrag vorgeschriebenen Digestreferenzen und weist mutable Tags ab. Signatur-, Commit-, Clean-Run- und Pflichtgateprüfungen bleiben erhalten.
- **Buster:** Ein Fehler beim dauerhaften Speichern oder Lesen des Endstatus bleibt nach dem Entfernen des Vorgangs aus der aktiven Liste erhalten. Der Dienst stoppt neue Aufträge, erhält bereits gespeicherte Jobs und meldet den Shutdownfehler. Bereits laufende Annahmeschreibvorgänge werden vor dem Shutdown-Ende abgewartet.

Neue Regressionen sind in den bestehenden Paket-/Prüfeinstiegen und erforderlichen Typprüfungen verdrahtet. Die Release-Workflowänderung ergänzt nur den Testpfad; Trigger, Berechtigungen und Action-Pins bleiben unverändert. CI wurde nicht ausgeführt.

## Nachweise und Grenzen

| Paket | Tatsächlicher Nachweis | Noch nicht damit belegt |
|---|---|---|
| Prism/Worker | 55 bestandene Fälle auf integrierter Quelle; unabhängige Prozess-/HTTP-Prüfungen | 1 ausdrücklich übersprungene native PG-SQL-Prüfung; Chromium-Kinder und vollständige Control-Recovery |
| Supervisor | 18/18 unabhängig, null Skips; kanonischer Lint ohne Fehler | Native Prozessadoption, dauerhafte Identität und sämtliche weiteren I/O-Fehlerpfade |
| Release | 7/7 einschließlich tatsächlicher Helmrender; originaler Images-Prüfeinstieg bestanden | Live-Pod-/OCI-Identität und aktiver Bundlecommit |
| Buster | 7/7 unabhängig; Root sechs aktuelle Fälle sowie Remoteplan-Einstieg und Typprüfungen bestanden | Native Providerquieszenz und Restart-/Orphanbesitz |

Vier bestehende Buster-Lintbefunde bleiben offen. Knip-Konfiguration und Paketgrenzenprüfung bestehen; vollständiges Knip wurde nicht ausgeführt. Der erste Root-Helmlauf scheiterte am fehlenden PATH-Eintrag; nach Nutzung des bereits installierten Originalprogramms bestand die unveränderte Suite. Beide Ausgaben sind erhalten.

Für die CPU-Zurechnung wurde ein weiterer echter Defekt konkretisiert: Zwei überlappende Originaloperationen berichteten zusammen 341 ms bei 172,468 ms tatsächlicher Parent-CPU. Der gespeicherte Folgeplan beschreibt den nötigen generischen Attempt-Host, Ressourcenbesitz und die abschließende Messung. Dafür wurde kein unvollständiger Produktionsfix integriert.

Zwei native Abnahmeeinstiege sind vorbereitet: `test:worker-readiness-native` verlangt einen echten SQL-Pass und weist Skips/Nulltests ab; `test:engine:native-retention` verlangt tatsächliche Chromium-Captures und eine vorab begründete feste Speichergrenze. Beide nativen Positivläufe stehen aus. Die PostgreSQL-Routing-Negativen liefen ohne Datenbankverbindung.

Es verbleiben sowohl Implementierungsarbeit als auch native Abnahmen. Es gab keine Deployments, Infrastrukturänderungen, CI-Ausführungen oder Nachrichten an Dritte. Fehlende native Nachweise wurden nicht durch Ersatzprogramme oder erfundene Erfolgsmeldungen ersetzt.

## Gesicherte Quellen

Aktueller geprüfter Quellcheckpoint: **550eb948ec8766b38e8c8d4ccb88a1fdab28e61a**, Baum `b328c9bce95cd999cb1c5b811f38e1e4040773fa`, Branch `fix/remediation-foundations-20260909`. Alle 15 Dateien des letzten Quellpakets wurden bytegenau zurückgelesen.

Vorheriger Buster-Quellcheckpoint: `47c646d2` (40 Dateien). Weitere verifizierte Pakete: `da02ba5a` (erste Integration, 195 Dateien und 11 echte Testverschiebungen), `9af5dfb4` (native Abnahmeeinstiege, 30 Dateien), `56c205ef` (weitere Supervisor-/Releasekorrekturen, 45 Dateien). Die Quellpakete wurden jeweils vollständig zurückgelesen und gegen den lokalen Gitbaum verglichen.

Der gekoppelte SDK-/Delivery-Kandidat bleibt separat bei **0144df383250a1975d40b04746eac398ee77e747**. Gemeinsame SDK-, WorkerCore-, NovaCore- und Summary-Quellen wurden durch diese Integration nicht verändert. Keine isolierte SDK-Übernahme ohne die ursprüngliche gekoppelte Abnahme.

## Fortsetzung

- [Aktueller Zustand aller 39 IDs](run-20260911-a51d-resumed-state.json)
- [Ursprüngliche Gate-/Voraussetzungsmatrix](native-followup-39-20260911.json) und [aktuelle Pfadauflösung](native-followup-current-resolution.json)
- [Root-Integration](../implementation/resume-84-integration-root-review.md) und [unabhängige Integration](../implementation/resume-84-integration-independent-review.md)
- [Worker-Stopp](../implementation/resume-84-prism-final-independent-review.md), [Supervisor](../implementation/resume-84-supervisor-launch-independent-review.md), [Release](../implementation/resume-84-release-root-review.md), [Buster](../implementation/resume-84-buster-independent-review.md)
- [Vorbereitete native Gates](../implementation/resume-84-native-gates-root-review.md), [konkretes CPU-Folgepaket](../implementation/resume-84-prism-cpu-ownership-direction.md)

Der frühere Bericht `run-20260911-a51d-2h.md` bleibt als historischer Verlauf erhalten. Seine damalige Stoppbegründung gilt nicht als Aussage, dass alle lokal ausführbare Arbeit ausgeschöpft war.

Die letzte echte Statusdatei-Korruption ist ebenfalls behoben: [unabhängiger Endreview](../implementation/resume-84-buster-read-independent-review.md). Der bestehende Dateiinhaltsfehler wird nicht mehr als erfolgreicher Shutdown verschluckt; beide tatsächlichen Ursachen bleiben erhalten.
