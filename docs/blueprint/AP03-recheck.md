# AP03 — unabhängige Qualitätsnachprüfung

Stand: 15.09.2026. Geprüfter PR-Stand: `d66a2419e82d602d775278f935552489fdd62d4e`.
Fünf getrennte Subagent-Prüfungen und Nachkontrolle durch die Hauptsession.
**Ergebnis: AP03 ist noch nicht abgenommen.** Die frühere unbedingte
Abschlussaussage wird korrigiert. Ein vollständiges Register allein belegt noch
keine vollständige, ausführbare Übergabe der Inhaltsentscheidungen.

## Gesicherter Stand

| Prüfung | Ergebnis |
| --- | --- |
| Eingefrorener Umfang | Genau 2.879 eindeutige Quellen: 2.872 AP01-Quellen plus sieben benannte Verwaltungsdateien; keine fehlende Quelle oder zusätzliche Fixture/Lizenz |
| Originalidentität | Alle 2.879 Originalblobs stimmen mit `e4ba8b1dd830f38450fcabedf4db7188aaeb6c44` überein |
| Prüfidentität | Alle 2.879 Kombinationen aus `reviewed_commit` und geprüftem Blob stimmen mit den tatsächlichen Git-Trees überein |
| Paketzuordnung | 2.373 überschneidungsfreie Zuweisungen entsprechen exakt den damals noch erfassten Quellen; ursprüngliche 506 bleiben separat nachvollziehbar |
| Zusammengeführter Pfadreport | Alle 1.708 Zeilenverknüpfungen gegen 47 Originalblobs stimmen; zusammen mit 381 gesonderten Zeilen sind alle 2.089 nichtleeren Zeilen genau einmal abgedeckt |
| Klassifikationen | Unverändert 182 erweitern, 1.898 extrahieren, 14 behalten, 785 entfernen |
| Aktueller Übergabestatus | 2.594 `content-reviewed`, 285 `blocked`; keine `captured`-Quelle |
| Migration | Alle 2.879 `migration_status: pending`; keine Quelldatei gelöscht oder verschoben |

Die Identitäts- und Zuordnungsprüfungen wurden unabhängig neu berechnet.
Sie beweisen keine frühere oder heutige vollständige semantische Lektüre.
`blocked` bedeutet hier: Die vorhandene Inhaltsentscheidung ist erhalten, aber
ihre Übergabe erfüllt das konkrete Zielkriterium noch nicht. Es bedeutet weder
„Quelldatei ungelesen“ noch „Implementierungsfinding wieder geöffnet“.

## Bestätigte und korrigierte Mängel

**61 unterschiedliche Registereinträge sind korrigiert.** Die Hauptsession hat
die vorgeschlagenen Feldänderungen geprüft und gemeinsam integriert. Originalblobs
und Klassifikationen bleiben unverändert. Die zwei Verwaltungsquellen wurden
nach tatsächlicher Lektüre an den oben genannten Prüfcommit gebunden.

| Betroffene Einträge | Korrektur und Nachweis |
| --- | --- |
| 51 Dokumentations-/Supporteinträge | Widersprüchliche Ziele für dasselbe Material zusammengeführt: 42 Katalogzuordnungen verwenden jetzt die bereits zugeordneten punktgetrennten Paketnamen, 47 Statuszuordnungen `docs/site/status/current.md`, vier Katalogindexzuordnungen `README.md`. Die Gruppen überlappen. Beispiel: Container-Build-Baseline und -Anleitungen müssen auf dieselbe Katalogseite führen. Geplante Seiten müssen noch nicht existieren; korrigiert wurde die unbegründete doppelte Zuordnung. |
| Vier Review-Verwaltungseinträge | `restored-documents.json` verlangt kein zweites `AP03-source-ledger.json` mehr. Die Wiederherstellungsprovenienz wird dem bestehenden Register und einer benannten Entscheidungsseite zugeordnet. `partial-47-progress.json`, `native-followup-39-20260911.json` und `work-items.json` führen in die vereinbarte `docs/site/`-Struktur statt in zusätzliche `docs/operator/`-/`docs/developer/`-Bäume. |
| `run12-prism-reader-first.txt` | Tatsächlicher Fixture-Leser `tests/verification/reliability/prism-reader-value.test.mjs:8` bestätigt. Ziel ist nun die bytegleiche Testfixture `tests/verification/fixtures/prism-reader-first.txt` mit gleichzeitiger Änderung des Lesers, koordiniert mit der bereits zugeordneten Matrixdatei. Eine Statuszusammenfassung allein hätte den Testinput nicht erhalten. |
| Zwei Accounting-Einträge | `wave47-store-independent/accounting-final.mjs` und `.txt`: Der Probe prüft nach Replay `newlyRetired=false` und gleiche `releasedBytes`, aber keinen Vorher-/Nachhervergleich der gespeicherten Bytes. `replayedWithoutMutation` ist nur ein aus `!newlyRetired` gebildetes Ausgabefeld. Die Registeraussage wurde auf den tatsächlich erbrachten Nachweis begrenzt; keine Aussage über einen neuen Laufzeitfehler. |
| `wave47-sdk-source/historical-provenance.json` | Verzeichnisverweis aus `tests/verification/reliability/fixtures/legacy-source-snapshots/README.md:7` ergänzt. Alle vier Fixture-Hashes stimmen; ein reiner Vollpfadscan hatte diesen Verbraucher nicht erfasst. |
| Blueprint-Index und Arbeitsplan | Fehlende Zielgruppe ergänzt; konkrete dauerhafte Abschnitte in `CONTRIBUTING.md` von vorübergehender Navigation und AP-Abnahme getrennt. |

Die Pfadkorrekturen erklären keine globale Konsistenz aller übrigen Ziele.
Die Nachprüfung ändert weder Produktverhalten noch historische Originalnachweise.

## Noch offene AP03-Übergaben

Die bestehende Anforderung bleibt: Bei Extraktion sind konkrete Abschnitte und
Zielorte zu nennen; „später übernehmen“ genügt nicht. Fehlende Zielentscheidungen
dürfen nicht allein nach AP04 verschoben und zugleich als AP03-erledigt gezählt
werden. AP04 führt anschließend die eigentliche Übernahme und aktuelle
Finding-/Abnahmezuordnung durch.

| Gruppe | Einträge | Fehlender Entscheid |
| --- | ---: | --- |
| P05: allgemeines Statusziel | 278 | Nach Korrektur der Reader-Fixture verbleiben 278 Extraktionen mit ausschließlich `S1 / docs/site/status.md — current limits and separate live acceptance` als Ziel. Die oft detaillierte Beobachtung ist vorhanden, aber der ausgewählte Zielabschnitt bzw. übergeordnete Abnahmeeintrag fehlt. Pro Beobachtung festlegen, was wohin übernommen wird und ob originale maschinelle Belege benötigt werden. |
| API-/Axe-Cutoverinventare | 2 | `pipeline-test-gate-api-cutover-inventory.json` und `pipeline-test-gate-a11y-cutover-inventory.json`: konkreten maschinenlesbaren Ort für 32 bzw. 24 Zuordnungen und ihre ausführbaren Cutover-Verbraucher bestimmen. „Migration verification data“ ist kein bestimmter Zielort. |
| Axe-Dokumentationsmanifest | 1 | `pipeline-test-gate-a11y-documentation-manifest.json`: ausdrücklich entscheiden, ob der vorhandene Pfad bleibt oder das Manifest umzieht; Dokumentfelder und dynamischen Prüfer gemeinsam zuordnen. |
| Externe Paketinstallation | 1 | `skills/common/plugin-runtime/foundation/packages/README.md`: kanonischen Ort für Installation, Aktivierung, Drain und Entfernung festlegen; Betrieb und Erweiterungsleitfaden dürfen nicht zwei unabhängige Installer-Erklärungen erhalten. |
| P06: unbestimmter übergeordneter Nachweis | 3 | `buildkit-preflight-version-fixed.txt`, `pr6-postgresql-migration/versions.txt`, `wave47-product/report-operator.log`: Ein künftiger Statusabschnitt nach Logdateiname und kopierte Konsolenausgabe bestimmen noch keinen übergeordneten Nachweis oder die zu bewahrende Aussage. |
| **Gesamt** | **285** | **Im vorhandenen Register als `blocked` mit konkreter Nacharbeit markiert.** |

Die Sperren betreffen 284 Extraktionen und eine Erweiterung des Axe-Manifests.
Diese 285 sind Übergabesperren, keine 285 nachgewiesen falschen
Inhaltsbewertungen. Die vier Hauptentscheidungen werden nicht allein wegen einer
unvollständigen Zielangabe geändert. Quelle, Begründung und bisherige Prüfung
bleiben erhalten; `next_action` bezeichnet den fehlenden Entscheid.

Weitere Kandidaten benötigen eine gezielte Sichtung, sind aber **nicht pauschal
als Fehler oder zusätzliche Sperren gezählt**:

- In der ursprünglichen 506er-Gruppe plus P01 enthalten 126 Ziel-/Änderungsfelder
  keinen expliziten Dateinamen. Ein klarer Kapitel-/Abschnittsname kann genügen;
  vollständige Testdateien benötigen keine künstliche Unterüberschrift. Vier
  bestätigte Beispiele stehen bereits in der Tabelle.
- In P06 hatten 576 Einträge dieselbe allgemeine Konsolidierungsanweisung und
  Ziele nach `Acceptance provenance / <Quellname>`. Manche Begründungen oder
  eingehenden Verweise bestimmen den Zusammenhang ausreichend, andere nicht.
  Drei vollständig nachgelesene Beispiele sind oben gesperrt. Nach den beiden
  Accounting-Korrekturen bleiben 575 mit der ursprünglichen Anweisung; das
  gesamte Muster ist über Paket P06 und den Zielpräfix nachvollziehbar.
- Der globale rein formale Scan fand vor Korrektur 129 Ziele ohne Pfad und 182
  weitere Nicht-Löschziele nur mit Pfaden. Diese Mengen überlappen andere
  Kandidaten und dürfen weder addiert noch automatisch zu Fehlern erklärt werden.

Die sieben einzelnen Sperren sind vollständig nachgelesene Beispiele; die
278er-Gruppe ist ein vollständiger Abgleich der identischen unzureichenden
Zielangabe. Für sie wird keine erneute vollständige Lektüre aller Quellen behauptet.

## Technische Nachprüfung und Grenzen

| Bereich | Umfang der Nachprüfung |
| --- | --- |
| Scope/Provenienz | Alle Registeridentitäten, Paketzuordnungen und Report-Zeilenverknüpfungen unabhängig gerechnet |
| Ursprüngliche Quellen/P01 | 570 Einträge gesichtet; 29 unterschiedliche Originaldokumente vollständig gelesen; alle 14 Behalten-Entscheidungen bewertet, davon drei große TSVs nur strukturell und stichprobenartig |
| P02–P04 | 536 Einträge strukturell gesichtet; 21 Originaltexte vollständig gelesen; aktuelles Register und vier Quellverbraucher gezielt verglichen |
| P05 | 858 Einträge/Hashes geprüft; 24 unterschiedliche Quellen vollständig gelesen; weitere Matrizen und Manifestdaten strukturiert untersucht |
| P06 | 915 Einträge/Hashes geprüft; 23 unterschiedliche Originalquellen vollständig gelesen; alle 28 dortigen letzten-90-Einträge strukturiert untersucht |

Damit wurden über 90 ausgewählte Originalquellen vollständig nachgelesen,
zusätzlich technische Verbraucher geprüft. **Dies ist keine zweite vollständige
Inhaltsprüfung aller 2.879 Dateien.** Auch ein langer Registertext oder gültiges
JSON beweist keine inhaltlich richtige Entscheidung.

Die Stichproben bestätigen insbesondere:

- Die 13 unvollständigen Findings, D01–D16 und getrennte Live-Grenzen gehen in
  den geprüften Entscheidungen nicht verloren. `register.json` enthält weiterhin
  141 verifizierte, drei in Bearbeitung, zwei implementierte und acht offene
  Findings; eine Dokumentationsprüfung schließt keines davon.
- Vier veraltete Statusangaben in `register.md` und widersprüchliche historische
  SDK-/Registry-Unterstände sind bereits als Übernahmeprobleme erfasst.
- Die unvollständigen Quickstart-/Pluginbeispiele, fehlenden `BACKUP_*`-Parameter,
  der Image-Scan ohne `--ignore-unfixed` und die tatsächliche Exact-Origin-Regel
  im HTTP-Runtime-Code sind korrekt als Dokumentationskorrekturen erkannt.
- Der direkte 13-Einträge-Nachweis ist keine vollständige 38-Einträge-Matrix;
  abgeschnittenes JSON und API-Serverlog sind bereits als unvollständig erfasst.
  Künstliche Signaturen und CRD-Annahme belegen weder vollständiges Deployment
  noch echte Nutzerfreigabe. Frühere ungültige Zertifikatsintervalle bleiben von
  später korrigierten Proben getrennt.
- Die 88 leeren und 21 reinen npm-Warnungsdateien in P06 stimmen mit ihrer
  Beschreibung überein. Grüne Teilprüfungen mit expliziten Grenzen werden in den
  gelesenen Beispielen nicht zu vollständiger Produktabnahme umgedeutet.

Keine historischen Tests erneut ausgeführt, keine Runtime-/Native-/Cluster-
Abnahme vorgenommen, keine externen Behauptungen neu verifiziert. Quelllesen,
Git-Identitätsprüfung und Dokumentationsvalidierung sind getrennte Nachweise.

## Änderungen auf main separat nachführen

Beim read-only Remote-Abgleich stand main auf
`1e50167fcb4355dfce4110d612ab360828c64394`.
Gemeinsamer Ausgangspunkt mit PR #13 ist
`6979bced8e5bbca90568276256e7328d93a1e072`.
Seit diesem Punkt betreffen main-Änderungen neun Dokumentationspfade:

| Änderung | Pfade |
| --- | --- |
| Geändert | `README.md`, `docs/architecture/ops-pod.md`, `docs/deployment/README.md`, `docs/generated/inventory/workflows.json`, `docs/ops/ops-pod.md`, `docs/reference/workflows.md` |
| Entfernt | `docs/ops/chatgpt-ops-bootstrap.md` |
| Neu | `docs/deployment/continuous-gitops.md`, `gitops/platform/README.md` |

Hinzu kommen geänderte technische Belege: Ops-Pod-Supervisor/RBAC/Kubeconfig,
GitOps-Installation/Promote/Rollback, Workflow-/Versionsquellen und neue
Worker-/Nova-Ressourcengrenzen. Vor der aktuellen Übergabe sind diese Änderungen
gezielt abzugleichen. Der feste AP03-Nenner wird dabei nicht nachträglich
umgeschrieben; neue Quellen und neue geprüfte Blobs werden ausdrücklich erfasst.
Die neuen Texte wurden in dieser Nachprüfung noch nicht redaktionell abgenommen.

PR-spezifische Blueprint-/Verwaltungsdateien fehlen naturgemäß auf main; das sind
keine nachgewiesenen Löschungen dieser Arbeit. Es wurde nichts gemergt und keine
neue main-Änderung überschrieben. Die sechs nach dem eingefrorenen Umfang neu
entstandenen AP03-Verwaltungsdateien einschließlich dieses Berichts bleiben
temporäre Migrationsbelege und unterliegen dem vorgesehenen AP11-Abgleich.

## Nächster Schritt und erneute Abnahme

1. Die 285 `blocked`-Übergaben anhand ihrer vorhandenen Beobachtungen und
   Originalquellen präzisieren; tatsächliche Testfixtures und reine historische
   Logs unterscheiden. Zielentscheidung und Begründung im bestehenden Register
   ergänzen, keinen zweiten Ledger erzeugen.
2. Die zusätzlichen Kandidatengruppen prüfen. Nur konkret nachgewiesene Lücken
   als Sperren aufnehmen; klare Kapitelzuordnungen und vollständige
   Fixture-Zielpfade nicht wegen einer bloßen Formatheuristik verwerfen.
3. Die benannten main-Änderungen und neuen Verwaltungsdateien ausdrücklich
   nachführen, ohne alte Quellidentitäten still auszutauschen.
4. AP03 erst wieder als abgeschlossen melden, wenn Zielentscheidungen und
   Nacharbeit nachvollziehbar erledigt sind. Danach führt AP04 die eigentliche
   Sicherung offener Arbeit, Entscheidungen und separater Live-Abnahmen aus.

Die Abschlusskriterien wurden für diese Nachprüfung nicht abgeschwächt.

## Prüfung der integrierten Korrekturen

Die abschließende unabhängige Integrationskontrolle bestätigt genau 346
geänderte Registerzeilen: 61 Korrekturen und 285 Sperren. Bei den Sperren wurden
nur `status` und `next_action` geändert; Originalblobs, Kategorien, Entscheidungen
und Migrationszustände bleiben erhalten. Nur die zwei tatsächlich nachgelesenen
Verwaltungsquellen erhielten den aktualisierten Prüfcommit/-blob. Paket- und
Gesamtzahlen stimmen. Pflichtfelder, lokale Linkziele und Whitespaceprüfung
bestanden; dies ist kein vollständiger Dokumentationsbuild oder Runtime-Test.
