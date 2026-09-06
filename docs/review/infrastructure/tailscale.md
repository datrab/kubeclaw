# INF-04 — Tailscale Operator und Ingress

Review: **abgeschlossen (statisch)**. Prüfcommit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. Kein Live-Nachweis.

## Inventar
Allgemeine Infrastruktur und Pipeline-Preview-Abhängigkeit. `my-values/infra/tailscale-operator-values.yaml`, `scripts/deploy.sh:991–1080`, Argo-/Ops-Ingress und `charts/prism/templates/services.yaml`; Betriebsdokumentation `docs/deployment/tailscale-operator.md`, `docs/operators/final-preview-tailscale.md`. OAuth aus externem Secret; leere Inline-Werte sind keine fehlenden Credentials, sondern Secret-Verweis gemäß Kommentar/Bootstrap. Tags sind konfiguriert, aber Tailnet ACLs/Grants, HTTPS-Freigabe und OAuth-Rechte liegen extern.

Der Installer pinnt das Operator-Chart nicht. Er erstellt CRDs, IngressClass und Release im konfigurierten Operator-Namespace. Operator-Request 50m/128Mi, Limit 250m/256Mi; Proxy-Kapazität/Zustand stammen aus ungepinntem Upstream-Chart. Ingress-Consumers benötigen öffentliche Control-Plane-/DERP-Erreichbarkeit, DNS und Backend-Ports. Backend-Regeln für Ops/Prism begrenzen Operator-Pods über Parent-Labels; Argo hat im Repo keine entsprechende Ingress-Policy.

## Review und offene Nachweise
Installationszuständigkeit von bestehendem Operator und Script muss vor jedem Bootstrap geklärt werden: `TAILSCALE_OPERATOR_ENABLED=false` erlaubt extern verwalteten Operator, keine zweite Installation nötig. Sonst kann `helm upgrade` den vorhandenen Operator und CRDs ändern. [IFR-24-001](updates-security.md) führt das Versionsproblem zentral.

Ein Tailnet-Name oder Ingress-Objekt beweist keinen autorisierten Zugriff. Die Namespace-/Pod-Labels sind eine Netzwerkzuordnung, kein Ersatz für Tailnet-Authentifizierung und Backend-Auth. OAuth-Rotation, Proxy-Neuerstellung und Zertifikatablauf müssen getrennt geprüft werden. Host-Zugriff darf nicht ausschließlich auf demselben Operator beruhen.

## Befund IFR-04-001
**Mittel; offene Frage.** Auslöser: Argo-/Ops-/Prism-Zugriff oder neue Broker-Preview wird als verfügbar betrachtet, obwohl ACL-/Grant-/TagOwner-Konfiguration nicht erfasst ist. Quellen: obige Values, Ingress-Templates und `docs/deployment/tailscale-operator.md`. Auswirkung: Zugriff fehlt oder ist breiter als erwartet. Ursachenbehebung: redigierten externen Zugriffsvertrag mit Tag-Eigentümern, zugelassenen Nutzern und Zweck je Ingress dokumentieren. Test: je ein erlaubter und verbotener echter Tailnet-Client, Proxy-Neustart und OAuth-/Zertifikatrotation.

Manifest- und Aufruferreview abgeschlossen; kein Operator-Chart installiert, keine Tailnet-Daten gelesen. Doku teilweise vorhanden, konkrete externe Konfiguration und Recovery ohne Operator offen. Optionaler Userspace-Tailscale im [Ops-Pod](ops-pod.md) ist ein anderer Zugriffsweg.
