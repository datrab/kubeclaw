# Infrastrukturreview — Übergabe

**29/29 Inventareinheiten und alle sechs Infrastrukturpfade statisch abgeschlossen.** 34 zentral zugeordnete Befunde; kein Inventarpunkt ungeprüft zurückgelassen. „Abgeschlossen“ ist keine Fehlerfreiheit, Betriebsfreigabe oder Live-Verifikation. Implementierungslücken und nicht ausführbare echte Tests sind dokumentierte Ergebnisse des Reviews.

Prüfbaseline main `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`; Cilium-Zusatzstand `1313cc3a89d74ce11d93666fad1a4b9a0f48e308`. main vor Abschluss unverändert verifiziert. Dokumentation auf eigenem Branch `docs/infrastructure-review-20260906`, ausgehend vom Pipeline-Dokumentationsstand `815b7edea4af1e23ef7b40b43806db6741fb0007`; dessen Nicht-Review-Code stimmt mit main überein. Vorhandene Pipeline-Dateien bleiben erhalten, gemeinsamer Einstieg bekommt nur einen zusätzlichen Infrastrukturabschnitt. Kein Merge/PR/Release/Deployment; Commit mit `[skip ci]`, Push-Workflows sind auf main beschränkt.

## Wichtigste Befunde

| Priorität / Beleg | Ergebnis |
|---|---|
| Hoch — [IFR-17-001](secrets.md) | Nova erhält optional clusterweiten Zugriff auf gleichnamige OAuth-Secrets; Name ist keine Namespacegrenze |
| Hoch — [IFR-18-001](namespace-broker.md) | fest codierte Admission-Identität greift bei alternativem Installationsnamespace nicht; Controllerrechte betreffen zudem fremde Namespaces |
| Hoch — [IFR-19-001](role-workloads.md) | Default latest-Values folgen nicht den tatsächlich geprüften candidate-/Digest-Releases |
| Hoch — [IFR-08-001](registry-local.md) | erfolgreicher lokaler Registry-Push stellt den erforderlichen Host/containerd-Pullvertrag nicht her |
| Hoch — [IFR-10-001](buildkit.md) | begründetes Isolationsrisiko durch no-process-sandbox im langlebigen Runtime-Container; kein erfolgreicher Secret-/Root-Exploit behauptet |
| Hoch — [IFR-24-002](updates-security.md) | offline eingebettete Trivy-Datenbanken ohne Frischegrenze können veraltete Sicherheitsprüfungen bestehen |
| Hoch — [IFR-26-001](backup-recovery.md) | vorhandene PostgreSQL-Sicherung umfasst nicht den separaten Prism-Artefaktbestand und ist kein vollständiges Host-DR |
| Hoch — [IFR-02-001](cilium-migration.md) | Paperless-Schutz/Recovery beim Single-Node-CNI-Cutover sind offene Betriebsnachweise; Policy-Ausnahme genügt nicht |
| Mittel — [IFR-05-001](argocd.md), [IFR-07-001](envoy.md) | Applications/Ownership fehlen; statische Proxykonfiguration löst keinen sicheren Podrollout aus |
| Mittel — [IFR-03-002](network-dns.md), [IFR-19-002](role-workloads.md) | separater Archviewer-NodePort ohne Auth; Git false entfernt Pflicht-SSH-Secret nicht |

## Abdeckung und lokale Evidenz

[Inventar](inventory.md), [Quellenmatrix](source-coverage.md), [Prüfprotokoll](verification.md) und [bereinigte Ergebnisse](verification-results.json). Echte Helm-/Schema-/Versions-/Workflowprüfungen, vier Release-/Versionstests, drei Ops-Helmtests und sieben lokale MCP-Tests bestanden. Acht reguläre Renderkombinationen plus gezielte Git-false-Reproduktion. Vorhandene Tests mit Test-Doubles werden ausdrücklich nicht als Clusterbeleg gewertet. Keine Mocks/Ersatzdienste zum Erreichen eines grünen Infrastrukturtests hinzugefügt.

Die gerenderten Rollen und Prism-Dienste fordern zusammen 6.85CPU/37.375GiB an; Infrastruktur, Paperless, Jobs/Surge und Overhead kommen hinzu. Es wurden weder freie Hostkapazität noch reale Last gemessen.

## Konkreter Dokumentationsfolgeauftrag

1. Ausgangsumgebung, K3s-/Helm-/Imageversionen, externe Storage-/Secret-/Tailnet-Voraussetzungen und reproduzierbaren Erstinstallationspfad festhalten.
2. Digestbasierte Release-Einheit aus Chart/Values/Bundle/Images; Argo-Ownership, Reihenfolge, Drift/Prune und DB-Migrationsrollback festlegen.
3. Beidseitige Netzwerk-/Identitymatrix einschließlich Node-Pulls, Archviewer, API-DNAT, Secretrechte und Benutzerzugänge vervollständigen.
4. Pro Volume/Zustandsdienst Eigentümer, UID/GID, Schreib-/ACK-Vertrag, Retention, Konsistenzpunkt, Backup-/Restore-/Schlüsselbedarf und externen Ausfallbereich dokumentieren.
5. Normalbetrieb/Updates, funktionale Healthchecks, konkrete Fehlersuche/Alarmierung, Kapazitätsbudgets und phasenabhängige Recovery beschreiben.
6. Betreiber-Values von veröffentlichbaren Beispielen trennen; Legacy-/Doppelquellen erst nach externer Nutzungsprüfung entfernen. Keine Produktdoku umfassend umgeschrieben oder sensible Werte übernommen.

## Verbleibende echte Nachweise nach dem vorgesehenen Veröffentlichungszeitpunkt

- Frischer isolierter Bootstrap einschließlich vollständiger gepinnter Upstream-Charts, CSI, Secretversorgung und tatsächlichem Podstart.
- Release-Digest bis laufende imageID, cacheleerer Node-Pull, private Images, Registry-/Git-Ausfall und Rollback.
- Reale DNS/API-/Policy-/mTLS-Kommunikation mit Negativtests, SPIRE-Rotation/Ablauf und Proxykonfigurationswechsel.
- RBAC/VAP mit alternativen Namespaces, verbotenen Secret-/Mutationszugriffen; Tailnet-ACLs und echte CLI-Paarung.
- Fremder Buildcode gegen Prozess-/Netz-/Dateigrenzen; Offline-Sicherheitsdatenbanken über zulässige Altersgrenze.
- Echter Redis-Neustart/ACK-Verlust/Speicherdruck und vollständiger DB-/Artefakt-/Schlüssel-Restore in separatem Ausfallbereich.
- CNI-Migration und phasenweiser Rollback mit unabhängigen Hostzugang sowie Paperless-Schreib-/Lese-/Hintergrundjob- und Pipelinebaseline.

Diese Tests wurden absichtlich nicht als bestanden markiert. Der jetzige Auftrag ist das abgeschlossene Repositoryreview; funktionale Reparaturen und spätere Betriebsversuche benötigen einen gesonderten Umsetzungsauftrag.

## Befundregister

| ID | Schweregrad | zuständiger Review |
|---|---|---|
| IFR-01-001 | mittel | [cluster-bootstrap.md](cluster-bootstrap.md) |
| IFR-02-001 | hoch | [cilium-migration.md](cilium-migration.md) |
| IFR-03-001 | mittel | [network-dns.md](network-dns.md) |
| IFR-03-002 | mittel | [network-dns.md](network-dns.md) |
| IFR-04-001 | mittel | [tailscale.md](tailscale.md) |
| IFR-05-001 | mittel | [argocd.md](argocd.md) |
| IFR-06-001 | mittel | [spire.md](spire.md) |
| IFR-07-001 | mittel | [envoy.md](envoy.md) |
| IFR-08-001 | hoch | [registry-local.md](registry-local.md) |
| IFR-08-002 | mittel | [registry-local.md](registry-local.md) |
| IFR-09-001 | mittel | [registry-mirror.md](registry-mirror.md) |
| IFR-10-001 | hoch | [buildkit.md](buildkit.md) |
| IFR-11-001 | mittel | [redis.md](redis.md) |
| IFR-12-001 | mittel | [litellm-postgresql.md](litellm-postgresql.md) |
| IFR-13-001 | mittel | [qdrant.md](qdrant.md) |
| IFR-14-001 | mittel | [litellm.md](litellm.md) |
| IFR-15-001 | mittel | [prism-postgresql.md](prism-postgresql.md) |
| IFR-16-001 | mittel | [storage.md](storage.md) |
| IFR-17-001 | hoch | [secrets.md](secrets.md) |
| IFR-18-001 | hoch | [namespace-broker.md](namespace-broker.md) |
| IFR-19-001 | hoch | [role-workloads.md](role-workloads.md) |
| IFR-19-002 | mittel | [role-workloads.md](role-workloads.md) |
| IFR-20-001 | mittel | [prism-workloads.md](prism-workloads.md) |
| IFR-20-002 | mittel | [prism-workloads.md](prism-workloads.md) |
| IFR-21-001 | mittel | [runtime-images.md](runtime-images.md) |
| IFR-22-001 | mittel | [ci-build.md](ci-build.md) |
| IFR-23-001 | mittel | [release-promotion.md](release-promotion.md) |
| IFR-24-001 | mittel | [updates-security.md](updates-security.md) |
| IFR-24-002 | hoch | [updates-security.md](updates-security.md) |
| IFR-25-001 | mittel | [observability.md](observability.md) |
| IFR-26-001 | hoch | [backup-recovery.md](backup-recovery.md) |
| IFR-27-001 | mittel | [ops-mcp.md](ops-mcp.md) |
| IFR-28-001 | mittel | [ops-pod.md](ops-pod.md) |
| IFR-29-001 | mittel | [public-config.md](public-config.md) |
