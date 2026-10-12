# Independent guest startup/storage diagnostic preparation review

Bounded diagnostic preparation accepted; no boot by this reviewer. The actual
launcher differs from reviewed VM3 only in fixture paths and VM name. Resource
limits, watchdogs, network/device isolation and readonly host export are unchanged.
The new disk and guest UUID are separate; old artifacts are not modified.

Eighteen small artifact hashes match the final manifest. Guest diagnostic/preload
copies match the reviewed source. The unchanged VM3 source manifest is reused;
both original test modules and their two child fixtures also match current bytes.
The author's actual verify-only preflight passed with `vmBooted: false`; this
reviewer did not repeat the whole 8 GiB disk hash. Exact evidence is in
`../../evidence/native-vm-startup-storage-independent-20260921/checks.json`.

The private preload observes startup, imports and first stdout. Three readiness
probes retain 20/20/15-second bounds, then the two complete original test modules
retain all fifteen cases and deadlines. The same sequence runs on a separately
copied, byte/type/entry-verified guest ext4 tree made readonly before execution.
Both trees are verified again. A 180-second batch watchdog and the unchanged
900-second outer VM watchdog bound failures; diagnostic completion is separate
from original-test success. Any recorded readiness/exit failure returns nonzero.

Readiness instrumentation captures the first stdout chunk rather than independently
asserting its text. Interpretation must confirm `durable` for the journal modes
and `locked` for the supervisor; captured stdout alone is not a durable acceptance
claim. Probe stderr retains a bounded tail; imports can delay timer delivery when
the child event loop is blocked, while the separate parent enforces readiness time.
Instrumentation and cache/order effects remain limitations. A 9p/ext4 difference
would establish an observed association, not causal proof or permission to extend
original deadlines. Full kernel/host authority, current journal changes, Buster
integration and overall goal acceptance remain outside this diagnostic.

## Exact-readiness preparation revision

The author tightened the unexecuted diagnostic to accumulate and require the
complete `durable\n` or `locked\n` marker, rejecting mismatched output and bounding
stdout to 16 KiB and stderr to 128 KiB. The 15/20-second readiness deadlines,
original tests and VM limits remain unchanged. The previous unexecuted disk and
scripts are retained in preparation history. This supersedes the earlier
first-chunk interpretation caveat for the revised diagnostic.

Fresh light review verified the current small artifact hashes and exact guest
driver copy in [the rebind evidence](../../evidence/native-vm-startup-storage-independent-20260921/readiness-rebind.json).
The author's repeated verification-only run binds the new disk hash
`01f3d24e2a4ab1b595f11f1661c09d190c7b0e0aa7dbf31bf8e464edfd13b2c9`
and explicitly records no boot. No disk hashing or VM was run by this reviewer
during the separate ACL VM. The revised preparation is accepted for the
coordinator's later isolated run; execution and causal interpretation remain open.

## Terminal execution: incomplete diagnostic

The coordinator's run failed at the unchanged 900-second outer watchdog
(elapsed 908.877 seconds). The wrapper reports `passed: false`; QEMU's zero
exit after termination does not make the diagnostic successful. Initial source
verification completed. All three 9p readiness probes timed out at their original
20/20/15-second bounds. The unchanged 15-case original batch completed with
11 passes, zero assertion failures, four timeout cancellations and zero skips.
The cancellations are the two journal SIGKILL cases, journal live-contention
case and ownership supervisor-lock case.

The last completed phase was `STAGING_START`. There is no completed ext4 copy
verification, ext4 readiness result or second original test batch. Therefore the
run establishes neither an ext4 comparison nor a causal storage/TCG diagnosis.
The initial full-tree verification consumed much of the fixed budget; that
observation does not excuse the failed cases or justify changing their deadlines.
Raw terminal console and result are copied into this independent evidence
folder. The previous failed combined guest suite remains failed.

A subsequent evidence matrix may run complete nonkernel modules unchanged under
host Node/GNU flock, the complete deployment module under actual guest root with
the genuine parser, and the native kernel module under its guest prerequisites.
Such a matrix must bind exact sources and enumerate the complete case union;
it must retain host root-precondition failures and historical guest timeouts.
It would be separate environment-specific evidence, not a retroactive passing
result for this interrupted diagnostic.
