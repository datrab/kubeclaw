# INF-27 — Eigenständiger Ops-MCP und Secure Tunnel

Review: **abgeschlossen (statisch)**. Prüfcommit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. Kein Live-Nachweis.

## Inventar und Autorität
Eigenständiger read-only Dienst: `my-values/infra/ops-mcp.yaml`, `ops-mcp-tunnel.yaml`, `deploy-ops-mcp.sh`, `tools/ops-mcp/src/{server,kubernetes,diagnostics}.mjs`, Dockerfile/Lock. Image-Digest wird vom Renderhelper verlangt; Deployment 25m/64Mi Request, 250m/256Mi Limit. ClusterRoleBinding erlaubt get/list von Namespaces, Pods/Logs, Services, Events, Workloads, Ingresses und Argo-Applications; keine Secrets, exec oder Kubernetes-Schreibrechte.

Transport liest Token/CA je Request neu, überprüft HTTPS-CA/Hostname, lehnt Redirects ab, begrenzt Antwortbytes/Timeout und paginiert. Das ist ein Beobachter, kein Argo-Sync-/Host-Recovery-Werkzeug. Eigene Kubernetes-Token-Projektion läuft in der Standalone-Variante standardmäßig über den SA-Mount. Der Secure-Tunnel ist optionale externe OpenAI-Abhängigkeit, NodePort-freier Ausgangspfad über 443 und internes HTTP:8080.

## Befund IFR-27-001
**Mittel; nachgewiesene breite Lesetrust-Grenze.** Auslöser: erlaubter Tailnet-Client oder kompromittierter zugelassener Tunnel/Proxy. Standalone-Manifest setzt keinen MCP-Bearer; `server.mjs:18–24,445ff.` erlaubt ihn optional. Netzwerk-Ingress beschränkt auf bestimmte Proxy-/Tunnel-Labels, der ClusterRoleBinding dagegen liest clusterweit inklusive fremder Namespace-Podlogs. Damit sind auch potenziell sensible Paperless-Logs im Rechtebereich, obwohl keine Schreiboperation möglich ist.

Ursachenbehebung: benötigte Namespace-/Ressourcenumfänge konkret festlegen und RoleBindings statt globalem Leser verwenden; explizite Backend-Auth entsprechend Clientvertrauen, ohne eine vermeintliche Secret-Redaktion als Ersatz. Echter Test: erlaubte/unerlaubte Namespace-Leseoperationen mit realem SA, autorisierter/unautorisierter Tailnet-Client und wiederverwendetes bzw. rotiertes Token.

## Prüfungen und Recovery
Sieben vorhandene lokale Bootstrap-/Diagnostics-/HTTP-/MCP-Tests bestanden. Tatsächlicher MCP-Prozess lief auf Loopback; fehlende Kubernetes-Datei führte zu Toolfehler, Health blieb korrekt Prozesssignal. Benutzte Abhängigkeiten aus vorhandenem Cache: alle sechs installierten Paketversionen mit Lock abgeglichen; kein frisches npm-ci oder Image-Akzeptanzbeleg. HTTPS-Test mit eigenem Testserver wurde nicht als Kubernetes-Livebeleg eingesetzt.

Cilium-Zusatzbranch verändert Ops-Policies/Hubble-Anbindung; main-Dienst nicht damit gleichsetzen. Recovery bei CNI-/Nodeausfall funktioniert nicht über diesen Cluster-Pod. Doku benennt read-only korrekt, braucht Rechteumfang über andere Namespaces, Backend-Auth, API-Port-Nachweis und die Grenze zum [Ops-Pod](ops-pod.md).
