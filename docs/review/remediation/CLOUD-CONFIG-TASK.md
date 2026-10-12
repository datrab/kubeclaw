# Auftrag für die Cloud-Session: Config-Zentralisierung

Du übernimmst die Bestandsaufnahme und gemeinsame Definition der Config-Zentralisierung für `datrab/kubeclaw`.

Arbeite die folgenden Schritte der Reihe nach ab. Prüfe Aussagen anhand des Codes und unterscheide bestehendes Verhalten, bereits beschlossene Änderungen und offene Vorschläge. Übernimm historische Bewertungen nicht ungeprüft. Dokumentiere Ergebnisse und Entscheidungen im Repository, damit die Arbeit ohne den bisherigen Chat fortgesetzt werden kann.

Frage nur bei tatsächlich fehlenden Informationen oder neuen Entscheidungen nach. Bereits bestätigte Grundsatzentscheidungen gelten weiter. Beginne die Implementierung erst nach Zustimmung des Nutzers zum konkreten Umsetzungspaket.

## 1. Cloud-Umgebung und Übergabe prüfen

- Repository: https://github.com/datrab/kubeclaw
- Übergabebranch: `codex/cloud-config-handoff-20261012`
- Verifizierter Übergabecommit vor Ergänzung dieses Auftrags: `cc02012610b6e9e20a3155577140e8914f33ddf7`
- Einstieg: [CLOUD-READY.md](CLOUD-READY.md)

Prüfe zunächst kurz:

- Ist das richtige Repository mit dem richtigen Branch vorhanden?
- Ist der Übergabecommit verfügbar? Prüfe auch die seitdem hinzugekommenen Änderungen und verwende den aktuellen Branchstand.
- Sind Quellcode, Tests, Dokumentation und die benötigten Belege vorhanden?
- Sind Git, Node und die erforderlichen Werkzeuge verfügbar?
- Funktioniert der GitHub-Zugriff? Nutze bei Bedarf den verfügbaren GitHub-Connector.
- Sind historische Git-Objekte verfügbar, soweit die Bestandsaufnahme sie benötigt? Lade bei einem flachen Checkout gezielt die benötigte Historie nach.
- Fehlen Informationen, Zugriffsrechte oder Einstellungen, die für den Auftrag tatsächlich notwendig sind?

Installiere erforderliche lokale Abhängigkeiten anhand der vorhandenen Lockfiles, soweit dies möglich und für die Prüfung erforderlich ist. Lade nicht vorsorglich große SDKs, Scanner-Datenbanken oder historische Tool-Caches herunter.

Die Übergabe enthält die ausgewählten Originalbelege. Große rekonstruierbare Tool-Caches wurden bewusst ausgeschlossen und in Manifesten dokumentiert. Für die Config-Bestandsaufnahme müssen diese nicht vollständig wiederhergestellt werden. Historische Prüfergebnisse sind keine neue Abnahme des aktuellen Codes.

Gib dem Nutzer nach dieser Prüfung ein kurzes Ergebnis: Was ist vorhanden, was fehlt gegebenenfalls und ob du arbeitsfähig bist. Fahre anschließend mit allen Arbeiten fort, die keine fehlenden Informationen voraussetzen. Behaupte keine erfolgreiche Prüfung, die du nicht tatsächlich durchgeführt hast.

## 2. Bestehende Dokumentation und Entscheidungen lesen

Lies insbesondere:

- [CLOUD-READY.md](CLOUD-READY.md)
- [decisions.md](decisions.md), insbesondere D17 bis D20
- [implementation-order-20261012.md](implementation-order-20261012.md)
- [config-definition-20261012.md](config-definition-20261012.md)
- [config-scope-inventory-20261012.json](config-scope-inventory-20261012.json)
- [independent-config-definition-20261012.md](independent-config-definition-20261012.md)
- Die dort referenzierten Abnahmekriterien und relevanten Originalquellen

Beachte vorhandene AGENTS.md-Anweisungen. Die Dokumentation beschreibt teilweise historische Stände. Prüfe für aktuelle Aussagen die tatsächlichen Implementierungen und Aufrufketten.

## 3. Ziel und bereits bestätigte Entscheidungen

Wir wollen die Konfiguration anhand des tatsächlichen Codes vollständig und sinnvoll zentralisieren.

Das Ziel ist:

- Eine zentrale Config pro Engine.
- Eine zentrale Config pro Plugin.
- Eine zentrale Config für Core und Worker Core.
- Eine zentrale `pipeline.json` als gemeinsamer Einstieg für das gesamte System.

Die `pipeline.json` soll Komponenten, Abläufe und Profile referenzieren. Konkrete Einstellungen bleiben in den zuständigen Komponentendateien. Sie soll keine zweite Sammlung derselben Einstellungen werden.

Prüfe anhand des Codes, welche weiteren Konfigurationsbereiche eigene Zuständigkeiten benötigen, beispielsweise Dienste, Agenten, Modellprofile, Prompts, Deployment, Projektabläufe und Evals. Übernimm vorgeschlagene Dateinamen oder Aufteilungen nicht blind.

Die Verwaltung soll für Nutzer einfach sein. Gleichzeitig sollen alle sinnvoll anpassbaren Einstellungen möglichst wenig Reibung verursachen und spätere Evals zur Optimierung einzelner Komponenten ermöglichen.

Bereits beschlossen:

- Jede Einstellung hat genau eine maßgebliche Quelle. Keine konkurrierenden Konfigurationsdateien, versteckten Defaults oder stillen Fallbacks.
- Geeignete Änderungen, beispielsweise an Modell, Prompt oder bestimmten Plugin-Einstellungen, dürfen ab dem nächsten Modulstart gelten. Das kann auch ein noch nicht gestartetes Modul innerhalb eines bereits laufenden Ablaufs betreffen.
- Ein gestartetes Modul arbeitet mit seinem unveränderlichen, dokumentierten Konfigurationsstand weiter.
- Die genaue Zuordnung eines „Moduls“ zu vorhandenen Ausführungseinheiten muss anhand des Codes definiert werden.
- Die Bindung zwischen Ausführungseinheit und Konfigurationsstand muss vor dem Dispatch dauerhaft gespeichert sein. Recovery und Wiederholungen müssen diese Bindung erhalten.
- Änderungen dürfen bereits verbrauchte Reparaturbudgets, Claims oder laufende Fristen nicht zurücksetzen.
- Ablaufstruktur, Berechtigungen und für Recovery maßgebliche Grundlagen bleiben für einen laufenden Ablauf stabil.
- Betriebliche Änderungen, etwa an Listenern, Trust, Storage oder Deployment, benötigen ausdrücklich definierte Aktivierungsregeln.
- Evals benötigen einen Modus mit fest gebundenem Konfigurationsstand und nachvollziehbaren Eingaben.
- Generierte, vollständig materialisierte Konfigurationen sind unveränderliche Ausgaben, keine zusätzliche manuell gepflegte Quelle.
- Geheimnisse gehören nicht als Klartext in normale Konfigurationsdateien. Referenzen, Berechtigungen und Versionierung müssen sauber definiert werden.
- Nicht jede interne Konstante muss ein Nutzerparameter werden. Begründe, welche Werte sinnvoll konfigurierbar sind.

Ein bekannter Punkt ist die Namenskollision: Das vorhandene CLI-Argument `--pipeline` bezeichnet aktuell eine Ablaufdefinition. Die geplante zentrale `pipeline.json` hat eine andere Zuständigkeit. Definiere dafür eine verständliche Lösung.

## 4. Vollständige Bestandsaufnahme und konkrete Zieldefinition

Vervollständige die vorhandene Config-Bestandsaufnahme anhand des Codes. Die bisherige Inventur ist ein Ausgangspunkt und noch kein Nachweis vollständiger Abdeckung.

Erfasse alle relevanten Konfigurationsquellen und ihre tatsächlichen Verbraucher:

- Konfigurationsdateien und Schemas.
- Umgebungsvariablen und CLI-Argumente.
- Helm-Werte und Deployment-Konfiguration.
- Plugin-Manifeste und Registrierungen.
- Modell-, Agenten- und Prompt-Einstellungen.
- Hartcodierte Werte, Defaults und Fallbacks, soweit sie sinnvoll konfigurierbar sind.
- Profil- und Override-Mechanismen.
- Konfigurationsbindung, Persistierung und Recovery.
- Für Evals relevante Parameter und Schnittstellen.

Dokumentiere pro Einstellung oder sinnvoll zusammengehöriger Einstellungsgruppe:

- Zuständiger Bereich und maßgebliche Quelle.
- Verbraucher im Code.
- Heutiges Verhalten einschließlich Defaults und Prioritäten.
- Gewünschte Zielquelle.
- Validierung und verständliche Fehlermeldungen.
- Zeitpunkt, ab dem Änderungen wirksam werden dürfen.
- Auswirkungen auf laufende Ausführungen, Recovery und Wiederholungen.
- Eignung für Profile und Evals.
- Notwendige Migration und konkrete Abnahmekriterien.

Definiere anschließend eine einfache, konsistente Datei- und Zuständigkeitsstruktur. Nutze vorhandene Loader, Schemas und Mechanismen, wenn sie geeignet sind. Begründe neue Mechanismen anhand konkreter Lücken.

Beschreibe detailliert:

- Was genau geändert werden soll.
- Warum jede Änderung notwendig oder sinnvoll ist.
- Wie Nutzer die Konfiguration anschließend verwalten.
- Wie Einstellungen und Profile ausgewählt und validiert werden.
- Wie Konfigurationsstände dauerhaft einer Ausführung zugeordnet werden.
- Wie spätere Evals reale Komponenten mit gezielt veränderten Parametern ausführen können.
- Wie die Migration schrittweise erfolgt, ohne konkurrierende Quellen zu schaffen.

Config-Zentralisierung allein ist noch kein vollständiges Eval-System. Kennzeichne zusätzliche Anforderungen ausdrücklich. Starte keine kostenpflichtigen Eval-Kampagnen.

Lege die Ergebnisse im Repository ab und aktualisiere bestehende Dokumente konsistent. Bewahre historische Entscheidungen und Belege; überschreibe sie nicht so, dass ihre ursprüngliche Bedeutung verloren geht.

## 5. Gemeinsame Entscheidung vor Implementierung

Präsentiere dem Nutzer nach der Bestandsaufnahme:

- Das konkrete Zielbild.
- Tatsächlich noch offene Entscheidungen mit begründeter Empfehlung.
- Einen schrittweisen Umsetzungsplan.
- Das erste kleine, klar abgegrenzte Umsetzungspaket mit betroffenen Bereichen und Abnahmekriterien.

Beginne noch keine Implementierung dieses Pakets, bevor der Nutzer ihm zugestimmt hat. Dokumentation und Bestandsaufnahme sind bereits beauftragt.

Frage bereits bestätigte Grundsatzentscheidungen nicht erneut ab. Triff gewöhnliche Untersuchungs- und Dokumentationsentscheidungen selbstständig.

## 6. Reihenfolge und Grenzen

Die vereinbarte Priorität lautet:

1. Config-Zentralisierung.
2. Test-Refactoring.
3. Cgroup-/Worker-Refactoring.
4. Die zwölf offenen Befunde.

Das Test-Refactoring wird in einer anderen Session vorbereitet. Erfinde dafür keine neuen Kategorien oder Vorgaben. Dokumentiere benötigte Schnittstellen und Abhängigkeiten.

Das spätere Cgroup-/Worker-Refactoring soll wesentlich weniger komplex und einfacher skalierbar werden. Die Plattform führt überwiegend eigenen generierten Code aus. Die bereits vereinbarten Architekturentscheidungen stehen in D18 und den referenzierten Dokumenten. Implementiere dieses Refactoring jetzt noch nicht.

Schließe keine Befunde automatisch aufgrund der Config-Arbeit. Unterscheide Quellcodeprüfung, lokale Tests, historische Belege und tatsächliche Abnahme. Keine Deployments oder Änderungen an produktiven Hosts im Rahmen dieses Auftrags.

## 7. Unabhängige Prüfung

Nutze einen frischen unabhängigen Subagenten, um die vervollständigte Config-Bestandsaufnahme und Zieldefinition gegen Code, tatsächliche Aufrufketten und Originalquellen zu prüfen.

Die Prüfung soll insbesondere übersehene Konfigurationsquellen, konkurrierende Zuständigkeiten, versteckte Defaults, Probleme bei Aktivierung und Recovery sowie unnötige Komplexität aufdecken.

Dokumentiere das Prüfergebnis und arbeite berechtigte Korrekturen ein, bevor du dem Nutzer das konkrete Umsetzungspaket zur Entscheidung vorlegst.
