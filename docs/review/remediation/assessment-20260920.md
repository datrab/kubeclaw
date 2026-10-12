# Neubewertung der offenen Befunde — 2026-09-20

Prüfstand: `cd9f235345f5fd8736a2ffe75d806288e4d538db` auf `main`.
Auftrag: Schritt 1, Fortbestand und Behebungsbedarf bewerten. Keine Implementierung,
keine neuen verbindlichen Abnahmekriterien und keine Änderung bestehender Findingstatus.

## Umfang und Prüfgrenzen

Alle 154 Kennungen und ihre Statuszuordnung wurden zwischen JSON und Markdown
abgeglichen. Die 13 laut JSON unvollständigen Befunde, der inzwischen lokal
geschlossene GitOps-Punkt und die Konfigurationszentralisierung wurden anhand
aktueller Quellpfade, Betriebsdokumentation und vorhandener Nachweise bewertet.
Die 141 als lokal verifiziert geführten Befunde wurden nicht vollständig erneut
auf Regressionen geprüft. Historische Testprotokolle sind keine heute erneut
ausgeführten Tests. Kein Zugriff auf Produktionscluster, Tailnet oder Host;
Betriebszustände bleiben insoweit unbestätigt.

## Register und Ausgangszahl

`register.json` enthält 154 eindeutige Kennungen: 103 Pipeline-, 34 Infrastruktur-
und 17 Tracebefunde. Seine Statuszahlen stimmen mit den Einzelobjekten überein:
141 verifiziert, 3 in Bearbeitung, 2 implementiert und 8 offen, also **13 unvollständig**.
`handoff.md` und die Übergabe vom 14. September bestätigen diesen Stand.

`progress.md` nennt dagegen noch 14 unvollständige Befunde. Der Kopf von
`register.md` enthält ebenfalls einen alten Zähler; seine Einzelzeilen weichen
bei PCR-PRISM-WORKER-002, IFR-05-001, IFR-11-001 und IFR-26-001 vom JSON ab.
Alle 154 IDs sind auch im Markdown vorhanden. Empfehlung: Statusdarstellung und
Zähler aus einer gepflegten Quelle erzeugen; lokale Verifikation und Live-Abnahme
getrennt führen. Die alten Auditberichte als historische Baseline erhalten.

## Bewertung pro Punkt

### PCR-BUSTER-ENGINE-001 — vollständiges Attemptbudget

**Weiterhin vorhanden; Implementierung fertigstellen, hohe Priorität.**
Der Produktionspfad in `skills/buster/engine/test-gates/remote-plan-service.ts`
erstellt Capability-Invoker außerhalb des Providers und übergibt keinen nativen
WorkerRuntime an den TestPlanRunner. Dieser fällt in `runner.ts` auf
LocalWorkerRuntime zurück; `measure` liest ausschließlich `instance.resources()`.
Damit ist keine gemeinsame Ressourcenabrechnung aller lokalen Capability-,
Provider- und Abschlussarbeiten nachgewiesen. Bestehende native Workerbausteine
integrieren; das Problem ist keine bloß fehlende Testmarkierung.

### PCR-BUSTER-ENGINE-004 — terminale Quellen und Arbeitsverzeichnisse

**Teilweise behoben; verbleibende Recovery-Bereinigung implementieren.**
`remote-plan-service.ts` bereinigt reguläre abgeschlossene Arbeit über
`cleanupTerminalWorkspace`. Bei Restart behält der Code Arbeitsverzeichnisse
ausdrücklich zurück, weil ein alter Terminalstatus keine Prozessruhe beweist.
Diese Schutzmaßnahme nicht durch blindes Löschen ersetzen. Restarbeit ist der
dauerhafte Besitz-/Stillstandsnachweis und darauf aufbauende idempotente
Bereinigung, eng verbunden mit PCR-BUSTER-ENGINE-001.

### PCR-OBS-002 — Retention und Kapazitätsfreigabe

**Teilweise behoben; enger auf verbleibende Stores zuschneiden und fortsetzen.**
Manuelle Retirement-/Compactionpfade für Telemetrie, Admission, importierte
Resultate, Dispatch und Operatorrequests existieren. `FileDurableRecordStore`
hat einen Retirementpfad; `FileDurableBlobStore` in
`skills/common/plugin-runtime/foundation/observability/durable-records.ts`
hat weiterhin put/get mit Gesamtquote, aber keinen entsprechenden allgemeinen
Freigabepfad. `docs/operations/observability-retention.md` benennt die übrigen
Store-/Referenzlücken ausdrücklich. Keine neue automatische Loglöschung;
geschützte Historie, aktive Arbeit und Idempotenz müssen erhalten bleiben.

### IFR-21-001 — reproduzierbare Runtimeimages

**Teilweise behoben; verbleibende Buildinputs und Nachweise bearbeiten.**
Python-/Go-Locks und Versionsgenerator sind vorhanden und wurden hier geprüft.
`docker/Dockerfile.buster-runtime` lädt Browser mit Playwright und Trivy-Datenbanken
beim Build; `docker/Dockerfile.prism-worker` installiert ebenfalls Browser.
Die geprüften Toollocks binden diese Inputs nicht vollständig. Browserarchive und
Scanner-DB-Identität nachvollziehbar erfassen und vollständige Builds vergleichen.
Aktuelle Sicherheitsdaten weiterhin gezielt aktualisieren; Reproduzierbarkeit
ist kein Grund, Advisory-Daten dauerhaft einzufrieren.

### IFR-29-001 — Betreiberkonfiguration und öffentliche Beispiele

**Weiterhin relevant; mit Konfigurationszentralisierung gemeinsam bearbeiten.**
`my-values/nova-values.yaml`, `gitops/production/config.json` und das AX41-
Hostprofil enthalten konkrete Betreiber-/Deploymentannahmen. Das Repo ist bereits
öffentlich; die ursprüngliche Formulierung als Vorbereitung einer späteren
Veröffentlichung ist überholt. Betreiberprofil klar von portablen Defaults und
Beispielen abgrenzen. Absichtlich öffentliche Deploymentdaten müssen nicht
pauschal entfernt werden. Diese Prüfung stellt keinen Secretfund dar und ersetzt
keine gesonderte Untersuchung der gesamten Git-Historie.

### IFR-04-001 — Tailscale-Zugriffsvertrag

**Offener Betriebsnachweis; kein bestätigter aktueller ACL-Fehler.**
Operatorvalues definieren Tags, aber der tatsächliche externe Grant-/TagOwner-
Vertrag ist damit nicht erfasst. `docs/deployment/tailscale-operator.md` enthält
nur allgemeine Hinweise. Gewollte Nutzer-, Dienst- und Tagrechte dokumentieren
und gegen reale erlaubte/verbotene Zugriffe abgleichen. Code erst ändern, wenn
dieser Abgleich eine Abweichung zeigt.

### IFR-10-001 — BuildKit-Prozessisolation

**Die problematische Konfiguration besteht; hohe Priorität zur Behebung.**
`docker/buster-runtime-entrypoint.sh` startet den gemeinsam genutzten BuildKit-
Daemon weiterhin mit `--oci-worker-no-process-sandbox`. Rootless allein liefert
damit keine getrennte Prozessgrenze pro Build. Den Ausführungs-/Isolationsvertrag
für nicht vertrauenswürdige Projektbuilds korrigieren und nachweisen. Das Flag
nicht ungetestet entfernen: Der Ersatz muss im vorgesehenen Host-/Containermodell
tatsächlich funktionieren. Ein erfolgreicher Exploit wurde hier nicht behauptet.

### IFR-01-001 — Bootstrap und Hostwiederaufbau

**Teilweise dokumentiert; als Installer-/Recovery-Arbeit fortführen.**
`scripts/deploy.sh:cmd_setup` setzt weiterhin eine erreichbare Kubernetes-API
voraus. `docs/operations/ax41-rollout.md` dokumentiert inzwischen Hostversionen,
Ressourcen und Vorbereitung, bezeichnet den vollständigen Installer aber explizit
als ausstehend. Der alte Befund ist deshalb zu breit: Rest sind der reproduzierbare
Bootstrap-/Wiederaufbaupfad und seine Verifikation, nicht nochmals dieselbe
Hostinventur. Mit dem Controlnode-Installer bündeln.

### IFR-02-001 — Cilium-Migration

**Weiterhin offen, bewusst zurückgestellt; keine sofortige Migration ableiten.**
Roadmap und AX41-Runbook ordnen Cilium nach Pipeline-/Dokumentationsarbeit ein.
`scripts/deploy-cilium.sh` enthält Cutoverguards, aber keine abgeschlossene
Betriebsabnahme. Es verweist zudem auf `docs/ops/cilium-networking.md`, das am
Prüfcommit fehlt. Runbook/Recoverypfad reparieren und aktuelle Applikations- und
Namespaceinventur vor dem späteren Wartungsfenster nachholen. Historische
Paperless-Annahmen gegen die neuere HomeOS-Planung abgleichen.

### IFR-05-001 — GitOps/Argo, der frühere 14. Punkt

**Als Implementierungsfinding lokal geschlossen belassen.**
JSON-Register und `implementation/pr6-gitops-closure.md` dokumentieren den
lokalen Abschluss; Renderer, Applications, Healthlogik und die zugehörigen
Tests sind im aktuellen Tree vorhanden. Der Abschlussbericht trennt echte
lokale Prüfungen von Clusterfixtures. Aktuelle Betriebsadoption und deren
Live-Nachweise bleiben offen, ohne daraus denselben Implementierungsauftrag
erneut zu eröffnen. GitOps-Tests wurden in dieser Prüfung nicht neu ausgeführt.

### IFR-06-001 — SPIRE-Recovery und Zertifikatslaufzeiten

**Offener Recovery-/Betriebsnachweis; gezielt ergänzen.**
SPIRE-Values und `docs/operations/worker-trust-runbook.md` enthalten Installation
und allgemeine Wiederanlaufschritte. Das Runbook erklärt ausdrücklich, dass der
Livecheck keine zeitliche Zertifikatsrotation abwartet. Der konkrete gesicherte
CA-/Serverzustand, die Restoreprozedur und das Verhalten über Zertifikatsablauf
bleiben nachzuweisen. Bestehende mTLS-Architektur beibehalten; kein belegter
genereller Implementierungsdefekt aus fehlendem Betriebsnachweis ableiten.

### IFR-16-001 — gemeinsame Kapazität und Storage

**Teilweise adressiert; auf Storage und Gesamtlast fokussieren.**
`scripts/native-worker-node-capacity.mjs` prüft CPU-, RAM- und Taskreservierungen
und bezeichnet seinen Scope ausdrücklich entsprechend. Das AX41-Runbook enthält
eine Ressourcenplanung, aber keine Gesamtlastgarantie. PVC-, Cache-, Backup- und
Ephemeralwachstum sind damit nicht gemeinsam gedeckt. Diskbudget und reale
Lastmessung ergänzen; nicht pauschal bereits definierte CPU-/RAM-Limits erhöhen.

### IFR-26-001 — vollständige Backups und Recovery

**Teilweise behoben; verbleibende Recoveryarbeit hat hohe Priorität.**
`charts/prism/templates/backup.yaml` mountet inzwischen Artefakte und sichert mit
`charts/prism/files/prism-backup.sh` gemeinsame DB-/Objektgruppen. Die ursprüngliche
Aussage „nur DB-Dump“ ist damit überholt. Ein unabhängiges externes Backupziel,
notwendige Schlüssel-/Journalbindung und vollständiger Anwendungswiederaufbau
sind nicht durch diesen Pfad belegt. `tests/verification/deployment/prism-backup.test.mts`
kennzeichnet DB-Kommandos ausdrücklich als Fixtures; Dateisystemnachweise nicht
als echte PostgreSQL-/Disaster-Recovery-Abnahme zählen.

### IFR-28-001 — unabhängiger Zugang beim Clusterausfall

**Überwiegend Betriebsnachweis; kein zweiter Ops-Pod als vermeintlicher Fix.**
`docs/ops/ops-pod.md` beschreibt bereits korrekt, dass der Pod von Node, Runtime,
Netz und Storage abhängt, und verweist auf den vorhandenen Management-/KVM-Pfad.
Rest sind die konkret nutzbaren externen Voraussetzungen und der Nachweis bei
Cluster-/CNI-Ausfall. Mit Bootstrap und Disaster Recovery bündeln. Ohne Befund
aus dem realen Zugangstest ist keine zusätzliche Podimplementierung angezeigt.

### Konfigurationszentralisierung

**Weiterhin erforderlich; eigenständige Querschnittsarbeit.**
Das Chart liefert `charts/kubeclaw/files/config/swarm.config.json` aus. Der
gefundene Expander `expandSwarmConfig` liegt jedoch unter
`tests/verification/e2e/support/platform-config.ts`; dies belegt keine allgemeine
Produktionsverdrahtung. Busters `production.ts`/`remote-plan-service.ts` haben
eigene Optionen und Defaults, Prism liest in `skills/prism/config/native-worker.ts`
eigene Umgebungswerte/Defaults. Hostprofile und Chartvalues bilden weitere
Konfigurationsflächen. Die zentrale Auflösung muss bis zu diesen Consumern reichen.
Bestehendes `swarm.config.json` als Autorenquelle verwenden; `versions.json` und
externe Secrets beibehalten. Protocol-/Sicherheitsinvarianten nicht zu beliebig
veränderlichen Operatorschaltern machen. Mit IFR-29-001 und dem Ressourcenmodell
abstimmen, ohne fehlende Buster-Isolation durch Konfiguration zu kaschieren.

## In dieser Prüfung ausgeführte Verifikation

- Vollständiger JSON-/Markdown-ID- und Statusabgleich: 154/154 IDs; vier
  abweichende Markdownstatus; JSON-Zähler stimmen mit den Einzelobjekten überein.
- `node --test tests/verification/deployment/runtime-tool-locks.test.mjs`:
  1 Test bestanden, keine Skips; manipulierte Lockinputs werden abgewiesen.
- `node scripts/versions.mjs --check`: 42 geprüfte generierte Dateien ohne Drift;
  zusätzlich 4 Toolinputs und 5 Locks geprüft.
- Quellprüfung der oben genannten Produktionspfade und Prüfung des fehlenden
  Cilium-Runbookziels. Keine vollständigen Imagebuilds oder Cluster-/Hosttests.

Schritt 1 ist damit als quellenbasierte Triage dokumentiert. Formale
Abnahmekriterien pro verbliebenem Arbeitspunkt sind der nächste separate Schritt.
