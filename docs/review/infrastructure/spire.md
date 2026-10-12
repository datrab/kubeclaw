# INF-06 — SPIRE, CSI und Identitätsausstellung

Review: **abgeschlossen (statisch)**. Prüfcommit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. Kein Live-Nachweis.

## Inventar und Verträge
Pipeline-Identitätsinfrastruktur. `scripts/deploy.sh:87–89,959–986,1082–1106`: CRD-Chart 0.6.0 und Hardened-SPIRE-Chart 0.30.0; Server-Namespace separat von Agenten, CSI-Driver muss vorhanden sein. `my-values/infra/spire-values.yaml` setzt Trust-Domain, Namespace-Layout, strict/security recommendations; CSI-Image-Tag 0.2.13. JWT-/OIDC-Discovery und Tornjak sind deaktiviert.

ClusterSPIFFEID wählt Pods mit `kubeclaw.dev/worker-trust=true` und stellt Namespace/ServiceAccount-basierte IDs aus. Die lokalen Values haben einen leeren NamespaceSelector; das effektive Chart ergänzt den Ausschluss von `spire-server` und `spire-system`. Ausstellung ist damit weiterhin nicht auf kubeclaw begrenzt. Konsumenten prüfen jedoch exakte Peer-IDs, siehe [INF-07](envoy.md). Wer im vertrauten Namespace Pods unter diesen ServiceAccounts erzeugen darf, gehört zur Identitäts-Vertrauensgrenze.

CSI mountet Workload-API-UDS unter `/run/spire/sockets`; Envoy nutzt SDS, nicht statische Schlüsseldateien. Host-/Agent-Privilegien, CA-/Server-Persistenz, TTLs und Ressourcen sind im Upstream-Chart definiert, nicht vollständig lokal festgeschrieben. Das effektive Zusammenspiel mit Recommendation-Templates wurde am 2026-09-21 lokal gerendert; siehe den nachfolgenden Nachtrag.

## Befund IFR-06-001
**Mittel; offene Frage.** Auslöser: SPIRE-Server-/Agent-Ausfall oder CA-Verlust. Values und Runbook belegen Installation/Peer-Bindung, aber keinen getesteten Restore des CA-/Serverzustands, keine konkrete garantierte Ausfalldauer und keine dokumentierte Widerrufsfrist bereits ausgestellter SVIDs. Rotation per SDS ist implementierter Mechanismus; sofortiger Widerruf ist daraus nicht ableitbar.

Ursachenbehebung: gepinnte Charts vollständig rendern und tatsächlichen Server-PVC-/CA-/TTL-Vertrag sowie Rotation/Recovery mit aktiven Jobs dokumentieren. Echter Test: gültige/ungültige Identität, fortlaufende SVID-Erneuerung, Server-/Agent-Ausfall über Zertifikatsablauf, Neustart/CA-Restore und erneute gegenseitige Authentifizierung. Kein Fail-open aktivieren.

## Prüfung und Dokumentationsstand
`docs/security/worker-trust.md` und `docs/operations/worker-trust-runbook.md` unterscheiden implementiert von live ausstehend. CSI-Voraussetzung und Namespace-Erstellung sind korrekt ausdrücklich geprüft. Cilium-Zusatzbranch enthält eigene SPIRE-Allows; main nicht versehentlich als global durch Cilium geschützt einordnen. Keine Live-Tests oder Upstream-Chart-Installation. Versionsgenau gelesen: [Chart 0.30.0](https://github.com/spiffe/helm-charts-hardened/blob/spire-0.30.0/charts/spire/Chart.yaml) nennt SPIRE 1.14.5 und Kubernetes >=1.21.0-0. [Server-Defaults](https://github.com/spiffe/helm-charts-hardened/blob/spire-0.30.0/charts/spire/charts/spire-server/values.yaml) setzen SQLite3, PVC 1Gi/RWO, eine Replica, CA-TTL 24h und X509-SVID-TTL 4h; resources ist leer. [Agent-Defaults](https://github.com/spiffe/helm-charts-hardened/blob/spire-0.30.0/charts/spire/charts/spire-agent/values.yaml) nennen emptyDir, hostNetwork auto und leere resources. Dies sind Quelldefaults, keine verifizierten effektiven Pod-/Host-Rechte unter den aktivierten Recommendations. Dieser historische Absatz beschreibt die damalige Quellenprüfung. Das Rendering wurde inzwischen nachgeholt; Rotation und Recovery sind weiterhin ohne Live-Nachweis.


## Nachtrag 2026-09-21: effektives Rendering und Recovery-Verfahren

Das tatsächlich heruntergeladene Chart 0.30.0 wurde mit den unveränderten
Operator-Values als Release `spire` in `spire-server` gerendert.
[Rohrender](../evidence/spire-effective-20260921/rendered.yaml) und
[SHA-256-Belege](../evidence/spire-effective-20260921/sha256.txt) halten den Stand
fest. Das Umbrella-AppVersion-Feld nennt 1.14.5, die effektiven Server-/Agent-Images
jedoch 1.15.2. Ohne historischen Archivhash ist das kein Nachweis einer
nachträglichen Upstream-Änderung.

Effektiv: eine Serverreplica, 1Gi/RWO-PVC ohne festgelegte StorageClass,
SQLite `datastore.sqlite3` und Disk-KeyManager `keys.json` zusammen unter
`/run/spire/data`; lokale CA mit 24h TTL, X.509-SVID-Default 4h. Agenten verwenden
emptyDir, Memory-KeyManager und hostNetwork; CSI ist privilegiert. Der
[Operator-Recovery-Leitfaden](../../operations/spire-recovery.md) dokumentiert
kalte konsistente Sicherung, geschützte Schlüssel-/Backupreferenzen, gemeinsamen
Restore und Grenzen vorhandener TLS-Verbindungen.

Die [Abnahmematrix](../remediation/implementation/spire-recovery-matrix-20260921.md)
trennt S1/S2/S-DOC von Live. Lokal sind Rendering und konkrete Dokumentation
vorhanden, unabhängige Prüfung steht aus. Es gab keine Installation,
Ausfallinjektion, zeitgesteuerte Rotation oder Wiederherstellung; IFR-06-001 wird
hier nicht als vollständig abgeschlossen markiert.
