# SDK source resume recheck

Re-entry found a clean committed worktree at `ba937fdcb5f110dcc55e45efb121f3a33adcdf5b`, with the previously reported Project CLI recovery defect already fixed. All 19 production file SHA-256 values from independent review `43710de1bba3e33c530458b29c067ad649e0cb6c` match this source exactly. No production change was needed.

Fresh execution with Node 24.19:

- `node --test tests/verification/reliability/project-recovery-version.test.mjs tests/verification/reliability/source-snapshot-version.test.mjs tests/verification/reliability/source-identity-version.test.mjs`: 11 passed, zero failed or skipped; exit 0.
- The independent historical Project CLI probe from review `43710de` was rerun against the original historical Core fixture and current worktree. It again reproduced the graph mismatch with the unchanged old CLI, then preserved the terminal-run guard with the fixed CLI and identical snapshot/journal bytes; exit 0.

Raw output: `docs/review/evidence/wave47-sdk-source/resume-recheck-tests.txt` and `resume-recheck-original-cli.txt`.

The Source approval graph tests use the existing bounded deterministic local transport fixture and prove original Core/source/Git/artifact/resume behavior. They do not establish model quality or remote provider acceptance. The full 13-stage historical CLI probe supplies no model response, reaches the actual missing-credential terminal boundary and verifies recovery compatibility, not successful full pipeline completion.

This recheck supports integration of the existing bounded slice, not closure of the whole PCR-SDK-001 canonical-consumer inventory. No native isolation, full application, or external provider gate was added or claimed passed.
