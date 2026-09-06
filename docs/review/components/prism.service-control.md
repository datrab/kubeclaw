# prism.service-control — Prism Control HTTP-Dienst

Review-Status: teilweise geprüft. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Untersucht: runWorker (`skills/prism/server/control.ts:142–226`), Worker-Erzeuger
`engine/worker-envelope.ts`, Worker-HTTP-Annahme/Abschluss in `server/worker.ts`.
Alle anderen Control-Routen, vollständige Hydratisierung, Authentisierung,
Datenbanktransaktionen, Publish-/Approval-/Design-Abläufe und Tests sind offen.

## Nachgewiesener Aufrufpfad

runWorker persistiert Eingabe, baut Attempt mit Profile/Claim/Digest und hält
während Remote-Fetch eine PostgreSQL-Transaktion mit Advisory-Lock auf der
Idempotenzkennung. Vorheriger request_digest muss zum erneuten Input passen;
vorhandenes Ergebnis wird aus der Datenbank rehydriert. Neues Ergebnis wird erst
nach Worker-Antwort gespeichert und committed. Fehler rollt zurück. Fetch hat
hier kein Timeout/AbortSignal. Nach externer Ausführung und Rollback kann erneuter
Aufruf neue Attempt-/Execution-IDs erzeugen: externe Idempotenz/Replay muss noch
vollständig gegen Engine und Uploads verfolgt werden.

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
Dokumentationsstatus unvollständig; vollständiger Abgleich erst nach allen Routen.
