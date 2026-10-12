# Trivy lock boundary tests — implementation subtask

This report records tests added by the test implementation subagent. It is **not** the fresh independent review requested for the finished change.

Executed:

```sh
node --test scripts/tests/trivy-database-lock.test.mjs tests/verification/deployment/versions.test.mjs
```

Result: **19 passed, 0 failed, 0 skipped** (17 Trivy tests and 2 version-generation tests). Raw output: [tests-boundaries.txt](tests-boundaries.txt).

New behavior evidence:

- TD02: execute the original module as an actual CLI in an isolated directory with authored inputs and a generated lock. Independently changing either side fails with `AUTHORING_DRIFT`, before registry access or cache publication.
- TD13: execute that same CLI with a consistent lock but a different installed scanner version. It rejects with `SCANNER_VERSION_MISMATCH` before registry access. A matching-version positive control reaches a deliberately failing `curl` executable, proving the access sentinel works. This sentinel prevents network use; it does not substitute validation or installer code.
- Version generation: a changed generated lock is detected without silently repairing it; explicit regeneration restores exactly that file. Authored scanner and database identities propagate into generated lock content. Existing unknown version argument and unknown base argument rejection tests remain.
- TD11: source checks verify the actual Buster Dockerfile copies all three required inputs and invokes the installer using the installed scanner version. The Buster Dockerfile and two image build workflows no longer contain the old refresh switch or mutable database download commands. **These are structural wiring checks, not an image build or scanner execution.**

Independent negative controls for the test mechanisms used isolated copies of the original production module and original test file. Each selected test suite was run against one deliberate removal. No repository production file was mutated:

| Removed check | Selected cases | Outcome |
| --- | --- | --- |
| Raw manifest digest and size | TD04, both database kinds | 2 failed: missing expected rejection |
| Downloaded archive digest and size | TD05, both database kinds | 2 failed: missing expected rejection |
| Extracted file digest and size | TD06 wrong extracted identity | 1 failed: missing expected rejection |

All three mutant commands exited 1. [mutation-receipt.json](mutation-receipt.json) records the exact removed/replacement strings, test selectors, exit codes and original source/test SHA-256. Raw output is in [mutant-manifest.txt](mutant-manifest.txt), [mutant-archive.txt](mutant-archive.txt), and [mutant-extracted.txt](mutant-extracted.txt). The full unmodified-module run above passed all five affected cases.

Archive tests use real tar archives and actual extraction, filesystem publication and hashing. Their database bytes are explicitly synthetic, not usable Trivy databases. These results establish neither Docker build reproducibility nor offline scanning against real upstream databases; those require separate evidence.
