# kubeclaw.repository-adapter

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1. Verantwortung und Verwendung

Adapter git.repository.read mit mutable read_text und revisionsgebundenen Reviewoperationen. Gesamte Source adapter.ts106, revision-reader.ts332 und revision-parsers.ts58 Zeilen, Manifest, Configschema, README und beide Tests gelesen. Aktive Verbraucher: preflight-contract/delivery-lint Worktreetext, review Revision/Inventar/Referenzen, runtime-dispatch OpenClaw-Ergebnislesen. Die konkrete Collector-Schreibgegenstelle ebenfalls verfolgt und ausgeführt.

## 2. Schnittstellen

read_text verlangt sicheren relativen Pfad ohne Traversal/Kontrollzeichen. freeze_head liest aktuelles HEAD beim Aufruf, optional expectedHead; HMAC-Proof bindet Head an Attempt und Adapterinstanz. verify_ancestry/changed_manifest/changed_line_ranges prüfen Proof/Ancestor. inventory/list liefern digestsortierte Metadaten, read_revision_text erzwingt erlaubte Prefixe, optional Objekt-ID/Bytelänge und fatalen UTF8decoder. Referenzsuche kombiniert Gitgrep und begrenzte relative Importmuster, kein vollständiger TypeScript-Abhängigkeitsgraph.

## 3. Zustand und Nebenwirkungen

Nur lesende Git-/Dateioperationen; Proofschlüssel zufällig je Instanz im Speicher, kein persistenter Cache. read_text beobachtet veränderliches Worktree; Revisionreads holen explizite Gitblobs. Collector-Fallback schreibt selbst, obwohl seine erste Anfrage read-only war; diese grenzüberschreitende Folge gehört zur Schnittstellenprüfung PCR-REPOSITORY-001.

## 4. Korrektheit

Echte vorhandene Symlinkescapes werden durch realpath abgewehrt, fehlende Dateien darunter aber vor Prüfung als gewöhnlich missing klassifiziert. Das aktiviert unsicheren Collectorwriter. read_text nutzt stat→read ohne gleichzeitige Schreibisolation, nicht denselben strikten UTF8decoder wie Gitblobreads; kein unveränderlicher Bytebeweis. Scopeübergänge bei Renames werden zu Add/Delete reduziert, Ergebnislimits nach Scopefilter. Submodule sind Gitlinks, werden nicht rekursiv als gelesener Inhalt ausgegeben.

## 5. Timeout, Abbruch und Konkurrenz

Initialer Abort/Fence geprüft; read_text danach nochmals Abort, Revisioncalls verlassen früh und prüfen Signal nicht weiter. Git execFileSync/spawnSync besitzen maxBuffer, aber keinen Timeout; blockieren Eventloop und zeitgerechte Core-Abbruchverarbeitung. Das ist ein begründetes Ressourcenrisiko bei langsamen Objekten/Gitoperationen, kein hier reproduzierter Hängerlauf. Parallele Worktreeänderungen zwischen realpath/stat/read bleiben gesonderte Raceunsicherheit.

## 6. Neustart

Neuer Adapter hat neuen Proofschlüssel: alte Proofs können nicht ohne neues freeze_head wiederverwendet werden. Intendierte Attemptbindung muss beim Resume über Corekontext erneuert werden. HEAD wird beim freeze eingefroren, nicht bei activate. Gitlesen erzeugt keine eigene zu versöhnende externe Mutation; Collectorwrite dagegen kann vor anschließendem Fehler bereits bestehen.

## 7. Authentifizierung und Vertrauen

Registry/Capability-Core autorisiert Ressourcennamen, Adapter erzwingt echte Pfad-/Proofgrenzen. HMAC verhindert freien Austausch des Heads oder Übertragung in anderen Attempt, setzt sicheren Instanzschlüssel voraus. Repo-Dateien können vom Agenten kontrolliert sein; Directorysymlink darf daher kein vertrauenswürdiger Schreibpfad werden. Git-CLI, Objektdaten, lokale Dateirechte und zulässige Repositoryroots sind Betriebsannahmen. Kein Shellstringbau aus Dateipfaden.

## 8. Ressourcen und Aufbewahrung

Default4MiB Datei,2048 Changedpaths; Listen höchstens65536, Inventar höchstens1M, Referenzen4096, Scan32768 Kandidaten. Gitbuffers je Operation bis256MiB; Filtern erfolgt teils nach vollständigem Baumlesen. Kein Gesamtzeitbudget; Read-UTF8-Dekodierung kann kopieren/ersetzen. Keine Retention oder dauerhaften Blobkopien in diesem Adapter. Reviewbelege/Collectordateien unterliegen anderen Stores.

## 9. Architektur

Trennung mutable Worktreelesen versus proofgebundene Revision ist sinnvoll und muss im Vertrag sichtbar bleiben. Sichere Fileoperationen brauchen tatsächliche offene Verzeichnishandles/No-follow-Komponentenprüfung statt wiederholter lexikalischer Checks. Parser ist absichtlich begrenzte relative Referenzheuristik; Sprachgraphvollständigkeit nicht behaupten. Asynchrones begrenztes Git mit Signal würde Coreblockierung an der Ursache beheben.

## 10. Tests

`npm test` bestanden; `../evidence/nova-batch-repository-adapter-tests.txt`. Originaltest verwendet echte Gitcommits, Dateien/Symlinks, Scope/Proof/Headwechsel/Inventar/Referencebudget und Handfence; keine vollständige Capability-Autorisierung durch Runner. Packageboundary enthält echte NUL-/Gitlinkparserassertions, aber doppelte adapter.ts-Schleife statt weiterer Sourceprüfung. Zusätzliche `../evidence/nova-batch-repository-symlink-probe.mjs` führt echten Adapter und exportierten Originalcollector mit realen Dateien aus: Schreibausbruch reproduziert, keine Netzwerkantwort und keine Ersatzimplementierung.

## 11. Dokumentation

README behauptet activation-time head und expectedHead-Pinning bei Aktivierung; tatsächlich Prüfung bei freeze_head, Originaltest fordert gerade spätere HEADänderung. Behauptung Symlinkescape zurückweisen benötigt Missingfallergänzung. Timeout-/UTF8-/Referenzheuristik und fehlende rekursive Submodulabdeckung unvollständig. Zwei verschiedene Dateileseverträge klar benennen.

## 12. Befunde und Restprüfungen

### PCR-REPOSITORY-001 — Fehlender Symlinkpfad aktiviert Schreibausbruch im Collector

**Schweregrad hoch, nachgewiesener Defekt.** Ein vom Agenten kontrollierbarer Verzeichnissymlink innerhalb Repository kann eine neue Ergebnisdatei außerhalb der autorisierten Wurzel anlegen; Schreiben erfolgt mit Rechten des Coreprozesses. Voraussetzung: beschreibbares externes Ziel und lokale Collectorvariante, keine beliebige bestehende Dateiüberschreibung behauptet.

**Codebelege:** adapter.ts10–22 klassifiziert ENOENT vor kanonischer Containmentprüfung. common/plugins/runtime-dispatch/src/openclaw-result.ts62–77 prüft persistResult nur lexikalisch, mkdir/write/link folgen Elternsymlinks; localResult80–105 fängt FILE_NOT_FOUND und ruft Writer. openclaw.ts170 konstruiert Ergebnisnamen unter resultPathPrefix.

**Ablauf/Nachweis:** Probe legt repo/results als Symlink auf eigenes temporäres outside an, Ergebnisdatei fehlt. Originaladapter meldet FILE_NOT_FOUND. Original readOpenClawResult erhält bereits vorhandenen structured Collectorabschluss und schreibt outside/result.json, liefert erfolgreich Ergebnis zurück. Alle erzeugten Pfade liegen im temporären Testverzeichnis und werden entfernt. Konfigurierter Prefix entspricht im Test results; identisches Prinzip gilt für einen vom Agenten ersetzten tatsächlichen Prefix.

**Ursachenbehebung:** Autorisierten Collectorwriter selbst gegen Symlinkeltern und Wechselrennen absichern, vorzugsweise über sichere Directoryhandles/No-follow-Pfadwalk mit Create und atomischem Publish. Repositoryleser muss bei fehlenden Leafs bereits existente Eltern kanonisch prüfen und forbidden von missing unterscheiden. Bloße Fehlertextänderung im Leser allein sichert direkte Writeraufrufe nicht.

**Echter Regressionstest:** Originaladapter+Collector gegen bestehende externe Datei, fehlende Leaf unter externem Elternsymlink, interne erlaubte Verzeichnisse und gleichzeitigen Symlinktausch ausführen; kein externer Write zulässig, reguläres idempotentes Resultpersistieren bleibt erfolgreich.

Offen: echte Cancellation während sehr großer Gitoperation, Worktree-TOCTOU und Unicode-/Sourceparsergrenzfälle. Kein Netzwerk-/System-E2E oder uneingeschränkt sichere Filesystemgrenze behauptet.
