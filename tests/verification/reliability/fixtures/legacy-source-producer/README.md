# Original historical producer bytes

These seven files are exact bytes from commit `b6b2b1bf0579ac92b2e9f565bbc44bc79252a33d`. `provenance.json` records each original repository path, Git blob SHA-1, SHA-256 and byte count. The `.txt` suffix prevents archived TypeScript from being treated as active production sources.

The historical CLI recovery probe verifies every archived byte string before execution. It materializes the complete pre-CONFIG runtime/package closure from `5a437c726646d75d5500c23504ee3a3540547c3f` in the hash-bound `tests/fixtures/historical-runtime-producers.json` archive, then overlays the four original execution files. Original package discovery stays inside that closure; historical transport configuration does not receive the later `byteProfile` or Core policy selection fields.

The original Project source/compiler generate the old run. The unchanged original unfixed CLI is the graph-mismatch negative control; the authentic pre-CONFIG fixed CLI proves terminal recovery without rewriting the run. Separately, the maintained CONFIG CLI must reject that old run with `RECOVERY_CORE_POLICY_MISSING`, also without writing. Historical recovery does not authorize a current-policy fallback or establish current CONFIG/native acceptance.

From any dependency-installed checkout, run:

```sh
node docs/review/evidence/wave47-project-legacy-resume-cutover-probe.mjs "$PWD"
```

No historical Git objects or external historical Core directory are required. Git remains required for the original test's real temporary project repository and implementation/source operations.
