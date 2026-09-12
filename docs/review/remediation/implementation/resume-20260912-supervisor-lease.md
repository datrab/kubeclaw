# Fortsetzung 2026-09-12: Statusabgleich und Supervisor-Lease

Geprüfter main: `1ec7fed59f9f5915b2575e2b332f82605750ef85`, vollständiger
Tree `2750735ffb3afaea265c5af346d865d3d83a9d06`. Die lokale Ausgangskopie
besitzt exakt diesen Git-Tree. Keine weiteren Remote-Branches angelegt.
Die Änderung wird über `fix/remediation-foundations-20260909` als PR geführt.

## 39 ist der belegte Registerstand

Alle 154 eindeutigen JSON-Kennungen wurden gezählt und mit jeder Markdown-Zeile
verglichen: 94 verifiziert, 39 implementiert/unvollständig, 2 in Bearbeitung,
19 offen. Genau drei Markdown-Zeilen waren gegenüber dem JSON und den späteren
Abnahmen veraltet; die Kopfsumme 91/42 war entsprechend ebenfalls veraltet.

| ID | Spätere Abnahme | Abgrenzung |
| --- | --- | --- |
| PATH-T02-001 | [Control-Preference-Gegenprüfung](wave49-prism-control-independent-review.md), aufgelöster Source-Hold und 18/18 Originalfälle | Persistierte persönliche Präferenzen erreichen nach Wiederanlauf den gebundenen Agentinput; PATH-T02-002 und native Gesamtintegration bleiben separat offen |
| IFR-18-001 | [Gekoppelte Root-Abnahme](run6-coupled-root-review.md) | Echte alternative Controller-SA, Token/RBAC/VAP und Namespace-Admission; keine Aussage über ausgeführte Produktionsmigration |
| T01-F01 | [CLI-Abnahme](wave47-project-cli-independent-review.md), Root-Nachweis `docs/review/evidence/wave47-scaffold-root-integrated.txt` | Dokumentierter Scaffold-/Import-/Compile-/Ausführungseinstieg erreicht erstes Modul; vollständige Produktlieferung bleibt T01-F02 |

Die ursprünglichen Statuswerte im JSON werden nicht hochgestuft. Das ist eine
Konsistenzkorrektur der Markdown-Projektion, keine erneute vollständige
Ausführung aller 94 historischen Abnahmen auf dem zusammengeführten main.
Die 39 enthalten weiterhin sowohl Ursachenarbeit als auch fehlende native Gates.

## Ursachenfix im Supervisor

Die bisherige Lease-Akquisition las den Eigentümer und löschte danach die Datei
ohne gemeinsame Sperre. Zwei Starter konnten denselben alten Eigentümer lesen;
ein späterer Unlink konnte dann die bereits veröffentlichte Lease des anderen
Starters entfernen. Die Freigabe hatte denselben Abstand zwischen Eigentümerprüfung
und Unlink. Ein exklusives `open('wx')` allein schützt diese zusammengesetzte
Operation nicht.

Akquisition und Freigabe verwenden jetzt den bereits vorhandenen `FileMutex`:
Lesen, Eigentümerprüfung und atomare Ersetzung beziehungsweise Freigabe liegen
unter derselben Kernel-Dateisperre. Die vollständige neue Lease wird per Rename
veröffentlicht, ohne den vorherigen Datensatz zuerst zu löschen. Eine verspätete
Freigabe mit fremder Instanz-ID lässt den Nachfolger unverändert. `EPERM` bei
der Prozessprüfung bedeutet keine nachgewiesene Beendigung; nur `ESRCH` erlaubt
die Behandlung als nicht vorhanden, andere Fehler bleiben sichtbar.

Die Dateizustandsfunktionen sind in `scripts/lib/repository-review-supervisor-state.mjs`
zusammengefasst. Der Supervisor verwendet sie direkt; Core-/Enginearchitektur
und FileMutex-Implementierung bleiben unverändert. Keine Lintsuppressions oder
Grenzwerterhöhungen. Der erste Lintlauf deckte die überschrittene Dateilänge auf;
nach der Extraktion besteht derselbe kanonische Lint.

## Tatsächlich ausgeführte Nachweise

- Neuer Original-CLI-Test scheitert auf dem Ausgangscode: Er ersetzt die alte
  Lease trotz einer tatsächlich von einem anderen Prozess gehaltenen Dateisperre.
  Nach dem Fix verweigert er die Akquisition und bewahrt den alten Inhalt.
  Nach Freigabe startet dieselbe Original-CLI erfolgreich; die Lock-Inode bleibt.
- Ein echter Kindprozess erwirbt die Lease. Ein weiterer Zugriff wird abgelehnt.
  Nach SIGKILL und beobachtetem Exit wird der Eigentümer ersetzt. Eine verspätete
  Freigabe der alten Instanz darf die neue Lease nicht löschen.
- `npm run test:review-operations`: **20/20 bestanden**, keine Fehler/Skips,
  einschließlich Original-Pipelinestart, Statusfehlern, Startfehlern und
  SIGTERM-/SIGINT-Stopp in der Recoverypause.
- Kanonischer ESLint auf Supervisor, Zustandsmodul und geändertem Test: Exit 0.
- Alle 154 Markdown-Statuszellen entsprechen nun exakt dem JSON; Counts und
  eindeutige Kennungen stimmen überein. `git diff --check` besteht.

Ausgaben: [Vorher](../../evidence/resume-20260912-supervisor/lease-before.txt),
[Operations danach](../../evidence/resume-20260912-supervisor/operations-after.txt),
[Lint danach](../../evidence/resume-20260912-supervisor/lint-after.txt),
[Audit](../../evidence/resume-20260912-supervisor/audit.json).
Die Ausführung und Codeprüfung stammen aus dieser Session; es wird keine neue
unabhängige Subagent-Abnahme behauptet.

## Betriebsvertrag und verbleibende Arbeit

- Der vorhandene Linux-/`/usr/bin/flock`-Vertrag gilt nun auch für Supervisor-Leases.
  Die Datei `<lease>.lock` ist eine dauerhafte Sperr-Inode und darf im laufenden
  Betrieb nicht gelöscht werden. Nach einer Sekunde Sperrkonflikt wird
  `REVIEW_SUPERVISOR_LEASE_BUSY` sichtbar gemeldet; eine blockierte Freigabe
  hinterlässt den Eigentümerdatensatz zur späteren Prüfung.
- Vor dem Einsatz alte Supervisoren stoppen: Alte Writer nehmen diese Sperre
  nicht und dürfen nicht gleichzeitig dieselbe Lease verwalten. Keine automatische
  Übernahme unbekannter laufender Prozesse; keine Behauptung vollständiger
  Prozessbaumidentität oder Powerloss-Dauerhaftigkeit.
- Der originale native Adoptionstest wurde ausgeführt und scheitert unverändert
  an `REAL_PROC_PROCESS_CMDLINE_REQUIRED`: der echte Kindprozess ist hier nicht
  über `/proc/<pid>/cmdline` sichtbar. [Originalausgabe](../../evidence/resume-20260912-supervisor/native-adoption-blocked.txt).
  Kein Ersatzprozess-Register und keine geänderte Erfolgsassertion eingeführt.
- PostgreSQL-Abnahmen bleiben ebenfalls blockiert: UID-Mapping enthält nur UID 0,
  der tatsächliche `runuser -u nobody -- id` wird mit `Operation not permitted`
  abgewiesen. Keine Berechtigungsumgehung oder PostgreSQL-Ersatzabnahme.
- `PCR-SCAFFOLD-OPS-001` bleibt unvollständig: native Adoption bei Statusverlust,
  dauerhafte Gesamtprozessidentität und weitere I/O-Fehlerpfade sind offen.
  Der Stand bleibt **94/39/2/19**. Keine Deployments oder externen Agentläufe.
