# kubeclaw.lighthouse

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Schema: Revision 5. Teststatus: blockiert (Chromium fehlt). Dokumentationsstatus: vorhanden / unvollständig.

## 1. Verantwortung, Registrierung und tatsächliche Nutzung

Auslieferung über `packaging/runtime/roles/buster.json`; Manifest `plugin.json` registriert den unten genannten Vertrag. Nova `skills/nova/core/test-gates/resolver.ts:538–580` wählt anhand `uses`, prüft Kind, löst Konfiguration mit Schema-Defaults und pinnt Paket/Schema. Buster `runner.ts:1191–1250` lädt und ruft aus; `provider-loader.ts:49–89,151–180,382–389` kopiert digestgeprüft ins Versuchssnapshot und startet den Sandboxprozess; `provider-child.mjs:37–66` importiert Factory und ruft `execute`. Alle Engine-Dateien liegen in `skills/buster/engine/test-gates/`. Vertrag `kubeclaw.lighthouse@1`, Registration `lighthouse`, Capability `browser.lighthouse`, retrySafe=true.

## 2. Eingaben, Ausgaben und Gegenstellen

Config wählt purpose performance/seo/best-practices, Routes, versionierte Settingsdatei, Profil, Budget und 1/3/5 Läufe. Provider `settings:30–71` prüft unbekannte Felder, Auflösung/Throttling/Budgetzahlen. Resolver erzwingt für blocking performance Budget (`resolver.ts:570–574`). Invoker `browser-lighthouse-runtime.ts:174–249` prüft Operation/audit und Origin, startet Chrome am exakten Proxy, liefert vollständige LHRs.

## 3. Zustand, Persistenz und Commit-Punkt

Browserbesuche und versuchsbezogene Reportdateien; Operatorprofil enthält keine Providercredentials. Einer der realen Median-Scoreberichte wird repräsentative Evidenz, kein synthetischer zusammengesetzter Bericht. Provider-Rückgabe ist kein Commit: Runner validiert Vertrag, Zählwerte und Evidenzdeklarationen, klont/friert das Result, kopiert ausgewählte Dateien ins Staging und führt erst danach Workerabschluss/Artefaktspeicherung aus (`runner.ts:1226–1320`). Keine eigene Journal-/fsync-/Waitprojektion; Recovery und Abschlusspräfixe gehören dem Runner/Remote-Dienst. Keine Behauptung einer bestandenen Crashkette.

## 4. Korrektheit und Fehlerdisposition

Performance prüft Score/LCP/CLS/TBT am vollständigen repräsentativen Report. SEO/Best-practices prüft failed audits, ignoriert informative/manual/notApplicable; audit error wirft. Zeitlich begrenzte Acceptances nur dort. Zahl der Capabilityreports muss Laufzahl entsprechen. Bei perf ohne Budget (advisory) kann total=0 mit passed ausgegeben werden; das ist Faktenmodus, Resolver sperrt es blocking.

## 5. Timeout, Abbruch, Wiederholung und Parallelität

Sequenzielle Original-Lighthouseaufrufe, je Lauf eigener timeoutMs. Browserlaunch/Proxysetup und mehrere Läufe addieren sich; invocation.timeoutMs nur über Workerobergrenze. Aborthandler killt Chrome, finally kill/proxy.close/rm. Ungewisser kill-Ausgang und Launchrennen sind nicht vom blockierten Live-Test abgedeckt. retrySafe=true bezieht sich auf Messvorgang, nicht garantierte Nebenwirkungsfreiheit einer Seite.

## 6. Neustart, Wiederaufnahme und ungewisser Ausgang

Kein persistent fortsetzbarer Medianlauf. Neustart verwirft Zwischensamples, nächster Versuch erhebt neu. Browserprofiledirectory wird normal entfernt; SIGKILL vor finally kann temporäre Daten hinterlassen. Keine Recoveryreceipts für externe Seitenaktionen.

## 7. Vertrauensgrenzen und Evidenzherkunft

Der Projektinhalt ist untrusted. Planidentität und Digests kommen vom Resolver; Capability-Rechte werden im Runnerkontext geprüft, die Originalinvoker kontrollieren Ziel/Operation. Provider-Sandbox erhält Repository-Leserechte, versuchsbezogene Scratch-/Evidenzschreibrechte und ausdrücklich freigegebene Artefaktpfade. Eine echte HTTP-Antwort beweist Verhalten des adressierten Testservers, keine zusätzliche Identität außerhalb der festgelegten Origin-/Fixtureauthority. `exactOriginProxy` und `assertAuditedOrigin` prüfen Netzwerkzugriff bzw. CDP-Evidenz. Browserhintergrundkontakte werden von auditierter Seite unterschieden. Executablepfad ausschließlich Operatorconfig; bei root nutzt Launcher --no-sandbox, deshalb muss äußere Betriebsisolation mitbewertet werden.

## 8. Ressourcen, Aufräumen und voller Speicher

Settings 256 KiB nach read; max. 32 Profile/Budgets, konfiguriert maximal 16 Routes×5 Läufe und zusätzliche InvokermaximumRuns. Reports entstehen vor Resultbyteprüfung; Filelimits/Staging erst danach. Die Browserprozesse starten im Capability-Invoker des Buster-Elternprozesses, nicht unter dem isolierten Providerprozess. Dessen `resources()` misst sie nicht; siehe Eigentümerbefund PCR-BUSTER-ENGINE-001 in `buster.engine`. Keine Interpretation von `workerLimits` im Providerdetail als gemessener Verbrauch. Ergebnisbytegrenzen nach JSON.stringify schützen nicht vor der vorherigen Objekt-/PNGallokation.

## 9. Architektur und Vereinfachung

Verantwortungsausschnitt klar, insbesondere Axe statt zusätzlicher Lighthousea11y. Doppelte Endpoint-/Profilvalidierung vereinfacht sich durch gemeinsame strikt versionierte Contracts. Median eines echten Reports erhält zusammengehörige Metriken.

## 10. Untersuchte und ausgeführte Tests

Original `node skills/buster/plugins/lighthouse/tests/live-function.test.ts`: blockiert bei „real Chromium is required“, Evidenz `../evidence/buster-provider-lighthouse-original.txt`. Vollständig gelesen: ungültige Settings, echte drei Samples, permissives/unmögliches Budget und Off-Originserverkontakt=0; kein Fake-LHR. Direkter Originaltest umgeht Registry, Prozessloader und kompletten Workerabschluss; seine Aussage reicht ausdrücklich nur über die darin wirklich aufgerufenen Komponenten. Kein Deployment, kein CI-Neulauf, kein Ersatzmock. Tests außerhalb der unten genannten Programme sind nicht als ausgeführt gewertet.

## 11. Dokumentationsabgleich

Plugin-README gelesen: vollständiger Medianbericht, drei getrennte Purposes und Blockingbudget stimmen mit Provider/Resolver überein. Claims zu Prozessressourcen sind durch PCR-BUSTER-ENGINE-001 begrenzt; gepinnte Version 13.4.1 wird im Test behauptet, hier mangels Browser nicht runtimebestätigt.

## 12. Befunde und nächste Verifikation

Keine neue bestätigte lokale Bewertungsabweichung. Offen: vollständige absolute Deadline einschließlich Chrome-/Proxycleanup, Killabschluss und parentseitige Ressourcen. Nächster Schritt unverändertes Liveprogramm mit gepinntem Chrome/Lighthouse, anschließend Abort in Launch und zwischen Samples.

Keine zusätzlichen bestätigten komponenteneigenen Defekte im untersuchten Umfang. Die genannten Laufzeitlücken bleiben offen.
