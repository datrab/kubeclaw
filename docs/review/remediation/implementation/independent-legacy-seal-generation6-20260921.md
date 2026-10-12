# Generation 6: unabhängige Prüfung der Präparationsrezepte

Die sieben eingefrorenen Root-Artefakte für die Vorbereitung sind akzeptiert. Dieser Reviewer hat den neuen Gastfall implementiert und nimmt ihn hier ausdrücklich nicht selbst ab; dessen Quellenabnahme erfolgte separat durch Root. Gegenstand dieses Reviews sind ausschließlich Roots Generation-6-Rezepte und deren Quellenbindung.

Vier Dateien (`guest-init.sh`, Launcher, Runtime-Präparation und Runtime-Binding) sind nach bloßer Ersetzung von `generation5` durch `generation6` bytegleich zum geprüften Vorgänger. Damit bleiben insbesondere Netzwerkisolation, zwei private reguläre Images, read-only 9p, UID-0-Gast, kleinerer AS-Korridor, Speicher-/Zeit-/Ausgabegrenzen und Vor-/Nachlaufprüfungen unverändert.

Das Image-Rezept liest jetzt das lokale eingefrorene Sieben-Quellenmanifest. Alle sieben aktuellen Hashes stimmen. Es kopiert die vier echten Producer-Module unabhängig in denselben Export-Ordner, erzeugt daraus das exakt viergliedrige Zuordnungsmanifest und übergibt dessen Gastpfad und SHA-256 an den unveränderten vollständigen Driver-Aufruf. Die drei bisherigen Driver-/Verifier-/Capability-Quellen und beide Blockgeräteargumente bleiben gebunden. Es gibt keinen Casefilter oder Host-UID-Ersatz. Das Manifest selbst wird im vollständigen Export-Inventar erfasst. Copy-, mke2fs-, Kernel-/Initrd- und Toolclosure-Verfahren bleiben identisch.

Alle Python-Rezepte sind syntaktisch geprüft. Keine Präparation oder VM wurde vom Reviewer ausgeführt. Diese Freigabe betrifft nur die unprivilegierte Materialisierung: endgültige Images, Manifest, tatsächliche Exportbytes und Launcherbindung müssen danach separat frisch geprüft werden. Die bisherigen Generationen und Fehlläufe bleiben erhalten; kein Kernelergebnis wird auf Generation 6 übertragen.

[Exakte Rezeptidentitäten](../../evidence/buster-legacy-generation6-independent-20260921/recipe-identities.json).

## Ergänzter Artefaktbinder

Der zusätzliche Binder ist nach Korrektur einer konkreten TOCTOU-Lücke akzeptiert. Die erste Fassung verband `lstat` mit einem folgenden pfadbasierten Open; der Review verlangte dafür den bereits vereinbarten gehaltenen FD. Die korrigierte Fassung öffnet read-only mit NOFOLLOW/CLOEXEC, vergleicht Geräte-/Inode-/Modus-/Größen-/Link-/UID-/Zeitidentität vor und nach dem vollständigen Hash und erneut mit dem aufgelösten aktuellen Pfad. Der optionale Cachehinweis erfolgt nur für die eigenen neuen Cachedateien am selben FD. Es gibt keinen globalen Cacheeingriff oder Budgetwechsel.

Der Binder schreibt ausschließlich neue Manifestdateien, übernimmt die bisher gebundene vollständige Toolclosure und führt den Launcher nur ohne Ausführungsflag aus. Dessen `notExecuted`-Ausgabe wird geprüft. Das endgültige 19-Artefaktmanifest enthält zusätzlich den Sieben-Quellenindex und den Binder selbst. Endgültige Materialisierungs-/Launchabnahme bleibt separat erforderlich.

## Finale Artefaktbindung

Die materialisierte Generation 6 ist für den unveränderten koordinierenden Preflight und anschließend ausdrücklich gestarteten Root-Lauf artefaktseitig akzeptiert. Eigener read-only Check: 19/19 vollständige Artefakthashes, 14 tatsächliche Exporteinträge einschließlich sieben Quellen, Viermodulmanifest und vollständigem Runner, 4.260 Toolruntime-Einträge samt externen Referenten sowie 1.516 Guest-Payload-Einträge stimmen. Beide echten mke2fs-Kommandos und alle aufgezeichneten Runtimeproben haben Exit 0. Beide regulären ext4-Images tragen die unterschiedlichen gebundenen UUIDs im tatsächlichen Superblock. Der Reviewer hat keine Images gemountet oder VM ausgeführt.

Der Runner übergibt die exakten gebundenen Manifest-/Quellenhashes und beide Geräte, ohne Casefilter. Der Launcher behält den zuvor geprüften Korridor unverändert. Manifest-SHA-256: `e7a20b57bfbdef31ca9c64dd780c75b211aee7ab161618515ce048640bbc6e49`. Image-/Payloadbindung folgt vollständigen Hashes und dem protokollierten echten mke2fs-Input; eine zusätzliche vollständige Dateisystemdekodierung wird nicht behauptet. Die alten Generationen wurden nicht verändert oder erneut vollständig eingelesen. Nur die beiden neuen eigenen Disk-FDs erhielten nach überprüftem Hash den freigegebenen Cachehinweis.

[Eigenes Prüfprogramm](../../evidence/buster-legacy-generation6-independent-20260921/artifact-check.py), [Terminalresultat](../../evidence/buster-legacy-generation6-independent-20260921/artifact-result.json). Der neue Gastfall bleibt Roots separater Nichtautorenabnahme zugeordnet. Ein bestandenes Lauf-/Kernelresultat liegt für Generation 6 noch nicht vor; Speicher- und Ausführungsfreigaben des Launchers bleiben zwingend.
