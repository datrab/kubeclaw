# Lokale Nachweise

Alle Befehle am inhaltsgleichen Baseline-Tree
`e43c39eea59b07f0a749b7b49f3aefdd11b14ed0`, Node v24.19.0.

| Datei | Befehl / Aussage |
|---|---|
| foundation-tests.txt | node --test tests/verification/reliability/lifecycle.test.mts tests/verification/reliability/blob-budget.test.mts; node tests/verification/contracts/check-nova-journal-scale.mts; npm test --workspace @kubeclaw/plugin-state-store; npm test --workspace @kubeclaw/prompt-contract |
| phase7.txt | node tests/verification/contracts/check-plugin-system-v2-phase7.mjs |
| blueprint-sync-tests.txt | npm test --workspace @kubeclaw/plugin-blueprint-sync |
| worker-contract-tests.txt | node tests/verification/contracts/check-pipeline-worker-core-contracts.mts; node tests/verification/contracts/check-worker-trust-spiffe.mts |
| worker-core-tests.txt | node tests/verification/contracts/check-pipeline-worker-attempt-executor.mts; node tests/verification/contracts/check-pipeline-worker-local-runtime.mts |
| defect-reproductions.txt | node docs/review/evidence/journal-mutation.mjs; node docs/review/evidence/prompt-loss.mjs; node docs/review/evidence/mutex-contention.mjs |

Reproduktionen nutzen Originalimplementierungen und lokale temporäre Daten.
Sie bestätigen aktuelle Defekte; ihre Beobachtungsassertionen sind nach Reparatur
entsprechend umzukehren. Keine funktionalen Reparaturen in diesem Auftrag.
Die Mutex-Messung ist ein Konkurrenz-Stresstest, keine deterministische Anzahl;
ein fehlerfreier späterer Lauf muss null Überlappungen haben. Keine Cluster-
oder Agent-Ergebnisse aus lokalen Testdoubles ableiten.

| Neue Datei | Aussage |
|---|---|
| plugin-contract-sdk-tests.txt | Vier Prüfkommandos bestanden; SDK-Paketbuild TS5058 fehlgeschlagen. |
| plugin-contract-sdk-repro.mjs / .txt | Originalparser nimmt leeres Manifest an; Original-SDK serialisiert Sparsearray ungültig und undefined/null gleich. |
| agent-contract-tests.txt | Pakettest/Typecheck bestanden; zusätzlicher Tiefenfehler im Originalvalidator reproduziert. |
| agent-contract-depth.mjs | 10000 Ebenen in ca. 20 KiB gültigem JSON führen zu RangeError. |
