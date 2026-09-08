# kubeclaw.blueprint-sync

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1. Verantwortung und Verwendung

Nova-Manifest sync / kubeclaw.generate.blueprint-sync → src/stage.ts.
Kopiert explizite Kontrollpfade aus Gitref, committet geänderte Pfade und schreibt
Statusbericht. Nur durch ausgewählten Graph aktiv; nicht Teil des Projectcompilers.
Komplette Implementierung, Manifest, Schemas, README und beide Tests gelesen.

## 2. Eingaben, Gegenstellen und Ergebnisse

Input blueprintId/repositoryRoot/branchRef/nichtleere eindeutige controlPaths.
Eigene validateInput prüft Präsenz/Eindeutigkeit; Runtimeinputschema ergänzt Typen.
`git.sync/sync_paths` liefert synced[{path,action}]/missing; `git-workspace/
src/operations.ts:36–50` prüft Ref/Pfade, liest Gitobjekte, überspringt unveränderte
Inhalte und checkt geänderte Pfade aus. `git.commit` committet nur returned synced
paths (`operations.ts:55–61`). Danach state.append und Reportartefakt. Missing
führt request_fix, sonst passed. Keine Verifikation, dass branchRef zuvor eine
Architekturgenehmigung erhalten hat; dies ist Voraussetzung des Aufrufers.

## 3. Zustandsänderungen und Commitpunkte

Sequenz: Checkout (Worktree + Index) → Commit → Namespaceappend → Artifactwrite
→ StageResult. Kein atomarer Gesamtcommit. Bereits vorhandene Kontrollpfade werden
auch dann committet, wenn andere deklarierte Dateien fehlen. Das ist sichtbare
partielle Synchronisation, kein Rollback. Bericht enthält Refnamen, aber nicht
die konkrete aufgelöste Commitrevision oder den erzeugten Commit.

## 4. Korrektheit und Fehler

Keine eigene Catchall im Stage; Adapter-/Persistenzfehler propagieren. Ungültige
sync-Antwortarrays werden als leer behandelt, der registrierte Originaladapter
liefert jedoch die erwartete Form. Fehlende Dateien bleiben request_fix mit
Report. Gitadapter unterscheidet im show-Catch nicht fehlende Datei von sonstigem
Git-/Abbruchfehler; Eigentümer dieses Defekts ist
[git-workspace](kubeclaw.git-workspace.md), nicht eine zweite Stage-ID.

## 5. Timeouts, Abbruch, Wiederholung, Konkurrenz

Corelease/Effectcoordinator/Adapterrunner setzen Grenzen, Stage hat keine Retry-
oder Timerlogik. Mehrere Git-/Statusaktionen besitzen keine übergreifende
Repositorytransaktion. Externe HEAD-/Refänderungen zwischen Calls können Einfluss
haben; der Ref wird pro Datei ausgewertet. Idempotenz einzelner Adapterreceipts
ist keine globale Exactly-once-Synchronisation.

## 6. Crash und Wiederaufnahme

Abbruch nach Checkout vor Commit lässt Änderungen zurück. Nach Commit vor
state.append fehlt fachlicher Status, nach Status vor Artefakt fehlt Bericht.
Wiederanlauf muss Originaleffects reconciliieren; naive erneute Prüfung sieht
bereits gleiche Dateien und kann den ursprünglichen Änderungssatz verlieren.
Kein eigener Checkpoint oder Distributed-Recoverypfad; README sagt dies offen.
Core-Artefaktprojektion siehe PCR-EXEC-002, Mutex/Effectsrisiken dort zentral.

## 7. Autorisierung und Herkunft

git.sync/git.commit allowedRoots, state.append/artifacts.write Namespaces sowie
Gitadapter-Realpfad-/Ref-/Tokenprüfung sind Sicherheitsgrenzen. Plugin selbst
führt keine Shell aus. blueprintId und branchRef sind keine kryptographischen
Approvalbelege; auch Textinhalt ist nicht hier semantisch validiert. Externe
Architekturgenehmigung/Branchschutz als Betriebsannahme dokumentieren.

## 8. Ressourcen, Aufräumen, Aufbewahrung

Kein Pluginlimit für Anzahl/Bytes der Kontrollpfade; Gitrunner hat Zeit-/
Outputlimits. Staged Dateien/Commits sind beabsichtigte verbleibende Nebenwirkungen,
keine Tempworktrees. Status wächst im Store, Artefakte benötigen dessen Retention.
Voraussetzungen: Git, existierendes Repo und Ref, persistente State-/Artefaktstores.
Kein Fetch/Push in diesem Stagepfad, keine Clusteranbindung notwendig.

## 9. Architektur und Vereinfachung

Kleine Orchestrierung mit sauberem Gitadapter. Dauerhafte Verbesserung wäre
Sync aller Pfade gegen einmal aufgelöste Revision und dokumentierter atomarer
Veröffentlichung/Recoverytransaktion, statt Kompensations-Shims um jeden Call.
Für reproduzierbare Provenienz Sync-/Zielcommit in Bericht aufnehmen.

## 10. Tests

`npm test` **bestanden**:
[Originaltestprotokoll](../evidence/nova-batch-blueprint-sync-tests.txt).
Live-Test verwendet echte Gitbranches/-commits, Registry, Git-/State-/Artefaktadapter
und Runner. Prüft Dateiinhalt, Commitbetreff, Statusappend und Artefaktindex.
Kein Fake-Git, jedoch MemoryResourceLockManager im vorhandenen Test: keine Aussage
über echte Crossprocesslocks. Boundarytest nur statische Importsuche. Nicht
getestet: Missing-plus-present, Refdrift, Crashfenster, doppelter konkurrierender
Sync, ENOSPC. Externe Push-/Fetchrecovery nicht Teil dieses Tests.

## 11. Dokumentation

README korrekt zu changed-only Commit, missing → remediation und ausgeschlossener
Distributed-Recovery. **Unvollständig** zu bereits veröffentlichten Teiländerungen,
Commitprovenienz und Voraussetzung „validated architecture ref“ (nicht im Plugin
erzwungen). Keine vollständige Betriebsabnahme aus dem lokalen Test ableiten.

## 12. Befunde und Restunsicherheit

Keine doppelte eigene Befund-ID für Gitadapter-/Effectsrisiken. Konkrete offene
Verifikation: Originalrepo mit zwei Kontrollpfaden, Crash nach erstem Checkout
und nach Commit, dann echter Resume; Erfolg nur bei eindeutigem publizierten
Revision-/Statuszusammenhang. Beweglichen Branch während Sync testen und
später stabile Commitbindung implementieren. Diese Designgrenzen sind belegt,
aber ihre konkrete Verletzung im vollständigen laufenden System nicht simuliert.
