# prism.control — Session-Helfer

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1–3. Verantwortung, Vertrag und Zustand

Vollständige `skills/prism/control/session.ts:1–20` gelesen. Control importiert exchangeTailscaleIdentity/verifySession (:23–25), mintet unter POST /v1/session (:261–282) und prüft Cookie in authenticated (:107–123). Auslieferung im Prism-Paket/Control-Image; keine eigene Registrierung. Tailscale-Login wird nur bei passendem nichtleerem Ingresssecret akzeptiert. HMAC-SHA256 bindet base64url-JSON mit user, audience=prism, roles und expiresAt; lokaler Mint gibt 15 Minuten und editor. Control setzt Secure/HttpOnly/SameSite-Strict-Sessioncookie und getrenntes CSRF-Cookie. Keine lokale Persistenz oder Mutation; Geheimnisrotation invalidiert Sessions.

## 4–6. Fehler, Wiederholung und Neustart

Signaturlänge wird vor timingSafeEqual geprüft; defektes JSON, Signatur und Ablauf werfen. Control übersetzt Fehler in 422, nicht 401. Token-Split erlaubt zusätzliche Segmente; Payloadvalidierung prüft keine vollständigen Typen (insbesondere fehlendes/nichtnumerisches expiresAt). Kein beobachteter Angriff daraus: eigener signierender Mint erzeugt gültige Zahlen und fremde Payloadänderung braucht das Secret. Härtung ist offene Eingangsvertragsfrage, kein erfundener Authbypass. Kein I/O-Timeout erforderlich, Laufzeit von Tokenlänge abhängig; Node-HTTP-Headerbudget liegt davor. Replay innerhalb Gültigkeit ist Sessionsemantik, kein Einmalnonce. Neustart funktioniert mit gleichem Secret und Uhr; keine Logout-/Revocationliste.

## 7–9. Vertrauen, Ressourcen und Architektur

Ingresssecret und Sessionsecret sind verschiedene Rollen; tatsächliche Proxyheader-Sanitisierung ist Betriebsannahme. Editorrolle wird mintiert, Control liest roles, setzt aber keine projektspezifische ACL durch: gegen den bewusst gemeinsamen Studiozugang bewerten, keine Multi-Tenant-Isolation behaupten. Kein Dateispeicher/Retention/Prozessbaum. Kurzer reiner Helfer; eine konkrete Session-Schemavalidierung und exakt zwei Tokenteile wären dauerhaft klarer als zusätzliche tolerante Parser. Tailscale-Identität nicht als Worker-/Agentautorität wiederverwenden.

## 10–12. Tests, Dokumentation, Ergebnis

`node --test skills/prism/tests/engine.test.mts skills/prism/tests/storage.test.mts skills/prism/tests/control.test.mts`: 13/13 bestanden; davon zwei Original-Sessiontests. Geprüft: untrusted ingress, Mint/Verify, editor, Signaturmanipulation, Ablauf. Reale Kryptofunktionen mit lokalen Testsecrets; kein echter Ingress-/Browser-/Cookiefluss. Weitere Gruppen: sieben Enginefälle und vier Storagefälle (darunter zwei SQL-Recording-Doubles, zwei PGlitefälle). Fehlend: Headerduplikate, Secretrotation, Uhrgrenzen und echte CSRF-Proxyrunde. Implementationplan Phase 3.5 beschreibt short-lived Session/CSRF zutreffend, aber keine Revocation-/ACLentscheidung; Dokumentationsstatus vorhanden und unvollständig. Keine neue nachgewiesene produktive Sicherheitsverletzung in diesem Helfer. Nächster Nachweis: Original-Control hinter tatsächlichem Proxy mit gefälschten Identityheaders und Cookie-CSRF-Negativfällen.
