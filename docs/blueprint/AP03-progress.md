# AP03 — Einzelprüfung der Dokumentation

Stand: 15.09.2026. **In Arbeit; nicht abgeschlossen.**

## Ergebnis dieses Zwischenstands

220 Dokumente wurden vollständig gelesen und einzeln entschieden: sämtliche
97 Root-/Komponententexte, beide Agentenanweisungen und 121 Dokumentationstexte.
Die Entscheidungen sind **134 erweitern, 79 Informationen extrahieren,
6 behalten und 1 entfernen**. Die Entfernung betrifft einen redundanten
Projekt-Runtime-Verweis; seine Links und gegebenenfalls benötigten Angaben müssen
zuerst übernommen werden. Keine automatische Erfassung zählt als Inhaltsprüfung.
Noch kein Ersatztext ist abgenommen und keine Quelldatei wurde gelöscht.

Das [manuell gepflegte Prüfregister](review-ledger.jsonl) enthält je Quelldatei
einen Datensatz. Geprüfte Datensätze nennen konkrete Begründungen, Zielabschnitte,
zu übernehmende bzw. zu korrigierende Inhalte, Quellen, Verweiskandidaten und den
nächsten Schritt. `extract` bedeutet Informationen übernehmen und danach den
überflüssigen Ursprung entfernen; `expand` kann auch eine Zusammenführung am
kanonischen Ziel verlangen. Zielpfade sind **geplante Zielorte**, keine Behauptung,
dass diese Kapitel bereits existieren oder fertig sind.

## Umfang und Prüfgrenzen

Der eingefrorene Quellstand ist
`e4ba8b1dd830f38450fcabedf4db7188aaeb6c44` auf
`docs/documentation-overhaul` in [PR #13](https://github.com/datrab/kubeclaw/pull/13).
Das Register übernimmt den begründeten AP01-Umfang und ergänzt die sieben seither
neu hinzugekommenen Verwaltungsdateien. Es umfasst **2.879 Quelldateien**, davon
960 Markdown-Dokumente und 1.919 weitere Dokumentations-, Register- und
Nachweisdateien. Die fünf Markdown-Testfixtures bleiben wie in AP01 aus der
redaktionellen Migration ausgeschlossen; auch Lizenzen werden nicht als
redaktionelle Löschkandidaten behandelt. Nichttextuelle Nachweise benötigen eine
inhaltliche bzw. funktionale Einzelbewertung, keine bloße Dateinamensentscheidung.

| Gruppe | Dateien | Davon inhaltlich geprüft |
| --- | ---: | ---: |
| Root- und komponentennahe Dokumentation | 97 | 97 |
| Dokumentationstexte unter `docs/` außerhalb der Reviews | 380 | 121 |
| Dokumentationsunterstützung | 82 | 0 |
| Neue AP01-/Plan-Verwaltungsdateien | 7 | 0 |
| Review-Texte | 479 | 0 |
| Review-Nachweise und Register | 1.832 | 0 |
| Agentenanweisungen | 2 | 2 |
| **Gesamt** | **2.879** | **220** |

**2.659 Dateien bleiben in AP03 erfasst, aber ungeprüft**, darunter 740
Markdown-Dokumente. Die bereits erfolgte AP02-Blueprint-Abnahme ersetzt diese
dateibezogene Migrationsentscheidung nicht. Die beiden neuen AP03-Arbeitsdateien
dieses Zwischenstands sind Verwaltungszugänge nach dem eingefrorenen Quellstand;
beim nächsten Bestandsabgleich werden sie mit ihrem dann verfügbaren Blob
ergänzt. Geänderte Bestandsdateien, insbesondere Arbeitsplan und Blueprint-Index,
werden ebenfalls gegen den neuen Blob abgeglichen. Keine selbstreferenziellen
Prüfzahlen oder vorausberechneten Commit-Hashes.

Für die Verweissuche liegen alle 965 Markdown-Dateien des Quellstands vor. Eine
Suche über 2.949 anhand ihrer Git-Blobs verifizierte Textquellen erfasst 424
eingehende Literal-/Markdown-Link-Kandidaten für die ersten 52 geprüften Texte.
Das ist **keine vollständige Abhängigkeitsabnahme**: dynamisch zusammengesetzte
Pfade, Referenzlinks, Anker, HTML/MDX und weitere Verbraucher müssen vor der
jeweiligen Migration zusätzlich geprüft werden. Kandidaten in generierten
Inventaren sind nicht automatisch aktive Laufzeitabhängigkeiten. Die breitere
[AP01-Verbraucherliste](ap01-baseline/documentation-consumers.tsv) bleibt die
Ausgangsquelle für Generator-, Workflow- und Testabhängigkeiten.

Technische Kernaussagen wurden anhand der im jeweiligen Eintrag genannten
Quellen eingegrenzt. Es wurden in AP03 keine Beispielbefehle, Datenbankdienste,
Scanner, Helm-Deployments oder Live-Abnahmen ausgeführt. Ein vorhandener Test
gilt nicht als hier bestandener Test. Externe Hersteller- und Dienstbehauptungen
wurden nicht erneut extern verifiziert; sie müssen vor ihrer Übernahme geprüft
werden. Das Register kennzeichnet noch zu klärende technische Aussagen.

## Konkrete Befunde und Übernahmeaufträge

Diese Befunde sind Eingaben für AP04–AP09, keine vorweggenommene vollständige
Lückenanalyse aus AP05.

| Thema | Feststellung | Konkreter Folgeauftrag |
| --- | --- | --- |
| Einstieg | Der Site-Quickstart führt Prüf-/Hilfsbefehle aus, startet aber keinen Auftrag. Die Startseite verspricht mehr. | Ein vollständiger Auftrag mit Voraussetzungen, Eingaben, tatsächlichem CLI-Einstieg, Ergebnis und Fehlerpfad in U1/U2. |
| Repository-Einstieg | Root-Links zeigen auf fehlende Indexdateien; die Lizenz wird als unentschieden beschrieben, obwohl `LICENSE` MIT enthält. | Navigation und Lizenz korrigieren; Rollen, Images und Deploymentaussagen am aktuellen Quellstand prüfen. |
| Beitragsregeln | Root-`CONTRIBUTING.md` empfiehlt ein Archiv; mehrere Beitragsseiten wiederholen dieselben Regeln. | Ein kanonischer Beitragsleitfaden mit dem beschlossenen informationsbewahrenden Löschverfahren; keine neue Altarchiv-Anweisung. |
| Plugin-Erstellung | Das erste Plugin-Beispiel enthält keine vollständige Implementierung, Schemas, Tests und Aktivierung. | In E2 ein baubares und eingebundenes Minimalbeispiel; E3/E5 übernehmen Lifecycle-, Berechtigungs- und Fehlerverträge. |
| Pipeline-Einstieg | `skills/nova/pipeline.ts` leitet an `project/cli.ts` weiter; mehrere Anleitungen verweisen stattdessen auf `core/cli.ts`. | Den öffentlichen Ablauf aus `package.json` und dem tatsächlichen Projekt-CLI herleiten; keine Flags aus einer anderen Schnittstelle übernehmen. |
| Entwicklerprüfungen | Native Pluginprüfungen benötigen echte delegierte cgroup-v2-Ressourcen; kurze Einstiegsseiten nennen diese Voraussetzungen nicht. | Host-Voraussetzungen, passende Gates und erwartete Kontrollfehler in E5 durchgehend erklären. |
| Image-Scan | Die Anleitung spricht von behebbaren HIGH/CRITICAL-Lücken; das Skript setzt keinen `--ignore-unfixed`-Filter. | Text an das tatsächliche Gate anpassen; Fehler durch Befunde, Datenbankalter und Scannerbetrieb unterscheidbar machen. |
| PostgreSQL-Recovery | Gute Wiederherstellungsgrenzen, aber `BACKUP_*` bleibt in der direkten Anleitung unvollständig. | Pflichtfelder aus `postgresql-recovery.sh`, Herkunft der Werte, sichere Umgebung und ausführbare Verifikation ergänzen. |
| Stateful-Migrationen | Frische Ziele, Schreibsperre, Credential-Erhalt und Grenzen nach neuen Schreibzugriffen sind wertvoll. Kopier-/Prüfschritte bleiben teils implizit. | Diese Details bewahren und Transfer, Parameter, erwartete Ergebnisse, Abbruch und Wiederanlauf ausführbar vervollständigen. |
| Qdrant-Status | Im selben Dokument wird die Migration als noch nicht implementiert bezeichnet und später auf die vorhandene Full-Storage-Prozedur verwiesen. | Lokale Implementierung, verbleibende Infrastrukturaufgaben und ausstehende Live-Abnahme anhand stabiler Finding-IDs trennen. |
| Prism-Produktentscheidungen | Die Authority-Konfiguration ist detailliert; ein tatsächlicher Entscheidungs- und Wiederaufnahmeablauf fehlt. | `applied`/`pending`, Belege und Wiederaufnahme derselben gespeicherten Entscheidung mit konkreten Schritten erklären. |
| Aufbewahrung | Unterstützte begrenzte Kompaktierungen existieren; vollständige Scope-Beispiele und Verträge liegen teilweise nur in Reviews. | Scope-/Replay-Regeln vor Review-Löschung in das Betriebshandbuch übernehmen; verbleibende PCR-OBS-002-Arbeit sichtbar lassen. |

Die Detailentscheidungen erhalten auch wichtige Feinheiten: Idempotenz und
verlorene Bestätigungen, absolute Dedup-Abläufe, unveränderte Credential-Autorität,
quellengebundene Beobachterzustellung, alte Schema-Kompatibilität, getrennte
Single-Collection- und Full-Storage-Restores sowie geschützte kanonische Historie.
Zusammenführen darf diese Informationen nicht zu allgemeinen Warnsätzen kürzen.

## Weiterarbeiten und Register pflegen

Das Register liegt bewusst außerhalb `docs/blueprint/generated/`. Der alte
Blueprint-Generator ist nicht Eigentümer manueller Entscheidungen und darf sie
nicht überschreiben. Seine alten Kategorien/Prüfstände ersetzen dieses Register
nicht. Jeder neue Eintrag beginnt mit `status: captured` und `decision: null`.
Erst nach vollständiger Inhaltsprüfung werden die Entscheidungsfelder ergänzt.
`content-reviewed` ist unabhängig von `migration_status: pending`.

Bei geändertem Quellblob bleibt die bisherige Entscheidung nachvollziehbar;
betroffene Aussagen werden gezielt nachgeprüft, bevor ein neuer geprüfter Stand
eingetragen wird. Nicht stillschweigend den Blob austauschen und den alten
Prüfstatus beibehalten. Der Quellcommit dieses Berichts bindet auch die
`captured`-Datensätze; geprüfte Datensätze nennen ihn zusätzlich ausdrücklich.

Alle Operations-, Deployment- und Sicherheitsdokumente, die ersten sieben
Architektureinstiege, alle 51 Katalogseiten und sämtliche 95 weiteren
Komponententexte/Agentenanweisungen sind jetzt einzeln entschieden. Als Nächstes
folgen die übrigen 261 Markdown-Texte außerhalb der Reviews und die 479
Review-Texte samt ihren Nachweisen. Verwaltungsdateien und technische
Dokumentationsunterstützung erhalten ebenfalls Einzelentscheidungen.

Die 13 unvollständigen Findings, getrennte Live-Abnahmen und das zusätzliche
GitHub-Issue #7 bleiben erhalten. Aus diesen Dokumentationsentscheidungen folgt
keine Schließung technischer Arbeit und keine Löschfreigabe für Review-Nachweise.

## Fortsetzung: Hostbetrieb, Registry, Releases und Prism

Die fünf zusätzlichen Entscheidungen beziehen sich auf Commit
`a8a5b526efbe26b726f8fd5297c98bcbd2f221b7`; ihre Quellblobs sind gegenüber dem
eingefrorenen Bestand unverändert. Alle 15 Texte unter `docs/operations/`
sind damit inhaltlich bewertet, aber noch nicht überarbeitet oder abgenommen.
Die oben genannten 424 Verweiskandidaten beschreiben den ersten 52er-Stand;
die zusätzlichen Kandidaten stehen direkt in den fünf neuen Einträgen.

Bestätigt sind der native-only Prism-Einstieg mit verpflichtendem Host-Preflight,
die veraltete optionale Aktivierungsbeschreibung im Host-Handbuch und die
unvollständigen alten Helm-Rezepte im Trust-Runbook. Die Versionsdokumentation
benötigt außerdem eine konsistente Zuständigkeitskarte: Infrastruktur-Pins und
Chart-Locks werden inzwischen zentral geprüft; der erwähnte Sechserumfang der
Checksum-Prüfung ist veraltet. Registry-Anweisungen müssen insbesondere den
privaten Node-Konfigurationsweg und die noch fehlende v2-zu-v3-Migration erklären.
Keine dieser Inhaltsprüfungen ersetzt Host-, Image- oder Cluster-Abnahmen.

## Fortsetzung: Deployment, Katalog und Komponenten

Die 163 zusätzlichen Entscheidungen beziehen sich auf Commit
`5cd9e29e1b426c193d159df04f618a36d320bd47`; die geprüften Quellblobs sind
gegenüber dem eingefrorenen Bestand unverändert. Der Abgleich verwendet 2.947
mit diesem Commit übereinstimmende Textquellen für die zusätzlichen
Verweiskandidaten. Die Suchgrenzen gelten weiterhin.

Der vorhandene Katalog wird wiederverwendet. Seine 50 Paketmanifeste stimmen
bei den gelisteten Registrierungen überein; die 51 Seiten einschließlich Index
sind damit aber noch keine verständliche Nutzungsanleitung. Die beiden
OpenClaw-Manifeste enthalten Inline-Konfigurationsschemata, die der Generator
als fehlend darstellt. Prism bietet Designänderungswerkzeuge und ist nicht nur
Beobachtung. Paketlokale Testzahlen sind kein Maß der Repository-Testabdeckung.

Aus den Komponenten-READMEs werden die konkreten Fehler-, Daten- und
Wiederholungsverträge in den jeweiligen Katalog übernommen. Axe erlaubt keine
numerischen Fehlerschwellen; Lighthouse behandelt keine Accessibility-Prüfung.
Der Demo-Login ist nicht sicher wiederholbar. Die Agent-Event-Queue ist flüchtig;
der Wait-Store autorisiert keine Wiederaufnahme. Core übernimmt diese Autorität.
Historische JSON-Profile und Originalbytes bleiben bei Artefakten erhalten.

Weitere Korrekturaufträge betreffen alte Common-Overlay-Anleitungen gegenüber
der aktuellen Paketierung ohne Overlay, v1-Projektfelder gegenüber dem
v2-Importvertrag, überholte Phase-/Paritätsbehauptungen und pipeline-eigene
Completion-Identität. Historische Harnesses benötigen weiterhin ihre Original-
Nachweise; deren Verweise verhindern eine pauschale Review-Löschung.
Die Einzelentscheidungen nennen jeweils die zu bewahrenden Feinheiten und
noch zu klärenden Aussagen. Keine Laufzeit- oder Live-Abnahme wurde ausgeführt.
