# Original historical producer bytes

These seven files are exact bytes from commit `b6b2b1bf0579ac92b2e9f565bbc44bc79252a33d`. `provenance.json` records each original repository path, Git blob SHA-1, SHA-256 and byte count. The `.txt` suffix prevents archived TypeScript from being treated as active production sources.

The historical CLI recovery probe verifies every archived byte string before execution, copies the current Core to a temporary directory and overlays its four original execution files. It also overlays the original Project source/compiler and invokes the original CLI as the negative control. This is the same historical boundary used by the earlier proof; unchanged dependencies remain current. It is not a standalone reproduction of every file in the old release.

From any dependency-installed checkout, run:

```sh
node docs/review/evidence/wave47-project-legacy-resume-cutover-probe.mjs "$PWD"
```

No historical Git objects or external historical Core directory are required. Git remains required for the original test's real temporary project repository and implementation/source operations.
