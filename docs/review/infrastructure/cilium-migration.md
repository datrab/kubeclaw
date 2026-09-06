# INF-02 — Cilium und CNI-Migration

Review: **abgeschlossen (statisch)**. Prüfcommit: `1313cc3a89d74ce11d93666fad1a4b9a0f48e308`. Kein Live-Nachweis.

## Inventar und Abgrenzung
Allgemeine Infrastruktur, ausschließlich Zusatzbranch `feat/cilium-networking`. In main keine Cilium-Installationsdateien. Untersucht: `scripts/deploy-cilium.sh`, `scripts/migrate-kubeclaw-network-policies-to-cilium.sh`, `scripts/verify-cilium-policies.py`, `my-values/infra/cilium-values.yaml`, `cilium-cluster-policies.yaml`, SPIRE-/Ops-Policy-Dateien und `docs/ops/cilium-networking.md`, `cilium-quickstart.md`.

Gepinntes Chart 1.20.1; VXLAN, cluster-pool-IPAM mit /16-Pool und /24-Node-Blöcken, kube-proxy bleibt, CNI exclusive. Installer verlangt einen cordoned Single Node und kontrolliert per CRI alle READY-Sandboxes auf hostNetwork. Keine automatische Uncordon-Aktion. Operator nutzt hostNetwork und toleriert die Scheduling-Sperre. Hubble Relay/UI brauchen anschließend normale Pods; bewusst kein globales Helm-`--wait`.

## Verantwortung, Isolation und Wiederanlauf
Die clusterweite Baseline nimmt fünf benannte Namespaces aus, darunter Paperless. Alle übrigen Anwendungen einschließlich SPIRE brauchen eigene Allows. Die Ausnahme ist kein Schutz vor dem Pod-Neustart: die bestehende CNI-Zuordnung bleibt am Sandbox-Lebenszyklus. Same-CIDR-Wechsel setzt das vollständige Beenden alter Sandboxes voraus. Admin-Rechte, CRI-/Hostzugang, gesicherte CNI-/K3s-/iptables-Konfiguration und vorbereitete Images sind Voraussetzungen, keine Resultate des Skripts.

Apply und Cleanup sind getrennt. Cleanup verlangt zusätzliche Bestätigung und prüft erwartete Policy-Spezifikationen vor dem Löschen alter Allows; die alte Default-Deny bleibt. Upgrade verlangt den Abschlussmarker. Marker und Umgebungsflags sind Bedienergates, keine kryptografische oder automatische Live-Evidenz.

## Befund IFR-02-001
**Hoch; offene Betriebsfrage.** Auslöser: Cutover bei einem tatsächlich anders benannten Paperless-Namespace, nicht inventarisierten DaemonSets oder nur clusterabhängigem Administrationsweg. Belege: `cilium-cluster-policies.yaml:25–58`, `deploy-cilium.sh:10–31`, Runbook §11.5 und §20. Die globale Baseline und das Recycling betreffen sämtliche Anwendungen. Der vorhandene Code blockiert viele unzulässige Ausgangszustände, beweist aber weder Paperless-Wiederaufnahme noch unabhängiges Recovery.

Ursachenbehebung: konkreten Namespace/Abhängigkeiten, Wartungsfenster, Offline-Artefakte und phasenweisen Host-Rollback vor Ausführung erfassen. Live-Verifikation: Cilium-Endpoint-Zuordnung jedes Pods, Pipeline-Kommunikation, Paperless-Upload/OCR/Abruf, negative Netztests und Wiederholung nach Policy-Cleanup; den Abschlussmarker erst danach setzen.

## Tests, Dokumentation und Einordnung
Statische Analyse und Shell-/Python-Syntaxprüfung; keine Migration oder Policy-Durchsetzung getestet. [Cilium-Migrationsdokumentation](https://docs.cilium.io/en/stable/installation/k8s-install-migration/) und [1.20.1-Upgrade-Leitfaden](https://docs.cilium.io/en/stable/operations/upgrade/) unterstützen die Trennung von Migration und späteren Upgrades. Ein nodeweiser Parallel-CNI-Ansatz aus Upstream ist kein Beleg für Unterbrechungsfreiheit dieses Single-Node-Verfahrens.

Runbook benennt die Risiken bereits weitgehend korrekt. Zu korrigieren: dortige Anweisung zum neuen CI-Build passt nicht zum aktuellen Auftrag mit erschöpften Minuten; zuerst bereits vorhandenen geprüften Digest feststellen. Kapazität und konkrete Backup-/Rollback-Artefakte bleiben extern. [Migrationstrace](paths/cni-migration.md).
