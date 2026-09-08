# buster.entry

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

1. **Verantwortung und Nutzung.** `skills/buster/runtime.ts:1–3` ist ausschließlich ein Export der Buster-Engine. Keine Dienstinitialisierung. Der Quelltest importiert diesen Pfad; die ausgelieferte Rolle wird dagegen durch `packaging/runtime/roles/buster.json` und `scripts/build-runtime-role-bundle.mjs:236` als Export von `@kubeclaw/buster-engine` erzeugt. Beide führen zum Engine-Paket, dessen `src/index.ts` Worker-Core und Buster-Funktionen öffentlich macht.
2. **Vertrag und Gegenstellen.** Eingabe ist die ESM-Modulauflösung; Ausgabe sind die Engine-Exports, einschließlich `TestPlanRunner`, Remote-Service und WorkerExecutor. Kein JSON-Schema und keine eigene Identität. Gegenstellen sind Engine-Paketexport und Rollenbundler, nicht der Nova-Plantransport.
3. **Zustand und Commit.** Keine lokalen Variablen, Persistenz oder eigenen externen Aktionen. Import transitive Module ist keine Instanziierung einer Engine.
4. **Korrektheit und Fehler.** Relative Quellauflösung setzt den Repositorybaum voraus; ausgeliefert wird der Paketimport. Fehlende transitive Abhängigkeiten schlagen beim Import durch, ohne Umdeutung zu einem Testergebnis.
5. **Timeout, Retry, Parallelität.** Kein eigener ausführender Aufruf; hierfür ist die Engine zuständig. ESM-Modulcache ist kein Attempt-Lock.
6. **Neustart und Recovery.** Kein wiederaufzunehmender Zustand und kein eigener mehrstufiger Abschluss. Import nach Neustart exportiert erneut dieselben Implementierungen.
7. **Vertrauen.** Keine Authentisierung oder Autorisierungsentscheidung im Barrel. Die Trennung von Nova- und Buster-Exporten begrenzt öffentliche Architekturflächen, ersetzt aber keine Runtime-Sandbox.
8. **Ressourcen und Aufräumen.** Keine eigenen Handles, Streams, Dateien oder Aufbewahrungsregeln. Transitive Importkosten werden vom Rollenimport getragen.
9. **Architektur.** Der dreizeilige Quellwrapper und der generierte Paketwrapper haben unterschiedliche Auflösung, aber dieselbe Engine-Gegenstelle. Keine zusätzliche Abstraktion oder funktionale Vereinfachung nötig.
10. **Tests.** `tests/verification/contracts/check-pipeline-runtime-role-surfaces.mts` vollständig gelesen und mit `node tests/verification/contracts/check-pipeline-runtime-role-surfaces.mts` ausgeführt: **bestanden**. Tatsächliche Modulimporte und positive/negative Exportprüfungen für Nova, Worker und Buster; kein Mock. Kein Nachweis für Engine-Ausführung oder das erzeugte Containerimage. Rollenmanifest und Bundler gelesen, kein neues Bundle gebaut.
11. **Dokumentation.** `docs/architecture/pipeline-test-gate-implementation-plan.md:410–432` beschreibt diese Exporttrennung zutreffend: **vorhanden**. `skills/buster/engine/BOUNDARIES.md` stimmt mit der Verantwortungsgrenze überein. Keine konkrete Abweichung gefunden.
12. **Befunde und Grenzen.** Kein eigenständiger Defekt im Wrapper nachgewiesen. Engine- und Workerfehler werden bei ihren Eigentümern bewertet. Nächster produktionsnaher Nachweis wäre Import des erzeugten Buster-Bundles im vorgesehenen Image; der bestandene Quellimport behauptet diesen nicht.
