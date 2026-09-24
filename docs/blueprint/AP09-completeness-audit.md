# AP09 Masterprüfung der Dokumentationsvollständigkeit

Stand: 17.09.2026  
Status: 261 von 261 Punkten nach Review-Reconciliation intern einzeln geprüft; unabhängige Abschlussprüfung von AP09.0 offen
Scope: aktive Produktdokumentation, Referenzen, Veröffentlichung und Pflegeautomation

## Zweck

Dieses Dokument ist die verbindliche Prüfliste vor der AP09-Veröffentlichungsarbeit.
Es verhindert, dass eine gut dargestellte, aber inhaltlich unvollständige
Dokumentation als fertig gilt.

AP06 bis AP08 bleiben für ihren erklärten Umfang abgeschlossen. Diese Masterprüfung
verwendet einen breiteren Maßstab: Die veröffentlichte Dokumentation muss alle
unterstützten Aufgaben und öffentlichen Oberflächen des aktuellen Produkts erklären.
Eine präzise erklärte Produktgrenze kann dokumentarisch vollständig sein. Eine nicht
erwähnte Grenze ist eine Dokumentationslücke.

Der endgültige Leserbestand liegt zentral unter `docs/site`. Ein Leser darf für das
Verständnis, den Betrieb oder die Erweiterung nicht auf historische Reviews,
Migrationsberichte oder verteilte Package-READMEs angewiesen sein. Code-nahe READMEs
können kurze Maintainer-Hinweise behalten, sind aber keine zweite Produktdokumentation.
AP10 entfernt temporäre und ersetzte Dateien erst, nachdem alle weiterhin benötigten
Informationen, Entscheidungen und offenen Arbeiten im zentralen Bestand angekommen
sind.

## Clean-Room-Migrationsregel

`docs/site` ist der bereits angelegte frische Zielort. Es wird kein weiterer
Dokumentationsbaum eröffnet.

1. Einen Prüfpunkt gegen Code, Verträge, Konfiguration, Tests und alle alten Quellen prüfen.
2. Vollständig gute zentrale Seiten in `docs/site` behalten und nur belegte Fehler korrigieren.
3. Teilweise gute Inhalte nicht als ganze Altdatei kopieren. Nur weiterhin gültige Fakten, Gründe und Verfahren in die kanonische Zielseite integrieren.
4. Fehlende Inhalte direkt in der geplanten zentralen Zielseite erstellen.
5. Mechanische Fakten aus Schemas, Manifests und Code generieren; Erklärungen redaktionell daneben pflegen.
6. Navigation, Quellenlinks, Beispiele, Checks und Leserweg am Ziel prüfen.
7. Erst danach alle ersetzten Reviews, Pläne, Runbooks, doppelten Referenzen und temporären Migrationsdateien des Themas in AP10 löschen.

Eine alte Datei bleibt während der Migration eine Quelle, aber niemals ein zweiter
kanonischer Leserpfad. Kein neuer Produkttext wird außerhalb `docs/site` angelegt.

## Verbindliche Zustände

| Zustand | Bedeutung |
| --- | --- |
| **Vollständig vorhanden** | Ein technischer Leser kann den Gegenstand ohne Chatwissen verstehen oder die Aufgabe vollständig ausführen. Aussagen stimmen mit den aktuellen Quellen überein. Gründe, Fehler, Grenzen, Verifikation und Quellbelege sind vorhanden. |
| **Muss erweitert/überarbeitet werden** | Verwertbarer Inhalt existiert, aber mindestens ein notwendiger Aspekt fehlt, ist veraltet, widersprüchlich, schlecht auffindbar oder nicht ausreichend belegt. |
| **Fehlt komplett** | Es gibt keinen geeigneten kanonischen Inhalt. Verstreute Quelltexte, historische Reviews oder Implementierungsdateien zählen nicht als Dokumentation. |

Die Tabellen unten verwenden den **geprüften Ausgangszustand** für AP09. Ein
Punkt wird erst nach seiner Umsetzung als abgeschlossen behandelt, wenn sein
Einzelprüfprotokoll Quellen, Zielseite, Ergebnis und Checks nennt. Die
Ausgangseinstufung selbst bleibt im maschinenlesbaren Katalog erhalten, damit
spätere Verbesserungen den Rechenweg nicht überschreiben.

## Abschlussregel pro Prüfpunkt

Ein Punkt darf nur auf **Vollständig vorhanden** gesetzt werden, wenn alle
zutreffenden Fragen mit Ja beantwortet sind:

1. Sind Zielgruppe und Zweck klar?
2. Erklärt der Text Verhalten und nicht nur vorhandene Dateien?
3. Erklärt er wichtige Entscheidungen, Gründe, Kosten und Alternativen?
4. Beschreibt er Normalfall, Fehler, Abbruch, Retry, Recovery und Cleanup?
5. Trennt er vorhandenes, lokal geprüftes und live abgenommenes Verhalten?
6. Enthält er direkte, gültige und revisionsgebundene Quellbelege?
7. Nennt er Konfiguration, Defaults, Identitäten, Zustände und Kompatibilität?
8. Kann ein Leser die Aufgabe ohne verborgenes Projektwissen abschließen?
9. Ist der Inhalt vom passenden Einstieg erreichbar?
10. Erkennt CI spätere Änderungen an der zugehörigen öffentlichen Oberfläche?
11. Liegt die vollständige Erklärung im zentralen Leserbestand und nicht nur in einem Package-README, Review oder Migrationsbericht?

## Prüfreihenfolge

1. Inventar und Pflegevertrag
2. Architektur und Systemgrenzen
3. Operator-Handbuch
4. Developer-Handbuch
5. exhaustive Referenz
6. Entscheidungen und Status
7. Navigation, Darstellung und Veröffentlichung
8. unabhängige Leser- und Wartbarkeitsabnahme

Aktueller Prüfstand: Alle 261 Punkte sind gegen den aktuellen Bestand und den
unabhängigen Review abgeglichen. Davon sind 47 Punkte vollständig vorhanden,
144 zu erweitern und 70 fehlen komplett. Die Review-Reconciliation ist intern
vollständig. Die unabhängige Abschlussprüfung der neuen Baseline bleibt offen.

## A. Umfang und Governance

| ID | Prüfpunkt | Geprüfter Zustand | Befund und Nachweis |
| --- | --- | --- | --- |
| GOV-001 | Kanonischer Einstieg und getrennte Leserwege | Vollständig vorhanden | `docs/site/README.md` trennt Understand, Operate, Extend, Reference, Decisions und Status. `scripts/docs-publication.mjs` verlangt die drei zentralen Leserwege. |
| GOV-002 | Vollständiges Inventar aller dokumentationspflichtigen Produktoberflächen | Muss erweitert/überarbeitet werden | `docs/_legacy-source/DOCUMENTATION_TOPIC_MAP.md` enthält nur zehn grobe Themen. Plugin- und Dateiinventare existieren, aber keine gemeinsame Abdeckungsmenge für Konfigurationen, CLIs, Schemas, Events, Fehlercodes, Protokolle, Stores und Endpunkte. |
| GOV-003 | Eindeutiger kanonischer Ort je Thema | Muss erweitert/überarbeitet werden | `docs/README.md` erklärt `docs/site` zur Veröffentlichungsquelle. Die Topic Map bezeichnet trotzdem alte Architektur- und Developer-Seiten als kanonisch. AP10 hat die parallelen Bestände noch nicht entfernt oder umgeleitet. |
| GOV-004 | Regeln für Quellautorität und revisionsgebundene Belege | Vollständig vorhanden | `07-documentation-quality-standard.md` verlangt enge, revisionsgebundene Quellenlinks neben jeder Behauptung und trennt Quell-, Test- und Live-Nachweise. Die aktiven AP06- bis AP08-Seiten wenden diese Regel an. |
| GOV-005 | Trennung generierter Fakten und redaktioneller Erklärungen | Muss erweitert/überarbeitet werden | `06-automation-and-publication.md` definiert die Trennung, und der AP08-Katalog setzt sie um. Konfigurationen, CLI-Flags, Fehlercodes, Events und weitere Referenzflächen besitzen diesen getrennten Pflegeweg noch nicht. |
| GOV-006 | Owner, Gültigkeitsbereich, letzte Prüfung und Check je Seite | Muss erweitert/überarbeitet werden | Alle 90 veröffentlichten Seiten enthalten Status, Audience, Owner, Applies-to und Last-verified. Drei Decision-Seiten besitzen kein `Evidence`-Feld. Eine vollständige maschinenlesbare Zuordnung von Seiten zu Quellabhängigkeiten und Checks fehlt. |
| GOV-007 | Begriffs-, Deprecation-, Redirect- und Supersession-Regeln | Muss erweitert/überarbeitet werden | Glossar, Decision-Supersession-Regeln und AP10-Migrationsregeln existieren. `scripts/docs-publication.mjs` implementiert jedoch keine Redirect- oder Deprecation-Liste; alte öffentliche Routen sind nicht vollständig zugeordnet. |
| GOV-008 | Messbare Definition von „vollständig“ | Vollständig vorhanden | Der Qualitätsstandard definiert zehn Abnahme-Gates. Dieses Dokument ergänzt elf Fragen je Prüfpunkt und verbietet Abschluss durch Seitenzahl oder grünen Build allein. |

## B. Einstieg und Produktverständnis

| ID | Prüfpunkt | Geprüfter Zustand | Befund und Nachweis |
| --- | --- | --- | --- |
| ENT-001 | Produktzweck, Systemgrenze und Zielgruppen | Vollständig vorhanden | `docs/site/understand/README.md` erklärt Problem, Zielgruppen, drei Architekturscopes, Statusgrenzen und nächste Leserwege in verständlichem technischem Englisch. |
| ENT-002 | Repräsentative Anfrage vom Eingang bis zum Ergebnis | Vollständig vorhanden | `request-state-recovery.md` verfolgt den Normalpfad sowie Retry, Repair, Wait, Cancellation, Recovery und unsichere externe Effekte. Der Einstieg fasst denselben Ablauf in zwölf Schritten zusammen. |
| ENT-003 | Pipeline, Plattform, Rolle, Engine, Spezialist und Plugin unterscheiden | Vollständig vorhanden | `components-and-authority.md` definiert Verantwortung und verbotene Autorität. `reference/glossary.md` grenzt die ähnlichen Begriffe gegeneinander ab. |
| ENT-004 | Aktueller Funktionsumfang und Nicht-Funktionen | Vollständig vorhanden | Understand, Decisions, Roadmap und Status trennen aktuelle Funktionen, geplante Verbesserungen, offene Implementierung und Live-Abnahme. Die früheren AP04-/AP08-Zwischenstände wurden aus dem Reader-Bestand entfernt. |
| ENT-005 | Schnellstart für Leser, Operator und Entwickler | Muss erweitert/überarbeitet werden | Der Understand-Einstieg führt Architekturleser. `use/quickstart.md` prüft nur den lokalen Checkout, und `extend/first-plugin.md` führt ein Plugin durch. Ein ausführbarer erster Pipeline-Workflow mit Beispiel-`pipeline.json`, Ergebnisprüfung und Fehlerweg fehlt. |

## C. Architektur: System und Autorität

| ID | Prüfpunkt | Geprüfter Zustand | Befund und Nachweis |
| --- | --- | --- | --- |
| ARC-001 | Gesamtsystem, externe Akteure und Komponentenkarte | Vollständig vorhanden | Understand-Einstieg, Authority Map, Pipeline Map, Deployment Map und Platform Layer Map verbinden den aufrufenden Menschen mit Nova, Spezialisten, Worker Core, Daten- und Plattformdiensten. Jedes Diagramm besitzt eine Textalternative. |
| ARC-002 | Erlaubte und verbotene Autorität je Komponente | Vollständig vorhanden | `components-and-authority.md` nennt für Nova, Foundation, Worker Core, Buster, Prism, Forge, Echo und Plugin Runtime sowohl Besitz als auch verbotene Entscheidungen. `deployment-and-trust.md` ergänzt Identitäts-, Netzwerk-, Grant-, Prozess- und Speichergrenzen. |
| ARC-003 | Runtime-Rollen, Engines, Spezialisten und Package Ownership | Vollständig vorhanden | `components-and-authority.md` trennt Rolle, Engine, Spezialist und Plugin. Gepinnte Role-Manifeste und Package-Ownership-Belege stützen die aktuelle Zusammensetzung und nennen die Grenze zwischen Vorhandensein, Aktivierung und Erreichbarkeit. |
| ARC-004 | Ende-zu-Ende-Normal-, Fehler-, Wait-, Retry- und Recoverypfade | Vollständig vorhanden | `request-state-recovery.md` zeigt Aufnahme, Graph, Scheduling, Effects, Resultate, Buster-Handoff und Abschluss. Eigene Abschnitte behandeln technischen Retry, Product Repair, Wait, Restart, Cancellation, unsichere Effects und Administrative Repair. |
| ARC-005 | Entscheidungen mit Gründen, Kosten und Alternativen | Muss erweitert/überarbeitet werden | Architekturtexte erklären viele Gründe und Kosten; Decision-Seiten bewahren Alternativen und Supersession. `docs:publication:check` findet jedoch fehlende Evidence-Metadaten, falsch formatierte Evidence-Pfade, entfernte Contract-Terme und Sprachfehler in diesen kanonischen Entscheidungsseiten. |
| ARC-006 | Vollständige Failure-Domain-, Abhängigkeits- und Datenkarte | Muss erweitert/überarbeitet werden | `deployment-and-trust.md` enthält Stores und Failure Domains; `pipeline-dependencies.md` enthält erforderliche Dienste und Recovery; `platform-and-operations.md` enthält optionale Infrastruktur. Eine gemeinsame, exhaustive Kommunikations- und Datenmatrix mit Producer, Consumer, Vertrag, Transport, Persistenz, Retention und Ausfallwirkung fehlt. |

## D. Architektur: Nova und Nova Core

| ID | Prüfpunkt | Geprüfter Zustand | Befund und Nachweis |
| --- | --- | --- | --- |
| NVC-001 | Nova-Rolle versus Nova Core | Vollständig vorhanden | `components-and-authority.md` trennt den deploybaren Nova-Role-Bundle vom deterministischen Core und zeigt Compiler, Entry Point, Plugin Runtime und Core in einem eigenen Diagramm. Gepinnte Role- und Engine-Quellen stützen die Grenze. |
| NVC-002 | CLI, Projektaufnahme und `nova-project.v2` Compiler | Muss erweitert/überarbeitet werden | `skills/nova/project/README.md` beschreibt Commands, Felder, Scheduling und Migration sehr detailliert. Die aktive Site bindet diese Erklärung nicht als kanonische Architektur oder vollständige Referenz ein; das Operator-Handbuch zeigt nur die beiden grundlegenden Command-Formen. |
| NVC-003 | Immutable Source Admission und Baseline-Bindung | Muss erweitert/überarbeitet werden | `request-state-recovery.md` erklärt Projektaufnahme und fixen Graph. Die vollständige Auswahl der Control-Dateien, Digest-Bindung, Limits, Approval-Verknüpfung und Ablehnungsfälle stehen nur im Package-README und in `skills/nova/project/*`. |
| NVC-004 | Graph-Aufbau, Kanten, Validierung und Freeze | Muss erweitert/überarbeitet werden | Die aktive Architektur erklärt Topologieprüfung und unveränderlichen Graph. Sie enthält keine vollständige Kantenart-, Aktivierungs-, Validierungs- und Fehlerübersicht aus `graph-build.ts`, `graph.ts` und den Compilerregeln. |
| NVC-005 | Scheduling, Readiness und Concurrency | Muss erweitert/überarbeitet werden | Nova als einzige Scheduling-Autorität, Readiness und terminale Schließung sind erklärt. Auswahlreihenfolge, Concurrency-Grenzen, Fan-in/Fan-out, Blockierbedingungen und Schedulerfehler sind nicht als zusammenhängender Mechanismus dokumentiert. |
| NVC-006 | Stage-Aktivierung, Eingabeauflösung und Ausführung | Muss erweitert/überarbeitet werden | Extension-Seiten erklären den Plugin-Vertrag, und der Trace zeigt eine bounded invocation. Die Core-Kette aus Activation, Input Resolution, Authorization, Context, Adapter Startup, Stage Execution und Cleanup fehlt als kanonischer Ablauf. |
| NVC-007 | Attempt-Identität und Lease-Lifecycle | Muss erweitert/überarbeitet werden | Der Trace nennt Attempt und Lease und verlinkt `stage-executor.ts`. Er dokumentiert weder vollständige Lease-Zustände und Identitäten noch Erwerb, Erneuerung, Verlust, Fencing, Cleanup und zugehörige Fehler. |
| NVC-008 | Retryarten, Repair und Budgets | Muss erweitert/überarbeitet werden | Technischer Retry, Product Repair, Attempt Budget und Repair Budget sind verständlich getrennt. Feldquellen, Default-/Override-Regeln, Graph-Reparaturbudget, Invalidation und alle Budget-Endzustände fehlen als vollständige Referenz. |
| NVC-009 | Wait, Approval, Signal und Resume | Muss erweitert/überarbeitet werden | Architektur und Operator-Handbuch erklären Wait, gespeicherte Signalidentität und Resume. Vollständige Signaltypen, Payload-Schemas, Issuer- und Freshness-Regeln, Ablaufzeiten, Single-use-Verhalten und Fehlercodes fehlen. |
| NVC-010 | Cancellation und Shutdown | Muss erweitert/überarbeitet werden | `request-state-recovery.md` erklärt, dass Cancellation lokale Arbeit stoppt, aber externe Effekte nicht zurückdreht. Pipeline-Loop-, Runner-, Adapter- und Observer-Shutdown, Zeitgrenzen, Drain-Reihenfolge und Fehlerpriorität sind nicht vollständig erklärt. |
| NVC-011 | Effects, Identity, Locks, Requests und Receipts | Muss erweitert/überarbeitet werden | `extend/effectful-plugin.md` erklärt Identität, Locking, Fencing, Zustände, Retry, Resume, Cancellation, Cleanup und Verifikation tiefgehend. Der passende Architekturabschnitt verlinkt diesen kanonischen Deep Dive nicht direkt; Core-Defaults und alle Persistenzgrenzen bleiben zudem verteilt. |
| NVC-012 | Artifact Checkpoints und Sichtbarkeit | Muss erweitert/überarbeitet werden | Architekturseiten erklären Artifact Store und Ergebnisbelege. Das Verhalten von `artifact-checkpoints.ts` bei Mid-attempt-Commit, Deduplizierung, Konflikt, Wiederherstellung und Sichtbarkeit steht nur im internen Execution-README. |
| NVC-013 | Journal, Snapshots, Dateisperren und Run Root | Muss erweitert/überarbeitet werden | Die Site nennt append-only Journal, Snapshot und langlebigen Store. Hash-Kette, JSON-Grenzen, FileMutex-/`flock`-Semantik, Transaktionsgrenzen, Snapshot-Provenienz, Run-Root-Struktur und Upgrade-Regeln stehen nur in internen Core-Dokumenten und Code. |
| NVC-014 | Lifecycle Reducer und vollständige Transitionstabelle | Muss erweitert/überarbeitet werden | Der Trace listet zehn Zustände und erklärt die Result-Mappings. Er zeigt nicht jede erlaubte Aktion je Ausgangszustand, Invalidation, Repair-Rückweg, Terminalisierung und Ablehnung illegaler Übergänge als vollständige Transitionstabelle. |
| NVC-015 | Administrative Repair und Recovery Stops | Muss erweitert/überarbeitet werden | Die aktive Architektur trennt gewöhnliches Resume von administrativem Reopen und verbietet Journaländerung. Decision-Schema, Authenticator-Bindung, Issuer-Allowlist, Idempotenz, Continuations und jeder Recovery Stop sind nicht in einer vollständigen Bedien- und Fehlerreferenz vereint. |
| NVC-016 | Test-Gate Resolution, Dispatch, Import und Authority Check | Muss erweitert/überarbeitet werden | Buster-Guides erklären Provider- und Report-Erweiterungen; der Architektur-Trace zeigt Dispatch und Import. Nova-seitige Plan Resolution, Source Snapshot, sichere Endpoint-Prüfung, Dispatch Store, Deadline, Result Authority, einmaliger Import und Transportfehler sind nicht vollständig beschrieben. |
| NVC-017 | Auditprojektion und Read Model | Muss erweitert/überarbeitet werden | Das Operator-Handbuch verwendet `audit`, und Telemetrieabschnitte erklären kanonische Events. Projektion, Feldherkunft, Sortierung, Redaction, beschädigte Journale, unvollständige Runs und Stabilitätsvertrag der Audit-Ausgabe fehlen als Referenz. |
| NVC-018 | Nova-Core-Fehlerkatalog | Fehlt komplett | Es gibt keinen kanonischen, aus den Nova-Core-Fehlerstellen erzeugten Katalog mit Code, Auslöser, Lifecycle-Auswirkung, Retry-Regel und Operatoraktion. |

## E. Architektur: Worker Core

| ID | Prüfpunkt | Geprüfter Zustand | Befund und Nachweis |
| --- | --- | --- | --- |
| WKC-001 | Zweck und neutrale Autoritätsgrenze | Vollständig vorhanden | `components-and-authority.md` erklärt Zweck, Besitz, Nicht-Besitz, Nutzen und Kosten des neutralen Cores. `host-and-engine.md` zeigt, welche Spezialistenlogik in der Engine bleiben muss. |
| WKC-002 | Profile, Engine-Identität und Protokollversionen | Muss erweitert/überarbeitet werden | `host-and-engine.md` erklärt Profile, immutable Engine Identity, Envelope und Versionierung mit direkten Vertragslinks. Eine vollständige Feld-, Versions-, Kompatibilitäts- und Migrationsreferenz für alle Worker-Core-Verträge fehlt. |
| WKC-003 | Readiness, Kapazität, Admission und Claims | Muss erweitert/überarbeitet werden | Die Components-Seite nennt diese Kontrollen, und der Engine-Guide beschreibt Admission grob. Readiness-Zustände, Kapazitätsberechnung, Claim-Generationen, Übergänge, Reject-Gründe und Operatorbeobachtung fehlen als kompletter Ablauf. |
| WKC-004 | Attempt-Identität, Replay und Duplikatschutz | Muss erweitert/überarbeitet werden | Der Engine-Guide bindet Pipeline, Node, Attempt, Claim, Profil, Package, Capability und Limits und fordert Duplicate-Claim-Tests. Replay-Regeln, gespeicherte Bindungen, Konfliktfälle und Recoveryentscheidungen sind nicht vollständig erklärt. |
| WKC-005 | Supervisor Authority und Prozessbesitz | Fehlt komplett | Keine aktive kanonische Seite erklärt `native-supervisor-authority.ts`, Prozessbesitz, Authority-Nachweis, Fencing und Verlust der Supervisor-Autorität. Historische Audittexte zählen nicht als Produktdokumentation. |
| WKC-006 | Process Launch, Process Group und Sandbox | Muss erweitert/überarbeitet werden | Deployment and Trust erklärt den nativen Prozess als zusätzliche Isolationsgrenze. Launch-Handshake, Launcher-Binary, UID/GID, Process Group, Ressourcen-Scope, erlaubte Dateien, Exitpfade und Sandbox-Grenzen fehlen. |
| WKC-007 | Native Control Channel | Fehlt komplett | Keine aktive Seite erklärt Nachrichten, Framing, Endpoint, Peer-Identität, Größenlimits, Timeouts, Reihenfolge, Authentisierung oder Fehler von `native-control-channel.ts`. |
| WKC-008 | Output Spool und Log-Decoding | Fehlt komplett | Keine aktive Seite erklärt Spool-Dateien, stdout/stderr-Zuordnung, Encoding, Abschneidung, Größenlimits, Flush, Retention, Wiederaufnahme und Decode-Fehler. |
| WKC-009 | Ressourcenpool, Reservation, Accounting und Observation | Fehlt komplett | Die aktive Architektur nennt Limits und Observations nur als Verantwortung. Pool-Identität, Policy, Reservation, Scope, Accounting, Messzeitpunkte, Überbuchung, Release und nicht messbare Ressourcen fehlen vollständig. |
| WKC-010 | Deadlines, Termination und Cancellation | Muss erweitert/überarbeitet werden | Der Engine-Guide erklärt Deadline-Race, Cancellation-Propagation, Termination und Cleanup auf Vertragsebene. Native Phasen-Deadlines, Signalreihenfolge, Grace Period, Process-Group-Verhalten, Supervisor Stop und unvollständige Beendigung fehlen. |
| WKC-011 | Attempt Journal und Recovery | Fehlt komplett | Keine aktive Seite erklärt Journalformat, Commit-Grenze, Zustände, Replay, beschädigte Einträge, in-flight Recovery, Recovery Stops oder Upgrade-Kompatibilität der nativen Attempts. |
| WKC-012 | Ownership Store und Ownership Recovery | Fehlt komplett | Deployment and Trust nennt nur den Store und die Regel „fence rather than guess“. Schema, Besitzerwechsel, Generationen, Heartbeats, stale ownership, Wiederherstellung und Fehlerpfade fehlen. |
| WKC-013 | Cleanup und Ergebnisversiegelung | Muss erweitert/überarbeitet werden | Components and Authority belegt persistierte Admission und versiegeltes Resultat; der Engine-Guide nennt Hook-Reihenfolge und Result-Bindung. Cleanup bei jedem Terminalpfad, Fehlerpriorität, verbleibende Prozesse/Dateien und vollständige Seal-Validierung fehlen. |
| WKC-014 | Worker-Core-Vertrags- und Fehlerreferenz | Fehlt komplett | Versionierte Verträge und direkte Einzelbelege existieren. Es gibt keine integrierte Referenz für alle Felder, Versionen, Zustände, Error Codes, Retry-Regeln und Migrationen. |

## F. Architektur: Spezialisten und Produktkomponenten

| ID | Prüfpunkt | Geprüfter Zustand | Befund und Nachweis |
| --- | --- | --- | --- |
| SPC-001 | Buster Engine, Plan, Provider, Evidence und Result Authority | Muss erweitert/überarbeitet werden | `extend/buster.md` erklärt Plans, Suite Resolution, Provider, Evidence, Retry, Cleanup und Report Adapter tiefgehend. Components und Request Trace erklären die Autoritätsgrenze. Job Admission, Remote Store, Source Snapshot, Transport, Statusübergänge, Result Signing, Import und Recovery sind jedoch nicht als eine Buster-Produktarchitektur verbunden. |
| SPC-002 | Prism Control, Worker, Studio, Ingestion und Services | Muss erweitert/überarbeitet werden | Components, Deployment, Trust und Engine Guide belegen Role, Control, Worker, Studio, Ingestion, Services und einen realen Worker Attempt. Die aktive Site erklärt nicht den vollständigen Request- und Datenfluss zwischen diesen Komponenten, ihre APIs, Startup-Reihenfolge, Zustände und gemeinsamen Fehlerpfade. |
| SPC-003 | Prism-Datenmodell, Revisionen, Approval und Baseline | Muss erweitert/überarbeitet werden | `decisions/prism.md` bewahrt Ownership-, Document-, Retrieval-, Preference-, Operation- und Publication-Entscheidungen. Kanonische Architektur und Referenz für Projects, Revisions, Operations, Approvals, Artifacts, Baseline-Bindung, Retention und Recovery fehlen; ältere Architekturtexte sind nicht integriert. |
| SPC-004 | Forge Dispatch, Workspace, Commit und Merge | Muss erweitert/überarbeitet werden | Components erklärt Forge als Spezialist ohne Pipeline-Autorität und belegt Capability Grants. Plugin-Katalog und Nova-Guide erklären einzelne Registrierungen. Dispatch-Vertrag, Prompt/Input, Workspace-Lifecycle, Git-Baseline, Commit-Auswahl, Merge, Reparatur, Abbruch und Wiederaufnahme fehlen als zusammenhängender Pfad. |
| SPC-005 | Echo Review, Findings, Zertifizierung und Policy | Muss erweitert/überarbeitet werden | Components erklärt Echo als beobachtenden Spezialisten; `decisions/echo.md` enthält umfangreiche Governance-Historie. Aktuelle Eingaben, feste Review Subject Identity, Findings-Schema, Evidence, Zertifizierung, Policy-Auswertung, Reparaturschleife und Nova-Entscheidungsgrenze sind nicht als kanonische Laufzeitarchitektur zusammengeführt. |
| SPC-006 | OpenClaw-Hostintegration | Muss erweitert/überarbeitet werden | `host-and-engine.md` bietet vollständige Authoring-Pfade für Hook und Tool; der Katalog deckt beide vorhandenen OpenClaw-Pakete ab. Host-Prozess, Discovery, Installation, Allowlist, Activation, Config-Auflösung, Hook-/Tool-Lifecycle, State, Upgrade, Diagnose und Entfernung sind nicht als eine Betriebsarchitektur verbunden. |
| SPC-007 | Codex-Plugin und Ops-Skill | Muss erweitert/überarbeitet werden | Der Host-Guide erklärt Manifest, Skill-Datei, Tool-Verfügbarkeit und die Grenze, dass kein Pipeline-Code geladen wird. Für das vorhandene Ops-Plugin fehlen eine vollständige Tool-/MCP-Abhängigkeitskarte, Rechte, Workspace-Grenzen, Connection-Ausfälle, Tests, Betrieb, Update und Removal; der lokale Katalog nennt diese Grenzen ehrlich. |
| SPC-008 | Buster Namespace Broker, Controller und Lease API | Muss erweitert/überarbeitet werden | Controller, RBAC und CRD sind implementiert, und einzelne Trust-/Buster-Seiten nennen leased namespaces. Es fehlt eine zusammenhängende Produktbeschreibung für Ownership, Spec/Status-Transitionen, Acquisition, Fencing, Release, Identitäten, Credentials, Retention sowie Fehler- und Recoverygrenzen. |
| SPC-009 | Ops MCP Service Contract | Muss erweitert/überarbeitet werden | Ops-Seiten erklären Zweck und Sicherheitsgrenze, und der Codex-Katalog nennt die Hostintegration. Eine zentrale Referenz für Tools, Parameter, Defaults, Größenlimits, Namespace-Regeln, Bearer-/Origin-Prüfung, HTTP-/Session-Verhalten, Kubernetes-/Hubble-Abhängigkeiten und Fehlerantworten fehlt. |
| SPC-010 | Archviewer Produktoberfläche | Muss erweitert/überarbeitet werden | Chart, Nginx-Konfiguration, Image und Reliability-Test belegen einen vorhandenen Nova-Sidecar. Die aktive Site erklärt Design-Input/-Publikation, URL, Basic Auth, Health-Ausnahme, Tailnet-/Cilium-Grenze, Lifecycle und Einschränkungen nicht als eigenes Produkt. |

## G. Architektur: Plugin-System und Registry

| ID | Prüfpunkt | Geprüfter Zustand | Befund und Nachweis |
| --- | --- | --- | --- |
| PLG-001 | Package-, Manifest- und Registrierungsmodell | Vollständig vorhanden | Choice Guide und `contracts.md` erklären Package Envelope, Identitäten und alle fünf Pipeline-Verträge mit Input, Output, Persistenz, Authority, Failure und direkten Schema-/Runtime-Quellen. Hostoberflächen und Worker Engines sind klar getrennt. |
| PLG-002 | Discovery ohne Codeausführung | Muss erweitert/überarbeitet werden | Choice Guide und Contracts erklären inert discovery, Digests, Provenance und getrennte Activation mit direkten Links. Installation Roots, Canonicalization, Symlink-/Alias-Regeln, Dateiauswahl, Discovery-Reihenfolge und alle Reject-Klassen fehlen als vollständiger Algorithmus. |
| PLG-003 | Manifest-, Schema- und Pfadvalidierung | Muss erweitert/überarbeitet werden | Shared Envelope erklärt relative Pfade, Escape-Verbot, Referenzen und Schema-Validierung; das vollständige JSON Schema ist verlinkt. Validierungsreihenfolge, Schema-Lifetime, `$id`-/`$ref`-Grenzen und alle Diagnosen sind nicht als Referenz veröffentlicht. |
| PLG-004 | Digests, Immutable Snapshots und Package Replacement | Vollständig vorhanden | `contracts.md` trennt ID, Version, Digest und Registration, erklärt Snapshot-Provenienz und verbietet Byte-Austausch unter recoverable Runs. `testing.md` gibt einen vollständigen Replacement-Ablauf mit Drain, alter Byte-Retention, State Migration, Success/Denial/Recovery und Removal-Gate. |
| PLG-005 | Built-in Trust, External Trust und Attestations | Muss erweitert/überarbeitet werden | Deployment-Seite trennt Package Integrity, Registration Authority, Workload Identity und Source Identity. Choice Guide nennt trusted first-party und external paths. Trust Roots, Digest-/Attestation-Policy, Installer, Attestation-Verifikation, Built-in-Ausnahme und Reject-Fälle fehlen als durchgehender Pfad. |
| PLG-006 | Import Audit | Fehlt komplett | Aktive Seiten erwähnen Import Auditing, erklären aber weder Permission Boundary, verbotene APIs, Guards, Digest-Recheck, Child-Prozess, Timeout, Exportprüfung noch Ablehnungsdiagnosen von `import-audit.ts`. |
| PLG-007 | Registry Build und Konflikterkennung | Muss erweitert/überarbeitet werden | Contracts belegt die fünf immutable Maps und globale Ownership. Vollständige Build-Reihenfolge, Frozen Maps/Sets, Konfliktklassen für IDs, Stage Types, Providers, Reports und Subscriptions sowie Error Codes fehlen. |
| PLG-008 | Capability Vocabulary und Providerauflösung | Muss erweitert/überarbeitet werden | Die generierte Capability-Referenz ist aktuell; Contracts erklärt Declaration, Provider Selection und Caller Grant als getrennte Kontrollen. Dependency-Auflösung, Ambiguität, Zyklen, genau-ein-Provider-Regel, confidential capabilities und Fehlerpfade fehlen. |
| PLG-009 | Grants und Resource Matching | Muss erweitert/überarbeitet werden | Deployment and Trust erklärt Least Authority und nennt Pfade, Namespaces, Targets, Origins, Commands und Signals. Die vollständige Match-Semantik je Resource Type, Normalisierung, Wildcards, Denials, confidential payloads und Diagnosen fehlen. |
| PLG-010 | Konfigurationsauflösung und Schemaanwendung | Muss erweitert/überarbeitet werden | Choice Guide trennt Projekt-, Plattform- und Hostkonfiguration; Contracts erklärt registration-owned validation. Sources, Precedence, Defaults, unbekannte Felder, sensitive values, Observer-/Adapterauflösung und effektive Konfigurationsausgabe fehlen als vollständiger Flow. |
| PLG-011 | Activation und executable exports | Muss erweitert/überarbeitet werden | Discovery-/Activation-Tabelle erklärt Surface-Unterschiede, Integrity-Recheck und selektives Laden. Exportform, Import Audit, transactional adapter startup, readiness, rollback, shutdown, partial failures und Activation Error Codes sind nicht vollständig dokumentiert. |
| PLG-012 | Deactivation, Replacement und Recovery alter Bytes | Vollständig vorhanden | `testing.md` führt Installation, Update/Replacement, Disablement und Removal für jede Surface durch. Es erklärt Drain, pinned identities, alte Bytes, verbleibende Journale, externe Daten, Credentials, Prozesse und owner-gesteuerte Retention. |
| PLG-013 | Isolation externer Stages und Observer | Muss erweitert/überarbeitet werden | Deployment and Trust erklärt Direct-versus-isolated Activation und die bounded context boundary. IPC-Protokoll, Sessionzustände, Permission Model, cgroup, Memory Limit, Sandbox-C-Boundary, Cancellation, Cleanup und Fehlercodes fehlen. |
| PLG-014 | Fehlender persistenter Host für externe Adapter | Vollständig vorhanden | Choice Guide, Activation-Quelle und Testing-Grenzen erklären eindeutig, dass externe Adapter ohne persistent isolated adapter runtime abgelehnt werden. Die Grenze wird nicht als verfügbare Funktion dargestellt. |

## H. Architektur: Kommunikation, Daten und Telemetrie

| ID | Prüfpunkt | Geprüfter Zustand | Befund und Nachweis |
| --- | --- | --- | --- |
| COM-001 | Vollständige Kommunikationsmatrix | Fehlt komplett | Keine zentrale Matrix nennt für jede Verbindung Sender, Empfänger, Zweck, Schema, Transport, Endpoint, Authentisierung, Autorisierung, Timeout, Ordering, Retry, Persistenz, Deduplizierung, Backpressure und Fehlerwirkung. Einzelne Diagramme ersetzen dieses Inventar nicht. |
| COM-002 | Nova zu Buster Dispatch und Result Import | Muss erweitert/überarbeitet werden | Request Trace und Buster Guide erklären festen Plan, Job Admission, gespeichertes Resultat und einmaligen Import. Wire Envelope, Endpoint, Source Snapshot, Statuspolling, Store Records, Attestation, Deadlines, Transportfehler und Reconciliation sind über Nova-, Buster- und Trust-Quellen verteilt. |
| COM-003 | Nova zu Prism und zurück | Muss erweitert/überarbeitet werden | Components und Prism Worker Example zeigen Design-Handoff, Worker-Request und gebundenes Resultat. Nova-Stage zu Control, Control zu Worker, Studio/Service-Routen, exakte Identitäten, Timeouts, Operation Store und Restart-Reconciliation bilden keinen zentralen Ende-zu-Ende-Pfad. |
| COM-004 | Nova zu Forge/Echo | Muss erweitert/überarbeitet werden | Components beschreibt bounded tasks und Rückgaben; Plugin-Katalog belegt Runtime Dispatch, Implementation und Review. Transportadapter, Message Envelope, Model-/Agent-Host, Correlation, Timeout, Streaming, Result Import, Lost Response und Retry sind nicht zusammenhängend dokumentiert. |
| COM-005 | Core zu Stage, Adapter und Observer | Muss erweitert/überarbeitet werden | Contracts erklärt alle drei Invocation-Typen, Authority und Recovery. Nova- und Effect-Guides ergänzen Context, Effect und Observer Delivery. Vollständige Request-/Result-/Abortschemas, In-process-versus-isolated Transport, Deadline-Propagation und Error Mapping fehlen als ein Core-Kommunikationsmodell. |
| COM-006 | Worker Control Channel | Fehlt komplett | Wie bei `WKC-007` fehlt eine aktive kanonische Erklärung zu Nachrichten, Framing, Identität, Zuständen, Timeouts und Fehlern des nativen Channels. |
| COM-007 | Redis Streams, Kanäle und Deduplizierung | Muss erweitert/überarbeitet werden | Pipeline Dependencies erklärt Redis als Transport statt Lifecycle Authority; der Plugin-Katalog dokumentiert URL, Stream Prefix und Grenzen. Stream-Namensbildung, Writer/Consumer-Paare, RESP-Grenzen, MAXLEN, Dedup-TTL, Replay, Migration und Consumerfehler stehen nur in Package-READMEs und Code. |
| COM-008 | Interne HTTP- und Service-Endpunkte | Fehlt komplett | Es gibt keinen zentralen Katalog für Nova-, Buster-, Prism-, Worker-, Monitoring-, Registry- und Ops-Endpunkte mit Method, Pfad, Port, Schema, Peer Identity, Auth, Größenlimit, Timeout und Fehlerantwort. |
| COM-009 | Tailscale private routes und Test-Exposure | Muss erweitert/überarbeitet werden | Pipeline Dependencies trennt privaten Plattformzugang und Buster-Test-Exposure und erklärt Retention/Release. Route Owner, DNS, Zertifikat/TLS, Caller Identity, ACL, Endpoint, Readiness, Lease, Cleanup und Fehlerwirkung fehlen als vollständige Kommunikationsmatrix. |
| COM-010 | Git-, OCI-, Registry- und BuildKit-Datenwege | Muss erweitert/überarbeitet werden | Pipeline Dependencies zeigt Source Revision, Build, Push, Manifestprüfung, Pull und Mirror-Hit/Miss mit Gründen und Failure Summary. Protokolle, Endpoints, Credentials, Digest-Bindungen, Cache-/Mirror-Regeln und Recovery je Übergang fehlen im zentralen Bestand. |
| COM-011 | SPIFFE/SPIRE- und mTLS-Pfade | Muss erweitert/überarbeitet werden | Worker Trust erklärt Identitätsformat, Proxy Pattern, geschützte Routen, Provenance und Fail-closed-Verhalten. Eine vollständige Plattformmatrix aller Workload-IDs, Ports, SANs, Issuer, Peer-Allowlist, NetworkPolicy und Rotation verweist noch auf nicht zentrale Security-/Operationsseiten. |
| COM-012 | Timeout, Retry, Ordering und Backpressure je Verbindung | Fehlt komplett | Werte und Regeln liegen in Schemas, Plugins und Runtime-Code. Keine zentrale Matrix macht sichtbar, welche Schicht retryt, welche Reihenfolge gilt, wie Queue-/Byte-Limits wirken und wann Druck den Producer, Consumer oder gesamten Run stoppt. |
| DAT-001 | Vollständige Datenbesitz- und Persistenzmatrix | Muss erweitert/überarbeitet werden | `use/recovery.md` besitzt eine starke 15-zeilige State Inventory mit Owner, Authority, Protection und Limit. Schema/Format, physischer Ort, Writer, Reader, Konsistenzgruppe, Verschlüsselung, Retention, Kapazität, Migration und Löschung fehlen für viele Stores. |
| DAT-002 | Nova-Journals, Effects und Snapshots | Muss erweitert/überarbeitet werden | Request Trace, Recovery und Effect Guide erklären Autorität, Zustände und unsichere Effects. Dateinamen, Record-Schemas, Hash Chain, Commit-Grenzen, Run Root, Snapshot Pair, Locking, Größe, Retention, Corruption und Migration stehen überwiegend in internen Core-READMEs. |
| DAT-003 | Worker-Journals, Ownership und Spools | Fehlt komplett | Keine aktive zentrale Seite verbindet Attempt Journal, Ownership Store, Output Spool, Resource Records und sealed result mit Schema, Pfad, Writer, Replay, Corruption, Retention und Cleanup. |
| DAT-004 | Buster-Pläne, Attempts, Evidence und Reports | Muss erweitert/überarbeitet werden | Buster Guide erklärt Plan, Provider, Ports, Evidence und Reports fachlich tief. Physische Stores, Record- und Artifact-Schemas, Result Signing, Retention, Kapazität, Garbage Collection, Backup und Remote Recovery bleiben verteilt. |
| DAT-005 | Prism PostgreSQL, Artefakte und Revisionen | Muss erweitert/überarbeitet werden | Deployment und Recovery nennen Owner, Tabellenarten, Artifact PVC und matched backup group. Vollständiges Datenmodell für Projects, Revisions, Documents, Operations, Approvals, Preferences, Derived Data und Publication sowie Migration/Retention fehlt in der aktiven Site. |
| DAT-006 | LiteLLM PostgreSQL | Muss erweitert/überarbeitet werden | Pipeline Dependencies und Recovery nennen den getrennten Owner und Backup. Schema-/Migrationsauthority, Credentials, Connection Pool, Startup, Upgrade, Retention, Kapazität, Backupdetails und Restore-Verifikation liegen außerhalb des zentralen Leserbestands. |
| DAT-007 | Redis als Transport, nicht als Autorität | Muss erweitert/überarbeitet werden | Autoritätsgrenze, Failure Effect und Recovery Rule sind klar. Streams/Keys, Producer, Consumer, Payload, Dedup Records, MAXLEN, TTL, AOF, Migration, Replay und Datenlöschung sind nicht als vollständiges Datenmodell zentral dokumentiert. |
| DAT-008 | Artefaktspeicher, Digests, Encoding und Retention | Muss erweitert/überarbeitet werden | Contracts, Buster Guide, Effect Guide und Recovery erklären bounded artifacts und Digest-Prüfung. Namespace, ID, Media Types, Encoding, Sidecars, Checkpoints, Visibility, Limits, Retention, Collision, Garbage Collection und Restore sind nicht in einem kanonischen Lifecycle vereint. |
| DAT-009 | Backupgruppen und Restore-Reihenfolge | Muss erweitert/überarbeitet werden | Zentrale Recovery-Seite erklärt State Inventory, Writer Fence, Group Integrity, unabhängiges Ziel und Prism-Reihenfolge sehr gut. Für Redis, LiteLLM und Ops verweist sie jedoch auf alte Operationsseiten außerhalb `docs/site`; vollständige zentrale Verfahren und mehrere Live-Proofs fehlen. |
| TEL-001 | Telemetriearchitektur und Autoritätsgrenze | Muss erweitert/überarbeitet werden | Deployment and Trust trennt kanonische Events von Observer Delivery, Redis, Logs und Metriken. Produzent bis Schema, Observer, Adapter, Transport, Sink, Query/Projection, Fehler und Replay sind nicht als vollständiger Datenweg dargestellt. |
| TEL-002 | Event- und Payload-Katalog | Fehlt komplett | `contracts/telemetry/v1` enthält 124 Schema-Dateien und ein 132-Dateien-Manifest, ist laut eigenem README aber ein retained v1 asset ohne aktiven Producer/Consumer. Die aktive Site veröffentlicht weder diesen Status vollständig noch einen generierten Katalog der aktiven v2 Events und Payloads. |
| TEL-003 | Produzenten und Konsumenten je Event | Fehlt komplett | Keine zentrale oder generierte Matrix verbindet Event Type und Version mit Producer, Authority, Schema, Subscriber, Filter, Delivery Policy, Sink und Status. Die Plugin-Manifeste decken nur registrierte Subscriptions ab. |
| TEL-004 | Identität, Ordering, Deduplizierung und Redaction | Muss erweitert/überarbeitet werden | Contracts und Nova Guide erklären Event Identity, at-least-once, per-run ordering, externe Deduplizierung und ein Redaction-Beispiel. V1/V2-Grenze, globale Correlation, Timestamp-/Sequence-Semantik, sensitive Felder und Sink-spezifische Redaction sind nicht als ein Modell dokumentiert. |
| TEL-005 | Observer Checkpoints, Retry und Recovery | Vollständig vorhanden | `extend/contracts.md` erklärt Delivery Journal, Checkpoint nach Erfolg, required/best-effort, Exhaustion und Restart. `extend/nova.md` ergänzt Timeout, Recovery State, Deduplizierung, Redaction, konkrete Tests und direkte Quellen für Delivery und Recovery. |
| TEL-006 | Evidence versus Redis, Logs und Metriken | Vollständig vorhanden | Deployment and Trust erklärt, dass Lifecycle Event, Effect Receipt, Artifact Digest und Remote Result autoritativ sind. Es grenzt Redis-Projektion, Observer Delivery, Logs und Monitoring ausdrücklich davon ab und nennt Failure-/Replay-Folgen. |
| TEL-007 | Retention, Kapazität und Backpressure | Fehlt komplett | Einzelne Komponenten nennen MAXLEN, TTL, Queue-, Payload-, Retry- oder Monitoring-Retention. Es gibt keinen durchgehenden Vertrag für Kapazitätsbudget, Druckweitergabe, Drop/Block-Verhalten, Alerting, Retirement und Löschung aller Telemetriepfade. |

## I. Architektur: Plattform und Sicherheit

| ID | Prüfpunkt | Geprüfter Zustand | Befund und Nachweis |
| --- | --- | --- | --- |
| INF-001 | Host, K3s und fehlende Hostautomation | Vollständig vorhanden | Platform Architecture erklärt Host-/K3s-Verantwortung, Voraussetzungen, Failure Domain, unabhängigen Recoverypfad und die fehlende Empty-host-Automation. `docs/site/status/roadmap.md` definiert Eingaben, Plan/Dry-run, Idempotenz, Rollback, Output und Acceptance des geplanten Automationspfads. |
| INF-002 | DNS, Storage und Scheduling | Muss erweitert/überarbeitet werden | Layer Map und Installationsreihenfolge ordnen DNS, CSI/StorageClass und Scheduling korrekt vor den Runtimes ein. Unterstützte Implementierungen, Storage-/Topology-Entscheidungen, Capacity, Affinity/Taints, DNS-Ausfälle, Volume-Recovery und Acceptance fehlen als zentrale Detailarchitektur. |
| INF-003 | Flannel und Cilium | Vollständig vorhanden | Platform Architecture erklärt Cilium als optionale Implementation, Flannel als gültige Alternative, erforderliche Traffic Boundaries, exklusive CNI-Ownership, Cutoverrisiko, Cordoning, positive/negative Tests und Recoveryzugang. Source- und Live-Proof-Grenze sind getrennt. |
| INF-004 | Argo CD und exklusive Resource Ownership | Vollständig vorhanden | Die aktive Seite trennt direkte Helm- und Argo-Ownership, verbietet Doppelbesitz, erklärt Git Desired State, Projektgrenzen, Self-heal/Prune, Commit-Nachweis, Failure Effect und Handover-Recovery mit gepinnten Quellen. |
| INF-005 | BuildKit | Muss erweitert/überarbeitet werden | Pipeline Dependencies erklärt Rootless BuildKit, Buster-Ownership, Startreihenfolge, Registry Push und Digestprüfung. Socket/Endpoint, Rootless-Prerequisites, Worker, Config, Cache, Credentials, Limits, Parallelität, Logs, Shutdown und Fehlerdiagnosen fehlen zentral. |
| INF-006 | Lokale OCI Registry | Muss erweitert/überarbeitet werden | Architektur bezeichnet `registry-local` korrekt als anonymen HTTP-Labordienst und verlinkt die Production-grade-Roadmap mit HTTPS, Auth, Rotation, Backup, GC und Acceptance. Der aktuelle Lab-Betrieb, Limits, Storage, Ausfälle und die künftige sichere Bedienreferenz sind noch nicht vollständig zentral dokumentiert. |
| INF-007 | OCI Pull-Through Mirror | Muss erweitert/überarbeitet werden | Architektur trennt Mirror und writable Registry, erklärt Cache-Hit/Miss, Upstreamabhängigkeit, eigenes Volume und Replacement-Anforderungen. Clientkonfiguration, Cache-Key/TTL, Auth, Capacity, GC, Corruption, Cold Miss, Outage, Backup und Recovery fehlen als zentrale Referenz. |
| INF-008 | Git Mirror | Vollständig vorhanden | Pipeline Dependencies sagt ausdrücklich, dass kein unterstützter Git Mirror existiert, grenzt ihn vom OCI Mirror ab und erklärt die sichere Exact-revision-Grenze. Die Roadmap definiert Cache-/Mirror-Optionen, Freshness, Corruption, Failback, Capacity, Recovery und Acceptance ohne gegenwärtige Verfügbarkeit vorzutäuschen. |
| INF-009 | Redis, PostgreSQL und Tailscale | Muss erweitert/überarbeitet werden | Pflicht- und Role-Abhängigkeiten, Owner, Autoritätsgrenzen und Failure Effects sind zentral eingeordnet. Die bei `COM`, `DAT` und `SEC` ermittelten Lücken zu Protokollen, Stores, Migration, Retention, Credentials, Routen und Recovery verhindern eine vollständige Detailarchitektur. |
| INF-010 | Monitoring | Vollständig vorhanden | Platform Architecture trennt Prometheus, Grafana, Loki und Alloy, nennt Nicht-Autorität, Storage, 15-/30-Tage-Retention, NodePort, fehlende Loki-Auth, privilegierten Logzugriff, Promtail-Handover, Failure/Recovery und direkte Werte-/Checkquellen. Monitoring bleibt korrekt optional. |
| INF-011 | Ops Pod | Muss erweitert/überarbeitet werden | Die Architektur erklärt Zweck, Clusterabhängigkeit und unabhängigen Recoveryweg, nennt die Default-Rechte aber noch read-only. Tatsächlich aktiviert `charts/ops-pod/values.yaml` standardmäßig `rbac.execNamespaces: [kubeclaw]`; RBAC erlaubt `pods/exec` und Codex erhält Token/Kubeconfig. MCP-Read-Tools und ServiceAccount-Autorität müssen zentral getrennt werden. |
| INF-012 | LiteLLM und Model Gateway | Muss erweitert/überarbeitet werden | Secret-, Environment- und Recovery-Referenzen nennen LiteLLM, PostgreSQL und ausgewählte Ausfallgrenzen. Eine zusammenhängende Gateway-Architektur für Modell-/Embedding-Routen, Konfigurationsquellen, Provider-Credentials, Consumer, Readiness, Limits und Recovery fehlt. |
| SEC-001 | Threat Model und Trust Boundaries | Muss erweitert/überarbeitet werden | Deployment and Trust trennt Package Integrity, Route Protection, Workload Source und Operation Grant sowie Prozess-, Netzwerk- und Speichergrenzen. Assets, Angreifer, Entry Points, Threats, Mitigations, Residual Risks und Verification sind nicht in einer zentralen Threat-/Control-Matrix verbunden. |
| SEC-002 | Human und Workload Identity | Muss erweitert/überarbeitet werden | Aktive Trustseiten trennen Keycloak-Human-Identity, SPIFFE Workload Identity, forwarded identity und Artifact Signature korrekt. Login/Issuer, Token-/Certificate-Flows, Session, Groups/Roles, Shared Users, Rotation, Revocation, Audit und Recovery fehlen als vollständiges Credential-Modell. |
| SEC-003 | SPIRE, Attestation und mTLS | Muss erweitert/überarbeitet werden | Worker Trust dokumentiert SVID-Format, Proxy Pattern, geschützte Caller-Paare, Nova-Buster-Provenance, leased namespaces und fail-closed Proof Levels. Vollständige Registration-, CSI-/SDS-, Listener-, SAN-, Trust-Domain-, Rotation- und Recoverydetails liegen noch in nicht zentralen Security-/Operationsseiten. |
| SEC-004 | Secrets, Resolver, Rotation und Recovery | Muss erweitert/überarbeitet werden | Capability Grants, Secret Resolver Plugin und Recovery State Inventory erklären externe Secret Authority und bounded names. Ein generiertes Inventar jedes Secrets mit Owner, Producer, Consumer, Mount/Env/API, Namespace Copy, Rotation, Revocation, Backup und Leak Response fehlt im zentralen Bestand. |
| SEC-005 | Network Policies und negative Pfade | Muss erweitert/überarbeitet werden | Deployment and Trust zeigt Default Deny, wichtige Caller/Destination/Ports und direkte Policyquellen; Worker Trust trennt Contract, Render und Live Proof. Eine vollständige Connection-Allowlist für alle Charts sowie automatischer Abgleich zwischen Service, Policy, SVID und Negativtest fehlt. |
| SEC-006 | Supply Chain, Images, Digests und Attestations | Muss erweitert/überarbeitet werden | Package Digests, Registry Manifest Verification, Nova-Buster Source Signature und Release Selections sind einzeln erklärt. Source-to-build-to-image-to-deploy Provenance, Builder Trust, SBOM/Scan, Attestation Issuer, Verification Policy, Key Rotation und Incident Recovery bilden kein zentrales Gesamtmodell. |
| SEC-007 | Least Privilege | Muss erweitert/überarbeitet werden | Architektur erklärt Capability Grants, Resource Matching, Role ServiceAccounts, NetworkPolicy und bounded Ops rights. Eine maschinenlesbare Berechtigungsmatrix für Kubernetes RBAC, SPIFFE Peers, Network Paths, Plugin Grants, Secrets, Filesystem, Processes und externe Systeme fehlt. |

## J. Operator-Handbuch

| ID | Prüfpunkt | Geprüfter Zustand | Befund und Nachweis |
| --- | --- | --- | --- |
| OPR-001 | Logischer Operator-Lifecycle | Vollständig vorhanden | Use-Index führt von Installation bis Retirement. |
| OPR-002 | Voraussetzungen, Versionen, Preflight und Topologie | Vollständig vorhanden | Grenzen werden ehrlich benannt. |
| OPR-003 | Helm-Installation, GitOps-Handover und Erstverifikation | Muss erweitert/überarbeitet werden | `use/install.md` besitzt Reihenfolge, Preflight, Render, Stopbedingungen und Belege. Registry-/BuildKit-Vorbereitung und vollständiges GitOps-Handover liegen jedoch in alten `operations/`- und `deployment/`-Seiten; der zentrale Ablauf ist nicht selbstgenügsam. |
| OPR-004 | Start, Audit, Wait/Resume und Recovery | Muss erweitert/überarbeitet werden | `use/operate.md` erklärt Start, Audit und Recovery. Beim Resume-Signal fehlen jedoch das vollständige `resume-signal.v2`-Envelope, `signalId`, `idempotencyKey`, `issuedAt`, Issuance-Regeln und ein schema-gültiges Beispiel. |
| OPR-005 | Cancellation-Grenze | Vollständig vorhanden | Das Operator-Handbuch sagt ausdrücklich, dass kein separater Cancel-Befehl existiert, trennt Prozessunterbrechung von Run-Cancellation und verweist auf sichere Diagnose statt eines erfundenen Commands. |
| OPR-006 | Diagnose nach Symptom und Autorität | Vollständig vorhanden | `use/diagnose.md` führt von Incident Record über Cluster, Health, Journal, Capacity und Delivery zu einem Symptomindex. Es trennt Logs, Projektionen, kanonische Evidence, unsichere Effects und Eskalationsstops. |
| OPR-007 | Backup, Restore und unabhängiger Zugang | Muss erweitert/überarbeitet werden | Die zentrale Recovery-Seite ist detailliert und erklärt Gruppen, Fences, Checks, Restore Scopes, Clusterverlust und unabhängigen Zugang. Redis-, LiteLLM-, Ops- und Worker-Trust-Details verweisen noch auf alte Runbooks; mehrere Live-Proofs bleiben offen. |
| OPR-008 | Upgrade, Rollback, Rotation und Retirement | Muss erweitert/überarbeitet werden | `use/maintenance.md` erklärt Change Plan, Rendering, Upgrade Order, Rollback Decision, Credential Rotation und Retirement. Stateful-Service-, Registry-, SPIRE- und Ops-Verfahren hängen noch von alten Operationsseiten ab und verletzen den zentralen Leserpfad. |
| OPR-009 | Kapazität, Retention und Schwellenwerte | Muss erweitert/überarbeitet werden | Install, Diagnose, Recovery und Maintenance verlangen Capacity Records und nennen einzelne Retentionwerte. Ein vollständiges Servicebudget mit Messwert, Warn-/Stopgrenze, Wachstum, Owner und Reaktion fehlt. |
| OPR-010 | Prism-/Studio-Benutzerreise | Fehlt komplett | Architektur, Decisions und Acceptance nennen Studio-Komponenten und einzelne Prüfungen. Kein zentraler Operatorweg führt durch Projekt, Design Round, Auswahl, Revision, Preview, Approval der richtigen Revision, Render/Export/Handoff sowie stale und konkurrierende Fehler. |
| OPL-001 | Inventar, Zweck, Funktionen und Konfiguration aller 51 Plugins | Muss erweitert/überarbeitet werden | Der zentrale Katalog inventarisiert alle 51 Pakete. Bei komplexen Plugins reduziert die aktuelle Generierung verschachtelte und bedingte Konfiguration auf Top-Level-Felder und verweist für notwendiges Verhalten auf Package-READMEs. Funktionen und Konfiguration sind deshalb noch nicht vollständig zentral. |
| OPL-002 | Operative Auswahlmatrix über alle Plugins | Fehlt komplett | Nach Aufgabe, Rolle und Abhängigkeit filterbare Sicht fehlt. |
| OPL-003 | Aktivierung und Erfolgsprüfung je Oberfläche | Muss erweitert/überarbeitet werden | Shared Lifecycle nennt Install-/Activation-Aktion und positive Observation für Pipeline, Buster, OpenClaw, Codex, Engine und Role. Operator-Einstieg, konkrete Konfiguration und reproduzierbare Aktivierungsbeispiele je Oberfläche fehlen. |
| OPL-004 | Diagnose, Upgrade, Disable, Replace und Remove | Muss erweitert/überarbeitet werden | `extend/testing.md` besitzt einen starken gemeinsamen Lifecycle einschließlich Drain und Restzustand. Operatorzentrierte Commands, paketbezogene State Owner, Abhängigkeiten, Rollback und Health Evidence fehlen als Matrix. |
| OPL-005 | Externe Abhängigkeiten und Secrets je Plugin | Fehlt komplett | Keine zentrale generierte Matrix ordnet jedem Plugin Services, Endpoints, Capabilities, Secret References, Datenowner, Reachability Check und Ausfallwirkung zu. |
| CFG-001 | Kanonischer Konfigurationsindex | Fehlt komplett | Aktive Reference besitzt keinen Index. |
| CFG-002 | `pipeline-platform.v2` Referenz | Muss erweitert/überarbeitet werden | Operate erklärt Authority Groups und Relative-path-Regel mit Schemaquellen. Vollständige Felder, Typen, Defaults, Constraints, Precedence, sichere Beispiele, sensitive values und Fehler fehlen. |
| CFG-003 | `nova-project.v2` Referenz | Muss erweitert/überarbeitet werden | Das Package-README ist tief, liegt aber außerhalb des zentralen Bestands. Felder, Source Admission, Modules, Gates, Coverage, Demo, Legacy Import und Diagnosen müssen in die zentrale Reference migrieren. |
| CFG-004 | `pipeline-definition.v2` Referenz | Muss erweitert/überarbeitet werden | Operate erklärt die explizite Graphform; ältere Beispiele und Schemas existieren. Eine zentrale vollständige Feld-, Edge-, Input-, Budget-, Activation-, Result- und Fehlerreferenz fehlt. |
| CFG-005 | `.swarm/pipeline.json` Referenz | Fehlt komplett | Größte Operatorlücke. |
| CFG-006 | Suites, Tests, Fixtures, Overrides und Coverage | Muss erweitert/überarbeitet werden | Buster Extension Guide erklärt Authoring und Resolution tiefgehend. Operatoren erhalten keine zentrale vollständige Syntax, Auswahlwirkung, Override-Reihenfolge, Coverage-Regel und effektive Planansicht. |
| CFG-007 | Plugin-Konfiguration | Muss erweitert/überarbeitet werden | Der Katalog erzeugt Top-Level-Felder, Typen und einzelne Bounds. Der Generator traversiert keine verschachtelten `additionalProperties`, Item-Schemas oder bedingten `allOf`-Regeln. Runtime Dispatch zeigt dadurch unter anderem Auth-, Secret-, Endpoint- und Größenregeln nicht zentral. |
| CFG-008 | Worker-Profile, Engines und Rollen | Fehlt komplett | Keine exhaustive Operatorreferenz. |
| CFG-009 | Helm-, GitOps- und Infrastrukturwerte | Muss erweitert/überarbeitet werden | Das enge Helm-Inventar deckt sieben von 17 Helm-/My-values-Quellen. Der ausdrücklich eingeschlossene GitOps-Scope enthält weitere elf distinct `gitops/platform/values/*.yaml`, damit mindestens 28 Quellen. Nested Defaults, Präzedenz, Ownership, Restartwirkung und effektive Werte bleiben unvollständig. |
| CFG-010 | Prism-, OpenClaw- und Codex-Konfiguration | Muss erweitert/überarbeitet werden | Katalog und Host Guide dokumentieren Pluginfelder; alte Prism-/Ops-Seiten enthalten weitere Einstellungen. Vollständige zentrale Config Sources, Defaults, Secrets, Precedence, Consumer und Verification fehlen. |
| CFG-011 | Umgebungsvariablen und Secrets | Muss erweitert/überarbeitet werden | Generierte alte Inventare und Secret-Seiten liefern Teilmengen. Eine vollständige zentrale Variable-/Secret-Consumer-Matrix mit Default, Sensitivity, Source, Scope, Rotation und Restartwirkung fehlt. |
| CFG-012 | Ports, Services, Endpunkte und Ingress | Fehlt komplett | Kein generierter Katalog. |
| CFG-013 | Precedence und Effective Values | Muss erweitert/überarbeitet werden | Install nennt fünf Runtime-Value-Schichten; Platform Loader erklärt relative Pfade. Pipeline-, Host-, Helm-, GitOps-, Env- und Secret-Familien besitzen kein gemeinsames Precedence-Modell und keine sichere Effective-config-Ausgabe. |
| CFG-014 | Änderungsauswirkung: Hot, Restart, New Run oder Migration | Fehlt komplett | Keine Matrix. |
| CFG-015 | Validierungs- und Konfigurationsfehler | Fehlt komplett | Über Code und alte Dokumente verteilt. |
| CFG-016 | Lint Policy und Kubernetes Policy Packs | Muss erweitert/überarbeitet werden | Lint-Guides, Decisions und Quellen erklären Teilaspekte. Eine zentrale Referenz für Policy-Version, Laden/Präzedenz, Targets, Scopes, Severities, Baselines, Waivers, Debt, immutable Pack Identity, Admission und Invalid-Policy-Verhalten fehlt. |
| CFG-017 | Gekoppelte Veröffentlichung von `.swarm/progress.json` und `pipeline.json` | Muss erweitert/überarbeitet werden | Einzelne Decisions und Pipelinequellen nennen beide Eingaben. Die zentrale Dokumentation erklärt Provenance-/Generation-Identitäten, Scaffolding, atomare Veröffentlichung, Kompatibilität, Partial-Publish-Fehler und unterstützte Reparatur nicht als einen Vertrag. |
| CFG-018 | Support- und Kompatibilitätskarte ausgelieferter Konfiguration | Muss erweitert/überarbeitet werden | `swarm.config.json`, Helm-Overrides und ausgelieferte Lint-/Toolkonfiguration sind teilweise sichtbar. Aktive Consumer, retained/legacy Felder, effektive Präzedenz und Migrationsverhalten sind nicht vollständig klassifiziert. |

## K. Beispielworkflows und `pipeline.json`

| ID | Prüfpunkt | Geprüfter Zustand | Befund und Nachweis |
| --- | --- | --- | --- |
| FLW-001 | Workflow vom Checkout bis zum Ergebnis | Fehlt komplett | Quickstart endet nach Checkout-/Inventar-Preflight; Operate beginnt mit bereits vorhandenen Platform-/Project-Dateien. Kein zentraler Ablauf verbindet sauberen Checkout, Konfiguration, Compile, Start, Beobachtung, Audit, Ergebnis und Cleanup. |
| FLW-002 | Validierte Beispiel-Plattformkonfiguration | Fehlt komplett | `docs/site` enthält keine redacted `pipeline-platform.v2`-Datei. Tests erzeugen temporäre Konfigurationen, aber kein sicheres, erklärtes und schema-validiertes Operatorbeispiel mit allen notwendigen Provider-/Grant-Beziehungen. |
| FLW-003 | Validiertes `nova-project.v2` Beispiel | Fehlt komplett | Der zentrale Bestand enthält keine vollständige Project-Datei. Compiler-Tests besitzen eine Fixture im Testcode; sie erklärt weder reale Pfade, Source Admission, Modules, Coverage, Final Gates noch Anpassungsstellen für Leser. |
| FLW-004 | Validiertes `.swarm/pipeline.json` Beispiel | Fehlt komplett | Der zentrale Bestand enthält keine Datei oder vollständigen Codeblock. Alte Setup-Texte verweisen auf die Datei, und Tests konsumieren sie indirekt, aber Syntax, Varianten und Validierung sind nicht als Operatorressource vorhanden. |
| FLW-005 | Vorher-/Nachher-Erklärung des kompilierten Graphen | Muss erweitert/überarbeitet werden | Operate zeigt den Compile-Befehl und erwartete Summary-Felder; Architektur erklärt den fixed graph. Eine konkrete Project-Datei, der daraus entstehende vollständige Graph, jede erzeugte Stage/Kante und die Gründe der Transformation fehlen. |
| FLW-006 | Erfolgreicher Run mit Audit, Artefakten und Telemetrie | Fehlt komplett | Commands für Start und Audit existieren getrennt. Kein reproduzierbarer zentraler Run zeigt echte Inputs, erwartete Stage-Zustände, Artifact IDs/Digests, Audit-Ausgabe, Observer/Telemetry-Beobachtung und abschließenden Nachweis. |
| FLW-007 | Stage-Fehler, Retry und Repair | Fehlt komplett | Architektur erklärt technische Retries und Product Repair; Plugin-Tests üben Teilpfade. Es fehlt ein Operatorworkflow mit absichtlich fehlerhafter Stage, Journal/Audit-Beobachtung, Budgetverbrauch, Retry, Repair Edge, Recheck und Terminalzustand. |
| FLW-008 | Wait, Approval und Resume | Muss erweitert/überarbeitet werden | Operate dokumentiert Signalbedingungen und beide Resume-Commands; Human-approval-Katalog erklärt Package-Fakten. Vollständige Pipeline-/Wait-/Signaldateien, erwartete Journalereignisse, stale/unauthorized Negativfälle und Cleanup fehlen. |
| FLW-009 | Unterbrechung und Recovery | Muss erweitert/überarbeitet werden | Operate und Recovery erklären sichere Regeln und Commands. Ein ausführbares Beispiel mit kontrolliertem Prozessabbruch, retained run identity, Snapshotprüfung, Recoveryausgabe, in-flight Attempt und finalem Audit fehlt. |
| FLW-010 | Unklarer externer Effekt | Muss erweitert/überarbeitet werden | Effectful Plugin Guide erklärt accepted-without-receipt, Reconciliation und den lokalen Test sehr tief. Ein operatorzentrierter Ablauf vom Pipeline-Audit über Effect Identity und externen Receipt Check bis autorisiertem Stop/Fortsetzen fehlt. |
| FLW-011 | Buster-Suite mit Fixture, Matrix und Report | Fehlt komplett | Buster Guide erklärt Authoring, Suite Resolution, Ports, Matrix, Evidence und Reports. Es fehlt eine vollständige `.swarm/pipeline.json`, die Fixture, Matrix-Test und Report Adapter kombiniert, auflöst, ausführt und ihr Gate-Ergebnis prüft. |
| FLW-012 | BuildKit, Registry und Image | Muss erweitert/überarbeitet werden | Architektur und Maintenance erklären Build-/Push-/Manifest-/Pull-Kette sowie Grenzen. Ein zentraler ausführbarer Workflow mit Client Config, Build Context, immutable Tag/Digest, Push, Buster Verification, uncached Node Pull, Failure und Cleanup fehlt. |
| FLW-013 | Tailscale-Exposure und Cleanup | Muss erweitert/überarbeitet werden | Architektur trennt Platform Route und Buster Fixture; Katalog nennt Retention Modes und Release. Ein vollständiger Workflow mit Operator/Target, ACL/DNS-Prerequisite, HTTPS Endpoint, Readiness, Handoff Generation, Release und Negativtest fehlt. |
| FLW-014 | Plugin aktivieren, prüfen, ersetzen und entfernen | Muss erweitert/überarbeitet werden | First Plugin und Testing Guide decken Authoring sowie generischen Lifecycle ab. Ein operatorzentriertes Beispiel mit realer Installation Root, Platform Selection, Role/Plan Binding, positiver Observation, Drain, Replacement, Removal und verbleibendem State fehlt. |
| FLW-015 | Redis-Ausfall und Wiederanlauf | Fehlt komplett | Diagnose, Recovery und Architektur nennen Stop-/Reconcile-Regeln. Kein fokussierter Ablauf zeigt Stream/Consumer-Baseline, kontrollierten Ausfall, erhaltene kanonische Events, Wiederanlauf, Replay/Dedup und Nachweis ohne Doppelzustellung. |
| FLW-016 | Worker-Abbruch und Result Recovery | Fehlt komplett | Worker- und Recoverykonzepte existieren verteilt. Kein zentraler Workflow zeigt akzeptierten Attempt, Prozessabbruch, Ownership/Journal/Spool, Supervisor-Recovery, sealed Result oder expliziten Recovery Stop. |
| FLW-017 | Demo Delivery, Readiness und Human Decision | Muss erweitert/überarbeitet werden | Namespace Controller und Demo-Handoff implementieren Candidate-/Source-/Result-Identität, Readiness, Retention und Entscheidungen. Es fehlt ein zentraler Ende-zu-Ende-Ablauf für Handoff, Readiness Receipt, autorisierte signierte Entscheidung, Verlängerung oder Ablauf, Teardown und die klare Trennung von Delivery und Produkt-Acceptance. |

## L. Developer-Handbuch

| ID | Prüfpunkt | Geprüfter Zustand | Befund und Nachweis |
| --- | --- | --- | --- |
| DEV-001 | Kanonischer Developer-Einstieg | Muss erweitert/überarbeitet werden | `docs/site/extend/README.md` ist ein starker Einstieg für Extensions. Es fehlt ein zentraler Developer-Einstieg für Core, Services, UI, Contracts, Data, Deployment und Release mit Ownership- und Check-Routing. |
| DEV-002 | Repository-, Workspace- und Toolchain-Setup | Muss erweitert/überarbeitet werden | `use/quickstart.md` liefert Clean Checkout, Node 24, Root-Arbeitsverzeichnis, Dependency-Installation, Inventarchecks und Pipeline-Einstieg; `extend/first-plugin.md` liefert die erste geprüfte Änderung. Ein gemeinsamer Developer-Setup-Weg für alle Workspaces, optionale Go/C/Container/Kubernetes-Tools, Services und Credentials fehlt. |
| DEV-003 | Build-, Start- und Debugwege je Komponente | Fehlt komplett | Build-, Runtime-, Service-, Studio-, Worker-, Chart- und Debugcommands liegen in Package-Scripts, READMEs und Tests. Keine zentrale Component Map nennt Entry Point, Build, Start, Debug, Logs, Test und Cleanup. |
| DEV-004 | Testpyramide und Auswahl des richtigen Checks | Muss erweitert/überarbeitet werden | Extension Testing erklärt Proof Ladder und paketbezogene Checks sehr gut. Core-, Contract-, Reliability-, Service-, UI-, Deployment-, Live-, E2E- und Release-Gates sind bei mehr als 170 npm-Scripts nicht als Change-to-check-Matrix erschlossen. |
| DEV-005 | CI-Workflows und erforderliche Gates | Muss erweitert/überarbeitet werden | Alte Testing-Seite nennt vier Checks und einen model-backed Harness; Workflows und Package-Scripts liefern das reale Inventar. Trigger, Required/Optional, Umgebung, Secrets, Artefakte, Timeout, Retry und Merge-/Releasewirkung fehlen zentral. |
| DEV-006 | Coding-, Contract- und Dependency-Regeln | Muss erweitert/überarbeitet werden | Extension Contracts und interne `BOUNDARIES.md` erklären wichtige Grenzen. TypeScript/ESM, Package Exports, Dependency Direction, Generated Code, Schema Evolution, Error Codes, Concurrency und Language-spezifische Regeln sind nicht als zentrales Contributor Contract vereint. |
| DEV-007 | Security-, Performance- und Lastprüfung | Fehlt komplett | Zahlreiche Security-, Performance-, Scale- und Live-Checks existieren. Es fehlt ein Developerworkflow für Threat Review, Testauswahl, sichere Fixtures, Benchmarkumgebung, Baseline, Budget, Ergebnisinterpretation und Regression Acceptance. |
| DEV-008 | Release, Versionierung, Migration und Changelog | Fehlt komplett | Operator Maintenance erklärt Deploymentänderungen, aber kein Developerweg verbindet Version Source, API/Schema SemVer, Generator, Migration, Compatibility, Changelog, Build Receipt, Promotion, Rollback und Deprecation. |
| DEV-009 | Dokumentationspflicht einer Codeänderung | Muss erweitert/überarbeitet werden | Qualitätsstandard und Clean-Room-Regel definieren die Pflicht. Eine maschinenlesbare Source-to-doc-/Owner-/Generator-/Check-Matrix und ein Contributor-Workflow, der betroffene Seiten zuverlässig findet, fehlen. |
| EXT-001 | Auswahl Konfiguration, Plugin, Engine oder Core | Vollständig vorhanden | Zentraler Choice Guide bietet Decision Flow, Vergleichstabelle, zwölf Szenarien, Unsupported Shortcuts und 23 geprüfte Source Links. |
| EXT-002 | Minimaler Pipeline-Stage-Weg | Vollständig vorhanden | First Plugin führt Package, Manifest, Schemas, Export, Role, Platform, Test, Activation, Failure und Removal durch; die gepflegte Beispielressource und der Harness prüfen den Weg. |
| EXT-003 | Fünf Pipeline-Extension-Verträge | Vollständig vorhanden | Contracts Guide erklärt Stage, Observer, Adapter, Test Provider und Report Adapter mit Authority, Daten, Failure, Recovery, Compatibility und direkten Quellen. |
| EXT-004 | Effects und State | Vollständig vorhanden | Effectful Guide erklärt Identity, Ordering, Locks, Fencing, Journalzustände, Retry, Resume, Cancellation, Cleanup, State-Grenzen und verifizierte Failure Exercises. |
| EXT-005 | Buster, Suites, Fixtures und Reports | Vollständig vorhanden | Buster Guide deckt Auswahl, Suite Resolution, Provider, Ports, Matrix, Evidence, Retry, Cleanup, Reports, Failure und Verification ab; vollständige Pipeline-Dateisyntax bleibt korrekt außerhalb dieses Scopes. |
| EXT-006 | Nova Stages, Adapter, Observer und Lint | Vollständig vorhanden | Nova Guide erklärt alle drei Surfaces, Resultwahl, Capability Selection, Observer Recovery, Lint Engine/Rules, Package-/Role-Integration und passende Checks. |
| EXT-007 | OpenClaw, Codex, Worker Engine und Rollen | Muss erweitert/überarbeitet werden | Der Host-and-Engine Guide trennt die Oberflächen und verfolgt einen Prism Attempt. Er bezeichnet das terminale Worker-Resultat jedoch als signiert. `attempt-executor.ts` bindet es über Digest und lokale Receipt; dies ist keine dauerhafte Ed25519-Provenienz. |
| EXT-008 | Extension Testing und Lifecycle | Vollständig vorhanden | Testing Guide verbindet Proof Ladder, reproduzierbaren Report, jeden Extensiontyp, Installation, Update, Disable, Removal, State und Diagnose. |
| EXT-009 | Vollständiger Plugin-Katalog | Muss erweitert/überarbeitet werden | 51 von 51 Manifests besitzen zentrale Seiten und belastbare Inventarfakten. Verschachtelte Konfiguration, Package-spezifische Funktionen und Erweiterungspunkte komplexer Plugins sind jedoch noch nicht vollständig zentral; Inventarvollständigkeit ist nicht Inhaltsvollständigkeit. |
| CDV-001 | Nova-Core-Änderung | Fehlt komplett | Choice Guide nennt die Grenze, aber kein zentraler Workflow erklärt Ownership, lokale Architektur, Change Design, Invariants, Testauswahl, Replay-/Compatibility-Proof und Review für Core-Code. |
| CDV-002 | Lifecycle, Scheduling, Retry, Repair und Wait ändern | Fehlt komplett | Keine Anleitung verbindet Reducer, Graph, Loop, Budgets, Wait/Signal, Journal, Snapshots, Error Codes, Determinismus-, Crash- und Migrationstests. |
| CDV-003 | Effects und Recoverysemantik ändern | Fehlt komplett | Plugin-Autoren sind gut geführt; Core-Entwickler erhalten keinen Weg für Effect Contracts, Identity, Journalformat, Locks/Fencing, Receipt Recovery, Corruption, Compatibility und Reliability Gates. |
| CDV-004 | Worker-Core-Protokoll, Supervisor oder Ressourcenmodell ändern | Fehlt komplett | Kein zentraler Developerweg erklärt Verträge, native Launcher/Channel, Ownership, Journal/Spool, Resource Pool, Cancellation, Sealing, C-Build, Host-Prerequisites und Recoverytests. |
| CDV-005 | Foundation Registry, Trust oder Isolation ändern | Fehlt komplett | Registry-/Isolationquellen und interne READMEs existieren. Discovery, Schema, Import Audit, Activation, Sandbox, cgroup, Threat Review, Negative Tests, Migration und Package Compatibility sind nicht als Change-Workflow dokumentiert. |
| CDV-006 | SDK oder öffentlichen Contract ändern | Fehlt komplett | Es fehlt ein zentraler Ablauf für Consumer Inventory, Versionentscheidung, Schema/Types/Exports, Generator, Fixtures, Backward/Forward Compatibility, Migration, Negative Absence und Release Note. |
| CDV-007 | Capability oder Telemetrieevent einführen | Fehlt komplett | Kein Workflow verbindet Vocabulary/Event Catalog, Provider/Consumer, Resource Match, Security Review, Payload/Redaction, Ordering, Docs Generation, Role Grants und End-to-end Verification. |
| CDV-008 | Buster Engine ändern | Fehlt komplett | Provider-/Suite-Authoring ist dokumentiert; Engine-Plan, Resolver, Runner, Store, Evidence, Report Finalization, Remote Authority, Compatibility und Gate-Auswahl sind nicht als Developerweg vorhanden. |
| CDV-009 | Prism Control, Worker, Ingestion oder Studio ändern | Fehlt komplett | Alte Architektur-/Implementierungsseiten und viele Component-Scripts enthalten Wissen. Kein zentraler Workflow ordnet Service Ownership, Local Stack, DB/Artifact Migration, API, Worker, UI, Security und Verification. |
| CDV-010 | Forge-, Echo-, Service- oder API-Integration ändern | Fehlt komplett | Pluginseiten erklären einzelne Registrierungen; ein Developerweg für Dispatch Contract, Host/Model, Input/Result, Lost Response, Policy, Versionierung, Test Harness und Deployment fehlt. |
| CDV-011 | Frontend oder interaktive Oberfläche ändern | Fehlt komplett | Kein zentraler Studio-/Architekturviewer-Weg erklärt Toolchain, State/Flow Contracts, Accessibility, Security, Visual Baseline, Browser Tests, Build und Preview/Release. |
| CDV-012 | Helm, GitOps oder Infrastruktur ändern | Fehlt komplett | Operatorseiten erklären Betrieb. Entwickler erhalten keinen Workflow für Chart/Values-Schema, Template, generated GitOps tree, Ownership, Security/Upgrade Review, Render/Policy/Live Checks und Rollbackkompatibilität. |
| CDV-013 | Datenmodell oder Migration ändern | Fehlt komplett | Kein gemeinsamer Vertrag erklärt Owner, Schemaänderung, Expand/Contract, Writer/Reader Compatibility, Backfill, Lock/Fence, Backup/Restore, Rollbackgrenze, Data Proof und Retirement. |

## M. Exhaustive Referenz

| ID | Prüfpunkt | Geprüfter Zustand | Befund und Nachweis |
| --- | --- | --- | --- |
| REF-001 | Reference-Index | Vollständig vorhanden | `docs/site/reference/README.md` erschließt Konfiguration, Betrieb, Extension Runtime und gemeinsame Sprache, trennt Reference von Understand/Use und nennt die derzeitige Abdeckungsgrenze ausdrücklich. Alle aktuellen Referenzseiten sind von diesem Einstieg erreichbar. |
| REF-002 | Alle CLI-Kommandos und Flags | Muss erweitert/überarbeitet werden | `reference/cli.md`, `use/install.md` und `use/operate.md` erklären zentrale Deploy-, Start-, Audit- und Recovery-Befehle. Andere ausführbare Einstiegspunkte und Skripte besitzen noch keine gemeinsame generierte CLI-Referenz mit Defaults, Voraussetzungen, Exit-Verhalten und Beispielen. |
| REF-003 | Alle Konfigurationsfamilien | Fehlt komplett | Konfiguration liegt in Schemas, Rollen, Charts, Deploy-Dateien und Pluginseiten verteilt. Keine zentrale Seite inventarisiert Familien, Präzedenz, Owner, Consumer, Reload-Verhalten und sensible Werte. |
| REF-004 | Alle Schemas, Constraints und Defaults | Fehlt komplett | Aktuell existieren 245 `*.schema.json`-Dateien unter `skills`, `contracts` und `charts`. Kein globaler Katalog ordnet sie Produktoberflächen, Versionen, Consumer, Constraints und Defaults zu. |
| REF-005 | Alle Fehlercodes mit Ursache, Wirkung und Recovery | Fehlt komplett | Alte Suite-Fehlerreferenzen sind keine kanonische Gesamtreferenz. `verify:docs:error-codes` meldet bereits in dieser Teilmenge 17 undokumentierte Codes; Core, Dienste und Infrastruktur sind nicht gemeinsam inventarisiert. |
| REF-006 | Alle Event- und Payloadtypen | Fehlt komplett | Allein `contracts/telemetry` enthält 124 JSON-Schemas in 134 Dateien. Es fehlt eine aktive Referenz für Producer, Consumer, Version, Korrelation, Reihenfolge, Wiederholung, Retention und Recovery je Event oder Payload. |
| REF-007 | Capabilities | Muss erweitert/überarbeitet werden | `reference/capabilities.md` wird aus Vocabulary und Registrierungen erzeugt, behandelt aber 34 Namen einheitlich als grantable capabilities, obwohl das Nova-Vocabulary nur 28 enthält. Sechs Buster-Runtime-Namen müssen von Nova-Grants getrennt werden; Operations-, Resource- und Constraint-Semantik sowie Generatorvalidierung fehlen. |
| REF-008 | Plugins und Registrierungen | Vollständig vorhanden | Der AP08-Katalog besitzt 51 Paketseiten plus Index. Inventar-, Coverage-, Source-Range- und Reader-Checks verbinden Pakete, Registrierungen, Schemas, Rollen, Tests und authored guidance. |
| REF-009 | Rollen und Package Ownership | Muss erweitert/überarbeitet werden | Rollenmanifeste und `packaging/runtime/package-ownership.json` liefern mechanische Fakten. Rollen erscheinen teilweise in Architektur und Plugin-Katalog, aber eine zentrale Reference mit Bundle-Inhalt, Entrypoint, Consumer, Grenzen und Änderungswirkung fehlt. |
| REF-010 | Contracts, Versionen und Kompatibilität | Fehlt komplett | Vertragsdateien und einzelne Erklärungen existieren, jedoch keine zentrale Matrix für Contract-ID, Schema-Version, Producer, Consumer, Kompatibilitätsrichtung, Migrationsregel und Retirement. |
| REF-011 | Ports, Endpunkte und Netzwerkpfade | Fehlt komplett | Endpunkte stehen verteilt in Code, Charts und Operationsquellen. Es gibt keine exhaustive Referenz für Bind-Adresse, Port, Protokoll, Authentisierung, Aufrufer, Netzwerkgrenze, Health und Exposure. |
| REF-012 | Secrets, Umgebungsvariablen und Consumer | Muss erweitert/überarbeitet werden | Pluginseiten, Helm-Slices und Deploymenttexte erklären Teilmengen. Es fehlt ein vollständiges, sicher redigiertes Inventar für Name, Quelle, Consumer, Pflichtstatus, Default, Rotation, Reload und Fehlerwirkung. |
| REF-013 | Helm- und GitOps-Werte | Muss erweitert/überarbeitet werden | Das vorhandene Helm-Inventar deckt sieben von 17 engen Helm-/My-values-Quellen und keine der elf zusätzlichen GitOps-Values-Dateien ab. Im ausdrücklich kombinierten Scope sind damit mindestens sieben von 28 Quellen abgedeckt und 21 offen; Präzedenz, sensible Felder, Upgrade-Wirkung und Consumer bleiben lückenhaft. |
| REF-014 | Stores, Pfade und Retention | Muss erweitert/überarbeitet werden | `use/recovery.md` enthält bereits ein zentrales 15-zeiliges State Inventory mit Owner, Authority, Protection Boundary und Grenzen. Für eine exhaustive Referenz fehlen noch konkrete Pfade, Lebensdauer, Quotas, Cleanup, vollständige Backup-/Restore-Verfahren und Verlustwirkung. |
| REF-015 | Images, Versionen und Digests | Muss erweitert/überarbeitet werden | Build- und Releasequellen dokumentieren einzelne Identitäten. Eine aktive Reference, die Image-Quelle, Version, Plattform, Digest, Rolle, Promotion, Deployment und Prüfung verbindet, fehlt. |
| REF-016 | Verifikationscommands und CI-Workflows | Muss erweitert/überarbeitet werden | `reference/verification-commands.md` und `reference/workflows.md` erfassen wichtige Checks und alle 13 Workflowdateien; Guides nennen weitere relevante Teilmengen. Eine exhaustive Zuordnung aller Commands zu Zweck, Scope, Umgebung, Schreibwirkung, erwarteter Ausgabe, Owner und Change-to-check-Routing fehlt. |
| REF-017 | Glossar | Vollständig vorhanden | `reference/glossary.md` definiert zentrale Begriffe und grenzt ähnliche Begriffe ausdrücklich ab. Neue AP09-Seiten müssen neue Fachbegriffe ergänzen und der globale Reader-Review muss Konsistenz erneut prüfen. |
| REF-018 | Public SDK API und Value-/Identity-Regeln | Muss erweitert/überarbeitet werden | SDK-Package, Exports und Implementierungen liefern eine belastbare Quelle; Extension-Guides erklären ausgewählte Nutzung. Eine vollständige Consumer-Referenz für Entry Points, Types, Helpers, Testing API, canonical/portable JSON, Digest-, Approval- und Artifact-Identitäten, Kompatibilität und Reject-Verhalten fehlt. |

## N. Entscheidungen, Status und Veröffentlichung

| ID | Prüfpunkt | Geprüfter Zustand | Befund und Nachweis |
| --- | --- | --- | --- |
| DEC-001 | Entscheidungen mit stabilen IDs | Vollständig vorhanden | Der Decision-Bereich bewahrt ADR-001–ADR-022, D-001–D-119, D01–D16, D12 sowie ursprüngliche Finding-IDs. Der Index erklärt die getrennten Namensräume und verbietet stilles Umschreiben von Autorität. |
| DEC-002 | Gründe, Alternativen, Konsequenzen und Supersession | Muss erweitert/überarbeitet werden | Viele ADRs enthalten diese Felder detailliert. Drei Decision-Seiten haben jedoch kein `Evidence`-Metadatum; der Publication-Check findet ungültige Belegpfade, entfernte Contract-Terme und weitere redaktionelle Fehler. Nicht jede abgeleitete Entscheidung besitzt dieselbe strukturierte Tiefe. |
| STA-001 | Aktueller Status, offene Implementierung und Live-Gates | Vollständig vorhanden | `status/current.md`, der aus JSON generierte offene Registerbestand und `status/acceptance.md` trennen Source-Status, offene Implementierung, lokale Verifikation und Live-Abnahme. Stable IDs und Acceptance-Gates verbinden die Sichten. |
| STA-002 | Öffentliche Statusangaben stimmen mit Registern überein | Vollständig vorhanden | `status/current.md`, Understand-Seiten, Roadmap und Acceptance trennen den aktuellen Bestand, abgeschlossene Dokumentationspakete, offene Produktarbeit und Live-Abnahmen. Die früheren AP04-/AP08-Zwischenstände wurden bereinigt; Status- und Blueprint-Generatoren sind aktuell. |
| PUB-001 | Navigation erreicht jede Kernaufgabe | Muss erweitert/überarbeitet werden | Die drei Einstiege Understand, Operate und Extend sind klar. Exhaustive Reference, Platform/Core Development, vollständige Workflows und mehrere Infrastrukturaufgaben fehlen oder sind nur über alte Quellen erreichbar. |
| PUB-002 | Suchindex und Allowlist | Muss erweitert/überarbeitet werden | Ein Verzeichnis-Boundary begrenzt die Veröffentlichung auf `docs/site`. Entgegen `docs/README.md` besitzt `scripts/docs-publication.mjs` aber keine explizite Seiten-Allowlist; es läuft rekursiv über alle Markdownseiten. Ein Suchindex fehlt. |
| PUB-003 | Links, Anker und revisionsgebundene Codebelege | Muss erweitert/überarbeitet werden | AP06–AP08 besitzen viele direkte und gepinnte Belege sowie strukturelle Checks. Der Publication-Check findet dennoch ungültige Evidence-Pfade; neue Reference- und Developer-Seiten benötigen erst ihre Quellenlinks. |
| PUB-004 | Codevorschau aus derselben Quelle | Fehlt komplett | Der Build wandelt Evidence-Pfade in revisionsgebundene Links um, rendert aber keinen Quellausschnitt. Es gibt keine Komponente, die Link und automatisch aus derselben Revision gelesenen Code in einem Kasten verbindet. |
| PUB-005 | Diagramme mit Textalternative | Muss erweitert/überarbeitet werden | Neun geprüfte Diagramme besitzen textliche Erklärungen und Belege. Die Detailarchitektur für noch fehlende Core-, Kommunikation-, Daten- und Plattformthemen benötigt weitere gezielte Diagramme; eine gerenderte visuelle Abnahme fehlt. |
| PUB-006 | Interaktivität mit statischem Fallback | Fehlt komplett | Der aktuelle Build kopiert Markdown und erzeugt einen Bericht. Es gibt weder interaktive Architekturansicht noch statischen Export einer solchen Ansicht. Umsetzung bleibt optional und braucht einen konkreten Lesernutzen. |
| PUB-007 | Mobile, Tastatur und Accessibility | Muss erweitert/überarbeitet werden | Markdown ist grundsätzlich portabel und Diagramme haben Textalternativen. Es gibt jedoch keinen finalen Renderer und keine dokumentierte Abnahme für schmale Viewports, Tastatur, Fokus, Kontrast oder Screenreader. |
| PUB-008 | Lokaler Build und CI-Publication-Gates | Muss erweitert/überarbeitet werden | Lokale Generate-, Check- und Build-Kommandos existieren. `docs:publication:check` ist rot, und `.github/workflows/docs-checks.yaml` führt weder Publication-/Blueprint- noch Suite-Dokumentationschecks aus. Der Build kopiert Markdown statt eine Leserpräsentation zu rendern. |
| PUB-009 | Keine parallelen widersprüchlichen Altpfade | Muss erweitert/überarbeitet werden | `docs/site` ist als Ziel erklärt, doch aktive Seiten verlinken noch notwendige alte Architektur-, Deployment-, Operations- und Reviewquellen. AP10 darf sie erst nach validierter Informationsübernahme entfernen. |

## O. Wartbarkeit und Drift-Erkennung

| ID | Prüfpunkt | Geprüfter Zustand | Befund und Nachweis |
| --- | --- | --- | --- |
| MNT-001 | Eine Quelle der Wahrheit je mechanischem Fakt | Muss erweitert/überarbeitet werden | Manifest-, Registration- und Capability-Fakten folgen bereits Quellgeneratoren. Konfiguration, CLI, Contracts, Events, Fehler, Endpunkte und Stores werden dagegen noch mehrfach oder gar nicht redaktionell abgebildet. |
| MNT-002 | Generierte Pluginfakten | Vollständig vorhanden | AP08 erzeugt 51 Paketdatensätze und Katalogseiten aus Manifesten, Package-Metadaten, Schemas, Rollen und Testdateien. Separates Guidance-JSON schützt die redaktionellen Erklärungen. |
| MNT-003 | Generierte Konfigurationen und Defaults | Muss erweitert/überarbeitet werden | Der Publication-Generator erzeugt bereits Plugin-Konfigurationsfelder und Defaults; das Helm-Inventar erfasst eine weitere Teilmenge. Ein globales Inventar über alle Config-Schemas, Values, Rollen und Dienste samt Präzedenz und Consumern fehlt weiterhin. |
| MNT-004 | Generierte CLI-Flags | Fehlt komplett | Kein Generator extrahiert alle Commands, Subcommands, Optionen, Defaults und Exitcodes aus Skripten und Entrypoints. Das Deployment-Inventar deckt nur einen Bedienpfad ab. |
| MNT-005 | Generierte Fehlercodes | Fehlt komplett | Der Suite-Check vergleicht eine alte Teilreferenz, erzeugt aber keinen kanonischen Gesamtkatalog. Für Core, Services, Plugins und Infrastruktur gibt es keinen gemeinsamen Extractor. |
| MNT-006 | Generierte Events und Payloads | Fehlt komplett | Telemetrie- und weitere Contract-Schemas liegen maschinenlesbar vor, werden aber nicht zu einer aktiven Event-/Payloadreferenz mit Producer- und Consumerbeziehungen erzeugt. |
| MNT-007 | Generierte Rollen, Packages und Registrierungen | Vollständig vorhanden | Rollenmanifeste, Package-Ownership, Plugin-Inventar und Publication-Generator erfassen Rollenaufnahme, Host und Registrierungen. AP08-Checks erkennen fehlende oder zusätzliche Pakete. |
| MNT-008 | Generierte Ports, Endpunkte, Stores und Retention | Fehlt komplett | Es gibt keinen maschinenlesbaren Gesamtbestand oder Generator für diese Betriebsflächen. Werte bleiben über Charts, Code, Config und Runbooks verteilt. |
| MNT-009 | Source-to-Doc-Abdeckungsmatrix | Fehlt komplett | Topic Map und dieses Audit listen Themen, aber kein Checker ordnet jede entdeckte öffentliche Oberfläche einer kanonischen Zielseite, einem Owner und einem Driftcheck zu. |
| MNT-010 | Driftcheck für Schemafelder | Muss erweitert/überarbeitet werden | `verify:docs:schema-fields` prüft eine deklarierte Teilmenge von 16 der insgesamt 245 `*.schema.json`-Dateien und meldet aktuell `minimumExecutedTests`, `requiredTests` und `retentionMode`. Die 229 Dateien außerhalb dieser Teilmenge besitzen keine gleichwertige globale Abdeckung; auch innerhalb der Teilmenge ist rekursive Feldabdeckung separat zu beweisen. |
| MNT-011 | Driftcheck für Fehlercodes | Muss erweitert/überarbeitet werden | `verify:docs:error-codes` erkennt aktuelle Suite-Drift und meldet 17 konkrete Codes. Der Check deckt nicht alle Fehlerproduzenten ab und die geprüften Seiten liegen noch außerhalb der zentralen Site. |
| MNT-012 | Driftcheck für Plugins und Registrierungen | Vollständig vorhanden | Inventory-, Publication-, Choice-, Minimal-, Advanced-, Effectful-, Observer- und Reader-Reference-Checks decken die 51 Plugins und ihre Registrierungen ab. |
| MNT-013 | Driftcheck für Links, Anker und Quellbereiche | Vollständig vorhanden | `docs:check:refs` prüft lokale Ziele und Anker; der AP08-Reader-Check prüft zusätzlich gepinnte Git-Quellbereiche. Die Checks trennen strukturelle Gültigkeit ausdrücklich von semantischer Review. |
| MNT-014 | Ausführbare, schema-validierte Beispiele | Muss erweitert/überarbeitet werden | Das minimale Pluginbeispiel wird ausgeführt, und `verify:docs:examples` besteht für seine Suite-Teilmenge. Vollständige Operator-, Pipeline-, Config-, Failure- und Infrastrukturbeispiele fehlen. |
| MNT-015 | Owner und Reviewpflicht bei Codeänderungen | Fehlt komplett | Seiten nennen Owner, doch es existiert keine vollständige maschinenlesbare Zuordnung von Quelloberfläche zu Dokumentseite, Owner, Reviewer und erforderlichem Check. |
| MNT-016 | Generatoren überschreiben keine Erklärungen | Vollständig vorhanden | AP08 trennt mechanisches Inventar, lokale Verifikation und authored guidance. Die Generatoren bauen Faktenblöcke neu, ohne die redaktionelle Begründung aus Quellcode abzuleiten oder zu überschreiben. |
| MNT-017 | Pflegeanleitung für Dokumentationsagenten | Fehlt komplett | Der Qualitätsstandard beschreibt Ziele, aber es gibt noch keinen ausführbaren zentralen Wartungsvertrag für Discovery, Änderungsauswirkung, Generierung, Review, Leserprobe und sichere Altdatei-Entfernung. AP11 muss ihn liefern. |

## P. Qualitäts- und Leserabnahme

| ID | Prüfpunkt | Geprüfter Zustand | Befund und Nachweis |
| --- | --- | --- | --- |
| QUA-001 | Verständliches technisches Englisch und technische Tiefe | Muss erweitert/überarbeitet werden | AP06–AP08 erklären viele schwierige Grenzen in klarem technischem Englisch. Die fehlenden Architektur-, Operator-, Workflow-, Developer- und Reference-Bereiche verhindern eine globale Abnahme; Decision- und Statusseiten enthalten noch schwer lesbare Sätze. |
| QUA-002 | Kontrollierte technische Sprache | Muss erweitert/überarbeitet werden | Ein eigener Controlled-Language-Check und redaktionelle Regeln nach ASD-STE100-Prinzipien existieren. Der Publication-Check meldet Passiv, vage Wörter und zu lange Sätze. AP11 muss die verbleibenden Befunde und Leserproben abschliessen. Eine formale oder lizenzierte ASD-STE100-Zertifizierung ist nicht erforderlich und wird nicht behauptet. |
| QUA-003 | Jede wichtige Entscheidung begründet | Muss erweitert/überarbeitet werden | ADRs erklären häufig Grund, Alternativen, Folge und Supersession. Noch fehlende Core-, Daten-, Konfigurations-, Operations- und Developer-Themen besitzen diese Erklärung nicht durchgängig im zentralen Leserpfad. |
| QUA-004 | Jede technische Behauptung passend belegt | Muss erweitert/überarbeitet werden | Evidence-Metadaten und direkte Source-Links sind Standard in der aktiven Site; die zuvor falsch getrennten Decision-Evidence-Pfade sind korrigiert und der Publication-Check akzeptiert sie. Der noch unvollständige Inhaltsbestand und die fehlende exhaustive Source-to-doc-Matrix verhindern weiterhin eine globale Belegabnahme. |
| QUA-005 | Keine falschen Live- oder Vollständigkeitsclaims | Muss erweitert/überarbeitet werden | Der Qualitätsstandard und die Statusstruktur trennen Source, lokal geprüft und live abgenommen. Trotzdem nennen `status/current.md` und zwei Understand-Seiten AP04/AP08 falsch oder veraltet; globale Vollständigkeit darf daher noch nicht behauptet werden. |
| QUA-006 | Leserprobe neuer technischer Leser | Fehlt komplett | Understand besitzt einen guten Einstieg und Systemfluss, aber dies ist nur die Voraussetzung. Eine dokumentierte unabhängige End-to-End-Leserprobe über Navigation, Begriffe, Workflow, Reference und Fehlerweg der gesamten Site wurde noch nicht ausgeführt. |
| QUA-007 | Leserprobe Operator | Fehlt komplett | Es gibt keine unabhängige Abnahme, in der ein Operator Installation, Konfiguration, Beispielpipeline, Diagnose, Recovery und Cleanup ausschließlich mit der zentralen Dokumentation ausführt. |
| QUA-008 | Leserprobe Extension Developer | Vollständig vorhanden | AP08 wurde mit festem Scope unabhängig geprüft. Katalog, Choice Guide, Minimal- und Advanced-Pfade sowie Referenzen wurden akzeptiert; die festgestellten Runtime-Probleme stehen getrennt im offenen Register. |
| QUA-009 | Leserprobe Platform/Core Developer | Fehlt komplett | Das zentrale Developer-Handbook und seine komponentenspezifischen Change-Workflows fehlen. Deshalb kann noch kein unabhängiger Leser eine Core-/Platformänderung ohne Package- oder Chatwissen ausführen. |
| QUA-010 | Wartbarkeitsprobe mit künstlicher Oberflächenänderung | Fehlt komplett | Es gibt keine Mutation-Abnahme, die je ein neues Config-Feld, Event, Plugin, Flag und Fehlercode einführt und beweist, dass CI die jeweils fehlende Dokumentation erkennt. |

## Bereits bestätigte globale Befunde

| Befund | Ergebnis |
| --- | --- |
| Aktive Architekturmenge | 2.074 Zeilen unter `docs/site/understand` |
| Aktive Operatormenge | 2.229 Zeilen unter `docs/site/use` |
| Aktive Extension-Guides | 3.069 Zeilen ohne Katalog |
| Plugin-Katalog | 51 Paketseiten plus Index; 8.078 Zeilen |
| Aktive Reference | neun Markdown-Seiten einschließlich zentralem Einstieg; noch nicht exhaustive |
| Plugin-Konfigurationsschemas | 57 unterschiedliche externe `configSchema`-Pfade; Inline-Hostschemas separat |
| Schema-Dateien unter Skills, Contracts und Charts | 245 Dateien mit Suffix `*.schema.json`; weitere anders benannte, eingebettete und CRD-Schemas existieren |
| Telemetrie-Schemadateien | 124 JSON-Schemas in 134 Contract-Dateien; keine vollständige aktive Referenz |
| Helm-/My-values-/GitOps-Values-Quellen | mindestens 28; vorhandenes Helm-Inventar deckt 7 ab |
| GitHub-Workflowdateien | 13 |
| Publication Check | bestanden; 98 publizierte Markdown-Seiten und 51 Pluginseiten geprüft |
| Blueprint Check | bestanden; generierte Blueprint-Ausgabe ist aktuell |
| Suite-Schema-Dokumentationscheck | fehlgeschlagen; drei Felder fehlen |
| Suite-Fehlercodecheck | fehlgeschlagen; 17 Fehlercodes fehlen |
| Suite-Beispielcheck | bestanden |
| Vollständiger Docs-Check | AP09-Katalog, Generatoren, Markdown, Links, Reader-Grenze, Coverage, Publication und Blueprint bestanden; der abschließende Suite-Migrationscheck bleibt wegen der dokumentierten Proof-, Umgebungs-, Schema- und Fehlerreferenzlücken rot |

## Einzelprüfprotokoll

| Datum | IDs | Geprüfte Quellen und Seiten | Ergebnis | Änderungen oder verbleibende Lücke | Checks |
| --- | --- | --- | --- | --- | --- |
| 17.09.2026 | gesamter Katalog | Vollständige interne Review-Reconciliation gegen aktuellen PR-Stand | 47 vollständig; 144 zu erweitern; 70 fehlen | 261 eindeutige Anforderungen; elf Review-Korrekturen, zehn Ergänzungen und aktuelle mechanische Befunde übernommen; unabhängiges AP09.0-Gate offen | `docs:ap09:catalogue:check`; Publication-, Blueprint- und Suite-Dokumentationschecks; Bestandszählungen |
| 17.09.2026 | GOV-001–GOV-008; ENT-001–ENT-005 | `docs/README.md`; Site-Einstiege; Understand-Trace; Glossar; Topic Map; Blueprint-Regeln; Publication-Skript | 7 vollständig; 6 zu erweitern; 0 fehlen | Reader-Grenze und frühere AP04-/AP08-Statussätze bereinigt; erster vollständiger Pipeline-Workflow bleibt offen | Metadaten-, Status-, Coverage-, Publication-, Link- und Generierungschecks |
| 17.09.2026 | ARC-001–ARC-006 | Understand-Einstieg; Components and Authority; Request, State, and Recovery; Pipeline Dependencies; Deployment and Trust; Platform and Operations; Decisions | 4 vollständig; 2 zu erweitern; 0 fehlen | Systemfluss und Autorität bestätigt; Decision-Qualität und gemeinsame Kommunikations-/Datenmatrix bleiben offen | Diagramm- und Evidence-Check; `docs:publication:check`; Linkprüfung; manuelle Quellenprüfung am Stand `51cda627` |
| 17.09.2026 | NVC-001–NVC-018 | Aktive Understand-, Use- und Extend-Seiten; 84 Dateien unter `skills/nova/core`; sieben interne Core-Dokumente; Nova-Project-README | 1 vollständig; 16 zu erweitern; 1 fehlt | Rollengrenze vollständig; tiefe Core-Erklärungen müssen aus internen Quellen in kanonische Architektur und Referenz integriert werden; Fehlerkatalog fehlt | Quell-/Dokumentinventar; aktive Source-Link-Abdeckung; manuelle Ablauf- und Grenzprüfung am Stand `51cda627` |
| 17.09.2026 | WKC-001–WKC-014 | Aktive Components-, Trust- und Engine-Seiten; 38 Dateien unter `skills/worker/core`; Worker-Verträge; historische Phase-5.5-Audits nur als Leads | 1 vollständig; 6 zu erweitern; 7 fehlen | Neutrale Grenze und Engine-Integration sind vorhanden; native Runtime, Persistenz, Ownership, Ressourcen und Referenz benötigen kanonische Dokumentation | Quell-/Dokumentinventar; aktive Source-Link-Abdeckung; manuelle Vertrags- und Grenzprüfung am Stand `51cda627` |
| 17.09.2026 | SPC-001–SPC-010 | Aktive Components-, Deployment-, Trust-, Buster-, Nova-, Host-/Engine- und Decision-Seiten; Buster-, Prism-, Forge-, Echo-, OpenClaw-, Codex-, Namespace-Controller-, Ops-MCP- und Archviewer-Quellen | 0 vollständig; 10 zu erweitern; 0 fehlen | Namespace Controller, Ops MCP und Archviewer als eigene prüfbare Produktoberflächen ergänzt | Review-Reconciliation; Seiten-/Quellinventar und manuelle Flow-, Daten-, Recovery- und Betriebsprüfung |
| 17.09.2026 | PLG-001–PLG-014 | Choice Guide; Contracts; Testing and Lifecycle; Deployment and Trust; Capability Reference; Foundation Registry, Package, Config und Isolation Sources | 4 vollständig; 9 zu erweitern; 1 fehlt | Authoring, immutable Replacement und Lifecycle sind stark; Registry-Interna, Trust, Config und Isolation brauchen Tiefe; Import Audit fehlt als kanonischer Inhalt | AP08-Checks; 51-Package-Inventar; direkte Source-Link-Prüfung; manuelle Contract-/Lifecycle-Prüfung am Stand `8df232e1` |
| 17.09.2026 | COM-001–COM-012; DAT-001–DAT-009; TEL-001–TEL-007 | Aktive Architecture-, Trust-, Recovery-, Diagnose-, Contracts-, Buster-, Nova- und Effect-Seiten; Transport-, Store-, Journal- und Telemetriequellen | 2 vollständig; 18 zu erweitern; 8 fehlen | Zentrale Kommunikations-, Endpoint-, Daten- und Eventmatrizen fehlen; Observer-Lifecycle und Authority-vs-Observability sind vollständig; externe Recovery-Verweise verletzen das Zentralitätsziel | 124 Schema-/134 Contract-Dateien gezählt; aktive Quellverweise geprüft; Stores/Transporte inventarisiert; manuelle Flow-/Recovery-Prüfung am Stand `a3bcc527` |
| 17.09.2026 | INF-001–INF-012; SEC-001–SEC-007 | Platform and Operations; Pipeline Dependencies; Deployment and Trust; Worker Trust; Install/Recovery; Roadmap; Charts, GitOps values, deploy/config/check scripts; alte Security/Ops-Seiten nur als Migrationsquellen | 5 vollständig; 14 zu erweitern; 0 fehlen | Ops-Rechte korrigiert und LiteLLM als eigene Oberfläche ergänzt; Querschnittsmatrizen bleiben offen | Review-Reconciliation; direkte Source-/Roadmap- und Failure-/Recovery-/Security-Prüfung |
| 17.09.2026 | OPR-001–OPR-010; OPL-001–OPL-005; CFG-001–CFG-018 | Zentraler Use-Track und Plugin-Katalog; CLI-/Config-Schemas; Deployment-, Operations-, Reference- und Ops-Quellen | 4 vollständig; 20 zu erweitern; 9 fehlen | Resume, rekursive Plugin-Config, Prism-Reise, Lint Policy, Published Pair und Shipped-Config-Grenzen ausdrücklich erfasst | Review-Reconciliation; Command-/Schemaquellen und AP07/AP08-Checks |
| 17.09.2026 | FLW-001–FLW-017 | Zentraler Quickstart, Operate, Recovery, Architecture, Buster, Effect und Plugin Lifecycle; aktive Beispiele; Compiler-/Reliability-/E2E-Fixtures als Quellen | 0 vollständig; 8 zu erweitern; 9 fehlen | Demo Delivery/Readiness/Human Decision ergänzt; vollständige Pipeline-, Failure- und Infrastructure-Workflows bleiben offen | Zentraler Beispielbestand, Pipeline-Dateiverweise und Review-Reconciliation |
| 17.09.2026 | DEV-001–DEV-009; EXT-001–EXT-009; CDV-001–CDV-013 | Zentraler Extend-Track; alter Developer-Baum; Package-/Core-READMEs; Scripts und CI; Komponentenquellen | 7 vollständig; 8 zu erweitern; 16 fehlen | Setup ist teilweise vorhanden; Worker-Authentizität und Katalogtiefe korrigiert; Plattform-/Core-Change-Wege bleiben offen | Developer-/Scriptinventar; AP08-Checks; Review-Reconciliation |
| 17.09.2026 | REF-001–REF-018 | Aktive Reference; Plugin-Katalog; Schemas; Contracts; Rollen; Package-Ownership; Config-, Deploy-, Release-, SDK- und Workflowquellen | 3 vollständig; 9 zu erweitern; 6 fehlen | Reference-Einstieg ist vorhanden; Capability-Namensräume getrennt zu dokumentieren; SDK als eigener Punkt ergänzt | 245 Suffix-Schemas, 13 Workflows und 124 Telemetrie-Schemas in 134 Dateien; Publication-Check |
| 17.09.2026 | DEC-001–DEC-002; STA-001–STA-002; PUB-001–PUB-009 | Decision- und Statusbestand; Site-Navigation; Publication-Skript und Docs-CI; Blueprint-Publikationsregeln | 3 vollständig; 8 zu erweitern; 2 fehlen | Status und mechanische Publication-Befunde korrigiert; Suche, Codevorschau und optionale Interaktivitätsentscheidung bleiben offen | Publication- und Blueprint-Check grün; 13 Workflowdateien inventarisiert |
| 17.09.2026 | MNT-001–MNT-017 | Package-Scripts; Docs-Generatoren; AP08-Inventare und Checks; Schema-/Error-/Example-Checks; Docs-CI | 5 vollständig; 5 zu erweitern; 7 fehlen | Vorhandene Config-Teilgeneratoren anerkannt; globale Generatoren, Surface-to-doc- und Ownership-Matrix fehlen | Schema-Check rot mit 3 Feldern; Error-Check rot mit 17 Codes; Example-, Publication- und Blueprint-Check grün |
| 17.09.2026 | QUA-001–QUA-010 | Qualitätsstandard; aktive Site; Publication-Sprachcheck; AP08-Abnahme; Status- und Evidence-Grenzen | 1 vollständig; 5 zu erweitern; 4 fehlen | Globale technische Leserprobe korrekt als noch nicht ausgeführt eingestuft; bekannte Evidence-Parserfehler sind behoben | Publication-Sprach-/Evidence-Check; AP08-Acceptance; Review-Reconciliation |

## Verbindliche AP09-Umsetzungspakete

Die Pakete bauen ausschließlich den zentralen Bestand unter `docs/site` aus. Alte
Dateien bleiben bis zur validierten Übernahme Quellen. AP10 entfernt sie danach.
Jede ID mit Überarbeitungsbedarf oder fehlendem Inhalt gehört genau einem primären
Paket. Vollständige Punkte dienen als Abnahmeabhängigkeit und werden nicht neu
geschrieben, wenn kein belegter Fehler vorliegt.

| Paket | Primärer Umfang | Ergebnis und Reihenfolge |
| --- | --- | --- |
| AP09.1 — Wahrheit und Leserwege | `GOV-001`–`GOV-004`, `GOV-006`, `GOV-008`, `ENT-001`–`ENT-004`, `DEC-*`, `STA-*` | Status, Source Authority und Navigation zuerst vereinheitlichen. Nachgewiesene Falschaussagen in später verantworteten Punkten werden als Voraussetzung korrigiert, ohne deren vollständigen Abschluss vorzutäuschen. |
| AP09.2 — Nova Core und Plugin Runtime | `ARC-*`, `NVC-*`, `PLG-*` | Nova Core, Registry, Plugin-Laufzeit, Zustände und Autoritätsgrenzen vollständig erklären. |
| AP09.3 — Worker Core und native Ausführung | `WKC-*` | Worker-Verträge, native Prozesse, Ressourcen, Persistenz, Recovery und Result-Seal als eigenen tiefen Pfad dokumentieren. |
| AP09.4 — Prism in Depth | Prism-Anteile aus `SPC-*`, `OPR-*` und `CDV-*` | Control, Worker, Studio, Datenmodell, Storage, Retrieval, Rendering, Operatorreise und Erweiterung zusammenführen. |
| AP09.5 — Buster und zwölf Suites | Buster-Anteile aus `SPC-*`, `CFG-*`, `FLW-*`, `EXT-*` und `CDV-*` | Buster Engine, Namespace Controller und jede bestehende Suite einschließlich Konfiguration und Erweiterung dokumentieren. |
| AP09.6 — Lint | Lint-Anteile aus `CFG-*` und den Developer-Anforderungen | Engine, Regeln, Tools, Policy Packs, Konfiguration und alle Erweiterungswege als eigenes Paket behandeln. |
| AP09.7 — Plattform, Spezialisten und Sicherheit | `COM-*`, `DAT-*`, `TEL-*`, `INF-*`, `SEC-*` sowie nicht separat geführte `SPC-*` | Pflicht- und optionale Infrastruktur, Kommunikation, Daten, Telemetrie, Forge, Echo, Hosts, Ops MCP und Archviewer integrieren. |
| AP09.8 — Operator und Konfiguration | verbleibende `OPR-*`, `OPL-*`, `CFG-*` | Installation, Betrieb, Recovery und jede Konfigurationsquelle mit Defaults und Präzedenz liefern. |
| AP09.9 — Pipeline und Workflows | `ENT-005` und verbleibende `FLW-*` | Den vollständigen ersten Pipeline-Weg, alle `pipeline.json`-Möglichkeiten und repräsentative Normal-, Fehler-, Resume- und Cleanup-Wege dokumentieren. |
| AP09.10 — Developer-Handbuch und komplexe Plugins | `DEV-*`, `EXT-*`, `CDV-*` ohne Prism-/Buster-Sonderzuordnung | Setup, Build, Test, Release, Change-to-check und tiefe komplexe Plugin-Guides erstellen. |
| AP09.11 — Exhaustive Reference und Drift | `GOV-005`, `REF-*`, `MNT-*` | Die Trennung generierter Fakten und redaktioneller Erklärungen auf alle exhaustive Referenzfamilien anwenden; Faktenkataloge, SDK-Referenz, CI und Wartungsvertrag aufbauen. |
| AP09.12 — Veröffentlichung | `GOV-007`, `PUB-*` | Die vorhandene Redirect-/Deprecation-Registry in wirksame Publication-Ausgaben umsetzen; Allowlist, Suche, Code-Evidence-Boxen, Diagramme und Accessibility integrieren. |
| AP09.13 — Gesamtprüfung | `QUA-*` | Sprache, Begründungen, Belege, Reader-Proben und Mutation-Test nach Abschluss aller Inhalte durchführen. |

AP09.1 bis AP09.11 liefern Inhalt und mechanische Wahrheit. AP09.12 darf erst dann
die endgültige Navigation und Darstellung einfrieren. AP09.13 prüft das integrierte
Ergebnis. Diese Reihenfolge verhindert, dass ein schöner Renderer unvollständigen
oder widersprüchlichen Inhalt verdeckt.

## Abschluss von AP09.0

AP09.0 ist abgeschlossen, wenn:

1. jede ID einzeln gegen aktuelle Quellen geprüft wurde;
2. kein Punkt ohne einen der drei verbindlichen Zustände bleibt;
3. jede Einstufung einen konkreten Nachweis besitzt;
4. alle Schreib- und Automationsarbeiten einem AP09-Teilpaket gehören;
5. keine öffentliche Oberfläche außerhalb dieser Matrix verbleibt;
6. ein unabhängiger Prüfer die Vollständigkeit des Katalogs bestätigt.

Erst danach beginnt die inhaltliche Abarbeitung. Ein grüner Link- oder Buildcheck
ersetzt diese Prüfung nicht.

Der unabhängige Review wurde gegen Commit
`28a10592256a1a270a9f731f18af03992b53a20c` ausgeführt. Er bestätigte 251
eindeutige IDs und die damalige Summenrechnung. Er fand elf falsche
Klassifikationen, mehrere fehlerhafte Nachweise und zehn zusätzliche
Produktoberflächen. Diese Review-Reconciliation ist im aktuellen Stand
vollständig eingearbeitet. Der maschinenlesbare Katalog erzwingt 261
eindeutige, lückenlose IDs, die Summenrechnung und genau eine Zuordnung zu
Paket, fachlichem Owner und kanonischem Ziel. Er trennt bereits vorhandene von
geplanten Zielseiten und verbietet einen vollständigen Punkt ohne vorhandenes
kanonisches Ziel.

Bedingungen 1 bis 5 sind intern erfüllt. Bedingung 6 bleibt bis zu einem neuen
unabhängigen Read-only-Review der 261-Punkte-Baseline offen. AP09.0 ist deshalb
**reviewbereit, aber noch nicht formal abgenommen**. Die inhaltliche Umsetzung
folgt dem [AP09-Ausführungsplan](AP09-execution-plan.md).
