# prism.preferences — erklärbare Präferenzprojektion

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1–3. Verantwortung, Vertrag und Zustand

Vollständig `skills/prism/preferences/index.ts:1–109` und quality.test.mts gelesen. Control GET /v1/preferences liefert gespeicherte subject-/optional projektgefilterte Events an projectPreferences; Directions/POSTpreferences erzeugen diese Events. Reine Projektion, keine eigene Registrierung/DBmutation. validatePrism prüft jedes Event. Ausgabe mappt projection:scope:context:trait auf positive/negative/retained EventIDs, score, effectiveScore und lastEvidenceAt. selected/liked +1, rejected/disliked/reverted −1, preserved +0.5. Retraktions-IDs werden vor Aggregation gesammelt, removed Events zählen nicht.

## 4–6. Fehler, Wiederholung und Wiederaufnahme

Schemafehler wirft statt stiller Teilprojektion. Duplikate in übergebener Liste werden mehrfach gezählt; DBid-Unique schützt regulären persistierten Lookup (Wire-/SQL-IDfehler ist PCR-PRISM-CONTROL-002). Reine Funktion deterministisch bei explizitem now, ansonsten zeitabhängig. Keine I/O-/Abort-/Retry-/Crashgrenze. Nach Neustart kann DBereignisliste neu projiziert werden. Zeitabnahme berechnet gesamtes Traitaggregat anhand jüngstem Ereignis, nicht jede Evidenz einzeln; neues schwaches Signal erneuert Gewicht alten Signals. Das ist konkrete Semantik, kein unbelegter Algorithmusfehler ohne festgelegte Decaypolicy.

## 7–9. Vertrauen, Ressourcen, Architektur

Caller muss Subject/Scope binden; Funktion selbst kann beliebige Nutzer-/Projektlisten mischen. Control filtert Subject immer, Projekt optional. Dadurch projektbezogene Events mehrerer Projekte verschmelzen beim unfiltrierten GET im selben Kontext/trait-Key (001). Retraktionen sind nicht auf Projekt/Subject im Helfer geprüft, der reguläre Sender bindet Subject und Datenbankquery begrenzt gelesenes Subject. Plain-Object-Key enthält feste Präfixe und wird nicht unmittelbar trait zugeordnet, kein einfacher __proto__-Befund. Aufwand proportional zu Events/traits, Evidencearrays und vollständige DBhistorie ohne Paging/Retention; kein externer Speicher. Projektion sollte Kontextidentität explizit tragen, Policy für Decay und Retraktionsketten dokumentieren.

## 10–11. Tests und Dokumentation

Originalgruppe [prism-reviewed-modules-tests.txt](../evidence/prism-reviewed-modules-tests.txt): Qualitydatei enthält drei Präferenzfälle (Retraktion, verschiedene Projektionen/Decay, ungültige Zeitstempel), zwei Evaluationfälle. Originalfunktionen/Fixtures, kein HTTP-/DBpräferenzfluss. Implementationplan/Conventions beschreiben contextual/project/personal learning; keine genaue Aggregation über mehrere Projekte. Dokumentationsstatus vorhanden und unvollständig. Fehlend: Mehrprojektisolation, mehrfaches Event, Retraktion einer Retraktion, neuer Beleg für altes Trait.

## 12. Befund

### PCR-PRISM-PREFERENCES-001 — Projektidentität fehlt im Aggregationsschlüssel

**Mittel; Evidenzklasse: nachgewiesener Defekt durch Code-Trace.** index.ts:61–72 baut Key aus projection, learningScope, context und trait, ohne event.projectId. Control.ts:1119–1132 erlaubt GET ohne project, lädt dann sämtliche Ereignisse desselben Subjects und ruft diese Projektion auf. Zwei project-scoped Gegenpräferenzen zu gleichem Trait in getrennten Projekten neutralisieren sich oder verstärken sich projektübergreifend. Kein Cross-user-Datenleck behauptet. Ursache ist unvollständige Scopeidentität. Behebung: Projekt-ID im project-scoped Schlüssel/Output festhalten oder ausschließlich explizit projektgebundene Projektion erlauben; personal learning separat nach Consent aggregieren. Regression: OriginalprojectPreferences und Controlquery mit zwei Projekten und gegensätzlichen Events, jeweils getrenntes Ergebnis, Retraktion beeinflusst nur den zugeordneten Scope.

Zusätzlicher konkreter Dokumentabgleich: `docs/architecture/prism-preference-learning-v1.md:17,208–209` schließt automatische Zeitabnahme ausdrücklich aus; Originalfunktion :95–107 implementiert eine180-Tage-Halbwertszeit. Das ist eine bestätigte Dokument-/Implementierungsabweichung. **Offene Frage:** Welche versionierte Policy ist maßgeblich? Nicht als bloß fehlende Anforderung behandeln; ohne Entscheidung kein identisches zeitunabhängiges Ergebnis aus gleichen Events versprechen. Scopeforderung :133 bestätigt001. Originaltests belegen derzeit die Implementierungs-Decaypolicy, nicht Konformität zum Architekturtext.
