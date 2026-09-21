# AP09 — Verbindlicher Abnahmevertrag für AP09.7 bis AP09.13

Status: verbindliche Abnahmegrundlage
Stand: 20.09.2026
Geltungsbereich: AP09.7 bis AP09.13 und der gemeinsame AP09-Abschluss
Qualitätsgrundlage: `docs/blueprint/07-documentation-quality-standard.md`

## 1. Ziel und Bedeutung von „vollständig“

Dieser Vertrag macht „hochwertig“, „vollständig“ und „wertvoll“ prüfbar. Ein
Paket besteht nur, wenn jeder zugeordnete Abnahmepunkt bestanden ist. Es gibt
keine Durchschnittsnote und keinen Ausgleich zwischen Punkten. Ein einziger
materieller Fehler stoppt die Abnahme.

„Bestanden“ bedeutet nicht, dass das Produkt jede beschriebene Funktion bereits
besitzt. Eine echte Produktgrenze darf offen bleiben. Die Dokumentation muss
dann den exakten blockierten Schritt, die aktuelle Implementierungsgrenze, die
sichere Stop-Regel, den Owner und die messbaren späteren Akzeptanzbedingungen
nennen. Sie darf die fehlende Funktion nicht durch ein erfundenes Kommando oder
eine unbewiesene Erfolgsaussage ersetzen.

## 2. Nicht verhandelbare Regeln gegen Scheinabnahmen

Die folgenden Regeln gelten für jeden Punkt `A97-*` bis `A913-*`.

1. **Binäre Entscheidung:** Der Reviewer vergibt nur `PASS` oder `FAIL`. `PASS
   mit Vorbehalt`, Prozentwerte und gewichtete Gesamtwerte sind unzulässig.
2. **Hundertprozentige Zuordnung:** Jeder dem Paket zugeordnete Eintrag aus
   `generated/ap09-catalogue.json` braucht einen kanonischen Leserort und einen
   einzelnen Abnahmebefund. Stichproben dürfen diese Zuordnung nicht ersetzen.
3. **Behauptung und Beweis:** Jede verhaltensrelevante Aussage braucht einen
   schmalen, revisionsfesten Link auf Implementierung, Vertrag, Schema,
   Konfiguration oder Test. Dateiexistenz allein ist kein Beweis.
4. **Keine Proxy-Metriken:** Seitenzahl, Wortzahl, Überschriften, Linkzahl,
   Schema-Verweise und ein grüner Build beweisen weder Richtigkeit noch Tiefe.
5. **Rekursive Vollständigkeit:** „Alle Felder“ bedeutet alle verschachtelten
   Felder, Bedingungen, Varianten, Defaults, Grenzen, Präzedenzregeln und
   Consumer. Eine Top-Level-Tabelle besteht diesen Vertrag nicht.
6. **Ausführbare Aufgaben:** Ein Verfahren braucht Voraussetzungen, Ort,
   Berechtigungen, exakte Schritte, erwartete Beobachtungen, Exit- oder
   Stop-Regeln, Fehlerunterscheidung, Recovery, Cleanup und aufzubewahrende
   Evidenz. Ein nicht ausgeführtes Live-Verfahren bleibt als `not run` markiert.
7. **Keine erfundenen Gründe:** Quellcode beweist Verhalten, nicht die
   historische Absicht. Fehlt die Entscheidungsquelle, nennt die Seite den
   historischen Grund `unknown`, kennzeichnet heutige Erklärungen als Inferenz
   und beschreibt Kosten sowie Neubewertungsbedingungen.
8. **Aktueller Quellstand:** Der Evidence-Commit muss vollständig sein. Der
   Reviewer verwirft Links auf ältere Implementierungen, sobald eine relevante
   Datei nach diesem Commit geändert wurde.
9. **Saubere Lesergrenze:** Die Aufgabe muss allein mit `docs/site`, den dort
   verlinkten aktuellen Quellen und den genannten Werkzeugen lösbar sein.
   Package-READMEs, Review-Dateien, Migrationsnotizen, Chatverlauf und verborgenes
   Maintainerwissen sind keine zulässigen Voraussetzungen.
10. **Getrennte Evidenzklassen:** Source-, Unit-, Contract-, Render-,
    Target-Image-, Deployment- und Live-Evidenz bleiben getrennt. Eine niedrigere
    Klasse darf keine höhere Klasse vortäuschen.
11. **Unabhängige Prüfung:** Ein Quelltreue-Reviewer, ein Clean-Reader und ein
    Architektur-/Sprach-Reviewer erhalten getrennte Aufträge, frischen Kontext
    und zunächst kein Änderungsrecht. Eine Person darf nicht mehrere dieser
    Rollen im selben Paket abnehmen. Bei einem `FAIL` muss nach der Korrektur der
    betroffene Weg erneut mit frischem Kontext geprüft werden.
12. **Reproduzierbarer Befund:** Der Abnahmebericht enthält Commit, sauberen
    Arbeitsbaum, Umgebung, Befehle, Exit-Codes, relevante Ausgaben, übersprungene
    Prüfungen, Reviewerauftrag und Befund. „Bei mir funktioniert es“ ist kein
    Abnahmebeleg.
13. **Negative Beweise:** Jede automatische Vollständigkeitsprüfung braucht
    mindestens eine Mutation, die ein neues öffentliches Element einführt und
    wegen fehlender Dokumentation rot wird. Ein Check, der nur den aktuellen
    grünen Bestand kennt, beweist keine Driftkontrolle.
14. **Keine Restbefunde:** Ein materieller offener Dokumentationsbefund ergibt
    `FAIL`. Eine Produktlücke ist nur dann kein Dokumentationsbefund, wenn die
    aktuelle Grenze, Auswirkung, sichere Handlung und spätere Akzeptanz vollständig
    dokumentiert sind.

## 3. Drei getrennte Beweisebenen

Die Abnahme darf die 261 Inhaltsanforderungen und die 89 Qualitätsgates nicht
vermischen. Das Evidence-Ledger enthält deshalb drei getrennte Mengen:

1. **261 Anforderungsbefunde:** Für jede Katalog-ID gibt es genau einen eigenen
   Befund mit Katalog-Owner, Katalog-Ziel, Leserfrage, konkretem Ergebnis,
   Source-Evidence, Artefakten und den zugehörigen Abnahme-IDs. Eine Liste von
   IDs an einem Sammelbefund ist kein Ersatz.
2. **89 Gate-Befunde:** Für jede ID dieses Vertrags gibt es genau einen eigenen
   Befund. Ein Gate verweist auf die zugehörigen Anforderungsbefunde. Mehrere
   Gates dürfen dieselbe Anforderung aus verschiedenen Blickwinkeln prüfen.
3. **Vorregistrierte Fixtures:** Suche, Darstellung, statische Persona-Aufgaben,
   dynamisch entdeckte Erweiterungsaufgaben und jede Driftmutation kommen
   unverändert aus
   [`AP09-acceptance-fixtures.json`](AP09-acceptance-fixtures.json). Query,
   Sollseite, Maximalrang, Browser, Viewport, Aufgabe, Ergebnis, konkrete
   Sourcefläche, deterministischer Mutationskonstruktor, zuständiges Gate,
   betroffene Seite und Fehlerschwelle werden vor dem Lauf festgelegt.
   Dynamische Aufgaben kommen aus einem am geprüften Commit erzeugten Inventar,
   das jede entdeckte Erweiterungsklasse und jedes komplexe Plugin genau einmal
   erfasst. Nachträglich ausgewählte Erfolgsbeispiele ergeben `FAIL`.

Der Paketkatalog ist dynamisch. Die heute erkannten 51 Pakete sind ein
Baseline-Befund und keine erlaubte Sollzahl. Discovery ist die Authority. Ein
neues Paket vergrößert Inventar und Dokumentationspflicht automatisch.

## 4. Pflichtformat und unveränderliche Evidenz

Für jeden Abnahmepunkt muss der Befund diese Felder enthalten:

| Feld | Pflichtinhalt |
| --- | --- |
| `acceptance_id` | Exakte ID aus diesem Vertrag. |
| `catalogue_ids` | Maschinell aus den 261 Einzelbefunden abgeleitete betroffene Katalog-IDs. Die Liste ist nicht selbst der Inhaltsbefund. |
| `revision` | Vollständiger 40-stelliger geprüfter Produkt-/Dokumentations-Commit. |
| `reader_task` | Aufgabe in einem Satz, ohne Lösungsandeutung aus dem Reviewkontext. |
| `reader_fixture_ids` | Exakte vorregistrierte statische und dynamische Reader-Aufgaben, die dieses Gate ausführen. Eine leere Liste ist nur zulässig, wenn keine Aufgabe dem Gate zugeordnet ist. |
| `execution_scenario_ids` | Exakte vorregistrierte Betriebs-, Lifecycle-, Erfolgs- und Fehlerläufe, die dieses Gate beweisen. Eine allgemeine `PRIMARY`-Ausführung kann keinen fehlenden Szenariolauf ersetzen. |
| `canonical_pages` | Verwendete veröffentlichte Seiten unter `docs/site`. |
| `source_evidence` | Revisionsfeste schmale Links für alle materiellen Aussagen. |
| `execution` | Befehle oder manuelle Schritte, Umgebung, Exit und Beobachtung. |
| `negative_proof` | Strukturierte Fehlerfälle und Mutationen mit Sollfehler, Beobachtung und gespeichertem Artefakt. |
| `limits` | Strukturierte Grenzen mit Status, Grund, Wirkung, Owner, späterer Akzeptanzbedingung und Beleg. |
| `reviewer_ids` | Verweise auf drei getrennte gespeicherte Reviews für Source, Reader und Qualität. |
| `verdict` | Ausschließlich `PASS` oder `FAIL`. |
| `reason` | Konkrete Begründung; bei `PASS` auch, was der Beweis nicht zeigt. |

Fehlt ein Feld, ist der Punkt nicht geprüft. Ein `PASS` ohne gespeicherten Befund
ist ungültig.

Der geprüfte Commit und das Evidence-Bundle sind getrennt. `reviewed_revision`
ist der unveränderte Produkt-/Dokumentationsstand. Der spätere Commit, auf dem
der Prüfungsbefehl läuft, enthält nur das Ledger und Dateien unter
`docs/blueprint/acceptance-evidence/`. Seine ID wird vom Prüfer aus Git gelesen
und steht nicht im Ledger. Damit muss ein Ledger nicht seine eigene Commit-ID
vorhersagen. Jede Artefaktdatei besitzt Pfad, Bytezahl, SHA-256,
Evidenzklasse und Status. Der Prüfer verwirft fehlende Dateien, Hashabweichungen
und Änderungen an Produkt oder `docs/site` zwischen beiden Commits.

Ein Source-Link ist nur gültig, wenn Host und Repository exakt
`github.com/datrab/kubeclaw` sind, der Commit `reviewed_revision` ist, das Ziel
in diesem Commit eine reguläre Git-Datei mit Modus `100644` oder `100755` und
kein Symlink oder sonstiger spezieller Eintrag ist und der aufsteigende
Zeilenbereich innerhalb der Datei liegt. Ein kanonischer Leserort muss eine
reguläre Markdown-Datei unter `docs/site` sein. Auch das vollständige
Publication-Inventar muss jeden Markdown-Symlink ablehnen. Das Fragment muss
einer vorhandenen Überschrift oder einer
expliziten HTML-ID entsprechen. Weil die Publication alle Markdown-Dateien
unter diesem Root übernimmt, beweist dieser Test zugleich die Aufnahme in den
Publication-Input; der gespeicherte Publication-Report beweist den Output.
Der Report muss seine Revision, das geprüfte positive Publication-Manifest,
die Quellseiten-Gesamtsumme, ein Digest aller publizierten Seiten und den
SHA-256 des vom echten Renderer erzeugten Anchor-Inventars enthalten. Nicht
freigegebene Markdown-Dateien unter `docs/site` bleiben außerhalb des Manifests;
eine injizierte nicht freigegebene Seite muss nachweislich aus dem Output
ausgeschlossen bleiben. Der vollständige erzeugte HTML-Dateibaum und das
vollständige Route-Inventar werden gespeichert und dürfen weder Pfad noch Route
dieser Seite enthalten. Für jede freigegebene Seite wird der echte gerenderte
Output als unveränderliches Artefakt gespeichert. Der Checker berechnet dessen
SHA-256 selbst und extrahiert daraus die wirklichen HTML-IDs. Das Inventar darf
nur diese IDs und diesen Hash enthalten. Screenshots und Browsermessungen
verweisen auf genau diesen nachgerechneten Seitenhash. Rohes Markdown,
gegenseitig bestätigende JSON-Reports, Überschriften in Codeblöcken und frei
behauptete `id`-Texte sind keine gültigen Anchor-Beweise.

Die Execution-Matrix ist ebenfalls unveränderlich an den geprüften Commit
gebunden. Sie trennt erfolgreichen Plattformlauf, Wait/Resume, Cancellation,
Restart/Recovery, Upgrade, Rollback, Stilllegung, Prism, Demo Delivery sowie
Ausfälle von Redis, PostgreSQL, Registry/BuildKit, Tailscale, LiteLLM, Git,
Worker, externem Effect und Demo-Acceptance. Jeder Eintrag besitzt eigene
Inputs oder Fault-Injection, Sollbeobachtungen, Evidenzklasse, Gate-Bindung und
Fehlerschwelle. Der Evidence-Checker verlangt jeden Eintrag einzeln; ein frei
formulierter Sammellauf oder das generische Pflichtfeld `<Gate-ID>-PRIMARY`
ersetzt keinen dieser Läufe.

Ausführungen enthalten Umgebung, Status, exakten Befehl oder Schritt,
Exit-Code, Beobachtung und Artefaktverweise. Negative Beweise, Mutationen,
Fixture-Ergebnisse und Reviewerberichte besitzen ebenfalls gespeicherte
Artefakte. Drei verschiedene Reviewer-Identitäten mit den Rollen `source`,
`reader` und `quality` müssen Fresh Context und anfänglichen Read-only-Modus
bestätigen. Der Maschinencheck kann Struktur, Git-Objekte und Hashes beweisen.
Er kann weder die Wahrheit einer menschlichen Beobachtung noch die tatsächliche
Unabhängigkeit einer Identität beweisen. Diese Verantwortung bleibt ausdrücklich
bei den drei Reviewern; ein grüner Maschinencheck allein erteilt kein `PASS`.

Jedes Gate besitzt den unveränderlichen Pflichtlauf `<Gate-ID>-PRIMARY`; nur
`A98-13` besitzt stattdessen die zwei Pflichtläufe `A98-13-OPERATOR-1` und
`A98-13-OPERATOR-2`. Der Checker bindet jeden Lauf an die vollständige
PASS-Bedingung der Tabellenzeile und an eine vorab festgelegte Evidenzklasse.
Ein `PASS` verlangt jeden Pflichtlauf mit Status `passed`; fehlende, blockierte,
übersprungene oder fehlgeschlagene Pflichtläufe können nicht durch einen
Source-Check ersetzt werden. Zusätzliche fehlgeschlagene Versuche bleiben mit
ihrem echten Status im Ledger. Ein Produktlimit ersetzt keinen Pflichtlauf.

Reviewer und Ausführungsteilnehmer sind verschiedene Identitäten. Jede
vorregistrierte statische oder dynamisch erzeugte Reader-Aufgabe erhält einen
eigenen Fresh-Context-Teilnehmer,
der zuvor nicht an der Dokumentation mitgearbeitet hat. Die beiden
Operator-Aufgaben verwenden zwei verschiedene Operatoren. Das Ledger bewahrt
jeden deklarierten Versuch, auch einen fehlgeschlagenen, und bindet den
akzeptierten Versuch an Teilnehmer, Startzeit, tatsächlich verwendete Hilfen
und einen gehashten Bericht. Die Reviewer bestätigen zusätzlich, dass kein
Versuch und keine unerlaubte Hilfe verschwiegen wurde; der Checker kann diese
menschliche Vollständigkeit nicht allein beweisen.

Eine Produktgrenze kann nur ein Gate bestehen lassen, dessen Gegenstand gerade
die ehrliche Beschreibung dieser Grenze ist. Ein nicht ausgeführter Restore,
ein übersprungener Reader-Task oder ein blockierter, als unterstützt
beschriebener Ablauf erfüllt niemals ein Ausführungsgate. Dann lautet der
Befund `FAIL` oder `NOT READY`.

## 5. AP09.7 — Plattform, Spezialisten, Kommunikation, Daten und Sicherheit

AP09.7 umfasst alle 53 zugeordneten IDs. Die Plattformdokumentation besteht nur,
wenn alle folgenden Punkte bestehen.

| ID | PASS nur wenn | Automatisches FAIL |
| --- | --- | --- |
| A97-01 | Ein aus Deployments, Values, Runtime-Konfiguration, Registries und Clients erzeugtes Inventar erfasst jede aktuelle Laufzeitabhängigkeit und klassifiziert sie als pipelinepflichtig, optional oder geplant. | Eine Abhängigkeit fehlt, oder eine geplante/optionale Komponente erscheint als Pflicht. |
| A97-02 | Redis, PostgreSQL, Git-Origin, OCI-Registry, BuildKit und Tailscale besitzen je Owner, Zweck, Consumer, Protokoll, Endpoint, Identität, Konfiguration, Default, Präzedenz, Health-Signal, Ausfallwirkung, Stop-Regel und Recovery. | Eine Pflichtabhängigkeit hat nur eine Produktbeschreibung oder Installationsnotiz. |
| A97-03 | LiteLLM dokumentiert Routing, Modelle, Embeddings, Credentials, Consumer, Limits, Timeouts, Readiness, Fehlerzuordnung, Retry-Grenzen und Recovery gegen aktuelle Konfiguration und Clients. | Modell- oder Credentialpfade werden aus Beispielen statt aus aktueller Authority abgeleitet. |
| A97-04 | Argo CD, Cilium und Monitoring sind als optionale Plattformschichten erklärt; die Dokumentation zeigt die funktionsfähige Pipelinegrenze ohne sie und die zusätzlichen Fähigkeiten mit ihnen. | Optionalität wird behauptet, ohne Abhängigkeitspfade und Fallback wie Flannel zu prüfen. |
| A97-05 | Kommunikationsmatrix und Endpunktinventar erfassen jeden aktiven Request-, Event-, Stream-, Store- und Providerweg mit Producer, Consumer, Transport, Authentisierung, Timeout, Größenlimit, Reihenfolge, Persistenz und Ausfallwirkung. | Nur Ports oder Services werden aufgelistet; mindestens ein aktiver Codepfad fehlt. |
| A97-06 | Das Store-Inventar erklärt für jeden Store Authority, Schema/Datenart, Writer, Reader, Konsistenz, Locks/Fencing, Retention, Kapazität, Backup, Restore, Korruption, Datenverlust und Stilllegung. | Ein persistenter Store besitzt keinen geprüften Restore- oder ehrlichen `not implemented`-Pfad. |
| A97-07 | Telemetrie verfolgt Signalentstehung bis Speicherung und Nutzung; Labels, Korrelation, Sampling, Redaction, Retention, Backpressure, Ausfall und fehlende End-to-End-Evidenz sind explizit. | „Observable“ wird aus vorhandenen Metriknamen oder Logs abgeleitet. |
| A97-08 | Identity-, Secret-, Network- und Supply-Chain-Matrizen erfassen jede Trust-Grenze, Credentialquelle, Rotation, Least-Privilege-Regel, Egress/Ingress-Grenze, Artefaktidentität und negative Zugriffserwartung. | Repository-/Render-Evidenz wird als Live-Enforcement ausgegeben. |
| A97-09 | Forge, Echo, OpenClaw, Codex, Ops MCP und Archviewer besitzen je einen zusammenhängenden Request-/Daten-/Fehlerweg, Konfiguration, Betrieb, Recovery, Erweiterungsgrenze und begründete Rolle im Gesamtsystem. | Die Erklärung erschöpft sich in Pluginmanifest oder Komponentenliste. |
| A97-10 | Mindestens ein vollständiger Erfolgsweg und je ein Ausfall von Redis, PostgreSQL, Registry/BuildKit, Tailscale, LiteLLM und Git werden über alle betroffenen Komponenten bis zur sicheren Operatorentscheidung verfolgt. | Der Weg endet beim ersten Fehlercode oder empfiehlt ungebundenes Retry. |
| A97-11 | Ein Fresh-Context-Reviewer kann für jede Abhängigkeit aus der Dokumentation Diagnose und sichere Recovery auswählen; ein zweiter Reviewer gleicht alle Matrizen vollständig gegen aktuelle Sources ab. | Stichprobe, Autorenselbstauskunft oder bloßer Linkcheck ersetzt einen der beiden Reviews. |
| A97-12 | Automatische Driftchecks schlagen fehl, wenn ein Endpoint, Store, Event, Secret, Runtime-Service oder Ops-MCP-Tool ohne Dokumentationszuordnung hinzugefügt wird. | Der Check kennt nur feste Sollzahlen oder akzeptiert ein neues Element still. |

## 6. AP09.8 — Operator-Handbuch und vollständige Konfiguration

AP09.8 umfasst alle 30 zugeordneten IDs. Wegen des Umfangs wird die Arbeit in
Lifecycle, Konfiguration und produktbezogene Journeys getrennt geprüft.

| ID | PASS nur wenn | Automatisches FAIL |
| --- | --- | --- |
| A98-01 | Ein maschinenlesbares Operator-Aufgabeninventar ordnet Installation, Preflight, Start, Health, Beobachtung, Signal/Resume, Abbruch, Diagnose, Backup, Restore, Upgrade, Rollback und Stilllegung genau einem kanonischen Verfahren zu. | Eine Aufgabe fehlt, ist doppelt autoritativ oder verweist auf interne Arbeitsdokumente. |
| A98-02 | Jedes Verfahren erfüllt vollständig den Operate-Vertrag des Dokumentations-Qualitätsstandards und nennt unterstützte Version, Ausführungsort und benötigte Authority. | Ein Verfahren besteht nur aus Befehlen oder enthält einen unerklärten Platzhalter. |
| A98-03 | Installation und Preflight beginnen auf dem tatsächlich unterstützten Ausgangszustand, prüfen Host-/Cluster-/Storage-/DNS-/Identity-Voraussetzungen und stoppen vor Mutation bei einem Fehler. | Ein manueller, nicht dokumentierter Hostschritt ist für Erfolg notwendig. |
| A98-04 | Start, Readiness und Beobachtung unterscheiden Prozessstart, Servicebereitschaft, Abhängigkeitsbereitschaft und fachliche Funktionsfähigkeit mit exakten Signalen. | „Pod running“ oder HTTP 200 wird allein als Plattformbereitschaft gewertet. |
| A98-05 | Signal, Wait/Resume, Cancellation und Restart verwenden vollständige aktuelle Verträge einschließlich `resume-signal.v2`, Issuance, Signatur/Authority, Idempotenz, Replay, Reihenfolge und falscher Signale. | Ein syntaktisches Beispiel ersetzt Issuance- und Wiederholungsregeln. |
| A98-06 | Der Symptomindex führt von beobachtbaren Symptomen über unterscheidende Checks zur Ursache, Stop-Regel und sicheren Recovery; er deckt Pflichtabhängigkeiten und unklare Resultate ab. | Diagnose beginnt mit der angenommenen Ursache oder empfiehlt pauschales Neustarten. |
| A98-07 | Backup und Restore nennen Datenumfang, Konsistenzpunkt, Verschlüsselung, Credentials, Aufbewahrung, Integritätsprüfung, leere Zielumgebung, Restore-Reihenfolge und fachliche Endprüfung. | Ein Backupbefehl ohne tatsächlich geprüften Restore erhält `PASS`. |
| A98-08 | Upgrade und Rollback nennen Versionsmatrix, Preflight, irreversible Grenze, Datenmigration, Reihenfolge, Health-Gates, Abbruch, Rückkehrpfad und Evidenzaufbewahrung. | Rollback wird nach einer irreversiblen Migration versprochen oder nur Helm-Render geprüft. |
| A98-09 | Stilllegung entfernt Workloads, Zugriff, Secrets, Daten, Artefakte und externe Ressourcen in sicherer Reihenfolge und nennt ausdrücklich aufzubewahrende Audit-/Recovery-Evidenz. | Cleanup verwendet ungebundene Globs oder löscht Daten vor der letzten Exportprüfung. |
| A98-10 | Ein rekursives Konfigurationsinventar erfasst `swarm.config.json`, Helm Values, GitOps Values, Environment, Secrets, CLI-/Scriptflags und abgeleitete Werte mit Typ, Pflichtstatus, Default, Grenze, Owner und Consumer. | Eine Quelle oder ein verschachteltes Feld fehlt; README-Text gilt nicht als Authority. |
| A98-11 | Für jeden effektiven Wert ist die vollständige Präzedenz vom authored input bis zum Runtime-Consumer erklärt; Konflikt-, leerer-Wert-, Secret- und ungültiger-Wert-Fälle sind getestet. | Zwei Quellen können denselben Wert setzen, ohne dass der Gewinner beweisbar ist. |
| A98-12 | Prism/Studio und Demo Delivery besitzen ausführbare Journeys vom Setup bis zur getrennten menschlichen Acceptance, mit Fehler-, Abbruch-, Wiederaufnahme- und Cleanup-Weg. | Ein Mock-, Render- oder synthetischer Providerlauf wird als Produktionsjourney ausgegeben. |
| A98-13 | Getrennte Fresh-Context-Operatoren führen den vollständigen erfolgreichen Installations-/Start-/Diagnoseweg, einen Preflight-Safe-Stop, den aktuell unterstützten isolierten Komponenten-Restore und die vollständige Plattform-Restore-Grenze ohne Chatwissen aus. Eine Grenze ersetzt keinen unterstützten Pflichtlauf. | Der Autor erklärt die Schritte, ein DNS-Safe-Stop ersetzt die erfolgreiche Installation, eine gelesene Produktgrenze ersetzt den unterstützten Restore, oder Reviewer lesen nur, ohne auszuführen. |
| A98-14 | Mutationstests erkennen ein neues Helm-Feld, Environment-Setting, Secret, Scriptflag und `swarm.config.json`-Feld ohne Operator-Dokumentation. | Nur bekannte Feldzahlen werden geprüft oder ein neues Feld bleibt grün. |

## 7. AP09.9 — Pipeline und Workflows

AP09.9 umfasst alle 17 zugeordneten IDs. Die Pipeline-Referenz und die
ausführbaren Journeys werden getrennt abgenommen.

| ID | PASS nur wenn | Automatisches FAIL |
| --- | --- | --- |
| A99-01 | Eine aus aktuellen Schemas, Compiler und Resolvern erzeugte Referenz erfasst jedes rekursive `pipeline.json`-Feld, jede Variante, Bedingung, Identität, Default, Grenze und Validierungsregel. | Nur das JSON-Schema oder eine Top-Level-Feldliste wird veröffentlicht. |
| A99-02 | Die Dokumentation erklärt Compile-Reihenfolge, Normalisierung, Defaults, Registry-Snapshot, Rollenauflösung, Matrixexpansion, Abhängigkeiten, Gates und unveränderliche Identitäten mit Gründen und Kosten. | Ein erzeugtes Beispiel ersetzt die Mechanikerklärung. |
| A99-03 | Stage-, Plugin-, Provider-, Fixture-, Report- und Artifact-Auswahl ist bis zur jeweiligen Registry und zum Runtime-Consumer verfolgbar; ungültige und mehrdeutige Auswahl wird erklärt. | Ein Name wird dokumentiert, ohne Namespace und globale Identität zu unterscheiden. |
| A99-04 | Retry, Repair, Wait/Resume, Cancellation, Restart und Recovery erklären Authority, Zähler, Deadlines, Idempotenz, persistierten Zustand und Stop-Bedingung. | „Retry“ oder „resume“ erscheint ohne genaue Wiederholungsgrenze und Effect-Unsicherheit. |
| A99-05 | `.swarm/progress.json`, Scaffolding, atomare Publikation, Compatibility und Repair sind mit Writer, Reader, Commitgrenze, Korruption, Konkurrenz und Wiederherstellung erklärt. | Progress-Datei wird als Log statt als Vertrag behandelt oder partielle Writes fehlen. |
| A99-06 | Ein minimaler Workflow durchläuft Checkout, Konfiguration, Compile, Run, Audit, Artefaktprüfung und Cleanup mit exakten Befehlen und erwarteten Resultaten. | Der Weg endet nach Schema-/Compile-Erfolg oder benötigt ein altes Beispiel. |
| A99-07 | Ein repräsentativer vollständiger Workflow nutzt echte Matrix-, Fixture-, Provider-, Report-, Evidence- und Result-Import-Funktionen und wird gegen aktuelle Registries aufgelöst. | IDs sind handgeschrieben, aber nie durch Compiler/Resolver geprüft. |
| A99-08 | Fehlerjourneys decken mindestens Redis-Ausfall, Registry/Image-Fehler, Tailscale-Fehler, Worker-Abbruch, unklaren externen Effect und Demo-Delivery-Ablehnung ab. | Ein Fehlerweg endet ohne Zustandsbewertung, Retryentscheidung oder Cleanup. |
| A99-09 | Security und Secrets im Workflow erklären Grant, Resource, Credentialauflösung, Redaction, Artifact-/Result-Authentizität und negative Zugriffe. | Secrets erscheinen im Beispiel oder erfolgreiche Providerantwort gilt ohne Result-Authority. |
| A99-10 | Versions-, Schema- und Plugin-Kompatibilität erklären akzeptierte und abgelehnte Kombinationen sowie Migration und Rollback anhand aktueller Checks. | „Backward compatible“ wird ohne negative alte/neue Kombination behauptet. |
| A99-11 | Alle veröffentlichten Beispiele werden maschinell geparst, kompiliert und gegen aktuelle Rollen, Registries, Templates und Schemas aufgelöst. | JSON-Syntax allein gilt als Beispielprüfung. |
| A99-12 | Fresh-Context-Reader führen Minimal-, Voll- und mindestens zwei Fehler-/Recoveryjourneys ohne interne Quellen aus und erhalten die dokumentierten Zustände. | Ein Reviewer prüft nur Prosa oder verwendet Wissen aus dem Erstellungsdialog. |
| A99-13 | Mutationen an Schemafeld, Stage-Typ, Rolle, Provider, Fixture, Reportformat und Progress-Vertrag machen die zugehörige Referenz oder Journey rot. | Ein öffentliches Pipelineelement kann ohne dokumentarische Auswirkung hinzukommen. |

## 8. AP09.10 — Developer-Handbuch und komplexe Plugins

AP09.10 umfasst alle 27 zugeordneten IDs. Der 51-Paket-Katalog bleibt Inventar;
er ersetzt keine Tiefendokumentation komplexer Pakete.

| ID | PASS nur wenn | Automatisches FAIL |
| --- | --- | --- |
| A910-01 | Ein neuer Entwickler kann Repository, Toolchains, Services, Credentials und lokale Abhängigkeiten aus einem sauberen Checkout reproduzierbar vorbereiten und die dokumentierte Baseline prüfen. | Global vorinstallierte oder persönliche Konfiguration bleibt ungenannt. |
| A910-02 | Repository- und Workspace-Karte erklärt Ownership, Buildgrenzen, generierte Quellen, Codegen-Reihenfolge und verbotene Abhängigkeiten. | Die Karte ist nur ein Verzeichnisbaum oder verschweigt eine Ownership- oder Generierungsgrenze. |
| A910-03 | Build-, Test-, Lint-, Release-, Versions-, Compatibility- und Change-to-check-Wege nennen exakte Befehle, Voraussetzungen, erwartete Ergebnisse und umgebungsabhängige Grenzen. | Ein Meta-Skript wird genannt, ohne seine Pflichtvoraussetzungen oder Teilfehler zu erklären. |
| A910-04 | Die öffentliche SDK-Referenz erfasst jeden Export, Type, Helper, Testing API, portable JSON-, Identity- und Digestvertrag direkt aus den aktuellen Entrypoints. | Nur häufige Exporte oder TypeScript-Signaturen ohne Semantik werden dokumentiert. |
| A910-05 | Ein erzeugtes Paketinventar erfasst alle 51 Pakete, Registrierungen, Schemas, Capabilities, Secrets, Artefakte und Owners; neue Pakete oder Registrierungen verursachen Driftfehler. | Eine feste Sollzahl ersetzt die Erkennung neuer Pakete. |
| A910-06 | Die Klassifikation komplexer Plugins wird aus überprüfbaren Merkmalen erzeugt oder vollständig begründet; jedes als komplex erkannte Plugin besitzt genau einen Deep Guide. | Größe oder Autorenentscheidung allein bestimmt Komplexität. |
| A910-07 | Jeder Deep Guide erfasst rekursiv Funktionen, Registrierungen, Konfiguration, Defaults, Bedingungen, Inputs, Outputs, Artifacts, Capabilities, Secrets und externe Effekte. | Der Katalogeintrag oder ein Schema-Link ersetzt die Erklärung. |
| A910-08 | Jeder Deep Guide erklärt Lifecycle, Persistenz, Konkurrenz, Idempotenz, Retry, Cancellation, Resume, Recovery, Cleanup und Remaining Data; Nichtanwendbarkeit braucht eine Begründung. | Ein anwendbares Thema fehlt oder wird ohne Grund `N/A`. |
| A910-09 | Jeder Deep Guide enthält Fehlerfamilien mit Trigger, Wirkung, Lifecycle-Zustand, sicherer Aktion und Retry-Regel sowie einen erfolgreichen und einen negativen Ablauf. | Fehlercodes werden nur aufgelistet oder besitzen keine sichere, quellgestützte Operatoraktion. |
| A910-10 | Jede unterstützte interne Erweiterung besitzt einen Clean-Checkout-Weg für Änderung, Registrierung, Berechtigung, Konfiguration, Test, Aktivierung, Beobachtung, Compatibility, Entfernung und Rollback. | Kompilieren oder Unit-Test wird als Aktivierung ausgegeben. |
| A910-11 | Component-Change-Guides decken Nova, Worker, Buster, Prism, Registry, SDK, Telemetrie, Charts/GitOps, Ops MCP und UI ab und wählen nach Änderung die kleinste vollständige Prüfkette. | Ein universeller „run all tests“-Hinweis ersetzt Change-to-check. |
| A910-12 | Package-README-Parität wird vollständig geprüft: Jede noch gültige notwendige Aussage ist im Site-Katalog oder Deep Guide enthalten; widersprüchliche README-Aussagen werden nicht übernommen. | Stichprobe oder Dateidiff ersetzt semantischen Inhaltsvergleich. |
| A910-13 | Ein am geprüften Commit aus Pipeline-, Host- und Worker-Engine-Verträgen erzeugtes Discovery-Inventar bestimmt alle Erweiterungsklassen. Das Aufgabeninventar enthält genau eine vorregistrierte Fresh-Context-Änderung je entdeckter Klasse und je als komplex klassifiziertem Plugin. Unabhängige Reader führen jede Aufgabe praktisch mit Aktivierung, negativem Weg, Compatibility, Cleanup und Remaining Data aus. Ein echter Produktblocker bleibt `NOT READY` und kann keinen Pflichtlauf bestehen. | Eine statische Klassenliste, eine feste Sollzahl, ein einziges Beispiel, eine nach dem Ergebnis gewählte Aufgabe oder ein gelesener Blocker wird auf weitere Erweiterungen hochgerechnet. |
| A910-14 | Mutationen an SDK-Export, Pluginmanifest, Erweiterungsklasse, Registration, verschachteltem Configfeld, Capability, Secret und Error Code machen Generator oder Guide-Check rot. | Eine neue öffentliche Oberfläche oder Erweiterungsklasse bleibt unbemerkt oder nur die Sollzahl ändert sich. |

## 9. AP09.11 — Exhaustive Reference und automatische Driftkontrolle

AP09.11 umfasst alle 36 zugeordneten IDs. Dieses Paket besteht nur, wenn die
Referenzen vollständig sind und ihre Vollständigkeit gegen Änderungen verteidigen.

| ID | PASS nur wenn | Automatisches FAIL |
| --- | --- | --- |
| A911-01 | Ein maschinenlesbares Quelleninventar definiert für Schema, Config, CLI, Contract, Event, Error, Endpoint, Store, Capability und Workflow jeweils Suchraum, Parser, Owner und Ausschlüsse. | Ein Generator scannt nur handverlesene Dateien ohne deklarierte Grenze. |
| A911-02 | Jede Referenz ist rekursiv vollständig und bewahrt Varianten, Bedingungen, Defaults, Grenzen, Deprecated-Zustand, Consumer und Source-Position. | Verschachtelte Felder oder dynamische Familien fehlen. |
| A911-03 | Nova Grants, Buster Runtime Capabilities, Plugin Capabilities, Kubernetes RBAC und andere Namespaces sind getrennt und ihre Übersetzungsgrenzen erklärt. | Gleichnamige IDs werden in einer gemeinsamen, semantisch falschen Tabelle vermischt. |
| A911-04 | Events enthalten Producer, Consumer, Schema/Version, Transport, Reihenfolge, Idempotenz, Persistenz, Retention und unbekannte Consumer. | Eventname und Payloadlink gelten als vollständig. |
| A911-05 | Errors enthalten exakten Code/Familie, Throw-/Emit-Site, Trigger, Wirkung, Lifecycle-Zustand, Retry, sichere Aktion und dynamische Bildung. | Regex-Suche nach Stringliteralen gilt ohne dynamische Familien als vollständig. |
| A911-06 | Endpoints, Stores und Workflows sind mit Authority, Identität, Limits, Zustandsübergängen und Ausfallgrenzen an ihre authored Erklärung gebunden. | Generierte Fakten werden ohne lesbare Bedeutung veröffentlicht. |
| A911-07 | Source-to-doc-Map ordnet jede öffentliche Sourcefläche Seite, Owner, Generator, Check und Readeraufgabe zu; umgekehrt verweist jede exhaustive Seite auf ihre Sources. | Verwaiste Source oder Seite bleibt ohne Fehler bestehen. |
| A911-08 | Generatoren sind deterministisch, besitzen einen read-only `--check`-Modus, verändern dabei keine Datei und verwerfen stale Output bytegenau. | Ein Check regeneriert still oder akzeptiert semantisch veraltete Ausgabe. |
| A911-09 | Generated facts und authored explanation haben getrennte Bereiche und Owners; Autoren kopieren keine generierten Inventare manuell. | Zwei manuelle Autoritäten können auseinanderlaufen. |
| A911-10 | Removal und Rename entfernen oder migrieren Referenz, Links, Redirect und Ownership ohne stille historische Falschaussage. | Die Prüfung testet nur Addition oder lässt nach Removal/Rename eine alte Autorität bestehen. |
| A911-11 | Für jede der zehn Referenzfamilien beweist mindestens eine Add-, Change- und Remove-Mutation den Driftfehler und die richtige betroffene Seite. | Nur ein universeller Mutationstest oder feste Countänderung deckt alle Familien ab. |
| A911-12 | Ein unabhängiger Source-Auditor bestätigt den vollständigen Suchraum und ein Maintainer reproduziert alle Generatoren aus sauberem Checkout ohne nicht deklarierte Werkzeuge. | Autorenselbstauskunft oder erfolgreicher aktueller Output genügt. |

## 10. AP09.12 — Publication und Reader Experience

AP09.12 umfasst alle zehn zugeordneten IDs. Gestaltung darf Inhalt auffindbar
und verständlich machen, aber niemals fehlenden Inhalt kaschieren.

| ID | PASS nur wenn | Automatisches FAIL |
| --- | --- | --- |
| A912-01 | Nur Seiten aus einem revisionsgebundenen positiven Publication-Manifest erscheinen in der Publication; AP-, Review-, Migrations-, Prompt-, temporäre und lokale Evidence-Artefakte werden ausgeschlossen. Leserprosa enthält keine interne AP-/Review-/Migrationssprache oder Verweise auf interne Arbeitsdateien. Ein Negativtest injiziert eine unerwartete Markdown-Datei unter `docs/site` und beweist, dass sie weder Route noch Output erhält. | Ein unerwarteter Pfad wird wegen seiner Markdown-Endung publiziert, der Checker setzt alle Markdown-Dateien mit der Positivliste gleich, oder Leser müssen interne Arbeitsgeschichte verstehen. |
| A912-02 | Jeder kanonische Leserweg ist aus Startseite und passender Rollen-/Aufgabennavigation in höchstens drei sinnvollen Entscheidungen erreichbar. | Erreichbarkeit wird nur über Volltextsuche oder einen globalen Dateibaum erreicht. |
| A912-03 | Redirects funktionieren im Serverpfad und im statischen Fallback; Ketten, Schleifen, tote Ziele, Anchorverlust und nicht registrierte entfernte Seiten schlagen fehl. | Eine Redirect-JSON-Datei ohne ausgeführten Requesttest gilt als wirksam. |
| A912-04 | Suche indexiert alle kanonischen Seiten, Überschriften, technische IDs und Synonyme, schließt interne Artefakte aus und liefert für festgelegte Readerfragen das richtige Ziel in den oberen Ergebnissen. | Nur Indexgröße oder Suchfeldexistenz wird geprüft. |
| A912-05 | Code-Evidence-Boxen lesen die angezeigten Zeilen beim Build aus exakt dem verlinkten Commit, zeigen Claim/Implementation/Contract/Test/Revision/Limit und funktionieren als Link ohne JavaScript. | Manuell kopierter Code, abweichende Revision oder GitHub-Snippetannahme. |
| A912-06 | Jedes Diagramm beantwortet eine definierte Leserfrage, besitzt Textalternative, Quellenbindung und Driftowner und stimmt mit Fluss, Richtung, Optionalität und Fehlergrenzen überein. | Dekoratives Diagramm oder nicht belegte Kante. |
| A912-07 | Mobile, Tablet und Desktop bestehen definierte Layoutprüfungen für Navigation, Tabellen, Code, Diagramme, Callouts und Suche ohne Informationsverlust oder horizontale Seitennavigation. | Nur Screenshots der Startseite oder visuelle Einzelprüfung. |
| A912-08 | Automatische Accessibility-Prüfung und unabhängige Keyboard-/Screenreader-Probe decken Navigation, Suche, Dialoge, Links, Überschriften, Fokus, Kontrast, Reduced Motion und Diagrammalternativen ab. | Lighthouse-Score allein oder nur automatischer Axe-Lauf. |
| A912-09 | Alle lokalen Links, Anchors, Assets, Routen, Source-Revisions- und Zeilenbereiche werden im Repositorybuild und im gebauten Output geprüft. | Nur Markdown-Links werden geprüft; gebaute Routen, Assets, Anchors oder Sourcebereiche bleiben ungeprüft. |
| A912-10 | Kritische Aufgaben bleiben ohne JavaScript, externe Netzwerkverbindung, Hover oder Farbe verständlich; optionale Interaktivität besitzt statischen Fallback. | Inhalt existiert ausschließlich in Clientzustand oder Tooltip. |
| A912-11 | Publication-Build ist deterministisch und legt Route, Canonical URL, Redirect, Source-Abhängigkeit und Content-Hash maschinenlesbar offen. | Zwei saubere Builds unterscheiden sich ohne erklärte Toolchainursache. |
| A912-12 | Fresh-Context-Nutzer aus Operator-, Plugin-, Plattform- und Pipeline-Rolle lösen festgelegte Find-/Understand-/Act-Aufgaben; Befunde werden nach Aufgabe statt subjektivem Gefallen bewertet. | Autorendemo, Klickzählung oder „sieht gut aus“ gilt als Reader-Test. |

## 11. AP09.13 — Integrierte Inhaltsabnahme

AP09.13 umfasst alle zehn `QUA-*`-IDs und entscheidet über den gesamten
AP09-Inhalt. Dieses Paket darf keinen Fehler aus früheren Paketen mitteln oder
wegklassifizieren.

| ID | PASS nur wenn | Automatisches FAIL |
| --- | --- | --- |
| A913-01 | Alle 261 Katalog-IDs besitzen einen vollständigen Befund am finalen Commit; IDs, Seiten, Owner und Status stimmen maschinell überein. | Fehlende, doppelte, pauschal gruppierte oder auf älteren Commit geprüfte ID. |
| A913-02 | Für jeden Punkt sind Verhalten, Entscheidung, Konfiguration, Fehler/Recovery, Extension und Grenze vollständig oder begründet nicht anwendbar. | Vorhandene Überschrift, Schema-Link oder grüner Check ersetzt Inhalt. |
| A913-03 | Drei getrennte Fresh-Context-Reviews prüfen Quelltreue, Reader-Reproduzierbarkeit sowie Sprache/Architektur; jeder materielle Befund wird korrigiert und erneut geprüft. | Derselbe Autor nimmt sich selbst ab oder ein FAIL wird nur kommentiert. |
| A913-04 | Operator, Pipeline-Autor, Plugin-Entwickler, Plattform-Entwickler und Prism/Buster-Spezialist führen ihre verbindlichen Readeraufgaben ohne Chat, Reviewordner oder Package-README aus. | Eine Persona oder nur der Happy Path fehlt. |
| A913-05 | Erfolgs-, Validierungsfehler-, Dependency-Ausfall-, Cancellation-, Wait/Resume-, Restart/Recovery-, unklarer-Effect- und Change/Removal-Wege liefern die dokumentierten Beobachtungen. | Ein Workflow wird aus einem ähnlichen Fall abgeleitet statt ausgeführt. |
| A913-06 | Controlled-Language-Review erfasst Scope, Methode, technische Begriffe und gelöste Befunde; kein Punkt behauptet formale ASD-STE100-Zertifizierung. | Readability-Score oder kurzer Linter gilt als vollständige Sprachabnahme. |
| A913-07 | Jede signifikante Entscheidung besitzt belegten oder ausdrücklich unbekannten Grund, Nutzen, Kosten, Status, Implementierungsstand und Neubewertungsbedingung. | Sourceverhalten wird als historische Begründung ausgegeben. |
| A913-08 | Das kombinierte Mutationpaket führt jede der 28 vorregistrierten Varianten aus `config`, `schema`, `cli`, `contract`, `event`, `endpoint`, `store`, `secret`, `runtime-service`, `ops-tool`, `capability`, `plugin-registration`, `error-code` und `workflow` mit Add, Change und Remove ein; jede der 84 Mutationen scheitert am zuständigen Docs-Gate und nennt die erwartete betroffene Seite. | Eine Mutation bleibt grün, verwendet einen nachträglich gewählten Patch, trifft eine andere Sourcefläche oder scheitert nur an einem fachfremden Buildfehler. |
| A913-09 | Alle Checks laufen aus sauberem Checkout; Evidence-Bundle bindet Commit, Toolversionen, Umgebung, Befehle, Exit-Codes, Logs, Skips und Reviewerbefunde. | Arbeitsbaum ist schmutzig, Evidenz veränderbar oder Umgebung unbekannt. |
| A913-10 | Jede Nichtanwendbarkeit nennt Quellbeweis und Grund und wird unabhängig genehmigt; offene Produktgrenzen bleiben als aktuelle Limits mit Owner und Akzeptanzbedingung sichtbar. | `N/A` dient dazu, fehlende Dokumentation oder nicht gelaufene Prüfung zu verstecken. |
| A913-11 | Die AP10-Löschliste besitzt für jede alte Datei Inhaltsparität, kanonisches Ziel, Redirectbedarf, Referenzsuche und unabhängige Freigabe; das Löschen selbst bleibt AP10. | Alte Quellen werden pauschal nach Pfad oder Dateialter freigegeben. |
| A913-12 | Der finale Bericht nennt ausdrücklich alle bestandenen und nicht ausgeführten Live-Gates. AP09 erhält nur dann `PASS`, wenn kein materieller Dokumentationsbefund offen ist. | „Alles grün“ verschweigt Skips, Produktlücken oder begrenzte Evidenzklassen. |

## 12. Verbindliche Aufteilung der großen Pakete

Damit ein Reviewer keinen unüberschaubaren Umfang oberflächlich abnimmt, gelten
folgende Mindestteilpakete:

| Paket | Getrennt zu implementieren und abzunehmen |
| --- | --- |
| AP09.7 | Pflicht-/optionale Infrastruktur; Kommunikation; Daten/Stores; Telemetrie; Security/Supply Chain; Spezialistenprodukte. |
| AP09.8 | Operator-Lifecycle; Konfigurationsauthority; Diagnose/Recovery; Prism/Studio; Demo Delivery. |
| AP09.9 | Rekursive Pipeline-Referenz; Compile/State; Happy-Path-Journeys; Fehler/Recovery-Journeys; Compatibility. |
| AP09.10 | Developer-Baseline/SDK; Paketklassifikation; Deep Guides in überprüfbaren Gruppen; Component-Change-Guides; README-Parität. |
| AP09.11 | Je eine getrennte Abnahme für Schema, Config, CLI, Contract, Event, Error, Endpoint, Store, Capability und Workflow. |
| AP09.12 | Navigation/Search; Redirects; Evidence Rendering; Diagramme; Responsive/Accessibility; statischer Fallback. |
| AP09.13 | Katalogbefunde; Readerübungen; Sprache/Entscheidungen; Mutationpaket; AP10-Handoff. |

Ein Teilpaket darf nur zusammengelegt werden, wenn die vereinigte Prüfung weiter
jeden einzelnen Abnahmepunkt, jede zugeordnete Katalog-ID und jeden Readerweg
separat ausweist. Ein zusammengefasster Gesamtbefund ist unzulässig.

## 13. Endgültige PASS-Regel

Die Aussage „AP09 ist vollständig und die Dokumentation ist hochwertig und
wertvoll“ ist nur zulässig, wenn gleichzeitig gilt:

- alle Punkte `A97-*` bis `A913-*` besitzen einen gespeicherten `PASS`-Befund;
- alle 261 Katalog-IDs sind am selben finalen Commit vollständig abgenommen;
- alle automatischen Checks und erforderlichen negativen Mutationen bestehen;
- alle vorgeschriebenen Fresh-Context-Readerübungen bestehen;
- kein materieller Dokumentationsbefund ist offen;
- jede nicht gelaufene Live-Prüfung und jede Produktgrenze bleibt sichtbar; und
- der Arbeitsbaum und der veröffentlichte Output sind frei von temporären,
  Review- und Migrationsartefakten.

Fehlt eine dieser Bedingungen, lautet der Gesamtbefund `FAIL` oder `NOT READY`,
nicht „fast vollständig“.

`npm run docs:ap09:acceptance-contract:check` prüft die 89 eindeutigen,
fortlaufenden Punkte, die vorregistrierten Fixtures, die Paketgrößen und die
Bindung an den 261-Punkte-Katalog.
Die spätere Gesamtprüfung übergibt ihr Evidence-Ledger zusätzlich mit
`node scripts/check-ap09-acceptance-contract.mjs --evidence <ledger.json>`.
Dieser Modus akzeptiert nur einen sauberen Evidence-Commit, 261 einzelne
Anforderungsbefunde, alle 89 `PASS`-Gates, vollständige Fixture-Ergebnisse,
gespeicherte und gehashte Artefakte, echte Git- und Zeilenauflösung,
Fresh-Context-Reviewer sowie die erlaubte Zwei-Commit-Grenze. Die 14
Mutationsfamilien sind `config`, `schema`, `cli`, `contract`, `event`,
`endpoint`, `store`, `secret`, `runtime-service`, `ops-tool`, `capability`,
`plugin-registration`, `error-code` und `workflow`. Ihre 28 vorregistrierten
Varianten trennen unter anderem Helm-Feld, Environment, Scriptflag,
`swarm.config.json`, verschachtelte Plugin-Konfiguration, Default/Präzedenz,
Stage-Typ, Rolle, Erweiterungsklasse, Provider, Fixture, Reportformat,
Progress-Vertrag, SDK-Export, Secret, Dienst und Ops-Tool. Jede Variante muss
mit `add`, `change` und `remove`
geprüft werden. Das ergibt 84 Pflichtmutationen. Jede braucht einen grünen
Baseline-Lauf, den bytegenau vom registrierten Konstruktor erzeugten Patch auf
der registrierten Sourcefläche, die erwartete betroffene Seite, einen
nicht-null Exit des vorregistrierten Dokumentationsgates und dessen exakten
Drift-Diagnosecode. Ein anderer Patch, eine andere Fläche oder ein fachfremder
Buildfehler besteht die Mutation nicht.
