# Codex Cloud: gesicherter Arbeitsstand

Aktueller Einstieg für die vom Auftraggeber am 12. Oktober 2026 verlangte
Repositoryübergabe. Zielbranch: **`codex/cloud-config-handoff-20261012`**.
Der Branch ist ein Arbeitsstand-Checkpoint auf Basis von
`cd9f235345f5fd8736a2ffe75d806288e4d538db`, keine Implementierungsabnahme und kein
Deploymentrelease. Remoteverfügbarkeit und Commit werden nach Push separat geprüft;
ein Dateititel allein beweist keine Veröffentlichung.

## In Codex Cloud fortsetzen

Repository `datrab/kubeclaw` und den genannten Branch auswählen. **Nicht den
unveränderten `main`-Branch als diesen Arbeitsstand behandeln.** Die vorhandenen
Source-/Teständerungen, privaten Kandidaten, Originalbelege und jüngsten
Entscheidungen werden in diesem Checkpoint erhalten; sie werden dadurch nicht
fachlich abgenommen oder zu neuen Behebungen dieser Sitzung erklärt.

Zuerst lesen:

1. [Bestätigte Entscheidungen D17–D20](decisions.md)
2. [Beschlossene Reihenfolge](implementation-order-20261012.md)
3. [CONFIG-Definition](config-definition-20261012.md)
4. [CONFIG-Inventur](config-scope-inventory-20261012.json)
5. [Unabhängiges CONFIG-Review](independent-config-definition-20261012.md)
6. [Bestandsaufnahme der 14 Punkte plus REGISTER/CONFIG](assessment-20261012.md)

Reihenfolge bleibt CONFIG → Test-Refactoring → Worker-/Cgroup-Refactoring → zwölf
offene Findings. Der freigegebene Teststandard aus der anderen Session fehlt noch.
Aktive Arbeit ist die gemeinsame Konkretisierung der codegestützten CONFIG-
Definition und ihrer ersten Umsetzungspakete. Der Repositorycheckpoint selbst
ist keine neue Implementierungsfreigabe.

`pipeline.json` soll gemeinsamer Systemeinstieg mit Komponentenreferenzen sein.
Geeignete Änderungen gelten für neu startende fachliche Module; gestartete
Einheiten behalten ihren dauerhaft vor Dispatch gebundenen Stand. Evals binden
eine feste Generation. Keine stillen Fallbacks oder doppelte Autoren; aktuelle
CLI-Graphen und neue Systemconfig sind ausdrücklich zu unterscheiden.

## Welche Belege gebraucht werden

Belege dokumentieren reale Befehle, Ergebnisse, Fehler, geprüfte Quellbytes und
Reviewgrenzen. Sie verhindern, dass eine alte grüne Statusmeldung als heutiger
Nachweis gilt. Für CONFIG können wir anhand von Code, Schemas und diesen
Ergebnis-/Quellbindungen weiterarbeiten; wir brauchen keine alte entpackte
Go-Installation oder abgelaufene Scanner-DB im Gitcheckout.

Der Checkpoint erhält nicht nur Zusammenfassungen: die nicht reproduzierbaren
Rohlogs, JSONresultate, Vorher-/Nachheridentitäten, Originalmanifeste,
Quellsnapshots, Fehlläufe, Runner und privaten Kandidaten bleiben an ihren
originalen Repositorypfaden enthalten. Sie werden nicht gekürzt, umgeschrieben
oder in PASS umklassifiziert. Git kann gleiche Inhalte deduplizieren und
komprimieren; die checkoutbaren Bytes bleiben die Originale.

## Große Dateien bewusst nicht in Git

Etwa 7,1 GiB der zuvor 9,6 GiB Evidence-Verzeichnisgröße waren Werkzeuge und
wiederherstellbare Eingabecaches unter
`docs/review/evidence/runtime-security-test-tools-20260924/tooling`:
Go-SDK/-Download/-Buildcache, Trivy-Binary/-Download sowie entpackte und
komprimierte Vulnerability-/Java-Datenbanken. Zusätzlich gehören `node_modules`,
Pythonbytecode und lokale `.kube`-/private Credentialdateien nicht zum neuen
Repositorysnapshot. Vorhandene lokale Originale werden **nicht gelöscht**.

Erhalten bleiben die kleinen Herkunfts-/Prüfsummenberichte, Go-Vorbereitungs-
stdout/stderr und official-downloads, DB-Metadata, OCI-Manifeste und die Logs
des tatsächlichen Install-/Resolveversuchs. Die genaue Auswahl und die bewusst
nicht übertragenen großen Inputs stehen im
[Transport-/Belegmanifest](../evidence/cloud-readiness-20261012/evidence-selection.json)
und [Werkzeug-/Cachemanifest](../evidence/cloud-readiness-20261012/omitted-tooling.json).

Ein historischer Securitylauf wird ohne die alten Inputs nicht als identisch
wiederholbar behauptet. Versionen/Hashes und Rohlogs bleiben nachvollziehbar.
Für neue reale Tests werden Toolchains über die vorhandenen Locks/Versionen
hergestellt und frische echte DBs separat bezogen; abgelaufene DBs sind kein
aktueller Sicherheitsnachweis. Unterschiedliche Inputs bedeuten neue Laufbindung,
keine umgeschriebenen historischen Ergebnisse.

## Prüfen und Grenzen

- Vollständige Git-Historie für die Originalbefunde bereitstellen. Bei einem
  shallow Checkout fehlende Originalcommits zuerst über die normale Git-
  Verbindung holen. Die sechs im Register referenzierten Blobcommits wurden als
  Vorfahren des Checkpoint-Baseline-HEAD geprüft.
- Dependencies aus dem tatsächlichen Lockfile installieren. Keine alten
  `node_modules` oder absoluten `/home/node/...`-Sessionpfade übernehmen.
- `node scripts/review/remediation-register.mjs --check` ausführen. Das ist eine
  Konsistenzprüfung, keine fachliche Findingabnahme.
- Cloud-/Kernel-/Container-/Clusterfähigkeit vor betreffenden echten Tests
  feststellen. Die Veröffentlichung autorisiert keine Hosteingriffe, Deployments,
  destruktiven Tests oder automatische Befundpromotionen.
- Neue Änderungen erst mit ihren tatsächlichen Consumer-/Negativfällen und
  Dokumentationsprüfung abnehmen. Historische Entwürfe bleiben Entwürfe.

Es wird ein separater Checkpoint veröffentlicht, ohne `main` zu überschreiben,
ohne Merge und ohne neue Behebung. Der ursprüngliche lokale Branch und Index
bleiben erhalten. Die Absicherung umfasst Quellen-/Treeidentitäten,
Registerkonsistenz, Originalreferenzen, Belegauswahl und eine unabhängige Prüfung;
sie ist kein neuer Gesamtlauf aller historischen Tests.
