# INF-05 — Argo CD und GitOps-Zuständigkeit

Review: **abgeschlossen (statisch)**. Prüfcommit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. Kein Live-Nachweis.

## Inventar
Allgemeiner GitOps-/Administrationsdienst. `scripts/deploy-argocd.sh:8–39` installiert `argo/argo-cd` Chart 10.8.0 in `argocd`; Repository-Alias wird explizit aktualisiert. `my-values/infra/argocd-values.yaml` setzt internen HTTP-Betrieb, ClusterIP und keine chart-eigene Ingress-Erstellung. Separates `argocd-tailscale-ingress.yaml` verbindet die Tailscale-IngressClass mit dem Server. `docs/ops/chatgpt-ops-bootstrap.md` verlangt anschließend eine vom Betreiber angelegte Application für gerenderte Ressourcen.

Verbraucher: Betreiber, künftige Applications, Ops-MCP als Application-Leser. Abhängigkeiten: bestehende API, DNS/Registry/Chartzugang, Argo-eigene chartdefinierte Komponenten und externer Tailscale Operator. Bootstrap verfügt über Helm-/Namespace-/RBAC-Verwaltungsrechte; MCP erhält dadurch keine Sync-Rechte. Im Repository fehlen konkrete Argo Application-/AppProject-Manifeste für die Pipeline. Ressourcen, Persistenz, Redis-/Repo-Server-Ausfallsicherheit und RBAC-Defaults sind durch die Chartversion bestimmt, lokal nicht vollständig materialisiert.

## Befund IFR-05-001
**Mittel; nachgewiesene Implementierungslücke gegenüber vollständigem GitOps-Betrieb.** Auslöser: Erwartung, dass der Bootstrap bereits Pipeline-Releases verwaltet. Beleg: gesamtes Installationsskript; Suche nach `kind: Application`/`AppProject` in main liefert keine Produktionsressource. Es werden Argo und sein Ingress installiert, keine Release-Auswahl oder Deployment-Reihenfolge eingerichtet. Damit sind Ownership, Drift-/Prune-Verhalten und Health-Gates noch nicht implementiert.

Ursachenbehebung: explizite Applications/Projects, einziger Eigentümer pro Ressource, Secret-Vorversorgung, Digest-Values und Verhalten persistenter Ressourcen festlegen. Skriptverwaltete Releases nicht gleichzeitig ungeregelt von Argo verwalten. Echter Test: später auf isoliertem Cluster Bootstrap, ersten Sync, fehlgeschlagenen Hook, Drift, Registry-/Git-Ausfall und Rollback unter Erhalt der PVCs prüfen.

## Reihenfolge und Betrieb
Argo → Ops → Cilium ist möglich, wenn Argo/UI zunächst mit bestehendem Operator erreichbar wird und unabhängiger Hostzugang erhalten bleibt. Das Skript installiert den Operator nicht. Ein frischer Cluster braucht ihn vorher oder vorläufig direkten API-/Portforward-Zugang. Argo darf den CNI-Cutover nicht als unbeaufsichtigten Auto-Sync starten.

Statisch geprüft, keine Chart-Installation und kein Login. `--wait` bestätigt später höchstens den Chart-Rollout, nicht tailnet ACLs oder Pipeline-Sync. Dokumentationslücken: AppProject-Rechte, Git-Credentials, Backup der Argo-Konfiguration, Admin-Rotation, Upgrades und Wiederanlauf ohne Git. [Bootstrap](paths/bootstrap.md), [Releasepfad](paths/image-release.md).
