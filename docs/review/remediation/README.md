# Behebungsplan nach Inventar, Einzelreviews und Traces

Planungsstand 2026-09-09. **154 historische Finding-Kennungen vollständig erfasst und 14 Arbeitspaketen zugeordnet. Planungsauftrag abgeschlossen; aktive Umsetzung auf `fix/remediation-foundations-20260909`, siehe [Fortschritt](progress.md).** Entscheidungen sind bestätigte Zielvorgaben, keine Beschreibung des gegenwärtigen Implementierungsstands.

- [Bestätigte Entscheidungen D01–D11](decisions.md)
- [Arbeitspakete, Reihenfolge und Abnahmekriterien](work-packages.md)
- [Vollständiges Register mit Originalquellen](register.md)
- [Maschinenlesbarer Prüf- und Fortschrittsstand](register.json)
- [Fortsetzung und noch fehlende Nachweise](handoff.md)

## Quellen und unveränderliche Baseline

| Quelle | Commit | Umfang |
|---|---|---|
| [Codebasis](https://github.com/datrab/kubeclaw/tree/85ddfcbfc15e078780ea0434fc167e6f9a9b9488) | `85ddfcbfc15e078780ea0434fc167e6f9a9b9488` | `main` am 2026-09-09 weiterhin identisch; Code-Tree `e43c39eea59b07f0a749b7b49f3aefdd11b14ed0` |
| [Pipeline-Einzelreviews](https://github.com/datrab/kubeclaw/blob/a9e080ab1e1981ec5713e9b742f94280835fd347/docs/review/findings.md) | `a9e080ab1e1981ec5713e9b742f94280835fd347` | 93 Komponenten, 103 Kennungen |
| [Infrastrukturreview](https://github.com/datrab/kubeclaw/blob/eac591fb060458ebb6c6ba34599309e8c424bd08/docs/review/infrastructure/findings-index.json) | `eac591fb060458ebb6c6ba34599309e8c424bd08` | 29 Komponenten, 34 Kennungen |
| [Tracebericht](https://github.com/datrab/kubeclaw/blob/e3020a7258b8acdf96d9d220cbfab8cf88fb53e9/docs/review/paths/report.md) | `e3020a7258b8acdf96d9d220cbfab8cf88fb53e9` | 16 Szenarien, 17 neue kanonische Kennungen |

Das Infrastrukturreview berücksichtigt zusätzlich Cilium-Code an `1313cc3a89d74ce11d93666fad1a4b9a0f48e308`. Dieser Zusatzstand ist nicht als bereits in main vorhandene Migration auszugeben. Historische Reviewrefs sind Belegquellen, keine automatisch zusammengeführten Implementierungsbranches. Spätere Fixbranches müssen vor Umsetzung gezielt verglichen werden.

154 ist die Anzahl erhaltener **Kennungen**, nicht die Zahl unabhängiger Reparaturen oder ausschließlich bewiesener Defekte. Verdachtsfälle, offene Betriebsfragen, Dokumentationsfehler und inzwischen präzisierte Produktanforderungen behalten ihre Evidenzklasse im Originaltext. Trace-Aliasse zählen nicht erneut. Verwandte Ursachen werden verlinkt und möglichst gemeinsam behoben, ohne unterschiedliche Fehlerpfade zu verlieren.

## Verbindlicher Arbeitsablauf für die spätere Umsetzung

1. Aktuellen Implementierungscommit, Branchdrift und fremde Änderungen prüfen. Passende Paketgrenze übernehmen; bereits vorhandene Fixes nicht überschreiben oder doppelt implementieren.
2. Originalfinding und Codegegenstellen lesen; gegen aktuelle bestätigte Entscheidungen abgleichen. Zuordnung ist kein erneuter vollständiger Codereview.
3. Einfache dauerhafte Ursachenbehebung samt echter Regression/Verifikation ausarbeiten. Gemeinsam verwendete Verträge zuerst koordinieren. Keine Kompatibilitätsshims zur Symptombehandlung; obsoletes Verhalten nur nach belegter Aufruferprüfung entfernen.
4. Kleine prüfbare Commits/PRs je Ursache. Parallele Subagents dürfen voneinander unabhängige Pakete bearbeiten; ein Orchestrator verantwortet Schnittstellen, Gesamtregister und Integration. Unabhängige Gegenprüfung darf nicht allein den Status des implementierenden Agents übernehmen.
5. Pro Finding Implementierungscommit, ausgeführte Befehle, Ergebnisse, nicht ausgeführte Tests und verbleibende Voraussetzungen dokumentieren; relevante Architektur-/Betriebsdoku aktualisieren.
6. Betroffene Traceübergänge statisch erneut prüfen. Echte Regressionen, Integration und Cluster-/Operator-E2E getrennt nachweisen. Ein Code-Trace ist kein bestandener Laufzeittest.

## Status und Abnahme

| Findingstatus | Bedeutung |
|---|---|
| offen | Erfasst, aktuelle Ursache vor Umsetzung nochmals zu bestätigen. |
| in Bearbeitung | Zuständiger Bearbeiter, aktueller Commit und konkrete Arbeit festgehalten. |
| implementiert | Änderung vorhanden; Commit erforderlich, Verifikation kann noch offen sein. |
| blockiert | Konkrete Voraussetzung/Entscheidung fehlt; nächster Schritt und Zuständigkeit genannt. |
| verifiziert | Erforderliche Abnahmekriterien dieses Findings mit tatsächlichen Nachweisen erfüllt. |
| widerlegt / durch Zielentscheidung ersetzt | Begründeter Abgleich mit Quellen und bestätigter Entscheidung; keine stille Löschung. |

Verifikation separat: nicht ausgeführt / bestanden / fehlgeschlagen / blockiert. Bei nur lokaler Verifikation und erforderlichem offenen Clusterbeleg bleibt das Finding **implementiert** mit offener Betriebsprüfung. Dokumentationsfindings können durch konkret geprüfte korrigierte Dokumentation geschlossen werden; eine Betriebsfrage braucht den passenden realen Nachweis. Kein globales „alles gefixt“ bei offenen Kennungen.

## Grenzen des ursprünglichen Planungsauftrags

Der ursprüngliche Planungsauftrag änderte nur neue Planungsdokumentation unter `docs/review/remediation/`. Keine funktionalen Änderungen, Deployments, Publikation, kostenpflichtigen Ressourcen, CI-Anforderung oder Merge. Dokumentationscommit mit `[skip ci]`. Die bestätigte Demo-Credentialregel ist kein Anlass, echte Credentials in diesen Plan zu kopieren.

Repositoryregeln `CONTRIBUTING.md` und `docs/CONTRIBUTING.md` wurden gelesen. Die darin genannten allgemeinen Software-/Deploymentchecks sind für diesen Dokumentationsschritt nicht als bestanden behauptet; die relevante Prüfung ist Vollständigkeit, Quellen-/Link-/Abhängigkeitskonsistenz und `git diff --check`. Softwarechecks und Runtimevoraussetzungen gehören zu den späteren Paketen.

## Autorisierte Umsetzung

Der Auftraggeber hat nach Bestätigung des Plans die eigenständige Implementierung, Subagentdelegation und Gegenprüfung beauftragt. Funktionale Root-Cause-Fixes und echte Tests sind jetzt im Rahmen der Arbeitspakete autorisiert. Keine Shims, abgeschwächten Tests, Architekturabweichungen oder zusätzlichen Features. Deployments, Merges und CI bleiben ausgeschlossen. Fortschritt im Register/progress.md; ursprüngliche Planungsprüfung in validation.md bleibt historisch.
