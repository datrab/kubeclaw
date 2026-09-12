# kubeclaw.size-budget

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Schema: Revision 5. Teststatus: bestanden. Dokumentationsstatus: vorhanden / unvollständig.

## 1. Verantwortung, Registrierung und tatsächliche Nutzung

Auslieferung über `packaging/runtime/roles/buster.json`; Manifest `plugin.json` registriert den unten genannten Vertrag. Nova `skills/nova/core/test-gates/resolver.ts:538–580` wählt anhand `uses`, prüft Kind, löst Konfiguration mit Schema-Defaults und pinnt Paket/Schema. Buster `runner.ts:1191–1250` lädt und ruft aus; `provider-loader.ts:49–89,151–180,382–389` kopiert digestgeprüft ins Versuchssnapshot und startet den Sandboxprozess; `provider-child.mjs:37–66` importiert Factory und ruft `execute`. Alle Engine-Dateien liegen in `skills/buster/engine/test-gates/`. Vertrag `kubeclaw.size-budget@1`, Registration `artifact`, keine Capability, retrySafe=true.

## 2. Eingaben, Ausgaben und Gegenstellen

Manifest verlangt build-output als file/tar/gzip, optional versionierte Baseline. `src/provider.js:35–100` prüft Limits/Globs und Blockinglimit. `verifiedFile:102–135` bindet offenen Deskriptor an Größe/Digest und nutzt denselben Handle für Messung; Archive werden nicht extrahiert. Tarparser prüft Checksummen, sichere Pfade, Typen, doppelte Namen und Abschluss. Baselineoutput wird als notwendiges Artefakt per EvidenceId gebunden.

## 3. Zustand, Persistenz und Commit-Punkt

Liest Artefakte, erzeugt ausschließlich `size-budget-baseline.json` mit wx/0600 und stdout-Messlog. SourceDigest ist Herkunft, nicht Commit. Provider-Rückgabe ist kein Commit: Runner validiert Vertrag, Zählwerte und Evidenzdeklarationen, klont/friert das Result, kopiert ausgewählte Dateien ins Staging und führt erst danach Workerabschluss/Artefaktspeicherung aus (`runner.ts:1226–1320`). Keine eigene Journal-/fsync-/Waitprojektion; Recovery und Abschlusspräfixe gehören dem Runner/Remote-Dienst. Keine Behauptung einer bestandenen Crashkette. Outputartifacts werden vom Runner auch bei anders gewählter Evidenzpolicy zum Staging hinzugefügt.

## 4. Korrektheit und Fehlerdisposition

Datei-/Gesamt-/Pattern-/Growthbudgets ergeben voneinander getrennte Checks. Fehlender Baseline bei Growth wirft; Wachstum gegenüber Null wird bei positivem aktuellen Wert unbeschränkt und fällt durch Prozentbudget. Media-/Formatmismatch und unsicheres Archiv werfen. Geöffneter Handle verhindert Austausch per Rename, keine Schutzbehauptung gegen nachträgliche Mutation desselben Inodes.

## 5. Timeout, Abbruch, Wiederholung und Parallelität

Async Hashreads und Tarloop prüfen Abortsignal; SIGKILL des Providers durch Worker bleibt letzte Grenze. Archive werden streaming dekomprimiert; kein paralleles Extrahieren. Gleiches Outputverzeichnis erneut zu verwenden schlägt wegen wx fehl, aber Runner hat versuchsspezifische Evidencepfade. Regexglobs werden aus bis 512 Zeichen generiert, komplexe Wildcardfolgen können CPU brauchen; äußeres CPUlimit relevant.

## 6. Neustart, Wiederaufnahme und ungewisser Ausgang

Replay misst digestgebundene Quelle erneut, keine externen Mutationen. Teilgeschriebene Baseline ist nach Crash ohne canonical Result nicht bestätigter Output. Handles werden in finally geschlossen; kein eigener Journalpräfix oder Wiederaufnahmezustand. Dateiretention beim Workspace-/Artefaktstore.

## 7. Vertrauensgrenzen und Evidenzherkunft

VerifiedFile nutzt realpath, O_NOFOLLOW, stat/mtime-Vergleich und SHA-256; Loader lässt nur deklarierte Eingangsdateien lesen. Tarlinks/Sondertypen werden nicht akzeptiert. InputsourceDigest der Vergleichsbaseline wird gelesen, aber kein semantischer Nachweis, dass diese Baseline demselben Produkt entspricht: Bindung muss durch vertrauenswürdige Upstreamverknüpfung kommen.

## 8. Ressourcen, Aufräumen und voller Speicher

512 MiB Input, 2 GiB expandiert, 100000 reguläre Dateien, 1 MiB Baseline. 64 KiB Hash-/Readchunks; Baseline allokiert nach verifiziertem Budget. Directoryeinträge zählen nicht zum regulären Filemaximum, bleiben aber durch expandierte Bytes begrenzt. Gunzip/source.pipe und Abbruchcleanup besitzen keinen im Originaltest provozierten Pipefehlernachweis. ENOSPC beim Baselineschreiben wirft; outputBudget wird zusätzlich im Runner geprüft.

## 9. Architektur und Vereinfachung

Streamingmessung ohne Extraktion reduziert Dateiangriffsfläche; vorhandener Handle vermeidet Rename-TOCTOU. Glob-/Tarunterumfang bewusst klein halten und dokumentieren; nicht vollständige GNU/PAXunterstützung suggerieren. Keine neue Funktion oder Testersatzimplementierung hinzugefügt.

## 10. Untersuchte und ausgeführte Tests

`node skills/buster/plugins/size-budget/tests/live-function.test.ts` vollständig gelesen/exit 0: echte tar --format=ustar und gzip, file mode, Limits/fehlende Matches, Growth, Sourcepath-Renamerace, Cancel, Digest, Symlinktar, duplicated directory, fremde URL. Evidenz `../evidence/buster-provider-size-budget-original.txt`. Renamerace nutzt einen Getter als Ablaufsteuerung, echte Dateihandles/Archive bleiben Original; das ist kein SIGKILL-/Inodemutationsnachweis. Direkter Originaltest umgeht Registry, Prozessloader und kompletten Workerabschluss; seine Aussage reicht ausdrücklich nur über die darin wirklich aufgerufenen Komponenten. Kein Deployment, kein CI-Neulauf, kein Ersatzmock. Tests außerhalb der unten genannten Programme sind nicht als ausgeführt gewertet.

## 11. Dokumentationsabgleich

Plugin-README geprüft: Archiveinträge, optionale Baseline, strukturierte Fehler entsprechen dem Code. Canonical-Baseline meint hier feste JSONfelder, keine generische JCSkanonisierung; localeCompare beeinflusst LargestFiles-Reihenfolge, nicht Baselinebyteinhalt. Unterumfang für Tar-/Patterndialekte und externe Baselineidentität bleibt wenig dokumentiert.

## 12. Befunde und nächste Verifikation

Keine neue bestätigte Fehlmessung im ausgeführten Umfang. Nächste Verifikation: Quelle während des zweiten Handle-Reads im selben Inode ändern, Gunzipsourcefehler/Abort während Inflate, ENOSPC und Parentstagingprüfung. Diese offenen Stress-/Crashnachweise nicht aus Renamefixture als bestanden ableiten.

Keine zusätzlichen bestätigten komponenteneigenen Defekte im untersuchten Umfang. Die genannten Laufzeitlücken bleiben offen.
