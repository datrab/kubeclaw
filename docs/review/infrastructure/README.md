# Infrastrukturreview — lebender Leitfaden

Baseline `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`, Git tree `e43c39eea59b07f0a749b7b49f3aefdd11b14ed0`. Remote-main am 2026-09-06 gelesen; lokaler Ausgangscode `5bb6612bb629b971fa83d0da018c25b52efdda97` ist tree-identisch. Eigenständiger Checkout. Vorhandenes Pipeline-Review gelesen, nicht verändert.

Zusatzstand Cilium: `1313cc3a89d74ce11d93666fad1a4b9a0f48e308` auf `feat/cilium-networking`. Argo-Branch `99b00dae3676cfff8e1ab87385c0eebe95beae85`; externer Ops-Branch `71bb4d13571132a89c1b527e551a6f3e259f3a78`. Branch-Inhalte sind kein Main- oder Live-Status. Zusatzdateien werden separat gelesen, nicht in den Code übernommen.

[Inventar](inventory.md) · [strukturierte Abdeckung](inventory-data.json)

## Schema Revision 2

Die Status- und Schweregraddefinitionen des [gemeinsamen Leitfadens](../README.md) gelten. Pro Einheit: Verantwortung und Quellen; Installation/Version/Verbraucher; Authentifizierung, RBAC und Netzwerk beidseitig; Zustand, Ressourcen, Retention; Bootstrap, Ausfall, Neustart, Upgrade/Rollback; Beobachtbarkeit; Auswirkungen auf andere Namespaces; untersuchte/ausgeführte Tests; konkrete Dokumentationskorrekturen und Live-Nachweise.

Jeder Befund gehört genau einer Einheit: `IFR-NN-NNN`, Schweregrad mit Auswirkung, Quelle und Zeilen/Funktion am genannten Commit, Auslöser, Evidenzklasse (nachgewiesener Defekt / begründeter Verdacht / offene Frage), Ursachenbehebung und echter Verifikationsschritt. Querverweise statt Duplikate. Keine Secrets oder persönlichen Betreiberwerte kopieren.

Implementiert, optional, nur dokumentiert, extern vorausgesetzt und live verifiziert werden unabhängig vom Review-Status behandelt. Hier wird nichts live verifiziert. Default-Renderfehler wegen fehlender erforderlicher Digests sind beabsichtigte Sperren, keine automatisch fehlerhaften Deployments. Syntax-, Manifest- und Unit-Tests belegen keine CNI-Durchsetzung oder Wiederherstellbarkeit.

Neue Kriterien hier ergänzen und betroffene abgeschlossene Einheiten nachprüfen. Nach jeder Einheit Datei und Inventarstatus gemeinsam speichern. Nur Review-Dokumentation ändern. Keine Installation ins Cluster, Container-Builds mit externen Nebenwirkungen, CI-Anforderung, Veröffentlichung oder funktionale Reparatur. Lokale Prüfungen vor Ausführung auf Nebenwirkungen untersuchen.

Die sechs Pfade unter `paths/` prüfen Bootstrap, Release bis Pod, Kommunikation, administrativen Zugriff, Datenwiederaufnahme/Restore und CNI-Migration. Paperless-Schutz erfordert einen unabhängigen Host-Zugang und echte Anwendungstests; eine Policy-Ausnahme verhindert keinen CNI-bedingten Ausfall.

## Nachprüfung nach erweiterten Kriterien
Revision 2 ergänzt: optionale Schalter müssen ihre Voraussetzungen tatsächlich entfernen; separate NodePorts zählen als eigene Vertrauensgrenze; gepinnte Upstream-Quelldefaults sind von effektiven Recommendation-Templates zu unterscheiden. Nachgeprüft: INF-19 (Git false, neuer IFR-19-002), INF-03/07/29 (Archviewer-NodePort, neuer IFR-03-002), INF-06 (exakte Chartquelle) und INF-10 (versionsgenaue Rootless-Dokumentation). INF-20/28 hatten bereits optionale SPIFFE-/Ingestion-/Tailscale-Renders; deren offene Laufzeitnachweise bleiben benannt. Kein nach diesem Kriterienzuwachs ungeprüft zurückgelassener Inventarpunkt.

[Prüfprotokoll](verification.md) · [Quellenabdeckung](source-coverage.md) · [Übergabe](handoff.md)

Pfade: [Bootstrap](paths/bootstrap.md), [Image/Release](paths/image-release.md), [Pipeline-Kommunikation](paths/pipeline-communication.md), [Zugriff](paths/administrative-access.md), [Persistenz/Restore](paths/persistence-restore.md), [CNI-Migration](paths/cni-migration.md).
