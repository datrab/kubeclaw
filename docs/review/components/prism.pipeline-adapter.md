# prism.pipeline-adapter — deklarative Zielzuordnung

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1–3. Verantwortung, Verwendung, Vertrag

Vollständig `skills/prism/pipeline-adapter/index.ts:1–57`, pipeline-adapter.test.mts und e2e.test.mts gelesen. Repositorysuche nach toBusterPlan/toForgeAssignments findet nur Tests und Conventions, keinen produktiven Nova-/Busteraufruf. Exportiertes Hilfsmodul, nicht runtime.ts-Reexport und keine aktive Pluginregistrierung. toBusterPlan verlangt formalen SHA256digest/nichtleere targets, erzeugt kubeclaw.visual@1-Konfiguration mit Gitmanifest-/Profilpfaden, Targetnamen und drei Viewportgrößen. toForgeAssignments ordnet deklarierte IDs über Map zu, wirft für unbekannte und gibt access=read-only. Dieser String erzwingt keine FSberechtigung; tatsächlicher Empfänger/Executionpfad ist nicht in diesem Modul vorhanden. projectId wird nicht ins Planresult übernommen.

## 4–6. Fehler, Nebenwirkungen und Restart

Keine I/O-/DB-/Dateioperation, kein Commitpunkt/Abbruch/Unknownreceipt. Fehler vor Return für falschen Digest/unbekannte Zuordnung. Doppelte Ziel-IDs, ungültiger Viewport aus untyped JS, Pfadsicherheit und echte Approval-/Digestprovenienz werden nicht validiert. Kein bestätigter produktiver Fehler, da nur Hilfs-/Fixtureaufrufer gefunden. Funktionen deterministisch; Forgeoutput teilt Targetobjekte mit Input, Aufrufer müsste Ownership beachten. Keine Threads/Locks/PID-/Neustartverwaltung erforderlich.

## 7–9. Vertrauen, Ressourcen, Vereinfachung

Digestformat ist kein Genehmigungsbeleg. Visueller Provider liest tatsächliches Gitmanifest/Profiles, dieser Mapper schreibt sie nicht und übermittelt keine Bildbytes. Controlcaptures verwenden1000px Höhe in allen Viewports, Helpercompact844/regular1024; ungenutzter Helfer daher keine behauptete Livepixelabweichung. Arrays/Maps unbeschränkt, Caller muss targetbudget setzen, keine gespeicherte Retention. Dauerhaft Produktadapter von Testmapping trennen oder über echte gemeinsame Vertragstests in Nova/visual integrieren, statt „read-only“ als Sicherheitseigenschaft zu dokumentieren.

## 10–12. Tests, Dokumentation, Ergebnis

Drei Originaltests in [prism-reviewed-modules-tests.txt](../evidence/prism-reviewed-modules-tests.txt) prüfen Declaration, Digestreject und moduletargetfilter. e2e.test ist PGlite+DeterministicDesignProvider und direkte Funktionskette; weder Nova HTTP noch Busterprozess oder Baselinearchivimport. Conventions:93 sagt ausdrücklich Applicationpipeline benötigt geprüftes Gitmanifest/Profile; das passt. Completionstatus/Implementationplan können nicht aus diesen Tests aktive Pipelineintegration ableiten. Dokumentationsstatus vorhanden, unvollständig zur tatsächlichen Nutzung. Keine neue aktive Defekt-ID; offene Integrationsfrage zuerst durch echten Callgraph/Empfängertrace klären, dann schema-valide Inputs bis Originalvisualprovider prüfen. Bestehende kubeclaw.prism-design/visual-Verantwortungen separat.
