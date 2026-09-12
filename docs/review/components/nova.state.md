# nova.state — Journal und registrierungsgebundener Zustand

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

Vollständig gelesen: `skills/nova/core/state/journal.ts`, `file-mutex.ts`,
`plugins.ts`, `README.md`. Tests: Journal-/Plugin-State-Abschnitte von
`check-plugin-system-v2-phase7.mjs`, kompletter `check-nova-journal-scale.mts`,
`tests/verification/reliability/lifecycle.test.mts`. Schnittstellenkonsumenten nachgeprüft: FileEffectJournal, Runner/StageExecutor,
ArtifactCheckpointRecorder, Observer-Delivery, Audit und Reconciler-Einstieg.
Die vollständigen fachlichen Reviews dieser Konsumenten bleiben eigene Inventarpunkte.

## 1–3. Verantwortung, Schnittstellen und Persistenz

FileJournal ist die gemeinsame JSONL-Hashkette für Nova-Ereignisse und weitere
Journale. `append`, `appendSequenced`, `transact`, `records`, `refresh`;
PluginStateJournal ergänzt Schema-, Namespace- und Provenienzprüfung sowie
Idempotenzkonflikte und Projektion. `effects/journal.ts` konsumiert FileJournal;
Lifecycle/Observer/DecisionRecorder-Tests nutzen denselben Originalcode.

Append schreibt vollständig mit write-Schleife und fsync. Replay prüft Sequenz,
Vorgängerhash und Hash des Eintrags. Ein unvollständiger letzter Datensatz wird
unter Mutex auf den letzten Newline gekürzt und fsynced. Gleich große geänderte
Dateien werden bei mtime/ctime-Änderung erneut geprüft; divergente/verkürzte
bereits beobachtete Ketten werden abgelehnt. `records()` ist nur Cache,
`refresh()` synchronisiert. Hashketten authentifizieren keinen böswilligen
Schreiber mit Zugriff auf den gesamten Speicher.

## 4–7. Fehler, Parallelität, Recovery und Vertrauen

FileMutex erzeugt vollständige Besitzer-Metadaten in einer temporären Datei und
beansprucht den Lock über Hardlink. Live-PIDs blockieren; tote/ungültige Besitzer
werden wegbenannt. Siehe PCR-STATE-002 für das verbleibende Reclamation-Rennen.
Timeout ist synchrones Polling mit Atomics.wait, blockiert also den Event-Loop.
Kein AbortSignal; `transact` ist ein synchroner Vertrag, keine asynchrone
Transaktion. Eine Ausnahme nach bereits erfolgtem Append rollt dieses nicht zurück.

PluginStateJournal bindet jeden Record an exakte Registrierungsprovenienz;
Idempotenzkonflikt vergleicht Payload, Typ, Attempt und Schema-Version. Vor Replay
und erneutem Append wird validiert. Die Payload-Referenzen werden aber nicht
isoliert, siehe PCR-STATE-001. Betrieb setzt geschützte Verzeichnisse, exklusiv
passenden PID-Namensraum, verlässliche Hardlinks und fsync voraus. PID-Reuse oder
geteiltes Volume zwischen PID-Namensräumen ist nicht durch die Mutex-Metadaten
abgedeckt; als Betriebsannahme und spätere Infrastrukturfolgeprüfung festhalten.

## 8–9. Ressourcen und Architektur

Journal liest auf Neustart die ganze Datei, speichert alle Records und erstellt
bei Transaktion ein neues Array. Keine Größen-/Record-Obergrenze, keine Rotation
oder Kompaktierung in dieser Klasse. Zustandsprojektion prüft alle Einträge.
16-MiB-Test bestätigt schnelle inkrementelle Appends, keine langfristige
Speicher-/Retention-Garantie. Zwei Persistenzmechanismen existieren:
FileJournal/PID-Mutex und Foundation-JSON-Snapshot/flock. Vereinheitlichung
an einer crash-sicheren Speichergrenze prüfen, ohne alte Formate per Shim zu erhalten.

## 10–11. Nachweise und Dokumentation

Bestanden: 16-MiB-Journal-Scale, Lifecycle-Repair- und SIGKILL-Wait-Test.
Protokoll in `../evidence/foundation-tests.txt`. Phase7-Journal-/State-Testcode
untersucht; kompletter Programmlauf ebenfalls bestanden (`../evidence/phase7.txt`). SIGKILL beweist keinen
Host-Stromverlust. FileJournal fsynct die Datei, aber nicht das Verzeichnis bei
Neuanlage (`journal.ts:32–35,151–161`): Host-Crash-Dauerhaftigkeit bleibt offen.

README beschreibt Konkurrenzschutz und deterministische Projektionen ohne diese
Grenzen. Status: unvollständig; mutable Cache-Grenze und zulässige Dateisystem-/
PID-Topologie müssen dokumentiert werden. Historischer Reliability-Bericht:
inkrementelle Wiederaufnahme/unterbrochenes Tail sind im Code vorhanden; dessen
weitergehende Parallelitätsaussagen sind wegen PCR-STATE-002 nicht vollständig geschlossen.

## 12. Befunde

### PCR-STATE-001 — Journal-Cache enthält fremd veränderbare Payloads

- Schweregrad: mittel; ein akzeptierter Journalwert kann im laufenden Prozess von
  seinem persistierten Wert abweichen. Auswirkungen auf konkrete Pipeline-Entscheidungen
  noch verfolgen, daher keine Behauptung eines nachgewiesenen falschen Gates.
- Evidenzklasse: nachgewiesener Defekt an der Speichergrenze.
- Belege: `journal.ts:141–170` friert nur äußeren Record ein und hält `entry`;
  `:196–204` gibt dieselben verschachtelten Objekte zurück. `plugins.ts` übernimmt
  ebenfalls Input-Payload/Registrierung und gibt Einträge direkt zurück.
- Ablauf: Objekt mit `decision: approved` appendieren, danach Original-Payload
  auf `rejected` ändern; `refresh()` meldet rejected, neues Journal meldet approved.
  Auch Mutation über `records()[0].entry` bleibt im Cache erhalten.
- Auswirkung: laufende Projektion und Neustart-Replay können unterschiedliche Werte
  sehen, ohne Hashfehler beim unveränderten Dateistand auszulösen.
- Ursachenbehebung: JSON-Werte an Append-Grenze validieren, unabhängig kopieren und
  intern tief einfrieren; keine veränderbaren internen Referenzen an Leser geben.
- Echter Nachweis: `node docs/review/evidence/journal-mutation.mjs` reproduziert beide
  Wege. Nach Reparatur muss derselbe Ablauf überall den ursprünglichen Wert liefern
  oder Mutationen ausdrücklich ablehnen. Plugin-State- und Event-Reducer mitprüfen.

### PCR-STATE-002 — Stale-Lock-Übernahme ist nicht an beobachteten Besitzer gebunden

- Schweregrad: hoch, falls parallele Reclaimer auftreten: Verletzung gegenseitigen
  Ausschlusses kann die zentrale Journal-Hashkette beschädigen und Recovery stoppen.
- Evidenzklasse: nachgewiesener Defekt. Zwölf echte Prozesse mit insgesamt
  1200 Lock-Aufrufen erzeugten 266 überlappende kritische Sektionen.
- Belege: `file-mutex.ts:17–21,40–43`: Besitzer lesen und später denselben Pfad
  unabhängig von Token/Inode wegbenennen. `:48–49` prüft erst beim Release den Token.
- Ablauf: A und B lesen alten toten Besitzer. A entfernt ihn und setzt einen neuen
  gültigen Lock. B entfernt auf Basis seines alten Reads jetzt A's Lock. B kann
  selbst claimen, während A in seiner kritischen Sektion arbeitet.
- Auswirkung: parallele kritische Sektionen; Sequenz-/Hashkonflikte oder verlorene
  Fortschritte. Der vorhandene Contention-Test hält nur einen lebenden Besitzer;
  er erzeugt keine konkurrierende Stale-Reclamation.
- Ursachenbehebung: verlässliche kernelgebundene Sperre mit Freigabe bei Prozessende
  oder anderer atomarer Besitzerwechsel; ein weiteres ungeschütztes Read vor Rename
  beseitigt das Rennen nicht.
- Verifikation: mehrere echte Prozesse nach SIGKILL eines Besitzers gleichzeitig
  starten; kritische Sektionen mit exklusiver Kontroll-Datei beobachten und Journal
  danach vollständig validieren. Keine Dateisystem-Mocks einsetzen.

## Nächste Schritte

Lock-Rennen mit `../evidence/mutex-contention.mjs` reproduziert; FileJournal-Konsumenten in context/effects/telemetry
auf Mutation und asynchrone Transaktionen verfolgen. Danach Abschlussstatus prüfen.
Foundation-Persistenz und state-store sind eigene Komponenten, keine Duplikatbefunde.

Reproduktionsbefehl für PCR-STATE-002: `node docs/review/evidence/mutex-contention.mjs`.
Original-FileMutex, echte Kindprozesse, exklusiv angelegte Kontroll-Datei.
266 Überlappungen sind eine konkrete Beobachtung, keine stabile Sollzahl.
Ein späterer Regressionstest muss bei denselben konkurrierenden Zugriffen null
Überlappungen verlangen. Der Kernfehler kann auch beim Übergang von einem gerade
freigegebenen Lock zu einem neuen Besitzer auftreten (`owner()` liefert dann
vorübergehend undefined). Die Messung isoliert nicht ausschließlich Stale-Reclamation.

Zusätzliche Nutzungsprüfung: `PluginStateJournal` wird im Produktionscode nur
exportiert, nicht instanziiert; direkte Instanziierungen liegen in Vertragstests.
Der aktive `state.append`-Pfad von blueprint-sync nutzt den separaten state-store.
Das macht FileJournal nicht obsolet: Effects und Lifecycle nutzen ihn tatsächlich.

## Abgeschlossener Gegenstellenabgleich

`FileEffectJournal` übernimmt Request/Receipt in seine Maps und gibt diese
Referenzen zurück (`effects/journal.ts:108–150,215–229`): dort existiert dieselbe
Ownership-Grenze; PCR-STATE-001 bleibt zentral hier geführt. `runner.ts:56–59`
appendiert Lifecycle-Payloads ohne Kopie. `stage-executor.ts:90–94` tut dies für
Plugin-Domain-Events. `telemetry/observer-delivery.ts:18–28` übergibt `record.entry`
als Event an den Observer, also eine konkrete nachgelagerte mutable Referenz.
Dagegen kopiert ArtifactCheckpointRecorder Artefakte beim Aufnehmen/Lesen; Audit
erzeugt eine neue redigierte Projektion. Reconciler liest vor der Entscheidung
mit refresh. Das belegt betroffene Aufrufgrenzen, keinen manipulierten Live-Run.

Keiner der untersuchten direkten Transaktionsaufrufer nutzt einen async-Callback.
Synchronität ist für FileMutex Voraussetzung und im Review-Schema festgehalten.
Die weiteren Auswirkungen sind Gegenstand der Effects-/Observer-/Core-Reviews.
