# Autonomer Start und Fortsetzung — CONFIG und Folgearbeiten

Stand: 2026-10-13. Auftraggeberziel: Die Übergabe soll die vollständige
Config-Zentralisierung selbständig ausführbar machen, anschließend die übrigen
offenen Punkte. Ein erfolgreicher Review einzelner Belege ist nicht dieses Ziel.
Diese Datei konkretisiert den Einstieg; sie ersetzt weder
[den vollständigen Auftrag](OPENCLAW-CONFIG-GOAL.md) noch D17–D22 oder erteilt
eine bislang fehlende Implementierungsfreigabe.

## Jetzt startbar: Definition bis zum reviewten Umsetzungspaket

Im Checkout von `datrab/kubeclaw`:

```text
/goal start Lies docs/review/remediation/GOAL-START.md und OPENCLAW-CONFIG-GOAL.md im Repository datrab/kubeclaw. Schließe C0 selbständig anhand des aktuellen Codes vollständig ab, korrigiere und überprüfe Findings mit frischen unabhängigen Reviewern ohne Autorenkontext und liefere das konkrete freigabefähige CONFIG-Umsetzungspaket. Bewahre Kriterien, Rohbelege und Wiederaufnahmezustand; keine C1–C6-Implementierung vor Paketfreigabe.
```

Keine vorbereitende Inventararbeit durch den Nutzer nötig. Offene fachliche
Definitionen sind Arbeit des Goals. Nur echte externe Informationen oder neue
fachliche Entscheidungen erfragen; alle davon unabhängigen Arbeiten fortsetzen.
Die bereits bestätigten Prinzipien nicht erneut zur Abstimmung stellen.

## Tatsächlicher Startzustand

Arbeitsbranch: `codex/config-c0-semantic-inventory-20261012`,
Draft-PR [#18](https://github.com/datrab/kubeclaw/pull/18), Zielbranch
`codex/cloud-config-handoff-20261012`, nicht `main`.
Letzter vor dieser Übergabe geprüfter Fixcommit: `f94f44e37`.
Bei Start immer aktuelle Commit-/Tree-Identität und Arbeitsbaum erneut erfassen.
Fremde untracked/dirty Arbeit weder überschreiben noch pauschal committen.

Der kanonische Stand enthält 2.409 Inventarzeilen, 30 Gap-Einträge und 6.845
Matrixfälle. Diese Zahlen sind Navigation, keine Vollständigkeitsbeweise.
Die C0-A–E-Gates stehen auf `not-run`; `implementationAuthorization` ist `null`.
Die fünf zuletzt behobenen Dokument-/Validatorfindings sind begrenzt unabhängig
bestätigt, nicht globale C0-Abnahme. Status bei Wiederaufnahme aus den tatsächlichen
Dateien lesen, nicht diese datierte Momentaufnahme als aktuellen Beweis verwenden.

## Nächste Arbeit, nicht nur weitere Belegpflege

Seit Nutzerbestätigung vom 2026-10-14 gilt die Arbeitssteuerung im
[Hauptauftrag](OPENCLAW-CONFIG-GOAL.md#arbeitssteuerung--vom-nutzer-bestätigt-am-2026-10-14).
Aktuelle Aufgaben ausschließlich über die [zentrale Restliste](config-c0-closeout.md)
steuern; die folgenden Schritte erklären das Verfahren, nicht eine weitere Queue.

1. [Inventar](config-semantic-inventory.json), [Matrix](config-acceptance-matrix.json)
   und [Definition](config-definition-current.md) zusammen mit den Originalquellen
   lesen. `gaps`, offene Zeilen, Kandidaten-/Quellendispositionen und fehlende
   Reviewerbestätigungen sind die Arbeitsliste. Bereits korrigierte historische
   Meldungen nicht ohne Prüfung nochmals als aktuelle Lücke behandeln.
2. Fehlende Consumerketten, Domänen, vollständige Profile, Autoritäten und konkrete
   Fallbeschreibungen abschließen: Komponenten; Runtime/ENV/CLI/Agenten;
   Charts/Images/Skripte/CI/Release; Prism-/Core-Restdomänen. Quellscanner und
   Strukturprüfer ersetzen keine selbständige fachliche Vollständigkeitsprüfung.
3. Modul-/Run-/Service-/Planbindung mit realen Dispatch-, Recovery-, Grant-,
   Budget- und Evalpfaden definieren. Externe Profile, installierte Plugins und
   Secretrevisionen als präzise fehlende Inputs erfassen, niemals erfinden.
4. C0-A–E vollständig unabhängig prüfen lassen. Findings selbständig beheben und
   materielle Korrekturen nachprüfen lassen. Implementierungsfälle bleiben bis
   zur genehmigten Umsetzung `not-run`; erforderliche Definitionsprüfungen
   brauchen tatsächliche Belege.
5. Reviewtes Umsetzungspaket vorlegen: genaue Settings/Dateien/Consumer,
   C1–C6-Schnittgrenzen und Abhängigkeiten, eingefrorene Pflichtfall-IDs,
   Liefer-/Aktivierungs-/Recoveryverträge, lokale versus Live-Gates und echte
   offene Entscheidungen. Erst dieses konkrete Ergebnis zur Freigabe stellen.

Draftintegrität lässt sich im Repo mit folgendem vorhandenen Befehl prüfen:

```sh
python3 docs/review/evidence/config-acceptance/author/check-matrix.py --structural
```

Ohne `--structural` prüft das Werkzeug die strengeren Abschlussbedingungen.
Ein strukturelles PASS ist weder semantische C0-Abnahme noch Laufzeitnachweis.

## Nach Freigabe: gesamte CONFIG-Umsetzung

Die Freigabe mit Paket-/Fall-IDs und Commitbezug dauerhaft festhalten. Werden
alle C1–C6-Schnitte ausdrücklich freigegeben, sie in einem Umsetzungsgesamtziel
nacheinander bearbeiten, ohne für gewöhnliche Fixes/Tests erneut anzuhalten.
Ist nur C1 freigegeben, C2–C6 nicht still mitfreigeben. Der konkrete Startauftrag
verweist dann auf die tatsächliche Freigabe, nicht auf eine erfundene Paket-ID.

F1–F6/F-DOC/A1–A8 und die F-AUTH/F-VAL/F-EFFECT/F-DELIVERY/F-BIND/F-MUT/F-CODE/
F-DOC-Gates des Hauptauftrags bleiben verbindlich. Ende erst nach vollständiger
Implementierung des genehmigten Umfangs, realen Consumer-/Negativ-/Mutations-/
Recoveryprüfungen, aktualisierter Doku und frischer unabhängiger Abnahme.
Lokaler Abschluss und fehlende Live-Abnahme getrennt ausweisen.
Kein Deployment, Merge, Eingriff in Produktionshosts oder bezahlter Eval aus
einer reinen CONFIG-Codefreigabe ableiten.

## Danach: andere offene Punkte

Die [beschlossene Reihenfolge](implementation-order-20261012.md) beibehalten:
CONFIG → TEST-REFACTOR → WORKER-EXECUTION → zwölf historische Findings.
Je Phase eigenes konkretes Goal mit Quellenstand, freigegebenem Umfang,
Pflichtfällen, Stopgrenzen und unabhängiger Abnahme verwenden.

TEST-REFACTOR benötigt den tatsächlichen freigegebenen Standard der anderen
Session; keine Testkategorien erfinden. WORKER-EXECUTION übernimmt D18 und die
[Worker-Verträge](worker-execution-simplification-20261012.md) erst nach diesem
Teststandard. Historische Findings einzeln am dann aktuellen Stand prüfen;
gemeinsame CONFIG-/Workerbelege referenzieren, nicht automatisch schließen.
Diese Phasen sind vorbereitet beschrieben, nicht bereits umgesetzt/freigegeben.

## Wiederaufnahme ohne Gesprächsgeschichte

Nach jedem abgeschlossenen Schnitt `config-definition-current.md`, Inventar,
Matrix und [Fortschritt](progress.md) konsistent aktualisieren: exakter
Commit/Tree beziehungsweise Patch-/Inputidentitäten, ausgeführte Befehle und
Rohbelege, Findings/Gates, geltende Freigabe, nächster konkreter Schritt und
fehlende Inputs. Historische Fehlschläge nicht überschreiben.

Bei Sessionwechsel denselben Repo-Einstieg verwenden und aktuellen Stand lesen.
`/goal` bindet ein Ziel an eine Session; es ist keine Cron-/Hintergrund-Taskqueue.
Pausierte Ziele mit `/goal resume` fortsetzen; Status mit `/goal` prüfen.
Kein neues Ziel automatisch erzeugen oder ein vorhandenes Ziel ersetzen.
Dieser Vorbereitungsauftrag startet noch keine Zentralisierungsimplementierung.
