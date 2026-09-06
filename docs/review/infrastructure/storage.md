# INF-16 — Volumes, StorageClasses, UID/GID und Kapazität

Review: **abgeschlossen (statisch)**. Prüfcommit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. Kein Live-Nachweis.

## Inventar und Zustand
Gemeinsamer Ressourcen-/Volume-Vertrag: `charts/kubeclaw/templates/pvc.yaml`, `buster-runtime-pvc.yaml`, Agent-Deployment, `charts/prism/templates/workloads.yaml,postgresql.yaml,jobs.yaml`, `charts/ops-pod/templates/workload.yaml`. Config-/Workspace-, Buster-Receipt-, Prism-Artefakt-/DB-/Backup- und Ops-home/workspace-Volumes sind getrennt. Leere StorageClass-Auswahl setzt einen externen Default-Provisioner voraus; kein lokaler StorageClass-/CSI-/Snapshot-Controller wird installiert.

Agenten fsGroup 1000; gezielte Init-Ownership-Reparatur nur des Config-Volumes. Buster-Workspace-Handoff und getrennte Runtime-State-Mounts untersucht. Prism-App UID1000, DB UID999. RWO beschränkt Node-Zugriff, nicht automatisch konkurrierende Prozesse auf demselben Node. Keep-Annotationen schützen nicht vor Namespace-Löschung, Hostverlust oder manueller PVC-Entfernung.

## Kapazitätsbeleg
Echtes Helm-Rendering, CPU-/Memory-Requests der Container summiert und mit maximalem Init-Request verglichen: Nova 1.10 CPU/12.125GiB; Buster samt Controller 3.10 CPU/20.1875GiB; Prism-Agent 0.30 CPU/0.6875GiB; Prism-Dienste samt DB 2.35 CPU/4.375GiB. **Zusammen 6.85 CPU/37.375GiB angeforderter Speicher**, ohne Redis/Qdrant/LiteLLM, SPIRE, Argo, Ops, Paperless, Jobs, Pod-Overhead oder Upgrade-Surge. Das sind Konfigurationssummen, keine gemessene Nutzung oder freie Hostkapazität.

## Befund IFR-16-001
**Mittel; begründeter Kapazitätsverdacht.** Auslöser: vollständiger Default-Stack oder zeitgleiche Build-/Restore-/Browserlast auf gemeinsamem Node. Große Requests/Limits, zusätzliche Jobs und caches treffen auf nicht dokumentierte allocatable-/Disk-Budgets. Belege: obige Renderwerte, Buster-Values und 100Gi-PVCs für Prism-DB, Artefakte und Backups. Scheduler-Requests verhindern keinen gemeinsamen Disk-Druck.

Ursachenbehebung: reale Allocatable-Werte und Paperless-Reserve erheben, Ephemeral-/PVC-/Cache-/Backupwachstum zusammen budgetieren, Quotas/Retention mit Lastmessungen abstimmen. Test: Scheduling aller Komponenten plus geplanter Jobs und gezielter Disk-Grenztest im isolierten Umfeld; Paperless-Latenz/Wiederanlauf beobachten.

## Upgrade und Prüfgrenzen
Buster erzwingt genau einen Servicewriter, Agenten verwenden Recreate. Generic Nova lässt replicaCount=2 rendern; keine automatisch sichere horizontale Skalierung ableiten. Prism-Control-Rollout behandelt [INF-20](prism-workloads.md). Schema/Helm geprüft, echte Provisionierung, fsGroup, Rescheduling, Volume-Expansion und Restore offen. Doku braucht pro Volume Owner, Backup, Retention, Zugriffsmodus, Pfad, UID/GID, erlaubte Löschoperationen und Restore-Abhängigkeiten.
