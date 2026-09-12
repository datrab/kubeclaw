# INF-11 — Redis und Stream-Verträge

Review: **abgeschlossen (statisch)**. Prüfcommit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. Kein Live-Nachweis.

## Inventar und tatsächliche Verwendung
Pipeline-Abhängigkeit. `my-values/infra/redis-values.yaml:1–11`: standalone, Passwort aus `redis-secrets`, 2Gi Persistenz, Request 50m/64Mi, Limit 250m/256Mi. Installation `deploy.sh:1108–1113` mit ungepinntem Bitnami-Chart. Exakter Redis-/Chartstand und AOF/RDB-/maxmemory-Defaults deshalb nicht aus lokalen Values verifizierbar.

Verbraucher: Redis-Transport-/Telemetrieadapter, OpenClaw-Agent-Observer und gegebenenfalls externes Clawdeck. `skills/common/plugins/redis-transport/src/adapter.ts` verlangt Auth, Host/Port und timeouts; LUA kombiniert XADD mit zeitlich begrenztem Dedup-Key. XADD nutzt approximatives MAXLEN, kein bytegenaues Disk-/RAM-Limit. Observer schreibt ebenfalls Streams; es ist kein Ersatz für sämtliche dateibasierten Pipeline-Journale. `configmap-gateway.yaml` und Netzwerkregeln verdrahten Secret und Port 6379.

## Befund IFR-11-001
**Mittel; begründeter Verdacht.** Auslöser: größerer Stream-/Dedup-Key-Bestand, OOM oder Neustart. Werte setzen 256Mi Containerlimit, aber keine explizite maxmemory-/Eviction-/Persistenzpolitik. ACK/Dedup beruhen auf Redis-Zustand; Verlust von Dedup-Keys kann erneute Veröffentlichung erlauben, Stream-Trimming kann alte Events entfernen. Persistente 2Gi allein garantieren keine Dauerhaftigkeit jedes ACK.

Ursachenbehebung: tatsächliche Chartversion pinnen und Redis-Dauerhaftigkeits-/Evictionvertrag passend zu den Verbrauchern ausdrücklich setzen, RAM-/Stream-/Payloadbudget ableiten, Wiederveröffentlichung als Wiederholungsfall behandeln. Echter Test: realer Redis mit gerenderten Einstellungen, verlorenes ACK, SIGKILL/Neustart, maxmemory-Grenze und Wiederaufnahme; Events/Dedup-Fenster kontrollieren.

## Betrieb und Dokumentation
Passwortschutz ist vorhanden, TLS nicht lokal aktiviert; Netzwerkisolation allein ist nicht Verschlüsselung. Ein gemeinsames Passwort besitzt breite Redis-Rechte, kein tenantweises ACL-Modell im Repository. Single Replica/PVC ohne beschriebenen externen Backup-/Failoververtrag. Installation/Rotation hängen an externem Secret; Rotation während laufender Verbindungen testen.

Adapter/Observer und Manifest-Aufrufer statisch untersucht, kein Redis-Dienst gestartet. Vorhandene Adaptertests sind nicht als Infrastrukturtest gewertet. Dokumentation `docs/deployment/infrastructure.md` ist zu knapp: tatsächliche Streams/Retention, Chart-/Redis-Version, Backup, Credentialrotation und Datenverlustgrenze fehlen.
