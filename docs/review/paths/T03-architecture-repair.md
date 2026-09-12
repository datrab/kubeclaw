# T03 — Architekturreview, Nachbesserung und erneute Acceptance

## Prüfstand und Ergebnis

Codecommit für **alle** folgenden Codebelege: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488` (Tree `e43c39eea59b07f0a749b7b49f3aefdd11b14ed0`). Statischer Trace, keine Tests ausgeführt, keine funktionalen Änderungen. Vorhandene Komponentenreviews wurden aus Dokumentationscommit `a9e080ab1e1981ec5713e9b742f94280835fd347` gelesen; dort genannte erfolgreiche Tests sind historische Angaben, keine Ergebnisse dieses Traces.

**Ergebnis: Zielablauf nicht durchgehend implementiert.** Im Projectmodus ist die erste Bruchstelle bereits die fehlende Architektur-/Acceptance-Verdrahtung. Im ausdrücklich zusammengestellten Graphmodus existieren Reviewer und digestgebundene Berichtsfreigabe, aber die Operatorentscheidung „beheben“ führt zu einem blockierten Run; sie ist keine implementierte Reparatur-/Re-review-Schleife. Die administrative Fortsetzung hat zudem eine konkrete alte-Guidance-Grenze. Nachfolgende Schritte wurden deshalb konditional weiterverfolgt, nicht als erfolgreicher Lauf ausgegeben.

Szenario: Operator und Nova haben Architektur und Modulplan manuell erarbeitet. Reviewer meldet nichtblockierende Fehler/Warnungen; Operator wählt Behebung; Nova überarbeitet Architektur und Plan; Reviewer prüft erneut; nur der tatsächlich überprüfte und akzeptierte Stand soll für Forge verfügbar sein. Blocking-Finding, fehlender Reviewer, unveränderte Restfindings, veraltete Zustimmung und Crashfenster sind Nebenvarianten. Zielendzustand ist autorisierte Implementierungsbereitschaft, nicht ausgeführte Implementierung.

## Voraussetzungen und Komponentenstatus

| Komponente/Verhalten | Status am Commit | Beleg |
|---|---|---|
| Manueller Architektur-/Modulplan | Externe Ausgangsarbeit; kein automatischer Planungsschritt vorausgesetzt | `skills/nova/project/compiler.ts`, `compileProject`, 46–103 konsumiert vorhandene Module |
| Architekturvalidator | Implementiertes, ausdrücklich auswählbares Plugin | `skills/nova/plugins/architecture-validator/src/stage.ts`, `execute`, 4–44 |
| Architektur-Acceptance | Implementierte explizite Registrierung | `skills/nova/plugins/human-approval/plugin.json`, 19–31 |
| Automatische Projectverdrahtung dieser beiden Stages | Fehlend; Compiler erzeugt ausschließlich Modulstages | `skills/nova/project/compiler.ts`, `compileProject`, 103–136 |
| Ohne Arch-Reviewer | Technisch unterstützt: Projectmodus bzw. Graph ohne Stage; kein expliziter Risiko-Bypassschalter erforderlich | gleicher Compiler; `skills/nova/core/execution/graph.ts`, `ExecutionGraph.ready`, 45–46 |
| Archviewer | Präsentationsserver, weder Reviewer noch Approvalautorität | `docker/Dockerfile.archviewer`, 5–9,16–21: nginx, `/designs`, Port 3456 |
| Preflight/Blueprintsync | Explizite zusätzliche Stages, nicht vom Projectcompiler erzeugt | Compiler 103–136; jeweilige `src/stage.ts` unten |
| „Beheben“ als Approvalentscheidung | Nicht implementiert; nur pending/approved/rejected | `skills/nova/plugins/human-approval/src/approval.ts`, `parseApprovalGuidance`, 94–118 |
| Reportdigestbindung | Implementiert | `architecture-approval.ts`, `execute`, 86–108 |
| Bindung an tatsächlich gelesene Source-/Planrevision | Nicht im Architektur-/Approvalvertrag erzwungen | `protocol.ts`, 1–4,18; `output.ts`, 61–82; `architecture-approval.ts`, 86–118 |

Für den konditionalen Graphpfad müssen Plattformregistrierungen, Grants und echte Dispatch-/Artifact-/Wait-/Operatorprovider konfiguriert sein. Der Graph muss eine Ordinary-Dependency vom Reviewer zum Acceptance-Gate und von dort zur Implementierung enthalten. Eine optionale Aktivierung auf `architecture.review = approval_required` ist möglich, muss aber korrekt deklariert werden. Ein solcher vollständiger Produktionsgraph wurde in diesem Trace nicht als deployed nachgewiesen.

## Vollständige Übergangsfolge

### 1. Entrypoint und erste Bruchstelle

`compileProject` akzeptiert nur schemaVersion/id/runId/repositoryRoot/workspaceRoot/baseRevision/modules (Compiler 46–55). Module enthalten task, requirements, Ownership und Implementierungs-/Lint-/Review-/Testkonfiguration; Review- und Testagent sind Pflicht (60–89). Topologische Ordnung entsteht 92–102. Erste erzeugte Stage ist `implement-<module>`; beim ersten Modul existiert keine vorgelagerte Architektur-/Operator-Dependency (103–119). Anschließend folgen lint/review/test; kein Acceptanceartefakt wird konsumiert (120–136).

Damit kann der Projectpfad nicht als „nach Architektur-Acceptance autorisiert“ bezeichnet werden. Weiterverfolgung erfolgt **unter der zusätzlichen Voraussetzung eines expliziten Graphen** mit Reviewer, Architektur-Approval und Implementierungsdependency. Dies ist keine Behauptung, der Compiler habe diese Verdrahtung.

### 2. Nova/Graph → Architekturreviewer

`architecture-validator/src/stage.ts#execute:4–11` nimmt `ArchitectureInput {task, architecture?}`, liest `config.agent`, ruft `runtime.dispatch` mit operation `dispatch`, resource `{type:'runtime.agent',canonicalId:agent}` auf. `protocol.ts#buildArchitectureRequest:5–45` erzeugt `kubeclaw.architecture-validation.v2`, Agent, Instruktion, Architekturobjekt und Outputcontract. Der Prompt grenzt Softwarearchitektur von deterministischem Preflight ab und verlangt ausdrücklich niemals `request_fix` (11–16).

Korrelation liegt im äußeren Capabilityrequest: `core/execution/stage-executor.ts#runtime:53–74` erzeugt Run-/Stage-/Attempt-ID und monotonen Attemptzähler; `#context:78–89` erzeugt Effectkey `runId:stageId:attemptNumber:sequence`. Der fachliche Architekturbody enthält selbst keine Pflichtfelder für Projekt-/Modul-/Source-Revision. `checkedFiles` wird später ausschließlich vom Agenten behauptet.

Beim HTTP-Dispatchprovider validiert `skills/common/plugins/runtime-dispatch/src/dispatch-adapter.ts#createDispatchAdapter:25–32` Fence, Abbruch und erlaubtes Ziel. `runtime-dispatch/src/adapter.ts#activate:110–144` validiert JSON-/Bytebudgets, bezieht Secret über vertraulichen Capabilitycall, sendet POST mit Idempotency-Key und optional HMAC und verlangt 2xx plus Objektantwort. SPIFFE-Proxy ist ausschließlich Loopbackkonfiguration (63–89). Die Antwort wird synchron zurückgegeben; `architecture-validator/src/output.ts#parseArchitectureOutput:61–82` erwartet `response.result`. Dies ist ein Providerpfad, keine Behauptung einer laufenden realen LLM-Gegenstelle; der konfigurierbare OpenClaw-Provider und dessen Betriebszustand wurden hier nicht als Laufzeitnachweis geprüft.

### 3. Reviewer → Report → Acceptancebereitschaft

Der Parser erzwingt geschlossene Struktur, Scope domain_model/integration_boundary und blocking/error/warn/info. `passed` erfordert nichtleere checkedFiles und keine blocking-Findings; `blocked` erfordert mindestens eines (output.ts 32–82). Ein `error` oder `warn` darf also bei abgeschlossenem Review `passed` sein. Das bedeutet **nicht fehlerfrei**.

`stage.ts:19–32` schreibt den unveränderten fachlichen Report über `artifacts.write/put_json`, ID `architecture-validation`, Namespace `kubeclaw.architecture-validator`. Bei passed liefert die Stage Fact `architecture.review=approval_required` bei Findings, sonst `clean`; bei blocking kommt `architecture.blocked` und Runstop (35–44; Core `reducer.ts:98–103`, `run-decisions.ts#stop:108–113`). Dispatch-/Parsefehler werden schon 7–17 zu `architecture.invalid_output/blocked`. Kein automatischer Reparaturrequest entsteht.

Der Core speichert das vollständige Attemptresult vor dessen Projektionen (`stage-executor.ts:133–135`; `run-decisions.ts#record:28–32`, `#artifacts:48–54`). Resultartefakte müssen denselben Run und Producerstage haben. Nachfolgende Stages sehen Artefakte nur aus eigener Stage und transitiven Ordinary-Vorgängern (`stage-executor.ts#priorArtifacts:96–105`). Ohne Graphdependency reicht eine passende Artefakt-ID nicht aus.

### 4. Acceptance → Operatornachricht → Wait

`human-approval/src/architecture-approval.ts#execute:86–108` filtert Reportreferenzen nach ID, Namespace und aktuellem Run, verlangt genau einen Producer und genau eine Referenz seines höchsten Attemptzählers. MediaType JSON, 1–256 KiB, Digest und Bytegröße werden gegen gelesenes canonical JSON geprüft. Nur verdict passed ist zulässig. Findings werden zusammengefasst; die Nachricht enthält den Reportdigest (109–118). Keine Findings ergibt sofort passed ohne Operatorwait (111–117).

Bei Findings geht `executeApproval({summary},context)` an `human-approval/src/stage.ts:17–54`: Parser prüft Input/Config/Guidance; pending erzeugt `approval:<runId>:<stageId>`, Ablaufzeit und `signal.wait/create` mit `approval.resolved`, autorisiertem operator-Issuer und Summary. `wait-store/src/adapter.ts#activate:205–235` persistiert eine an den Effectkey gebundene Wait-ID; identische Wiederholung muss identische Nutzlast haben. Erst nach vollständiger Antwortprüfung (`approval.ts#validateCreatedWait:160–194`) erfolgt `operator.request/publish` mit approvalId, waitId, summary, signalType, issuer, expiresAt. Anschließend wird `outcome:wait` zurückgegeben.

`operator-messaging/src/adapter.ts#deliver:65–131` schreibt Deliveryrequest/Reservation, sendet HTTP, validiert 2xx und persistiert Receipt. Das ist keine Benutzerentscheidung. Bei Discordformat transformiert `discordWebhookPayload:12–25` ausschließlich Titel/Summary/Fields usw.; die Approvalkorrelationsfelder werden nicht automatisch sichtbar gerendert. Der tatsächliche eingehende/authentifizierte Operator-Resumeweg muss zusätzlich existieren. Kein solcher Webhookdialog wird allein durch diese Sendefunktion bewiesen.

Core `reducer.ts:90–96` speichert waiting nur bei verbleibendem Attemptbudget; `run-decisions.ts#wait:100–105` schreibt separate stage.waiting-Zeile. Pending-Wait und späterer bestätigter Versuch verbrauchen beide Attempts. Ein Graph mit maxAttempts=1 blockiert bereits beim Waitresult statt einen benutzbaren Gatezustand zu behalten.

### 5. Operator wählt „beheben“ — zweite Bruchstelle

Ein Signal mit decision `fix` oder `request_fix` ist ungültig (`approval.ts:94–118`). Der darstellbare Entscheid ist `rejected` mit Reason „beheben“. `core/execution/engine-run.ts#resumePipeline:76–89` prüft gepinnte Pakete/Graph, findet aktiven Wait, validiert Signal und schreibt Signaljournal plus wait.resolved. `engine-snapshots.ts#validateSignal:112–118` prüft Wait-ID, Signaltyp, Issuer, Expiry und zeitliche Frische; die Issuerbehauptung setzt einen vertrauenswürdigen aufrufenden Host voraus, keine hier implementierte Benutzeranmeldung.

`recovery-state.ts#applyRecoveryEvent:161–166` speichert signal.payload als continuationGuidance. `pipeline-loop.ts:128` reicht diese Guidance an den neuen Approvalattempt weiter. `approval.ts#resultForApprovalGuidance:135–157` liefert bei rejected `blocked/approval.rejected`; `run-decisions.ts#stop:108–113` stoppt den Run. Es gibt weder automatischen Rückweg zu Nova noch einen strukturierten Reparaturauftrag mit neuem Planstand.

### 6. Konditionale externe Reparatur, Re-review und Wiederöffnung

Unter der **zusätzlichen Annahme externer manueller Behebung** können Architekturdateien geändert werden. Eingebettete Graphinputs dürfen bei Resume jedoch nicht verändert werden: `engine-snapshots.ts#verifyPinnedGraph:67–71` lehnt abweichenden Digest ab. Ein korrigiertes eingebettetes architecture-Objekt benötigt daher einen neuen Run; eine Änderung hinter einem unveränderten Pfad bleibt dagegen vom Graphdigest unentdeckt. Das sind unterschiedliche Fälle.

Ein blockierter Run benötigt `engine-admin.ts#reopenPipeline:24–28`. Der Adminpfad authentifiziert Actor/Allowlist, prüft identische Entscheidung und gepinnten Graph; remediation muss dem deklarierten `on.request_fix` entsprechen und ein nichtterminales Ziel mit Budget haben (55–81). Er kann einen vorhandenen Reparatur-/Reviewerpfad wieder aktivieren, erfindet aber keine fehlende Graphkante. `#remediate:121–127` setzt Target pending und ReturnTo; nach Erfolg setzt `run-decisions.ts#completeRemediation:124–129` den ursprünglichen Gate-Requester pending. Dies ist die konditionale technische Rückkante zum Gate.

**Konkrete Grenze:** Adminretry wie Adminremediation erhalten alte continuationGuidance durch Objektspread (`engine-admin.ts:112–127`). Die Rückkehr entfernt nur remediationTarget/-ReturnTo (`run-decisions.ts:124–129`). Bleiben im neuen Report Findings, ruft architecture-approval wieder die generische Approvalstage auf; diese verwendet dieselbe alte `rejected`-Guidance und blockiert sofort ohne neuen Wait (`human-approval/src/stage.ts:19–20`). Ein sauberer Report umgeht dagegen den generischen Pfad (architecture-approval.ts 111–117). Eine echte neue Operatorfreigabe bei verbleibenden Findings ist so nicht erreicht. Siehe F-T03-03.

### 7. Nur konditional: neue Acceptance → Blueprint/Preflight → Forgebereitschaft

Für einen **neuen, korrekt verdrahteten Run** oder nach späterer Ursachenbehebung kann der Reviewer den überarbeiteten Stand erneut liefern. Bei Findings ist eine frische Approval erforderlich; gültiges approved ergibt passed. Bei clean ergibt Architektur-Approval direkt passed. Graphready verlangt alle Ordinary-Dependencies in completed (`graph.ts:45–46`); completed enthält succeeded und skipped (`pipeline-loop.ts:86–108`). Ein falsch deklarierter Activationfact kann das Gate daher überspringen; das Plugin erzwingt nicht selbst die Pipelinepolicy.

Optional synchronisiert `blueprint-sync/src/stage.ts#execute:13–48` controlPaths aus branchRef über git.sync, committet returned synced paths, schreibt `blueprint.controls.synced` plus Artefakt mit blueprintId/branchRef/synced/missing. Missing ergibt request_fix **nach** möglichem Teilcommit. Der Bericht enthält weder aufgelösten Sourcecommit noch erzeugten Zielcommit und konsumiert keine Approvalreferenz.

Optional liest `preflight-contract/src/stage.ts#readBlueprint:53–73` `<modulePath>/FORGE.md` oder alle Substepdateien über `git.repository.read/read_text`. `validateDeclarations:75–93` prüft Dateibasename-Vorkommen für serveDockerfile/apiSpecFile; Bericht `preflight-contract:<moduleId>` enthält passed/failures. Fehlende Datei blockiert (113–130), fehlende Deklaration fordert Reparatur (132–139). Das ist kein semantischer Architekturreview und kein Inhaltsdigestvergleich. Der vorhandene **PCR-PREFLIGHT-001** gilt auch hier.

Erst nach erfolgreichen expliziten Dependencies ist Forge im Graph schedulingfähig. Die Compilerimplementation trägt dagegen baseRevision/requirements und Workspaces, jedoch keine Approvalevidenz (`compiler.ts:111–119`). **Endstatus dieses Traces:** Schedulingfähigkeit unter genannten Zusatzannahmen nachvollziehbar; durchgängige bindende Freigabe des korrigierten Architektur-/Modulplanstands nicht nachgewiesen.

## Daten-, Zustands- und Artefaktentwicklung

| Phase | Identität / Zustand | Persistenz und verbleibende Bindung |
|---|---|---|
| Runstart | runId, pipelineId, Graphdigest | run-snapshot.json pinnt Graph/Registry, keine externen Architekturdateibytes |
| Reviewerattempt A1 | runId/stageId/attemptId/attemptNumber | Effectkey korreliert Dispatch; Architekturbody task/architecture |
| Report R1 | artifactId/namespace/digest/sizeBytes/producer | Immutable JSON; checkedFiles sind Pfadbehauptungen, kein Sourcehash |
| Gate G1 | aktuelle Run-/Producerreferenz; waiting | Wait-ID aus Effectkey, Summary enthält R1-Digest |
| Reject | signalId/idempotencyKey/waitId/issuer | signals.jsonl und wait.resolved; continuationGuidance=rejected; Run blocked |
| Externe Korrektur | Plan-/Dateistand A2 | Keine eigene bindende Revision im Approvalvertrag; eingebetteter Graphinput nicht austauschbar |
| Admin-Re-review | neue Attemptnummer, R2 | Reportauswahl nimmt neuesten Producerattempt; alte Guidance bleibt auf Gate |
| Neuentscheidung | bei verbleibenden Findings erforderlich | Mit Altguidance erneuter Block statt G2; neuer Run trennt die Runidentität |
| Blueprint/Forge | blueprintId/branchRef bzw. moduleId/baseRevision | Keine technisch verifizierte Ableitung aus genehmigtem Source-/Plancommit |

## Findings und Ursachenbehebung

### F-T03-01 — Architektur-/Acceptancepflicht fehlt im Projectablauf

**Hoch; statisch bestätigte Zielbild-/Integrationslücke.** Auslöser: Start eines regulären nova-project.v1 mit manueller Architektur, erwarteter Reviewer-/Acceptancepflicht. Compiler erzeugt sofort Implementierung ohne diese Stages (`compiler.ts#compileProject:103–136`). Auswirkung: Die gewünschte Vorbedingung ist dort nicht technisch erzwungen; kein behaupteter Umgehungsangriff gegen eine bestehende Autorisierungsgrenze. Rootfix: Produktgraph aus expliziter Architektur-/Planreviewpolicy kompilieren oder den bewusst externen Approvalvertrag als signierte/digestgebundene zwingende Eingabe verlangen. Verifikation: Originalproject mit offenen Findings darf Forge nicht dispatchen; clean, repair und bewusst akzeptierte Findings jeweils getrennt durch echten Graph nachweisen. Bestehende Architektur-/Approvalreviews nennen die fehlende Compilernutzung, vergeben hierfür aber keine PCR-ID.

### F-T03-02 — Reportfreigabe ist nicht an geprüfte Source-/Planrevision gebunden

**Hoch; statisch bestätigte Vertragslücke, kein Laufzeitexploit behauptet.** Trigger: Architekturdatei oder branchRef ändert sich nach Review, vor Sync/Implementierung; oder der überarbeitete Modulplan wird nicht identisch erneut geprüft. Belege: `architecture-validator/src/protocol.ts:1–4,18`, `output.ts:61–82`, `human-approval/src/architecture-approval.ts:86–118`, `blueprint-sync/src/stage.ts:15–38`, `compiler.ts:111–119`. Der Reportdigest schützt Reportbytes; weder Leserrevision noch Blueprint-Zielrevision ist damit bewiesen. Graphpinning schützt nur eingebettete Daten. Fix: Reviewinput aus unveränderlichem Source-/Planmanifest ableiten, dessen Digest/Commit im Report, Approval, Sync und Implementation verpflichtend verifizieren; Ref einmal auflösen und gemeinsam mit Zielcommit aufzeichnen. Regression: echte Gitbranches nach Review bewegen und erwarten, dass Sync/Forge ablehnen; gleicher Report bei veränderten Quelldateien darf keine gültige Freigabe sein. Kein Duplikat von PCR-PREFLIGHT-001, das nur Dateinennung betrifft.

### F-T03-03 — Nach Ablehnung erhält administrative Gatefortsetzung die alte Ablehnung

**Mittel; statisch bestätigter mehrkomponentiger Zustandsdefekt.** Trigger: Approval über echtes Resume rejected → blocked, zulässige Adminremediation zu erneutem Review, R2 besitzt weiterhin genehmigungsfähige Findings. `recovery-state.ts:161–166` speichert rejected; `engine-admin.ts:112–127` kopiert es weiter; `run-decisions.ts:124–129` löscht es nicht; `pipeline-loop.ts:128` bevorzugt es; `human-approval/src/stage.ts:19–20` beantwortet es sofort erneut mit blocked. Auswirkung: Operator kann verbleibende/neue Findings nicht frisch entscheiden; Gatefortsetzung stoppt trotz erfolgreicher Reparatur. Bei R2 ohne Findings greift der dokumentierte Clean-Shortcut, deshalb keine pauschale Behauptung, dass jede Reparatur blockiert. Rootfix: Re-review/Remediation erzeugt neue Entscheidungsgeneration, invalidiert alte Guidance und Waits sowie betroffene Approvalzustände; Adminpfad dieselbe geprüfte Invalidierungslogik wie `lifecycle/remediation.ts#applyRepair:38–51` verwenden, unter Beibehaltung von Audit/Budgets. Regression: echte Engine/Wait-/Artifactstores, Ablehnung → Adminremediation → Restfinding → neuer Wait → neue Zustimmung; alte Signale weiterhin ablehnen. In diesem Trace nicht ausgeführt.

### Vorhandene Befunde, nicht neu nummeriert

| Kennung | Relevanz für T03 | Hier geprüfter Bezug |
|---|---|---|
| PCR-EXEC-001 | Crash nach durable Attempt-Waitresult vor separatem Waitereignis kann Resume blockieren | `stage-executor.ts:133–135` → `run-decisions.ts:100–105` → `engine-run.ts:95–101` |
| PCR-EXEC-002 | Architekturreportblob existiert, fehlt aber nach Crash im Resultartefaktindex | `stage-executor.ts:44,96–105,133–135` → `run-decisions.ts:28–32,48–54`; Approval verlangt sichtbare Referenz |
| PCR-APPROVAL-001 | Schema erlaubt agentRole, strikter Runtimeparser lehnt es ab | `human-approval/src/approval.ts:67–82`; Originalreview gelesen |
| PCR-PREFLIGHT-001 | Beliebige Basenamenennung reicht als Lieferdeklaration | `preflight-contract/src/stage.ts:75–93`; keine stärkere Behauptung |
| PCR-GIT-001 | sync_paths klassifiziert Gitfehler als missing; Reparaturpfad kann falsche Ursache melden | Blueprintsync-Komponentenreview gelesen; Gitadapterursache nicht erneut vollständig verfolgt |
| PCR-OPERATOR-001 | Persistierte Deliveryfailure verhindert erneuten tatsächlichen Send desselben Attempts | `operator-messaging/src/adapter.ts:91–105,149–172`; zentrale Eigentümerkennung beibehalten |

Quellen dieser Kennungen: [human-approval](../components/kubeclaw.human-approval.md), [architecture-validator](../components/kubeclaw.architecture-validator.md), [nova.execution](../components/nova.execution.md), [blueprint-sync](../components/kubeclaw.blueprint-sync.md), [zentrales Register](../findings.md). Keine Infrastrukturdefekt-ID neu behauptet; erforderliche persistente Stores und authentifizierter Operatorzugang sind Laufzeitvoraussetzungen.

## Gegenprüfbare Randbedingungen und offene Nachweise

- Doppelte/verspätete Signale: `engine-run.ts:92–108` verlangt bestehenden aktiven Wait, idempotentes Signal und keine zweite Auflösung; `engine-snapshots.ts:112–118` lehnt falschen Issuer, abgelaufenen Wait und zeitlich altes Signal ab. Authentifizierung des aufrufenden Menschen bleibt Hostpflicht.
- Abbruch/Timeout: `stage-executor.ts:117–140` raced Ausführung, markiert Timeout/Abbruch, widerruft Lease. Dies beweist keine sofortige Beendigung eines bereits extern laufenden LLM-Auftrags.
- Mehrere Speichergrenzen: Dispatch → Artefaktblob → Attemptresult → Resultindex → Gate-Waitstore → Deliveryrequest/-Receipt → Corewait → Signaljournal → wait.resolved sind separate Commitpunkte. Keine gemeinsame Transaktion behauptet. Bestehende PCR-EXEC-001/002 statt neue Doppelbefunde.
- Blueprintsync kann vor request_fix bereits vorhandene Teilpfade committen; Recovery und HEADdrift benötigen später echten Git-/Crashnachweis. Graphremediation invalidiert normale Descendants via `remediation.ts:13–51`, externe Dateiedits allein tun dies nicht.
- Discorddarstellung enthält nicht automatisch die Approvalkorrelation. Offen bleibt ein belegter, authentifizierter Operator-Rückkanal inklusive Zugriff auf ungekürzten Report. Hier nur Integrationsnachweis offen, keine pauschale Aussage, Discord könne generell keine Entscheidungen verarbeiten.
- Reportgrößen: Validator erlaubt bis 128 Findings mit langen Texten (`output.ts:32–57`), Approval höchstens 256 KiB (`architecture-approval.ts:95–96`). Große interoperable Reports sind offen; nicht als reproduzierter Fehler verkauft.

## Tatsächlich durchgeführte Prüfung und Tests

Durchgeführt: statisches Lesen der oben genannten Originaldateien am SHA, Übergabe-/Rückgabeabgleich, Zustandsfortschreibung anhand Reducer/Recovery/Admincode, Lesen der vier genannten Originalkomponentenreviews und des zentralen Befundregisters. Keine Repositorytests, CI, Deployments, realen Agents oder Gitoperationen ausgeführt.

Inspektierte Tests **NICHT AUSGEFÜHRT**:

- `skills/nova/plugins/architecture-validator/tests/protocol.unit.test.ts:7–52`: erlaubt error/passed, lehnt blocking/passed sowie request_fix ab; reine Parser-/Promptprüfung, kein Architekturlauf.
- `skills/nova/plugins/human-approval/tests/architecture-approval.unit.test.ts:9–35`: echter Artifactadapter, handgebauter Context; schützt exakte alte Digestreferenz gegen später geschriebenes Objekt, prüft Run-/Größen-/Ambiguitätsfälle. Test deckt weder Sourcecommitbindung noch Reject→Repair→Re-review→neue Zustimmung ab.

Die historischen Testresultate der Komponentenreviews wurden nicht übernommen als „hier bestanden“. Offene Laufzeitnachweise: echter Reviewer mit gepflegtem Modulplan, vollständiger expliziter Gategraph, authentifizierter Operatorresume, Reparatur mit verbleibendem/neuem Finding, veränderte Source-/Planrevision, Crashpräfixe über alle Speichergrenzen und anschließender Forge-Dispatch nur für identisch autorisierte Quellen.

## Empfohlene spätere Reihenfolge

1. Festlegen und technisch verdrahten, wo Architektur-/Plan-Acceptance verpflichtend ist (Projectcompiler und/oder bindender Eingangsvertrag).
2. Unveränderliche Source-/Planmanifestbindung von Review bis Forge herstellen.
3. Repairentscheidung und neue Approvalgeneration einführen; Admin-/Normalremediation einheitlich invalidieren (F-T03-03).
4. Vorhandene Core-Wait-/Artefakt-Recoverybefunde und Approvalschemaabweichung beheben.
5. Originale komplette Gate-/Operator-/Git-Kombination einschließlich Crash und Refdrift ausführen. Statischer Trace bleibt kein bestandener E2E-Test.
