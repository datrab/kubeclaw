# kubeclaw.http

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.
Schema: Revision 5. Teststatus: bestanden. Dokumentationsstatus: vorhanden / unvollständig.

## 1. Verantwortung, Registrierung und tatsächliche Nutzung

Auslieferung über `packaging/runtime/roles/buster.json`; Manifest `plugin.json` registriert den unten genannten Vertrag. Nova `skills/nova/core/test-gates/resolver.ts:538–580` wählt anhand `uses`, prüft Kind, löst Konfiguration mit Schema-Defaults und pinnt Paket/Schema. Buster `runner.ts:1191–1250` lädt und ruft aus; `provider-loader.ts:49–89,151–180,382–389` kopiert digestgeprüft ins Versuchssnapshot und startet den Sandboxprozess; `provider-child.mjs:37–66` importiert Factory und ruft `execute`. Alle Engine-Dateien liegen in `skills/buster/engine/test-gates/`. Vertrag `kubeclaw.http@1`, Registration `request`, `src/provider.js#provider`, Capability `network.http`, retrySafe=true; Matrixfeld `path`.

## 2. Eingaben, Ausgaben und Gegenstellen

`configuration()` und `deploymentInput()` (`skills/buster/plugins/http/src/provider.js:38–112`) wählen genau explizite Origin, Deployment-Endpunkt oder öffentlichen Endpoint; GET/HEAD, Statusliste, Inhaltstyp, Text und Grenzen werden geprüft. Netzwerkgegenstelle `network-http-runtime.ts:194–261` liefert Status, normalisierten Content-Type, vollständigen UTF-8-Body, Bytezahl und SHA-256. Provider gibt keine Bodyinhalte zurück. Schema-Default `path=/` überschreibt jedoch den Endpointpfad (PCR-HTTP-001).

## 3. Zustand, Persistenz und Commit-Punkt

Ein HTTP-Aufruf plus stdout-Log, keine Providerdateien/Outputs. Provider-Rückgabe ist kein Commit: Runner validiert Vertrag, Zählwerte und Evidenzdeklarationen, klont/friert das Result, kopiert ausgewählte Dateien ins Staging und führt erst danach Workerabschluss/Artefaktspeicherung aus (`runner.ts:1226–1320`). Keine eigene Journal-/fsync-/Waitprojektion; Recovery und Abschlusspräfixe gehören dem Runner/Remote-Dienst. Keine Behauptung einer bestandenen Crashkette.

## 4. Korrektheit und Fehlerdisposition

Assertion, Timeout und Connectionfehler werden failed; Policyverweigerung, Redirect, Abbruch, Responseüberschreitung und unplausible Antwort werden geworfen (`provider.js:143–175`). Gegenstelle blockiert Redirects und prüft Status/Streamingbytes; Content-Type wird vor Vergleich von Parametern befreit. Falsches Ziel durch Schema-Default bleibt fachlich relevant.

## 5. Timeout, Abbruch, Wiederholung und Parallelität

Anfragezeit=min(config, invocation.timeoutMs), zusätzlich Operatorobergrenze; Originalinvoker kombiniert Versuchssignal, Fixtureablauf und Requesttimer. Nur GET/HEAD; Wiederholung ist entsprechend als sicher markiert, wobei fremde GET-Endpunkte dennoch Nebenwirkungen besitzen können. Jeder Versuch hat eigenes Result; keine globale Providerzustandsmutation.

## 6. Neustart, Wiederaufnahme und ungewisser Ausgang

Keine Wiederaufnahme mitten im Request; beim Neustart kann ein neuer GET/HEAD entstehen. Ein verlorener Reply beweist keinen fehlenden Serverkontakt. Kein eigener Cleanup-Hook, keine dauerhaften Ressourcen; die Response wird in der Gegenstelle gelesen/cancelled.

## 7. Vertrauensgrenzen und Evidenzherkunft

Der Projektinhalt ist untrusted. Planidentität und Digests kommen vom Resolver; Capability-Rechte werden im Runnerkontext geprüft, die Originalinvoker kontrollieren Ziel/Operation. Provider-Sandbox erhält Repository-Leserechte, versuchsbezogene Scratch-/Evidenzschreibrechte und ausdrücklich freigegebene Artefaktpfade. Eine echte HTTP-Antwort beweist Verhalten des adressierten Testservers, keine zusätzliche Identität außerhalb der festgelegten Origin-/Fixtureauthority. HTTP erfordert Portfreigabe und exakte Origin; Suffix allein autorisiert auch GET nicht. Headerallowlist und fixtureAuthoritySignal werden in der Gegenstelle benutzt.

## 8. Ressourcen, Aufräumen und voller Speicher

1 MiB Default/16 MiB Providermaximum, Operator kann enger begrenzen. Bytes werden vor Bodyzusammenführung im Invoker gezählt; HTTP-Body wird vollständig decodiert, keine beliebige Chunk-UTF-8-Decodierung. Log-/Resultbudget im Runner, Speicher-/CPUgrenzen im Providerprozess. Keine eigene Dateiaufbewahrung; Runtime-Streaming-/Servernebenwirkungen bleiben Enginezuständigkeit.

## 9. Architektur und Vereinfachung

Kleiner Adapter mit sinnvoller Trennung zu Netzwerkpolicy. Pfadentscheidung muss erst nach Fixtureauswahl erfolgen: Schema-Default und dynamischer Endpointdefault sollten nicht konkurrieren. Keine zweite HTTP-Ausführung im Provider.

## 10. Untersuchte und ausgeführte Tests

Gelesen und ausgeführt: `node skills/buster/plugins/http/tests/live-function.test.ts` (exit 0); echte lokale Requests, Status/Text/Content-Type, Endpointpfad direkt, Redirect, Größe, Cancel und nicht kontaktierende Policyverweigerungen. Evidenz `../evidence/buster-provider-http-original.txt`. Ergänzende Originalprobe `node docs/review/evidence/buster-provider-boundaries.mjs` ruft echte Registry-Schemaauflösung, Originalprovider und Originalinvoker auf; zeigt `/health` → `/`. Direkter Originaltest umgeht Registry, Prozessloader und kompletten Workerabschluss; seine Aussage reicht ausdrücklich nur über die darin wirklich aufgerufenen Komponenten. Kein Deployment, kein CI-Neulauf, kein Ersatzmock. Tests außerhalb der unten genannten Programme sind nicht als ausgeführt gewertet.

## 11. Dokumentationsabgleich

Plugin-README und HTTP-Userguide bestätigen begrenzten Einzelrequest. Endpointunterstützung ist im direkten Test belegt, aber ein vollständiger Resolverlauf hat wegen Schema-Default anderes Verhalten. Das ist eine echte Implementierungsabweichung zur beabsichtigten Endpointübernahme, keine fehlende Browserumgebung.

## 12. Befunde und nächste Verifikation

PCR-HTTP-001 beheben und einen Resolver→Provider→Server-Test mit öffentlicher URL samt Pfad und ohne config.path ergänzen. Bestehender direkter Test ist dafür unzureichend.

### PCR-HTTP-001 — mittel: Schema-Default verwirft öffentlichen Endpointpfad

Nachgewiesener Defekt (Original-Schemaauflösung + Originalprovider + lokaler HTTP-Invoker). `skills/buster/plugins/http/schemas/config.schema.json` setzt für `path` den Default `/`; `skills/common/plugin-runtime/foundation/registry/schema.ts:34,87–98` trägt ihn vor Ausführung ein. `provider.js:53–54,107` möchte ohne expliziten Pfad den Fixturepfad verwenden, sieht aber bereits `/`. Auslöser: Endpoint-URL `/health` bei fehlendem config.path. Der Provider prüft `/`; ein anderer gesunder Root kann das Gate fälschlich grün machen. Evidenz `../evidence/buster-provider-boundaries.{mjs,txt}`, Probe `http-resolved-endpoint-path`. Ursachenbehebung: dynamische Fallbackentscheidung erhalten, statischen Schema-Default entfernen oder explizite Herkunft des Pfads modellieren. Regression: echten Plan auflösen, getrennte Root-/Health-Antworten liefern und tatsächlich kontaktierten Pfad prüfen.
