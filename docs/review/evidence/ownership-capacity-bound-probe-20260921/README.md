# Supplemental terminal representation probe

Root ran `node docs/review/evidence/ownership-capacity-bound-probe-20260921/probe.mjs`
with exit 0 against the in-progress implementation. `result.json` records the
exact source hashes, case count and byte boundary. The probe rejects source drift
during its own run. Rerun it after implementation changes before using it as
evidence for that changed version.

After the author froze the TC production sources, root repeated both commands.
`frozen-commands.json` records their actual and expected exits (0 for the probe,
1 for the negative control); `frozen-result.json` contains the current hashes and
180 passing cases. Initial results remain intact. The fresh subagent's separate
filesystem review and the broader native gates are still separate requirements.

The 180 cases combine six valid diagnosis forms (including 4,096 control
characters), five counter magnitudes, three revision widths and two host identity
states. Two initially unbound children acquire distinct valid bindings. Every
resulting record passes the production record validator; its actual durable-writer
serialization matches the quota serializer and fits the prior commitment. A
valid combination reaches the exact upper bound, rather than merely staying
below an arbitrarily generous allowance.

The private `omit-diagnosis.mjs` import hook changes only the loaded accounting
projection to reserve a one-character diagnosis. The same probe exits 1 at the
valid-lifecycle byte-bound assertion. `mutant-result.json` and
`mutant-omit-diagnosis.txt` retain the command and failure; production files were
not edited. A missing mutation target fails explicitly instead of silently
running the original implementation.

These are serialization-domain checks using synthetic metadata. They do not
exercise durable admission, locking, I/O failures, process termination or a native
kernel. They supplement the original suites and fresh subagent review; they do
not establish TC1–TC5 or complete the broader capacity finding.
