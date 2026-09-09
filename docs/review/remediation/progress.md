# Aktueller Umsetzungsstand

2026-09-09. Branch `fix/remediation-foundations-20260909`. Ausgangscode bleibt als
historische Baseline `85ddfcbf` dokumentiert; neue Implementierung ist in getrennten
Fixcommits gesichert. Originalberichte werden nicht nachträglich umgeschrieben.

**31/154 lokal verifiziert und unabhängig gegengeprüft; 1 Finding teilweise
implementiert; 23 in Bearbeitung; 99 noch offen.** Nur bereits gesicherte Fixes
zählen als verifiziert. PCR-COMMAND-001 wurde nach einer zusätzlichen Gegenprobe
wieder geöffnet. Keine allgemeine Aussage „regressionsfrei“, kein Deployment
und keine vollständige Pipeline-E2E-Freigabe.

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
| Prozessgruppen/HTTP-Streaming | `76bb9fd75f2f9367a27a48dc67e95b3c76a1c826` | NETWORK-001/002 lokal verifiziert; COMMAND-001 wegen zusätzlicher Prozessende-Gegenprobe wieder geöffnet; [Nachweis](implementation/process-network.md) |
| Nova Remotegrenzen | `b4e64ce83ae3ee327f7c7086ba125ca89b026487` | NOVA-GATE-003/004 lokal verifiziert; [Nachweis](implementation/nova-remote-boundaries.md) |
| Lint | `82902a198229488b84e0f6f9dd421104aad5209e` | LINT-001/002/003 lokal verifiziert, vollständige Paketsuite mit Shelltools; [Nachweis](implementation/lint.md) |
| Git / Repository | `4301b03bcdd8d06dafd45414bd3e2c7ecf164928` | GIT-001/REPOSITORY-001 lokal verifiziert; [Nachweis](implementation/git-repository.md) |
| Telemetrie | `9e12ab76d085d1d050fb4ad08b55969ede4407cf` | TELEMETRY-CONTRACT-001/002 lokal verifiziert; [Nachweis](implementation/telemetry.md) |

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
- **Breiter Boundarycheck:** reine Contract-Entrypoints und überprüfte transitive
  Graphen sind implementiert, inklusive negativer Sicherheitsproben, aber noch
  in unabhängiger Gegenprüfung. Boundary-only erreicht die bisher nicht erlaubte
  tiktoken-Abhängigkeit des Reviewplugins. Der übergreifende Plugin-v2-Gate besteht
  SDK-Generierung, Pluginbuilds, Sandboxbuild, Runtime-Typecheck und Contractcheck,
  scheitert danach an einem veralteten Buster-Protokollimport des Agentoutputtests.
  Kein Gesamt-PASS und keine pauschale Allowlist-Erweiterung.
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

## Laufende nächste Arbeit

- WP03: Nova Deadline-/Restartpfade in Gegenprüfung. Echte HTTP-/Store-
  Fehlerregressionen bestehen; Vollprozess-Restart erreicht wegen Sandboxgrenze
  die korrigierte Graphassertion noch nicht. Source-Git-Abbruch weiter prüfen.
- WP03: Buster-/Command-Prozessgruppenprimitive nach neuen Reviewerbefunden
  korrigiert, Gegenprüfung läuft. Unsichere Orphan-/Cleanupfälle behalten ihre
  Eingaben. Aggregierte harte Capability-Ressourcenmessung weiter offen.
- WP03: Isolation lokal gegengeprüft; Kernelabnahme ausdrücklich blockiert.
- WP06: Sechs Testproviderfindings fertig implementiert; alle fünf betroffenen
  Pakettests/builds bestanden, unabhängige Gegenprüfung läuft.
- WP09: Drei Observer-/Ingressfindings implementiert, echte Journaltests und
  lokale Regressionen bestanden; unabhängige Gegenprüfung läuft.
- WP08: Studio-Servicefehler/Timeout/Streaming lokal implementiert und getestet;
  abschließende Gegenprüfung der Konfigurationsgrenze offen.
- Übergreifend: Registrierungs-Contractgrenzen in unabhängiger Gegenprüfung.

Nächster Integrationsschritt: weitere Änderungen erst nach Gegenprüfung und
Originalregressionen getrennt committen. Nicht abgeschlossene Arbeitsdateien
gehören nicht in einen als geprüft gekennzeichneten Fixcommit.
Fortschritt nach drei abgeschlossenen Findings oder spätestens zehn Minuten.
