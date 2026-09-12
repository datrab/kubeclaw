# kubeclaw.secret-resolver

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1–2. Verantwortung, Auswahl und Schnittstellen

Vollständig gelesen: `skills/common/plugins/secret-resolver/src/adapter.ts`, Manifest,
Schema, README, Paketdatei und beide eigenen Tests. Manifest `secrets` stellt
`secrets.read` ohne weitere Capabilities bereit. Runtime-Rollen liefern Paket;
Core `execution/adapter-startup.ts` validiert Schema und aktiviert ausgewählten
Provider. Config environment bildet logische Namen auf Operator-Umgebungsnamen
ab; Schema verlangt `[A-Z][A-Z0-9_]*`, Adapter friert eine flache Kopie ein.

Sender z.B. runtime-dispatch `openclaw.ts:dispatchOpenClaw` nutzt
invokeConfidential(secrets.read, resolve, secret.name, tokenSecret) und validiert
response.value als nichtleeren Text. Empfänger prüft capability/operation,
Signal und Mapping und liefert ausschließlich `{value}`. Unknown/leer/fehlend
werden SECRET_DENIED/SECRET_UNAVAILABLE; keine Secretwerte in Fehlermeldungen.
Maplookup nutzt gewöhnliches Objekt, keine eigene Benutzeridentität.

## 3–4. Zustand, Fehler und externe Nebenwirkungen

Keine Datei, Journal, Mutation oder externe Aktion. Wert wird bei jedem invoke aus
process.env gelesen, also kein dauerhaft gecachter Secretwert. Eingefrorenes Mapping
bleibt bis Reaktivierung unverändert. Keine Commit-/fsync-/Replaytransaktion anwendbar.
Falsche Operation wird abgelehnt, bereits abgebrochenes Signal ebenfalls.

## 5–7. Abbruch, Neustart und Geheimhaltung

Synchroner Lookup innerhalb async invoke; keine offene RPC, Retryqueue oder eigene
Timeoutphase. Parallelaufrufe lesen dasselbe process.env, Neustart lädt vom Operator
bereitgestellte Umgebung. Wiederholung ist read-only und kann nach Secretrotation
anderen Wert erhalten. shutdown/ready sind leer.

Beide Core-Seiten untersucht: `foundation/registry/capabilities.ts` klassifiziert
secrets.read vertraulich; `execution/authorization.ts:secret` erzwingt allowedNames;
AdapterStarter propagiert Grants und aktiviert vertraulichen Pfad auch bei normalem
invoke. `effects/coordinator.ts:invokeConfidential` schreibt keine effektiven Werte
in Effectjournal; Audit bekommt maskierte Ressource/Payload und generische Receipt.
Vertraulicher Aufruf hat bewusst keinen Fence, Adapter prüft Fence nur für andere
Direktaufrufe. Vertrauensgrenze ist Core/Adapterkonfiguration; Mapping ist keine
OS-Isolation, Prozesscode selbst kann Umgebung lesen. Downstream muss Secretwerte
weiter transient transportieren; daraus folgt kein pauschaler Nachweis sämtlicher
externen Dienste oder Logs.

## 8–9. Ressourcen und Architektur

Keine Aufbewahrung/Aufräumdaten außer Mapping; Secretlänge wird hier nicht begrenzt.
OS-Umgebung/Operator bestimmen Wertgröße. Kein komplexer Resolver-Cache oder
Fallback-Provider. Map statt gewöhnlichem Objekt/own-property-Lookup wäre eindeutiger
für beliebige logische Namen; kein belegter produktiver Secretbypass aus geerbten
Object-Namen, da passende unzulässige Umgebungsnamen nicht angenommen werden.
Keine zusätzliche Komplexität oder Remote-Vault-Abhängigkeit erforderlich.

## 10. Tests und Grenzen

`node tests/live-function.test.ts && node tests/package-boundary.test.mjs` im
Paketverzeichnis bestanden (Node 24.19.0). Echter process.env-Lookup, temporäre
synthetische Testwerte werden entfernt; positive Auflösung, unknown, leer und
bereits abgebrochenes Signal. Fence ist leeres Testobjekt. Boundarytest verbietet
Core-Pipeline-Imports/console per Regex. Kein Secretwert in diesem Review.
Tests beweisen nicht produktive Grant-/Auditverdrahtung; diese ist oben Code-Trace,
kein neu ausgeführter Core-E2E-Test. Weitere Inventartests nicht pauschal als gelesen
oder bestanden gewertet.

## 11–12. Dokumentationsabgleich und Ergebnis

README beschreibt Mapping und vertraulichen Core-Pfad sachlich zutreffend;
„never writes its request“ meint rohe Daten: maskierte Auditereignisse existieren.
Katalog ist vorhanden, zu Registrierung korrekt, zur Prozessvertrauensgrenze und
Rotationssemantik unvollständig. Keine neue bestätigte eigene Defekt-ID.
Nächster sinnvoller Nachweis ist echter Core-Aufruf mit Audit/Journalinspektion,
inklusive unbekanntem Namen und Downstream-Fehler; nicht allein der direkte Lookup.
