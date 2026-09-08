# kubeclaw.agent-observability

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Schema: Revision 5. Code-Trace und lokale Tests; kein Produktions-/OpenClaw-E2E-Nachweis.

## 1. Verantwortung und tatsächliche Nutzung

`skills/common/plugins/agent-observability/src/observers.ts` enthält ausschließlich
`ingest`, `recordEvidence` und die Projektion. `plugin.json` registriert ingester
für zwölf namespaced Agentereignisse und evidence für fünf Abschluss-/Delivery-
Ereignisse. Die Rollenpakete nova/buster/prism liefern es aus. Auslieferung ist
keine Aktivierung: konkrete Auswahl und beide Sinkaufrufe sind im lokalen
`tests/live-function.test.ts` über Registry/Grants/ObserverRuntime nachgewiesen.
Kein produktiver Plattformkonfigurationsbeleg in den untersuchten Rollen-/Chart-
und Pluginpfaden; die reale Hostquelle bleibt die benachbarte Extension.

## 2. Vertrag und Gegenstellen

Eingang `ObserverDelivery` kommt aus `skills/nova/core/telemetry/observer-delivery.ts`;
Core vergibt deliveryId, eventId, sequence und Identität. `projectAgentEvent`
sendet `agent-observability-event.v2` ohne deliveryAttempt, aber mit ursprünglicher
Identität und redigiertem payload. `ingest` ruft telemetry.emit/append mit
telemetry.event und Eventtyp auf; `telemetry-store/src/adapter.ts` persistiert.
`recordEvidence` ruft artifacts.write/put_json mit `agent-evidence:<eventId>`
und Namespace `kubeclaw.agent-observability-evidence` auf; artifact-store nimmt
JSON und schreibt Digest/Metadaten. Kein direkter Leser der projektierten
Artefakte im Plugin, kein Telemetrie-v1-Promotionsnachweis.

## 3. Zustand und Commit

Keine eigenen Dateien oder Caches. Erfolg erst nach await des Sinkeffekts;
Core schreibt danach completed und Checkpoint. Telemetrie und Artefakt sind
unabhängige Registrierungen, also keine gemeinsame atomare Bestätigung.
Sinkpersistenz einschließlich fsync/Verzeichnisdauerhaftigkeit liegt bei
Foundation/Artefaktstore, nicht beim Projektor.

## 4. Fehler und Disposition

Sinkfehler propagieren unverändert. Das Plugin verschluckt weder Ablehnung noch
Timeout. Manifest best_effort bedeutet nach fünf Versuchen keine erfolgreiche
Zustellung; `observers.ts` blockiert weitere Ereignisse desselben Runs am Fehler.
Kein Nachweis, dass hier Schedulerzustände als erfolgreiche Evidenz umgedeutet werden.

## 5. Timeout, Retry, Parallelität

Manifest je Registrierung 10s, fünf Versuche, 1s Backoff, per_run. Core erzeugt
stabile Effektidentität aus deliveryId und Aufrufsequenz. Projektion hängt nicht
von Versuchszahl oder aktueller Zeit ab. Beide Registrierungen erhalten getrennte
Grants/Checkpoints. Ein voller Sink erschöpft Versuche; Wiederholung repariert
keinen permanenten Schema-/Kapazitätsfehler.

## 6. Restart und ungewisser Ausgang

Zwischen Sinkcommit und Observercompleted kann erneut aufgerufen werden;
Foundation-Dedupe bzw. Effektjournal muss ACK-Verlust abfangen. Zwischen
completed und Checkpoint stellt `observer-recovery.ts` den abgeschlossenen
Status wieder her. Kein eigener mehrstufiger Abschlusspräfix. Ein Neustarttest
dieser gesamten Kette wurde hier nicht ausgeführt.

## 7. Vertrauen

Nur telemetry.emit bzw. artifacts.write, keine Schedulerautorität. Redaction
kommt aus `plugin-runtime/sdk/src/values.ts` (Tiefe 16, pro Container 1000,
Stringlimit); Identität wird direkt übernommen und setzt kanonischen Coreeingang
voraus. Strukturredaction garantiert keine Entfernung eingebetteter Secrets in
beliebigem Freitext. Quelle/Runbindung ist Aufgabe des emittierenden Adapters.

## 8. Ressourcen

Keine eigenen Queues oder Retention. SDK begrenzt Tiefe/Kardinalität pro Ebene,
kein globales Knotenbudget; Getter/Object.entries werden davor ausgewertet.
Sinkbytebudget wirkt erst nach Projektion. Ein Prozessspeicherlimit wird durch
die deklarative Observerlease nicht hier gemessen. Historienretention siehe
[PCR-OBS-002](foundation.observability.md).

## 9. Architektur

35 Zeilen reine Projektion sind angemessen. Beide Berechtigungen bleiben
bewusst getrennt. Unterschiedliche agent-observability-v1 Redis- und v2
Domainereignispfade sollten erst nach geklärtem Consumer vereinheitlicht werden;
diese Projektion ist kein Nachweis der Migration des Rohdatenkanals.

## 10. Tests

Alle vier Originaltests vollständig gelesen und `npm test` im Paket bestanden:
[Protokoll](../evidence/observers-agent-observability-tests.txt). Unit/Parity
prüfen Redaction und versuchsunabhängige Bytes für Manifestsubscriptions;
Package-boundary prüft Quelltextmuster. Live-function nutzt echte Registry,
Observerruntime, temporäre Filejournale und originale Telemetrie-/Artefaktadapter,
aber synthetisches Session-End-Ereignis, MemoryResourceLockManager und kein
OpenClaw. Zwei Zustellungen, zwei Checkpoints, zweiter Drain leer; kein Redis-,
SIGKILL-, Speichervoll- oder Herkunftsangriffstest.

## 11. Dokumentation

Paket-README vorhanden und inhaltlich geprüft; Rollen-/Katalogregistrierung passt.
Die Bezeichnung immutable evidence betrifft den sinkseitigen Speicher, nicht
eine atomare gemeinsame Telemetrie-/Artefaktbestätigung. Unvollständig sind
Produktivaktivierung, globales Speicherbudget und Herkunfts-/Retentionsregeln.

## 12. Ergebnis und nächste Verifikation

Kein zusätzlicher komponenteneigener Defekt nachgewiesen. Abhängige Risiken
[PCR-SDK-001](lib.sdk.md), [PCR-OBS-002](foundation.observability.md) bleiben;
Agentquellenrisiken bei [openclaw-agent-events](kubeclaw.openclaw-agent-events.md).
Nächster tatsächlicher Systemnachweis: Hosthook → kanonischer Event → beide
originalen Sinks, mit Prozessabbruch nach Sinkcommit und vor Observercompleted.
