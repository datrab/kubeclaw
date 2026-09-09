# Remote-only recovery input review

Seven isolated checkpoint refs were read back after creation. All 189 changed file entries were verified against their original local Git blob SHA and mode in the resulting remote trees. The remediation branch was not updated.

SDK source, current regression tests, frozen old snapshot fixtures, implementation report and raw logs are accessible at c6916545cc0f4f298e932bae4b3cde944e347720. Independent review, final source hashes and CLI probe are separately accessible at 9783be709ca93f3f8ee7f8d1ccd2408fafef978f. The inventory must retain this relationship.

This was a remote-only document and tree inspection, not a fresh-process execution proof or independent context reset.

## Concrete remaining recovery gap

The historical graph probe imports absolute /workspace/scratch paths and ./core/src/index.ts. The historical CLI probe reads three files using git show b6b2b1b and takes an external historical Core directory. New backup commits preserve source content as net deltas; they do not preserve local commit identities or their complete ancestry. Thus a new clone cannot assume b6b2b1b is resolvable.

Historical provenance identifies source commit b6b2b1bf0579ac92b2e9f565bbc44bc79252a33d and SHA-256 values for execution/engine-run.ts, engine-snapshots.ts, graph.ts and runner.ts. The CLI probe additionally needs project/source.ts, compiler.ts and cli.ts from that original commit.

The root assigned the SDK agent to archive exact historical bytes with provenance, make the probe portable, and execute it from a clean restoration. Until that result passes, historical probe reproducibility from the remote checkpoints remains incomplete. Existing recorded test results are retained without claiming a new successful execution.
