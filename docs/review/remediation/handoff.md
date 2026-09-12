# Übergabe des ursprünglichen Planungsstands

Aktueller Stand nach D12 (2026-09-12): **128 lokal verifiziert / 5 teilweise / 2 in Bearbeitung / 19 offen**. Von den39 sind34 lokal abgeschlossen. Live-Abnahmen folgen separat durch den Auftraggeber nach Open-Sourcing. Maßgeblich sind [D12](decisions.md#d12--lokaler-abschluss-und-separate-live-abnahme), [Einzelbewertung](implementation/pr6-local-acceptance.md) und [Register](register.json). Ausschließlich im bestehenden PR #6 und dessen Branch weiterarbeiten; frühere Anweisungen zu weiteren Fixbranches gelten nicht. Die folgenden älteren Stände bleiben historischer Verlauf.

**Historischer Planungscheckpoint. Die Umsetzung läuft inzwischen; aktueller Stand und nächste Schritte stehen in [progress.md](progress.md) und register.json.**

## Gespeicherter Stand

- D01–D11 halten die bestätigten Produkt-/Architekturentscheidungen einschließlich Nutzerkorrekturen fest.
- 154/154 kanonische Kennungen sind im Register enthalten: 103 Pipeline, 34 Infrastruktur, 17 zusätzliche Traces. Jede besitzt genau ein primäres Arbeitspaket und eine commitfeste Originalquelle.
- 14 Arbeitspakete mit Integrationsabhängigkeiten und Abnahmekriterien. Original-Findingabschnitte in register.json bewahren die detaillierten Auslöser, Ursachenbehebung und Verifikationsvorschläge; Beziehungen markieren gemeinsame Ursachen ohne Verlust der Kennungen.
- Alle Findings weiterhin offen. Keine funktionale Implementierung und keine neuen Softwaretests erfolgt. Planungsprüfung steht in validation.md.

## Konkreter nächster Arbeitsschritt

Für einen gesonderten Umsetzungsauftrag aktuellen main-/Fixbranchstand erneut prüfen, danach WP02 mit `PCR-STATE-002` (atomare Sperrenübernahme) und `PCR-STATE-001` (Objektbesitz im Journal) beginnen. Die Originalberichte enthalten echte Mehrprozess-/Mutationsnachweise. Aktuellen Fehler mit Originalimplementierung bestätigen, gemeinsame Locknutzer und Dateisystemvoraussetzungen lesen, kleine Ursachenbehebung plus echte Regression und Gegenprüfung erstellen. Anschließend Effect-/Replay-/Recoveryabhängigkeiten abarbeiten.

Parallel kann WP01 Verträge/Registry und WP11/WP12 voneinander getrennte Build-/Berechtigungsbereiche bearbeiten. Keine parallelen unkoordinierten Änderungen an gemeinsamer Core-/Worker-/Remediationlogik. Noch kein Subagent hat in diesem Planungsauftrag ein Implementierungspaket übernommen.

## Noch offene Voraussetzungen

- Verfügbare Node-/Python-/Go-/Helm-/Browser-/Containerwerkzeuge zu Beginn des jeweiligen Pakets prüfen; historische Testfehlschläge oder fehlende Werkzeuge sind keine aktuelle Messung.
- Echte Clawdeck-Schnittstelle, Redis/PostgreSQL/Prism/Agentdienste und deren Zugänge für End-to-End-Nachweise erforderlich; keine erfundenen Ersatzempfänger als bestandene Integration.
- Kubernetes/Tailscale/Hostkapazität/Paperless-Abhängigkeiten sowie unabhängiger Recoveryzugang für WP10/WP12/WP13 erheben. Live-Cutover, Restoreexperimente und Deployment sind hier nicht autorisiert.
- Cilium-Zusatzstand separat vergleichen. Keine Übernahme eines anderen Branches allein aufgrund des Befundlinks.
- Die automatische Loglöschung ist ausdrücklich verworfen. Manuelle Bereinigung und Kapazitätsgrenzen müssen mit langlebigem Ausführungszustand und Clawdeck vereinbar sein; nicht einfach alle Cleanupmechanismen abschalten.
- Unaufgelöste Kurzreferenzen in register.json sind ehrlich markiert. Vor konkreter Codeänderung im Kontext des vollständigen Eigentümerberichts auflösen; keine erfundenen Permalinks.

## Fortschritt bei der Umsetzung

Nach jeweils drei abgeschlossenen Findings oder spätestens zehn Minuten kurz melden: erledigt/154, aktuelles Paket, Auffälligkeiten/Blocker und Subagentfortschritt. Auf solche Fortschrittsmeldungen keine Antwort abwarten. Erkenntnisse und Belege fortlaufend im Repository sichern; vor jeder Remoteaktualisierung Branchdrift prüfen.
