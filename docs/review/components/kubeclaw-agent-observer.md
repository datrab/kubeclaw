# kubeclaw-agent-observer

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Schema: Revision 5. Code und Originalpakettests vollständig untersucht.

## 1. Verantwortung, Registrierung und reale Auslieferung

`skills/common/plugins/openclaw-agent-observer` ist Hostextension mit genauer ID
kubeclaw-agent-observer (kein v2-plugin.json). openclaw.plugin.json aktiviert
onStartup; package.json sourceExtension src/index.ts und runtimeExtension
dist/index.js, API≥2026.9.1/build2026.9.2. index registriert zwölf Hooks,
Agentstream-/Diagnostiksubscription, service und scoped Gatewaystatus/selfTest.
Chart configmap-gateway.yaml:268–311 aktiviert die Extension aktuell nur für
buster; deployment.yaml bereinigt übrige Rollen/obsolete Loadpfade. Inventar-
annahme 'Rollen nova,buster,prism' ist daher kein aktueller Aktivierungsbeleg.

## 2. Verträge und beide Grenzseiten

OpenClaw api.on plus runtime.events.onAgentEvent oder Subscriptionfallback
liefern Hook/Agentdaten. diagnostics.ts verlangt focused
openclaw/plugin-sdk/diagnostic-runtime, nur model.usage. hook-normalizers/
hook-payloads/hook-values bilden alle zwölf Hooks plus usage auf
AgentObservabilityIngressEventV1 ab: v,type,source,ts,identity,payload;
run/session/dispatch/tool/model/parent/child Identitäten aus Event/Context.
Generierte Vertragskopie entspricht Originalcontracts/agent-observability/v1/src.
Rediswriter XADD an contract-routete control/payload-Streams, Feld data;
Kontrollfehler zusätzlich Deadletter. Kein aktueller Decoder/Promotionsconsumer
für diese Streams im untersuchten Repo belegt, siehe [contract.agent-events](contract.agent-events.md).
v2-openclaw-agent-events ist ein anderer namespaced, minimierter Eingang.

## 3. Zustand, Persistenz, Commit

Config, Redisclient, zweigeteilte Queue, Dedupe-/Warnmaps und Statistiken im RAM.
Enqueue speichert vollständige JSONbytes, kein dauerhaftes Outboxcommit.
written zählt erfolgreiche XADD-Antworten, keine Datei-/Redis-fsyncgarantie.
Redis AOF/Failover sind externe Annahmen. Keine Quelle-ACK-/Consumerreplaybindung
und keine beweiskräftige Schedulerabschlussbestätigung aus raw Hookdaten.

## 4. Fehler und Disposition

Config-/Normalisierungsfehler werden begrenzt geloggt und Ereignis verworfen.
Queuevoll/Oversize/Redisfehler haben getrennte Zähler; Kontrollwrite versucht
mehrfach und ggf. Deadletter, Payloadwrite einmal. Fehler in Clientfactory
verwerfen dequeue-te Events. getStatus.connected bedeutet lediglich vorhandenes
Clientobjekt, keine tatsächliche Socket-/AUTHbereitschaft. selfTest gibt nach
flush Status zurück, kein garantierter dauerhafter Consumerempfang.

## 5. Timeouts, Retry, Parallelität

redisCommandTimeoutMs ist Promise.race, stoppt das gestartete XADD nicht;
Timeout plus Retry kann doppelte XADD-Wirkung erzeugen (Redis '*' ohne Dedupe).
Controlretry exponential bounded nach Config, Payload kein Retry; controlQueue
hat Vorrang und kann Payload bei Dauerlast verdrängen. flushPromise serialisiert
Flushloops. quit beim stop hat keinen Timeout, neue Hooks können nach stop
weiter enqueue auslösen, da kein stopped-Flag und Hooks nicht deregistriert.
Hostservice muss Hooklifecycle sicher beenden; kein bestandener Drainvertrag.

## 6. Neustart und ungewisser Ausgang

RAMqueue/Dedupe gehen bei Prozessende verloren; keine Replayaufnahme. Dedupe
vor enqueue kann auch verworfene Events als gesehen markieren. Event geschrieben
aber ACK verloren → erneutes XADD, keine stabile Transport-ID. Stop entfernt
globale Observerreferenz/Diagnostik, wartet flush/quit; globaler Agenthandler
bleibt absichtlich singleton-registriert und kann einem neuen Observer zugeordnet
werden. Kein persistierter Abschlusspräfix, daher keine Journalrecoverybehauptung.

## 7. Authentifizierung, Herkunft, Rawcontent

Hostnative Rechte statt v2-Grants; Gatewaystatus operator.read/selfTest
operator.admin. Redis config verlangt Password ODER TLS ODER dokumentierte
Isolation; dies ist keine Prüfung der realen NetworkPolicy. Config kann aus
registration/service/hookcontext zusammengeführt werden; vertrauenswürdiger
Hostkontext vorausgesetzt. Normalisierer übernehmen Prompt/History/Toolparams/
Result/Metadata ohne sensitive-key-Redaction. Das entspricht einem Rawkanal,
aber widerlegt pauschale frühere 'source-side redaction'-Behauptungen.
Identitätsfelder aus Event selbst sind keine autoritative Runbindungsprüfung.

## 8. Ressourcen und Aufbewahrung

Maxeventbytes, je Stream begrenzte Queue, maxLen~ und DeadlettermaxLen.
Chart:3MiB je Event und100 Queueplätze je Stream; nominell bis600MiB JSONqueue
zuzüglich Normalisierungs-/Serialisierungskopien, kein gemessener RSS-Vertrag.
Dedupeeinträge nach10/60s bereinigt, aber kein Anzahlcap und Säuberung nur bei
neuen Events. toJsonValue vor Bytecheck ohne Tiefe/Knotenbudget, Arrayzyklen
nicht erkannt (s.u.). Timer bei erfolgreichem withTimeout wird nicht gecancelt,
aber unref; Redisquit kann unbegrenzt hängen. Kein lokaler Disk-GC.

## 9. Architektur und Vereinfachung

Hostnative Grenze ist nötig, zwei parallel bestehende Verträge/Rawpolitiken
erschweren jedoch Herkunft und Redaction. Contract-sync ist Originalcopy,
build compiliert zunächst temporär und tauscht dist erst bei Erfolg. Keine
SDKroot-Shims hinzufügen; fokussierte Hostexports und tatsächlichen Consumer
klären. Dedupe muss echte Ereignisidentität statt Typ-/Runheuristik erhalten.

## 10. Tests, Voraussetzungen und Grenzen

Alle drei Originaltests plus beide Buildscripts und tsconfig gelesen.
Direkter Typecheck im Checkout zunächst blockiert: generierte Vertragskopie
fehlt (TS2307), nachgelagerte Tests des &&-Befehls nicht ausgeführt. Danach
Original npm test in temporärer Spiegelkopie des Pakets mit Originalcontractsrc,
Repo-tsconfig und vorhandenen Dependencies: pretypecheck/sync-contract erzeugt
unveränderte Kopie, Typecheck/config/live-function/boundary bestanden:
[Log](../evidence/observers-openclaw-agent-observer-tests.txt). Keine Änderung
an funktionalen Repoquellen, keine Mockmodule nachgerüstet. Live-function selbst
verwendet vorhandene fake Redis-/Diagnosticfactory, prüft disabled/start,
ein session_start-XADD und fehlerhafte Factory; kein echter Redis/OpenClaw,
Reconnect/Timeout-/Deadletter-/SIGKILLnachweis. [Grenzprobe](../evidence/observers-boundaries.mjs)
und [Log](../evidence/observers-boundaries.txt) prüfen originale Dedupefunktion
und toJsonValue direkt ohne die generierten Runtimeimporte.

## 11. Dokumentationsabgleich

README vorhanden, Payload-/Queue-/Commandgrenzen sind konfigurierbar, aber
wirken nicht vor der Normalisierung und quit bleibt unbegrenzt. Phase10-
observer-assessment.md:93ff behauptet source-side redaction sowie Tests für
retry/deadletter/reconnect/secret scans; aktuelle drei Paketsuiten belegen das
nicht. Chartrole buster widerspricht pauschaler Dreifachaktivierung aus dem
Inventar. Contractconsumer/Rawdatenschutz und deaktivierte Hostrollen sind
unvollständig dokumentiert.

## 12. Befunde und nächste Verifikation

### PCR-HOSTOBSERVER-001 — Dedupe löscht verschiedene LLM-Ausgaben desselben Runs

**Mittel, nachgewiesener Defekt:** observer-support.ts:44–55 bildet
openclaw.llm.output auf type:run_id:session_key:hook ab; index.ts:170–187 verwirft
gleichen Key10s lang. Verschiedene model_call_id und response spielen keine
Rolle. Originalgrenzprobe zeigt identischen Key für zwei verschiedene Outputs.
Auswirkung: legitime weitere Modellausgaben/Observabilityevidenz fehlen, auch
wenn unterschiedliche Runtime-seq zuvor korrekt unterschieden wurden. Ursache
beheben durch stabile quellseitige Event-/Call-/Sequenzidentität und explizite
Cross-hook-Duplikaterkennung; keinen Inhalt nur anhand Run/Typ unterdrücken.
Regression über originalen Observer mit zwei verschiedenen LLMcalls innerhalb10s
(beide geschrieben) sowie tatsächlich doppeltem Hook/Runtimeevent (einmal),
Queuevollfall darf eine spätere legitime Wiederholung nicht still löschen.

### PCR-HOSTOBSERVER-002 — Arrayzyklen umgehen die Normalisierer-Zyklusabwehr

**Mittel, nachgewiesener Defekt:** hook-values.ts:81–94 toJsonValue behandelt
Arrays über map vor Aufnahme in seen. Selbstreferenziertes Array erzeugt
RangeError; Originalprobe belegt es. index fängt Normalisierungsfehler und
verwirft das Event, kein Prozessabsturz behauptet. Auch tiefes gültiges JSON
wird vor Größenprüfung unbeschränkt durchlaufen; Vertragsvalidatorgrenze
[PCR-AGENT-CONTRACT-001](contract.agent-events.md) kommt erst danach.
Behebung: ein Traversalbudget und seen-Pfad für Arrays und Records, kontrollierte
Disposition für nicht-JSON/Getter und zu tiefe Eingänge. Regression über
Originalnormalisierer und Hookhandler mit Zyklus, Tiefe, geteilter Referenz,
BigInt/Date/Error und normalen Modell-/Toolpayloads. Nach Reparatur echten
Host→Redis→identifizierten Consumer testen; derzeit kein solcher Nachweis.
