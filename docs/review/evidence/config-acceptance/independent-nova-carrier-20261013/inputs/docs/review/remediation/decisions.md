# Bestätigte Zielentscheidungen

Stand: 2026-09-09. Vom Auftraggeber in der Planungssitzung ausdrücklich bestätigt, einschließlich seiner Korrekturen. **Zielvorgaben für die Behebung, keine Behauptung bereits implementierten Verhaltens.** Historische Reviewberichte bleiben unverändert. Technische Ausgestaltung erfolgt in den zugeordneten Arbeitspaketen; Abweichungen von diesen Entscheidungen benötigen eine neue ausdrückliche Entscheidung.

## D01 — Vollständige Diagnose, Demo-Credentials und Logsammlung

- Relevant ausgeführte Aktionen nachvollziehbar erfassen: wer, was, wo, wann und wie; Projekt, Run, Modul, Stage, Versuch und externe Auftragsidentität soweit anwendbar mitführen. Eingaben, Ausgaben, Zustandsänderungen, Fehlerursache und Fortsetzung müssen nachvollziehbar bleiben.
- Fehler explizit berichten: betroffene Operation, Originalursache und Diagnose erhalten; nicht hinter generischen Fehlermeldungen verbergen.
- Ausschließlich **von der Pipeline erzeugte Demo-Zugangsdaten** dürfen ungeschwärzt in Logs und autorisierten Operatorbenachrichtigungen stehen. Langlebige Plattform-Secrets, GitHub-/Modellanbieter-/Tailscale-Tokens, Plattform-DBzugänge und echte Benutzerdaten bleiben geschützt. Kein pauschales Abschalten von Schutzmechanismen. Die Ausnahme richtet sich nach Herkunft/Zweck des Credentials, nicht allein nach Namespace oder Feldname.
- Clawdeck übernimmt die dauerhafte Logsammlung. Es wird kein zusätzlicher zentraler Pipeline-Logspeicher als Produktanforderung eingeführt. Vorhandene lokale Log-/Artefaktverträge müssen dennoch konsistent funktionieren; keine Dummy-Speicherung oder stiller Logverlust zur Erfüllung eines Pflichtcallbacks.
- Große Ausgaben vollständig als Dateien/Artefakte erhalten und aus Ereignissen/Benachrichtigungen verlinken. Anzeigeverkürzung ausdrücklich kennzeichnen; sie darf keine unbemerkte Kürzung des gespeicherten Originals sein. Relevante konkrete Fehler und Ergebnisse bleiben in Nachrichten sichtbar.
- Diese Regel erlaubt keine öffentliche Veröffentlichung von Logs, Secrets oder Betreiberkonfiguration. Sie betrifft den vorgesehenen privaten Diagnose-/Operatorpfad.

## D02 — Technische Lieferung und menschliche Abnahme

- **Bereit zur Abnahme:** Implementation abgeschlossen, verpflichtende Prüfungen bestanden, exakt der geprüfte Stand als Demo erreichbar und URL samt Demo-Zugangsdaten dem Operator zugestellt.
- **Abgenommen:** ausdrückliche Zustimmung des Operators zu genau dieser Version.
- Änderungswünsche erzeugen weitere Arbeit und erneute Prüfung des geänderten Stands. Eine alte Abnahme ist keine Freigabe einer neuen Version.
- Pipeline Review und Case Study bleiben optional. Eine abgelaufene Demo wird als abgelaufen dargestellt; bereits erteilte Abnahme bleibt historisch gültig.

## D03 — Pflichtprüfungen und optionale Agenten

- Lint nach jeder Moduländerung verpflichtend, einschließlich Reparaturen.
- Deterministische Tests mit ausdrücklich definiertem Pflichtumfang pro Modul. Vor technischer Lieferung zusätzlich kumulative Prüfung des integrierten Projekts. Testauswahl ist projektspezifisch; nicht jede vorhandene Suite muss für jede Anwendung laufen. Übersprungene Pflichtprüfungen zählen nicht als bestanden. Pflichtumfang nicht stillschweigend reduzieren.
- Architektur: **nur der deterministische Teil ist Pflicht**, um erforderliche Struktur, Konfiguration und Referenzen zu prüfen. Agentisches Architekturreview ist optional. Die frühere Empfehlung eines generell verpflichtenden agentischen Architekturreviews wurde ausdrücklich korrigiert.
- Echo-Code-Review: optional, standardmäßig **aus**.
- Buster einschließlich Test-Agent: standardmäßig **an**. Der Test-Agent bleibt separat abschaltbar; vereinbarte deterministische Pflichtprüfungen bleiben verbindlich. Buster ist nicht allein mit seinem optionalen Test-Agent gleichzusetzen.
- Aktivierte Review-/Agentprüfungen sind verbindlich gemäß D10. Pipeline Review und Case Study sind optionale Abschlussauswertungen, keine Ersatztests.

## D04 — Getrennte Reparaturbudgets und einmalige Nova-Eskalation

- Pro Modul gibt es getrennte Budgets: **zwei Lint-Reparaturrunden, zwei Review-Reparaturrunden und zwei Test-Reparaturrunden**. Reviewbudget nur bei aktiviertem Review. Keine gemeinsame Zweiergrenze und keine drei Standardrunden.
- Erstimplementation und reine Wiederprüfungen zählen nicht als Reparatur. Eine Reparatur wird dem auslösenden Prüfschritt zugerechnet; danach erforderliche andere Prüfungen bleiben verpflichtend. Bereits verbrauchte Budgets bleiben erhalten, auch bei Invalidierung oder Neustart.
- Eine weitere notwendige Reparatur über ein ausgeschöpftes Kategorienbudget führt zu **Needs Nova** mit vollständiger Fehler-/Änderungshistorie. Erfolg nach der letzten erlaubten Reparatur wird nicht allein wegen des Zählerstands blockiert.
- Nova darf **einmal pro Modul genau einen zusätzlichen Reparaturauftrag** geben. Führt dieser einschließlich aller notwendigen Wiederprüfungen nicht zum Erfolg, folgt **blocked**; weitere Arbeit benötigt die Entscheidung des Operators. Keine zwei zusätzlichen Nova-Runden und kein automatischer Reset aller Budgets.
- Nova darf Anforderungen oder Pflichtprüfungen nicht eigenständig abschwächen. Fachliche Entscheidung und bewilligter zusätzlicher Auftrag müssen dauerhaft nachvollziehbar sein.

## D05 — Parallele Module und kontrollierte Integration

- Unabhängige Module in getrennten autorisierten Worktrees parallel bearbeiten.
- Kurze gemeinsame Gitintegrationen serialisieren; normale Lockkonkurrenz kontrolliert behandeln.
- Abhängige Module erst nach bestandenen Pflichtprüfungen ihrer Voraussetzungen starten.
- Maximalparallelität konfigurierbar. Den tatsächlich integrierten Stand anschließend kumulativ prüfen.

## D06 — Demo-Lebensdauer

- Standardmäßig **eine Woche (sieben Tage) ab Bereit zur Abnahme**, pro Projekt konfigurierbar und verlängerbar.
- Operator kann jederzeit vorzeitig bereinigen. Vor Ablauf benachrichtigen.
- Namespace, Zugangs-URL/Exposure und Demo-Credentials haben denselben Lebenszyklus. Planende darf die übertragene Operator-Exposure nicht vorzeitig löschen.
- Nach Ablauf beziehungsweise expliziter Bereinigung Demo-Ressourcen entfernen. Code, Berichte, Logs und Abnahmestatus folgen D07; die Demo-TTL ist keine Log-TTL.

## D07 — Aufbewahrung ohne automatische Loglöschung

- Logs auf Disk oder in Git bleiben **auf unbestimmte Zeit bis zur manuellen Bereinigung durch den Operator**. Die vorgeschlagene automatische 30-Tage-Löschung wurde verworfen.
- Code, finale Berichte, Entscheidungen und Abnahmehistorie bleiben bis zur ausdrücklichen Projektlöschung erhalten.
- Solange ein Run auf Entscheidung wartet, seine zur Fortsetzung/Prüfung erforderlichen Belege erhalten. Explizite Bereinigung darf nicht unbemerkt einen fortsetzbaren Run unbrauchbar machen; Konsequenz sichtbar machen.
- Vollständige große Ausgaben wie in D01; Clawdeck bleibt Logsammlung. Eine konkrete Clawdeck-interne Löschfrist wurde nicht festgelegt.
- Nicht alle Caches, entpackten Quellen oder temporären Buildverzeichnisse sind Logs. D07 erklärt diese nicht pauschal für unbefristet aufzubewahren. Speicherbudgets, Backpressure und explizite Kapazitätsfehler dürfen Datenverlust nicht durch stille Kürzung/Löschung verdecken.

## D08 — Technische Wiederaufnahme

- Sicher wiederholbare Arbeit automatisch fortsetzen.
- Bei möglicherweise bereits ausgeführten externen Aktionen zuerst tatsächlichen Zustand ermitteln und vorhandene Arbeit übernehmen, beispielsweise Git-Push oder angenommener Buster-Auftrag.
- Bleibt der Ausgang unklar: Needs Nova mit konkreter Diagnose, keine blinde Wiederholung ungewisser Seiteneffekte. Auch ein zusätzlicher Auftrag nach D04 hebt diese Integritätsgrenze nicht auf.
- Technische Wiederholungen verbrauchen kein fachliches Reparaturbudget; eigene konfigurierbare Zeit-/Versuchslimits verhindern Endlosschleifen.

## D09 — Generischer Worker-Core

- Derselbe Core für Buster, Prism und weitere Worker: Auftragsidentität, Status, Timeout, Abbruch, Wiederaufnahme und Ergebnisübergabe.
- Fachlogik in getrennten Engines. Workerfähigkeiten und Ressourcen pro Worker konfigurierbar.
- Nova steuert den Gesamtprozess; Worker führen Aufträge aus. Generischer Core importiert keine konkreten Plugins.
- Dauerhafter Ausführungszustand besteht unabhängig von Clawdeck. Logsammlung ist keine Voraussetzung für korrekte Recovery; benötigte Auftrags-/Ergebnisbelege sind trotzdem zuverlässig zu persistieren.

## D10 — Bewusste Risikoakzeptanz

- Ausschließlich der Operator darf fachliche Qualitätsrisiken bewusst akzeptieren, mit Begründung und Bindung an den geprüften Stand. Nova darf diese Freigabe nicht selbst erteilen.
- Fehlgeschlagene Pflichtprüfungen bleiben fehlgeschlagen. Änderungen an Anforderungen/Pflichtumfang ausdrücklich entscheiden und betroffenen Stand erneut prüfen; kein force-passed.
- Beschädigte Evidenz, falsche Ergebniszuordnung oder fehlende Autorisierung sind nicht durch Risikoakzeptanz übersteuerbar.

## D11 — Persönliche Designpräferenzen

- Gespeicherte persönliche Präferenzen gelten projektübergreifend; pro Projekt überschreibbar oder deaktivierbar.
- Explizite Projektvorgaben haben Vorrang. Jede Generierung hält fest, welchen Präferenzstand sie tatsächlich verwendet hat.
- Projektübergreifende Verwendung hebt Nutzer-, Projekt-/Ereignisherkunft und Generationsidentität nicht auf. Keine zufällige Aggregation durch kollidierende Schlüssel.

## Noch benötigte Umgebungsdaten, keine neuen stillen Produktentscheidungen

Die Pipelinevorgaben reichen für den Behebungsplan. Konkrete Hostkapazität/Paperless-Reserve, externe Tailnetregeln, unabhängiger Recoveryzugang, Backupziel und akzeptierte Wiederherstellungszeiten sowie verfügbare Clawdeck-Schnittstelle sind vor den jeweiligen Betriebsnachweisen zu erheben. Keine neue VM, kostenpflichtige Ressource, Backupgarantie oder externe Zugriffsregel wird aus diesem Dokument als bereits genehmigt/vorhanden abgeleitet. Technische Vorschläge hierfür gehören mit Begründung in WP09/WP12/WP13.

## D12 — Lokaler Abschluss und separate Live-Abnahme

Am2026-09-12 vom Auftraggeber ausdrücklich bestätigt: Wenn Code vollständig
korrigiert und ausreichend lokal getestet ist, gilt das Finding als **lokal
verifiziert und für diesen Behebungsauftrag abgeschlossen**. Die Live-Tests
führt der Auftraggeber am Ende nach dem Open-Sourcing aus; GitHub-Actions-Gates
bleiben dafür erhalten. Lokale Nachweise und ausstehende Live-Nachweise werden
getrennt geführt. Fehlende Implementierung oder unzureichende lokale Abdeckung
bleiben offen. Nicht ausgeführte Tests werden nicht als bestanden bezeichnet.

Diese Entscheidung ersetzt frühere Anforderungen, bereits für den lokalen
Findingabschluss sämtliche Live-/Cluster-/Empfängerprüfungen auszuführen. Sie
ändert weder Runtime-Sicherheitsgates noch D02-Produktabnahme und autorisiert
keine Deployments, Nachrichten oder Umgehung einer gesperrten Aktion. Umsetzung
und [Einzelbewertung](implementation/pr6-local-acceptance.md) bleiben in PR #6;
keine zusätzlichen Branches.

## D13 — Explizite Tasklimits und großzügige Reserve

Am 2026-09-12 vom Auftraggeber nach Abwägung ausdrücklich bestätigt:

- Der neue native Worker-Ressourcenpfad begrenzt Linux-Tasks, also alle Threads
  einschließlich des Hauptthreads jedes Prozesses. Prozesse werden nicht noch
  einmal zusätzlich zu ihren Threads gezählt.
- Die Einheit wird im Ressourcenvertrag und in Profilen ausdrücklich gebunden.
  Bestehende Prozessbudgets und historische Receipts werden nicht stillschweigend
  als Taskbudgets umgedeutet; die Migration muss versioniert beziehungsweise
  eindeutig diskriminiert sein und alte Nachweise lesbar erhalten.
- Limits mit großzügiger Reserve anhand tatsächlicher Worker-Arbeit wählen,
  nicht knapp am Normalverbrauch und nicht durch eine feste Umrechnung alter
  Prozesszahlen. Fehlende Messungen erlauben keine Behauptung einer bereits
  erfolgten Kalibrierung. CPU, Speicher und Parallelität bleiben separat begrenzt.
- Die Prüfung und vollständige Zentralisierung aller Betreiber-Einstellungen
  über die vorhandene `swarm.config.json` ist ein eigener Roadmap-Schritt nach
  den vier verbleibenden Findings in PR #6. Keine zweite Betreiberdatei einführen.

Dies ist die freigegebene Zielentscheidung, noch kein implementierter oder
verifizierter Ressourcenpfad. D09 und D12 bleiben unverändert; keine Deployment-
oder Privilegienänderung ist damit autorisiert.

## D14 — Eigene dauerhafte Fixture-Lebensdauer in Buster

Der Auftraggeber hat den Vorschlag ausdrücklich bestätigt: Retained Fixtures
erhalten eine eigene dauerhafte Lebensdauer in Buster mit großzügigem separatem
Ressourcenbudget und einem Abschlussbeleg nach dem Cleanup. Bereitschaft nach
dem Setup ist kein Nachweis abgeschlossener Bereinigung. Buster führt
Abhängigkeiten, Bereitschaft und Fixture-Abschluss; Worker Core stellt neutrale
Prozessbesitz-, Messungs- und Recoverymechanismen bereit. Prism behält seine
normale Attempt-Lebensdauer. Die bereits freigegebene Core/Buster-Aufteilung und
Task-Einheit müssen nicht erneut bestätigt werden.

Die physische Ressourcenbindung bleibt während der Fixture-Lebensdauer erhalten;
ein Prozesswechsel zwischen Cgroups darf nicht als Übertragung bereits
angefallener Speicherbelastung behauptet werden. Historische Setup-Receipts und
Budgets bleiben unverändert lesbar; neue Lebensdauerbelege sind explizit
versioniert und gebunden.

## D15 — Vollständiger verbleibender 23er-Umfang

Der Auftrag umfasst jetzt alle 23 noch nicht verifizierten Findings der
ursprünglichen 154: die vier laufenden Implementierungen und die 19 bislang
offenen Infrastrukturfindings. Arbeit weiter direkt in PR #6. Vollständige
Implementierung und echte ausreichende lokale Verifikation sind erforderlich;
Live-Gates bleiben vorbereitet für die abschließende Ausführung durch den
Auftraggeber. Kein Live-Nachweis wird aus Konfiguration oder lokalen Ersatzdaten
abgeleitet. Die gewünschte Mindestarbeitsdauer von acht Stunden ist kein Beleg
für Abschluss und wird nur bei tatsächlich geleisteter Zeit behauptet.

## D16 — Feste Host-Reservierung für native Worker

Der Auftraggeber hat Variante A aus `implementation/pr6-node-accounting-decision.md`
ausdrücklich bestätigt: hostverwaltete Rollenbereiche mit festen, tatsächlich
schedulerwirksamen Kapazitätsreservierungen. Die Umsetzung betrifft Buster und
Prism. Gesamtlimits und vollständige Admission-Reservierungen verhindern, dass
Parallelität großzügige Einzelbudgets unkontrolliert vervielfacht. Kubernetes darf
diese Hostkapazität nicht nochmals an Pods vergeben. Andere Hostdienste behalten
eine getrennte Reserve. Konkrete verfügbare Kapazität wird geprüft, nicht erfunden.

D13/D14 bleiben unverändert. Die Entscheidung autorisiert die Implementierung in
PR #6, keinen Hosteingriff, Deployment oder Kauf zusätzlicher Ressourcen. Die
Node-/Runtime-Anbindung muss fehlende Voraussetzungen vor Aktivierung abweisen.

## D17 — Config als alleinige Autorität, klare Komponentengrenzen

Der Auftraggeber präzisiert den laufenden CONFIG-Auftrag: Code und Konfiguration
müssen klar getrennt sein. Für konfigurierbare Werte dürfen keine hardcodierten
Fallbacks, lokalen Ersatzdefaults oder konkurrierenden Autoren im Code verbleiben.
Fehlende erforderliche oder ungültige Konfiguration muss vor Aktivierung abgewiesen
werden. Auch Loader, Schemas, Environment, Entrypoints und Charts dürfen keinen
versteckten zweiten Defaultpfad bereitstellen. Gewünschte Standardwerte stehen
ausdrücklich in der gepflegten Konfiguration.

Gewünschte Struktur sind klar zugeordnete zentrale Config-Dateien pro Plugin und
entsprechend für Worker Core, Engine, Orchestrator Core und weitere Komponenten.
Jede Einstellung hat genau eine editierbare Autorenquelle. Ein gemeinsamer
Einstiegspunkt darf diese Komponentenreferenzen zusammenführen und validieren;
er darf ihre Werte nicht parallel pflegen oder durch lokale Defaults ersetzen.
Die bisherige zentrale swarm-Autorität ist bei dieser Aufteilung nachvollziehbar
zu migrieren, nicht durch zusätzliche konkurrierende Dateien zu ergänzen.
Externe Secretwerte und die getrennte Softwareversionsautorität bleiben erhalten;
ihre erforderlichen Referenzen und Zuständigkeiten müssen eindeutig sein.

F1–F6 und F-DOC bleiben verpflichtend. Die Inventur muss jede konfigurierbare
Einstellung, ihren einzigen Autor und alle tatsächlichen Consumer zuordnen.
Positive Profile müssen den echten Consumer verändern; fehlende Werte und
wieder eingeführte Fallbacks müssen durch passende Negativ-/Mutationstests
auffallen. Ersetzte Ladepfade und widersprüchliche Anleitungen sind zu entfernen
oder ausdrücklich als historische Belege zu kennzeichnen. Die Entscheidung
beschreibt das Ziel, keinen bereits abgeschlossenen Implementierungsstand.

## D18 — Kubernetes-Ausführung statt eigener nativer Hostpools

Am 2026-10-12 hat der Auftraggeber den Zielwechsel und die fünf vorgeschlagenen
Vertragsanpassungen ausdrücklich akzeptiert, **sofern die Lösung wesentlich
weniger komplex und einfacher skalierbar wird**. Einsatzprofil ist generell
eigener generierter Code. Die [detaillierte Architektur- und Migrationsbeschreibung](worker-execution-simplification-20261012.md)
und der [beschlossene Arbeitsplan](implementation-order-20261012.md) konkretisieren
Umfang, Gründe, Grenzen und Abnahme.

- Prism führt jeweils einen Auftrag/Attempt in einem Kubernetes-Job aus.
- Buster führt zunächst einen ganzen Testplan mit lokalen Fixtures in einem
  Job aus. Seine harte Ausführungsgrenze ist zunächst der Plan, nicht jeder
  einzelne Testnode. Nodefristen, Outputgrenzen und fachliche Ergebniszuordnung
  bleiben erhalten. Ein fehlerhafter Test kann den ganzen Plan beeinträchtigen.
- Kubernetes/Runtime verwalten die Cgroups und schedulbaren Containerressourcen.
  Eigene hostverwaltete Buster-/Prism-Rollenpools, deren NRI-Anpassung und die
  ausschließlich dafür nötigen Sonderpfade werden nach geprüftem Cutover entfernt.
  Allgemeiner Host-/Kubeletschutz bleibt bestehen. Dies **ersetzt D16 als
  zukünftige Zielarchitektur**; D16 und historische Belege bleiben unverändert lesbar.
- Für die neue Ausführung gelten CPU-Rate plus endliche Laufzeit statt eines
  identischen kumulativen CPU-Zeitbudgets, einheitlicher Podtaskschutz mit
  nachgewiesenem aggregiertem Node-/Hostschutz statt frei unterschiedlicher
  harter Attempttasklimits und Busters Planbudget statt isolierter Nodebudgets.
  Linux-Tasksemantik aus D13 bleibt; historische Einheiten werden nicht umgedeutet.
- Bei Crash/Nodeverlust nicht zuverlässig erfasste finale Kernelwerte werden
  ausdrücklich als unbekannt ausgewiesen. Keine erfundenen Nullwerte, keine
  Behauptung einer vollständigen Endabrechnung aus periodischen Metriken.
- Bei Controllerneustart wird lebende Job-/Fixturearbeit übernommen. Bei Verlust
  des Planpods erlischt lokale Fixturebereitschaft; erst nach sicherer
  Zustandsklärung rekonstruieren oder blockieren. D14/B4 werden insoweit angepasst:
  kein Versprechen physisch weiterlebender lokaler Fixtures über Podverlust hinweg.
  Bereitschaft, eigene ausgewiesene Ressourcen und bestätigtes Cleanup bleiben Pflicht.

Erhalten bleiben dauerhafte Auftragsidentität, Claims, Deduplizierung, Resultate,
externes Effekt-Reconciliation, D08, Plugin-/Capability-/Credentialgrenzen,
Retention nach D01/D07 und separate Live-Abnahme nach D12. Ein Job garantiert
keine Exactly-once-Ausführung und ein unerreichbarer Node kein Prozessende.
Die innere Buster-Berechtigungsgrenze, Storagezugriff und BuildKit-Isolation
sind vor ihrer jeweiligen Umsetzung konkret zu lösen und echt nachzuweisen.

Die Anpassungen benötigen versionierte Contracts und explizit aktualisierte
Abnahmematrizen; ursprüngliche Befunde dürfen daraus nicht automatisch geschlossen
werden. Ist eine wesentliche Vereinfachung nur durch neue große Sonderinfrastruktur
erreichbar, wird der Zielkonflikt erneut vorgelegt. Diese Zielentscheidung ist
keine Behauptung bereits migrierter oder abgenommener Ausführung und autorisiert
keinen vorzeitigen Hosteingriff oder Deployment.

## D19 — Reihenfolge und Test-Refactoring vor Ausführungsmigration

Am 2026-10-12 hat der Auftraggeber folgende Priorität vorgegeben:

1. **CONFIG-Zentralisierung** gemäß D17.
2. **Test-Refactoring**, dessen genaue Vorgaben in einer anderen Session geplant werden.
3. **Cgroup-/Worker-Ausführungsrefactoring** gemäß D18.
4. **Die zwölf weiterhin offenen historischen Findings** mit erneuter Bewertung
   nach den vorangehenden Änderungen.

Das Test-Refactoring ist als eigener Arbeitspunkt aufgenommen. Es soll vermeiden,
dass Tests späterer Implementierungen erst nachträglich neu kategorisiert werden
müssen. Kategorien, Verzeichnisse, Runner-/CI-Verträge und weitere Testvorgaben
werden aus dem tatsächlich freigegebenen Ergebnis dieser anderen Session übernommen,
nicht in diesem Dokument erfunden. Bis dahin bleiben bestehende echte Tests Pflicht,
auch für die vorgelagerte CONFIG-Arbeit. Diese vorhandenen Tests werden in Phase 2
in den neuen Standard überführt; Phase 3/4 erstellen neue Tests nach diesem Standard.

Die Reihenfolge ersetzt die frühere vorgeschlagene Reihenfolge in der
Bestandsaufnahme. Sie ist keine Statuspromotion und kein Grund, vorhandene
Änderungen zu verwerfen. Überschneidungen, insbesondere ENGINE001/ENGINE004/
IFR10/IFR16 und CONFIG/IFR29, erhalten genau eine Zuordnung und gemeinsame Belege.
Eine Teilbehebung in Phase 1 oder 3 zählt in Phase 4 erst nach vollständiger
Findingabnahme; keine doppelte Umsetzung oder automatische Schließung.

Der unmittelbare Auftrag ist die dauerhafte Dokumentation dieser Entscheidungen
und des detaillierten Umfangs. Beginn und konkreter Umfang einzelner
Implementierungspakete werden im gemeinsamen Entscheidungsmodus anhand ihrer
Abnahmekriterien festgelegt; diese Nachricht startet noch keine Codeumsetzung.

## D20 — Zentraler Systemeinstieg und dynamische Modulprofile

Am 2026-10-12 hat der Auftraggeber die CONFIG-Definition anhand des tatsächlichen
Codes beauftragt und folgende Präzisierungen bestätigt:

- `pipeline.json` ist der gemeinsame Systemeinstieg mit Referenzen auf
  Komponenten, Pipelineabläufe und Profile. Konkrete Settings liegen in der
  jeweils zuständigen Engine-/Plugin-/Core-/Worker-Core-Konfiguration;
  keine zweite Kopie dieser Settings im Einstieg.
- Möglichst alle sinnvoll anpassbaren Komponentenparameter sollen ohne
  Quellcodeänderung konfigurierbar und für spätere Komponentenevals nutzbar sein.
  Dazu gehören geeignete Agent-/Modell-/Prompt-/Providerprofile, nicht nur Limits.
- Geeignete Tuningänderungen gelten ab dem **nächsten Modulstart**, einschließlich
  noch nicht gestarteter Module einer laufenden Pipeline. Die bereits gestartete
  fachliche Moduleinheit behält ihren dokumentierten Stand. Graph-/Berechtigungs-/
  Recoverygrundlagen bleiben stabil. Evals verwenden eine feste Generation.
- Profile bleiben validiert, vollständig und in ihren Zuständigkeiten eindeutig.
  Neue Generationen resetten keine verbrauchten Reparaturbudgets, beseitigen
  keine ungewissen Seiteneffekte und setzen historische Abnahmen nicht außer Kraft.

Die [codegestützte CONFIG-Definition](config-definition-20261012.md) beschreibt
den vorgeschlagenen vollständigen Scope, Änderungen, Bedienung und Abnahme;
die [Inventuranlage](config-scope-inventory-20261012.json) erfasst die heutigen
48 deklarierten Plugins und ihre 57 Configschemas. Sie ist keine fertige
semantische F1-Feld-/Consumerabnahme. Die physische Autorenwurzel, exakte
Scopezuordnung und konkreten Migrationspakete werden daraus gemeinsam festgelegt.

D17 bleibt maßgeblich. Der derzeitige `--pipeline`-Eingang für konkrete Graphen
ist vom neuen Systemeinstieg ausdrücklich zu unterscheiden und zu migrieren.
Kein generisches Hotreload laufender Arbeit, keine stillen Fallbacks und keine
neue große Configserverinfrastruktur aus dieser Entscheidung ableiten.
Dieser Auftrag definiert CONFIG; noch keine neue Codebehebung integriert.


## D21 — Zentraler Einstieg pipeline.config.json; Workflow bleibt pipeline.json

Am 2026-10-12 hat der Auftraggeber die Umbenennung der vorhandenen
`swarm.config.json` in **`pipeline.config.json`** angefragt. Dies wird als konkrete
Zielnamensentscheidung für die weitere Definition und genehmigte Migration
übernommen: vorhandenen Einstieg und geeignete Loader weiterverwenden, keinen
zweiten manuell gepflegten Systemeinstieg erstellen. Die zentrale Config
referenziert Komponenten/Abläufe/Profile; konkrete Settings bleiben bei ihren
jeweiligen Autoren. **`pipeline.json` bezeichnet weiterhin den Projektworkflow.**

Damit wird ausschließlich die ältere zentrale Dateinamensfestlegung aus D20
präzisiert/abgelöst. D20s Eigentum-, Modul-, Recovery-, Budget- und Evalregeln
bleiben unverändert. Frühere Namensentwürfe (`pipeline.json` als Systemeinstieg,
Beibehaltung des Swarmnamens oder zusätzliche `system.json`) bleiben historisch
lesbar, sind aber keine aktuellen konkurrierenden Ziele.

Dies ist eine Zielnamensentscheidung, keine bereits ausgeführte Dateiumbenennung,
Schema-/CLI-/Chartmigration oder Freigabe sämtlicher Implementierungspakete.
Nach C0 sind alle tatsächlichen Referenzen/Liefer-/Releasepfade im konkreten
Paket zu migrieren. Ein alten Namen automatisch suchender Fallback ist kein Ziel.

## D22 — OpenClaw-Übergabe, vollständige Prüfgates und Codequalität

Am 2026-10-12 will der Auftraggeber die Aufgabe an OpenClaw für `/goal` übergeben.
Alle Arbeitsanweisungen, bestätigten Entscheidungen, tatsächlichen Grenzen,
Tasks und Abnahmekriterien sollen ohne vorigen Chat im Repo stehen. Die
[aktuelle Übergabe](OPENCLAW-CONFIG-GOAL.md) ist der autonome Einstieg.

C0 (vollständige semantische Bestandsaufnahme und konkrete Definition) bleibt
beauftragt und offen. C1–C6 brauchen weiterhin Zustimmung zum konkreten
Umsetzungspaket; `/goal` ist keine stillschweigende neue Implementierungsfreigabe.
Eine Quellen-/Gruppeninventur oder ein reviewbares kleines C1 schließt C0 nicht.

Verbindlich gefordert: keine hardcodierten Fallbacks für konfigurierbare
Produktionssettings, keine konkurrierenden Autoren und kein Spaghetticode.
D17/F3a und die neue F-CODE-Prüfung konkretisieren dies: Settingsfehler vor Wirkung
ablehnen; klare fachliche Zuständigkeiten, zusammenhängende Module und schmale
Kompositionsgrenzen; keine duplizierten Decoder/Defaults, zyklische Ownership,
versteckten global veränderlichen Configzustände oder unbegründete Frameworks.
Nicht jede begründete Protokollkonstante ist ein Settingsfallback; die fachliche
Abgrenzung wird im Inventar nachgewiesen, nicht als Umgehung benutzt.

Abnahme benötigt vollständige Anforderungs-/Setting-/Pflichtfallzuordnung,
exakte Source-/Test-/Lieferidentitäten, echte Produktionswirkung, beabsichtigte
Fehlergrenzen, isolierte semantische Mutanten und erhaltene Rohlogs/Fehlversuche.
Keine gelöschten/abgeschwächten Tests, vergrößerten Budgets, ausgelassenen Fälle
oder historischen grünen Meldungen als Ersatz. A1–A8/F1–F6/F-DOC bleiben Pflicht.

C0 und jeder behauptete Paket-/Gesamtabschluss erhalten einen **frischen
unabhängigen Subagenten mit frischem Kontext**, ohne Implementierungsrolle oder
übernommene Autoren-Chatgeschichte. Der Reviewer prüft selbst Vollständigkeit,
Consumerverdrahtung, Fallback-/Recoverygrenzen, Codequalität, Teständerungen und
Rohbelege; bei Implementierung wiederholt er entscheidende echte Prüfungen.
Korrekturen werden nachgeprüft. Fehlt dieser Reviewer oder eine notwendige
Prüfvoraussetzung, bleibt das Gate blockiert statt Selbstabnahme/PASS.

Diese Kriterien machen Abschlussbehauptungen überprüfbar; sie behaupten keinen
unfehlbaren Schutz gegen Fälschung. Die Übergabe umfasst keine Deployments,
produktiven Hostaktionen, bezahlten Evalkampagnen, vorgezogenen Test-/Worker-
Refactorings oder automatische Findingpromotionen.

**OpenClaw-Klarstellung:** Der Auftraggeber hat AGENTS-Laden in OpenClaw deaktiviert.
Die zunächst zusätzlich angelegte Root-AGENTS.md wurde deshalb wieder entfernt.
OPENCLAW-CONFIG-GOAL.md enthält den vollständigen Auftrag einschließlich aller
Prüf-/Codequalitätsregeln eigenständig. AGENTS-Laden wird weder vorausgesetzt
noch aktiviert; die Abnahmekriterien und Autorisierungsgrenzen bleiben identisch.
