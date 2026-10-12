# CONFIG: gemeinsames Prism-Eingabelimit

Vor Umsetzung am 2026-09-21 festgelegter Prüfumfang: genau ein zusätzliches
Operatorsetting, keine Änderung an Task-/CPU-/Memorypolicy oder D16.

Autorenquelle: `charts/kubeclaw/files/config/swarm.config.json`,
`operator.prism.worker.maximumInputBytes`; expliziter Anfangswert 16777216 Bytes,
Integer 1…2147483647, ohne Runtimefallback. Consumer sind HTTP-Empfang,
nativer Attemptjournal, Prozess-Eingabebudget und nativer Hoststdin. Supervisor
und HTTP müssen denselben einmal geladenen Snapshot verwenden. Der Child erhält
nur den daraus erzeugten Transport `PRISM_NATIVE_ASSIGNED_INPUT_BYTES`; dieser
ist keine Operatorautorität. Der alte `PRISM_NATIVE_MAXIMUM_INPUT_BYTES` wird
abgewiesen. Das aktuelle Chart enthält bereits keinen Input-Override mehr;
`worker.native.maximumInputBytes` und `native.maximumInputBytes` werden explizit
als veraltete Wiederintroduktion abgewiesen.

| Fall | Vorab festgelegte Prüfung |
|---|---|
| CI01 | Zwei explizite Autorenwerte erreichen Originalworkerloader; fehlend, String, null, negativ, Bruchzahl und >2147483647 scheitern. |
| CI02 | Alter Envkey und intern reservierter Childkey am Operatorloader scheitern auch bei gleichem Wert; alter Key am Child scheitert. |
| CI03 | Echte HTTP-Requests am Originalworker erreichen bei genau limitierter Bodygröße die Authentifizierung; ein Byte darüber wird vor Authentifizierung/Execution mit bestehendem HTTP422 abgewiesen. Höherer Autorenwert nimmt denselben Body an. Kein echter nativer Attempt wird dabei behauptet. |
| CI04 | Produktions-Commandbuilder erzeugt den begrenzten Childtransport; originaler Childloader liest ihn. Fremde Prozessenv darf ihn nicht überschreiben. Journal und Prozessbudget verwenden denselben Supervisorsnapshot. |
| CI05 | Reales Helmrender plus Originalruntime laden beide Autorenprofile, ungültige Werte und alte Helmkeys scheitern. Paket- und Imageprüfungen bleiben an tatsächliche Ausführung gebunden. |
| CI06 | Originale bestehende Worker-/Deploymenttests bleiben erhalten; gezielte Negativkontrolle muss wieder eingeführten Eingabefallback erkennen. |
| CI-DOC | Bedienungsdoku, Inventarschnitt und Migration/Fehler/Betriebswirkung aktualisieren; Nachweisgrenzen ausdrücklich dokumentieren. |

Status: Umsetzung/Prüfung offen. Frischer unabhängiger Review ist erforderlich.

## Umsetzungsstand und lokale Nachweise

Die sechs Workerwerte werden jetzt zusammen geladen. `runNativePrismWorker`
reicht genau diesen Snapshot an `nativePrismSupervisorConfig(config)`; auch der
native Testharness verwendet denselben Snapshot. Der Supervisor besitzt keinen
Inputenvreader oder Inputdefault mehr. `nativePrismExecution` verwendet seinen
Inputwert für Journal, Prozesslimit und den kleinen Produktionscommandbuilder.
Letzterer erzeugt ein geschlossenes Childenvironment mit dem umbenannten
Transport. Der unveränderte Hoststdinpfad liest ihn über den Originalhostloader.
Der alte Key scheitert bei Operator- und Childloader; der neue interne Key am
Operatorloader ebenfalls. Chart-Altkeys scheitern bereits am bestehenden strikten
`values.schema.json`, ohne zusätzliche alternative Templateautorität.

- [123 Tests](../../evidence/config-input-limit-20260921/tests.txt): gesamter
  vorhandener Loader-/Helmschnitt erweitert, plus vier neue echte HTTP-/
  Hostparsertests. Zwei Autorenwerte 64/128 Bytes ändern sowohl Ablehnung als
  Annahme desselben HTTPbodys. Der bestehende Fehlerstatus bleibt 422.
- [7 bestehende Verhaltensregressionen](../../evidence/config-input-limit-20260921/behavior-regression.txt):
  reale Admission, Socketgrenzen, unveränderte Node408-Prüfperiode und Shutdown
  gegen echte PG-Verbindungsversuche; null Skips.
- [Prism-Typecheck](../../evidence/config-input-limit-20260921/typecheck.txt) und
  [kanonischer Lint](../../evidence/config-input-limit-20260921/lint-canonical.txt)
  bestanden. Der zunächst ohne `--config` gestartete Lint scheiterte mangels
  Rootkonfiguration; [dieser Fehlversuch](../../evidence/config-input-limit-20260921/lint.txt)
  bleibt erhalten und wird nicht als Qualitätslauf gezählt.
- [Negativkontrolle](../../evidence/config-input-limit-20260921/mutation-result.json):
  temporäre Produktionsresolverkopie stellt den alten Default wieder her;
  alle vier unveränderten Eingabelimittests scheitern an fachlichen Assertions,
  darunter echte HTTPantworten. [Rohausgabe](../../evidence/config-input-limit-20260921/mutation.txt).
  Originaldateien werden dabei nicht verändert.
- Der [erste Testlauf](../../evidence/config-input-limit-20260921/tests-initial.txt)
  hatte 121 erfolgreiche und zwei fehlerhafte Tests: Testannahmen erwarteten eine
  neue Templatemeldung, während das vorhandene Chartschema beide Altkeys bereits
  früher ablehnte. Der redundante neue Templatecheck wurde entfernt und der Test
  prüft die reale Schemadiagnose. Es wurde kein Produktionsvalidator gelockert.

Der Hostparsernachweis startet den tatsächlichen Hostentrypoint als normalen
Nodekindprozess mit expliziter Parser-Testscope. Er prüft nur die Grenze vor
JSONparsing: übergroßes stdin scheitert mit `PRISM_NATIVE_INPUT_LIMIT`, genau
begrenztes ungültiges JSON erst am JSONparser. Es wird weder Launcher noch
Kernelisolation, Journalpersistenz oder nativer Attempt simuliert beziehungsweise
als getestet ausgegeben. Die Journal-/Prozessweitergabe ist produktiv verdrahtet
und quellengeprüft; vollständige native Ausführung bleibt dem separaten echten
Hostgate vorbehalten. Kein Dockerimage, Hostpool oder Cluster wurde ausgeführt.

CI-DOC: Aktualisiert wurden `docs/operations/operator-configuration.md`,
`docs/operations/prism-operator-guide.md`, die Foundation-Konfigurations-README
und der Inventarschnitt (MD/JSON, nur drei alte Inputfundstellen semantisch
aufgelöst). Frühere Reviewberichte behalten ihre historische Fünfsettingsgrenze.
Dieser Schnitt schließt weder F1–F6 noch den Gesamtbefund. Der anschließende
[frische unabhängige Review](independent-prism-input-review-20260921.md) bestätigt
die lokale Grenze mit eigenen Tests und einer fehlschlagenden Negativkontrolle.
