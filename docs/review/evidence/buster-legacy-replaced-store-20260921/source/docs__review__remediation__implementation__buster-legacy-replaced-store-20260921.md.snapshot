# LIS7: Zuordnung eines ersetzten ursprünglichen Stores

Historischer Ausgangspunkt vor Implementierung: Der bisherige Gastlauf beweist die physische Versiegelung, aber noch nicht die Ablehnung eines erneut versiegelten Ersatzstores gegenüber dem früheren Beleg. Dieser Schnitt ergänzt genau diesen Nachweis. Der vollständige Importer und die externe Stop-Autorisierung bleiben offen.

## Vorabkriterien

- RS1: Ein neuer Gastfall verwendet zwei echte Beobachtungen des unveränderten Verifiers. Die ursprüngliche Datei bleibt mit ihrem Inode separat erhalten; die Ersatzdatei enthält dieselben Bytes auf einem anderen Inode. Beide Bäume erfüllen jeweils die physische Versiegelung.
- RS2: Die tatsächliche gepflegte Funktion `same_seal` aus `scripts/buster_legacy_stop_transaction.py` akzeptiert die erste Beobachtung gegen sich selbst und lehnt die zweite gegen die erste ab. Der physische Verifier wird nicht fälschlich als ablehnende Zuordnungsinstanz dargestellt.
- RS3: Der Import verwendet eine vollständige, exakt benannte und per SHA-256 gebundene Closure der vier Producer-Module. Keine kopierte Comparatorimplementierung, keine gefälschte Autorität und kein Aufruf von Host-Stop-/Complete-Operationen.
- RS4: Alle bisherigen 29 Fälle, Assertions und Fristen bleiben erhalten. Der zusätzliche Fall bleibt innerhalb von MAX_CASES=32 und unveränderten Datei-, Ausgabe- und Zeitgrenzen. Unprivilegierte Struktur-/Manifest-/Comparatorprüfungen ersetzen keinen echten Gastlauf.
- RS-DOC: Bericht, genaue Quellenidentitäten, erhaltene Baseline und neue Exportanforderungen werden dokumentiert. Kernel-/LIS7-Abnahme bleibt bis zum frisch geprüften späteren Gastlauf offen.

Es erfolgen keine Hostmutationen, Namespaceaktionen oder VM-Starts. Eine spätere neue Generation muss das Closure-Manifest und die vier darin gebundenen unveränderten Produktionsmodule im schreibgeschützten Export enthalten.

## Implementierter, noch nicht im Gast ausgeführter Schnitt

Der gepflegte Driver enthält jetzt 30 Fälle. `replaced-store` hält einen offenen Read-only-FD auf dem ursprünglichen Store, verschiebt dessen Inode außerhalb des geprüften Baums und versiegelt die erhaltene Datei wieder. Die neue Datei wird exklusiv angelegt, mit exakt gleichen Bytes geschrieben und fsynced; der ursprüngliche Baum wird erneut versiegelt. Beide tatsächlichen Verifier-Beobachtungen werden ausgegeben. Der Fall verlangt verschiedene Store-Inodes, gleiche Größe/Digest und unveränderte Bytes/Inode am gehaltenen ursprünglichen FD. `same_seal(original, original)` muss wahr und `same_seal(replacement, original)` falsch sein. Keine physische Verifier-Ablehnung wird erfunden.

Neue Pflichtargumente sind `--association-manifest` und `--association-manifest-sha256`. Das Manifest enthält exakt die vier Modulnamen `buster_legacy_stop_policy`, `buster_legacy_stop_files`, `buster_legacy_stop_runtime` und `buster_legacy_stop_transaction`, jeweils mit `path` (absoluter Gastpfad zur echten `.py`-Datei) und `sha256`. Alle Dateien liegen im selben aufgelösten, symlinkfreien Verzeichnis. Das Manifest ist auf 16 KiB, jede Quelle auf 256 KiB begrenzt. Die Module werden in Abhängigkeitsreihenfolge geladen; vorhandene gleichnamige Module sind verboten. Es wird ausschließlich der tatsächliche Comparator aufgerufen. Importierte Hostoperationen werden nicht ausgeführt.

Die nächste Generation muss diese Closure plus Manifest als immutable Export-Artefakte vor und nach dem Lauf binden und beide Argumente dem Driver übergeben. Alte Generationen bleiben unverändert; ihre 29-Fall-Ergebnisse werden nicht auf diesen neuen Stand übertragen.

Eigene unprivilegierte Prüfung: ursprüngliche 29 Fälle und der übrige bisherige Modul-AST sind nach Entfernen ausschließlich der ausdrücklich dokumentierten neuen Verdrahtung identisch. Alle bisherigen Limits bleiben unverändert. Drei echte Comparatorprüfungen mit ausdrücklich modellierten Beobachtungen bestehen; fehlende Closure-Datei, falscher Quellenhash und falscher Manifesthash werden abgewiesen. `python3 -I …/legacy-seal-guest.py --help` und scoped Whitespaceprüfung bestehen. Dies ist kein Kernel-/Gastnachweis. Frischer Nichtautorenreview und späterer Gastlauf stehen aus.

[Prüfprogramm](../../evidence/buster-legacy-replaced-store-20260921/check.py), [Rohresultat und Quellenhashes](../../evidence/buster-legacy-replaced-store-20260921/result.json), [erhaltene ursprüngliche Driverbytes](../../evidence/buster-legacy-replaced-store-20260921/driver-before.py.snapshot).
