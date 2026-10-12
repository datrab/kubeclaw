# Bestandsaufnahme und Entscheidungsvorlage — 12. Oktober 2026

**Nachfolgende Entscheidung am selben Tag:** Der Auftraggeber hat die Kubernetes-Jobarchitektur samt fünf Vertragsanpassungen unter der Bedingung wesentlicher Vereinfachung akzeptiert und CONFIG → Test-Refactoring → Cgroup-Refactoring → zwölf offene Findings priorisiert. [D18/D19](decisions.md#d18--kubernetes-ausführung-statt-eigener-nativer-hostpools) und der [beschlossene Arbeitsplan](implementation-order-20261012.md) sind dafür aktuell maßgeblich. Die nachfolgenden Empfehlungen und ausstehenden Entscheidungszeilen dokumentieren die vorherige Bestandsaufnahme; ihre vorgeschlagene Reihenfolge ist abgelöst. Keine Findingstatus wurden geändert. Der aktuelle Auftrag bleibt Dokumentation ohne Codebeginn.

Dies ist eine neue Bestandsaufnahme der ursprünglich angesprochenen 14 Punkte sowie REGISTER und CONFIG. **Keine Implementierung ist freigegeben.** Empfehlungen, Kriterienvorschläge und Reihenfolge sind zur ausdrücklichen Entscheidung durch den Auftraggeber vorgelegt. Bestehende Findingstatus werden nicht geändert. Schweigen und frühere pauschale Freigaben ersetzen diese Entscheidung nicht.

## Prüfstand und Aussagegrenzen

Repository: `/home/node/Documents/Codex/2026-09-20-hi-sind-die-offenen-issues-irgendwo`; Branch `main`; HEAD `cd9f235345f5fd8736a2ffe75d806288e4d538db`. Zu Beginn 1.238 geänderte/unversionierte Statuszeilen. HEAD allein beschreibt die Implementierung nicht. Der Auftrag aus dem eingefügten Text hat Vorrang vor der Implementierungsreihenfolge in HANDOFF-20261009.

Grundlagen: [Originalregister mit vollständigen Befundtexten](register.json), [Bewertung vom September](assessment-20260920.md), [Abnahmekriterien](acceptance-20260920.md), [Entscheidungen D01–D17](decisions.md). Originalberichte wurden zusätzlich über die lokal vorhandenen Git-Objekte aufgelöst; historische Texte bleiben unverändert. Die September-Bewertung beschreibt teilweise inzwischen ersetzte Pfade.

Neue lokale Prüfungen: `node scripts/review/remediation-register.mjs --check` bestanden; `node --test scripts/tests/remediation-register.test.mjs tests/verification/deployment/runtime-tool-locks.test.mjs` **27/27**, keine Fehler, Skips oder Abbrüche. Davon 26 Registerfälle und ein Toollockfall. Diese Tests belegen Registermechanik bzw. den begrenzten Lockvertrag, keine umfassende Runtimeabnahme. Der frische Subagent hat separat die 26 Registerfälle ausgeführt. Keine neuen Image-, Kernel-, Browser-, DB-, Tailnet-, Cluster- oder Hostausfalltests, keine Downloads, Deployments, Commits oder Statuspromotionen.

Die Prozessliste zeigte keine erkennbaren alten Security-/Ownership-/CI2-Testjobs. Prozessnamen allein schließen versteckte Arbeit nicht sicher aus; vor einem späteren schweren Lauf ist eine neue Prüfung erforderlich. Das Cloud-Runtime-Skill wurde gelesen; ein `environment_status`-Tool ist in dieser Sitzung nicht verfügbar. Ausführungs- oder externe Betriebsfähigkeit wurde daraus nicht abgeleitet.

Die aktuellen Hashvergleiche und Quellenidentitäten stehen in [audit-20261012.json](audit-20261012.json). Sie sind eine Beobachtung, **kein neues akzeptiertes Integrationsmanifest**. Die alten Manifeste bleiben unverändert.

## Entscheidungsliste

Aufwand ist relativ: klein = Dokumentation/gezielte Regression; mittel = begrenzte Consumer-/Storeänderung; groß = mehrere Komponenten und echte Runtime-/Recoveryprüfung. Keine belastbare Stundenkalkulation ohne beschlossenen Umfang und verfügbare Prüfumgebung.

| Punkt | Tatsächlicher aktueller Stand | Empfehlung | Nutzen / Aufwand |
|---|---|---|---|
| ENGINE001 | Produktionsrunner ohne belegtes gemeinsames natives Attemptbudget; native Teilbausteine vorhanden | Unverändert beheben, in prüfbare Etappen teilen | Harte Gesamtgrenzen und richtige Abrechnung; groß |
| ENGINE004 | Preparation-/Recoverymechanik vorhanden; zwei Löschpfade ohne positive Disposalfreigabe, Gesamt-W1–W5 offen | Umfang in akute Löschsicherheit und vollständige Recovery aufteilen | Kein Löschen während Arbeit, später echte Platzfreigabe; mittel + groß |
| OBS002 | Mehrere manuelle Compactions vorhanden; allgemeiner Blob-Freigabepfad fehlt | Umfang auf verbleibende Klassen anpassen | Kapazität ohne Replay-/Historieverlust; groß |
| IFR21 Images | Tool-, Browser- und DB-Locks integriert; vollständige doppelte Imagebuilds fehlen | Umsetzungslücken prüfen, Schwerpunkt auf echte Builds | Rebuildvertrauen und nutzbare Outputs; groß |
| IFR29 Betreibertrennung | Konkrete Betreiberprofile weiter im Tree; kein neuer Secretfund festgestellt | Mit CONFIG bündeln, bewusst öffentliche Profile erlauben | Portabilität und klare Veröffentlichungsgrenzen; mittel |
| IFR04 Tailscale | Lokale Render-/Dokuvorbereitung vorhanden; echte Regeln/Clients fehlen | Lokalen Umfang anpassen, Live separat zurückstellen | Nachvollziehbare Zugriffsrechte; klein lokal, extern abhängig |
| IFR10 BuildKit | Gemeinsamer Daemon weiterhin mit `--oci-worker-no-process-sandbox` | Unverändert beheben, Architektur zuerst entscheiden | Isolation fremder Builds; groß |
| IFR01 Bootstrap | Hoststufen und Runbook vorhanden; vollständiger Wiederaufbauinstaller fehlt | Bestehende Stufen bündeln, Umfang explizit wählen | Reproduzierbarer Wiederaufbau; groß |
| IFR02 Cilium | Runbookziel existiert inzwischen; Cutovervorbereitung, keine Live-Abnahme | Migration zurückstellen, Vorbereitung erhalten | Geordnete spätere Migration; mittel + großes Betriebsfenster |
| IFR05 GitOps | Ursprünglicher lokaler Fix vorhanden; alte Belege, aktuelle Gesamtkette nicht neu ausgeführt | Ohne neuen Featureumfang schließen belassen; Regression bei Änderungen | Vermeidet Wiederimplementierung; begrenzte Nachweisarbeit |
| IFR06 SPIRE | S1/S2-Dokumentations-/Renderumfang vorhanden; ein gebundener Peer-Templatehash geändert | Lokalen Abschluss bedingt belassen; geänderten Renderpfad nachweisen | Kein unnötiger Trustumbau; klein bis mittel |
| IFR16 Storage/Last | Native Reservierungsbausteine vorhanden; Disk/Inodes und kombinierte Last offen | Auf Storage und integrierte Reservierungsprüfung fokussieren | Verhindert Überbuchung und Datenverlust; groß |
| IFR26 Recovery | DB-/Artefaktgruppen implementiert; DB-Kommandos der lokalen Tests Fixtures | Vollständige anwendungskonsistente Recovery beheben | Wiederherstellbare Daten und Arbeit; groß |
| IFR28 Management | Unabhängiger Management-/KVM-Pfad dokumentiert, reale Nutzbarkeit unbewiesen | Mit Bootstrap/Recovery bündeln; Live getrennt | Zugang bei Clusterverlust; klein lokal, extern abhängig |
| REGISTER | Aktuelle Konsistenz und 26 Mechanikfälle bestanden | Ohne weitere Mechanikänderung schließen vorschlagen | Eine Statusquelle; klein |
| CONFIG | Viele zentrale Teilschnitte integriert, D17 gesamt offen; Security.scan privat | Gesamtziel erhalten, kleine Komponentenpakete entscheiden | Eine Autorität je Setting und erkennbare Fehler; sehr groß |

„Schließen“ in dieser Tabelle ist eine Empfehlung für unsere Entscheidung, keine ausgeführte Registeränderung. Ein historischer lokaler Abschluss ist weder aktuelle Gesamtregression noch Live-Pass.

## Gemeinsame vorgeschlagene Abnahmebedingungen

Für **jeden** freigegebenen Punkt gelten A1–A8 und dessen DOC-Kriterium aus [acceptance-20260920.md](acceptance-20260920.md): konkrete Pflichtfallmatrix, tatsächlicher Produktionsconsumer, gebundene Quell-/Test-/Konfigurationsbytes, passende positive und negative Wirkungstests, erhaltene Fehlläufe und frische unabhängige Prüfung. Ersetzte Altpfade werden entfernt oder ausdrücklich zurückgewiesen. Keine Abnahme aus Agentstatus oder Teiltestzahlen.

**Dokumentation gehört zu jedem Punkt:** die unten genannten und alle tatsächlich betroffenen Benutzer-, Entwickler- und Betriebsdokumente prüfen; bei Bedarf aktualisieren, Links/Beispiele/Befehle passend prüfen; bei unverändertem Dokument den konkreten Grund festhalten. Historische Rohbelege nicht umschreiben. Lokale Implementierung, lokaler Test, Review und Liveprüfung getrennt führen. Bereits vorhandene B1–B5/W1–W5/R1–R4 usw. bleiben gültig, bis wir ausdrücklich eine Änderung beschließen; die folgenden Kurzfassungen ersetzen sie nicht.

### 1. PCR-BUSTER-ENGINE-001 — gemeinsames Attemptbudget

**Ursprünglich:** Capability-RPCs laufen im Parent statt im gemessenen Providerprozess; Reportarbeit folgt der Messung. Damit stimmen harte Limits und Receipt nicht für die Gesamtarbeit.

**Heute / Code:** [remote-prepared-execution.ts](../../../skills/buster/engine/test-gates/remote-prepared-execution.ts) erstellt den Capabilityruntime und `TestPlanRunner`, ohne `workerRuntime` zu übergeben. [runner-setup.ts](../../../skills/buster/engine/test-gates/runner-setup.ts) erstellt dann `LocalWorkerRuntime`; [runner-provider-operation.ts](../../../skills/buster/engine/test-gates/runner-provider-operation.ts) misst `instance.resources()`. Die September-Fundstelle in der großen remote-plan-service-Datei ist durch Aufteilung ersetzt, der Gesamtbudgetdefekt bleibt. Preparation-, native Ownership-, Pool- und Fixturebausteine sind vorhandene Implementierung, keine vollständige B1–B5-Verdrahtung.

**Tests/Review/Lücken:** Native VM generation6 enthält fehlgeschlagene Ausführung und Speicherpreflight; keine neue Kernel-Gesamtabnahme. Teiltests anderer Worker-/Cleanup-Pakete können die fehlende Produktionsbindung nicht ersetzen. B1–B5 einschließlich kurzer Kinder, paralleler RPCs, Reportarbeit, Supervisorverlust und retained Fixtures am echten Aufrufer bleiben offen. Live Nova→Buster mit realen Hostrollen ebenfalls offen.

**Empfehlung / Zielkonflikt:** Beheben. Hoher Nutzen, aber große Eingriffstiefe. Generischen Core und vorhandene native Mechanik wiederverwenden; externe BuildKitkosten gesondert führen. Vorher Zielruntime, gemessene Reserven und Fixturevertrag bestätigen, keine Limits passend zu Fehlläufen erhöhen.

**Abnahme:** B1–B5 plus B-DOC vollständig; echte CPU/RAM/Linux-Taskgrenzen, getrennte parallele Attempts, dauerhafte Fixturebereitschaft und Cleanupabschluss; fehlende Delegation blockiert Arbeit. Dokumente: `buster-v2-runtime.md`, native Worker-/Hostpoolverträge und Operator-Konfiguration.

### 2. PCR-BUSTER-ENGINE-004 — Quellen, Besitz und Löschfreigabe

**Ursprünglich:** Terminalrecords behalten Archive, extrahierte Quellen und Workspaces; Quoten füllen sich, dokumentierte Retention widerspricht Verhalten.

**Heute / Code:** Prepared-Source-Verweise, [preparation-ledger.ts](../../../skills/buster/engine/test-gates/preparation-ledger.ts), [preparation-recovery.ts](../../../skills/buster/engine/test-gates/preparation-recovery.ts), historische Replay-/Compactionpfade und reguläres `cleanupTerminalWorkspace` existieren. Es fehlt also nicht jede dauerhafte Bereinigung. Konkret löscht [runner-attempt-execution.ts](../../../skills/buster/engine/test-gates/runner-attempt-execution.ts) im `finally` das Staging; [runner-attempt-result.ts](../../../skills/buster/engine/test-gates/runner-attempt-result.ts) löscht bei `!retainFixture` das Attemptrepository, ohne dort positive Disposalbestätigung zu verlangen. Fehlgeschlagenes Cleanup allein beweist allerdings nicht weiterlaufende Arbeit: Arbeitsende und semantischer Cleanupfehler müssen getrennt werden.

**Entwurf / Nachweise:** `evidence/engine-attempt-source-safety-20260924/` enthält sieben Kandidatendateien und sechs Vorherdateien, ohne eingefrorenes Abnahmepaket. Frühere Status-/Readfehler- und Ownershiptests belegen begrenzte Fehlerbehandlung, nicht diesen Entwurf oder W1–W5 insgesamt. Published-source release, aktive Orphans, positive Restartfreigabe, Snapshotretry und historische Replay-/Compactionfälle bleiben zuzuordnen und zu prüfen.

**Empfehlung:** Zweiteilen: zuerst positive Löschautorität und tatsächliches Arbeitsende; anschließend vollständige Recovery-/Kapazitätsfreigabe. Der kleine Sicherheitsfix darf nicht als Gesamtabschluss dienen. Bewahren ohne Freigabe schützt Arbeit, unbegrenztes Bewahren aller Restartquellen löst Kapazität nicht.

**Abnahme:** Akutes Paket: echte Stopfehler, Spätabschluss und Positivcleanup, keine vorzeitige Löschung, idempotente Freigabe. Gesamtpunkt: W1–W5 mit realen Crash-/Restart-/Orphanfällen, Symlinkschutz, messbar freier Quote und erhaltenen Receipts; W-DOC inklusive Quellenretention/Recoveryanleitung.

### 3. PCR-OBS-002 — bestätigte Historie und Quoten

**Ursprünglich:** Endliche Stores ohne sicheren Freigabeweg blockieren spätere Runs; blindes Löschen verletzt Replay und Idempotenz.

**Heute / Code:** [durable-records.ts](../../../skills/common/plugin-runtime/foundation/observability/durable-records.ts) besitzt Retirement, Tombstones und Writerlock. Telemetrie-, Admission-, Attemptresult-, Dispatch- und Operatorprojektionen wurden in begrenzten Paketen kompaktierbar gemacht. [durable-blobs.ts](../../../skills/common/plugin-runtime/foundation/observability/durable-blobs.ts) bietet dagegen `put/get` und Gesamtquote, keinen allgemeinen referenzgeprüften Freigabepfad.

**Nachweise / Rest:** Register verweist auf echte kleine Quoten-/Replay-/SIGKILL-Teilläufe; diese sind historische Slices, keine R1–R4-Abdeckung aller Ressourcenklassen. Vollständiger Consumer-/Referenzcheckpoint und Crash-/Writer-/Spätzustellmatrix fehlen für die verbleibenden Klassen. `observability-retention.md` benennt diese Grenzen.

**Empfehlung:** Inventar vervollständigen und nur verbleibende Klassen bearbeiten. Große Referenzkomplexität; vorhandene Compaction wiederverwenden. Kein automatisches Log-TTL, keine neue zentrale Logsammlung. Geschützte Logs und Entscheidungen bleiben gemäß D01/D07 erhalten.

**Abnahme:** R1–R4, expliziter manueller Plan-/Ausführungspfad, tatsächliche Bytes/Slots, unbekannte Referenzen blockieren, Replay führt keine externe Aktion erneut aus. R-DOC: Storeinventar, manuelle Freigabe und Backpressurediagnose.

### 4. IFR-21-001 — reproduzierbare Runtimeimages

**Ursprünglich:** Zeitabhängige apt-/Python-/Go-/Browserinputs und vom selben Upstream bezogene Checksums verhindern belastbare Rebuildaussagen.

**Heute / Code:** Python-/Go-Locks und Snapshots vorhanden. `Dockerfile.buster-runtime` und `Dockerfile.prism-worker` benutzen jetzt `browser-archive-lock.mjs`; Buster benutzt `trivy-database-lock.mjs` für beide Datenbanken. Die September-Aussage ungebundener Browser-/DB-Downloads ist als aktuelle Beschreibung überholt. Die neuen Lockpfade sind im Tree integriert, keine bloßen Entwürfe.

**Nachweise / Rest:** Neuer Toollocktest bestanden; historische Pythoninstallationen/Go-Builds und Browser-/DB-Pakete sind Teilnachweise. Zwei vollständige isolierte Builds je beanspruchtem Image/Architektur, SBOM-/Datei-/Digestvergleich und Tools/Browser im fertigen Output fehlen als Gesamtnachweis. Opsimages gehören zum Originalumfang. Native VM-/Hosttests ersetzen Imagebuilds nicht. Alte Scan-DBs sind inzwischen außerhalb der Fristen; Lockidentität und Sicherheitsaktualität sind verschiedene Anforderungen.

**Empfehlung:** Schwerpunkt von weiterer pauschaler Lockimplementierung auf Inventarlücken und echte Builds verschieben. Groß wegen Buildzeit und Artefakten; Architekturumfang vorab entscheiden. Historische ARM64-Lücken nicht als Pass behandeln.

**Abnahme:** I1–I3 plus I-DOC; zwei Builds mit gleichen gebundenen Inputs, jede Differenz erklärt; keine Bitidentitätsbehauptung bei unterschiedlichen Digests. Vollständige fertige Images funktional prüfen. Lock-/Update-/Rebuildanleitung prüfen; Sicherheits-DB-Updates erhalten neue Identitäten.

### 5. IFR-29-001 — portable Beispiele und Betreiberprofile

**Ursprünglich:** Betreiberidentitäten in Git-/Values-/Ops-Dateien werden als generische öffentliche Beispiele übernommen; Dockerignore verhindert keine Gitveröffentlichung.

**Heute / Quellen:** `my-values/nova-values.yaml`, `gitops/production/config.json` und AX41-Hostprofile enthalten weiterhin konkrete Betriebsannahmen. Zentrale Teilschnitte ändern das nicht global. Kein Secretfund wird aus diesen Identitäten abgeleitet; aktuelle Arbeit ist keine vollständige Secret-/Historyprüfung.

**Nachweise / Lücken:** Kein vollständiges P1-Klasseninventar oder neuer frischer Fremdprofil-Render mit vollständiger Tree-/History-/Buildkontextbewertung nachgewiesen. GitOps exportiert gewählte Betreiberwerte bewusst und anonymisiert sie nicht. Historische „vor Veröffentlichung“-Sprache ist kein verlässlicher aktueller Veröffentlichungsstatus; Remotezustand wurde hier nicht abgefragt.

**Empfehlung:** Mit CONFIG bündeln. Bewusst öffentliche Profile dürfen bleiben; Defaults, Beispiele und private Referenzen klar trennen. Mittlerer Aufwand, zusätzliche doppelte Wertepflege vermeiden. Vorher entscheiden, welche Profile absichtlich öffentlich und unterstützt sind.

**Abnahme:** P1–P3/P-DOC; frisches fiktives Profil über normalen Renderpfad ohne unbeabsichtigte Betreiberwerte, redigiertes Protokoll der History-/Artefaktprüfung. Keine unbelegte „secretfrei“-Aussage. Beispiel-/Konfigurations-/Veröffentlichungsdoku prüfen.

### 6. IFR-04-001 — Tailscale

**Ursprünglich:** Ingressverfügbarkeit und eng begrenzter Zugang werden ohne externen Grant-/ACL-/TagOwnervertrag angenommen.

**Heute / Nachweise:** `tailscale-access-matrix-20260921.md` dokumentiert fünf lokale Helm-/Manifestfälle, erste Fehlläufe und spätere unabhängige 5/5-Prüfung. Guide erfasst Argo/Nova/Prism/dynamische Previews sowie den getrennten Ops-Ausgangspfad. Die September-Beschreibung „nur allgemeine Hinweise“ ist überholt.

**Lücken / Unsicherheit:** Aktueller redigierter externer Regelstand und echte erlaubte/verbotene Clients fehlen. Lokaler Render und spätere Runtime-Tailscalefälle beweisen weder echte Grants noch Rotation im Tailnet. Kein aktueller ACL-Defekt ist damit bestätigt.

**Empfehlung:** Vorbereitungsumfang erhalten, fehlende T1/T2-Daten anfordern; Liveprüfung separat zurückstellen. Code erst nach belegter Abweichung ändern. Kleiner lokaler Aufwand, externe Abhängigkeiten bestimmen Liveaufwand.

**Abnahme:** T1/T2/T-DOC für lokalen Umfang; externe Fälle vor/nach Proxyneustart und OAuth-/Zertifikatrotation separat. Tailscaleguide und Preview-/Opsanleitungen prüfen. Keine erfundenen Clientidentitäten.

### 7. IFR-10-001 — BuildKit-Isolation

**Ursprünglich:** Fremde Dockerfile-RUN-Arbeit teilt mit langlebigem Daemon einen unzureichend isolierten Prozessraum. Erfolgreicher Secretzugriff wurde nicht behauptet.

**Heute / Code:** `docker/buster-runtime-entrypoint.sh` startet weiterhin rootless BuildKit mit `--net=host` und `--oci-worker-no-process-sandbox`. Registry-Credential-/Configänderungen entfernen diese Prozessgrenze nicht. Kein integrierter Fix oder echter K1–K3-Nachweis vorgefunden.

**Empfehlung / Aufwand:** Hohe Priorität, unverändert beheben. Große Architektur-/Betriebsauswirkung. Vor Implementierung eigene kurzlebige Buildgrenze, Hostmodell, private/gemeinsame Caches und Egressvertrag entscheiden. Nur das Flag zu entfernen reicht nicht und kann funktionale Builds brechen.

**Abnahme:** K1–K3/K-DOC auf passender Linux-Runtime: reale unerlaubte Prozesssicht, Signale/ptrace, Cross-Job-Dateien/Credentials und Egress scheitern; regulärer Build/Push/Scan/Pull funktioniert; Timeout/Cancel/Restart lassen keine unzugeordnete Arbeit. BuildKit-/Runtime-/Cache-/Netzdoku prüfen. Live getrennt.

### 8. IFR-01-001 — Bootstrap

**Ursprünglich:** `setup` setzt bestehende Kubernetes-API voraus, wird aber als vollständiger Hostbootstrap missverstanden.

**Heute / Code/Doku:** `scripts/deploy.sh` bleibt Installer auf bestehendem Cluster. `scripts/install/` und `ax41-rollout.md` enthalten konkrete Hoststufen, Bundle-/Reservierungs-/Runtimevorbereitung. Das Runbook nennt den vollständigen idempotenten Installer weiterhin ausstehend. „Überhaupt keine Hostvorbereitung“ wäre falsch.

**Lücken:** Vollständige Fresh-install-/Rerun-/Unterbrechungs-/Nodeaufnahme-/Hostverlustkette aus einem dokumentierten Ausgangszustand fehlt. Historische Reparaturskripte sind kein gefahrlos wiederholbarer Installer. Echte H3-Hostnachweise nicht durch Render ersetzt.

**Empfehlung:** Mit Recovery/Management bündeln. Vorher unterstützte Host-/Clusterumgebung und Zielumfang entscheiden: geführter reproduzierbarer Ablauf oder umfassender Installer; eine Vereinfachung gegenüber H1–H3 ausdrücklich beschließen. Großer Aufwand, vorhandene Stufen verwenden.

**Abnahme:** H1–H3/H-DOC entsprechend beschlossenem Umfang, klare Rollback-/APIfehlergrenzen; keine fremden Workload-/PVCänderungen bei Nodeaufnahme. AX41-Runbook und Installationskatalog prüfen; vorhandenen Cluster und neue Clustererzeugung getrennt ausweisen.

### 9. IFR-02-001 — Cilium

**Ursprünglich:** Globaler CNI-Cutover ohne gesicherte aktuelle Namespace-/Workloadinventur und unabhängigen Rollback birgt Betriebsrisiken.

**Heute / Code/Doku:** `scripts/deploy-cilium.sh` besitzt Guards, `docs/ops/cilium-networking.md` existiert und beschreibt single-node/same-CIDR-Verfahren, Quieszenz, Offlineartefakte und Rollback. Der September-Befund eines fehlenden Runbooklinks ist behoben. Das Runbook sagt ausdrücklich Vorbereitung, keine abgeschlossene Migration.

**Lücken:** Konkrete aktuelle Host-/Pod-/DaemonSet-/Applikationsinventur, unabhängiger Zugang und echte CNI-/Anwendungs-/Rollbackabnahme fehlen. Alte Paperlessannahmen nicht ungeprüft auf heutigen Bestand übertragen. Vorhandene Guardtests sind begrenzte Vorbereitung.

**Empfehlung:** Migration zurückstellen gemäß Roadmap; Vorbereitung erhalten. Kein neuer sofortiger CNI-Umbau. Nutzen erst im geplanten Wartungsfenster, hohe Unterbrechungs-/Recoverykomplexität.

**Abnahme:** C1/C2/C-DOC lokal; echte Endpoints, alle bestehenden Anwendungen, erlaubte/verbotene Verbindungen, Policycleanup und Rollback separat im genehmigten Wartungsfenster. Runbook und aktuelle Anwendungsinventur prüfen.

### 10. IFR-05-001 — GitOps/Argo

**Ursprünglich:** Nur Argo installiert; Applications/Projects, Ownership, Drift/Prune und Health-/Releaseverfahren fehlen.

**Heute / Code:** `scripts/gitops.mjs`, Release-/Bundleprüfung, GitOpscharts und Health-Lua sind vorhanden. Ein vorhandener Export nutzt den normalen Renderer statt eines zweiten Values-/Imageresolvers. Originaler Featuredefekt ist lokal bearbeitet und integriert.

**Tests/Review:** `pr6-gitops-closure.md` verweist auf 27 historische lokale Tests mit echten Git-/Helm-/Luaaktionen. `pr6-gitops/local-tests.txt` zeigt 19 Fälle, die übrigen liegen in getrennten Bootstrap-/Backup-Logs; nicht als 27 neu ausgeführte Fälle ausgeben. Clusterantworten und DB-Kommandos sind dort Fixtures. Kein aktueller Argo-Controller-/Live-Nachweis; spätere CONFIG-/Chartänderungen benötigen passende Regressionen, die alte Abnahme bindet nicht automatisch den heutigen Tree.

**Vorhandener Betriebsbeleg:** Die datierte `readonly-operations-inventory-20260921.md` beobachtete `kubeclaw` OutOfSync/Degraded und Prism Synced/Degraded an einer anderen Revision (`6f6fe343…`). Das ist ein historischer realer Status, keine Ursachenanalyse oder heutige Beobachtung; er bestätigt weder die Funktionsfähigkeit noch einen Defekt dieses uncommitteten Implementierungsstands. Die lokale Findingentscheidung wird daraus nicht automatisch geändert.

**Empfehlung:** Ohne neuen Featureumfang geschlossen belassen, lokale Änderungsregression in freigegebene CONFIG-/Releasearbeit integrieren. Geringe Zusatzkomplexität gegenüber erneuter GitOpsimplementierung. Kein neuer bestätigter Featuredefekt in dieser Prüfung.

**Abnahme bei erneuter Bearbeitung:** Originale Release-/Ownership-/Health-/PVC-Regressionen am gebundenen Tree, J-DOC. Erstsync, Drift, Git-/Registryausfall, Migration und PVC-erhaltender Rollback als separate Live-Gates. GitOps-/Releaseanleitungen prüfen.

### 11. IFR-06-001 — SPIRE

**Ursprünglich:** Effektive CA-/Server-/TTL-/Peerkonfiguration und Recoverygrenzen unzureichend dokumentiert; kein Live-Restore-/Ablaufnachweis.

**Heute / Belege:** `spire-effective-20260921/` enthält gepinntes Chartrender, effektive Konfiguration und Hashes. `spire-recovery.md` beschreibt zusammenhängenden Cold-Backup-/Restorevertrag und unterscheidet Handshakes von bestehenden Verbindungen. `spire-current-audit-20260921/result.json` dokumentiert unabhängigen bytegleichen Render und ausdrücklich `liveExecuted:false`.

**Neue Nachweisgrenze:** Aktuell stimmen sieben der acht dort gespeicherten Identitäten; `charts/prism/templates/configmap-worker-trust.yaml` ist geändert. Der aktuelle Diff stellt lokale Control-/Worker-Upstreamports auf zentrale Konfiguration um. Das ist kein belegter Trustdefekt, aber der alte Peer-Templatebeleg darf nicht unverändert als aktueller vollständiger Rendernachweis gelten. S1/S2-Runbookumfang ist vorhanden; tatsächlicher Server-/CA-Restore, Rotation und Ablauf unter aktiver Arbeit bleiben Live-Gates.

**Empfehlung:** Lokalen Abschluss grundsätzlich belassen; vor einer aktuellen erneuten Bestätigung den geänderten Peer-/Port-/Trust-Render nachweisen. Kein pauschaler Trustumbau, kleiner bis mittlerer Nachweisaufwand. Ergebnisse der CONFIG-Portmigration sind getrennt zuzuordnen.

**Abnahme:** S1/S2/S-DOC einschließlich aktualisierter Quellbindung und Renderprüfung; keine garantierte Widerrufs-/Ausfalldauer ohne Mechanismus. SVID-Erneuerung, falsche Identität, Server/Agent über Ablauf und kohärenter Restore separat live. Recovery-/Trustanleitung prüfen.

### 12. IFR-16-001 — kombinierte Kapazität und Storage

**Ursprünglich:** Gemeinsamer Node und PVC-/Cache-/Backupwachstum ohne zusammenhängendes physisches Diskbudget und Gesamtlastnachweis.

**Heute / Code:** `native-worker-node-capacity.mjs`, Hostpool-/Reservierungs-/Admissionmechanik und AX41-Planung vorhanden. CPU/RAM/Tasks und native Rollen wurden konkret bearbeitet. Das löst Disk-/Inodebudget und gemeinsame Build-/Browser-/Backup-/Restorelast nicht. Ein 100Gi-PVC ist keine zusätzliche physische Disk.

**Lücken:** D1 integrierte Produktionsbindung beider Rollen samt schedulerwirksamer Reservierung weiter zu prüfen; D2 reale Kapazität/Inodes/Wachstum/Nebenanwendungen; D3 echte kombinierte Last und Backpressure. Host-Teilläufe ersetzen keine fehlenden Gast-/Kernel-/Podadmissionfälle.

**Empfehlung:** Schwerpunkt auf Storage und vollständige integrierte Reservierungsprüfung; vorhandene CPU/RAM-Bausteine nicht neu bauen. Große Mess-/Umgebungsabhängigkeit. Vorher reale Hostdaten und Latenz-/Reserveziele erheben.

**Abnahme:** D1–D3/D-DOC; konkurrierende native-/Podadmission darf Kapazität nicht doppelt vergeben; isolierte Disk-/Inodeerschöpfung schützt fremde Daten und meldet Backpressure; Cleanup gibt Platz frei. Hostpool-/Kapazitäts-/Storageanleitung prüfen.

### 13. IFR-26-001 — anwendungskonsistente Recovery

**Ursprünglich:** DB-Dump allein stellt referenzierte Artefakte und erforderlichen Anwendungszustand nicht wieder her.

**Heute / Code:** `charts/prism/templates/backup.yaml` mountet Artefakte; `prism-backup.sh` bildet DB-/Objektgruppen, prüft Hashes, begrenzt Kapazität und publiziert Gruppen nach Validierung. Manuelle Retirement-/Incompletepfade vorhanden. „Nur DB-Dump“ ist überholt.

**Tests/Review/Lücken:** `prism-backup.test.mts` führt echte Dateisystem-/Prozess-/Helmaktionen aus, ersetzt aber `pg_dump`/`pg_restore` durch ausdrücklich markierte Fixtures. Kein vollständiger echter PostgreSQL-/Referenz-/Session-/Jobrestore, keine umfassende Schlüssel-/Journalbindung und kein bestätigtes externes Backupziel. `database-proof` bzw. `pg_restore --list` sind keine komplette Anwendungswiederherstellung.

**Empfehlung:** Unverändert vollständig beheben; mit Bootstrap/Management planen. Hoher Nutzen bei Datenverlust, großer Integrations-/Betriebsaufwand. Externes Ausfallgebiet, RPO/RTO und geschützte Sicherungsgruppen vorab entscheiden; keine neuen Dienste/Käufe aus dem Auftrag ableiten.

**Abnahme:** Q1–Q4/Q-DOC, echte DB und Objektstorage in neuer Umgebung ohne Originalvolumes; vollständiges unabhängig abgeleitetes Referenzinventar, abgeschlossene/wartende/laufende/extern ungewisse Arbeit, falsche Schlüssel/fehlende Objekte erkannt. Backup-/Recovery-/Retentionanleitung prüfen; Live extern separat.

### 14. IFR-28-001 — unabhängiger Managementweg

**Ursprünglich:** Ops-Pod bleibt von Cluster, CNI, Runtime und Storage abhängig und kann deren Ausfall nicht als unabhängiger Zugang lösen.

**Heute / Doku:** `docs/ops/ops-pod.md` nennt die Abhängigkeit ausdrücklich und verweist auf vorhandenen Management-/KVM-Pfad. Der ursprüngliche Dokumentationsirrtum ist eingegrenzt. Kein tatsächlicher unabhängiger Zugangstest vorgefunden; keine Aussage zur heutigen externen Nutzbarkeit möglich.

**Empfehlung:** Mit Bootstrap/Recovery bündeln, keine zusätzliche Podimplementierung aus dem fehlenden Betriebsnachweis ableiten. Geringe lokale, extern bestimmte Nachweisarbeit. Verfügbare Zugangsmittel und deren Ausfallabhängigkeiten vorab klären.

**Abnahme:** O1/O2/O-DOC; konkrete unabhängige Zugangsvoraussetzungen und schrittweiser Wiederherstellungsweg lokal dokumentiert, Anleitung außerhalb des Clusters verfügbar; Argo/Tailscale/CNI-Ausfall und realer Hostzugang separat live. Ops-/Host-/Recoveryanleitung prüfen, Zugangsdaten extern halten.

### 15. REGISTER — Befundregister

**Ursprünglich:** JSON/Markdown/Fortschrittsdarstellungen widersprechen sich bei IDs, Status und Zählern.

**Heute / Code/Nachweise:** `remediation-register.mjs` generiert Registeransicht und markierte aktuelle Statusabsätze aus JSON; prüft historische Originalobjekte, Belegexistenz, 154 historische IDs und fünf zusätzliche Integrationsbefunde. Neuer `--check` und 26 neue ausgeführte Mechanik-/Negativfälle bestanden. Auch ein frischer Subagent wiederholte die 26 Fälle. Alte unabhängige Hashliste enthält inzwischen sechs geänderte von elf Quellen; sie ist historisch. Die neue Prüfung beurteilt die aktuelle Mechanik.

**Grenze:** Belegexistenz und richtige Summen prüfen keine fachliche Qualität, reale Wirkung oder Regression der 142 Findingabschlüsse. Die ursprünglichen 14 wurden hier einzeln neu beurteilt; die übrigen 140 historischen IDs sind nur strukturell geprüft. „142/154“ ist Registerstatus, kein neuer umfassender Testlauf.

**Empfehlung:** Ohne weitere Mechanikänderung schließen vorschlagen. Register nicht mit neuen Abschlussautomatismen überfrachten; fachliche Entscheidungen bleiben separat belegt.

**Abnahme:** G1–G3/G-DOC, aktuelle Konsistenz, erhaltene Original-/Integrations-IDs, idempotente Generierung und wirksame Negativfälle; Prüfung darf Status nicht still hochstufen. Registerverfahren und aktuelle Statusseiten prüfen; für neue Dokumente nur neue Links, keine historischen Umschreibungen.

### 16. CONFIG — einzige Autorität je Einstellung

**Ursprünglich / Ziel:** Konfigurierbare Werte haben mehrere Autoren oder harte Fallbacks; D17 fordert eine zentrale Komponentendatei je Plugin/Core/Engine mit genau einer Autorität je Setting, strikter Validierung und ohne stille Ersatzwerte. Softwareversionen und Secretwerte bleiben eigene Autoritäten.

**Heute / Code:** Produktionsloader und zahlreiche Prism-/Buster-/Pluginmigrationen existieren. Komponenten-/Profil-Dateien unter `charts/kubeclaw/files/config/` sind real, nicht nur Testsupport. `config-inventory-20260920.md` dokumentiert 27 unabhängig geprüfte Prism-Settings und weitere Slices; diese Zahl ist keine Gesamtinventur. Konkrete Restautoren: `worker-config.ts` ergänzt `PRISM_CONTROL_INTERNAL_URL` mit `http://prism-control:8080`; `native-worker.ts` ergänzt den Browserpfad mit `/ms-playwright`. Die Klassifizierung Installationspfad/Topologie/Operatorsetting und die eindeutige Autorität sind noch zu schließen, kein mechanisches Entfernen jedes `??`. Secret-/Protokollinvarianten sind nicht beliebige Operatorsettings.

**Integrierte Teilnachweise:** Die Originaldateien in `buster-cluster-runtime-20260924/security-runtime2/results.json` enthalten 16 erwartete erfolgreiche Befehle und einen fehlgeschlagenen Security-Cutoverbefehl. CI2 service2 enthält den 20-Fall-Serviceblock; Kontrollen haben eigene Generationen. Neun RuntimeSecurity-Gegenproben sind nicht insgesamt angenommen: der neunte historische Fehler hatte Nebenausfälle, Korrektur und neue Baseline sind vorhanden, Wiederholung fehlt. Drei Lifecyclefälle sind historisch bestanden; zwei Cleanupkontrollen fehlen. Gleichzeitige Body-/Stopfehler sind durch die angepasste Oracle nicht bewiesen. Manifestallokation vor Timer und Produktionseigentum an schließenden Kindern bleiben explizite Grenzen.

**Exakte Integrationsgrenze:** Das letzte kumulative Manifest umfasst 84 Dateien. Aktuell weichen darin fünf Inhalte ab: drei Architektur-/Referenzdokumente, der RuntimeSecurity-Schnittbericht und die Security-Quelltestdatei. Die Quelltestdatei stimmt mit der späteren Oracleintegration überein; die drei Architekturdokumente mit DOC-V2. Der RuntimeSecurity-Schnittbericht enthält zusätzliche Übergabeänderungen. DOC-V2 führte darüber hinaus den Cluster-Schnittbericht, der separat zu prüfen ist. Das alte Manifest ist kein aktueller Pass. Kein neues akzeptiertes kumulatives Manifest in dieser Aufnahme erzeugt.

**Private Entwürfe:** `buster-security-scan-policy-20260924` enthält 25 Kandidaten unter `private-v1/files`, ursprüngliches 13-Feldermanifest und spätere 14-Felderentscheidung. Dies ist keine integrierte, getestete Scanner-Policy. Gemeinsamer Registrydeskriptor, explizite vollständige/relative Grants, Scan-only ohne BuildKitpflicht, kein anonymer oder Docker-Credentialfallback sind Designvorgaben; aktuelle Originalconsumer und Test-/DOCänderungen müssen noch abgeglichen werden. Der ENGINE004-Entwurf ist ebenfalls separat und nicht angenommen.

**Rest / Nutzen / Aufwand:** Vollständige F1-Klassifizierung für Adapter/Observer, Testprovider, Stages/JUnit, Foundation/Common, Novalint/native Konstanten und gesamte D17-Migration fehlt. Zentrale Slices verhindern nicht globale konkurrierende Autoren. Sehr großer Querschnitt; sinnvoll wegen klarer Bedienung und vor Aktivierung erkennbarer Fehler. Kleine Komponentenpakete erlauben Fortschritt ohne pauschale Gesamtabnahme.

**Empfehlung:** Gesamtziel unverändert erhalten, Paketumfang/Reihenfolge gemeinsam entscheiden. Zuerst Istinventar und Nachweisbindung, dann vorhandenes RuntimeSecurity-Paket verifizieren, Scanner-/Restmigration getrennt. Vorher optionale Routenpflichten, Registrygrants und Grenzen der Prozess-/Speicherverantwortung klären. Ein neuer Runner, neue Datenbankdownloads oder Integration der privaten Kandidaten gehören zur späteren Freigabe, wurden jetzt nicht vorgenommen.

**Abnahme:** F1–F6 und D17-F2a/F3a/F4a/F5a/F-DOCa: genau ein Autor je Setting, vollständige echte Consumerprofile, fehlende/ungültige Werte und alte Autoren abgewiesen, Mutation erkennt wieder eingeführte Fallbacks; entfernte Altpfade und dokumentierte Einheiten/Herkunft. Komponenten-/Operator-/Pluginreferenzen prüfen. Grenzen der Teilpakete und Live-Git/Argoänderung getrennt belegen.

## Noch zu entscheidende Fragen und vorgeschlagene Reihenfolge

1. **Erster Umfang:** nur Nachweislücken vorhandener Pakete schließen, oder zugleich akute Quelllöschsicherheit und Ressourcen-/BuildKitarchitektur vorbereiten? Empfehlung: Nachweisbindung und akute ENGINE004-Löschsicherheit zuerst; kein Gesamt-W-Abschluss daraus.
2. **Runtime/Isolation:** Welche unterstützte Host-/Kernel-/Containerumgebung und Architekturen sind verbindlich? ENGINE001/BuildKit brauchen echte geeignete Runtime, keine weiteren behaupteten Gast-Pässe aus Hosttests.
3. **Retention/Registry:** Welche terminalen Quellen dürfen wann freigegeben werden, welche Daten bleiben D07-geschützt, welche Registrypräfixe sollen freigegeben sein? Vor Umsetzung jeweiliges Klasseninventar und Grants bestätigen.
4. **Recovery:** Unterstützte Ausgangsumgebung, externes Backupziel, unabhängiger Zugang und RPO/RTO festlegen; lokaler geführter Ablauf oder kompletter Installer ausdrücklich wählen.
5. **CONFIG/Portabilität:** Öffentlich unterstützte Profile und Paketgrenzen bestätigen; Komponentenstruktur nach D17, keine zweite manuelle Autorenquelle. Keine automatische Abnahme privater Scannerkandidaten.

Vorgeschlagene Abhängigkeiten: **A** aktuelle Quellen-/Belegbindung und gezielte GitOps-/SPIRE-/CONFIG-Regression; **B** akute ENGINE004-Löschsicherheit und Ressourcen-/BuildKitdesign; **C** ENGINE001 native Gesamtverdrahtung, danach vollständige ENGINE004-Recovery; **D** Restretention + Storage; **E** Bootstrap/Backup/Management zusammen; **F** weitere CONFIG-/portable Profile je Komponente entlang dieser Arbeit, echte Imagebuilds nach gebundenen Inputs; **G** Tailscale-/andere Live-Gates separat durch den Auftraggeber, Cilium im späteren Wartungsschritt.

Diese Reihenfolge ist **vorgeschlagen, nicht beschlossen**. Sicherheit und Recovery sind beide dringlich; verfügbare geeignete Testumgebung und Betreiberziele können ihre Reihenfolge ändern. Kein stilles Aufweichen bestehender Kriterien.

## Dauerhaftes Entscheidungsprotokoll

| Datum | Gegenstand | Entscheidung | Begründung | Abnahmekriterien | Reihenfolge / Freigabe |
|---|---|---|---|---|---|
| 2026-10-12 | Arbeitsmodus laut neuem Auftrag | Bestandsaufnahme, frische unabhängige Gegenprüfung und gemeinsame Entscheidung; keine weitere Implementierung | Historische Übergabe ist keine aktuelle Gesamtabnahme | Alle 14 Punkte + REGISTER/CONFIG, konkrete Quellen, offene Nachweise, DOC je Punkt | Nur Lesen, nicht destruktive Prüfungen und Aufnahmedokumentation erlaubt |
| ausstehend | Einzelpakete 1–16 | Noch keine Entscheidung des Auftraggebers | Empfehlungen oben sind Vorschläge | Je Paket ausdrücklich zu bestätigen oder begründet anzupassen | Keine Implementierungsfreigabe |

Nach der Antwort des Auftraggebers wird hier je Punkt die tatsächliche Entscheidung, Begründung, genaue Abnahme und Reihenfolge ergänzt. REGISTER wird bis dahin nicht umklassifiziert.

## Unabhängige Gegenprüfung

Frischer, nicht implementierender Subagent `independent_inventory` hat Originaltexte, Produktionscode und Rohbelege sowie die korrigierte Vorlage und Auditanlage geprüft. Der [vollständige unabhängige Bericht](independent-assessment-20261012.md) enthält eigene 26/26-Registerfälle, den erneuten Vergleich aller 79 aktuellen Quellenidentitäten und die methodischen Grenzen. Nach Korrektur der O-Kriterien und Erstellung der Auditanlage fand er keine weiteren konkreten Korrekturen. Seine Prüfung bestätigt die Quellentreue dieser Bestandsaufnahme; sie ist keine nachträgliche Implementierungs- oder Live-Abnahme. Dieser abschließende Verweis wurde nach seinem Review ergänzt.
