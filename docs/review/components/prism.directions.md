# prism.directions — Strukturabstand von Designvorschlägen

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1–3. Umfang, Vertrag, Zustand

Vollständig `skills/prism/directions/index.ts:1–37` und directions.test.mts gelesen. Control /v1/agent/design-sets validiert drei DesignDocument-Schemas und ruft assertMaterialDirectionDiversity vor RepositorycreateDirectionSet. directionSignature nur Testaufrufe gefunden, materialDirectionDistance zusätzlich vom Gate verwendet. Keine Pluginregistrierung, rein interne Funktionen. Signatur enthält Themefarben/-typography/space/radius/shadow/motion, Viewoberfläche und Nodearten/ausgewählte visuelle Props, Componentroots. Canonical ordnet Objektkeys mit localeCompare, Arrays erhalten Reihenfolge. Distanz vergleicht Featurepfade, Nodeartunterschied3, Rootfeature2, sonst1; jedes Paar muss mindestens3 erreichen. Keine Persistenz oder externe Nebenwirkung.

## 4–6. Fehler, Parallelität, Restart

Gate wirft bei erstem zu ähnlichen Paar; Funktion selbst verlangt keine Anzahl drei oder Schema, Control macht beides zuvor. Idempotenz ergibt sich aus gleichem Input, keine Cache-/Journalzustände; Neustart irrelevant. Kein I/Otimeout/Abort erforderlich, aber rekursive Expansion ohne Tiefenbudget; Contract-Depthbefund gilt. Maximal drei produktive Dokumente begrenzen Paarzahl, nicht Dokumentgröße. Signaturelocale ist keine sprachübergreifend zugesicherte Kanonisierung; es gibt keinen gefundenen externen Signaturvergleich.

## 7–9. Vertrauen, Ressourcen, Architektur

Gate bewertet Strukturmetadaten, keine Renderpixel und keine semantische Eignung. Nichtbenutzte Theme-Tokenänderungen können Distanz erzeugen; responsive/statepatches und Componentvariantdefinitionen zählen nicht. Drei Tokenänderungen sind nach originalem Test bewusst ausreichende Schwelle. Deshalb keine technische Behauptung, bestandene Distanz beweise sichtbare Vielfalt. LLM-Evidence wird hier nicht verifiziert; Control speichert sie als Agentangabe. Keine Ressourcen/Retention außer lokalen Maps/Clones und Rekursion. Gemeinsame Featureextraktion für Signatur/Distanz würde Duplikation reduzieren; sichtbare Vielfalt sollte an aufgelöste Render-/Viewzustände gebunden sein, wenn dieser Produktanspruch gilt.

## 10–12. Tests, Dokumentation, Urteil

Vier Originalfälle in [prism-reviewed-modules-tests.txt](../evidence/prism-reviewed-modules-tests.txt): Copy-only ignoriert, einzelne Tokenänderung verworfen, drei Systemtokenänderungen akzeptiert, Keyreihenfolge irrelevant. Keine Browser-/Agent-/DBintegration. Implementationcompletion/integrationtraceability ordnen Materialdiversity dem Produktionsfluss zu; README dieser kleinen Library fehlt, Plan/Conventions vorhanden aber Heuristikgrenze unvollständig. Kein neuer sicher nachgewiesener Fehler gegen deklarierte Schwelle. Offene Frage: Muss Gate sichtbare Vielfalt über alle States garantieren? Nächste Verifikation: zwei schema-valide, identisch gerenderte Dokumente mit drei ungenutzten Tokenänderungen gegen Originalgate und echte Screenshots; produktive Anforderung danach eindeutig formulieren. Kein mathematischer Abstand als visuelle Qualität ausgegeben.
