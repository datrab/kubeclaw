# INF-08 — Schreibbare lokale OCI-Registry und Node-Pull-Pfad

Review: **abgeschlossen (statisch)**. Prüfcommit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. Kein Live-Nachweis.

## Inventar und beide Clients
Pipeline-Abhängigkeit. `my-values/infra/registry-local.yaml:15–57`: eine Deployment-Replik mit mutablem `registry:2`, Port 5000; Service `registry-local:5001 → 5000`. Keine Authentifizierung/TLS, kein PVC, keine Readiness/Liveness. Request 50m/64Mi, Limit 200m/128Mi; kein ephemeral-storage-Budget. `scripts/deploy.sh:1166–1171` appliziert Manifest und wartet Deployment-Rollout.

Buster bekommt den Service-FQDN in `my-values/buster-values.yaml:119–126`. `docker/buster-runtime-entrypoint.sh:11–18` konfiguriert HTTP für BuildKit. `container-build-runtime.ts:103–124,190–218` bindet Registry-URL an Image-Host, pusht, prüft Manifest-Digest und liefert eine unveränderliche Image-Referenz. Der Node-containerd ist ein anderer Client als BuildKit. `my-values/infra/k3s-registries.yaml` ist explizit ein nicht einsatzfähiges Legacy-Beispiel mit privatem Port-Platzhalter. Policy erlaubt Gateway-Pods und private Netze, kein Benutzer-/Repository-Rechtemodell.

## Befund IFR-08-001
**Hoch; nachgewiesener unvollständiger Default-Vertrag.** Auslöser: Buster erstellt ein Image und ein Node muss es für einen Test-Pod ziehen, ohne extern ergänzten Registry-Endpunkt. Der Service-FQDN/HTTP-Pfad ist in BuildKit konfiguriert, jedoch kein funktionierender Node-Pull-Pfad im Repository eingerichtet. Belege oben und `k3s-registries.yaml:1–20`. Folge: erfolgreicher Push beweist keinen Pod-Start; ImagePull scheitert abhängig von Host-DNS/HTTP-Konfiguration.

Ursachenbehebung: einen expliziten, privaten und authentifizierten/TLS-gesicherten, auf allen Nodes erreichbaren Registry-Pfad als gemeinsamen Vertrag wählen; sämtliche Clients konsistent konfigurieren. Kein pauschales öffentliches NodePort als Symptombehebung. Echter Test: uncached Digest vom Node mit tatsächlichem CRI ziehen, Test-Pod starten und private/unzulässige Clients negativ prüfen.

## Befund IFR-08-002
**Mittel; nachgewiesener Retention-/Dokumentationsdefekt.** Manifestkommentar behauptet, Test-Images würden bei Namespace-Löschung entfernt. Tatsächlich speichert der gemeinsame Registry-Pod ohne Volume in seiner Container-Schreibschicht; das Löschen eines Test-Namespace berührt ihn nicht. Keine GC-/Löschroutine zwischen Lease-Ende und Registry nachgewiesen. Folge: ungebundenes Disk-Wachstum bis Containerverlust/Node-Druck; Registry-Neustart verliert wiederum benötigte Images.

Ursachenbehebung: explizite Artefaktlebensdauer und GC mit Referenzschutz plus definierte Persistenz/Disk-Budgets. Test: mehrere echte Lease-Zyklen, GC, noch benötigten Digest erneut ziehen, Registry-Pod ersetzen. Schema- und Source-Prüfung ersetzt diese Tests nicht. Registry und Build-Cache bleiben getrennte Einheiten.
