# Unabhängige Teilprüfung — 2026-09-20

Reviewer: frischer Reviewagent, nicht Implementierer dieser Änderungen. Scope:
REGISTER, W3-Verzeichnisgrenzen und das neue Cilium-Runbook. Keine Gesamtfreigabe,
kein Review des parallel bearbeiteten Backup-Patches. Grundlage sind der tatsächliche
Diff, die Abnahmekriterien A1–A8 einschließlich DOC und die jeweiligen
Implementierungsnachweise. Source ist `cd9f235345f5fd8736a2ffe75d806288e4d538db`,
Node `v24.21.0`, Linux im lokalen Workspace, ohne Clusterzugriff.

Der begrenzte W3-Fix hält der unabhängigen Wiederholung stand. REGISTER bewahrt
den aktuellen Bestand, hat jedoch eine konkrete Lücke bei Originalbelegreferenzen.
Cilium ist brauchbare Vorbereitung mit ausdrücklich verbleibenden Betreiberfällen.
Kein historischer Findingstatus darf durch diese Teilprüfung hochgestuft werden.

## Befunde

### R1 — P2: Nicht existierende Originalbelege werden akzeptiert

`scripts/review/remediation-register.mjs`, `validateRegister`: `source_review`
wird ausschließlich gegen das URL-Muster geprüft. Die tatsächliche Gitauflösung
findet nur für `verification_evidence` statt. Unabhängig ausgeführtes Gegenbeispiel:

```js
const r = structuredClone(original);
r.findings[0].source_review =
  'https://github.com/datrab/kubeclaw/blob/' + '0'.repeat(40) + '/missing.md';
validateRegister(r, identities, process.cwd()); // besteht unerwartet
```

Damit kann `--write` einen offensichtlich kaputten Originalbericht als aktuellen
Link erzeugen; der anschließende Check bleibt grün. Dies widerspricht der
beschriebenen Auflösbarkeitsprüfung für Original-/Implementierungsbelege.
Originalbelege durch denselben commitfesten Resolver prüfen und Negativfälle für
fehlenden Commit und fehlenden Pfad ergänzen. Keine fachliche Neuabnahme der
Originalbefunde ist dafür nötig. Die derzeit vorhandenen 90 unterschiedlichen
Originalreferenzen wurden separat per `git show SHA:Pfad` geprüft: alle auflösbar.
Der Befund ist somit eine nachgewiesene Prüflücke, kein behaupteter Datenverlust.

### R2 — P2 für Abschlussclaims: Pflichtmatrizen erfüllen A1 noch nicht vollständig

REGISTER nennt vier aggregierte Zeilen; Buster bündelt viele Erfolgs-/Fehler-,
Crash- und Lebensdauerfälle pro Zeile. Stabile einzelne Fall-IDs, Eingaben,
Vorzustände, erwartete Ergebnisse, Produktionspfad und konkrete Belegzuordnung
sind nicht durchgängig vorhanden. Eine Liste von Testnamen oder grüne Gesamtzahl
ersetzt diesen Sollmengenabgleich nach A1/A5 nicht. Vor einer Teil- oder
Gesamtabschlussentscheidung die Matrix auf einzelne Pflichtfälle ausarbeiten;
bei REGISTER die implementierten Mutationen exakt zuordnen, bei W3 auch die
noch ungeprüfte messbare Quotenfreigabe und Produktionsfälle offen führen.

Der erste REGISTER-Entwurf entstand vor der Matrix. Das ist ehrlich dokumentiert
und kein Fälschungsbefund; die zeitliche A1-Bedingung ist dennoch nicht rückwirkend
erfüllt. Eine heutige Gegenprüfung darf diesen Prozessverstoß nicht als ursprünglich
vorab erfüllte Bedingung darstellen. Der vorliegende Bericht bestätigt nur den
konkret wiederholten technischen Umfang.

## Unabhängig bestätigter Umfang

- `register.json` stimmt vollständig mit `HEAD` überein. Die neuen Identitätslisten
  entsprechen exakt den sortierten 154 historischen und fünf Integrations-IDs des
  Ausgangsregisters; sie sind nicht aus einer bereits verkleinerten Menge erzeugt.
  Die 13 unvollständigen Findings bleiben erhalten. Beide historischen Textblöcke
  in progress/handoff sind als unveränderte Suffixe nachgewiesen und als historisch
  gekennzeichnet. Statusdarstellung folgt JSON; die vier früheren Abweichungen sind
  benannt. Keine Neubewertung der 141 alten Abschlüsse erfolgt.
- `node --test scripts/tests/remediation-register.test.mjs tests/verification/reliability/buster-terminal-workspace-native.test.mts`:
  28 bestanden, keine Fehler/Skips. Zusätzlich
  `node --test skills/buster/engine/test-gates/tests/terminal-workspace.test.ts`:
  ein Test bestanden, tatsächlich drei temporäre Pfade entfernt, sechs geschützte
  Pfade erhalten. Es wurden echte Dateien gelöscht und gelesen, keine simulierte
  Löschwirkung. Der Hook in den Parentwechseltests ersetzt nur den Zeitpunkt des
  Pfadwechsels; die originale `fs.rm` führt die Löschung aus.
- A7-Negativkontrolle unabhängig wiederholt: unveränderte Cleanupimplementierung
  aus `HEAD` in ein isoliertes temporäres Verzeichnis kopiert, Testimport darauf
  umgebogen, dieselben fünf Tests ausgeführt. Zwei alte Fälle bestehen, die drei
  neuen scheitern. In beiden Parentwechseltests verschwinden fremde Dateien;
  der Defekt wird durch die Tests tatsächlich erkannt.
- W3 öffnet jeden übergebenen Vorfahren ohne Symlinkverfolgung, pinnt Job und
  Workspace und verwendet deren FDs für die Entfernung. Die alten
  `lstat`/pathname-basierten Elternprüfungen sind ersetzt. Die realen Consumer
  in `remote-plan-service.ts` importieren weiterhin diese Funktion. Der Test
  beweist die Helpergrenze; er führt keinen vollständigen Produktionsjob aus.
  Die Dokumentation begrenzt die Zusage korrekt auf quieszente Writer und nennt
  fehlende Ownership-/Restartintegration und separat belegte Recordquoten.
- Cilium-Runbook gegen deploy/migrate/verify-Skripte und ausgewählte Values gelesen:
  Single-Node/Same-CIDR, fortbestehendes kube-proxy, Operator-Assertion,
  Cordoning, fehlendes automatisches Rollback, Endpoint- und Markergrenzen sind
  richtig beschrieben. `bash -n` für beide Shellskripte besteht. Das ist keine
  Guard-/Migrationprüfung. Aktuelles Applikationsinventar, konkrete Hostrollback-
  Anweisungen und echte Netzwerkfälle bleiben ausdrücklich ausstehend.
  C1/C2/C-DOC sind damit nicht vollständig abgeschlossen.

Upstreambehauptungen wurden gegen [K3s Custom CNI](https://docs.k3s.io/networking/basic-network-options),
[K3s Networking Services](https://docs.k3s.io/networking/networking-services) und
[Cilium Migration](https://docs.cilium.io/en/stable/installation/k8s-install-migration/)
geprüft. Die Warnung, die Repositoryprozedur nicht mit der anderen Migration zu
vermischen, ist sachgerecht. Diese beweglichen Webquellen sind keine Identität
für die konkret eingesetzte Chartversion und kein Livebeleg.

## Belege und verbleibende Grenzen

[Prüfstand und Dateidigests](../../evidence/independent-slices-20260920/identities.json),
[gespeicherter Diff](../../evidence/independent-slices-20260920/reviewed.patch),
[neue Dateien](../../evidence/independent-slices-20260920/new-files/),
[Testausgabe](../../evidence/independent-slices-20260920/tests.txt) und
[Vorher-Fehlversuch](../../evidence/independent-slices-20260920/old-cleanup-tests.txt)
binden diese Prüfung an die betrachteten Bytes. Spätere Änderungen brauchen eine
gezielte Wiederholung. Keine Images, aktive Bundles oder Clusterkonfigurationen
wurden ausgeführt. A3/A4 gelten nur für die beschriebenen lokalen Dateivorgänge
und Konsistenzfälle. A6-Recoveryfristen und reale Kapazitätsverträge wurden nicht
bewiesen. Kein lokaler nativer Produktionscutover, kein Rest-13-Abschluss und kein
CONFIG-Abschluss. Die vorhandenen Abschlussgrenzen nach A8 bleiben bestehen.

## Gezielte Wiederprüfung nach R1-Korrektur

Der Validator führt Originalbelege jetzt durch dieselbe Gitauflösung wie
Implementierungsbelege. Drei neue Tests prüfen fehlenden Commit, fehlenden Pfad
und Schreibverweigerung vor Änderung irgendeiner Registerdatei. Unabhängiger
aktueller Lauf: 26/26 bestanden. Dieselben neuen Tests gegen die im ersten Review
gespeicherte alte Implementierung: 23 bestanden, genau drei fehlgeschlagen.
**R1 ist damit im geprüften Stand behoben.**

Die REGISTER-Matrix enthält nun G-01–G-23 plus drei neue unabhängige R1-Fälle mit
Vorzustand, Eingabe, Produktivpfad, Erwartung und Zuordnung zu exakten Testnamen.
Die technische Soll-/Ist-Zuordnung für diese 26 Registerfälle ist dadurch
nachvollziehbar; R2 ist für diesen REGISTER-Aspekt nachgeführt. Der ursprüngliche
zeitliche A1-Verstoß bleibt ausdrücklich dokumentiert und wird nicht rückwirkend
als erfüllt gewertet. R2 für die übrigen Buster-/Gesamtfälle ist damit nicht gelöst.

[Neue Digests, Dateistände und beide unabhängigen Läufe](../../evidence/independent-slices-20260920/r1-recheck/)
halten den Korrekturstand getrennt vom unveränderten ursprünglichen Reviewbeleg.

### Finaler REGISTER-Refaktor

Die abschließende Extraktion von `validateReference` und `validateHistoricalFinding`
wurde gelesen und der aktuelle Testlauf unabhängig wiederholt: 26/26, keine
Skips. Originalreferenzen bleiben im gemeinsamen Resolver, fachliche Status werden
weiterhin weder abgeleitet noch verändert. R1 bleibt behoben; die zeitliche
A1-Ausnahme bleibt bestehen. Der [finale Prüfstand samt Rohlog](../../evidence/independent-backup-20260920/final-recheck/)
enthält auch diese Generator-/Testbytes und ihre SHA-256-Werte.
