# kubeclaw.playwright

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Schema: Revision 5. Teststatus: bestanden (Reportersemantik); blockiert (Browserlauf). Dokumentationsstatus: vorhanden / unvollständig.

## 1. Verantwortung, Registrierung und tatsächliche Nutzung

Auslieferung über `packaging/runtime/roles/buster.json`; Manifest `plugin.json` registriert den unten genannten Vertrag. Nova `skills/nova/core/test-gates/resolver.ts:538–580` wählt anhand `uses`, prüft Kind, löst Konfiguration mit Schema-Defaults und pinnt Paket/Schema. Buster `runner.ts:1191–1250` lädt und ruft aus; `provider-loader.ts:49–89,151–180,382–389` kopiert digestgeprüft ins Versuchssnapshot und startet den Sandboxprozess; `provider-child.mjs:37–66` importiert Factory und ruft `execute`. Alle Engine-Dateien liegen in `skills/buster/engine/test-gates/`. Vertrag `kubeclaw.playwright@1`, Registration `playwright`, Capability `browser.playwright`, retrySafe=false.

## 2. Eingaben, Ausgaben und Gegenstellen

`src/provider.js:1–29,62–93` prüft Repository/Projekt/configpfade, Zielorigin und typed Inputs. Vollständiger Workerlimit-Satz wird an `browser-playwright-runtime.ts:102–119` gesendet und mit Operatorlimits geklemmt. Gegenstelle erzeugt Configoverlay und ruft echte Playwright-CLI mit JSONreporter/--max-failures=0 auf. Rückgabe bindet targetOrigin, Workerzahl und Ressourcenmodus; Provider leitet E2E-Resultat samt testCases ab, Runner validiert den speziellen E2Evertrag.

## 3. Zustand, Persistenz und Commit-Punkt

Projektkonfiguration wird als Code ausgeführt; Browseraktionen können mutieren. Capability erzeugt zufällige Overlay-/Report-/Attachmentpfade sowie gegebenenfalls node_modules-Link und gemeinsame Home/Tmp-Unterverzeichnisse. Provider kopiert Reports/Attachments mit wx/0600 in Evidence. Provider-Rückgabe ist kein Commit: Runner validiert Vertrag, Zählwerte und Evidenzdeklarationen, klont/friert das Result, kopiert ausgewählte Dateien ins Staging und führt erst danach Workerabschluss/Artefaktspeicherung aus (`runner.ts:1226–1320`). Keine eigene Journal-/fsync-/Waitprojektion; Recovery und Abschlusspräfixe gehören dem Runner/Remote-Dienst. Keine Behauptung einer bestandenen Crashkette.

## 4. Korrektheit und Fehlerdisposition

`assessPlaywrightReport:32–59` erhält expected/unexpected/flaky/skipped, tatsächliche Versuche, unexecuted und erforderliche Titel; null Tests wirft, all-skipped blocking schlägt fehl. Unerwarteter CLIexit ohne fachlich failed Tests wirft. Nicht-null Exit bei fachlichem Fehler bleibt failed. stdout/stderr und Cases werden erhalten; ungültige Attachments/fehlender Report lösen Fehler aus.

## 5. Timeout, Abbruch, Wiederholung und Parallelität

Workers werden an Provider- und Operatorprozesslimits geklemmt. Capability hat Gesamtexecutiontimer und Prozessgruppenterminierung mit SIGTERM/SIGKILL, cgroup oder ausdrücklich zugelassene Stichprobenmessung. stdout/stderr werden als Bytes gesammelt und erst vollständig als UTF-8 decodiert. Recovery/Oversizedresult nach CLIausführung ist nicht durch Requesttimeout allein abgedeckt; absolute Workerclaim-Grenze bleibt Enginefrage.

## 6. Neustart, Wiederaufnahme und ungewisser Ausgang

Keine Wiederaufnahme im Projekt-Testlauf; Testframework-eigene Retries bleiben Projektverhalten. Planretry unsicher und ausdrücklich zuzulassen. finally entfernt Overlay/Report/Output und selbst erzeugten Link, stellt chmod wieder her. Gemeinsame Home/Tmp bleiben im Workspace; harter Busterkill kann diese sowie Overlays hinterlassen. Keine Exactly-once-Zusage für Browseraktionen.

## 7. Vertrauensgrenzen und Evidenzherkunft

Der Projektinhalt ist untrusted. Planidentität und Digests kommen vom Resolver; Capability-Rechte werden im Runnerkontext geprüft, die Originalinvoker kontrollieren Ziel/Operation. Provider-Sandbox erhält Repository-Leserechte, versuchsbezogene Scratch-/Evidenzschreibrechte und ausdrücklich freigegebene Artefaktpfade. Eine echte HTTP-Antwort beweist Verhalten des adressierten Testservers, keine zusätzliche Identität außerhalb der festgelegten Origin-/Fixtureauthority. Projectconfig/Testcode sind untrusted; Capability setzt TCP-Port-Sandbox auf exakten Proxy, bindet zulässige Zielports und kann separate UID/cgroup erzwingen. Reportingdaten kommen aus projektkontrolliertem Runner; kryptografische Resultbindung beweist Transportherkunft, nicht unabhängige Wahrheit der Projektassertionen.

## 8. Ressourcen, Aufräumen und voller Speicher

Capability begrenzt Prozesse/Memory/CPU/Output/Result/Artifacts, Provider nochmals Gesamtevidencebytes/files. Report-/Attachmentdateien werden in Invoker vor nachträglicher Byteprüfung vollständig gelesen (`browser-playwright-runtime.ts:109–117`); Herkunft dieser Allokation außerhalb Providerlimits siehe PCR-BUSTER-ENGINE-001. Rekursive Reporttraversierung ohne eigenen Tiefenzähler; Runnerinput ist zwar Bytebegrenzung, kein vorheriger Tiefenschutz. ENOSPC wirft und finally versucht Cleanup.

## 9. Architektur und Vereinfachung

Provider sollte Reportersemantik behalten, Execution/Isolation bleiben Runtime. Die kleine assessPlaywrightReport-Funktion erlaubt echte Reportersemantiktests ohne Browser. Verdichtete Runtimeeinzeiler erschweren Review insbesondere der Setup-/Cleanup-/Ressourcengrenzen; kein funktionaler Umbau im Review.

## 10. Untersuchte und ausgeführte Tests

Original `node skills/buster/plugins/playwright/tests/live-function.test.ts` blockiert bei PLAYWRIGHT_TEST_BROWSER_PATH_REQUIRED; ganzer Test plus fixtureconfig/spec gelesen (echter Browser, Retry, Skip, Proxykontakt, Processlimit, Cancel, Pfad). Original `node --test tests/verification/reliability/provider-completion.test.mjs` bestanden: 1 Test führt reale CLI dreimal aus, prüft pass/fail/all-skipped und requiredTests; kein Browserfixtureersatz. Evidenz `../evidence/buster-provider-playwright-{original,report-original}.txt`. Direkter Originaltest umgeht Registry, Prozessloader und kompletten Workerabschluss; seine Aussage reicht ausdrücklich nur über die darin wirklich aufgerufenen Komponenten. Kein Deployment, kein CI-Neulauf, kein Ersatzmock. Tests außerhalb der unten genannten Programme sind nicht als ausgeführt gewertet.

## 11. Dokumentationsabgleich

Plugin-README geprüft: Auswahl/Retryverhalten kommt vom Projekt, --max-failures=0 und Report-/Outputvorgaben vom Worker; dieser Code entspricht dem Text. „total cancellation“/volle Prozessressourcen sind als Betriebskette nicht durch den bestandenen browserlosen Semantiktest bewiesen. Reales Runtimeverfahren bleibt blockiert.

## 12. Befunde und nächste Verifikation

Keine zusätzliche bestätigte Reporterdispositionabweichung. Nächster Schritt Originalbrowser-Test mit gebauter Sandbox, gepinnten Browsern/Env, danach cgroup-/Abbruch-/Cleanup- und große Reporterdatei-Versuche; Parent-Ressourcenbefund ist bei Engine zu beheben.

Keine zusätzlichen bestätigten komponenteneigenen Defekte im untersuchten Umfang. Die genannten Laufzeitlücken bleiben offen.
