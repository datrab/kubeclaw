# kubeclaw.review — Policy/Echo/Reducer/Governor/Report/Simplification Teilreview

Status: abgeschlossen für die unten benannte Teilfläche; kein Gesamturteil über das Plugin. Baseline `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. Bearbeiter: Astra-medium Subagent buster; ausschließlich Reviewdokumentation und reproduzierbare Evidenz. Die Gate-/Context-/Audit-/Scalable-Flächen integriert der Komponentenreview-Verantwortliche.

## 1. Verantwortung, Registrierung und tatsächliche Nutzung

Die 30 vollständig gelesenen Module unter `skills/nova/plugins/review/src/` (4.063 Zeilen) sind:

- `echo-review-contract.ts`, `echo-review-parser.ts`, `echo-review-verification-contract.ts`, `echo-review-verification-parser.ts`, `echo-context-request-parser.ts`, `echo-evidence-verification.ts`.
- `review-policy-contract.ts`, `review-policy-parser.ts`, `review-policy-profiles.ts`, `review-policy-resolver.ts`, `review-invariants.ts`.
- `review-verdict-policy.ts`, `review-reducer.ts`, `review-reduction-state.ts`, `review-verified-findings.ts`, `review-finding-governance.ts`.
- `review-governor.ts`, `review-governor-history.ts`, `review-governor-decision.ts`, `review-report-builder.ts`, `review-report-contract.ts`, `review-report-storage.ts`, `review-report-flow.ts`, `review-evaluation-metadata.ts`.
- `simplification-contract.ts`, `simplification-parser.ts`, `simplification-miner.ts`, `simplification-manifest.ts`, `simplification-fact-producer.ts`, `simplification-registry.ts`.

Zusätzliche vollständig gelesene Gegenstellen: `review-stage-verification.ts`, `review-preparation.ts`, `review-bundle-values.ts`, `review-hard-limits.ts`; gezielte Aufruferpfade in `stage.ts:28–42,99–126,212–249` und Policy-Settings-Aufruf `repository-audit-stage.ts:683–684`. Die Module sind interne Implementierungen der Reviewstage, keine selbstständigen Worker oder Services. `stage` löst Settingspolicy, erzeugt Frozen-Snapshot und Semantic-Result, ruft Governor und `finalizeReview`; `review-report-flow` verbindet den zertifizierenden Verifier mit Reducer, Governor, Reportbuilder und Artifactcapability. `review-preparation:42–49` führt den Simplification-Produzenten tatsächlich für aktivierte Profile aus. Die bloße Registry von acht Regeln bedeutet nicht acht implementierte Sourceanalyser: der eigene Produzent erzeugt nur SIM002, weitere Regeln kommen aus angebotenen Fakten. Paketbefehle aus `package.json` gelesen; Registrierung/Bundlerabschluss bleiben beim Gesamtkomponentenreview.

## 2. Schnittstellen und Identitäten

Echo-Output ist ein geschlossenes Objekt, kein JSON-String und kein StageResult. Der Parser rekonstruiert bekannte Felder, zählt Unicodezeichen, begrenzt Arrays, verbietet Pfadescapes/Controlzeichen, doppelte Evidenz und nicht inspizierte Zitate. ContextRequest ist nur zusammen mit unverified Requirements und ohne Findings zulässig. Der Gegenprüfer `review-stage-verification` gleicht zusätzlich genau die deklarierte Requirementmenge sowie tatsächlich angebotene Evidenz ab. Ein syntaktisch gültiges SHA-Digest beweist allein keine Herkunft.

Verifieroutput bindet Bundle-, Policy- und Proposalsetdigests; die anschließende Reconciliation muss für genau Snapshot/Preflight/Policy zertifiziert sein. `buildVerifiedReviewFindings` akzeptiert keine bloß strukturähnlichen Reconciliation-/Preflightkopien. Fingerprints enthalten Base, Kategorie, Priorität, Claim, Impact, normalisierte Locations ohne LineHints, Evidenz und Fix; LineHints sind absichtlich keine stabile Identität. Rootcause-Zertifikate sind separat an Fingerprints gebunden. Governance behält die exakte Findingsreferenz bei; ein Clone würde den WeakMap-Beweis lösen.

Policy wird als vollständige, geschlossene v2-Snapshotstruktur validiert, nicht unkontrolliert tief gemischt. Präzedenz: built_in → settings_file → explizit autorisierter run_override; jede Quelle wird validiert und ihr Digest aufbewahrt. Harte P0-/Kategorie-Invarianten können nicht entfernt werden. Laufender Stage-Aufrufer nutzt Settingspolicy; run_override ist in dieser untersuchten Stage kein zweiter versteckter Eingang. Custom-Profilnamen werden vom Policyvertrag akzeptiert, vom Reportvertrag abgewiesen: PCR-REVIEW-POLICY-001.

Report schreibt v2 mit Aufgabe, Attempt, Revision, Policy-/Bundledigest, Governor und nach Herkunft getrennten Items. `storeReviewReport` prüft Antwort-ID, Namespace, JSON-Mediatype, kanonischen Digest, Bytezahl und sämtliche Producer-Attemptfelder. `readReviewGovernorBaseline` wählt nur ältere Reportartefakte derselben Run-/Stage-ID, prüft Referenzmetadaten und Reportattempt. Die Artefaktcapability ist der Integritäts-/Persistenzeigentümer; dieser Teilreview behauptet keine unabhängige Host-Filesystemvalidierung durch den Pluginparser.

## 3. Zustand, Commit-Punkte und Seiteneffekte

Parser/Reducer/Miner sind reine Berechnungen mit neu aufgebauten bzw. eingefrorenen Ergebnissen. Private WeakSets/WeakMaps zertifizieren ausschließlich Inprozessobjekte; diese Zertifikate werden nicht als dauerhafter Zustand missverstanden. Governor liest die vom Core gelieferte Lifecyclezahl und Git-Changedranges; er besitzt keine eigene Retry-/Remediation-Zustandsmaschine.

Der relevante externe Seiteneffekt ist `artifacts.write/put_json` in `review-report-storage:72–76`. ID wird aus AttemptID+BundleDigest abgeleitet, Inhalt kanonisiert; erst nach validierter Writeantwort wird der ArtifactRef am StageResult angehängt. Keine direkte fsync-/Rename-/Lockoperation gehört diesen Modulen; die Gegenstelle der Capability muss Dauerhaftigkeit garantieren. Ein fertiger Report ist noch kein kanonischer Core-Stagecommit.

## 4. Korrektheit und Dispositionen

Reducer prüft zertifizierten Input, immutable passende Policy, Integrityissues, unverifizierte Requirements und Limits vor Findings. Unbekannter Scope kann blockieren; reparierbare erlaubte direkte eingeführte Findings erzeugen request_fix; unrepairable/outside-Fälle können Orchestrator verlangen. Ohne korrekt typisierten Reviewwait fällt Reducer auf blocked zurück. Insufficient-Verifierverdicts werden nach Policy abgelehnt, retained oder eskaliert und können nicht als bestätigte Findings in den Reparaturpfad gelangen. Diese konfigurierbare Follow-up-Entscheidung ist absichtlich kein universelles Insufficient→blocked.

Reportbuilder verwendet denselben Findingclassifier; begrenzte Advisories/Followups haben explizite omitted-Zähler, Blocker werden nicht so gekürzt. Reports erlauben passed nur ohne Blocker und request_fix nur mit Blockern. Fehlendes Reportidentity, Writerfehler, falsche Referenz oder invalider Report verhindern ein passed. PCR-REVIEW-POLICY-001 ist ein konkret reproduzierter versehentlicher Fehlerpfad. Der Governor eskaliert Scopewachstum auch nach ansonsten sauberem Ergebnis; cycle_exhausted verhindert nur eine zusätzliche Reparatur, nicht einen sauberen Abschluss nach der letzten erlaubten Reparatur.

## 5. Deadline, Abbruch, Wiederholung und Parallelität

Diese Module starten keine Kindprozesse und halten keine Pipes; Reaping und RPC-Backpressure gehören dem Pluginruntime/Capability-Aufrufer. Reine Reduktion ist synchron und mengenbegrenzt; Governor-Gitreads, Historyreads und Reportwrite benutzen `context.invoke` ohne eigenen Timer. Damit existiert hier keine zusätzliche nachgewiesene lokale Gesamtdeadline; Cancellation/absolute Claim-Deadline muss die umgebende Runtime einschließlich der Reportphase garantieren. Kein eigener Retryloop und keine Hintergrundtasks.

Digestbasierte Report-ID macht gleiche Attempt-/Bundle-Schreibversuche identifizierbar. Inhalt kann nach wiederholtem nondeterministischem Echo dennoch verschieden sein: das Modul behauptet kein Last-write-wins und besitzt kein eigenes Konfliktprotokoll; Writer muss immutable Gleichheit durchsetzen. Parallelität der WeakMapbeweise ist pro Objekt und nicht globale wechselnde Policy. Sortierung erfolgt überwiegend explizit per Codeunitvergleich, nicht sprachabhängigem localeCompare; kanonische Policies und Reports sind reihenfolgeunabhängig in den ausgeführten Originaltests.

## 6. Neustart und Crashpräfixe

Statisch untersuchte relevante Präfixe: vor Reportwrite (noch kein dauerhafter Report); Write erfolgt, ACK verloren (mögliches bereits vorhandenes Artefakt, Plugin meldet Writefailure); validierter Ref vorhanden, StageResult noch nicht an Core committed (verwaistes Artefakt möglich); Corecommit mit Ref (History kann spätere Governorbaseline lesen). Nur letzteres ist in der Contractartefaktliste sicher sichtbar. `readReviewGovernorBaseline` blockiert Remediation ohne älteren zertifizierten Report und bindet Base, Policydigest und Scopepräfixe an das neue FrozenAuthority. So wird fehlende Geschichte nicht still als neuer großzüger Ausgangsmaßstab behandelt.

Nach Prozessneustart sind WeakMapbeweise weg; normale Ausführung rekonstruiert Parser-/Verifierketten. Ein JSON-Clone eines zertifizierten Findingssets wird absichtlich abgewiesen. Keine reale SIGKILL-/lost-ACK-Prüfung dieser Reportphase durchgeführt; die oben beschriebenen Präfixe sind Protokollanalyse, kein Crashlauf. Corejournal/Artifactstore-Replay ist nicht dieser Teilfläche zugeordnet.

## 7. Vertrauen, Autorisierung und Evidenz

Echo darf Vorschläge/Evidenzverweise formulieren, aber weder StageResult noch Core-Lifecycle herstellen. Zertifizierte Grenzen in `review-stage-verification` prüfen Findings, Mapping, Reconciliation und Policyzusammengehörigkeit vor Reduktion. Die öffentliche interne Funktion `certifyReviewReductionInput` kann in Originalunittests synthetische Verifiedfindings zertifizieren; das ist keine externe Capability und kein Nachweis, dass ein Model direkt Zertifizierung aufrufen darf. Reportbuilder setzt typisierte vertrauenswürdige Inputs voraus, während seine Serialisierung ein strukturelles Schema prüft.

Simplification-Fakten werden auf Revision, Pfad, Regelaktivierung und Mindestconfidence gefiltert; Kandidaten bekommen semantische Digestidentitäten, gleichartige Quellen werden deterministisch dedupliziert. Das verifiziert die behauptete Semantik einer extern gelieferten Factquelle noch nicht. Eigenproduktion ist Regexheuristik und erzeugt konkret inkonsistente/irreführende Evidenz: PCR-REVIEW-POLICY-002. Empfehlungen besitzen keine eigenständige Reparaturautorität; keine automatische Löschung aus einem simplification fact behauptet.

## 8. Ressourcen, Serialisierung und Aufbewahrung

Harte Grenzen gelesen: 128 Proposals/Verifierresults, 16 Evidenzverweise/Record, 32 Findinglocations, 256 Facts, 128 Candidates, 32 Diagnostics, 16MiB Bundle. Policy kann nur kleinere Werte wählen; initiale Contextlimits müssen strikt Expansionsreserve lassen. Reports begrenzen 2.048 Items und follow-up/advisory-Slices weisen Auslassungen aus. Governorzahlen sind safe integers bei Reportvalidierung.

Die Parser übernehmen keine unbekannten Unterbäume und bauen feste Shapes neu; relevante normale Arrays werden auf Sparseeinträge geprüft. ContextRequest.list benutzt dagegen map/some ohne Denseprüfung: ein direktes JS-Hole kann den lokalen Parser passieren; JSONwire enthält null statt Hole und wird abgewiesen. Keine erreichbare Netzwerk-Bypassbehauptung daraus. Getter-/Proxy-Ausführung wird bei direkten JS-Objektinputs nicht grundsätzlich ausgeschlossen; JSONdecode der eigentlichen externen Grenze ist relevant. Rekursive deepFreeze-Helfer werden auf rekonstruierten Shapes genutzt, nicht als universeller beliebiger Objektgraphvalidator. Keine eigene Tiefen-/Knotenbudgetgarantie für fremde inprozessseitige API-Nutzung.

Produzent sammelt alle Regexmatches vor `.slice(0,256)`, und Miner sammelt alle Kandidaten vor dem Hardlimitslice; Source-/Contextbudgets begrenzen den Eingang, aber das nachgelagerte Limit ist kein vorgezogener Arbeitsbudgetbeweis. Produzent verwirft >256 Facts ohne omitted-Zähler, während Miner seine >128 Candidates mit candidate_limit diagnostiziert. Kein Datenträgerverbrauchstest: Report-Eigentümer ist Artefaktstore, kein lokaler Plugin-Cache; fehlgeschlagene Persistence wird blocked. Retention und GC liegen außerhalb dieser Module.

## 9. Architektur und Vereinfachung

Die Trennung Parser → certifizierte Verification → reine Entscheidung → Reportpersistenz ist tatsächlich vorhanden und vermeidet zweite Lifecycleautorität. Governorregeln zählen Core-Remediation statt normaler Retryattempts. Schwäche ist Vertragsdrift trotz vieler kleiner Contract-/Parsermodule: freier Policyprofilstring gegenüber geschlossenem Reportprofilenum sowie JavaScript-Symbol gegenüber generischem StableIdentifier. Gemeinsame Typ-/Schemaquelle an diesen konkreten Übergängen ist eine dauerhafte Ursachenbehebung; zusätzliche parallele Validierer würden Drift erhöhen. Phase-v1-Schemas bleiben als versionierte Dokumente vorhanden; nicht ungeprüft als tote Runtimepfade bezeichnet.

## 10. Tests und ausgeführte Evidenz

Alle folgenden 19 Originalskripte vollständig gelesen und unverändert mit `node tests/<Name>.unit.test.mjs` im Pluginverzeichnis ausgeführt; jeder Exit 0. Vollständige Befehle/Ausgaben: `review-policy-tests.txt`.

- review-governor; review-report-contract; review-report-builder.
- simplification-contract; simplification-miner; simplification-manifest; simplification-fact-producer.
- echo-review-output; echo-review-verification.
- review-verdict-policy; review-verified-findings.
- review-policy-contract; review-invariants; review-policy-resolver; review-policy-profiles.
- review-reducer; review-decision-matrix (34 Fälle); review-contract-parity; review-evaluation-metadata.

Zusätzlich Originalfixture `tests/fixtures/review-governor.mjs` gelesen; die Originaltests verwenden außerdem `tests/fixtures/review-policy.mjs`. Governororiginal importiert zusätzlich evidence-authority/context-production/slicing/fact-producer Tests; deren PASS-Zeilen sind im Log sichtbar, aber deren vollständige inhaltliche Prüfung gehört zum Context-Reviewer. Pure Parser/Digest/Governance-/AJVtests führen echte Funktionen aus. Governorunit liefert Gitantworten über eine injizierte Invoke-Funktion, Findings-/Verifiertests konstruieren feste Modelantworten; damit sind diese PASS keine Live-Git-/Model-/Artifactservice-Nachweise. Es wurden keine neuen Mocks eingeführt, keine existierenden Tests geändert, kein fehlendes Binary ersetzt.

Eigene `node docs/review/evidence/review-policy-boundaries.mjs`, Exit 0; Log `review-policy-boundaries.txt`: Original-Resolver akzeptiert Customsettingspolicy, Original-Reportbuilder verwirft dieselbe Profileidentität; Original-Produzent+Miner verlieren den ganzen erzeugten Factsource bei $wrap bzw. gleichen lokalen Wrappernamen; Kommentar erzeugt high-confidence Ghostfact. Eingaben sind kleine synthetische Quelldaten ohne Runtime-/Capabilityersatz. Gesamt-npm-test wird separat vom Komponentenreviewer beurteilt; dessen vorangehender Benchmarkabbruch darf diese gezielten PASS weder verdecken noch zu einem vollen Suite-PASS umgedeutet werden.

## 11. Dokumentationsabgleich

`docs/architecture/echo-review-phase-7-design.md:24–95` beschreibt pure Reportbuilder, immutable pro-Attempt-Reports, überprüfte Writerantwort, omitted-Zähler und advisoryfreie Reparaturautorität; diese Wege sind umgesetzt, aktuell im v2- statt historischem v1-Reportvertrag. Die erwartete semantische Eigenschaft high-confidence Advisories in lean wird durch den rohen Sourceproduzenten nur heuristisch vorbereitet (PCR-REVIEW-POLICY-002). `review-invariants.ts` RI-008 lautet „Review output is never silently truncated“: der Producer-Slice auf256 Facts besitzt keine Auslassungsmetadaten; Miner-/Reportgrenzen hingegen schon. Nicht als Fehlfunktion des eigentlichen Core-Blockerreducers dargestellt. Die Phase-7-Beschreibung nennt repository audit als Zukunft; dessen heutige separate Stage ist bei anderem Reviewer und widerlegt keine diff-Gate-Isolation.

## 12. Stabile Befunde und Verifikation

### PCR-REVIEW-POLICY-001 — medium — Gültige Custompolicy scheitert erst an erforderlichem Report

**Trigger:** Stagekonfiguration behält built-in `profile: gate`, enthält aber eine vollständige gültige Settingspolicy mit eigenem `policy.profile: custom` (entsprechend dem freien Stable-ID-Vertrag und Resolveroriginaltests mit settings/run).

**Beleg:** `review-policy-contract.ts:92–95,148–150` erlaubt Profilstring/Stable-ID, `review-policy-parser.ts:199–204` liest ihn, `review-policy-resolver.ts:56–75` akzeptiert/selektiert Settingsquelle. Tatsächlicher Aufrufer `stage.ts:119–126` reicht sie durch. `review-report-builder.ts:178` übernimmt `input.policy.policy.profile`, `review-report-contract.ts:33,128–137` akzeptiert nur gate/lean/audit. Builder wirft „built review report is invalid“, `review-report-flow.ts:60–65` übersetzt in report_write_failed/blocked. Eigener Originalfunktionsrepro bestätigt die Producer/Receiverinkompatibilität.

**Auswirkung:** Autorisierte Custompolicy kann einen Reviewversuch nach erfolgter Modelarbeit nicht erfolgreich mit Pflichtreport abschließen; kein Report wird geschrieben. Kein stilles Pass und kein fremder Zugriff.

**Ursachenbehebung:** Entscheiden, ob profile ein freier Settingsname oder ein geschlossenes Verhaltensprofil ist, und dieselbe Semantik in Policyparser, Report-Type, Reportschema und Builder verwenden. Falls nur drei IDs gewünscht, Customwert früh als invalid_policy ablehnen; falls freie Namen beabsichtigt, Reportvertrag erweitern. **Regression:** vollständige Stage mit gültiger Customsettingspolicy bis Pflichtartifact; erwarteten Vertrag sowohl AJV als auch Parser/Builder prüfen. Bestehender Resolver-PASS allein deckt die Endgrenze nicht ab.

### PCR-REVIEW-POLICY-002 — medium — Eigenproduzierte Simplification-Evidenz ist nicht parser- und scopekohärent

**Trigger:** Rechtmäßiger JS/TS-Wrapper mit `$` im Namen, oder zwei gleichnamige lokale Wrapper zum gleichen Target in verschiedenen Scopes derselben Datei. Alternative Fehlklassifikation: passender Wrappertext steht nur in einem Kommentar/String.

**Beleg:** `simplification-fact-producer.ts:13–38` erkennt Rawtext per Regex, akzeptiert `$`/`_`-Symbole und bildet Fact-ID nur aus Pfad+Symbol+Target ohne Scope/Quellposition. `simplification-parser.ts:42–68` validiert symbol via StableIdentifier und fordert einzigartige FactIDs; `review-bundle-values.ts:33–36` verbietet `$` und führendes `_`. `simplification-miner.ts:79–82` verwirft bei einem solchen Parsefehler den gesamten Source und liefert malformed_source, selbst wenn weitere richtige Fakten enthalten sind. Tatsächliche Einbindung `review-preparation.ts:42–49`. Repro: good+$wrap erzeugt zwei Fakten, null Kandidaten; zwei unabhängige Scope-wrapper ebenfalls zwei Fakten, null Kandidaten. Kommentar ghost erzeugt ein high-confidence Fact ohne ausführbare Wrapperfunktion.

**Auswirkung:** Lean-/Audit-Simplification verliert vollständige erzeugte Empfehlungsevidenz bei normalem Quellcode oder sendet irreführende high-confidence Kandidaten. Diagnostic bleibt sichtbar; kein nachgewiesener automatischer Fix oder Gatebypass. Medium wegen deterministischem Verlust einer aktivierten Reviewfunktion, nicht Securitykritikalität.

**Ursachenbehebung:** Sourcefakten aus syntax-/scopebewusstem Analysepfad erzeugen; Symbolfelder müssen gültige Sprachsymbole repräsentieren, stabile FactIDs davon getrennt mit Scope/Positionsidentität bilden; Produzentenresultat gegen eigenen Contract validieren. Kommentare/Strings nicht als Funktionen interpretieren. Producer-Auslassungen explizit diagnostizieren statt nur slice. **Regression:** legal `$`-/`_`-Namen, mehrere lokale gleichnamige Wrapper, Kommentar/String-Decoys und >256 echte Kandidaten; gültige andere Fakten dürfen nicht unbemerkt verschwinden. Nur advisorybezogene Semantik behaupten, bis unabhängige Echo-/Gateketten explizit geprüft sind.

## Exakte Testdateiliste für Gesamtcoverage

Alle unter `skills/nova/plugins/review/`, jeweils vollständig gelesen und Originalskript ausgeführt:

- `tests/review-governor.unit.test.mjs`
- `tests/review-report-contract.unit.test.mjs`
- `tests/review-report-builder.unit.test.mjs`
- `tests/simplification-contract.unit.test.mjs`
- `tests/simplification-miner.unit.test.mjs`
- `tests/simplification-manifest.unit.test.mjs`
- `tests/simplification-fact-producer.unit.test.mjs`
- `tests/echo-review-output.unit.test.mjs`
- `tests/echo-review-verification.unit.test.mjs`
- `tests/review-verdict-policy.unit.test.mjs`
- `tests/review-verified-findings.unit.test.mjs`
- `tests/review-policy-contract.unit.test.mjs`
- `tests/review-invariants.unit.test.mjs`
- `tests/review-policy-resolver.unit.test.mjs`
- `tests/review-policy-profiles.unit.test.mjs`
- `tests/review-reducer.unit.test.mjs`
- `tests/review-decision-matrix.unit.test.mjs`
- `tests/review-contract-parity.unit.test.mjs`
- `tests/review-evaluation-metadata.unit.test.mjs`
