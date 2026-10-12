# Beschlossener Arbeitsplan — 12. Oktober 2026

Grundlagen: [D17–D19](decisions.md), [Bestandsaufnahme aller 16 Bereiche](assessment-20261012.md), [detailliertes Ausführungsrefactoring](worker-execution-simplification-20261012.md), ursprüngliche [Abnahmebedingungen](acceptance-20260920.md). Die Zielarchitektur und Reihenfolge sind vom Auftraggeber bestätigt. **Der aktuelle Auftrag ist Dokumentation, noch keine Codeimplementierung.** Findingstatus und bestehende Arbeitsbaumänderungen bleiben erhalten.

## Verbindliche Reihenfolge

| Phase | Arbeitspunkt | Warum an dieser Stelle | Übergabe zum nächsten Schritt |
|---|---|---|---|
| 1 | CONFIG-Zentralisierung | Eine Autorität je Setting schaffen, bevor neue Test- und Ausführungspfade weitere Einstellungen einführen | Inventar, tatsächliche Consumer, strikte Profile, entfernte/abgewiesene alte Autoren und geprüfte Doku gemäß D17 |
| 2 | Test-Refactoring | Gemeinsamen Teststandard fertigstellen, bevor die Ausführungsmigration neue Tests erzeugt; spätere Neukategorisierung vermeiden | Freigegebene Vorgaben der anderen Session, migrierte vorhandene Tests, echte ausgeführte Gates und dokumentierter Standard |
| 3 | Cgroup-/Worker-Ausführungsrefactoring | Kubernetes-Jobausführung auf zentraler Konfiguration mit Tests nach dem neuen Standard entwickeln | Geprüfte Prism-/Buster-Ausführung, neue versionierte Verträge, Cutover und tatsächlich entfernte ersetzte Pfade |
| 4 | Zwölf offene historische Findings | Am dann aktuellen Stand prüfen, welche Lücken noch bestehen und welche bereits passende Belege aus Phase 1/3 besitzen | Entscheidung und vollständige Abnahme je Finding, keine Schließung aus Paketstatus allein |

Diese Reihenfolge ersetzt die vor der Entscheidung vorgeschlagene Priorisierung. Sie verlangt nicht, veraltete native Pfade erst vollständig fertigzustellen, um sie anschließend zu entfernen. Fachlich notwendige Schutz-/Recoveryfunktionen bleiben im neuen Modell zu erfüllen.

## 1. CONFIG-Zentralisierung

**Was geändert wird:** Jede konfigurierbare Einstellung bekommt genau eine zentrale Autorenquelle in der zuständigen Plugin-/Core-/Enginekomponente. Gemeinsame Einstellungen gehören einem ausdrücklich benannten gemeinsamen Eigentümer. Loader/Schema/Environment/Entrypoint/Chart dürfen keine konkurrierenden Werte oder stillen Fallbacks liefern. Fehlende oder ungültige Pflichtwerte verhindern Aktivierung. Generierte Lieferdateien bleiben Ableitungen; Softwareversionen und externe Secretwerte behalten eigene klare Zuständigkeiten.

**Warum:** Eine Einstellung soll an einer Stelle geändert werden und nachweisbar den echten Consumer erreichen. Das reduziert Drift, unbemerkte Ersatzdefaults und spätere Migrationsarbeit. Die zentrale Konfiguration ist Voraussetzung für den neuen Teststandard und Jobprofile.

**Bezug zur späteren Migration:** Aktuell verwendete native Settings dürfen während Phase 1 nicht einfach entfernt werden, solange Produktionsconsumer sie benötigen. D17 wird nicht still ausgenommen. Diese Settings werden korrekt zentralisiert/klassifiziert und ausdrücklich als später abzulösend markiert. Neue Features des auslaufenden Hostpoolbackends werden nicht allein für seine spätere Ablösung entwickelt. Neue Jobsettings entstehen beim jeweiligen Phase-3-Schnitt bereits nach D17; keine spekulative zweite Konfigurationsautorität und keine neuen Codefallbacks.

**Test-/Abnahmeregel:** Phase 1 wartet nicht auf Phase 2, um ihre Änderungen zu testen. Bestehende passende Consumer-, Negativ-, Mutation-, Render- und Verhaltenstests bleiben verpflichtend. Ihre spätere Einordnung erfolgt einmal im Test-Refactoring. F1–F6 und D17-Präzisierungen einschließlich F-DOC gelten; Teilpakete dürfen Gesamt-CONFIG nicht als abgeschlossen ausgeben. Bereits vorhandene Produktions- und Reviewnachweise sind an den exakten dann geprüften Stand zu binden.

**Dokumentation:** Settingsinventar, Komponentenzuständigkeiten, Einheiten, Herkunft, Änderungsauswirkungen, Secret-/Versionsgrenzen und Ablehnung alter Quellen prüfen und aktualisieren. Keine Doku behauptet noch nicht implementierte Jobprofile als heutigen Betriebsstand.

## 2. Test-Refactoring — eigener neuer Arbeitspunkt TEST-REFACTOR

**Vom Auftraggeber festgelegtes Ziel:** Die Tests vor der neuen Workerimplementierung nach dem in einer anderen Session geplanten Standard ordnen und refaktorieren. Spätere Änderungen sollen neue Tests direkt nach diesen Vorgaben erstellen; vorhandene Tests nicht nach jeder Umsetzung erneut kategorisieren.

**Noch fehlende Grundlage:** Das konkrete freigegebene Dokument/Ergebnis dieser Session ist hier noch nicht benannt. Es muss vor Umsetzung übernommen und mit Quellenstand verbunden werden. Dieser Plan legt keine eigenen Kategorien, Verzeichnisse, Frameworkwechsel oder neuen Testbefehle fest. Referenz, endgültiger Umfang und Abnahmekriterien werden ergänzt, sobald die andere Session sie liefert. Das blockiert die heutige Dokumentation und lesende Abstimmung nicht.

**Was erhalten bleibt:** Ursprüngliche Pflichtfälle, echte Wirkung, Fehler-/Positivkontrollen, Quellbindung und historische Rohbelege. Refactoring darf weder Skips als Pass führen noch eine Umbenennung als fachliche Abdeckung behaupten. Kein neues Schema darf unbelegt historische Tests als vollständig wirksam deklarieren. Notwendige neue Fehlerfälle bleiben notwendige neue Arbeit.

**Übergabe für Phase 3/4:** Ein konkret versionierter Teststandard mit gültigen Beispielen, tatsächlich ausführbaren Befehlen, Zuständigkeiten und Regel zur Einordnung neuer Tests. Falls die andere Session neue Pflichtfälle oder Umfangsänderungen vorschlägt, werden sie ausdrücklich entschieden. Aktuelle CONFIG-Tests werden als Teil der Migration in diesen Standard aufgenommen.

**Dokumentation:** Freigegebener Teststandard, Entwickleranleitung, CI-/Runner-Verwendung und Migrationsübersicht. Eine bloße Verschiebung von Dateien ersetzt keine erneute passende Ausführung am integrierten Stand. Abschließende unabhängige Prüfung des Refactorings.

## 3. Cgroup-Refactoring — eigener neuer Arbeitspunkt WORKER-EXECUTION

**Bestätigter Zielwechsel:** Normale Kubernetes-Jobs statt eigener nativer Buster-/Prism-Hostpools. Prism: ein Auftrag/Attempt je Job. Buster: zunächst ein vollständiger Testplan samt lokalen Fixtures je Job. Linux/Runtime verwenden weiterhin Cgroups; wir reduzieren unsere eigene Sonderverwaltung.

### Konkrete Änderungen und ihre Gründe

| Bereich | Änderung | Warum / notwendige Grenze |
|---|---|---|
| Ausführung | Gemeinsamer generischer Jobadapter; konkrete Engine bleibt in Prism/Buster | Scheduling und Containerlebenszyklus der vorhandenen Plattform nutzen; keine neue fachliche Schedulerimplementierung |
| Hostpools/NRI | Nach geprüftem Cutover native Rollenpool-Setup, ausschließlich dafür nötige NRI-Anpassung und Host-Cgroupmounts entfernen | Weniger Hostinstallation, Runtime-Sonderintegration und doppelte Kapazitätsverwaltung |
| Nodebindung | Ausführung über Kubernetesrequests und geeignete Nodeprofile schedulen, keine feste native Einzel-Nodebindung als allgemeine Voraussetzung | Mehrere vorbereitete Nodes nutzbar; Image-, Trust-, Storage- und PIDkompatibilität vorher echt prüfen |
| Ressourcen | Explizite CPU-/RAM-Budgets je Container, begrenzte Parallelität, gesamter Taskschutz und eigenes Storagebudget | Gesamtkapazität schützen; alle lokalen Helfer/Sidecars erfassen, externe Ressourcen separat ausweisen |
| Journale | Auftrags-/Claim-/Resultzustand von vergänglichen Pods trennen; bestehende Verträge wiederverwenden | Controllerneustart, verlorene Antwort und Doppelstart ohne doppelte externe Wirkung behandeln |
| Buster-Fixtures | Lokale Fixtures während des Plans im selben Ausführungscontainer erhalten; erst nach Consumerende bereinigen | Kein sofortiges neues verteiltes Fixtureprotokoll oder Umhängen laufender Prozesse |
| Credentials | Innere Grenze zwischen Projektprozessen und credentialtragenden Capabilities bewahren bzw. explizit vermitteln | Ein Pod schützt Credentials nicht vor Prozessen im selben Berechtigungsbereich |
| Abbruch/Recovery | Job-/Pod-UIDs, Claims und tatsächlichen Außenstatus abgleichen; ungewisses Arbeitsende blockiert sichere Wiederholung | Kubernetes-APIzustand allein beweist bei Nodepartition kein Prozessende |
| Resultate/Logs | Vor Bereinigung durable Result-/Artefakt-/Logübernahme bestätigen | Podlöschung darf keine Belege oder Wiederaufnahmefähigkeit vernichten; D01/D07 bleiben |
| BuildKit | Separate kurzlebige auftragsgebundene Buildgrenze prüfen, einschließlich funktionsfähiger Prozesssandbox | Shared-Daemonproblem nicht nur verschieben; IFR-10 braucht weiter echte Isolationstests |
| Altpfade | Nach erfolgreicher Migration echte Consumerinventur und Entfernung des ersetzten nativen Backends | Kein dauerhaft automatisch umschaltender Doppelpfad, keine versteckte Rückkehr zur alten Ressourcenmessung |

### Die fünf akzeptierten Vertragsänderungen

1. **CPU:** CPU-Rate plus endliche Laufzeit statt identischem kumulativem CPU-Zeitgrenzwert. Historische CPU-Zeitreceipts behalten ihre Semantik; neue Verträge werden versioniert.
2. **Linux-Tasks:** Einheitlicher, großzügig gemessener Podschutz plus nachgewiesener gemeinsamer Node-/Hostschutz statt beliebiger unterschiedlicher harter Attempttasklimits. PID-Ressourcen sind keine automatisch durch Kubernetes separat eingeplanten Taskreservierungen. Maximale Podanzahl und tatsächliche Podlimits einschließlich Nebenpods/Hostdiensten müssen zusammen passen.
3. **Buster-Budget:** Plan als harte Ausführungs-/Fehlergrenze. Nodefristen, Outputgrenzen und Ergebnisse bleiben; ein fehlerhafter Test kann den ganzen Plancontainer beeinträchtigen. Andere Planjobs haben eigene Grenzen. Separate Peaks werden nicht als beobachteter zeitgleicher gemeinsamer Peak addiert.
4. **Fehlerabrechnung:** Fehlende finale Kernelwerte bei Crash/Nodeverlust ausdrücklich unbekannt, statt fiktiver vollständiger Endabrechnung. Normaler Abschluss erfasst die erforderlichen verfügbaren Messwerte vor Verlust der Beobachtbarkeit.
5. **Fixture-Recovery:** Lebende Arbeit bei Controllerneustart übernehmen; bei Verlust des Planpods lokale Bereitschaft invalidieren und erst nach sicherem Abgleich rekonstruieren oder blockieren. Keine Garantie physischer Fortexistenz nach Podverlust. Externe Kubernetes-Fixtures behalten ihre gesonderten Lease-/Retentionverträge.

Diese Anpassungen sind mit der Bedingung **wesentlich geringerer Komplexität und einfacher Skalierbarkeit** bestätigt. Sie sind keine Befundabnahme und kein Verzicht auf Integrität oder Sicherheit.

### Woran wir die wesentliche Vereinfachung abnehmen

- Die aktive Ausführung braucht keine eigenen hostverwalteten Rollen-Cgroups, kein eigenes native-worker-NRI und keine Host-Cgroupdelegation an Workerpods.
- Worker-Ressourcen sind für Kubernetes sichtbar und schedulbar; keine parallele manuelle native Poolreservation neben dem Scheduler. Allgemeine Standard-Node-/Kubeletreserven bleiben.
- Es gibt einen gemeinsamen schmalen Jobadapter und eine dokumentierte Konfigurationsautorität, keine neue große Operator-/CRD-/Brokerplattform allein zur Ablösung der Hostpools. Erforderliche Credentialvermittlung vorzugsweise auf vorhandenen Grenzen aufbauen.
- Auf einem weiteren geeigneten Node läuft derselbe gebundene Auftrag mit passenden zentralen Profilen ohne projektspezifische Codeänderung oder eigene Rollenpoolinstallation. Ein zweiter real geprüfter Node ist ein Nachweis, kein automatischer Hardwareprovisionierer.
- Auf einem festen Einzelhost erzeugt zusätzliche Last kontrollierte Warteschlange/Backpressure, keine fiktive Kapazität. Volle horizontale Skalierung von Control und Storage ist getrennt von Workerjobs zu bewerten.
- Betriebsablauf und verbleibende Sonderkomponenten sind vor/nach Migration dokumentiert. Wenn lediglich dieselbe Sonderverwaltung hinter neuen Services wiederaufgebaut wird, ist das Vereinfachungsziel nicht erfüllt.

### Umsetzungspakete und Abnahme

Erst nach Phase 2: (a) konkreten Quellen-/Storage-/Claimvertrag festlegen, (b) Prism-Vertikalschnitt echt ausführen, (c) Buster-Planjobs einschließlich innerer Credentialgrenze und Fixtures, (d) Cutover-/Recovery-/Rollbackgrenze prüfen, (e) ersetzte native Pfade entfernen. Ein dauerhafter paralleler Fallback ist kein Ziel. Ein vorübergehender Migrationsstand wird sichtbar als solcher geführt.

Alle acht Abnahmegruppen aus der [detaillierten Architekturvorlage](worker-execution-simplification-20261012.md#migrationsvorschlag-und-abnahme) gelten: reale Ressourcen-/Kindprozessfälle, fertige Tools/Images, Fixtures, Recovery/Doppelstart/Nodepartition, Daten/Quoten, effektive Sicherheitsgrenzen, integrierte Consumer-/CONFIG-/Release-/Trustregression und vollständige Dokumentation mit unabhängiger Prüfung. Tests werden nach dem freigegebenen Phase-2-Standard angelegt. Ausfall-/Host-/Deploymentaktionen bleiben separat zu autorisieren.

**Dokumentation:** D16 als historischer Ausgangspunkt, D18 als neue Autorität; neue versionierte Ressourcen-/Fixtureverträge, Jobbedienung, Abbruch/Recovery, Diagnose, Storage, Credentialgrenzen und entfernte Hostpfade. Alte aktuelle Betriebsanweisungen werden abgelöst; historische Belege bleiben erhalten. Ein bestehender aktiver Hostservice darf nicht vor bestätigtem Drain entfernt werden.

## 4. Zwölf offene Findings — verbleibender Umfang nach Phase 1–3

| Finding | Erwartete Überschneidung | Was dadurch nicht automatisch abgeschlossen ist |
|---|---|---|
| PCR-BUSTER-ENGINE-001 | Jobbudget und vollständige lokale Ausführungsgrenze aus Phase 3 | Neue bestätigte Ressourcenmatrix, echte Wirkung, externe Ressourcen, Fixtures und Doku |
| PCR-BUSTER-ENGINE-004 | Jobworkspace und bestätigtes Arbeitsende | Published Sources, Orphans/ungewisse Arbeit, tatsächliche Quotenfreigabe und historische Replaypfade |
| PCR-OBS-002 | Logs/Resultate und durable Jobzustände | Vollständiges Store-/Referenzinventar, manuelle Freigabe, Replay/Idempotenz und kleine echte Quoten |
| IFR-21-001 | Neue/angepasste Workerimages | Vollständige gebundene Inputs, zwei echte Builds, fertige Browser/Tools und Architekturbelege |
| IFR-29-001 | CONFIG-Autoren-/Profiltrennung aus Phase 1 | Portable Fremdprofile, Git-/Buildkontext-/Artefaktbewertung und explizite öffentliche Betreiberprofile |
| IFR-04-001 | Zugangs-/Jobprofile | Externer Tailnetvertrag, echte erlaubte/verbotene Clients und Rotation |
| IFR-10-001 | Auftragsgebundene BuildKitgrenze aus Phase 3 | Tatsächlich funktionierende Prozess-/Datei-/Cache-/Credential-/Egressisolation |
| IFR-01-001 | Weniger native Hostsonderinstallation | Reproduzierbarer Bootstrap-/Wiederaufbaupfad für die verbleibende Plattform |
| IFR-02-001 | Standard-Node-/Netzprofil | Geplanter Cilium-Cutover, aktuelle Inventur, Anwendungstests und Rollback |
| IFR-16-001 | Kubernetes-Requests und Gesamttaskschutz | Storage/Inodes, Nebenworkloads und echte kombinierte Build-/Browser-/Backup-/Restorelast |
| IFR-26-001 | Durable Result-/Artefaktstruktur | Echte anwendungskonsistente PostgreSQL-/Objekt-/Schlüssel-/Journalwiederherstellung |
| IFR-28-001 | Vereinfachter Recoverybetrieb | Tatsächlich unabhängiger Managementzugang und außerhalb des Clusters verfügbare Anleitung |

Gemeinsame Belege werden referenziert, nicht dieselbe Behebung doppelt implementiert. Vor einem einzelnen Abschluss Originalproblem, dann aktueller Code und vollständige gültige Kriterien prüfen. Die durch D18 geänderten B-/W-/D-Kriterien erhalten ausdrücklich eine neue Zuordnung; die unveränderten Teile bleiben Pflicht. Nicht mehr passende Implementierungsvorgaben werden begründet abgelöst, nicht als erledigte Tests ausgegeben. Jede weitere Zieländerung wird gemeinsam entschieden.

GitOps/SPIRE und REGISTER bleiben außerhalb dieser zwölf historischen offenen Findings. Ihre Regression bei betroffenen Änderungen und ihre getrennten Live-Gates bleiben bestehen. TEST-REFACTOR und WORKER-EXECUTION sind neue Arbeitspunkte, keine zusätzlich erfundenen historischen Finding-IDs. Das maschinenlesbare Befundregister wird durch diesen Plan nicht umklassifiziert.

## Nächste Übergabe und offene Einzelentscheidungen

Die Reihenfolge ist festgelegt. Für Phase 2 fehlt die konkrete freigegebene Test-Refactoring-Spezifikation aus der anderen Session. Vor dem jeweiligen Implementierungsschnitt sind außerdem tatsächliche Runtime-/Storage-/Registry-/Zugriffsprofile zu binden; Angaben werden nicht erfunden. Offene Detailentscheidungen rechtfertigen keine stillschweigende Einschränkung der bestätigten Zielarchitektur oder Sicherheitsgrenzen.

Dieser Plan hält die heutige Entscheidung dauerhaft fest. Ein Startauftrag für Phase 1 oder ein anderes konkretes Paket ist eine separate nächste Handlung; dieser Dokumentationsauftrag integriert keine neue Behebung.
