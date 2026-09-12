# foundation.config — Vertrauenswürdige Plattformkonfiguration

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Review-Schema Revision 3. platform.ts (68 Zeilen), platform.schema.json
(106 Zeilen), README und direkter Platform-Vertragstest vollständig gelesen.

## 1–2. Verantwortung, Entrypoint und Schnittstellen

`skills/common/plugin-runtime/foundation/config/platform.ts:61` exportiert
loadPlatformConfig über Foundation-Subpath. Er liest eine externe Betreiber-
JSONdatei, validiert pipeline-platform.v2, löst drei Top-Level-Pfadfelder und
friert die gesamte Struktur rekursiv ein. Nicht Projektgraph oder Pluginmanifest.
Aktiv: Nova Core-/Projekt-CLI; Buster.production lädt dieselbe Plattform für
Discovery/Trust, Produktions-E2E-Harness nutzt Loader zur Runtimevalidierung.
Konkrete Aufruferabschnitte cli.ts:48–53, project/cli.ts:26–30,
buster/engine/test-gates/production.ts:118–129 untersucht.

Plattform umfasst Installation/TrustedRoots, explizite Digest-/Attestationtrust-
Maps, Providerwahl, Grants, Adapter-/Observerconfig, aktive Adapter, Storage,
Shutdown-/EffectLockzeit und administrativ erlaubte Issuer. Schema außen
geschlossen, pluginabhängige Config und Grantconstraints absichtlich offen.
prepareRuntime:29–46 gibt Trust an discovery, Auswahl/Grants an Capability-
Resolver und aktivierte Config an Registry.configuration zur jeweiligen
Schemavalidierung. Loader bestätigt daher Struktur, keine Existenz eines
Providers oder semantische Vollständigkeit seiner Grants. Graph darf keine
Installations-/Plattformautorität hinzufügen.

## 3–6. Zustand, Fehler, Wiederholung und Neustart

Nur synchrones Lesen/Parsen/Validieren; keine Writes, Netzwerkaufrufe oder
Aktivierung im Loader. realpath(file) legt tatsächliches Dateiverzeichnis als
Basis fest. installationRoots, trustedBuiltinRoots und storageRoot werden
absolut; Pfadstrings in adapters/observers sowie Source-Digest-Mapkeys bleiben
unverändert und gehören ihren eigenen Verträgen. Configsymlink verwendet also
das Zielverzeichnis, nicht das Verzeichnis des Links.
Fehler von realpath/read/JSON/Ajv propagieren vor Aktivierung. Kein Cache des
Plattformwerts, keine automatische Wiederholung, kein Abbruchsignal und keine
Hotreload-Semantik. Bei Neustart neue Datei lesen; identische Runtime/Package-
Pins beim Wiederanlauf prüft Engine-snapshots, nicht dieser Loader.
Einfrieren verhindert Mutation normaler aus JSON geladener Strukturen;
private TypeScript-Aufrufer können PlatformConfig auch ohne Loader konstruieren.

## 7–9. Vertrauen, Ressourcen und Architektur

Betreiberdatei ist Vertrauenswurzel. verifiedAttestations enthält behauptete
bereits verifizierte Digests, Loader führt keine Signaturprüfung aus. Auswahl
vertrauenswürdiger Builtinroots ist weitreichende Codeautorität, nicht aus
Projektinput ableitbar. Schutz/Provisionierung der Datei und deren Speicherpfade
ist Infrastrukturfolgeprüfung; keine Betriebswerte/Secrets hier übernommen.
Keine Secretsauflösung im Loader. Generische Adapterconfig darf sensible Werte
tragen; Konfigurationssnapshots/Logausgabe müssen ihre eigenen Grenzen prüfen.

Kein Dateigrößen-/Tiefenlimit vor JSON.parse/deepFreeze, synchroner Startupaufwand
abhängig von Betreiberdatei. EffectLockTTL 60s..24h, Shutdown nur Mindestwert1;
praktische Grenzen setzt Operator. Keine eigene Retention oder Ressourcenleases.
Kleiner Loader mit separater Registrysemantik ist sinnvoll. Dokumentation sollte
Top-Level-Pfadauflösung von adaptereigenen Pfaden explizit unterscheiden;
kein heuristisches rekursives Umschreiben beliebiger Configstrings empfehlen.

## 10. Tests und Aussage

`check-plugin-system-v2-platform-config.mjs` vollständig gelesen, unverändert
bestanden: echte temporäre Plattformdatei, relative Roots, verschachteltes Freeze,
EffectTTL-Untergrenze, verbotene projectInstallationRoots und entsprechende
Graph-Autoritätsablehnung. [Log](../evidence/platform-config-tests.txt).
Keine Mocks, kein Netzwerk, keine neu ausgelöste CI. Produktionsharness nur
Aufrufseite gelesen, nicht als komplett ausgeführter E2E-Test ausgegeben.
Fehlende gezielte Nachweise: Symlinkdatei-Basispfad, ungültiges JSON, sehr große/
tiefe Betreiberdatei, semantisch falsche Provider-/Grantconfig am vollständigen
Startup. Letzteres Gegenstand Registry-/Executiontests, nicht Schemaalleingarantie.

## 11. Dokumentation

Lokale README umfasst nur eine Zuständigkeitszeile; unvollständig zu Loader-
Entrypoint, Pfadsemantik, Trustautorität, unveränderlichen Snapshots, Grenzen
und Neustart. Sie nennt auch Graph/Policy, deren semantische Prüfung tatsächlich
anderen Dateien gehört. Keine lokale historische Fehlerliste gefunden; bestehende
Vertragstestbelege erneut geprüft statt ältere Suiteerfolge übernommen.

## 12. Ergebnis und offene Verifikation

Kein neuer isolierter Defekt bestätigt. Vertrauensgrenze ist Betreiberkonfig,
nicht untrusted Projektinput. Weitere reale Negativtests sollten den Original-
Loader und prepareRuntime verbinden, um abgelehnte Grants/Config vor jeglichem
Pluginstart nachzuweisen. Keine ungelesenen Pfade innerhalb dieser kleinen
Komponente; Infrastrukturrechte und komplette Boot-/Recoverypfade bleiben
separaten Eigentümern bzw. Folgeauftrag zugeordnet.
