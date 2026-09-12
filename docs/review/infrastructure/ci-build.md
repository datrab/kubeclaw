# INF-22 — GitHub Actions und Image-/Bundle-Veröffentlichung

Review: **abgeschlossen (statisch)**. Prüfcommit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. Kein Live-Nachweis.

## Inventar und Ereignisgrenzen
Alle zehn `.github/workflows/*.yaml` untersucht. Runtime-Build reagiert auf main-push/workflow_dispatch; vor Veröffentlichung müssen Reliability, Role-Images und Update-Policy erfolgreich sein. Role-Images/PR-Prüfungen bauen ohne Push; Ops-PR-Pfad lädt lokal, authentifiziert nicht bei GHCR und pusht nicht. Build-Jobs verwenden GitHub-hosted Runner, GHA-Caches pro Familie/Rolle, BuildKit und teilweise privilegierte **disposable CI-Testcontainer**. Das beweist keine Produktions-Pod-Isolation.

Runtime-Matrix publiziert zehn candidate-Commit-Images mit provenance/SBOM. Die drei Gateway-Rollen werden nach Pull des veröffentlichten Digests ausgeführt; andere Rollen besitzen unterschiedliche Build-/Source-Gates. Ops publiziert beide Kandidaten und smoke-testet exakt deren Digests vor Receipt. Bundle-Release ist separat und benutzt commitadressierte Assets im gemeinsamen Release-Tag mit clobber.

## Befund IFR-22-001
**Mittel; nachgewiesene Berechtigungs-/Vertrauensgrenze mit offenem Hardeningbedarf.** `build-ops-mcp.yaml:46–48` gibt dem Buildjob packages:write auch im PR-Zweig; bei Fork-PRs begrenzt GitHub normalerweise den Token, bei internen PRs ist das keine automatische Garantie. Auch `docs-checks.yaml:35–46,68–79` setzt contents:write, checkt den internen PR-Head aus, führt Repo-Generatoren aus und pusht generierte Änderungen. Das ist ein zweiter konkreter Fall derselben fehlenden Trennung von Prüfung und Schreibrechten. Aktionen sind überwiegend Tag- statt SHA-gepinnt. Auslöser: untrusted interner PR oder kompromittierte Action-Version. Token-/Runner-Rechte können weiter gehen als die reine Prüfung benötigt.

Ursachenbehebung: PR-Validierung und Veröffentlichung in getrennten Jobs mit explizit minimalen Rechten, Action-SHAs/Updateprozess festlegen. Echter Test: Fork- und interner Test-PR in isoliertem Repository; effektive Tokenrechte/Secretverfügbarkeit und fehlende Registry-Schreibmöglichkeit belegen. Keine CI-Ausführung hier.

## Optionale Deployments, Ausfall und Testaussage
`build-images.yaml:236–271` enthält **optional** Prism-Live-Acceptance mit Kubeconfig und Lease-Erzeugung, gesteuert durch Repository-Variable. Also keine pauschale Aussage, dass jeder Image-Workflow ausschließlich baut. Die variable Live-Konfiguration wurde nicht gelesen und nichts ausgelöst.

Fail-fast:false erlaubt teilweise veröffentlichte Kandidaten bei späterem Matrixfehler. Vollständige Receipts/erfolgreicher Quellrun verhindern deren normale Promotion, siehe INF-23. Abbruch hinterlässt mögliche Kandidaten, keine autorisierte Deployment-Auswahl. Workflow-YAML-Parser lokal für alle zehn Dateien bestanden. Es wurden keine Actions gestartet, keine Release-Assets veröffentlicht und keine Live-Secrets verwendet. Doku muss Prüfart pro Image, optionale Live-Nebenwirkungen, Tokenmodell und Retention gescheiterter Kandidaten explizit machen.
