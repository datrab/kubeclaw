# Isolated native VM execution — run 1

Status: failed, terminal. The reviewed launcher (session 63643) returned 1;
QEMU returned 0 after normal guest poweroff. Wrapper elapsed time was 464.51
seconds, with no watchdog stop. Linux 6.18.52, Node v24.21.0 and util-linux
flock 2.42.3 ran inside the actual isolated guest.

| Unchanged gate | Tests | Passed | Failed | Cancelled | Skipped |
| --- | ---: | ---: | ---: | ---: | ---: |
| Native scope/topology | 12 | 1 | 11 | 0 | 0 |
| Node pools | 35 | 30 | 1 | 4 | 0 |

All eleven native failures reported `WORKER_NATIVE_NODE_IDENTITY_INVALID`:
the fixture's literal `isolated-qemu-native-vm` violated the unchanged production
reader's UUID/32-hex contract. This is a fixture defect, not evidence of a
production regression. The node-pools failure was missing `systemd-analyze`;
three cancellations hit original 20-second deadlines and one hit its original
15-second deadline under TCG. These remain cancellations and were not relaxed,
skipped, or converted to passes. The single passing native case gives only
bounded kernel evidence; neither gate passed.

The [prepared proposal](isolated-native-vm-proposal-20260921.md) remains the
original checkpoint. [Raw console](../../evidence/isolated-native-vm-execution-20260921/vm-console.txt)
and [wrapper result](../../evidence/isolated-native-vm-execution-20260921/vm-result.json)
retain the complete terminal output and immutable preflight/source checks.
The initial disk SHA-256 was
`6bac358fd6d0c496219d99b6a88ecedfb5e53abefa0e221189ce379f725a2cc0`;
the final mutable disk SHA-256 is
`fcd0f6cf103018563730ed07f38e615dfc3fcfab65176b64baaca20c12852f6c`.
The disk stays at the original ignored cache path; terminal-identities.json
independently binds it and the copied logs. Source snapshot verification passed
before and after execution; only the 134 explicitly listed current native inputs
were compared with that snapshot, not the whole current repository.

A separate run-2 fixture may correct guest identity and add phase markers, with
the same budgets, full cases and deadlines, after coordinator review. This run
does not establish physical-host performance, deployment, or full IFR16 acceptance.
