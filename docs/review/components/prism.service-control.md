# prism.service-control — Prism Control HTTP-Dienst

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Vollständig `skills/prism/server/control.ts:1–1158`, Storage/Corpus/Session/Worker-Gegenstellen und ursprüngliche Modul-/Servicetestzuordnungen gelesen. HTTP-Service aus Prism-Servicechart; keine funktionalen Änderungen oder Clusterläufe.

## Nachgewiesener Aufrufpfad

runWorker persistiert Eingabe, baut Attempt mit Profile/Claim/Digest und hält
während Remote-Fetch eine PostgreSQL-Transaktion mit Advisory-Lock auf der
Idempotenzkennung. Vorheriger request_digest muss zum erneuten Input passen;
vorhandenes Ergebnis wird aus der Datenbank rehydriert. Neues Ergebnis wird erst
nach Worker-Antwort gespeichert und committed. Fehler rollt zurück. Fetch hat
hier kein Timeout/AbortSignal. Nach externer Ausführung und Rollback kann erneuter
Aufruf neue Attempt-/Execution-IDs erzeugen: Enginecache schützt nur die neue executionId im selben Prozess; identische CASbytes deduplizieren, externe Arbeit kann wiederholt werden.

## PCR-PRISM-CONTROL-001 — Worker-Ergebnis ohne Envelope-Bindung angenommen

- Schweregrad: mittel; falsches oder falsch korreliertes completed-Ergebnis kann
  als Antwort auf den aktuellen Auftrag gespeichert werden. Kein Nachweis einer
  ausnutzbaren Netzwerkinjektion; Transportauthentisierung bleibt eigene Grenze.
- Evidenzklasse: nachgewiesene Validierungslücke im Code-Trace; Laufzeit-Negativtest
  gegen Originaldienste noch offen.
- Belege: `control.ts:198–210` castet JSON auf ein Partial-Shape, prüft ausschließlich
  state und liest Specialist-Werte/Evidence. Es fehlen Worker-Vertragsvalidierung,
  Result-Digest und Vergleich mit der zuvor erzeugten Attempt-/Claim-/Worker-ID.
  `:210–215` persistiert unter der aktuellen Idempotenzkennung. Worker sendet den
  vollständigen Vertrag (`worker.ts:157–158`); Contract-Helfer existieren, sind
  am Empfänger aber nicht aufgerufen.
- Auslöser: authentisierter Worker liefert ein syntaktisch gültiges completed-
  Objekt zu anderem Attempt oder mit verändertem neutralem Result-Digest.
- Auswirkung: neutrale Ergebnisintegrität/Korrelation wird vor Commit nicht
  geprüft. Inhaltliche Folgeprüfungen ersetzen diesen Identitätsvergleich nicht.
- Ursachenbehebung: eine gemeinsame Eingangsgrenze aus Schema-/Digestprüfung,
  vollständiger Envelope-Bindung und operation-spezifischem Result-Schema nutzen;
  erst danach Evidenz importieren und DB-Result committen.
- Verifikation: echten Control-Handler mit realem Postgres und kontrolliertem
  authentisierten Transport exercisen; vollständig gültiges Worker-Ergebnis
  eines anderen echten Attempts zurückspielen und Ablehnung vor Persistenz
  verlangen. Nicht nur einen Mock-Parser testen. Anschließend gültigen Pfad prüfen.

Weitere Befunde werden nicht dupliziert: fehlender Logs-Store und kumulative
CPU-Messung gehören [prism.service-worker](prism.service-worker.md).
Dokumentationsstatus vorhanden und unvollständig; Vollabgleich unten.

## 1–3. Vollständige Routen und Commitgrenzen

Session-Exchange setzt sichere Cookies/CSRF. Interne CASroute verlangt Worker/Control-SPIFFE oder Secret und prüft Payload gegen URLdigest, allerdings erst nach put. Dispatch verlangt erlaubten SPIFFEpeer oder HMAC(key.raw), validates designRequest, lockt Projekt für Active-request-Revisionswechsel; project-upsert davor eigener Commit. Approvaldispatch liest exakt zum Projekt/Approval gehörige Baseline und bindet Architektur. Agent-Designsets verlangen SPIFFE, drei valide vielfältige Dokumente und aktive Requestbindung; Revision prüft Projektowner/expectedRevision und CAS. Alle restlichen Routen verlangen gültige Session/CSRF, aber roles wird nicht durchgesetzt und Projekte bilden gemeinsamen Studiobestand.

Projects/Brief/Documents/History/Restore/Operations führen zur RevisionRepository-Grenze. Directions GET bindet aktive Request; POST sendet Agentauftrag. Select/Feedback schreiben Directionzustand und danach Preferenceevent getrennt (002). Enginegenerate geht sofort an Agent (alter nachfolgender generated-document Persistenzblock ist unerreichbarer Altpfad); andere Operationen senden historische baserevision ans Worker. Approvals speichern vom Nutzer gelieferten designDigest; Baseline prüft diesen später gegen tatsächliche aktuelle Revision und akzeptierte Warningliste. Baseline liest Approval/Request/Direction, erzeugt sämtliche View/State/Viewportcaptures, Quality/Specification/Criteria/Checksums/Manifest, legt CASarchiv ab und schreibt Baselinezeile. Artefaktupload prüft kanonisches Base64/6MB; Download verifiziert CASdigest. Corpusacquisition bindet Quellenbytes, hält Revision restricted bis Cleanup, dann Activation; Corpus-Pooltransaktionsfehler gehört PCR-PRISM-CORPUS-001. Preferences POST bindet userId an Session, GET filtert subject/project und projiziert.

## 4–6. Dispositionen, Deadline, Wiederaufnahme

Workererrored/cancelled/etc werden zu geworfenem Fehler und generell422, nur SyntaxError400; kein strukturierter Retry-/Unknownstatus. runWorker hält DBlock/Verbindung während Remote-Operation plus Evidencehydrate, ohne Fetch-/Statementdeadline. HTTPdisconnect beendet keinen Worker. Claim600s, Operation300s/Cleanup10s erlauben nur nominell Reserve; ungebundene Upload-/Logs-/Fetchphasen garantieren keinen Abschluss darin (Worker-003). DBresultcommit nach Hydration schützt ACK-Replay; verlorenener Commit-ACK kann nächsten Request gespeichertes Result liefern. Kein genereller Requestjournal für Agent/Directions/Approvals/Baseline.

Relevante Crashpräfixe per Code-Trace, kein echter SIGKILL: Directionupdate vor Event → Zustand ohne Evidence (002); Baseline-CAS vor DB → orphan, Wiederholung kann Workerresult wiederverwenden; DB-Baseline vor HTTPACK → reused-Lookup; Corpus restricted vor Cleanup/Activation → bis erneutem Request nicht sichtbar. Baseline liest Approval/aktive Architektur vor langen Renderphasen ohne finale Transaktions-Revalidierung: Architekturwechsel während Render bleibt offene Racefrage; Dispatch filtert später aktuelle Architektur und verhindert dadurch nicht automatisch jede bereits gespeicherte stale-Baseline. Kein positiver Gesamt-Recoverybeweis.

## 7–9. Vertrauensgrenzen, Limits, Architektur

SPIFFE erwartet korrekte Loopbackproxy-Herkunft, Studio erwartet gesäuberte Tailscaleheader. Gemeinsame Nutzerbibliothek ist keine projektisolierte ACL. Artifactbearer erlaubt gemeinsame interne CASfläche, keine attemptbezogene Ownership. Workerresultbindinglücke001 bleibt trotz Digestprüfung einzelner Evidencebytes. Digest der Baselinechecksums sortiert mit localeCompare wie Vertrag; Sprach-/Localegrenzen aus contract.prism gelten. Nicht-JSON-Eingaben scheitern am HTTPparser; keine zusätzliche Depth-/Knotenquote vor vollständiger Serialisierung im Dienst. Bodylimits 2MB, Evidence128MiB, Assets6MB; Summe aller Captures/Text/Base64archive im Speicher ohne Gesamtbudget. Postgrespool und CAS benötigen Betriebsquoten, Aufbewahrung/Orphanscanner fehlen. SIGTERM schließt Server dann Pool, ohne harte Deadline für laufende Fetches. Monolithische1158Zeilen vermischen Auth/Routing/Publikationssaga; dauerhafte Vereinfachung: gemeinsame Transaktions-/Resultvalidatorgrenzen, explizite persistierte Abschlusszustände und Entfernung unerreichbaren Generationzweigs.

## 10–11. Testbelege und Dokumentation

Original Session/Engine/Storagegruppe13/13 bestanden; weitere Modulgruppe siehe [prism-reviewed-modules-tests.txt](../evidence/prism-reviewed-modules-tests.txt). Kein darin gestarteter Original-Control mit echtem Postgres/Worker/Proxy; PGlitefälle/SQLstrings sind keine HTTPintegration. [prism-service-review-probe.mjs](../evidence/prism-service-review-probe.mjs) und .txt reproduzieren UUID-Ablehnung mit Originalmigration und echter eingebetteter SQLengine. Fehlend: Original-Service mit PGpool, drei Generationen→Select→Publish, Claimtimeout, ACK-Verlust, paralleler Architekturwechsel. Implementationplan Phase3/5/6 und completion-status beschreiben vollständige Persistenz/Präferenzen/Publikation;002 widerspricht erfolgreichem Directionfeedback konkret, Worker-001 verhindert normale deterministische Completion. Nicht ausgeführte Livechecks bleiben offen; keine CI/Deploymentanforderung.

## 12. Zusätzlicher Befund

### PCR-PRISM-CONTROL-002 — Directionevent-ID verletzt UUID-Spalte nach Zustandscommit

- **Hoch; Evidenzklasse: nachgewiesener Defekt.** control.ts:504,552 erstellt `event-${randomBytes(12).toString("hex")}`, Inserts :519–522/:567–578 senden diese ID an `prism.preference_event.id`; migrations/001_prism.sql definiert diese als uuid. PGliteprobe bestätigt `invalid input syntax for type uuid` für exakt diese Form; kein voller HTTPfluss behauptet.
- **Auslöser/Ablauf:** Select einer vorgeschlagenen Direction oder Feedback (auch liked/disliked) → Eventinsert scheitert immer. Select/Reject haben davor per pool.query Directionzustand bereits committed. API antwortet422; Selectretry findet keine proposed Direction mehr, Preferencebeleg fehlt dauerhaft. Auch /v1/preferences erlaubt schema-konforme nicht-UUID-EventIDs.
- **Ursache/Behebung:** Wire-eventId und SQLid wurden ohne passenden Persistenzvertrag gleichgesetzt; zusätzlich fehlt atomarer Direction-/Eventcommit. UUID als interne Zeilen-ID getrennt von eindeutigem Wire-eventId oder SQLtyp dem Vertrag angleichen; Directionwechsel/Event in gemeinsamer Transaktion mit Replaykennung.
- **Regression:** Original-Control + echter temporärer Postgres, Select und vier Feedbackaktionen mit gültiger Session durchführen;200/201 plus konsistente Direction/Eventzeile. Injizierter DBfehler vor Event muss Directionrollback bewirken; verlorenes ACK muss wiederholbar dieselbe Entscheidung liefern.

Ausführungsprotokoll der ersten Testgruppe: [prism-core-review-tests.txt](../evidence/prism-core-review-tests.txt) (aus Originalausgabe transkribierte Zusammenfassung, kein nachträglich erzeugtes TAP).

Direkte Probeausgabe: [prism-service-review-probe.txt](../evidence/prism-service-review-probe.txt).
