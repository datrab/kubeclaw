# kubeclaw.delivery-lint

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1. Verantwortung und Verwendung

Nova-Stage delivery-lint / kubeclaw.lint.delivery, src/stage.ts. Prüft begrenzt
Dockerfile-/Staticdestinationdeclaration, kein Build oder Ersatz für full lint.
Nur explizite Graphregistrierung, Projectcompiler nutzt full lint stattdessen.
Komplette Source, Manifest, drei Schemas, README und zwei Pakettests gelesen.

## 2. Verträge und Gegenstellen

Input moduleId plus nullable dockerfile/staticPath, config leer. Repositoryadapter
read_text liest Worktreedatei mit Realpfad-/Größenkontrolle, Artefaktadapter speichert
{moduleId,passed,failures}. Kein Dockerfile → passed mit Bericht. Regex extrahiert
COPYziele, Vergleich gegen staticPath. Fehler: Pathinvalid blocked, jeder
Readfailure request_fix, Destinationmismatch request_fix. Core on.request_fix
steuert Reparatur; Plugin startet sie nicht selbst.

## 3. Zustand und Nebenwirkungen

Read-only Repozugriff, immutable Report unter kubeclaw.delivery-lint. Kein Git-/
Container-/Dateisystemdirektzugriff. Report vor Ergebniscommit; Artefaktstore
und Core besitzen Persistenz, kein eigener Cache.

## 4. Korrektheit

Regex ist kein Dockerfileparser: einfache COPY src dest unterstützt, JSONform,
mehrere Quellen, Fortsetzungen, Variablen/WORKDIR und Multistage-Endbild nicht
zuverlässig. Keine gefundenen COPYziele werden als sauber akzeptiert. Konkreter
falscher Reject gültiger JSONform reproduziert: PCR-DELIVERY-001.

## 5. Timeout, Abbruch und Konkurrenz

Keine Timer/Retryloop; Corelease und Adapter begrenzen Calls. Read-Timeout/
Zugriffsfehler werden derselben request_fix-Klasse wie fehlende Datei zugeordnet,
obwohl Forge dies nicht zwingend beheben kann. Gleichzeitig mutierendes Worktree
ist nicht revisionsgebunden; Snapshotreview/Gates dürfen diesen Report nicht
als Commitbeweis behandeln.

## 6. Recovery

Wiederholung liest neu, kein persistierter Filedigest. Crash nach Reportwrite vor
Stagecommit hat Coreprojektion PCR-EXEC-002 als Abhängigkeit. Keine irreversible
externe Action im Plugin, keine Kompensation notwendig.

## 7. Vertrauen und Autorisierung

Grants für git.repository.read/artifacts.write, Adapter prüft Root/Symlinks.
Pluginpfade verbieten Traversal/NUL/Zeilenumbrüche; Finalpfadsicherheit beim
Repositoryadapter. staticPath ist Containerpfad, kein Hostwriteziel. Keine Secrets
und keine Agentenautorität. Caller kann dockerfile=null wählen; entsprechende
Pflicht muss der Graph/Produktvertrag festlegen.

## 8. Ressourcen und Cleanup

Kein eigenes Gesamtbytebudget, Repositoryadapter standardmäßig 4 MiB pro Datei;
Regex liest vollständigen Text. Kein eigener Retentionprozess; Storequote gilt.
Node + Repositoryvolume + Artefaktstore reichen für diese deterministische Stage.

## 9. Architektur

Kleine Capabilityorchestrierung, aber zweiter sehr schwacher Dockerfileparser.
Gemeinsamen etablierten Dockerfile-AST-/Buildmetadatenpfad verwenden und
unterstützte Semantik explizit halten; unbekannte Syntax nicht als Beweis der
Konsistenz deklarieren. Keine Folge-LLMheuristik zur Symptombehandlung.

## 10. Tests

`npm test` **bestanden**:
[Protokoll](../evidence/nova-batch-delivery-lint-tests.txt).
Originalregistry/Runner/Repo-/Artefaktadapter, echte lokale Dockerfiles; simple
COPY Pass/Mismatch, Missing, Traversal, Nullskip und echter Storepfadfehler.
Letzterer ist Dateitypfehler, kein Prozesscrash, obwohl Test ihn crash nennt.
Zusätzliche Probe mit unverändertem Stage und echten Repo-/Artefaktadaptern,
handverdrahtetem Context: `node docs/review/evidence/nova-batch-delivery-probe.mjs`
→ validJsonCopyRejected=true/request_fix. Kein Fakeparser, kein Dockerbuild.

## 11. Dokumentation

README **veraltet**: Config steuere Namespace (Schema leer, Namespace konstant),
Input enthalte Repositorypfad (nur Dockerfilepfad), npm test baue Paket (kein
Buildschritt). „internally consistent“ übertreibt Regexnachweis; unavailable
Repositorycapability ist im Code request_fix statt dokumentiert blocked.

## 12. PCR-DELIVERY-001 — Gültige JSON-COPYform wird falsch zurückgewiesen

**Mittel; mit Originalstage und echten Adaptern reproduzierter Defekt.**
`src/stage.ts#copyDestinations` Zeilen 33–38 und staticPathFailures Zeilen 93–104.
Auslöser Dockerfile `COPY ["dist", "public"]`, staticPath `public`. Regex behält
JSONsyntax am extrahierten Token; Vergleich misslingt und liefert request_fix.
Auswirkung: gültige Lieferung blockiert bzw. unnötige Reparaturzyklen; andere
COPYformen können falsche Sicherheit vermitteln. Rootfix parserbasierte
Dockerfile-Semantik mit eindeutigem finalen Ziel; Regression über bestehende
Realdatei-/Runnerroute für Shell/JSON/Multisource/Fortsetzung/WORKDIR/Multistage.
Keine Aussage über erfolgreichen Build aus bloßer Parserkorrektur.
