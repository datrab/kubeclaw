# Unabhängige Prüfung der SPIRE-Registerpromotion

Die begrenzte Promotion von IFR-06-001 ist akzeptiert. Der Reviewer hat diese Registeränderung und die drei Testkorrekturen nicht implementiert. Maßgeblich bleiben die [frische S1/S2/S-DOC-Prüfung](independent-spire-current-scope-20260921.md) und D12: lokaler Abschluss, keine bestandene Live-Abnahme.

## Register und Umfang

Der eigene strukturelle Vergleich mit dem erhaltenen Vorzustand zeigt ausschließlich IFR-06-001 und die abgeleiteten Statuszähler als JSON-Änderungen. Alle 154 ursprünglichen Befundtexte, alle anderen historischen Findings und die fünf Integrationsbefunde sind identisch. Aktuell sind 142 lokal verifiziert, drei in Bearbeitung, zwei implementiert und sieben offen; zwölf historische Findings bleiben unvollständig. Register, Fortschritt und Handoff zeigen dieselben aktuellen Zahlen. Historische Absätze bleiben erhalten.

IFR-06-001 bezeichnet den Arbeitsbaum ausdrücklich als nicht committed. Er behauptet weder einen tatsächlichen Restore noch eine garantierte Ausfalldauer. Erlaubte/falsche Identitäten, SVID-Erneuerung unter Last, Ausfall über Zertifikatsablauf, Neustart und kohärenter CA-/Serverrestore bleiben separate Live-Gates. Die Restarbeitsinventur behält SPIRE sichtbar. Ihre zunächst veraltete Aufforderung zur noch ausstehenden Quellenbindung wurde nach dem Reviewhinweis präzisiert; die finale Zeile nennt den gebundenen lokalen Abschluss und erhält den Live-Umfang.

## Gepflegte Negativkontrollen

Der exakte Vergleich mit dem früheren archivierten Testmodul ergibt nur drei geänderte Mutationseingaben. Statt des überholten Literals `141/154` wird jeweils die erste aktuelle fettgedruckte Zusammenfassung `N/154 lokal verifiziert` auf `N+1` verändert. Dadurch trifft der Handoff-Test nicht mehr einen historischen Absatz. Auch bei N=154 bleibt die Mutation falsch. Die Prüfung, dass tatsächlich etwas geändert wurde, die erwartete Drift-Ablehnung und das Verbot einer stillen Reparatur sind unverändert. Kein Test, keine Assertion und keine Frist wurde entfernt.

Eigener vollständiger Lauf: `node --test scripts/tests/remediation-register.test.mjs`, Exit 0, **26/26**, keine Fehler, Skips oder Abbrüche. Der frühere Autorenlauf mit drei fehlgeschlagenen Negativkontrollen bleibt in `register-tests.txt` erhalten. Der erste Lintversuch ohne auffindbare Konfiguration und der erfolgreiche explizit konfigurierte Autorenlauf bleiben getrennte Belege; hier wird kein eigener Lintlauf behauptet.

[Eigene Ergebnisse und Quellenidentitäten](../../evidence/spire-current-audit-20260921/independent-promotion-result.json), [vollständiger Testlauf](../../evidence/spire-current-audit-20260921/independent-register-tests.txt), [exaktes Testdelta](../../evidence/spire-current-audit-20260921/independent-test-delta.patch).

## Separater Studio-Inventarnachtrag

Die fünf Studio-Zeilen des JSON-Inventars sind unabhängig gegen die aktuellen Consumer geprüft. Drei Operatorwerte verweisen auf `operator.prism.studio`; `STUDIO_ROOT` bleibt Installationspfad mit nullish Default, sodass der leere String nicht ersetzt wird. Das externe Ingress-Secret wird nicht als Wert inventarisiert; fehlende/leere Credentials ergeben am Proxy HTTP 503. Historische Namen, Zeilen und Defaultfelder bleiben erhalten, ebenso die Gesamtzahl 1.374. Die aktuellen `resolved`-Angaben unterscheiden sich ausdrücklich von diesen historischen Entdeckungsfeldern. Tatsächlicher Image-Build und obligatorischer kanonischer Image-Porttest bleiben offen; dies schließt nicht CONFIG insgesamt.

[Gebundene fünf Zeilen und Consumer](../../evidence/spire-current-audit-20260921/independent-studio-inventory-result.json). Diese JSON-Prüfung ergänzt die frühere [Studio-Dokumentationsprüfung](independent-studio-doc-correction-20260921.md); spätere Buster-Konfigurationsänderungen sind nicht vorweggenommen.
