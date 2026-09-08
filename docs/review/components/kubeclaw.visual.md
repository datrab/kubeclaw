# kubeclaw.visual

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Schema: Revision 5. Teststatus: blockiert (Chromium fehlt). Dokumentationsstatus: vorhanden / veraltet (Upgradebindung).

## 1. Verantwortung, Registrierung und tatsächliche Nutzung

Auslieferung über `packaging/runtime/roles/buster.json`; Manifest `plugin.json` registriert den unten genannten Vertrag. Nova `skills/nova/core/test-gates/resolver.ts:538–580` wählt anhand `uses`, prüft Kind, löst Konfiguration mit Schema-Defaults und pinnt Paket/Schema. Buster `runner.ts:1191–1250` lädt und ruft aus; `provider-loader.ts:49–89,151–180,382–389` kopiert digestgeprüft ins Versuchssnapshot und startet den Sandboxprozess; `provider-child.mjs:37–66` importiert Factory und ruft `execute`. Alle Engine-Dateien liegen in `skills/buster/engine/test-gates/`. Vertrag `kubeclaw.visual@1`, Registration `visual`, Capability `browser.visual`, retrySafe=true.

## 2. Eingaben, Ausgaben und Gegenstellen

`src/provider.js:13–107` liest Profile/Manifest, maximal 128 Baselines und 64 ausgewählte Targets; bindet Bilddigest, Route, Profilname, Browserfamilie, Viewport/Pageconditions. capture RPC liefert PNG/digest/identitätsfelder; compare RPC an pixelmatch-v1 liefert Differenz. Provider prüft Felder/Digests und schreibt Baseline/current/difference + JSONreport. Browserversion fehlt in der akzeptierten Baselineidentität (PCR-VISUAL-001).

## 3. Zustand, Persistenz und Commit-Punkt

Keine Baselineänderung; lediglich Screenshots und versuchsbezogene Evidenz. Manifestdigest wird aus Quelldatei, bundledigest aus sortierten Bilddigests berechnet. Provider-Rückgabe ist kein Commit: Runner validiert Vertrag, Zählwerte und Evidenzdeklarationen, klont/friert das Result, kopiert ausgewählte Dateien ins Staging und führt erst danach Workerabschluss/Artefaktspeicherung aus (`runner.ts:1226–1320`). Keine eigene Journal-/fsync-/Waitprojektion; Recovery und Abschlusspräfixe gehören dem Runner/Remote-Dienst. Keine Behauptung einer bestandenen Crashkette.

## 4. Korrektheit und Fehlerdisposition

Missingfile, Digest-/Identitätsmismatch und Capabilityfehler werfen. strict/balanced Grenzen entscheiden Differenz; Unsicherheitsband fail-closed mit explizitem Finding. Dimensiondifferenz liefert Invoker 100%. Responseanzahl und ausgewählte IDs geprüft, Route/Viewport/Pageconditions/masks verglichen. Bilddigest allein beweist keine unveränderte Renderengine.

## 5. Timeout, Abbruch, Wiederholung und Parallelität

Capture hat einen Invoker-Gesamttimer einschließlich Launch und Zeitrest für goto/screenshot; Compare ist synchroner PNG/Pixelmatchlauf und nur vor Beginn signalgeprüft. Worker setzt Versuchsdeadline; finale Dateischreibschleife synchron. Bounded Captureparallelität und versuchsbezogene Evidenz, keine gemeinsame Baselineänderung.

## 6. Neustart, Wiederaufnahme und ungewisser Ausgang

Kein Capturecheckpoint, Neustart führt Vergleich erneut aus. Baselines bleiben Gitdaten. Cleanupfinally schließt bekannte Browser/Contexts; Kill während Launch oder synchronem Compare wurde nicht echt simuliert. Seitenskripte können unabhängig von ausschließlich lokalen Provideroutputs externe Aktionen erzeugen.

## 7. Vertrauensgrenzen und Evidenzherkunft

Der Projektinhalt ist untrusted. Planidentität und Digests kommen vom Resolver; Capability-Rechte werden im Runnerkontext geprüft, die Originalinvoker kontrollieren Ziel/Operation. Provider-Sandbox erhält Repository-Leserechte, versuchsbezogene Scratch-/Evidenzschreibrechte und ausdrücklich freigegebene Artefaktpfade. Eine echte HTTP-Antwort beweist Verhalten des adressierten Testservers, keine zusätzliche Identität außerhalb der festgelegten Origin-/Fixtureauthority. Invoker sperrt Off-Originanforderungen, WebSockets, Serviceworker, WebRTC. Captureantwort bindet Bildbytes an SHA-256; Manifest/Gitreview ist der Baselinetrustanker. Browserfamilie wird gebunden, tatsächliche Version nur im aktuellen Result berichtet.

## 8. Ressourcen, Aufräumen und voller Speicher

1 MiB JSONdateigrenze nach read, stat-/PNGdimensioncheck vor Baselineread/Decode, 16k Abmessungen und decoded-memorygrenzen. Capture begrenzt Screenshot-/Ergebnisbytes, Provider summiert alle Evidenzbytes vor Schreibbeginn. Dennoch werden pendingEvidence und compare-Buffers vor Summencheck gehalten. Die Browserprozesse starten im Capability-Invoker des Buster-Elternprozesses, nicht unter dem isolierten Providerprozess. Dessen `resources()` misst sie nicht; siehe Eigentümerbefund PCR-BUSTER-ENGINE-001 in `buster.engine`. Keine Interpretation von `workerLimits` im Providerdetail als gemessener Verbrauch. Ergebnisbytegrenzen nach JSON.stringify schützen nicht vor der vorherigen Objekt-/PNGallokation.

## 9. Architektur und Vereinfachung

Zweiteilige Capture-/Comparecapability vermeidet Pluginaddons, aber große Base64-Roundtrips vervielfachen Speicher. Baselineidentität sollte Renderengineversion einschließen; eine neue Version nur in Result zu dokumentieren erfüllt keine Bindung.

## 10. Untersuchte und ausgeführte Tests

`node skills/buster/plugins/visual/tests/live-function.test.ts`: blockiert bei fehlendem echten Chromium; Evidenz `../evidence/buster-provider-visual-original.txt`. Gelesen: echte Capturebaseline, PNGvergleich pass/fail/uncertain, Masken, Identitäts-/Digest-/Pfadfehler, Target-/Result-/Dateibudget, Cross-Origin/WS, große Bildhöhe, Timeout und Cancel. Kein Browserresult ersetzt. Direkter Originaltest umgeht Registry, Prozessloader und kompletten Workerabschluss; seine Aussage reicht ausdrücklich nur über die darin wirklich aufgerufenen Komponenten. Kein Deployment, kein CI-Neulauf, kein Ersatzmock. Tests außerhalb der unten genannten Programme sind nicht als ausgeführt gewertet.

## 11. Dokumentationsabgleich

README und `docs/architecture/pipeline-test-gate-visual-operator-guide.md` gelesen. Operatorguide verbietet stille Baselinewiederverwendung über Browserversionen; Manifestvalidator lässt browserVersion gar nicht zu. Die Implementierung kann die dokumentierte Upgradebedingung somit nicht erzwingen (PCR-VISUAL-001).

## 12. Befunde und nächste Verifikation

PCR-VISUAL-001: versionierte Browseridentität über Manifest→Invoker→Ergebnis durchziehen und Upgrade-Mismatchtest ergänzen. Reale Browser-/Redirect-/Launchabbruchnachweise nachholen; keine Aussage, dass fehlende Browser Tests fachlich bestanden hätten.

### PCR-VISUAL-001 — mittel: Baselineidentität bindet keine Browserversion

Nachgewiesene Vertrags-/Implementierungslücke im Quelltrace, kein ausgeführter Zweiversionen-Browsertest. `skills/buster/plugins/visual/src/provider.js:77–96` erlaubt Manifestfelder ohne browserVersion und prüft ausschließlich Familie/Viewport/Pageconditions; `:140–145,175–179` übernimmt aktuelle Browserversion erst nach Capture. `docs/architecture/pipeline-test-gate-visual-operator-guide.md`, Upgrade, untersagt stilles Wiederverwenden zwischen Versionen. Auslöser: Workerbrowserupgrade bei unverändertem Manifest; derselbe Vertrag bleibt akzeptiert und kann bei 0%-Differenz bestehen. Auswirkungen: fehlende reproduzierbare Baselinefreigabe und schwer erklärbare Renderabweichungen. Ursachenbehebung: versionierte Engine-/Renderidentität in Baseline und Gegenstellen prüfen, Migration explizit. Regression: alte Version im Manifest, neue im echten Capture muss vor Bewertung ablehnen; anschließende freigegebene Neubaseline zulassen.
