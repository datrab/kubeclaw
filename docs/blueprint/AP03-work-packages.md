# AP03 — parallele Arbeitspakete

Ausgangsstand: `e5bc4b951f914b95a39655aa069daaba09ee51a2`, 506 von
2.879 eingefrorenen Quelldateien inhaltlich entschieden. Die übrigen 2.373
Dateien sind ohne Überschneidung zugeteilt. Die
[maschinenlesbare Zuteilung](AP03-work-packages.json) nennt jeden Pfad genau einmal.
Eine Zuteilung ist keine Inhaltsprüfung und keine Freigabe zur Entfernung.

| Paket | Inhalt | Zugewiesene Dateien |
| --- | --- | ---: |
| AP03-P01 | Dokumentationsunterstützung und AP01-Verwaltung | 64 |
| AP03-P02 | Komponentenreviews und Pipeline-Traces | 112 |
| AP03-P03 | Umsetzungshistorie der Reparaturen | 275 |
| AP03-P04 | Infrastruktur, Befundregister und weitere Review-Verwaltung | 149 |
| AP03-P05 | Erste Gruppe von Nachweisen | 858 |
| AP03-P06 | Zweite Gruppe von Nachweisen | 915 |
| **Gesamt** | | **2.373** |

Die Nachweise sind nach Verzeichnissen und Dateigröße aufgeteilt. Große
komprimierte Register können entpackt erheblich umfangreicher sein. Größe,
Dateiname, erfolgreiches Parsen oder automatische Suchtreffer ersetzen keine
inhaltliche Bewertung. Leere Ausgaben können als leer bewertet werden; daraus
folgt weder ein bestandener Test noch eine vollständige Verifikation des Laufs.

## Vorgehen und Zusammenführung

Bei der ursprünglichen Inhaltsprüfung liest jeder Bearbeiter die zugeteilten Texte vollständig und entscheidet in
kleinen Themenblöcken. Er benennt zu bewahrende Informationen, konkrete Zielorte,
Korrekturen, Quellen und Verbraucher. Entscheidungen werden zunächst separat
zwischengespeichert. Nur die Hauptsession führt sie in das
[Prüfregister](review-ledger.jsonl) ein. Damit überschreiben parallele Bearbeiter
weder fremde Entscheidungen noch Fortschrittszahlen.

Vor der Zusammenführung prüft die Hauptsession Paketzugehörigkeit, eindeutige
Pfade, Originalblobs, Pflichtfelder und die Trennung zwischen Inhaltsprüfung und
Migration. Sie liest Stichproben einschließlich der Quelltexte und kontrolliert
wichtige Aussagen an Code, Befundregister oder tatsächlichem Verbraucher.
Unklare oder zu allgemeine Entscheidungen gehen zur Korrektur zurück.

Historische Pass-/Fehlerausgaben werden nicht als neu ausgeführte Tests ausgegeben.
Die 141 lokalen Abschlüsse nach D12 bleiben lokale Abschlüsse; die 13
unvollständigen Findings, zusätzliche Arbeit wie Issue #7 und die gesonderten
Live-Abnahmen werden durch redaktionelle Entscheidungen nicht geschlossen.

Wiederholte Logs, PIDs und Zwischenstände sollen nicht in neue Produktkapitel
kopiert werden. Extraktion ist für verbleibende Informationen, Entscheidungen,
Betriebsverfahren oder notwendige Nachweise vorgesehen. Entbehrliche historische
Ausgaben können nach der Prüfung ihrer Verbraucher und der übergeordneten
Nachweise entfernt werden. Ausführbare Testfixtures benötigen gegebenenfalls
weiterhin Originalbytes und einen kanonischen Testpfad.

Der zusammengefasste Pfadreport verwendet bereits vollständig gelesene
Komponenten- und Traceabschnitte erneut. Die
[Prüfzuordnung](AP03-report-review-map.json) bindet 1.708 inhaltsgleiche Zeilen an
47 Quellblobs; 381 weitere nichtleere Zeilen wurden eigenständig gelesen.
Nur Markdown-Überschriftenpräfixe wurden beim Gleichheitsvergleich entfernt;
Gliederung und Kontext wurden gesondert geprüft. Das ist eine nachvollziehbare
Prüfmethode und kein neues Quelltextarchiv.

## Wiederaufnahme

Den aktuellen Zustand jeder Quelle liefert ausschließlich `review-ledger.jsonl`.
Für jedes Paket die zugeteilten Pfade mit dem Register verbinden: Zeilen mit
`status: captured` sind noch offen, `content-reviewed` ist nur die abgeschlossene
Inhaltsentscheidung, `migration_status: pending` bedeutet noch keine Umsetzung.
Keine bereits geprüften Originalblobs ungeprüft auf einen neueren Stand setzen.

Die sechs neuen AP03-Verwaltungsdateien und zwei neuen main-Dokumente sind
im Abschluss ausdrücklich als acht Erweiterungen erfasst. Sie ändern nicht die
ursprüngliche Paketzuordnung; der feste Nenner bezeichnet deren Quellstand.
Die laufenden Zahlen und der nächste Einstieg stehen im
[AP03-Fortschrittsbericht](AP03-progress.md).

## Abgeschlossener Stand nach Nacharbeit

| Paket | Entscheidungen erfasst | content-reviewed | Übergabe blocked |
| --- | ---: | ---: | ---: |
| AP03-P01 | 64 | 64 | 0 |
| AP03-P02 | 112 | 112 | 0 |
| AP03-P03 | 275 | 275 | 0 |
| AP03-P04 | 149 | 149 | 0 |
| AP03-P05 | 858 | 858 | 0 |
| AP03-P06 | 915 | 915 | 0 |
| Ursprüngliche 506 | 506 | 506 | 0 |
| Ausdrückliche Erweiterungen | 8 | 8 | 0 |
| **Gesamt** | **2.887** | **2.887** | **0** |

Die zuvor 285 gesperrten Übergaben und die zusätzlichen Zielkandidaten sind
bearbeitet. Alle Originalidentitäten und die historische Zuteilung bleiben
nachvollziehbar. Die acht Erweiterungen sind sechs AP03-Verwaltungsdateien und
zwei neue main-Dokumente. Eine ursprüngliche Quelle wurde bereits auf main
entfernt und bleibt mit dieser Herkunft im Register; 2.886 Quellen sind vorhanden.

Die Nacharbeit kombinierte Inhalts-/Funktionsprüfung der zugeteilten Nachweise,
gezielte technische Quellenprüfungen und ausdrücklich begrenzte Zielabgleiche;
sie ist keine erneute vollständige Inhaltslektüre des gesamten Bestands.
Der [Abschlussbericht](AP03-recheck.md#abschluss-der-ap03-nacharbeit-am-15092026)
beschreibt Entscheidungen, Gegenprüfungen und Grenzen. AP03 ist abgeschlossen;
AP04 und alle Migrationen bleiben ausstehend.
