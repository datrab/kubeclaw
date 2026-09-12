# kubeclaw.state-store — dauerhafte Plugin-Zustandsstreams

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1. Verantwortung, Grenzen und tatsächliche Nutzung

`skills/common/plugins/state-store/plugin.json` registriert Adapter `state` über
`src/adapter.ts#activate`, Capabilities `state.read` und `state.append`.
Das Nova-Rollenmanifest liefert ihn aus. Konkreter Produktionsaufrufer:
`skills/nova/plugins/blueprint-sync/src/stage.ts:32–35` schreibt
`blueprint.controls.synced` in `kubeclaw.blueprint-sync`.
Kein Produktionsaufrufer von `state.read` gefunden. Die Registry/Plattform muss
die Capabilities zuordnen; der bestehende Blueprint-Test vollzieht genau diesen
Aufruf über echten Runner, Registry, AdapterRuntime und EffectCoordinator nach.
Der separate `PluginStateJournal` aus Nova-Core ist kein Backend dieses Adapters.

## 2. Eingaben, Ausgaben, Schemas und Gegenstelle

Config-Schema: `schemas/config.schema.json`, verlangt root; positive Integer für
maxEntryBytes, maximumRecords, maximumStoreBytes. Aktivierung prüft dieselben
Grenzen. Read verlangt `state.read`/`read`; Append `state.append`/`append` und
Objekt-Payload. Namespace wird auf Segmente aus Kleinbuchstaben/Zahlen/Punkt/
Unterstrich/Bindestrich geprüft und als `state/<namespace>` an den Record-Store
übergeben. Dessen Identity-Limit beträgt 256 Zeichen einschließlich Präfix.

Append liefert `{appended, entry}`; entry ist `plugin-state-record.v2` mit
Sequenz, Idempotenzschlüssel, Commit-Zeit und Payload. Backend-Payload ist
`plugin-state-value.v1`. Blueprint ignoriert den Rückgabewert und erwartet nur
dauerhafte Bestätigung; Format und Operation stimmen überein. Read liefert
`{entries}`. Fachliche Payload-Schemas gehören dem Schreiber.

## 3–4. Zustand, Commit und Fehler

Backend: `FileDurableRecordStore`, Datei `root/records/store.json`, global für
alle Streams dieses Roots. Neues Record wird unter Kernel-flock geschrieben,
Datei und Verzeichnis werden fsynced, dann bestätigt. Readiness liest den Store
und validiert seine Record-Sequenzen/Digests. Keine Datenbank und kein Redis.

Doppelte Idempotenz mit gleicher kanonischer Payload liefert das Original;
abweichende Payload scheitert. Vorprüfung liest den Stream; die autoritative
zweite Prüfung findet unter Backend-Lock statt und verhindert Doppelappend
auch zwischen Vorprüfung und Commit. Store-Größen-/Konfliktfehler werden auf
STATE_ENTRY_SIZE_EXCEEDED / STATE_IDEMPOTENCY_CONFLICT übersetzt; andere Fehler
propagieren. Der Backend-Record enthält eine unabhängig serialisierte Payload.

## 5–7. Abbruch, Recovery, Nebenwirkungen und Autorisierung

Adapter prüft Fence und bereits ausgelöstes AbortSignal beim Eintritt. Erneute
Prüfung unmittelbar vor dem späteren Backend-Commit fehlt; Store-Queue/flock
nimmt kein Signal entgegen. Damit ist Abbruch nach Eintritt kein Beweis, dass
kein Record mehr entsteht. Die äußere DurableInvocation prüft den Fence nach
Rückkehr, kann einen schon erfolgten Commit aber nicht rückgängig machen.
Die genaue zugesagte Abbruchsemantik ist eine offene Frage, kein hier behaupteter
Autorisierungsbypass. Geeigneter Nachweis: echte Core-Invocation hinter echtem
flock blockieren, Lease abbrechen, Sperre lösen, Record und Effect-Receipt prüfen.

Neustart lädt vorhandene Records; gleiche Idempotenz bleibt dedupliziert.
Kein `receipt()` implementiert. Bei verlorenem äußeren Effect-Receipt kann Core
für akzeptierte Mutationen deshalb weiterhin Reconciliation verlangen, obwohl
das Backend den Append kennt. Dies muss als zwei verschiedene Journalgrenzen
verstanden werden; kein automatisches erfolgreiches Recovery behaupten.

Namespace-Autorisierung erfolgt in `nova/core/execution/authorization.ts:109`
über erlaubte Namespaces und Unterpfade. Der Adapter prüft Form und Operation,
keine Benutzeridentität. Vertrauen: Core stellt Request, Fence und Grants;
root ist vertrauenswürdige Plattformkonfiguration. Geschützter persistenter
Linux-Speicher, `/usr/bin/flock`, `/bin/sh`, `/bin/cat`, Hardlinks/rename/fsync
werden vorausgesetzt. Kein Cluster-/Volume-Verhalten getestet.

## 8–9. Ressourcen und Vereinfachung

Default: 100000 Records, 256 MiB Store, 1 MiB einzelner Backend-Payload. Das
Record-Limit gilt über alle Namespaces; das Byte-Limit umfasst Store-Metadaten.
Lesen validiert/liest den gesamten Store; Append macht zuerst ein Read und dann
nochmals eine vollständige Prüfung/Neuschreibung. Nach Erreichen des Limits
fehlen hier Rotation, Kompaktierung und ein Wiederfreigabeprotokoll. Nicht einfach
alte Idempotenz-Records löschen: sonst können frühere Mutationen erneut erscheinen.
Siehe verbleibende Storage-Arbeit W6 im Reliability-Bericht; am Code bestätigt.

Vereinfachung: bei späterem Speicher-Neuentwurf eine atomare append-or-existing-
Operation mit fachlicher Fehlermapping-Grenze statt vorgeschaltetem Read verwenden.
Keine Schema-/Kompatibilitäts-Shims ergänzen. Aufbewahrung und sichere Entfernung
müssen zuerst mit Recovery-/Idempotenzfenster definiert werden.

## 10. Tests und tatsächliche Aussagekraft

Vollständig gelesen: eigene `tests/live-function.test.ts` und
`tests/package-boundary.test.mjs`, Blueprint-Integrationstest. Beide Paketbefehle
bestanden: `npm test --workspace @kubeclaw/plugin-state-store` und
`npm test --workspace @kubeclaw/plugin-blueprint-sync`.

State-Test nutzt echtes Dateisystem/Store, aber leeres Fence-Testobjekt; er
beweist daher keine produktive Lease-Autorisierung. Blueprint-Test nutzt echten
Git, echten Runner und Adapter, aber MemoryResourceLockManager und keine
Deployment-Konfiguration. Er beweist den lokalen Aufruf-/Payloadpfad. Kein
Test für Abbruch während Lock-Wartezeit, vollgelaufenen Langzeitbetrieb oder
Prozessverlust zwischen Backend-Commit und Effect-Receipt. Keine neuen Mocks.

## 11–12. Dokumentation und offene Fragen

README beschreibt Idempotenz, fsync und gemeinsames Backend korrekt. Es fehlen
konkrete Quoten, globale statt namespacebezogene Limits, Abbruch nach Eintritt,
flock-Toolabhängigkeit und die Grenze zum äußeren Effect-Receipt. Status:
unvollständig. Keine neue bestätigte Defekt-ID für unklare Abbruchzusagen;
diese müssen vor späterer Ursachenbehebung festgelegt und real verifiziert werden.
Produktive Anbindung geprüft; keine Bestätigung von Langzeit-/Clusterbetrieb.
