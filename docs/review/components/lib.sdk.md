# lib.sdk — Öffentliche Plugin-API und Wertfunktionen

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Review-Schema Revision 2. Alle handgeschriebenen SDK-Dateien, generierten
öffentlichen Typformen, Generator, package.json und Buildkonfiguration untersucht.

## 1–2. Verantwortung, Verwendung und Schnittstellen

`skills/common/plugin-runtime/sdk/src/index.ts` exportiert Schema-Typen,
Wertfunktionen, Agent-Task-Formatierung und Source-Revision-Auflösung.
`runtime.ts` definiert CapabilityInvocation, PluginInvocationContext, Adapter-
Lifecycle/Fence/ConfidentialInvocation, EffectJournal, ObserverHandler,
TestProvider und ReportAdapter. Keine eigene Registrierung oder Service.
Exports `.` und `/testing` des Workspace-Pakets `@kubeclaw/plugin-sdk`;
Testing enthält lediglich assertNever, keine simulierte Runtime.

Gegenstellen: Core.context liefert leasegeprüftes invoke/emit/artifact;
Adapter erhalten AbortSignal und Fence oder ausdrücklich confidential ohne
Fence. Registry aktiviert Factories, Core verwaltet Effektquittungen.
Report-Adapter erhalten Bytes/Anzahlgrenzen, Provider Workspace/Signal/Log/
Capabilityaufruf. Typen validieren Werte nicht. generated/contracts.ts bildet
if/then teilweise als breite Typen ab, etwa optionales error bei failed receipt
und beliebiges trustEvidence. Laufzeitschema bleibt verbindlich.

source-revision.ts wird von buster-quality-gate, lint, review und project-summary
aufgerufen. Wahl: explizites 40-/64-stelliges Git-Objekt oder genau ein
Implementationartefakt der jüngsten Stageattempt desselben Runs. artifacts.read
get_json erhält Digest/Namespace; Antwortdigest, Größe und kanonische Bytes
werden gemeinsam geprüft. ready_for_testing ist Pflicht. Reparaturen bewahren
erste headBefore-Basis und jüngsten Kandidaten. Leere/mehrdeutige Mengen und
falsche Digests scheitern. Git-Existenz/HEAD prüft Repository/Review; kein
Rückfall auf ambient HEAD.

## 3–6. Zustand, Fehler, Wiederholung und Neustart

Keine eigene Persistenz, Sperren, Queue oder Retryschleife. Revisionauflösung
liest immutable referenzierte Artefakte; Store muss diese aufbewahren. Fehler
sind Missing/Ambiguous, Corrupt oder RevisionInvalid. Abbruch/Leasezeit liegt
bei context.invoke im Core, kein zweiter SDK-Timer. Wertfunktionen sind synchron;
canonicalJson rekursiert ohne Zyklus-/Tiefenlimit. Wiederaufnahme benötigt
identische Serialisierung und verfügbare Artefakte. runtime-agent-task.ts
formatiert die Anweisung zum atomaren Ergebnisfile; kein eigenes Rename und
keine Agent-Ausgabevalidierung.

## 7–9. Vertrauen, Ressourcen und Vereinfachung

Node crypto/Buffer und Test-Gate-Typen, keine konkrete Core-/Pluginimplementation
importiert. Infrastruktur: TS-fähige Node-Runtime bzw. Buildpfad; autorisierter
Artefaktspeicher für Revisionen. Resultpfad maximal 2048 UTF-8-Bytes. Gesamtprompt
begrenzt runtime-dispatch/openclaw.ts:119–129. Prompttext ist weder Isolation
noch Pfadautorisierung. Redaktion: Tiefe 16, Arrays/Objekte 1000 Einträge,
Strings 65536 Zeichen, sensible Schlüsselnamen maskiert. Freitextgeheimnisse
unter anderen Schlüsseln werden nicht erkannt; kein Beweis sicherer Rohlogs.
Keine Retention außer in aufrufenden Stores.

Implementation-Revisionauflösung koppelt allgemeines SDK an konkreten Namespace/
Status. Langfristig expliziten kleinen Source-Evidence-Vertrag herauslösen,
keinen zusätzlichen Kompatibilitätspfad. SDK, Worker-/Observabilityverträge,
Snapshotcore und ungenutztes prompt-contract serialisieren unterschiedlich.
Ein versionsbewusster gemeinsamer Datenvertrag ist einfacher als stilles
Austauschen unter bereits persistierten Digests.

## 10. Tests und Nachweise

Gelesen und unverändert ausgeführt: review-candidate.test.mts (2 echte Git-Repos
SHA1/SHA256, echter durable Artefaktadapter, echte Reviewvorbereitung; direkt
zusammengesteckter Context ohne produktive Lease-/Fenceprüfung),
review-prompt-budget.unit.test.mjs (reale Formatierung/Tokenisierung, kein Agent),
Generator --check und Plugin-Vertragsskript. Alle vier bestanden.
SDK-Abschnitt des Boundarytests untersucht, kein kompletter Boundary-Lauf
behauptet. Keine dedizierte Pakettestsuite für values.ts gefunden.
Deklarierter Paketbuild **fehlgeschlagen**, PCR-SDK-002.
[Ausgaben](../evidence/plugin-contract-sdk-tests.txt).

## 11. Dokumentation und historische Befunde

SDK-README unvollständig: keine Serialisierungs-/Redaktionsgarantien, Fehlercodes,
Source-Revision-/Agent-Task-API oder Buildanleitung. Testing-Helfer beschränken
sich auf assertNever. pipeline-reliability-remediation.md:109–111 beschreibt
Artefaktbindung/Reparaturbaseline: durch Originalcode und erneut gelaufene
Git-Tests bestätigt, keine Agent-Endabnahme. „Canonical“ darf nicht ungeprüft als
portables JSON-Normalisierungsprotokoll verstanden werden.

## 12. Befunde

### PCR-SDK-001 — Serialisierung erzeugt ungültige oder kollidierende Daten

- **Mittel, nachgewiesener Defekt:** Funktion in aktiven Artefakt-/Effektpfaden;
  kein bisheriger Produktionsvorfall mit normalen JSON-Eingaben behauptet.
- **Beleg:** src/values.ts:42–51: map/join, undefined→null, localeCompare;
  ArtifactStore.adapter.ts:108–135 speichert diese Bytes als application/json,
  Core.effects/identity.ts:5–24 vergleicht so Payloads. unknown ohne JSON-Prüfung.
- **Auslöser/Ablauf:** in-process Array(2) ergibt ungültiges `[,]`;
  `{x:undefined}` und `{x:null}` identische Bytes. Originalfunktion tatsächlich
  ausgeführt: [Reproduktion](../evidence/plugin-contract-sdk-repro.mjs).
- **Auswirkung:** ungültige JSON-Artefakte bzw. verschiedene Nicht-JSON-Payloads
  bei Idempotenz gleichgesetzt. Voller Adapterfehlerpfad ist Code-Trace, kein
  hier gelaufener E2E-Test. Localeordnung zusätzliches Portabilitätsrisiko,
  noch nicht durch mehrere Umgebungen gemessen.
- **Ursachenbehebung:** akzeptierten JSON-Datenbereich validieren, Sparsearrays,
  nichtendliche Zahlen, Getter, exotische Objekte/Zyklen ablehnen und
  sprachunabhängig ordnen. Persistierte Digestversionen kontrolliert umstellen;
  kein stiller Fallbackserializer.
- **Regression:** Originalserializer-Negativ-/Localevektoren; echter
  ArtifactStore put/get und EffectJournal-Replay dürfen weder ungültige Bytes
  quittieren noch verschiedene akzeptierte Payloads gleichsetzen.
  [PCR-PROMPT-001](lib.prompt-contract.md) betrifft getrennten ungenutzten Code,
  nicht denselben Laufzeitpfad.

### PCR-SDK-002 — Deklarierter Workspacebuild nicht ausführbar

- **Niedrig, nachgewiesener Defekt:** Entwickler-/Paketbuild blockiert;
  Root-Buildpfad nicht pauschal als defekt eingestuft.
- **Beleg:** package.json:6 ruft `tsc --noEmit -p tsconfig.json`; vorhanden ist
  nur tsconfig.build.json. Root package.json:156 nutzt letztere.
- **Auslöser/Auswirkung:** `npm run build --workspace @kubeclaw/plugin-sdk`
  endet mit TS5058/Exit 1. Fehlende Konfiguration, kein fehlendes externes Tool.
- **Ursachenbehebung:** Paket-/Rootscript auf beabsichtigte gemeinsame
  Buildkonfiguration ausrichten, keine divergierende Konfigkopie.
- **Regression:** beide echten Buildaufrufe aus sauberem Checkout; deklarierte
  Ausgaben bzw. beabsichtigte reine Typechecks überprüfen.

Offene Nachweise: Negativregressionen nach späterer Reparatur, isolierte Agent-/
Providerlaufzeit und Clean-Install. Keine fehlenden SDK-Implementierungsprüfpfade.
