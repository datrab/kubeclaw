# Verbindliches Statusformat — Raven, 2026-10-17

Diese Ausgabevorgabe ergänzt die Dispatch-Reparatur und ersetzt ältere freie Statusformate. Jeder fällige oder durch eine neue Änderung ausgelöste deutsche Status verwendet genau diese sieben klar beschrifteten Punkte:

1. **AP:** tatsächlich bearbeitetes Arbeitspaket (C1–C6 plus konkrete Teilgruppe); bei paketübergreifender Arbeit die betroffenen Pakete nennen. Keine erfundene AP-Zuordnung.
2. **Aktuelle Arbeit:** konkrete Source-/Receiving-/Test-/Review-Tätigkeit; Implementierungsworker, Reviewer und bloßen Supervisor unterscheiden. Bei Stillstand ausdrücklich sagen, dass keine Implementierung läuft.
3. **Offen:** nächste konkrete Source-Lücken und noch erforderliche Abnahmen; Scope 2409 Felder / 6845 Fälle / vollständiges C0–C6 bleibt verbindlich.
4. **Erledigt:** nachweisbare abgeschlossene Schritte mit Commit/Beleg und gezielten Prüfergebnissen; historische Erfolge als solche kennzeichnen, keine Teilprüfung als Gesamt-PASS.
5. **Blocker:** aktuelle tatsächliche Blockaden; lokale Source-Arbeit, unabhängiges Review und externe native Infrastruktur getrennt halten.
6. **Maßnahmen:** tatsächlich ausgeführte Gegenmaßnahmen und konkrete Wiederaufnahmebedingung/Owner je Blocker, keine bloß versprochene Wiederaufnahme.
7. **Seit letztem Update:** ausschließlich verifizierte Änderungen gegenüber lastAnnouncedAt, einschließlich behobener/neuer/unveränderter Blocker. Ohne Source-Fortschritt ausdrücklich „kein neuer Source-Fortschritt“; Formatänderung ist keine Implementierungsleistung.

Kompakt bleiben; Angaben dürfen zu kurzen Stichpunkten zusammengefasst, aber keine der sieben Rubriken ausgelassen werden. Bei einer neuen Formatanforderung einmal deren Umsetzung melden. Anschließend weiterhin: stille unveränderte 5-Minuten-Prüfung = NO_REPLY; normale messbare Änderungen höchstens alle15 Minuten; neue Fehler/Blocker/Recovery-Änderungen sofort. Unveränderte externe Blocker allein erzwingen keine erneute Nachricht. Nach tatsächlich ausgegebener Nachricht lastAnnouncedAt und die konkret angekündigten Änderungen in automation/config-supervisor-state.json speichern. Keine zusätzliche Kanalnachricht senden.

