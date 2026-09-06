# INF-10 — BuildKit, Build-Isolation und Cache

Review: **abgeschlossen (statisch)**. Prüfcommit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. Kein Live-Nachweis.

## Inventar und Ressourcen
Pipeline-Build-Dienst im Buster-Runtime-Container. `docker/Dockerfile.buster-runtime:47–50` übernimmt BuildKit aus gepinntem v0.26.2-rootless-Image; `buster-runtime-entrypoint.sh:7–33` startet UID/GID 1000 via setpriv/rootlesskit, Unix-Socket, persistenten BuildKit-State und `--oci-worker-no-process-sandbox`. Runtime-Supervisor bleibt getrennte Root-Identität, Suite-Code UID 1001. Der Container ist nicht privileged, benötigt aber SETUID/SETGID/SETPCAP/CHOWN, allowPrivilegeEscalation und unconfined seccomp/AppArmor.

Request 2 CPU/8Gi, Limit 8 CPU/24Gi plus 60Gi ephemeral-storage im Runtime-Sidecar. Host-cgroup-Unterbaum wird speziell für Browser-Suiten eingebunden, kein pauschaler Host-root-Mount. Der Host muss die Delegation bereitstellen; Rootless-Preflight in deploy.sh erstellt später einen echten Test-Pod und wurde nicht ausgeführt. Das Preflight-Image ist mutable und nicht exakt der produktive BuildKit-Digest.

## Befund IFR-10-001
**Hoch; begründeter Sicherheitsverdacht.** Auslöser: bösartiger Dockerfile-RUN auf dem langlebigen BuildKit. Belege: Einstieg `--net=host` und `--oci-worker-no-process-sandbox` sowie gemeinsame Runtime-Konfiguration; BuildKit teilt die Container-Prozessumgebung statt separater Prozesssandbox. Offizielle [BuildKit-Rootless-Dokumentation](https://github.com/moby/buildkit/blob/v0.26.2/docs/rootless.md) warnt vor Prozessbeeinflussung/übrigbleibenden Exec-Prozessen. Zugriff auf Supervisor-Secrets ist damit **nicht** nachgewiesen; UID-/Dateirechte begrenzen ihn.

Ursachenbehebung: Builds mit fremdem Projektcode in eigener kurzlebiger Sicherheits-/Prozessgrenze ausführen und langlebige Steuer-/Credential-Prozesse nicht in denselben Build-Kontext stellen. Echte Verifikation mit dem gepinnten Runtime-Image: unerlaubte Prozesssicht/Signale, Hintergrundprozesse nach Jobende, Cross-Job-Datei-/Cachezugriff und Netzabfluss negativ testen. Die versionsgenaue Upstream-Datei v0.26.2 wurde gelesen: Sie warnt ausdrücklich vor kill und gegebenenfalls ptrace gegen Prozesse im Daemon-Container sowie zurückbleibenden Prozessen. Das belegt die fehlende Prozessgrenze, nicht einen erfolgreichen Privilegienwechsel.

## Cache, Fehler und Dokumentation
BuildKit-Cache ist nicht Registry-Persistenz. Es ist keine explizite GC-/Kapazitätspolitik im generierten TOML gesetzt; BuildKit-eigene Defaults bleiben versionsabhängig. Disk-Druck kann Worker, Registry und Paperless auf demselben Node treffen. Rootlesskit-start, debug-workers-Wartezeit und Cleanup-Trap sind geprüft; der Runtime-Probe allein kontrolliert keinen weiterhin funktionsfähigen Builder.

Provider pusht Digest und prüft Registry-Antwort, aber Node-Pull-Pfad bleibt [IFR-08-001](registry-local.md). Imagebau/echte Build-Isolation hier nicht ausgeführt. Doku braucht Trust-Grenze, Host-Voraussetzungen, GC, Ressourcenlasttest und Versionstreue des Preflights.
