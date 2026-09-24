# Deployment ueber Git und Argo CD

Ziel: Nach der einmaligen Einrichtung werden Runtime-Updates ausschliesslich
ueber Git freigegeben und von Argo CD ausgerollt. Der Control Node ist fuer
normale Deployments nicht mehr erforderlich.

## Normaler Ablauf

1. Code oder Deployment-Konfiguration nach `main` mergen.
2. Der Image-Workflow baut und prueft die Runtime. Nach erfolgreichem Abschluss
   startet `Propose production deployment` automatisch die Release-Promotion.
3. Der erzeugte PR enthaelt Image-Digests, fertige Kubernetes-Manifeste und die
   aktualisierten Argo-Applications. Den PR pruefen und mergen.
4. Die einmal eingerichtete Root-Application `kubeclaw-runtime` verfolgt
   `gitops/production/apps` auf `main`. Argo synchronisiert Buster, Prism und Nova.

Keine Run-ID, kein `git pull` auf dem Control Node und kein `deploy.sh` sind im
Normalbetrieb erforderlich. Ein fehlgeschlagener Build erzeugt keinen Vorschlag.
Ein erfolgreicher Lauf ohne neue Image-Receipts erzeugt ebenfalls keinen PR;
das verhindert eine Schleife nach dem Merge eines Deployment-PRs.

Argo verfolgt fuer Root und Kinder `main`; Image-Digests und die jeweils
referenzierten Release-Verzeichnisse bleiben fest. Alte Bundle-Verzeichnisse
muessen erhalten bleiben. Dadurch funktioniert auch ein Squash-Merge des PRs,
ohne einen temporaeren PR-Commit als Deployment-Revision vorauszusetzen.
Neue Anwendungs-Konfiguration wirkt erst mit einem neuen Deployment-PR.

## Einmalige Einrichtung

Argo CD muss bereits laufen und das Repository lesen koennen. Bei einem privaten
Repository die Repository-Verbindung in Argo einrichten. CI benoetigt keinen
Kubeconfig und keinen Zugang zum Cluster.

1. Die echten Namespaces in `gitops/production/config.json` eintragen.
   Standard ist `kubeclaw` fuer alle Runtime-Anwendungen und `argocd` fuer Argo.
2. Bisher nur auf dem Control Node gespeicherte **nicht geheime** Values nach
   `gitops/production/overlays/` uebernehmen und in `config.json` referenzieren:

   ```json
   {
     "namespace": "kubeclaw",
     "prismNamespace": "kubeclaw",
     "argoNamespace": "argocd",
     "overlays": {
       "buster": "gitops/production/overlays/buster.yaml",
       "prism": "gitops/production/overlays/prism.yaml"
     }
   }
   ```

   Buster benoetigt insbesondere die tatsaechliche Registry-Konfiguration.
   Prism benoetigt seine echte native Worker-Bindung (Node, Namespace und
   Policy-Digest). Die Host-Policy in `my-values/infra/native-worker-pools.yaml`
   muss zum vorbereiteten Worker passen; im Auslieferungszustand ist der
   Node-Name noch nicht gesetzt. Keine Beispielwerte als reale Bindung verwenden.
   Zugangsdaten bleiben in Kubernetes-Secrets; nur ihre Namen gehoeren in Values.
3. Die bereits vom Promotion-Workflow verwendete GitHub-App einrichten:
   Repository-Variable `DEPENDENCY_APP_ID` und Secret
   `DEPENDENCY_APP_PRIVATE_KEY`, mit Schreibrecht fuer Inhalte und Pull Requests.
   Danach die Repository-Variable `GITOPS_ENABLED` auf `true` setzen.
4. Einmal in GitHub Actions **Build Runtime Images And Skill Bundles** auf `main`
   starten. Dieser manuelle Start baut auch dann Images, wenn sich zuletzt nur
   die Automatisierung geaendert hat. Den automatisch erzeugten Deployment-PR
   nach erfolgreicher Pruefung mergen.
5. Die jetzt erzeugte `gitops/production/bootstrap.yaml` einmal im Cluster
   einrichten. Sie enthaelt ein eingeschraenktes administratives AppProject und
   die Root-Application. Fuer die gepruefte Aktivierung kann jeder Rechner mit
   Repository, Node.js, Helm, kubectl und Clusterzugriff verwendet werden:

   ```bash
   bundle=$(node -p 'JSON.parse(require("fs").readFileSync("gitops/production/selection.json", "utf8")).directory')
   node scripts/gitops-continuous.mjs preflight "$bundle" https://github.com/datrab/kubeclaw.git "$(git rev-parse HEAD)"
   node scripts/gitops-continuous.mjs apply "$bundle" https://github.com/datrab/kubeclaw.git "$(git rev-parse HEAD)"
   ```

   Diese Befehle gehoeren zur erstmaligen Uebergabe, nicht zu jedem Release.
   Die Pruefung verlangt vorhandene Namespaces, benoetigte Secrets, SPIFFE CSI,
   eine passende Worker-Host-Konfiguration und Argo mit Annotation-Tracking und
   der Application-Health-Anpassung aus `charts/gitops/files/application-health.lua`.
   `scripts/deploy-argocd.sh` richtet diese beiden Argo-Einstellungen ein.
   Ein vorhandenes Argo ohne diese Einstellungen muss einmal angepasst werden.

## Bestehende Helm-Installationen

Der Einstieg verweigert die Uebernahme von Ressourcen, die bereits Helm oder
einer anderen Argo-Application gehoeren. Vor der Aktivierung bestehende Releases,
PVCs und Secrets inventarisieren und die Uebergabe passend zum Istzustand planen.
Nicht pauschal `helm uninstall`, Teardown oder Namespace-Loeschungen ausfuehren:
das ist kein erforderlicher Standardweg und kann Daten entfernen.

## Rueckkehr zu einem vorherigen Release

In GitHub Actions **Roll back production deployment** starten. Das Feld `target`
steht standardmaessig auf `previous`: der Workflow sucht die vorherige andere
Release-Auswahl in der zusammengefuehrten `main`-Historie. Alternativ den vollen
Git-Commit eines bestimmten frueheren Deployments angeben (nicht den
Image-Quellcommit).

Der Workflow erzeugt einen Rollback-PR mit der zusammengehoerigen Release-Auswahl
(`releases/runtime-images.json`, den vier Runtime-Values und den generierten
Argo-Dateien). Er baut keine Images und setzt keinen Anwendungscode zurueck.
Nach Pruefung und Merge synchronisiert Argo die alten Manifeste. Die Dauer haengt
von den PR-Pruefungen, Argo-Synchronisation und der Startzeit der Anwendungen ab;
das ist kein garantierter sofortiger Rueckwechsel.

Die Vorbereitung prueft die Herkunft, Bundle-Integritaet und gleichbleibende
Anwendungsnamen/Namespaces. Fehlende vorherige Auswahl, veraenderte historische
Bundles oder inkompatible GitOps-Chartstaende werden abgewiesen. Historische
Bundle-Verzeichnisse und Registry-Images muessen erhalten bleiben.
`previous` bedeutet vorher ausgewaehlt, nicht automatisch nachweislich gesund.
Die aktuelle Registry-Erreichbarkeit und tatsaechliche Funktionsfaehigkeit werden
von diesem Git-Workflow nicht im Cluster getestet.

Argo erlaubt seinen direkten History-Rollback nicht bei aktiviertem Auto-Sync
([Argo-Dokumentation](https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/)).
Der Git-Rollback laesst Auto-Sync aktiv und aendert dessen Sollzustand dauerhaft.
Ein manueller Notfalleingriff in Argo muesste sowohl die Root-Reconciliation als
auch die betroffenen Kinder beruecksichtigen und danach in Git nachgezogen werden;
dafuer ist hier kein separater Notfallknopf implementiert.

Ein Image-Rollback stellt keine Datenbankinhalte wieder her. Migrationen und
Datenformate muessen mit dem alten Release kompatibel sein; andernfalls ist ein
passender Daten-Wiederherstellungsplan oder ein korrigiertes Release erforderlich.

`selfHeal` ist aktiv, automatisches `prune` bleibt ausgeschaltet. Entfernte
Ressourcen daher gezielt in Argo pruefen und bereinigen.

## Diagnose ueber Devbox / Ops MCP

Der vorhandene Ops MCP stellt unter anderem `list_argocd_applications`,
`namespace_overview`, `get_events` und `get_pod_logs` bereit. Damit lassen sich
Sync-/Health-Zustand, Git-Revision, fehlgeschlagene Operationen, Pod-Zustand und
verfuegbare Logs korrelieren. Die Kubernetes-Anfragen sind lesend; die Diagnose
veraendert das Deployment nicht.

Bei einem Incident zuerst Zeitpunkt, betroffene Anwendung, aktuelle Revision
und die relevanten Events/Logs sichern, soweit das die Wiederherstellung nicht
verzoegert. Danach Rollback oder Korrektur auswaehlen. Nach einem Rollback erneut
Argo-Health, Pod-Bereitschaft und einen fachlichen Funktionstest pruefen.
Logs liefern Diagnosehinweise, aber nicht in jedem Fall eine eindeutige Ursache.
Die MCP-Verbindung und der Clusterzugriff muessen separat eingerichtet sein.

## Grenzen

Diese Automatisierung verwaltet die Runtime-Anwendungen Buster, Prism und Nova.
Host-Bootstrap, Kubernetes, Storage, Secrets-Versorgung und Argo selbst werden
dadurch noch nicht automatisch verwaltet. Fuer den kompletten Verzicht auf den
Control Node muessen dessen weitere Aufgaben zuerst inventarisiert und uebergeben
werden. Normale Runtime-Releases benoetigen ihn nach dem Einstieg nicht mehr.
