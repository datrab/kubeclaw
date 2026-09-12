# kubeclaw.wait-store

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1–2. Verantwortung, Registrierung und Gegenstellen

Vollständig gelesen: `skills/common/plugins/wait-store/src/adapter.ts`, Manifest,
Config-Schema, README, Paketdatei und beide Tests. `waits` bietet `signal.wait`,
ausgeliefert in den im Inventar zugeordneten Runtime-Rollen. Core startet den
gewählten Provider über `execution/adapter-startup.ts` nach Configvalidierung.
`human-approval/src/stage.ts` erzeugt create mit signal.wait-Ressource,
signalType/authorizedIssuer/expiresAt/request, prüft Antwort mit validateCreatedWait,
veröffentlicht operator.request und liefert pending mit wait zurück.

Adapter prüft genaue Schlüssel, v2-Identität bei Replay, opaque Wait-/Issuer-IDs,
Signal-Namespace, RFC3339-Kalender/Clock, JSON-request mit Tiefenlimit 64.
Create erzeugt `wait:` + SHA256(idempotencyKey), unabhängig vom Ressourcenpfad.
Antwort `{created, wait}`; internes read liefert alle waits. Nicht der Store,
sondern Core `engine-snapshots.ts:validateSignal` prüft Issuertyp/ID, Signaltyp,
Wait-ID, Ausgabezeit und Ablauf beim Resume. Keine Lifecycle-Autorität im Adapter.

## 3–4. Zustand, Commit und Fehler

`wait-value.v1` liegt im Stream `waits/all` des gemeinsamen Recordstores;
Leser bildet `wait-record.v2` mit Backend-Commitzeit und validiert die fachlichen
Daten erneut. Vorprüfung dedupliziert; atomarer Backendappend prüft unter Lock
nochmals Payload-Digest. Identische parallele Requests erzeugen genau einen
Record. Abweichungen werden WAIT_IDEMPOTENCY_CONFLICT, übergroße Payloads
WAIT_ENTRY_SIZE_EXCEEDED. Ungültige persistierte Records scheitern geschlossen.
Readiness prüft Backendintegrität, fachliche Waitvalidierung erst invoke/read.

Backend liefert JSON-Snapshot/Clone und fsynct 0600-Tempdatei vor rename, danach
Verzeichnis. Elternverzeichnisse werden dauerhaft angelegt. Commitbestätigung erst
nach fsync. Dateivolumen/ENOSPC propagiert, keine Teilappend-JSON-Datei. Flock ist
kernelbasiert, 5-s-Akquisefrist, kein unsicheres PID-/Namespace-Stale-Reclaim.

## 5–7. Abbruch, Neustart, mehrstufige Grenzen und Autorisierung

Fence/Signal werden vor und nach dem ersten read geprüft. Backendqueue und flock
nach dieser zweiten Prüfung nehmen kein AbortSignal; später Commit weiterhin
möglich. Vertrag dazu offen, kein unbelegter Bypassbefund. Neustart und verlorenes
ACK deduplizieren denselben Key; erzeugte Wait-ID bleibt deterministisch. Kein
adapter.receipt(): eigenes Persistenz-ACK ist nicht gleich äußerem Effect-Receipt.
Nach Storecommit, vor Core-Waitprojektion kann ein dauerhaftes, noch nicht
fortsetzbares Intent existieren; [nova.execution](nova.execution.md), PCR-EXEC-001/002
besitzen die Recovery-Projektionsdefekte. Signalautorität stammt aus Core-Grants,
`authorization.ts:signal` prüft Signaltyp und Issuer-ID. Store selbst kennt keine
Tenants; internes read ist global, kein öffentlich autorisiertes Resume-API.
Root muss geschützt bleiben; SHA256 allein authentifiziert keine fremden Dateien.

## 8–9. Grenzen und Vereinfachung

Default 1 MiB pro Wert, 100000 Records und 256 MiB gesamter Store. Lesen prüft den
kompletten Store; create liest ihn danach erneut unter Lock und schreibt ihn neu.
Keine Löschung abgelaufener/resumierter Waits: Lebenszyklus liegt im Core,
Retention muss Idempotenz-/Recoveryfenster erhalten (gemeinsame PCR-OBS-002).
JSON-Prüfung every/Object.entries besitzt kein Knotenlimit, Sparsearrays und Getter
werden nicht strikt ausgeschlossen; SDK-Canonicalisierung erbt PCR-SDK-001,
Backendserializer ist strenger. Bytebudget schützt nicht den vorherigen Aufwand.
Spätere Vereinfachung: atomare fachliche append-or-existing-Grenze statt doppeltem
Read; kein zweites unabhängiges Wait-Lifecycle-System hinzufügen.

## 10. Tests

Original `node tests/live-function.test.ts && node tests/package-boundary.test.mjs`
im Paketverzeichnis bestanden, Node 24.19.0. Echter FileDurableRecordStore, 10
parallele identische Aufrufe, 256-Zeichen-Key, 0600-Modus, Konflikt, Datums-/Issuer-
Fehler, persistierte fachliche Manipulation mit neuem Digest. Cancellation- und
Fence-nach-Read-Tests verwenden Getter/Test-Fence; beweisen keine echte Lease-
Revocation während flock. Boundary prüft Quelltext inklusive fsync-Vorkommen,
kein Powerloss. Keine eigene Prozessabbruch-/Resume-E2E-Ausführung.

## 11–12. Dokumentation und Bewertung

README trennt Intentpersistenz korrekt von Signalautorität/Resume; Katalog ist
Registrierungsdokumentation. Unvollständig: globales read, unbegrenzte Aufbewahrung,
Tools/Dateisystemabhängigkeiten, Abbruch nach Queueeintritt und Receiptgrenze.
Keine neue eigene Defekt-ID. Offen bleibt ein echter Store/Core-Präfixtest mit
Prozessverlust, nicht nur endgültiger Waitzustand. RFC3339-Leap-Second-Akzeptanz
und Date.parse beim Core-Resume sollten gemeinsam verifiziert werden, bevor
vollständige Zeitsemantik behauptet wird.
