# Unabhängiger Folgereview: fünf Prismsettings und früher Buster-Cancel

Stand 2026-09-21. Frischer Reviewer; keine Änderungen an Implementation oder
Tests. Dieser Bericht beurteilt ausschließlich den abgegrenzten CONFIG-Schnitt
und die RC05-Korrektur. Er schließt weder CONFIG/F1–F6 noch Buster/B1–B5.
Die [Dateiidentitäten](../../evidence/independent-config-final-20260921/reviewer-identities.json)
binden den tatsächlich gelesenen Stand. Frühere Agentenlogs sind historische
Nachweise, keine von diesem Reviewer ausgeführten Prüfungen.

## Ergebnis

**R-C1 für die fünf lokalen Consumerwirkungen behoben.** Der eigene
[Runtime-Lauf](../../evidence/independent-config-final-20260921/reviewer-runtime.txt)
bestand mit 52 Tests, null Skips: Loader, reale Active-/Probe-Admission,
TCP-Verbindungsgrenze, HTTP 408 und Shutdowngrenzen. Die Tests schreiben
abweichende Werte in eine echte vollständige Autorendatei und lesen sie mit dem
Produktionsloader. Sie prüfen Antworten beziehungsweise Verbindungen am
Originalserver; reine Objektvergleiche sind nicht ihr Verhaltensnachweis.
CB03 behält Nodes ursprüngliches Prüfintervall bei und beobachtet die echte 408
nach ungefähr 30 Sekunden. Shutdown verwendet die originale PG-Bibliothek gegen
einen realen TCP-Peer, der PostgreSQL-Startup nicht beantwortet. Das beweist
Verbindungssettlement und die konfigurierte Lifecyclefrist, keine SQL-Funktion
oder native Attempt-Reinigung. Der native Gesamtentrypoint bleibt ungeprüft.

**R-C2 / RC04-Wiederholung weiterhin offen.** Der
[eigene Serviceversuch](../../evidence/independent-config-final-20260921/reviewer-buster.txt)
scheitert schon beim Archivaufbau mit `/usr/bin/tar ENOENT`. Er erreicht RC05
nicht und ist kein fachlicher Negativbeweis gegen die Korrektur. Die aktuelle
Umgebung kann die frühere GNU-tar/flock-Ausführung nicht unmittelbar wiederholen.
Die Codeprüfung bestätigt die zwei kleinen initialen Abortchecks: vor Tarspawn
und nach asynchroner Extraktion vor Factory-/Executorstart. Zwischen Check und
synchronem Start entsteht kein zusätzlicher Await-Spalt. RC05 koppelt den echten
Cancel an die echte persistierte `running`-Transition und fordert null
Executorstarts sowie terminalen Cancelstatus. Der eigene Executor prüft ebenfalls
das initiale Signal; die getrennte Startzählung verhindert, dass dies allein den
Produktionsfehler verdeckt. Die archivierten Vorfix-/Mutantenfehler sind plausibel,
aber hier nicht neu ausgeführt. Der genaue Ablauf des ursprünglichen historischen
Shutdownhängers bleibt mangels damaliger Instrumentierung unbekannt.

Kein weiterer Produktivfehler im geprüften Schnitt gefunden. Das ist kein
Versprechen, dass sämtliche globalen Abnahmekriterien bereits erfüllt wären.

## Unabhängige Prüfungen und Grenzen

- Aufruf Runtime: `SWARM_CONFIG="$PWD/charts/kubeclaw/files/config/swarm.config.json" node --test skills/prism/tests/swarm-worker-config.test.mts skills/prism/tests/swarm-worker-behavior.test.mts skills/prism/tests/worker-ingress-capacity.test.mts skills/prism/tests/worker-shutdown-boundaries.test.mts` — 52/52.
- [Deploymentlauf](../../evidence/independent-config-final-20260921/reviewer-deployment.txt): `node --test tests/verification/deployment/prism-swarm-config.test.mjs tests/verification/deployment/prism-native-runtime.test.mjs tests/verification/deployment/argocd-chart-order.test.mjs tests/verification/deployment/worker-trust-readiness.test.mjs` — 44 bestanden, **ein Fehler**, Exit 1. Alle Helm-/CONFIG-Prüfungen bestanden. Der native NRI-Binarytest konnte `go` nicht starten (`ENOENT`); er gilt ausdrücklich nicht als bestanden.
- [Archivlieferung](../../evidence/independent-config-final-20260921/reviewer-package.txt): `node docs/review/evidence/independent-config-20260920/package-namespace.mjs` — Exit 0. Echte `helm package`-Archive gerendert, ConfigMapbytes mit Originalruntime geladen; beide Namespaces bestanden.
- [Neue isolierte Mutanten](../../evidence/independent-config-final-20260921/reviewer-mutations.py): ausschließlich temporäre Lifecyclekopien setzen Connectiongrenze auf 4 statt Autorenwert 3 oder Requestfrist auf 120000 statt 100. [Beide Prozesse enden mit Exit 1](../../evidence/independent-config-final-20260921/mutations.json): erwarteter Drop beziehungsweise erwartete 408 bleiben innerhalb der bestehenden Testfrist aus. Die Testläufe enden durch ihre echten Zeitlimits (10/45 Sekunden), nicht durch Importfehler. Unveränderte Originalfälle bestanden zuvor. Dies belegt die Erkennung dieser beiden konkreten Verdrahtungsfehler, keine allgemeine Mutationsabdeckung.
- Busteraufruf: `node --test tests/verification/contracts/check-pipeline-remote-plan-runtime.mts` — Exit 1 vor fachlicher Ausführung, siehe R-C2.

Kein Dockerbuild, Clusterlauf, Cgroup-Versuch oder root-eigener Hostpolicytest
wurde simuliert oder als grün ausgegeben.

## Einfachheit, Altpfade und Dokumentation

Die fünf migrierten Werte haben genau eine Autorenquelle. Der Loader nutzt
keine Ersatzdefaults, lehnt die alten fünf Envkeys ausdrücklich ab und liefert
einen eingefrorenen Settingssnapshot. Der Helm-Altkey ist ebenfalls abgewiesen.
Chartsymlinks ersetzen manuelle Configkopien; die reale Archivprüfung bestätigt
ihre Paketwirkung. Der Produktionsentrypoint reicht `config.ingress` und
`config.shutdownTimeoutMs` direkt an vorhandene Consumer weiter. Die zusätzlichen
Helmvalidierungen müssen bei Schemaänderungen mitgepflegt werden, sind aber keine
zweite Wertequelle. Die kleine Factory vermeidet die alte Inlinekonstruktion;
ein nativer Ressourcenbesitzer entsteht dadurch weiterhin nicht.

`operator-configuration.md` beschreibt Quelle, Einheiten, Grenzen, Startupcapture,
Rollout, entfernte Overrides und die entscheidende periodische Node-Timeoutsemantik
korrekt. Der Buster-Cancelbericht trennt Produktionsfix, zwei Fixturekorrekturen
und weiterhin fehlende unabhängige Wiederholung. Die ursprüngliche Formulierung
„Wiederholung ausstehend“ bleibt deshalb sachlich richtig. Der historische erste
Reviewbericht wird durch diesen Folgebericht ergänzt, nicht nachträglich grün
umgeschrieben. 1374 Inventurkandidaten, vollständige Migration, F5 sowie gesamte
Doku-/Image-/Livegates bleiben offen; dieser Bericht erfüllt nur die lokale
Dokumentation des geprüften Schnitts.
