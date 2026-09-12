# prism.studio

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1–2. Verantwortung, Auslieferung und tatsächliche Übergaben

Vollständig gelesen: alle neun Dateien in `skills/prism/studio/`, insbesondere
app.tsx (1021 Zeilen), puck-adapter.ts, preview.ts, CSS, Devfixture, Vite-/Playwright-
Config, index.html und Browsertests; zusätzlich tests/studio-adapter.test.mts.
Tatsächlicher Einstieg index.html → app.tsx/createRoot, nicht der alte inventarisierte
`studio/index.ts`. Kein Pluginmanifest/Capabilityprovider. React/Puck-Browserapp,
Vite erzeugt dist-studio, `server/studio.ts` liefert statische Dateien und proxyt
/v1 an Control. Proxyreview separat [prism.service-studio](prism.service-studio.md).

DEV lädt developmentDocument und wendet Operationen nur im Browser an. Production
startet Session, lädt Projekte/Dokument und optional Brief/Directions; es gibt
kein Create-project-UI. Root-/Queryidentität: document und project stammen aus URL,
Dokument enthält ebenfalls meta.documentId/projectId/revision. UI verwendet diese
unterschiedlichen Formen je nach API (DB-UUID versus kanonische Dokumentmetadaten).

App projiziert nur root.children in Puck, bekannte Heading/Text/Button/Stack und
PrismBlock für übrige Typen. puckChangeToOperation erzeugt remove/insert/move/props
oder atomaren Batch mit document.meta.revision. Vollständiges Puck-JSON wird nicht
kanonisch gespeichert. Empfänger Control `server/control.ts:605–616` übergibt an
RevisionRepository.apply; Domain `applyOperation` validiert Operation und Dokument,
RevisionRepository `storage/index.ts:303–333` schreibt unter Transaktion neue
Revision und CAS auf current_revision_id. Alte Revision → Konflikt, kein stilles
Overwrite. Projektionsverlust siehe PCR-PRISM-STUDIO-001.

## 3–4. Zustand, Commit und Fehlerdisposition

Lokaler Zustand: kanonisches Dokument, aktuelle View/State/Viewport/Selection,
Quality/akzeptierte Warnungen, Instructions, Directions, Preference-/Revisionliste.
commit übernimmt erst erfolgreiche Serverantwort, setzt Quality/Warnungen zurück.
DB-Commit ist Servertransaktion, nicht Browser-setState; Browser besitzt kein
fsync-/Journal-/Lockreclaimprotokoll. Fsync-/DB-WAL-/Restartfragen gehören Storage.

propose POST generate liefert 202 vom Control→Agentpfad, dann pollt UI auf höhere
Dokumentrevision. Evaluate erwartet specialistResult.values. Approve berechnet
SHA256 über JSON.stringify(document), prüft Quality/Warnungen, POST approval und
anschließend POST baseline. Control prüft Projektzuordnung und Warnungen erneut;
Baselineprüfer bindet Approval an aktuelle Revision/Digest/Architektur. UI allein
ist kein Autorisierungs- oder Release-Gate. Vorhandener Control-UUID-/Approvalfehler
bleibt Eigentum des Controlreviews, keine Duplikat-ID hier.

Operations-/Propose-/Approvefehler setzen global failure und ersetzen gesamte
Editoroberfläche durch „Prism cannot open“, auch bei Konflikt eines bereits
geöffneten Dokuments. Revisions-/Preference-GETs ignorieren HTTP-Fehler; abgelehnte
Fetchpromises bei loadLearned/loadRevisions haben auf Buttons keinen catch.
Directions-Poll kann nach 300 erfolglosen Antworten ohne sichtbaren Abschluss
enden. propose prüft nur Revisionzunahme, nicht Ergebnisbindung an die eigene
Agentanfrage; fremde parallele Revision könnte als erfolgreiche Proposal erscheinen.
Codegrenzen, kein bestandener Produktions-/Parallelitätstest.

## 5–6. Timeouts, Konkurrenz, Wiederholung und Neustart

Browserfetch besitzt keine eigene Deadline/AbortController; 300×2-s-Poll ist nur
mindestens rund 10 Minuten plus jede HTTP-Dauer. Mount-Effekt und Proposalpoll
haben keinen Unmount-Cleanup. Session wird einmal initialisiert (Servercookie
900 Sekunden), automatische Erneuerung/401-Recovery fehlt. Langes Editieren kann
bei nächster Mutation fatal enden. Keine Behauptung, UI sei dadurch authlos.

Puck onChange feuert ungedrosselt asynchrone commits; mehrere Änderungen können
mit derselben baseRevision laufen. Server CAS schützt Datenintegrität, UI besitzt
aber keine Savequeue/Rebase/Retryoberfläche. Proposal-Button hat working-Flag;
Approve/Restore/Directionbuttons haben keine umfassende laufende Aktionssperre.
Mutation request IDs: generate jedes Mal UUID, evaluate deterministisch pro
Dokumentrevision, direkte Operation/Approval keine explizite UI-Idempotenz.

Reload lädt aktuellen Serverstand, verliert nicht gesendete Texte/Selektion/
Warnings/Arbeitszustand; keine lokale Wiederanlaufledger. Nach Approvalcommit vor
Baselineantwort ist Approval-ID nur in laufender Closure, noch nicht dauerhaft
im UI; verlorene Antwort kann neue Approvalanforderung erzeugen. Bestehende
Baselinereconciliation ist serverseitig. Kein echter Crash-/ACKverlusttest dieses
Clients durchgeführt. Revisionsverlauf erlaubt gezieltes Restore, nicht pauschal
Wiederherstellung offener Remoteaktionen.

## 7. Sicherheit und Herkunft von Vorschau/Evidenz

Production nutzt Same-origin API/Cookies und x-prism-csrf für Mutationen.
Control `authenticated` prüft signierte Session und CSRF; Session-Exchange verlangt
Ingressidentität. Rollen/Projektzugriff sind Serverzuständigkeit. DEV umgeht API
absichtlich für synthetische lokale Fixture; Browsertests beweisen deshalb keine
produktive Authentifizierung/DB-Persistenz.

Preview iframe hat sandbox=allow-scripts, kein allow-same-origin; srcDoc CSP
verbietet standardmäßig externe Ressourcen und erlaubt nur Selektionsscript mit
Nonce sowie inline Styles. Parent nimmt postMessage nur von genau diesem
iframe.contentWindow an und verarbeitet Auswahl/definierte Flowtransitionen,
keinen beliebigen Befehl. postMessage('*') ist bei opaque Sandboxorigin erforderlich;
Sourcebindung ist hier die entscheidende Grenze. Renderer escapt Inhalte; Canvas-
Puckansicht selbst ist vereinfachte Projektion, keine autoritative Render-/Quality-
Evidenz. Canonicalasset-Preview scheitert, PCR-PRISM-STUDIO-002.

## 8–9. Ressourcen, Architektur und Vereinfachung

App hält vollständiges Dokument und rekursive Puckprojektion im RAM; flatten-
Adapter nutzt für jedes Item current.find (quadratischer Vergleich), eigene
Tiefen-/Knotenlimits fehlen. Propsvergleich verwendet Referenzgleichheit für
Arrays/Objekte und Defaultmaterialisierung, sodass auch unveränderte generische
Props als Edits erscheinen können. APIbody/Domainlimits gehören Empfänger.
Keine History-/Directionpagination im UI; lange Listen werden komplett gerendert.
Keine Clientretention jenseits Reactzustand; Remote-Revisions-/Artefaktretention
ist separat im Storage-/Controlreview zu prüfen.

Puck zeigt Rootblatt nicht im Editcontent, Preview rendert es korrekt. Mobile
Navigation setzt View-ID ohne deren initialState zurückzusetzen; Desktop setzt
beides. Responsive-/Stateauswahl wirkt auf Preview, Puck bearbeitet weiterhin
Basisprops. UI erlaubt alle Puck-Operationen pauschal; Domain begrenzt tatsächlich
zulässige Struktur. Bekannte Domain-Subtree-/Responsiveverluste siehe prism.domain;
Renderer Componentoverride/Paginationverluste siehe prism.renderer.

Dauerhafte Vereinfachung: verlustfreie unveränderliche Projektionsbasis plus
explizite Editdeltas; ein zentraler Mutation-/Revisionzustand mit geordnetem Save,
verständlicher Konfliktanzeige und abgesichertem Ergebnisbezug. Vorschau sollte
denselben kontrollierten Assetresolver wie Renderworker verwenden, ohne komplette
Dokumente auf ein zweites unabhängiges Editformat umzuschreiben.

## 10. Tests und tatsächliche Ausführung

`node --test tests/studio-adapter.test.mts` im Prism-Paket bestanden: 9/9.
Gelesene Tests prüfen Text-/CSS-Startpanel, Insert/safeId, Split-Komplettierung,
empty/leaf Preview, nested Insert/Edit, atomaren Batch und Renderednodes/Action-
Script. Funktionstests mit synthetischen Dokumenten und Originaldomain/Renderer,
keine DB/Auth/Browserinteraktion. Keine Behauptung vollständiger Puckroundtriptreue.

Original Playwright-Teil direkt ausgeführt:
`node ../../node_modules/@playwright/test/cli.js test --config studio/playwright.config.mjs`.
Vite-Testserver startete; sämtliche 9 Projekt/Testkombinationen scheiterten beim
Browserlaunch, da chromium_headless_shell-1234 fehlt; Status **blockiert**, kein
UI-Assertionfehler. Keine Browserinstallation/CI ausgelöst. Desktop/Phone/Tablet-
Tests hätten nur DEVfixture, Edittext/Insert, sandbox und horizontale Breite geprüft;
keine produktive Sessions, Puckautosave, Direktion, Approval oder Reloadpersistenz.
Build mit prebuild-Validatorgenerierung nicht neu ausgeführt; Review ändert nur Docs.

Eigene Originalfunktionsprobe:
`node docs/review/evidence/prism-studio-probes.mjs`, letzter Lauf Exit0.
Validiertes horizontales Stackdokument + exakt der App entsprechende unveränderte
Puckprojektion erzeugt vertikale kanonische Mutation nach applyOperation.
Valides assetreferenzierendes Imagedokument ergibt Preview unavailable ohne img.
Erste Probenfassungen hatten einen falschen Fixturepfad bzw. falsche Assetfelder;
beides korrigiert, die letzte Probe validiert echte Vertragsschemas vor Bewertung.
Kein neuer Service-/Domainmock. Browser/CSP-Laufzeitprüfung bleibt blockiert.

## 11. Dokumentationsabgleich

`docs/implementation/prism-implementation-plan.md:260–283` fordert Projektion,
Save/Reload mit identischem Baum, mobile/Permission/Actionnachweis. Code hält
kanonisches Modell unabhängig von Puck, erfüllt Verlustfreiheit/Previewassets
jedoch nicht. Status vorhandene Zielarchitektur, Umsetzung unvollständig und bei
pauschaler Abschlussannahme widerlegt. `completion-status.json` ist Statusinventar,
kein bestandener Produktionsnachweis. Kein eigenes Studio-README vorhanden unter
untersuchtem studio-Pfad; Paketbefehle und Serverauslieferung konkret untersucht.

## 12. Befunde

### PCR-PRISM-STUDIO-001 — Unveränderte Puckprojektion überschreibt Designwerte

Schweregrad hoch: normale Bearbeitung kann Layout/Komponentenwerte fremder,
unbearbeiteter Nodes kanonisch verändern und speichern. Nachgewiesener Defekt.
`app.tsx:133–178 mapNode/project` verwirft Stack.direction und generische Typfelder;
`puck-adapter.ts:16–97 genericProps/nodeProps` setzt statische Defaults (Stack
vertical, Grid columns=2, Chartdefaults etc.); `puck-adapter.ts:256–278` vergleicht
alle Nodes und erzeugt props.set für diese Differenzen, nicht nur wirkliche Edits.
Auslöser valider horizontaler Stack mit unveränderter Puckansicht; echte
Originalfunktionsprobe liefert node.props.set(direction:vertical), Domain wendet
es erfolgreich an. App onChange→commit→Control/Repository macht es dauerhaft.
Ursachenbehebung: bestehende Props beim Projektieren verlustfrei referenzieren,
nur ausdrückliche Änderungen in editierbaren Feldern diffen; Defaults ausschließlich
bei neuen Nodes. Regression: No-op-Roundtrip für jeden Nodetyp/abweichende Defaults,
zusätzlich Edit eines anderen Nodes darf vorherige Properties nicht verändern.

### PCR-PRISM-STUDIO-002 — Canonicalassets machen lokale Vorschau unbrauchbar

Schweregrad mittel: gültiges Bild-/Iconlayout wird im gesamten Preview durch
Fehlerpanel ersetzt, sodass Operatoren es nicht beurteilen können. Nachgewiesener
Defekt in `studio/preview.ts:15–31`, Gegenstelle `renderer/index.ts:205–217` und
Vertrag `contracts/prism/v1/schemas/prism-v1.schema.json:373–386`. Canonicalassets
tragen kind/artifact/mediaType/role, kein src; Preview reicht sie unverändert an
Renderer, dieser verlangt src und wirft. App lädt keine aufgelösten Assetquellen.
Probe validiert Dokument und erhält ausschließlich Preview unavailable. Zudem
CSP default-src none ohne img-src würde neue Quellen weiterhin blockieren;
dieser zweite Browserteil ist Code-Trace, kein laufender Chromiumbeweis.
Ursachenbehebung: erlaubte Artefakte über authentifizierten Resolver in begrenzte,
validierte Previewquellen übersetzen, CSP gezielt für genau diese Quellen erlauben;
Sandbox erhalten. Regression valides echtes Bildartefakt in Preview inklusive
Load/Size-/Integrity-Denials und Browserrendering, nicht nur Stringprüfung.

Historische Prototypen und ihre getrennte Testaussage: [Prism-Spikeabgrenzung](../prism-spikes.md).
