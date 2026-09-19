# AP09 — Ausführungsplan zur vollständigen zentralen Dokumentation

Stand: 19.09.2026
Status: AP09.0 bis AP09.5 intern abgeschlossen und für unabhängige Abnahme bereit
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

**Status:** Intern abgeschlossen am 19. September 2026. Die unabhängige
Read-only-Abnahme des Gesamtplans bleibt offen.

- Nova Core vollständig erklären: Compile, Graph, Registry Snapshot, State,
  Scheduling, Dispatch, Effects, Wait/Resume, Repair, Cancellation, Recovery,
  Audit und Fehler.
- Plugin Discovery, Admission, Activation, Replacement, Isolation, Config,
  State, Compatibility und Removal bis zur Implementierung verfolgen.
- Package-, Registration-, Capability- und Role-Identitäten samt Authority
  und unveränderlichen Digests erklären.

**Gate:** Ein technischer Leser kann einen Request und ein Plugin durch Nova
verfolgen, jede Autoritätsgrenze begründen und die sicheren Fehlerwege nennen.

**Geliefertes Ergebnis:** Die 38 zugeordneten Anforderungen `ARC-001` bis
`ARC-006`, `NVC-001` bis `NVC-018` und `PLG-001` bis `PLG-014` besitzen nun
einen zusammenhängenden Leserweg. `nova-core.md` verfolgt Projektaufnahme,
Graph, Registry Snapshot, Run Root, Scheduling, Attempt Authority, Lifecycle,
Retry, Repair, Wait, Effects, Artefakte, Shutdown, Recovery, Buster-Handoff,
Audit und sichere Fehlerreaktionen. `plugin-runtime.md` verfolgt ein Package
von Installation und inerter Discovery über Trust, Registry, Auswahl, Grants,
Konfiguration, Import Audit und Activation bis zu Isolation, State, Effects,
Replacement und Removal. `components-and-authority.md` verbindet diese
Mechanismen mit einer vollständigen Boundary-Matrix für Producer, Consumer,
Vertrag, Transport, autoritative Persistenz, Retention und Ausfallwirkung.

Die Nova-Fehlerreferenz gruppiert alle operativ unterschiedlichen
Fehlerfamilien nach Auslöser, Lifecycle-Wirkung, Retry-Regel und sicherer
Operatoraktion und verlinkt die exakten Throw-Sites. Das rekursive,
maschinen-generierte Einzelinventar jedes Error Codes bleibt als gemeinsame
Driftkontrolle in AP09.11. Diese Trennung verhindert, dass eine lange
generierte Liste die Entscheidungshilfe ersetzt.

**Interne Prüfung:** `docs:core-guides:check` bindet alle 52 Anforderungen an
gepflegte Inhaltsmarker. Er prüft zusätzlich 182 revisionsfeste Quelllinks,
gültige Zeilenbereiche und die Bytegleichheit aller 108 zitierten Dateien mit
der Evidence-Revision sowie Navigation und Surface-Coverage für Nova, Plugin
Runtime und Worker Core. Der Check bindet außerdem
28 Capabilities, 89 Registry-, Config-, Package-, State-, Recovery- und
Isolation-Diagnosen, 446 Nova-Kennungen an
Entscheidungsfamilien und 223 konkrete Worker-Fehlerkennungen an den aktuellen
Quellbestand. Zusätzlich müssen
`docs:publication:check`, `docs:check:refs`, `docs:site-boundary:check` und die
Vertragsprüfungen für das Plugin-v2-Basisschema, die Plattformkonfiguration,
die Registry, den Lifecycle und die Capability Runtime erfolgreich sein.

### AP09.3 — Worker Core und native Ausführung

**Status:** Intern abgeschlossen am 19. September 2026. Die unabhängige
Read-only-Abnahme des Gesamtplans bleibt offen.

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

**Geliefertes Ergebnis:** Alle 14 Anforderungen `WKC-001` bis `WKC-014`
besitzen mit `worker-core.md` einen kanonischen Deep Dive. Die Seite verfolgt
Profile, Protokollversionen, Wire-Felder, Claims, Admission, generische
Engine-Hooks, Logs, Evidence, Ressourcen, Trusted Launch, Control Channel,
Deadlines, Cancellation, Supervisor Authority, Ownership, Journal-Commit-
Grenzen, Restart, Result Seal und Retryentscheidungen. Sie enthält die
integrierte aktuelle Fehlerreferenz, eine sichere Retry-Matrix, den vollständigen
Weg für eine neue Engine und klar ausgewiesene Host- und Sandbox-Grenzen.

Die dokumentierten Source-Level-Verträge wurden mit den Worker-Contract-,
Attempt-Executor- und Local-Runtime-Prüfungen abgeglichen. Live-cgroup-,
Launcher- und Kernel-Isolation bleiben bewusst Umgebungsevidenz und werden
nicht aus Unit- oder Contract-Tests abgeleitet.

**Interne Prüfung:** `verify:worker-core:contracts`,
`verify:worker-core:attempt-executor`, `verify:worker-core:local-runtime` und
`docs:core-guides:check` müssen erfolgreich sein. Der Docs-Check prüft 60
direkte Worker-Codebelege und verwirft ungültige Zeilenbereiche.

### AP09.4 — Prism in Depth

**Status:** Intern abgeschlossen am 19. September 2026. Die unabhängige
Read-only-Abnahme des Gesamtplans bleibt offen.

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

**Geliefertes Ergebnis:** Die vier AP09.4-Anforderungen `SPC-002`, `SPC-003`,
`OPR-010` und `CDV-009` besitzen einen zusammenhängenden kanonischen
Leserweg. `prism.md` erklärt die
Produktgrenze und verbindet Runtime, Daten, Betrieb und Erweiterung.
`prism-runtime.md` verfolgt Control, Agent Bridge, Worker, Worker Core, Engine,
Studio, Ingestion und Pipeline Adapter durch Authentisierung, Readiness,
Request-, Job-, Session-, Cancellation- und Recovery-Flüsse. `prism-data.md`
erklärt das vollständige Domain- und Speichermodell, alle 17 Migrationen,
Retrieval, Rights, Ranking, Rendering, Artefakte, Transaktionen, Locks, Backup
und Retention. `use/prism-studio.md` enthält alle 62 direkt aus der Runtime
gelesenen Einstellungen, alle 97 ausgelieferten Prism-Helm-Felder und alle 31
Prism-Kennungen des Deploy-Skripts. Die Seite trennt dabei bedienbare Werte von
intern abgeleiteten Variablen. Sie erklärt außerdem Deployment, Secrets,
Präzedenz, Diagnose, Recovery und den vollständigen Studio-zu-Nova-Weg.
`extend/platform/prism.md` ordnet jede unterstützte Änderung ihrem kleinsten
Owner und den nötigen Prüfungen zu.

Die Seiten unterscheiden implementierte Runtime-Wege, nur als Bibliothek
vorhandene Adapter, umgebungsabhängige Beweise und offene Produktgrenzen. Sie
dokumentieren insbesondere die fehlende Publikationssperre gegen parallele
Revisionen, den derzeit deterministischen Produktions-Provider, die fehlenden
produktiven Aufrufer der Buster-/Forge-Adapter, die standardmäßig deaktivierte
Public-Web-Ingestion sowie fehlende automatische Retention und vollständige
Disaster-Recovery-Evidenz.

**Interne Prüfung:** `docs:prism-guides:check` bindet alle vier
Anforderungen an gepflegte Inhaltsmarker. Er prüft 228 revisionsfeste
Quelllinks, gültige Zeilenbereiche, die Bytegleichheit von 101 zitierten
Implementierungsdateien, alle 62 Runtime-Einstellungen, alle 97 ausgelieferten
Helm-Felder, alle 31 Deploy-Kennungen, alle 17 Migrationen, die fünf
Engine-Operationen, Navigation und detaillierte Surface-Coverage.
Zusätzlich müssen der vollständige Dokumentationscheck, die Prism-Contract-
und TypeScript-Prüfungen sowie die verfügbaren fokussierten Prism-Tests
erfolgreich sein. Native PostgreSQL-, Browser-, cgroup-, Tailscale-, SPIFFE-
und Provider-Prüfungen bleiben ehrlich als umgebungsabhängige Abnahme getrennt.

### AP09.5 — Buster und zwölf Test-Suites

**Status:** Intern abgeschlossen am 19. September 2026. Die unabhängige
Read-only-Abnahme des Gesamtplans bleibt offen.

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

**Geliefertes Ergebnis:** Die sechs Anforderungen `SPC-001`, `SPC-008`,
`CFG-006`, `FLW-011`, `EXT-005` und `CDV-008` besitzen einen zusammenhängenden
kanonischen Leserweg. `buster.md` verfolgt Plan Resolution, signierten
Source Snapshot, Transport, Admission, Durable Store, Execution, Worker Core,
Provider, Evidence, Reports, Result Authority, Nova Import, Cancellation und
Recovery. `buster-namespace-controller.md` erklärt Lease Spec und Status,
Phasen, Immutability, RBAC, Credentials, Exposure Fencing, Retention, Release,
Fehler und alle ausgelieferten Helm-Werte.

`reference/buster-suites.md` trennt die zwölf tatsächlich ausgelieferten
Suite-Templates ausdrücklich vom Weg für eine eigene Suite. Jede Suite besitzt
Zweck, Grenze, konkrete Composition, vollständige verschachtelte
Providerkonfiguration, Defaults, Ports, Capabilities, Retry-Verhalten,
Evidence, Reports, Resultregeln, externe Voraussetzungen und Verifikation. Die
Referenz erfasst außerdem alle 19 installierten Provider-Verträge und den
JUnit-Adapter. Die erzeugte Referenz `buster-error-codes.md` inventarisiert alle
exakten Suite- und Providerfehler direkt aus den maßgeblichen Quelldateien. Der
Workflow enthält
eine vollständige gepflegte `.swarm/pipeline.json` mit JUnit Report,
checked-manifest Artifact, Kubernetes Fixture, typisierten Links und einer
zweifachen HTTP-Matrix. Der Docs-Check löst dieses Beispiel wirklich gegen die
ausgelieferten Templates und die aktuelle Registry auf; er prüft dadurch auch
Fixture-, Matrix- und Adapterbindung statt nur JSON-Syntax. Ein getrennter
vertikaler Beweis führt den lokalen Nova-zu-Buster-Pfad mit signiertem
Source-Snapshot, Worker Core, JUnit, Evidence-Import und Entscheidung aus.

`extend/buster.md` bleibt der öffentliche Provider-, Fixture-, Suite- und
Report-Adapter-Weg. `extend/platform/buster.md` ergänzt Plan-, Wire-, Engine-,
Result-, Capability- und Namespace-Core-Änderungen mit Compatibility-,
Recovery-, Error- und Change-to-check-Regeln.

**Interne Prüfung:** `docs:buster-guides:check` bindet alle sechs Anforderungen
an gepflegte Marker. Er prüft sieben Seiten, 117 revisionsfeste Quelllinks,
gültige Zeilenbereiche und 98 revisionsgebundene Implementierungsdateien. Er
prüft zwölf Suite-Templates, 19 Provider-Verträge und alle rekursiv gefundenen
Schemafelder einschließlich des API-Flow-Dokuments. Er prüft außerdem den
vollständigen Workflow-Resolve, den erzeugten exakten Fehlercodebestand,
Navigation und detaillierte Surface-Coverage. Zusätzlich müssen Suite Resolver,
Provider Registry,
Plan Runner, Remote Plan, Namespace-Controller-Tests und die vollständige
Dokumentationsprüfung erfolgreich sein. BuildKit-, Registry-, Kubernetes-,
Tailscale-, Browser-, Scanner-, SPIFFE- und cgroup-Prüfungen bleiben ehrlich als
umgebungsabhängige Live-Abnahme getrennt.

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
