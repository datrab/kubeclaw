# Restarbeitsinventur — 2026-09-21

Dies ist eine Restarbeitsinventur, **keine unabhängige Gesamt-Abnahme**. Grundlage
sind der [Abnahmevertrag](../acceptance-20260920.md), der
[Implementierungscheckpoint](implementation-20260920.md) und die
[Statusquelle](../register.json). Nach der unabhängig geprüften lokalen SPIRE-Abnahme
enthält sie zwölf nicht lokal abgeschlossene historische Befunde: sechs offen,
vier in Bearbeitung, zwei implementiert. Tailscale ist nach der dokumentierten
Vorbereitung in Bearbeitung und weiterhin nicht abgeschlossen. REGISTER
und CONFIG sind zusätzliche Arbeitspakete. Diese Inventur verändert keinen Status,
führt keine Tests aus und überträgt keine historischen Testzahlen auf den aktuellen
Arbeitsbaum. Verlinkte Teilabnahmen gelten ausschließlich für deren gebundene Quellen.
Die laufende Buster-/HA-Arbeit wird hier nicht vorweggenommen.

SPIRE gehört weiterhin zum ursprünglichen Umfang und bleibt deshalb unten
sichtbar. [S1/S2/S-DOC sind lokal abgenommen](independent-spire-current-scope-20260921.md);
seine separaten Live-Gates bleiben offen. Die übrigen zwölf Zeilen sind keine
neue Gesamt-Abnahme ihrer bisherigen Teilumsetzungen.

## Priorisierte lokale Arbeit

**Jetzt unabhängig von Buster bearbeitbar:** zuerst R1 (vollständige Store- und
Consumerzuordnung) sowie F1/P1 (Settings- und Portabilitätsinventar), danach die
jeweiligen fehlenden Produktionspfade. Parallel lassen sich Q1–Q3
(anwendungsweite Backup-/Resume-Konsistenz) und I1–I3 (vollständige Imageinputs,
Buildvergleich und fertige Images) konkretisieren. Dafür bereits akzeptierte
Projektionen, Locks, Archiveprüfungen und Prism-Loader übernehmen.

**Mit Buster abstimmen:** B1–B5 vor W4/W5; BuildKit-Isolation als eigener
Sicherheitsvertrag; D1–D3 und F6 mit denselben Ressourcenautoritäten. Ein bestandener
isolierter Core-Gasttest ersetzt weder den Buster-Produktionspfad noch physische
Hostkapazität. Bereits vorhandene Core-Besitz-, Kapazitäts- und Cleanup-Schnittstellen
nicht erneut implementieren.

**Betriebsvorbereitung:** lokale H/T/O-Verträge und Eingabeinventare vervollständigen;
fehlende externe Daten ausdrücklich benennen. Cilium bleibt gemäß Abnahmevertrag
im späteren Wartungsschritt. REGISTER und die vollständigen Dokumentationsprüfungen
erst nach Ende paralleler Änderungen abschließend binden.

| Punkt / Kriterien | Konkrete lokale Umsetzung oder Nachweislücke; geprüfter Einstieg | Separates Live-Gate |
|---|---|---|
| PCR-BUSTER-ENGINE-001 · B1–B5 | Laufende Produktionsintegration bis Provider, Capabilityhelfer, RPC und Bericht schließen; Broker-/Ressourcenabrechnung, dauerhafte Fixturebereitschaft und abhängige Nodes unter realer Last/Abbruch/Restart nachweisen. Alte konkurrierende Ausführung entfernen. Einstieg: [RemotePlanService](../../../../skills/buster/engine/test-gates/remote-plan-service.ts), [Hostpool-Vertrag](../../../operations/native-worker-host-pools.md). Core-Teilabnahmen bleiben erhalten. | Echter Nova→Buster-Dispatch mit Produktionsimages, delegierten Rollen, Parallelversuchen und Hostreserve; fehlende Delegation lehnt vor Annahme ab. |
| PCR-BUSTER-ENGINE-004 · W1–W5 | Nach dauerhafter Besitzintegration positive Orphan-Recovery und tatsächliche Freigabe zeigen; Sourcearchive in Jobrecords, Extraktionsreste, retained Fixtures sowie gesamtes runtimeRoot mit Quoten erfassen. Publikationsgrenze, Root-Ledger, Löschberechtigung und Crash-Reconciliation im Buster-Consumer schließen. [Orphan-Grenze](buster-orphan-recovery-boundary.md). Bereits gehärtete Pfadwechsel-/Core-Cleanup-Pakete nicht neu bauen. | Reale Worker-/Pod-Neustarts mit persistenten Volumes; belegte Beendigung vor Cleanup, abrufbare Receipts, messbar freie Kapazität. |
| PCR-OBS-002 · R1–R4 | Vollständige Store-/Consumerliste und für jede übrige freigebbare Klasse manuellen Plan **und Executor** unter Writerlocks implementieren; echte Bytes/Slots, kleine Quoten, gemeinsame Referenzen, Crash und verspätete Zustellung prüfen. Der [globale Planner](observability-retirement-planner.md) bleibt ausdrücklich nicht ausführbar; die akzeptierte imported-result-Projektion ersetzt ihn nicht. Die [Wait-Wertprojektion](independent-wait-retirement-final-20260921.md) ist inzwischen für WP1–WP8/DOC unabhängig lokal akzeptiert; sie gibt nur redundante physische Wait-Storebytes frei, keine Records/Blobs/Corehistorie. Diesen vorhandenen Executor übernehmen, die übrigen Klassen weiterhin vollständig schließen. [Speicherinventarisierung](../../../../scripts/observability-retirement/stores.mjs). | Isolierte Kopie realer Storestrukturen mit dokumentierten Quoten; keine ungefragte Löschung produktiver Historie oder D07-Materialien. |
| IFR-21-001 · I1–I3 | Inputinventar für **alle** Runtime-/Opsimages abschließen; zwei isolierte Vollbuilds je beanspruchter Architektur mit SBOM/Paketen/Nutzdateien/Digests vergleichen; Browser und Tools im fertigen Image ausführen. Vorab Metadatenausnahmen festlegen. [Akzeptierter Archivbaustein](browser-archive-lock-20260921.md), [Buildrunner](../../../../scripts/prepare-image-build-runner.sh). Kein neuer Download-Lock-Baustein nötig, soweit bereits gebunden. | Genau geprüfte Digests deployen und benutzen; fehlende ARM-Ausführung ausweisen, aktuelle Scannerinputs separat belegen. |
| IFR-29-001 · P1–P3 | Betreiberwerte, portable Beispiele, Invarianten und externe Secretrefs vollständig klassifizieren; frischer Clone mit zwei fiktiven Profilen durch normalen Renderpfad ohne Quellenänderung; dokumentierte Suche in aktuellem Baum, erreichbarer Historie, Buildkontext und generierten Artefakten. Mit [CONFIG-Inventar](config-inventory-20260920.md) bündeln, nicht allein Suchtreffer zählen. | Fremdes Betreiberprofil ohne AX41-/Identitätsleck und ohne Kontakt zu fremden Diensten einsetzen. |
| IFR-04-001 · T1–T2 | [Doku-/Render-Vorbereitung unabhängig geprüft](independent-tailscale-access-preparation-20260921.md), 5/5 lokale Fälle. Vier private Ingressfamilien und der separate ausgehende Ops-SOCKS-Pfad sind erfasst. Aktuellen redigierten externen Regelstand, tatsächliche Grants/TagOwner/Credential-Verantwortung und reale erlaubte/verbotene Clientreferenzen noch binden; T1/T2 bleiben unvollständig. Einstieg: [Operatorwerte](../../../../my-values/infra/tailscale-operator-values.yaml), [Exposure-Provider](../../../../skills/buster/plugins/tailscale-exposure/src/provider.js). Externen Regelstand nicht erfinden. | Mit echtem Tailnet-Regelstand und Testclients Allow/Deny vor/nach Proxyrestart sowie OAuth-/Zertifikatsrotation messen. |
| IFR-10-001 · K1–K3 | Kurzlebige Build-Sicherheitsgrenze und Ablehnung ohne Isolation implementieren; echte Negativfälle für Signale/ptrace/Dateien/Cache/Credentials/proc/fd sowie positive Build/Push/Scan/Pull-Fälle, Hintergründe und parallele feindliche Builds. [Readiness](../../../../skills/buster/engine/test-gates/buildkit-readiness.ts) allein ist keine Isolation. | Gewählte Images auf wirklichem Host: Egress, parallele Builds, Daemonrestart und Cleanup unter tatsächlichen Grenzen. |
| IFR-01-001 · H1–H3 | Unterstützte Plattform-/Storage-/Rechte- und Backupverträge vollständig festlegen; Rolleninstaller frisch/wiederholt/unterbrochen inklusive Recovery prüfen. [deploy.sh](../../../../scripts/deploy.sh) und [Bootstrap-Teilabnahme](independent-bootstrap-api-guard-20260921.md). Die akzeptierten API-Fehlerguards nicht erneut bauen; sie decken nicht jeden Installerpfad ab. | Isolierter echter Host: Bootstrap, Wiederholung, Nodejoin und Hostverlust mit Wiederherstellung tatsächlicher Workloads; keine fremden PVC-/Workloadverschiebungen. |
| IFR-02-001 · C1–C2 | Reales Wartungsinventar für Nodes/Pods/Namespaces/DaemonSets und Anwendungen einschließlich Paperless/HomeOS ergänzen; Offlineartefakte, unabhängigen Zugang, Phasen, Abbruch/Rollback und Markerbedingung vollständig binden. [Runbook](../../../ops/cilium-networking.md), [Cutover-Skript](../../../../scripts/deploy-cilium.sh). Akzeptierte Guard-Teilfälle erhalten. | Späteres Wartungsfenster: alle Apps/Endpoints, Allow/Deny, gegebenenfalls OCR, Recovery/Rollback; Marker erst nach realer Abnahme. |
| IFR-06-001 · S1–S2 | S1/S2/S-DOC lokal abgeschlossen: [frische unabhängige Abnahme](independent-spire-current-scope-20260921.md) bindet aktuelle Quellen und erneut ausgeführten Chart-Render. Kein weiterer lokaler Implementierungsbedarf für diese Kriterien; ursprünglicher Umfang und separate Live-Gates bleiben erhalten. | Echte erlaubte/falsche Identitäten, SVID-Erneuerung über Ablauf, laufende Arbeit bei Ausfall, CA-Rotation und Server-/Schlüsselrestore mit Fail-closed und RTO gemäß [Runbook](../../../operations/spire-recovery.md). |
| IFR-16-001 · D1–D3 | Gesamthaushalt aus Node-Allocatable, allen Podrequests, anderen Apps, Buster-/Prism-Pools, pending/aktiven/Fixture-Reservierungen erstellen; reale Dateisystem-/Inodebelegung statt summierter PVC-Nennwerte. Kombinierte Build-/Browser-/Backup-/Restore-Last und Backpressure messen. [Kapazitätschecker](../../../../scripts/native-worker-node-capacity.mjs) ist nur ein Baustein. | Physischer Host mit Kubelet/Scheduler, konkurrierender Poolannahme ohne Doppelvergabe, Latenzen und wirklicher Storage-/Inodereserve; TCG-Gast ist kein Kapazitätsbeweis. |
| IFR-26-001 · Q1–Q4 | Konsistenten Zeitpunkt über DB, sämtliche Artefaktrefs, Schlüssel, Journale und Software/Schema unter parallelen Writes schließen; falscher Schlüssel/Manipulation/volle oder abgebrochene Sicherung; tatsächliche App-/Session-/Job-Wiederaufnahme einschließlich wartend/laufend/extern ungewiss. [Restmatrix](prism-retirement-matrix-20260920.md). Akzeptierte manuelle Retirement- und Storage-Roundtrip-Pfade übernehmen. | Restore ohne Originalvolumes aus unabhängigem Ausfallbereich; externes Backupziel, Schlüsselverwahrung und gemessene RPO/RTO gemäß [Runbook](../../../operations/prism-backup-retention.md). |
| IFR-28-001 · O1–O2 | Konkreten unabhängigen Host-/KVM-Zugang samt Abhängigkeiten, Zuständigkeit und Credentialablage dokumentieren; Recoveryanweisung außerhalb des Clusters verfügbar machen. Einstieg: [Ops-Deployment](../../../../scripts/deploy-ops-pod.sh); vorhandener Ops-/Tailnet-Zugang beweist keine Unabhängigkeit. | Kontrollierter Argo-/Tailnet-/CNI-Ausfall: tatsächlich von außen diagnostizieren und reparieren. Externer Zugang muss bereitgestellt sein. |
| REGISTER · G1–G3/G-DOC | [Aktueller unabhängiger lokaler Abschluss](../../evidence/independent-register-final-20260921/review.md): 26/26 Originaltests und Checker bestanden, aktuelle IDs/Status/Zähler und Dokumentation gebunden. Nach weiteren Registeränderungen erneut generieren und prüfen; keine automatische fachliche Hochstufung. Historischer A1-Zeitverstoß bleibt offengelegt und wird nicht nachträglich geheilt. | Kein eigenes Live-Gate; fachliche Live-Grenzen der einzelnen IDs bleiben erhalten. |
| CONFIG · F1–F6 | [Discovery-Inventar](config-inventory-20260920.json) ist noch kein F1-Abschluss. Übrige Nova-/Buster-/Prism-/Host-/Deployment-Autoren und Consumer erfassen; Operatorsettings gemäß D17 in eindeutig zuständige zentrale Komponentendateien mit gemeinsamem Referenzeinstieg migrieren; alte Autoritäten und Codefallbacks entfernen/abweisen, Verhalten und Drift mit zwei Profilen prüfen. Versionen/Secrets getrennt lassen. F6 mit D/B abstimmen. [Operatoranleitung](../../../operations/operator-configuration.md) nennt die verbliebenen Loader ausdrücklich; akzeptierte Prism-Settings nicht neu implementieren. | Zwei gültige Stände über normalen Git-/Argo-Weg in echten Rollen; ungültiger Stand darf keine Teilaktivierung verursachen. Native Ressourcen- und fertige Imagebeweise bleiben eigene Gates. |

## Querschnitt und Grenzen

Für CONFIG liegt inzwischen die unabhängig geprüfte
[Worker-Core-Inventur mit LC-Abnahmekriterien](config-worker-local-runtime-inventory-20260921.md)
vor. Die drei Defaults für Drain, Abbruch und Replay-Kapazität sind inzwischen
auf die explizite Worker-Core-Datei umgestellt; Autorenprüfungen und unabhängige
Implementierungsabnahme sind noch nicht abgeschlossen. Replay gilt pro
Runtime-Instanz; der aktuelle Buster-Runner verwendet deren Drain-Funktion nicht.
Diese Grenze bleibt auch nach der Konfigurationsumstellung bestehen.

Die Worker-Core-Regressionsprüfung hat außerdem eine
[gesicherte Lint-Vorher-Baseline](../../evidence/config-worker-local-runtime-20260921/lint-baseline/findings.json)
mit 32 bestehenden Verstößen sichtbar gemacht: 30 im Buster-Runner, einen in
Core `runAttempt` und einen im ursprünglichen Runner-Vertragstest. Diese
Qualitätsarbeit bleibt offen. Neue Verstöße werden in der Migration behoben;
das erlaubt weder einen grünen Gesamt-Lint-Nachweis noch das Verwerfen der
bestehenden Befunde. Eine spätere kohäsive Vereinfachung muss die vollständigen
Runner-/Core-Verhaltensprüfungen und ursprünglichen Fristen erhalten.

Die Core-Replaybereinigung ist inzwischen als identische private Methode
ausgegliedert. Der abgeschlossene [LC-Lauf 9](../../evidence/config-worker-local-runtime-20260921/run9/results.json)
bestätigt die ursprünglichen Core-, Deadline-, vollständigen Runner- und
Real-Provider-Prüfungen, die neue Policy-/Produktionsprüfung und beide Typprüfungen.
Der Gesamtlauf bleibt wegen 31 Lint-Verstößen fehlgeschlagen; der bisherige
Core-Komplexitätsverstoß ist entfallen. Die unabhängige Abnahme steht noch aus.
Für die Output-Prüfung liegt ein
[privater Runner-Entwurf](../../evidence/buster-runner-output-simplicity-20260921/change.patch)
vor: eine Implementierung im bestehenden Provider-Validierungsmodul, unveränderte
öffentliche Runner-API und identische Prüfungsreihenfolge. Die
[statische Nichtautorenprüfung](../../evidence/independent-buster-runner-output-simplicity-20260921/static-check.json)
bestätigt die erhaltenen Funktionskörper; Integration, ursprünglicher Outputvertrag,
vollständiger Runner, Typen und Lint bleiben dafür offen. Die historische
32er-Lint-Baseline ist kein aktueller Abschlusszähler.

Der vollständige Runnerlauf hat außerdem einen echten
[Provider-Abbruchbefund](buster-provider-cancellation-20260921.md) aufgedeckt.
Der minimale SIGTERM-zu-Context-Fix wird innerhalb der offenen Buster-Integration
mit den ursprünglichen kooperativen und erzwungenen Prozessfällen geprüft.
PC1–PC3/PC-DOC und die unabhängige Abnahme bleiben bis zu deren Nachweisen offen.

Die [Buster-Readiness-Kriterien](config-buster-readiness-20260921.md) erfassen
als nächsten Schnitt die zwei noch bestehenden Codefallbacks und den konkurrierenden
Entrypoint-Autor für Probezeit und Ausgabebytes. Die tatsächliche Verlagerung und
BR1–BR4/DOC sind noch offen; Readiness ist kein Nachweis für Build-Isolation.
Der private Umsetzungsentwurf ist für die beiden betroffenen Dateien gegen den
aktuellen LC-Stand [neu zusammengeführt](../../evidence/config-buster-readiness-20260921/lc-rebase/change.patch).
Die gemeinsame Übergabe von Buster- und Worker-Core-Settings bleibt erhalten;
Readiness wird daraus explizit validiert. Dieser Entwurf ist weder integriert
noch ausgeführt und verändert den Abnahmestatus nicht.

Die ergänzende [Artifact-/State-Plugin-Inventur](config-storage-plugin-inventory-20260921.md)
ist als begrenzter Quellenbefund unabhängig geprüft. Sie erfasst acht Schemafelder und den
zusätzlichen festen Artifact-Metadatengrenzwert. Insbesondere begrenzt der
bisherige Artifact-Wert `maximumStoreBytes` Metadaten und Blobs jeweils separat;
er ist kein gemeinsames Gesamtbudget für das Speicherverzeichnis.

Die [Runtime-/Remote-Inventur](independent-config-runtime-remote-plugin-inventory-20260921.md)
und die [Transport-/Observer-Inventur](independent-config-transport-observers-plugin-inventory-20260921.md)
sind ebenfalls als begrenzte Quelleninventuren geprüft. Zusammen mit den früheren
Plugin-, Storage- und Command/Git-Inventuren sowie den
[letzten vier Nova-Adaptern](independent-config-final-four-adapter-inventory-20260921.md)
sind alle 26 erfassten Adapter-/Observerregistrierungen als begrenztes
Quelleninventar geprüft. Die separaten Stage-/Testprovider-Konfigurationen,
Lint-Policy-/Toolregeln und übrigen Deploymentautoren bleiben zu erfassen.
Diese Zahl beschreibt Inventarabdeckung, keine implementierte Migration oder
F1-Abnahme.

Alle Zeilen behalten A1–A8 und ihren DOC-Abschluss: konkrete unveränderte
Pflichtfälle, echte Effekte und Positivkontrollen, Quellenbindung, frische
Nichtautorenprüfung, lesbare Betriebsdokumentation und ausdrücklich getrennte
Umgebungsgrenzen. Fehlversuche, Skips und Abbrüche werden nicht umgedeutet.
Die noch ungeklärten Gast-Timeouts benötigen Messung; diese Inventur nennt TCG
nicht als bewiesene Ursache. Vollständige Dokumentations-/Migrationsgates und
generierte Inventare müssen nach Stabilisierung gemeinsam geprüft werden.

IFR-05-001 gehört nicht zu den 13: sein lokaler Abschluss bleibt bestehen;
die getrennten GitOps-Live-Gates bleiben gemäß Abnahmevertrag offen. Externe
Tailnet-Regeln/Testclients, reale Host-/Storagebelegung, unabhängiger Zugang,
Backupziel und Recovery-/Latenzziele sind Eingaben für die betreffenden Gates,
kein Grund, unabhängige lokale Arbeit anzuhalten.


### Nachfolgende lesende Betriebserhebung

Die [datierte Betriebserhebung](readonly-operations-inventory-20260921.md)
liefert inzwischen einen echten Node-/Argo-/kube-system-DaemonSet-Ausschnitt.
Sie ersetzt kein vollständiges C1-Inventar und enthält weder Allocatable noch
Nutzungs-/Dateisystemmessungen. Der beobachtete Cluster verwendet eine andere
Revision; sein teils degradierter Argo-Zustand ist kein Test dieser Arbeitskopie.
Keine Clusteränderung und keine Befundhochsetzung wurden vorgenommen.
