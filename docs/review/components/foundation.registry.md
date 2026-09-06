# foundation.registry — Entdeckung, Auswahl und Aktivierung

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Prüfart: vollständiger Code- und Schnittstellenreview; lokale Originaltests, getrennt von Livebetrieb.

## 1. Verantwortung, Grenzen und tatsächliche Verwendung

Alle 16 Dateien unter `skills/common/plugin-runtime/foundation/registry/` untersucht:
Discovery, Digest, Schema, Build, Configuration, Capabilities/Vocabulary,
Activation, Import-Audit samt Child, FrozenMap/Set, Types, Errors und README.
`skills/nova/core/execution/engine-runtime.ts:29–41` ruft Discovery → Build →
Grantauflösung → Konfigurationsprüfung → Aktivierung auf. Die Stageauswahl kommt
vom Pipelinegraphen, Observer und aktive Adapter aus der Plattform (44–50).
`skills/buster/engine/test-gates/production.ts:118–127` baut dieselbe Registry,
führt Provider/Reportadapter aber über eigene isolierte Loader aus. Core/src
exportiert die Registry; keine zweite Registryimplementierung dort.
Installer benutzt Build für Paketvollständigkeit. Es handelt sich um aktive
Produktpfade, nicht bloß vorbereitete v2-Migrationsbausteine.

## 2. Eingaben, Ausgaben und Übergaben

Operator kontrolliert kanonische Installations-/Trustroots, externe Digest-
oder bereits verifizierte Attestationszuordnung und Grant-/Providerpolicy.
Pipeline darf nur Stage-Typen und schemageprüfte Config wählen. Discovery liest
unmittelbare Paket-Unterverzeichnisse mit plugin.json ohne Executable-Import,
kanonisiert Roots und lehnt doppelte Rootaliases/Paketidentitäten ab.
Digest bindet relative Dateinamen, Größen und Inhalte; Symlinks werden abgewiesen.
Build prüft reale Modul-/Schemaspfade innerhalb des Pakets, Konflikte zwischen
Registrierungsflächen, globalen Stagebesitz, Providercontract-IDs, Portnamen,
Evidence-Defaults und Reportformate. Snapshot liefert unveränderbare Maps und
registrierungsbezogene Provenienz. Mehrere Adapter je Reportformat sind erlaubt;
Buster muss einen exakten Kandidaten auswählen.

Nova erhält Stage-/Observerfunktionen sowie Adapterfabriken. TestProvider und
ReportAdapter gehören bewusst nicht zu `activateRegistry`: `provider-loader.ts`
prüft Digest und kopiert ein verifiziertes Paket pro Attempt (43–79, Loader am
Dateiende); `report-adapter-runtime.ts:277–321` prüft Input-/Paketdigest, kopiert
und validiert den gebundenen Resultcontract. Deren vollständige Prozessprotokolle
sind Gegenstand von buster.engine; hier die Registryübergabe beidseitig geprüft.
Providerkonfiguration verwendet eigene Defaultvalidierung plus Schemadigest.
Nova prüft Config ohne Defaults. Das sind verschiedene erklärte Verträge.

## 3. Zustand, Persistenz und Nebenwirkungen

Snapshots, Validatorcaches und geladene Module liegen im Prozess. Discovery/Build
lesen synchron, schreiben keine Paketdateien und stellen keine dauerhafte
Aktivierungstransaktion her. Registry-Rückgabe ist erst nach allen Aktivierungen
vollständig; Adapterinstanz-Start/Readiness/Rollback gehört Nova.execution.
Ajvinstanzen und Validatorcaches sind modulglobal und nicht snapshotgebunden:
PCR-REGISTRY-001. Trusted Hostimports werden von Node gecacht; Hotreload ist
nicht implementiert und sollte nicht durch implizites Paketüberschreiben erfolgen.

## 4. Korrektheit und Fehlerbehandlung

RegistryError besitzt unterscheidbare Codes und Details; JSON-/Schemaparsefehler,
Referenz-/Trust-/Integritätsfehler brechen den Start ab. FrozenMap/Set kapseln
mutierbare native Collections; Grantlisten und Constraints werden geklont und
gefroren. Ein expliziter Provider ist auch bei einem einzelnen Kandidaten nötig;
mehrere Kandidaten ohne Auswahl ergeben Ambiguität. Transitive Adapterrequirements
werden bis zum Fixpunkt aktiviert, Zyklen abgewiesen, Grants an deaktivierte oder
nicht angeforderte Capabilities verboten. Keine Grantvererbung an Geschwister.
Leere Manifeste können vorgelagert passieren: [PCR-CONTRACT-PLUGIN-001](contract.plugin-system.md).

## 5. Timeouts, Abbruch, Wiederholung und Parallelität

Pro trusted Module/Export startet ein synchroner Auditprozess mit 30s Timeout;
kein übergreifendes Startupbudget oder AbortSignal. Hashing/Schemaübersetzung
blockieren den Hosteventloop und besitzen hier keine Datei-/Paketmengenlimits.
Parallel aufgerufene Vorbereitungen teilen Validatorcache und Nodeimportcache.
Wiederholtes Build mit `$id`-Schema schlägt reproduzierbar fehl (Befund unten).
Runtime-Retries/Leases liegen oberhalb der Registry; keine Exactly-once-Zusage.

## 6. Neustart und teilweise abgeschlossene Aktionen

Nach Prozessneustart werden Registry/Grants aus aktuellen Dateien neu erstellt.
Unveränderliche Pakete und vom Betreiber kontrollierte Roots sind Annahmen.
Digest wird vor und nach Importaudit erneut geprüft. Trusted Imports im Host
können prinzipiell kontextabhängige Importeffekte haben; eine fehlgeschlagene
spätere Registrierung macht vorherige Hostimporte nicht rückgängig. Der Audit
ist eine Prüfung vertrauenswürdigen Codes, keine Sandbox gegen dessen absichtliche
Umgehung. Externe Stage-/Observerausführung verwendet foundation.isolation.

## 7. Authentifizierung, Autorisierung und Trust

Keine Netzwerkauthentifizierung hier. Attestationswerte sind schon verifiziert
anzuliefern, Registry prüft keine Signatur. Closed Capabilityvocabulary umfasst
24 IDs, Operationen/Resourcetypen und genaue Constraintschlüssel. Absolute Pfade,
Repo-relative Prefixes und kanonische HTTP Origins werden normalisiert geprüft;
tatsächliche Resource-/Payloadautorisierung erfolgt erneut in
`nova/core/execution/authorization.ts:124` und Kontextaufruf.
Buster-Providercapabilities sind ein eigener TestGate-Vertrag und dürfen nicht
blind gegen Novas Vocabulary geprüft werden. Externe Adapter werden abgewiesen;
externe Stage-/Observerfunktionen werden erst isoliert aufgerufen.

Importaudit nutzt Node Permission Model mit Leserecht, ohne Schreib-/Child-/Worker-
Rechte, entzieht Netz-/Timer-/Processoperationen und prüft Globalzustand, Export
und Erfolgsmarker. Alle drei Nova-Flächen eines aktivierten trusted Pakets werden
geprüft, auch inaktive Geschwister. 30s Timeout und Spawnpuffer begrenzen den Child,
aber keine harte gesamte Aktivierungsressource. Nodeversion/Permission-Support
und vertrauenswürdige Rootdateirechte sind Infrastrukturannahmen.

## 8. Ressourcen, Aufräumen und Aufbewahrung

Keine Netzwerkressource oder dauerhafte Storageverwaltung. Globaler Ajvcache wächst
mit Schema-Identitäten/Pfaden, kein Dispose; Hashing liest jede Datei vollständig.
Installergrenzen helfen nur installierten Paketen, nicht beliebigen Builtinroots.
Für langfristige Mehrfachvorbereitung sollten Validatoren Snapshotlebensdauer und
Digest folgen. Audit-Kind wird durch spawnSync-Zeitlimit beendet; komplette
Sandbox-/Cgroupprüfung gehört foundation.isolation, keine Infrastrukturänderung.

## 9. Architektur und Vereinfachung

Gemeinsame Registry trennt Registrierung und Ausführung sinnvoll. Globale
Validierung und prozessweiter Schemacache brechen jedoch die Snapshotabstraktion.
Ein Registry-eigener Validatorbestand, an Digest gebunden und weitergereicht,
ist dauerhaft einfacher als Cache-Shims. Provider-/Reportflächen bleiben
explizit in ihren Loaderruntimes; keine künstliche Nova-Adapterkompatibilität.
Dicht gepackte Capability-/Buildfunktionen erschweren die Prüfung; spätere
lesbare Aufteilung sollte Verträge erhalten.

## 10. Tests und Aussagekraft

Gelesen und ausgeführt: check-plugin-system-v2-registry.mjs (reale temp Pakete,
Digestmutation, Exportfehler, synchrone/async FS-, Prozess- und DNSimporteffekte),
check-pipeline-test-provider-registry.mts (Provenienz, Schema, Konflikte, Freeze,
Evidence, Digest), check-pipeline-report-adapter-registry.mts (Mehrfachformate,
Sortierung, Referenzen), check-plugin-system-v2-capability-security.mjs (24
Capabilities, Grants, Zyklen, reale Symlinkpfade; Dispatch-Sink ist testseitig
synthetisch). Kein realer externer Adapter-/Providerbetrieb dadurch bestätigt.
Ergebnisse in [registry-tests.txt](../evidence/registry-tests.txt).

check-plugin-system-v2-import-safety.mjs importierte echte installierte Nova-
Registrierungen, scheitert danach an Observerzahl 5 statt6; spätere Adapterzahl-
Assertion nicht erreicht. Gleiche Ursache wie [PCR-TELEM-001](nova.telemetry.md),
kein neuer Befund. Zusätzlicher Originalschema-Repro bestätigt PCR-REGISTRY-001.
Phase11/External-engine gehören Isolation/Packages/Execution; sie sind hier kein
behaupteter bestandener Test. Fehlend: mehrfacher Registryaufbau mit `$id`,
Snapshot-Isolation bei Schemaänderung, Auditgesamtbudget und Hostimport-Rollback.

## 11. Dokumentationsabweichungen und ältere Reviews

Registry-README Startup-/Authorityabschnitte treffen den untersuchten Pfad;
Migration behauptet weiterhin v1 als alleinige Produktionsautorität, obwohl
engine-runtime und Buster production die v2-Registry aufrufen. Das ist veraltet.
„Does not grant capabilities“ muss als keine eigene Policyhoheit präzisiert
werden: resolveCapabilityGrants setzt Operatorpolicy tatsächlich um.
Referenzseiten und Phase5-Capabilitymapping sind Orientierung, Securitytest prüft
Mapping und generiertes Inventar gegen die echte Registry. Alte Clean-/Release-
Aussagen werden wegen überholter Importtestzählung nicht übernommen.
Dokumentationsstatus: veraltet und unvollständig (Caches, Wiederaufbau, getrennte
Buster-Aktivierung und Budgetannahmen fehlen).

## 12. PCR-REGISTRY-001 — Globale Ajv-ID verhindert erneuten Registryaufbau

- **Schweregrad: mittel.** Gültige Plugin-Konfiguration mit `$id` kann im selben
  langlebigen Prozess nur einmal registriert werden; weiterer Start/Build bricht
  ab. Die Auswirkung ist Verfügbarkeit, keine nachgewiesene Rechteausweitung.
- **Einordnung: nachgewiesener Defekt.** `schema.ts:31–40,64–83` hält Ajv global,
  parst Schemas bei jeder Registrierung in neue Objekte und compile ruft addSchema
  mit derselben `$id` erneut auf. `build.ts` registriert referenzierte Schemas
  pro Paket bei jedem Build; Nova `prepareRuntime` baut pro Vorbereitung neu.
- **Auslöser:** zweimal dasselbe gültige Schema mit `$id` über
  validateReferencedSchema laden. Zweiter Aufruf wirft REGISTRY_MANIFEST_INVALID
  mit „schema with key or id … already exists“. Originalrepro
  [registry-schema-reload.mjs](../evidence/registry-schema-reload.mjs), keine Ajv-
  Ersatzimplementierung. Aktive Builtins brauchen nicht alle solche referenzierten
  IDs; eine flächendeckende aktuelle Produktionsstörung wird nicht behauptet.
- **Ursachenbehebung:** Validatorinstanzen/Referenzen an unveränderlichen
  Registrysnapshot bzw. geprüften Schemadigest binden. Gleiche Inhalte sicher
  wiederverwenden, Änderungen in neuem Snapshot isolieren; keine pauschale
  Fehlerunterdrückung und kein Entfernen gültiger `$id`-Informationen.
- **Regression:** reales Paket mit referenziertem `$id`-Schema zweimal entdecken,
  bauen und Config validieren; beide Starts erfolgreich und gleicher Digest.
  Danach neue Paketversion mit verändertem Schema: neuer Snapshot wendet neues
  Schema an, alter Snapshot bleibt unverändert. Ebenfalls zwei getrennte Pakete
  mit gleichlautender ID und verschiedenem Inhalt auf definierte Konfliktregel
  prüfen. Bisher Repro auf Originalschemafunktion; kompletter Mehrfachstarttest
  und geänderte Snapshotvalidatoren nicht ausgeführt.

### PCR-REGISTRY-002 — Securitytest erreicht seine Autorisierungsfälle nicht

- **Niedrig, nachgewiesener Testdefekt:** vorhandener Sicherheitstest bricht vor
  seinem Zyklus- und 24-Capability-Dispatchblock ab; das ist eine Nachweislücke,
  kein Nachweis einer produktiven Autorisierungsumgehung.
- **Beleg/Auslöser:** check-plugin-system-v2-capability-security.mjs:163–180
  erwartet Ambiguität für artifacts.write, aktiviert project-summary aber ohne
  dessen zuerst angeforderte artifacts.read-Providerauswahl. capabilities.ts:110
  liefert deshalb REGISTRY_CAPABILITY_PROVIDER_MISSING, Assertion scheitert.
  Originalausführung Exit1 in registry-tests.txt. Vorherige Mapping-/Lintgrant-
  Assertions liefen; die späteren Symlink-/Invocationfälle wurden nur gelesen.
- **Ursachenbehebung:** den Ambiguitätsfall mit vollständigen echten sonstigen
  Grants/Providern aufbauen und Zielcapability isoliert variieren. Sicherheits-
  fälle unabhängig testbar machen, damit ein Bestandsdrift nicht alle verdeckt.
- **Regression:** unveränderte Produktimplementierung mit korrigierter Policy-
  Fixture des echten Registrytests; anschließend gesamte Autorisierungsmatrix
  ausführen. Kein Entfernen der produktiven artifacts.read-Anforderung oder
  Ersatzprovider, um die bisherige Fixture grün zu bekommen.
