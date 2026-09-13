# Aktuelle Übergabe PR #6

Stand der Wiederaufnahme am 2026-09-13: **137/154 lokal verifiziert, 17 unvollständig**.
Das Register `register.json` enthält 3 teilweise implementierte, 3 in Bearbeitung
und 11 offene Findings. Keine zusätzliche Finding-Schließung in diesem Checkpoint.

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

## Exakter nächster Schritt

Busters neuen Attempt-Host, die eingeschränkte rollenbezogene Startpolitik und
den dauerhaft gebundenen Fixture-Lebenszyklus vollständig mit dem Runner
verbinden. Der aktuelle Buster-Runner verwendet weiterhin V1/LocalWorkerRuntime;
der Startberechtigungsbaustein allein ersetzt ihn nicht. Capabilityarbeit und
Brokerarbeit müssen vollständig innerhalb derselben Attempt-Ressourcengrenze
bleiben. Anschließend den alten Runner, File-Capability-Start und ersetzte
Samplingpfade löschen; keine dauerhaften Fallbacks hinzufügen.

Danach die übrigen Worker-/Retention- und Infrastrukturfindings anhand der
Originalbefunde im Register schließen. Die bestehende Zeile
PCR-PRISM-WORKER-002 muss gegen den neueren Prism-V3-Code neu bewertet werden;
ihr alter next_action-Text beschreibt noch den historischen Parent-CPU-Pfad.

## Arbeitsregeln

Im bestehenden Branch `fix/remediation-foundations-20260909` und PR #6 arbeiten.
D12: vollständige Implementierung plus ausreichende echte lokale Tests reichen
zum lokalen Abschluss; Live-Abnahme folgt separat durch den Auftraggeber.
Keine Deployments, kein Merge und keine History-Bereinigung in dieser Fortsetzung.
Fortschritt nach überprüften Teilschritten sichern, PR und Register synchron halten.
