# prism.corpus — governte Referenzen und Retrieval

Review-Status: abgeschlossen. Geprüfter Commit: `85ddfcbfc15e078780ea0434fc167e6f9a9b9488`.

## 1–3. Verantwortung, Verträge, Persistenz

Vollständiges corpus/index.ts:1–255 und vier corpus.test.mts-Fälle gelesen. Control POST /v1/corpus lässt Ingestion quarantänieren, bindet Quelldigest, ruft Workerembedding, dann ingest(pool,...,{activate:false}), räumt Quarantäne und aktiviert exakte Revision. GET search erzeugt Queryembedding und ruft search; expire hat nur Testaufruf, keinen gefundenen öffentlichen Lifecyclecaller. Corpus ist interne Library, kein eigener HTTP-/Pluginentry. Eingaben sind SourceKind/Metadaten/Rechte und Embeddingevidence; Ausgabe Revision-ID/JSON-input-Digest. Rechte/Item/Revision/Embedding werden mehrstufig geschrieben (001). Search filtert aktive aktuelle Revision, allow_design_use und valid_until; Hybridmodus zusätzlich Modellname, nicht modelVersion/Dimensionsbindung. RRF fusioniert Text-/Vektorranking, dann Präferenzsortierung und Familiencap.

## 4–6. Fehler, Retry und Recovery

Vektor muss endlich, nichtleer, höchstens4096 sein; sourceContentDigest wird formal geprüft, embedding.sourceDigest nicht gegen tatsächlichen Text recomputed. Test liefert ausdrücklich frei erfundene sourceDigests. Idempotenzlookup erfolgt vor BEGIN über JSON-Digest; gleichzeitig gleiche Inputs können am corpus_key konkurrieren und einer scheitert. Verlorenes ACK ist per Lookup wiederfindbar, aber frühere partielle Writes (001) nicht automatisch reparierbar. Poolquery verwendet hier keine reservierte Verbindung. Control-Quarantäne/DB-Aktivierung ist kein atomarer Commit: Crash nach restricted-Insert vor Cleanup/activate lässt unvollständige Projektion; erneuter gleicher Input kann vorhandene Revision zurückgeben, dann Cleanup/Activation fortsetzen. Ohne Retry kein Scanner. expire ändert Status, löscht weder Rohdaten noch Embeddings. Kein Timeout/Abort am DBpfad.

## 7–9. Vertrauen, Grenzen, Architektur

Public-web ist am Control deaktiviert; validateSource prüft nur URL/Literaladressen, echter DNS/Redirect/Pinning liegt in service-ingestion. Daraus keinen aktiven DNS-SSRF im Control ableiten. SQL parametrisiert, Metadaten/Rechte kommen aus authentisiertem Nutzerfluss. Temporäre/analysis-only Quellen dürfen nicht ins Designretrieval; gültig-bis wird bei ingest nie gesetzt. Search hat keine direkte Bibliothekslimitprüfung, HTTP clamp kann NaN weiterreichen; Ergebnisse puffern bis max(limit*10,100). Keine Retentionworker für persistierte Corpusmetadaten. Normalisierung/Fingerprint sind natives JSON, kein kanonisches sprachübergreifendes Evidenceformat. Gemeinsames inTransaction aus Storage verwenden; verbindliche Embeddingprovenienz/Version statt bloß Modellname festlegen.

## 10–11. Tests und Dokumentation

Originalgruppe dokumentiert in [prism-reviewed-modules-tests.txt](../evidence/prism-reviewed-modules-tests.txt). Vier Corpusfälle: drei PGlite/pgvector mit Originalmigration/SQL, eine Literal-URL-Negativprobe. Sequentielle eingebettete DB belegt keine Pool-Transaktion oder echte externe Acquisition. Gelesene Assertions: Idempotenz, Search/expire, analysis-only und Filter/Familienranking. Keine echten Providervektoren. Completionstatus nennt Retrieval fertig, Implementationplan Phase6 verlangt governte atomare Persistenz; 001 zeigt konkrete Poolabweichung. Dokumentation vorhanden über Plan/Conventions, unvollständig bezüglich Recovery/Version-/Retentionpolicy.

## 12. Befund

### PCR-PRISM-CORPUS-001 — Transaktion auf Pool statt reservierter Verbindung

**Hoch; Evidenzklasse: nachgewiesener Defekt durch beidseitigen Code-Trace:** corpus/index.ts:76–163 nimmt Queryable und sendet BEGIN, mehrere Inserts, COMMIT/ROLLBACK jeweils via db.query. Control.ts:1040 ruft mit pg.Pool auf. Pool garantiert keine Sessionaffinität zwischen diesen Befehlen, besonders bei parallelen HTTP-Routen. Rechte/Item/Revision/Embedding können autocommitten, während BEGIN/ROLLBACK eine andere Session betreffen. Folge: partielle governte Referenzen, offene Transaktionen/Locks und versehentlich in fremder Transaktion laufende Queries. Original-PGlite-Einzelverbindungstest kann das nicht erkennen. Ursache ist ein Queryablevertrag ohne Transaktionsbesitz. Behebung: inTransaction(pool, connection=>...) für gesamten lookup/write-Scope mit geeigneter Same-input-Serialisierung; ausschließlich connection weiterreichen. Regression mit echtem Postgrespool ≥2 Verbindungen und konkurrierenden Requestbarrieren, Fehler nach jedem Insert; nach Rollback keinerlei Teilzeilen und keine offene Transaktion. Historische SQL-Stringprüfungen sind kein Gegenbeleg.

**Offene Verifikation:** `docs/architecture/prism-storage-model-v1.md` fordert ein freigegebenes Modell/feste Dimension und `prism-retrieval-ranking-v1.md` versionierte Retrievalinputs. Aktives search bindet nur model, ingest vertraut embedding.sourceDigest. Ein Original-PG-Negativfall mit gleichem Modellnamen/abweichender Dimension oder falschem Quelldigest wurde nicht durchgeführt; daraus keine geprüfte Embeddingprovenienz ableiten. Rechtewiderruf/Expiryworker und Retention persistierter Derivate sind ebenfalls offene Implementierungs-/Betriebspfade; expire allein setzt nur Status.

Historische Prototypen und ihre getrennte Testaussage: [Prism-Spikeabgrenzung](../prism-spikes.md).
