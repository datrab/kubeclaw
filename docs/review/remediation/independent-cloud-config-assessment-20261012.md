# Unabhängige Prüfung der Cloud-CONFIG-Aufnahme — 12. Oktober 2026

Frischer Prüfer `independent_cloud_config_review`; geprüft gegen Checkout
`4b4684667c2dc27d01583fbec395c94d9f7a0456` auf
`codex/cloud-config-handoff-20261012`. Gegenstand sind die neue
[Aufnahme](cloud-config-assessment-20261012.md), der
[Quellenindex](../evidence/cloud-config-assessment-20261012/source-index.json),
die AST-Discovery und deren ergänzender Collector. Der Prüfer hat ausschließlich
diesen Bericht geschrieben; keine Produktions-, Test-, Deployment- oder
Registeränderung vorgenommen.

## Ergebnis

Das Zielbild und die abgegrenzte C1-Migration sind als Entscheidungsvorlage
brauchbar. D17–D20 werden nicht erneut zur Entscheidung gestellt. Komponenten-
und Profilautoren bleiben von generierten Lieferartefakten getrennt; die heutige
sechsfache Runtimeform wird wiederverwendet. Modulbindung, feste Evals und
Secretversionierung sind ausdrücklich neue Verträge, keine angeblich vorhandene
Funktion. Ein Configserver, rekursive Overlays oder das D18-Workerrefactoring sind
dafür nicht erforderlich.

Die anfänglichen Belegfilter, Chartautorenbeschreibung und Benennung der
Build-/Liefercaller benötigten Korrekturen; diese sind inzwischen unabhängig
nachgeprüft und in C1 aufgenommen. Die Aufnahme ist eine Gruppen-/Quellaufnahme mit offen bezeichneten
semantischen Felddeltas; sie beweist keine abgeschlossene F1-Gesamtinventur oder
F1–F6-Abnahme. Diese Grenze darf auch die abschließende Nutzerantwort nicht
verschweigen.

## Methoden und verifizierte Ergebnisse

- Auftrag, D17–D20, CONFIG F1–F6/F2a/F3a/F4a/F5a/F-DOCa der ursprünglichen
  `acceptance-20260920.md`, frühere Configdefinition und unabhängiger Review
  gelesen. Unterscheidung von ursprünglicher Einzeldateivorgabe und verbindlicher
  Komponentenpräzisierung überprüft.
- Alle **1.824** im abschließend korrigierten Index erfassten Dateibytes selbst mit SHA256
  geprüft: **1.824 stimmen**, keine Stichprobenprüfung. Der erste Index mit
  1.500 Dateien stimmte ebenfalls vollständig; seine Filter waren zu eng.
- Aktuelle Skills-Manifeste selbst aus `git ls-files` enumeriert und gegen den
  Index verglichen: **16 Common + 16 Nova + 16 Buster + 2 OpenClaw**, keine
  Auslassung oder zusätzliche erfundene Skills-Registration. Zusätzlich ist das
  andersartige Codex-Opsmanifest separat erfasst: insgesamt **51** Manifeste. Historische
  Manifestkopien in `docs/review/evidence` bewusst nicht als aktuelle Plugins
  gezählt. Das andersartige `.codex-plugin`-Opsmanifest ist keine Pipeline-
  Registration; sein Produktionsservice gehört zu G36.
- **1.408** AST-Discoveryeinträge, **18.058** ergänzende Marker und **565**
  direkte Helmverbraucherstellen unabhängig gezählt. Im korrigierten Index sind
  **105** Dockerfilemarker enthalten. Keine dieser Zahlen beweist semantische
  Feldwirkung oder aufgelöste transitive `$ref`-Felder.
- Historischen Vergleich aus 136 Quellen überprüft: 135 unverändert;
  `decisions.md` weicht wegen D20 ab. Aktueller Index bindet den oben genannten
  vollständigen Commit.
- Tatsächliche Aufrufketten gelesen: `swarm-bundle.ts`/Schemas und Charthelpers,
  Buster Docker-COPY/Entrypoint und Produktionsreader, Registry-
  `configuration.ts`/`schema.ts`, Nova `engine-run.ts`/`engine-snapshots.ts`/
  `stage-executor.ts`/`state/journal.ts`, Projektcompiler, Common HTTP-
  und Secretresolver, Prism Workerenvelope und Designprovider. Zusätzlich
  `.dockerignore`, `runtime-inputs.mjs`, Imageworkflows, Releasekonfiguration
  und Imageprüfcaller gegen das vorgeschlagene C1 geprüft. Die anschließend
  ergänzte G39-Go-Controllergruppe anhand ihrer ENV-/TTL-/HTTP-/LimitRange-
  Consumer in `cmd/buster-namespace-controller/main.go` geprüft.

## Konkrete Findings

### R1 — Indexfilter unterschätzten Liefer-/Versionsquellen; korrigiert

Der erste Collector nahm `versions.json`, Root-Builddateien,
`.github/workflows` und `contracts` nicht in seine aktuelle Hashliste auf.
Dockerfiles wurden zwar gehasht, aufgrund der Suffixliste jedoch nicht nach
ENV-/Policy-/Fallbackmarkern durchsucht. Die Behauptung eines ergänzenden
Docker-Markerscans war deshalb zu weit.

Der Hauptautor hat den Collector erweitert und den Index neu erzeugt, zuletzt
einschließlich `cmd`, `packaging`, `plugins`, `releases`, `.agents`, Go-Quellen
und Dockerignorefiles. Die
oben genannten vollständigen Hash- und Markerprüfungen bestätigen die
Korrektur. Marker bleiben Navigation: dynamische Maps, Shellpositionsargumente,
unaufgelöste Referenzen und Felder ohne Marker werden dadurch nicht fachlich
abgeschlossen. Das steht nun zutreffend als Grenze in der Aufnahme.

### R2 — Chartlieferung ist kein zweiter editierbarer Autor; korrigiert

`charts/prism/files/config/swarm.config.json` und die Komponenten sind
Symlinks auf die kanonischen Dateien unter `charts/kubeclaw/files/config`.
Die anfängliche C1-Formulierung „beide editierbaren Chartbundlequellen“ war
deshalb sachlich falsch. Es bestehen zwei Lieferwege, keine zwei unabhängigen
aktuellen Autoren. Die korrigierte Vorlage trennt beide ausdrücklich. Beim
Packaging bleibt das reale Symlinkziel relevant; zur Laufzeit verbietet der
Loader weiterhin Symlink-Komponenten innerhalb einer physischen Generation.

### R3 — C1 braucht den tatsächlichen Build-/Liefercutover; aufgenommen

Die generelle Angabe „Build-/Packagingcaller“ sollte konkret geschlossen werden:

- `.dockerignore` beginnt mit `**` und erlaubt bei den alten Chartautoren nur
  `swarm.config.json`. Ein neuer `config/`-Root bzw. neues generiertes Staging
  wäre ohne Anpassung aus dem normalen Dockerbuildkontext ausgeschlossen.
- `scripts/updates/runtime-inputs.mjs::isImageInput/isDeploymentInput` kennt
  `config/` nicht. Eine reine Änderung am neuen Autorenroot könnte damit sowohl
  Build- als auch Deploymentauswahl auslassen. `build-images.yaml` und
  `role-images.yaml` verwenden diesen echten Filter. Erforderlich ist eine
  klare Klassifizierung von in Images gelieferten gegenüber ausschließlich
  deploymentgelieferten Komponenten, kein pauschaler Neubuild aller Rollen.
- `scripts/updates/release-configuration.mjs` bindet alte Chartsymlinks;
  `scripts/check-built-runtime-image.sh` mountet die alte Chartconfigwurzel.
  Beide müssen das ausgewählte materialisierte Produktionsartefakt benutzen.

Geforderte C1-Abnahmeergänzung: Eine reine Autoren-/Profilauswahländerung muss
den vorgesehenen echten Build-/Deliverypfad erreichen; Docker-COPY muss die
vollständige gewählte Generation im normalen Kontext erhalten. Release- und
Imageprüfpfade dürfen keine alten Chartautoren zur Laufzeit nachliefern. Keine
neue Infrastruktur nötig. Der Hauptautor hat die realen Caller in C1-Schritt 5
und die Changefilter-/Buildcontext-/Deliverywirkung in C1-E aufgenommen. Beide
Ergänzungen abschließend unabhängig gelesen; das Finding ist auf Ebene der
Entscheidungsvorlage bearbeitet. Die spätere Wirkung ist noch zu implementieren.

### R4 — Feldvollständigkeit bleibt offene Grenze, keine Gesamtbestandsabnahme

G01–G39 ordnen die wesentlichen erkennbaren Repo-Bereiche sinnvoll zu. Bei
G18/G24/G26 und externen Paketen ist jedoch kein vollständiger semantischer
Setting→Autor→Default/Einheit→Consumer→Aktivierung→Abnahmefallnachweis erbracht.
Der Collector notiert lexikalische Fundstellen und `$ref`-Hinweise; das sind
keine tatsächlichen Consumerketten. Der Bericht benennt diese Grenze selbst
und verlangt vor jedem Migrationsschnitt dessen vollständige Consumerclosure.

Für die Entscheidung über die sechs bereits expliziten Komponenten in C1 ist
das vertretbar. Eine Behauptung „sämtliche Settings vollständig geprüft“ oder
eine Gesamt-CONFIG-Promotion wäre nicht gedeckt. Die neuen Gruppen können den
früheren deklarativen Stand ergänzen, ersetzen aber keine abschließende F1-Matrix.

## Ownership, Modulbindung und Recovery

Die sechs heutigen Owner und die strikten Dateinamen sind in
`readSwarmBundle` real; AJV dort ergänzt keine Defaults. G26 stellt den anderen
Fall richtig dar: Registry `resolveReferencedValue` verwendet einen separaten
AJV-Validator mit `useDefaults:true`; bloße `validateReferencedValue`-Aufrufe
ergänzen nichts. Materialisierung aus vollständigen Autoren muss die vorhandene
Defaultauflösung ersetzen, nicht verdeckt weiterführen.

`runNewPipeline` friert den Graphen ein und publiziert den v4-Run-Snapshot mit
Datei- und Directory-fsync vor `executePrepared` und `adapters.start()`.
Recovery vergleicht Graph und Packages sowie die ganze `runtime.configuration`.
`StageExecutor` übernimmt `definition.config`; `attempt.created` dokumentiert
Identität, Owner, Lease-ID und Budget, aber keinen separat gebundenen
Modulconfigdigest. Der vorgeschlagene versionierte Modulvertrag ist deshalb
eine echte notwendige Erweiterung; die vorhandenen Recoverychecks einfach zu
entfernen wäre keine zulässige Lösung.

Der Compiler erzeugt zusammenhängende Implementation/Lint/Review/Test-Stages
mit gemeinsamen Reparaturkategorien; `module.id` ist dabei noch keine universelle
Runtime-Modulemembership. Die vorgeschlagenen Grenzen berücksichtigen das
richtig. Binding vor Dispatch, linearisiertes A/B-Publishing, Wiederverwendung
nach Crash, stabile Grants und unveränderte Budgets/Claims/Fristen sind
vereinbarungskonform. Keine konkurrierende neue Budgetownership erkannt.
FileJournal bietet vorhandene mutexgeschützte, hashverkettete, fsync-gesicherte
Transaktionen als Wiederverwendungsbasis; dauerhafte Closure und einzigartige
Bindings müssen später tatsächlich implementiert und geprüft werden.

Secrets sind besonders klar begrenzt: der heutige Commonresolver liest
unversionierte ENV-Bytes nach einem Namenmapping. Er erfüllt noch keinen
versionierten Recoveryvertrag. Der Vorschlag behauptet das nicht, verlangt
Revisionsbindung und erlaubt ausdrückliche Blockierung bei Retirement/Revocation.
Keine Secretbytes in normale Autoren, Explain oder Snapshots aufnehmen.
Service-/Trust-/Storagewechsel bleiben S/R; Pluginprofile erweitern keine Grants.

## Grenzen der unabhängigen Prüfung

Keine Tests, Helmtemplates, Images, Hosts, Provider oder Evals selbst ausgeführt.
Die lokalen Laufresultate des Hauptautors gehören separat in
`verification.json`; insbesondere ersetzt ein fehlschlagender Assertionsvergleich
keine erfolgreiche Suite. Historische Prüfresultate wurden nicht als aktuelle
Abnahme übernommen. Kein aktives Betreiberprofil, externer Secretstore oder
installiertes externes Plugin wurde unterstellt.

Alle Quellenhashes und Skills-Manifestmengen wurden vollständig überprüft;
semantische Aufrufketten wurden gezielt nach den wichtigsten Ownership-,
Liefer-, Default- und Recoveryrisiken untersucht. Die unabhängige Prüfung
stützt die korrigierte Entscheidungsvorlage bei ausdrücklich offenem R4 und
dem jetzt konkret aufgenommenen Liefercutover R3. Sie autorisiert keine Implementierung;
der Nutzer muss weiterhin dem konkreten C1-Paket zustimmen.
