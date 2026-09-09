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
