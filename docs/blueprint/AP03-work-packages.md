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

Jeder Bearbeiter liest die zugeteilten Quellen vollständig und entscheidet in
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

## Wiederaufnahme

Den aktuellen Zustand jeder Quelle liefert ausschließlich `review-ledger.jsonl`.
Für jedes Paket die zugeteilten Pfade mit dem Register verbinden: Zeilen mit
`status: captured` sind noch offen, `content-reviewed` ist nur die abgeschlossene
Inhaltsentscheidung, `migration_status: pending` bedeutet noch keine Umsetzung.
Keine bereits geprüften Originalblobs ungeprüft auf einen neueren Stand setzen.

Neue AP03-Verwaltungsdateien liegen außerhalb des oben eingefrorenen Quellumfangs.
Sie sind beim nächsten ausdrücklichen Bestandsabgleich zusätzlich zu erfassen;
der feste Nenner darf nicht als vollständiger zukünftiger Repositorybestand gelten.
Die laufenden Zahlen und der nächste Einstieg stehen im
[AP03-Fortschrittsbericht](AP03-progress.md).

## Zusammengeführter Stand

| Paket | Im Register übernommen | Noch offen |
| --- | ---: | ---: |
| AP03-P01 | 64 | 0 |
| AP03-P02 | 93 | 19 |
| AP03-P03 | 146 | 129 |
| AP03-P04 | 137 | 12 |
| AP03-P05 | 662 | 196 |
| AP03-P06 | 734 | 181 |

Die Zahlen betreffen die Zuteilung nach den ursprünglichen 506 Prüfungen.
T01/T02 aus P02 wurden von der Hauptsession selbst geprüft. Noch laufende
Bearbeiter können weitere Ergebnisse vorbereitet haben; gezählt ist nur der
zusammengeführte Registerstand.
