# kubeclaw.axe

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Schema: Revision 5. Teststatus: blockiert (Browser fehlt). Dokumentationsstatus: vorhanden / unvollständig.

## 1. Verantwortung, Registrierung und tatsächliche Nutzung

Auslieferung über `packaging/runtime/roles/buster.json`; Manifest `plugin.json` registriert den unten genannten Vertrag. Nova `skills/nova/core/test-gates/resolver.ts:538–580` wählt anhand `uses`, prüft Kind, löst Konfiguration mit Schema-Defaults und pinnt Paket/Schema. Buster `runner.ts:1191–1250` lädt und ruft aus; `provider-loader.ts:49–89,151–180,382–389` kopiert digestgeprüft ins Versuchssnapshot und startet den Sandboxprozess; `provider-child.mjs:37–66` importiert Factory und ruft `execute`. Alle Engine-Dateien liegen in `skills/buster/engine/test-gates/`. Vertrag `kubeclaw.axe@1`, Registration `axe`, Capability `browser.axe`, retrySafe=true.

## 2. Eingaben, Ausgaben und Gegenstellen

`src/provider.js:17–55` wählt Origin und Profile. Configschemas begrenzen Routes, Profile, Tags, Excludes und Acceptances; Customprofilefile wird realpath-geprüft. `execute:69–114` bildet Route×Profil und ruft `browser-axe-runtime.ts:140–249`. Dort Browserallowlist, Profilfelder/Viewport, Zielauthority, Antwort mit Axe-Objekten und Screenshots. Result zählt violation nodes und passes, incomplete separat; kein Reportadapter.

## 3. Zustand, Persistenz und Commit-Punkt

Scan fremder Seite, neue Browsercontexts, Screenshots und `axe-results.json`; keine Projektänderung. Provider-Rückgabe ist kein Commit: Runner validiert Vertrag, Zählwerte und Evidenzdeklarationen, klont/friert das Result, kopiert ausgewählte Dateien ins Staging und führt erst danach Workerabschluss/Artefaktspeicherung aus (`runner.ts:1226–1320`). Keine eigene Journal-/fsync-/Waitprojektion; Recovery und Abschlusspräfixe gehören dem Runner/Remote-Dienst. Keine Behauptung einer bestandenen Crashkette.

## 4. Korrektheit und Fehlerdisposition

Unakzeptierte Violationnodes schlagen fehl, exakt nach rule/route/selector und gültigem Datum akzeptierte Nodes gelten als passed; incomplete bleibt Info. Andere Fehler werfen. Responseversion/results geprüft, Einzelkombinationsidentität wird vom vertrauenswürdigen Invoker erwartet. Fehlende Profile/Viewporttypen werden spätestens dort abgelehnt; keine zusätzliche Antwortsignatur.

## 5. Timeout, Abbruch, Wiederholung und Parallelität

Provider sendet config.timeoutMs unabhängig von invocation.timeoutMs; der Worker bleibt absolute Obergrenze. Invoker setzt Deadline pro Kombination, startet Browser vorher, verwendet bounded parallelism und schließt Context/Browser in finally. Abort schließt bekannte Browser; Launchrennen und gesamtes Reaping sind keine lokal bestandenen Tests. Retry wiederholt Seitenbesuch; Seitenskripte können Nebenwirkungen auslösen.

## 6. Neustart, Wiederaufnahme und ungewisser Ausgang

Keine persistente Browser-/Acceptancezustände; Akzeptanzablauf benutzt aktuelle Uhrzeit. Neustart wiederholt Scan. Keine Durable-Cleanupregistrierung; Context-close schützt normalen Exit, nicht SIGKILL des Busterprozesses. Externes Seitenverhalten kann nach verlorenem Reply bereits stattgefunden haben.

## 7. Vertrauensgrenzen und Evidenzherkunft

Der Projektinhalt ist untrusted. Planidentität und Digests kommen vom Resolver; Capability-Rechte werden im Runnerkontext geprüft, die Originalinvoker kontrollieren Ziel/Operation. Provider-Sandbox erhält Repository-Leserechte, versuchsbezogene Scratch-/Evidenzschreibrechte und ausdrücklich freigegebene Artefaktpfade. Eine echte HTTP-Antwort beweist Verhalten des adressierten Testservers, keine zusätzliche Identität außerhalb der festgelegten Origin-/Fixtureauthority. `browser-axe-runtime.ts:186–218` sperrt Off-Origin-Subresources, verfolgt Redirects kontrolliert über route.fetch, erlaubt nur gleichoriginige WebSockets, entfernt WebRTC und blockiert Serviceworker via Contextoption. Herkunft der Akzeptanz ist Projektkonfiguration, kein unabhängiger Approvalbeweis.

## 8. Ressourcen, Aufräumen und voller Speicher

Providerdatei maximal 256 KiB nach Read. Operator begrenzt Kombinationen/Parallelität/Screenshotzahl und -bytes; Reportgröße zuletzt. Evidence wird vor Runnerstaging synchron geschrieben, ENOSPC führt zu execution error. Die Browserprozesse starten im Capability-Invoker des Buster-Elternprozesses, nicht unter dem isolierten Providerprozess. Dessen `resources()` misst sie nicht; siehe Eigentümerbefund PCR-BUSTER-ENGINE-001 in `buster.engine`. Keine Interpretation von `workerLimits` im Providerdetail als gemessener Verbrauch. Ergebnisbytegrenzen nach JSON.stringify schützen nicht vor der vorherigen Objekt-/PNGallokation.

## 9. Architektur und Vereinfachung

Browserauthority und Providerbewertung sinnvoll getrennt. Profile-/Endpointvalidatoren mehrfach kopiert; langfristig gemeinsamer kleiner validierter Vertrag besser als divergierende freie Objekte. Nicht per Mocktest eine vollständige Netzwerkisolation behaupten.

## 10. Untersuchte und ausgeführte Tests

`skills/buster/plugins/axe/tests/live-function.test.ts` vollständig gelesen und original gestartet: blockiert, Playwright Chromium/headless executable fehlt (Evidenz `../evidence/buster-provider-axe-original.txt`). Test wäre echter Chromium/Axe-Lauf mit pass/fail, Screenshots, akzeptierter/abgelaufener Ausnahme, HTTP-/Popup-/Redirect-/WS-/WebRTCfällen. Kein Firefox/WebKit-Lauf. Direkter Originaltest umgeht Registry, Prozessloader und kompletten Workerabschluss; seine Aussage reicht ausdrücklich nur über die darin wirklich aufgerufenen Komponenten. Kein Deployment, kein CI-Neulauf, kein Ersatzmock. Tests außerhalb der unten genannten Programme sind nicht als ausgeführt gewertet.

## 11. Dokumentationsabgleich

Plugin-README und `docs/architecture/pipeline-test-gate-a11y-security-model.md` gelesen: Ziel-/Profil-/WebRTC-/Serviceworkerregeln sind im Code nachvollziehbar. Die Aussage „Cancellation closes every launched browser“ ist für bereits in der Map vorhandene Instanzen implementiert; Launch-/Killnachweis fehlt. Endgültiger Drei-Browser-Produktionsnachweis bleibt laut Dokument selbst pending.

## 12. Befunde und nächste Verifikation

Kein zusätzlicher bewiesener Providerdefekt. PCR-BUSTER-ENGINE-001 quergelesen als Budgetgrenze. Nächste Verifikation: unveränderten Originaltest mit gepinnten Browsern ausführen; zusätzlich Abort während Launch und drei Engines mit tatsächlichem Prozessreaping messen.

Keine zusätzlichen bestätigten komponenteneigenen Defekte im untersuchten Umfang. Die genannten Laufzeitlücken bleiben offen.
