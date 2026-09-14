# IFR-05-001: geprüfte GitOps-Releaseauswahl

Die Runtime hat jetzt einen ausführbaren Argo-Einstieg mit Applications,
AppProjects, eindeutiger Ownership, extern vorversorgten Secrets, unveränderlicher
Releaseauswahl, Health-Gates und Datenerhalt. Der bestehende Installer bleibt für
Argo selbst zuständig. Der Root-Einstieg setzt die ausdrücklich ausgewählte
Revision; Argo verwaltet anschließend die Runtime-Ressourcen.

## Eine Releaseauswahl

`scripts/gitops.mjs export` verwendet ausschließlich den vorhandenen
`scripts/deploy.sh render`-Pfad und dessen vollständigen Runtime-Releasebeleg.
Es gibt keinen zweiten Image- oder Values-Resolver. Der Export erzeugt drei
Manifestgruppen (Buster, Prism einschließlich Agent, Nova) und `bundle.receipt`
unter einem neuen, nicht überschreibbaren `releases/gitops/NAME`-Verzeichnis.
Alle Container und Init-Container müssen Digest-Referenzen haben. Secrets und
Namespaces dürfen nicht als Ressourcen in diesen Gruppen enthalten sein.
Identitäten, Images, benötigte Secret-Schlüssel und Manifestprüfsummen werden
inventarisiert. Die bestehenden Nova-Verifikationsrollen im Tailscale-Namespace
werden ausdrücklich mit erfasst; beliebige fremde Workload-Namespaces sind
nicht erlaubt.

`bootstrap`, `preflight` und `apply` lesen den Bundle-Inhalt direkt aus einem
vollständigen Git-Commit. Sie prüfen die Manifestprüfsummen, den am selben Commit
persistierten Releasebeleg, First-Party-Images, Bundle-Quellrevisionen,
Ressourceninventare und die einzige Ownership jeder Ressource. Das lokale
Bootstrap-Chart muss genau diesem Commit entsprechen. Branches, Tags,
Arbeitsbaum-Overrides und URLs mit eingebetteten Zugangsdaten werden verworfen.
Das Bootstrap-Project darf ausschließlich Applications und AppProjects im
Argo-Namespace verwalten. Das Workload-Project erlaubt nur den ausgewählten
Git-Ursprung, die tatsächlich benötigten Namespaces und Ressourcentypen.

Der vorhandene Renderer brauchte eine ergänzende Korrektur: Die private native
Prism-Bindung (`nodeName`, `namespace`, `policyDigest`) ist ebenso wie der private
Registry-Kontext schon für das Baseline-Render erforderlich. Nur diese drei
Felder werden übernommen; Image-/Bundle-Kontrollen bleiben an den unabhängigen
Releasebeleg gebunden. Ein reines Prism-Render benötigt kein `kubectl` mehr.

## Erstinstallation und Aktualisierung

Voraussetzungen: bereits eingerichtete Infrastruktur, Runtime- und
Tailscale-Namespaces, CSIDriver `csi.spiffe.io`, native Hostpools sowie externe
Runtime-, Attestation-, Datenbank-, Bundle- und Pull-Secrets. Der Argo-Repozugang
muss separat eingerichtet sein. Namespaceabhängige Vertrauens- und Routingwerte
müssen zum ausgewählten Betreiber-Overlay passen. Der Export ersetzt diese
Konfiguration nicht durch geratenen Host-, Namespace- oder Identitätsinhalt.

Der Git-Ursprung und Änderungen an Root/Project sind administrativ zu schützen:
Das Bootstrap-Project kann weitere Projects anlegen. Nur überprüfte
Betreiberkonfiguration gehört in diesen Ursprung. Der Export anonymisiert keine
privaten Values; IFR-29-001 bleibt separat offen. Eine Veröffentlichung oder ein
History-Rewrite gehört nicht zu diesem Arbeitsstand.

Beispielablauf mit bereits akzeptiertem Image-Release und passenden privaten
Overlays; die Platzhalter sind vor Ausführung durch reale Werte zu ersetzen:

```sh
node scripts/updates/materialize-release.mjs --family=runtime --check
node scripts/gitops.mjs export releases/gitops/release-name kubeclaw kubeclaw
```

Anschließend die neue Gruppe einschließlich aller privaten Konfigurationswerte
prüfen und über den bestehenden Reviewweg in den vorgesehenen Git-Ursprung
übernehmen. Die vollständige Commit-ID dieses Standes auswählen. Aus einem
Checkout dieses Commits lässt sich die konkrete Root-Konfiguration vorab lesen:

```sh
node scripts/gitops.mjs bootstrap releases/gitops/release-name \
  https://github.com/OWNER/PRIVATE-REPOSITORY.git COMMIT_SHA argocd
node scripts/gitops.mjs preflight releases/gitops/release-name \
  https://github.com/OWNER/PRIVATE-REPOSITORY.git COMMIT_SHA argocd /private/native-worker-pools.yaml
```

`preflight` läuft auf dem ausgewählten Host und ist lesend: Es prüft die exakt
installierte Argo-Health-Konfiguration und Annotation-Verfolgung, CSI,
Namespaces, benötigte Secret-Schlüssel, Helm-/Argo-/Ressourceneigentümer und die
Bindung des tatsächlich exportierten Prism-Workers an die lokale Node-Policy.
Danach ruft es die vorhandene echte Host-/Kubelet-/Pool-Vorprüfung auf. API-,
Berechtigungs- und Hostfehler werden nicht als fehlende Ressourcen behandelt.

Für eine ausdrücklich freigegebene Installation führt `apply` dieselbe
Vorprüfung aus und übergibt erst danach ausschließlich die Root-Application und
ihr Project an `kubectl apply`. In diesem Behebungsauftrag wurde kein `apply`,
Installer oder Deployment gegen einen Cluster ausgeführt.

```sh
node scripts/gitops.mjs apply releases/gitops/release-name \
  https://github.com/OWNER/PRIVATE-REPOSITORY.git COMMIT_SHA argocd /private/native-worker-pools.yaml
```

Ein bestehender Helm-Stack wird nicht automatisch adoptiert. Der Einstieg ist
für eine frische oder bereits von dieser GitOps-Konfiguration verwaltete Runtime.
Eine bestehende Installation braucht zuvor einen gesondert geprüften Cutover mit
Datenerhalt und ausdrücklicher Eigentumsübergabe. Fremde Root-/Project-Eigentümer,
unverwaltete Bestandsressourcen und wechselnde Root-Namespaces werden abgewiesen.

## Reihenfolge, Drift und Fehler

Die Root-Application synchronisiert Buster und Prism in Welle 0; Nova folgt in
Welle 1. Eine Child-Application ist erst gesund, wenn ihre gewünschte Quelle und
Destination mit dem verglichenen Stand übereinstimmen, genau der ausgewählte
Commit synchronisiert ist und eine erfolgreiche Operation für diesen Commit
vorliegt. Alte Healthy-Zustände, Git-Vergleichsfehler, laufende oder fehlgeschlagene
Operationen sowie nicht gesunde Deployments öffnen keine Folgewelle.
Die Lua-Prüfung benötigt keine freigeschalteten Standardbibliotheken.

Innerhalb Prism: PostgreSQL und Migrationseingänge in Welle 0, Migration als
nativer Argo-Sync-Hook in Welle 1, Dienste und Artefakt-/Backup-PVCs in Welle 2,
Prism-Agent einschließlich seiner PVCs in Welle 3. Die Helm-Hook-Semantik bleibt
für den weiterhin getrennten Helm-Betrieb erhalten. Claims werden zusammen mit
ihren Verbrauchern angewendet; dadurch gibt es bei `WaitForFirstConsumer` keine
gegenseitige Wartebedingung. Die Backup-PVC erhält einen auf 120 Sekunden
begrenzten Storage-Check mit dem bestehenden gepinnten PostgreSQL-Image, ohne
DB-Zugangsdaten oder API-Token. Er erzeugt, liest und entfernt nur eine kleine
Prüfdatei; das ist kein Backup- oder physischer Durabilitätsnachweis.

Self-heal ist aktiv, automatisches Prune ist aus, gemeinsame Ressourcen führen
zum Fehler. Applications haben keine kaskadierenden Löschfinalizer. Eigenständige
Daten-PVCs und PostgreSQL-Claimvorlagen sind zusätzlich gegen Argo-Prune und
Argo-Löschung geschützt. Das schützt nicht gegen direkte administrative
Namespace-/PVC-Löschung oder einen Verlust des Speichermediums.

Die imperativen Runtime-Upgrades und Teardowns prüfen den Argo-Eigentümer vor
Änderungen. Ein Runtime-Namespace hat nur einen Deployment-Controller. Die
Root-Application beansprucht die Runtime bereits vor der Erzeugung der Children;
zurückgelassene, markierte Workloads verhindern eine stille Übernahme nach dem
Löschen von Applications, auch wenn die Application-CRD selbst entfernt wurde.
Die GitOps-Vorprüfung verweigert außerdem fremde Root-Applications, die denselben
Runtime-Namespace bereits beanspruchen, bevor deren Children vorhanden sind. Die Übergabe selbst muss als einzelne
Betreiberoperation erfolgen, nicht parallel zu einem bereits laufenden Helm-
oder GitOps-Cutover. Infrastruktur-Bootstrap bleibt ein eigener Zuständigkeitsbereich.

## Rollback und separate Live-Abnahme

Rollback bedeutet die erneute Auswahl eines vollständig geprüften älteren
Bundle-Commits aus dessen Checkout über dieselbe Vorprüfung. Die PVC-Identitäten
bleiben gleich; es gibt kein automatisches Datenbank-Downgrade und keinen
impliziten Restore. Die ältere Anwendung muss mit dem vorhandenen Datenbankschema
verträglich sein. Andernfalls ist vor dem Rollback eine separat geprüfte
Datenwiederherstellung nötig. IFR-26-001 ist kein durch GitOps gelöster DR-Nachweis.

Der Auftraggeber prüft später im isolierten Cluster: frischen Bootstrap mit
`WaitForFirstConsumer`, ersten Sync und Readiness; absichtlich fehlerhafte
Migration mit blockierter Folgewelle; Drift und Self-heal; Git-Ausfall sowie
nicht gecachte Images bei Registry-Ausfall; Rückkehr zu einer kompatiblen älteren
Revision mit identischen PVC-UIDs und unveränderten Testdaten. CNI-/Hostausfall,
Storageverlust und vollständige Anwendungs-Recovery bleiben eigene Abnahmen.

## Lokale Belege

Die finalen Rohbelege stehen unter `docs/review/evidence/pr6-gitops/`.
Git und Helm sind echt. Release-Digests und Clusterantworten in den lokalen
Tests sind ausdrücklich synthetisch; die Tests starten keine Runtime-Images,
keinen Argo-Controller und keinen Cluster. Die Health-Datei wird von echtem Lua
mit einem eingeschränkten Environment ausgeführt. Das Argo-Chart 10.8.0
(App-Version v3.5.2) und die Redis-HA-Abhängigkeit 4.38.0 wurden aus den offiziellen
Git-Quellen gelesen und alle verwendeten Dateien gegen ihre Git-Blob-IDs geprüft.
Kein Chart oder Controller wurde zur Laufzeit auf eine andere Version umgebogen.

Primärquellen für Argo-Verhalten:
- https://argo-cd.readthedocs.io/en/stable/user-guide/helm/
- https://argo-cd.readthedocs.io/en/stable/user-guide/sync-options/
- https://argo-cd.readthedocs.io/en/stable/operator-manual/health/
- https://argo-cd.readthedocs.io/en/stable/operator-manual/cluster-bootstrapping/
- https://github.com/argoproj/argo-helm/tree/argo-cd-10.8.0/charts/argo-cd

## Abschlussprüfung am 2026-09-14

IFR-05-001 ist nach D12 lokal abgeschlossen. 27 Tests bestanden, ohne Skips:
19 GitOps-/Deployment-/Health-Tests, ein Bootstrap-Test mit dem originalen Argo-
Chart und sieben Backup-Regressionsprüfungen. Der Bootstrap-Test führt den echten
Installer mit ausdrücklich simulierten Kubernetes-Mutationen aus; das Helm-
Rendering des unveränderten Upstream-Charts ist echt. Lua läuft ohne offene
Standardbibliotheken. Kein Argo-Controller und kein Cluster wurden gestartet.

Zusätzlich bestanden der kanonische ESLint für alle betroffenen JavaScript-
Produktions- und Testdateien, Bash-Syntax und `versions.mjs --check`.
Die Wiederaufnahme korrigierte zwei Eigentumslücken: entfernte Application-CRD
bei erhaltenen Workloads sowie konkurrierende Root-Applications vor Child-Sync.
Beide Fälle und die erneute Vorprüfung der eigenen Root sind abgedeckt.

| Nachweis | Inhalt |
| --- | --- |
| `local-tests.txt` | 19 Tests: Export, Commitbindung, Ownership, Vorprüfung, Health, Reihenfolge, PVCs, bestehender Renderer |
| `bootstrap-test.txt` | Originalinstaller und gepinntes Argo-Chart: installierte Health-Konfiguration und Annotation-Tracking |
| `backup-regression.txt` | Sieben bestehende Backupprüfungen |
| `lint.txt`, `shell-syntax.txt`, `versions.txt` | Statische Prüfungen mit tatsächlichem Exitcode |
| `chart-source-blobs.json` | 171 tatsächlich verwendete Originaldateien einschließlich Hash und Quelle |

Alle Dateien liegen unter `docs/review/evidence/pr6-gitops/`.
Wiederholung aus dem Repository mit Node-Abhängigkeiten, Helm im `PATH`,
`LUA_BIN` auf Lua 5.1 und `ARGO_HELM_CHART_ROOT` auf dem Originalchart einschließlich
Redis-HA 4.38.0; `HELM_BIN` muss für den Bootstrap-Test ein absoluter Pfad sein:

```sh
node --test tests/verification/deployment/{argocd-chart-order,gitops-release,gitops-health,deployment-release,gitops-bootstrap}.test.mjs
node --test tests/verification/deployment/prism-backup.test.mts
```

Die Chart-Quellen sind auf die aufgezeichneten Git-Commits und Blob-IDs gebunden.
Fehlendes Lua oder fehlendes Chart lässt die entsprechenden Tests fehlschlagen;
es gibt keinen automatischen Skip. Die Live-Abnahmen aus dem vorigen Abschnitt
bleiben ausdrücklich offen; sie verhindern gemäß D12 nicht den lokalen Abschluss.
