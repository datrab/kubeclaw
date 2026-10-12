# Erster isolierter CONFIG-Komponentenpatch

Nur Staging, nicht zur unmittelbaren Übernahme freigegeben. Keine Typechecks, Loaderausführung, Tests, Helm- oder Runtimejobs durchgeführt. `files/` enthält die vorgesehenen Zielpfade; `implementation.patch` ist daraus erzeugt. Die ursprüngliche vorab dokumentierte Pflichtmatrix in `docs/review/remediation/implementation/config-component-layout-20260921.md` bleibt verbindlich. Packaging, Consumer-/Fixturemigration und unabhängige Abnahme fehlen ausdrücklich.

## Enthaltener Schnitt

Fünf komponenteneigene Autoren plus `swarm.config.json` als erforderlicher referenzierter Einstieg. Werte aus der bisherigen kanonischen Datei bleiben unverändert. `prism-worker` gruppiert die bisherigen Worker-HTTP-Einstellungen unter `ingress` und den bisherigen nativen Supervisor unter `supervisor`. Control erhält Dispatchtimeout; Prism Execution enthält nur tatsächlich gemeinsame Policy/Ergebnisgrenze. Keine numerischen Code-/Schema-Defaults.

`swarm.schema.json` akzeptiert ausschließlich den neuen Einstieg. `swarm-components.schema.json` definiert streng getrennte Owner/Settings; alte primitive Grenzen und Buster-Bedingungen bleiben erhalten. Die beiden Hostvalidatoren verwenden dieselben Schema-Definitionen, keine neue Wertequelle.

`swarm-bundle.ts` lädt den vollständigen Dateisatz. Er löst den erforderlichen absoluten Einstieg einmal realpath auf und öffnet Komponenten nur im dadurch festgelegten Verzeichnis. Komponenten selbst dürfen keine Symlinks sein; die Chart-Quellsymlinks sind Verpackungseingaben, keine Runtime-Komponentenlinks. FD-basierte Vorher-/Nachherprüfung plus abschließender Dateipfad-/FD-Identitätsvergleich erkennen beobachtbare lokale Änderungen. Die Verzeichnisgeneration darf nicht während des Ladens ersetzt werden; die zugesicherte Grenze ist unveränderliche ConfigMap-Generation beziehungsweise der dokumentierte lokale Stabilitätsvertrag, kein adversarialer ABA-Schutz. Ein bereits vor Start stabiler, einzeln schema-gültiger Dateimix aus manueller Teilpublikation ist damit nicht als gemischte Generation erkennbar. Lokale Betreiber müssen deshalb den vollständigen zusammengehörigen Satz veröffentlichen und während des Ladens unverändert halten; Tests dürfen keine weitergehende Erkennung behaupten. Die K8s-Garantie bindet ausschließlich die tatsächlich aufgelöste ConfigMap-Generation. Kein Hotreload, Suchpfad, Includegraph, manueller Hashindex oder automatischer Retry. Die zurückgegebenen JSON-Komponenten einschließlich aller verschachtelten Settings sind rekursiv eingefroren.

`loadSwarmSettings(environment)` prüft sämtliche alten Prism-/Buster-Autoren, lädt genau einmal und prüft **beide** Domains einschließlich relationaler Budgets, bevor es eingefrorene `{prism,buster,identity}` zurückgibt. Bisherige `loadPrismSettings`, `loadPrismWorkerSettings`, `loadBusterSettings`, `loadBusterPreparationSettings` wählen aus dieser Projektion. Der gemeinsame Loader weist nun auch domainfremde alte ENV-Autoren ab; das ist absichtliche Konfliktablehnung im vollständigen Bundle und in der Migration zu testen.

Die bisher öffentlich inline ladbaren `prismWorkerSettingsFromConfig`, `busterSettingsFromConfig` und `busterPreparationSettingsFromConfig` werden nicht als öffentliche Compatibility-API beibehalten. Private Buster-/Prismprojektoren besitzen keine externen Aufrufer und erhalten nur zuvor vollständig validierte Komponenten. Das sichtbare `operator`-Objekt in dieser privaten Projektion ist kein akzeptiertes Dateiformat. Die echten `validateBusterPreparationSettings`/`validateBusterAdmissionSettings` bleiben für akzeptierte Host-Envelopes/Serviceoptionen erhalten: sie sind Boundaryvalidatoren, keine Auswahl einer neuen persistenten Konfigurationsautorität.

## Exakte Aufruferaufnahme und nötige Anpassungen

`api-callers.json` enthält sämtliche aktuellen textuellen Symbolvorkommen mit Datei, Zeile und Quellzeile in `skills`, `scripts`, `tests`, einschließlich Importen, Definitionen und Aufrufen. `config-consumers.txt` erweitert dies um tatsächliche Konfigurationsdatei-/Schema-/ENV-Lieferstellen in `docker` und `charts`. Diese Erfassung ist eine reproduzierbare Quelleninventur, kein ausgeführter Aufrufgraphbeweis. `baseline-identities.json` bindet deren gelesene Dateien und die ersetzten Livequellen vor jeder späteren Übernahme.

Produktive direkte Loaderaufrufer:

| Datei | Erforderliche Anpassung |
|---|---|
| `skills/prism/server/control-config.ts` | expliziter `SWARM_CONFIG` aus Entrypoint/Chart; bestehendes einmaliges load im Compositionpfad behalten; kein erneutes Laden einzelner Komponenten während Signing-I/O |
| `skills/prism/server/studio-config.ts` | expliziter Einstieg; Studio bekommt vollständiges Bundle, behält bisherigen Settings-Typ |
| `skills/prism/server/worker-config.ts` | expliziter Einstieg; eine Startupprojektion weiterreichen; separates `workerIngressLimits` weiterhin eigenständiger Utilityaufruf, nicht zusätzlich in denselben Startup einbauen |
| `skills/buster/engine/remote-plan-cli.ts` | expliziter Einstieg ist schon über `process.env` verdrahtet; Chart/Image müssen nun sämtliche Komponenten liefern; keine lokale Ersatzauthorität |
| `skills/buster/engine/test-gates/preparation-supervisor.ts` | vollständiges Bundle beim Supervisorstart; akzeptierte Hostoperation erhält wie bisher den validierten Einstellungssnapshot, lädt nicht noch einmal extern |

Boundaryvalidatoren bleiben unverändert aufrufbar in `preparation-native-phase.ts`, `preparation-host.ts`, `remote-plan-service.ts`, `preparation-cleanup-host.ts`, `preparation-historical-host.ts`, `preparation-cleanup-validation.ts`. Diese Dateien werden durch den Stagingpatch nicht geändert. Änderungen an BC-Dateien erfolgen separat durch Root/BC-Autor.

Zwingende Fixtures-/Testmigration (noch nicht implementiert):

- Sämtliche in `api-callers.json` erfassten Tests mit `SWARM_CONFIG` müssen ein vollständiges Bundle liefern. Eine allein geschriebene alte JSON-Datei ist absichtlich ungültig. Mutationen ändern die eigene Ownerdatei; fehlende Werte werden weiterhin getestet, nicht durch Fixturedefaults ergänzt.
- `tests/fixtures/test-gate/modeled-preparation.mts`, `tests/verification/reliability/buster-preparation-identities.test.mts`, `buster-preparation-ledger.test.mts`, `buster-extraction-concurrency.test.mts`, `buster-shutdown-storage.test.mts`: direkte Inline-FromConfig-Aufrufe auf expliziten vollständigen Testbundle-Loader umstellen. Bestehende gezielte Hostsettings-/Faultbudget-Validatoren bleiben; keine Abschwächung ursprünglicher Assertions.
- `tests/verification/e2e/support/platform-config.ts`: Inline-`prismWorkerSettingsFromConfig(rawConfig)` durch Prüfung des tatsächlich geschriebenen vollständigen Testbundles ersetzen; keine wieder öffentlich eingeführte Inline-Kompatibilität.
- `tests/fixtures/test-gate/buster-admission.mts`, `skills/prism/tests/swarm-*.test.mts`, native `resource-policy.mts`/`operation-journal.mts`: Besitzerdateien gezielt mutieren, Aufruferpfad explizit setzen, alle bisherigen Fehler- und Verhaltensfälle erhalten.
- `tests/verification/contracts/check-pipeline-remote-runtime-config.mts`, Deployment-Render-/CLI-/Imagefälle und sämtliche breiter in `config-consumers.txt` erfassten Dateileser: vollständigen Lieferumfang statt Einzeldatei prüfen. Unveränderte Tests nicht als automatisch kompatibel behaupten.

## Noch fehlende Lieferkette und Gates

Prism Chart: fünf neue Quellsymlinks, strikte Helmprojektion, vollständige ConfigMap und alle Komponenten in Rolloutchecksum. Kubeclaw: Inline-`swarmConfigJson` ablehnen; vollständige ConfigMap; bisherige einzelne Kopie/Runtime-Webhooktransformation und Buster-`subPath`-Mount kontrolliert ersetzen. Bestehende andere Nutzer dieses Formats vorher vollständig zuordnen. Keine stillschweigende Änderung ihrer Semantik.

Buster-Dockerfile: vollständiger COPY-Satz und expliziter Einstieg. Studio-Dockerfile: kompletter Bundle-Bindmount im echten Endimagegate. Control/Worker erhalten Konfiguration bisher aus Chartmount, kein neuer Imagefallback. `scripts/updates/release-configuration.mjs` muss sämtliche Symlinks binden. Gemeinsamer Schema-COPY muss die zusätzliche Komponentenschemadatei enthalten. Packageänderungen ausschließlich nach Rootkoordination.

Vor Zusammenführung: gemeinsame vollständige Caller-/Chart-/Image-/Testmigration, zwei tatsächliche Profile, Generation-/Konflikt-/Missingfieldfälle, alle Originalfälle und konkrete Fallback-/Verpackungsmutanten, vollständige Vorher-/Nachherbindung, unabhängige Prüfung. Dieser erste Patch ist trotz kohärentem Loader **kein installierbarer Komplettstand**, kein grüner Gate und keine CONFIG-Abnahme. Orchestrator-/Plugin-/Worker-Core-Restinventur bleibt wie im Entwurf offen.
