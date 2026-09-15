# KubeClaw: Arbeitsplan zur vollständigen Überarbeitung der Dokumentation

Stand: 15.09.2026 · Version 15 · Status: AP01 und AP02 abgeschlossen und nachkontrolliert; AP03 in Arbeit (2.342 Dateien geprüft)

## 1. Ziel und Ausgangspunkt

Ein Mensch oder Agent ohne bisherigen Gesprächskontext soll KubeClaw verstehen, betreiben und erweitern können. Die Dokumentation beschreibt den tatsächlichen Implementierungsstand detailliert und verständlich. Fehlende Funktionen und ausstehende Betriebsnachweise werden sichtbar erklärt. Sie verhindern nicht die Überarbeitung der übrigen Dokumentation.

Die Bestandsprüfung vom 14.09.2026 bezog sich auf Commit `6979bced8e5bbca90568276256e7328d93a1e072`: 963 Markdown-Dokumente, davon 479 unter `docs/review/`. Das damalige Register enthielt 141 von 154 lokal verifizierte Findings und 13 unvollständige Findings; fünf zusätzliche Integrationsfindings waren ebenfalls verifiziert. Diese Zahlen sind ein historischer Ausgangspunkt und werden in AP01 erneut ermittelt. Die 963 Dateien sind keine bereits geprüften Inhalte und noch nicht der vollständige Bestand aller Dokumentationsformate.

Der vorhandene Blueprint wird kritisch überarbeitet. Seine Kategorien, Seitenstruktur und automatischen Prüfungen werden nicht ungeprüft übernommen.

## 2. Verbindliche Arbeitsregeln

- Jede bestehende Dokumentationsdatei wird inhaltlich gelesen und einzeln entschieden. Automatische Erfassung oder Dateinamenklassifikation zählt nicht als Inhaltsprüfung.
- Ein Thema hat einen eindeutigen Hauptort. Verweise sind erwünscht; dauerhaft doppelte Erklärungen desselben Sachverhalts nicht.
- Zusammenhängende Abläufe bleiben zusammen. Keine künstliche Seitenzahl und keine Kapitel nur zur Erfüllung eines Schemas.
- Einführung und Aufgaben erklären Begriffe beim ersten Auftreten. Technische Details folgen dort, wo sie zum Verständnis oder zur Durchführung gebraucht werden.
- Aussagen werden gegen Implementierung, Konfiguration, Verträge und geeignete Tests geprüft. Bei Widersprüchen werden tatsächliches Verhalten und beabsichtigte Entscheidung getrennt beschrieben.
- Eine vorhandene Funktion, eine lokal geprüfte Funktion und eine im Zielsystem abgenommene Funktion sind unterschiedliche Aussagen.
- Reviews werden nach Übernahme ihrer noch benötigten Inhalte gelöscht. Kein neues Altarchiv; Git bewahrt die Historie.
- Offene Findings bleiben mit stabilen IDs und vollständigem Arbeitskontext erhalten. Eine Dokumentationsänderung schließt keinen Implementierungsfehler.
- Noch ausstehende Live-Abnahmen bleiben getrennt von offenen Implementierungsarbeiten nachvollziehbar.
- Bestehende Generatoren und Prüfungen werden angepasst, soweit sie die Migration unterstützen. Keine zweite Dokumentationsplattform oder neue komplexe Verwaltung ohne konkreten Bedarf.
- Produktdokumentation zunächst in einheitlichem, verständlichem technischem Englisch entsprechend dem bestehenden Blueprint; Arbeitsplan und Fortschrittsmeldungen auf Deutsch. Keine parallel manuell gepflegten Übersetzungen. Diese Sprachwahl ist ein Arbeitsstandard, keine technische Notwendigkeit.
- Produktverhalten, Deployment und Infrastruktur werden im Dokumentationsauftrag nicht nebenbei verändert. Entdeckte technische Defekte werden als eigene Arbeit erfasst.

## 3. Übersicht der Arbeitspakete

AP01 ist als Bestandsaufnahme nachkontrolliert, AP02 als Blueprint-Überarbeitung abgeschlossen und nachkontrolliert; AP03 ist **in Arbeit**, AP04–AP11 sind **offen**. Ein Paket ist erst abgeschlossen, wenn sein Ergebnis vorhanden und sein Abschlusskriterium nachgewiesen ist.

| ID | Arbeitspaket | Voraussetzung | Greifbares Ergebnis |
| --- | --- | --- | --- |
| AP01 | Aktuellen Stand und vollständigen Umfang erfassen | Keine | Festgehaltener Commit, vollständiges Inventar, bestätigter Findingstand |
| AP02 | Blueprint verbessern | AP01 | Überarbeitete Zielstruktur, Inhaltsstandards und Abnahmekriterien |
| AP03 | Jedes Dokument prüfen und entscheiden | AP02 | Vollständig inhaltlich geprüftes Dokumentenregister |
| AP04 | Offene Arbeit und Entscheidungen sichern | AP03 | Eigenständige offene Issues, Live-Abnahmen, dauerhafte Entscheidungen |
| AP05 | Fehlende Inhalte bestimmen und Arbeit aufteilen | AP03–04 | Priorisierte Lückenliste und verbindliche Kapitelzuordnung |
| AP06 | Einstieg und Architektur überarbeiten | AP05 | Verständlicher Einstieg und vollständige Systemerklärung |
| AP07 | Operations-Handbuch vervollständigen | AP05; Begriffe aus AP06 | Vollständige Betriebsabläufe und Fehlerbehandlung |
| AP08 | Plugins und Erweiterungen vollständig erklären | AP05; Grenzen aus AP06 | Entwicklerleitfaden, geprüfte Beispiele und Plugin-Katalog |
| AP09 | Referenzen, Navigation und Prüfungen integrieren | Beginn ab AP06, Abschluss nach AP06–08 | Konsistente veröffentlichbare Dokumentation |
| AP10 | Ersetzte Dokumente und Reviews entfernen | Je Thema: Ersatz aus AP04/06–09 geprüft | Bereinigter Bestand ohne verlorenen Arbeitskontext |
| AP11 | Gesamtabnahme und dauerhafte Pflege etablieren | AP06–10 | Nachgewiesene Vollständigkeit und einfache Pflegevorgaben |

Die Umsetzung erfolgt themenweise in überschaubaren Änderungen. AP10 läuft bereits nach jeder vollständig geprüften Themenmigration; es wird nicht bis zum Schluss ein zweiter vollständiger Dokumentationsbestand aufgebaut. AP11 enthält die abschließende globale Bereinigungsprüfung.

## 4. Arbeitspakete im Detail

### AP01 — Stand und Umfang erfassen

- [x] Aktuelles `main`, offene PRs und lokale Änderungen abgleichen; vollständigen Repository-Bestand sicherstellen.
- [x] Ausgangscommit und bereits laufende Arbeiten festhalten. Vorhandenen geeigneten Arbeitsbranch nutzen; sonst einen Dokumentationsbranch mit einer PR für die zusammenhängende Migration verwenden. Die geschlossene PR #6 nicht als Arbeitsziel voraussetzen.
- [x] Dokumentation im gesamten Repository erfassen: Root-READMEs, `docs/`, komponentennahe READMEs, Agentenanweisungen, Beispiele, Diagramme, Referenzen und generierte Dokumentationsdateien.
- [x] Testfixtures, Fremdtexte, Lizenzen und generierte Vertragsdaten separat kennzeichnen. Sie werden nicht allein wegen ihrer Dateiendung als löschbare Dokumentation behandelt.
- [x] Dokumentationsgeneratoren, Navigation, Suchindex und Tests ermitteln, die bestehende Dokumentpfade oder Review-Dateien verwenden.
- [x] Aktuelle offene Findings und ausstehende Live-Abnahmen ermitteln; zusätzliche neue Issues berücksichtigen.

**Abgeschlossen, wenn:** Alle Dateien im definierten Dokumentationsumfang sind erfasst; ausgeschlossene Kategorien sind begründet; Ausgangsstand und aktuelle offene Arbeit sind nachvollziehbar.

### AP02 — Blueprint verbessern

- [x] Alle sechs vorhandenen Blueprint-Artefakte lesen und auf Aktualität, Überschneidungen und unnötige Komplexität prüfen.
- [x] Tatsächliche Leseraufgaben festlegen: verstehen, installieren, betreiben, Fehler beheben, wiederherstellen, erweitern.
- [x] Bestehende drei Einstiege beibehalten, soweit sie helfen: Verstehen, Betreiben, Erweitern. Referenzen, Entscheidungen und Status werden unterstützend verlinkt.
- [x] Seiten nach zusammenhängenden Aufgaben strukturieren. Große Themen gezielt aufteilen; kurze zusammengehörige Texte zusammenführen.
- [x] Veraltete Aussagen insbesondere zu Prism, Worker-Ausführung, Devbox und Ops-Zugriff gegen den aktuellen Code prüfen. Gewünschten und tatsächlich eingerichteten Zugangsweg getrennt behandeln.
- [x] Pro Dokumenttyp Mindestinhalte und konkrete Leseraufgaben zur Abnahme definieren.
- [x] Bestehende automatisierte Klassifikation von tatsächlicher Prüfung und erfolgreicher Migration unterscheiden.

**Abgeschlossen, wenn:** Der Blueprint beschreibt eine umsetzbare, zusammenhängende Dokumentation, klare Prüfregeln und einen Informations-erhaltenden Löschprozess. Jede geplante Seite hat einen Zweck und eine Zielgruppe; die Struktur darf nach AP03 begründet korrigiert werden.

### AP03 — Jedes Dokument prüfen

**Zwischenstand:** 2.342 Dateien einzeln geprüft (182 erweitern,
1.444 extrahieren, 14 behalten, 702 entfernen);
537 Quelldateien noch ungeprüft. [Prüfbericht](AP03-progress.md),
[manuelles Register](review-ledger.jsonl), [parallele Arbeitspakete](AP03-work-packages.md).
Die Gesamtaufgaben bleiben bis zur Prüfung des vollständigen Umfangs offen.

- [ ] Dateien in thematischen Paketen von etwa 10–20 Dokumenten bearbeiten; umfangreiche Designs entsprechend kleiner bündeln.
- [ ] Jedes Dokument vollständig lesen. Aktuelle Fakten, Entscheidungen, Anleitungen, Beispiele, Pläne, historische Ergebnisse und überholte Aussagen unterscheiden.
- [ ] Technische Kernaussagen mit ihren aktuellen Quellen abgleichen. Nicht prüfbare Aussagen ausdrücklich markieren.
- [ ] Für jedes Dokument eine der vier Hauptentscheidungen festhalten: **behalten**, **entfernen**, **Informationen extrahieren**, **erweitern**.
- [ ] Bei Extraktion konkrete Abschnitte und Zielorte nennen; „später übernehmen“ genügt nicht.
- [ ] Bei Behalten oder Erweitern nötige Korrekturen, Verschiebungen und Zusammenführungen angeben.
- [ ] Eingehende Verweise und Abhängigkeiten aus Tests, Skripten und Generatoren erfassen.

**Abgeschlossen, wenn:** Jede Datei im Umfang besitzt eine begründete Inhaltsentscheidung. Keine automatisch vorgeschlagene Zuordnung wird als manuell geprüft gezählt. Inhaltliche Unsicherheiten sind konkreten offenen Arbeiten zugeordnet.

### AP04 — Offene Arbeit und Entscheidungen sichern

- [ ] Alle weiterhin offenen Findings mit Original-ID, Problem, Auswirkung, aktuellem Teilstand, betroffenen Komponenten, verbleibender Arbeit und Abschlusskriterium übernehmen.
- [ ] Benötigte Reproduktionen und Nachweise erhalten oder an geeignete Test-/Issue-Orte verschieben. Offene Issues müssen ohne gelöschte Review-Dateien bearbeitbar bleiben.
- [ ] Ausstehende Live-Abnahmen geschlossener Findings separat mit Voraussetzungen, Prüfschritten und erwarteten Ergebnissen erfassen; nicht pauschal alle 141 lokalen Abschlüsse wieder öffnen.
- [ ] Dauerhafte Entscheidungen aus Reviews, Designs und Übergaben extrahieren: Entscheidung, Anlass, Alternativen, Begründung, Konsequenzen, Gültigkeit und Quellen.
- [ ] Überholte Entscheidungen als ersetzt kennzeichnen; keine historischen Zwischenstände als aktuelle Regeln übernehmen.
- [ ] Ein kanonisches Register für offene Issues bestimmen und vorhandene Verbraucher darauf umstellen. Kein paralleles manuell gepflegtes Vollregister aller alten Findings.

**Abgeschlossen, wenn:** Offene Arbeit und gültige Entscheidungen sind unabhängig von den zu löschenden Reviews vollständig verständlich. Die aktuelle Zahl offener Findings ist konsistent; Original-IDs bleiben erhalten.

### AP05 — Fehlende Inhalte identifizieren

- [ ] Dokumentenprüfung mit Codebestand und tatsächlichen Benutzeraufgaben vergleichen. Ein Thema kann vollständig fehlen und deshalb in keinem Altdokument vorkommen.
- [ ] Jede Komponente, öffentlich nutzbare Schnittstelle, Konfigurationsgruppe, Pluginart und betriebliche Abhängigkeit einem Dokumentationsort zuordnen.
- [ ] Lücken nach Wirkung priorisieren: P0 = falsche oder fehlende Anleitung mit möglichem Daten-/Zugriffsverlust; P1 = Aufgabe nicht durchführbar; P2 = Erklärung, Auffindbarkeit oder Komfort unzureichend.
- [ ] Dokumentationslücken, technische Implementierungslücken und fehlende Live-Nachweise getrennt führen.
- [ ] Zielstruktur aus AP02 vereinfachen oder ergänzen, wo die Inhaltsprüfung es rechtfertigt.

**Abgeschlossen, wenn:** Jede notwendige Leseraufgabe ist abgedeckt oder besitzt ein konkretes Schreibpaket. Keine bloße Kapitelüberschrift gilt als inhaltliche Abdeckung.

### AP06 — Einstieg und Architektur

- [ ] Kurzer Einstieg: Zweck, Zielgruppe, Voraussetzungen, Leistungsumfang und aktuelle Grenzen.
- [ ] Ein durchgehendes Beispiel vom Auftrag bis zum Ergebnis; beteiligte Rollen, Übergaben und Artefakte erklären.
- [ ] Nova, Worker-Core, Buster, Prism, Forge, Echo und Plugin-Runtime gemäß tatsächlicher Implementierung erklären; vorhanden, aktiviert und erreichbar unterscheiden.
- [ ] Zuständigkeiten, Zustände, Datenhaltung, Verträge, Sicherheitsgrenzen und Kommunikationswege beschreiben.
- [ ] Fehlerpfade erklären: Retry, Reparaturbudgets, Freigaben, Resume, Abbruch, Eskalation und ungewisser Ausgang.
- [ ] Wenige präzise Diagramme und ein Glossar ergänzen. Diagramme müssen zum Code und zum Text passen.

**Abgeschlossen, wenn:** Ein neuer Leser kann einen normalen Ablauf und wesentliche Fehlerabläufe erklären, Komponenten unterscheiden und den passenden Betriebs- oder Erweiterungsleitfaden finden.

### AP07 — Vollständiges Operations-Handbuch

Folgende Aufgaben werden einzeln gegen den Bestand geprüft und vollständig dokumentiert:

| Bereich | Erforderliche Inhalte |
| --- | --- |
| Planung | Hardware, Kapazität, Storage, Netzwerk, DNS, Identitäten, Voraussetzungen und Zuständigkeiten |
| Installation | Unterstützte Installationsreihenfolge, Bootstrap, Konfiguration, Secrets, Zugriff und erste Verifikation |
| Komponenten | K3s, CNI, GitOps, Registry/BuildKit, Datenbanken, Queues, Identitätsdienste und Rollen soweit im tatsächlichen Bestand vorhanden |
| Normalbetrieb | Aufträge starten, beobachten, freigeben, fortsetzen und abbrechen; Ergebnisse und Demos prüfen |
| Beobachtung | Health, Logs, Events, Metriken, Speicher-/Queuewachstum, Aufbewahrung und Diagnosezugriff |
| Fehlerbehebung | Hängende Jobs, verlorene Antworten, Konflikte, Ausfälle von Plugins/Workern/Diensten, Ressourcenmangel und fehlerhafte Konfiguration |
| Datensicherung | Alle persistenten Bestände, Konsistenzgrenzen, externe Sicherungsziele, Aufbewahrung, Schlüssel und Restore-Verifikation |
| Wiederherstellung | Einzelkomponente, beschädigter Zustand, Verlust eines Nodes oder Clusters, Wiederaufbau des Zugangswegs |
| Wartung | Versionsquelle, Images, Kompatibilität, Migration, Upgrade, Rollbackgrenzen, Credentialrotation und Zertifikate |
| Stilllegung | Aufträge beenden, Daten exportieren/sichern, Ressourcen und Zugriffe kontrolliert entfernen |

- [ ] Für jeden Ablauf Zweck, Voraussetzungen, Wirkung, konkrete Schritte, erwartete Ergebnisse, Verifikation, Fehlerbehandlung und Wiederherstellungsweg angeben.
- [ ] Platzhalter erklären; Befehle, Pfade und Konfigurationsnamen aus dem aktuellen Repository ableiten.
- [ ] Bei noch unvollständigen Betriebsfunktionen präzise beschreiben, was möglich ist, was fehlt und welches Issue die Lücke verfolgt. Keine erfundene Ersatzprozedur.
- [ ] Wiederherstellung auch ohne laufende Plattform planen; keine zirkuläre Voraussetzung „Ops-Dienst reparieren über denselben ausgefallenen Ops-Dienst“.
- [ ] Erreichbare Wiederherstellungszeiten und tolerierbaren Datenverlust nur angeben, wenn belegt; sonst als noch zu bestimmende Betriebsziele kennzeichnen.

**Abgeschlossen, wenn:** Jeder Betriebsablauf ist durchführbar oder seine konkrete Implementierungsgrenze ist vollständig erklärt. Live-Prüfungen haben getrennte, ausführbare Abnahmeaufträge; ihre Nichtausführung wird nicht als Erfolg ausgegeben.

### AP08 — Plugins und Erweiterungen

- [ ] Entscheidungshilfe: Wann genügt Konfiguration, wann braucht es ein Plugin, einen Provider/Adapter, eine Engine oder eine Core-Änderung?
- [ ] Unterstützte Erweiterungspunkte aus dem Code erfassen; Grenzen und nicht unterstützte Varianten ausdrücklich nennen.
- [ ] Ein vollständiges minimales Plugin vom neuen Paket über Manifest, Registrierung, Konfiguration und Berechtigungen bis zum Test und zur tatsächlichen Einbindung erstellen und prüfen.
- [ ] Ein praxisnahes Beispiel mit externem Effekt oder Zustand durchgehend erklären: Fehler, Retry, Idempotenz, Abbruch, Resume und Cleanup.
- [ ] Lebenszyklus, Eingaben/Ausgaben, Schemas, Capabilities/Grants, Artefakte und Versionskompatibilität erklären.
- [ ] Installation, Aktivierung, Austausch, Update, Deaktivierung und Entfernung inklusive verbleibender Zustände beschreiben.
- [ ] Eigene Testprovider, Reportadapter, Observer, Integrationen und Worker-Engines anhand der tatsächlich unterstützten Verträge erläutern.
- [ ] Plugin-Katalog vollständig abgleichen: Zweck, Einsatz, Konfiguration, Grenzen, Fehlerverhalten, Tests und Quellverweise. Gleichartige mechanische Fakten aus vorhandenen Manifesten generieren.

**Abgeschlossen, wenn:** Ein Entwickler oder Agent kann die dokumentierten Beispiele ohne verborgenes Projektwissen bauen, testen und einbinden. Für jeden unterstützten Erweiterungstyp existiert eine ausreichende Anleitung; geplante Erweiterungspunkte sind klar markiert.

### AP09 — Referenzen und Navigation

- [ ] Konfigurationswerte, Defaults, Pflichtfelder, Befehle, Verträge und Fehlercodes vollständig zuordnen; vorhandene Generierung nutzen.
- [ ] Einstieg, Aufgaben, Referenzen, Entscheidungen und Status sinnvoll verlinken. Erforderliche Schritte nicht hinter optionalen Architekturverweisen verstecken.
- [ ] Veröffentlichungs-Allowlist und Suchindex auf die neuen Inhalte aktualisieren.
- [ ] Relative Links, Anker, Bilder, Beispiele und Quellverweise prüfen; releasebezogene Belege an den richtigen Commit binden.
- [ ] Vorhandene Build-/Publikationsprüfungen an die neue Struktur anpassen. Grüner Build allein beweist keine Verständlichkeit.

**Abgeschlossen, wenn:** Die Dokumentation lässt sich bauen, alle internen Verweise funktionieren und jede Kernaufgabe ist vom passenden Einstieg erreichbar. Öffentlich sichtbare Statusangaben stimmen mit den kanonischen Registern überein.

### AP10 — Alte Dokumentation bereinigen

- [ ] Je migriertem Thema alle übernommenen Informationen mit ihren Zielstellen vergleichen.
- [ ] Verweise aus Dokumentation, Tests, Skripten und Generatoren migrieren. Funktionale Regressionsprüfungen erhalten; veraltete Pfadannahmen anpassen.
- [ ] Alte Reviews, Übergaben, Phasenberichte und ersetzte Erklärungen löschen, sobald ihre weiterhin benötigten Inhalte gesichert sind.
- [ ] Generierte Altdateien und nicht mehr benötigte Generatorpfade ebenfalls prüfen; keine Wiedererzeugung gelöschter Alttexte.
- [ ] Historische Rohbelege ohne verbleibenden Zweck entfernen; weiterhin benötigte Tests oder offene Nachweise gezielt erhalten.
- [ ] Entscheidung „behalten“ abschließend kontrollieren, damit darüber kein unbemerkter Parallelbestand fortbesteht.

**Abgeschlossen, wenn:** Die aktiven Dokumente besitzen keine benötigten Abhängigkeiten auf entfernte Dateien. Es gibt kein neues Review-Archiv und keine zweite Erklärung desselben Systems. Offene Issues bleiben selbständig bearbeitbar.

### AP11 — Gesamtabnahme und Pflege

- [ ] Bestand erneut vollständig erfassen; während der Migration hinzugekommene oder geänderte Dateien nachprüfen.
- [ ] Drei Lesedurchläufe ausschließlich mit der neuen Doku durchführen: neuer Leser, Betreiber, Erweiterungsentwickler/Agent. Jede notwendige Rückfrage als konkrete Lücke notieren und schließen.
- [ ] Normalfall und Fehlerfälle durchgehen: Installationsfehler, hängender Auftrag, Retry/Resume, Upgradefehler, Restore und Pluginwechsel.
- [ ] Befehle, Beispiele und Konfigurationen mit geeigneten lokalen Prüfungen validieren. Cluster-/Live-Nachweise getrennt berichten.
- [ ] Veröffentlichung lokal prüfen: Navigation, Suche, Lesbarkeit, Codeblöcke, Diagramme und schmale Darstellung.
- [ ] Beitragsregeln ergänzen: Verhaltens-/Konfigurationsänderungen aktualisieren die zugehörige Doku; generierte Referenzen werden reproduzierbar geprüft.
- [ ] Abschlussübersicht erstellen: vollständig geprüfter Bestand, Migrationen/Löschungen, erledigte Aufgaben, offene Produktgrenzen und separate Live-Abnahmen.

**Abgeschlossen, wenn:** Kein Dokument ist ungeprüft, keine notwendige Dokumentationsaufgabe unbeschrieben, kein offenes Finding verloren und kein Ersatztext doppelt aktiv. „Dokumentation fertig“ bedeutet ausdrücklich nicht „alle Produktfehler behoben“ oder „Zielcluster abgenommen“.

## 5. Schlanke Fortschrittsführung

Vorhandene Register und Generatoren möglichst weiterverwenden. Als Arbeitsmittel genügen dieser Plan, ein Dokumentenregister und eine Aufgaben-/Abdeckungsliste. Entscheidungsdokumente und offene Issues sind dauerhafte fachliche Ergebnisse, keine zusätzliche Fortschrittsverwaltung.

### Ein Eintrag je Bestandsdokument

| Feld | Inhalt |
| --- | --- |
| Pfad und geprüfter Stand | Eindeutige Datei und Commit bzw. Inhaltsstand |
| Thema und Zielgruppe | Wofür der Text gebraucht wird |
| Hauptentscheidung | Behalten / Entfernen / Informationen extrahieren / Erweitern |
| Begründung | Inhaltlich konkrete Entscheidung |
| Übernahme/Korrektur | Welche Abschnitte, Aussagen, Beispiele oder Entscheidungen betroffen sind |
| Ziel | Konkretes Zieldokument und Abschnitt; bei ersatzloser Löschung ausdrücklich kein Ziel plus Grund |
| Belege/Abhängigkeiten | Code, Konfiguration, Tests und eingehende Verweise |
| Bearbeitungsstand | Erfasst / Inhalt geprüft / In Migration / Geprüft abgeschlossen / Blockiert |
| Abschluss oder Blocker | Prüfungsergebnis bzw. konkrete fehlende Information und nächster Schritt |

Extraktion und Erweiterung können inhaltlich kombiniert werden; die Hauptentscheidung beschreibt den überwiegenden Umgang mit der Ursprungsdatei. Der Bearbeitungsstand ist unabhängig davon.

### Ablauf eines Themenpakets

1. Stand und Umfang festlegen.
2. Inhalte lesen und entscheiden.
3. Offene Arbeit und Entscheidungen sichern.
4. Zieltexte schreiben und gegen Quellen prüfen.
5. Beispiele/Befehle passend zum Risiko prüfen.
6. Verweise und Generatoren umstellen.
7. Ersetzte Dateien entfernen.
8. Ergebnis prüfen, Änderungen sichern und Fortschritt aktualisieren.

Nach jedem Paket melden: welche Themen abgeschlossen sind, wie viele Dokumente inhaltlich geprüft wurden, welche Texte ersetzt/entfernt wurden, welche Lücken bestehen und was konkret als Nächstes folgt. Dateizahlen dienen der Fortschrittsmessung, nicht als Qualitätsziel. Keine erfundenen Prozentsätze für noch unbekannten Schreibaufwand.

Bei Wiederaufnahme: aktuellen Commit/PR-Stand abgleichen, den letzten gesicherten Paketabschluss lesen und beim dokumentierten nächsten Schritt fortsetzen. Neue Codeänderungen invalidieren nur betroffene Dokumentprüfungen; diese werden gezielt wiederholt.

## 6. Nächster Schritt

**AP03 fortsetzen:** Die bisherigen 1.761 Einzelentscheidungen sind im [Prüfregister](review-ledger.jsonl) gesichert. Operations, Deployment, Sicherheit, alle Katalogseiten und sämtliche Komponenten-/Agententexte sind einzeln bewertet. Sämtliche Markdown-Texte außerhalb der Reviews sind jetzt einzeln bewertet. Als Nächstes die Reviews samt Nachweisen sowie die übrigen Unterstützungs- und Verwaltungsdateien prüfen. Umfang, Prüfgrenzen und Folgeaufträge stehen im [AP03-Zwischenbericht](AP03-progress.md). Die AP01-Ergebnisse liegen unter [ap01-baseline/](ap01-baseline/README.md). Bestehende Dokumente und Reviews wurden noch nicht verändert oder gelöscht.

## 7. Quellen des Ausgangsstands

- [Bestehender Blueprint](https://github.com/datrab/kubeclaw/blob/6979bced8e5bbca90568276256e7328d93a1e072/docs/blueprint/README.md)
- [Bestehende Zielstruktur](https://github.com/datrab/kubeclaw/blob/6979bced8e5bbca90568276256e7328d93a1e072/docs/blueprint/02-three-track-site-map.md)
- [Bestehende Migrationsregeln](https://github.com/datrab/kubeclaw/blob/6979bced8e5bbca90568276256e7328d93a1e072/docs/blueprint/03-migration-and-deletion.md)
- [Findingregister am geprüften Commit](https://github.com/datrab/kubeclaw/blob/6979bced8e5bbca90568276256e7328d93a1e072/docs/review/remediation/register.json)

Die Quellen wurden in dieser Unterhaltung am 14.09.2026 geprüft. Für diesen Plan am 15.09.2026 wurde kein neuer Repository-Gesamtstand behauptet; dessen Aktualisierung ist Bestandteil von AP01.
