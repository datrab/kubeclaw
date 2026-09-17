# AP09 — Ausführungsplan zur vollständigen zentralen Dokumentation

Stand: 17.09.2026  
Status: AP09.0 intern abgeschlossen und für unabhängige Abnahme bereit
Ziel: vollständige, eigenständige und dauerhaft pflegbare Produktdokumentation unter `docs/site`

## 1. Ausgangslage

Die unabhängige Prüfung des 251-Punkte-Katalogs fand elf falsche
Klassifikationen, mehrere fehlerhafte Nachweise und zehn nicht ausdrücklich
erfasste Produktoberflächen. Ein Teil der mechanischen Befunde wurde mit Commit
`0de4b7d64e3c83f28bdba2a968ff3e533378178d` bereits korrigiert. Dazu gehören der
Reference-Einstieg, 13 erkannte Workflows, gültige Evidence-Metadaten, ein
aktueller Blueprint und die eigenständige Reader-Site-Grenze.

Nach der Review-Reconciliation umfasst der Arbeitskatalog 261 Punkte. Der
geprüfte Ausgangsstand ist 47 vollständig, 144 zu erweitern und 70 fehlend.
Diese Zahlen werden aus dem Katalog maschinell geprüft. Ein grüner
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

Die geprüfte Datei liegt in
`docs/blueprint/generated/ap09-catalogue.json`. Der Befehl
`npm run docs:ap09:catalogue:check` erzeugt keine Dateien und verwirft den
Build bei fehlenden oder doppelten IDs, falschen Summen, unbekannten Zuständen,
leeren Ownern, nicht kanonisch sortierten Zeilen, fehlenden Paketen im Plan,
Zielen außerhalb von `docs/site`, fehlenden Zielseiten vollständiger Punkte
oder einer veralteten Ausgabe. Jedes Ziel ist als `current` oder `planned`
markiert. `docs:check:generated` und damit der Docs-CI-Weg führen diese Prüfung
aus.

**Gate:** Ein unabhängiger Read-only-Check bestätigt Katalog, Einstufungen,
Quellen und Rechenweg.

### AP09.1 — Wahrheit, Autorität und Leserwege

**Status:** Intern abgeschlossen am 17. September 2026. Die unabhängige
Read-only-Abnahme des Gesamtplans bleibt offen.

- Nachgewiesene Falschaussagen zuerst korrigieren: Ops-Pod-Rechte,
  Resume-Signal, Worker-Result-Authentizität und Capability-Arten. Die
  zuständigen späteren Pakete schließen weiterhin die vollständigen
  Anforderungen; AP09.1 beseitigt vorab nur Aussagen, die nachweislich falsch
  sind.
- Einstieg, Status, Entscheidungen und Evidence-Grenzen vereinheitlichen.
- Für jede Kernaufgabe den kürzesten vollständigen Weg festlegen.
- Tatsächliche Produktgrenzen klar von fehlender Live-Abnahme trennen.

Die Regeln, das Oberflächeninventar und die maschinenlesbare Seiten-Ownership
entstehen in AP09.1. Exhaustive Faktengeneratoren bleiben bei AP09.11. Die
Publication muss die Redirect-Registry in AP09.12 noch wirksam anwenden. Der
vollständig ausführbare erste Pipeline-Weg bleibt bei AP09.9. AP09.1 verlinkt
diese Ziele ehrlich und behauptet ihren Abschluss nicht vorzeitig.

**Gate:** Kein bekannter falscher Satz bleibt als aktuelle Produktwahrheit
sichtbar. Alle Hauptaufgaben sind vom Site-Einstieg erreichbar.

**Geliefertes Ergebnis:** Die 14 Anforderungen `GOV-001` bis `GOV-004`,
`GOV-006`, `GOV-008`, `ENT-001` bis `ENT-004`, `DEC-001`, `DEC-002`,
`STA-001` und `STA-002` haben nun kanonische Leserziele. Die Site besitzt ein
vollständiges Oberflächeninventar, zusammenhängende Architektur-, Operator-
und Entwicklerpfade, einen dokumentierten Authority- und Ownership-Vertrag
sowie eine maschinenlesbare Seitenkarte. Generatoren prüfen Metadaten,
Ownership, Reader-Routen, Capability-Namespaces und das Resume-Signal-
Beispiel. Die Publication prüft außerdem alle 84 Surface-IDs mit ihren
Leserzielen, Quellautoritäten und Coverage-Werten sowie die strukturellen
Pflichtfelder der nummerierten und gruppierten Decision Records. Zusätzlich
sind die vier oben genannten Falschaussagen korrigiert.

`GOV-005`, `GOV-007` und `ENT-005` bleiben bewusst bei AP09.11, AP09.12 und
AP09.9. Damit verwechselt AP09.1 weder die Governance-Regel mit ihrer
vollständigen Anwendung noch eine Redirect-Registry mit wirksamen Redirects
oder einen Leserpfad mit einem ausführbaren ersten Pipeline-Beispiel.

**Interne Prüfung:** `docs:check:generated`, `docs:blueprint:check`,
`docs:check:refs`, `docs:site-boundary:check`, `docs:check:coverage`,
`docs:publication:check` und `docs:publication:build` müssen erfolgreich sein.

### AP09.2 — Nova Core und Plugin Runtime

- Nova Core vollständig erklären: Compile, Graph, Registry Snapshot, State,
  Scheduling, Dispatch, Effects, Wait/Resume, Repair, Cancellation, Recovery,
  Audit und Fehler.
- Plugin Discovery, Admission, Activation, Replacement, Isolation, Config,
  State, Compatibility und Removal bis zur Implementierung verfolgen.
- Package-, Registration-, Capability- und Role-Identitäten samt Authority
  und unveränderlichen Digests erklären.

**Gate:** Ein technischer Leser kann einen Request und ein Plugin durch Nova
verfolgen, jede Autoritätsgrenze begründen und die sicheren Fehlerwege nennen.

### AP09.3 — Worker Core und native Ausführung

- Profile, Claims, Admission und die neutrale Worker-Authority erklären.
- Control Channel, Process Launch, Process Groups, Sandbox, Spool und
  Log-Decoding dokumentieren.
- Ressourcenreservierung, Deadlines, Cancellation und Termination verfolgen.
- Attempt Journal, Ownership Store, Restart, Cleanup und Result Seal samt
  beschädigten oder unklaren Zuständen erklären.
- Verträge, Fehlercodes, Migrationen und die Integration externer Engines
  referenzieren.

**Gate:** Ein neuer Worker-Core-Entwickler kann einen nativen Attempt vom Claim
bis zum versiegelten Ergebnis oder sicheren Recovery Stop verfolgen.

### AP09.4 — Prism in Depth

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

### AP09.5 — Buster und zwölf Test-Suites

- Buster Engine, Plan Resolution, Admission, Remote Store, Source Snapshot,
  Provider, Evidence, Reports, Result Authority, Signing, Import und Recovery
  als zusammenhängendes Produkt erklären.
- Namespace Broker, Controller und Lease API mit CRD-Transitionen, Fencing,
  Credentials, Retention, Release und Fehlergrenzen dokumentieren.
- Alle Felder, Defaults, Identitäten, Abhängigkeiten, Matrizen, Gates,
  Retries, Fixtures, Provider und Reports der Buster-Testplanung erklären.

Die folgenden zwölf Suite-Templates werden einzeln dokumentiert:

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

Jede Suite braucht Zweck, Einsatzgrenze, vollständige Konfiguration, Defaults,
Provider- und Fixture-Auswahl, Abhängigkeiten, Artefakte, Reports,
Pass/Fail/Skip-Regeln, Fehlercodes, externe Voraussetzungen, Beispiel,
Anpassung und Verifikation. Eigene Wege zeigen, wie ein Leser eine vorhandene
Suite erweitert und eine neue Suite mit Vertrag, Schema, Provider/Fixture,
Registrierung, Rollenpaket, Resolver, Evidence, Errors, Tests, Kompatibilität
und Dokumentation hinzufügt.

**Gate:** Ein Leser kann jede Suite konfigurieren, ausführen, diagnostizieren
und erweitern sowie eine neue Suite ohne verborgenes Wissen integrieren.

### AP09.6 — Lint

- Pre-check, Full Lint, Executor und Report Adapter mit ihrer Autorität erklären.
- Alle Regeln und Tools als erzeugte Referenz inventarisieren.
- Discovery, Targets, Scopes, Severity, Policy-Version, Defaults, Präzedenz,
  Baselines, Waivers, Debt, Fingerprints und Findings erklären.
- Kubernetes Policy Packs, immutable Pack Identity und Admission abdecken.
- Tool-Abwesenheit, Timeout, Process Termination, Parsing, Evidence Partition
  und Reportfehler dokumentieren.
- Geprüfte Wege für eine neue Regel, ein neues Tool, einen neuen Target-Typ und
  ein neues Policy Pack liefern.

**Gate:** Ein Leser kann jede Lint-Funktion konfigurieren und verifizieren und
alle unterstützten Erweiterungsarten ohne verborgenes Wissen integrieren.

### AP09.7 — Plattform, Spezialisten, Kommunikation, Daten und Sicherheit

- Pflichtabhängigkeiten wie Redis, PostgreSQL, Git Mirrors, OCI Registry,
  BuildKit und Tailscale vollständig integrieren.
- LiteLLM als eigenes Gateway mit Modellen, Embeddings, Credentials,
  Consumers, Readiness, Limits und Recovery erklären.
- Argo, Cilium und Monitoring als optionale Plattforminfrastruktur behandeln.
- Endpoint-, Transport-, Store-, Event-, Identity-, Secret-, Network- und
  Supply-Chain-Matrizen erstellen.
- Backup, Restore, Retention, Quotas, Datenverlust und Authority je Store
  dokumentieren.
- Forge, Echo, OpenClaw, Codex, Ops MCP und Archviewer als zusammenhängende
  Produkte und nicht nur als Plugin- oder Chart-Einträge dokumentieren.

**Gate:** Jede Laufzeitabhängigkeit hat Owner, Zweck, Consumer, Protokoll,
Konfiguration, Ausfallwirkung, Diagnose und Recovery.

### AP09.8 — Operator-Handbuch und vollständige Konfiguration

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

### AP09.9 — Pipeline und Workflows

- Alle Felder, Defaults, Identitäten, Abhängigkeiten, Matrizen, Gates, Retries,
  Fixtures, Provider, Reports, Evidence und Result-Import von `pipeline.json`
  erklären.
- Die Beziehung zu `.swarm/progress.json`, Scaffolding, atomarer Publikation,
  Kompatibilität und Repair erklären.
- Einen vollständigen Weg vom Checkout und der Konfiguration über Compile,
  Run, Audit und Artefakte bis Cleanup bereitstellen.
- Retry/Repair, Wait/Resume, Restart/Recovery, unklare Effects, Registry/Image,
  Tailscale, Redis-Ausfall, Worker-Abbruch und Demo Delivery als ausführbare
  Fehler- und Recoverypfade liefern.

**Gate:** Alle `pipeline.json`-Möglichkeiten sind referenziert und die
repräsentativen Workflows lassen sich ohne historische Quellen ausführen.

### AP09.10 — Developer-Handbuch und komplexe Plugins

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

### AP09.11 — Exhaustive Reference und automatische Driftkontrolle

- Die vorhandene Trennung generierter Fakten und redaktioneller Erklärungen
  auf jede exhaustive Referenzfamilie anwenden.
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

### AP09.12 — Publication und Reader Experience

- Die vorhandene Deprecation-/Redirect-Registry in der Publication wirksam
  anwenden und ihren statischen Fallback prüfen.
- Endgültige Navigation, Suche, Code-Evidence-Boxen und zielgerichtete
  Diagramme integrieren.
- Responsive Darstellung, Accessibility und stabile Links prüfen.
- Keine AP-, Review-, Migrations- oder temporären Arbeitsartefakte publizieren.
- Keine notwendige Aufgabe hinter internen Quellen oder optionalen
  Architekturverweisen verstecken.

Dieses Paket wird nach dem vollständigen Inhaltsbestand weiter in
Navigation/Search, Evidence Rendering, Visualisierung und Accessibility
aufgeteilt. Darstellung darf keine fehlende Information verdecken.

### AP09.13 — Integrierte Inhaltsabnahme

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

AP09.0 und AP09.1 kommen zuerst. AP09.2 bis AP09.10 werden danach thematisch in
kleinen, unabhängig prüfbaren Änderungen umgesetzt. AP09.11 beginnt, sobald
die zu erzeugenden Fakten und ihre Owner feststehen. AP09.12 folgt dem
inhaltlichen Bestand. AP09.13 ist die gemeinsame Abschlussprüfung.

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
