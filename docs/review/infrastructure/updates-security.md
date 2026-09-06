# INF-24 — Versionen, Renovate und Sicherheitsdatenbanken

Review: **abgeschlossen (statisch)**. Prüfcommit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. Kein Live-Nachweis.

## Inventar und Aktualisierung
`versions.json`, `scripts/versions.mjs`, `renovate.json`, `scripts/updates/refresh-versions.mjs,renovate.cjs,scan-releases.mjs`, Dependency-/Update-/Rescan-Workflows. Generator prüft 21 native Ziel-Dateien, alle managed Base-Digests und Drift; native npm/Go-Locks bleiben getrennt. Renovate führt nur den fest erlaubten, read-only aus main gemounteten Updater aus; keine beliebigen Postinstall-Skripte/Plugins. GitHub-App-Identität, Alert-Einstellungen und deren Rechte sind extern.

## Befund IFR-24-001
**Mittel; nachgewiesene Versionslücke.** `deploy.sh:1027–1032,1109–1132` installiert Tailscale, Redis, PostgreSQL und Qdrant ohne Chartversion. Registry-Manifeste verwenden registry:2; Rootless-Preflight mutable Tag. Diese Installationen werden durch einen zentral gepinnten Docker-Base-Generator nicht reproduzierbar. Auslöser: späterer Bootstrap/Upgrade mit veränderten Chart-/Image-Defaults.

Ursachenbehebung: tatsächliche Infra-Chart-/Imageversionen samt kompatiblen Values explizit binden und durch echten Render-/Upgrade-Test aktualisieren. Regression: Offline-Render mit gesicherten Chartartefakten, Versionsvergleich aller tatsächlichen Installationsaufrufer. Keine aktuell zufällig aufgelösten Upstreamdefaults als geprüfte Baseline übernehmen.

## Befund IFR-24-002
**Hoch; nachgewiesene fehlende Frischegrenze.** `Dockerfile.buster-runtime:110–117` lädt Trivy-/Java-DB beim Imagebau. `skills/buster/engine/test-gates/security-scan-runtime.ts:170–190` scannt mit skip-db-update, skip-java-db-update und offline-scan; Konstruktor/Aufruf prüfen kein Datenbankalter. Ein alter Runtime-Digest kann folglich aktuelle Prüfungen mit alten Advisorydaten erfolgreich abschließen.

Ursachenbehebung: geprüfte DB-Snapshots mit Alter/Version explizit bereitstellen, Höchstalter erzwingen und ein abgelaufenes Wissensdatum als blockiert behandeln; regelmäßig aktualisieren, ohne unkontrolliertes Netzwerk in fremden Jobs zu öffnen. Echter Test: tatsächlicher gepinnter Trivy mit absichtlich veralteter DB; Frischegate muss vor Erfolg sperren. Das Datum des Scanlaufs ist kein Datum der Advisories.

## Verifikation und Betrieb
Zentraler Versioncheck (21 unveränderte Ziele) und vier Version-/Receipt-Regressionsfälle bestanden. Echter Renovate-Container, Upstream-Checksum-Binary-Tests und Trivy-Scans nicht ausgeführt. Daily Rescan verwendet aktuelle DB für **ausgewählte Releases**, ist also getrennt vom Offline-Pipeline-Scan; bei fehlender Auswahl meldet er Fehler, keinen Pass. GitHub-Minuten sind erschöpft, Zeitplan allein bedeutet keinen laufenden Sicherheitsprozess.

Doku benennt zentrale Grenzen korrekt, braucht zusätzlich Infra-Pins, Sicherheitsdatenbank-SLA, vollständige Scanabdeckung externer Dienst-Images und Betreiberprozess bei ausgefallener CI. Paket-/Image-Pin ist keine nachgewiesene Kompatibilität mit dem unbekannten Live-K3s.
