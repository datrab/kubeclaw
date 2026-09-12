# Infrastrukturpfad — Image-Build bis Pod-Start

Prüfstand: main `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`; statischer Trace abgeschlossen, **kein Deployment-/Live-E2E-Nachweis**. Quellenpfade beziehen sich auf diesen Commit, sofern anders angegeben. Befunde bleiben in den verlinkten Einzelreviews.

## Zwei verschiedene Imagewege
| Übergang | Produzent / konkreter Vertrag | Verbraucher / Prüfung |
|---|---|---|
| Runtime-Build | `.github/workflows/` Buildworkflows; `docker/Dockerfile.*`, `versions.json` | GHCR-Kandidaten mit vollständigem Source-SHA; Build-Erfolg allein ist noch kein kompletter Release |
| Receipt | `publish-image-receipts.yaml`, `release-images.mjs`: zehn Runtime- und zwei Ops-Digests, identischer Commit, Run/Attempt | `verify-release-source.mjs` prüft erfolgreichen erlaubten main-Workflow, Attempt und exakte Receipt-Assets |
| Promotion | `promote-runtime.yaml` / `materialize-release.mjs`: aktuelle Values plus geprüfte Digests; Scan der Digests | erzeugte Release-Values/PR; kein im Repository fertig verdrahteter Argo-Consumer |
| Helm | `deploy_agent` nimmt Rollen-Values, optionale Repo-/Tag-Overrides; `cmd_prism` nimmt Prism-Values | gerenderter Pod braucht imagePullSecrets, Node-Registry-Zugang, Scheduling, Volumes, CSI und Init-Erfolg |
| Projekt-Build | Buster Provider → lokaler BuildKit-Unix-Socket; `buster-runtime-entrypoint.sh` generiert TOML | HTTP-Push zu `registry-local.kubeclaw.svc.cluster.local:5001` → Service targetPort 5000 |
| Fixture-Start | Provider übergibt Ergebnisdigest an Kubernetes-Fixture | **containerd auf dem Node** zieht Image; Pod-DNS-/NetworkPolicy-Allow konfiguriert diesen Hostclient nicht |

Der allgemeine Docker-Hub-Mirror ist ein eigener Pull-through-Dienst, kein Release-Store oder BuildKit-Cache. Aktiver BuildKit hat lokale Registry-Konfiguration; der Mirror ist nicht für alle Clients verdrahtet ([INF-09](../registry-mirror.md)). Registry-local speichert im Container-Dateisystem, BuildKit-State auf eigenem Volume; beide Lebenszyklen sind verschieden.

## Bruchstellen und Fehlerpfade
- [IFR-19-001](../role-workloads.md): normale Rollen-Values verwenden latest, CI publiziert Kandidaten. Ein erfolgreicher Promotion-Receipt erzwingt seine Verwendung durch deploy.sh noch nicht.
- [IFR-23-001](../release-promotion.md): älterer Imagecommit mit aktuellem Chart/Values ist provenance-korrekt, aber möglicherweise inkompatibel.
- [IFR-08-001/002](../registry-local.md): Cluster-Service-FQDN/HTTP ist für Node-Pulls nicht reproduzierbar konfiguriert; Registryverlust/GC kann benötigte Fixture-Digests entfernen. Erfolgreicher Push ist kein Pullnachweis.
- Git-/Registry-Ausfall vor Pull blockiert neue Pods; lokale Node-Caches garantieren keinen Neustart auf anderem Node. Abbruch/Teilbuild produziert keinen gültigen Gesamtreceipt. Löschung alter Release-Assets oder Images gefährdet Rollback.
- Untrusted PR-Build und Publish-Kontext prüfen [INF-22](../ci-build.md). Optionale Live-Acceptance im Workflow ist ein tatsächlicher Deploymentpfad, wurde hier nicht ausgelöst.

## Echte Verifikation
Lokale Receipt-/Versionstests und Helm-Render bestanden; keine Images gebaut oder veröffentlicht. Später: bekannten freigegebenen Digest bis `status.containerStatuses[].imageID` verfolgen; privaten Pull mit richtigen/falschen Credentials, Cache Miss, Upstream-Ausfall, Nodewechsel und alten Release-Rollback prüfen. Projektimage durch echten BuildKit pushen und auf einem cacheleeren Node per Digest starten. Keine Test-Doubles als Registrybeleg zählen.
