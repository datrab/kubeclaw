# Unabhängige Gegenprüfung der Abnahmekriterien

Stand: 2026-09-20. Unabhängiger Subagentreview der ursprünglichen Fassung von
`acceptance-20260920.md` und `assessment-20260920.md` gegen die Originaltexte aller
13 offenen Findings in `register.json`, D01–D16, Roadmap und aktuelle Quellpfade.
Dies ist eine Dokument-/Quellprüfung, keine ausgeführte Runtime- oder Live-Abnahme.
Der Hauptagent ergänzt parallel globale Nachweisregeln und korrigiert Kriterien;
die folgenden Befunde beschreiben die geprüfte ursprüngliche Fassung.

## Ergebnis

Die Triage ist im geprüften Umfang plausibel. Die 13 Restfindings sind vollständig
vertreten; GitOps ist zutreffend als lokal geschlossen mit separater Live-Abnahme
geführt. D12 wird nicht durch eine neue universelle Produktionspflicht ersetzt.
Die Kriterien sind jedoch noch nicht gegen jeden plausiblen falschen Pass geschützt.
Insbesondere müssen folgende sechs fachliche Lücken geschlossen werden. Absolute
Unmöglichkeit absichtlicher Täuschung lässt sich durch Kriterien allein nicht beweisen;
entscheidend bleiben prüfbare Rohbelege und unabhängige Gegenprüfung.

## A1 — Hoch: Recovery-Cleanup darf nicht ausschließlich konservativ ablehnen

**Betroffen:** W2/W3, PCR-BUSTER-ENGINE-004.

**Beleg:** `skills/buster/engine/test-gates/remote-plan-service.ts:587` (`recover`)
setzt unterbrochene Jobs terminal, behält aber alle alten Workspaceinputs mangels
Quieszenznachweis. Genau dies ist laut Register noch offene Implementierung.

**Falscher Pass:** Jede Restartprüfung liefert „Besitz ungewiss, Dateien behalten“
mit Diagnose. W2 erfüllt seine negativen Bedingungen; W3 weist Platzfreigabe nur
für Jobs ohne Neustart nach. Das ursprüngliche Recoveryproblem bleibt vollständig.

**Korrektur:** Positive Recoveryfälle verpflichtend: bei wiedergefundenem eindeutigem
Besitz aktive Restarbeit kontrolliert beenden/übernehmen, Quieszenz tatsächlich
nachweisen und danach temporäre Quellen freigeben. Bei bereits quieszenten eindeutig
eigenen Jobs ebenso. Wiederholte Crash-/Recover-/Cleanupzyklen müssen innerhalb
vorab bestimmter Grenzen messbar Platz zurückgeben. Unsichere fremde Fälle bleiben
als separate Negativmatrix erhalten. Keine Löschung nur aus Terminalstatus.

## A2 — Hoch: Restore darf sich seine Referenzmenge nicht selbst auswählen

**Betroffen:** Q1/Q3, IFR-26-001.

**Beleg:** Originalfinding verlangt referenzierte Digests sowie Session-/Job-
Wiederaufnahme. `charts/prism/files/prism-backup.sh` hat mit `database_proof` nur
SQLrestore und drei Tabellenzählungen; dies ist ausdrücklich ein Smoke-Test.

**Falscher Pass:** Restore einer kleinen ausgesuchten Teilmenge, Lesen einer
Designreferenz und Start eines neuen Jobs erfüllt „sämtliche geprüften Referenzen“
und „vorgesehenen Prism-/Pipelinepfad“, während alte Sessions oder weitere
Referenzklassen unbrauchbar bleiben. Die Formulierung definiert die Vollständigkeit
durch das, was der Prüfer freiwillig auswählt.

**Korrektur:** Erwarteten Referenzbestand aus autoritativer DB/Journals am
Sicherungspunkt unabhängig enumerieren, sämtliche zugehörigen Referenzklassen und
Digests wiederauflösen und Fehl-/Extramengen erklären. Definierte echte Daten mit
abgeschlossenen, wartenden, laufenden und extern ungewissen Jobs/Sessions verwenden;
ihre jeweils erlaubte Fortsetzung bzw. explizite Blockierung nach Restore prüfen.
Neue Arbeit allein ersetzt die Wiederaufnahme vorhandener Arbeit nicht.

## A3 — Mittel: Backup-Retention aus dem Originalumfang fehlt ausdrücklich

**Betroffen:** Q1–Q3, R1–R4; IFR-26-001.

**Beleg:** Originalfinding nennt „überprüfte Retention“. Backupscript begrenzt
`BACKUP_MAXIMUM_RETAINED_BYTES` und behält unvollständige Gruppen; seine CLI bietet
`backup`, `verify`, `database-proof`, keinen Freigabepfad.

**Falscher Pass:** Eine erfolgreiche Wiederherstellung plus korrektes Stoppen bei
voller Quote schließt Q1–Q3. Der nächste Backupzyklus bleibt auf Dauer blockiert.
Die allgemeine Storeinventur unter R lässt offen, ob lokale/externe Backupgruppen
und zurückgebliebene unvollständige Gruppen überhaupt dazugehören.

**Korrektur:** Explizite Zuordnung der Backupgruppen und unvollständigen Gruppen zu
R oder ein eigenes Q-Kriterium: begründete Aufbewahrungs-/Freigabepolicy, sichere
manuelle Auswahl, Schutz benötigter Wiederherstellungspunkte, Crash-/Quotenfall,
nachgewiesene Platzfreigabe und danach neues erfolgreiches Backup plus Restore.
Keine automatische Loglöschung oder neue zugesicherte Backupgarantie ableiten.

## A4 — Mittel: BuildKit-Prozesssicht ist nicht explizit abgedeckt

**Betroffen:** K1/K2, IFR-10-001.

**Beleg:** Originalfinding verlangt negative Tests unerlaubter Prozesssicht,
Signale und Cross-Job-Zugriffe. `docker/buster-runtime-entrypoint.sh:28` startet
weiter mit Hostnetz; Zeile 33 deaktiviert die Prozesssandbox.

**Falscher Pass:** Signal-/ptraceversuche werden durch UIDrechte blockiert; trotzdem
kann ein Build fremde Prozessinformationen sehen. K2 nennt Lesen von privaten
Dateien, Caches und Credentials, nicht die original geforderte Prozesssicht.

**Korrektur:** Erlaubte Prozesssicht definieren und im echten Dockerfile-RUN
fremde Build-/Daemon-/Supervisorprozesse und deren `/proc`-Informationen explizit
negativ prüfen. Der Kontrollfall muss die eigene Prozesshierarchie sehen und
funktionieren. Nicht aus `kill`-Fehlern auf eine vorhandene Prozessgrenze schließen.

## A5 — Mittel: Fixture-Lebensdauer braucht fachliche Abhängigkeitstests

**Betroffen:** B3/B4, D14.

**Beleg:** D14 legt Buster als Eigentümer von Abhängigkeiten, Bereitschaft und
Cleanupabschluss fest. Der Runner verwaltet `#retainedFixtures` und
`#cleanupFixtures`; Bereitschaft und Cleanup sind unterschiedliche Zeitpunkte.

**Falscher Pass:** Eine isolierte Fixture besitzt Ressourcen/Receipts und übersteht
Restart, aber ein abhängiger Node startet vor Bereitschaft oder die Fixture wird
beim Ende ihres Setupattempts vorzeitig beendet. B4 fordert dauerhafte Lebensdauer,
aber keine explizite Beobachtung der tatsächlichen abhängigen Consumer.

**Korrektur:** Reale abhängige Nodes vor/nach Bereitschaft, Setupfehler, Cancel,
Restart und Cleanupfehler prüfen. Kein Consumer vor Bereitschaft; Besitz/Budget
bleiben bis bestätigtem Abschluss gebunden. Cleanupabschluss darf nicht aus
Setupresultat entstehen. B3 präzisieren: keine unzugeordnete Restarbeit, während
zulässig retained Fixtures ihre eigene gebundene Lebensdauer behalten. Prism
behält nach D14 ausdrücklich die normale Attemptlebensdauer.

## A6 — Mittel: Ressourcenvertrag muss D16 für beide Rollen ausdrücklich binden

**Betroffen:** B1–B4, D1, F6 und jeweilige Live-Gates.

**Beleg:** D16 legt feste hostverwaltete, tatsächlich schedulerwirksame
Rollenreservierungen für Buster **und Prism** fest. Das aktuelle
`scripts/native-worker-node-capacity.mjs:59` prüft Node-Allocatable gegen
Reservierungen und beschränkt seinen Bericht auf CPU/RAM/Tasks.

**Falscher Pass:** Buster wird in eine beliebige Cgroup integriert, beide Rollen
erscheinen in einem Budgetinventar, und eine geringe Gesamtlast überschreitet die
Kapazität nicht. Damit sind B/D/F oberflächlich erfüllt, obwohl Prism keine eigene
feste native Rollenbindung nutzt oder Kubernetes dieselbe Kapazität noch vergeben
könnte. Ein Budgetpapier oder Nichtauftreten von Überlast beweist keinen Ausschluss.

**Korrektur:** D16 als explizite Implementierungsinvariante nennen: beide Rollen,
feste native Pools, tatsächlich konfigurierte Reservierung, vollständige
Admission bei parallelen Attempts/Fixtures und fail-closed Aktivierung ohne
Voraussetzungen. Lokale Originalprüfungen müssen deren Verdrahtung und negative
Konfigurationen erfassen; Live separat tatsächliche Scheduler-/Nodewirkung unter
konkurrierender Podlast. Keine neue Livepflicht für den lokalen D12-Abschluss.

## Ohne zusätzlichen fachlichen Beanstandungsbedarf

IFR-21-001, IFR-29-001, IFR-04-001, IFR-01-001, IFR-02-001, IFR-06-001,
IFR-16-001 außerhalb A6, IFR-28-001, GitOps und CONFIG haben ihren Original-
bzw. bestätigten Roadmapscope erkennbar erhalten. Die neue Clustererzeugung bleibt
nach Roadmap ein späterer expliziter Pfad; „Fresh setup“ darf nicht stillschweigend
als bereits genehmigter vollständiger K3s-Neuinstaller umgedeutet werden.
CONFIGs Inventar/Produktionsconsumer/Driftpflicht ist passend; globale vollständige
Fallzuordnung muss verhindern, dass nur angenehme Settings ausgewählt werden.
Bei I1 müssen die bereits ursprünglich erfassten Opsimages im Imageinventar
enthalten bleiben; eine reine Auswahl Buster/Prism wäre unvollständig.

Globale Nachweisfragen (unveränderliche Fallmatrix, echte Negativkontrollen,
Source-/Dirty-Patchbindung, keine Skips als Pass, keine selbstangepassten Grenzen,
Statusregeln) werden vom Hauptagenten separat ergänzt. REGISTER muss diese
Regeln fachlich prüfen, nicht nur Existenz beliebiger Beleglinks; ein Link auf
ein Fixtureprotokoll ist kein bestandener Originaltest.

## Prüfgrenzen

Gelesen wurden die Originalfindingtexte aller 13 Restpunkte, vollständige
Entscheidungen/Roadmap/Assessment/Acceptance sowie gezielt Recovery und Messpfade
in Buster, Backupscript, Retentionrunbook, Runtime-Dockerfiles, BuildKitentrypoint
und Nodekapazitätsprüfer. Keine vollständige Neuprüfung der 141 lokal geschlossenen
Findings; keine vollständigen Imagebuilds, echten Backuprestore-, Cgroup- oder
Clusterexperimente. Die Befunde zeigen mögliche falsche Abnahmen, keine neu
reproduzierten Produktionsvorfälle.

## Gegenprüfung der korrigierten Fassung

Die vom Hauptagenten korrigierte Datei wurde nach den Änderungen erneut gelesen.
Geprüfter Dateistand von `acceptance-20260920.md`:

```text
sha256:e943ee51dc20a353de35cc78e36fb26f40c9f108f0ada133fe93752fb9fcf9e9
```

| Reviewbefund | Korrektur | Ergebnis der Dokumentgegenprüfung |
| --- | --- | --- |
| A1 Recovery-Cleanup | W4 mit endlicher begründeter Frist, Crashzyklen und noch lebenden eindeutig eigenen Orphans | Geforderten positiven Freigabenachweis ergänzt; pauschales Retain reicht nicht mehr. |
| A2 Restoreteilmenge | Q3 vollständiges unabhängiges Referenzinventar und abgeschlossene/wartende/laufende/extern ungewisse Sessions/Jobs | Selbst gewählte Teilmenge und ausschließlich neuer Job ausdrücklich ausgeschlossen. |
| A3 Backupretention | Q4 einschließlich unvollständiger Gruppen, Crash bei Freigabe und echtem Restore des anschließenden Backups | Ursprüngliche Retentionanforderung ausdrücklich wieder enthalten. |
| A4 Prozesssicht | K2 reale Prozesssichtprüfungen, zusammen mit A3 echter Grenzerreichung und Positivkontrolle | Signalfehler allein belegen die Isolation nicht mehr. |
| A5 Fixturelebensdauer | B3–B5 inklusive echter abhängiger Consumer und Prismabgrenzung | Setup-, Bereitschafts- und Cleanupzustände getrennt; vorzeitiger Consumerstart bzw. Fixtureabschluss ausdrücklich ausgeschlossen. |
| A6 D16 Rollenreservierung | D1 beide feste native Rollenpools und fail-closed Originalpfade; Live tatsächliche Scheduler-/Nodebeobachtung | Inventar und geringe Last allein genügen nicht mehr. |

Zusätzlich geprüft: W5 nimmt eingebettete Sourcearchive und den gesamten runtimeRoot
auf, verlangt aber keine Neuerfindung der vorhandenen `compactCompletedArchive`-
Implementierung (`remote-plan-service.ts:262`). K1 übernimmt die kurzlebige
Sicherheits-/Prozessgrenze samt Abtrennung langlebiger Steuer-/Credentialprozesse
aus dem Originalfinding. I1 schließt die ursprünglichen Opsimages ausdrücklich ein.
Die globalen A1–A8 der Acceptance-Datei (nicht identisch mit den Reviewbefundnummern
oben) schließen Fallauswahl, Fixtureersatz, Skips, angepasste Sollwerte und bloße
Status-/Beleglinkbehauptungen als Abschlussnachweis aus.

**Reviewurteil:** Die sechs hier konkret beschriebenen fachlichen Schlupflöcher
sind in diesem Dateistand auf Kriterienebene geschlossen. In der Gegenprüfung
wurde kein weiterer konkreter fachlicher Blocker gefunden. D12 bleibt erhalten:
ausreichender lokaler Implementierungsnachweis und ausstehende Live-Abnahme sind
getrennte Zustände. Dies ist weder eine Garantie gegen absichtliche Fälschung
noch ein Nachweis bereits bestandener Runtimeprüfungen. Die vollständige
Pflichtfallmatrix, echte Testbelege und unabhängige Prüfung ihrer Wirkung müssen
erst bei der später autorisierten Umsetzung entstehen. Änderungen an der Datei
nach dem oben genannten Digest sind von diesem Urteil nicht erfasst.

Die Registerzählung wurde zusätzlich unabhängig erneut berechnet: 154 eindeutige
IDs, 141 verifiziert, drei in Bearbeitung, zwei implementiert und acht offen;
damit weiterhin 13 unvollständige historische Findings.

## Nachtrag des Hauptagenten: Dokumentationspflicht

Nach dem unabhängigen Review wurde auf ausdrücklichen Nutzerwunsch eine gemeinsame
Dokumentationspflicht und je ein DOC-Abschlusskriterium für alle 16 Punkte ergänzt.
Notwendige Dokuaktualisierung ist verpflichtend; eine Nichtänderung benötigt
benannte geprüfte Dokumente und eine konkrete Begründung. Der oben attestierte
Digest bezeichnet weiterhin ausschließlich die damalige Subagent-Prüffassung.
Diese nachträgliche Ergänzung wurde nicht erneut vom Subagenten geprüft.
