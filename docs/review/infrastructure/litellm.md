# INF-14 — LiteLLM und Modellzugang

Review: **abgeschlossen (statisch)**. Prüfcommit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. Kein Live-Nachweis.

## Inventar
Optionaler Modellgateway mit eigenem PostgreSQL. `my-values/infra/litellm-deployment.yaml:7–82`: gepinntes Image-Digest, Recreate, Port 4000, 100m/256Mi Request, 1 CPU/4Gi Limit. `litellm-config.yaml` via ConfigMap, Credentials über envFrom und read-only Secret-Mount; keine Credentialinhalte übernommen. `deploy.sh:1137–1157` erstellt ConfigMap, appliziert Manifest und setzt NodePort standardmäßig auf 30050. `litellm-values.yaml` wird von diesem Pfad nicht konsumiert: früherer Helm-Ansatz, keine bewiesene externe Nichtnutzung.

Pipeline-Agenten nutzen den Service; weitere externe Konsumenten sind nicht verifiziert. Verbindung zur DB: 5432; Upstream-Modelle: HTTPS. Default-Deny wird durch breit freigegebenen LiteLLM-Ingress auf 4000 ergänzt. NodePort ist damit kein lediglich privater Tailscale-Ingress; Host-Firewall/Netz sind extern zu prüfen.

## Befund IFR-14-001
**Mittel; nachgewiesene Rollout-/Health-Lücke.** Auslöser: Konfigurationsänderung ohne Image-/PodTemplate-Änderung oder ein nach Prozessstart nicht funktionsfähiger Proxy. Manifest hat keinerlei Startup-/Readiness-/Liveness-Probe. Config wird mit subPath gemountet und erzeugt keinen Checksum-Rollout; `kubectl rollout status` allein erkennt den Bedarf nicht. Wirkung: als erfolgreich gemeldeter Rollout kann alte Konfiguration bzw. nicht funktionsfähigen HTTP-Dienst belassen.

Ursachenbehebung: explizites ConfigMap-zu-Pod-Rollout und geeignete lokale/startup-/abhängigkeitsbewusste Readiness definieren. Echter Test: Configänderung ausrollen, effektive Modellroute prüfen; Prozess hängt/DB-Ausfall kontrolliert simulieren und Ready/Unready beobachten. Keine Liveness-Abhängigkeit bauen, die DB-Ausfälle zu Restart-Stürmen macht.

## Weitere Grenzen
Default-ServiceAccount-Token wird nicht explizit deaktiviert; Pod-/Container-SecurityContext fehlt. Secret enthaltender Modellgateway benötigt engere Rechte-/Imageprüfung. Auth wird aus Secret/Config erwartet; hier keine erfolgreiche Anmeldung behauptet. Dokumentation muss NodePort-Zugriffsgrenze, Secret-/DB-Konsistenz und den obsoleten Values-Pfad korrigieren. Schema-/Deployment-Quellprüfung bestanden; kein Modellaufruf oder kostenpflichtiger Request ausgeführt.
