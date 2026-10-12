# Native startup/storage diagnostic — failed bounded execution

The independently prepared diagnostic completed unsuccessfully. Root launched
session `81857`, QEMU PID `103538`. The wrapper returned exit 1 and reports
908.877 seconds elapsed, with `900-second outer wall-clock budget expired`.
QEMU returned zero after termination; that is not test success. No watchdog,
original test deadline, source assertion or resource threshold was increased.

The immutable VM3 source tree was fully verified in the guest: 39,677 entries,
including 35,441 regular files totaling 446,936,345 bytes. This initial check
consumed much of the run; its completion was observed around 543 seconds after
launch. This observation is not an isolated measurement of filesystem latency.

All three instrumented 9p readiness probes failed their existing bounds:
accepted and sealed writers at 20 seconds, supervisor at 15 seconds. No expected
`durable\n` or `locked\n` marker was recorded. The writer traces reached 138
module loads and 353 resolutions, with the last loaded path in Ajv; their sampled
load/resolve totals and CPU counters are preserved. These observations do not
prove an Ajv defect, a storage cause or a sufficient performance correction.
Instrumentation and cache/order effects remain confounders.

Both complete original modules then ran unchanged on 9p: **15 tests, 11 passed,
zero assertion failures, four timeout cancellations, zero skips**, exit 1. The
same three journal cases and one supervisor case timed out at 20/15 seconds.
The diagnostic reached `STAGING_START` but no verified ext4 tree, ext4 readiness
result or ext4 original-test run before the outer watchdog. Therefore there is
**no completed storage comparison and no causal conclusion** from this run.

Raw console, wrapper result and parsed observations are preserved under
`docs/review/evidence/native-vm-startup-storage-execution-20260921/`.
Initial disk SHA256:
`01f3d24e2a4ab1b595f11f1661c09d190c7b0e0aa7dbf31bf8e464edfd13b2c9`.
Final mutable disk SHA256:
`663f568d7851548b9fd83015ae227ae38cb2d81f68ae98be1fd8c12c61a02404`.
The wrapper verified its frozen source before and after execution. This source
predates later journal-capacity, cleanup-reconciliation and Buster changes.

The failed run is retained. Future evidence must keep the full original case
set, actual prerequisites and deadlines. A separately justified environment
matrix may run ordinary filesystem/process tests on native host Node and
root/kernel-dependent modules in the real disposable guest; it must account for
every original case, bind the same relevant sources and keep this failed combined
guest result visible. Neither translated root ownership nor a fake systemd parser
would satisfy the missing prerequisites. The [independent terminal review](independent-native-vm-startup-storage-20260921.md)
confirms this failed, incomplete diagnostic and its limits.
