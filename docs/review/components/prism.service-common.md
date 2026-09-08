# prism.service-common — interne Auth, Cookies und Datenbankbootstrap

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1–3. Umfang, Verwendung, Verträge

Vollständig `skills/prism/server/internal-auth.ts`, `proxy-headers.ts`, `bootstrap-database.ts`, `migrate.ts`, internal-auth.test.mts und studio-proxy.test.mts gelesen. Control signiert Workerrequests; Worker prüft HMAC mit PostgresNonceStore. Chart jobs.yaml startet Bootstrap als init und Migration als Job. Studioproxy verwendet Cookiehelper. HMAC bindet timestamp.nonce.sha256(body), Zeitfenster±5min, 32hex-Nonce/64hex-Signatur, timingSafeEqual. Nonceconsumer löscht höchstens1000 abgelaufene Zeilen und insertiert audience/digest atomar mit Uniqueconstraint. Cookiehelper entfernt length/encoding/set-cookie aus gewöhnlichen Headers und liefert getSetCookie-Liste getrennt.

## 4–6. Zustand, Fehler, Wiederaufnahme

Nonceinsert ist Commitpunkt für Annahme, vor Workerausführung; Replays nach fehlgeschlagener Operation müssen neue Transportnonce verwenden. Replica-/Restartschutz beruht auf gemeinsamem DBbestand, nicht RAM. Cleanup nutzt DB-now, Verify caller-now: Uhren-/exakte Ablaufkante als offene Betriebsfrage. Signatur bindet audience nicht kryptographisch, aber Service verwendet gemeinsamen festen Zweck prism-worker und Noncekey. Bootstrap rotiert drei Rollenpasswörter, legt Extension/Schema/Grants an, bis60 Retries nur für Netz-/DB-startcodes; kein gesamtes DDLtransaction, Wiederanlauf reconciliert vorhandene Rollen/Grants. CREATE-ROLE race bei gleichzeitigem Bootstrap bleibt mögliche Deploymentserialisierungsfrage. Migration pinnt Verbindung/Advisorylock, gehört storage. Beide CLI enden Pool im finally. Bootstrapconnectiontimeout5s, Statement-/Gesamtzeit nicht explizit begrenzt.

## 7–9. Vertrauen, Ressourcen, Architektur

Feste Rollennamen, Passwortliteral verdoppelt Quotes; keine Secretwerte in Review. Adminrechte werden nur für Bootstrap erwartet; Runtime/Migrator getrennt. Bootstrap vergibt UPDATE/DELETE auf alle Runtime-Tabellen: immutable revisions ist APIkonvention, keine DB-Rechtegarantie. Noncecleanup begrenzt pro Request Arbeit, keine Obergrenze aktiver Nonces/Requestkapazität; DBausfall schließt Workerannahme mit Fehler. Kein eigener Prozessbaum/Dateireplay. Cookiehelper bewahrt mehrere Cookies korrekt, keine eigene Sessionauth. Signatur-/Noncefunktion ist kurz und sinnvoll getrennt; ein einheitlicher signierter Requestvertrag sollte später Methode/Pfad/audience ausdrücklich definieren, falls weitere Empfänger hinzukommen.

## 10–12. Tests, Dokumentation, Ergebnis

Originaltests in [prism-reviewed-modules-tests.txt](../evidence/prism-reviewed-modules-tests.txt): HMAC/Time/Bodyreplay nutzt kontrolliertes Set-Nonce-Doppel; zweiter nutzt Originalmigration/PGlite und zwei NonceStoreinstanzen, keine echten Replica-/DBprozessneustarts. Headerfall prüft beide Set-Cookies mit echten Headers. Bootstrap/Migration-CLI nicht gestartet: benötigt administrative reale DB und würde Rollen verändern; keine Deployments. Chartcommandzuordnung ist Code-Trace, keine Betriebsprüfung. Implementationtraceability/Plan vorhanden, eigene Service-common-Doku fehlt; Dokumentationsstatus unvollständig. Keine neue nachgewiesene Defekt-ID in diesen Helfern. Nächste Verifikation: echter temporärer Postgres mit Runtime-/Migratorrollen, konkurrierende Nonceannahme/neustart und Bootstrap nach jedem unterbrochenen DDLpräfix.
