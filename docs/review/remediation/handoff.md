# Aktuelle Übergabe PR #6

**Aktueller Wiedereinstieg (9. Oktober 2026): [exakter Stand, Restarbeiten und Fortsetzung](resume/HANDOFF-20261009.md).** Ältere Laufmeldungen unten sind historisch; die datierte Übergabe hat für den aktuellen Ausführungsstand Vorrang.

<!-- remediation:current:start -->
**142/154 lokal verifiziert, 12 unvollständig** (2 teilweise implementiert, 4 in Bearbeitung, 6 offen). Zusätzlich 5 separat geführte Integrationsbefunde.

Quelle: [register.json](register.json); je ID: [Register](register.md). D12: Vollständig korrigierter Code mit ausreichender lokaler Testabdeckung gilt für den Behebungsauftrag als lokal verifiziert/abgeschlossen. Ausstehende Live-/Cluster-/GitHub-Actions-Abnahmen bleiben separat und werden vom Auftraggeber nach dem Open-Sourcing durchgeführt. Keine Umdeutung nicht ausgeführter Tests in bestanden; echte Code- oder lokale Nachweislücken bleiben offen.

Pflege und Prüfung: [Registerverfahren](implementation/register-consistency-20260920.md).
<!-- remediation:current:end -->

## Laufende Gesamtbehebung

Der [aktuelle Detailstand](implementation/implementation-20260920.md) trennt
umgesetzte und unabhängig geprüfte Teile von noch offenen Code- und Nachweislücken.
Die [Control-Image-Korrektur](implementation/control-image-environment-20260921.md)
dokumentiert einen nach dem ersten Review gefundenen konkurrierenden Env-Autor
und die nachgebesserte Prüfung. Die anschließende [Control-Listener- und
Routenprüfung](implementation/independent-control-listener-quality-20260921.md)
ist nach Korrektur einer zusätzlich gefundenen Logger-Regression unabhängig
abgenommen: 357 Tests, Typprüfung und Lint; die dokumentierte EPIPE-Grenze bleibt
offen. Der begrenzte CONFIG-Stand umfasst jetzt 24 Einstellungen und 28 historische
Reads. Die Gesamtzahlen oben bleiben unverändert; Teilprüfungen schließen keinen
vollständigen Befund.

Der [dritte isolierte VM-Lauf](implementation/isolated-native-vm-run3-execution-20260921.md)
besteht alle 12 ursprünglichen Kerneltests. Die zuvor fehlgeschlagene
Produktionsverdrahtung wurde korrigiert und unabhängig nachgeprüft. Der Gesamtlauf
bleibt fehlgeschlagen: In der zusätzlichen Node-Pools-Suite bestehen 34 von 39
Tests; ein fehlender systemd-Parser und vier unveränderte Zeitüberschreitungen
bleiben offen. Die vorherigen Fehlversuche sind erhalten. Der Nachweis gilt für
den eingefrorenen Core-Stand, nicht für die anschließenden Journal- und
Buster-Änderungen. Buster-Umstellung und vollständige CONFIG-Abnahme laufen weiter. Die
[Startup-Diagnose](implementation/native-vm-startup-storage-execution-20260921.md)
bestätigt die vier Abbrüche, erreicht vor dem unveränderten äußeren Watchdog aber
keinen vollständigen Speichertypvergleich; die Ursache bleibt offen.

Die [vollständige Modulzuordnung](implementation/native-node-pools-environment-matrix-20260921.md)
ordnet neun unveränderte Node-Pools-Module dem nativen Host und das echte
Root-Deployment-Modul einem separaten Gastlauf zu. Der zweite Hostlauf besteht
62/62 Tests ohne Skips oder Abbrüche; 31.179 Quellen-/Laufzeitidentitäten bleiben
unverändert. Das unabhängige Review hat diesen begrenzten Nachweis angenommen.
Eine zuvor gefundene Lücke der ersten Quellenliste ist dokumentiert und durch
den vollständigen Wiederholungslauf korrigiert. Das zehnte Modul mit dem echten
systemd-Parser bleibt offen; die früheren VM-Fehlläufe bleiben fehlgeschlagen.

Nach Ergänzung der vollständigen Cleanup-Retry-Prüfung umfasst die gepflegte
Zuordnung elf Module. Der [aktuelle gebundene Hostlauf](implementation/native-node-pools-environment-matrix-20260921.md)
besteht alle zehn Hostmodule mit 75/75 Tests, ohne Skips oder Abbrüche und mit
31.183 unveränderten Identitäten. Das [frische Retry-Review](implementation/independent-native-cleanup-retry-resolution-20260921.md)
bestätigt zusätzlich 13 eigene Gegenproben und einen erkannten Schutz-Mutanten.
Ein vorheriger Lauf mit Quellendrift bleibt als solcher erhalten. Reale
Root-/Kernel-Abnahme und Buster-Integration sind dadurch nicht abgeschlossen.

Die [Core-Reconciliation](implementation/independent-native-source-cleanup-reconciliation-20260921.md)
ist begrenzt unabhängig abgenommen: 30 gepflegte Tests, sechs zusätzliche
Prüfungen sowie erkannte Negativkontrollen. Busters tatsächliche Lösch- und
Wiederanlaufberechtigung bleibt offen. Der [erste Helper-Gastlauf](implementation/isolated-buster-helper-vm-execution-20260921.md)
bleibt mit 6/7 bestandenen Fällen fehlgeschlagen; die positive Capability-Prüfung
wurde nach der fehlgeschlagenen ACL-Assertion nicht ausgeführt. Die separate
[Diagnose](implementation/buster-helper-acl-diagnostic-execution-20260921.md)
belegt inzwischen die Ursache: Der bisherige Testaufruf behielt vor `exec`
`CAP_DAC_OVERRIDE`. Ein nachweislich capabilityfreier Aufruf erhält dagegen
`EACCES`; die separate erlaubte Browser-Identität besteht ihre Positivprüfung.
Der ursprüngliche Fehlversuch bleibt erhalten. Der korrigierte vollständige
[Sieben-Fälle-Lauf](implementation/isolated-buster-helper-vm-run2-execution-20260921.md)
besteht alle sieben Fälle ohne Skips oder Abbrüche und ist unabhängig abgenommen. Die spätere Buster-Umstellung auf zwei feste Identitäten ist
in diesem eingefrorenen Helper-Nachweis nicht enthalten.

## Historische Checkpoints (unverändert)

Die folgenden Meldungen sind datierte Zwischenstände. Maßgeblich ist ausschließlich die generierte Übersicht oben.

GitOps IFR-05-001 ist am 2026-09-14 nach D12 lokal abgeschlossen.
27 Tests ohne Skips, Lint, Shellsyntax und Versionsprüfung bestanden.
Implementierung: `0663807443b42e3222d52ff02486f959d7b7acf0`.
[Neue vollständige Übergabe mit Git-Zustand und allen 13 Restfindings](implementation/resume-20260914-gitops-handoff.md).
[GitOps-Abschluss und separate Live-Grenzen](implementation/pr6-gitops-closure.md).

IFR-26-001 zusätzlich in Bearbeitung: Der geplante Prism-Backupjob enthält jetzt
einen gemeinsamen DB-/Artefaktstand mit geprüfter Gruppenveröffentlichung,
Kapazitätsgrenzen und Erhalt alter Backups. Separate Integritätsprüfung sowie
eigene temporäre Datenbank für den bestehenden SQL-Restorecheck. Sieben lokale
Dateisystem-/Prozess-/Helmtests bestanden; SQL-Kommandos sind explizite Fixtures.
Kein zusätzlicher historischer Findingabschluss. Original-DB-/Imageprüfung,
Schlüssel/Journals, externes Backupziel und volle Recovery bleiben offen.
[Backup-Checkpoint und Grenzen](implementation/pr6-prism-backup-groups.md).

IFR-24-001 zusätzlich lokal abgeschlossen: echte PostgreSQL17→18- und
Qdrant1.18.2→1.19.1-Migration, Erhalt der Altdaten, frische Ziel-Releases/PVCs,
Recovery-/TLS-/Netzwerkbindung und zehn Helm-/Manifestgates.
[Abschluss, Rohbelege und Live-Grenzen](implementation/pr6-stateful-migration-closure.md).
IFR-21-001 jetzt in Bearbeitung: Python-/Go-/Download-/apt-Inputs gebunden und
real geprüft; Browser/DB-Inputs und vollständige Imagevergleiche bleiben offen.
[Image-Checkpoint](implementation/pr6-runtime-tool-locks.md).

Redis IFR-11-001 lokal abgeschlossen: echte Versions-/RDB-AOF-Migration,
Crash-/Dedup-/OOM-Prüfung und vier Helm-/PVC-Gates bestanden.
[Abschluss und Live-Grenzen](implementation/pr6-redis-migration-closure.md).

Aktueller Stand am 2026-09-14: **141/154 lokal verifiziert, 13 unvollständig**.
Das Register `register.json` enthält 2 teilweise implementierte, 3 in Bearbeitung
und 8 offene Findings. PCR-PRISM-WORKER-002 ist gemäß D12 lokal geschlossen; separate Live-Abnahme offen.

## Gesicherte Arbeit

Prism verwendet ausschließlich den nativen V3-Ausführungspfad; Details und
historische Testnachweise in `implementation/pr6-prism-single-runtime.md`.

Die drei bei Wiederaufnahme uncommitteten Worker-Dateien wurden geprüft und die
Start-/Abbruchgrenze weiter bearbeitet. Der Supervisor kann zusätzliche Starts
über die an den Attempt gebundene Berechtigung besitzen. Alle gestarteten Helfer
werden vor finaler Scope-Bereinigung beendet und abgewartet, auch vor ihrem
Cgroup-Beitritt. Der originale C-Launcher bindet sich an den erwarteten
Supervisor-PID und beendet sich bei dessen Tod; nach dem UID-Wechsel wird die
Elternbindung erneut gesetzt und geprüft.

Lokale Nachweise: `implementation/pr6-launch-ownership-checkpoint.md`.

Fixture-Journal und nativer Prozesskanal sind jetzt verbunden: dauerhafte
Bereitschaft vor Abhängigkeitsfreigabe, gebundene Teardown-Nachricht und
gespeicherter Abbruch vor erzwungener Beendigung. Die neue Lifetime-API verbindet
dies mit Core und dessen originalem Abschlussjournal, ist aber noch nicht im
Produktionsscheduler aktiv. 12 echte lokale Prozess-/Journaltests bestehen;
Typprüfungen und Lint sind geprüft. Details und Grenzen:
`implementation/pr6-buster-fixture-control.md`.

Zusätzlicher Bereinigungsfix: Job-/Workspace-Symlink-Eltern werden vor jeder
Quellenlöschung abgewiesen; echte Dateien anderer Jobs und Evidence bleiben
erhalten. Drei native Dateisystemtests bestanden. Dies ersetzt keinen Nachweis
von Prozessquieszenz und schließt Busters Retention nicht.
[Nachweis und exakte Integrationsgrenze](implementation/pr6-buster-cleanup-parent.md).

## Exakter nächster Schritt

Busters neuen Attempt-Host, die eingeschränkte rollenbezogene Startpolitik und
den dauerhaft gebundenen Fixture-Lebenszyklus vollständig mit dem Runner
verbinden. Der aktuelle Buster-Runner verwendet weiterhin V1/LocalWorkerRuntime;
der Startberechtigungsbaustein allein ersetzt ihn nicht. Capabilityarbeit und
Brokerarbeit müssen vollständig innerhalb derselben Attempt-Ressourcengrenze
bleiben. Anschließend den alten Runner, File-Capability-Start und ersetzte
Samplingpfade löschen; keine dauerhaften Fallbacks hinzufügen.

Danach die übrigen Worker-/Retention- und Infrastrukturfindings anhand der
Originalbefunde im Register schließen. PCR-PRISM-WORKER-002 wurde gegen den V3-Produktionspfad neu bewertet;
Nachweis: `implementation/pr6-prism-native-local-closure.md`.

## Arbeitsregeln

Im bestehenden Branch `fix/remediation-foundations-20260909` und PR #6 arbeiten.
D12: vollständige Implementierung plus ausreichende echte lokale Tests reichen
zum lokalen Abschluss; Live-Abnahme folgt separat durch den Auftraggeber.
Keine Deployments, kein Merge und keine History-Bereinigung in dieser Fortsetzung.
Fortschritt nach überprüften Teilschritten sichern, PR und Register synchron halten.

