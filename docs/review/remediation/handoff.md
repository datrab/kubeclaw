# Aktuelle Übergabe PR #6

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

Aktueller Stand am 2026-09-14: **140/154 lokal verifiziert, 14 unvollständig**.
Das Register `register.json` enthält 2 teilweise implementierte, 3 in Bearbeitung
und 9 offene Findings. PCR-PRISM-WORKER-002 ist gemäß D12 lokal geschlossen; separate Live-Abnahme offen.

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

