# Unabhängige Prüfung des Cloud-Übertragungsplans — 12. Oktober 2026

Prüfer: `independent_inventory`. Ausschließlich lesend; keine Änderungen an Repository, main, Index, lokalen Originalen oder Findingstatus. Ziel ist der autorisierte Checkpointbranch `codex/cloud-config-handoff-20261012`, kein Merge/Release/Deployment. Dieser Bericht prüft zunächst den Ausschlussplan; tatsächlicher Gitbaum/Push/Cloudcheckout sind erst nach gesonderter Prüfung bestätigt.

## Ergebnis des Plans

**Etwa zehn GB sind für die lesende CONFIG-Fortsetzung nicht notwendig.** Der große Anteil sind heruntergeladene Toolchains, alte Scanner-DBs und Buildcaches. Die vorgesehenen rund 2,65 GB nichttoolingbezogenen Originalbelege sind überwiegend JSON/Logs/Quellstände; ihr vollständiger Erhalt an ursprünglichen Pfaden vermeidet eine risikoreiche Auswahl anhand Dateinamen oder grüner Zusammenfassungen. Große Tools können neu vorbereitet werden, ohne alte Rohbelege oder Fehlläufe zu ersetzen. Die neue Vorbereitung gilt niemals als derselbe alte erfolgreiche Lauf.

Der Plan ist fachlich sinnvoll, wenn **alle** nichttoolingbezogenen Belege/Entwürfe einschließlich ignorierter Rohlogs erhalten bleiben und die nachstehende kleine Toolingprovenienz ausdrücklich eingeschlossen wird. Lokale alte Binary-/DBbytes bleiben vorhanden. Cloud darf deren ursprüngliche Byteidentität nicht als unmittelbar verfügbar behaupten.

## Eigenständig gelesene Belege und Größenprüfung

- `CLOUD-HANDOFF-20261012.md`, historische `HANDOFF-20261009.md`, Register und Toolvorbereitungseingaben gelesen; insbesondere alte RuntimeSecurity-before/after und Scannerumgebungsdateien verweisen auf tatsächliche Binary-/DBdigests.
- Werkzeugverzeichnis eigenständig nach Größenklassen untersucht: Goauspackung rund 232 MB, Trivybinary rund 168 MB, Archive rund 50/69 MB; frischer Scanner-Cache rund vier GB, gelockter Cache rund drei GB. Go-Buildcache ist reproduzierbare Zwischenspeicherung.
- Alle nichttoolingbezogenen Evidence-Dateien nach großen Einzeldateien durchsucht: **keine Datei über 50 MiB gefunden**. Das schließt nicht Gesamttransfer-/Gitpack-/Hostlimits aus, beseitigt aber in dieser Aufnahme den offensichtlichen 100-MB-Einzeldateiblocker.
- Deklarierte Register-Gitobjekte gesondert beachtet. Eigene Prüfung fand sämtliche auflösbaren geprüften historischen Commitobjekte als HEADvorfahren; zwei alte kurze `implementation_commit`-Strings `ac6f673` und `48320e8` waren bereits lokal nicht als Commit auflösbar. Das ist keine durch den Transfer verursachte Lücke und soll nicht still korrigiert oder als neue Transferbeschädigung bewertet werden. Der Hauptagent hat außerdem alle sechs im Register vorkommenden GitHub/blob-Originalcommits als HEADvorfahren geprüft.

Keine Download-/Compiler-/Scanner-/Image-/Runtime-/Cloudtests durch diesen Prüfer ausgeführt.

## Kleine Artefakte, die trotz Toolingpfad erhalten bleiben müssen

- `tooling/binary-provenance.json`: Originaldownload, Archiv-/Binaryhash, beobachtete Version, Exitcode und Bytegrößen.
- `tooling/fresh-resolve.log`, `tooling/locked-install.log`, auch leere ursprüngliche Logs nicht still entfernen.
- Sämtliche `tooling/go-preparation`-Berichte außer dem großen Toolchainarchiv: `source-before.json`, `official-downloads.json`, `artifact-verification.json`, `version.stdout/stderr`, `environment.stdout/stderr`, `modules.stdout/stderr`, `download.stdout/stderr`. `official-downloads.json` ist selbst einige MB groß, aber notwendige Autoritäts-/Checksummenprovenienz, kein Buildcache.
- `tooling/fresh-resolved-cache/trivy-databases.json`, `vulnerability-manifest.json`, `java-manifest.json`; außerdem jeweils `db/metadata.json` und `java-db/metadata.json` im frischen und im gelockten Cache.
- Wurzeldateien `preparation-inputs.json`, `preparation-result.json`, `locked-freshness.json` und alle verweisenden ursprünglichen Runtime-/Fehler-/Source-/Kommandobelege bleiben unverändert.

Der Hauptagent hat bestätigt, diese kleinen Dateien vollständig zu erhalten. Großer Binär-/DB-/Fanal-/Go-Buildcache und pycache können aus dem Gitcheckpoint ausgeschlossen werden. Ein Dateiname `tooling` darf jedoch nicht als pauschaler Ausschluss sämtlicher Inhalte verwendet werden.

## Erwartete transparente Grenzen

1. Ausschlussliste nennt genaue ursprüngliche Pfade, Kategorien und idealerweise Größen/Hashes; keine Darstellung als vollständige alte Runtimeumgebung. Lokale Originale bleiben bestehen.
2. Historische Tests verweisen weiterhin auf alte Datenbanken/Binaries. Diese fehlen bewusst im Cloudcheckpoint und sind nicht als dort neu geprüft zu führen; Datenbanken sind ohnehin außerhalb der alten Fristen. Neue Vorbereitung benötigt neue Identitäten und neue tatsächliche Tests.
3. Vollständiger roher Belegbestand ist nicht gleichbedeutend mit vollständiger `.git`-Objektübertragung. Die auf dem Branch erreichbare Historie muss die historischen Originalobjekte tragen; shallow Cloudclone gegebenenfalls vertiefen. Alte nichtauflösbare Kurzreferenzen bleiben als vorhandene historische Grenze sichtbar.
4. `.kube`, neue private Secret-/Credentialdateien und pycache werden nicht veröffentlicht. Der begrenzte bekannte Credentialformatscan ist kein vollständiger Secret-/Historyaudit. Daraus keine pauschale „secretfrei“-Behauptung ableiten.
5. Checkpoint enthält uncommittierte Implementation/Tests/Entwürfe als vorhandenen Zustand, keine neue akzeptierte Integration und keinen geprüften Release. Das alte kumulative Manifest mit seinen bekannten Deltas wird nicht überschrieben.
6. Neuer Branch plus vollständiger Gitbaum/Pub­lishnachweis ist der konkrete GitHubhandoff. Sourcepatch allein oder Chatübergabe ersetzt dies nicht. Checkoutfähigkeit, Symlinkbytes, Evidencebelegexistenz und Registermechanik am neuen Stand sind zu prüfen; Runtimefähigkeit ist separat.

## Noch ausstehend in diesem Bericht

Der tatsächliche Snapshot-/Commitbaum wurde im ersten Planreview noch nicht vorgelegt. Daher keine Behauptung, dass alle vorgesehenen Dateien bereits im Checkpoint oder auf GitHub vorhanden sind. Nach Vorlage gezielte independent Inhalts-/Symlink-/Ausschlusskontrolle und lesende Registerprüfung ergänzen. Architektur-, CONFIG- und Findingimplementierung bleiben durch den Publishauftrag nicht automatisch freigegeben.
