# IFR-04-001: unabhängige aktuelle Quelleninventur

T1/T2/T-DOC sind nach dieser read-only Inventur noch nicht vollständig erfüllt. Der Originalvertrag verlangt einen redigierten aktuellen externen Regelstand und pro Zugang tatsächlich identifizierte erlaubte/verbotene Clients. Die gelesenen Repositoryquellen enthalten Endpunkte, Tags und Credentialreferenzen, aber keinen dazu gebundenen aktuellen Tailnet-Regelstand mit TagOwnern, Grants/ACLs und realen Clientreferenzen. Ein vorbereitetes Schema oder hypothetische Beispielidentitäten reichen dafür nicht. Keine Tailnetabfrage, Secretwert-Lektüre, Mutation, Installation oder Liveprüfung wurde vorgenommen.

## Vollständiger gefundener Zugangsbestand

| Weg | Aktuelle Quelle und Ziel | Netzwerk- und Anwendungsgrenze |
| --- | --- | --- |
| ArgoCD | `my-values/infra/argocd-tailscale-ingress.yaml`: TLS-Hostname `argocd`, Service `argocd-server:80`, Klasse tailscale | Tailnet-Freigabe und separate Argo-Anmeldung/RBAC müssen jeweils geprüft werden. Das Ingressobjekt ist kein App-Autorisierungsbeweis. |
| Nova-Archviewer | `charts/kubeclaw/templates/archviewer.yaml`, Nova-Values: `nova-architecture`, eigener ClusterIP-Service Port 3456 | Backend-Netzwerkregel bindet Operatornamespace und Parent-Labels. Nginx Basic Auth aus `nova-archviewer-auth/htpasswd`; healthz ist ausgenommen. Kein allgemeiner NodePort. |
| Prism Studio | `charts/prism/templates/services.yaml`, Prism-Values: `prism-studio`, Service Port 80 zum zentralen Studio-Port | Tailnetberechtigung ist nicht gleich Control-HMAC. Studio injiziert das externe `PRISM_INGRESS_SECRET` serverseitig zum Control; dies authentifiziert nicht separat jeden Browser. Fehlendes Secret erzeugt Proxy-503. |
| Dynamische Preview | `cmd/buster-namespace-controller/main.go`, `previewIngress`: Lease-Hostname/Path/Service/Port, Klasse tailscale | Controller besitzt Ingress und prüft Lease-Zuordnung. Anwendungsauthentifizierung hängt von der Previewanwendung ab. Die Netzwerkausnahme bindet derzeit fest Namespace `tailscale` und den Parent-Namespace; kein frei konfigurierbarer Operatornamespace darf dafür behauptet werden. |
| Optionaler Ops-Sidecar | `charts/ops-pod/templates/workload.yaml`, Values und deploy-ops-pod: standardmäßig deaktiviert, Userspace-SOCKS `127.0.0.1:1055`, Hostname `kubeclaw-ops` | Dies ist kein veröffentlichter eigener Ingress. Die Matrix muss den tatsächlichen ausgehenden Tailnetzugang und lokale SOCKS-Nutzer getrennt behandeln. Kein Node-/KVM-Recoveryersatz. |

Die statischen Ingressquellen und der Previewcontroller setzen keine individuellen Proxy-Tags. Beide Operator-Values verwenden `tag:k8s-operator` für den Operator und `tag:k8s` als Proxydefault. Deshalb muss der externe Vertrag ausdrücklich erklären, welche der genannten Ziele gemeinsam oder getrennt freigegeben werden und wer diese Tags vergeben darf. Aus dem fehlenden externen Regelstand folgt keine bewiesene aktuelle Überfreigabe, aber auch keine nachgewiesene Trennung.

## Credential- und Zuständigkeitsbindung

Operator-OAuth ist die externe Secretreferenz `tailscale/operator-oauth` mit den Schlüsseln `client_id` und `client_secret`; leere Inlinewerte sind keine fehlenden Credentials. Bootstrap und Argo-Handover dürfen nicht als zwei gleichzeitige Installationsautoritäten beschrieben werden. Der aktuelle GitOps-Chartpin lautet 1.102.3. Die historische Infrastrukturreview-Aussage zum ungepinnten Chart ist als damaliger Befund zu erhalten, im aktuellen Nachweis aber durch den tatsächlichen gepinnten Pfad zu ersetzen.

Ops verwendet `codex-ops-tailscale/authkey`, optional aus `OPS_TAILSCALE_AUTHKEY_FILE`, und einen persistenten Tailscale-State. `TS_AUTH_ONCE=true` bedeutet ausdrücklich: Secret-/Authkeywechsel alleine ist keine Geräte- oder Sessionrotation. Die vorhandene Ops-Dokumentation beschreibt diese Grenze bereits. OAuth-Berechtigungen, zuständige Betreiber, TagOwner, Geräte-/Keywiderruf und HTTPS-/Zertifikatsverantwortung müssen an sichere externe Referenzen gebunden werden; Secretwerte gehören nicht in die Matrix.

## Konkrete noch fehlende lokale Nachweise

1. Redigierter aktueller Tailnet-Regelstand mit Datum/Digest, externem Speicherort, TagOwnern, ACLs/Grants, OAuth-Rechten und verantwortlicher Rolle; keine erfundenen Beispielwerte als Istzustand.
2. Je oben genanntem Weg reale erlaubte/verbotene Clientreferenz sowie getrennte erwartete Netzwerk- und Anwendungsentscheidung. Previewfälle müssen dynamische Erzeugung und Ablauf/Entzug einschließen; Ops muss als optionaler ausgehender Weg erfasst sein.
3. Aktuelle lokale Render-/Quellenbindung für Endpunkte und Tags. Vorhandene private-access-Tests prüfen Archviewer-Service/Netzwerk/Secretreferenzen, nicht die gesamte externe Zugriffsentscheidung. Diese Inventur führt keine Tests aus und übernimmt deren historische Ergebnisse nicht als aktuellen Lauf.
4. Konkrete Diagnose- und Rotationsreihenfolge: Netz/DNS/TLS getrennt von App-401/403 und Proxy-503; Proxyneustart, OAuthwechsel, Zertifikatrotation und Ops-Gerätezustand getrennte Szenarien. Die sehr kurzen Operator-/Final-Preview-Dokumente decken den ursprünglichen Vertrag bislang nicht ab.

Alle echten T2-Fälle vor/nach Neustart und Rotation bleiben separate Live-Gates. Der Originalvertrag sagt ausdrücklich, dass ohne echte Regelstände/Clients nur der vorbereitete Dokumentations-/Testteil abschließbar ist. Deshalb ist eine vollständige lokale IFR04-Promotion auf Basis dieser Inventur noch nicht gerechtfertigt.

[Exakte gelesene Quellenidentitäten](../../evidence/tailscale-current-inventory-independent-20260921/identities.json). Parallele spätere Root-Dokumentationsänderungen sind nicht vorweggenommen.
