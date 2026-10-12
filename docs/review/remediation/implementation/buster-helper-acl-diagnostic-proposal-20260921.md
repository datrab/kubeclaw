# Buster helper ACL pre-exec diagnosis

Fresh guest disk and artifact bindings prepared; `--verify-only` passed and no
VM was launched. HA run 1 remains failed 6/7,
including the original `Permission denied` assertion. The later allowed-browser
identity/capability assertions did not execute and are still unproved.

The version-matched [util-linux 2.42.3 setpriv implementation](https://raw.githubusercontent.com/util-linux/util-linux/v2.42.3/sys-utils/setpriv.c)
retains capabilities during UID switching and reapplies its cached capabilities
before exec. This supports a specific hypothesis: the unrelated UID/GID caller
still has effective DAC override at the executable permission check. Source
inspection does not substitute for measuring the actual guest process.

Use a new disposable guest/disk with the same fixed HA resource envelope,
signed packages and unchanged frozen source export. Root's private `execvp`
observer under `buster-setpriv-diagnosis-20260921` is the canonical hook to embed;
the superseded unexecuted draft was removed to retain one canonical observer. The hook reads bounded `/proc/self/status` immediately
before forwarding to `RTLD_NEXT` execvp. It changes no credentials, capabilities,
groups, arguments or environment and uses no ptrace. Only the actual setpriv
invocation receives LD_PRELOAD; file-capability secure exec handles the target.

The prepared diagnostic driver records these distinct observations:

1. Original signed setpriv command and the same command with the observer must
   retain identical exit/stdout and stderr apart from the bounded status dump.
2. The observed pre-exec UID/GID/groups and effective capability mask test the
   DAC-override hypothesis. Failed hypotheses remain diagnostic failures.
3. Direct Node `spawnSync` with UID/GID 1003 must encounter EACCES. An ordinary
   Node bridge records its actual capability mask before attempting the same
   helper; it neither adds nor strips credentials. This isolates filesystem
   denial from helper C-policy denial.
4. A separate allowed 1000-to-1001/1000 invocation runs even though the original
   failed suite stopped before this proof. Its actual IDs, empty groups, zero
   capability masks and NoNewPrivs must satisfy the original positive oracle.
5. All original seven HA cases rerun unchanged afterward. Their wrong-group
   assertion is expected to remain failed until diagnosis justifies a separately
   reviewed fixture correction. No expected status/message is broadened.

Commands are bounded to 15 seconds with 128-KiB output buffers; the unchanged
seven-case batch has a separate 180-second process watchdog. VM limits remain
1 GiB RAM, two vCPUs, no network/devices, 64-MiB TCG cache, 120/900-second boot/run
watchdogs and the existing memory/CPU/log guards. No host privilege operation or
concurrent VM is authorized. The failed HA disk/export remain immutable.

The driver and ordinary credential bridge are under
`docs/review/evidence/buster-helper-acl-diagnostic-proposal-20260921/` and pass
syntax checks. Materialization and final hash binding are complete. The canonical observer
compiled successfully as an actual shared library with the guest sysroot; it
was not loaded on the host. Coordinator review precedes any guest execution. Actual observed cause,
not the upstream hypothesis, must precede any maintained fixture change.
