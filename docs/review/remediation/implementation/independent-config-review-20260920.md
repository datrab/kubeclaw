# Unabhängiger Review: CONFIG-Workerschnitt und Buster-Capabilityfactory

Stand: 2026-09-20, erster eingefrorener Reviewstand. Maßstab sind
[A1–A8, F1–F6 und DOC](../acceptance-20260920.md), die
[CONFIG-Matrix](config-inventory-20260920.md) sowie
[Buster-Einzelfälle](buster-native-cases-20260920.md) und
[Cutovergrenzen](buster-native-cutover-20260920.md).
Der Reviewer hat keinen Produktivcode geändert. Kein Deployment, Hosteingriff,
Dockerbuild oder nativer Ressourcenversuch wurde ausgeführt.

## Ergebnis und Befund

**R-C1 / P2 — F4 ist für die fünf dynamischen Settings noch nicht vollständig
belegt.** CW02 und CD02 prüfen die Werte des echten `loadWorkerConfig`, aber
keine HTTP-Wirkung aller fünf Werte. Der vorhandene HTTP-Test belegt tatsächliche
Active-Admission und einen weiter erfolgreichen Healthrequest. Er erzwingt weder
Probeüberlauf noch Connectionüberlauf noch die konfigurierte Bodydeadline.
Die lokalen Shutdownfälle verwenden ihre Drainfrist direkt; der vollständige
native Produktionsentrypoint ist in diesem Lauf nicht geprüft. Ein Objektwert
allein erfüllt F4 für dynamisches Verhalten nicht. Erforderlich sind reale
Grenzüberschreitungen am Original-HTTP-/TCP-Consumer mit positiver Kontrolle;
die zentrale Shutdownkonfiguration muss ebenfalls die beobachtete Frist treiben.
Die Originalmatrix und Dokumentation müssen diese Grenzen konkret unterscheiden.
Root hat zusätzliche Tests beauftragt; deren spätere Bytes sind **nicht** durch
diesen ersten Lauf abgenommen.

**R-C2 / P2 — RC04 ist unabhängig nicht stabil bestätigt.** Der zusätzlich
ausgeführte Remoteplan-Servicevertrag erreichte seine Erfolgsmeldung
`nova-remote-deadlines`, endete danach jedoch mit
`BUSTER_REMOTE_SHUTDOWN_TIMEOUT` in `remote-plan-service.ts:611`, Exit 1.
Echtes util-linux flock und GNU tar waren über dieselben proot-Binds wie beim
Implementierer verfügbar. Die Ursache ist noch nicht geklärt; insbesondere
ist bisher nicht belegt, ob der Factoryrefactor, ein Altfehler oder die lokale
Prüfumgebung verantwortlich ist. Der frühere grüne Implementiererlauf ersetzt
nach A5 keine Ursachenklärung dieses Fehllaufs. Root wurde informiert.

Keine zusätzliche Produktionsregression durch Diffinspektion gefunden. Dies ist
keine vollständige F1–F6-Abnahme: 1374 Kandidaten sind weiterhin unklassifiziertes
Suchmaterial; Nova/Buster/Host, zahlreiche Prismsettings, gemessene Ressourcen,
Driftprüfung F5 und die vollständige Migration bleiben offen. Zwei verschiedene
Wertesätze unter `standard` sind keine belegten unterschiedlichen Hostprofile.

## Architektur und Lieferpfad

Die fünf migrierten Werte haben eine einzige Autorenquelle. Der Produktionsloader
liest sie ohne lokale Defaults; die fünf alten Envkeys und der alte Helmkey
werden ausdrücklich abgewiesen. Striktes Schema und zusätzliche Connection-
Budgetprüfung erfolgen vor Workeraktivierung. Authentifizierung und Secretquellen
bleiben im vorhandenen separaten Vertrag. Die ConfigMap enthält den öffentlichen
Operatorsnapshot, keine übernommenen Envsecretwerte.

Die Chartsymlinks vermeiden manuelle Kopien. Unabhängig ausgeführt wurde nicht
nur Quellchartrendering, sondern `helm package`, Rendering des entstandenen
Archivs und Laden der tatsächlich gerenderten ConfigMapdaten durch den
Produktionsloader. Dies bestand für `default` und `review-isolated`, jeweils
mit passender nativer Namespacebindung. Deployment und ConfigMap liegen im
selben Release-Namespace; Mountreferenz und alle fünf Werte stimmen. Checksum,
read-only Mount, Argo-Welle und die vorhandenen Trust-/Envoyprüfungen passen.
Dies beweist lokale Paketlieferung, keinen Argo-/Image-/Clusterlauf.

Der Helmhelper implementiert Teile derselben Validierung zusätzlich zum
Runtime-JSON-Schema. Er enthält derzeit keine konkurrierenden Operatorwerte,
aber Schlüssel-/Grenzänderungen müssen beide Validatoren konsistent halten.
Ein allgemeiner Schutz gegen künftig eingeführte lokale Defaults ist dadurch
noch nicht bewiesen. F5 bleibt offen.

Die Busterfactory entfernt die bisherige Inlinekonstruktion aus dem echten
Service und bildet dieselben elf Routen, Optionsanforderungen, Workspacewurzeln
und Directcommand-Shutdownsemantik ab. `add` und `required` sind kleine lokale
Hilfen; es entsteht kein zusätzlicher Runtimebesitzer. Der Konstruktor läuft
weiterhin im Parentservice. Der Refactor erfüllt keinen nativen B1–B5-Cutover;
die dokumentierte nachträgliche A1-Matrix heilt die fehlende Vorabmatrix nicht.

## Wiederholte Prüfungen und Negativkontrollen

[Rohbefehle](../../evidence/independent-config-20260920/commands.json) und
[Dateiidentitäten](../../evidence/independent-config-20260920/identities.json)
binden Commit, Node/Helm, Originalcode und Tests. Der
[Patch](../../evidence/independent-config-20260920/reviewed.patch) plus vollständige
Snapshots neuer/geänderter geprüfter Dateien binden den uncommitteten Stand.
Dokumentsnapshots tragen `.md.snapshot` bei unveränderten Bytes.

- [Runtime](../../evidence/independent-config-20260920/runtime.txt): 49 bestanden,
  keine Skips; explizites `SWARM_CONFIG` zeigt auf die Autorenquelle.
- [Deployment](../../evidence/independent-config-20260920/deployment.txt): 43 bestanden,
  keine Skips, einschließlich 36 neuer CONFIG- und sieben bestehender Prüfungen.
- [Factory-HTTP](../../evidence/independent-config-20260920/http.txt): zwei bestanden,
  tatsächlicher erlaubter/verbotener HTTP-Kontakt und vorhandene Leaseprüfung.
- [Archiv/Namespace/Loader](../../evidence/independent-config-20260920/package-namespace.txt):
  beide Namespaces bestanden; reproduzierbares [Prüfscript](../../evidence/independent-config-20260920/package-namespace.mjs).
- [Remoteplan-Service](../../evidence/independent-config-20260920/buster-service.txt):
  **fehlgeschlagen**, ein Test, kein Skip; R-C2 ist offen.
- [Prism-Typecheck](../../evidence/independent-config-20260920/prism-types.txt) und
  [Buster-Typecheck](../../evidence/independent-config-20260920/buster-types.txt): Exit 0.

Die [isolierten Mutanten](../../evidence/independent-config-20260920/negative-controls.py)
verändern ausschließlich temporäre Kopien:

1. Legacyguard entfernt: genau fünf CW05-Assertions scheitern am fehlenden
   Migrationsfehler; CW01/CW02 bleiben erfolgreich.
2. Connectionbudgetguard entfernt: genau zwei CW08-Assertions scheitern am
   fehlenden Budgetfehler; CW01/CW02 bleiben erfolgreich.
3. Factoryroute umbenannt: Factory-HTTP-Test scheitert an fehlendem Invoker;
   unveränderter direkter HTTP-Leasetest besteht. Dies belegt Erkennung einer
   fehlenden Route, **keine** zusätzliche Sicherheitsgrenze des HTTP-Invokers.

[Mutantenbefehle und Ergebnisse](../../evidence/independent-config-20260920/negative-controls.json)
sowie vollständige Rohlogs bleiben erhalten. Die ersten beiden Negativkontrollen
scheitern an den fachlich erwarteten Assertions, nicht an Import-/Toolproblemen.

## Dokumentation und Abschlussgrenzen

Geprüft wurden `operator-configuration.md`, Prism-Operatorguide, Config-README,
CONFIG-Inventur und beide Buster-Matrizen. Einheiten, Autorendatei, Startupcapture,
Migration und nicht ausgeführte Image-/Liveprüfung sind verständlich beschrieben.
Die aktuelle zentralisierte Reichweite wird ausdrücklich auf fünf Werte begrenzt.
R-C1 verhindert die Aussage, alle fünf dynamischen Wirkungen seien abgenommen.
Die nach Reviewbeginn angefassten Test-/Matrixdateien sind im
[Stabilitätsvergleich](../../evidence/independent-config-20260920/stability.json)
benannt; für sie gelten die gespeicherten alten Bytes, bis eine erneute Prüfung
vorliegt. Dokumentationsgates und neue ergänzende Tests werden von Root separat
abgeschlossen. CONFIG, B1–B5 sowie vollständiges F-DOC/B-DOC bleiben offen.
