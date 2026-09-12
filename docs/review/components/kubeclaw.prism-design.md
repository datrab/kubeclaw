# kubeclaw.prism-design

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1. Verantwortung und Nutzung

Nova-Stage design/kubeclaw.design.prism verbindet Architekturartefakt, eigenständigen Prismcontrol, menschliche Freigabe und geprüften Baselineimport. Explizite Graphkomponente; keine automatische Materialisierung in Forge/Buster. Alle Quellen stage.ts/archive.ts, Schemas, Manifest, README und drei Tests vollständig gelesen.

## 2. Ein-/Ausgaben und Gegenstellen

requiresDesign=false gibt unmittelbar passed zurück. Sonst Run-ID durch Lease ersetzt, Architekturref derselben Run/mediaType/Digest bis256KiB gelesen und rehashed. Request prism.design-request.v1 mit Architekturinhalt geht an runtime.dispatch. Prism server/control.ts288–361 validiert designRequest, persistiert Architektur mit Revisionskonfliktprüfung, liefert202 waiting oder nach approvalId die DB-gebundene Baseline samt archiveBase64/artifactId/bundleDigest. wait/operator erwarten prism.approval.resolved; genehmigter Resume muss Issuer, approvalId, architectureDigest und bundleDigest liefern.

## 3. Zustand und Nebenwirkungen

Erster Dispatch registriert/updatet Prismdesignrequest; danach durable signal.wait.create, validierter waitId und operator.request.publish. Approved-Dispatch liest Baseline; Archiv wird als neues JSONartefakt kubeclaw.prism inklusive designRequest und approvedArchitectureDigest importiert. Keine lokale Bildgenerierung oder Extraktion ins Worktree. Externe DB und Nova-Stores sind getrennte Transaktionen.

## 4. Korrektheit

Archive verifier begrenzt/canonicalisiert base64, prüft Contentadressierung, Manifestgleichheit, sichere eindeutige Pfade, alle Filechecksums und exakte Checksumabdeckung; Bundlehash aus sortierter Map. Design/Criteria/Previewschemas, Projekt/Revisionsbezüge, Pflichtpfade, Assets und Previewimage-/ARIAverweise werden geprüft. Approvalfehler vor try propagieren an Core; Dispatch-/Import-/Waitfehler im try werden blocked prism_design.dispatch_failed. Kein daraus abgeleiteter Renderer-/Accessibilityerfolg.

## 5. Abbruch, Timeout, Konkurrenz

Kein eigener Dispatchtimer; Adapter/Core kontrollieren externe Calls. Waitablauf aus timeoutMinutes, maximal ein Jahr laut Schema; waitFrom fordert exakt validierten Storevertrag. Idempotenzschlüssel enthält Run, Architekturdigest und Approvalphase; Waitresource enthält Run/Projekt. Gleichzeitig neue Architekturrevision muss Prismserverkonfliktprüfung bestehen. Catch blockiert unklare Calls, statt eigenständig zu wiederholen.

## 6. Recovery

Erst Storewait, dann Operatornachricht verhindert publizierte nichtpersistente Wait-ID; Crash zwischen Schritten bleibt Core-/Effektreconciliation. Erster Prismdispatch kann schon angekommen sein bevor Wait entsteht. Baselineimport und Stageerfolg getrennt; Coreprojektion siehe nova.execution. Lokal geprüfter Waitreplay ist kein vollständiger DB-/Nova-/Operatorneustart.

## 7. Authentifizierung und Vertrauensgrenzen

Lease-/Refbindung plus erneute Byteintegrität schützt Architekturübergabe. Operatorissuer wird als Feld geprüft; tatsächliche Identitätsprüfung liegt bei Signaleingang. Prismcontrol erwartet HMAC oder autorisierten SPIFFEproxy, DB prüft approval zur aktiven Architektur. Archive sind Daten, werden nicht ausführbar extrahiert. Zugangsschutz, DB-/Objektstorerechte und Proxyvertrauen sind dokumentierte Infrastrukturannahmen.

## 8. Ressourcen und Aufbewahrung

Architektur256KiB, Base64/Archivbegrenzung32MiB und insgesamt höchstens4096 Dateien; kumulierte dekodierte Inhalte32MiB. JSON/base64 und kanonische Hashes erzeugen zusätzliche Speicherkopien, daher kein32MiB-Heapversprechen. Keine eigene Cleanup-/Retentionlogik; genehmigte Baselines bleiben beim Prismstore und Nova-Artefaktstore.

## 9. Architektur

Sinnvolle harte Prüfkante zwischen externem Archiv und Nova. Komprimierte Einzeiler in stage.ts erschweren Fehler-/Reihenfolgeprüfung und sollten später lesbar gegliedert werden. Wiederverwendbare Schema-/Archivintegrität muss explizit von Designsemantik und Modulplanmaterialisierung getrennt bleiben. Kein funktionaler Umbau im Review.

## 10. Tests

`npm test` bestanden; `../evidence/nova-batch-prism-design-tests.txt`. live-function prüft nur requiresDesign=false ohne Dienst. wait.test nutzt Original-Waitstore und Handkontext, prüft Replay/falschen Issuer. archive.test nutzt echten Prism ContentAddressedArtifactStore, minimale Design-/1x1PNG-Fixtures und Manipulation/Traversal/falschesProjekt/fehlendesArchiv. Kein echter Generation-/Approval-/Control-Postgreslauf. Vorhandene tests/verification/live/prism-nova-production-e2e.mjs identifiziert, wegen erforderlicher laufender Dienste hier nicht ausgeführt.

## 11. Dokumentation

README beschreibt Archiv-/Waitbeweise und ausdrücklich offene Forge/Busterintegration zutreffend. Es fehlen konkrete Crashgrenzen, Speicherverstärkung und Betriebsvoraussetzungen. Aussage Resume desselben Runs ist Implementierungsabsicht; gemeinsamer Corewait-Recoverybefund in [nova.execution](nova.execution.md) schränkt den lückenlosen Crashnachweis ein.

## 12. Befunde und Unsicherheiten

Kein zusätzlicher eigener nachgewiesener Defekt nach Abgleich beider Dispatchseiten und Archiveproducer/consumer. Verlinkte Core-/Prismbefunde bleiben kanonisch dort. Restnachweise: echte DB-/Auth-/Approverkette bei Architekturwechsel, Absturz nach Dispatch bzw. Wait vor Publish und größere echte Baselinearchive. Review abgeschlossen, diese Integrationsläufe bleiben offen.
