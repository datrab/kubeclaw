# INF-23 — Digest-Receipts und Release-Promotion

Review: **abgeschlossen (statisch)**. Prüfcommit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`. Kein Live-Nachweis.

## Inventar und Nachweiskette
`publish-image-receipts.yaml`, `promote-runtime.yaml`, `scripts/updates/release-images.mjs,verify-release-source.mjs,materialize-release.mjs`, `update-checks.yaml` und `tests/verification/deployment/release-images.test.mjs`. Sammlung verlangt richtige Namen, genau zehn Runtime-/zwei Ops-Images, gleichen vollständigen Source-Commit, keine Duplikate und volle Digests. Receipt enthält Run-ID/-Attempt und wird als Release-Asset aufbewahrt.

Promotion akzeptiert erfolgreichen main-Build des passenden Workflows/Ereignisses, lädt den Receipt, überprüft Quellattempt und exakte Asset-Gleichheit, materialisiert Digest-Values aus aktueller Betreiberkonfiguration, scannt diese Digests und schlägt per App eine PR vor. Keine Rebuild-/Deployment-Aktion innerhalb der Promotion. Argo-Consumer fehlt derzeit, siehe INF-05. Trust-Anker bleibt GitHub-Repo-/Release-Schreibberechtigung: die Assets sind ohne zusätzliche externe Attestationsprüfung nicht gegen einen entsprechend berechtigten Insider geschützt.

## Review und Befund IFR-23-001
**Mittel; offene Konfigurationskompatibilitätsfrage.** Auslöser: älterer erfolgreicher Image-Run wird mit inzwischen verändertem main-Chart/Values promoviert. `materialize-release.mjs` verwendet aktuelle my-values, während Images an den alten Receipt-Commit gebunden bleiben. Die Herkunft ist korrekt nachgewiesen; Konfigurations-/Schema-Kompatibilität zum neueren Chart ist dadurch nicht automatisch geprüft.

Ursachenbehebung: Source-/Chart-/Bundle-/Values-Kompatibilität als Release-Einheit festlegen oder explizit qualifizieren, statt nur die Imageherkunft zu prüfen. Echter Test: bewusst inkompatible jüngere Chartoption gegen älteren freigegebenen Digest; Promotion/Acceptance muss sie erkennen. Native Schema-/Migrationskompatibilität ebenfalls berücksichtigen.

## Fehlerpfade, Aufbewahrung und Verifikation
Fehlende/duplizierte/cross-commit Receipts werden abgewiesen; erfolglose Gesamtworkflows sind nicht promovierbar. Run-Attempt-Bindung verhindert, dass eine beliebige andere Wiederholung als Nachweis gilt. Release-Asset-Löschung und Registry-GC können alte Rollbacks trotzdem unbrauchbar machen; explizite Aufbewahrungsfrist fehlt. Wiederholung mit gleichem Promotion-Branch/Release-Tag kann scheitern, ist kein atomarer Deployprozess.

Zwei lokale Receipt-/Materialisierungsregressionen und zwei Versionstests bestanden, einschließlich **echtem Helm-Rendering** generierter Digestwerte. Synthetische Receipts dienen dabei Generator-/Validierungsprüfungen, sind keine tatsächlich veröffentlichten Imagebelege. Kein Remote-Run, Assetdownload oder Promotion ausgeführt. Dokumentation überwiegend zutreffend; Default-Deploykonflikt [IFR-19-001](role-workloads.md), fehlende Argo-Verkabelung und Rollback-Aufbewahrung ergänzen.
