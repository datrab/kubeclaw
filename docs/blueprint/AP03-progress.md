# AP03 — Einzelprüfung der Dokumentation

Stand: 15.09.2026. **Abgeschlossen für den eingefrorenen Quellumfang.**

## Ergebnis der Einzelprüfung

**2.879 von 2.879 Quelldateien sind einzeln inhaltlich bzw. funktional bewertet;
Keine Quelldatei bleibt ungeprüft.** Entscheidungen: **182 erweitern,
1.898 Informationen extrahieren, 14 behalten und
785 entfernen**. Die funktionale Bewertung betrifft ausdrücklich
als solche gekennzeichnete nichttextuelle Nachweise; sie ist keine Behauptung,
jeden eingebetteten historischen Quelltext gelesen zu haben. Automatische
Erfassung und Paketzuordnung zählen nicht als Inhaltsprüfung.
Noch kein Ersatztext ist abgenommen und keine Quelldatei wurde gelöscht.
Die [sechs Arbeitspakete](AP03-work-packages.md) enthalten die genaue Zuteilung.

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

| Gruppe | Dateien | Davon inhaltlich/funktional geprüft |
| --- | ---: | ---: |
| Root- und komponentennahe Dokumentation | 97 | 97 |
| Dokumentationstexte unter `docs/` außerhalb der Reviews | 380 | 380 |
| Dokumentationsunterstützung | 82 | 82 |
| Neue AP01-/Plan-Verwaltungsdateien | 7 | 7 |
| Review-Texte | 479 | 479 |
| Review-Nachweise und Register | 1.832 | 1.832 |
| Agentenanweisungen | 2 | 2 |
| **Gesamt** | **2.879** | **2.879** |

**Alle 2.879 Dateien besitzen eine Inhaltsentscheidung.**
Die bereits erfolgte AP02-Blueprint-Abnahme ersetzt diese
dateibezogene Migrationsentscheidung nicht. Die fünf AP03-Verwaltungsdateien
`review-ledger.jsonl`, `AP03-progress.md`, `AP03-work-packages.md`,
`AP03-work-packages.json` und `AP03-report-review-map.json` sind Ergebnisse dieser
Prüfung außerhalb des eingefrorenen Quellumfangs. Sie bleiben bis zur
Migrationsabnahme als Arbeitsnachweis erhalten; beim abschließenden
Bestandsabgleich in AP11 werden sie ausdrücklich einbezogen und gemäß der
Blueprint-Regel für temporäre Migrationsunterlagen entfernt bzw. abgeschlossen.
Der feste Nenner ist keine Aussage über sämtliche künftig hinzugefügten Dateien.
Arbeitsplan und Blueprint-Index wurden einschließlich aller Änderungen bis
Commit `9dee5aef73403deb9c565c3f1c09135fc2ca46cd` geprüft; ihre Originalblobs
bleiben erhalten und `reviewed_blob` nennt den tatsächlich geprüften Stand.
Die hier vorgenommenen Fortschrittsaktualisierungen sind separat nachvollziehbar. Keine selbstreferenziellen
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
Komponententexte/Agentenanweisungen sind jetzt einzeln entschieden. Die noch ungeprüften Quellen sind je Arbeitspaket anhand von `status: captured`
im Register bestimmt. Bereits gespeicherte Einzelentscheidungen bleiben erhalten.

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

## Fortsetzung: Architektur und Suite-Anleitungen

Weitere 92 Texte sind einzeln entschieden: Roadmap und Architekturindex,
Ops-Architektur, Observability-Fundament samt sieben Audits, Paketierung samt
sieben Audits sowie die Anleitungen und Phasentexte zu Axe, API, Container-Build,
Playwright, HTTP, Kubernetes-Fixtures, Lighthouse und statischer Manifestprüfung.
Die verwendeten Quellblobs sind weiterhin unverändert; technische Nachprüfung
umfasst insbesondere alle drei aktuellen Rollenmanifeste und die
`#target`-/`invoke`-Grenze in `network-http-runtime.ts`.

Die API-/HTTP-Anleitungen erlauben fälschlich reine DNS-Suffix-Freigaben für
GET/HEAD. Der aktuelle Code verlangt auch für diese Methoden einen exakt
autorisierten Ursprung. Bei Playwright widerspricht eine alte Portbeschreibung
der Trennung zwischen Service-Port, Backend-Port und temporärem lokalen Proxy.
Die Kubernetes-Feldreferenz lässt vorhandene Storage-Grenzen aus und ältere
Texte berücksichtigen den gezielten Demo-Credential-Vertrag nicht.
Lighthouse-Texte widersprechen sich beim HTTPS-Tunnelverhalten; der konkrete
Abgleich mit der Implementierung bleibt als Korrekturauftrag erfasst.

Statische Kubernetes-Prüfung gehört zur Nova-Lint-Erweiterung. Die alten
Manifest-Phasen werden daher dorthin extrahiert, nicht als zusätzlicher
Buster-Provider beschrieben. Das generierte Manifest-Paritätsdokument wurde
mit allen 28 Zeilen gelesen; seine Verweise und benötigten Originalnachweise
müssen vor der Entfernung zusammen mit dem Generator migriert werden.
Historische lokale Pass-Ergebnisse und akzeptierte Live-Deferrals werden
nicht in aktuelle Erfolgsbehauptungen umgedeutet.

## Fortsetzung: Verträge, Unit, Security, Size-Budget und Migration

Weitere 52 Texte wurden vollständig gelesen und entschieden: die Vertrags-,
Registry-, Resolver-, Runner-, Reportadapter- und Remote-Phasen, sämtliche
Unit-Phasentexte einschließlich aller 93 Paritätszeilen, Security- und
Size-Budget-Anleitungen sowie der Migrationsworkflow und die sechs ausführlichen
Suite-Closeouts. Insgesamt sind jetzt 408 Texte inhaltlich entschieden.

Zu bewahren sind insbesondere exakte Reportzahlen trotz begrenzter Details,
Originalberichte, die getrennten Budgets für Provider- und normalisierte
Resultate, unveränderliche Adapterauswahl und sichere Wiederaufnahme von
Ergebnisübertragungen. Alte Angaben zur Signierung, zum separaten Graph-Writer,
zu optionalen cgroups und zu aktiven Legacy-Bridges widersprechen neueren
Quellen; die Entscheidungen nennen jeweils die nötige Auflösung.

Die Unit-Paritätsseite enthält weitgehend generische Begründungen. Vor ihrer
Entfernung müssen die einzelnen UNIT-IDs gegen die eigentliche Baseline
aufgelöst werden. Der Size-Budget-Paritätsbericht nennt fälschlich noch 34
statt 35 Punkte. Die allgemeinen Migrationstemplates werden mit dem verbesserten
Blueprint zusammengeführt; ihre starren Seitenvorgaben sollen keinen neuen
Bestand redundanter Phasendokumente erzeugen.

Die 13 abgeschlossenen Suite-Quellumstellungen sind nicht mit den 13 offenen
Findings zu verwechseln. Elf Suite-Betriebsabnahmen stehen in der historischen
Migrationsübersicht noch aus; deren aktuellen Nachweisstand übernimmt AP04
separat. Keine Prüfung in diesem Abschnitt ist eine neu ausgeführte Runtime-,
Scan-, Native- oder Clusterabnahme.

## Fortsetzung: Tailscale, Unit-Baseline, Visual, Worker und Plugin-/Prism-Architektur

Weitere 44 vollständige Einzelprüfungen erfassen Tailscale-Anleitungen, die
eigentliche 93-ID-Unit-Baseline samt Nutzer-/Betriebsanleitung, Visual-Anleitungen,
Worker-Core-Audits sowie sämtliche sieben Plugin-System- und vierzehn Prism-
Architekturtexte dieses Themenblocks. Alle Quellblobs stimmen weiterhin mit dem
angegebenen Prüfcommit überein.

Die Unit-Baseline erklärt jetzt auch die zuvor nur generisch begründeten
Paritäts-IDs. Ihre historischen Defekte sind keine Anforderungen an den heutigen
Betrieb. Visual-Konfiguration und Nutzerführung müssen die verpflichtenden
v2-Baselines und die tatsächliche Browserversion aufnehmen. Die dokumentierte
Migration des alten Preflight-Baselines bleibt ein zu überprüfender offener Punkt.

Das vorhandene Plugin-Inventar wird weiterverwendet. Die langen historischen
Pläne liefern dafür Vertragsentscheidungen, aber keine aktuellen Paketanzahlen
oder Betriebsfreigaben. Insbesondere sind Paket-, Registrierungs-, Invocation-
und Core-Autorität getrennt zu erklären. Observer-Retries benötigen stabile
Payloads; ein separater erforderlicher Audit-Observer ist kein normaler
Benachrichtigungsversand. Alte v1-/Overlay-/Buster-Topologien werden anhand der
heutigen Quellen korrigiert.

Die Prism-Texte enthalten vollständige konzeptionelle Verträge für Bundles,
Engine, Ingestion, Storage, Retrieval, Präferenzen, Runtime-Packs, Studio und
Qualitätsprüfung. Ihre Implementierungsbehauptungen bleiben einzeln zu prüfen.
Konkrete Konflikte betreffen PITR versus tägliche Backups, native Host-Anforderungen
versus pauschales HostPath-Verbot, entfernte Visual-Kompatibilität,
Approval-Autorität und unterschiedliche Finding-Formate. Genehmigte Bundle-
Nachweise dürfen nicht als beliebig neu erzeugbare Derivate behandelt werden.

Es wurden keine Runtime-, Browser-, Datenbank-, Deployment- oder Live-Tests
ausgeführt. Die 13 offenen Findings und getrennte Produktionsabnahmen bleiben
unverändert; sämtliche redaktionellen Migrationen stehen weiterhin aus.

## Fortsetzung: Blueprint und Prism-Umsetzungshistorie

Weitere 36 Dateien wurden vollständig gelesen und entschieden: die sechs
Blueprint-Regeln, AP01-Bericht, generierte Zusammenfassungen und Support-Indizes,
zwei Namespace-Controller-Texte sowie sämtliche 22 Prism-Umsetzungspläne und
Phasenberichte. Der eingefrorene Blueprint-Index und Arbeitsplan wurden ebenfalls
gelesen; ihre inzwischen geänderten Blobs erhalten erst nach dem gezielten
Abgleich eine Entscheidung. Sie sind noch nicht in den 444 Prüfungen enthalten.

Zwei alte generierte Zusammenfassungen haben keinen eigenständigen verbleibenden
Inhalt. Ihre Entfernung setzt die Migration der Generator- und Prüfverbraucher
voraus. Die sechs Blueprint-Regeln bleiben während der Migration maßgeblich;
CLI-Quellen, konkrete Zielzuordnungen und Entscheidungssupersession werden ergänzt.

Der aktuelle Prism-Code widerspricht der alten No-Decay-Architektur: Die
Präferenzprojektion verwendet eine Halbwertszeit von 180 Tagen. Der Control-Pfad
speichert Referenzzeit, Policyversion und Projektvorrang. Implementierung,
Control-Snapshot und zugehöriger Test wurden vollständig gelesen und anhand
ihrer Git-Blobs geprüft. Die alten Ledger-Aufträge wurden entsprechend präzisiert.
Die Abweichung braucht eine nachvollziehbare Entscheidungsauflösung; ein Testlauf
fand nicht statt.

Die Prism-Phasenberichte zeigen außerdem, warum historische erfolgreiche
Aufrufe von verify:prism:production keine heutige Produktionsabnahme beweisen:
Der spätere Gate verlangt einen geschützten Live-Nachweis. Dessen HMAC-Vertrag
ist von den Ed25519-Operatorreceipts anderer Test-Suiten zu unterscheiden.
Alte Account-, Controller- und Clusterblockaden werden erst nach aktuellem
Abgleich als noch offene Arbeit übernommen.

## Fortsetzung: Echo, Operations-Referenzen und maschinenlesbare Nachweise

Weitere 46 Einzelentscheidungen schließen sämtliche Markdown-Texte außerhalb
der Reviews ab und bewerten die ersten neun JSON-Unterstützungsdateien. Darunter
sind alle 18 Echo-Architekturtexte, die drei großen Zuverlässigkeits-/Test-Gate-
Pläne, 14 Betriebs-/Referenztexte sowie Blueprint-Index und Arbeitsplan.
Die 119 nummerierten Test-Gate-Entscheidungen wurden vollständig gelesen.

Die Echo-Roadmap verschiebt den Repository-Audit noch in die Zukunft, während
der spätere Skalierungsbericht die separate Registrierung und ihren Ablauf
beschreibt. Die Entscheidungen müssen diese Ablösung ausdrücklich zeigen.
Dasselbe gilt für Policy-/Reportversionen, Core-zertifizierte Reparaturzyklen,
begrenzte Kontext-Erweiterungen und spätere Aufteilung großer Reviews. Die
historische Modellevaluation enthält unvollständige Läufe, falsch als sauber
markierte Zwischenkorrekturen und eine abgelehnte echte P0-Feststellung. Sie
belegt keine heutige Produktionsfreigabe.

Die Ops-Pod-Anleitung bleibt der zentrale Betriebsweg. Besonders zu ergänzen
sind tatsächlich ausführbare Storage-Backup-/Restore-Verfahren, die Grenzen
von Helm-Rollback und die getrennte Erneuerung von Credentials und Geräteidentität.
Die CLI-, Konfigurations- und Workflow-Referenzen haben unvollständige Inventare;
der Workflow-Generator zeigt zudem abgeschnittene Befehlsargumente.

Die ersten JSON-Prüfungen umfassen das Observability-Inventar sowie je vier
Axe-/API-Baseline-, Cutover-, Dokumentations- und Paritätsdateien. Alle Zeilen
wurden gelesen. Ihre technischen Verbraucher müssen bei der späteren Migration
erhalten oder gezielt umgestellt werden. Ein `proved`-Feld bedeutet weder,
dass AP03 den Test ausgeführt hat, noch dass eine darin ausdrücklich ausstehende
Clusterabnahme bestanden ist. Die 57 neu bereitgestellten Unterstützungsquellen
stimmen bytegenau mit den Git-Blobs des Prüfcommits überein; nur neun davon
sind bislang inhaltlich geprüft.


## Wiederaufnahme nach hängender Session: Beispiele, Verträge und Review-Einstieg

Der gesicherte Remote-Stand `2078b09ddbaf094c969ff0bae33a2482e7804da6`
wurde in einem sauberen Checkout übernommen. Der einzige zuvor gefundene lokale
Git-Checkout gehörte zu einer älteren Reparatursession und blieb unverändert.
Ungepushte Änderungen der hängenden Doku-Session sind damit nicht nachgewiesen.
Die PR-Beschreibung nannte noch AP01–AP02; maßgeblich ist dieses Prüfregister.

16 weitere Dateien sind vollständig gelesen und einzeln entschieden: sieben
JSON-Beispiele, vier Plugin-Vertrags-/Nachweisdateien, drei Prism-Statusdateien
und die beiden Review-Einstiege. Ihre Originalblobs stimmen mit dem Register
überein. Alle Code-/Test-/Deploymentpfade der beiden Prism-Matrizen existieren;
das beweist weder ihre fachliche Aktualität noch eine bestandene Abnahme.

Die beiden Projektbeispiele sind v1-Autorendaten, keine aktuellen Erfolgsbelege.
Das ausführliche Beispiel enthält eine Gate-Abhängigkeit, die der explizite
Legacy-Importer nicht als Modulabhängigkeit akzeptiert. Neue v2-Beispiele müssen
die Architektur, Blueprints und Gateentscheidungen ausdrücklich modellieren.
Die kompakten Swarm-Beispiele entsprechen nicht dem geschlossenen v2-
Plattformschema; ihre drei Reparaturrunden dürfen nicht ungeprüft die vereinbarte
Zwei-Runden-Regel ersetzen.

Die Capability-Matrix ist weiterhin eine Testeingabe. Der Phase-6-Test verlangt
sogar ausdrücklich die historische v1-Produktionsautorität. Inhalt und Verbraucher
müssen deshalb gemeinsam migriert werden. Die Phase-11-Isolationsbeschreibung
benötigt die inzwischen verpflichtenden cgroup-v2-Hostvoraussetzungen.

Die Prism-Dateien dokumentieren einen fehlgeschlagenen Controller-Versuch vom
22. August und übersprungene Folgeprüfungen. Sie sind weder eine heutige
Clusterdiagnose noch eine Produktionsfreigabe. Die Review-Einstiege liefern
wertvolle Kriterien für Fehlergrenzen und Nachweise; ihre 103 historischen
Findings sind nicht der aktuelle 154er-Reparaturstand.

Damals nächster Einstieg: übrige Dokumentationsunterstützung und die Review-Register
mit den noch offenen Findings. Keine Quelldatei gelöscht, kein technisches
Finding geschlossen und keine Runtime-/Live-Prüfung ausgeführt.

## Parallelprüfung: kontrollierte Zusammenführung

Ausgangspunkt der sechs Pakete ist Commit
`e5bc4b951f914b95a39655aa069daaba09ee51a2` mit 506 geprüften Dateien.
Die Zusammenführung integriert insgesamt 2.373 zusätzliche Entscheidungen.
Paketzugehörigkeit, eindeutige Pfade, unveränderte Originalblobs, Pflichtfelder
und getrennte Migrationszustände sind kontrolliert. Die Hauptsession hat
Quelltexte und zugehörige Entscheidungen aus allen sechs Paketen stichprobenartig
gegengeprüft, relevante Verbraucher gelesen und T01/T02 selbst vollständig
bewertet. Zu allgemeine Logentscheidungen, ungenaue Zielorte und missverständliche
Statusbezeichnungen wurden zur Korrektur zurückgegeben.

Wichtige Folgeaufträge:

- `register.md` enthält noch 140 lokale Abschlüsse und mehrere veraltete Zeilen;
  `register.json` enthält 141 verifizierte, drei in Bearbeitung, zwei implementierte
  und acht offene Findings. Die 13 unvollständigen Fälle bleiben bestehen.
- Historische Komponenten-/Tracereviews beschreiben inzwischen behobene Fehler.
  T01-F01/F02, die Workspaceübergabe und PATH-T02-001/002/003 sind im aktuellen
  Register lokal verifiziert. Die neue Leserführung muss sich am aktuellen Code
  orientieren; vollständige Live-Abnahme wird daraus nicht abgeleitet.
- Der Suite-Workflow-Checker liest alle Dokumentationsmanifeste dynamisch und
  kontrolliert Feldmarker. Seitenmigration benötigt daher mehr als Linkkorrekturen.
- Reliability-Tests führen weiterhin Skripte unter `docs/review/evidence/` aus
  oder lesen ursprüngliche Resultate als Testfixtures. Originalbytes und archivierte
  Identitäten dürfen beim Verschieben nicht durch frisch erzeugte Ersatzdaten
  ausgetauscht werden. Andere Verweise benennen nur eingebettete historische Pfade;
  diese sind von echten Dateilesern zu unterscheiden.
- Wiederholte Logs und leere Ausgaben werden nicht zu neuen Produktkapiteln.
  Notwendige übergeordnete Nachweise, noch offene Akzeptanzbedingungen und
  ausführbare Verbraucher müssen vor der Entfernung erhalten bzw. migriert sein.
- Veraltete Diagramme und Inventare verschweigen Komponenten oder zeigen falsche
  Autorität. SVG-Wiederverwendung setzt die im Register genannten Korrekturen voraus.

Alle Entscheidungen bleiben `migration_status: pending`. Keine Produktdateien
oder historischen Nachweise gelöscht, keine technischen Findings geschlossen,
keine Runtime-, Deployment- oder Live-Tests ausgeführt. Die letzten 90 Quellen sind in der Abschlussprüfung unten entschieden.

## Abschluss der letzten 90 Quellen

Die Hauptsession hat die verbleibenden 62 Quellen aus P05 und 28 aus P06
bewertet (`review_batch: ap03-final-90`): 62 Extraktionen und 28 bedingte
Entfernungen. Jede Quelle besitzt eine eigene Entscheidung mit konkretem
Zielabschnitt, Befund, erforderlicher Änderung und Migrationsbedingung.
Die bereits vorhandenen 2.789 Entscheidungen bleiben unverändert.

Strukturierte Matrix-/Manifestdaten wurden vollständig eingelesen und nach
Fallvarianten, Antworten, Versions-/Identitätsfeldern und Abweichungen verglichen.
Wiederholte Serverlogs wurden anhand ihrer Meldungen bewertet; Zeitstempel,
zufällige IDs und temporäre Ports wurden nur für den Vergleich normalisiert.
Eingebettete historische Quelltexte in Lintausgaben wurden funktional als
Diagnosebeilagen bewertet, nicht als vollständiges neues Code-Audit.
Abgeschnittene Originalaufzeichnungen bleiben ausdrücklich unvollständig.

Konkrete Übergaben an AP04 und AP09:

- `run12-prism-reader-first-matrix.txt` ist eine echte Eingabe von
  `tests/verification/reliability/prism-reader-value.test.mjs:50`.
  Originalbytes und Testpfad müssen gemeinsam in den Fixture-Bereich umziehen.
- `run5-native-matrix-2/native-fence-matrix.json` enthält nur 13 statt 38
  Einträge; die run6-coupled-Matrix ist mitten im JSON abgeschnitten.
  Das zugehörige API-Serverlog endet ebenfalls vorzeitig. Fehlender Umfang
  darf nicht aus anderen Läufen ergänzt oder als bestanden gezählt werden.
- Die native Statusmatrix prüft das CRD-Schema mit künstlichen Signaturen.
  HTTP201 beim CRD-Anlegen beweist weder Established noch eine echte
  Nutzerfreigabe oder ein erfolgreiches Anwendungsdeployment.
- Frühe Envoy-Ablaufproben besitzen ein ungültiges Zertifikatsintervall.
  Spätere Läufe und der aktuelle Prüfer kontrollieren ein korrekt geordnetes,
  tatsächlich abgelaufenes Intervall und Readiness nach Installation.
  SPIRE-gRPC und Operatorlieferung bleiben außerhalb dieser Nachweise.
- Die ursprünglichen Fehlläufe bleiben mit Ergebnis und Ursache erhalten:
  100/101 Runtime-Tests (ArtifactStore-ready-Timeout), 7/25 Source-Consumer-Tests
  (unter anderem verweigerte Artifact-Capability), 14/21 Retirement-Tests
  (Snapshotintegrität) und 25/28 Infrastrukturtests (fehlender Registry-Endpunkt).
  Erfolgreiche spätere Teilprüfungen ersetzen diese Ergebnisse nicht rückwirkend.
- Prism-Matrizen belegen Reader-/Replay-Verhalten, keine Design-Erzeugung.
  Der Scaffold-Lauf unterscheidet Autorendaten, Kompilierung und eine wegen
  fehlendem Worker-Secret blockierte Ausführung. Diese Grenzen gehören in
  verständliche Aufgabenbeschreibungen und den Abnahmestatus.

Geprüft wurden die 90 Originalblobs, eindeutige Pfade, Pflichtfelder,
Entscheidungszahlen und die vollständige Paketabdeckung. Originaldaten und
Findingregister bleiben unverändert; alle Migrationszustände stehen auf pending.
Neue AP03-Verwaltungsdateien und Änderungen auf neuerem main werden beim
vorgesehenen Bestandsabgleich berücksichtigt. Der Abschluss gilt ausschließlich
für die eingefrorenen Quellen, nicht als Gesamtabnahme der neuen Dokumentation.

**Nächster Arbeitsschritt: AP04 — offene Findings, Live-Abnahmen, gültige
Entscheidungen und erforderliche Testnachweise migrationsfest sichern.**
AP04–AP11 bleiben offen.
