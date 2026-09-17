# AP09 Masterprüfung der Dokumentationsvollständigkeit

Stand: 17.09.2026  
Status: Prüfkatalog erstellt; Einzelprüfungen und endgültige Einstufungen offen  
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

## Verbindliche Zustände

| Zustand | Bedeutung |
| --- | --- |
| **Vollständig vorhanden** | Ein technischer Leser kann den Gegenstand ohne Chatwissen verstehen oder die Aufgabe vollständig ausführen. Aussagen stimmen mit den aktuellen Quellen überein. Gründe, Fehler, Grenzen, Verifikation und Quellbelege sind vorhanden. |
| **Muss erweitert/überarbeitet werden** | Verwertbarer Inhalt existiert, aber mindestens ein notwendiger Aspekt fehlt, ist veraltet, widersprüchlich, schlecht auffindbar oder nicht ausreichend belegt. |
| **Fehlt komplett** | Es gibt keinen geeigneten kanonischen Inhalt. Verstreute Quelltexte, historische Reviews oder Implementierungsdateien zählen nicht als Dokumentation. |

Die Zustände unten sind eine **vorläufige Triage**. Ein Punkt wird erst endgültig
abgeschlossen, wenn sein Einzelprüfprotokoll Quellen, Seiten, Ergebnis und Checks
nennt.

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

## Prüfreihenfolge

1. Inventar und Pflegevertrag
2. Architektur und Systemgrenzen
3. Operator-Handbuch
4. Developer-Handbuch
5. exhaustive Referenz
6. Entscheidungen und Status
7. Navigation, Darstellung und Veröffentlichung
8. unabhängige Leser- und Wartbarkeitsabnahme

## A. Umfang und Governance

| ID | Prüfpunkt | Vorläufiger Zustand | Befund oder Ziel |
| --- | --- | --- | --- |
| GOV-001 | Kanonischer Einstieg und getrennte Leserwege | Vollständig vorhanden | `docs/site/README.md` trennt Understand, Operate, Extend, Reference, Decisions und Status. |
| GOV-002 | Vollständiges Inventar aller dokumentationspflichtigen Produktoberflächen | Muss erweitert/überarbeitet werden | Dateien und Plugins sind inventarisiert; Konfigurationen, CLIs, Events, Fehlercodes und Protokolle noch nicht als eine Abdeckungsmenge. |
| GOV-003 | Eindeutiger kanonischer Ort je Thema | Muss erweitert/überarbeitet werden | Aktive Site und alte Architektur-, Operator-, Developer- und Reference-Bäume bestehen parallel. |
| GOV-004 | Regeln für Quellautorität und revisionsgebundene Belege | Vollständig vorhanden | Blueprint und Qualitätsstandard definieren Evidenzgrenzen. |
| GOV-005 | Trennung generierter Fakten und authored guidance | Vollständig vorhanden | AP08 setzt das Muster; AP09 muss es auf alle Referenzen ausweiten. |
| GOV-006 | Owner, Gültigkeitsbereich, letzte Prüfung und Check je Seite | Muss erweitert/überarbeitet werden | Neue Seiten besitzen viele Metadaten; die gesamte veröffentlichte Menge ist nicht vollständig zugeordnet. |
| GOV-007 | Begriffs-, Deprecation-, Redirect- und Supersession-Regeln | Muss erweitert/überarbeitet werden | Glossar und AP10-Regeln existieren; vollständiger Veröffentlichungsvertrag fehlt. |
| GOV-008 | Messbare Definition von „vollständig“ | Vollständig vorhanden | Dieses Dokument und der Qualitätsstandard definieren die Abnahme. |

## B. Einstieg und Produktverständnis

| ID | Prüfpunkt | Vorläufiger Zustand | Befund oder Ziel |
| --- | --- | --- | --- |
| ENT-001 | Produktzweck, Systemgrenze und Zielgruppen | Vollständig vorhanden | Understand-Einstieg erklärt Zweck und Grenzen. |
| ENT-002 | Repräsentative Anfrage vom Eingang bis zum Ergebnis | Vollständig vorhanden | Request-State-Recovery-Trace ist vorhanden. |
| ENT-003 | Pipeline, Plattform, Rolle, Engine, Spezialist und Plugin unterscheiden | Vollständig vorhanden | Components-and-Authority und Glossar behandeln die Grenzen. |
| ENT-004 | Aktueller Funktionsumfang und Nicht-Funktionen | Muss erweitert/überarbeitet werden | Statusseiten existieren; parallele alte Aussagen bleiben ein Risiko. |
| ENT-005 | Schnellstart für Leser, Operator und Entwickler | Muss erweitert/überarbeitet werden | Operator-Preflight und erstes Plugin existieren; vollständiger Produktworkflow fehlt. |

## C. Architektur: System und Autorität

| ID | Prüfpunkt | Vorläufiger Zustand | Befund oder Ziel |
| --- | --- | --- | --- |
| ARC-001 | Gesamtsystem, externe Akteure und Komponentenkarte | Vollständig vorhanden | Understand-Seiten und Diagramme bilden den Kontext ab. |
| ARC-002 | Erlaubte und verbotene Autorität je Komponente | Vollständig vorhanden | Components-and-Authority erklärt beide Seiten. |
| ARC-003 | Runtime-Rollen, Engines, Spezialisten und Package Ownership | Vollständig vorhanden | Rollen und Paketgrenzen sind beschrieben und belegt. |
| ARC-004 | Ende-zu-Ende-Normal-, Fehler-, Wait-, Retry- und Recoverypfade | Vollständig vorhanden | Der zentrale Trace ist vorhanden; Subsystemdetails folgen separat. |
| ARC-005 | Entscheidungen mit Gründen, Kosten und Alternativen | Muss erweitert/überarbeitet werden | Viele Entscheidungen existieren; Publication-Check und alte Belege sind noch fehlerhaft. |
| ARC-006 | Vollständige Failure-Domain-, Abhängigkeits- und Datenkarte | Muss erweitert/überarbeitet werden | Gute Basis; Kommunikations- und Datenmatrix fehlen. |

## D. Architektur: Nova und Nova Core

| ID | Prüfpunkt | Vorläufiger Zustand | Befund oder Ziel |
| --- | --- | --- | --- |
| NVC-001 | Nova-Rolle versus Nova Core | Vollständig vorhanden | Grenze ist klar erklärt. |
| NVC-002 | CLI, Projektaufnahme und `nova-project.v2` Compiler | Muss erweitert/überarbeitet werden | Package-README ist detailliert, aber nicht als kanonische Site-Architektur integriert. |
| NVC-003 | Immutable Source Admission und Baseline-Bindung | Muss erweitert/überarbeitet werden | Teile sind erklärt; zusammenhängender Architekturpfad fehlt. |
| NVC-004 | Graph-Aufbau, Kanten, Validierung und Freeze | Muss erweitert/überarbeitet werden | Ablauf vorhanden; exhaustive Regeln und Fehler fehlen. |
| NVC-005 | Scheduling, Readiness und Concurrency | Muss erweitert/überarbeitet werden | Autorität ist erklärt; Algorithmus und Grenzen brauchen eine Detailseite. |
| NVC-006 | Stage-Aktivierung, Eingabeauflösung und Ausführung | Muss erweitert/überarbeitet werden | Extension-Vertrag existiert; Core-seitige Kette fehlt im Detail. |
| NVC-007 | Attempt-Identität und Lease-Lifecycle | Muss erweitert/überarbeitet werden | Begriffe vorhanden; Zustände und Fehlerreferenz fehlen. |
| NVC-008 | Retryarten, Repair und Budgets | Muss erweitert/überarbeitet werden | Verhalten auf hoher Ebene vorhanden; exhaustive Felder und Entscheidungen fehlen. |
| NVC-009 | Wait, Approval, Signal und Resume | Muss erweitert/überarbeitet werden | Operatorablauf existiert; Signalverträge und Issuer-Regeln fehlen als Referenz. |
| NVC-010 | Cancellation und Shutdown | Muss erweitert/überarbeitet werden | Produktgrenze ist dokumentiert; interne Semantik braucht mehr Tiefe. |
| NVC-011 | Effects, Identity, Locks, Requests und Receipts | Muss erweitert/überarbeitet werden | Effectful Guide ist stark; vollständige Core-Architektur fehlt. |
| NVC-012 | Artifact Checkpoints und Sichtbarkeit | Muss erweitert/überarbeitet werden | Im Ablauf erwähnt; vollständiges Daten- und Recoverymodell fehlt. |
| NVC-013 | Journal, Snapshots, Dateisperren und Run Root | Muss erweitert/überarbeitet werden | Autorität ist klar; physische Struktur und Transaktionsgrenzen fehlen. |
| NVC-014 | Lifecycle Reducer und vollständige Transitionstabelle | Muss erweitert/überarbeitet werden | Resultate sind beschrieben; Transitionstabelle fehlt. |
| NVC-015 | Administrative Repair und Recovery Stops | Muss erweitert/überarbeitet werden | Grenzen sind ehrlich beschrieben; Entscheidungs- und Fehlerkatalog fehlt. |
| NVC-016 | Test-Gate Resolution, Dispatch, Import und Authority Check | Muss erweitert/überarbeitet werden | Buster-Erweiterung ist erklärt; Nova-Orchestrierung braucht eine Detailseite. |
| NVC-017 | Auditprojektion und Read Model | Muss erweitert/überarbeitet werden | Operator nutzt Audit; Herleitung und Felder sind nicht exhaustiv dokumentiert. |
| NVC-018 | Nova-Core-Fehlerkatalog | Fehlt komplett | Kein kanonischer, aus Code erzeugter Katalog. |

## E. Architektur: Worker Core

| ID | Prüfpunkt | Vorläufiger Zustand | Befund oder Ziel |
| --- | --- | --- | --- |
| WKC-001 | Zweck und neutrale Autoritätsgrenze | Vollständig vorhanden | Components-and-Authority erklärt den neutralen Core. |
| WKC-002 | Profile, Engine-Identität und Protokollversionen | Muss erweitert/überarbeitet werden | Integrationsweg vorhanden; vollständige Vertragsreferenz fehlt. |
| WKC-003 | Readiness, Kapazität, Admission und Claims | Muss erweitert/überarbeitet werden | Zusammenfassung vorhanden; Zustandsautomat und Fehler fehlen. |
| WKC-004 | Attempt-Identität, Replay und Duplikatschutz | Muss erweitert/überarbeitet werden | Grundprinzip vorhanden; exakte Bindungen fehlen. |
| WKC-005 | Supervisor Authority und Prozessbesitz | Fehlt komplett | Kein kanonischer Detailtext. |
| WKC-006 | Process Launch, Process Group und Sandbox | Muss erweitert/überarbeitet werden | Trustseiten behandeln Teile; interner Ablauf fehlt. |
| WKC-007 | Native Control Channel | Fehlt komplett | Nachrichten, Framing, Identität und Fehler fehlen. |
| WKC-008 | Output Spool und Log-Decoding | Fehlt komplett | Format, Grenzen, Retention und Recovery fehlen. |
| WKC-009 | Ressourcenpool, Reservation, Accounting und Observation | Fehlt komplett | Keine vollständige Architektur- oder Referenzseite. |
| WKC-010 | Deadlines, Termination und Cancellation | Muss erweitert/überarbeitet werden | Allgemeine Grenzen existieren; native Details fehlen. |
| WKC-011 | Attempt Journal und Recovery | Fehlt komplett | Persistenz, Replay, Zustände und Stops fehlen. |
| WKC-012 | Ownership Store und Ownership Recovery | Fehlt komplett | Kein kanonischer Detailtext. |
| WKC-013 | Cleanup und Ergebnisversiegelung | Muss erweitert/überarbeitet werden | Kurz belegt, aber nicht durchgehend erklärt. |
| WKC-014 | Worker-Core-Vertrags- und Fehlerreferenz | Fehlt komplett | Drei Vertragsversionen existieren; integrierte Referenz fehlt. |

## F. Architektur: Spezialisten und Produktkomponenten

| ID | Prüfpunkt | Vorläufiger Zustand | Befund oder Ziel |
| --- | --- | --- | --- |
| SPC-001 | Buster Engine, Plan, Provider, Evidence und Result Authority | Muss erweitert/überarbeitet werden | Extension Guide ist detailliert; Produktarchitektur und Remote-Kommunikation sind verteilt. |
| SPC-002 | Prism Control, Worker, Studio, Ingestion und Services | Muss erweitert/überarbeitet werden | Plattformgrenze ist erklärt; aktive Detailarchitektur fehlt. |
| SPC-003 | Prism-Datenmodell, Revisionen, Approval und Baseline | Muss erweitert/überarbeitet werden | Entscheidungen und alte Texte existieren; Site-Integration fehlt. |
| SPC-004 | Forge Dispatch, Workspace, Commit und Merge | Muss erweitert/überarbeitet werden | Autoritätsgrenze vorhanden; vollständiger Kommunikations- und Recoverypfad fehlt. |
| SPC-005 | Echo Review, Findings, Zertifizierung und Policy | Muss erweitert/überarbeitet werden | Autoritätsgrenze vorhanden; zusammenhängende aktuelle Architektur fehlt. |
| SPC-006 | OpenClaw-Hostintegration | Muss erweitert/überarbeitet werden | Extensionpfad vorhanden; Host-Lifecycle und Betrieb müssen verbunden werden. |
| SPC-007 | Codex-Plugin und Ops-Skill | Muss erweitert/überarbeitet werden | Extensionpfad vorhanden; Tool-, Rechte- und Betriebsmodell brauchen Detailseiten. |

## G. Architektur: Plugin-System und Registry

| ID | Prüfpunkt | Vorläufiger Zustand | Befund oder Ziel |
| --- | --- | --- | --- |
| PLG-001 | Package-, Manifest- und Registrierungsmodell | Vollständig vorhanden | AP08 deckt fünf Pipeline-Verträge und Hostoberflächen ab. |
| PLG-002 | Discovery ohne Codeausführung | Muss erweitert/überarbeitet werden | Prinzip erklärt; Algorithmus, Pfade und Fehler fehlen. |
| PLG-003 | Manifest-, Schema- und Pfadvalidierung | Muss erweitert/überarbeitet werden | Vertragsguide vorhanden; exhaustive Fehlerreferenz fehlt. |
| PLG-004 | Digests, Immutable Snapshots und Package Replacement | Muss erweitert/überarbeitet werden | Prinzip vorhanden; vollständiger Lifecycle fehlt. |
| PLG-005 | Built-in Trust, External Trust und Attestations | Muss erweitert/überarbeitet werden | Plattformfelder genannt; vollständiger Trustpfad fehlt. |
| PLG-006 | Import Audit | Fehlt komplett | Kein kanonischer Detailpfad für Imports und Ablehnungen. |
| PLG-007 | Registry Build und Konflikterkennung | Muss erweitert/überarbeitet werden | Belege vorhanden; Konfliktklassen und Maps fehlen. |
| PLG-008 | Capability Vocabulary und Providerauflösung | Muss erweitert/überarbeitet werden | Katalog vorhanden; Algorithmus und Fehler fehlen. |
| PLG-009 | Grants und Resource Matching | Muss erweitert/überarbeitet werden | Prinzip vorhanden; exhaustive Semantik fehlt. |
| PLG-010 | Konfigurationsauflösung und Schemaanwendung | Muss erweitert/überarbeitet werden | Pluginfelder vorhanden; Registryauflösung und Fehler fehlen. |
| PLG-011 | Activation und executable exports | Muss erweitert/überarbeitet werden | Phasen erklärt; vollständiger State und Fehlerkatalog fehlen. |
| PLG-012 | Deactivation, Replacement und Recovery alter Bytes | Muss erweitert/überarbeitet werden | Shared Lifecycle vorhanden; systemweite Regeln fehlen. |
| PLG-013 | Isolation externer Stages und Observer | Muss erweitert/überarbeitet werden | Grenze erklärt; Protokoll, cgroup und Sessiondetails fehlen. |
| PLG-014 | Fehlender persistenter Host für externe Adapter | Vollständig vorhanden | Produktgrenze ist klar und getrennt dokumentiert. |

## H. Architektur: Kommunikation, Daten und Telemetrie

| ID | Prüfpunkt | Vorläufiger Zustand | Befund oder Ziel |
| --- | --- | --- | --- |
| COM-001 | Exhaustive Kommunikationsmatrix | Fehlt komplett | Sender, Empfänger, Schema, Auth, Persistenz, Retry und Fehler fehlen als Gesamtmatrix. |
| COM-002 | Nova zu Buster Dispatch und Result Import | Muss erweitert/überarbeitet werden | Teile sind dokumentiert; vollständiges Wire-, Store- und Recoverymodell fehlt. |
| COM-003 | Nova zu Prism und zurück | Muss erweitert/überarbeitet werden | Handoffs vorhanden; Endpunkte, Identität und Recovery sind verteilt. |
| COM-004 | Nova zu Forge/Echo | Muss erweitert/überarbeitet werden | Dispatch-Plugins vorhanden; vollständiger Transportpfad fehlt. |
| COM-005 | Core zu Stage, Adapter und Observer | Muss erweitert/überarbeitet werden | Invocation und Delivery erklärt; vollständige Request-/Result-/Abortsemantik fehlt. |
| COM-006 | Worker Control Channel | Fehlt komplett | Siehe WKC-007. |
| COM-007 | Redis Streams, Kanäle und Deduplizierung | Muss erweitert/überarbeitet werden | Rolle und Konfiguration vorhanden; Consumer- und Replaysemantik fehlt. |
| COM-008 | Interne HTTP- und Service-Endpunkte | Fehlt komplett | Kein Endpunkt-, Auth-, Timeout- und Fehlerkatalog. |
| COM-009 | Tailscale private routes und Test-Exposure | Muss erweitert/überarbeitet werden | Anwendungen getrennt; Identität, DNS und Cleanup brauchen eine Matrix. |
| COM-010 | Git-, OCI-, Registry- und BuildKit-Datenwege | Muss erweitert/überarbeitet werden | Kette erklärt; Protokoll, Auth und Failure-Recovery brauchen Details. |
| COM-011 | SPIFFE/SPIRE- und mTLS-Pfade | Muss erweitert/überarbeitet werden | Workerpfad vorhanden; vollständige Plattformmatrix fehlt. |
| COM-012 | Timeout, Retry, Ordering und Backpressure je Verbindung | Fehlt komplett | Aktuell über Implementierungen und Plugins verteilt. |
| DAT-001 | Exhaustive Datenbesitz- und Persistenzmatrix | Muss erweitert/überarbeitet werden | Recovery bietet Basis; alle Stores und Verträge fehlen als Gesamtinventar. |
| DAT-002 | Nova-Journals, Effects und Snapshots | Muss erweitert/überarbeitet werden | Autorität klar; logisches und physisches Modell nicht vollständig. |
| DAT-003 | Worker-Journals, Ownership und Spools | Fehlt komplett | Kein integriertes Datenmodell. |
| DAT-004 | Buster-Pläne, Attempts, Evidence und Reports | Muss erweitert/überarbeitet werden | Extension Guide stark; Persistenz und Retention verteilt. |
| DAT-005 | Prism PostgreSQL, Artefakte und Revisionen | Muss erweitert/überarbeitet werden | Alte Details existieren; aktive Site fehlt. |
| DAT-006 | LiteLLM PostgreSQL | Muss erweitert/überarbeitet werden | Besitzer genannt; Schema, Migration und Betrieb fehlen. |
| DAT-007 | Redis als Transport, nicht als Autorität | Muss erweitert/überarbeitet werden | Grenze klar; Datenformen, Retention und Replay fehlen. |
| DAT-008 | Artefaktspeicher, Digests, Encoding und Retention | Muss erweitert/überarbeitet werden | Teile vorhanden; vollständiger Lebenszyklus fehlt. |
| DAT-009 | Backupgruppen und Restore-Reihenfolge | Vollständig vorhanden | Operator-Recovery behandelt Gruppen und Grenzen. |
| TEL-001 | Telemetriearchitektur und Autoritätsgrenze | Muss erweitert/überarbeitet werden | Grundgrenze vorhanden; vollständiger Datenweg fehlt. |
| TEL-002 | Event- und Payload-Katalog | Fehlt komplett | 128 Telemetrie-Schemas sind nicht aktiv erschlossen. |
| TEL-003 | Produzenten und Konsumenten je Event | Fehlt komplett | Keine exhaustive Matrix. |
| TEL-004 | Identität, Ordering, Deduplizierung und Redaction | Muss erweitert/überarbeitet werden | Einzelregeln vorhanden; globales Modell fehlt. |
| TEL-005 | Observer Checkpoints, Retry und Recovery | Muss erweitert/überarbeitet werden | AP08 erklärt Observer; Zustands- und Fehlerreferenz fehlt. |
| TEL-006 | Evidence versus Redis, Logs und Metriken | Vollständig vorhanden | Architektur trennt kanonische Evidenz und Beobachtung. |
| TEL-007 | Retention, Kapazität und Backpressure | Fehlt komplett | Kein durchgehender Betriebsvertrag. |

## I. Architektur: Plattform und Sicherheit

| ID | Prüfpunkt | Vorläufiger Zustand | Befund oder Ziel |
| --- | --- | --- | --- |
| INF-001 | Host, K3s und fehlende Hostautomation | Vollständig vorhanden | Grenze und Roadmap sind dokumentiert. |
| INF-002 | DNS, Storage und Scheduling | Muss erweitert/überarbeitet werden | Eingeordnet; Auswahl- und Fehlerdetails fehlen. |
| INF-003 | Flannel und Cilium | Vollständig vorhanden | Austauschbarkeit und Cutoverrisiko erklärt. |
| INF-004 | Argo CD und exklusive Resource Ownership | Vollständig vorhanden | Helm- und GitOps-Pfad getrennt. |
| INF-005 | BuildKit | Muss erweitert/überarbeitet werden | Abhängigkeit erklärt; Konfiguration und Fehlerreferenz fehlen. |
| INF-006 | Lokale OCI Registry | Muss erweitert/überarbeitet werden | HTTP-Laborstatus und Roadmap vorhanden; Betrieb und Hardening fehlen. |
| INF-007 | OCI Pull-Through Mirror | Muss erweitert/überarbeitet werden | Architektur vorhanden; Cache- und Recoveryreferenz fehlt. |
| INF-008 | Git Mirror | Vollständig vorhanden | Das Fehlen eines unterstützten Mirrors ist ausdrücklich dokumentiert. |
| INF-009 | Redis, PostgreSQL und Tailscale | Muss erweitert/überarbeitet werden | Architekturrolle vorhanden; Detailarchitektur bleibt offen. |
| INF-010 | Monitoring | Vollständig vorhanden | Verantwortungen, Retention und Grenzen detailliert beschrieben. |
| INF-011 | Ops Pod | Vollständig vorhanden | Zweck, Rechte, Netzwerk und Recoverygrenze dokumentiert. |
| SEC-001 | Threat Model und Trust Boundaries | Muss erweitert/überarbeitet werden | Trustseiten vorhanden; Bedrohungs-/Gegenmaßnahmenmatrix fehlt. |
| SEC-002 | Human und Workload Identity | Muss erweitert/überarbeitet werden | Trennung erklärt; vollständige Credential-Flows fehlen. |
| SEC-003 | SPIRE, Attestation und mTLS | Muss erweitert/überarbeitet werden | Workerpfad vorhanden; alle Verbindungen fehlen. |
| SEC-004 | Secrets, Resolver, Rotation und Recovery | Muss erweitert/überarbeitet werden | Abläufe vorhanden; Consumer- und Rotationmatrix fehlt. |
| SEC-005 | Network Policies und negative Pfade | Muss erweitert/überarbeitet werden | Checks vorhanden; exhaustive Verbindungsreferenz fehlt. |
| SEC-006 | Supply Chain, Images, Digests und Attestations | Muss erweitert/überarbeitet werden | Einzelpfade vorhanden; Gesamtmodell fehlt. |
| SEC-007 | Least Privilege | Muss erweitert/überarbeitet werden | Grundregeln vorhanden; Berechtigungsmatrix fehlt. |

## J. Operator-Handbuch

| ID | Prüfpunkt | Vorläufiger Zustand | Befund oder Ziel |
| --- | --- | --- | --- |
| OPR-001 | Logischer Operator-Lifecycle | Vollständig vorhanden | Use-Index führt von Installation bis Retirement. |
| OPR-002 | Voraussetzungen, Versionen, Preflight und Topologie | Vollständig vorhanden | Grenzen werden ehrlich benannt. |
| OPR-003 | Helm-Installation, GitOps-Handover und Erstverifikation | Vollständig vorhanden | Unterstützte Abläufe sind vorhanden. |
| OPR-004 | Start, Audit, Wait/Resume und Recovery | Vollständig vorhanden | CLI-Wege sind dokumentiert. |
| OPR-005 | Cancellation-Grenze | Vollständig vorhanden | Fehlender Operator-Cancel ist klar. |
| OPR-006 | Diagnose nach Symptom und Autorität | Vollständig vorhanden | Diagnose-Handbuch besitzt Reihenfolge und Stops. |
| OPR-007 | Backup, Restore und unabhängiger Zugang | Vollständig vorhanden | Detailliert mit Implementierungsgrenzen. |
| OPR-008 | Upgrade, Rollback, Rotation und Retirement | Vollständig vorhanden | Maintenance deckt die Lebenszyklen ab. |
| OPR-009 | Kapazität, Retention und Schwellenwerte | Muss erweitert/überarbeitet werden | Werte existieren; exhaustive Servicebudgets fehlen. |
| OPL-001 | Inventar, Zweck, Funktionen und Konfiguration aller 51 Plugins | Vollständig vorhanden | AP08-Katalog wurde akzeptiert. |
| OPL-002 | Operative Auswahlmatrix über alle Plugins | Fehlt komplett | Nach Aufgabe, Rolle und Abhängigkeit filterbare Sicht fehlt. |
| OPL-003 | Aktivierung und Erfolgsprüfung je Oberfläche | Muss erweitert/überarbeitet werden | Shared Lifecycle vorhanden; Operatorlinks und konkrete Beispiele fehlen. |
| OPL-004 | Diagnose, Upgrade, Disable, Replace und Remove | Muss erweitert/überarbeitet werden | Shared Guide vorhanden; operative Paketmatrix fehlt. |
| OPL-005 | Externe Abhängigkeiten und Secrets je Plugin | Fehlt komplett | Keine exhaustive Consumer-Matrix. |
| CFG-001 | Kanonischer Konfigurationsindex | Fehlt komplett | Aktive Reference besitzt keinen Index. |
| CFG-002 | `pipeline-platform.v2` Referenz | Muss erweitert/überarbeitet werden | Gruppen genannt; Typen, Defaults, Beispiele und Fehler fehlen. |
| CFG-003 | `nova-project.v2` Referenz | Muss erweitert/überarbeitet werden | Detailliertes Package-README nicht aktiv integriert. |
| CFG-004 | `pipeline-definition.v2` Referenz | Muss erweitert/überarbeitet werden | Altes Beispiel vorhanden; exhaustive aktive Referenz fehlt. |
| CFG-005 | `.swarm/pipeline.json` Referenz | Fehlt komplett | Größte Operatorlücke. |
| CFG-006 | Suites, Tests, Fixtures, Overrides und Coverage | Muss erweitert/überarbeitet werden | Developererklärung vorhanden; Operatorreferenz fehlt. |
| CFG-007 | Plugin-Konfiguration | Vollständig vorhanden | Katalog generiert Schemafelder. |
| CFG-008 | Worker-Profile, Engines und Rollen | Fehlt komplett | Keine exhaustive Operatorreferenz. |
| CFG-009 | Helm-, GitOps- und Infrastrukturwerte | Muss erweitert/überarbeitet werden | Referenz ist Top-Level-Teilmenge und lässt 10 von 17 Values-/Schemaquellen aus. |
| CFG-010 | Prism-, OpenClaw- und Codex-Konfiguration | Muss erweitert/überarbeitet werden | Teilreferenzen existieren; aktive exhaustive Integration fehlt. |
| CFG-011 | Umgebungsvariablen und Secrets | Muss erweitert/überarbeitet werden | Nur Deployment-/Secret-Setup-Slice, keine vollständige Consumer-Matrix. |
| CFG-012 | Ports, Services, Endpunkte und Ingress | Fehlt komplett | Kein generierter Katalog. |
| CFG-013 | Precedence und Effective Values | Muss erweitert/überarbeitet werden | Teilweise erklärt; nicht für alle Familien. |
| CFG-014 | Änderungsauswirkung: Hot, Restart, New Run oder Migration | Fehlt komplett | Keine Matrix. |
| CFG-015 | Validierungs- und Konfigurationsfehler | Fehlt komplett | Über Code und alte Dokumente verteilt. |

## K. Beispielworkflows und `pipeline.json`

| ID | Prüfpunkt | Vorläufiger Zustand | Befund oder Ziel |
| --- | --- | --- | --- |
| FLW-001 | Workflow vom Checkout bis zum Ergebnis | Fehlt komplett | Einzelbefehle vorhanden, keine zusammenhängende Story. |
| FLW-002 | Validierte Beispiel-Plattformkonfiguration | Fehlt komplett | Keine sichere aktive Beispieldatei. |
| FLW-003 | Validiertes `nova-project.v2` Beispiel | Fehlt komplett | Keine aktive Beispielressource. |
| FLW-004 | Validiertes `.swarm/pipeline.json` Beispiel | Fehlt komplett | Keine aktive Beispielressource. |
| FLW-005 | Vorher-/Nachher-Erklärung des kompilierten Graphen | Muss erweitert/überarbeitet werden | Compile-Befehl vorhanden; Transformation nicht vollständig erklärt. |
| FLW-006 | Erfolgreicher Run mit Audit, Artefakten und Telemetrie | Fehlt komplett | Kein reproduzierbarer Gesamtweg. |
| FLW-007 | Stage-Fehler, Retry und Repair | Fehlt komplett | Kein operatorzentrierter Gesamtweg. |
| FLW-008 | Wait, Approval und Resume | Muss erweitert/überarbeitet werden | Befehle vorhanden; vollständige Dateien und Evidenz fehlen. |
| FLW-009 | Unterbrechung und Recovery | Muss erweitert/überarbeitet werden | Runbook vorhanden; ausführbares Beispiel fehlt. |
| FLW-010 | Unklarer externer Effekt | Muss erweitert/überarbeitet werden | Konzept vorhanden; praktischer Ablauf fehlt. |
| FLW-011 | Buster-Suite mit Fixture, Matrix und Report | Fehlt komplett | Developerdetails vorhanden; Operatorworkflow fehlt. |
| FLW-012 | BuildKit, Registry und Image | Muss erweitert/überarbeitet werden | Einzelguides vorhanden; Gesamtworkflow fehlt. |
| FLW-013 | Tailscale-Exposure und Cleanup | Muss erweitert/überarbeitet werden | Providerseite vorhanden; vollständiger Workflow fehlt. |
| FLW-014 | Plugin aktivieren, prüfen, ersetzen und entfernen | Muss erweitert/überarbeitet werden | Developer-Lifecycle vorhanden; Operatorbeispiel fehlt. |
| FLW-015 | Redis-Ausfall und Wiederanlauf | Fehlt komplett | Kein fokussierter Ablauf. |
| FLW-016 | Worker-Abbruch und Result Recovery | Fehlt komplett | Kein fokussierter Ablauf. |

## L. Developer-Handbuch

| ID | Prüfpunkt | Vorläufiger Zustand | Befund oder Ziel |
| --- | --- | --- | --- |
| DEV-001 | Kanonischer Developer-Einstieg | Muss erweitert/überarbeitet werden | Extend ist stark, aber kein vollständiges Plattform-Handbuch. |
| DEV-002 | Repository-, Workspace- und Toolchain-Setup | Fehlt komplett | Keine aktuelle kanonische Entwicklerkarte. |
| DEV-003 | Build-, Start- und Debugwege je Komponente | Fehlt komplett | Über Scripts und alte READMEs verteilt. |
| DEV-004 | Testpyramide und Auswahl des richtigen Checks | Muss erweitert/überarbeitet werden | Extension Testing stark; Core, Service, UI und Deployment fehlen. |
| DEV-005 | CI-Workflows und erforderliche Gates | Muss erweitert/überarbeitet werden | Inventar vorhanden; aktive vollständige Integration fehlt. |
| DEV-006 | Coding-, Contract- und Dependency-Regeln | Muss erweitert/überarbeitet werden | Über Boundaries und alte Guides verteilt. |
| DEV-007 | Security-, Performance- und Lastprüfung | Fehlt komplett | Keine gemeinsame Aufgabenfolge. |
| DEV-008 | Release, Versionierung, Migration und Changelog | Fehlt komplett | Kein vollständiger Workflow. |
| DEV-009 | Dokumentationspflicht einer Codeänderung | Muss erweitert/überarbeitet werden | Qualitätsregeln vorhanden; Source-to-Doc-Matrix fehlt. |
| EXT-001 | Auswahl Konfiguration, Plugin, Engine oder Core | Vollständig vorhanden | AP08 Choice Guide akzeptiert. |
| EXT-002 | Minimaler Pipeline-Stage-Weg | Vollständig vorhanden | AP08 Minimal Plugin akzeptiert. |
| EXT-003 | Fünf Pipeline-Extension-Verträge | Vollständig vorhanden | Contracts Guide akzeptiert. |
| EXT-004 | Effects und State | Vollständig vorhanden | Effectful Guide akzeptiert. |
| EXT-005 | Buster, Suites, Fixtures und Reports | Vollständig vorhanden | Buster Guide akzeptiert. |
| EXT-006 | Nova Stages, Adapter, Observer und Lint | Vollständig vorhanden | Nova Guide akzeptiert. |
| EXT-007 | OpenClaw, Codex, Worker Engine und Rollen | Vollständig vorhanden | Host-and-Engine Guide akzeptiert. |
| EXT-008 | Extension Testing und Lifecycle | Vollständig vorhanden | Testing Guide akzeptiert. |
| EXT-009 | Vollständiger Plugin-Katalog | Vollständig vorhanden | 51 von 51 nach Korrektur akzeptiert. |
| CDV-001 | Nova-Core-Änderung | Fehlt komplett | Auswahlgrenze vorhanden; Entwicklungsweg fehlt. |
| CDV-002 | Lifecycle, Scheduling, Retry, Repair und Wait ändern | Fehlt komplett | Keine detaillierte Anleitung. |
| CDV-003 | Effects und Recoverysemantik ändern | Fehlt komplett | Keine Core-Anleitung. |
| CDV-004 | Worker-Core-Protokoll, Supervisor oder Ressourcenmodell ändern | Fehlt komplett | Keine detaillierte Anleitung. |
| CDV-005 | Foundation Registry, Trust oder Isolation ändern | Fehlt komplett | Keine detaillierte Anleitung. |
| CDV-006 | SDK oder öffentlichen Contract ändern | Fehlt komplett | Versionierungs-, Generator- und Migrationsweg fehlt. |
| CDV-007 | Capability oder Telemetrieevent einführen | Fehlt komplett | Consumer-, Security- und Compatibilityweg fehlt. |
| CDV-008 | Buster Engine ändern | Fehlt komplett | Providerentwicklung ist dokumentiert, Engineentwicklung nicht. |
| CDV-009 | Prism Control, Worker, Ingestion oder Studio ändern | Fehlt komplett | Alte Architekturtexte ersetzen keinen Workflow. |
| CDV-010 | Forge-, Echo-, Service- oder API-Integration ändern | Fehlt komplett | Kein vollständiger Developerweg. |
| CDV-011 | Frontend oder interaktive Oberfläche ändern | Fehlt komplett | Kein Studio-/Archviewer-Entwicklungsweg. |
| CDV-012 | Helm, GitOps oder Infrastruktur ändern | Fehlt komplett | Operatorseiten ersetzen keine Entwickleranleitung. |
| CDV-013 | Datenmodell oder Migration ändern | Fehlt komplett | Kein gemeinsamer Migrations- und Rollbackvertrag. |

## M. Exhaustive Referenz

| ID | Prüfpunkt | Vorläufiger Zustand | Befund oder Ziel |
| --- | --- | --- | --- |
| REF-001 | Reference-Index | Fehlt komplett | Aktive Reference enthält nur Capabilities und Glossar. |
| REF-002 | Alle CLI-Kommandos und Flags | Muss erweitert/überarbeitet werden | Deployment-Slice vorhanden; alle CLIs fehlen. |
| REF-003 | Alle Konfigurationsfamilien | Fehlt komplett | Kein gemeinsamer Index. |
| REF-004 | Alle Schemas, Constraints und Defaults | Fehlt komplett | 246 Schema-Dateien, kein globaler Katalog. |
| REF-005 | Alle Fehlercodes mit Ursache, Wirkung und Recovery | Fehlt komplett | Teilcheck meldet mindestens 17 undokumentierte Suite-Fehler. |
| REF-006 | Alle Event- und Payloadtypen | Fehlt komplett | Telemetrie-Schemas nicht erschlossen. |
| REF-007 | Capabilities | Vollständig vorhanden | Aktive generierte Seite existiert. |
| REF-008 | Plugins und Registrierungen | Vollständig vorhanden | AP08-Katalog und Inventar existieren. |
| REF-009 | Rollen und Package Ownership | Muss erweitert/überarbeitet werden | Daten vorhanden; aktive Reference-Seite fehlt. |
| REF-010 | Contracts, Versionen und Kompatibilität | Fehlt komplett | Kein zentraler Katalog. |
| REF-011 | Ports, Endpunkte und Netzwerkpfade | Fehlt komplett | Kein zentraler Katalog. |
| REF-012 | Secrets, Umgebungsvariablen und Consumer | Muss erweitert/überarbeitet werden | Teilgeneratoren vorhanden; vollständige Abdeckung fehlt. |
| REF-013 | Helm- und GitOps-Werte | Muss erweitert/überarbeitet werden | Top-Level-Teilmenge vorhanden. |
| REF-014 | Stores, Pfade und Retention | Fehlt komplett | Recovery erklärt Aufgaben, keine exhaustive Referenz. |
| REF-015 | Images, Versionen und Digests | Muss erweitert/überarbeitet werden | Einzelreferenz vorhanden; aktive Integration fehlt. |
| REF-016 | Verifikationscommands und CI-Workflows | Muss erweitert/überarbeitet werden | Generatoren vorhanden; Scope und Environment teils unklar. |
| REF-017 | Glossar | Vollständig vorhanden | Nach neuen Referenzen erneut ergänzen. |

## N. Entscheidungen, Status und Veröffentlichung

| ID | Prüfpunkt | Vorläufiger Zustand | Befund oder Ziel |
| --- | --- | --- | --- |
| DEC-001 | Entscheidungen mit stabilen IDs | Vollständig vorhanden | Decision-Bereich existiert. |
| DEC-002 | Gründe, Alternativen, Konsequenzen und Supersession | Muss erweitert/überarbeitet werden | Publication-Check meldet Probleme in alten Seiten. |
| STA-001 | Aktueller Status, offene Implementierung und Live-Gates | Vollständig vorhanden | Current, Open Issues und Acceptance sind getrennt. |
| STA-002 | Öffentliche Statusangaben stimmen mit Registern überein | Muss erweitert/überarbeitet werden | Publication- und Blueprint-Checks sind nicht grün. |
| PUB-001 | Navigation erreicht jede Kernaufgabe | Muss erweitert/überarbeitet werden | Reference und Platform Developer fehlen. |
| PUB-002 | Suchindex und Allowlist | Muss erweitert/überarbeitet werden | AP09-Arbeit offen. |
| PUB-003 | Links, Anker und revisionsgebundene Codebelege | Muss erweitert/überarbeitet werden | AP06–AP08 stark; neue Referenzen und alte Seiten offen. |
| PUB-004 | Codevorschau aus derselben Quelle | Fehlt komplett | Gewünschte Rendererfunktion fehlt. |
| PUB-005 | Diagramme mit Textalternative | Muss erweitert/überarbeitet werden | Neun geprüfte Diagramme vorhanden; Detailarchitektur braucht gezielte Ergänzungen. |
| PUB-006 | Interaktivität mit statischem Fallback | Fehlt komplett | Nur bei konkretem Lesernutzen umsetzen. |
| PUB-007 | Mobile, Tastatur und Accessibility | Muss erweitert/überarbeitet werden | Globale Renderabnahme offen. |
| PUB-008 | Lokaler Build und CI-Publication-Gates | Muss erweitert/überarbeitet werden | Publication-Check ist rot; CI prüft nur Teilmengen. |
| PUB-009 | Keine parallelen widersprüchlichen Altpfade | Muss erweitert/überarbeitet werden | AP10 muss alte Bäume nach Informationsübernahme entfernen. |

## O. Wartbarkeit und Drift-Erkennung

| ID | Prüfpunkt | Vorläufiger Zustand | Befund oder Ziel |
| --- | --- | --- | --- |
| MNT-001 | Eine Quelle der Wahrheit je mechanischem Fakt | Muss erweitert/überarbeitet werden | Für Plugins erfüllt; übrige Referenzen offen. |
| MNT-002 | Generierte Pluginfakten | Vollständig vorhanden | Manifest-, Schema-, Rollen- und Testfakten werden generiert. |
| MNT-003 | Generierte Konfigurationen und Defaults | Fehlt komplett | Helmreferenz ist nur ein Slice. |
| MNT-004 | Generierte CLI-Flags | Fehlt komplett | Deploymentcommand-Inventar ist nicht vollständig. |
| MNT-005 | Generierte Fehlercodes | Fehlt komplett | Kein zentraler Katalog. |
| MNT-006 | Generierte Events und Payloads | Fehlt komplett | Telemetrie-Schemas nicht veröffentlicht. |
| MNT-007 | Generierte Rollen, Packages und Registrierungen | Vollständig vorhanden | Rollen- und AP08-Inventare existieren. |
| MNT-008 | Generierte Ports, Endpunkte, Stores und Retention | Fehlt komplett | Keine Inventare. |
| MNT-009 | Source-to-Doc-Abdeckungsmatrix | Fehlt komplett | Kein Checker verlangt eine Zielseite je öffentlicher Oberfläche. |
| MNT-010 | Driftcheck für Schemafelder | Muss erweitert/überarbeitet werden | Teilcheck meldet drei Lücken; globale Abdeckung fehlt. |
| MNT-011 | Driftcheck für Fehlercodes | Muss erweitert/überarbeitet werden | Teilcheck meldet 17 Lücken; globale Abdeckung fehlt. |
| MNT-012 | Driftcheck für Plugins und Registrierungen | Vollständig vorhanden | AP08-Checks sind grün. |
| MNT-013 | Driftcheck für Links, Anker und Quellbereiche | Vollständig vorhanden | Lokale und gepinnte Checks existieren. |
| MNT-014 | Ausführbare, schema-validierte Beispiele | Muss erweitert/überarbeitet werden | AP08-Beispiel vorhanden; Operatorbeispiele fehlen. |
| MNT-015 | Owner und Reviewpflicht bei Codeänderungen | Fehlt komplett | Keine vollständige maschinenlesbare Matrix. |
| MNT-016 | Generatoren überschreiben keine Erklärungen | Vollständig vorhanden | AP08-Muster soll für AP09 gelten. |
| MNT-017 | Pflegeanleitung für Dokumentationsagenten | Fehlt komplett | AP11 muss den Vertrag erstellen. |

## P. Qualitäts- und Leserabnahme

| ID | Prüfpunkt | Vorläufiger Zustand | Befund oder Ziel |
| --- | --- | --- | --- |
| QUA-001 | Verständliches technisches Englisch und technische Tiefe | Muss erweitert/überarbeitet werden | AP06–AP08 erfüllen das Ziel überwiegend; globale Prüfung offen. |
| QUA-002 | Formale ASD-STE100-Prüfung | Muss erweitert/überarbeitet werden | Issue-9-Prüfung bleibt AP11. |
| QUA-003 | Jede wichtige Entscheidung begründet | Muss erweitert/überarbeitet werden | Gute Basis; nicht für alle neuen Core- und Referenzthemen. |
| QUA-004 | Jede technische Behauptung passend belegt | Muss erweitert/überarbeitet werden | Publication-Check meldet fehlende Decision-Belege. |
| QUA-005 | Keine falschen Live- oder Vollständigkeitsclaims | Vollständig vorhanden | Qualitätsstandard trennt Evidenzgrenzen. |
| QUA-006 | Leserprobe neuer technischer Leser | Muss erweitert/überarbeitet werden | Gesamtsite folgt in AP11. |
| QUA-007 | Leserprobe Operator | Fehlt komplett | Muss Workflow, Fehler und Recovery ohne Chatwissen ausführen. |
| QUA-008 | Leserprobe Extension Developer | Vollständig vorhanden | AP08 unabhängig akzeptiert. |
| QUA-009 | Leserprobe Platform/Core Developer | Fehlt komplett | Developer-Handbook fehlt. |
| QUA-010 | Wartbarkeitsprobe mit künstlicher Oberflächenänderung | Fehlt komplett | CI muss neues Feld, Event, Plugin, Flag und Fehlercode erkennen. |

## Bereits bestätigte globale Befunde

| Befund | Ergebnis |
| --- | --- |
| Aktive Architekturmenge | 2.074 Zeilen unter `docs/site/understand` |
| Aktive Operatormenge | 2.236 Zeilen unter `docs/site/use` |
| Aktive Extension-Guides | 3.069 Zeilen ohne Katalog |
| Plugin-Katalog | 51 Paketseiten plus Index; 8.078 Zeilen |
| Aktive Reference | nur Capabilities und Glossar |
| Plugin-Konfigurationsschemas | 45 |
| Schema-Dateien unter Skills, Contracts und Charts | 246 |
| Telemetrie-Schemadateien | 128; keine vollständige aktive Referenz |
| Values-/Values-Schemaquellen | 17; vorhandenes Helm-Inventar deckt 7 ab |
| Publication Check | fehlgeschlagen; fehlende Belege, entfernte Contract-Terme und Sprachfindings |
| Blueprint Check | fehlgeschlagen; generierte Migration-Ledger-Ausgabe veraltet |
| Suite-Schema-Dokumentationscheck | fehlgeschlagen; drei Felder fehlen |
| Suite-Fehlercodecheck | fehlgeschlagen; 17 Fehlercodes fehlen |
| Suite-Beispielcheck | bestanden |

## Einzelprüfprotokoll

| Datum | IDs | Geprüfte Quellen und Seiten | Ergebnis | Änderungen oder verbleibende Lücke | Checks |
| --- | --- | --- | --- | --- | --- |
| 17.09.2026 | gesamter Katalog | Erste strukturelle und quantitative Sichtung | Triage erstellt | Einzelprüfungen offen | Publication-, Blueprint- und Suite-Dokumentationschecks; Bestandszählungen |

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
