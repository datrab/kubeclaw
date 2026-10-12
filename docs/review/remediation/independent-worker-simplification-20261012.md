# Unabhängige Prüfung der Worker-Vereinfachung — 12. Oktober 2026

Gegenstand: `docs/review/remediation/worker-execution-simplification-20261012.md` und seine Quellenliste im Repository `/home/node/Documents/Codex/2026-09-20-hi-sind-die-offenen-issues-irgendwo`. Frischer Prüfer `independent_inventory`; ausschließlich lesend. Keine Architekturentscheidung, Implementierungsfreigabe, Statusänderung oder Runtimeabnahme.

## Urteil

**Kubernetes-Jobs sind eine realistische Vereinfachungsrichtung**, wenn der Auftraggeber die geänderten Ressourcen- und Recoveryverträge ausdrücklich akzeptiert. Prism pro Attempt und Buster zunächst pro vollständigem Plan passen deutlich besser zu den bestehenden Arbeits-/Fixturebeziehungen als ein Pod pro kurzem Toolaufruf oder Buster-Node. Das entfernt voraussichtlich Hostdelegation, NRI und eine zweite schedulerwirksame native Kapazitätsverwaltung. Es entfernt weder Journale/Effektreconciliation noch Storage-, Fixture- und Sicherheitsverantwortung. Eine Performance-/Kostenersparnis oder funktionale Gleichwertigkeit wurde nicht nachgewiesen.

Die Vorlage macht die wichtigsten Grenzen bereits offen: CPU-Zeit ist keine CPU-Rate, Pod-PID-Policy ist keine beliebige Attempttaskpolicy, Planisolation ist keine Nodeisolation, finale Crashmesswerte können fehlen und Kubernetes liefert keine Exactly-once-Ausführung. Drei Präzisierungen sollten vor einer Architekturentscheidung ergänzt werden.

## Konkrete Hinweise

1. **Entscheidungsumfang umfasst mehr als drei Ressourcenänderungen.** Neben CPU-Rate/Laufzeit, Podtasklimit und Planbudget ändern sich gegebenenfalls **B3s vollständige finale Gesamtabrechnung** und **D14/B4s über Neustart erhaltene Fixture-Lebensdauer/Besitz-/Budgetbindung**. Die Tabelle nennt das, aber die Schlussfrage fokussiert nur auf drei geänderte Ressourcenverträge. Finalwerte „unbekannt“ statt exaktem Abschlussbeleg sowie sicherer Wiederaufbau/blockiert statt Erhalt einer vorhandenen physischen Fixture-Lebensdauer sind eigene ausdrückliche Entscheidungen. Zu unterscheiden: Kontrollserverneustart bei weiterlaufendem Pod kann Besitz/Fixture erhalten; Pod-/Nodeverlust zerstört oder entzieht die Prozessbeobachtung. Historische Kriterien nicht pauschal für erledigt erklären.
2. **Podtaskschutz braucht einen aggregierten Nodevertrag.** Ein großes Kubelet-Pod-PID-Limit plus Hostreserve allein verhindert keine Erschöpfung durch viele gleichzeitig bis zum Limit laufende Pods. Kubernetes nimmt PIDbudgets nicht wie CPU-/RAM-Requests in die normale Podressourcen-Schedulingrechnung auf. Geeignete Podparallelitäts-/Nodegrenzen und Node-PIDbudget samt allen Nebenpods sind zu prüfen; periodische PIDEviction ersetzt diese Grenze nicht. Das kann mit einfacher begrenzter Parallelität und standardisiertem Nodeprofil erfolgen und erfordert nicht zwingend neue eigene Unter-Cgroups. Linux-Threads/Tasks und `pids.max`-Wirkung weiterhin echt messen.
3. **Whole-plan-Buster und Credentialgrenzen zusammen entwerfen.** Der heutige Capabilityruntime läuft im Parent und enthält autorisierte Cluster-/Registry-/Exposureoperationen. Ein gemeinsamer Ausführungscontainer schließt deren lokale Ressourcen ein, beweist aber keine Abschirmung ihrer Credentials vor Provider-/Projektprozessen im selben UID-/Prozess-/Dateikontext. Die Zusage „Projektcode ohne Plattformcredentials“ braucht einen konkreten Vertrag: beispielsweise schmaler Broker/Sidecar/Remote-Mediation mit getrennten Identitäten/Secretmounts oder nachgewiesene innere Isolation. Ein Broker ist dann eine separat budgetierte Klasse; seine lokale Arbeit darf B1 nicht unbemerkt verlassen. Der bestätigte Einsatz eigenen generierten Codes ist kein Beleg, dass alle Abhängigkeiten harmlos sind oder die vorhandene Capabilitygrenze entfallen kann.

Zusätzliche Formulierungspräzisierung: **RWO bedeutet grundsätzlich Schreibmount von einem Node, nicht zwingend von genau einem Pod.** Die aktuelle Chartvalidierung erzwingt eine Controlreplik ausdrücklich. Die Vorlage darf die vorhandene Chartrestriktion benennen, sollte daraus aber keine allgemeine RWO-Ein-Pod-Garantie machen. Nodeübergreifende Planung, lokaler Storage und Attach-/Partitionsverhalten bleiben ungeklärt; RWO ersetzt kein verlässliches Fencing.

## Eigenständig geprüfte Codebezüge

- Eigener SHA256-Vergleich der Quellenliste: **15/15 Identitäten stimmen** mit dem gelesenen Arbeitsbaum überein.
- `charts/prism/templates/workloads.yaml`: explizite eine Controlreplik und eine native Workerreplik; Worker-Node/Policybindung; Recreate; Rootsupervisor mit SETUID/SETGID/KILL; Hostmounts für Pool und Ownership. Daraus folgt reale heutige Sonderkopplung.
- `skills/prism/server/worker.ts`: native-only startup; dauerhafter Ownership-/Journalrecovery vor HTTPadmission. Kein umschaltbarer fertiger Jobadapter gefunden.
- `native-worker-execution.ts` verwendet den vorhandenen Ressourcenvertrag/Ownershippfad; `native-resource-pool.ts` prüft `memory.max`, `memory.swap.max`, `pids.max`, `cpu.max`, Beobachtung und `cgroup.kill`. Diese Schutzwirkung nicht durch erfolgreiche Jobcreateantworten ersetzen.
- `remote-prepared-execution.ts`: Parentcapabilities und Runner ohne nativen Runtimeparameter. Job pro vollständigem Plan kann die lokale Arbeit gemeinsam erfassen, braucht aber neuen Entrypoint, Input-/Outputtransport und klare Control-/Ausführungsgrenzen.
- `runner-fixtures.ts`: direkte Providerinstanzen, Bereitschaft/Retention und Cleanup in umgekehrter Reihenfolge. Gemeinsamer Plancontainer vermeidet zunächst die Umwandlung dieser Beziehungen in verteilte Endpunkte. Fällt er aus, bleibt Setupreceipt kein aktueller Readinessbeleg.
- D13/D14/D16 und B1–B5 gegen den Vorschlag gelesen. D16 müsste ausdrücklich ersetzt werden. D13 Taskeinheit und historische Prozessreceiptlesbarkeit bleiben; neue Granularität/Limitsemantik brauchen Versionierung. D14/B4/B5 readiness/cleanup/keine frühe Freigabe bleiben neben eventuell geänderter Restartstrategie erhalten.

## Offizielle Quellen und deren Aussagegrenze

Die einschlägigen offiziellen Seiten wurden unabhängig geöffnet und passende Absätze geprüft:

- [Kubernetes Jobs](https://kubernetes.io/docs/concepts/workloads/controllers/job/): Doppelausführung trotz Parallelität/Completion eins und Never wird ausdrücklich beschrieben. Backoff null reduziert Retries, garantiert keine Exactly-once-Effekte. Jobfristen sind kein verlässlicher physischer Stopbeweis bei unerreichbarem Node.
- [PID-Limits und Reservierungen](https://kubernetes.io/docs/concepts/policy/pid-limiting/): Kubeleteinstellung statt frei pro Pod authored Ressourcenfeld; Gesamt-Node-/Daemonrisiko bleibt; Eviction beobachtet periodisch.
- [Containerressourcen](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/): CPU wird gedrosselt, Speicherlimitverletzung kann OOM auslösen. Requests planen Kapazität; keine identische kumulative CPU-Zeitsemantik.
- [Persistent Volumes](https://kubernetes.io/docs/concepts/storage/persistent-volumes/): Accessmodi und Nodebezug klären, RWO nicht als Single-Pod-Fencing lesen.

Die konsultierte aktuelle Dokumentation ist kein Nachweis der auf dem ausgewählten Host aktivierten Kubernetes-/Kubelet-/CRIfeatures. Der endgültige Vertrag muss die tatsächlich unterstützte Version und Nodeprofile binden.

## Recovery, Daten und BuildKit

Die Vorlage behandelt verlorene Createantworten, UID/Inputbindung, Controllerrestart, Claims, Deduplizierung und externe Reconciliation richtig. Ein Startupclaim oder abgelaufene Lease stoppt einen partitionierten Ausführer nicht. Nicht fencebare ungewisse externe Arbeit bleibt nach D08 blockiert. Erfolgsexit ersetzt keine übernommene Resultveröffentlichung; disabled TTL schützt allein weder evictete Podlogs noch verlorenes lokales Storage. Dauerhafte Übernahme muss beim echten Abschluss und unter Upload-/Quota-/Crashfehlern geprüft sein.

BuildKit separat zu lassen ist notwendig. Kurzlebiger BuildKit-Pod kann ein brauchbarer Ansatz sein; normaler Container oder rootless allein schließt IFR10 nicht. Prozesssandbox, private Credentials/Caches, Egress, Parallelität, Backgroundcleanup und regulärer Build/Push/Pull brauchen echten Runtimebeleg. Der zusätzliche Pod verbraucht eigene CPU/RAM/PIDs/Storage; Planbudget allein erfasst ihn nicht.

## Grenzen

Keine Job-/Image-/Browser-/DB-/Kernel-/Task-/Fencing-/Storage-/Partitionsversuche ausgeführt; kein Prototyp erstellt. Nicht jede indirekte Capability-/Trust-/Storageconsumerkomposition vollständig verfolgt. Hashvergleich und Codeprüfung stützen die Architekturentscheidungsvorlage, keine Austauschbarkeit oder Implementierungsabnahme. Aufwand wird relativ als groß beurteilt; keine belastbare Zeit-/Kosten-/Latenzschätzung. Die Hinweise wurden dem Hauptagenten vor Abschluss übermittelt.

## Abschließende Prüfung der korrigierten Vorlage

Die ergänzte Fassung nochmals gelesen. Sie nennt jetzt alle **fünf** Vertragsänderungen ausdrücklich, verlangt aggregierten Node-/Podtaskschutz ohne behauptete automatische Scheduler-PIDreservierung, beschreibt die innere Buster-Credentialgrenze mit Broker/bestehender Sandbox/Sidecar und nennt deren getrennte Mount-/Identitäts-/RPCprüfung. Alle lokalen Container gehören zum Planbudget; unterschiedliche Memory-Peaks werden nicht als beobachteter gemeinsamer Podpeak ausgegeben. RWO und zusätzliche Chartreplikrestriktion sind nun ausdrücklich unterschieden.

Damit sind die konkreten Hinweise dieser Gegenprüfung aufgenommen. **Keine weitere konkrete Korrektur erforderlich.** Die Empfehlung ist plausibel und als Entscheidungsvorlage ausreichend ehrlich abgegrenzt. Sie bleibt eine Architekturpräferenz mit bewusst veränderten Garantien, keine Umsetzungserlaubnis und kein Beweis eines funktionsfähigen Jobadapters. Insbesondere reale Node-/PID-/CPU-/Memorydurchsetzung, Podpartitionfencing, sichere Capabilitycredentials, Storage-/Artefaktübernahme und BuildKitprozesssandbox sind erst durch spätere freigegebene Implementierung und Wirkungstests zu belegen.
