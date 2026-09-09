# Aktueller Umsetzungsstand

2026-09-09. Branch `fix/remediation-foundations-20260909`. Ausgangscode bleibt als
historische Baseline `85ddfcbf` dokumentiert; neue Implementierung ist in getrennten
Fixcommits gesichert. Originalberichte werden nicht nachträglich umgeschrieben.

**66/154 lokal verifiziert und unabhängig gegengeprüft; 8 Findings teilweise
implementiert / durch fehlende Betriebsnachweise blockiert; 12 in Bearbeitung;
68 noch offen.** Zusätzlich drei bei der Integration gefundene Probleme behoben
(separat von154). Keine pauschale Regressionsfreiheit, kein Deployment und keine
vollständige Pipeline-E2E-Freigabe.

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
