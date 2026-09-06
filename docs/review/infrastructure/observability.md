# INF-25 — Monitoring, Logs, Healthchecks und Alarmierung

Review: **abgeschlossen (statisch)**. Prüfcommit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. Kein Live-Nachweis.

## Inventar und Signale
`charts/kubeclaw/templates/deployment.yaml` erzeugt Gateway-Startup-/Readiness-/Liveness-Logik mit Dependency-Prüfung, Drain-/Startupmarker; Buster /healthz, Envoy 19000 bzw. Prism TCP 8443, Prism /health-/ready-Endpunkte, Registry /v2, PostgreSQL pg_isready. Logs über stdout/PVC-/Redis-Telemetrie; Ops-MCP liest begrenzt Workloads, Events und Podlogs. Hubble Relay/UI existieren nur im Cilium-Zusatzbranch, kein allgemeiner installierter Prometheus-/Alertmanager-/Log-Aggregationsstack in main.

Hubble-Branch: Relay ClusterIP:4245 plaintext Frontend, TLS zu Peers; CNP erlaubt Ops-MCP/UI und Node-Health, UI nur Portforward. Cluster-Cilium-Policy-Ausnahme ist keine allgemeine Hubble-Datenfreigabe. Collector-Retention, Hubble-Disk/RAM und externe Alarmempfänger sind nicht als konfiguriert nachgewiesen.

## Befund IFR-25-001
**Mittel; nachgewiesene begrenzte Health-Aussage.** Auslöser: erfolgreicher Prozess/Listener bei ausgefallener funktionaler Abhängigkeit. `configmap-worker-trust.yaml:19–38` antwortet pauschal 200; Buster `remote-plan-http.ts:103–106` setzt ready:true; Prism-Worker-Readiness nutzt bewusst /health, um den ersten Migration-Hook nicht zu blockieren. Diese Signale erkennen weder abgelaufenes SDS/SVID noch einen später abgestürzten BuildKit oder fehlende Worker-Datenbanktabelle.

Ursachenbehebung: Prozessliveness, Bootstrap-Readiness und Betriebsbereitschaft getrennt definieren, funktionale Abhängigkeiten mit begrenzten Prüfungen abdecken und Ausfall alarmieren. Echter Test: funktionalen Dienst nach Startup stoppen, Marker/Zertifikat/DB gezielt ungültig machen, Status und Alarm prüfen; keine Restart-Schleife bei Fremddienst-Ausfall.

## Betrieb, Dokumentation und Tests
Keine Alarmierung für volles Volume, veraltete Security-DB, fehlgeschlagenes Backup oder SVID-Auslauf im Repository vollständig implementiert. Das ist für einen Hobbycluster kein Anlass zum umfangreichen Umbau, aber eine klare Betriebsanforderung für spätere Abnahme. Log-Rotation auf Node und Weiterleitung sind extern; sensitive Logs sind auch bei read-only MCP zugänglich.

Lokale echte MCP-HTTP-Tests zeigen Health erreichbar trotz fehlender Kubernetes-Credentials und ehrlich fehlgeschlagene Reads. Diese Eigenschaft ist korrekt als Prozesshealth dokumentiert. Kein Live-Monitoring geprüft. Architektur-Observability-Dokumente beschreiben vor allem Pipeline-Ereignisse; sie ersetzen keine Infrastrukturalarme oder Aufbewahrungs-/Kapazitätsregeln. Konkrete Fehlstellen im nächsten Dokuauftrag ergänzen.
