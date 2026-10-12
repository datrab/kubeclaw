# Timeout diagnosis checkpoint

The four VM3 cancellations are not yet assigned a concrete root cause. All four
original tests spawn long-lived Node fixture children and await first stdout
readiness. Cancellation output does not reveal which awaited operation timed
out. Treating these as merely TCG slowness would exceed the current evidence.

A bounded host differential used the frozen VM3 fixtures and actual cached GNU
flock via proot. It measured startup/first stdout and module loads through a
private preload, without editing fixture or production source. Accepted and
sealed journal fixtures plus the ownership supervisor emitted exact readiness
with both `NODE_TEST_CONTEXT=child-v8` and the variable removed. All six completed
readiness within 437–1107 ms. The preload saw 133–138 loads, 15–18 ms inside load
hooks. This does not reproduce an inherited test-context fault on the host and
provides no basis to strip that environment as a fix.

Initial launch prerequisites were corrected before the measured run: cached
proot needs its library path, and host Node refuses native TypeScript stripping
under node_modules. The final invocation binds the frozen snapshot to a virtual
`/tmp/native-diagnostic-snapshot` path using proot. No physical host mount or
source edit occurs. The probe's own temporary stores are removed afterward.
The actual guest mounts its export as `/repo`, so the host import-path issue was
not a guest failure.

Proposed guest diagnostic, requiring coordinator review and exclusive heavy
slot: retain VM3 immutable source and fixed VM resource envelope; run the same
bounded first-readiness probe with stage timestamps (bootstrap, module load,
ready/exit). Compare read-only 9p input with an independently copied guest-ext4
snapshot whose complete entry set, types, symlinks and hashes are checked before
use. The source must remain unchanged, and original cases/deadlines run unchanged
in each tested layout. No diagnosis should be accepted unless measured stages
locate the delay or show a concrete hang. Staging copies only guest scratch data;
it must not make writable host exports or replace the original evidence.

This checkpoint has no new VM launch and makes no assertion of full gate
success. Host results alone cannot prove the cause of a guest cancellation.
