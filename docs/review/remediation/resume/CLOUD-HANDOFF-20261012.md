# Cloud-Übergabe — CONFIG-Definition und aktueller Arbeitsbaum

**Nachfolgender Auftrag:** Der Auftraggeber verlangt jetzt die Sicherung aller nötigen Quellen/Dokumente/Belege im GitHub-Repository. [CLOUD-READY](../CLOUD-READY.md) beschreibt den separaten Checkpoint `codex/cloud-config-handoff-20261012`, dessen Belegauswahl und Cachegrenzen. Die folgenden Aussagen über „kein Commit/Push“ und das kleine Sourcepaket beschreiben den vorherigen Übergabestand; sie sind nach Veröffentlichung nicht der aktuelle Remotezustand. Ein erfolgreich geprüfter Push wird separat nachgewiesen.

Stand: 12. Oktober 2026. Diese Übergabe dokumentiert den Wiedereinstieg, **keinen bereits ausgeführten Cloud-Transfer**. Kein Commit, Push, Deployment oder neue Produktionsimplementation in dieser Sitzung.

## Start hier

1. `docs/review/remediation/README.md`
2. `docs/review/remediation/decisions.md`, besonders D17–D20
3. `docs/review/remediation/implementation-order-20261012.md`
4. `docs/review/remediation/config-definition-20261012.md`
5. `docs/review/remediation/config-scope-inventory-20261012.json`
6. `docs/review/remediation/independent-config-definition-20261012.md`
7. Für offene Originalbefunde: `assessment-20261012.md`, `register.json`, `acceptance-20260920.md` und historische Übergabe `resume/HANDOFF-20261009.md`.

Die gesamte ursprüngliche Auftragsnachricht ist zusätzlich unverändert in `docs/review/evidence/config-definition-20261012/original-request-20261012.txt` erhalten. Der portable Inventurgenerator liegt dort als `capture-inventory.py`; vor erneutem Ausführen vorhandene Aufnahme archivieren oder Ausgabe in einen neuen Pfad lenken, damit keine historische Aufnahme überschrieben wird.

## Tatsächlich bestätigte Entscheidungen

- Reihenfolge: **CONFIG-Zentralisierung → Test-Refactoring → Cgroup-/Worker-Ausführungsrefactoring → zwölf offene historische Findings**.
- Teststandard kommt aus einer anderen Session. Deren konkrete freigegebene Spezifikation/Referenz fehlt hier noch; keine eigenen Testkategorien erfinden. CONFIG nutzt vorerst passende bestehende echte Tests.
- D18: Kubernetes-Jobs statt eigener Hostrollenpools/NRI als Ziel, unter der Bedingung wesentlich geringerer Komplexität und einfacherer Skalierbarkeit. Prism pro Attempt, Buster zunächst pro Plan mit lokalen Fixtures. Fünf bewusst akzeptierte Vertragsanpassungen sind im Arbeitsplan beschrieben. Das ist kein bereits umgesetzter Cutover.
- D20: zentrale Config je Engine/Plugin/Core/Worker Core; `pipeline.json` als Systemeinstieg **mit Referenzen**, Settings in zuständigen Komponentendateien.
- Ergänzter CONFIG-Scope: Foundation/Runtime, Services/Deployment, Agent-/Modell-/Prompt-/Providerprofile, Adapter/Observer/Stores, Workflow-/Projekt-/Evalscope. Typen/Protokollinvarianten, Softwareversionen und externe Secretwerte haben ihre benannten Grenzen.
- Geeignete Tuningänderungen gelten ab nächstem fachlichem Modulstart, auch innerhalb einer laufenden Pipeline. Gestartete Module behalten ihren dauerhaft **vor Dispatch** gebundenen Stand. Graph-/Grants-/Recoverygrundlagen bleiben stabil, Replay/Retry verändert Profile nicht unbemerkt, D04-Budgets werden nicht zurückgesetzt. Evals verwenden eine feste Generation.
- Generierte vollständige Profile sind unveränderliche Ableitungen, keine zweite editierbare Quelle. Eigenständig ausgewählte Autorenvarianten sind eindeutig abgegrenzt. Keine stillen Code-/Env-/Chartfallbacks.

## Aktive Aufgabe und Fertigstand

Aktive Aufgabe ist die **vollständige codegestützte Definition** von CONFIG und gemeinsame Auswahl konkreter Migrationspakete. Keine neue Behebung integriert. Der Architektur-/Eigentümer-/Bedienungsvorschlag ist dokumentiert und unabhängig quellengeprüft; physische Autorenwurzel, genaue Feld-/Consumerzuordnung, Stage→Moduleinheit und erstes Implementierungspaket sind noch zu konkretisieren.

Neue Inventur: 48 Produktionspluginmanifeste, 57 direkte Konfigurationsschemas, 136 Quellenidentitäten. 1.298 Produktionsdateien mit 868 Discovery-Markern geprüft. Marker sind nicht 868 bewiesene Lücken. `$ref`-Expansion und semantische Feld-Consumerklassifikation sind nicht abgeschlossen; **kein F1-Gesamtpass**.

Wichtige konkrete Istbefunde: existierender Six-Owner-Bundleloader; konstante Profil-/Tuninglabels; separate Nova-Plattformconfig; `--pipeline` erwartet heute einen konkreten Graphen, nicht den neuen Systemindex. Review-/Prism-/HTTP-/Artifactstore-/Service-/Chartdefaults bleiben teilweise offen. Modul-Dynamik benötigt eine tatsächliche versionierte Compiler-/Core-/Recoverymigration; sie ist nicht durch Umbenennen einer Datei vorhanden.

Unabhängiges Definitionreview: 48 IDs/57 Schemapfade separat bestätigt; Profilautorität und vor Dispatch gebundener Modulstand wurden präzisiert. Erweiterter Abschlussvergleich 135/136 Identitäten unverändert; nur `decisions.md` wurde durch D20 absichtlich dokumentarisch geändert. Keine neue Runtime-/Image-/Kernel-/DB-/Liveprüfung.

Register bleibt 142/154 lokal verifiziert, zwölf unvollständig, fünf zusätzliche Integrationsbefunde. Frischer mechanischer Check bestanden. Der Registerstatus ist keine neue fachliche Abnahme aller historischen Findings.

## Repositoryzustand und Übertragungsproblem

Aktuelles Repositoryverzeichnis: `/home/node/Documents/Codex/2026-09-20-hi-sind-die-offenen-issues-irgendwo`; Branch `main`; HEAD `cd9f235345f5fd8736a2ffe75d806288e4d538db`; Remote `https://github.com/datrab/kubeclaw.git`.

Vor diesen letzten Übergabedokumenten enthielt `git status --short` **1.249 Statuszeilen**: 351 modifizierte, vier gelöschte, 894 unversionierte Einträge/Verzeichnisse. Verzeichniszeilen enthalten sehr viele Dateien. `git ls-files --others --exclude-standard` ergab 33.146 unversionierte Dateien mit ca. 10,17 GB logischer Größe; davon 32.371 unter `docs/review/evidence`. Diese Zahlen sind eine datierte Aufnahme, kein dauerhafter Endzähler.

`docs/review/evidence` belegte etwa 9,6 GiB; `node_modules` etwa 21,8 GiB. Der Hauptteil der großen Tools/Caches ist reproduzierbar, aber originale Rohbelege, Fehlläufe, Integrations-/Sourceidentitäten und private Entwürfe sind keine ersetzbaren Caches. Die letzte Aufnahme ist in `docs/review/evidence/config-definition-20261012/cloud-transfer-inventory.json` erhalten. Ignorierte Dateien sind darin nicht vollständig gezählt.

**Ein normaler Checkout von HEAD enthält nicht den heutigen Implementierungs- und Dokumentationsstand.** Auch die alten privaten Entwürfe und die jüngsten Entscheidungen sind teilweise unversioniert. Ohne tatsächlich geprüfte Übertragung darf die neue Cloudumgebung weder dieselbe Implementierung noch dieselben historischen Tests behaupten.

## Übertragungswege und Grenzen

- Wenn die genutzte native Umzugsfunktion den vollständigen Arbeitsbaum samt unversionierten/ignorierten nötigen Artefakten übernimmt, am Ziel Dateien und Identitäten prüfen. Diese Sitzung konnte keine solche Übertragung ausführen oder bestätigen.
- Für einen neuen Git-basierten Cloudcheckout müssen alle benötigten Source-/Test-/Dokumentationsänderungen in einem reviewten übertragbaren Stand verfügbar sein. Nicht pauschal `git add .`: lokale `.kube`-Zustände und große Tool-/Cache-/Rohbelegbestände sind separat einzuordnen. Hier wurde nichts veröffentlicht.
- Ein vorbereitetes **Source-Übergabepaket** kann den Dirty-Quellstand gegen HEAD mit einem Binärpatch und neuen Dateien erhalten. Es ersetzt weder den Baselinecheckout noch die vollständigen historischen Belege. Der Paketinhalt und SHA-256 stehen im mitgelieferten Transfermanifest. Es ist kein geprüfter Release oder akzeptiertes Integrationsmanifest.
- Große originale Belege und notwendige historische Gitobjekte separat unverändert verfügbar machen. Ein neuer Hash allein ersetzt nicht die ursprünglichen Bytes. Den alten Workspace bis zur bestätigten Übernahme erhalten. Caches/Toolchains können separat neu hergestellt werden; daraus folgt kein neuer bestandener Lauf.

Im Sourcepaket ausgeschlossen: `docs/review/evidence` als Gesamtbestand, `.kube`, `node_modules`/ignorierte Dateien und `.git`. Ausgewählte neue CONFIG-Aufnahmebelege/Originalauftrag sind separat enthalten. Für frühere Abnahmen und den strengen Registerbelegcheck können daher zusätzliche Rohbelege oder historische Gitobjekte erforderlich sein. Fehlende Quellen/Belege am Cloudziel ausdrücklich melden, nicht still durch Statusberichte ersetzen.

## Prüfen am Cloudziel

1. Baseline HEAD sowie Zielbranch prüfen; patch/apply und neue Dateien zuerst in einem isolierten Checkout prüfen, vorhandene Änderungen nicht überschreiben.
2. Quell-/Symlinkidentitäten aus dem Transfermanifest und den CONFIG-Inventuren prüfen. Erwartete neue Dokumentationsänderungen klar von unbekannter Produktionsdrift trennen.
3. Originalbelege auf Erreichbarkeit/Vollständigkeit prüfen; `node scripts/review/remediation-register.mjs --check` erst als bestanden führen, wenn es tatsächlich dort ausgeführt wurde. Fehlende Belege blockieren diesen Nachweis, nicht die ausdrücklich enger mögliche lesende CONFIG-Definition.
4. Dependencies und Toolchain über reale Locks/Versionen vorbereiten; kein alter absoluter `/home/node/...`-Pfad als Cloudpfad annehmen. Echte Kernel-/Cluster-/Runtimefähigkeit separat feststellen.
5. CONFIG-Definition und offene Detailentscheidungen fortsetzen. Keine alte pauschale Freigabe als neue Implementierungsfreigabe auslegen; keine Befunde ohne vollständige Abnahme umklassifizieren.

Die Übertragung ist erst abgeschlossen, wenn der Zielworkspace den benötigten Stand nachweislich besitzt. Ein Chat-/Dokumentationshandoff allein ist kein Transfer von Source oder Rohbelegen.
