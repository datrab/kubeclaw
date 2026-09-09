# Aktueller Umsetzungsstand

2026-09-09. Branch `fix/remediation-foundations-20260909`. Ausgangscode bleibt als
historische Baseline `85ddfcbf` dokumentiert; neue Implementierung ist in getrennten
Fixcommits gesichert. Originalberichte werden nicht nachträglich umgeschrieben.

**12/154 lokal verifiziert und unabhängig gegengeprüft; 1 Finding teilweise
implementiert; 14 in Bearbeitung; 127 noch offen.** Keine allgemeine Aussage
„regressionsfrei“, kein Deployment und keine vollständige Pipeline-E2E-Freigabe.

| Bereich | Remote-Commit | Stand / Nachweis |
|---|---|---|
| State/Locks + Effectpayloadbesitz | `4cd09442ad34e4927d82b59c8681bb7ad10cf31b` | PCR-STATE-001/002 lokal verifiziert; [Nachweis](implementation/state.md), ergänzend [Effects](implementation/effects.md) |
| Effect-Locklebensdauer | `8711c9d1ac0e0e12257629505643dee5ff5ee0a4` | PCR-EFFECT-001 lokal verifiziert; [Nachweis](implementation/effects.md) |
| SDK/Prompt | `b85b4c18fedcfb5a509295c082d59aab631b0617` | SDK-002/Prompt-001 lokal verifiziert; SDK-001 teilweise; [Nachweis](implementation/contracts.md) |
| Manifest/Registry/Paketprüfung | `b39d0e16c171b3be237b3288beb5a6dae5dc332d` | Vier zugeordnete Findings lokal verifiziert; [Nachweis](implementation/registry.md) |
| Prism-Domain | `9d651a8851b5a0bfa05ffbc03a0fb58e4ac23882` | Drei Domainfindings lokal verifiziert; [Nachweis](implementation/prism-domain.md) |

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
- **Breiter Boundarycheck:** nach Korrektur einer veralteten Root-plugins-Annahme
  und kanonischem Observer-Contractsync erreicht er die bereits bestehende
  Ablehnung von `@kubeclaw/pipeline-test-gate-contract` in buster-quality-gate.
  Keine Allowlist zur bloßen Grünschaltung erweitert. Gezielte Registry-/Security-
  Tests bestehen; dieser allgemeine Gate ist nicht bestanden.
- **Docs-Referenzcheck:** scheitert an historischen Review-Kurzpfaden und
  Zeilenangaben, die der Checker als Dateinamen interpretiert. Neue temporäre
  Prism-Testpfadangabe wurde korrigiert. Historische Befunde nicht gelöscht, um
  den Checker zu bestehen. Globaler Docscheck bleibt separat offen.
- Go und Helm zu Beginn nicht im PATH gefunden. Verfügbare Abhängigkeiten aus
  der vorhandenen Reviewumgebung in eigenen Worktree kopiert; Workspacepakete
  lösen auf den geänderten Code dieses Worktrees auf. Kein frischer Gesamtinstall
  behauptet. Node v24.19.0, util-linux/flock vorhanden.
- Keine Clawdeck-/Kubernetes-/Tailscale-/Host-Powerlossprüfung; PGlite belegt lokale
  echte DBtransaktionen, nicht einen externen PostgreSQL-Produktionsdienst.

## Laufende nächste Arbeit

- WP02: PCR-EXEC-001/002 Wait-/Resultartefakt-Recovery, echte gültige Journalpräfixe
  und Originalengine; Implementierung bereits in unabhängiger Gegenprüfung.
- WP02: PCR-OBS-001 Admission-/Attempt-Replayvalidierung, Originalstore-Manipulation
  und normale Wiederaufnahme.
- WP01: Agent-/Prism-Vertragstiefe/Viewpatchreferenzen, Testvertragtypen/Beispiele.
- WP03: Prozessgruppenabbruch und Streaming-HTTP-Limits/Fehlerdispositionen.
- WP06: Lint-Symlinkgrenzen, vollständiger laufender Abbruch und native Timeouts.

Nächster Integrationsschritt: fertige Recoveryänderung unabhängig prüfen und mit
den gesicherten State-/Registryänderungen gegenprüfen; dann separater Commit und
Registeraktualisierung. Nicht abgeschlossene Arbeitsdateien gehören nicht in
einen als geprüft gekennzeichneten Fixcommit. Fortschritt spätestens alle zehn
Minuten beziehungsweise nach drei weiteren abgeschlossenen Findings melden.
