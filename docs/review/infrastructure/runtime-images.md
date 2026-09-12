# INF-21 — Runtime-Dockerfiles, Packaging und Build-Kontexte

Review: **abgeschlossen (statisch)**. Prüfcommit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. Kein Live-Nachweis.

## Inventar und Rollen
`docker/Dockerfile.*` umfasst Nova, Prism-Agent, Buster-Gateway, Buster-Runtime, Namespace-Controller, Archviewer und vier Prism-Dienste. Ops-Images haben eigene Kontexte unter `ops/pod` und `tools/ops-mcp`. Base-Digests/Versionen werden aus versions.json erzeugt, npm-Abhängigkeiten aus nativen Locks. `packaging/runtime` und Bundle-Script bestimmen Laufzeitcode; Image und nachgeladenes Bundle sind getrennte Artefakte.

Nova enthält Entwicklungs-/Lint-Werkzeuge, Buster Runtime BuildKit/Browser/Security-Tools, kleine Gateway-/Prism-Agent-Images keine Nova-Toolchain. Prism-Worker installiert echte Browser, Control mountet Artefakte; Studio/Ingress leiten zum Control weiter. Go-Controller baut explizit GOARCH=amd64; kein nachgewiesenes ARM-Produktionsimage. Docker-Kontext erlaubt Code/Contracts und ausgewählte Tests, schließt Betreiber-Values, Git, Credentials-Dateimuster und node_modules aus. Globale Allowlist schützt nicht beliebige anders benannte Secrets im erlaubten Quellbaum.

## Befund IFR-21-001
**Mittel; nachgewiesene unvollständige Reproduzierbarkeit.** Auslöser: erneuter Build desselben Source-Commits zu anderem Zeitpunkt. Base-Digest und Top-Level-Versionen sind gepinnt, aber Ops apt-Repositories und verschiedene transitive Python-/Go-Installationen werden zeitabhängig aufgelöst; manche Prüfsummen werden vom selben Upstream beim Build bezogen. Quellen: `ops/pod/Dockerfile:8–29`, Nova-Dockerfile pip/go-/Downloadblöcke, Prism-Worker Browser-OS-Installation. Ein Source-Pin ist deshalb keine Zusicherung bitidentischer Rebuilds.

Ursachenbehebung: benötigte Reproduzierbarkeit definieren und verbleibende Installer über geprüfte Locks/Snapshots/Checksums binden; bis dahin immer den geprüften Output-Digest deployen. Test: zwei isolierte reale Builds mit identischem Input, Paket-/SBOM-/Digestvergleich, Abweichungen zuordnen. Kein Build hier ausgeführt.

## Archviewer und Laufzeitgrenzen
Archviewer ist nginx mit `autoindex on` unter /designs:3456, separater Sidecar/NodePort 30456. Keine Auth im nginx-Config; die veröffentlichte Dateimenge und externe Host-/Tailscale-Erreichbarkeit sind Betreibergrenzen. Als „privat“ darf er nicht allein wegen anderer Tailscale-Ingresses beschrieben werden. `Dockerfile.archviewer` ist vom Prism-Studio klar getrennt.

Echte Rollen-/Release-Helmprüfungen bestanden; Docker-/Offline-Plugin-/Browser-Akzeptanz mangels Docker nicht ausgeführt. [Versionsreview](updates-security.md) behandelt Advisory-Frische. Doku `runtime-versions-and-images.md` benennt viele Einschränkungen bereits korrekt; Kontextkommentar „skills only via bundles“ ist gegenüber in Images kopiertem Runtimecode zu präzisieren, ebenso CPU-Architektur, Package-Locks und Auth-Grenze des Archviewers.

Der Archviewer-Zugang wird zentral als [IFR-03-002](network-dns.md) geführt.
