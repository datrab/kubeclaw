# kubeclaw.coverage-budget

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Schema: Revision 5. Teststatus: bestanden. Dokumentationsstatus: vorhanden / unvollständig.

## 1. Verantwortung, Registrierung und tatsächliche Nutzung

Auslieferung über `packaging/runtime/roles/buster.json`; Manifest `plugin.json` registriert den unten genannten Vertrag. Nova `skills/nova/core/test-gates/resolver.ts:538–580` wählt anhand `uses`, prüft Kind, löst Konfiguration mit Schema-Defaults und pinnt Paket/Schema. Buster `runner.ts:1191–1250` lädt und ruft aus; `provider-loader.ts:49–89,151–180,382–389` kopiert digestgeprüft ins Versuchssnapshot und startet den Sandboxprozess; `provider-child.mjs:37–66` importiert Factory und ruft `execute`. Alle Engine-Dateien liegen in `skills/buster/engine/test-gates/`. Vertrag `kubeclaw.coverage-budget@1`, Registration `lcov`, keine Capability, retrySafe=true.

## 2. Eingaben, Ausgaben und Gegenstellen

Manifest verlangt coverage-1 und erlaubt coverage-2 bis -8 als text/lcov-Artefakte. Resolver `resolver.ts:566–569` erzwingt Mindestquote für blocking. Provider `src/provider.js:48–98` liest freigegebene file:Artefakte, verifiziert Größe und SHA-256, verbietet gleiche Digests; parseLcov wertet SF/DA aus und kombiniert Datei-/Zeilennummern mit maximaler Hitzahl. Liefert Metriken/Details, keine Outputs/Evidencefiles.

## 3. Zustand, Persistenz und Commit-Punkt

Nur verifizierte Artefaktlesezugriffe und lokales Ergebnis; keinerlei externe Aktionen oder Providerpersistenz. Provider-Rückgabe ist kein Commit: Runner validiert Vertrag, Zählwerte und Evidenzdeklarationen, klont/friert das Result, kopiert ausgewählte Dateien ins Staging und führt erst danach Workerabschluss/Artefaktspeicherung aus (`runner.ts:1226–1320`). Keine eigene Journal-/fsync-/Waitprojektion; Recovery und Abschlusspräfixe gehören dem Runner/Remote-Dienst. Keine Behauptung einer bestandenen Crashkette.

## 4. Korrektheit und Fehlerdisposition

Numerische Grenzwerte endlich/0–100, ungültiges UTF-8 und unbekannte LCOVrecordtypen werfen. Duplicate digest wirft auch bei anderem Namen. combine=true vereinigt Zeilenabdeckung; false nimmt schlechteste Eingangsquote, zeigt Counts als summierte Inputcounts. LF/LH/FN/Branchrecords werden nicht für Linequote verwendet. End-of-record-Vollständigkeit/Summarykonsistenz wird nicht komplett validiert; hierfür kein kompletter LCOVstandard-Konformitätsclaim.

## 5. Timeout, Abbruch, Wiederholung und Parallelität

Synchroner Read/Parse ohne eigene Abortabfrage; Abbruch erfolgt durch Workerprozessbeendigung. Ein Input maximal 64 MiB, 2 Mio DArecords; Kombination von bis zu 8 Inputs erhöht Gesamtaufwand. Kein gemeinsamer mutable Zustand; Retry auf identischen Artefakten wiederholt deterministische Messung (localeSort verändert nur Inputreihenfolge).

## 6. Neustart, Wiederaufnahme und ungewisser Ausgang

Reiner Rechner: keine externe Wiederaufnahme/Ungewissheitsaktion. Bei Neustart wird aus contentgebundenen Artefakten neu gemessen. Kein mehrstufiges Providerjournal und keine own cleanuphook erforderlich.

## 7. Vertrauensgrenzen und Evidenzherkunft

Upstream liefert Artefaktidentität. Loader autorisiert explizite file:-Pfade; Provider verifiziert tatsächliche Bytes gegen Größe/Digest. Eine passende LCOVdatei beweist den Inhalt, keine unabhängige Ausführung aller Quellzeilen. Dateischlüssel bleiben unkanonische Produceridentitäten: gleichnamige unterschiedliche Quelldateien können bei combine zusammenfallen; Vertrag setzt gemeinsame Repositorybasis voraus.

## 8. Ressourcen, Aufräumen und voller Speicher

64 MiB wird erst in parseLcov nach readFileSync geprüft (`provider.js:63–69`); Textsplit und Maps können deutlich mehr Speicher halten. Begrenzung im isolierten Provider schützt Workerbetrieb nur über äußere Prozesslimits. Quellartefakte werden nicht verändert/gelöscht; Retention im Artifactstore. Kein Schreib-ENOSPCpfad außer nachgelagerter Ergebnispersistenz.

## 9. Architektur und Vereinfachung

Trennung von Unitresult und Coveragebudget ist sinnvoll und erhält unterschiedliche Urteile. Ursachenbasierte Verbesserungen: vor Read Größe prüfen/streamen, SFidentität mit Quelle verbinden und klaren LCOVunterumfang dokumentieren; keine eigenständige Netzwerkcapability nötig.

## 10. Untersuchte und ausgeführte Tests

`node skills/buster/plugins/coverage-budget/tests/live-function.test.ts` gelesen/exit 0: echter LCOV-Dateiinhalt, 50/51%-Grenze, zwei Inputs=75%, Duplicate- und Malformedablehnung. Evidenz `../evidence/buster-provider-coverage-budget-original.txt`. `check-pipeline-phase8-vertical.mts:1–85` als Gegenstellenbeleg gelesen: echte Unitfixture erzeugt LCOV, Resolver verknüpft Output, fehlender Blockingminimumtest. Dieser größere Vertikallauf hier nicht ausgeführt. Direkter Originaltest umgeht Registry, Prozessloader und kompletten Workerabschluss; seine Aussage reicht ausdrücklich nur über die darin wirklich aufgerufenen Komponenten. Kein Deployment, kein CI-Neulauf, kein Ersatzmock. Tests außerhalb der unten genannten Programme sind nicht als ausgeführt gewertet.

## 11. Dokumentationsabgleich

Plugin-README geprüft: kombinierte Zeilen und schwächster Input stimmen. „rejects ... malformed LCOV“ ist weiter als Parserunterumfang (bekannte Summaryrecords werden nicht validiert); deshalb Dokumentation unvollständig hinsichtlich Dialekt/Quelle. Der Blockingminimumclaim wird bewusst beim Resolver erfüllt, kein Providerdefekt aus direktem Aufruf ohne mode abgeleitet.

## 12. Befunde und nächste Verifikation

Kein zusätzlich bewiesener Fehler des deklarierten Linebudgetalgorithmus. Nächste Verifikation: echter vertikaler Unit→LCOV→Coverage-Ablauf mit gleichem/nichtgleichem SFpfad, maximalen Inputs und Abbruch; Summarykonsistenzanforderung vor Parserausweitung explizit entscheiden.

Keine zusätzlichen bestätigten komponenteneigenen Defekte im untersuchten Umfang. Die genannten Laufzeitlücken bleiben offen.
