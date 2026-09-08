# kubeclaw.network-http

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1–2. Verantwortung, Auswahl und Schnittstellen

Vollständig gelesen: `skills/common/plugins/network-http/src/adapter.ts`, Manifest,
Schema, README, Paketdatei und eigene Tests. `http` liefert network.http, keine
Downstream-Capability. Nova/Buster/Prism liefern Paket. Core AdapterStarter prüft
Configschema, provider selection und Grants; `authorization.ts:network` prüft
Origin. Adapter prüft zusätzlich genaue Origin-/Methoden-/Headerallowlists,
verbietet URL-Credentials und verfolgt Redirects nicht.

Sender runtime-dispatch `adapter.ts` baut POST, Idempotency-Key und HMAC; OpenClaw
`openclaw-session.ts:gateway` baut POST/Bearer/JSON. Beide nutzen confidential,
also keine geheimen Header im verschachtelten Effectjournal. Adapter liefert
status, beschränkte response.headers und body (JSON, Text oder null).
Generic Runtime-Empfänger prüft 2xx und Objektform, OpenClaw erwartet status 200
und validiert Toolfehler-Envelopes. HTTP-Statusfehler sind Exceptions, nicht
gewöhnliche `{status, body}`-Antworten. Keine eigene fachliche Resultatidentität.

## 3–4. Nebenwirkungen und Fehlerdisposition

Kein lokaler persistenter Zustand; externe Servermutation beginnt bei fetch.
Kein eigener receipt-/Idempotenzspeicher. request.idempotencyKey wird nicht
automatisch als HTTP-Header eingesetzt: Sender muss ihn explizit setzen und
Remote muss ihn durchsetzen. Netzwerkabbruch kann nach Remotecommit passieren.
HTTP-Fehler enthalten bis 1000 Zeichen fremden Bodytexts; Vertraulichkeit dieser
Fehler hängt am Core-confidential-Pfad, keine globale Inhaltsredaktion hier.
JSON-Parsefehler propagieren. Redirects und deklarierte Übergrößen früh abgelehnt;
unklare/chunked Responsegröße siehe PCR-NETWORK-001.

## 5–7. Deadline, Abbruch, Recovery und Sicherheit

fetch kombiniert Aufrufsignal und AbortSignal.timeout (Default 30 s); Timeout gilt
auch für Konsum des Responsebodys, dessen Fehler werden jedoch nicht normalisiert
(PCR-NETWORK-002). shutdown ist leer; produktiver Core-Wrapper kombiniert das
Lifecycle-Signal in laufende Invocations. Bei Direktgebrauch ohne Core bleiben
laufende Requests nach shutdown aktiv. Wiederholung kann eine Mutation duplizieren;
keine erfolgreiche Recovery ohne Remote-Idempotenz/Receipt behauptet.

Allowlist bindet Origin einschließlich Scheme/Port, nicht Ziel-IP nach DNSauflösung;
DNS/Proxy/Netzpolicy sind Betriebsannahmen. Operator darf private Origins explizit
erlauben. Header können explizit authorization umfassen; `connection: close` wird
erzwungen. Vertrauenswürdiger Adapter im Host, keine Benutzerautorisierung selbst.

## 8–9. Ressourcen und Vereinfachung

Default Request/Response jeweils 1 MiB. Requestlimit kommt nach JSON.stringify
(Getter/Zyklen/natives JSON-Verhalten und voriger Speicherverbrauch); keine eigene
Tiefen-/Knotenbegrenzung. Response arrayBuffer liest vollständig, siehe Befund.
Keine eigene Maximalparallelität; Agent-/Core-Lease begrenzt Aufrufleben, nicht
pauschal Zahl und Bytes aller parallelen Socketpuffer. Redirect-/Content-Length-
Ablehnung konsumiert/cancelt response.body nicht ausdrücklich; Cleanup ist dem
Fetch-/Timeoutpfad überlassen. Künftiger enger Streamreader kann Größenlimit,
Abortmapping und Reader-Cancel in einer Grenze vereinigen.

## 10. Tests und konkrete Evidenz

Original `node tests/live-function.test.ts && node tests/package-boundary.test.mjs`
im Paketverzeichnis: erster paralleler Lauf fehlgeschlagen mit NETWORK_TIMEOUT
beim ersten positiven Request (100-ms-Testdeadline). Isolierte unveränderte
Wiederholung bestanden. Echte Loopback-HTTP-Kommunikation, aber kontrollierter
Testserver, kein produktiver Endpoint. Prüft JSON/Text, POST-Header, Redirect,
deklarierte Übergröße, Timeout vor Headern, Allowlist und bereits abgebrochenes
Signal. Kein Bodytimeout-/chunked-Budgetnachweis darin; Boundarytest ist Regex.

Eigene Evidenz `node docs/review/evidence/capability-adapter-probes.mjs` nutzt
Originaladapter und echten lokalen HTTP-Server mit kontrollierter Chunkfolge:
bei 128-Byte-Maximum wurden alle 512 Byte gesendet, dann Größenfehler. Nach sofortigen
Headern und verzögertem Body resultiert `TimeoutError: The operation was aborted
due to timeout`, nicht NETWORK_TIMEOUT. Kein OOM absichtlich erzeugt; keine
produktive Netzwerk-/TLS-/Auth-Infrastruktur getestet.

## 11. Dokumentationsabweichung

README behauptet begrenzte Responsegröße und erhaltene Cancellation. Als harte
Ressourcengrenze bzw. stabile Fehlersemantik ist dies durch 001/002 widerlegt.
Katalog korrekt zu Manifest, zur Retry-/Remotecommitgrenze unvollständig.

## 12. Befunde

### PCR-NETWORK-001 — Responsebudget greift erst nach vollständigem Download

Schweregrad hoch: erlaubter Endpoint kann mit schneller chunked/komprimierter
Antwort beliebig mehr RAM als das konfigurierte Budget belegen und Hostverfügbarkeit
beeinträchtigen. Nachgewiesener Defekt, `src/adapter.ts:70–78 responseBody`:
Content-Length fehlt/ist klein, arrayBuffer allokiert vollständige Antwort,
erst danach Bytecheck. Reale 512/128-Byte-Probe oben belegt Reihenfolge, keinen OOM.
Ursachenbehebung: streaming/dekomprimierte Bytes zählen und Reader sofort beim
Überschreiten abbrechen; alle Vorabfehler schließen Body. Regression mit echter
chunked Antwort muss vor End-of-stream abbrechen und Spitzenpuffer begrenzen.

### PCR-NETWORK-002 — Bodytimeout verliert stabile Adapterfehlerdisposition

Schweregrad mittel: Retry-/Cancellation-Erkennung nach Fehlercode unterscheidet
sonst gleiche Timeouts abhängig vom Zeitpunkt der HTTP-Header. Nachgewiesener
Defekt, `src/adapter.ts:52–67 performRequest` versus `70–78 responseBody` und
`104–105 invoke`: Catch umfasst nur fetch bis Response, nicht arrayBuffer.
Auslöser sofortige Header, langsamer Body; echte Probe liefert nativen TimeoutError.
Ursachenbehebung: Timeout-/Signalzuordnung über gesamten Request inklusive Body;
Abbruchgrund getrennt bewahren, Reader schließen. Regression Timeout und aktiver
Abort jeweils vor Headern und mitten im Body mit identischen stabilen Codes.
