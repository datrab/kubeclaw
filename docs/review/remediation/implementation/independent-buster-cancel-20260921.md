# Unabhängige Nachprüfung: früher Buster-Cancel (RC05)

Stand: 2026-09-21. Frischer Reviewer ohne Beteiligung an der Implementierung.
Dies ist die begrenzte Nachprüfung zum Buster-Teil von
[R-C2](independent-config-review-20260920.md), keine Gesamtfreigabe des
Buster-Native-Cutovers oder der zentralen Konfiguration.

## Ergebnis und Grenzen

Der konkret nachgewiesene Fehlermechanismus „Cancel ist bereits eingetreten,
aber Archivarbeit und Executor starten trotzdem“ ist am aktuellen Stand
behoben und unabhängig bestätigt. Es gibt für diesen Mechanismus keinen
weiteren Befund. Die gesamte vorhandene Remoteplan-Vertragssuite läuft auch
in meiner eigenen Wiederholung erfolgreich durch: ein ausführbares Testmodul,
null Fehler, null Skips, circa 21 Sekunden. Die Zahl eins bezeichnet das
Testmodul, nicht eine Behauptung über die Zahl seiner internen Assertions.

Die Ursache des ursprünglichen historischen `BUSTER_REMOTE_SHUTDOWN_TIMEOUT`
ist dadurch weiterhin nicht eindeutig bewiesen. Der damalige Lauf hatte keine
Stageinstrumentierung. R-C2 ist hinsichtlich des reproduzierten Früh-Cancel-
Mechanismus und der unabhängigen Wiederholung erledigt; die historische
Ursachenzuordnung bleibt ausdrücklich unbelegt. Dieser Bericht erklärt weder
alle denkbaren Shutdown-Rennen noch B1/W1 oder andere native Abnahmekriterien
für abgeschlossen.

## Eigene Quellprüfung

`remote-plan-service.ts` prüft das initiale Abortsignal vor jedem Tarspawn
und nochmals nach der asynchronen Extraktion vor Capability-/Executorstart.
Zwischen letzter Prüfung und Executoraufruf gibt es kein weiteres `await`.
Die Fehlerbehandlung persistiert für das abgebrochene Signal den terminalen
Cancelstatus. Es wurde kein alternativer Legacy-Startpfad oder ein Fallback
für bereits abgebrochene Arbeit eingeführt.

RC05 ruft zuerst die originale dauerhafte `running`-Transition und danach
`service.cancel` auf. Der Hook kontrolliert die Reihenfolge, ersetzt aber
weder Store noch Cancelimplementierung. Die Assertion verlangt null
Executorstarts und den dauerhaften Status `cancelled`. Der Startzähler wird
am Anfang des injizierten Executors erhöht, noch vor dessen eigener
Abortprüfung. Der Früh-Cancel-Job verwendet außerdem nicht den speziellen
wartenden `cancel`-Fixturezweig. Ein nachträglicher Fixture-Abort kann somit
einen unerlaubten Produktionsstart nicht verdecken. Positive Fälle lesen
weiter den Inhalt des tatsächlich extrahierten Archivs.

Die separate Late-Submit-Korrektur wartet auf die tatsächliche HTTP-202-
Antwort. Sie erhöht weder die 600-ms-Dispatchdeadline noch die 300-ms-
Cleanupfrist. Der zusätzliche, begrenzte Annahmewait prüft die Zustellung der
absichtlich verspäteten Anfrage; Fehler und fehlende Annahme bleiben Fehler.
Die [Implementierungsdokumentation](buster-early-cancel-20260920.md) trennt
Produktionsfix, Fixturekorrekturen und unbewiesene historische Ursache
zutreffend. Ihr damaliger Hinweis auf ausstehende unabhängige Wiederholung
wird für diesen begrenzten Umfang durch diesen Bericht ergänzt.

## Nachweise und Herkunft

- **Eigener Lauf:** [vollständige Ausgabe samt Aufruf](../../evidence/independent-config-final-20260921/fresh-final-buster.txt),
  Exit 0; tatsächliches GNU tar und util-linux flock über proot-Dateibinds,
  keine simulierten Shellprogramme und keine Root-/Cgroup-Behauptung.
- **Eigene Identitätsprüfung:** [SHA256 der fünf geprüften Dateien](../../evidence/independent-config-final-20260921/fresh-final-buster-identities.json).
  Alle stimmen exakt mit den
  [Identitäten des vorherigen Reviewers](../../evidence/independent-config-final-20260921/reviewer-buster-restored-identities.json)
  überein.
- **Vorheriger unabhängiger Reviewer, nicht mein eigener Mutantenlauf:**
  [Positivlauf](../../evidence/independent-config-final-20260921/reviewer-buster-restored.txt)
  mit Exit 0 und
  [Negativkontrolle](../../evidence/independent-config-final-20260921/reviewer-buster-early-abort-mutant.txt)
  mit Exit 1, genau an „Executorstarts 1 statt 0“. Ich habe den gespeicherten
  Mutanten gegen den aktuellen Produktionscode verglichen: Die einzigen
  Änderungen entfernen die beiden initialen Abortprüfungen. Die reparierte
  Testfixture bleibt dabei erhalten. Das stützt die Aussage, dass RC05 den
  Produktionsfehler erkennt und nicht nur seine eigene Fixture bestätigt.

Die Suite injiziert einen Testexecutor. Sie beweist damit Serviceablauf,
Archivextraktion, persistente Zustände und die beobachteten HTTP-Verträge;
sie beweist keine echten Providerprozesse, Cgroup-Quieszenz, retained Fixtures,
BuildKit-Verfügbarkeit oder Live-Recovery. Die protokollierten absichtlichen
fehlenden BuildKit-Probes sind Negativfälle dieser Suite und kein positiver
BuildKit-Nachweis. Kein Registerstatus wurde durch diese Nachprüfung erhöht.
