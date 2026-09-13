# Aktueller Umsetzungsstand

Prism-Bereinigung: Der aktive Control-/Worker-Pfad ist ausschließlich V3; Legacy-Dispatcher, V1-Executor/-Producer, gemeinsame Prozessmessung und zweiter CLI-Einstieg sind entfernt. Helm und Preflight bieten keinen Legacy-Schalter mehr. Lokale Prüfungen und vorbereitete echte Native-Gates: [Single-Runtime-Checkpoint](implementation/pr6-prism-single-runtime.md). Busters bestehender UID-Wechsel kollidiert mit dem vollständig entrechteten nativen Host; dazu liegt eine neue [Entscheidung zur Startberechtigung](implementation/pr6-buster-launch-authority-decision.md) vor. **137 lokal verifiziert / 17 unvollständig**, keine pauschale Finding-Schließung.

D16 ist ausdrücklich bestätigt: feste Host-Reservierungen für Buster und Prism. Gesamtbudgets, vollständige Pending-/Active-Admission-Reservierungen, generierte Hostvorbereitung und read-only Prüfung von echtem Node/Kubelet/cgroup sind implementiert und lokal geprüft. [Checkpoint](implementation/pr6-node-pools-checkpoint.md). **137 lokal verifiziert / 17 unvollständig**, keine zusätzliche Schließung. Runtime-/Chart-/V3-Start und vollständige Buster-Fixture-Integration bleiben in Umsetzung; keine erneute Freigabe von D16 erforderlich.

Stand 2026-09-13: **137 lokal verifiziert / 17 unvollständig** (3 teilweise implementiert, 3 in Bearbeitung, 11 offen). Neu nach D12 abgeschlossen: IFR-12-001, separate LiteLLM-PostgreSQL-Recovery mit echtem Restore und originaler Crypto-/Konfigurationsprüfung. Code/Nachweise: `9e725b35e0e623708f7f0e26ed120fc6ac60eb68`; [Checkpoint](implementation/pr6-postgresql-recovery-checkpoint.md). Vollständige Image-/Cluster-/API-Live-Abnahme übernimmt der Auftraggeber. Cross-Store-/Off-Node-Recovery und alle vier ursprünglichen Findings bleiben unvollständig. Alle nachfolgenden Zähler sind historische Stände.

Stand 2026-09-13: **136 lokal verifiziert / 18 unvollständig** (3 teilweise implementiert, 3 in Bearbeitung, 12 offen). Neu nach D12 abgeschlossen: IFR-15-001, Prism-Datenbankmigration und Credential-Rollbackgrenze. Code/Nachweise: `8d47764b7b276c783f312198d6987b9197e593e4`; [Checkpoint](implementation/pr6-stateful-upgrade-checkpoint.md). Die vier ursprünglichen Core/Buster/Prism/Observability-Findings bleiben unvollständig. Redis/PostgreSQL-Pins und Upgrade-Preflights sind ergänzt, vollständige Daten-/Storage-Migrationen bleiben offen. Alle nachfolgenden Zähler sind historische Stände.

Aktueller Folgecheckpoint: **131 lokal verifiziert / 3 teilweise / 1 in Bearbeitung / 19 offen**. Von den zuletzt angefragten7 sind3 abgeschlossen;4 bleiben. SDK-Nachweis: implementation/pr6-sdk-local-verification.md. [Risiko-/Registry-Nachweise](implementation/pr6-risk-and-registry.md). Ältere Zähler unten sind historische Stände.

Aktueller Stand nach D12 (2026-09-12): **128 lokal verifiziert / 5 teilweise / 2 in Bearbeitung / 19 offen**. Von den39 sind34 lokal abgeschlossen. Live-Abnahmen folgen separat durch den Auftraggeber nach Open-Sourcing. Maßgeblich sind [D12](decisions.md#d12--lokaler-abschluss-und-separate-live-abnahme), [Einzelbewertung](implementation/pr6-local-acceptance.md) und [Register](register.json). Ausschließlich im bestehenden PR #6 und dessen Branch weiterarbeiten; frühere Anweisungen zu weiteren Fixbranches gelten nicht. Die folgenden älteren Stände bleiben historischer Verlauf.

## Fortsetzung 2026-09-12 auf konsolidiertem main

Die Einzelprüfung bestätigt **94 verifiziert / 39 teilweise / 2 in Bearbeitung / 19 offen**. Die veralteten drei Markdown-Zeilen und die Summe 42 sind korrigiert; keine neue Finding-Hochstufung. Supervisor-Lease-Besitzwechsel und Freigabe sind jetzt mit dem vorhandenen FileMutex serialisiert. Originaler Operations-Prüfeinstieg: **20/20 bestanden, keine Skips**, begrenzter kanonischer Lint bestanden. Native Adoption bleibt durch fehlende Child-cmdline in procfs blockiert. [Abgleich, Ursachenfix, Nachweise und Restarbeit](implementation/resume-20260912-supervisor-lease.md).

Die Änderungen werden über den bestehenden Branch `fix/remediation-foundations-20260909` als PR gegen main bereitgestellt. Der folgende Stand vom 11. September bleibt als Verlauf erhalten.

## Historischer Stand 2026-09-11

2026-09-11. Branch `fix/remediation-foundations-20260909`. Ausgangscode bleibt als
historische Baseline `85ddfcbf` dokumentiert; neue Implementierung ist in getrennten
Fixcommits gesichert. Originalberichte werden nicht nachträglich umgeschrieben.

**94/154 lokal verifiziert und unabhängig gegengeprüft; 39 Findings teilweise implementiert; 2 in Bearbeitung; 19 noch offen.** Zusätzliche Integrationsbefunde bleiben separat von den 154 historischen Kennungen dokumentiert. Keine pauschale Regressionsfreiheit, kein Deployment und keine vollständige Pipeline-E2E-Freigabe.

Welle47: **8/47 ursprüngliche Abnahmen unabhängig bestanden, 39/47 noch nicht abgeschlossen**. [Einzelnachweis](implementation/wave47-root-review.md), [eingefrorene Menge](partial-47-scope.json), [ID-Fortschritt](partial-47-progress.json).

Aktueller gesicherter Lauf: [Fortsetzung nach vorzeitigem Stopp](resume/run-20260911-a51d-resumed.md). Die fehlenden 84 Minuten wurden nachgeholt; an der Grenze 18:18:11 UTC wurde die Ursachenarbeit gestoppt. Letzter unabhängig geprüfter Quellstand: `550eb948ec8766b38e8c8d4ccb88a1fdab28e61a`. Worker-, Supervisor-, Release- und Buster-Ursachenbehebungen sowie Nachweise sind gesichert. Stand 94/39/2/19 bleibt unverändert; verbleibende Implementierung und native Gesamt-Abnahmen sind einzeln dokumentiert.

Aktuelle Wiederaufnahme: [geprüfte Pakete, Integrationsnachweise und konkrete Restarbeit](implementation/resume-20260909.md). Die nachfolgenden chronologischen Zwischenstände bleiben historische Belege und sind keine Behauptung aktuell laufender Subagents.

| Bereich | Remote-Commit | Stand / Nachweis |
|---|---|---|
| State/Locks + Effectpayloadbesitz | `4cd09442ad34e4927d82b59c8681bb7ad10cf31b` | PCR-STATE-001/002 lokal verifiziert; [Nachweis](implementation/state.md), ergänzend [Effects](implementation/effects.md) |
| Effect-Locklebensdauer | `8711c9d1ac0e0e12257629505643dee5ff5ee0a4` | PCR-EFFECT-001 lokal verifiziert; [Nachweis](implementation/effects.md) |
| SDK/Prompt | `b85b4c18fedcfb5a509295c082d59aab631b0617` | SDK-002/Prompt-001 lokal verifiziert; SDK-001 teilweise; [Nachweis](implementation/contracts.md) |
| Manifest/Registry/Paketprüfung | `b39d0e16c171b3be237b3288beb5a6dae5dc332d` | Vier zugeordnete Findings lokal verifiziert; [Nachweis](implementation/registry.md) |
| Prism-Domain | `9d651a8851b5a0bfa05ffbc03a0fb58e4ac23882` | Drei Domainfindings lokal verifiziert; [Nachweis](implementation/prism-domain.md) |
| Attempt-Recovery | `e5a16848eb3287070560af910238774f05541fed` | PCR-EXEC-001/002 lokal verifiziert; [Nachweis](implementation/recovery.md) |
| Admission-/Attempt-Replay | `9162c9272748246343febdd00cf494cd2e9a198f` | PCR-OBS-001 lokal verifiziert, zwei zusätzliche Reviewerblocker behoben; [Nachweis](implementation/observability-replay.md) |
| Agent-/Prism-/Test-Gate-Verträge | `f22afee989872e9c999eee6499b1a0ecdafd882e` | Fünf Findings lokal verifiziert; [Nachweis](implementation/contracts-2.md) |
| Prozessgruppen/HTTP-Streaming | `76bb9fd75f2f9367a27a48dc67e95b3c76a1c826` | NETWORK-001/002 lokal verifiziert; COMMAND-001 danach erneut geprüft und im Folgecommit korrigiert; [Nachweis](implementation/process-network.md) |
| Nova Remotegrenzen | `b4e64ce83ae3ee327f7c7086ba125ca89b026487` | NOVA-GATE-003/004 lokal verifiziert; [Nachweis](implementation/nova-remote-boundaries.md) |
| Lint | `82902a198229488b84e0f6f9dd421104aad5209e` | LINT-001/002/003 lokal verifiziert, vollständige Paketsuite mit Shelltools; [Nachweis](implementation/lint.md) |
| Git / Repository | `4301b03bcdd8d06dafd45414bd3e2c7ecf164928` | GIT-001/REPOSITORY-001 lokal verifiziert; [Nachweis](implementation/git-repository.md) |
| Telemetrie | `9e12ab76d085d1d050fb4ad08b55969ede4407cf` | TELEMETRY-CONTRACT-001/002 lokal verifiziert; [Nachweis](implementation/telemetry.md) |
| Buster / Command Folgefix | `aa10f3eb7fac33769f24fc3d41c628756e895d7a` | ENGINE-002/003, KUBERNETES-FIXTURE-002, COMMAND-001 verifiziert; ENGINE-004 teilweise; [Nachweis](implementation/buster-engine.md) |
| Observer / Ingress | `fecd391d1af516ee3838f797fb3a96afc81e9cf2` | HOSTOBSERVER-001/002, AGENTSOURCE-001 verifiziert; [Nachweis](implementation/observer-ingress.md) |
| Contract-Importgrenzen | `b5143cf6d099af0f9af683cb596b9640e3a58946` | Zusätzliches INT-BOUNDARY001 verifiziert, separat von154; [Nachweis](implementation/registration-contract-boundary.md) |
| Nova Deadlines / Reconciliation | `508aef31cbf32218c2f03441f617eccfc7c5d634` | NOVA-GATE-001/002 verifiziert;005 Vollprozessnachweis blockiert; [Nachweis](implementation/nova-gate-deadlines.md) |
| Git-disabled Chart | `941c6cdb632a4900535361228abe77fc4374fc37` | IFR-19-002 per echtem Render verifiziert; [Nachweis](implementation/role-git.md) |
| Studio Service | `7df0919a6e23d483862f12d8437d412764474406` | STUDIO-SERVICE-001 verifiziert; [Nachweis](implementation/studio-service.md) |
| Providersemantik | `42a56fc06b7d347dd8ada01d51475bbf4b1c1041` | Sechs Findings verifiziert; [Nachweis](implementation/test-provider-semantics.md) |
| Ingestion Service | `e51b6b4a77ad726ea2dc29d9e94f0692606f670a` | INGESTION-001 verifiziert; [Nachweis](implementation/ingestion-service.md) |
| Namespacegebundene Secretprüfung | `94cafe67c2b03bad5869c36a4b7975e0c27968df` | IFR-17-001 per echtem Render verifiziert; Live403 offen; [Nachweis](implementation/verification-secret-rbac.md) |
| Isolation | `8feafb7fb9ae8a1425fe9439dae668f07b551d70` | ISOLATION-001/003 verifiziert;002/004 Kernelabnahme blockiert; [Nachweis](implementation/isolation.md) |
| Administrative Reparaturinvalidierung | `36d131179bd0bd9c0e706d404077124eac3717ec` | PATH-T04-003 / APPROVAL-001 verifiziert; [Nachweis](implementation/approval-invalidation.md) |
| Registry-Startlatenz | `8ea0cc2d4c4446e25a08a32ee1e52e2cc1efb932` | Zusätzliches INT-STARTUP-LATENCY001; unveränderte vollständige Phase6 besteht wieder; [Nachweis](implementation/registry-startup-latency.md) |
| Prism-Artefakte | `1bf865b076df2a4722d27c0a4e5f839f452a5a31` | STORAGE-001 verifiziert; [Nachweis](implementation/prism-artifacts.md) |
| Forge-Workspaces | `700d92958fff206b325ef1ecccc6e9cca0bb9bca` | IMPLEMENTATION-001 / PATH-T07-001 / T06-F01 verifiziert; [Nachweis](implementation/forge-workspace.md) |
| Corpus-Transaktion | `5e4394203f2cfed57a2c404ba045cd1ac8ad9646` | CORPUS-001 teilweise; Native-Poolgate ausdrücklich unter `test:corpus-pool`, Folgecommit `2900148687ea525f4367a32dad04b6394f4225f5`; [Nachweis](implementation/prism-corpus.md) |
| Renderer / Studioeditor | `a5b09cf32a886deb3205126c9d1eb8ef9fc44f43` | RENDERER-001 / STUDIO-001 verifiziert, jeweilige002 Browserabnahme blockiert; [Nachweis](implementation/prism-renderer-studio.md) |
| Reviewplugin | `10440ac1e20e3744cfe78e70182c2dd17bacd801` | Sechs Findings plus zusätzliches INT-REVIEW-UNCERTAIN001 verifiziert; [Nachweis](implementation/review.md) |

Jede Änderung enthält Originalregressionen oder konkrete echte Verifikation und
eine unabhängige Gegenprüfung durch einen anderen Agenten. Separate lokale
Commit-SHAs unterscheiden sich wegen der materialisierten Reviewhistorie; für
das Behebungsregister gelten die obigen **GitHub-Commits**. Keine fremden
Branches wurden überschrieben, kein Merge ausgeführt.

## Konkrete Einschränkungen und offene Gates

- **SDK-001 bleibt teilweise:** ungültige/mehrdeutige Nicht-JSONwerte werden nun
  abgelehnt, akzeptierte bisherige Bytes bleiben erhalten. Portable Ordnung würde
  bestehende Digests ändern und braucht eine explizite versionierte Umstellung.
  Keine automatische Umschaltung und kein Fallbackserializer eingeführt.
- **Lockumstellung:** vor späterem Rollout alle alten PID-Lockwriter stoppen.
  Gemischte alte/neue Writer sind unsicher. Nova installiert util-linux explizit
  und prüft flock im Dockerbuild. Source-Deploymentcheck bestanden, aber hier
  kein Image gebaut/gestartet; Linux-Dateisystem-/Container-Betriebsabnahme offen.
- **Übergreifender Plugin-v2-Gate:** auf sauberem isoliertem Commit `9b4e68a`
  tatsächlich erneut ausgeführt. SDKprüfung, alle Pluginbuilds, nativer
  Sandboxbuild, Runtime-Typecheck und aktive Contract-/Agentoutputprüfungen
  bestehen. Danach scheitert Boundaryprüfung an fehlendem generiertem
  Agent-Observability-Contract im Hostobserver. Der vorhandene lokale generierte
  Stand wird nicht als reproduzierbarer Build aus sauberem Checkout gewertet.
  Generierungs-/Buildreihenfolge wird ursächlich korrigiert; spätere Gates liefen
  noch nicht. Eine vorherige Ausführung mit unvollständigem Log wird nicht als
  Beleg benutzt, ebenso keine Ausführung auf parallel verändertem Budgetcode.
- **Docs-Referenzcheck:** scheitert an historischen Review-Kurzpfaden und
  Zeilenangaben, die der Checker als Dateinamen interpretiert. Neue temporäre
  Prism-Testpfadangabe wurde korrigiert. Historische Befunde nicht gelöscht, um
  den Checker zu bestehen. Globaler Docscheck bleibt separat offen.
- Go1.24.13, ShellCheck0.11.0, shfmt3.13.1 und kubectl1.35.6 lokal aus offiziellen
  Quellen mit Prüfsummen bereitgestellt; vorhandenes Helm3.18.4 verwendet.
  Kein frischer Gesamtinstall behauptet. Node v24.19.0 und util-linux/flock
  vorhanden. Workspacepakete lösen auf den geänderten Code dieses Worktrees auf.
- **Isolation:** native Sandbox gebaut; lokale Protokoll-/Hosttests bestehen.
  Echte Prozessbaum-/Cgroup-Speicherabnahme bleibt durch fehlende proc-children
  und schreibbare Cgroup-Delegation blockiert. Kein Ersatz für Kernelbelege.
- Keine Clawdeck-/Kubernetes-/Tailscale-/Host-Powerlossprüfung; PGlite belegt lokale
  echte DBtransaktionen, nicht einen externen PostgreSQL-Produktionsdienst.

## Teilweise / blockiert

- SDK-001: sichere JSON-Eingaben geprüft; portable Ordnung/versionierte Digest-
  Umstellung offen, bestehende Bytes bleiben bis kontrollierter Migration erhalten.
- BUSTER-ENGINE-004: bestätigte temporäre Eingaben werden entfernt; unsichere
  Restart-/Orphanfälle behalten Daten bis zum Besitz-/Terminierungsnachweis.
- NOVA-GATE-005: Graphreader korrigiert, tatsächlicher Prozess-Restart erreicht
  wegen Sandboxfehler die neue Assertion nicht.
- ISOLATION-002/004: native Prozess-/Cgroupmechanismen implementiert;
  Credential-drop-/Host-SIGKILL-/OOM-Kernelabnahme mangels Hostdelegation blockiert.

- CORPUS-001: SQL-Transaktionsscope und PGlite-Rollback geprüft. Echte PG17.5/
  pgvector0.8.0 gebaut, aber initdb verweigert legitimerweise Root; Usernamespace
  erlaubt keinen anderen Benutzer. Native Mehrverbindungsprüfung nicht ausgeführt.
- RENDERER-002 / STUDIO-002: Node-/HTTPgegenstellen geprüft, aber echte iframe-
  Interaktion/Bilddekodierung/CSP mangels Chromium noch nicht ausgeführt.

## Laufende nächste Arbeit

- WP04: getrennte monotone Budgets (2 je Modul/Lint/Review/Test) und einmaliger
  zusätzlicher Nova-Auftrag in Umsetzung. Der bisherige eine technische Retry
  bleibt separat erhalten. Sourcebindung und Risk-Acceptance danach.
- WP07: atomare Direction-/Preferencecommits mit expliziten wiederverwendbaren
  Requestkennungen sowie Worker-Voll-Logspeicher und Control-Ergebnisbindung.
- WP09: Redis-Zielidentität/RESP-Budgets zuerst, Operator-/Benachrichtigungs-
  Retrysemantik danach. Lokale echte Dienste, keine externen Nachrichten.
- WP09: veraltete Observerzahlen in Release-/Importsicherheitsprüfungen auf
  tatsächliche erwartete Identitäten abgleichen.
- Übergreifend: sauberen Hostobserver-Contractbuild herstellen und isolierten
  Plugin-v2-Gate fortsetzen. Neue Blocker werden nicht ausgeblendet.
- BUSTER-ENGINE-001 weiter offen: Cancellation allein belegt kein hartes
  aggregiertes CPU-/Speicher-/Prozessbudget.

Nächster Integrationsschritt: weitere Änderungen erst nach Gegenprüfung und
Originalregressionen getrennt committen. Nicht abgeschlossene Arbeitsdateien
gehören nicht in einen als geprüft gekennzeichneten Fixcommit.
Fortschritt nach drei abgeschlossenen Findings oder spätestens zehn Minuten.


## Fortsetzung und neue gesicherte Pakete

- Telemetrie-Prüfprogramme: `8a7754b08db32923e7e2809fbce35832c3880c11`; konkrete Observeridentitäten und Rollen statt veralteter Anzahl geprüft.
- Redis: `50b692e16f64b84c5ef072ba72ae7f9153631348`; echte Server-/Wiretests und unabhängige Gegenprüfung bestanden. Externe Streammigration bleibt Betriebsaufgabe.
- Prism-Entscheidungen: `84b7048c41f8f12420daa0ac5e7f383eb4fe5959`; atomare SQLquittung und erforderliche Idempotency-Key-Weitergabe durch Studio geprüft. Voller PostgreSQLdienstnachweis offen.
- Prism Worker/Control: `a328cfc29c20094a66d826237e4b347f89ba33a9`; Pflichtvoll-Log und gebundene Evidenzannahme geprüft. Voller PostgreSQLdienstnachweis und bestehende Servicelintbefunde offen.
- Observerbuild: `e3ae22ba92c533fbbadd6ec744f9db32051234a0`; echte saubere Compilierung und drei Rollenbundles unabhängig geprüft. Übergreifender Gate auf exakt diesem committed Stand läuft separat. Der zuvor dokumentierte fehlende Generator ist behoben; spätere Gates noch nicht bestätigt.
- Budgetgegenprüfung: `4fb4e50fa8ec59437e5f372d202aa692d9d6252a`;12 Budget-/Recoveryfälle und13 Originaltests bestanden. Nach Nova-Zusatzauftrag führen auch terminale Fehler zu blocked. Unveränderter Fehlerbericht bleibt erhalten.
- Neue Arbeit: Operator-/Benachrichtigungszustellung, Containerbuild-/Registrydeadline und Medientypen, Namespacebroker und Aliasressourcenbudget.
- Die Markdown-Statusspalte wurde vollständig aus dem JSONregister abgeglichen; der frühere Aktualisierer hatte einzelne Zeilen trotz korrektem JSON-/Summenstand unverändert gelassen.

- Übergreifender Gate auf lokal `d3c20536210c918e32dce24dce09254198fac8a0` / remote `e3ae22ba92c533fbbadd6ec744f9db32051234a0`: sauberer Observerbuild, SDKprüfung, Pluginbuilds, Sandboxbuild, Runtime-Typecheck, Verträge, Agentoutput, Boundaries, Plattformkonfiguration, Registry, Importsicherheit, Lifecycle, Phase6 und Phase7 bestanden. Phase11 stoppt mit `ISOLATION_CGROUP_REQUIRED`, da das originale npm-Prüfkommando keinen erforderlichen Cgroup-Pfad übergibt. Spätere Gates liefen nicht. Log-SHA256: `05e076100064965666f9cfc0d360c1bf76a0f155b0745cd951e0eb81ad79a0a9`. Keine Gateabschwächung.
- Aktuelle Quellenbindung: PATH-T04-001 in Umsetzung; Präferenzweitergabe PATH-T02-001/PCR-PRISM-PREFERENCES-001 ebenfalls aufgenommen.

## Weitere geprüfte Integrationen

- `5323654a94d8818aabf88e61db133ca7a182f438`: Build-/Registrydeadline und Outputverträge korrigiert, echte HTTP- und Produktionsvalidatorprüfungen bestanden. BuildKit-/Native-Runner-Nachweise weiterhin blockiert.
- `0ba923525b62faedd78bef3958af50c9e0286d47`: Benachrichtigungstexte korrigiert, stabile Zustellkennung von technischen Versuchen getrennt. Tatsächliche localhost-Quittung und Retrygrenzen geprüft; vorgesehenes externes Empfangsprotokoll noch zu integrieren.
- `9a566c7c884561f1cb17af500fdc842f22bac5fb`: Broker liest Token bei jeder Anfrage, prüft kanonische Leasekennung und genaue konfigurierte RBAC. Parserbudgets und konfigurationsgebundener Admissionzaun vorhanden. Lokale Go-/HTTP-/Parser-/Helmtests bestanden; Liveadmission/Upgrade offen.
- `924d108add632baca37b5b669bf493b29d789ffc`: Originalprüfkette übergibt erforderlichen delegierten Cgroup-Pfad an Phase11, Isolation und External-Engine. Fehlende/ungültige Konfiguration bleibt sichtbarer Fehler; keine Kerneltests übersprungen.
- Budget-Typecheck und12Tests zusätzlich auf sauberem exaktem Commit bestanden, siehe [Integrationsnachweis](implementation/integration-resume.md).

## Fortsetzung: Supervisor, Präferenzen und Telemetriespeicher

- PCR-SCAFFOLD-OPS-001: implementiert; Remote `1002eb732484f32ae5b5fbd17f402575afc721b8`. [Nachweis](implementation/review-supervisor.md). Five genuine supervisor/status CLI regressions and independent source review pass; native adoption gate fails visibly because actual child procfs cmdline is unavailable. Complete real pipeline start/recovery remains unexecuted.
- PCR-PRISM-PREFERENCES-001: verifiziert; Remote `9a3eff16529032b8a166f09894b3490ccebfc590`. [Nachweis](implementation/prism-preferences.md). Original reducer and SQL regressions verify collision-free user/project/scope identity, scoped retraction, explicit consent and project overrides; trusted platform subject checked before query. Independent review and targeted builds pass.
- PATH-T02-001: implementiert; Remote `9a3eff16529032b8a166f09894b3490ccebfc590`. [Nachweis](implementation/prism-preferences.md). Persisted generation snapshot reaches original bridge prompt with generation identity. SQL, configuration and bridge process boundary pass; native PostgreSQL/full Control plus real OpenClaw generation and result callback remain unexecuted. Active architecture/round binding tracked separately in PATH-T02-002/003.
- PCR-TSTORE-001: verifiziert; Remote `b0301205076b7914b732f2af42e9fac7895ece4a`. [Nachweis](implementation/telemetry-store.md). Original adapter and real durable file store regressions, original engine integration, package build/tests and canonical lint pass; independent review confirms protected-field policy. Full D01 trusted demo provenance remains separate work.
- PCR-TSTORE-002: verifiziert; Remote `b0301205076b7914b732f2af42e9fac7895ece4a`. [Nachweis](implementation/telemetry-store.md). Real adapter/store rejects malicious and over-budget graphs before persistence; exact depth/node/byte bounds, shared references, descriptors and no partial write verified. Root reran tests and canonical lint after complexity refactor.

Quellenbindung und Tailscale bleiben vor dem Commit in unabhängiger Nachprüfung: Ein externer Commit im Forge-Arbeitsbaum darf nicht als freigegebene Herkunft übernommen werden; Tailscale muss Besitzerwechsel im Status erkennen und abgebrochene Übernahmen ohne verwaiste Exposures auflösen. Die bestehenden grünen Tests deckten diese Gegenfälle nicht ab. Worker-Claim-Zeitgrenzen und Prism-Generationsrunden werden parallel bearbeitet.

## Quellenbindung, Tailscale und Release-Konfiguration gesichert

- PATH-T04-001: verifiziert; Remote `dda66cc588d9aec61de0a695f6e5b312d3427ab4`. [Nachweis](implementation/approval-source-binding.md). Original engine/Git/artifact/wait path: final17 tests pass. Independent reviewer reproduced and rechecked worktree-source and renewal defects; mode/symlink regressions pass. Root source-boundary review complete. No live model or deployed role E2E claim.
- PCR-TAILSCALE-001: verifiziert; Remote `02d94751551defdb633442f1c42689a00d9f7a7f`. [Nachweis](implementation/tailscale-exposure.md). Original provider tests cover implicit/explicit80,8080, unauthorized host and service mismatch; builds/typechecks pass.
- PCR-TAILSCALE-002: verifiziert; Remote `02d94751551defdb633442f1c42689a00d9f7a7f`. [Nachweis](implementation/tailscale-exposure.md). Explicit Kubernetes protocol-prefix probes with native kubectl and actual controller Go race suite pass, independently repeated. Same-spec owner/generation status and canceled/chained takeover cleanup corrected. No live Tailnet or seven-day handoff proof.
- IFR-23-001: verifiziert; Remote `b577332be3f9d61735d26c6d24074a861a7450bd`. [Nachweis](implementation/release-configuration.md). Five original Git/Helm tests pass independently: exact family chart/value source binding rejects incompatible newer configuration before materialization. Canonical lint and workflow YAML validation pass. No live migration/override compatibility claim.
- IFR-07-001: implementiert; Remote `fc136fc8d1351f9ef6bccfafa9f63dd55addbce2`. [Nachweis](implementation/rollout-health.md). Actual Helm/config sensitivity passes; LiteLLM endpoints traced through digest-verified OCI metadata to exact original source1.101.0. Real Envoy peer rejection, LiteLLM process/DB-fault transitions and Prism cross-node active-write upgrade remain unexecuted. No deployment.
- IFR-14-001: implementiert; Remote `fc136fc8d1351f9ef6bccfafa9f63dd55addbce2`. [Nachweis](implementation/rollout-health.md). Actual Helm/config sensitivity passes; LiteLLM endpoints traced through digest-verified OCI metadata to exact original source1.101.0. Real Envoy peer rejection, LiteLLM process/DB-fault transitions and Prism cross-node active-write upgrade remain unexecuted. No deployment.
- IFR-20-002: implementiert; Remote `fc136fc8d1351f9ef6bccfafa9f63dd55addbce2`. [Nachweis](implementation/rollout-health.md). Actual Helm/config sensitivity passes; LiteLLM endpoints traced through digest-verified OCI metadata to exact original source1.101.0. Real Envoy peer rejection, LiteLLM process/DB-fault transitions and Prism cross-node active-write upgrade remain unexecuted. No deployment.

Die zuvor genannten Quellenbindungs-/Tailscale-Blocker sind behoben und unabhängig nachgeprüft. Aktuell laufen Worker-Abschlusszeitgrenzen, Prism-Runden samt tatsächlicher Studio-Aktion, begrenzter Prism-Ergebniscache und die Bindung tatsächlicher Deployment-Einstiege an ausgewählte Receipts. Die unabhängigen Reviewer prüfen erneut nach jeder fachlichen Nachbesserung.

## Worker-Abschluss, Cache, Scaffold und JUnit gesichert

- PCR-WORKER-001: verifiziert; Remote `0fdea5e17be4ce19c0fe0621f382a4ad30728580`. [Nachweis](implementation/worker-deadline.md). 15 real worker/Prism tests independently pass; full phase deadline, final materialization fence, real file/upload cancellation and explicit unresolved drain verified. Native Buster process termination remains separate blocked host gate; no arbitrary JavaScript termination or atomic I/O rollback claim.
- PCR-PRISM-ENGINE-001: implementiert; Remote `ba7becc12519cb84a904bc8c0a29605514b68eea`. [Nachweis](implementation/prism-engine-cache.md). 15 original engine/render tests pass, including reviewer-reproduced mutable request binding correction. Completed count/serialized-byte limits and real artifact persistence verified. Original Chromium capture gate blocked by missing executable; long-lived capture/heap and full Control restart proof remain open.
- PCR-SCAFFOLD-001: implementiert; Remote `800cba4033c11337e31d34de11dc6cf66ca10282`. [Nachweis](implementation/scaffold-regeneration.md). Editable provider plan preservation independently verified with four genuine CLI tests, plus25 existing tests and typecheck. Further requested two-file publication probe reproduces first-file modification before second-file EISDIR; coherent publication/reader boundary and crash proof remain open.
- PATH-T11-001: implementiert; Remote `9db5fc8ec48fc20e4d5bff7d91cf88f57d2f1251`. [Nachweis](implementation/junit-executed-required.md). Actual Node JUnit output, original parser/finalizer and localhost HTTP Nova import/FileStore verified independently; no review override or invented failed case for missing execution. Full native provider/adapter/runner path blocked by actual EPIPE/exit70 host prerequisite failure.

Aktuell: Prism-Designrunden und echte Deployment-Einstiege in finaler Gegenprüfung; Prism-CPU/Browserabbruch sowie explizite Pflicht-/Kumulativabdeckung in Umsetzung. Die genehmigte Retentionspolicy wird anhand der tatsächlichen Speicherbesitzer abgeglichen. Der Scaffold-Apply-Zweidateifehler bleibt mit Original-EISDIR-Reproduktion offen; kein transaktionaler Publish behauptet.

## Gesicherte Fortsetzung: Deployment, Designrunden und Workerabbruch

Die vier Commits `4870483973cda017f8c2f0465d91b83f6706009b`, `d109cfd917514e3cc526135c4df70b98a9f766f0`, `91030cbc3a30882669b8af834102d368b50bd99d` und `7f1b888eda4a74478a771b1363a844cd3093910b` sind auf dem Fixbranch gesichert. Sie enthalten die geprüfte Releaseauswahl, versionsgebundene Designrunden, Abbruch-/Messfensterkorrekturen und den Aufbewahrungsvertrag. Die nativen Grenzen bleiben in den jeweiligen Implementierungsnachweisen offen. Die unabhängige Workergegenprobe bestätigt beide abgebrochenen Cachewarteaufrufer und einen erfolgreichen späteren Neuversuch.

Aktiv: vollständige Pflichtprüfungsabdeckung, Agent-Bridge-Recovery, echte Demo-/Zugangsdatenübergabe, read-only Retirementplaner, bestehende Studio-Typfehler und isolierte Integrationsgegenprüfung des lokalen Commits `ab79ad928cbf54072fe0b3eaabd8b5ee60dea7d1`. Noch keine vollständige E2E-Freigabe.

Die isolierte Integrationsgegenprüfung von `ab79ad9` ist abgeschlossen: 14 ausgewählte Originalkommandos bestanden, darunter 112 Tests ohne Skips, zusätzlich Vertrags- und TypeScriptprüfungen. Kein neuer Fehler in diesen Grenzen gefunden; dies ersetzt keine native/E2E-Abnahme. [Vollständige Kommandos, Ausgaben und Hashmanifest](../evidence/integration-ab79ad9/checkpoint.md).

## Studio-Typprüfung und visuelle Browseridentität

Studio-Folgefix `0582d9b35ae3aa6ddf450db893be13bb2bfc8b7b` beseitigt sechs vorhandene TypeScriptfehler durch tatsächliche Puck-Slottypen, das bereits bestehende initialState-Schemafeld und validierte Flowdaten. Originale Puck-Konfiguration ist unverändert extrahiert; 51 Tests, Owning-Typechecks und Build bestanden. [Nachweis](implementation/studio-types.md).

Visual-Fix `0765d19b76327a14ac735e7d51a121ab1efa3ff3` bindet Baselines an beobachtete Browserversionen und verweigert ungesicherte v1-Migration. Drei lokale Tests und unabhängiger Review bestanden; tatsächlicher Browservergleich bleibt offen. [Nachweis](implementation/visual-browser-identity.md).

Die Coverage-Slice ist mit 44 Dateien eingefroren und wird unabhängig geprüft. Der read-only Retirementplaner wird nach drei echten Gegenbefunden (Legacybudget, erneute Rootprüfung, nachträglicher Verzeichnislink) korrigiert; noch nicht committet. Agent-Bridge-Recovery, kontrollierte OpenClaw-Cleanup-Phase und typisierte Demo-Credential-/Exposureübergabe bleiben aktiv. Trivy-Datenbankfrische ist in der Ursachen-/Vertragsklärung.

## Fortsetzung: geprüfte Vorstufen gesichert

- Coverage: lokal `109db4500f8b03de33932a5547b066c37551a0d7`, remote `0fb075858bf78b2b87b0429f64be6a3bdba80981`; verpflichtende deklarierte kumulative Abdeckung, weiterhin keine Ready-/Zustellungsfreigabe.
- Rein lesender Retirementplaner: lokal `beabc8db7320c82ae3bfab2c6569acec809d5b25`, remote `dee2ab5ea3c9e99c8f8eb82b501eba124cd2d12c`; 17 Originaltests bestanden. Gibt keine Quote frei und löscht nichts.
- Credential-/Pending-Handoff-Vorstufe: lokal `dea72baac30b981873118525c81d47e90dab4d51`, remote `5ce5bda2318efff700343ad623c62cfb520e8732`; unabhängige Go/HTTP-Gegenprüfung einschließlich fremder Vorbelegung, verlorener Create-Antwort, Lease-UID-Wechsel und Status-CAS bestanden. Finaler Ready-/Receipt-Produzent offen.
- Bridge bleibt blockiert: echte Gegenprobe verbrauchte im Kindprozess mindestens 1500 ms CPU bei deklarierten 200 ms, während Elternzähler 49 ms meldete. Elternmessung wird nicht als Kindprozessbudget akzeptiert. Cgroup-Alternative benötigt echte Deployment-/Delegationsprüfung und korrekte Thread-/Prozesssemantik; kein stiller Wechsel auf eine standardmäßig funktionslose Konfiguration.
- Runtime-Identitätsgegenprüfung und native Trivy-Datenbankprüfung laufen weiter. Keine Gesamt-E2E-, Deployment- oder pauschale Regressionsfreiheitsbehauptung.

## Weitere geprüfte Commitgrenzen

- Discord: lokal `391b074b6569b753fc0553b83dc8748cafc4d5a6`, remote `7ac8a7fe95066b5dcf3bf9bf53ad1894410bc4e9`; Root-Gegenprüfung mit 9 echten Core/HTTP/Store-Regressionen bestanden. Keine externe Nachricht gesendet.
- Runtime: lokal `daf8f6558d7e5b2e6c476acd65e22b55dc4737e6` plus `718cf8993a9fadbe27d8f90c3936a110eccfb219`, remote `d37425393bbf5781cf38867a722f0a8d61a36cc1` plus `6d5781891c081ed9ba4da03f5f66a8961eb869ce`. Root führte alle 28 damaligen Fälle aus; der danach konkret gefundene transitive Identitätsfehler wurde vor Branch-Publikation korrigiert und mit vier gezielten echten Fällen unabhängig nachgeprüft (29 Fälle insgesamt verfügbar).
- Preflight: lokal `d020b8837a9a92a7144dff40e869905a48f92505`, remote `452591423dd19e987454137193a50d6afe615b5f`; lokaler Finding abgeschlossen, globale Source-/Compiler-Vorphase separat in Arbeit.
- Reports: lokal `b8ca3f3267ca68e3c1299fcaa95df92fd52a4715`, remote `2e17a3d04cc460851031234890c0accfaff78b09`; beide originalen Consumerpfade unabhängig bestanden. T15-Fakten-/Sourceautorität bleibt offen.
- Trivy: lokal `fab6f1d749cdf4c3afa3bb3b4c3d26878ffd71ec`, remote `d02296f7a681210b21320d0fc6c43dc61abb25fc`; 4 Native-Regressionsfälle unabhängig bestanden, einschließlich echter FIFO-Abbruchgegenprobe. Root prüfte anschließend den gemeinsamen TypeScript-Consumer erfolgreich; dies ist ein Arbeitsbaum-Integrationscheck einschließlich parallel korrigiertem WorkerCore-V2, kein unveränderlicher Vollbranch-Test. Ein finaler kombinierter Commitcheck folgt nach dessen Abschluss.
- In Arbeit: generischer Worker-Core mit expliziter Ressourcenfähigkeit statt falscher Elternmessung, verpflichtender deterministischer Source-Preflight, read-only PR-/trusted-main Workflowtrennung und manuelle Buster-Quellkopiekompaktion. Keine automatische Loglöschung, kein CI-Auftrag und keine Änderung am Deployment.

## Gesicherter Integrationsstand 2d1ea1a

- Prism-Agentjobs und explizite Worker-V2-Ressourcenverträge: Remote `06fbf800e7070597c5d481bda6e9dad2aedd653e`. Bestehende V1-Verträge erhalten; unbekannte Kindprozessmesswerte werden ausdrücklich als nicht verfügbar ausgewiesen, nicht als bestandene Limits. Native Betriebsgates bleiben offen.
- Action-Pins: Remote `2a9481cd7ae69eaa572eb290bf5ba3fcc2ddde07`; Generatorintegration `4757260ea30be569c96a8811caf97b2267190c4d`. Kein CI-Lauf angefordert.
- [Getrennte Commitprüfung](../evidence/integration-2d1ea1a/README.md): 14 ausgewählte Originalkommandos bestanden, sauberer getrennter Checkout; Rohlogs und exakte Kommandos unter dem Link. Belege gesichert in Remote `1e5e40cfcd0e0ec4f4639edeba8e0ab784b3cc5f`. Keine Gesamt-E2E- oder pauschale Regressionsfreigabe.
- Noch uncommittet: Source-v2-Integration, Demo-Authentifizierungsnachweise und manuelle Buster-Archivkompaktierung. Die Source-Prüfungen bestehen nach Korrektur der echten fehlenden JUnit-Testabhängigkeit und Registry-Kohärenz; frühere Fehlschläge bleiben sichtbar. Unabhängige Source-Prüfung und zusätzliche Approval-Gegenprobe laufen.

## Gesicherte Source- und Kompaktierungsintegration

Source-v2 ist in Remote `5b7f8c694dc3aa2c05edb45ad8d88483bcdc36b2`
gesichert; manuelle Buster-Kompaktierung in `27315faad862f71df940ed32bc4e5a98eca72e0d`.
[Getrennte Integration](../evidence/integration-eb1d7cc/README.md) bestätigt alle
acht ausgewählten Kommandos im sauberen Commitcheckout, ohne parallele Demo-/
Registryänderungen. Source-v2 prüft jetzt auch den echten kompilierten Findings-
Freigabepfad; die dabei gefundene Waitbudgetabweichung ist nur dort korrigiert.
Kompaktierung besitzt ihre Eingaben vor dem ersten await und prüft normale Dateien
bereits beim nichtblockierenden Öffnen. Alle gefundenen Pipe-/Mutationsblocker
haben echte Regressionen. Keine produktiven Daten bereinigt.

T01-F01/F02 und OBS-002 bleiben teilweise: Legacyimport, vollständige Demo-/Ready-
Komposition und weitere ausgeschöpfte Storequoten sind nicht erledigt. Aktuell
laufen Demo-Nachweisprüfung, Registry-Clientintegration und die Untersuchung der
noch unbelegten historischen Berichtsfakten (T15-F01). Kein CI/Deployment gestartet.

## Demo-Authentifizierung als geprüfte Voraussetzung

Lokaler Commit `d7522ddf6c62e3c5ffe4a89ffa8ea4f891ce17de` ergänzt die echte
Anmeldung mit controllergenerierten Demozugangsdaten und eine quellgebundene
Projektion bereits verifizierter finaler Ergebnisse. [Unabhängige Prüfung](implementation/demo-auth-evidence.md)
und [isolierte Commitintegration](../evidence/integration-d7522dd/README.md) bestehen.
Das ist ausdrücklich noch kein Ready-/Delivery-Abschluss. Der nun implementierte
Controllervertrag muss Produkt-Ready von bestehendem Infrastruktur-Ready trennen,
Zeitpunkte serverseitig festlegen und mit Ablauf/Bereinigung konkurrierende Writes
per CAS schützen. Nova-Produktkomposition und aktuelle Storebelege werden parallel
vorbereitet; geteilte Dateipfade werden abgestimmt.

Demo-Voraussetzung und isolierte Belege sind remote in `3e0f50e8fa915aa2dc6c640ef178b5552d79680a` und `63354d93af540e09a562af2bc850de5b3f078657` gesichert. Registry-Clientverträge (IFR-08/09) und T15-F01 sind jetzt aktiv in Bearbeitung; keine zusätzlichen Findings als abgeschlossen gezählt.

## Gegenprüfungen und gesicherte Ursachenbehebungen

- Gemeinsame Adapteridentität: lokal `d9fd619`, remote `6967d056e2ae1eaa8277f51fd95394a1ef8df83d`. [Isolierte Commitprüfung](../evidence/integration-d9fd619/README.md): 14 echte Tests, Originalpaket und Nova-Typecheck bestanden. Kein fremder Berichtscode im Checkout. Alte aktive Snapshots benötigen ihren Originalruntime; keine verdeckte Migration.
- Registryclients: lokal `b13da3e`, remote `85178d4a16b1bec3bb5634c3799ae50d4cc8cb0a`. Unabhängige Konfigurations-, Helm- und native Trivy-Transportprüfung bestanden. Drei Findings bleiben teilweise: native BuildKit-/CRI-/Mirror-Nachweise sowie Referenzschutz/GC fehlen. Vollständige [Scope und Grenzen](implementation/registry-clients.md). Rohlogs behalten originale EOF-Leerzeilen; Quellcode-Whitespaceprüfung bestanden.
- T15 bleibt uncommittet: unabhängige Gegenprobe zeigte akzeptiertes leeres Effect-Journal trotz Lifecycle-Ereignissen. Der Autor ergänzt echte Journal-Reconciliation und Trunkierungsregressionen.
- Demo-Ready bleibt uncommittet: finaler Response-Fence muss Ablauf nach langsamen Ressourcenreads und offene Exposure-Claims erneut prüfen. Nova-Produzent und tatsächlich beobachtete Exposuregeneration sind weiterhin in Arbeit.

Die JSON-Summenzähler wurden aus den 154 tatsächlichen Findingzeilen neu berechnet; die vorher veralteten Summenmetadaten sind korrigiert. Originaltexte und Kennungen bleiben unverändert.

Controller-Voraussetzung remote `fbcdd69df8a7b307195747af099cc8a025c6c060` gesichert. [Kombinierte unveränderliche Prüfung](../evidence/integration-e03f7dc/README.md) besteht nach gezielter Korrektur der expliziten Registry-Testkonfiguration (`449f7af`); der ursprüngliche Renderfehler bleibt erhalten. Das ist keine abgeschlossene Nova-Demo-Übergabe. Initiale konfigurierbare Laufzeit wird ergänzt; für menschlich autorisierte Verlängerung fehlt weiterhin ein tatsächlicher authentifizierter Operator-Eingang. Caller-deklarierter issuer oder Runtime-ServiceAccount werden nicht als menschliche Freigabe ausgegeben.

## Quellengebundene Berichte und beobachtete Exposuregeneration

T15-Code lokal `f10ad7a`, remote `86b11c0c7e58cbb7f87ef35bd67bbbccdfad6b37`: ursprüngliche Journale werden rein lesend und begrenzt projiziert, Effects gegen Lifecycle-Einträge abgeglichen und reale Artefakte mit Run-/Producer-/Source-/Digestbindung gelesen. Ein vom Coordinator stammender Modusvertrag unterscheidet die tatsächlich vorkommenden vertraulichen Aufrufe; ältere mehrdeutige Historien bleiben unverifizierbar. Berichtstext bleibt Entwurf, Quellenzuordnung wird gespeichert.

Generation/Receipt-Kontext lokal `4eece95`, remote `aa8d48b51e02f660d5405addc7441db21f53d24b`: tatsächlich beobachtete Exposuregeneration ist vom Provider über Authentifizierung bis zum Originalimport gebunden. Receipt-Recovery erhält die originale Parent-Identität, auch nach echtem SIGKILL.

[Isolierte gemeinsame Commitprüfung](../evidence/integration-f10ad7a/README.md) besteht: 10 Source-, 29 Cleanup-, 7 Generation-/Recoveryfälle, Originalreport-/Artefaktpakete sowie Nova-/Buster-Typechecks. Nativer Modellwriter und Deployment bleiben unbestätigt; T15 zählt deshalb noch nicht als vollständig verifiziert. IFR-20-Ingestionressourcen sind jetzt in Bearbeitung.

Ingestionressourcen lokal `47af477`, remote `8b4238f5e0c9e383911c20726e4386bfa72fb846`: [fünf Originaldienst-/Helmprüfungen](implementation/prism-ingestion-resources.md) bestanden, darunter pausierte null Replikate, explizite CPU-/RAM-Konfiguration und endliche Quarantäne-TTL. Keine Logaufbewahrung verändert. Native Last-/OOM-/Schedulingbelege fehlen, daher teilweise implementiert. IFR-25-funktionale Readiness ist im Codeabgleich.

Registry-Health-Consumer lokal `fdec920`, remote `5fe58e4d8de9d546af899b2ef1c44bb79ae5c2e6`: tatsächliche HTTP-/API-Provider greifen mit streng begrenzter Runtime-Authentifizierung auf die konfigurierte Registry zu. Unabhängig bestanden: HTTPS/Provider3, Originalworkspace61 und geladene Runtime-Konfiguration. Vollständiger geladener Runtime-zu-Registry-Aufruf und vier andere breitere Generatorgates bleiben ausdrücklich offen; [Scope](implementation/registry-health.md).

Konfigurierbare initiale Demo-Laufzeit lokal `f308063` committed. Eine unabhängige Pruning-Gegenprobe erzwang einen eigenen gespeicherten v2-Vertrag mit Pflichtdauer; nur echte historische v1-Datensätze behalten den impliziten Sieben-Tage-Wert. Replay und Status lehnen beschädigte neue Datensätze ab. Menschlich autorisierte Verlängerung bleibt ohne echten Operator-Authentifizierungseingang nicht implementiert.

Der echte Nova-Übergabepfad fand eine reentrante Sperrkollision zwischen logischer Evidenzprüfung und innerem Artefaktzugriff. Diese wird durch korrekte Ressourcendomänen behoben, ohne Core-Sperrausnahme oder vertraulichen Ersatzaufruf. Noch uncommittete Übergabearbeit wird nicht als Ready-Abschluss gezählt.

Versionierte initiale Demo-Laufzeit ist remote `05c88ff331deac4a932126e8a686e7f9865aa758` gesichert. [Isolierter kombinierter Commitcheck f308063](../evidence/integration-f308063/README.md) besteht vollständig innerhalb seiner neun ausgewählten Kommandos. Die weiterhin uncommittete Nova-Handoff-/Readinessarbeit war im Checkout nicht enthalten.
