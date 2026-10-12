# Unabhängige Prüfung der CONFIG-Definition — 12. Oktober 2026

Gegenstand: `docs/review/remediation/config-definition-20261012.md` und `config-scope-inventory-20261012.json` im Repository `/home/node/Documents/Codex/2026-09-20-hi-sind-die-offenen-issues-irgendwo`. Prüfer: `independent_inventory`. Ausschließlich lesende Definition-/Quellenprüfung; keine Migration, keine Statusänderung, keine Runtimegleichwertigkeitsbehauptung.

## Ergebnis

Die Definition ist eine sinnvolle codegestützte Zielbeschreibung für den nächsten CONFIG-Schritt. Sie deckt deutlich mehr als sichtbare Pipeline-Stages ab und trennt Systemkomposition, Componentsettings, Projektinput, Protokollinvarianten, Secrets und Versionsautorität. Der bestätigte `pipeline.json`-Systemeinstieg wird nicht mit dem heute gleichnamigen CLI-Graphformat verwechselt. Änderungsübernahme am nächsten Modulstart und fester Evalmodus sind richtig als neue erforderliche Consumer-/Recoveryverträge beschrieben, nicht als vorhandene Funktion.

Die Anlage ist **ein belastbarer deklarativer Erhebungsstand, keine vollständige semantische F1-Abnahme**. Die Vorlage behauptet diese Abnahme auch nicht. Einzelne konkrete Scope-/Consumerentscheidungen bleiben vor Migration nötig. Zwei Formulierungen sollten präzisiert werden: welche Profile Autoren versus unveränderliche Ableitungen sind, und wie der dauerhafte Modulstart seine Konfigurationsbindung vor Dispatch erhält sowie Reparaturbudgets behält.

## Eigene Methoden und Ergebnisse

- Definition vollständig gelesen; Anlage strukturell geprüft; bestehende D17/F1–F6-Ziele und bestätigte Modul-/Evalregel berücksichtigt.
- Eigener Pythonvergleich sämtlicher **132 Quellenidentitäten: 132/132 stimmen**, keine Drift.
- Direkte Produktionspluginverzeichnisse unabhängig über `*/plugin.json` enumeriert: Common 16, Nova 16, Buster 16. IDmengen stimmen exakt mit allen **48** Inventarobjekten überein; kein direktes Paket fehlt, kein zusätzlich erfundenes Paket.
- Sämtliche `configSchema`/`runtimeConfigSchema`-Referenzen in diesen tatsächlichen Manifesten rekursiv erfasst: **57 eindeutige Pfade**, keine Abweichung zur Schemaanlage. Das prüft deklarierte Pfade, nicht externe `$ref`-Auflösung oder Consumerfeldvollständigkeit.
- Anlage enthält **868** Discoverykandidaten und **132** gebundene Quellen; der deklarierte Scanumfang beträgt **1.298** Produktionsdateien. Kandidatenanzahl unabhängig aus JSON gezählt; die ursprüngliche Scan-/Markerheuristik und ihre Dateifilter wurden nicht vollständig erneut ausgeführt. Fehlender Marker beweist keinen fehlenden Default.
- Produktionsquellen gelesen: sechs aktuelle swarm-Komponenten, feste Ownerliste und Bundlebindung; Nova CLI, Runtimekomposition, Snapshot-/Recoveryschutz; Reviewfallbacks; Network-HTTPconfig; Prism Designprovider.

Keine Test-/Eval-/Image-/Deployment-/kostenpflichtige Provideraktion durchgeführt. Reine Pythonprüfungen lasen Dateien und berechneten Digests.

## Eigentum und deklarierter Umfang

Die sechsfache aktuelle Komponentenbindung ist korrekt: Prism Control/Studio/Worker/Execution, Buster Engine, Worker Core. Die feste Ownerliste im aktuellen Loader ist real. Nova Plattformkonfiguration wird separat geladen und aktiviert Stages/Adapter/Observer über Registry/Grants; das ist noch kein generischer gemeinsamer Einstieg für die vorgeschlagenen Eigentümer.

Die Zielmatrix berücksichtigt Plugins mit mehreren Registrationen, Commonadapter/Observer, Agent-/Modell-/Promptprofile, Foundation/Core, Services, Deployment, Storage/Observability sowie Workflow-/Projekt-/Evaldaten. Das ist ein plausibler vollständiger **deklarierter Zielrahmen**. Manifestabdeckung garantiert jedoch nicht, dass jede zusätzliche nicht deklarierte oder extern installierte Konfigurationsfläche erfasst ist. Die Vorlage begrenzt ihren Anspruch hierzu korrekt.

Die genannten konkreten Restdefaults existieren. Network-HTTP begrenzt Methoden/Header/Bytes/Timeout durch eigene Ersatzwerte; Reviewprofile haben zahlreiche Fallbacks; Prism OpenAIkompatibler Provider hat optionalen Timeout und eingebettete Promptlogik. Nicht jeder Wert ist ein globaler Operatorschalter: Requestinput, technische Domäne, notwendige Protokollkonstante und editierbares Tuning bleiben vor Migration feldweise zu unterscheiden. Die Definition fordert das ausdrücklich und erzeugt keinen automatischen Auftrag, jede Konstante zu verschieben.

**Profilklarstellung:** Eine vollständig materialisierte Generation ist entweder ein unveränderliches generiertes Liefer-/Ausführungssnapshot aus dem zuständigen Autor oder ein ausdrücklich ausgewähltes eigenständig authorisiertes Variantenprofil. Editierbare Basis plus separat editierbare Ableitung derselben aktiven Variante wären zwei konkurrierende Autoren. D17 wird durch bequemen Diff/Materialize nicht aufgehoben. Komponentenprofil, Plugininstanz und aktiver Scope müssen eindeutig sein; ein neues Overridepräzedenzsystem ist keine Voraussetzung. Das sollte in der Profilsektion ausdrücklich stehen.

## Systemeinstieg und Graphmigration

Heute verlangt `skills/nova/core/cli.ts` `--platform` und `--pipeline`; `--pipeline` lädt `pipeline-definition.v2`. Die Vorlage erkennt diese Namenskollision und verlangt getrennte Schema-/CLI-/Recoverymigration. Materialisierter Ablaufgraph darf gebundene effektive Werte enthalten, aber keine zusätzlich editierbare Settingsautorität werden. Die bestätigte Wahl `pipeline.json` rechtfertigt keine bloße Dateiumbenennung.

`engine-runtime.ts` validiert Stageconfig aus der Definition und Adapter-/Observerconfig aus Plattformdaten. `engine-snapshots.ts` weist abweichende Runtimekonfiguration mit `RECOVERY_RUNTIME_CONFIGURATION_MISMATCH` zurück und bindet Graph/Packages/Runtimeprofile in dauerhaften Snapshots. Daher erfordert modulweise Tuningänderung reale Struktur-/Consumeränderungen; bloßes Reload vor jedem Stageaufruf würde vorhandene Integrität verletzen. Die Vorlage stellt das angemessen als noch zu implementierenden und zu prüfenden Vertrag dar.

## Modulbindung, Recovery und Policy

Der stabile Run muss Graph, Grants, Grundbindings und autorisierte Obergrenzen tragen. Geeignete Modultuningwerte können beim fachlichen Start neu ausgewählt werden, während diese gebundene Einheit mit Prüfungen/Cleanup/Fortsetzung ihren Stand behält. Bei Buster ist die Plan-/Fixtureeinheit relevant; bei anderen Plugins ist die heutige Stage→Moduleinheit noch zu definieren. Das ist eine notwendige Konkretisierung, kein Anlass für eine neue allgemeine Hotreloadinfrastruktur.

**Dauerhafte Startklarstellung:** Noch vor Dispatch wird akzeptierte Moduleinheit plus gewählte vollständige Generation atomar/dauerhaft gebunden. Nach verlorener Antwort oder Crash benutzt Recovery diese Bindung; erneuter Lookup von `Latest` ist kein Replay. Parallele Starts und Publishgrenze brauchen konkrete Wirkungstests. Eine neue Profil-/Versuchsidentität darf bereits verbrauchte D04-Lint-/Review-/Testreparaturen oder die einmalige Novaeskalation nicht zurücksetzen. Technische Retries und fachliche Reparaturen bleiben unterschiedliche Zähler. Die Vorlage nennt D04/D08-Grundsätze, sollte diese konkrete Konsequenz ergänzen.

Auswahl eines anderen Modells/Promptprofils erweitert keine Grants und macht einen vorhandenen Adapter nicht automatisch parameterfähig. Tuning muss innerhalb gebundener Fähigkeit und Policy funktionieren; grundlegender Provider-/Trust-/Storagewechsel benötigt passende neue autorisierte Bindung. Die vorhandenen Domain-/Plugin-/Runtimegrenzen bleiben.

## Evals und Umfang

Feste Baseline-/Kandidatgeneration, gebundene Fall-/Scorer-/Code-/Image-/Modell-/Promptidentität und isolierter Experimentstand sind sinnvoll. Gemischte Live-Modulstände dürfen nicht als eine feste Evalbaseline erscheinen. Konfiguration allein erzeugt keinen tatsächlichen Harness für jeden Core/Worker oder macht Hardware-/Providerverhalten deterministisch. Unbekannte Kosten und Identitäten korrekt ausweisen; keine historischen Preisdefaults als heutige Kosten ausgeben.

Die Definition behauptet weder fertigen generischen Evalrunner noch freie kostenpflichtige Kampagnen. Validate/Explain/Diff/Materialize sind kleine Zielbedienungen auf vorhandener Loaderbasis, nicht vorgeschlagener Configserver oder neues UIprodukt. Damit entsteht kein erkennbarer unnötiger neuer Infrastrukturumfang. Konkrete Owner-/Profilnamen und Autorenwurzel sind Vorschläge; vorhandene Owner nur mit Consumerbegründung migrieren. Die Architekturänderung der Worker wird richtigerweise nicht innerhalb dieser Definition still umgesetzt.

## Grenzen / Abschluss

Keine vollständige semantische Setting→Autor→Consumer→Wirkungsfallmatrix, keine neue Consumerimplementierung und keine dynamische Modul-/Evalabnahme wurden erbracht. Diese Restarbeiten bleiben Voraussetzung der späteren F1–F6-Abnahme. Die unabhängige Prüfung stützt Umfang und Ehrlichkeit der Definition und der deklarierten Manifest-/Schemaabdeckung. Die beiden Klarstellungen wurden dem Hauptagenten übermittelt; nach Einarbeitung ist die Definition als Entscheidungsvorlage geeignet, keine pauschale CONFIG-Abnahme.

## Abschließende Bestätigung für die Übergabe

Die korrigierte CONFIG-Definition erneut gelesen: Sie bindet die akzeptierte Moduleinheit samt vollständiger Konfigurationsidentität jetzt ausdrücklich **dauerhaft vor Dispatch/Seiteneffekt**; Replay verwendet den gespeicherten Stand. D04-Reparaturbudgets und ursprüngliche Claim-/Wirkungsbindungen werden durch neue Profilgenerationen nicht zurückgesetzt. Generierte materialisierte Snapshots sind unveränderliche Ableitungen; bewusst eigenständig editierte Varianten haben einen eindeutig ausgewählten eigenen Profilautor. Damit sind beide konkreten Hinweise aufgenommen, keine weitere konkrete Korrektur erforderlich.

Die Quellenliste wurde von 132 auf **136** relevante Identitäten erweitert. Erneuter eigener Digestvergleich: **135 stimmen; `docs/review/remediation/decisions.md` hat sich geändert**, weil D20 die bestätigte Root-/Referenz- und Moduländerungsregel dauerhaft ergänzt. Dieser bekannte Dokumentationsdelta ist keine neue Codeabweichung und kein Anlass, alle 136 als unverändert zu behaupten. Deklarativer Umfang bleibt 48 Pluginpakete und 57 Configschemas. Die frühere 132/132-Aussage beschreibt den vorherigen Erhebungsstand.

Die Definition und dieser Bericht sind als ehrliche Cloud-Übergabe der Zielentscheidungsvorbereitung geeignet. Semantische F1-Matrix, Feldconsumerzuordnung, eigentliche Migration, Snapshot-/Recoverywirkungstests und Gesamt-CONFIG-Abnahme bleiben ausstehend. Kein Code wurde von diesem Prüfer implementiert, kein Registerstatus geändert und keine Architektur-/Deploymentfreigabe aus der Übergabefähigkeit abgeleitet.
