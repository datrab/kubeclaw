# Vereinfachung der Worker-Ausführung — Entscheidungsvorlage

Stand: 12. Oktober 2026. Lesende Codeprüfung und Abgleich mit offizieller Dokumentation; keine neue Runtimeimplementierung, kein Cluster-/Hosteingriff. Der Auftraggeber hat bestätigt: **Die Plattform führt generell eigenen generierten Code aus.** Anschließend hat er den Zielwechsel und die fünf Vertragsanpassungen akzeptiert, sofern das Ergebnis wesentlich weniger komplex und einfacher skalierbar ist. [D18/D19](decisions.md#d18--kubernetes-ausführung-statt-eigener-nativer-hostpools) und der [beschlossene Arbeitsplan](implementation-order-20261012.md) halten Entscheidung und Reihenfolge fest: CONFIG → Test-Refactoring → Cgroup-Refactoring → zwölf offene Findings. D18 ersetzt D16 als zukünftige Zielarchitektur; D16 bleibt historisch erhalten. **Der heutige Auftrag ist Dokumentation, kein Implementierungsstart.**

## Ergebnis

Für diesen Einsatzzweck empfehle ich **Kubernetes-verwaltete Jobs mit gewöhnlichen Containerressourcen**, anstelle eigener Buster-/Prism-Hostpools außerhalb der Podhierarchie. Kubernetes und die Containerruntime verwenden weiterhin Cgroups. Entfallen soll unsere eigene Hostdelegation und parallele Ressourcenverwaltung.

Das ist eine begründete Architekturpräferenz, keine bereits bewiesene Austauschbarkeit. Die Migration ist ein größeres einmaliges Paket. Insbesondere die heutige CPU-Zeit-/Task-/Receiptsemantik und retained Fixtures lassen sich nicht unverändert allein durch Job-YAML ersetzen.

## Konkrete heutige Kopplungen

- `charts/prism/templates/workloads.yaml` verlangt exakt eine native Workerreplik, konkrete Nodebindung und generierten Policy-Digest. Der Supervisor startet als UID 0 mit SETUID/SETGID/KILL, mountet Rollen-Cgroup und Ownershipverzeichnis vom Host und verwendet Recreate. Control bleibt aufgrund des RWO-Artefaktvolumes ebenfalls auf eine Replik begrenzt; das ist eine separate Skalierungslücke.
- `skills/prism/server/worker.ts` startet ausschließlich den nativen Supervisor; `native-worker-execution.ts` bindet Journal, Ownership, Ressourcenvertrag und nativen Prozessstart. Es existiert kein fertiger Kubernetes-Jobadapter, den wir nur einschalten könnten.
- `NativeWorkerResourcePool` prüft echte `memory.max`, `memory.swap.max`, `pids.max`, `cpu.max`, Kernelbeobachtung und `cgroup.kill`. Reservations und Ownership leisten echte Arbeit; sie dürfen nicht einfach durch erfolgreiche API-Aufrufe ersetzt werden.
- `tools/native-worker-nri` und Hostsetup ermöglichen ausgewählten Supervisoren die Host-Cgroup-Sicht. Host-/Runtime-/Bootidentitäten, systemd-Dienst und Kubeletreserven gehören zum Betrieb dieser Sonderlösung.
- Buster `remote-prepared-execution.ts` erstellt Capabilityruntime und vollständigen Runner im Parent. Der Runner erhält keinen nativen WorkerRuntime. Die vorhandenen nativen Bausteine schließen daher nicht die gesamte Buster-Ausführung ein.
- `runner-fixtures.ts` hält erfolgreiche lokale Providerinstanzen bis nach ihren abhängigen Tests und führt Cleanup in umgekehrter Reihenfolge aus. Ein Pod pro Buster-Node würde diese direkten Instanz-/Prozessbezüge in verteilte Endpunkt-/Leaseverträge verwandeln. Das ist zusätzliche Komplexität.
- Kubernetes-Fixtures besitzen bereits eigene Namespace-/Lease-/Controllerverträge. Sie sind von lokalen retained Fixtures zu unterscheiden; ihre Cleanup-/Retentionverträge bleiben erforderlich.

Quellenstand und relevante Hashes: `worker-execution-simplification-20261012-sources.json`. Die Bestandsaufnahme der 16 Punkte und ihre offenen Nachweise bleibt gültig; diese Vorlage nimmt keine Statusänderung vor.

## Varianten

| Variante | Vorteile | Kosten und Grenzen | Bewertung |
|---|---|---|---|
| Hostpools fertigstellen | Präzise eigene Hierarchie, permanente Scope-/Fixturebindung, bestehende native Verträge | NRI, Hostinstallation, Reservierungen neben Kubernetes, Node-/Boot-Recovery und umfassende Kerneltests | Für besondere native Anforderungen möglich, hier hoher Daueraufwand |
| Eigene Unter-Cgroups innerhalb langfristiger Workerpods | Ressourcen bleiben in Kubernetes-Podgrenze | Delegation/Runtimeintegration und eigene Scopeverwaltung bleiben; Podverlust betrifft laufende Arbeit | Begrenzte Vereinfachung, kein bevorzugtes Ziel |
| Kubernetes-Jobs je geeigneter Arbeitseinheit | Normales Scheduling, Containerlimits und Podlebenszyklus; weniger Hostsonderlogik | Neuer Ausführungsadapter, langlebiges Journal/Claim, präzise geänderte Ressourcen- und Recoveryverträge | Empfohlen |

Ein vollständiger Buster-Testplan als Arbeitseinheit verringert den ersten Umbau. Ein Job pro sehr kurzem Toolaufruf würde Start-/Image-/APIaufwand vervielfachen; dafür liegt keine Latenzmessung vor. gVisor/Kata sind für den bestätigten Einsatzzweck keine Voraussetzung dieser Vereinfachung. Eigenes generiertes Projektmaterial und Abhängigkeiten bekommen dennoch keine Plattformrechte.

Der Planjob hat bewusst eine gröbere Fehlergrenze: Ein speichererschöpfender Test kann den gesamten Ausführungscontainer und damit weitere lokale Tests/Fixtures beeinträchtigen. Andere Planjobs bleiben durch ihre eigenen Grenzen geschützt. Wer jeden Testnode unabhängig weiterbetreiben und hart abrechnen möchte, braucht feinere Container-/Podgrenzen oder behält zusätzliche Untergruppen. Diese Konsequenz gehört zur Entscheidung über das Planbudget.

## Empfohlene Zielstruktur

1. **Steuerung bleibt dauerhaft.** Nova und bestehende Worker-/Dispatchdienste akzeptieren unveränderliche Auftragsidentitäten und speichern Claims, Zustände und Resultate außerhalb vergänglicher Pods. Ein kleiner gemeinsamer Jobadapter erzeugt und beobachtet Ressourcen; kein neuer fachlicher Scheduler und zunächst keine neue CRD.
2. **Prism:** ein Job pro echter Arbeitseinheit/Attempt, mit gebundenem Input, Engine-/Imagedigest, vollständiger Konfiguration und dediziertem Ergebnis-/Artefaktpfad. Eigene Nodebindung entfällt, sobald Image-/Storage-/Schedulingkompatibilität auf mehreren Nodes tatsächlich geprüft ist.
3. **Buster:** zunächst ein Job pro vollständigem Plan mit seinen lokalen Providern, Capabilitykindern und lokaler Fixture-Lebensdauer. Vorbereitung und lokale Finalisierung sind Teil der erfassten Ausführung; langlebiger Kontrollserver und externe Ressourcen bleiben ausdrücklich eigene Klassen. Lokale Fixtures bleiben im selben Ausführungscontainer bis Cleanup, ohne Umhängen bereits belasteter Prozesse. Bereits externe Kubernetes-Fixtures behalten ihre vorhandenen Leases.
4. **Containerressourcen:** explizite CPU-/RAM-Requests und Limits je Container; im ersten konservativen Profil keine RAM-Überbuchung für Ausführung. Alle Sidecars erhalten ebenfalls eigene explizite Budgets. Keine Abhängigkeit von einem neuen Pod-Level-Resources-Feature nötig. Disk-/Inode-/PVCbudget ist separat erforderlich; ephemeral-storage-Überwachung ist keine vollständige physische Storagegarantie.
5. **Workspace und Ergebnis:** temporäres Arbeitsmaterial in Jobstorage; Ergebnisse, notwendige Logs, Entscheidungen und Wiederaufnahmezustand vor Bereinigung dauerhaft veröffentlichen. Kein automatisches Job-TTL, bevor die vorgeschriebene Übernahme belegt ist. Clawdeck bleibt Logsammlung; keine neue zentrale Logdatenbank.
6. **Berechtigungen:** Ausführung möglichst non-root, keine Host-Cgroup-/Runtime-Sockets oder privilegierten Hostmounts. Jobsteuerung liegt im Kontrolldienst. Projektprozesse erhalten keine Controller-/Clusteradmin-/Plattformcredentials. Erforderliche Grants und kurzlebige Credentials eng an Aufgabe/Artefaktbereich binden; vorhandene Trust-/Capabilitygrenzen nicht pauschal entfernen.

**Buster benötigt eine innere Berechtigungsgrenze:** Heutige Parentinvoker können Kubernetes-/Registry-/Tailscaleautorität tragen. Alle Prozesse in denselben Container und unter dieselbe UID zu legen schützt diese Credentials nicht. Lokale Browser-/Scanner-/Compilerarbeit bleibt in der Ausführung. Credentialtragende Capabilityaufrufe müssen über eine nachgewiesene isolierte Brokergrenze vermittelt werden: vorzugsweise bestehende Capabilityautorität weiterverwenden oder einen eng begrenzten Jobsidecar mit getrennten Secretmounts/Identität und ohne gemeinsame PID-Sicht einsetzen. Ein Sidecar allein schützt nicht vor Zugriff über gemeinsamen Storage oder unzureichend autorisierte RPCs; konkrete Grants und Mounts müssen echt geprüft sein. Falls vorhandene innere Sandbox diese Grenze bereits vollständig trägt, kann sie statt eines neuen Brokers erhalten bleiben; derzeit ist das kein Gesamtnachweis. Vor Buster-Prototyp entscheiden und prüfen.

Ein solcher Sidecar erhält eigene konfigurierte Containerbudgets. Das Planbudget muss alle lokalen Container einschließen. Getrennte Memory-Peaks dürfen nicht als beobachteter gemeinsamer zeitgleicher Podpeak addiert werden; Messscope und gegebenenfalls nur konservative Obergrenze sind ausdrücklich zu bezeichnen. Entfernte Broker-/Cluster-/BuildKitarbeit bleibt separat budgetiert und ausgewiesen. Das ist ein verbleibender Integrationsaufwand der Jobvariante.

Kubernetes setzt CPU-/RAM-Containerlimits über Runtime/Kernel durch. CPU wird gedrosselt, Speicherüberschreitung kann OOM auslösen. Requests steuern das Scheduling; Limits allein sind keine Zusicherung reservierter CPU-Rechenzeit. [Kubernetes Ressourcenverwaltung](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)

## Garantien, die wir ausdrücklich entscheiden müssen

| Heute geforderter Vertrag | Was normale Jobs liefern | Vorschlag / Entscheidung |
|---|---|---|
| Gesamte lokale Attemptarbeit budgetiert | Grenzen des betreffenden Containers, nicht automatisch externe BuildKit-/Fixturearbeit | Prism pro Attempt; Buster zunächst pro Plan. Alle lokalen Helfer bleiben innerhalb des Jobs. Externe Arbeit separat budgetieren |
| CPU-Zeitbudget pro Attempt | CPU-Rechenrate und Job-/Anwendungsfrist, kein identischer kumulativer CPU-Zeitgrenzwert | Für eigenen Code CPU-Rate + endliche Gesamtlaufzeit vorschlagen. Das ändert den Vertrag ausdrücklich; bei zwingendem kumulativem Budget bleibt zusätzliche Mess-/Abbruchlogik erforderlich |
| Unterschiedliche harte Linux-Taskbudgets pro Attempt/Fixture | Pod-PID-Limit wird über Kubelet/Nodeprofil gesetzt, nicht beliebig je Job in CPU-/RAM-Resources | Einheitliches großzügig gemessenes Podlimit plus Hostreserve vorschlagen; unterschiedliche harte Attempttasklimits würden Zusatzmechanik verlangen |
| Getrennte Buster-Nodebudgets und Kernelreceipts | Ein Plancontainer hat gemeinsame Grenze; einzelne Node-Messwerte sind keine unabhängige harte Isolation | Für ersten Umbau Planbudget und gebundenes Planreceipt entscheiden. Nodefristen und Outputlimits bleiben. Harte Einzel-Nodeisolation würde zusätzliche Pods/Container oder eigene Untergruppen verlangen |
| Physische Fixture-Lebensdauer über Setup hinaus | Lokale Prozesse können im weiterlaufenden Plancontainer bleiben; über dessen Verlust hinweg leben sie nicht weiter | Lebensdauer bis Cleanup bewahren. Nach Podverlust abgeschlossenen Setupnachweis nicht als aktuelle Bereitschaft übernehmen; nur nach sicherer Zustandsklärung neu aufbauen oder blockieren |
| Vollständige finale Kernelmessung bei Crash/Nodeverlust | Jobstatus und periodische Metriken liefern nicht immer finale CPU-/Peakwerte | Messung vor normalem Exit; im Fehlerfall fehlende Werte ausdrücklich als unbekannt führen. Keine Nullwerte oder nachgebauten Schätzungen als Kernelbeleg. Falls jeder Crash exakte finale Werte braucht, bleibt Zusatzinfrastruktur |
| Ende vor Ressourcenfreigabe | Normaler beobachteter terminaler Zustand hilft; ein unerreichbarer Node kann weiterarbeiten | Bei ungewissem Arbeitsende keine sichere Wiederholung behaupten. Zugriffstokens/Claims und externen Zustand prüfen; fehlendes verlässliches Fencing blockiert Wiederaufnahme |

Die CPU-/Task-/Buster-Planänderungen berühren B1–B5, D13/D14/D16 und Ressourcencontract-Versionen. Sie benötigen neue ausdrückliche Entscheidung und aktualisierte Kriterien; historische Receipts bleiben lesbar. Keine stillschweigende Umdeutung von CPU-Zeit in CPU-Rate oder Prozesszahl in Tasks.

[Kubernetes PID-Limits](https://kubernetes.io/docs/concepts/policy/pid-limiting/) beschreibt die Node-/Kubeleteinstellung und die Trennung harter Limits von periodischer Eviction. Der genaue Linux-Taskbezug und die tatsächliche Durchsetzung sind am ausgewählten Runtimeprofil zu prüfen.

**Gesamter Taskschutz bleibt notwendig:** Kubernetes plant CPU/RAM und Podanzahl, aber reserviert nicht automatisch unsere individuellen Taskbudgets. Als konservative Alternative muss das Nodeprofil die maximal gleichzeitig zugelassene Podanzahl × wirksames Pod-PID-Limit einschließlich aller Nebenpods und Host-/Kubeletreserve gegen die tatsächlichen Kernelgrenzen prüfen. Bei unterschiedlichen Limits ist die jeweilige zulässige Kombination zu begrenzen. Fehlende oder unpassende gemeinsame Reserve blockiert die Aktivierung. Ein Pod-PID-Limit allein reicht nicht; diese Regel verwendet Standard-Nodekonfiguration und Admission, ohne eine eigene parallele Rollen-Cgrouphierarchie als Voraussetzung zu behaupten.

## Recovery, Abbruch und Seiteneffekte

Kubernetes-Jobs sind keine Exactly-once-Ausführung: selbst mit einer Completion, Parallelität eins und `restartPolicy: Never` kann dasselbe Programm zweimal starten. Deshalb bleiben dauerhafte Identität, Claim, Ergebnis-Deduplizierung und externe Reconciliation notwendig. Das ist echte Anwendungskomplexität, die Kubernetes nicht abnimmt. [Kubernetes Jobs](https://kubernetes.io/docs/concepts/workloads/controllers/job/)

Vorgeschlagener Startvertrag: `restartPolicy: Never`, `backoffLimit: 0`, eine Completion; bestehende technische Wiederaufnahme entscheidet über einen neuen, versionierten Versuch. Diese Einstellungen reduzieren unkontrollierte Wiederholung, garantieren sie aber nicht. Ein neuer Pod muss vor Seiteneffekten einen gültigen ausschließlichen Claim prüfen. Ein einmaliger Startupcheck genügt für lange laufende oder nicht eingrenzbare externe Aktionen nicht.

Nach verlorener Createantwort den vorhandenen Job anhand Auftragsidentität und UID/gebundenem Input adoptieren, keinen zweiten blind starten. Controllerneustart darf laufende Jobs wiederfinden. Nach Nodepartition reicht ein abgelaufener Claim nicht als physischer Stopbeweis; externe Ziele müssen verlässlich fencebar sein oder der Ausgang bleibt blockiert. D08 bleibt erhalten.

Abbruch verlangt gebundene Job-/Podidentitäten, unterbrochene weitere Aktionen, Cleanup und beobachtetes tatsächliches Arbeitsende. Kubernetes-Terminationsfristen ersetzen nicht das vollständige externe Fixture-/BuildKitcleanup. Durable Result-Veröffentlichung und bestätigte Objektfreigabe sind getrennte Schritte; ein Erfolgsexit ohne aufgenommenes Resultat ist keine technische Lieferung.

## BuildKit und Skalierung

BuildKit bleibt eine eigene zu klärende Ausführungsgrenze. Ein Containerwechsel allein schließt IFR-10-001 nicht. Vorschlag: für aktivierte Builds ein auftragsgebundener, kurzlebiger BuildKit-Pod mit engen Registrycredentials und kompatibler Prozesssandbox; keine dauerhaft im gleichen Kontext gehaltenen Plattformdienste. Ob das aktuelle Rootlessimage mit normaler Sandbox auf der ausgewählten Runtime funktioniert, benötigt einen echten Nachweis. Gemeinsame Caches sind optional und besitzen einen eigenen Trust-/Storagevertrag. Das ist noch kein implementierter Fix.

Mehr Aufträge können nach Migration mehr schedulbare Jobs erzeugen. Ein fester einzelner Host hat dadurch keine zusätzliche Kapazität; dort bedeutet Skalierung Warteschlange und begrenzte Parallelität. Für zusätzliche Nodes bleiben standardisierte Runtime-/PID-/Image-/Netzprofile und tatsächlich geeigneter Storage nötig. Es gibt keinen belegten automatischen Bare-Metal-Provisionierungsweg. Node-Autoscaling wäre ein späteres eigenständiges Paket, nicht Teil des ersten Umbaus.

Insbesondere das aktuelle RWO-/lokale Artefaktstorage und die ausdrücklich im Chart erzwungene einzelne Prism-Control-Replik verhindern unabhängig von Cgroups beliebige horizontale Skalierung. RWO bezeichnet grundsätzlich die Schreibmontage an einem Node, nicht zwingend exakt einen Pod; die Replikbeschränkung ist hier zusätzlich ein konkreter Chartvertrag. Die Migration muss Input-/Outputzugriff von Ausführungsjobs ermöglichen, ohne Nodebindung oder neue konkurrierende Speicherautorität still einzuführen. API-/Artefakttransfer oder passende vorhandene Storagezugriffe sind vor dem Prototyp zu wählen. Ein neuer Objektspeicherdienst ist keine automatisch freigegebene Voraussetzung.

## Was später entfallen kann und was bleibt

**Nach bestätigtem Cutover entfernbar:** eigenes native-worker-NRI, Hostrollenpool-Setup, ausschließlich workerbedingte zusätzliche Kubeletreservierungen, Host-Cgroupmounts, Node-/Bootbindung für native Prozessbesitzführung und die zugehörigen nativen Ausführungspfade. Allgemeine Host-/Kubeletschutzreserven bleiben. Ganze Module erst nach Consumerinventur entfernen; Credentialdrop, Sandbox und Input-/Outputschutz können andere Consumer haben.

**Weiter notwendig:** generischer Corevertrag, Auftragsidentitäten, durable Journale/Claims/Resultate, externe Effekt-Reconciliation, Plugin-/Capabilitygrenzen, Secrets/Trust, Artefaktintegrität, deterministische Tests, Retention, Storage- und Backupvertrag. Jobmetadaten ersetzen keine Anwendungshistorie. Historische v1/v2/v3-Receipts und Ownershipbelege bleiben zugänglich; alte ungewisse Arbeit darf nicht verworfen werden.

## Migrationsvorschlag und Abnahme

Aufwand relativ: **groß als einmalige Migration**, voraussichtlich weniger Sonderbetrieb danach; keine gemessene Performance- oder Kostenersparnis zugesichert. Innerhalb der erst nach CONFIG und Test-Refactoring folgenden Phase 3: (1) bestätigten Zielvertrag in konkrete versionierte Matrix und Storage-/Claimprofile übertragen, (2) isolierten vertikalen Jobadapter zunächst für Prism entwickeln und echt prüfen, (3) Buster-Planjob mit Fixtures und Capabilityarbeit, (4) eigens geprüfte Cutover-/Recovery-/Rollbackgrenze, (5) ersetzte native Pfade und Betriebshilfen entfernen. Kein dauerhaft automatisch umschaltender Doppelpfad und kein stiller Fallback. Der heutige Dokumentationsauftrag startet auch keinen Prototyp.

Vor Migration ist der tatsächliche Hostinstallationsstand zu erheben: Repositorydateien beweisen nicht, ob NRI/Poolservice schon auf Produktionshosts installiert sind. Entfernen eines aktiven Hostservices kann seine ganze Prozesshierarchie beenden; erst drainen und separat autorisieren.

Vorgeschlagene verpflichtende Abnahmefälle:

1. **Ressourcen:** reale CPU-/RAM-/Tasklast und Kindprozesse im ausgewählten Profil, zwei parallele Jobs, Schedulingrequests, keine doppelte Kapazitätsvergabe; Plan-/Attemptgranularität und CPU-Rate/Zeitvertrag explizit geprüft. Kernel-/Runtimeprüfung nicht durch Render ersetzen.
2. **Echte Tools:** Prism-Engine, Browser, Compiler, Scanner und Reportfinalisierung in fertigen gebundenen Images; gegebenenfalls BuildKit/Push/Pull mit eigenem vollständigem Isolationsnachweis. Alle lokalen Capabilitykosten zugeordnet, externe Kosten ausgewiesen.
3. **Fixtures:** Setup, Bereitschaft, abhängige Tests, Cleanup und spätes Kindende; Abbruch und Podverlust erzeugen keine falsche Bereitschaft oder vorzeitige Freigabe. Lokale und Kubernetes-Fixtures getrennt prüfen.
4. **Recovery:** verlorene Create-/Resultantwort, Controllerneustart, doppelter Podstart, Crash vor/nach Seiteneffekt, Nodeverlust/Partition und verspätete Zustellung. Keine doppelte externe Wirkung, keine fiktive sichere Wiederaufnahme.
5. **Daten:** Logs/Artefakte/Resultate vor Jobbereinigung dauerhaft aufgenommen; kleine echte Quoten, Uploadfehler und Crash im Abschluss; vorhandene historische Nachweise unverändert lesbar. Keine automatische D07-Loglöschung.
6. **Sicherheit:** keine Host-Cgroup-/Runtimezugriffe für Ausführung, kein unnötiger Root-/Capabilitypfad, Projektcode ohne Controller-/Plattformcredentials; effektive RBAC/Netz-/Plugin-/Registrygrenzen und erlaubte Positivfälle echt prüfen.
7. **Integration:** ursprüngliche Consumer-/Release-/Trust-/CONFIGprüfungen am neuen Tree; vollständige explizite Komponentenkonfiguration ohne Ersatzdefaults; keine noch aktiv nutzbaren ungewollten Altpfade.
8. **Dokumentation und Review:** Ziel-/Ressourcen-/Fixture-/Fehler-/Recovery-/Operatoranleitung und historische Entscheidungsmigration geprüft und aktualisiert. Neue Vertragssemantik versioniert, Abweichungen offen beschlossen. Frische unabhängige Gegenprüfung von Code, Originalumfang, echten Rohbelegen und entfernten Altpfaden. Separate Live-Gates bleiben nach D12 erhalten.

## Entscheidungsprotokoll

| Datum | Gegenstand | Tatsächliche Entscheidung |
|---|---|---|
| 2026-10-12 | Einsatzprofil | Auftraggeber: generell eigener generierter Code |
| 2026-10-12 | Arbeitsumfang | Prüfung einer Vereinfachung autorisiert; bisheriger Bestandsaufnahme-/Entscheidungsmodus bleibt, keine Implementierung |
| 2026-10-12 | Zielarchitektur | Kubernetes-Jobs statt eigener Hostpools/NRI unter der Bedingung wesentlicher Vereinfachung und besserer Skalierbarkeit akzeptiert; D18 ersetzt D16 als Ziel |
| 2026-10-12 | Ressourcenvertrag | CPU-Rate plus Laufzeit, vereinheitlichter Podtaskschutz samt Gesamttaskschutz und Buster-Planbudget akzeptiert |
| 2026-10-12 | Fehlerabrechnung | Fehlende finale Kernelwerte bei Crash/Nodeverlust ausdrücklich als unbekannt akzeptiert; keine fiktive vollständige Abrechnung |
| 2026-10-12 | Fixture-Recovery | Lebenden Planjob übernehmen; nach Podverlust Bereitschaft invalidieren und sicher rekonstruieren oder blockieren akzeptiert; D14/B4 insoweit angepasst |
| 2026-10-12 | Reihenfolge | CONFIG-Zentralisierung → Test-Refactoring nach Vorgaben der anderen Session → Cgroup-Refactoring → zwölf offene Findings |
| ausstehend | konkreter erster Umsetzungsstart | Kein Codebeginn im Dokumentationsauftrag. Phase 1 zuerst; Phase-3-Vertikalschnitt erst nach Phase 2 und geklärtem Storage-/Jobidentitätsvertrag |

Die Architekturpräferenz und die fünf Vertragsänderungen sind inzwischen entschieden; sie werden nicht erneut als offene Grundsatzfrage vorgelegt. Die konkrete Umsetzung folgt dem beschlossenen Arbeitsplan und den dortigen Abnahmen. Noch keine Behebung oder Statuspromotion.

## Unabhängige Gegenprüfung

Der frische, nicht implementierende Prüfer bestätigt die korrigierte Entscheidungsvorlage als plausible Vereinfachungsrichtung. Alle 15 gebundenen Quellenidentitäten stimmen. Seine Hinweise zu fünf Vertragsänderungen, aggregiertem Taskschutz, innerer Buster-Berechtigungsgrenze, Budgetscope und RWO-Vertrag sind aufgenommen. Der [vollständige Prüfbericht](independent-worker-simplification-20261012.md) hält Methoden und Grenzen fest; der [Quellenstand](worker-execution-simplification-20261012-sources.json) bindet den untersuchten Code. Keine echte Jobausführung, kein Fencing-/Storage-/BuildKitnachweis und keine Umsetzungsfreigabe werden daraus abgeleitet. Dieser Abschlussverweis wurde nach dem Review ergänzt.

Der unabhängige Bericht und die 15 Identitäten beziehen sich auf die damalige Vorlage vor der anschließend ausgesprochenen Auftraggeberentscheidung. Die obige Entscheidungsfortschreibung und D18/D19 sind neue Dokumentationsbytes; insbesondere `decisions.md` hat seit der Quellenaufnahme einen neuen Inhalt. Das historische Review wird nicht als erneute Abnahme dieser Dokumentationsänderung ausgegeben. Der Produktionscode wurde durch die Entscheidung nicht geändert.
