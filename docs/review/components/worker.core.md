# worker.core — neutraler Versuchsexecutor und lokale Worker-Lifecycle

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1. Verantwortung, Grenzen und Verwendung

Vollständig untersucht: `skills/worker/core/worker/{attempt-executor,local-runtime,
trust,digest}.ts`, `src/index.ts`, Package-/Boundary-Dokument. Executor führt eine
Operation aus, LocalWorkerRuntime verwaltet lokale Aufnahme/Drain/Replay,
Trust-Helfer prüft weitergereichte SPIFFE-Identität. Keine Scheduling-/Gate-Policy.
Buster `engine/test-gates/runner.ts:1601–1635` nutzt Runtime + Executor; Prism
`server/worker.ts:152–156` nur Executor. Die beiden Integrationsarten haben
unterschiedliche Kapazitäts-/Claim-Schutzgrenzen.

## 2. Schnittstellen und Gegenstellen

WorkerAttemptEnvelope → prepare/execute/measure/cleanup/collectEvidence/
finalizeResult → WorkerAttemptResult. Der Core prüft neutralen Vertrag,
Profildigest, Attemptdigest und Größen-/Identitätsgrenzen. Fachliche Schema-
Auswertung gehört der Operation; finaler neutraler Result wird erneut validiert,
bei ungültigem Operationsergebnis als errored normalisiert und tief eingefroren.

Buster liefert einen Operationadapter, kombiniert Run-/Claim-Signale, unterdrückt
Core-Logretention zugunsten seines eigenen Evidence-Pfades und persistiert/bindet
Completion danach. Prism loggt dagegen ohne storeFullLog: siehe
[PCR-PRISM-WORKER-001](prism.service-worker.md). Seine CPU-Messung erfüllt den
Attempt-Vertrag nicht: PCR-PRISM-WORKER-002. Keine doppelten Befunde hier.

## 3–4. Zustand und Fehler

Executor kopiert Envelope vor Start, hält genau ein Execution-Promise und gibt
bei wiederholtem execute denselben Abschluss zurück. Keine eigene dauerhafte
Receipt-Ablage; Receipt-Digest ist keine Authentisierung. Replay über einen neuen
Executor ist nicht dadurch ausgeschlossen.

Operation muss Limits synchron vorbereiten und bei terminate wirklich beenden.
Fehler-/Cancel-/Timeoutpfade verlangen terminate; Messung wird vor Cleanup
kopiert und gegen Limits geprüft. Fehlerhafte Cleanup oder fehlende Messung
führen zu errored. Bereits gesammelte gültige Evidenz bleibt bei bestimmten
Folgefehlern erhalten; ungültige neutrale Resultate werden fail-closed ersetzt.

## 5–6. Zeit, Abbruch, Duplikate und Restart

Executor prüft Queue/Claim vor Start und nach prepare, setzt Ausführungsdeadline,
begrenzt Termination, Messung, Cleanup, Evidenz, Logspeicherung und Finalisierung
jeweils separat. Promise.race stoppt keinen ignorierenden Operationcode;
Abbruchdurchsetzung bleibt Operation-/Prozessgrenze. Späte Logs nach dem
terminalen Snapshot werden ignoriert; Fortschritts-/Live-Log-Callbacks sind
best effort. Voll-Logspeicherung verlangt bei Retention tatsächlichen Digest/Größe.

LocalWorkerRuntime nimmt nur ready an, prüft Worker/Profile/Protokoll und
Claim-Zeit, reserviert synchron Kapazität, merkt Attempt-ID bis Claim-Ende und
verweigert Replay bei vollem Gedächtnis. Claim-Ablauf abortiert den Versuch und
wird nochmals bei Rückkehr geprüft. Drain wartet, bricht ab, wartet begrenzt
nach und wird bei ausbleibender Beendigung unhealthy. Kein Neustartpersistenz-
vertrag: Dienste müssen Aufnahme/Ergebnis und logische Idempotenz dauerhaft halten.

## 7. Vertrauen

XFCC-Parser akzeptiert genau eine URI, keine Ketten/duplizierten Header; Allowlist
muss gültig/nichtleer sein. authorizeProxiedSpiffePeer verlangt Loopback. Dies
ersetzt keine mTLS-/Header-Sanitisierung und authentifiziert keinen anderen
Prozess im gleichen Netzwerk-Namespace. Prüfannahme: geschützter lokaler Proxy,
richtige Service-Allowlist, isolierte Operationen. Keine Infrastrukturprüfung.

## 8–9. Grenzen und Architektur

Envelope bis 16 MiB, Tiefe 64, 100000 Traversierungsnodes; Logs bis 16 MiB und
10000 Parts. Result-/Evidence-Limits aus Envelope. Callback-Promises werden nicht
als begrenzte Delivery-Queue abgearbeitet; Empfänger müssen selbst Backpressure
leisten. Lokale Runtime: Kapazität max.4096; Replay max.1000000, Default65536.
Keine Ressourcenmessung/OS-Limits durch Core selbst. Vertrauen in Operation.prepare/
measure/terminate ist Teil der Erweiterungsgrenze, keine Sandboxgarantie.

Die Aufteilung ist sinnvoll, aber Wrapper-Nutzung muss verbindlich sein: ein
Service, der nur Executor aufruft, erbt keine Runtime-Kapazität/Replay-Sperre.
Gemeinsame absolute Claim-Deadline über alle Abschlussphasen wäre einfacher als
mehrere voneinander unabhängige Zeitbudgets und unterschiedliche Wrapper-Garantien.

## 10. Tests und Aussagekraft

Untersucht und unverändert bestanden:
`check-pipeline-worker-attempt-executor.mts` (750 Zeilen),
`check-pipeline-worker-local-runtime.mts` (165 Zeilen),
`check-worker-trust-spiffe.mts` und Worker-Vertragstest.
Belege `../evidence/worker-core-tests.txt`, `worker-contract-tests.txt`.

Coverage: gleiche Executorinstanz, kopiertes Envelope, falsche Digests,
Tiefe/Größe/Logcount/Unicode, Timeout und Prepare-Deadline, Cancel/Cleanup,
fehlerhafte Ressourcen, Evidence-Fehler, Voll-Log fehlt/kaputt/hängt, späte Logs,
Termination wirft/hängt, ungültiges Result, zurückspringende Uhr, Runtime-Aufnahme,
Drain, Kapazität, Replayspeicher, echte Claim-Timer und verspätetes Result.

Executor-Testoperation ist ein bestehendes Testdouble mit gelieferten Ressourcen
und simulierten Hooks; bestandene Tests beweisen Core-Steuerfluss, weder echte
Prozessbeendigung noch cgroup-Grenzen, Browser- oder Agentverhalten. Keine neuen
Mocks/Ersetzungen eingeführt. Fehler am Original-Prism-Aufruf bleiben trotz
bestandener neutraler Tests sichtbar. Vollständiger Claim-Abschluss-Test fehlt.

## 11. Dokumentation

BOUNDARIES.md beschreibt Zuständigkeit korrekt, aber keine Betriebs-/Integrations-
regeln. Worker-Vertrags-README ist zeitlich veraltet. `docs/security/worker-trust.md`
kennzeichnet Live-Cluster-Proof ausdrücklich als ausstehend, korrekt nicht als
Laufzeitnachweis übernommen. Dokumentationsstatus: unvollständig/veraltet;
verbindliche Wrapper-, Logstore-, Termination- und Restart-Verträge fehlen.

## 12. PCR-WORKER-001 — Claim-Deadline deckt nicht alle Abschlussphasen ab

- Schweregrad: mittel; direkter Executor-Aufrufer kann ein Ergebnis nach Ablauf
  des Claims als completed erhalten. Buster-Wrapper verwirft verspätete Ergebnisse,
  direkte Prism-Nutzung hat diesen zusätzlichen Schutz nicht.
- Evidenzklasse: begründeter Verdacht mit konkret nachvollziehbarem Zeitablauf;
  echter kombinierter Timing-Test noch ausstehend.
- Beleg: `attempt-executor.ts:249–255` reserviert timeout + 4×cleanupTimeout;
  `:408–410` entfernt nach execute den Timer. Danach können Messung, Cleanup,
  collectEvidence, storeFullLog und finalizeResult jeweils ein cleanupTimeout
  beanspruchen. `:603–620` prüft am Schluss Abort, aber nicht aktuelle Claim-Zeit.
- Ablauf: Claim deckt reservierte vier Abschlussbudgets knapp; fünf erfolgreiche
  Hooks verbrauchen zusammen mehr als vier Budgets, ohne einzeln auszulaufen.
  Finales Result wird nach Claimablauf erzeugt. LocalWorkerRuntime würde beim
  Rücksprung ablehnen, Executor allein kann completed liefern.
- Auswirkung: uneinheitliche Claimgültigkeit abhängig vom Wrapper; keine Aussage,
  dass der aktuelle Prism-Pfad bereits alle fünf optionalen Hooks nutzt.
- Ursachenbehebung: eine absolute Claim-Deadline durch alle Phasen führen und
  vor terminaler Bestätigung erneut prüfen; Abschlussbudget aus tatsächlich
  vorhandenen Phasen ableiten. Operationabbruch weiterhin echt durchsetzen.
- Verifikation: echte kleine Operation mit realen Dateievidenzen und kontrolliert
  langsamen Abschlussphasen ausführen, einmal direkt und einmal über Runtime;
  beide müssen späten Erfolg verweigern. Zusätzlich Nachweis, dass auslaufende
  Hooks keine unkontrollierten Nebenwirkungen nach dem Result fortsetzen.


Nachprüfung nach Schema Revision4: attempt-executor.ts:280 decodiert jeden
Byte-Logaufruf separat mit Buffer.toString('utf8'). Providerloader.ts:173 reicht
reale stderr-Buffer weiter; :263 decodiert base64-RPC-Logchunks zu Buffern. Damit
ist [PCR-ISOLATION-003](foundation.isolation.md) auch für erhaltene Workerlogs
relevant: UTF-8 kann an Chunksplit verloren gehen. Zentraler Befund bleibt dort;
Worker-Verifikation zusätzlich mit Originalexecutor und zwei Byte-Logs innerhalb
eines Mehrbytezeichens, gespeicherter Log muss exakte ursprüngliche Zeichen zeigen.
Dieser Worker-spezifische Repro wurde nicht ausgeführt (Codepfad geprüft).
Executor startet selbst keinen Prozess; Supervisorbeendigung ist Verantwortung
der jeweiligen Operationterminate-Implementierung und bei buster.engine zu prüfen.
