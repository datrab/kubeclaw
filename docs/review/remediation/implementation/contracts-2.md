# WP01 — Agent-, Prism- und Test-Gate-Verträge

Arbeitsstand 2026-09-09, ursprüngliche Codebasis `85ddfcbf`. Keine Register-,
Commit-, CI-, Deployment- oder Produktionsfreigabe. Historische Reviews bleiben
unverändert; folgende Nachweise wurden gegen tatsächliche lokale Implementierungen
neu ausgeführt.

## Vorher bestätigte Defekte

Im unveränderten ursprünglichen Checkout bestanden die historischen Probes:
`agent-contract-depth.mjs` (10000 Arrays, RangeError), `prism-contract-repro.mjs`
(Viewpatch akzeptiert/Originalrenderer scheitert; 3000 Nodes in 239726 Bytes,
RangeError), `test-gate-contract-repro.mjs` (Typedeklaration mit Artifact am Wire
abgelehnt) und `nova-resolver-examples.mjs` (beide Originalbeispiele wegen
schemaId abgelehnt). Pfade jeweils `docs/review/evidence/`.

Zusätzlich wurde das neue TypeScript-Negativfixture gegen die originalen Typen
kompiliert: TS2578, ungenutztes `@ts-expect-error`, bestätigt die unerlaubt breite
Typoberfläche. Nach Änderung kompiliert derselbe Fall mit erwarteter
Fehlerunterdrückung, während zulässige Dateideklaration und `EvidenceRefV1`
mit gespeicherter Artifactidentität weiterhin typisieren.

## Änderungen und verbindliche Grenzen

- **PCR-AGENT-CONTRACT-001:** Ein iterativer ganzer Eventdurchlauf vor allen
  rekursiven Feldprüfungen zählt Tiefe und serialisierte Wertvorkommen, erkennt
  Zyklen und lehnt eigene enumerierbare Accessors ohne Getterausführung ab.
  Maximal Tiefe 256 (Eventwurzel 0) und 2621440 Werte; der Nodewert ist aus der
  vorhandenen absoluten 5-MiB-Grenze und der Minimalgröße eines Arrayelements
  abgeleitet. Aliase bleiben zulässig und werden pro Vorkommen gezählt. Fehler
  liefern `ok:false`; Assert benutzt weiterhin den typisierten ContractError.
  Byteprüfung bleibt beim vorhandenen `checkPayloadSize`/Transport. Die echte
  Extensiongenerierung kopiert die neue Quelldatei mit.
- **PCR-PRISM-CONTRACT-001:** Viewstate-/Responsivepatches dürfen wie vorhandene
  Componentpatches `component`/`itemComponent` nicht umstellen. Auch existierende
  Referenzziele werden nicht als Ausnahme zugelassen. Fachliche Retargetierung
  erfolgt am kanonischen Node mittels Operation. Varianten-/Overrideziele werden
  bei sämtlichen Patcharten mit derselben Referenzprüfung geprüft. Weil der
  referenzierte Componentgraph unverändert bleibt, behalten kombinierte State-
  und Viewportauswahl dieselbe Zielidentität. Kein Renderer-Ersatz oder Leerbox-
  Fallback. Bestehende Semantik wurde zur kontrollierbaren Prüfung aus dem großen
  Index in `document-semantics.ts` aufgeteilt; Componentmaps/-graphen werden
  wiederverwendet, tiefe/umfangreiche semantische Arbeit explizit begrenzt.
- **PCR-PRISM-CONTRACT-002:** Alle 18 Document-/Operation-/Enginevalidatoren sowie
  der öffentliche Nodecatalog-Aufruf prüfen iterativ vor Ajv: JSON-Tiefe 256,
  1 Million Werte/Properties, 32 MiB kodiertes JSON. Bytes entsprechen der
  Archivobergrenze und erlauben das bestehende 16M-Zeichen-Assetfeld. Kein kleines
  transportspezifisches Limit wird global erzwungen. Komponenten-/Patchtiefe
  zusätzlich 256, semantische Referenz-/Patcharbeit 1 Million Besuche; ein flacher
  serialisierter Componentgraph kann damit nicht unbegrenzt rekursieren.
  Die unabhängige Review fand zunächst eine insertion-order-abhängige DFSgrenze;
  memoizierte längste Abhängigkeitstiefe behebt dies. Regressionen akzeptieren
  256 und verwerfen 257 Komponenten in beiden Objektordnungen.
  Überschreitungen werfen `PrismContractError` mit Code und vorhandenem
  PRISM-Präfix. Browserfähige APIs, keine Node-Abhängigkeit in dieser Vorprüfung.
- **PCR-TEST-CONTRACT-001/002:** Entfernt ausschließlich das veraltete optionale
  Artifactfeld aus `DeclaredEvidenceV1` und schemaId aus den zwei Inputbeispielen.
  Die strenge Wiregrenze und getrennte gespeicherte Evidence bleiben erhalten.
  Vollständige Testeinbettung ergänzt tatsächliche registrierte Producer und
  Fixtures: API benötigt `api/deployment`, nicht eine globale unqualifizierte
  Deploymentquelle. Keine Resolveränderung oder Schemaoverridefunktion.

Schemas, Schemaversionen, Digests und Prism-Generatoroutput sind unverändert.
Keine SDK- oder generische Worker-Core-Änderung in diesem Teilauftrag. Semantische
Prüfungen sind weiterhin zusätzliche ausführbare Prüfungen zum Schema; ein
Schemadigest behauptet keine Identität dieses Zusatzcodes.

## Nachher ausgeführte Nachweise

- Alle drei Contractpaket-Typechecks, Agent- und Prism-Pakettests, Test-Gate-
  Pakettest. Agent prüft genaue Tiefengrenze 254/255 Arrays unter Eventmetadata,
  10000er Originalauslöser, Zyklen, Aliase und exakte Nodegrenze mit wiederverwendeten
  azyklischen Teilbäumen (kein millionenfacher Fixtureobjekt-Speicherbedarf).
- Prism: existierende Fixture-/CSPtests unverändert erfolgreich, neue echte
  JSON-3000-Nodeprobe kontrolliert abgelehnt; alle öffentlichen Validatorpfade,
  tiefes Batch, Zyklen, exakte Depth-/Node-/Bytegrenzen. Negative Ziele für
  Components, Varianten und Overrides in States, Responsive, Componentvarianten
  und Instanzoverrides; kombinierter gültiger State/Viewport mit Originaldomain
  aufgelöst und Originalrenderer gerendert. Echter PrismEngine/Workerbindingpfad
  lehnt übertiefes Dokument vor Ausführung ab.
- `node --test skills/prism/tests/domain.test.mts skills/prism/tests/engine.test.mts
  skills/prism/tests/studio-adapter.test.mts`: 28 Tests bestanden. Fachliche
  Domainregressionen anderer Agentarbeit sind in diesem integrierten Stand dabei;
  nicht als Behebung durch dieses Teilpaket ausgegeben.
- `npm run build:studio --prefix skills/prism`: tatsächlicher Vite-Browserbuild
  erfolgreich, nur bestehender Chunkgrößenhinweis. Keine Browsertest-/Service-
  E2E-Ausführung daraus abgeleitet.
- `npm test --prefix skills/common/plugins/openclaw-agent-observer`: Sync,
  Typecheck, Config-/Livefunction-/Packageboundarysuite bestanden. Tatsächliche
  Hooknormalisierung und generierte Quellkopie werden geprüft; kein Redis- oder
  OpenClaw-Produktionsdienst betrieben.
- `node tests/verification/contracts/check-pipeline-test-gate-contracts.mts`:
  elf unveränderte Hauptvertragsprüfungen bestanden.
- Neue Test-Gate-Suite: echte tsc-Negativ-/Positivprüfung, gültiges EvidenceManifest
  und unveränderte Ajv-Ablehnung mit Artifactfeld; alle zehn Plan-Deklarations-
  beispiele mit originaler Busterregistry/Novaresolver und vollständigen
  Quell-/Zielreferenzen. Kein Provider, Cluster, Browser oder externe Beispiel-URL
  wurde dazu ausgeführt. Zusätzliche Config-/Datendateien sind keine Planfragmente
  und werden nicht als zehn weitere Resolverpläne ausgegeben.
- Kanonisches ESLint auf allen neuen/geänderten TS-Implementationen und Tests
  erfolgreich, außer der unveränderten bereits vorhandenen `max-lines`-Schuld im
  Test-Gate-Typfile: vorher 423, nach Entfernen eines Feldes 422. Keine Regel
  abgeschaltet oder neue Baseline eingeführt. `git diff --check` bestanden.

## Grenzen

Die neuen Admissions arbeiten nach dem Parsen; sie begrenzen keine bereits
entstandene Parserallokation. Eigene Properties zu zählen kann selbst temporär
Schlüssellisten allokieren. Dies ist keine Totalitätsgarantie für beliebige
bösartige Proxyobjekte oder global veränderte JavaScript-Prototypen. Byte- und
komplexitätsbezogene Bibliotheksgrenzen ersetzen niedrigere Transport-, Renderer-
Expansion-/Output- oder Betriebsbudgets nicht. Tiefere bisher unbeschränkte Daten
werden nun ausdrücklich abgelehnt, niemals abgeschnitten. Die unabhängige
Teilreview bestätigte anschließend die korrigierte Grenze (auch 4000 Komponenten
in beiden Ordnungen) und meldete keinen weiteren konkreten Blocker. Die
vollständige integrierte Pflichtsuite erfolgt beim Integrator.
