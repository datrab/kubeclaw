# prism.service-studio — statische Studioauslieferung und APIproxy

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1–3. Umfang, Verträge, Zustand

Vollständig `skills/prism/server/studio.ts:1–34`, proxy-headers.ts, viteconfig und studio-proxy.test.mts gelesen. Servicechart liefert gebaute dist-studio aus; /v1/* proxyt an konfiguriertes Control. Body bis2MB, Headerallowlist cookie/content-type/CSRF/Tailscaleidentität, Proxy fügt eigenes ingressSecret hinzu. Control-session akzeptiert diese Secret+Login-Kombination; tatsächliche Tailscaleheadersäuberung davor bleibt entscheidende Betriebsannahme. Upstreamstatus wird weitergereicht, Response vollständig gepuffert; dekomprimierte Bytes bekommen keine alte content-length/encoding, Set-Cookies getrennt. Statische Pfade werden URL-normalisiert/decoded, auf Root bezogen, unbekannte Dateien auf index.html gefallbackt. Keine eigene DBmutation; vermittelte Controlwrites liegen beim Empfänger.

## 4–6. Fehler, Deadline und Restart

Fehlendes ingressSecret gibt503, Bodyoverflow413, Dateistreamfehler404. Upstreamreject und Decodefehler sind unhandled (001). Kein Fetch-Abort/Timeout und kein Disconnectsignal; Clientabbruch beendet laufendes Controlposting nicht, Ergebnis kann ungewiss sein. Proxyretry/dedup fehlen, Replay gehört Endpointvertrag. /ready prüft weder dist-Studio noch Control. Neustart hat keinen eigenen Journalzustand; laufende Proxyantworten gehen verloren, statische Dateien bleiben Artifactbuild. Kein SIGTERM-Serviceclose.

## 7–9. Vertrauen, Ressourcen, Architektur

Allowlist vermeidet Weitergabe beliebiger Authheaders, setzt aber gelieferten Tailscalelogin mit eigenem Secret als vertrauenswürdig; Service darf nur über tatsächlich vertrauenswürdigen Ingress erreichbar sein. Root muss kontrolliertes Buildverzeichnis ohne untrusted Symlinks sein. CSP self, connect https, object none; Browser-iframe-Details gehören prism.studio. Proxy2MB liegt unter Controlartifact8.5MB/6MBbinary, dadurch unterstützt Browserupload die theoretische maximale Controlgröße nicht. Responsebuffer/parallel offene Requests ohne Gesamtlimit, statische Dateien dagegen gepipt. Proxy sollte einen gemeinsamen Fehler-/Abort-/Streaminghandler bekommen statt endpointweise Catchworkarounds.

## 10–12. Tests, Dokumentation, Befund

Original studio-proxy-Test in [prism-reviewed-modules-tests.txt](../evidence/prism-reviewed-modules-tests.txt) prüft nur Headerhelper, keinen gestarteten HTTPproxy. Deploymentcommandcontract ist statisch, Browserfixtures benutzen Vite/dev-Fixture statt diesen Dienst. Plan Studioauth/APIproxy vorhanden, Recovery/Downstreamfailure unvollständig. Original-Service-Negativprobe ausgeführt (kein Ingress): siehe unten.

### PCR-PRISM-STUDIO-SERVICE-001 — Upstreamfehler wird ungefangene Async-Handler-Rejection

**Mittel; Evidenzklasse: nachgewiesener Defekt durch Original-Service-Lauf und Code-Trace.** studio.ts:9 createServer(async...), :21 fetch und :26 arrayBuffer ohne try/catch. Bei Control-Connectionrefused/Streamabbruch rejected Handlerpromise; Node HTTP awaited sie nicht und registriert keinen Catch, Node-Default kann ganzen Service beenden. Malformed percent encoding in :28 ebenfalls außerhalb Catch. Folge: eine einzelne fehlgeschlagene Anfrage gefährdet alle Studioclients. Original-Serviceprozess tatsächlich gestartet: /health200, dann /v1/projects gegen lokal unbenutzten Controlport; Clientfetch scheitert und Studio endet mit Exit1/ungefangener TypeError fetch failed, Ursache ECONNREFUSED. Ursache: async HTTPcallback ohne Fehlerboundary. Behebung: gesamte Handlerpromise abfangen, genau einmal definierte502/400 liefern, Abort-/Timeout/Disconnect und bereits gestartete Response berücksichtigen. Regression: Originaldienst mit tatsächlichem nicht erreichbarem Control und fehlerhaftem URLencoding; Anfragefehler ohne Prozessende, nachfolgender health/static-Request funktioniert.

Original-Negativprobe: [prism-studio-service-error-probe.mjs](../evidence/prism-studio-service-error-probe.mjs), [Ausgabe](../evidence/prism-studio-service-error-probe.txt). Kein Fake-Control/Mockserver und kein positiver vollständiger Service-E2E; der Originaldienst trifft absichtlich einen nicht belegten lokalen Port.
