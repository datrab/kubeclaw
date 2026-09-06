# Pipeline-Komponentenreview

## Auftrag und Prüfstand

Technische Bestandsaufnahme für ein experimentelles Open-Source-Hobbyprojekt.
Keine Veröffentlichung, Deployments, kostenpflichtigen Ressourcen, funktionalen
Reparaturen oder umfassende Überarbeitung der Produktdokumentation.

Baseline: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488` (main, 2026-09-06).
Der lokale Ausgangscommit `5bb6612bb629b971fa83d0da018c25b52efdda97`
besitzt denselben verifizierten Git tree
`e43c39eea59b07f0a749b7b49f3aefdd11b14ed0`. Der Codeinhalt entspricht
damit exakt der Baseline. Eigene Arbeitskopie; fremde Arbeitsstände unverändert.

Einstieg: [Inventar](inventory.md), [Übergabe](handoff.md).
`inventory-data.json` enthält die ausführlichen Zuordnungsbelege, keine
automatisch erzeugten Review-Urteile. Quellcode-Suchtreffer belegen allein
weder Laufzeitnutzung noch ausreichende Testabdeckung.

## Umfang und Reihenfolge

Verträge und SDK → Persistenz → Nova-Core und Worker-Core → darauf aufbauende
Plugins, Extensions und eigenständige Pipeline-Dienste. Sender und Empfänger
jedes relevanten Übergangs gemeinsam prüfen. Vollständige Projekt-E2E-Traces
sind ein Folgeauftrag. Infrastruktur nur als Abhängigkeit/Annahme erfassen;
auffällige Infrastrukturfragen separat zur Folgeprüfung notieren.

## Lebendes gemeinsames Review-Schema (Revision 2)

Jede fachlich abgeschlossene Review-Datei muss folgende Kriterien konkret
behandeln; nicht anwendbare Kriterien begründen:

1. Verantwortung, Grenzen, Registrierung, Auslieferung, Aufrufer und tatsächliche Nutzung.
2. Eingaben, Ausgaben, Schemas, Identitäten und beide Seiten der Schnittstellen.
3. Zustandsänderungen, Persistenz, Commit-Punkt und externe Nebenwirkungen.
4. Korrektheit, Fehlerpfade und Erhalt unterschiedlicher Fehler-/Ergebnisdispositionen.
5. Timeouts, Abbruch, Wiederholungen, doppelte Zustellung und Parallelität.
6. Prozessneustart, Wiederaufnahme und externe Aktionen mit ungewissem Ausgang.
7. Authentifizierung, Autorisierung, Vertrauensgrenzen und Herkunft von Evidenz.
8. Ressourcenlimits, Aufräumen, Aufbewahrung und Verhalten bei vollem Speicher.
9. Architektur, unnötige Komplexität, obsolet gewordene Pfade und dauerhafte Vereinfachungen.
10. Tatsächlich untersuchte Tests, Aussagekraft, ausgeführte Befehle und fehlende Nachweise.
11. Konkrete Abweichungen zur Architektur-/Betriebsdokumentation.
12. Befunde mit Ursachenbehebung, Unsicherheiten und nächstem Verifikationsschritt.

Zusätzlich bei Persistenz: Bestätigung vor/nach fsync, Verzeichnisdauerhaftigkeit,
Eigentum an veränderlichen Objekten, Lock-Reclamation mit mehreren Prozessen,
PID-Namensräume, Wiederholung nach verlorenem ACK und Integrität beim Replay.
Bei Worker-/Dienstgrenzen zusätzlich die Summe aller Abschlussphasen gegen die
absolute Claim-Deadline, tatsächliche Logspeicher-Verdrahtung, messbare Ressourcen
pro Versuch und Ergebnisbindung beim Empfänger prüfen. Revision 2: diese Kriterien
wurden in worker.core, contract.worker und den begonnenen Prism-Dienstreviews
berücksichtigt; state-store/nova.state/prompt-contract enthalten keine solchen
Worker-Hooks und benötigen deshalb keine Rückstufung.
Bei neuer Erkenntnis Schema hier erweitern; betroffene bereits abgeschlossene
Reviews explizit zur Nachprüfung markieren und ihren Status aktualisieren.

## Statusdefinitionen

| Status | Bedeutung |
|---|---|
| ungeprüft | Nur inventarisiert; keine fachliche Abschlussaussage. |
| teilweise geprüft | Konkrete Pfade geprüft; offene Pfade ausdrücklich benannt. |
| abgeschlossen | Relevante Implementierung, Schnittstellen und Tests untersucht; alle Kriterien beantwortet. |
| Nachprüfung erforderlich | Geänderter Code oder erweitertes Kriterium betrifft früheren Abschluss. |

Teststatus separat: bestanden, fehlgeschlagen, blockiert, nicht ausgeführt.
Ein Code-Trace ist kein bestandener Laufzeittest. Ein bestandenes Fixture- oder
Mock-basiertes vorhandenes Testprogramm wird nur mit seiner begrenzten Aussage
beschrieben. Keine Ersatzimplementierungen hinzufügen, um Tests grün zu machen.
CI nicht erneut anfordern; bekannte Actions-Minuten sind erschöpft.

Dokumentationsstatus: vorhanden (inhaltlich geprüft), veraltet (konkreter
Widerspruch), unvollständig (fehlende Themen/ungeprüfte Aussagen), fehlend
(keine zugeordnete Dokumentation; Suchgrenzen nennen). Mehrere Status können
für unterschiedliche Dokumente derselben Komponente zutreffen.

## Befundformat und Zuständigkeit

Stabile ID `PCR-<KOMPONENTE>-NNN`, ein Eigentümer, Querverweise statt Duplikaten.
Jeder Befund enthält Schweregrad und Begründung, Datei/Funktion/Zeilen am
Baseline-Commit, Auslöser, Fehlerablauf, konkrete Auswirkung, Evidenzklasse
(nachgewiesener Defekt / begründeter Verdacht / offene Frage), Ursachenbehebung
und echten Regressionstest bzw. Verifikationsschritt.

Schweregrade: kritisch (übergreifender Sicherheits-/Integritätsverlust), hoch
(wichtiger Ablauf falsch, Datenverlust oder verletzte Vertrauensgrenze), mittel
(begrenzter Fehler, Wiederanlauf-/Verfügbarkeitsproblem), niedrig (begrenztes
Wartungs-/Dokumentationsproblem). Keine schematische Einstufung ohne Auswirkung.
Historische Befunde werden neu geprüft, mit ursprünglicher Quelle verknüpft und
als bestätigt, behoben, teilweise behoben oder noch ungeprüft eingeordnet.

## Fortsetzung und Speicherung

Nach jeder Komponente Review und Inventarstatus gemeinsam speichern. Nur
`docs/review/` ändern. Neue Dokumentationscommits mit `[skip ci]`; keine
Workflow-Auslösung, kein Merge. Vor Remote-Speicherung Branchstand erneut
prüfen; bei Drift eigene Änderungen erhalten und Fremdänderungen nicht ersetzen.

Vor Fortsetzung Baseline gegen neuen Code vergleichen; unveränderte Komponenten
nicht erneut von vorn prüfen. Übergabe nennt vollständig/teilweise/ungeprüft,
offene Befunde, blockierte Tests und den konkreten nächsten Codepfad.
Keine Secrets, privaten Konfigurationswerte oder Betriebsdaten übernehmen.
