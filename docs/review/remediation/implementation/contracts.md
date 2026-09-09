# WP01 — SDK- und Prompt-Datenverträge

Implementiert im Arbeitsstand vom 2026-09-09; Codebasis `85ddfcbf`.
Historische Reviews und Registerstatus sind keine Umsetzungsevidenz und wurden
hier nicht geändert. Keine CI-, Deployment- oder Produktionsverifikation.

## Umfang und Architektur

- **PCR-SDK-001, Teilbehebung:** `canonicalJson` akzeptiert nur endliche
  JSON-Primitiven, dichte gewöhnliche Arrays und Plain-/Null-Prototyp-Records mit
  eigenen enumerierbaren String-Data-Properties. Undefined, Löcher, zusätzliche
  Arrayeigenschaften, Symbols, versteckte Properties, Accessors, Proxies,
  exotische Objekte und Zyklen scheitern ausdrücklich vor Rückgabe von Bytes.
  Deskriptoren verhindern Getterausführung; `util.types.isProxy` verhindert
  Proxytraps. Wiederholte azyklische Referenzen bleiben gültig.
- **PCR-SDK-002:** Paketbuild und Rootbuild verwenden dieselbe vorhandene
  `tsconfig.build.json`; beide erzeugen Deklarationen samt Maps in `dist/`.
  Keine zweite Konfiguration oder neue Buildabhängigkeit.
- **PCR-PROMPT-001:** Bibliothek bleibt unregistriert und ohne neuen Consumer.
  Eigene Dateneigenschaften und einzelne Arrayindizes werden geprüft;
  Envelope und Guidance werden vor dem Auslesen beziehungsweise Mapping geprüft.
  Getter, Symbols und ein Sparsearray mit kompensierendem Extraschlüssel werden
  abgelehnt. Bestehende Golden-Ausgabe bleibt identisch.

Das SDK importiert weiterhin keine Core-/Pluginimplementation. Der gesonderte
Integrationstest unter `tests/verification/reliability/` ruft reale Komponenten
auf; der Pakettest bleibt unabhängig davon. Kein neuer Adapter, keine
Kompatibilitätsschicht, keine Ersatzruntime und kein globaler Lockfileeingriff.

## Digestkompatibilität und verbleibende Grenze

`localeCompare` bleibt im SDK absichtlich erhalten: bestehende Artefaktdigests,
Source-Revision-Prüfung und Effektidentität verwenden diese Bytes ohne
Serializer-Versionskennung. Der akzeptierte Mischschlüssel-Goldenvektor
`{"a":[null,true],"é":2,"Z":1}` bleibt bytegleich. Die Umstellung auf
sprachunabhängige Ordnung würde gültige bestehende Digests ändern und benötigt
separat eine versionierte Migration. **PCR-SDK-001 ist deshalb nicht vollständig
geschlossen.** Kein stiller alternativer Serializer. Endliche Zahlen behalten
JSON.stringify-Semantik einschließlich negativem Nullwert. SDK-Tiefen-/Bytebudgets
wurden nicht neu eingeführt; Prompt-Byteprüfung bleibt nach Serialisierung.

SDK-Undefined wird ausdrücklich abgelehnt; die separate Journal-Domäne darf
optionale Objektfelder gemäß ihrem bestehenden JSON.stringify-Vertrag auslassen.
Das ist keine globale Vereinheitlichung der Serializer.

## Ausgeführte Nachweise

Der unveränderte SDK-Probeaufruf im ursprünglichen Checkout bestätigte `[,]`
und die Undefined-/Nullkollision; derselbe Checkout erzeugte den oben genannten
Mischschlüssel-Goldenvektor. Vor Änderung scheiterten die neu ergänzten SDK-/Prompt-Negativregressionen mit
`Missing expected exception`. Der unveränderte historische Prompt-Probeaufruf
`node docs/review/evidence/prompt-loss.mjs` bestätigte Getterausführung,
`[null]` beim Sparsearray mit Extra und `{}` beim Symbolfeld. Der Paketbuild im
unveränderten ursprünglichen Checkout scheiterte mit TS5058 auf die fehlende
`tsconfig.json`.

Nach Änderung bestanden:

- `npm test --workspace @kubeclaw/plugin-sdk`: gültige Bytes/Digests,
  Null-Prototyp, azyklische Aliase; Negativvektoren einschließlich Proxy-/Getter-
  Nichtausführung und Undefined-/Nullunterscheidung.
- `npm test --workspace @kubeclaw/prompt-contract`: vorhandene Goldenfälle,
  ursprüngliche Negativfälle plus verlorene Eigenschaften, Envelope-/Guidance-
  Deskriptoren, genaue Depth-/Entrygrenzen und oversized Einzelstring.
- `node tests/verification/reliability/sdk-json-contract.test.mts`: echter
  ArtifactStore mit Diskstorage, put/get und stabilem Digest; ungültige Writes
  scheitern. Echter FileEffectJournal wird neu geöffnet, gespeicherte Requests
  werden mit der originalen Effektidentitätsfunktion verglichen: identische
  Payload gültig, Undefined abgelehnt, andere gültige Payload Konflikt.
  Verwendet produktiven confidential Adapteraufruf ohne falschen Fence;
  beweist keine Leaseprüfung oder vollständige Pipelineausführung.
- Beide SDK-Buildaufrufe und `npm run build --workspace @kubeclaw/prompt-contract`.
- `npm test --prefix skills/common/plugins/artifact-store` (unveränderte
  Boundary-/Livefunctiontests).
- `node --test tests/verification/reliability/review-candidate.test.mts`:
  zwei echte Git-Repos SHA1/SHA256, Artefakt-/Reparaturbaseline.
- `node skills/nova/plugins/review/tests/review-prompt-budget.unit.test.mjs`.
- SDK-Generator `--check` und Plugin-Vertragsskript.
- ESLint mit kanonischer `charts/kubeclaw/files/config/eslint.config.mjs` auf
  allen hier geänderten TypeScriptdateien und neuen Tests; `git diff --check`.

Der vollständige Boundary-Aufruf erreichte nach erfolgreichen SDK-Regeln eine
umgebungsbedingte Root-`plugins/`-Verzeichnisassertion. Capability-Runtime-Prüfung
traf auf gleichzeitig laufende Registryänderungen (zuerst temporärer Syntaxfehler,
später fehlender Validator-Kontext in einem bestehenden Test). Beide Ergebnisse
wurden dem Integrator gemeldet; hier kein vollständiger Erfolg behauptet.
Clean-Install, Mehrlocalevergleich, vollständige Pflichtsuite und unabhängige
Integrationreview bleiben Aufgaben des Integrators beziehungsweise späterer
Migration; keine Aussage zu externer Worker-/Agentlaufzeit.

## PCR-SDK-001: erneuter Consumer-/Kompatibilitätsaudit

Der Folgeaudit ist in [sdk-json-compatibility.md](sdk-json-compatibility.md) mit
vollständiger benannter Consumerinventur und Originalprozess-/Diskbelegen
festgehalten. 115 akzeptierte Werte in jeweils drei tatsächlich ausgewählten
Node-Locales bleiben gegenüber der Originalquelle `eaf353a^` bytegleich. Für die
bereits erfolgte Eingabevalidierung ist deshalb **keine Digestmigration nötig**.
Der zuvor nur vermutete Localewechsel ist jetzt dagegen nachgewiesen: ein echtes
ArtifactStore-Objekt bleibt unter anderer Locale bytegetreu lesbar, seine
SDK-Reserialisierung erzeugt einen anderen Digest. Sprachunabhängige Ordnung und
der dafür notwendige explizite Producer-/Consumer-Cutover bleiben offen. Kein
stiller Fallback, keine neu erfundene Migration bestehender gültiger Daten und
keine vollständige Schließung dieser Portabilitätsanforderung.

## Wave47: erster tatsächlicher portabler Artefakt-Cutover

Der Folgeabschnitt in [sdk-json-compatibility.md](sdk-json-compatibility.md)
implementiert den benannten UTF-16-Codec im Original-Implementation-Produzenten,
versionierte Originalbyte-Leseoperationen im bestehenden Artefaktadapter und die
zugehörigen Source-/Approval-/Repair-/Summary-/Demo-Consumer. Historische Blobs
werden nach ihren ursprünglichen Bytes verifiziert, ohne Locale-Fallback oder
Umidentifikation. Der unabhängige Producer-Ref-Gegenbeweis führte zu vollständiger
Ref-Bindung und exakter Originalmetadata-Selektion. Der generelle Legacyserializer
und separate innere Approval-/Report-/Ownership-Digests bleiben unverändert;
PCR-SDK-001 ist daher weiterhin nur teilweise, jetzt aber funktional weitergehend,
behoben. Es wurde kein ungenutzter v2-Helfer als Abschluss ausgegeben.
