# lib.prompt-contract — Prompt-Envelope-Bibliothek

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1. Verantwortung, Grenzen und Verwendung

`skills/common/plugins/prompt-contract/src/index.ts` exportiert `stablePromptJson`,
`createPromptEnvelope` und `serializePromptEnvelope`; `package.json` exportiert
nur diese Bibliothek. Keine `plugin.json`, keine Laufzeitregistrierung.
`packaging/runtime/package-ownership.json` führt `prompt-contract: []`.
Repositoryweite Suche nach Paketname und allen drei Exporten findet außerhalb
von Definition/README nur die eigenen Tests. Somit am Baseline-Stand ungenutzt
im verfolgten Produktionscode, nicht als aktives Pipeline-Plugin zählen.
Dynamische externe Nutzung außerhalb des Repositories ist nicht nachweisbar.

## 2. Eingaben, Ausgaben und Schnittstellen

Task, Evidenz, Response-Contract und optionale Guidance werden zu
`prompt-envelope.v1`. Unbekannte normale Envelope-Schlüssel werden abgelehnt.
Die Bibliothek interpretiert den Response-Contract nicht fachlich. Kanonische
Schlüsselsortierung, JSON-Serialisierung, Größenprüfung; Rückgabe aus JSON.parse
ist eine neue Objektstruktur. Es gibt keine nachgelagerte Produktionsgegenstelle.
Die eigenen Tests sind die einzigen nachgewiesenen Konsumenten.

## 3–7. Zustand, Fehler, Wiederholung, Neustart und Vertrauen

Kein eigener Zustand, keine Persistenz, keine externe Aktion. Synchroner Aufruf,
kein Timeout-/Abort-/Retry-Vertrag. Wiederholungen sollten für akzeptierte Werte
identische Ausgabe liefern; Accessors verletzen das, siehe PCR-PROMPT-001.
Keine Authentifizierung; die Bibliothek ist keine Autoritäts- oder
Prompt-Injection-Grenze. Fachliche Anweisungen bleiben Aufgabe des Aufrufers.
Getter können beim Traversieren Code ausführen. Kein Neustartprotokoll nötig.

## 8–9. Grenzen und Vereinfachung

Standardlimits: 262144 Bytes, Tiefe 20, 10000 Einträge; konfigurierbare Obergrenzen
8 MiB, Tiefe 100, 100000 Einträge. Byteprüfung erfolgt erst nach Traversierung
und JSON.stringify; damit kein harter Peak-Memory-Schutz gegen bereits riesige
Strings. Keine Aufbewahrung/Aufräumaufgabe. `serializePromptEnvelope` serialisiert
zweimal. Vor späterer Reparatur klären, ob diese ungenutzte Bibliothek entfernt
werden soll; kein Adapter zur künstlichen Wiederbelebung hinzufügen.

## 10. Tests und Nachweis

`tests/live-function.test.ts` vollständig gelesen und unverändert ausgeführt:
Determinismus normaler JSON-Werte, Envelope-Aufbau, NaN, undefined, Date,
einfaches sparse Array, Cycle, verbotener Schlüssel, Bytebudget, leerer Task.
Bestanden: `npm test --workspace @kubeclaw/prompt-contract`.
Das ist ein echter lokaler Bibliothekstest, kein Agent-/Pipeline-Test.

Zusätzliche echte Reproduktion: `node docs/review/evidence/prompt-loss.mjs`.
Sie bestätigt den aktuellen Defekt; sie ist ausdrücklich noch kein bestandener
Regressionstest für eine Reparatur. Fehlende Negativfälle: Accessors, Symbol-
und nicht-enumerierbare Eigenschaften, sparse Array mit zusätzlichem Schlüssel,
Grenzwerte für Tiefe/Eintragszahl und extrem große Einzelstrings.

## 11. Dokumentationsabgleich

README nennt eine dependency-only library und korrekt fehlende Autorität.
Die pauschale Aussage, Werte abzulehnen, die JSON still verändert oder entfernt,
ist durch PCR-PROMPT-001 widerlegt. Der implizierte Einsatz durch Agent-Plugins
ist durch keine Produktionsreferenz belegt. Status: veraltet/unvollständig.

## 12. PCR-PROMPT-001 — Akzeptierte Nicht-JSON-Eigenschaften gehen verloren

- Schweregrad: niedrig; Bibliothek derzeit ohne Produktionsaufrufer. Bei späterer
  Nutzung können Evidenz verloren gehen und wiederholte Serialisierungen abweichen.
- Evidenzklasse: nachgewiesener Defekt, reproduziert an Originalimplementierung.
- Beleg: `src/index.ts:48–63` prüft Array-Sparsity nur über Anzahl enumerable
  Keys und liest Records mit `Object.keys` / `value[key]`; `:102–107` serialisiert
  das Ergebnis. Pfade relativ zur oben genannten Komponente.
- Auslöser: `new Array(1)` mit zusätzlichem enumerable `extra` hat Keys-Anzahl 1,
  passiert die Prüfung und wird `[null]`. Symbolwerte werden zu `{}`. Ein Getter,
  der seinen Zähler erhöht, erzeugt bei zwei Aufrufen unterschiedliche JSON-Werte.
- Auswirkung: stiller Evidenzverlust und gebrochener Determinismus für akzeptierte
  Eingaben; kein nachgewiesener Produktionsvorfall.
- Ursache beheben: vorzugsweise ungenutzte Bibliothek nach Referenzprüfung entfernen.
  Falls beibehalten: ausschließlich eigene Data-Properties zulassen, `Reflect.ownKeys`
  und Deskriptoren prüfen, jeden Array-Index auf Existenz prüfen und zusätzliche
  Eigenschaften ablehnen; Getter nicht ausführen.
- Regression: Reproduktion in echten Serializer-Test überführen; alle drei
  problematischen Eingaben müssen gezielt abgelehnt werden. Vorhandene normale
  JSON-Golden-Ausgabe unverändert erhalten.
