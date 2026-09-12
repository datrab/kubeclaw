# PR #6: Risikoakzeptanz und persistente Lab-Registry

Fortsetzung auf dem bestehenden PR-Branch, Ausgangshead
`232e484a0d4776b4d7749d35e40ea9cd96318865`. Kein neuer Branch, Merge oder Deployment.
Nach D12 sind PATH-T04-002 und IFR-08-002 lokal abgeschlossen. Von den zuletzt
angefragten sieben bleiben fünf: PCR-SDK-001, PCR-BUSTER-ENGINE-001/-004,
PCR-PRISM-WORKER-002 und PCR-OBS-002. Register:130 verifiziert,4 teilweise,
1 in Bearbeitung,19 offen. Die ursprüngliche39er-Menge enthält jetzt35 lokale
Abschlüsse; PATH-T04-002 gehört zur zusätzlichen Zweiermenge.

## PATH-T04-002

Die vorhandene Projektkomposition enthält bereits optionale Architekturprüfung,
Operatorfreigabe, obligatorische Sourceprüfung und die finalen Produktgates.
D10 unterscheidet akzeptierbare fachliche Risiken von nicht übersteuerbaren
Pflichtprüfungen/Integritätsfehlern. Die konkrete Restkorrektur erzwingt für eine
Freigabe mit Findings eine nichtleere Begründung. Der Architekturconsumer weist
auch einen widersprüchlichen passed-Bericht mit blocking-Finding und unbekannte
Severity zurück. Allgemeine Human-Approval-Aufrufe behalten ihren bisherigen
Vertrag. Reviewsubject, Reportdigest und Operatoridentität bleiben gebunden.

Vier neue Original-Core/Git/Artefakt-Gatefolgen bestehen: warn mit Grund, error
mit Grund, fehlender Grund und blocking. Der bestehende HTTP-Fixture liefert
explizite Review-Protokollvektoren; dies ist kein Nachweis eines echten Modells.
Die produktiven Core-/Plugin-/Git-/Store-/Waitpfade laufen unverändert. Erfolgreiche
Risikoannahmen speichern Grund, Operator und genau den geprüften Report/Subject;
Ablehnungen erzeugen keine Freigabe und bewegen Git nicht. Die neun ursprünglichen
Source-Gatefälle bestehen zusätzlich, einschließlich geänderter Source nach
Freigabe und optionalem Reviewer. Originalpakettests, Compiler und Paketbuild
bestehen. Der neue Test liegt im bestehenden Reliability-Glob.

Die neue Missing-reason-Regression scheitert am vorherigen Produktionsstand.
Ein schon vorher unpassender Test erwartete CONTENT_INVALID, obwohl der originale
Store die manipulierte Größenreferenz früher als ARTIFACT_REFERENCE_CORRUPT
ablehnt; die Erwartung wurde auf diesen ursprünglichen Fehler korrigiert.
Der erste reduzierte Core-Testgraph behielt einen nicht mehr angeforderten
Implementation-Grant und wurde korrekt vom Register abgewiesen. Die Fixture
entfernt diesen unbenutzten Grant; die Registry wurde nicht abgeschwächt.
Die abschließenden Source- und Risiko-Läufe erfolgten auf der korrigierten Quelle.

## IFR-08-002

Die Lab-Registry erhält einen explizit konfigurierten PVC-Vertrag und persistenten
Datenmount. RWOP plus Recreate verhindert gleichzeitigen Writer-/GC-Volumenzugriff.
StorageClass und Kapazität sind Pflichtangaben des Operators; es wird keine
Clusterkapazität gewählt. Vor Apply werden vorhandener Deploymentmount und PVC
geprüft. Eine alte flüchtige Registry oder abweichende Speicheridentität wird
zur separaten Migration abgewiesen. Gewöhnliche Infra-Ressourcenentfernung erhält
den PVC; ausdrückliche PVC-/Namespacezerstörung bleibt destruktiv.

Manuelle GC verwendet den offiziellen Distribution-Collector ohne
`--delete-untagged`. Sie skaliert den Server auf null und verwendet denselben
RWOP-Mount in einem Job ohne automatische Wiederholung. DELETE und Upload-TTL
sind abgeschaltet. Alle vorhandenen Manifestreferenzen, auch taglose frühere
Images, werden konservativ erhalten. Dies ist keine Lease-Ende-Löschung und
keine pauschale Quotenbefreiung: referenzierte Images und unfertige Uploads bleiben.
Der explizite PVC-Budgetwert ist keine Behauptung über eine unbekannte Backendquota.
Die Betriebsanleitung verlangt einen tatsächlich begrenzenden Provisioner und
benennt Wartung, Joblogs, Neustart, Migration und Kapazitätsüberwachung.

Der originale Distribution-3.0.0-Server wurde lokal aus seinem versionierten
Go-Modul gebaut. Go-Buildinfo bindet das Modul an v3.0.0,
`h1:q4R8wemdRQDClzoNNStftB2ZAfqOiN6UX90KJc4HjyM=`. Ein anfänglicher v2.8.3-Build
scheiterte bei der unversionierten Dependencyauflösung an einer höheren
Go-Anforderung; es wurde kein bestandener v2-Test behauptet. Manifest und
abschließender Test verwenden beide3.0.0.

Der echte HTTP-/Dateispeicher-/GC-Test pusht zwei Manifeste unter demselben Tag,
prüft DELETE-Ablehnung, beendet den Server, führt Dry-run und echte GC aus und
startet denselben Server über denselben Speicher neu. Beide Manifestdigests
und vier notwendige Blobs bleiben bytegleich lesbar. Ein zusätzlich hochgeladener,
von keinem Manifest referenzierter Blob wird tatsächlich entfernt:65536 Bytes.
Zwei Konfigurationstests prüfen fehlende/abweichende Kapazität, alte flüchtige
Mounts, Subpath-Aliase, fehlenden PVC, unzulässiges RWO und sichere GC-Argumente.
Kanonischer ESLint, Shellsyntaxprüfung und vollständiges Knip bestehen. Die fünf
bestehenden Registry-/Helm-/HTTPS-Clienttests bestehen. Ihr erster Aufruf ohne
den bereits installierten Helm-Pfad scheiterte; der korrigierte PATH-Aufruf
verwendet unveränderte Tests. Beide Logs bleiben erhalten. Native Einstiege:
`verify:registry-local:storage` und `verify:registry-local:native`; letzterer
verlangt den originalen Binarypfad über KUBECLAW_REGISTRY_BINARY und überspringt
keine fehlende Voraussetzung.

Spätere Live-Abnahme: CSI-RWOP-Ausschluss, reale Volumegröße/Quota und
Registry-Podwechsel; außerdem unverändert echte BuildKit-/CRI-/Nodepfade. Die
lokalen Tests behaupten weder Kubernetesbetrieb noch vollständige OCI-Image-
Ausführbarkeit. Diese Live-Gates blockieren den lokalen Auftrag gemäß D12 nicht.

Rohdaten: [Befehle](../../evidence/pr6-seven/commands.json),
[Architektur-Gatefolgen](../../evidence/pr6-seven/acceptance-risk-after.log),
[Source-Gatefolgen](../../evidence/pr6-seven/acceptance-source-after.log),
[Originale Registry-GC](../../evidence/pr6-seven/registry-native-gc.log).
