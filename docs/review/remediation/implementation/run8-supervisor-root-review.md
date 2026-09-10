# Independent root review: original supervisor start boundary

Partial original acceptance only; PCR-SCAFFOLD-OPS-001 remains open.
Root reviewed the complete66-line additive test at32a9c2fe52b851fb08e2423c6306114069250be3,
backed as47de98daaeabc527d3304462f05f24b7bca57747 on fresha43aa256. No production
source or existing assertion changes. The test calls the actual supervisor,
actual npm pipeline CLI, original installed preflight stage and original
repository/artifact adapters. Its temporary platform and declaration are real
inputs, not replacement executables, stage mocks or fabricated Core journals.

Root reran the same exact test in this invocation's fresh checkout ata220784:
missing platform visibly exits1 with REVIEW_SUPERVISOR_STATUS_FAILED and no
state/lease; restored valid platform starts the original stage, reads its real
declaration, stores its artifact, records requested/accepted/completed effects
and completes the genuine Core run successfully. One test passes, zero skips;
canonical focused ESLint exits0. Full raw command/output:
docs/review/evidence/run8-root-supervisor-start.txt. Author's initial incorrect
attempt.started assertion and corrected original attempt.created plus stage.started
evidence are retained unchanged; no synthetic event was introduced.

This satisfies only the original invalid-then-readable platform/start part.
It neither needs nor proves external model/provider delivery. Unavailable Gateway
health remains honestly false. The separate genuine adopted-process prerequisite
still fails REAL_PROC_PROCESS_CMDLINE_REQUIRED because child /proc cmdline is
unavailable; author raw is retained and root did not repeat the unchanged blocker.
Actual original pipeline adoption across temporary status loss remains required
on a host with native process identity. No proc substitution or ownership bypass,
deployment, CI, paid resource or third-party message was used. Do not close the
finding from this partial start proof. Repeat the test after related SDK snapshot
integration; it must continue using current checkout source and dependencies.
