# contract.plugin-system — Plugin-Protokoll v2

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Review-Schema Revision 2. Code- und Vertragsprüfung; kein Live-Pipeline-Nachweis.

## 1. Verantwortung und tatsächliche Verwendung

Die vollständige `skills/common/plugin-runtime/contracts/plugin-system/v2/plugin-system-v2.schema.json`
ist die Quelle für Manifest-, Registrierungs-, Stage-, Effekt-, Zustands- und
Beobachterformen. Kein eigener Dienst oder Plugin mit Nebenwirkungen.
`scripts/generate-plugin-sdk-types.mjs` liest die öffentlichen `$defs` für das SDK.
`foundation/registry/schema.ts` lädt dieselbe Datei, kompiliert Ajv2020 strict +
formats und verwendet sie in parsePluginManifest/validateContractValue.
`discovery.ts:131–159` liest JSON vor ausführbarem Code; `build.ts:221–295`
verarbeitet fünf Registrierungssurfaces. Aktiv, keine bloße Zielbeschreibung
oder abgelöste v1-Parallelimplementierung.

## 2. Eingaben, Ausgaben und Gegenstellen

Gelesen: alle 1061 Schemazeilen, README, kompletter Vertragstest und Generator.
Geschlossene äußere Protokollobjekte, getrennte StageResult-Varianten;
jsonObject, Payload, Config und Reason.details sind bewusst offene Nutzdaten.
„Alle Objekte geschlossen“ gilt nicht rekursiv. Module-/Schemapfade sind relativ;
Dateikanonisierung und Symlinkgrenzen erzwingt zusätzlich Registry.build.
Manifest → Parser → Registry: stages/observers/adapters sind Pflichtarrays,
testProviders/reportAdapters optional. build überführt Providerdeklarationen
in Test-Gate-Verträge mit Package-Digest und validiert sie erneut.
Core.stage-executor prüft das registrierte resultSchema; Core.engine-admin
validiert administrativeReopenDecision. SDK-Typen sind keine Laufzeitvalidatoren.
Schema verlangt IDs/Zeitformate, aber nicht deren zustandsabhängige Wahrheit.

## 3–6. Zustand, Fehler, Zeit und Wiederaufnahme

Der Vertrag persistiert und sendet selbst nichts. EffectId/IdempotencyKey,
Attempt/Lease/Wait-Identitäten, Quittungsstatus und Journal-/Checkpointsequenzen
sind Daten für Core. Positive Zahlen sind keine praktischen Obergrenzen.
Retry-/Remediationbudget, Zeitordnung, Signalberechtigung, monotone Fences,
abgelaufene Leases und verlorene ACKs sind nicht mit Schema allein bewiesen;
README nennt das ausdrücklich. Keine automatische Wiederholung oder
Kompatibilitätskonvertierung. Persistierte v2-Daten erfordern bei Änderungen
kontrollierte Migration; derselbe Versionsname garantiert keine Kompatibilität.

## 7–9. Vertrauen, Ressourcen und Architektur

Provenance trägt Source, Digest, TrustScope und TrustEvidence; echte
Attestationsprüfung/Allowlist bleibt Registry-Aufgabe. Plugin-Eventregex
verlangt eine Namespaceform; Core.context prüft den tatsächlichen Pluginpräfix
und Run. artifactRef verbietet äußere Hostpfadfelder, garantiert aber weder
Existenz noch unveränderte Bytes. Infrastruktur: gemeinsam ausgeliefertes
Schema/SDK und vertrauenswürdige Registry; keine eigene Transport-/Persistenz-
infrastruktur. ID-/Pfadlängen und Providerports sind begrenzt, generische
Arrays/Payloads nicht insgesamt byte-/tiefenbegrenzt. Das bleibt Eingangskontrolle.
Eine Schemaquelle plus relationale Validatoren ist sinnvoll, keine zweite
handgepflegte Form als Reparatur. Bedingte Schemas werden vom Typgenerator nur
teilweise zu TypeScript-Garantien, siehe [SDK](lib.sdk.md).

## 10. Tests und tatsächliche Aussage

`check-plugin-system-v2-contracts.mjs` vollständig untersucht und unverändert
bestanden: reale Ajv-Validierung gültiger Hauptformen, falsche Versionen,
Legacyfelder, Pfadescape, fremde Ergebnisfelder, fehlende Fehler-/Trustbelege.
Generator --check bestanden. Nicht jedes `$defs` besitzt eigene Negativfälle;
leere Registrierungsmengen und optionale anyOf-Zweige fehlten. Kein
Ausführungstest der Aktivierung, Leasekontrolle oder Signalsicherheit.
[Protokoll](../evidence/plugin-contract-sdk-tests.txt).

## 11. Dokumentationsabgleich

README als Zuständigkeitsbeschreibung vorhanden, zu Test-Provider/Report-Adapter,
decisionFacts/stageLifecycle unvollständig; „target runtime“ verschleiert die
aktive Verwendung. `docs/site/extend/first-plugin.md` zeigt ein gültiges Beispiel;
seine Auswahl einer Surface sollte der Parser erzwingen.
`plugin-system-vision.md:542–572` trennt korrekt Discovery/Aktivierung, fasst
aber offene Nutzdaten zu pauschal als geschlossene Objekte zusammen. Kein
ununtersuchter historischer Laufzeitaudit als bestätigt übernommen.

## 12. Befund und Verifikation

### PCR-CONTRACT-PLUGIN-001 — Leeres Plugin passiert die Manifestvalidierung

- **Niedrig, nachgewiesener Defekt:** begrenzter Konfigurationsfehler, kein
  Sicherheitsbypass daraus abgeleitet.
- **Beleg:** Schema pluginManifest.anyOf:335–341; Zweige für optionale
  testProviders/reportAdapters ohne required. Parser schema.ts:44–61 übernimmt
  Schemaentscheid; build.ts:231–295 fügt Paket hinzu, überspringt leere Schleifen.
- **Auslöser/Ablauf:** gültige Paketmetadaten mit drei leeren Pflichtarrays und
  ohne optionale Arrays. Optionaler anyOf-Zweig ist bei Abwesenheit wahr.
- **Auswirkung:** leeres Plugin wird nicht an der vorgesehenen Grenze abgewiesen;
  fehlende Funktion fällt erst beim späteren Aufrufer auf.
- **Ursachenbehebung:** jeder anyOf-Zweig muss die zugehörige nichtleere Surface
  auch als Pflichtfeld verlangen; keine Registry-Kompatibilitätssonderregel.
- **Echter Nachweis:** [Reproduktion](../evidence/plugin-contract-sdk-repro.mjs)
  ruft Originalparser auf; [Ausgabe](../evidence/plugin-contract-sdk-repro.txt).
  Regression: Matrix fehlender/leerer/gefüllter Arrays gegen denselben Parser;
  alle fünf einzelnen Surfaces müssen weiterhin gültig sein.

Weitere offene Fragen sind implementationsabhängige Invarianten, keine fehlenden
Prüfpfade dieses Datenvertrags. Zuständige Core-Reviews bleiben separat.
