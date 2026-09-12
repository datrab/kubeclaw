# prism.extension — OpenClaw-Tools für Designcommits

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1–3. Registrierung, Schnittstellen, Zustand

Vollständig `skills/prism/openclaw-plugin/index.mjs`, index.test.mjs, openclaw.plugin.json, package.json und README gelesen. Manifest kubeclaw-prism onStartup nennt zwei Tools/codingprofile. register registriert prism_create_design_set und prism_apply_revision; keine Pipeline-Stepregistrierung. Bridgeprompts fordern genau diese Tools. Set verlangt drei Key/Title/Summary/Documenteinträge; Revision project/document/expectedRevision/instruction/Document. Documentschema absichtlich permissiv object, vollständige Schema-/Projekt-/CASvalidierung beim Control /v1/agent/design-sets und /v1/agent/revisions. Extension postet JSON zu config.controlUrl/env/default127.0.0.1:28080, liefert text(JSON) und details. Keine eigene DB oder Commitautorität; HTTP2xx von Control ist Bestätigung.

## 4–6. Fehler, Retry, Restart

Responsejsonfehler werden Ersatzerrorobjekt, nicht-2xx wirft. Bei2xx mit ungültigem JSON wird errorobjekt dennoch als erfolgreiches Toolresult gegeben; tatsächlicher Control liefert JSON, daher offene Robustheitsfrage, kein bestätigter aktueller Erfolgsfehler. Fetch hat kein Abort/Timeout/Toolcancellationsignal. Verlorenes AntwortACK lässt Ausgang ungewiss. Setreplay kann Repository anhand identischer Dokumentdigests als already-created erkennen, Revisionretry hat nur expectedRevision und wirft nach bereits erfolgtem Commit; keine durchgehende Toolaufruf-ID als Idempotenzkennung. Neustart hat keinen lokalen Zustand, nötige Reconciliation liegt Bridge/Control.

## 7–9. Vertrauen, Ressourcen und Architektur

Kein Bearerheader: Agenttools funktionieren im Control nur mit SPIFFE, lokaler Proxy trägt Identität. URL wird vom Operator konfiguriert, keine eigene Host-/TLSallowlist; Trust darf nicht aus Toolschema abgeleitet werden. Toolargs können große Dokumente enthalten; JSON.stringify/Responsejson komplett gepuffert, erst Controlbody2MB begrenzt Wiregröße. Keine Retention/Prozesshandles im Plugin. OpenClaw hat alleinige Aktivierungs-/Aufruf-/Modellverantwortung. Dauerhaft gemeinsame engere Dokument-/Resultschemagrenze, Abbruch und wiederholbare Commit-ID statt zusätzlicher blindes Fetchretry.

## 10–12. Tests, Dokumentation, Ergebnis

`node --test skills/prism/openclaw-plugin/index.test.mjs`:1/1 bestanden, [prism-extension-tests.txt](../evidence/prism-extension-tests.txt). Test zeichnet registerTool auf, prüft Namen/exakt drei/required Felder; execute/post, echte OpenClawregistrierung, SPIFFE und Controlcommit nicht ausgeführt. README/Plugin-Katalog/Workflows vorhanden; Formulierung „validated request“ beschreibt vor allem Downstreamvalidierung, Timeout-/Unknownpolicy fehlt. Dokumentationsstatus vorhanden und unvollständig. Kein neuer unabhängiger Defekt-ID; verlorene accepted Jobs/Sessionidentitäten gehören prism.service-agent-bridge, Revision-/SQLidentität Control. Nächste Verifikation: Original-OpenClawtool mit echtem Control/PG/Proxy, gültiges/ungültiges Dokument, fremdes Projekt, verlorenes Commit-ACK und Abbruch; nicht nur Registrierungsfixture.
