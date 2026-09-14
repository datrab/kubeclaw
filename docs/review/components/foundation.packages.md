# foundation.packages — Externe Pakete installieren und entfernen

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Review-Schema Revision 3. install.ts vollständig (224 Zeilen), README,
Installationstest und Phase11-Test vollständig gelesen.

## 1–2. Verantwortung, Nutzung und Schnittstellen

`skills/common/plugin-runtime/foundation/packages/install.ts` exportiert
installExternalPackage/removeInstalledPackage. Reexport im Nova-Core-Index;
repositoryweite Aufrufsuche findet die zwei Vertragstests, keinen produktiven
CLI-/Serviceinstallationsaufruf. Bereitstehende Library-API, kein Paketmanager-
Daemon. Nimmt bereits lokal vorhandene Quelle, Zielwurzel, erwarteten Digest,
Actor und Betreibertrustpolicy an; lädt nichts aus der angegebenen Source-URL.

Quelle → entries/digest/parsePluginManifest → buildRegistry → Syntaxprüfung →
Stagingkopie → erneute Prüfung → Rename auf ID@Version@Digestprefix.
Registrierungsschemas/Dateigrenzen werden durch echte Registrybuild-Funktionen
geprüft, kein Plugin ausgeführt. Ergebnis: PluginId, Version, voller Digest,
canonical Root. Vollständige Pfaddigestimplementierung in registry/digest.ts
untersucht (sortierte Dateinamen, Länge/Bytes). Installation erteilt keine
Capabilitygrants. Spätere Discovery ermittelt Trust aus Betreiberpolicy erneut;
Phase11-Test fügt dafür explizit `local:<installed.root>`-Digestallowlist hinzu.
Source-Attestation wird nicht automatisch als Discoverypolicy persistiert.

## 3–4. Änderungen, Fehler und Atomizität

Symlinks, Nichtdateien, node_modules und sämtliche package.json-Scripts
abgewiesen; Abhängigkeiten müssen bereits gebündelt sein. Externe Adapter
explizit nicht unterstützt. Autorisierung gegen operatorIds und erlaubten
Source/Digest bzw. vorher verifizierte Attestation. Hashabweichung/Registry-
Fehler verhindert Rename. Ziel existiert: Digestvergleich, gleicher Inhalt
idempotent zurückgegeben. Ungleicher Inhalt Konflikt. Zielname nutzt16 Hexzeichen,
volle Digestprüfung verhindert stilles Akzeptieren einer Namenskollision.

Staging privat mode0700, kopierte Dateien0644/Dirs0755, CopyExclusive;
zweite Validierung entdeckt während Kopie geänderte Bytes. finally löscht
operationseigenes Staging. Remove verlangt direktes Kind der canonical
Installationwurzel, renamed nach .trash und löscht; keine eigene Actorprüfung
in Remove, aufrufende Betreiber-API muss Berechtigung sicherstellen.

## 5–6. Abbruch, Konkurrenz und Wiederanlauf

Synchroner Ablauf ohne AbortSignal. Syntaxprüfung startet echte Node --check
mit minimalem Environment und je Modul30s Timeout. Anzahl Module begrenzt
Gesamtzeit nur indirekt über Dateizahl; kein gesamtes Installationszeitbudget.
Kein Lock zwischen parallelen Installern: Rename ist Commitpunkt, ein
konkurrierender gleicher Installer kann an vorhandenem Ziel scheitern und muss
später idempotent erneut aufgerufen werden. Laufende gepinnte Runs werden von
Remove nicht überprüft; Betreiber muss sie vorher drainen. Kein Hotupgrade.

Staging/Trash nach SIGKILL nicht automatisch bereinigt, Rename nicht mit
Datei-/Verzeichnis-fsync zu einer Stromausfalldauerhaftigkeit ergänzt. Installation
ist transaktional sichtbar, kein hier bewiesener Host-Crash-Commit. Wiederholung
validiert Quelle/Ziel neu; keine Wiederaufnahme halbfertiger Kopie. Keine
Netzwerk-/kostenpflichtige Aktion im Installer oder in den ausgeführten Tests.

## 7–9. Vertrauen, Ressourcen und Architektur

Policy/Installationswurzel sind Betreiberautorität; Source ist potentiell
untrusted Inhalt. Kein install-time Script oder Codeimport auf trusted Host.
stripTypeScriptTypes/Nodeparser und Ajv verarbeiten untrusted Dateiinhalte vor
Aktivierung; Größenlimits default4096 Files/128MiB, erst nach Verzeichniswalk
ermittelt. Policywerte selbst nicht als safe integers validiert; sie sind
trusted APIinput. Symlinkfreiheit wird gescannt, kein Schutz gegen beliebige
feindliche Änderungen einer gemeinsam beschreibbaren Installationswurzel.
Diese Wurzel/Source-Stabilität, Linux-/Node-Dateisemantik und nötige externe
Isolationsruntime sind Infrastrukturannahmen, kein hier erteilter Systemschutz.

README verortet viele Registry-/Adapterlifecycleaufgaben in diesem Ordner,
tatsächlich implementiert er nur lokalen Install/Remove. Klein halten:
Operatoroperation, eindeutige gebündelte Paketform und verifizierter Publishpunkt;
keine zusätzlichen Script-/Dependency-Kompatibilitätsadapter. Unbenutzte API
vor Veröffentlichung auf tatsächlichen Betreiberbedarf prüfen.

## 10. Tests und tatsächliche Aussage

Unveränderter check-plugin-system-v2-installation.mjs bestanden: echte
Dateikopie/Registry/Syntaxprüfung, Digest, wiederholtes Install, Remove,
kaputter Testprovider und verbotenes prepare-Script. Kein Plugin installiert
außerhalb eigener temporärer Testwurzel. [Log](../evidence/package-install-tests.txt).
Phase11 vollständig gelesen: Operator-/Sourceabwehr, Discovery mit expliziter
local-Trustpolicy, echte Isolation/Abbruch/Crashversuche und Adapterablehnung.
Nicht erneut ausgeführt: Isolationsvoraussetzungen sind noch im eigenen Review
zu prüfen; kein Phase11-Pass behauptet. Kein Testdouble zur Überbrückung.
Fehlende Fälle: ReportAdapter (unten), transitive Importsyntax, Quelle im Wandel,
parallele Installer, Powerloss und Remove während gepinntem Run.

## 11. Dokumentation und frühere Aussagen

Lokale README unvollständig/irreführende Zuständigkeiten. plugin-system-vision.md:
558–564 beschreibt Zielarchitektur mit Erwerb/privaten Locked Dependencies;
heutige API lädt nichts und verbietet node_modules/scripts vollständig, erlaubt
nur vorgebündelte Quelle. Staging+Digest und kein Host-Script sind umgesetzt,
Crashdurability oder ganze ausführbare Importclosure nicht bewiesen. Kein
übernommener historischer „transactional activation“-Testtitel als vollständige
Runtimeaktivierung aller Surfaces.

## 12. Befund

### PCR-PACKAGES-001 — Report-Adapter umgehen Installations-Syntaxprüfung

- **Niedrig, nachgewiesener Defekt:** ungültiges Paket als installiert bestätigt,
  spätere Ausführung kann nicht starten. Kein Codeausführungsbypass behauptet.
- **Beleg:** install.ts:113–142 validateModules iteriert stages/observers/
  testProviders, nicht reportAdapters. validatePackage:166 ruft diese Auswahl
  nach Registrybuild auf; Registrybuild prüft Reportmoduldatei, nicht Syntax.
- **Auslöser/Ablauf:** korrektes ReportAdapter-Manifest und allowgelisteter
  Digest, Modul mit `export function parse( {`. Originalinstaller kopiert und
  bestätigt es, statt Syntaxfehler zu melden.
- **Auswirkung:** beabsichtigte Validierung aller ausführbaren Surfaces vor
  Paketaufnahme unvollständig; Fehler wird in späteren Reportauswertungspfad
  verschoben. Aktive produktive Installcaller nicht gefunden, begrenzter Grad.
- **Ursachenbehebung:** gemeinsame vollständige Enumeration ausführbarer
  Surfaces und deren gebündelter Importclosure für Vorprüfung verwenden;
  dabei keine Pluginimporte auf trusted Host ausführen.
- **Echter Nachweis:** [Repro — historischer Stand](https://github.com/datrab/kubeclaw/blob/91396dc4975ed05a0cb674b0e1327ddbf3ef1f12/docs/review/evidence/install-report-syntax.mjs) verwendet
  Originalinstaller/Registry und echte Dateien, Log oben. Regression muss alle
  erlaubten Surfaces mit gültiger/ungültiger Syntax prüfen und darf nach
  Fehler kein Zielpaket hinterlassen. Keine Dummy-Stage als Workaround.

Restunsicherheit: tatsächlicher Operatorpfad und spätere sichere Aktivierung,
keine ungelesenen Installationspfade. Gemeinsamer EmptyManifest-Schemafehler
verbleibt bei [contract.plugin-system](contract.plugin-system.md).

Nachprüfung: Phase11 Originaltest inzwischen ausgeführt; Installation/Trustaufbau
laufen bis zur ersten isolierten Invocation, dann unbehandeltes EPIPE. Restliche
Assertions nicht erreicht; [Isolationreview](foundation.isolation.md) führt die
Ursache PCR-ISOLATION-001 und Umgebungsblocker. Kein kompletter Phase11-Pass.
