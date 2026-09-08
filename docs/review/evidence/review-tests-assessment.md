# kubeclaw.review — abschließende Testleseabdeckung

Baseline `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. Bounded Nachprüfung durch
capabilities: ausschließlich vorhandene Tests gelesen, keine neuen Tests oder
Probes gestartet. Frühere Ausführungsresultate werden ausdrücklich den jeweiligen
Agenten/Logs zugerechnet. Quellenbasis `skills/nova/plugins/review/tests/`.

## In dieser Nachprüfung vollständig gelesen

- `stage.unit.test.mjs` (493 Zeilen).
- `live-function.test.ts` (431 Zeilen).
- `review-governor.unit.test.mjs`.
- `review-report-contract.unit.test.mjs`.
- `review-report-builder.unit.test.mjs`.
- `review-snapshot-inventory.unit.test.mjs`.
- `review-map-artifacts.unit.test.mjs`.
- `review-content-cache.unit.test.mjs`.
- `review-cluster-contract.unit.test.mjs`.
- `review-cluster-identity.unit.test.mjs`.
- `review-prompt-budget.unit.test.mjs`.
- `review-quality-corpus.unit.test.mjs`.
- `review-scale-slicing.unit.test.mjs`.
- `review-evidence-authority.unit.test.mjs`.

Paketdatei mit pretest/test/test:cluster/schema-Befehlen ebenfalls gelesen.
Governor/Reporttests überschneiden sich mit Buster, Contentcache mit Auditchild;
diese Lesung war bereits erfolgt, als die genauen Zuständigkeitslisten eintrafen.

## Aussagekraft und Grenzen

**Stage:** Original execute gegen handgeschriebene context.invoke-Antworten für
Repository, Runtime und Artifactstore. Breite semantische Matrix: Pass/Reportdigest,
Artefaktschreibfehler und falsche Artefaktidentität, Simplificationadvisory ohne
Verifier, optionale fehlerhafte Facts, bestätigte/rejected/insufficient Findings,
Follow-up und Orchestration, ungültige Governorhistorie, Proposallimit vor
Linemessung, Verifierrequestlimit mit Proposalerhalt, unkanonische Zeilenranges,
Transportfehler versus malformed Verifieroutput, Kontextexpansion/Unknownreq/
wiederholte Expansion mit neuestem Bundledigest, falscher Sourcehash, Scope und
dangling Provenance vor Read. Assertions zur Retryautorität prüfen nur, dass
Provider-/Runtimefehler aus execute herausgeworfen werden. Sie beweisen weder
Core-Retry noch einen zweiten Kontakt zum Originalempfänger nach transientem
Fehler oder gespeichertem Receipt. Keine echte Dateisystem-/Transport-/Crashgrenze
in dieser Unitdatei; ihre zurückgegebenen Hashes beweisen nur Konsistenz der
gewählten Fixtures, keine unabhängige Herkunft von Agentbehauptungen.

**Live-function:** wesentlich stärkerer vertikaler Schnitt mit echtem Git und
zwei Commits, Package discovery/Registry/Grants, Nova PipelineRunner, Original-
Repositoryadapter, runtime-dispatch, network-http, Secretresolver, Artifactstore
und Filejournals. Gespeicherte Reports werden aus echten Record-/Blobstores
wieder gelesen. Kontrollierter Loopback-HTTP-Server erzeugt vorgefertigte
Reviewer-/Verifierantworten; kein echter Echo/OpenClaw/LLM und keine semantische
Qualitätsevaluation. Server prüft die Authheader nicht unabhängig.
MemoryResourceLockManager begrenzt die Aussage zur Mehrprozesskoordination.
Geprüft werden Pass, lean/audit Advisorygrenzen (3/5 samt omitted), keine
Verifiercalls für Advisories, drei Findings/zwei Rootcauses bei begrenztem
Repairbatch und drei gespeicherte Governorzyklen mit stabiler Baseline,
request_fix/request_fix/orchestrator_required und ohne ordinary stage.retrying.
Das ist echte Remediationverdrahtung, aber kein transienter Transportretrytest,
kein Prozessneustart, verlorenes ACK, laufender Abort oder SIGKILL. Ein im Test
benutztes `{tests:'passed'}` ist Eingabeevidenz, kein ausgeführter Produkttest.

**Governor und Report:** Unit-Governor verwendet künstliche changed_line_ranges;
prüft Baseline, Retry-vs-Repairzyklen, File-/LOCwachstum, Ownership, Vorrang einer
Scopeverletzung auch bei clean result, und Policyintegrität. Kein persistierter
Historyreader oder echter Gitdiff hier. Reportcontract prüft Runtime+Ajv2020 für
gültige Fixtures sowie zusätzliche Felder, Digest-/Textformen, undefined,
Governorbindung, Provenance und Outcome/Blocker-/Zählkonsistenz. Builder prüft
Blocker, Reihenfolgeunabhängigkeit und Follow-up-Erhalt bestätigter Proposals
ohne normalisiertes Finding. Diese Fixtures decken keine benutzerdefinierten
Profile ab; Busters bestätigter Customprofilebefund wird nicht durch grüne
Built-in-Fixtures widerlegt.

**Inventar/Maps/Clustering:** Inventory prüft Rollen/Exclusions einschließlich
Symlinks und Binaries, sortierte Identität, falschen Digest, doppelte Pfade und
lexikalischen Pfadausbruch. Kein echtes git ls-tree in dieser Datei. Maps prüfen
Streamcounts sowie Manipulation/fehlende Newline gegen Manifestdigest. Der
Reihenfolgetest kehrt nur eine einzelne Relation um und ist daher schwach als
Permutationstest. Clustercontract prüft wenige Rootcausehint-/Repairwortfälle;
Clusteridentity nur unterschiedliche Singletonfingerprints. Daraus keine
umfassende semantische Rootcause-Deduplikationsgarantie ableiten.

**Cache:** ausschließlich MemoryStore, dessen write selbst Unveränderlichkeit
assertiert. Hits, Reordering, geänderte Unit/Policy, Valuehashkorruption,
Checkpoint vor geworfenem Fehler und spätere Restarbeit sind belegt. Die
Assertion nennt die Unit durable, aber ein lebender Map nach einer Exception
ist kein fsync-/Neustart-/Prozessverlustnachweis. Bounded 16 Reads, Abwarten
laufender Reads bei Fehler, keine neuen Claims und `Promise.reject(undefined)`
werden gezielt geprüft. Keine zwei Prozesse mit gleichzeitigem Cachemiss.

**Promptbudget:** echte Tokenizerfunktionen mit Goldenvektoren für beide
Encodings, Unicode/Lonesurrogate/Specialtoken, UTF8bytes, Kostenarithmetik,
maximale Resultpfad-Hülle über SDK buildRuntimeAgentTask, tiefe Payload,
Retryreservierung, spätere passende Kandidaten, Gesamt-/Phasen-/Bytebudgets.
Deadline wird nur als Zahl weitergereicht/geprüft; keine Uhr-/Remotevollstreckung,
keine tatsächliche Rechnung oder Modellnutzung. **Scale-slicing:** synthetischer
Vierdateiengraph prüft Determinismus, SCCzusammenhalt, Coverage/Boundary und
unabdeckbare SCC bei maxFiles1 sowie fehlende Tokencounts; kein Großrepo- oder
Realimportnachweis. **Quality-corpus:** liest 14 gespeicherte Fälle und Baseline,
prüft je Risiko clean/defect, IDs/Pfade, Prioritäten, Taskdigest, Variantennamen
und gespeicherte Perfectmetrics. Führt weder die Fälle noch Modellreview aus.
Die grünen Metricassertions sind ein Konsistenzcheck historischer Baseline,
kein neuer Recall-/Precisionnachweis. **Evidence-authority:** prüft allein, dass
Bundlecontext mit seinem Digest als reviewed-source angeboten wird; Herkunft/
Erreichbarkeit/Berechtigung des ursprünglichen Bundles liegt außerhalb des Tests.

## Abgestimmte fremde vollständige Leseabdeckung

Observer bestätigte die folgenden 12 Dateien mit Suffix `.unit.test.mjs`:
`review-slicing`, `review-bundle-contract`, `review-bundle-snapshot`,
`review-context-selection`, `review-context-production`, `review-stage-input`,
`review-stage-verification`, `protocol`, `review-proposal-preflight`,
`review-verification-reconciliation`, `review-fact-extractors`, `review-graph`;
zusätzlich `package-boundary.test.mjs`.

Buster bestätigte 19 Dateien mit Suffix `.unit.test.mjs`:
`review-governor`, `review-report-contract`, `review-report-builder`,
`simplification-contract`, `simplification-miner`, `simplification-manifest`,
`simplification-fact-producer`, `echo-review-output`, `echo-review-verification`,
`review-verdict-policy`, `review-verified-findings`, `review-policy-contract`,
`review-invariants`, `review-policy-resolver`, `review-policy-profiles`,
`review-reducer`, `review-decision-matrix`, `review-contract-parity`,
`review-evaluation-metadata`; außerdem Fixture review-governor.mjs.
Sein Governorimport führte authority/contextproduction/slicing aus, war aber
für ihn keine vollständige Lesung; diese sind durch obige Eigentümer abgedeckt.
Details `review-policy-subreview.md`, Ausführung `review-policy-tests.txt`.

Auditchild bestätigte acht Dateien mit Suffix `.unit.test.mjs`:
`repository-audit-stage`, `repository-revalidation`, `repository-review-profile`,
`review-content-cache`, `scalable-review-compiler`, `scalable-review-jobs`,
`scalable-review-topology`, `scalable-review-verification`.
Details `review-audit-subreview.md`. Hier keine erneute eigene Volllektüre von
Jobs/Topology/Verification behauptet; dies ist explizit deren zugewiesene Prüfung.

Abgleich der vereinigten Listen mit den direkten `tests/*test.*`-Dateien:
**50 Dateien vorhanden, 50 eindeutige Namen abgedeckt, keine Lücke.**
Das zählt vollständige verteilte Leseabdeckung, nicht 50 bestandene Tests.

## Ausführungsstand aus den Eigentümerberichten

Observer: Original npm test scheiterte im Compilerbenchmark bei 52.195 ms;
vorherige Suites bis Contentcache bestanden (`review-all-original-tests.txt`).
Separat 13 Gateoriginaltests einschließlich Stage/Livefunktion/Packageboundary
Exit0 (`review-gate-original-tests.txt`). Buster: seine 19 Originaltests Exit0.
Auditchild: sieben Originaltests Exit0; separater Compiler wieder Exit1 bei
47.693 ms gegen 45.000-ms-Assertion. Keine abschließend belegte Ursache für die
Laufzeitüberschreitung und kein bestandener vollständiger npm-test-Befehl.
Diese Nachprüfung startete keinen weiteren Lauf und änderte keine Tests.
