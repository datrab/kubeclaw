# prism.service-ingestion — Akquisition und Quarantäne

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1–3. Umfang, Eingänge und Nebenwirkungen

Vollständig `skills/prism/server/ingestion.ts:1–78`, CorpusvalidateSource und Controlacquisition/Cleanup gelesen. Servicechart startet eigenen Prozess. POST /v1/acquisitions benötigt Bearersecret, puffert2MB JSON, validiert Source, erwirbt Upload/metadatenbytes oder öffentlichen HTTPScontent. Public-web ist bei regulärem Controlcaller vorab deaktiviert; privater Serviceroutepfad unterstützt ihn trotzdem. DNS wird je Redirect aufgelöst, sämtliche Antworten gegen private/adressspezifische Bereiche geprüft, Verbindung an ausgewählte IP gepinnt, TLSservername/Host behalten, maximal4 Requests.6MBDownload,15s Socket-Inaktivitätstimeout, erlaubte Mediatypen und Regex für aktiveSVG. Write SHA256-Datei mit wx/0600,202 enthält bytesBase64/normalized/digest. DELETE bereinigt contentdigest-ID; Control verifiziert Digest und hält Corpus restricted bis Cleanup.

## 4–6. Fehler, Retry und Wiederaufnahme

POSTfehler werden422; Downloadstatus/Redirect ohne Location/zu groß scheitern. DNS hat keine eigene Deadline; Sockettimeout ist keine absolute Gesamtdauer, tropfende Antwort kann weiterlaufen. response aborted/error wird nicht direkt gehandhabt, Requesterror nur am Requestobjekt. Quarantäne-Write ohne fsync, EEXIST akzeptiert; Quelle wird im Return aus neuer privater Byteskopie genommen, keine zugesicherte dauerhafte Originalretention. Same-digest-Zugriffe teilen eine Datei, DELETE ist idempotent bei ENOENT. Startup- und min(TTL,60s)-Scanner reapen SHA-Dateien; ungültige TTLzahl ergibt NaN statt sicheren Default. Cleanup nach Crash kommt später, DBactivation ist separater Controlschritt. Keine garantierte Saga-Recovery ohne Wiederholungsrequest.

## 7–9. Vertrauen, Limits, Vereinfachung

HMAC fehlt bewusst beim Bearerprivatdienst; Netzwerkisolierung/TLS ist Betriebsannahme. DNS-/Redirectpinning verhindert einfache Rebinding-IPwechsel, Policy ist manuelle Sperrliste und keine umfassende Internetadressklassifizierung. SVGregex ersetzt keine semantische Sanitization; Quellen werden nicht in diesem Dienst ausgeführt. Metadaten/Rechte bleiben Nutzerangaben. Serverquarantäne kann bisTTL durch beliebig viele Requests wachsen, Gesamtquota/Concurrency fehlen; readdir lädt gesamtes Verzeichnis. ENOSPC im POST wird422, DELETEfehler hat eigene Lücke001. Dauerhafte Verbesserung: explizites Acquisitionattempt-Lifecycle mit Abbruch/absoluter Deadline, idempotenter Cleanup und konsistenter Retention statt implizitem Dateialter allein.

## 10–12. Tests, Dokumentation, Befund

Corpus-Originalliteral-IP-Test in [prism-reviewed-modules-tests.txt](../evidence/prism-reviewed-modules-tests.txt) prüft validateSource, keine gestartete Akquisition/DNS/TLS/TTL. Keine gefakten Netztests als Livebeleg. Plan Phase6/Completionstatus dokumentieren Quarantäne/Quellenpolicy, aber keine tatsächliche Resourcereaping-/Restartgarantie. Dokumentation vorhanden und unvollständig. Nächster echter Test benötigt lokal kontrolliertes HTTPS/DNS und Originalservice, keine externen Quellen erforderlich.

### PCR-PRISM-INGESTION-001 — Cleanup-I/O-Fehler entkommt Requestfehlergrenze

**Mittel; Evidenzklasse: nachgewiesener Defekt durch Original-Service-Lauf und Code-Trace.** ingestion.ts:58–67 DELETEzweig führt awaited unlink außerhalb try ab: nur ENOENT wird ignoriert, EACCES/EIO wirft. createServer async-Callback wird von HTTP nicht awaited, kein globaler Rejectionhandler. Auslöser: berechtigter Cleanup bei fehlerhafter Quarantäne. Originalprobe erzeugt ein echtes Verzeichnis an digestförmigem Quarantänepfad: health200, DELETE löst EISDIR aus und Service endet mit Exit1; dies ist ein gezielter Dateisystemfehler, kein behaupteter regulär erzeugter Quarantäneinhalt. Folge: Node-Default beendet im Originalversuch den Ingestionprozess; Control behält restricted Item und bekommt Verbindungsfehler statt beherrschtem Cleanupstatus. Ursache: nur POST liegt innerhalb Fehlerboundary. Behebung: gesamte Handlergrenze catchen, I/Ocleanupfehler500/503 mit fortsetzbarer Operation darstellen. Regression: Originaldienst mit realem temporärem Root, gezielter unlink-I/Ofehler, DELETEfehler ohne Prozessende und später erfolgreicher Retry; keine Änderung Rechteprüfung.

Original-Serviceprobe: [prism-ingestion-service-error-probe.mjs](../evidence/prism-ingestion-service-error-probe.mjs), [Ausgabe](../evidence/prism-ingestion-service-error-probe.txt). Tatsächlicher temporärer Dateisystemfehler, kein ersetztes unlink und kein Mockservice.
