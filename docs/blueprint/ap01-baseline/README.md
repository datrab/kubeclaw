# AP01 — Ausgangsstand und Dokumentationsinventar

Status: abgeschlossen als Bestandsaufnahme, keine Inhaltsmigration.
Stand: 15.09.2026. Basis: `6979bced8e5bbca90568276256e7328d93a1e072` auf `main`.
Git-Tree: `6196b202b295e11c2f3fea870ca4142e26e2f68d`.

## Ergebnis

Der vollständige Remote-Dateibaum ist erfasst. Vorhandene Inventare werden weiterverwendet. Der Blueprint-Bestand muss aktualisiert und der unterschiedliche Suchumfang der Inventare in AP02 ausdrücklich erklärt werden. Offene Findings und zusätzliche Arbeiten sind identifiziert. Kein bestehender Text wurde umgeschrieben oder gelöscht; kein Finding geschlossen; kein Deployment ausgeführt.

| Bestand | Anzahl | Bedeutung |
| --- | ---: | --- |
| Alle verfolgten Dateien | 5.221 | Vollständiger Remote-Tree, nicht abgeschnitten |
| Dateien unter `docs/` | 2.773 | Einschließlich Nachweisen, Skripten, Registern und Diagrammen |
| Markdown im gesamten Repository | 963 | Davon 859 unter `docs/` |
| Review-Markdown | 479 | Noch keine Löschentscheidungen |
| Sonstige Dateien unter `docs/review/` | 1.832 | Evidence, ausführbare Reproduktionen, Register, Logs und andere Anhänge |
| Produkt-/Komponenten-Markdown außerhalb `docs/`, ohne Fixtures und Agentenanweisungen | 97 | Ebenfalls in der späteren Inhaltsprüfung |
| Agentenanweisungen | 2 | SKILL-Dateien; keine AGENTS.md im aktuellen Remote-Bestand |

Die 963 Markdown-Dateien umfassen außerdem fünf Fixture-Markdown-Dateien. Diese sind Testdaten/-erklärungen und keine pauschalen Löschkandidaten. Die Dateiendung bestimmt nicht den Erhaltungswert.

## Arbeitsstand und parallele Änderungen

Der vorhandene lokale Snapshot enthält 2.413 verfolgte Dateien, ist sauber, hat keinen Git-Remote und besitzt eine eigene lokale Historie. 2.339 Dateien stimmen mit dem Remote-Blob überein, 74 weichen ab, 2.808 Remote-Dateien fehlen lokal. Es gibt keine nur lokal verfolgten Dateien. Deshalb wird dieser Snapshot nicht als vollständiger Clone oder als Quelle für einen vollständigen GitHub-Tree verwendet. Lokale Abweichungen wurden nicht überschrieben.

Der einzige offene PR bei der Abfrage war [PR #12](https://github.com/datrab/kubeclaw/pull/12), Head `102a4a70af307af19d683511ca4f4443c42479bb`, Branch `cleanup/remove-legacy-chatgpt-mcp`. Er verändert zwölf Dateien und entfernt insbesondere die [damalige ChatGPT-Ops-Anleitung](https://github.com/datrab/kubeclaw/blob/6979bced8e5bbca90568276256e7328d93a1e072/docs/ops/chatgpt-ops-bootstrap.md). `docs/_legacy-source/architecture/ops-pod.md` enthält die später verschobene Fassung. `file-inventory.tsv` markiert alle betroffenen Dateien.

PR #12 wird nicht in diese Dokumentationsarbeit eingemischt oder gemergt. Er ist keine geeignete gemeinsame Arbeits-PR, weil er eine eigenständige Laufzeit-/Deployment-Bereinigung enthält. Die Dokumentationsmigration verwendet einen einzigen separaten Branch `docs/documentation-overhaul` mit einer Draft-PR. Nach Merge von PR #12 müssen dessen zwölf Pfade und ihre Dokumentationsverweise erneut abgeglichen werden. Ein tatsächlich eingerichteter Cluster-/Devbox-Zugang wurde in AP01 nicht geprüft.

Die alte Übergabe verweist weiterhin auf PR #6 und dessen Branch. Das ist historischer Arbeitskontext, kein aktueller Fortsetzungsbefehl. Die alte Anweisung, sämtliche historischen Quellen unverändert zu erhalten, wird durch den aktuellen Dokumentationsauftrag mit gesicherter Extraktion und anschließender Löschung ersetzt.

## Vollständiger Umfang und Ausschlüsse

[file-inventory.tsv](file-inventory.tsv) enthält genau einen Eintrag pro Remote-Datei: Pfad, Blob-ID, Größe, Kategorie, Umfang, lokal verfügbare Inhalte und Überschneidung mit PR #12. Sämtliche redaktionellen Prüfstatus stehen auf `not-started`. Die Kategorien sind Erfassungsgruppen, keine Entscheidungen „behalten“ oder „entfernen“.

- Alle Dateien unter `docs/` gehören zur Bestandsprüfung, auch maschinenlesbare oder ausführbare Dateien. Ihre Verwendung wird vor späterer Migration geprüft.
- Root- und Komponenten-READMEs sowie weitere Erklärungstexte außerhalb `docs/` gehören zur Inhaltsprüfung.
- Agentenanweisungen bleiben als eigene Dokumentart sichtbar. Änderungen daran brauchen den Abgleich mit ihrem Ausführungszweck.
- Fixtures und Lizenztexte sind von der redaktionellen Löschung ausgeschlossen. Verweise und reale Funktionsabhängigkeiten bleiben dennoch zu prüfen.
- Implementierung, Konfiguration, Verträge, Charts, Workflows und Tests sind Quellen oder Verbraucher. Ihre Erfassung macht sie nicht zu löschbaren Dokumentationsdateien.
- Generierte Daten werden zusammen mit ihren Erzeugern behandelt; fremde und historische Nachweise müssen in AP03 einzeln nach Zweck eingeordnet werden.

`baseline.json` hält Zahlen und Commitbezug maschinenlesbar fest. Die AP01-Artefakte selbst sind neue Arbeitsunterlagen außerhalb des Baselinezählers. Bei AP11 und jeder späteren Vollinventur werden sie ebenfalls berücksichtigt.

## Vorhandene Inventare: Wiederverwendung mit Korrekturen

| Quelle | Befund | Verwendung ab AP02 |
| --- | --- | --- |
| `docs/architecture/plugin-system-current-inventory.md` und `docs/generated/inventory/plugin-system.json` | 48 Pipeline-Pakete, eine OpenClaw-Erweiterung, 67 Registrierungen; alle 997 Dateipfade innerhalb seines Suchbereichs aktuell | Wiederverwenden; den engeren Suchumfang dokumentieren und Prism/Codex im Gesamtinventar separat ergänzen |
| `docs/blueprint/generated/platform-inventory.json` | 48 Manifeste; `kubeclaw.demo-handoff` und `kubeclaw.demo-auth-smoke` fehlen | Gegen aktuelle Manifeste aktualisieren; statische Statusaussagen nicht als Laufzeitbeweis behandeln |
| `docs/site/extend/plugin-catalogue/` | 50 Paketdetailseiten plus Index; alle 50 Manifest-IDs unter `skills/` besitzen eine Seite | Seiten als Ausgangsmaterial wiederverwenden; Inhalt und Beispiele erst in AP03/AP08 prüfen |
| `docs/blueprint/generated/migration-ledger.csv` | 374 Einträge; heutiger Bereich desselben Generators umfasst 2.696 Dateien | Vorhandene Zuordnungen nur als Vorschlag übernehmen, expliziten Prüf- und Migrationsstatus ergänzen |
| `docs/generated/inventory/` und `docs/reference/` | Vorhandene Generatoren für Deploy-CLI, Values, Secrets und Workflows | Als mechanische Quellen nutzen; Aktualität separat prüfen |

Im alten Migrationsregister fehlen 2.322 aktuelle Pfade: alle 2.311 Dateien unter `docs/review/` und elf Operations-Dokumente. Die vorhandenen 374 Pfade existieren noch. Der Generator schließt `docs/site/` und `docs/blueprint/` ausdrücklich aus und erfasst Dokumentation außerhalb `docs/` überhaupt nicht. Sein gemeldeter Vollständigkeitsgrad ist daher weder eine aktuelle Gesamtinventur noch eine Inhaltsabnahme.

Der Generator weist Dateikategorien anhand von Pfaden zu und setzt die Abschlussnachweise beim Erzeugen wieder auf `pending rewrite; source path existence verified`. AP02 muss verhindern, dass spätere manuelle Prüfentscheidungen durch Regenerierung verloren gehen. Zudem werden nicht alle heutigen Kategorien, insbesondere Reviews, behandelt. Das ist eine Quellenanalyse; ein vollständiger Generator-/Buildlauf wurde hier nicht als bestanden behauptet.

### Aktuelle Plugin- und Erweiterungszählung

[plugin-manifests.tsv](plugin-manifests.tsv) gleicht jedes aktuelle Manifest mit den vorhandenen Inventaren und Katalogpfaden ab.

| Art | Aktuell |
| --- | ---: |
| Pipeline-Plugins unter `skills/` | 48 |
| OpenClaw-Erweiterungen unter `skills/` | 2 |
| Separates Codex-Plugin unter `plugins/` | 1 |
| Stage-Registrierungen | 21 |
| Observer-Registrierungen | 5 |
| Adapter-Registrierungen | 21 |
| Testprovider-Registrierungen | 19 |
| Reportadapter-Registrierungen | 1 |
| Registrierungen insgesamt | 67 |

Das zusätzliche Codex-Plugin ist `plugins/kubeclaw-ops/.codex-plugin/plugin.json`. Es wird weder mit Pipeline-Plugins noch mit OpenClaw-Erweiterungen gleichgesetzt. Sechs Plugin-Manifeste in Testfixtures sind keine installierbaren Produktpakete dieser Zählung. Registrierung, Rollenpaket, Aktivierung und tatsächlich erreichbare Funktion sind getrennte Aussagen; AP01 prüft Manifestbestand, nicht den laufenden Dienst.

## Dokumentationswerkzeuge und Abhängigkeiten

2.092 lokal bereitgestellte Quellen wurden bytegenau gegen Git-Blob-IDs geprüft. Darunter wurden 2.072 Dateien außerhalb `docs/` nach literalen `docs/`-Verweisen durchsucht. Ergebnis: 287 Vorkommen in 80 Verbrauchern. [documentation-consumers.tsv](documentation-consumers.tsv) nennt Datei, Zeile, Referenz und Zieltyp (Datei, Verzeichnis oder Muster/nicht aufgelöster Text). Die Existenzspalte prüft das exakte erfasste Token. Ein nicht aufgelöstes Token ist kein automatisch nachgewiesener defekter Link.

Dieser Erstscan umfasst ausgewählte aktuelle Quellformate in Scripts, Workflows, Packaging, Skills, Tests, Contracts und Tools, ohne Fixtures und generierte Unterverzeichnisse. Er ist kein vollständiger Linkgraph: dynamisch zusammengesetzte Pfade, weitere Konfigurationsformate und eingehende Dokument-zu-Dokument-Links werden in AP03 je Datei geprüft. Die vollständige Pfadliste ist vorhanden, nicht sämtliche 5.221 Dateiinhalte lokal.

| Werkzeug | Rolle und Migrationsbezug |
| --- | --- |
| `scripts/plugin-system-inventory.mjs` | Erzeugt Plugin-Inventar; Suchwurzeln begrenzen heute den Umfang |
| `scripts/docs-blueprint-generate.mjs` | Erzeugt Plattforminventar, Kategorien und Vollständigkeitsbericht; automatische Klassifikation ist keine Inhaltsprüfung |
| `scripts/docs-inventory.mjs`, `docs-secret-inventory.mjs`, `docs-yaml-inventory.mjs` | Mechanische Referenzquellen; Generator-Eingaben beim Umzug erhalten |
| `scripts/docs-generate.mjs`, `docs-generate-core.mjs` | Referenzgenerierung und gemeinsame Hilfsfunktionen |
| `scripts/docs-check.mjs` | Markdown-/Pflichtseitenprüfung mit fest eingetragenen Deployment- und Operatorpfaden |
| `scripts/docs-check-refs.mjs` | Referenzprüfung; historische Review-Quellen werden teilweise ausgenommen |
| `scripts/docs-check-coverage.mjs` | Prüft den bisherigen Topic Map; muss auf die neue Abdeckung abgestimmt werden |
| `scripts/docs-publication.mjs` | Katalog, Pflichtseiten, Publikationsausgabe und Commitbezug; Navigation und Publikationsumfang gemeinsam migrieren |
| `.github/workflows/docs-checks.yaml` | PR-Prüfungen und Generator-Update auf main; führt nicht einfach die vollständige `docs:publish-check`-Kette aus |
| `package.json` | Docs-Befehle und zahlreiche Paritätsprüfungen mit Pfaden unter `docs/architecture/` |

Besonders wichtig vor dem Löschen der Reviews:

- `runtime-profile-proxy-independent.test.mjs` führt `docs/review/evidence/run9-sdk-transport-proxy-audit.mjs` aus.
- `repair-identity-historical.mjs` benötigt `docs/review/evidence/run2-sdk-remaining/repair-authorization-locale.mjs`.
- `legacy-cli-diagnostic-reproducibility.test.mjs` benötigt `docs/review/evidence/run5-adapter-legacy-cli-diagnostic.mjs`.
- `tests/verification/integration/product-native-api.mjs` verwendet standardmäßig einen Ausgabeordner unter `docs/review/evidence/`.

Die Entfernung muss diese Reproduktionen und Ausgabepfade in sinnvolle Test-/Evidence-Orte migrieren. Ein grün werdender Test durch bloßes Entfernen der Prüfung wäre keine Lösung. Paritäts-/Baseline-JSON unter `docs/architecture/` wird ebenfalls von Tests und npm-Befehlen gelesen.

## Offene Findings und zusätzliche Arbeit

Das aktuelle Register bestätigt weiterhin **141/154 lokal verifiziert, 13 unvollständig**: acht offen, drei in Bearbeitung, zwei als `implementiert` markiert mit noch fehlender Integration/Verifikation. Die fünf zusätzlich erfassten Integrationsfindings sind verifiziert. Diese Statuswerte wurden aus dem Register bestätigt, nicht durch neue Laufzeittests neu bewertet.

| ID | Status | Thema |
| --- | --- | --- |
| PCR-BUSTER-ENGINE-001 | in Bearbeitung | Capabilityarbeit im Attemptbudget |
| PCR-BUSTER-ENGINE-004 | implementiert, unvollständig | Quellen-/Workspacebereinigung nach terminalen Jobs, Restart und Orphans |
| PCR-OBS-002 | implementiert, unvollständig | Vollständige Aufbewahrungsstrategie |
| IFR-21-001 | in Bearbeitung | Reproduzierbarkeit der Runtime-Images |
| IFR-29-001 | offen | Trennung öffentlicher Doku und Betreiberkonfiguration |
| IFR-04-001 | offen | Tailscale-Betriebsfrage |
| IFR-10-001 | offen | BuildKit-Sicherheitsverdacht |
| IFR-01-001 | offen | Cluster-Bootstrap und Dokumentationslücke |
| IFR-02-001 | offen | Cilium-Migration |
| IFR-06-001 | offen | SPIRE-Betriebsfrage |
| IFR-16-001 | offen | Storage/Kapazität |
| IFR-26-001 | in Bearbeitung | Vollständige Backup-/Recovery-Abdeckung |
| IFR-28-001 | offen | Ops-Pod-Recovery-Voraussetzung |

Zusätzlich ist [GitHub Issue #7](https://github.com/datrab/kubeclaw/issues/7) offen: „Release security rescan needs attention“. Es ist nicht eines der 154 Findings. Die Meldung unterscheidet ausdrücklich mögliche Schwachstelle, Scannerfehler oder fehlende Releaseauswahl. AP01 diagnostiziert diesen Scan nicht; das Issue muss bei der neuen Status-/Betriebsdokumentation sichtbar bleiben.

### Separate Live-Abnahmen

Die Abschlussregel D12 bleibt bestehen: lokale Implementierungs- und Testvollständigkeit genügt für lokalen Findingabschluss. Sie belegt keine Cluster-/Produktionsabnahme. [local-closure-evidence-index.tsv](local-closure-evidence-index.tsv) enthält für alle 141 lokalen Abschlüsse die vorhandenen Prüfgrenzen und Evidence-Verweise als AP04-Extraktionsquelle. Der Index erklärt nicht pauschal alle 141 Einträge zu offenen Live-Aufgaben.

Die aktuelle GitOps-Übergabe nennt explizit: isolierter Cluster-Bootstrap, WaitForFirstConsumer, erster Sync/Readiness, blockierte Folgewellen nach fehlerhafter Migration, Drift/Self-heal, Git-/Registry-Ausfall, kompatibler Rollback bei identischen PVCs und erhaltenen Daten sowie separat geprüfte Helm-/Argo-Eigentumsübergabe. Kein automatisches Datenbank-Downgrade oder impliziter Restore.

Weitere Live-Grenzen liegen verteilt in den verlinkten Abschlussberichten, unter anderem Stateful-Migration, Worker-Isolation, Netzwerk, reale Images und Recovery. AP04 muss daraus konkrete Abnahmen deduplizieren. Eine exakte Zahl unabhängiger Live-Abnahmen lässt sich nicht allein aus dem Register ableiten. Die bestehenden Quellberichte werden in AP01 vollständig in der Pfadliste erhalten und noch nicht gelöscht.

## AP01-Abschluss und Übergabe an AP02

- [x] Aktuelles main und offene PRs abgeglichen; sauberer, aber partieller lokaler Snapshot erkannt.
- [x] Vollständiger Remote-Pfadbestand mit Commit- und Blobbindung erfasst.
- [x] Dokumentationsumfang, unterstützende Dateien, Agentenanweisungen und Ausschlüsse gekennzeichnet.
- [x] Vorhandene Plugin-/Plattform-/Migrationsinventare geprüft und konkrete Abweichungen ermittelt.
- [x] Generatoren, Prüfungen, Publikationspfade und erste ausführbare Review-Abhängigkeiten erfasst.
- [x] 13 unvollständige Findings, zusätzliches GitHub-Issue und getrennte Live-Abnahmequellen festgestellt.

AP02 beginnt mit den sechs Blueprint-Artefakten. Zuerst Umfang und Prüfstatus korrigieren, dann die drei Leserwege auf zusammenhängende Aufgaben verdichten. Vorhandene Inventare weiterverwenden; Codex-/OpenClaw-/Pipeline-Erweiterungen getrennt erklären. Keine Inhaltsabnahme aus Pfadexistenz ableiten. Die neue Struktur muss die zukünftige Entfernung der Reviews samt Testabhängigkeiten ausdrücklich berücksichtigen.

Die Inventur wird nach Änderungen an main gezielt aktualisiert. Diese AP01-Dateien sind temporäre Migrationsbelege, keine neue öffentliche Produktnavigation und kein zweites dauerhaftes Findingregister.


## Nachkontrolle von AP01

AP01 wurde vor AP02 nochmals geprüft. `main`, PR #12 und der AP01-Head von PR #13 waren unverändert. Der vollständige Inventarbestand mit Größen und Blob-IDs, alle 2.092 verfügbaren Quellen, 51 Plugin-Manifeste, 141 Abschlussbelege und 287 Referenzvorkommen wurden erneut abgeglichen.

Korrigiert wurden zwölf Verzeichnisverweise, die der erste Abgleich fälschlich als nicht existent markierte. Ein weiteres Token mit abschließendem Satzpunkt wurde zuvor still gekürzt und deshalb fälschlich als exakt vorhandener Pfad markiert. Die Tabelle unterscheidet jetzt Zieltypen und behandelt solche Tokens als nicht aufgelösten Text. Sie bleibt ein Erstscan, keine vollständige Linkabnahme.

Präzisierung: Das Plugin-System-Inventar stimmt innerhalb seiner eigenen Suchwurzeln vollständig mit allen 997 aktuellen Dateipfaden überein. Der fehlende Prism-Eintrag entsteht durch seinen engeren Umfang, nicht durch veraltete Dateien. Das Blueprint-Inventar ist dagegen tatsächlich veraltet: zwei aktuelle Pipeline-Plugins fehlen.

Zusätzlicher konkreter AP02-Eingang: `docs/site/status/current.md` ordnet Prism weiterhin unter „Designed“ ein und behauptet, Prism liege außerhalb des aktuellen Runtime-Rolleninventars. `packaging/runtime/roles/prism.json` existiert jedoch im gleichen Commit. Die Statusseite muss Implementierung, Rollenpaket und Live-Abnahme sauber trennen. Diese Nachkontrolle stellt damit keine neue Laufzeit- oder Produktionsfreigabe aus.

Die zentralen AP01-Zahlen und die Abschlussentscheidung als Bestandsaufnahme bleiben gültig. Die vollständige Inhaltsprüfung und die deduplizierten Live-Abnahmeaufträge bleiben planmäßig AP03 beziehungsweise AP04.
