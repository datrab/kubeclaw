# AP09 — Fachliche Abnahme der Produktdokumentation

Stand: 19.10.2026 · vom Auftraggeber vereinfachter Abschlussstandard
Geltungsbereich: gesamte Dokumentationsüberarbeitung, insbesondere AP09–AP11.

## 1. Definition von fertig

Die Dokumentation beschreibt sämtliche unterstützten Pipeline-Funktionen und
Zusammenhänge detailliert, korrekt und verständlich für Operators und Developers.
Ein Themenbereich ist fertig, wenn seine Inhalte vollständig vorhanden sind,
Anleitungen Voraussetzungen, Berechtigungen, Schritte, erwartete Ergebnisse und
Fehler-/Recoverygrenzen erklären und ein unabhängiger Reviewer keine wesentlichen
Dokumentationsfehler mehr findet. Ein grüner Build allein ist keine Inhaltsabnahme.

Die [Produktgrenze](07-documentation-quality-standard.md#product-scope-and-upstream-references)
bleibt verbindlich: eigene öffentliche Eingaben einschließlich verschachtelter
Felder, Defaults, Präzedenz und unterstützter Varianten werden erklärt. Allgemeine
Kubernetes-Dokumentation wird verlinkt, nicht vollständig kopiert. Produktlücken
und nicht ausgeführte Live-Prüfungen bleiben sichtbar; sie verhindern keine Abnahme
wahrheitsgemäßer und vollständiger Dokumentation. Sie gelten nicht als bestanden.

## 2. Angemessene Prüfung statt Belegarchiv

- Ein unabhängiger Review je zusammenhängendem Themenbereich umfasst Quelltreue,
  Verständlichkeit für die Leseraufgaben und sprachliche/strukturelle Qualität.
  Drei getrennte Personen oder Reviews je Unterpunkt sind nicht vorgeschrieben.
  Der Autor darf seine eigene Arbeit nicht unabhängig abnehmen.
- Relevante Link-, Beispiel-, Generator- und Driftprüfungen müssen funktionieren.
  Beispiele werden passend zu ihrem Anspruch geprüft; Syntaxprüfung wird nicht
  als erfolgreicher Live-Lauf ausgegeben. Unverfügbare Produktfunktionen und
  ungeprüfte Ausführung werden ausdrücklich als solche dokumentiert.
- Driftproben werden nach tatsächlich unterschiedlichen Generator-/Parserwegen
  ausgewählt: ein repräsentatives Hinzufügen, Ändern und Entfernen je unabhängigem
  Weg. Gemeinsame Wege brauchen keine Wiederholung pro registrierter Variante.
  Unterschiedliche Wege und die Begründung ihrer Abdeckung werden kurz benannt.
  Ein fachfremder Buildfehler beweist keinen erkannten Dokumentationsdrift.
- Die bestehenden Fixtures sind ein wiederverwendbarer Testkatalog, keine Pflicht,
  alle 84 historischen Mutationen und jede Personaübung erneut auszuführen.
- Gültige Prüfungen und Reviews bleiben verwendbar, solange die betroffenen
  Quellen und Seiten unverändert sind. Änderungen werden gezielt nachgeprüft;
  neue Commits allein erzwingen keine vollständige Wiederholung.
- Rohlogs, Quellkopien, gerenderte HTML-Bäume, Hash-/Custody-Ketten und getrennte
  Evidence-Commits sind keine Abschlussvoraussetzung. Nach Abschluss dürfen
  entbehrliche Rohbelege entfallen. Testfixtures und Generatorinputs bleiben.
- Die früheren umfangreichen Evidence-Ledger bleiben historische Aufzeichnungen.
  Sie müssen nicht neu aufgebaut werden; A911-09 und A911-10 bleiben im damals
  dokumentierten Umfang abgenommen. Diese Änderung nimmt keinen neuen Punkt ab.

## 3. Kompakter Abschluss im bestehenden Register

`documentation-completion-matrix.json` bleibt das einzige Abschlussregister.
Die 261 Katalog-IDs und 89 Gate-IDs bleiben eine Checkliste, kein Prozentsatz der
Fertigstellung. Mehrere IDs können durch denselben inhaltlichen Review geschlossen
werden. Kein Punkt wird allein durch diese Vertragsänderung als erledigt markiert.

Neue Abnahmen stehen als kurze Einträge in `completionRecords` derselben Matrix:
`id`, `revision` (geprüfter Commit), `author`, `reviewer`, `gateIds`,
`requirementIds`, `pages`, `sources`, `checks`, `review`, `summary`, `limits`,
`openIssues` und `verdict`. `checks` enthält Befehl/Prüfschritt, Exitcode und knappe
Beobachtung; `review` enthält die Ergebnisse für `sourceAccuracy`,
`readerUsability` und `quality`. Für PASS müssen alle drei PASS sein, die relevanten
Checks erfolgreich und `openIssues` leer. Grenzen dürfen reale Produktgrenzen
beschreiben, aber keine ungelösten wesentlichen Dokumentationsfehler verstecken.

IDs, Leserorte und tatsächlich geprüfte Quellen werden konkret zugeordnet. Ein
PASS-Eintrag und die zugehörigen Matrixzustände werden gemeinsam übernommen.
Ein FAIL/NOT_READY-Eintrag dokumentiert offene Arbeit und schließt nichts.
Es werden keine Rohartefakte und keine zusätzlichen parallelen Register verlangt.
Der Checker validiert Zuordnung, Revisionsbezug und Konsistenz; er kann weder
Reviewidentität noch inhaltliche Richtigkeit einer Selbstauskunft beweisen.

## 4. Fachliche Checkliste

Die folgenden Punkte gelten zusammen mit dem obenstehenden Abschlussstandard.
Historische Formulierungen zu Pflichtläufen, Artefakten oder mehreren Reviewern
werden durch Abschnitte 1–3 ersetzt; die fachlichen Inhalte bleiben im Umfang.

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
| A97-11 | Ein unabhängiger Reviewer prüft die Abhängigkeiten und Matrizen gegen die aktuellen Quellen und kann aus der Dokumentation Diagnose und sichere Recovery auswählen. | Autorenselbstauskunft, bloße Dateiexistenz oder ein Linkcheck ersetzt die unabhängige inhaltliche und aufgabenbezogene Prüfung. |
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
| A98-07 | Backup and restore documentation identifies the data scope, consistency point, encryption, credentials, retention, integrity check, empty-target assumptions, restore order, and functional verification. It separates implemented and verified paths from incomplete or unverified restore paths. A missing full-platform restore is an explicit product limitation, not a documentation blocker. | An unverified restore is presented as verified, an incomplete path is presented as supported, or the limitation has no safe boundary and follow-up condition. |
| A98-08 | Upgrade und Rollback nennen Versionsmatrix, Preflight, irreversible Grenze, Datenmigration, Reihenfolge, Health-Gates, Abbruch, Rückkehrpfad und Evidenzaufbewahrung. | Rollback wird nach einer irreversiblen Migration versprochen oder nur Helm-Render geprüft. |
| A98-09 | Stilllegung entfernt Workloads, Zugriff, Secrets, Daten, Artefakte und externe Ressourcen in sicherer Reihenfolge und nennt ausdrücklich aufzubewahrende Audit-/Recovery-Evidenz. | Cleanup verwendet ungebundene Globs oder löscht Daten vor der letzten Exportprüfung. |
| A98-10 | Ein rekursives Konfigurationsinventar erfasst innerhalb der verbindlichen Produktgrenze `swarm.config.json`, Helm Values, GitOps Values, Environment, Secrets, CLI-/Scriptflags und abgeleitete Werte mit Typ, Pflichtstatus, Default, Grenze, Owner und Consumer. Tatsächlich verwendete oder unterstützte Kubernetes-Konfigurationen einschließlich relevanter Defaults und Auslassungen sind zugeordnet; allgemeine Upstream-Felder werden verlinkt. | Eine Quelle oder ein verschachteltes Feld fehlt; README-Text gilt nicht als Authority. |
| A98-11 | Für jeden effektiven Wert ist die vollständige Präzedenz vom authored input bis zum Runtime-Consumer erklärt; Konflikt-, leerer-Wert-, Secret- und ungültiger-Wert-Fälle sind getestet. | Zwei Quellen können denselben Wert setzen, ohne dass der Gewinner beweisbar ist. |
| A98-12 | Prism/Studio and Demo Delivery documentation gives the complete intended journey from setup to separate human acceptance, including failure, abort, resume, and cleanup. Each step states whether it is implemented, verified, fixture-only, or currently unavailable. The absence of a reproducible live delivery route is an explicit product limitation, not a documentation blocker. | A mock, render, or synthetic provider run is presented as a live production journey, or an unavailable step has no clear boundary and follow-up condition. |
| A98-13 | Every operator procedure is complete enough for a fresh-context technical reader to identify prerequisites, authority, commands, expected observations, safe-stop conditions, recovery boundaries, and unsupported capabilities without chat knowledge. Two independent live operator executions are recommended product validation, but they are not required for documentation completion. | A procedure depends on undocumented author knowledge, or the text claims successful execution that did not occur. |
| A98-14 | Mutationstests erkennen ein neues Helm-Feld, Environment-Setting, Secret, Scriptflag und `swarm.config.json`-Feld ohne Operator-Dokumentation. | Nur bekannte Feldzahlen werden geprüft oder ein neues Feld bleibt grün. |

### Pflichtübergang zwischen AP09.8 und AP09.9

AP09.9 darf erst abgenommen werden, wenn der Dokumentationsbaum eindeutig
getrennt ist. `docs/site/` ist die einzige Leserdokumentation. Jede andere Datei
unter `docs/` muss in einem maschinenlesbaren Inventar als notwendige interne
Prüf- oder Generatoreingabe, vorübergehende Extraktionsquelle oder löschbarer
Rest klassifiziert sein. Mehrdeutige oder nicht klassifizierte Dateien ergeben
`FAIL`.

Vorübergehende Extraktionsquellen müssen zusätzlich unter
`docs/_legacy-source/` gesammelt sein. Ihr Pfad dort bewahrt den bisherigen
relativen Pfad. Eine alte Leserdatei außerhalb dieses Quellbaums ergibt ebenso
`FAIL` wie eine Generator-, Fixture- oder Prüfeingabe, die fälschlich als alte
Leserdokumentation dorthin verschoben wurde. Damit sind die neue
Leserdokumentation, interne Dokumentationswerkzeuge und die bisherige
Leserstruktur nicht nur logisch, sondern auch physisch getrennt.

Eine Paritätsmatrix muss jede weiterhin richtige Aussage und Entscheidung der
Extraktionsquellen einem konkreten Abschnitt unter `docs/site/` zuordnen. Eine
begründete Auslassung benötigt einen aktuellen Quellbeleg. Themenähnlichkeit,
Dateiexistenz, Wortzahl und Linkanzahl sind keine Parität. Das Gate ergibt auch
`FAIL`, wenn eine Site-Seite, Navigation, Suche oder Reader-Aufgabe eine
Extraktionsquelle benötigt oder wenn `docs/site/` Review-, Migrations- oder
AP-Arbeitssprache enthält.

Die Matrix ist nur dann eine gültige AP10-Löschfreigabe, wenn es keine
ungeklärten Inhalte gibt, alle Site-, Publication-, Link- und Readerchecks am
selben Commit bestehen und ein unabhängiger Read-only-Reviewer jede
Quellklassifikation sowie jede Paritätsentscheidung bestätigt. Vor diesem
Nachweis darf keine Extraktionsquelle gelöscht werden.

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
| A99-11 | Alle veröffentlichten Beispiele sind auffindbar und ihrem Anspruch entsprechend geprüft. Ausführbare Anleitungen nennen Toolchain, Voraussetzungen, erwartetes Ergebnis, Fehler und Cleanup; erklärende Fragmente und nicht ausgeführte Produktwege sind klar gekennzeichnet. | Eine nicht ausgeführte Anleitung wird als erfolgreich ausgeführt dargestellt, ein Beispiel widerspricht dem aktuellen Vertrag oder ein notwendiger Schritt fehlt. |
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
| A910-13 | Alle unterstützten Erweiterungsklassen und komplexen Plugins besitzen vollständige Erstellungs- oder Änderungsanleitungen. Ein unabhängiger Reviewer prüft repräsentative unterschiedliche Wege anhand der veröffentlichten Anleitung einschließlich Berechtigungen, Tests, Aktivierung, Fehler, Entfernung und Datenresten. | Eine unterstützte Erweiterungsklasse oder wesentliche Pluginfunktion fehlt, Maintainerwissen ersetzt einen dokumentierten Schritt oder eine Produktgrenze wird verschwiegen. |
| A910-14 | Mutationen an SDK-Export, Pluginmanifest, Erweiterungsklasse, Registration, verschachteltem Configfeld, Capability, Secret und Error Code machen Generator oder Guide-Check rot. | Eine neue öffentliche Oberfläche oder Erweiterungsklasse bleibt unbemerkt oder nur die Sollzahl ändert sich. |

## 9. AP09.11 — Exhaustive Reference und automatische Driftkontrolle

AP09.11 umfasst alle 36 zugeordneten IDs. Dieses Paket besteht nur, wenn die
Referenzen vollständig sind und ihre Vollständigkeit gegen Änderungen verteidigen.

| ID | PASS nur wenn | Automatisches FAIL |
| --- | --- | --- |
| A911-01 | Ein maschinenlesbares Quelleninventar definiert für Schema, Config, CLI, Contract, Event, Error, Endpoint, Store, Capability und Workflow jeweils Suchraum, Parser, Owner und Ausschlüsse. | Ein Generator scannt nur handverlesene Dateien ohne deklarierte Grenze. |
| A911-02 | Jede Referenz ist innerhalb der verbindlichen Produktgrenze rekursiv vollständig und bewahrt Varianten, Bedingungen, Defaults, Grenzen, Deprecated-Zustand, Consumer und Source-Position. Allgemeine Kubernetes-Felder werden passend verlinkt; tatsächlich verwendete oder unterstützte Konfigurationen werden produktbezogen erklärt. | Verschachtelte Produkteingaben, tatsächlich verwendete oder unterstützte Konfigurationen oder dynamische Produktfamilien fehlen. |
| A911-03 | Nova Grants, Buster Runtime Capabilities, Plugin Capabilities, Kubernetes RBAC und andere Namespaces sind getrennt und ihre Übersetzungsgrenzen erklärt. | Gleichnamige IDs werden in einer gemeinsamen, semantisch falschen Tabelle vermischt. |
| A911-04 | Events enthalten Producer, Consumer, Schema/Version, Transport, Reihenfolge, Idempotenz, Persistenz, Retention und unbekannte Consumer. | Eventname und Payloadlink gelten als vollständig. |
| A911-05 | Errors enthalten exakten Code/Familie, Throw-/Emit-Site, Trigger, Wirkung, Lifecycle-Zustand, Retry, sichere Aktion und dynamische Bildung. | Regex-Suche nach Stringliteralen gilt ohne dynamische Familien als vollständig. |
| A911-06 | Endpoints, Stores und Workflows sind mit Authority, Identität, Limits, Zustandsübergängen und Ausfallgrenzen an ihre authored Erklärung gebunden. | Generierte Fakten werden ohne lesbare Bedeutung veröffentlicht. |
| A911-07 | Source-to-doc-Map ordnet jede öffentliche Sourcefläche Seite, Owner, Generator, Check und Readeraufgabe zu; umgekehrt verweist jede exhaustive Seite auf ihre Sources. | Verwaiste Source oder Seite bleibt ohne Fehler bestehen. |
| A911-08 | Generatoren sind deterministisch, besitzen einen read-only `--check`-Modus, verändern dabei keine Datei und verwerfen stale Output bytegenau. | Ein Check regeneriert still oder akzeptiert semantisch veraltete Ausgabe. |
| A911-09 | Generated facts und authored explanation haben getrennte Bereiche und Owners; Autoren kopieren keine generierten Inventare manuell. | Zwei manuelle Autoritäten können auseinanderlaufen. |
| A911-10 | Removal und Rename entfernen oder migrieren Referenz, Links, Redirect und Ownership ohne stille historische Falschaussage. | Die Prüfung testet nur Addition oder lässt nach Removal/Rename eine alte Autorität bestehen. |
| A911-11 | Repräsentative Add-, Change- und Remove-Proben je tatsächlich unterschiedlichem Referenzgenerator-/Parserweg erkennen veraltete Dokumentation und benennen den betroffenen Leserort. Gemeinsame Wege dürfen mit kurzer Begründung dieselbe Probe nutzen. | Ein unabhängiger Generator-/Parserweg bleibt ohne Driftprobe, eine Probe bleibt unerwartet grün oder ein fachfremder Buildfehler gilt als Driftbeweis. |
| A911-12 | Ein unabhängiger Source-Auditor bestätigt den vollständigen Suchraum und ein Maintainer reproduziert alle Generatoren aus sauberem Checkout ohne nicht deklarierte Werkzeuge. | Autorenselbstauskunft oder erfolgreicher aktueller Output genügt. |

### A911-11: Zuordnung vorhandener Proben zu wirklichen Wegen

Arbeitszuordnung am Stand `3a8a1afd`, keine Abnahme und kein zweites Register.
Die Befehle unten sind vorhandene Prüfungen, keine Behauptung eines neuen Laufs.
`completionRecords` bleibt der einzige Ort für eine spätere Reviewentscheidung.

| Unterschiedlicher Weg / Quelle | Vorhandene repräsentative Probe | Betroffener Leserort / Abdeckungsgrenze |
| --- | --- | --- |
| Konfiguration: YAML-Felder und Helm-Bindungen (`docs-configuration-inventory.mjs`) | `check-configuration-drift-mutations.mjs --case-prefix=helm-field:` | `reference/helm-values.md`; gerenderte Ressourcen und eingebettete Payloads nicht mit bloßen Values gleichsetzen. |
| Konfiguration: YAML-Environment und Shell-Secretquellen | Derselbe Runner, Präfixe `environment-setting:` und `secret-setting:` | `reference/environment-variables.md`, `reference/secrets.md`; unterschiedliche Extraktoren, nicht durch YAML-Feldprobe ersetzt. |
| Konfiguration: Shell-CLI und TypeScript-CLI | Derselbe Runner, Präfixe `script-flag:` und `nova-cli-flag:` | `reference/cli.md`; `check-configuration-cli-drift.mjs` delegiert denselben Inventargenerator und ergänzt Definition-/Invocation-Semantik. Kein zweiter Generator, aber zwei Parserwege. |
| Konfiguration: JSON-Payload, rekursives JSON-Schema, TypeScript-Präzedenz | Derselbe Runner, Präfixe `swarm-config-field:`, `nested-plugin-config:` und `default-precedence:` | `reference/plugin-configuration.md`; Schema-Refs/Bedingungen und Quellenbindung bleiben eigene fachliche Kontrollen im vorhandenen Runner. |
| Pipeline: rekursive Interfacefelder | `check-schema-drift-mutations.mjs` | `reference/workflows.md`; `schemaRows()` ist nicht der Deklarations-/Importgraph-Parser. |
| Pipeline: Compiler-Deklarationen und erreichbare Imports | `check-workflow-drift-mutations.mjs`; Stage-Probe im Schema-Runner | `reference/workflows.md`; beide verwenden `productPipelineSections()` und denselben Compilergraph. Keine weitere Probe je Stage-Variante nötig. |
| Pipeline: Progress-Deklarationen und erreichbare Imports | `check-progress-contract-drift-mutations.mjs`, auch im Contract-Runner | `reference/workflows.md`; Graphalgorithmus mit Compiler geteilt, aber eigener Root und eigener Vergleichsabschnitt werden tatsächlich geprüft. |
| SDK: öffentliche Exports und Vertragsmitglieder | `check-contract-drift-mutations.mjs` | `extend/developer-handbook.md` delegiert `reference/sdk.md` und `reference/sdk-exports.md`. Der Gate prüft zuerst Syntax und reviewed Source-Bindings; keine Behauptung, die Mutationen hätten erfolgreich kompiliert oder jeden SDK-Extraktor separat durchlaufen. |
| Capabilities: TypeScript-Vokabular und JSON-Beispielpolicy | `check-capability-drift-mutations.mjs` | `reference/capabilities.md`; zwei verschiedene Parser/Authorities, keine Ableitung von Swarm-Rollen zu Plattformgrants. |
| Capabilities: rekursive Manifestdiscovery und required/provided-Richtung | `check-capability-registrations-drift-controls.mjs` | `reference/capabilities.md`; Add/Remove von Registrierung und Richtungstausch/Namespacewechsel prüfen diesen eigenen Weg. Nicht durch Vokabularprobe ersetzt. |
| Registrierungen: JSON-Manifest und Reportadapter | `check-plugin-manifest-drift-mutations.mjs`, `check-report-registration-drift-mutations.mjs` | `extend/plugin-catalogue/kubeclaw.lint.md`, `reference/buster-suites.md`; gemeinsame AJV-Schemaauthority, aber unterschiedliche Tabellenvergleiche, deshalb beide vorhandenen Proben behalten. |
| Registrierungen: TS-Extensionunion, JS-Providerrecord, JS-Fixturedeklaration | `check-extension-class-drift-mutations.mjs`, `check-provider-registration-drift-mutations.mjs`, `check-fixture-registration-drift-mutations.mjs` | `extend/README.md`, `reference/buster-provider-configuration.md`, `reference/buster-suites.md`; TypeScript-Parserbibliothek gemeinsam, AST-Auswahl und Consumer verschieden. |
| Errors: Buster-Fehlerextraktion | `check-error-code-drift-mutations.mjs` | `reference/buster-error-codes.md`; keine pauschale Übertragung auf Events oder Endpoints. |
| Plattform: Source-/Regexextraktion für Endpoints, Outbound, Events, Stores und Ops-Tools | `check-platform-surface-drift-mutations.mjs`: jeweilige benannte Gruppen | `reference/platform-surfaces-generated.md` und deren Explanation-Ziele; TS/JS-Endpunkte, Go-Controller, Prefixrouting und Outbound sind im Runner getrennt. Gleicher Ausgabe-Gate bedeutet nicht gleicher Extraktor. |
| Plattform: Helm-/YAML-Ressourcen, Claims, Secrets und Abhängigkeiten | Derselbe Plattform-Runner: `dependency`, `store-claim-template`, `secret`, `runtime-service` plus Job-/Policy-/RBAC-Kontrollen | Dieselbe Plattformreferenz; Helm-Renderpfad ist unabhängig von der Source-/Regexextraktion. Job/Policy/RBAC sind vorhandene Change-Kontrollen, kein behauptetes Add/Remove je Spezialfall. |

Quellinspektion der vorhandenen Konfigurationsproben (Fortsetzung nach
`23c732e1`): `embedded-node-heredoc:`, `inline-node-environment:`,
`embedded-python-heredoc:` und `embedded-yaml-javascript:` besitzen jeweils nur
eine Add-Probe. Das sind eigene Einbettungs-/Sprachwege; die allgemeinen
`environment-setting:`-Proben belegen deren Change/Remove nicht. Vor neuen
Tests zuerst die vorhandenen positiven Reader-Fixtures und Consumer-Kontrollen
auf Wiederverwendbarkeit prüfen; fehlende Change/Remove-Abdeckung bleibt offen.

Für Deployment-API-Auflösung existieren `api-operational-field:add`,
`api-authority-lock:bytes-change`, `api-authority-source:content-change` und
`api-leaf-context:parent-substitution`. Lock-/Byteabweichung beweist Integrität,
nicht semantische Add/Change/Remove-Abdeckung des API-Feldresolvers. Die vorhandene
`embedded-payload-authority:`-Dreierprobe prüft die Payloadgrenze, nicht automatisch
die API-Schemaauflösung. Keine dieser Kontrollen wird hier als Inhaltsabnahme
gezählt. Plattform-Go-Endpunkte und Go-Outbound haben dagegen bereits explizite
Add/Change/Remove-Konstruktoren; dafür keine neuen Varianten bauen.

Der unabhängige Themenreview muss diese konkreten Grenzen und die tatsächlichen
Ergebnisse prüfen. Die historischen 84 Varianten sind keine To-do-Liste. Ein
fehlender Familien-Sammelbefehl ist kein fehlender Parserweg: die vorhandenen
fokussierten Befehle dürfen direkt laufen. Ein unabhängiges Urteil liegt für diese
Zuordnung noch nicht vor. A911-11 bleibt `not-accepted`; auch eine vorhandene
Testdatei ist kein bestandenes Ergebnis.

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
| A913-03 | Mindestens ein vom Autor unabhängiger Review pro zusammenhängendem Themenbereich prüft Quelltreue, Leseraufgaben sowie Sprache und Struktur; wesentliche Befunde sind korrigiert und betroffene Änderungen nachgeprüft. | Der Autor nimmt sich selbst unabhängig ab, ein wesentlicher Befund bleibt offen oder eine relevante Korrektur wird ohne gezielte Nachprüfung übernommen. |
| A913-04 | Operator, Pipeline-Autor, Plugin-Entwickler, Plattform-Entwickler und Prism/Buster-Spezialist führen ihre verbindlichen Readeraufgaben ohne Chat, Reviewordner oder Package-README aus. | Eine Persona oder nur der Happy Path fehlt. |
| A913-05 | Erfolgs-, Validierungsfehler-, Dependency-Ausfall-, Cancellation-, Wait/Resume-, Restart/Recovery-, unklarer-Effect- und Change/Removal-Wege liefern die dokumentierten Beobachtungen. | Ein Workflow wird aus einem ähnlichen Fall abgeleitet statt ausgeführt. |
| A913-06 | Controlled-Language-Review erfasst Scope, Methode, technische Begriffe und gelöste Befunde; kein Punkt behauptet formale ASD-STE100-Zertifizierung. | Readability-Score oder kurzer Linter gilt als vollständige Sprachabnahme. |
| A913-07 | Jede signifikante Entscheidung besitzt belegten oder ausdrücklich unbekannten Grund, Nutzen, Kosten, Status, Implementierungsstand und Neubewertungsbedingung. | Sourceverhalten wird als historische Begründung ausgegeben. |
| A913-08 | Repräsentative Driftproben decken die tatsächlich unterschiedlichen Generator-/Parserwege ab und erkennen Hinzufügen, Ändern und Entfernen mit dem richtigen Leserort. Bestehende gültige Proben werden wiederverwendet und gemeinsame Wege kurz begründet. | Ein unabhängiger Weg fehlt, veraltete Dokumentation bleibt unbemerkt oder ein fachfremder Buildfehler wird als erfolgreicher Driftbeweis gewertet. |
| A913-09 | Der kompakte Abschluss nennt geprüften Commit und Umfang, relevante Befehle oder Prüfschritte mit Ergebnissen, unabhängigen Review und verbleibende Produktgrenzen; betroffene Quellen und Seiten stimmen mit dem geprüften Stand überein. | Commit oder Umfang sind unbekannt, eine relevante Änderung blieb ungeprüft oder ein fehlgeschlagener Check wird als bestanden dargestellt. |
| A913-10 | Jede Nichtanwendbarkeit nennt Quellbeweis und Grund und wird unabhängig genehmigt; offene Produktgrenzen bleiben als aktuelle Limits mit Owner und Akzeptanzbedingung sichtbar. | `N/A` dient dazu, fehlende Dokumentation oder nicht gelaufene Prüfung zu verstecken. |
| A913-11 | Die AP10-Löschliste besitzt für jede alte Datei Inhaltsparität, kanonisches Ziel, Redirectbedarf, Referenzsuche und unabhängige Freigabe; das Löschen selbst bleibt AP10. | Alte Quellen werden pauschal nach Pfad oder Dateialter freigegeben. |
| A913-12 | Der finale Bericht nennt ausdrücklich alle bestandenen und nicht ausgeführten Live-Gates. AP09 erhält nur dann `PASS`, wenn kein materieller Dokumentationsbefund offen ist. | „Alles grün“ verschweigt Skips, Produktlücken oder begrenzte Evidenzklassen. |

## 13. Abschlussregel und automatische Prüfung

Ein Themenbereich wird nach erfüllter fachlicher Checkliste und einem kompakten
unabhängigen Review geschlossen. AP09 ist abgeschlossen, wenn alle zugeordneten
Inhalte und Gates abgenommen sind, keine wesentlichen Dokumentationsfehler offen
bleiben und Veröffentlichung, Navigation, Suche sowie relevante Prüfungen
funktionieren. AP10 entfernt ersetzte Quellen erst nach bestätigter Inhaltsübernahme;
AP11 prüft den Gesamtzustand und die einfachen Pflegewege.

`npm run docs:ap09:acceptance-contract:check` prüft Checkliste und Register samt
kompakten Abschlüssen. Ohne Abschlussvermerke prüft es nur die Struktur, nicht die
fachliche Abnahme. Es erzeugt keine Dateien und führt keine Live-Operationen aus.
Das frühere `--evidence`-Format und seine Rohartefaktpflicht sind außer Betrieb;
vorhandene historische Belege müssen nicht konvertiert oder neu erzeugt werden.
