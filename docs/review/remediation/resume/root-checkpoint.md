# Root checkpoint: reviewed integration and resumable work

Frozen scope remains exactly 47 IDs. Seven now satisfy their original finding
requirements; 40 remain incomplete. Overall completion is false. The latest
continuation is in `run-20260909t2146.md`; prior reviewed integration and evidence
remain in `run-20260909t2114.md`.

## Independently integrated work

- Source/Subject, Effect and enclosing Snapshot identity versions preserve
  historical CLI/replay authority. Separate implementation, review and fresh
  recheck commits were inspected before integration. Broad PCR-SDK-001 is open.
- Admission compaction retains immutable original completion evidence while
  releasing its duplicate bytes, with independent original consumer checks.
  Broad PCR-OBS-002 is open.
- Root's combined test uncovered a real interaction: the shared retirement
  inspector still hardcoded snapshot v1. The correction uses the original Core
  validator on the existing bounded inventory read, preserving no-follow and
  size limits. Root inspected the correction and additional legacy/current/
  corruption regression before integrating it.

Root reran the combined Admission, Replay, Planner, Telemetry, Source and Project
Recovery suites: **43/43 passed, zero skips**, exit 0. Production source tested
at `eed91ee`; concurrent subsequent commits added only setup documentation and
evidence. Raw failure and passing outputs are preserved at:

- `docs/review/evidence/wave47-resume-integrated-initial.txt`
- `docs/review/evidence/wave47-resume-integrated-final.txt`

## T01-F01 closure

Root inspected the original requirement and independent review, corrected setup
documentation diff and additive original-CLI probe. Root then reran the complete
scaffold/import/compile/execution-entry proof on integrated `48320e8`, including
the new SDK versions. It passes with all 13 original graph stages, actual
source/blueprint attempts and first-module Git workspace creation. The exact
missing external worker-secret boundary is retained; no provider is substituted.
This establishes the originally broken setup entry. T01-F02 full product delivery
remains open. Raw output: `docs/review/evidence/wave47-scaffold-root-integrated.txt`.

## Restart boundary and saved work

Seven separate remote package checkpoints preserve all outstanding tracked work;
see `package-checkpoints.json` for immutable SHAs and integration dependencies.
They were verified by blob SHA and mode and remain backups, not approvals.
Product/controller/chart remain a coupled pending package with a real native
CRD/CEL acceptance gate. Do not install or silently integrate them from a backup.

The remote review identified a local-history dependency in a historical CLI
probe. Seven original producer files were then archived with Git/SHA256 hashes;
root independently compared all seven byte-for-byte with original `b6b2b1b`.
The corrected probe ran successfully in a fresh export without `.git`, with all
62 workspace package resolutions within that export and 1,113 source files
hash-checked. Tampered archival bytes reject before execution. Evidence:
`docs/review/evidence/wave47-sdk-source/portable-history-checkout.json`,
`portable-history-probe.txt`, and `portable-history-tamper.txt` in the same folder.

This proves source restoration and continuation of the historical test without
the old local Git objects. It does not prove automatic scheduler recovery from
an OpenAI outage or completion of native infrastructure tests. The recurring
repair instruction must read the remote README, ledger and package checkpoints
each run; isolated work branches and fast-forward-only publication reject stale
integration writes. No distributed exclusive agent lock is claimed.

Next work: reconcile remaining SDK identity domains; continue original incomplete
findings from `work-items.json`; satisfy actual native prerequisites where
required. Preserve architecture, real-test gates and the no-deployment/CI rules.
