# INF-18 — Namespace-Broker, RBAC, Admission und Quotas

Review: **abgeschlossen (statisch)**. Prüfcommit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. Kein Live-Nachweis.

## Inventar und Aufrufervertrag
Pipeline-Fixture-Infrastruktur. `charts/kubeclaw/templates/buster-namespace-controller.yaml`, Lease-CRD, `rbac.yaml`, `my-values/infra/buster-namespace-fence.yaml` und `cmd/buster-namespace-controller/main.go`. Buster/Nova beantragen Leases; Controller provisioniert Namespace, Quotas/LimitRanges, NetworkPolicies, RoleBindings, erlaubte kopierte Secrets und optional Preview-Ingress. Besitzbindung/TTL/Finalizer und Reihenfolge in `provisionLease` wurden verfolgt; Geschäftslogik bleibt separatem Pipeline-Review zugeordnet.

Controller nutzt ClusterRoleBinding für Namespace-/Netzwerk-/RBAC-Verwaltung und bindet drei explizite ClusterRoles. Die Rolle controller-secrets erlaubt get/create/patch, wird mittels RoleBindings in Zielnamespaces verwendet. Test-Namespaces bekommen restricted Pod-Security, Ressourcen- und Netzgrenzen. Nicht gleichbedeutend mit einer Sandbox gegen einen kompromittierten Controller.

## Befund IFR-18-001
**Hoch; nachgewiesener konfigurationsabhängiger Admission-Defekt.** Der Fence matcht nur fest codierte ServiceAccount-Identitäten im Namespace kubeclaw und nur Namespace CREATE/DELETE (`buster-namespace-fence.yaml:21–37`). Helm und `NAMESPACE` erlauben andere Namespaces; Controller-SA/ClusterRoleBinding werden dort dynamisch erzeugt. Auslöser: Installation in abweichendem Namespace. Der vom Chart erzeugte Rollenname ist fest an agentRole gebunden; die Namespace-Änderung allein verändert bereits die vollständige SA-Identität. Der clusterweite Controller darf weiter Namespaces verwalten, fällt aber nicht unter den Fence.

Ursachenbehebung: Admission und Controller-Identität aus einer gemeinsamen Quelle rendern; alle Controllerinstanzen erfassen und nicht nur Namespaces im Hauptskript parametrisieren. Echter Regressionstest: realer API-Server mit VAP, erlaubtes Test-Namespace CREATE/DELETE und verbotene Aktion gegen Kontrollnamespace mit dem **alternativen** Controller-SA prüfen.

## Weitere Berechtigungsgrenze
Auch für die Default-Identität beschränkt der Fence keine RoleBindings/NetworkPolicies. Der Controller kann seine ausdrücklich bindbaren Rollen aufgrund clusterweiter RoleBinding-create-Rechte theoretisch auch in fremden Namespaces binden. Software-Prüfungen reduzieren normale Fehler, sind aber keine Admission-Isolation bei Credentialkompromittierung. Paperless ist somit nicht durch den Namespace-Fence allein geschützt. Diese belegte Rechteausdehnung ist bei einem späteren Hardening explizit zu entscheiden; keine automatische erfolgreiche Exploit-Ausführung behauptet.

Controller-Deployment ohne eigenen Healthcheck, TTL-Bereinigung hängt an seiner Verfügbarkeit. Ressourcen 50m/128Mi Request aus Render, Limit über Values; Cluster-PVC-/Nodekapazität bleibt [INF-16](storage.md). Echtes Helm und statische CRD-/RBAC-Prüfung bestanden; kein API-Server/RBAC/VAP-Live-Test. Doku braucht Scope, Deployer-/Testergrenze, Controller-Ausfall, verwaiste Leases und sichere manuelle Wiederherstellung.
