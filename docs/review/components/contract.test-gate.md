# contract.test-gate — gemeinsame Testplan-, Ergebnis- und Gateverträge

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Code-, Schema-, Gegenstellen- und Testreview; lokale Vertragsprüfungen bestanden.
Keine Aussage über eine produktive Buster-/Cluster-/Browserausführung.

## 1. Verantwortung, Grenzen und tatsächliche Verwendung

`contracts/pipeline-test-gate/v1` ist eine aktive Bibliothek, kein Dienst.
Vollständig untersucht: fünf Quelldateien (types, validation, remote,
gate-decision, index), Paket/Typecheckkonfiguration, alle 49 Definitionen des
Hauptschemas, vier zusätzliche Schemas, zwölf Suitevorlagen und zwanzig Beispiele.
Exports: `@kubeclaw/pipeline-test-gate-contract`, Hauptschema und E2E-Schema.
Die Suite-/Browserdateien sind zusätzliche Repositoryassets, keine eigenen
registrierten Provider. Nova lädt Suitevorlagen in den Resolver; konkrete
Testimplementierungen liegen in den Buster-Plugins.

Beidseitig verfolgte Übergaben:

- Registry `foundation/registry/build.ts:158,177` validiert Provider-/Reportregistrierung.
- Nova Resolver `core/test-gates/resolver.ts:279–323,748` prüft Vorlagen, bildet
  Template-Digest und validiert den aufgelösten Plan; Projektcompiler und
  remote-test-gate-Adapter prüfen den Plan ebenfalls.
- Nova `remote-dispatch.ts:56,84,113` bindet/persistiert den Auftrag; Buster
  `remote-plan-http.ts:103–116` autorisiert vor Body-/Vertragsprüfung.
  `remote-plan-service.ts:94–116` prüft Archiv, Signatur und Plan-/Requestidentität.
- Buster Runner `runner.ts:325–335,1159,1232,1741` prüft Invocation, Providerfacts,
  zusätzliche Count-/E2E-Semantik und den gespeicherten Attempt. Reportadapter-
  Runtime prüft normalisierte Reports separat (`report-adapter-runtime.ts:313`).
- Nova `remote-result-import.ts:100–164` prüft Result gegen ursprünglichen Plan
  und Status. Diese gesamte Datei wurde als Gegenstelle gelesen: exakte
  Knotenmenge, Provider/Scope/Execution/Testidentität, fortlaufende Versuche,
  Reihenfolge, Retrymaximum, finaler Versuch, terminaler Zustand und Receipts.
- Native Entscheidung geht über `parseGateDecision` an buster-quality-gate
  (`src/stage.ts:16–22`) und project-summary. Der Qualityadapter prüft zusätzlich
  die Run-ID gegen seine Lease und schreibt Entscheidungsartefakt vor Agentbewertung.

Diese Pfadprüfung schließt nicht die separaten vollständigen Reviews von
[nova.test-gates](nova.test-gates.md) und [buster.engine](buster.engine.md) ab.

## 2. Eingaben, Ausgaben, Schemas und Schnittstellen

Vierzehn Hauptdefinitionen: Registration, Configuration, ResolvedPlan,
Invocation, ProviderResult, AttemptResult, NodeResult, EvidenceManifest,
TypedLink, ReportRegistration, ReportResult sowie RemoteJob/Result/Status.
Gemeinsame Objekte sind geschlossen; provider-eigene `values`, Variation und
Wertports enthalten bewusst rekursive JSON-Daten. Konfiguration trägt
contractId/schemaDigest; Registrierung bindet Paketversion/contentDigest und
Entrypoint. Fixture-Modus ist null, Tests blocking/advisory. Module oder Gate
muss gesetzt sein. Fehlender `reviewAgent` bleibt im v1-Planschema zulässig,
wie der Regressionstest ausdrücklich fordert.

Provider liefern Fakten und Dateideklarationen ohne Receipt. Der Runner
speichert Evidence und ergänzt Artefaktreferenzen, Laufidentitäten,
Messwerte und Receipt im Attempt. NodeResult sammelt Versuche und den finalen
Zustand; vorab übersprungene Knoten erfinden keinen Attempt. TypedLinks trennen
Wertports mit schemaId von Artefaktports mit mediaType.

Semantik in `validation.ts`: Reportcounts einschließlich errored, eindeutige
Case-IDs und exakte Truncationzählung; stabile Testidentität aus Projekt/Scope/
Suite/Knoten/Variation; Archiv-/Plan-/Requestbindung; eindeutige Remote-Result-
Knoten/Attempts und deren Run-/Planbesitz; Status/Result/Error-Kombination und
Zeitreihenfolge. Standalone Planprüfung kontrolliert nicht seinen eigenen
planDigest; RemoteJob-Prüfung ergänzt das. Standalone Attempt-/Nodeprüfung
kontrolliert Digest, nicht alle Beziehungen; Nova-Import ergänzt sie.

Zusätzliche E2E-Prüfung bindet Schema-ID und Digest der tatsächlichen
Schemabytes, eindeutige Testfälle und exakte Countrelationen. Cypress-Beispiel
ist ein Konformitätsdatensatz, kein implementierter Cypress-Provider.
Browserprofile, Lighthouseprofile/-budgets und Visualmanifest sind weitere
Dateiformate. Visualprovider `src/provider.js:62–111` verwendet eigene Parser,
prüft reale Dateien/Digests, Profile und Pageconditions; die Schemas werden
nicht automatisch durch die Hauptvalidatorfunktion aufgerufen.

Zwölf Vorlagen: unit, http, api, a11y, e2e, visual, perf/Lighthouse, security,
container-build, kubernetes-fixture, size-budget, tailscale-exposure. Mehrere
sind absichtlich leer und werden über `add` konkretisiert. API-/Browser-/
Securityvorlagen benötigen zusätzliche Deployment-/Endpoint-/Artefaktinputs;
sie sind keine ohne Projektkontext ausführbaren Programme.

## 3. Zustandsänderungen, Persistenz und Nebenwirkungen

Import liest Haupt-/E2E-Schema synchron und kompiliert E2E-Ajv; ein privater
Validatorcache kompiliert die vierzehn festen Definitionen bedarfsweise.
Keine Plugin-Schema-IDs werden in diesen Cache aufgenommen: nicht derselbe
Reloaddefekt wie [PCR-REGISTRY-001](foundation.registry.md).
Hash-/Archiv-/Signaturfunktionen allokieren Daten, führen keine I/O-Schreib-
oder Netzoperation aus. Archive und signierte Statements sind außen gefroren;
Parserentscheidung wird tief geklont. Normale Validatoren geben keinen
immutable Snapshot zurück. Aufrufer müssen ihre eigene Snapshotgrenze halten.
Persist-before-dispatch, Evidenceimport und Jobspeicher liegen außerhalb.

## 4. Korrektheit und Fehlerbehandlung

`checkPipelineTestGateContract` liefert bei Schema-/bekannten Semantikfehlern
`{ok,errors}`; `validate...` wirft einen typisierten Fehler. Rekursive Ajv-
Validierung/Kanonisierung kann zusätzlich werfen; der API-Name allein
verspricht keine Totalfunktion. HTTP hat eine Fehlergrenze, Bibliotheksaufrufer
müssen Ausnahmen behandeln. Eine Ressourcenprobe für maximale JSON-Tiefe dieses
Vertrags wurde nicht ausgeführt; vorhandene Tiefenbefunde anderer Validatoren
sind kein Laufzeitbeleg hierfür.

Digestberechnung nutzt den strengen Observability-Kanonisierer, nicht den
abweichenden SDK-Serializer. Result-/Attempt-/Nodedigests lassen Digest und
Receipt aus; Receipt muss daher separat geprüft werden. Nova tut dies im
Import. `parseGateDecision:51–78` prüft Top-Level-Felder, Identitäten, Knoten,
Reviewreferenzen und Digest; passed darf keine blockierenden Effekte enthalten.
Die detaillierte Ableitung der Entscheidung aus Resulten geschieht im Nova-
Importer, nicht erneut aus einem isolierten Decisionobjekt.

## 5. Timeouts, Abbruch, Wiederholungen, Zustellung und Parallelität

Der Vertrag transportiert Timeout, RetryCount, retrySafe, Concurrencygruppen,
Capabilities und Ressourcenlimits, erzwingt aber keine Ausführungslimits.
Synchrone Validierung hat kein AbortSignal. Job-ID ist deterministisch aus
IdempotencyKey; derselbe Key mit verändertem Inhalt muss im Store konfligieren
(lokal am Originalstore getestet). Kein Exactly-once-Versprechen durch Hashes.
Variationsabhängige Testidentität bleibt von einzelnen Ausführungsversuchen
getrennt. Retry- und Zustandsübernahme sind Prüfaufgaben des Runners/Importers.

## 6. Neustart, Wiederaufnahme und externe Teilaktionen

Contracts erzeugen keine externen Teilaktionen. SourceSnapshot bezeichnet
committeten Gitbaum und exaktes Archiv; Working-Tree-Änderungen gehören nicht
hinein. Echter Git-/Archivtest bestätigt dies und reproduzierbare Bytes.
Job-/Resultdigests und Receipts ermöglichen Replayprüfung; sie ersetzen keine
Durability. Im gelesenen Importpfad werden Evidenceblobs vor dem Zustand
`complete` gespeichert; `pending_evidence` unterstützt erneuten Import.
Vollständige Remote-Prozessneustarts folgen im zuständigen Core-Review.

## 7. Authentifizierung, Autorisierung und Vertrauensgrenzen

Ed25519-Signatur ist domainsepariert durch `kubeclaw-source-snapshot-v1\0` und
bindet das kanonisierte SourceStatement inklusive Authority, Stage, Git-IDs
und Archivdigest/-größe (`remote.ts:63–104`). Erwartete Authority und Schlüssel
kommen vom vertrauenswürdigen Aufrufer. Jobvalidator allein prüft die
Signatur nicht kryptografisch; Buster-Service ergänzt genau diese Prüfung.
Tests mit falschem Schlüssel/Authority-/Statementänderung und falschem
Algorithmus/Version bestanden. Keine privaten Testschlüssel in Evidenz gespeichert.

Result-Receipts sind Hashidentitäten, keine Signaturen. Authentisierter
Transport, vertrauenswürdiger Buster und geschützter persistierter Plan bleiben
Annahmen. Grantliste wird gegen die Knotenmenge und sortierte Ordnung geprüft;
ob ein Grant tatsächlich erlaubt ist, entscheiden Registry und Runnerpolicy.
Relative Pfad-Schemata ersetzen kein realpath-/Symlink-Containment. Im Visual-
Gegenpfad ist zusätzlich realpath-Containment vorhanden. Die alte Auditbehauptung
„Evidence paths cannot escape“ ist allein als Schemanachweis zu weitgehend.

## 8. Ressourcenbegrenzung, Aufräumen und Aufbewahrung

Schema: Plan maximal 10000 Knoten/50000 Links, archivierter Job maximal 128 MiB
Roharchiv, Resultreferenz maximal 1 GiB, begrenzte Listen/JSON-Objektbreite.
Grantmap maximal 1024 Einträge begrenzt Remotepläne enger als das allgemeine
Planschema; Betreiber-/Resolverlimits müssen dazu passen. Rekursive JSON-Werte
haben keine gemeinsame Tiefen-/Gesamtbytegrenze. Große Bodies und base64-
Kopien benötigen engere Transport-/Storelimits. HTTP und Service übernehmen
solche Limits, keine Extremwertmessung in diesem Review. Cachegröße ist durch
feste Definitionen beschränkt. Keine eigene Aufbewahrung oder Cleanupworker.

## 9. Architektur und Vereinfachungsmöglichkeiten

Schema, manuelle TypeScript-Typen und manuelle Zusatzparser bilden mehrere
Vertragsquellen; PCR-TEST-CONTRACT-001 zeigt konkrete Drift. Später Typen aus
der maßgeblichen Definition ableiten oder strenge bidirektionale Paritätstests
verwenden; keine Adapter, die verbotene Artefaktfelder stillschweigend entfernen.
Gemeinsame Wireformen und aufruferabhängige Vertrauensprüfung sinnvoll trennen,
aber verbindlich dokumentieren, welche Prüfung an welcher Grenze erfolgt.
Native GateDecision besitzt keinen eigenen JSON-Schemaexport und einen
manuellen Parser: bei Erweiterungen explizite negative Konsistenztests ergänzen.

## 10. Tests und tatsächliche Aussagekraft

Vollständig gelesen und lokal ausgeführt, jeweils Exit 0:

- `check-pipeline-test-gate-contracts.mts`: elf Hauptformen, unbekannte Felder,
  Fixture/Mode, Skip/Cancel, Counts/Truncation und typed Inputs/Outputs.
- `check-pipeline-remote-plan-contracts.mts`: drei Remoteformen, Mutationen,
  canonical base64, Sourcebindung, echte FileNovaRemotePlanStore-Idempotenz.
- `check-pipeline-committed-source-snapshot.mts`: echte temporäre Git-Commits,
  Signaturen, Tar-Extraktion, untracked/dirty Ausschluss, Größenlimit/Optionsschutz.
- `decisions-and-snapshots.test.mts`: fünf Decisiondispositionen/Manipulation,
  echte Prozess-SIGKILL nach Snapshotpublikation und Korruptionsablehnung.
- Paket-Typecheck mit ursprünglichem tsconfig.

Zusatzprobe `test-gate-contract-repro.mjs`: drei Original-Beispieldateien gegen
Originalschemas, Cypressdatensatz gegen Originalvalidator, Pfadregex-Gegenprobe
und Artefakttypabweichung. Zwei Fehler der Reviewprobe (RegEx-Escapinginterpretation,
Ajv-Doppelregistrierung) samt Korrektur bleiben im Log; kein Produktbefund daraus.
Das Traceabilityscript wurde gelesen: es prüft Markdown-/Ledgerstruktur und
Statusformulierungen, keine Ausführung; nicht erneut als Laufzeitnachweis gewertet.
Provider- und Remote-Integrationstests werden bei ihren Komponenten gelesen;
die großen initialen Inventar-Testlisten bedeuten keinen Lauf aller dieser Tests.
Fehlende Nachweise: Typ-/Schema-Negativparität, Maximal-/Tiefenlast, vollständige
Remote-Neustarts und echte Browser-/Clusterprovider im aktuellen Umfeld.

## 11. Dokumentation und alte Reviews

Paket-README ist vorhanden, teilweise veraltet/unvollständig: aktive Funktionen
werden als „later phases“ beschrieben; Decisionparser, Signaturpflicht,
semantische Aufrufgrenzen und Zusatzdateien fehlen. Aussage „Two fields“ deckt
nicht alle offenen JSON-Stellen ab. Beispiele setzen externe Projektdateien/
Fixtureinputs voraus; Browserprofilbeispiel und Visualbeispiel verwenden
unterschiedliche Profilnamen, daher nicht als zusammen ausführbares Beispielset
verstehen. Dies für anschließende Dokumentationsarbeit sichtbar machen.

`pipeline-test-gate-phase-2-audit.md` vollständig erneut geprüft: getrennte
Attempt-/Nodeformen, Fixture/null-Mode, TypedLinks, Grants, Boundlisten und
Reportdetails sind implementiert und durch aktuelle Tests gestützt. Behauptete
Entfernung gespeicherter Artefakte aus Dateideklarationen gilt im Schema,
aber nicht vollständig im TS-Typ (Befund unten). Historische „complete“-/
„proved“-Ledgerwerte sind kein heutiger Laufzeitbeleg. Die Phasenpläne bleiben
Orientierung, keine Betriebsanleitung für die jetzige Implementierung.

## 12. Befunde, Ursachenbehebung und Unsicherheiten

### PCR-TEST-CONTRACT-001 — Dateideklaration erlaubt im Typ ein verbotenes Artefakt

- **Schweregrad: niedrig.** Aktuelle Wirevalidierung verhindert Annahme;
  die öffentliche Typoberfläche verleitet Providerautoren zu ungültigen Results.
- **Einordnung: nachgewiesener Defekt** der Typ-/Schemavertragskonsistenz,
  keine nachgewiesene Artefaktschleusung.
- **Belege:** `src/types.ts:195–201` enthält `artifact?: ArtifactRefV1`;
  EvidenceManifest.files und ProviderResult.evidenceFiles verwenden diesen Typ
  (213,252). Hauptschema `declaredEvidence:1098–1116` ist geschlossen und führt
  nur evidenceId/type/file/mediaType. Audit „Evidence Declaration and Stored
  Evidence Were Mixed“ behauptet bereits die Entfernung des Felds.
- **Auslöser:** Autor erstellt eine typkonforme Dateideklaration einschließlich
  existierender ArtifactRef; Originalvalidator lehnt dieselbe Deklaration ab.
  Reproduktion zeigt gültiges Manifest ohne Feld, Ablehnung nach Ergänzung.
- **Auswirkung:** Typecheck kann bestehen, Provider-/Manifestannahme scheitert
  erst zur Laufzeit. Kein aktueller Standardprovider als betroffen nachgewiesen.
- **Ursachenbehebung:** veraltetes Feld aus dem deklarativen Typ entfernen und
  StoredEvidence als separate Identität erhalten. Die strenge Laufzeitgrenze
  beibehalten; weder Schema lockern noch stillschweigend Feld wegfiltern.
- **Regression:** echtes TypeScript-Negativfixture muss `artifact` in einer
  `DeclaredEvidenceV1` zurückweisen; positiver StoredEvidence-Fall und
  unveränderte Original-Ajv-Ablehnung desselben unerlaubten Wireobjekts.

Weitere offene Fragen sind Ressourcen-/Decodergrenzen und externe Leser der
Dateischemas. Kein neuer Sicherheitsbefund allein aus fehlender isolierter
Querverifikation: die aufgeführten produktiven Gegenprüfungen wurden berücksichtigt.

### PCR-TEST-CONTRACT-002 — Beispiele deklarieren verbotenes Inputfeld

**Niedrig; nachgewiesener Dokumentationsdefekt.**
`examples/api-suite.json:10,14` und `examples/tailscale-exposure.json:7,15`
enthalten `inputs.*.schemaId`. Novas Originalresolver erlaubt dort nur
from/output/mediaType (`skills/nova/core/test-gates/resolver.ts:171–178`,
`types.ts:11–15`); die Schemaidentität kommt aus den registrierten Ports.
Beide Originalbeispiele mit echter Busterregistry an den Resolver übergeben:
`TEST_PLAN_FIELD_UNKNOWN` am schemaId, bevor eine Ausführung entstehen kann.
Auswirkung: dokumentierte Konfigurationsfragmente sind nicht direkt nutzbar.
Ursache beheben: Beispiele an die tatsächliche Deklarationsschnittstelle
anpassen, keine redundante schemaId-Overridefunktion hinzufügen.
Regression: alle Beispiele in ein vollständiges echtes Projekt einbetten und
mit Originalregistry/-resolver prüfen, einschließlich Suite-lokaler Referenzen.
[Probe — historischer Stand](https://github.com/datrab/kubeclaw/blob/762243be85ad661302dddafc36e7aeca45a8e197/docs/review/evidence/nova-resolver-examples.mjs),
[Resultat](../evidence/nova-resolver-examples.txt). Die Probe bestätigt die
unzulässigen Felder; sie behauptet nicht, dass deren Entfernung allein alle
externen Fixturebezüge vollständig macht. Rückprüfung aus nova.test-gates;
Vertragsreviewabschluss bleibt bestehen, Dokumentationsbefund ergänzt.
