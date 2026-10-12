# Behebungsplan nach Inventar, Einzelreviews und Traces

**Codex-Cloud-Checkpoint:** [aktueller Einstieg, Zielbranch und erhaltene Belege](CLOUD-READY.md). `codex/cloud-config-handoff-20261012` ist der zu prüfende Übergabebranch; `main` wird nicht überschrieben. Große reproduzierbare Tool-/DB-/Dependencycaches bleiben außerhalb Git, Originalresultate und Quellbindungen werden erhalten.

**Aktive CONFIG-Definition (12. Oktober):** [vollständiger Scope, Eigentümer, Profile und Abnahme](config-definition-20261012.md), [48 Plugins / 57 Configschemas](config-scope-inventory-20261012.json), [unabhängige Prüfung](independent-config-definition-20261012.md). [Cloud-Wiedereinstieg und Übertragungsgrenzen](resume/CLOUD-HANDOFF-20261012.md). D20 bestätigt den Systemeinstieg `pipeline.json` mit Komponentenreferenzen und geeignete Änderungen ab dem nächsten Modulstart; keine neue Codeimplementation.

**Aktuelle Entscheidung und Reihenfolge (12. Oktober 2026): [beschlossener Arbeitsplan](implementation-order-20261012.md), [D18/D19](decisions.md#d18--kubernetes-ausführung-statt-eigener-nativer-hostpools) und [detaillierte Workervereinfachung](worker-execution-simplification-20261012.md).** CONFIG → Test-Refactoring → Cgroup-/Worker-Ausführungsrefactoring → zwölf offene Findings. Zielwechsel akzeptiert unter der Bedingung wesentlicher Vereinfachung und besserer Skalierbarkeit; aktueller Auftrag ist Dokumentation ohne Codebeginn. [Neue Bestandsaufnahme](assessment-20261012.md).

**Historischer Ausführungsstand (9. Oktober 2026): [exakter Stand und Restnachweise](resume/HANDOFF-20261009.md).** Seine Implementierungsreihenfolge ist durch die obige Entscheidung abgelöst. Ältere Laufmeldungen unten bleiben historisch.

Planungsstand 2026-09-09. **154 historische Finding-Kennungen vollständig erfasst und 14 Arbeitspaketen zugeordnet. Planungsauftrag abgeschlossen; aktive Umsetzung auf `fix/remediation-foundations-20260909`, siehe [Fortschritt](progress.md).** Entscheidungen sind bestätigte Zielvorgaben, keine Beschreibung des gegenwärtigen Implementierungsstands.

- [Bestätigte Entscheidungen](decisions.md)
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
| verifiziert | Erforderliche Abnahmekriterien dieses Findings mit tatsächlichen Nachweisen erfüllt. |

Das aktuelle Register akzeptiert genau diese vier Findingstatus. Blockierungen, Widerlegungen und Auswirkungen bestätigter Zielentscheidungen werden mit Begründung in den Prüfgrenzen, nächsten Schritten oder Entscheidungshinweisen dokumentiert; sie sind keine zusätzlichen Statuswerte des gepflegten Generators.

Verifikation wird separat als nicht ausgeführt, bestanden, fehlgeschlagen oder blockiert geführt. Gemäß [D12](decisions.md#d12--lokaler-abschluss-und-separate-live-abnahme) darf ein Finding bei vollständig korrigiertem Code und ausreichender lokaler Testabdeckung **verifiziert** sein; ausstehende Live-/Cluster-Abnahmen werden ausdrücklich separat ausgewiesen. Fehlende Implementierung oder lokale Nachweise erlauben diesen Abschluss nicht. Maßgeblich für den aktuellen Auftrag sind die [Abnahmekriterien einschließlich Dokumentationspflicht](acceptance-20260920.md). Dokumentationsfindings benötigen konkret geprüfte Dokumentation; eine Betriebsfrage benötigt den jeweils geforderten realen Nachweis. Die frühere Vorgabe, jedes Finding bis zur Clusterabnahme auf **implementiert** zu belassen, ist durch D12 ersetzt.

## Register pflegen und prüfen

[register.json](register.json) ist die gepflegte Quelle für Einzelstatus, Belege und Prüfgrenzen. Nach einer belegten Einzelentscheidung werden die Darstellungen erzeugt und geprüft:

```sh
node scripts/review/remediation-register.mjs --write
node scripts/review/remediation-register.mjs --check
node --test scripts/tests/remediation-register.test.mjs
```

Der Generator aktualisiert Register-Markdown, aktuelle Zähler in Fortschritt und Übergabe sowie die JSON-Zählersumme. Er ändert keine fachlichen Einzelstatus und lässt historische Checkpoints erhalten. `--check` schreibt nichts. Die Prüfung erkennt Struktur-, Beleg- und Darstellungsfehler; sie ersetzt keine fachliche Abnahme der verlinkten Implementierung. Commitfeste historische Belege werden über lokale Gitobjekte aufgelöst; fehlende Objekte in einem flachen Checkout führen zu einem sichtbaren Fehler. Prüfumfang und Grenzen stehen im [Registerkonsistenznachweis](implementation/register-consistency-20260920.md).

## Grenzen des ursprünglichen Planungsauftrags

Der ursprüngliche Planungsauftrag änderte nur neue Planungsdokumentation unter `docs/review/remediation/`. Keine funktionalen Änderungen, Deployments, Publikation, kostenpflichtigen Ressourcen, CI-Anforderung oder Merge. Dokumentationscommit mit `[skip ci]`. Die bestätigte Demo-Credentialregel ist kein Anlass, echte Credentials in diesen Plan zu kopieren.

Repositoryregeln `CONTRIBUTING.md` und `docs/CONTRIBUTING.md` wurden gelesen. Die darin genannten allgemeinen Software-/Deploymentchecks sind für diesen Dokumentationsschritt nicht als bestanden behauptet; die relevante Prüfung ist Vollständigkeit, Quellen-/Link-/Abhängigkeitskonsistenz und `git diff --check`. Softwarechecks und Runtimevoraussetzungen gehören zu den späteren Paketen.

## Autorisierte Umsetzung

Der Auftraggeber hat nach Bestätigung des Plans die eigenständige Implementierung, Subagentdelegation und Gegenprüfung beauftragt. Funktionale Root-Cause-Fixes und echte Tests sind jetzt im Rahmen der Arbeitspakete autorisiert. Keine Shims, abgeschwächten Tests, Architekturabweichungen oder zusätzlichen Features. Deployments, Merges und CI bleiben ausgeschlossen. Fortschritt im Register/progress.md; ursprüngliche Planungsprüfung in validation.md bleibt historisch.
