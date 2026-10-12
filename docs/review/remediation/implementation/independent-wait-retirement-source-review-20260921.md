# Wait-Retirement: unabhängiger Quellencheckpoint

Dies ist keine abschließende WP1–WP8-Abnahme. Finale Originaltests, semantische Negativkontrollen und Quellenbindung stehen aus. Keine schweren Tests wurden während des Autorenlaufs gestartet.

Der frische Review fand eine konkrete Lücke im exportierten Wiederholungspfad: Eine bereits projizierte Wait-Zeile konnte bei identischen Store-Dateien verschachtelte Writerlocks erwerben. Der Autor bestätigte den fehlenden direkten Regressionstest. Die neue Korrektur führt Wiederholung und Transition über denselben festen Owner→Dependency-Fence. Er prüft getrennte Dateien vor dem ersten Lock, vor dem zweiten Lock und unter beiden. `readStoreRecords` erhält den bisherigen Read-/Replay-/Filter-/Clone-Vertrag. Die Transition validiert und klont ihren Kandidaten weiterhin synchron vor dem ersten Await. Echte Same-object-/Same-file-Wiederholungsfälle und unveränderte positive manuelle Wiederholung müssen die finale Runtimeabnahme tragen.

Der WP5-Korrekturpfad prüft die ursprüngliche oder projizierte Delivery-Anforderung und den bestehenden strikten Terminaldecoder unter dem Deliverylock erneut. Der Reader rekonstruiert ausschließlich die gebundenen vollständigen ursprünglichen Journalpräfixe samt Rohhashes, Snapshot und Inodeidentitäten. Er erteilt dadurch keine Autorität über spätere Suffixe; der bestehende Current-Evidence-Reader wird nicht gelockert. Die Resolverfähigkeit wird nur an den ausgewählten ursprünglichen Waitadapter gegeben und mit dessen Aktivierung widerrufen. Aus dieser Inspektion wird kein bestandener Lauf abgeleitet.

## Zwei eng geprüfte Extraktionsdeltas

Eigene TypeScript-AST-Nodeextraktion bestätigt die komplette Blobklasse, das Interface sowie `positiveInteger` und `syncDirectory` als exakt bytegleich zur erhaltenen Vorherdatei. Die bisherige Recordmodul-API reexportiert Blobklasse und Typ; der bestehende Package-Wildcardexport deckt die neue Datei ab. Kein Import zurück zur Facade erzeugt einen Zyklus. Der Vergleich des Operator-Deliverymoduls mit der erhaltenen Vorherdatei zeigt ausschließlich das zusätzliche `export` vor dem unveränderten `retainedTerminal`.

Die gepflegte Wait-Package-Boundary-Prüfung musste deshalb ihre strukturelle Quellenfixture nachführen. Das exakte Diff ersetzt nur den alten Sammelmodul-Read durch Facade plus Blobmodul und prüft zusätzlich den tatsächlichen Reexport. Alle fünf ursprünglichen Assertions bleiben bytegleich. Die alte `handle.sync()`-Assertion traf bereits Blobcode; sie war und ist kein Laufzeitbeweis für Recordpersistenz. Der erhaltene fehlgeschlagene Run4 wird nicht nachträglich grün umgedeutet. Unveränderte echte Foundation-/Blob-/Legacy-Cutover-Prüfungen bleiben erforderlich.

[Gebundener Quellencheckpoint](../../evidence/wait-retirement-independent-20260921/source-checkpoint.json). Keine Gesamt-OBS-, Speicher- oder Löschfreigabe folgt aus diesem Quellenreview.
