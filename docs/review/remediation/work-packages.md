# Arbeitspakete und Abnahmekriterien

Die Abhängigkeiten sind konservative **Integrationsgates**, keine Pflicht zur rein seriellen Entwicklung. Unabhängige Implementierungen dürfen parallel entstehen, sobald ihre gemeinsamen Verträge feststehen. Corezustand, Workerprotokoll, Reparaturlogik und Compiler erhalten jeweils einen koordinierenden Eigentümer. Keine gleichzeitigen unkoordinierten Änderungen derselben Dateien.

## Reihenfolge

1. WP01/WP02 als technische Grundlage. WP11/WP12 können parallel vorbereitet werden; WP08 nach WP01.
2. WP03, dann WP04/WP05/WP07/WP09 gemäß ihren Abhängigkeiten.
3. WP06 und WP10; WP13 parallel als eigene Betriebsstrecke.
4. WP14 integriert die Produktkette. Abschließende reale Gesamtprüfung benötigt zusätzlich die geprüfte Infrastruktur aus WP11–WP13.

Die Pakete sind keine riesigen Einzel-PRs: pro gemeinsame Ursache kleine Änderung plus Regression und unabhängige Gegenprüfung. Alle Kennungen bleiben ihrem Paket zugeordnet.

<a id="wp01"></a>
## WP01 — Verträge, Serialisierung und Paketregistrierung

**Status:** geplant. **Findings:** 14. **Integration nach:** keinem anderen Paket.

**Grenze:** Gemeinsame Schemas, SDK, Generatoren, Manifest/Registry/Installer und zugehörige Tests.

**Ursachenbehebung:** Wire-/Typverträge vereinheitlichen, JSON vor rekursiver Verarbeitung budgetieren; Registryinstanzen unabhängig halten. Unbenutzte Altverträge erst nach belegter Consumerprüfung entfernen.

**Abnahme:** Originalvalidatoren und Generatoren prüfen gültige/ungültige Werte, Tiefen-/Zyklusgrenzen, wiederholten Registryaufbau und echte Paketbuilds; keine Dummyregistrierung zum Bestehen alter Tests.

**Nachweisumgebung:** lokal; benötigte Sprachtoolchains sichtbar nachweisen.

**Zugeordnete Kennungen:** PCR-AGENT-CONTRACT-001, PCR-CONTRACT-PLUGIN-001, PCR-PACKAGES-001, PCR-PRISM-CONTRACT-001, PCR-PRISM-CONTRACT-002, PCR-PROMPT-001, PCR-REGISTRY-001, PCR-REGISTRY-002, PCR-SDK-001, PCR-SDK-002, PCR-TELEMETRY-CONTRACT-001, PCR-TELEMETRY-CONTRACT-002, PCR-TEST-CONTRACT-001, PCR-TEST-CONTRACT-002.

<a id="wp02"></a>
## WP02 — Dauerhafter Zustand, Locks und Recovery

**Status:** geplant. **Findings:** 6. **Integration nach:** keinem anderen Paket.

**Grenze:** Journale, Effects, Replay, Wait-/Artefaktprojektionen; keine fachliche Pluginlogik im Core.

**Ursachenbehebung:** Atomare Besitzwechsel und dauerhafte Ergebnis-/Projektionsverträge herstellen; fremde Objektmutation ausschließen; ungewisse externe Aktionen abgleichen.

**Abnahme:** Echte konkurrierende Prozesse, SIGKILL und gültige Journalpräfixe: kein paralleler kritischer Abschnitt, kein verlorener Wait/Artefaktzustand, manipulierte Persistenz abgelehnt; Restart führt zum identischen Zustand.

**Nachweisumgebung:** lokale Prozesse/Dateisystem; externe Reconciliation später als Integration.

**Zugeordnete Kennungen:** PCR-EFFECT-001, PCR-EXEC-001, PCR-EXEC-002, PCR-OBS-001, PCR-STATE-001, PCR-STATE-002.

<a id="wp03"></a>
## WP03 — Generischer Worker und vollständiger Abbruch

**Status:** geplant. **Findings:** 19. **Integration nach:** WP01, WP02.

**Grenze:** Worker-Core, Isolation, Buster-Ausführung, Runtime-Dispatch, Kindprozesse sowie Nova-Remote-Gates.

**Ursachenbehebung:** Gemeinsamen Worker-Vertrag von Engines trennen; absolute Deadline über Dispatch, Capabilityarbeit, Import und Abschluss durchreichen; echte Prozessbäume beenden und Pipefehler behandeln.

**Abnahme:** Originalprozesse mit früh geschlossenem stdin, offenem Kindprozess, UTF-8-Chunkgrenze, verlorener Submitantwort und hängendem Download: kein Hostcrash, kein verwaister Auftrag, wirksames Ressourcen-/Zeitlimit und eindeutiger Outcome.

**Nachweisumgebung:** lokal soweit Runtime vorhanden; echte Remote-/Browser-/Sandboxintegration separat.

**Zugeordnete Kennungen:** PCR-BUSTER-ENGINE-001, PCR-BUSTER-ENGINE-002, PCR-BUSTER-ENGINE-003, PCR-BUSTER-ENGINE-004, PCR-COMMAND-001, PCR-ISOLATION-001, PCR-ISOLATION-002, PCR-ISOLATION-003, PCR-ISOLATION-004, PCR-KUBERNETES-FIXTURE-002, PCR-NETWORK-001, PCR-NETWORK-002, PCR-NOVA-GATE-001, PCR-NOVA-GATE-002, PCR-NOVA-GATE-003, PCR-NOVA-GATE-004, PCR-NOVA-GATE-005, PCR-RUNTIME-001, PCR-WORKER-001.

<a id="wp04"></a>
## WP04 — Freigaben, Reparaturbudgets und Eskalation

**Status:** geplant. **Findings:** 5. **Integration nach:** WP01, WP02.

**Grenze:** Approval, normale/administrative Remediation und Zustandsübergänge.

**Ursachenbehebung:** Freigabe an Source/Plan binden; gemeinsame transitive Invalidierung und neue Entscheidungsgeneration. Zwei Reparaturen getrennt je Modul/Lint/Review/Test; einmaliger zusätzlicher Nova-Auftrag, danach bei Misserfolg blocked.

**Abnahme:** Originalgraph mit Lint-, Review- und Testfehlern, Adminreparatur und Restart: getrennte monotone Budgets, frische Freigaben, keine alte rejected-Guidance; Risikoakzeptanz nur autorisiert und sourcegebunden.

**Nachweisumgebung:** lokale Engine/Git/Artefaktstores; echte Operatorzustellung mit WP09.

**Zugeordnete Kennungen:** PATH-T04-001, PATH-T04-002, PATH-T04-003, PCR-APPROVAL-001, PTR-T05-001.

<a id="wp05"></a>
## WP05 — Forge-Workspace und Gitintegration

**Status:** geplant. **Findings:** 5. **Integration nach:** WP01, WP02, WP03.

**Grenze:** Worktreeerzeugung, Runtime-cwd, Collector, Sync, Commit/Merge und Cleanup.

**Ursachenbehebung:** Autorisierte Workspaceidentität Ende-zu-Ende tragen; kurze Gitmutationen abbrechbar serialisieren; Restressourcen besitzgebunden reconciliieren; Fehlerursachen erhalten.

**Abnahme:** Zwei echte unabhängige Worktrees parallel; Runtime arbeitet tatsächlich im richtigen cwd; Mergekonflikt, Push-ACK-Verlust, Cleanupfehler plus Folgereparatur und Symlinkausbruch werden korrekt behandelt.

**Nachweisumgebung:** lokales echtes Git; Push-Reconciliation an kontrolliertem Remote.

**Zugeordnete Kennungen:** PATH-T07-001, PCR-GIT-001, PCR-IMPLEMENTATION-001, PCR-REPOSITORY-001, T06-F01.

<a id="wp06"></a>
## WP06 — Verbindliche Qualitätsprüfung und Coverage

**Status:** geplant. **Findings:** 22. **Integration nach:** WP01, WP03, WP04, WP05.

**Grenze:** Lint, Echo, Testprovider/-adapter, Source-/Browserbindung und kumulative Gates.

**Ursachenbehebung:** Ausgeführt/skipped/failed/blocked unterscheiden, Pflichtumfang explizit binden; keine All-skipped/No-op-Passes. Originale Ursachen in Parsern, Providern und Fehlerdispositionen beheben.

**Abnahme:** Echte Testcommands/Reports und Originalimporte: all-skipped, leere Suites und null Requests erfüllen keine Pflicht; Interaktionsfehler früherer Module verhindert kumulativen Abschluss trotz grünem letztem Modul. Lintabbruch und Repositorygrenzen prüfen.

**Nachweisumgebung:** lokale Originaltools, Browser/BuildKit/Kubernetes je Provider; fehlende Dienste blockieren nur ihren Nachweis.

**Zugeordnete Kennungen:** PATH-T11-001, PATH-T11-002, PATH-T13-001, PCR-APIFLOW-001, PCR-CONTAINER-BUILD-001, PCR-CONTAINER-BUILD-002, PCR-DELIVERY-001, PCR-DIRECT-COMMAND-001, PCR-HTTP-001, PCR-JUNIT-001, PCR-LINT-001, PCR-LINT-002, PCR-LINT-003, PCR-OPENAPI-001, PCR-OPENAPI-002, PCR-REVIEW-AUDIT-001, PCR-REVIEW-AUDIT-002, PCR-REVIEW-AUDIT-003, PCR-REVIEW-AUDIT-004, PCR-REVIEW-POLICY-001, PCR-REVIEW-POLICY-002, PCR-VISUAL-001.

<a id="wp07"></a>
## WP07 — Prism-Aufträge, Persistenz und Präferenzen

**Status:** geplant. **Findings:** 14. **Integration nach:** WP01, WP02, WP03.

**Grenze:** Prism Control/Worker/Agentbridge/Storage/Corpus und Preferenceprojektion.

**Ursachenbehebung:** Architektur-, Auftrag-, Runde und Attempt durchgängig binden; dauerhafte ACKs, korrekte DBtransaktionen, separate Designrunden und tatsächlich verwendete persönliche Preference-Snapshots. Logs/Executionstate gemäß D01/D09 trennen.

**Abnahme:** Reale PostgreSQL-/Artefaktstores: umgekehrte Ergebnisreihenfolge zweier Architekturen, zweite Dreier-Runde, Crash nach Annahme, persönliche Präferenzen in neuer Sitzung und Projekt-Override; Uploadintegrität und per-Attempt-CPU nachweisen.

**Nachweisumgebung:** lokale DB/Dienste falls verfügbar; echte Agent-/Browserintegration offen bis ausgeführt.

**Zugeordnete Kennungen:** PATH-T02-001, PATH-T02-002, PATH-T02-003, PCR-PRISM-AGENT-BRIDGE-001, PCR-PRISM-AGENT-BRIDGE-002, PCR-PRISM-CONTROL-001, PCR-PRISM-CONTROL-002, PCR-PRISM-CORPUS-001, PCR-PRISM-INGESTION-001, PCR-PRISM-PREFERENCES-001, PCR-PRISM-STORAGE-001, PCR-PRISM-WORKER-001, PCR-PRISM-WORKER-002, PCR-PRISM-WORKER-003.

<a id="wp08"></a>
## WP08 — Prism-Domain, Editor und Rendering

**Status:** geplant. **Findings:** 9. **Integration nach:** WP01.

**Grenze:** Designbaum, Varianten, responsive Patches, Studio/Puck und Renderer.

**Ursachenbehebung:** Operationen verlustfrei definieren, Patchkomposition und Editor-Roundtrip korrigieren; Assets konsistent auflösen und Runtimecache begrenzen.

**Abnahme:** Originaldomain/Renderer: Move-in-Nachkommen abweisen, nichtleeren Baum duplizieren, unabhängige Eigenschaften bewahren; unveränderten Editor-Roundtrip und Pagination mit echtem Browser prüfen.

**Nachweisumgebung:** lokale Domainprüfungen; Browser-/Studiointegration erforderlich.

**Zugeordnete Kennungen:** PCR-PRISM-DOMAIN-001, PCR-PRISM-DOMAIN-002, PCR-PRISM-DOMAIN-003, PCR-PRISM-ENGINE-001, PCR-PRISM-RENDERER-001, PCR-PRISM-RENDERER-002, PCR-PRISM-STUDIO-001, PCR-PRISM-STUDIO-002, PCR-PRISM-STUDIO-SERVICE-001.

<a id="wp09"></a>
## WP09 — Nachvollziehbarkeit und Clawdeck-Zustellung

**Status:** geplant. **Findings:** 11. **Integration nach:** WP01, WP02, WP03.

**Grenze:** Observer, Telemetrie, Redis-/Messagingadapter und bestehende Sinkgrenzen.

**Ursachenbehebung:** Clawdeck als Logsammlung nutzen; zuverlässige Identität, Zustellung, Backpressure und konkrete Fehler erhalten. Nur pipelinegenerierte Demo-Credentials ungeschwärzt; Plattform-Secrets schützen. Keine automatische Disk-/Git-Loglöschung.

**Abnahme:** Originalsender/-empfänger mit verlorenem ACK, 503, Restart, doppelten/verschiedenen Ausgaben; tatsächlicher erneuter Send, korrekte Streamtrennung und vollständige große Ausgaben. Demo-Credentials sichtbar, Plattform-Secrets geschützt.

**Nachweisumgebung:** lokale HTTP/Redisprüfungen; Clawdeck-Ende-zu-Ende separat; kein neuer zentraler Logdienst.

**Zugeordnete Kennungen:** PCR-AGENTSOURCE-001, PCR-HOSTOBSERVER-001, PCR-HOSTOBSERVER-002, PCR-NOTIFY-001, PCR-OBS-002, PCR-OPERATOR-001, PCR-REDISTRANSPORT-001, PCR-REDISTRANSPORT-002, PCR-TELEM-001, PCR-TSTORE-001, PCR-TSTORE-002.

<a id="wp10"></a>
## WP10 — Demo-Namespace, Exposure und Operatorabschluss

**Status:** geplant. **Findings:** 8. **Integration nach:** WP02, WP03, WP09, WP12.

**Grenze:** Namespacecontroller, Fixture, Tailscale und Handoff an den Operator.

**Ursachenbehebung:** Ownership/Generation über Planende übertragen; Demo eine Woche ab Bereit-zur-Abnahme, jederzeit bereinigbar/verlängerbar; URL, Login und Credentials an exakt getestete Version koppeln.

**Abnahme:** Echte Namespace-/Ingress-/Appkette: erlaubter Operator erreicht Login nach Planende, erhält URL/Credentials; alte Owner können neue Exposure nicht löschen; TTL/Release/Rotation entfernen exakt zugehörige Ressourcen.

**Nachweisumgebung:** Kubernetes, Tailscale und echter Browser zwingend für Betriebsbestätigung; derzeit nicht ausgeführt.

**Zugeordnete Kennungen:** F-T14-01, F-T14-02, PCR-BUSTER-NS-001, PCR-BUSTER-NS-002, PCR-BUSTER-NS-003, PCR-KUBERNETES-FIXTURE-001, PCR-TAILSCALE-001, PCR-TAILSCALE-002.

<a id="wp11"></a>
## WP11 — Reproduzierbare Builds und Releasekonfiguration

**Status:** geplant. **Findings:** 12. **Integration nach:** keinem anderen Paket.

**Grenze:** Images/Charts, Registry/Mirror, Installer, CI-Rechte und Promotion.

**Ursachenbehebung:** Gemeinsamen Build-Push/Node-Pull-Vertrag, geprüfte Versionen und zusammengehörige Image/Chart/Values-Releases herstellen; Scannerfrische prüfen; Git-disabled respektieren; Syntax-/Testdefekte an ihren Ursachen beheben.

**Abnahme:** Echte Builds/Render: Defaultreferenzen reproduzierbar, Git-off ohne SSH-Secret, inkompatible Promotion abgewiesen, veraltete Scanner-DB blockiert. Push→Node-Pull und referenzgeschützte Registry-GC real prüfen.

**Nachweisumgebung:** lokale Build-/Helmtools und Registry; Node-Pull später im Cluster; keine CI-Auslösung.

**Zugeordnete Kennungen:** IFR-08-001, IFR-08-002, IFR-09-001, IFR-19-001, IFR-19-002, IFR-21-001, IFR-22-001, IFR-23-001, IFR-24-001, IFR-24-002, IFR-29-001, PCR-SCAFFOLD-OPS-001.

<a id="wp12"></a>
## WP12 — Netzwerk, Identitäten und Isolation

**Status:** geplant. **Findings:** 8. **Integration nach:** keinem anderen Paket.

**Grenze:** RBAC/Admission, API-Egress, Tailnet/Archviewer, BuildKit-Vertrauensgrenze und Proxyrollout.

**Ursachenbehebung:** Namespace-/Ressourcenrechte minimal und aus derselben Konfiguration ableiten; API-DNAT und Zugangswege explizit prüfen; Buildprozesse isolieren; statische Proxykonfiguration an Rollout binden.

**Abnahme:** Helmrender in abweichendem Namespace plus echte positive/negative SA-/Tailnetzugriffe; bösartiger Build darf langlebige Prozesse nicht beeinflussen; Configänderung erreicht tatsächlichen Proxy.

**Nachweisumgebung:** lokale Render; Cluster/Tailnet/BuildKit für Sicherheits- und Erreichbarkeitsnachweise.

**Zugeordnete Kennungen:** IFR-03-001, IFR-03-002, IFR-04-001, IFR-07-001, IFR-10-001, IFR-17-001, IFR-18-001, IFR-27-001.

<a id="wp13"></a>
## WP13 — Betriebsfähigkeit, Restore und Kapazität

**Status:** geplant. **Findings:** 15. **Integration nach:** WP11, WP12.

**Grenze:** Bootstrap/GitOps, Cilium-Vorbereitung, Datenbanken, PVC/Artefakte, Health und unabhängiger Hostzugang.

**Ursachenbehebung:** Konsistente Restoregruppe statt DB-only-Backup; Upgrade-/Passwortrollbackgrenzen, Funktionshealth und Kapazitätsbudget dokumentieren/implementieren. Bestehendes Paperless schützen; kein automatischer Cutover.

**Abnahme:** Restore auf frischem Ziel mit DB und referenzierten Artefakten; fehlgeschlagenes Upgrade, Zertifikatsablauf, OOM/Diskdruck und CNI-/Hostausfall später kontrolliert prüfen. Unabhängigen Recoveryzugang tatsächlich belegen.

**Nachweisumgebung:** Host-/Clusterdaten und getrennte Betriebsabnahme fehlen; Planung/Code kann vorab erfolgen.

**Zugeordnete Kennungen:** IFR-01-001, IFR-02-001, IFR-05-001, IFR-06-001, IFR-11-001, IFR-12-001, IFR-13-001, IFR-14-001, IFR-15-001, IFR-16-001, IFR-20-001, IFR-20-002, IFR-25-001, IFR-26-001, IFR-28-001.

<a id="wp14"></a>
## WP14 — Vollständiger Produktgraph und belegter Abschluss

**Status:** geplant. **Findings:** 6. **Integration nach:** WP04, WP05, WP06, WP07, WP08, WP09, WP10.

**Grenze:** Setup/Compiler, deterministischer Architekturpreflight, optionale Stages, Summary, Pipeline Review/Case Study.

**Ursachenbehebung:** Bestätigte Produktpolicy explizit kompilieren: deterministischer Architekturcheck Pflicht, agentischer optional, Echo default off/Buster on; kumulative Gates und Bereit-zur-Abnahme/Abgenommen trennen; Berichte an reale Quellen binden.

**Abnahme:** Originalcompiler→Runner für Minimal-/Vollvariante, Reparaturen und finalen integrierten Stand; keine Bereitmeldung ohne erreichbare Demo/zugestellten Zugang. Explizite Abnahme gilt nur für diese Version. Berichte aus falschem Run/Source werden nicht als verifiziert akzeptiert.

**Nachweisumgebung:** zuerst Compiler/Verträge lokal; tatsächliche Gesamt-E2E erst mit Infrastruktur und Agenten.

**Zugeordnete Kennungen:** PCR-PREFLIGHT-001, PCR-PREPORT-001, PCR-SCAFFOLD-001, T01-F01, T01-F02, T15-F01.

## Einheitliche Abschlussregeln

- Je Finding: Ausgangsstand erneut bestätigt oder anhand konkreter Änderungen als bereits behoben/widerlegt begründet; Original-ID nicht löschen.
- Ursachenbehebung, echte Regression beziehungsweise begründeter Verifikationsschritt, Commit, Gegenprüfung und betroffene Gegenstellen dokumentiert. Keine Shims, Dummy-Komponenten oder Mocks, um einen Erfolg zu erzeugen.
- Architektur- und Betriebsdokumentation im jeweiligen Umsetzungspaket an das tatsächlich geänderte Verhalten anpassen. Obsoletes erst nach Aufruferprüfung entfernen.
- Lokale Verifikation schließt einen fehlenden Cluster-/Agent-/Restore-Nachweis nicht ein. Offene Voraussetzungen sichtbar lassen; keine neue CI anfordern.
- Geänderte Kanten durch die entsprechenden bestehenden Traces erneut verfolgen. Danach echte Integration/Crash-/Operator-E2E separat ausführen; statischer Trace bleibt statisch.
