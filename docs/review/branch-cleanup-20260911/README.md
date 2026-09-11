# Branch-Konsolidierung – 11.09.2026

Status: **nicht abgeschlossen; keine Löschungen**.

Geprüfter Remote-Stand: `5429e2ed37ba24bb70e0ea3efa1624677d1abd4e`.
Exakter geprüfter Baum: `b3302e66eab3d414d0b4ada90f7d79d4f0746286`.
Alle drei Branch-Seiten wurden abgerufen: 100 + 100 + 62 = **262 Branches**.

## Ergebnis

- 1 Hauptbranch `main`.
- 26 weitere Branches sind über ihre Commit-Historie vollständig enthalten.
- 44 weitere Branches haben gegenüber ihrem gemeinsamen Ausgangsstand ausschließlich Änderungen, die in `main` byte- und modusgleich vorhanden sind.
- Das bisher fehlende OpenClaw-Update aus `chore/openclaw-2026.9.3` wird mit diesem Checkpoint übernommen. Neuere Änderungen in denselben Dateien bleiben erhalten.
- **190 weitere Branches benötigen noch eine inhaltliche Entscheidung** über abweichende, überholte oder nicht abgenommene Zwischenstände. Sie sind nicht zur Löschung freigegeben.
- 31 bestehende lokale Checkouts/Worktrees wurden abgefragt; 6 enthalten uncommittete oder unversionierte Dateien. Sie bleiben erhalten.

Damit sind 71 zusätzliche Branches durch Historie, exakte Änderungsidentität oder die gezielt übernommene Versionsänderung abgedeckt. Dies ist keine Aussage, dass alle Findings abgeschlossen sind oder alle Branches gelöscht werden dürfen.

## Übernommenes Update

`versions.json` verwendet nun OpenClaw **2026.9.3** mit dem im vorhandenen Update-Branch gespeicherten Digest. `npm run versions:sync` aktualisiert sechs abgeleitete Dateien. Änderungen beschränken sich auf die Version und den Digest; keine älteren Dateistände werden über neuere Korrekturen kopiert.

Ausgeführt und erfolgreich:

- `npm run versions:sync` — sechs abgeleitete Dateien aktualisiert.
- `npm run versions:check` — 22 Referenzen geprüft, keine Abweichung.
- `node tests/verification/deployment/check-deployment-truth.mjs` — erfolgreich.
- `git diff --check` — erfolgreich.

Kein Imagebuild, Deployment oder Laufzeit-/E2E-Nachweis für die neue Imageversion wurde durchgeführt. Keine Finding-Statuswerte wurden geändert.

## Noch zu konsolidieren

Der Branch `fix/resume-39-20260911-a51d-two-hour` liegt nicht einfach vor `main`: beide Historien sind auseinander gelaufen. `main` enthält bereits spätere Buster- und Supervisor-Korrekturen. Ein Ersetzen von `main` durch diesen Branch würde diese verlieren.

Der Dreifachvergleich weist dort unter anderem Delivery-v3-, semantische und zusätzliche Test-/Nachweisdateien aus. Die vorhandene unabhängige Delivery-Review dokumentiert bestandene begrenzte Tests und die korrigierte Typecheck-Abdeckung, lässt jedoch genuine semantische Producer- und vollständige historische Migrationsabnahme offen. Diese Arbeit ist daher nicht pauschal übernommen.

Fehlende Pfade sind nicht automatisch fehlende Funktionalität: beispielsweise verwendet Buster inzwischen das gemeinsame `docker/openclaw-tools`-Paket mit Lockfile und `npm ci`; die älteren `docker/buster-gateway-tools`-Dateien werden deshalb nicht blind wiederhergestellt. Der Deployment-Konsistenzcheck prüft die aktuelle gemeinsame Variante.

## Nachweise und Fortsetzung

[branches.json](branches.json) enthält alle 262 Namen, eingefrorene SHAs, Ahead-/Behind-Zahlen und die aktuelle Klassifizierung. [audit.json.gz](audit.json.gz) enthält zusätzlich sämtliche vollständigen Dreifachvergleiche aller 235 divergierten Branches sowie die lokalen Statusabfragen. Alle 32 gemeinsamen Ausgangsbäume und alle 235 Branch-Bäume wurden vollständig und ohne abgeschnittene GitHub-Baumausgabe abgefragt.

Entpackt: 1530673 Bytes; SHA-256 `08f71229fe989d4f8620a039ca3fa9b5ce5e5f3c7216009c6322f9380f332846`.

Für jeden geänderten Pfad sind Modus und Blob-SHA des Ausgangsstands, des Branches und von `main` gespeichert. `identical` beweist Identität; `missing` bezeichnet einen in `main` unveränderten Ausgangsstand; `different` verlangt eine Dreifachprüfung. Keine dieser Bezeichnungen ersetzt eine fachliche Abnahme oder einen Test.

Vor einer Löschung Branch-SHA und aktuellen `main` erneut abfragen. Änderungen seit diesem Snapshot erneut prüfen. Bei lokalen Worktrees zusätzlich uncommittete und unversionierte Inhalte sichern beziehungsweise nachweislich übernehmen.

Die aktuell verfügbare GitHub-Anbindung besitzt keine Branch-Löschoperation. Direkter Git-Fetch scheitert an fehlender Anmeldung (`could not read Username`). Daher wurden keine Remote-Löschungen versucht und keine lokalen Worktrees entfernt. Die Fortsetzung benötigt einen authentifizierten Git-Zugang mit Branch-Löschmöglichkeit; die Zustimmung des Nutzers zum Aufräumen liegt bereits vor.
