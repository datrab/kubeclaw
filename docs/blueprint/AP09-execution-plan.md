# AP09 — Ausführungsplan zur vollständigen zentralen Dokumentation

Stand: 17.09.2026  
Status: geplant; AP09.0-Review muss zuerst in den Katalog übernommen werden  
Ziel: vollständige, eigenständige und dauerhaft pflegbare Produktdokumentation unter `docs/site`

## 1. Ausgangslage

Die unabhängige Prüfung des 251-Punkte-Katalogs fand elf falsche
Klassifikationen, mehrere fehlerhafte Nachweise und zehn nicht ausdrücklich
erfasste Produktoberflächen. Ein Teil der mechanischen Befunde wurde mit Commit
`0de4b7d64e3c83f28bdba2a968ff3e533378178d` bereits korrigiert. Dazu gehören der
Reference-Einstieg, 13 erkannte Workflows, gültige Evidence-Metadaten, ein
aktueller Blueprint und die eigenständige Reader-Site-Grenze.

Nach der Review-Reconciliation umfasst der Arbeitskatalog 261 Punkte. Der
vorläufige Stand ist 45 vollständig, 146 zu erweitern und 70 fehlend. Diese
Zahlen werden in AP09.0 verbindlich neu erzeugt und geprüft. Ein grüner
Struktur-, Link- oder Generatorcheck ändert keine inhaltliche Einstufung.

## 2. Verbindliches Ergebnis

AP09 liefert den vollständigen zentralen Inhalt. Es löscht noch nicht pauschal
alle alten Quellen. AP10 entfernt ersetzte Dokumente nach einem nachgewiesenen
Inhaltsvergleich. AP11 führt die unabhängige Gesamt- und Pflegeabnahme aus.

Jeder AP09-Punkt benötigt:

1. eine eindeutige Leserfrage oder Leseraufgabe;
2. genau einen kanonischen Hauptort unter `docs/site`;
3. direkte Belege aus Code, Verträgen, Schemas, Konfiguration oder Tests;
4. tatsächliches Verhalten, beabsichtigte Entscheidung und offene Grenze als
   getrennte Aussagen;
5. Konfiguration, Defaults, Präzedenz, Fehler und Recovery, wenn sie zur
   Oberfläche gehören;
6. einen reproduzierbaren Check oder eine ausdrücklich begrenzte manuelle
   Abnahme;
7. eine Zuordnung zu Owner, Generator und Change-to-check-Weg.

Eine Seite ist nicht vollständig, nur weil sie existiert oder auf ein Schema
verweist. Ein Leser darf kein Package-README, Review-Dokument oder früheres
Gespräch benötigen, um eine unterstützte Aufgabe auszuführen.

## 3. Umsetzungspakete

### AP09.0 — Review-Reconciliation und verbindlicher Katalog

- Alle elf Review-Korrekturen gegen den aktuellen PR-Stand übernehmen.
- Die zehn neuen Punkte `SPC-008` bis `SPC-010`, `INF-012`, `OPR-010`,
  `FLW-017`, `CFG-016` bis `CFG-018` und `REF-018` aufnehmen.
- Veraltete Zählungen, Pfade und globale Befunde korrigieren.
- Alle 261 IDs genau einem Umsetzungspaket und einem kanonischen Ziel zuordnen.
- Den Katalog maschinenlesbar prüfen: eindeutige IDs, lückenlose Nummern,
  Summen, Zielseiten, Owner und Status.

**Gate:** Ein unabhängiger Read-only-Check bestätigt Katalog, Einstufungen,
Quellen und Rechenweg.

### AP09.1 — Wahrheit, Autorität und Leserwege

- Nachgewiesene Falschaussagen zuerst korrigieren: Ops-Pod-Rechte,
  Resume-Signal, Worker-Result-Authentizität und Capability-Arten.
- Einstieg, Status, Entscheidungen und Evidence-Grenzen vereinheitlichen.
- Für jede Kernaufgabe den kürzesten vollständigen Weg festlegen.
- Tatsächliche Produktgrenzen klar von fehlender Live-Abnahme trennen.

**Gate:** Kein bekannter falscher Satz bleibt als aktuelle Produktwahrheit
sichtbar. Alle Hauptaufgaben sind vom Site-Einstieg erreichbar.

### AP09.2 — Core, Runtime und Spezialistenarchitektur

- Nova Core vollständig erklären: Compile, Graph, Registry Snapshot, State,
  Scheduling, Dispatch, Effects, Wait/Resume, Repair, Cancellation, Recovery,
  Audit und Fehler.
- Worker Core vollständig erklären: Profile, Claims, native Authority,
  Control Channel, Process Launch, Spool, Ressourcen, Deadlines, Journal,
  Ownership, Cleanup und Result Seal.
- Buster, Forge, Echo, OpenClaw, Codex, Namespace Controller, Ops MCP und
  Archviewer als zusammenhängende Produkte und nicht nur als Plugin-Einträge
  dokumentieren.

**Gate:** Ein technischer Leser kann für jede Komponente erklären, was sie
besitzt, was sie nicht besitzt, welche Daten sie austauscht und wie sie nach
einem Fehler wieder einen sicheren Zustand erreicht.

### AP09.3 — Prism in Depth

Prism erhält einen eigenen Teilplan und darf nicht in einer allgemeinen
Komponentenübersicht verschwinden. Die Dokumentation umfasst mindestens:

- Control, Agent Bridge, Worker, Server, Studio, Ingestion und Pipeline Adapter;
- Domain Model, Projects, Design Documents, Rounds, Revisions, Operations,
  Approvals und immutable Baseline Bundles;
- Corpus, Retrieval, Embeddings, Ranking, Rechtefilter und Qualitätsmessung;
- Directions, Preferences, Evaluation, Renderer, Assets und Artefakte;
- PostgreSQL/pgvector, Migrations, Transactions, Pools, Locks, CAS und Backup;
- Request-, Event-, Job-, Session- und Datenflüsse zwischen allen Komponenten;
- Startup, Readiness, Authentisierung, Konfiguration, Limits und Abhängigkeiten;
- stale und konkurrierende Revisionen, Cancellation, Restart, Recovery und
  Retention;
- die vollständige Studio-Benutzerreise vom Projekt bis zu Approval, Export und
  Handoff;
- Erweiterungspunkte und sichere Änderungen an Control, Worker, Ingestion,
  Studio, Renderer, Retrieval und Storage.

Jeder Prism-Bereich braucht eine verständliche Begründung seiner Grenzen und
direkte Code- oder Vertragslinks. Datenbank- und Browserprüfungen müssen ihre
tatsächliche Umgebung nennen.

**Gate:** Ein neuer Prism-Entwickler kann einen Request und seine Daten durch
alle Komponenten verfolgen, eine unterstützte Änderung planen, die richtigen
Checks auswählen und Fehler ohne historische Dokumente diagnostizieren.

### AP09.4 — Plattform, Kommunikation, Daten und Sicherheit

- Pflichtabhängigkeiten wie Redis, PostgreSQL, Git Mirrors, OCI Registry,
  BuildKit und Tailscale vollständig integrieren.
- LiteLLM als eigenes Gateway mit Modellen, Embeddings, Credentials,
  Consumers, Readiness, Limits und Recovery erklären.
- Argo, Cilium und Monitoring als optionale Plattforminfrastruktur behandeln.
- Endpoint-, Transport-, Store-, Event-, Identity-, Secret-, Network- und
  Supply-Chain-Matrizen erstellen.
- Backup, Restore, Retention, Quotas, Datenverlust und Authority je Store
  dokumentieren.

**Gate:** Jede Laufzeitabhängigkeit hat Owner, Zweck, Consumer, Protokoll,
Konfiguration, Ausfallwirkung, Diagnose und Recovery.

### AP09.5 — Operator-Handbuch und vollständige Konfiguration

- Installation, Start, Beobachtung, Signal/Resume, Abbruch, Diagnose,
  Sicherung, Restore, Upgrade, Rollback und Stilllegung vervollständigen.
- Ein gültiges vollständiges `resume-signal.v2`-Beispiel mit Issuance- und
  Idempotenzregeln liefern.
- Alle Operator-Konfigurationsquellen, Defaults, Präzedenz und Consumer
  integrieren.
- `swarm.config.json`, Helm-Overrides, Secrets, Environment und GitOps Values
  mit ihrem effektiven Ergebnis erklären.
- Prism/Studio und Demo Delivery bis zur getrennten menschlichen Acceptance als
  ausführbare Benutzerwege dokumentieren.

**Gate:** Jeder Ablauf besitzt Zweck, Voraussetzungen, Schritte, erwartete
Beobachtung, Fehler, Stop-Regel und Recovery.

### AP09.6 — Pipeline, zwölf Test-Suites und Lint

#### Pipeline und Buster

- Alle Felder, Defaults, Identitäten, Abhängigkeiten, Matrizen, Gates, Retries,
  Fixtures, Provider, Reports, Evidence und Result-Import von `pipeline.json`
  erklären.
- Die Beziehung zu `.swarm/progress.json`, Scaffolding, atomarer Publikation,
  Kompatibilität und Repair erklären.

#### Zwölf bestehende Suites

Die folgenden Suite-Templates werden einzeln dokumentiert:

1. `unit`
2. `container-build`
3. `kubernetes-fixture`
4. `http`
5. `tailscale-exposure`
6. `api`
7. `a11y`
8. `perf`
9. `visual`
10. `e2e`
11. `security`
12. `size-budget`

Für jede Suite sind mindestens Zweck, Einsatzgrenze, vollständige
Konfiguration, Defaults, Provider- und Fixture-Auswahl, Abhängigkeiten,
Artefakte, Reports, Pass/Fail/Skip-Regeln, Fehlercodes, externe
Voraussetzungen, Beispiel, Anpassung und Verifikation erforderlich.

Zusätzlich entstehen zwei durchgehende Entwicklerwege:

- eine bestehende Suite sicher um neue Konfiguration oder Tests erweitern;
- eine vollständig neue Suite mit Vertrag, Schema, Provider/Fixture,
  Registrierung, Rollenpaket, Resolver, Evidence, Errors, Tests,
  Kompatibilität und Dokumentation hinzufügen.

#### Lint

- Pre-check, Full Lint, Executor und Report Adapter mit ihrer Autorität erklären.
- Alle Regeln und Tools als erzeugte Referenz inventarisieren.
- Discovery, Target-Auswahl, Scope, Severity, Policy-Version, Defaults,
  Präzedenz, Baselines, Waivers, Debt, Fingerprints und Findings erklären.
- Kubernetes Policy Packs, immutable Pack Identity und Admission abdecken.
- Tool-Abwesenheit, Timeout, Process Termination, Parsing, Evidence Partition
  und Reportfehler dokumentieren.
- Wege für eine neue Regel, ein neues Tool, einen neuen Target-Typ und ein neues
  Policy Pack mit Tests und Driftchecks liefern.

**Gate:** Ein Leser kann jede bestehende Suite und Lint-Funktion korrekt
konfigurieren, erweitern und verifizieren. Er kann außerdem eine neue Suite oder
Lint-Erweiterung ohne verborgenes Wissen integrieren.

### AP09.7 — Developer-Handbuch und komplexe Plugins

- Vollständiges Repository-, Workspace-, Toolchain-, Service- und
  Credential-Setup liefern.
- Build-, Test-, Release-, Compatibility- und Change-to-check-Wege erklären.
- Component-Change-Guides für Nova, Worker, Buster, Prism, Registry, SDK,
  Telemetrie, Charts/GitOps, Ops MCP und UI liefern.
- Die öffentliche SDK-API mit Exporten, Types, Helpers, Testing API, portablem
  JSON und Identity-/Digest-Regeln referenzieren.

Der 51-Paket-Katalog bleibt das Inventar. Große Plugins erhalten zusätzlich
eigene Tiefenguides. Größe wird nicht nur über Zeilen bestimmt. Ein Plugin gilt
als komplex, wenn es mehrere Registrierungen, verschachtelte oder bedingte
Konfiguration, externe Effekte, eigene Persistenz, mehrere Tools/Provider oder
einen eigenen Erweiterungsweg besitzt.

Für jedes komplexe Plugin sind erforderlich:

- vollständige Funktionen und Registrierungen;
- rekursive Konfiguration mit Defaults und Bedingungen;
- Eingaben, Ergebnisse, Artefakte, Capabilities und Secrets;
- interne Erweiterungspunkte und bewusst geschlossene Grenzen;
- Lifecycle, Idempotenz, Retry, Cancellation, Recovery und Cleanup;
- Fehlerkatalog, Diagnose und sichere Operatoraktion;
- Änderung oder Erweiterung mit den dazugehörigen Tests.

**Gate:** Der Katalog verschweigt keine notwendige Package-README-Information.
Komplexe Plugins sind nicht auf eine generierte Top-Level-Schematabelle reduziert.

### AP09.8 — Exhaustive Reference und automatische Driftkontrolle

- Rekursive Schema-, Config-, CLI-, Contract-, Event-, Error-, Endpoint-,
  Store-, Capability- und Workflow-Inventare erstellen.
- Nova-Grants, Buster-Runtime-Capabilities und andere Namespaces klar trennen.
- Source-to-doc, Owner, Generator und Change-to-check maschinenlesbar verbinden.
- Generierte Fakten und authored explanations mit getrennten Ownern prüfen.
- Mutation-Tests für neue öffentliche Felder, Error Codes und Registrierungen
  hinzufügen.

Dieses Paket wird vor Beginn anhand der fertigen Inventare weiter zerlegt. Eine
einzige große Generatoränderung ist kein akzeptabler Ersatz für prüfbare
Teilresultate.

### AP09.9 — Publication und Reader Experience

- Endgültige Navigation, Suche, Code-Evidence-Boxen und zielgerichtete
  Diagramme integrieren.
- Responsive Darstellung, Accessibility und stabile Links prüfen.
- Keine AP-, Review-, Migrations- oder temporären Arbeitsartefakte publizieren.
- Keine notwendige Aufgabe hinter internen Quellen oder optionalen
  Architekturverweisen verstecken.

Dieses Paket wird nach dem vollständigen Inhaltsbestand weiter in
Navigation/Search, Evidence Rendering, Visualisierung und Accessibility
aufgeteilt. Darstellung darf keine fehlende Information verdecken.

### AP09.10 — Integrierte Inhaltsabnahme

- Alle 261 Punkte erneut gegen den fertigen Stand prüfen.
- Operator-, Extension-, Suite/Lint-, Prism- und Platform/Core-Developer-Proben
  unabhängig durchführen.
- Normal-, Fehler-, Resume-, Recovery- und Change-Workflows ohne Chat- oder
  Review-Kontext ausführen.
- Sprach-, Begründungs-, Evidence- und Wahrheitsgrenzen prüfen.
- AP10 eine nach Themen freigegebene Löschliste übergeben.

**Gate:** Jeder Punkt ist vollständig nachgewiesen oder besitzt eine explizit
genehmigte Nichtanwendbarkeitsentscheidung. Keine bloße Überschrift, kein Link
auf ein Schema und kein grüner Build gelten allein als Inhaltsabnahme.

## 4. Reihenfolge und Änderungsgröße

AP09.0 und AP09.1 kommen zuerst. AP09.2 bis AP09.7 werden danach thematisch in
kleinen, unabhängig prüfbaren Änderungen umgesetzt. AP09.8 beginnt erst, wenn
die zu erzeugenden Fakten und ihre Owner bekannt sind. AP09.9 folgt dem
inhaltlichen Bestand. AP09.10 ist die gemeinsame Abschlussprüfung.

Ein Teilpaket darf weitere Unterpakete erhalten, wenn ein einzelner Review sonst
Prism, Suites, Lint, Konfiguration oder Referenzen nur oberflächlich prüfen
könnte. Vollständigkeit hat Vorrang vor einer kleinen Nummernliste.

## 5. AP09-Abschluss

AP09 ist abgeschlossen, wenn:

- alle 261 Katalogpunkte den Abschlusszustand erfüllen;
- Prism und seine Bestandteile in der festgelegten Tiefe dokumentiert sind;
- alle zwölf Suites konfigurierbar und erweiterbar dokumentiert sind;
- ein neuer Suite-Weg vollständig und geprüft ist;
- Lint-Regeln, Policy und Erweiterungswege vollständig dokumentiert sind;
- jedes komplexe Plugin seine vollständige Konfiguration und Erweiterungsgrenze
  besitzt;
- `docs/site` eigenständig, korrekt verlinkt und frei von interner
  Arbeitssprache bleibt;
- Generatoren neue öffentliche Oberflächen erkennen statt sie still zu
  übersehen;
- offene Produktimplementierung und Live-Abnahmen weiterhin getrennt bleiben.
