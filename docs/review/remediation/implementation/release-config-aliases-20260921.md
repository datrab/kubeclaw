# Release configuration aliases

Pre-edit acceptance matrix (2026-09-21): the existing real materialization test fails because the source-tree verifier rejects Prism's two canonical configuration aliases. This slice preserves source-commit qualification, rather than accepting arbitrary symlinks.

| Case | Required evidence |
| --- | --- |
| CA1 | Both exact checked-in relative aliases pass against their source commit; existing materialization and real Helm rendering pass. |
| CA2 | Changed canonical configuration or schema bytes fail against the selected source commit, including a later commit with changed schema. |
| CA3 | Retargeted aliases, absolute links, a regular file replacing an alias, and unknown source/current symlinks fail. |
| CA4 | Symlinked ancestors of canonical targets fail, including an otherwise identical outside copy. |
| CA5 | Existing fileset, unavailable-commit, unrelated-commit and ops-family isolation tests remain passing. |
| CA6 | Operator documentation states the exact aliases, canonical edit locations and source binding; independent review remains separate. |

Implementation and evidence results will be appended after execution. No live release or image qualification is claimed by these local tests.

Implemented the two exact aliases in `scripts/updates/release-configuration.mjs`.
The verifier checks their committed link blobs and current relative link text,
then hashes both canonical regular files against the same selected commit.
Every ancestor of a checked path must be an actual directory. Unknown symlinks
remain rejected, and a regular copy cannot replace a committed alias. The
existing chart/value fileset comparison and independent ops scope remain intact.

The real materialization fixtures in `code-release.test.mjs` and
`release-images.test.mjs` now copy relative symlinks verbatim and include the real
canonical schema in their temporary Git commits. They still exercise the original
materializer and real Helm rendering, including Prism in the latter suite.
Operator instructions were updated in `docs/operations/operator-configuration.md`.

Validation: `node --test tests/verification/deployment/release-configuration.test.mjs
tests/verification/deployment/code-release.test.mjs
tests/verification/deployment/gitops-continuous.test.mjs
tests/verification/deployment/runtime-input-locks.test.mjs
tests/verification/deployment/release-images.test.mjs` passed **25/25**, no skips.
Raw output: `docs/review/evidence/release-config-aliases-20260921/tests-final.txt`.
The earlier four-suite run passed 23/23 (`tests.txt`). A temporary isolated
negative-control copy omitted canonical target verification; **2/7 tests failed**
on the changed-schema source binding and target-directory escape assertions
(`mutant-omitted-targets.txt`). Production files were not mutated for this check.

CA1–CA5 have local behavioral evidence. CA6 documentation is updated; independent
review remains required. This is release-verifier integration, not proof of an
actual successful image build, deployed configuration or whole CONFIG closure.
The verifier assumes the normal non-concurrently-mutated release checkout; this
change does not claim descriptor-pinned defense against a malicious process
rewriting files between verification and Helm packaging.
